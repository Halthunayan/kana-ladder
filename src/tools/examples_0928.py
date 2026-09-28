# -*- coding: utf-8 -*-
"""Examples on the card back, re-pointed 28 Sep 2026 (council item 46).

For each of the first FIRST words in introduction order, the example becomes
the most readable sentence that contains the word: the one with the fewest
words introduced after it, preferring a line he would say on the trip, then a
shorter line, then the example it already had. A card whose kana is shared
with another card keeps its written example (the build forbids it borrowing
one). Written examples are scored the same way, by linking them as if they
were sentences, so a written line is only replaced by a sentence that reads
at least as easily.

A word outside that range keeps its example unless the example no longer
contains it (a sentence rewritten today); then a written one is supplied here.
"""
import os, sys, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cdata, kana as K
import link_sentences as LS

FIRST = 400
# written examples for words whose sentence was rewritten today
WRITTEN = {
    # sentences that show these verbs only in the te-form, which the forms
    # table now carries as the request (te kudasai) rather than on its own
    'c0548': ['このみせはパンをうります。', 'kono mise wa pan o urimasu.', 'This shop sells bread.'],
    'c0829': ['とりがそらをとびます。', 'tori ga sora o tobimasu.', 'Birds fly in the sky.'],
    'c0919': ['にくをやきます。', 'niku o yakimasu.', 'I grill the meat.'],
    'c1483': ['しごとがせいこうしました。', 'shigoto ga seikou shimashita.', 'The work was a success.'],
    'c1484': ['しけんにしっぱいしました。', 'shiken ni shippai shimashita.', 'I failed the exam.'],
    'c1496': ['いつもかぞくにかんしゃします。', 'itsumo kazoku ni kansha shimasu.', 'I am always grateful to my family.'],
    'c0700': ['おれはサッカーがすきだ。', 'ore wa sakkaa ga suki da.', 'I like football (a man, speaking casually).'],
    'c0836': ['このはなはみずがないとしにます。', 'kono hana wa mizu ga nai to shinimasu.', 'This plant dies without water.'],
}


# examples chosen by hand, which the scoring must not undo
PIN = {
    'c0665': 'nA033',     # yonde kudasai: please call (a taxi), the travel sense
}


def stems(e):
    k = K.kata2hira(e['kana']); out = []
    if e['pos'] not in ('verb', 'adj-i', 'expr'): return out
    if k.endswith('する') and len(k) > 2: out.append(k[:-2])
    if k.endswith('ない') and len(k) > 2: out.append(k[:-2])
    if len(k) >= 2: out.append(k[:-1])
    out += ['で' + o[1:] for o in out if o.startswith('て')]
    return [o for o in out if o]


DASH = chr(0x2014)
PATTERNS = {'c0252', 'c0253', 'c0254', 'c0255', 'c0256', 'c0601', 'c0602', 'c0603'}


def borrowed_ok(e, x, fm):
    """the build's test that a borrowed sentence contains its word, exactly
    (and the one tests/examples_check.js makes)"""
    row = fm.get(e['id'])
    return bool(e['kana'] in x['kana'] or e['id'] in (x.get('g') or {})
                or (row and any(row[i+1] in x['kana'] for i in range(0, len(row), 3)))
                or (e['pos'] in ('verb', 'adj-i') and len(e['kana']) > 2 and e['kana'][:-1] in x['kana']))


def stands_alone(e, x, D):
    """the word is in the sentence as itself, not only fused into a number
    (go in juugonichi) or inside a longer phrase card (arigatou inside
    arigatou gozaimashita)"""
    if e['pos'] in ('verb', 'adj-i', 'adj-na'):
        return True
    st = LS.toks(x['romaji']); mine = tuple(LS.toks(e['romaji']))
    n = len(mine)
    if not any(tuple(st[i:i+n]) == mine for i in range(len(st) - n + 1)):
        return False
    for o in x['w']:
        if o == e['id'] or o not in D: continue
        ot = tuple(LS.toks(D[o]['romaji']))
        if len(ot) > n and any(ot[j:j+n] == mine for j in range(len(ot) - n + 1)):
            return False
    return True


def contains(e, kana, fm, g=None):
    """the build's test that a written example contains its word"""
    row = fm.get(e['id'])
    vk = K.kata2hira(kana); ek = K.kata2hira(e['kana'])
    def face(i):
        k = row[i+1]
        return k[:-4] if row[i] == 'tekudasai' else k
    return (ek in vk or (g and e['id'] in g)
            or (row and any(K.kata2hira(face(i)) in vk for i in range(0, len(row), 3)))
            or (e['pos'] in ('verb', 'adj-i') and len(e['kana']) > 2 and K.kata2hira(e['kana'][:-1]) in vk)
            or any(s in vk for s in stems(e))
            or (e.get('say') and K.kata2hira(e['say']) in vk))


def main():
    deck = cdata.deck(); sent = cdata.sents(); ex = cdata.examples(); fm = cdata.forms()
    D = {c['id']: c for c in deck}
    S = {x['id']: x for x in sent}
    intro = [c for c in sorted(deck, key=lambda c: c['ord']) if not c.get('dup')]
    pos = {c['id']: i for i, c in enumerate(intro)}
    bykana = collections.defaultdict(list)
    for c in deck: bykana[c['kana']].append(c['id'])
    shared = {i for v in bykana.values() if len(v) > 1 for i in v}
    lk = LS.Linker()
    you = {l['sid'] for sc in cdata.scenes() for l in sc['lines'] if l['who'] == 'you'}
    byword = collections.defaultdict(list)
    for x in sent:
        for w in x['w']: byword[w].append(x)

    def later(ws, wid):
        p = pos.get(wid, 1 << 30)
        return sum(1 for w in set(ws) if w != wid and pos.get(w, 1 << 30) > p)

    changed = []
    for wid, v in WRITTEN.items():
        if ex.get(wid) != v:
            ex[wid] = v; changed.append((wid, 'written'))
    for wid, sid in PIN.items():
        if ex.get(wid) != sid:
            ex[wid] = sid; changed.append((wid, sid))
    for c in intro[:FIRST]:
        wid = c['id']
        if wid in shared or wid in PIN: continue
        cur = ex.get(wid)
        # the current example, scored the same way as any candidate: fewest
        # words met later, then fewest grammar patterns (a first verb gets a
        # plain travel line, not "must go"), then a line he says on the trip,
        # then the shorter line
        def key_of(ws, x):
            pat = 0 if wid in PATTERNS else sum(1 for w in ws if w in PATTERNS)
            trip = 0 if (x.get('say') or x.get('pk') or x['id'] in you) else 1
            return (later(ws, wid), pat, trip, len(x['kana']))
        if isinstance(cur, str) and borrowed_ok(c, S[cur], fm) and stands_alone(c, S[cur], D):
            ckey = key_of(S[cur]['w'], S[cur])
        elif isinstance(cur, str):
            ckey = (1 << 30,)
        else:
            w, g = lk.link({'id': 'x', 'kana': cur[0], 'romaji': cur[1], 'en': cur[2]})
            ckey = key_of(w, {'id': 'x', 'kana': cur[0]})
        best = None; bkey = ckey
        for x in byword.get(wid, []):
            if not borrowed_ok(c, x, fm) or not stands_alone(c, x, D): continue
            if DASH in x['en']: continue
            key = key_of(x['w'], x)
            if key < bkey: best, bkey = x['id'], key
        if best and best != cur:
            ex[wid] = best; changed.append((wid, best))
    cdata.save(ex, 'deck', 'examples.json')
    print('examples re-pointed:', len(changed))
    if '-v' in sys.argv:
        for wid, b in changed:
            print(wid, D[wid]['romaji'], '->', b, S[b]['romaji'] if b in S else '')
    return changed


if __name__ == '__main__':
    main()
