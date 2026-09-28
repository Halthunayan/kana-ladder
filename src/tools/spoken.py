# -*- coding: utf-8 -*-
"""The English a gloss is read aloud as.

A gloss is written to be read on a card: "this ~ (before a noun)", "to / at /
in (time, destination)", "certainly, said by staff". Read aloud by a voice it
becomes "this tilde before a noun" and "to slash at slash in". spoken_en()
turns the written gloss into the sentence a person would say:

  - a bracketed note, (...) or [...], is dropped, except "(not)", which carries
    meaning and becomes "not";
  - the tilde (~ and the fullwidth one) is dropped;
  - a trailing register or speaker note (", polite", ", said by staff", ", the
    long formal one") is dropped;
  - "a / b / c" becomes "a, b or c", and ";" becomes ",";
  - spaces and commas are tidied.

A handful of glosses read badly even after that and are fixed by hand in
OVERRIDE, keyed by the exact written gloss.

build.py imports this module (it emits the result as "sy" on a card whose
spoken form differs from its gloss) and so does the audio renderer (the "we:"
clips are rendered from it), so the two can never disagree.
"""
import re

# Trailing comma segments that describe register or who says it rather than
# what the word means. Only a segment after the first is ever dropped, so a
# card whose meaning IS "polite" (teinei) keeps it.
QUALIFIERS = {
    'polite', 'said by staff', 'used by staff', 'everyday', 'casual',
    'the long formal one', 'the long formal one said on first meeting',
    'the two word version', 'a step less formal', 'the one word casual version',
    'formal', 'humble', 'honorific',
}

# Written gloss -> spoken form, where the rules alone read badly.
OVERRIDE = {
    'looks ~ judging by outward appearance': 'looks like, judging by appearance',
    'possessive / of, \'s': 'possessive, of',
    'o\'clock, the hour counter': 'o\'clock',
    'and (nouns) / with (someone)': 'and, with',
    'direction / to (place)': 'towards, to',
    'I want to ~ (verb)': 'I want to',
    'let\'s ~': 'let\'s',
    # 28 Sep audit: pairs that became the same once their notes were dropped,
    # though the note is the whole difference (iru and aru), and ni the number,
    # which otherwise shares "two" with futatsu and its sound with ni the particle
    'to be / exist (people, animals)': 'to be, for people and animals',
    'to be / exist (things)': 'to be, for things',
    'two': 'two, the number',
}


def _tidy(t):
    t = re.sub(r'\s+', ' ', t)
    t = re.sub(r'\s+([,?.!])', r'\1', t)
    t = re.sub(r'(,\s*)+,', ',', t)
    t = re.sub(r',(?=[^\s\d])', ', ', t)
    t = re.sub(r'\s+', ' ', t)
    return t.strip(' ,')


def _or_list(seg):
    """'a / b / c' -> 'a, b or c'"""
    parts = [p.strip() for p in re.split(r'\s*/\s*', seg) if p.strip()]
    if len(parts) <= 1:
        return seg.strip()
    return ', '.join(parts[:-1]) + ' or ' + parts[-1]


def spoken_en(en):
    if en is None:
        return en
    if en in OVERRIDE:
        return OVERRIDE[en]
    t = en.replace('～', '~')
    t = re.sub(r'\(\s*not\s*\)', 'not', t)
    t = re.sub(r'\[[^\]]*\]', ' ', t)
    t = re.sub(r'\([^)]*\)', ' ', t)
    t = t.replace('~', ' ')
    t = t.replace(';', ',')
    # a slash list stays inside its own comma segment: "yes / here" -> "yes or
    # here", "to / at / in" -> "to, at or in"
    # a comma inside a number (3,000) is not a list separator
    segs = [s for s in (x.strip() for x in re.split(r',(?!\d)', t)) if s]
    segs = [_or_list(s) for s in segs]
    # drop trailing qualifiers, never the first segment
    while len(segs) > 1 and segs[-1].lower().strip(' .') in QUALIFIERS:
        segs.pop()
    t = ', '.join(segs)
    t = t.replace('/', ' or ')
    t = _tidy(t)
    # a sentence gloss keeps its closing mark; "Is it halal ?" -> "Is it halal?"
    return t


def spoken_key(t):
    """What two spoken glosses are compared on: case and punctuation are not
    heard, so "Good morning." and "good morning" are the same prompt."""
    return ' '.join(re.sub(r"[^a-z0-9 ]", ' ', (t or '').lower().replace("'", '')).split())


BAD = re.compile(r'[~～()\[\]/;]')


if __name__ == '__main__':
    import json, os, sys, collections
    ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    d = json.load(open(os.path.join(ROOT, 'deck', 'deck_full.json'), encoding='utf-8'))
    ch = [(c['id'], c['en'], spoken_en(c['en'])) for c in d if spoken_en(c['en']) != c['en']]
    print('changed', len(ch))
    if '-v' in sys.argv:
        for x in ch: print('%s | %s  ->  %s' % x)
    g = collections.defaultdict(list)
    for c in d: g[spoken_key(spoken_en(c['en']))].append(c['id'])
    col = {k: v for k, v in g.items() if len(v) > 1}
    print('collision groups', len(col), sum(len(v) for v in col.values()))
    if '-c' in sys.argv:
        for k, v in col.items(): print(k, v)
