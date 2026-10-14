#!/usr/bin/env python3
"""Gate for kana sound clips: does each clip actually say its sound?

Usage:
  python3 verify.py CLIP_DIR [--sounds kana_course.json] [--out report.json]
                    [--no-whisper] [--ids ka,ki,...] [--ext mp3,wav]

CLIP_DIR holds one file per audio id, named <audio id>.<ext> with ext any of
wav, mp3, webm, m4a, ogg, flac (decoded with ffmpeg, so any format ffmpeg
reads works). The audio ids and their expected sounds come from the "sounds"
dict of the course JSON: every distinct item["say"], spoken as the katakana in
item["tts"] of the item whose id equals that say. When several files exist for
one id, the first by extension order above is used (change it with --ext).

Two independent checks, plus structure:

1. phones: a phoneme recogniser fine-tuned on espeak IPA
   (facebook/wav2vec2-xlsr-53-espeak-cv-ft) transcribes the clip to IPA; a
   second one (facebook/wav2vec2-lv-60-espeak-cv-ft) is run too and reported
   as phones_alt, but does not decide. Decoding is restricted to plain phones
   (no Mandarin tone finals). PHONE_MODELS=judge,alt changes the models. The
   string is parsed into onset, glide and vowel and compared with what the
   sound must be. Strict on vowel identity and on consonant voicing and
   place; lenient only on allophones (g as ng, r as l or d, u as unrounded or
   fronted u, aspiration, length). A forced-choice score is also reported:
   the CTC likelihood of every sound in the inventory, so a failing clip shows
   what the recogniser thinks it is instead.
2. whisper3: the clip is repeated three times with 300 ms gaps and given to
   Whisper medium (faster-whisper, local cache, offline). Its text is read
   with pyopenjtalk.g2p(kana=True) and every mora of that reading must be the
   expected kana (a few spelling equivalents allowed, e.g. ji = di).
   Whisper on one syllable alone hallucinates words, which is why it is not
   used that way and why it is not the only judge.
3. structure: 0.25 to 0.9 s of audible speech (10 ms frames within 25 dB of
   the clip's loudest frame), and the clip must not stop while still loud
   (a truncated vowel): at least 20 ms from the last frame within 15 dB of
   the peak to the last frame within 40 dB.

A clip passes when all three pass. Exit status is 0 when every clip passes.
"""
import argparse, glob, json, os, re, subprocess, sys, unicodedata
import numpy as np

SR = 16000
CHECKER_REV = 5      # bump when a change alters what the gate decides
EXTS = ('wav', 'mp3', 'webm', 'm4a', 'ogg', 'flac')
# Two phoneme recognisers with the same vocabulary. The first is the judge;
# the second is reported alongside (phones_alt, phone_alt_pass) as evidence
# when deciding whether a failing clip is wrong or the judge is biased.
# Measured on 13 Oct over 686 clips: each alone passed about 220 and they
# agreed on 559. xlsr-53 hears this voice's centralised u as a Mandarin apical
# vowel (su as s i.5); lv-60 drops affrication and voicing more often (cho as
# sho, ga as ka). Averaging their frame posteriors was tried and rejected:
# their CTC spikes fall on different frames, so the average is mostly blank
# (sa came back as a, shi as i). Taking whichever passes would be the lenient
# rule, so it is not used either.
PHONE_MODELS = [m for m in os.environ.get('PHONE_MODELS',
    'facebook/wav2vec2-xlsr-53-espeak-cv-ft,facebook/wav2vec2-lv-60-espeak-cv-ft').split(',') if m]
PHONE_MODEL = PHONE_MODELS[0]
WHISPER_MODEL = 'medium'
DEFAULT_SOUNDS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'deck', 'kana_course.json')
VOICED_REL_DB = 25.0
VOICED_MIN, VOICED_MAX = 0.25, 0.90

# ------------------------------------------------------------------ audio

def load(path):
    p = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', path, '-f', 'f32le',
                        '-ac', '1', '-ar', str(SR), 'pipe:1'],
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if p.returncode != 0:
        raise RuntimeError('ffmpeg could not decode %s: %s' % (path, p.stderr.decode()[:200]))
    return np.frombuffer(p.stdout, dtype=np.float32).copy()

def frame_db(a, hop=0.01):
    n = int(SR * hop); f = len(a) // n
    if f < 1:
        return np.array([-120.0])
    rms = np.sqrt((a[:f*n].reshape(f, n).astype(np.float64) ** 2).mean(axis=1))
    return 20 * np.log10(np.maximum(rms, 1e-9))

def structure(a):
    peak = float(np.abs(a).max()) if len(a) else 0.0
    peak_db = 20 * np.log10(max(peak, 1e-9))
    d = frame_db(a, 0.01)
    on = d > d.max() - VOICED_REL_DB
    voiced = float(on.sum()) * 0.01
    # truncation: a finished syllable decays; a cut one drops from near its
    # peak to silence at once. Measured as the time from the last 5 ms frame
    # within 15 dB of the loudest frame to the last frame within 40 dB. A 10 ms
    # fade alone gives about 10 ms; a natural ending takes well over 20.
    d5 = frame_db(a, 0.005)
    hi = np.where(d5 > d5.max() - 15)[0]
    lo = np.where(d5 > d5.max() - 40)[0]
    decay_ms = float((lo[-1] - hi[-1]) * 5) if len(hi) and len(lo) else 0.0
    clean_end = decay_ms >= 20
    return {'voiced_sec': round(voiced, 3), 'peak_db': round(peak_db, 2),
            'dur_sec': round(len(a) / SR, 3), 'clean_end': clean_end, 'decay_ms': decay_ms,
            'duration_ok': VOICED_MIN <= voiced <= VOICED_MAX}

# ------------------------------------------------------------------ expected sounds

VOWELS = {
    'a': {'a', 'ɐ', 'ɑ', 'ä', 'æ', 'a.'},
    'i': {'i', 'ɪ'},
    'u': {'u', 'ɯ', 'ʊ', 'ɨ', 'ᵻ', 'ʉ', 'y', 'u.'},
    'e': {'e', 'ɛ', 'e̞', 'ee'},
    'o': {'o', 'ɔ', 'o̞'},
}
VOWEL_OF = {s: v for v, ss in VOWELS.items() for s in ss}
# anything else that is vowel-like is a vowel the clip should not have
OTHER_VOWELS = set('əɜʌɒøœɵɚ') | {'ɑ̃', 'ɔ̃', 'ɛ̃', 'œ̃', 'ɐ̃', 'õ', 'ĩ', 'ũ', 'ẽ', 'ã'}

# onset classes: plain members, and members that carry palatalisation
ONSETS = {
    'k':  ({'k'}, {'kʲ', 'c'}),
    'g':  ({'ɡ', 'ɣ', 'ŋ'}, {'ɡʲ', 'ɟ'}),
    's':  ({'s', 's̪'}, set()),
    'sh': (set(), {'ɕ', 'ʃ', 'ʂ', 'sʲ', 'ɕʲ', 'ʃʲ', 'ʂʲ'}),
    'z':  ({'z', 'dz'}, set()),
    'j':  (set(), {'dʑ', 'dʒ', 'ʑ', 'ʒ', 'dʒʲ', 'dʑʲ', 'ʒʲ', 'ʝ'}),
    't':  ({'t', 't̪'}, {'tʲ'}),
    'ts': ({'ts'}, set()),
    'ch': (set(), {'tɕ', 'tʃ', 'tʃʲ', 'tɕʲ'}),
    'd':  ({'d', 'd̪'}, {'dʲ'}),
    'n':  ({'n'}, {'ɲ', 'nʲ'}),
    'h':  ({'h', 'x', 'χ', 'ħ'}, {'ç', 'xʲ', 'hʲ'}),
    'fu': ({'ɸ', 'f', 'h', 'x'}, set()),          # fu: h accepted, nothing contrasts
    'f':  ({'ɸ', 'f'}, {'fʲ'}),                   # fa fi fe fo: h would be ha hi he ho
    'b':  ({'b', 'β'}, {'bʲ'}),
    'p':  ({'p'}, {'pʲ'}),
    'm':  ({'m'}, {'mʲ'}),
    'r':  ({'ɾ', 'r', 'l', 'd', 'ɹ', 'ɽ', 'ɭ', 'ɻ', 'ɫ', 'ɺ'}, {'rʲ', 'ɭʲ', 'ʎ', 'lʲ', 'dʲ'}),
    'w':  ({'w', 'ʋ'}, set()),
    'v':  ({'b', 'v', 'β', 'ʋ'}, {'bʲ', 'vʲ'}),
    'y':  (set(), set()),                         # the glide alone
}
INHERENTLY_PALATAL = {'sh', 'j', 'ch'}
NASALS = {'n', 'ŋ', 'ɴ', 'm', 'n̩', 'ɲ', 'nʲ', 'ɴ'}

SPECIAL = {
    'shi': ('sh', False, 'i'), 'chi': ('ch', False, 'i'), 'tsu': ('ts', False, 'u'),
    'fu': ('fu', False, 'u'), 'ji': ('j', False, 'i'),
    'sha': ('sh', False, 'a'), 'shu': ('sh', False, 'u'), 'sho': ('sh', False, 'o'), 'she': ('sh', False, 'e'),
    'cha': ('ch', False, 'a'), 'chu': ('ch', False, 'u'), 'cho': ('ch', False, 'o'), 'che': ('ch', False, 'e'),
    'ja': ('j', False, 'a'), 'ju': ('j', False, 'u'), 'jo': ('j', False, 'o'), 'je': ('j', False, 'e'),
    'ti': ('t', False, 'i'), 'tu': ('t', False, 'u'), 'di': ('d', False, 'i'),
    'wi': ('w', False, 'i'), 'we': ('w', False, 'e'), 'wo2': ('w', False, 'o'), 'wo': (None, False, 'o'),
    'ya': ('y', True, 'a'), 'yu': ('y', True, 'u'), 'yo': ('y', True, 'o'),
}

def expect(aid):
    """(onset class or None, glide required, vowel or 'N')"""
    if aid == 'n':
        return ('N', False, None)
    if aid in SPECIAL:
        return SPECIAL[aid]
    if aid in VOWELS:
        return (None, False, aid)
    m = re.fullmatch(r'([kgsztdnhfbpmrwv])(y?)([aiueo])', aid)
    if not m:
        raise ValueError('no expectation for audio id %r' % aid)
    c, y, v = m.groups()
    return (c, bool(y), v)

def describe(aid):
    o, g, v = expect(aid)
    if o == 'N':
        return 'a nasal alone (n, m, ng or uvular N), no vowel'
    on = 'no consonant' if o is None else '/'.join(sorted(ONSETS[o][0] | ONSETS[o][1])) or o
    return '%s%s + %s' % (on, ' + j glide' if g else '', '/'.join(sorted(VOWELS[v])))

# ------------------------------------------------------------------ phone parsing

MULTI = {'ja': ['j', 'a'], 'ju': ['j', 'u'], 'aɪ': ['a', 'i'], 'aʊ': ['a', 'u'], 'ai': ['a', 'i'],
         'au': ['a', 'u'], 'eɪ': ['e'], 'ei': ['e'], 'oʊ': ['o'], 'ɯᵝ': ['ɯ'], 'ɯɯ': ['ɯ'],
         'ɯᵝɯᵝ': ['ɯ'], 'dZ': ['dʒ'], 'tS': ['tʃ'], 'S': ['ʃ'], 'N': ['ɴ'], 'X': ['χ'],
         'ää': ['a'], 'ɐɐ': ['a'], 'e̞e̞': ['e'], 'o̞o̞': ['o'], 'iːː': ['i'], 'əl': ['ə', 'l'],
         'ɚ': ['ɚ'], 'th': ['t'], 'kh': ['k'], 'ph': ['p'], 'tsh': ['ts'], 'tɕh': ['tɕ'],
         'ts.h': ['ts'], 'ts.': ['ts'], 's.': ['s']}

def norm_token(t):
    if t in MULTI:
        return list(MULTI[t])
    t = re.sub(r'[ː:\d\.\^\[\]"]', '', t).replace('ʰ', '')
    if t in MULTI:
        return list(MULTI[t])
    if not t:
        return []
    return [t]

def normalise(tokens):
    seq = []
    for t in tokens:
        seq += norm_token(t)
    # two-token affricates
    out, i = [], 0
    pairs = {('d', 'z'): 'dz', ('t', 's'): 'ts', ('t', 'ʃ'): 'tʃ', ('t', 'ɕ'): 'tɕ',
             ('d', 'ʒ'): 'dʒ', ('d', 'ʑ'): 'dʑ'}
    while i < len(seq):
        if i + 1 < len(seq) and (seq[i], seq[i+1]) in pairs:
            out.append(pairs[(seq[i], seq[i+1])]); i += 2
        else:
            out.append(seq[i]); i += 1
    # collapse repeats
    res = []
    for s in out:
        if not res or res[-1] != s:
            res.append(s)
    return res

def is_vowel(s):
    return s in VOWEL_OF or s in OTHER_VOWELS

def judge(aid, tokens):
    """(pass, reason) for a recognised token list against an audio id."""
    o, glide, v = expect(aid)
    seq = normalise(tokens)
    while seq and seq[0] == 'ʔ':
        seq = seq[1:]
    seq = [s for s in seq if s != 'ʔ'] if o is None else seq
    if not seq:
        return False, 'nothing recognised'
    if o == 'N':
        if all(s in NASALS for s in seq):
            return True, 'nasal'
        return False, 'expected a nasal alone, got %s' % ' '.join(seq)
    # merge consecutive vowels of the same class
    m = []
    for s in seq:
        if m and is_vowel(s) and is_vowel(m[-1]) and VOWEL_OF.get(s) == VOWEL_OF.get(m[-1]) and s in VOWEL_OF:
            continue
        m.append(s)
    seq = m
    if not is_vowel(seq[-1]):
        tail = []
        while seq and not is_vowel(seq[-1]):
            tail.insert(0, seq.pop())
        return False, 'ends in consonant %s after the vowel (or no vowel)' % ' '.join(tail)
    vowel = seq[-1]
    onset = seq[:-1]
    if VOWEL_OF.get(vowel) != v:
        return False, 'vowel %s is not %s' % (vowel, v)
    # a vowel immediately before the final vowel can be a glide: i -> j, u -> w
    if onset and is_vowel(onset[-1]):
        pv = VOWEL_OF.get(onset[-1])
        if pv == 'i' and v != 'i':
            onset[-1] = 'j'
        elif pv == 'u' and v != 'u':
            onset[-1] = 'w'
        else:
            return False, 'two vowels: %s %s' % (onset[-1], vowel)
    if any(is_vowel(s) for s in onset):
        return False, 'more than one syllable: %s' % ' '.join(seq)
    if o is None:
        # a vowel alone; a homorganic glide onset (j before i, w before u) is tolerated
        if not onset or onset in (['j'],) and v == 'i' or onset in (['w'],) and v == 'u':
            return True, 'vowel'
        return False, 'unexpected consonant %s before %s' % (' '.join(onset), v)
    plain, pal = ONSETS[o]
    has_j = bool(onset) and onset[-1] == 'j'
    cons = onset[:-1] if has_j else onset
    if o == 'y':
        if has_j and not cons:
            return True, 'glide'
        return False, 'expected j glide alone, got %s' % (' '.join(onset) or 'nothing')
    if o == 'w':
        if cons == [] and has_j:
            return False, 'j glide where w expected'
        if len(onset) == 1 and onset[0] in plain:
            return True, 'w glide'
        return False, 'expected w, got %s' % (' '.join(onset) or 'no consonant')
    if len(cons) != 1:
        return False, 'expected one consonant %s, got %s' % (o, ' '.join(onset) or 'none')
    c = cons[0]
    palatal = has_j or c in pal or o in INHERENTLY_PALATAL
    if c not in plain and c not in pal:
        return False, 'consonant %s is not %s' % (c, o)
    if glide and not palatal:
        return False, 'no palatal glide (%s heard as %s%s)' % (aid, c, VOWEL_OF[vowel])
    if not glide and v != 'i' and o not in INHERENTLY_PALATAL and (has_j or c in pal):
        return False, 'palatalised onset %s%s where plain %s expected' % (c, ' j' if has_j else '', o)
    return True, 'ok'

# canonical spellings for the forced-choice ranking
CANON_ONSET = {'k': ['k'], 'g': ['ɡ'], 's': ['s'], 'sh': ['ɕ', 'ʃ'], 'z': ['z', 'dz'], 'j': ['dʑ', 'dʒ'],
               't': ['t'], 'ts': ['ts'], 'ch': ['tɕ', 'tʃ'], 'd': ['d'], 'n': ['n'], 'h': ['h'],
               'fu': ['ɸ', 'f'], 'f': ['ɸ', 'f'], 'b': ['b'], 'p': ['p'], 'm': ['m'], 'r': ['ɾ', 'r'],
               'w': ['w'], 'v': ['v', 'b'], 'y': []}
CANON_PAL = {'k': ['kʲ'], 'g': ['ɡʲ'], 'h': ['ç'], 'n': ['ɲ'], 'm': ['mʲ'], 'b': ['bʲ'], 'p': ['pʲ'],
             'r': ['ɾ'], 't': ['tʲ'], 'd': ['dʲ'], 'f': ['f'], 'v': ['v']}
CANON_V = {'a': ['a'], 'i': ['i'], 'u': ['ɯ', 'u'], 'e': ['e'], 'o': ['o']}

def canon(aid):
    o, glide, v = expect(aid)
    if o == 'N':
        return [['n'], ['ɴ'], ['ŋ']]
    outs = []
    for vv in CANON_V[v]:
        if o is None:
            outs.append([vv]); continue
        for c in CANON_ONSET[o]:
            outs.append([c, vv] if not glide else [c, 'j', vv])
        if glide and o in CANON_PAL:
            for c in CANON_PAL[o]:
                outs.append([c, vv])
        if o == 'y':
            outs.append(['j', vv])
    return outs

# ------------------------------------------------------------------ phone recogniser

# The recogniser's vocabulary is the union of espeak's phone sets for many
# languages, including Mandarin finals with tones (onɡ5, ɑu2, i.5 ...). On
# these clips it often reaches for them: cho came back as tɕ onɡ, su as s i.5,
# because Mandarin has no tɕo or su. Decoding is therefore restricted to plain
# phones: everything Japanese uses, plus the vowels and consonants a wrong clip
# would be heard as (schwa, open e and o, front rounded vowels, q, th ...), so
# the check stays able to fail a clip. ʐ is left out as well: with the tone
# finals gone the model used it for the same Mandarin apical vowel (su as s ʐ,
# ku as k ʐ); it is not a Japanese sound and no wrong clip needs it to fail.
# The unrestricted string is kept in the report as phones_raw.
INVENTORY = (
    'a i u e o ɯ ɨ ʉ y ə ɛ ɔ ɑ ɐ æ ʌ ɪ ʊ ø œ ɒ ɜ ɵ ä e̞ o̞ '
    'aː iː uː eː oː ɑː ɔː ɛː ɜː yː øː '
    'p b t d k ɡ q c ɟ ʔ m n ɲ ŋ ɴ ɸ f v β θ ð s z ʃ ʒ ɕ ʑ ʂ ç ʝ x ɣ χ h ħ '
    'ts dz tʃ dʒ tɕ dʑ ɾ r l ɹ ɽ ɭ ʎ ɫ j w ʋ '
    'kʲ ɡʲ pʲ bʲ mʲ nʲ tʲ dʲ rʲ sʲ'
).split()

class Phones:
    def __init__(self, models=None):
        import torch
        from transformers import Wav2Vec2FeatureExtractor, Wav2Vec2ForCTC
        from huggingface_hub import hf_hub_download
        self.torch = torch
        torch.set_num_threads(max(1, os.cpu_count() or 1))
        self.names = list(models or PHONE_MODELS)
        self.fe, self.m = [], []
        vocab = None
        for name in self.names:
            self.fe.append(Wav2Vec2FeatureExtractor.from_pretrained(name))
            self.m.append(Wav2Vec2ForCTC.from_pretrained(name).eval())
            vv = json.load(open(hf_hub_download(name, 'vocab.json'), encoding='utf-8'))
            if vocab is not None and vv != vocab:
                raise ValueError('phone models must share one vocabulary')
            vocab = vv
        self.vocab = vocab
        self.inv = {i: t for t, i in vocab.items()}
        self.blank = vocab['<pad>']
        self.skip = {vocab[t] for t in ('<s>', '</s>', '<unk>', '<pad>') if t in vocab}
        keep = [vocab[t] for t in INVENTORY if t in vocab] + [self.blank]
        self.mask = torch.full((len(vocab),), float('-inf'))
        self.mask[keep] = 0.0

    @staticmethod
    def tag(name):
        return name.split('/')[-1]

    def logits_one(self, k, a):
        pad = np.zeros(int(0.25 * SR), np.float32)
        x = self.fe[k](np.concatenate([pad, a, pad]), sampling_rate=SR, return_tensors='pt').input_values
        with self.torch.no_grad():
            return self.m[k](x).logits[0].log_softmax(-1)

    def logits(self, a):
        """per-model log posteriors, unrestricted"""
        return [self.logits_one(k, a) for k in range(len(self.m))]

    def restrict(self, lp):
        return (lp + self.mask).log_softmax(-1)

    def decode(self, lp):
        ids = lp.argmax(-1).tolist()
        out, prev = [], None
        for i in ids:
            if i != prev and i not in self.skip:
                out.append(self.inv[i])
            prev = i
        return out

    def score(self, lp, seqs):
        """best mean-per-frame CTC log likelihood over the given phone spellings"""
        F = self.torch.nn.functional
        best = -1e9
        for s in seqs:
            ids = [self.vocab[p] for p in s if p in self.vocab]
            if len(ids) != len(s):
                continue
            t = self.torch.tensor([ids])
            l = F.ctc_loss(lp.unsqueeze(1), t, [lp.shape[0]], [len(ids)], blank=self.blank,
                           reduction='sum', zero_infinity=True)
            best = max(best, -float(l))
        return best

# ------------------------------------------------------------------ whisper

SMALL = set('ャュョァィゥェォヮ')   # combine with the kana before them
EQUIV = {'ヂ': 'ジ', 'ヅ': 'ズ', 'ヲ': 'オ'}
V_EQUIV = {'ヴァ': 'バ', 'ヴィ': 'ビ', 'ヴ': 'ブ', 'ヴェ': 'ベ', 'ヴォ': 'ボ'}

VOWEL_OF_KANA = {}
for _v, _cs in (('a', 'アカサタナハマヤラワガザダバパァャヮ'), ('i', 'イキシチニヒミリギジヂビピィヰ'),
                ('u', 'ウクスツヌフムユルグズヅブプゥュヴ'), ('e', 'エケセテネヘメレゲゼデベペェヱ'),
                ('o', 'オコソトノホモヨロヲゴゾドボポォョ')):
    for _c in _cs:
        VOWEL_OF_KANA[_c] = _v
LONG = {'ア': 'a', 'イ': 'i', 'ウ': 'u', 'エ': 'e', 'オ': 'o', 'ァ': 'a', 'ィ': 'i', 'ゥ': 'u', 'ェ': 'e', 'ォ': 'o'}

def morae(kana):
    """Mora units of a katakana reading, with length marks dropped: ー, the
    small tsu of a clipped ending, and a vowel kana that only lengthens the
    mora before it (スウ, ネエ, ヒィ, and the eu and ou spellings ケイ, ボウ)."""
    units, i = [], 0
    s = [EQUIV.get(c, c) for c in kana if 'ァ' <= c <= 'ヺ' or c == 'ー']
    while i < len(s):
        c = s[i]
        if c in ('ー', 'ッ'):
            i += 1; continue
        if i + 1 < len(s) and s[i+1] in SMALL:
            # a small vowel of the kana's own vowel only lengthens it (ヒィ is hi)
            u = c if LONG.get(s[i+1]) == VOWEL_OF_KANA.get(c) else c + s[i+1]
            i += 2
        else:
            u = c; i += 1
        if units and u in LONG:
            pv = VOWEL_OF_KANA.get(units[-1][-1])
            lv = LONG[u]
            if pv == lv or (pv, lv) in (('e', 'i'), ('o', 'u')):
                continue
        units.append(u)
    return units

class Whisper:
    def __init__(self, model=WHISPER_MODEL, romaji=None):
        os.environ.setdefault('HF_HUB_OFFLINE', '1')
        from faster_whisper import WhisperModel
        import pyopenjtalk
        self.g2p = pyopenjtalk.g2p
        self.m = WhisperModel(model, device='cpu', compute_type='int8',
                              cpu_threads=max(1, os.cpu_count() or 1))
        self.romaji = romaji or {}

    def reading(self, text):
        """Katakana reading of what Whisper wrote. Romaji ("ka ka ka") is read
        through the course's own romaji table; any other Latin text (Whisper
        writes "B B B" for bi bi bi) goes to pyopenjtalk, which reads letters
        by their Japanese names (B as bii, D as dii)."""
        t = unicodedata.normalize('NFKC', text).strip()
        toks = re.findall(r'[a-z]+', t.lower())
        if toks and re.fullmatch(r"[A-Za-z\s,.!?'\-]+", t) and all(x in self.romaji for x in toks):
            return ''.join(self.romaji[x] for x in toks)
        t = re.sub(r'[\s、。,.!?！？・…「」]', '', t)
        if not t:
            return ''
        try:
            return self.g2p(t, kana=True)
        except Exception:
            return ''

    def run(self, a):
        gap = np.zeros(int(0.3 * SR), np.float32)
        lead = np.zeros(int(0.5 * SR), np.float32)
        x = np.concatenate([lead, a, gap, a, gap, a, lead]).astype(np.float32)
        segs, _ = self.m.transcribe(x, language='ja', beam_size=5, temperature=0.0,
                                    condition_on_previous_text=False, vad_filter=False,
                                    without_timestamps=True)
        text = ''.join(s.text for s in segs).strip()
        return text, self.reading(text)

def whisper_pass(aid, tts, reading):
    want = {EQUIV.get(tts, tts)}
    if tts in V_EQUIV:
        want.add(V_EQUIV[tts])
    if tts == 'ウォ':
        want = {'ウォ'}
    u = morae(reading)
    if not u:
        return False, 'no kana read back'
    bad = [x for x in u if x not in want]
    if bad:
        return False, 'read %s, want %s' % (''.join(u), '/'.join(sorted(want)))
    return True, '%d x %s' % (len(u), u[0])

# ------------------------------------------------------------------ driver

def course(path):
    s = json.load(open(path, encoding='utf-8'))['sounds']
    ids = sorted({it['say'] for it in s.values()})
    tts = {i: s[i]['tts'] for i in ids}
    romaji = {}
    for it in s.values():
        romaji.setdefault(it['r'], it['tts'])
    for i in ids:
        romaji.setdefault(i, tts[i])
    return tts, romaji

class Verifier:
    def __init__(self, sounds=DEFAULT_SOUNDS, whisper=True, phone_models=None):
        self.tts, self.romaji = course(sounds)
        self.ph = Phones(phone_models)
        self.wh = Whisper(romaji=self.romaji) if whisper else None
        self._canon = {i: canon(i) for i in self.tts}

    def check(self, aid, a, do_whisper=True, raw=None):
        r = structure(a)
        raw = self.ph.logits(a) if raw is None else raw
        lp = self.ph.restrict(raw[0])
        toks = self.ph.decode(lp)
        ok, why = judge(aid, toks)
        r.update({'phones': ' '.join(toks), 'phones_norm': ' '.join(normalise(toks)),
                  'phones_raw': ' '.join(self.ph.decode(raw[0])),
                  'phone_pass': ok, 'phone_why': why})
        if len(raw) > 1:
            alt = self.ph.decode(self.ph.restrict(raw[1]))
            aok, awhy = judge(aid, alt)
            r.update({'phones_alt': ' '.join(alt), 'phone_alt_pass': aok, 'phone_alt_why': awhy})
        scores = {i: self.ph.score(lp, c) for i, c in self._canon.items()}
        top = sorted(scores, key=lambda i: -scores[i])
        r['forced_choice_top3'] = top[:3]
        r['forced_choice_rank'] = top.index(aid) + 1
        if self.wh and do_whisper:
            text, reading = self.wh.run(a)
            wok, wwhy = whisper_pass(aid, self.tts[aid], reading)
            r.update({'whisper3_text': text, 'whisper3_reading': reading,
                      'whisper3_pass': wok, 'whisper3_why': wwhy})
        else:
            r.update({'whisper3_text': None, 'whisper3_reading': None,
                      'whisper3_pass': None, 'whisper3_why': 'not run'})
        r['pass'] = bool(r['phone_pass'] and r['whisper3_pass'] is not False
                         and r['duration_ok'] and r['clean_end'])
        return r

def find_clips(folder, ids, exts=EXTS):
    found = {}
    for aid in ids:
        for ext in exts:
            p = os.path.join(folder, '%s.%s' % (aid, ext))
            if os.path.exists(p):
                found[aid] = p; break
    return found

def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('folder')
    ap.add_argument('--sounds', default=DEFAULT_SOUNDS)
    ap.add_argument('--out', default=None, help='report path (default FOLDER/verify_report.json)')
    ap.add_argument('--no-whisper', action='store_true')
    ap.add_argument('--ids', default='', help='comma-separated audio ids to check (default all)')
    ap.add_argument('--ext', default=','.join(EXTS),
                    help='extension preference order when an id has several files (default %(default)s)')
    a = ap.parse_args()
    v = Verifier(a.sounds, whisper=not a.no_whisper)
    ids = [i for i in v.tts if not a.ids or i in a.ids.split(',')]
    clips = find_clips(a.folder, ids, tuple(x.strip('. ') for x in a.ext.split(',') if x.strip()))
    report = {}
    for aid in ids:
        if aid not in clips:
            report[aid] = {'file': None, 'pass': False, 'notes': 'missing clip'}
            print('%-5s MISSING' % aid, flush=True); continue
        r = v.check(aid, load(clips[aid]))
        r['file'] = os.path.basename(clips[aid])
        r['expected'] = describe(aid)
        report[aid] = r
        print('%-5s %-4s phones=[%s] %s | whisper3=%s %s | voiced=%.2fs%s' % (
            aid, 'PASS' if r['pass'] else 'FAIL', r['phones'], 'ok' if r['phone_pass'] else 'X (' + r['phone_why'] + ')',
            r['whisper3_text'], '' if r['whisper3_pass'] is None else ('ok' if r['whisper3_pass'] else 'X'),
            r['voiced_sec'], '' if r['clean_end'] else ' TRUNCATED'), flush=True)
    n = len(ids)
    summ = {'clips': n, 'missing': sum(1 for i in ids if i not in clips),
            'phone_pass': sum(1 for r in report.values() if r.get('phone_pass')),
            'whisper3_pass': sum(1 for r in report.values() if r.get('whisper3_pass')),
            'structure_pass': sum(1 for r in report.values() if r.get('duration_ok') and r.get('clean_end')),
            'all_pass': sum(1 for r in report.values() if r.get('pass'))}
    out = a.out or os.path.join(a.folder, 'verify_report.json')
    json.dump({'summary': summ, 'model': {'phones': PHONE_MODELS[0], 'phones_alt': PHONE_MODELS[1:],
                                          'whisper': WHISPER_MODEL},
               'clips': report}, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps(summ))
    print('failing:', ' '.join(i for i in ids if not report[i].get('pass')))
    print('report written to', out)
    sys.exit(0 if summ['all_pass'] == n else 1)

if __name__ == '__main__':
    main()
