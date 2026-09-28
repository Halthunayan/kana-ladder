"""Pre-rendered car audio.

iOS never routes Web Speech to CarPlay, but an <audio> element routes normally.
So every line car mode needs is synthesised here, ahead of time, with a neural
voice, packed into sprites, and played from a real audio element in the app.
Nothing about this depends on which voices the phone happens to have.
"""
import hashlib, io, json, os, subprocess, sys, wave
from multiprocessing import Pool

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def R(*p): return os.path.join(ROOT, *p)
OUT = os.environ.get('AUDIO_OUT') or R('pwa', 'audio', 'v1')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from spoken import spoken_en
VOICES = '/tmp/claude-0/voices'
BITRATE = '32k'
W_PER, S_PER, F_PER = 200, 150, 400

PHRASES = {
    "warn":  "One minute left.",
    "test":  "Car mode. If you can hear this through the car, you are ready.",
    "f-polite present":  "Now the polite present of",
    "f-polite past":     "Now the polite past of",
    "f-polite negative": "Now the polite negative of",
    "f-te-form":         "Now the te-form of",
    "f-past":            "Now the past of",
    "f-negative":        "Now the negative of",
    "f-polite past negative": "Now the polite past negative of",
    "f-can do it form":  "Now the can do it form of",
    "f-want to do it form": "Now the want to do it form of",
    "f-polite past":     "Now the polite past of",
    "f-please form":     "Now the please form of",
    "f-plain past":      "Now the plain past of",
}

_V = {}
def voice(lang):
    if lang not in _V:
        from piper import PiperVoice
        _V[lang] = PiperVoice.load(os.path.join(VOICES, lang + '.onnx'))
    return _V[lang]

# A neural voice predicts its own durations, and this one predicts them with a
# large random component: the same short word rendered twice can differ
# threefold, and some tokens land short every time. Measured over 12 draws
# each, yon (four) gave 0.08-0.24 s of audible speech for two morae while
# hachi (eight) gave 0.18-0.32 s, so yon sounded swallowed. Nothing about the
# clip is truncated; the model simply under-generates duration for it.
#
# So a short Japanese clip is measured against what its mora count deserves,
# and a clip that falls short is redrawn at a slower speaking rate, keeping
# the best attempt. Clips that already clear the bar are drawn once at normal
# speed and left alone, so the fix changes only what was broken.
RENDER = 5           # bump to force every affected sprite to re-render
MIN_SEC_PER_MORA = 0.13
VOICED_DB = -25.0    # what counts as audible rather than room tone
SLOW_MAX_MORAE = 6   # a sentence has its own rhythm and is never redrawn
LADDER = (1.0, 1.4, 1.9, 2.4)
TRIES = 3            # attempts at each rung before moving to the next

# ---- isolated words are not conversation ----
# The first library was drawn at one speaking rate for everything, and measured
# across all 1,812 word clips it came out at 0.140 voiced seconds per mora, with
# 96% under 0.18. That is the tempo of running speech. A word alone on a card is
# a citation form and wants roughly 0.20 to 0.25, which is what a teacher would
# give you. Sentences keep the conversational rate, because a sentence read at
# dictation speed teaches the wrong rhythm.
WORD_RENDER = 4      # bump to redraw every word and form sprite
WORD_LADDER = (1.45, 1.75, 2.10, 2.40)
# The ladder is a floor, not a tempo control: it accepts the first draw that
# clears the bar, so a lucky-low draw ships. Measured on are, one draw gave
# 0.39 s of speech and the best of six gave 0.50. The duration this voice
# predicts is that noisy. So a word is drawn WORD_TRIES times at citation
# tempo and the longest is kept, and only then does the old floor apply.
WORD_TRIES = 4

# A moraic n at the end of an isolated word is simply not produced by this
# voice. Measured on yon (four): one unbroken vowel, then the energy falls 33 dB,
# then the nasal appears 40 dB down, inaudible. It is not a speed problem, and
# redrawing at 1.0, 1.3, 1.6, 1.9 and 2.4 does not fix it. Giving the model a
# trailing comma makes it treat the word as phrase-final and it produces the
# nasal. 169 deck words end in n, including sumimasen, san, en, jikan and gohan.
NASAL_SUFFIX = '、'

# Every clip used to carry about a third of a second of room tone at each end.
# Trimming it makes the library smaller and the card snappier, and it costs
# nothing: the app inserts its own gaps and car mode times its own pauses.
TRIM_DB = -45.0
TRIM_PAD = 0.10

# ---- how a clip is made now ----
# A word is rendered inside a carrier sentence, so the voice has something
# before it, and then cut back out. Three faults in the old renderer are
# closed here.
#
# 1. Durations are deterministic. This model's duration predictor has a random
#    component, and the old code fought it by drawing each word four times and
#    keeping the longest, which is why short words came out stretched and
#    strange. Setting noise_w to zero takes the model's own median duration
#    and the fight ends.
# 2. The cut is the carrier's last loud stretch, found on a threshold relative
#    to that carrier's own peak. An absolute floor finds the silence after a
#    softly spoken word instead of the word: go (five) and ni (two) were
#    shipped 42 dB down that way, which is inaudible.
# 3. Nothing is accepted untested. A clip must separate from its carrier, sit
#    within 12 dB of it, and last a plausible time for its mora count. A word
#    that fails is spoken on its own instead and reported by name, rather than
#    quietly shipped.
#
# The speaker is this model's second voice. Measured over 80 deck words, the
# first voice, which the entire previous library was built on, renders 63 of
# them cleanly against the second voice's 79. It says roughly a fifth of the
# deck too softly to cut out at all.
JA_SPEAKER = 1
WORD_LS = 1.10       # citation tempo for a word or a conjugated form
SENT_LS = 1.00       # a sentence keeps the rhythm it was written with
NOISE = 0.5
CARRIER = 'はい、%s。'
REL_DB = 35.0        # loud counts as this far under the carrier's own peak
MERGE_MS = 150       # a geminate (small tsu) is a silent mora of up to ~150 ms
QUIET_DB = 12.0      # further under its carrier than this is under-articulated
MIN_PER_MORA = 0.06
MAX_PER_MORA = 0.45
CUT_PAD = 0.05
FADE_MS = 8
# Every clip's signature carries this, so changing the recipe rebuilds the
# whole library rather than leaving sentences in the old voice.
VOICE_REV = 'v2-spk1-carrier-1'

SMALL_KANA = 'ゃゅょぁぃぅぇぉャュョァィゥェォ'
PUNCT = '、。？！ '

def morae(text):
    return sum(1 for ch in text if ch not in SMALL_KANA and ch not in PUNCT)

def laddered(lang, text):
    """Is this a clip the redraw ladder applies to?"""
    if lang != 'ja':
        return False
    if any(ch in text for ch in '、。'):
        return False
    return 1 <= morae(text) <= SLOW_MAX_MORAE

def voiced(pcm, sr):
    """Seconds of audible speech, in 10 ms frames above VOICED_DB.

    Total audible time, not first-to-last span: yon is one short burst where
    hachi is two, and a span measurement cannot tell those apart."""
    try:
        import numpy as np
    except ImportError:
        return None
    a = np.frombuffer(pcm, dtype='<i2').astype('float64')
    n = int(sr * 0.01)
    if n <= 0 or len(a) < n:
        return 0.0
    f = len(a) // n
    rms = np.sqrt(np.mean(a[:f*n].reshape(f, n) ** 2, axis=1))
    db = 20 * np.log10(np.maximum(rms, 1e-6) / 32768.0)
    return float((db > VOICED_DB).sum()) * 0.01

def trim(pcm, sr):
    """Drop leading and trailing room tone, keeping a short pad either side."""
    try:
        import numpy as np
    except ImportError:
        return pcm
    a = np.frombuffer(pcm, dtype='<i2')
    n = int(sr * 0.01)
    f = len(a) // n
    if f < 3:
        return pcm
    x = a[:f*n].reshape(f, n).astype('float64')
    rms = np.sqrt((x * x).mean(axis=1))
    db = 20 * np.log10(np.maximum(rms, 1e-6) / 32768.0)
    loud = np.where(db > TRIM_DB)[0]
    if not len(loud):
        return pcm
    pad = int(TRIM_PAD / 0.01)
    s0 = max(0, loud[0] - pad)
    e0 = min(f, loud[-1] + 1 + pad)
    return a[s0*n:e0*n].tobytes()

def nuclei(pcm, sr):
    """How many separate bursts of sound a clip contains.

    The selector keeps the draw with the most audible speech, and this voice
    sometimes stutters: an clip of two morae came back with nine bursts in it,
    which scores well and is not the word. A draw with more bursts than morae
    is the model babbling, so it is never preferred over one that is not."""
    try:
        import numpy as np
    except ImportError:
        return 0
    a = np.frombuffer(pcm, dtype='<i2').astype('float64')
    n = int(sr * 0.01)
    f = len(a) // n
    if f < 3:
        return 0
    rms = np.sqrt((a[:f*n].reshape(f, n) ** 2).mean(axis=1))
    db = 20 * np.log10(np.maximum(rms, 1e-6) / 32768.0)
    on = db > max(db.max() - 22, -40)
    count, run = 0, 0
    for v in on:
        if v:
            run += 1
        else:
            if run >= 3:
                count += 1
            run = 0
    if run >= 3:
        count += 1
    return count

def ends_loud(pcm, sr):
    """Does the clip stop while still sounding? That is an audible click."""
    try:
        import numpy as np
    except ImportError:
        return False
    a = np.frombuffer(pcm, dtype='<i2').astype('float64')
    n = int(sr * 0.01)
    f = len(a) // n
    if f < 3:
        return False
    rms = np.sqrt((a[:f*n].reshape(f, n) ** 2).mean(axis=1))
    db = 20 * np.log10(np.maximum(rms, 1e-6) / 32768.0)
    return bool(db[-1] > db.max() - 25)

def _syn(lang, text, ls, speaker=None, first_only=False):
    """Synthesise and hand back a float array plus the chunk that describes it."""
    import numpy as np
    from piper import SynthesisConfig
    kw = dict(length_scale=ls, noise_scale=NOISE, noise_w_scale=0.0)
    if speaker:
        kw['speaker_id'] = speaker
    chunks = list(voice(lang).synthesize(text, syn_config=SynthesisConfig(**kw)))
    if not chunks:
        return None, None
    use = chunks[:1] if first_only else chunks
    pcm = b''.join(c.audio_int16_bytes for c in use)
    return np.frombuffer(pcm, dtype='<i2').astype('float64'), chunks[0]

def _frames(a, sr, hop=0.005):
    import numpy as np
    n = int(sr * hop); f = len(a) // n
    if f < 1:
        return np.array([]), n
    rms = np.sqrt((a[:f*n].reshape(f, n) ** 2).mean(axis=1))
    return 20 * np.log10(np.maximum(rms, 1e-6) / 32768.0), n

def _last_loud(a, sr, rel=None, merge=None):
    """Where the carrier's final loud stretch sits, in samples.

    Threshold is relative to this carrier's own peak. An absolute threshold
    finds the silence after a softly spoken word instead of the word."""
    d, n = _frames(a, sr)
    if not len(d):
        return None
    on = d > (d.max() - (REL_DB if rel is None else rel))
    runs, i = [], 0
    while i < len(on):
        if on[i]:
            j = i
            while j < len(on) and on[j]:
                j += 1
            runs.append([i, j]); i = j
        else:
            i += 1
    if not runs:
        return None
    merged = [runs[0]]
    for s, e in runs[1:]:
        if (s - merged[-1][1]) * 5 < (MERGE_MS if merge is None else merge):
            merged[-1][1] = e
        else:
            merged.append([s, e])
    s, e = merged[-1]
    return s * n, e * n, len(merged)

def _fade(a, sr, ms=FADE_MS):
    import numpy as np
    n = int(sr * ms / 1000.0)
    if len(a) < 2 * n:
        return a
    a = a.copy(); r = np.linspace(0, 1, n)
    a[:n] *= r; a[-n:] *= r[::-1]
    return a

def _peak(a):
    import numpy as np
    return 20 * np.log10(max(float(np.abs(a).max()), 1.0) / 32768.0)

def _trim_arr(a, sr):
    import numpy as np
    d, n = _frames(a, sr, 0.01)
    if not len(d):
        return a
    loud = np.where(d > TRIM_DB)[0]
    if not len(loud):
        return a
    pad = int(TRIM_PAD / 0.01)
    s = max(0, loud[0] - pad); e = min(len(d), loud[-1] + 1 + pad)
    return a[s*n:e*n]

# The acoustics of a draw are still random even though its durations are not,
# so a word that will not separate from its carrier on one draw often separates
# on the next. Words beginning with an unvoiced stop are the ones that wobble:
# ka, ki, tsu and their kin start with silence of their own, which is what the
# cut is looking for. Retrying costs a quarter of a second and recovered most
# of the 44 clips that had to be spoken alone on the first full build.
TRIES_LADDER = ((35.0, 150), (30.0, 110), (25.0, 130))
CARRIER_TRIES = 2
# A handful of words will not come away from hai however often they are drawn,
# and they are all words beginning with an unvoiced stop: katte, tsukutte,
# okite. The stop opens with a silence of its own, which sits against the
# carrier's pause and leaves no edge to cut on. A carrier ending in a plain
# long vowel gives that edge back, so it is tried second. Hai stays first
# because that is the carrier the rebuilt library was judged on.
CARRIERS = ('はい、%s。', 'ええ、%s。')

def carrier_clip_at(text, ls):
    """carrier_clip at a named speaking rate, for the repair pass."""
    global WORD_LS
    was = WORD_LS
    WORD_LS = ls
    try:
        return carrier_clip(text)
    finally:
        WORD_LS = was

def carrier_clip(text):
    """A word, spoken inside a carrier sentence and cut back out.

    Returns (array, chunk, note). note is None when the clip passed every
    check; otherwise array is None and note says which check refused it."""
    last = None
    for carrier in CARRIERS:
        for rel, merge in TRIES_LADDER:
            for _ in range(CARRIER_TRIES):
                a, ch, note = _carrier_once(text, rel, merge, carrier)
                if a is not None:
                    return a, ch, None
                last = (ch, note)
    return None, (last[0] if last else None), (last[1] if last else 'no attempt')

def _carrier_once(text, rel, merge, carrier=None):
    m = morae(text) or 1
    a, ch = _syn('ja', (carrier or CARRIER) % text, WORD_LS, JA_SPEAKER, first_only=True)
    if a is None:
        return None, None, 'the voice produced nothing'
    sr = ch.sample_rate
    r = _last_loud(a, sr, rel, merge)
    if r is None:
        return None, ch, 'no audible speech in the carrier'
    s, e, groups = r
    if groups < 2:
        return None, ch, 'the word did not separate from the carrier'
    pad = int(CUT_PAD * sr)
    reg = a[max(0, s - pad):min(len(a), e + pad)]
    gap = _peak(a) - _peak(reg)
    if gap > QUIET_DB:
        return None, ch, 'the word is %.0f dB under its own carrier' % gap
    per = ((e - s) / sr) / m
    if not (MIN_PER_MORA <= per <= MAX_PER_MORA):
        return None, ch, '%.3f s per mora is outside the plausible range' % per
    return _fade(reg, sr), ch, None

def encode(a, ch):
    import numpy as np
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as w:
        w.setnchannels(ch.sample_channels); w.setsampwidth(ch.sample_width)
        w.setframerate(ch.sample_rate)
        w.writeframes(np.clip(a, -32768, 32767).astype('<i2').tobytes())
    p = subprocess.run(
        ['ffmpeg', '-loglevel', 'error', '-y', '-i', 'pipe:0', '-c:a', 'libmp3lame',
         '-b:a', BITRATE, '-ac', '1', '-ar', '22050', '-f', 'mp3', 'pipe:1'],
        input=buf.getvalue(), stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return p.stdout

def mp3(lang, text, kind='word'):
    """kind is 'word' for an isolated word or conjugated form, 'sent' for a
    sentence, 'en' for English. Returns (mp3 bytes, note); note is set only
    when a word had to fall back to being spoken on its own."""
    note = None
    if lang == 'ja' and kind == 'word':
        a, ch, why = carrier_clip(text)
        if a is None:
            note = why
            a, ch = _syn('ja', text + '。', WORD_LS, JA_SPEAKER, first_only=True)
            if a is None:
                return b'', note
            a = _fade(_trim_arr(a, ch.sample_rate), ch.sample_rate)
    elif lang == 'ja':
        a, ch = _syn('ja', text, SENT_LS, JA_SPEAKER)
        if a is None:
            return b'', note
        a = _fade(_trim_arr(a, ch.sample_rate), ch.sample_rate)
    else:
        a, ch = _syn('en', text, 1.0)
        if a is None:
            return b'', note
        a = _fade(_trim_arr(a, ch.sample_rate), ch.sample_rate)
    return encode(a, ch), note

# ---- pinned clips ----
# A clip the transcription checker rejected, re-drawn until the checker read it
# back as the right word, is kept as a file and used verbatim from then on.
# Only a clip that passed is pinned: one that never passed keeps whatever
# already shipped rather than being swapped for another unverified draw. This
# is what stops the library drifting on my guesses instead of on evidence.
PINNED = os.environ.get('AUDIO_PINNED') or R('state', 'pinned')

def pinned(key):
    p = os.path.join(PINNED, key.replace(':', '_') + '.mp3')
    return open(p, 'rb').read() if os.path.exists(p) else None

# ---- clip-level reuse ----
# A sprite holds hundreds of clips, and changing one English gloss used to
# re-synthesise every Japanese word beside it. The voice draws each clip with
# randomness, so a re-draw is a different recording that has not been through
# the checks. Any clip whose language, kind and exact text match a clip that
# already shipped is copied byte for byte instead; only new text is drawn.
# Keyed on the text, not the key, because a key can now point at different
# text (a form row that lost an entry shifts every index after it).
REUSE = {}

def load_reuse(old_dir, old_items):
    """old_items: key -> (lang, text, kind) as the shipped library was planned."""
    man = json.load(open(os.path.join(old_dir, 'manifest.json'), encoding='utf-8'))
    n = 0
    for sprite, base in man['files'].items():
        idx = json.load(open(os.path.join(old_dir, base + '.json'), encoding='utf-8'))
        blob = open(os.path.join(old_dir, base + '.mp3'), 'rb').read()
        force = set(filter(None, os.environ.get('AUDIO_FORCE', '').split(',')))
        for key, (off, ln) in idx.items():
            if key in force: continue      # its text changed: never reused
            if any(key.startswith(x) for x in filter(None, os.environ.get('AUDIO_SKIP_PREFIX', '').split(','))):
                continue                   # a whole kind being redrawn
            meta = old_items.get(key)
            if not meta: continue
            REUSE.setdefault(meta, blob[off:off+ln]); n += 1
    return n

def repaired(key, text):
    """A clip re-drawn and read back right by the checker, kept with the text it
    was drawn for: it is used only while that text is still the text."""
    d = os.environ.get('AUDIO_REPAIRED')
    if not d: return None
    b = os.path.join(d, key.replace(':', '_'))
    try:
        if open(b + '.txt', encoding='utf-8').read() == text:
            return open(b + '.mp3', 'rb').read()
    except OSError:
        pass
    return None

def job(t):
    key, lang, text, kind = t
    try:
        fix = repaired(key, text)
        if fix:
            return key, fix, None
        hit = REUSE.get((lang, text, kind))
        if hit:
            return key, hit, None
        data, note = mp3(lang, text, kind)
        return key, data, note
    except Exception as e:
        sys.stderr.write('FAILED %s: %s\n' % (key, e))
        return key, b'', 'threw: %s' % e

# A lone English word ends on a full stop when it is drawn: without one the voice
# swallows a final stop consonant ("hot" came out as "huh", "light" as "lie",
# "old" as "ole"); with it, whisper read every one of them back right (28 Sep).
def en_word(t):
    t = (t or '').strip()
    return t if not t or t[-1] in '.?!' else t + '.'

def plan(deck=None, sent=None, forms=None, en_of=None):
    deck = deck if deck is not None else json.load(open(R('deck','deck_full.json'), encoding='utf-8'))
    sent = sent if sent is not None else json.load(open(R('sentences','sent_full.json'), encoding='utf-8'))
    forms = forms if forms is not None else json.load(open(R('conj','forms.json'), encoding='utf-8'))
    # the English is read aloud without its tilde and its notes: "this ~
    # (before a noun)" was heard as "this tilde before a noun"
    en_of = en_of or spoken_en
    idx = {c['id']: i for i, c in enumerate(deck)}
    groups = {}
    def add(sprite, key, lang, text, kind):
        groups.setdefault(sprite, []).append((key, lang, text, kind))
    for i, c in enumerate(deck):
        sp = 'w-%03d' % (i // W_PER)
        add(sp, 'wj:'+c['id'], 'ja', c['kana'], 'word')
        add(sp, 'we:'+c['id'], 'en', en_word(en_of(c['en'])), 'en')
    for i, x in enumerate(sent):
        sp = 's-%03d' % (i // S_PER)
        add(sp, 'sj:'+x['id'], 'ja', x['kana'], 'sent')
        add(sp, 'se:'+x['id'], 'en', x['en'], 'en')
    # every form, not the first four: car mode can drill any of them, and a
    # form with no clip falls back to the device voice, which never reaches
    # CarPlay. That silent hole is the thing the pre-rendered voice exists to close.
    for wid, row in forms.items():
        if wid not in idx: continue
        sp = 'f-%03d' % (idx[wid] // F_PER)
        for k in range(len(row) // 3):
            add(sp, 'fj:%s:%d' % (wid, k), 'ja', row[k*3+1], 'word')
    for k, v in PHRASES.items():
        add('p-000', 'p:'+k, 'en', v, 'en')
    return groups

def signature(items):
    """What a sprite is made of: every key, its language and its exact text.
    Matching keys are not enough. A sentence can be rewritten without its id
    changing, and an earlier version of this tool would then have shipped the
    old audio under the new text."""
    h = hashlib.sha1()
    h.update((VOICE_REV + '\x00').encode('utf-8'))
    for key, lang, text, kind in items:
        p = pinned(key)
        if p:
            h.update(hashlib.sha1(p).digest())
        r = repaired(key, text)
        if r:
            h.update(hashlib.sha1(r).digest())
    for key, lang, text, kind in items:
        h.update(('%s\x00%s\x00%s\x00' % (key, lang, text)).encode('utf-8'))
        if kind == 'word' and lang == 'ja':
            # citation tempo, the nasal suffix and trimming all live behind this
            h.update(('w%d\x00' % WORD_RENDER).encode('utf-8'))
        elif laddered(lang, text):
            h.update(('r%d\x00' % RENDER).encode('utf-8'))
    return h.hexdigest()

def reusable(base, sig, old_sigs, sprite, same_encoder):
    # the encoder is part of what a sprite is, but it is compared rather than
    # hashed, so changing it does not have to rewrite every signature at once
    if not same_encoder:
        return False
    if old_sigs.get(sprite) != sig:
        return False
    return (os.path.exists(os.path.join(OUT, base + '.json'))
            and os.path.exists(os.path.join(OUT, base + '.mp3')))

def old_plan_items():
    """The library as it shipped: planned from the previous content, with the
    English as it was then read (the raw gloss)."""
    src = os.environ.get('AUDIO_OLD_SRC')
    if not src: return {}
    d = json.load(open(os.path.join(src, 'deck_full.json'), encoding='utf-8'))
    s = json.load(open(os.path.join(src, 'sent_full.json'), encoding='utf-8'))
    f = json.load(open(os.path.join(src, 'forms.json'), encoding='utf-8'))
    items = {}
    # AUDIO_OLD_SPOKEN=1: the library being reused was itself rendered from the
    # spoken English (any build after 28 Sep), so its keys map to those texts
    en_of = None if os.environ.get('AUDIO_OLD_SPOKEN') == '1' else (lambda t: t)
    for sp, lst in plan(d, s, f, en_of=en_of).items():
        for key, lang, text, kind in lst:
            items[key] = (lang, text, kind)
    # the phrase clips as they shipped
    return items

def main():
    os.makedirs(OUT, exist_ok=True)
    groups = plan()
    oi = old_plan_items()
    if oi:
        print('reusable clips from the shipped library: %d' % load_reuse(OUT, oi), flush=True)
    total = sum(len(v) for v in groups.values())
    print('%d clips across %d sprites' % (total, len(groups)), flush=True)

    # What the last build produced, so a sprite whose clips have not changed is
    # neither re-synthesised here nor re-downloaded on the phone.
    old = {}
    try:
        old = json.load(open(os.path.join(OUT, 'manifest.json'), encoding='utf-8'))
    except Exception:
        pass
    old_files = old.get('files') or {k: k for k in (old.get('sprites') or {})}
    old_sigs = old.get('sigs') or {}
    # A long build can be interrupted, so each finished sprite is recorded as
    # it lands and a restart picks up from there instead of starting over.
    part = {}
    try:
        part = json.load(open(os.path.join(OUT, 'manifest.partial.json'), encoding='utf-8'))
    except Exception:
        pass
    old_files = dict(old_files, **(part.get('files') or {}))
    old_sigs = dict(old_sigs, **(part.get('sigs') or {}))
    # The encoder is read from the partial too. Without that, a build resumed
    # after the finished manifest was lost treats every sprite as foreign and
    # renders the whole library again, which is exactly what happened.
    same_encoder = ((old.get('bitrate') or part.get('bitrate')) == BITRATE)

    manifest = {'version': 2, 'bitrate': BITRATE, 'wPer': W_PER, 'sPer': S_PER,
                'fPer': F_PER, 'sprites': {}, 'files': {}, 'sigs': {}}
    done = 0
    fallbacks = []
    with Pool(int(os.environ.get("AUDIO_PROCS","2"))) as pool:
        # Word sprites first, then sentences, then conjugation forms. The
        # cards play the word sprites, so finishing those first means the
        # upload can start while the rest is still rendering.
        order = {'w': 0, 's': 1, 'f': 2, 'p': 3}
        for sprite in sorted(groups, key=lambda k: (order.get(k[0], 9), k)):
            items = groups[sprite]
            sig = signature(items)
            base = old_files.get(sprite)
            if base and reusable(base, sig, old_sigs, sprite, same_encoder):
                idx_old = json.load(open(os.path.join(OUT, base + '.json'), encoding='utf-8'))
                size = os.path.getsize(os.path.join(OUT, base + '.mp3'))
                manifest['sprites'][sprite] = {'bytes': size, 'clips': len(idx_old)}
                manifest['files'][sprite] = base
                manifest['sigs'][sprite] = sig
                done += len(items)
                print('  %s  reused as %s  (%d/%d)' % (sprite, base, done, total), flush=True)
                continue
            index, blob, off = {}, bytearray(), 0
            for key, data, note in pool.imap(job, items, chunksize=8):
                if note:
                    fallbacks.append((key, note))
                if not data: continue
                index[key] = [off, len(data)]
                blob += data; off += len(data)
            if len(index) != len(items):
                raise SystemExit('%s: %d of %d clips failed to synthesise; '
                                 'refusing to ship a sprite with holes in it'
                                 % (sprite, len(items) - len(index), len(items)))
            body = bytes(blob)
            idx_txt = json.dumps(index, separators=(',', ':'))
            # the file is named after what is in it, so an unchanged sprite keeps
            # its URL and stays in the phone's cache while a changed one cannot
            # be served stale
            h = hashlib.sha1(body + idx_txt.encode('utf-8')).hexdigest()[:8]
            base = '%s.%s' % (sprite, h)
            open(os.path.join(OUT, base + '.mp3'), 'wb').write(body)
            open(os.path.join(OUT, base + '.json'), 'w').write(idx_txt)
            manifest['sprites'][sprite] = {'bytes': off, 'clips': len(index)}
            manifest['files'][sprite] = base
            manifest['sigs'][sprite] = sig
            done += len(items)
            json.dump(manifest, open(os.path.join(OUT, 'manifest.partial.json'), 'w'),
                      separators=(',', ':'))
            print('  %s  %d clips  %.1f MB  as %s  (%d/%d)' %
                  (sprite, len(index), off/1048576, base, done, total), flush=True)

    json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'),
              separators=(',', ':'))
    try:
        os.remove(os.path.join(OUT, 'manifest.partial.json'))
    except OSError:
        pass
    keep = {'manifest.json'}
    for b in manifest['files'].values():
        keep.add(b + '.mp3'); keep.add(b + '.json')
    dropped = 0
    for f in os.listdir(OUT):
        if f not in keep:
            os.remove(os.path.join(OUT, f)); dropped += 1
    if fallbacks:
        json.dump(fallbacks, open(R('state', 'audio_fallbacks.json'), 'w'),
                  ensure_ascii=False, indent=1)
        print('%d clips could not be cut from a carrier and were spoken alone; '
              'see state/audio_fallbacks.json' % len(fallbacks))
    mb = sum(v['bytes'] for v in manifest['sprites'].values())/1048576
    print('total %.1f MB in %d sprites, %d stale files removed'
          % (mb, len(manifest['sprites']), dropped))

if __name__ == '__main__':
    main()
