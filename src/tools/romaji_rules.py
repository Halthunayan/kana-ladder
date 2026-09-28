# -*- coding: utf-8 -*-
"""House rules for how romaji is written, shared by the fixer and the build guard.

1. A syllabic n (ん) followed by a vowel or y is written n': kin'youbi, ten'in,
   so that kinyoubi is not read as ki-nyo-u-bi.
2. onegai shimasu is two words.
3. The hour counter is joined to its number: shichiji, not shichi ji.
4. Yen stands apart from its number: hyaku en, sen en.
5. isshoni is one word, as the deck card writes it.
6. A suru compound is spaced: benkyou suru, benkyou shimasu.

apostrophe_fixes(kana, romaji) returns the romaji with rule 1 applied, found by
aligning the kana to the romaji mora by mora rather than by guessing from the
letters, so kin'youbi is caught and konnichiwa (ん then に) is left alone.
"""
import re, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kana as K

PUNCT = "、。？！,.!?'\"　 -"
VOWELY = set('あいうえおやゆよアイウエオヤユヨ')

def _morae(kana):
    out = []; i = 0
    while i < len(kana):
        if kana[i] in PUNCT: i += 1; continue
        two = K.kata2hira(kana[i:i+2])
        if len(two) == 2 and two in K.DIG: out.append((i, 2, K.DIG[two])); i += 2; continue
        ch = kana[i]; h = K.kata2hira(ch)
        if ch == 'ー': out.append((i, 1, out[-1][2][-1] if out else 'u')); i += 1; continue
        if h == 'っ': out.append((i, 1, '')); i += 1; continue
        if h in K.MONO: out.append((i, 1, K.MONO[h])); i += 1; continue
        out.append((i, 1, '?')); i += 1
    return out

ALT = {'wa': 'ha', 'ha': 'wa', 'e': 'he', 'he': 'e', 'o': 'wo', 'wo': 'o'}

def align_chars(kana, romaji):
    """[(romaji string index, kana index)] for each letter of romaji, or None"""
    letters = [(i, c) for i, c in enumerate(romaji.lower()) if c not in PUNCT]
    r = ''.join(c for _, c in letters)
    out = []; ri = 0
    for (ki, kl, rm) in _morae(kana):
        if rm == '':
            if ri < len(r): out.append((letters[ri][0], ki)); ri += 1
            continue
        hit = None
        for c in [rm] + ([ALT[rm]] if rm in ALT else []):
            if r.startswith(c, ri): hit = c; break
        if hit is None:
            # long vowels: おう may be written ou or oo, えい as ee or ei; the
            # kana check module accepts these, so the aligner does too
            if rm in ('u', 'i') and ri < len(r) and r[ri] in 'oe' and ri > 0 and r[ri] == r[ri-1]:
                hit = r[ri]
            elif ri < len(r) and r[ri] == rm[0]:
                hit = rm[0]
            else:
                return None
        for _ in hit:
            out.append((letters[ri][0], ki)); ri += 1
    if ri != len(r): return None
    return out

def apostrophe_fix(kana, romaji):
    """romaji with n' inserted wherever a syllabic n precedes a vowel or y"""
    al = align_chars(kana, romaji)
    if al is None: return romaji
    k2r = {}
    for ri, ki in al: k2r.setdefault(ki, []).append(ri)
    ins = []
    for ki, ch in enumerate(kana):
        if K.kata2hira(ch) != 'ん' or ki + 1 >= len(kana): continue
        nxt = kana[ki+1]
        if nxt not in VOWELY: continue
        rs = k2r.get(ki)
        if not rs: continue
        ri = rs[-1]
        # already n' or separated by a space (a word boundary reads fine)
        if ri + 1 < len(romaji) and romaji[ri+1] in "' ": continue
        ins.append(ri + 1)
    out = romaji
    for p in sorted(ins, reverse=True):
        out = out[:p] + "'" + out[p:]
    return out

def needs_apostrophe(kana, romaji):
    return apostrophe_fix(kana, romaji) != romaji

# text rules 2 to 5, applied to romaji only
NUMS = r'(?:ichi|ni|san|yo|go|roku|shichi|hachi|ku|juu|juuichi|juuni|nan)'
def spacing_fix(r):
    r = re.sub(r"\bonegaishimasu\b", 'onegai shimasu', r)
    r = re.sub(r"\b(" + NUMS + r") ji\b", r'\1ji', r)
    r = re.sub(r"\b(\w*(?:hyaku|byaku|pyaku|sen|zen|man|juu))en\b", r'\1 en', r)
    r = re.sub(r"\bissho ni\b", 'isshoni', r)
    r = re.sub(r"\bsorekara\b", 'sore kara', r)
    return r
