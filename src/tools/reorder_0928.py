# -*- coding: utf-8 -*-
"""Introduction order (ord) for the words he has not met yet, 28 Sep 2026
(council item 3).

Words he has met keep their ord. The unmet words are re-sequenced and given
back the same set of ord values they held, so every ord stays a unique integer
and nothing about a met word moves. Stage and tier are never touched.

The sequence is greedy, one slot at a time:
  * a trip essential is pinned into every third slot until the list is done;
  * at least one verb in every three slots, while verbs remain;
  * at most one number, counter or calendar word in any three slots;
  * otherwise the word that makes the most trip lines sayable: a line is
    weighted 3 if he says it (say:1, a pack phrase, or a "you" line in a
    scene), 1.5 if it is a scene line he hears, 0.1 otherwise, and a word
    scores the full weight when it completes the line, 0.4 when one other word
    is still missing, 0.1 when two are;
  * every word a scene needs is placed inside the first SCENE_BY slots, so all
    seventeen scenes can open by 20 Nov at three words a day;
  * a second meaning of a sound he will meet first (ima the living room, hashi
    the bridge, kaeru to change, kiru to cut, kaze the wind, shita the tongue,
    atsui the weather, since December is cold and it is soup and baths that are hot) goes after the trip window, and no two words with the
    same romaji are ever within 30 slots of each other.

Run with --sim to print the before and after simulation without writing.
"""
import os, sys, json, collections, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cdata

SAVE = '/root/.claude/uploads/ca8da01a-87a5-5321-a002-45fa57e4831f/f0e003a0-kana-ladder-2026-09-28.json'
ESSENTIALS = ['c0101', 'c0154', 'c0155', 'c0531', 'c0121', 'c1627', 'c0670', 'c0432', 'c0947',
              'c0441', 'c1168', 'c0280', 'c0641', 'c0315', 'c0223', 'c0106', 'c0195', 'c1226',
              'c0219', 'c0245', 'c0242', 'c0179', 'c0181', 'c0183', 'c0145']
LATE = {'c0923', 'c0807', 'c0984', 'c0920', 'c0538', 'c0899', 'c0167'}
LATE_FROM = 740          # slot the second meanings may start at (past the trip window)
SCENE_BY = 159           # 53 intake days x 3 words, 28 Sep to 20 Nov
HOMO_GAP = 30
WINDOW = 700             # unmet words considered for re-sequencing; the rest keep their order
CLU_TAGS = {'numbers', 'counters', 'calendar'}
INTAKE_DAYS = 53         # 63 days to 30 Nov less a 10-day taper with no new words
ACTIVE = 18 / 23.0       # his active-day rate so far


def base_ord_of(D, w):
    return D[w]['ord']


def is_clu(c):
    return c['pos'] in ('num', 'counter') or bool(set(c.get('tags') or []) & CLU_TAGS)


def met_words(deck):
    items = json.load(open(SAVE))['items']
    ids = {c['id'] for c in deck}
    return {k.split('|')[0] for k in items if k.split('|')[0] in ids}


def trip_weights(sent, scenes):
    W = {}
    for x in sent:
        W[x['id']] = 3.0 if (x.get('say') or x.get('pk')) else 0.1
    for sc in scenes:
        for l in sc['lines']:
            W[l['sid']] = max(W.get(l['sid'], 0), 3.0 if l['who'] == 'you' else 1.5)
    return W


def sequence(deck, sent, scenes, met):
    D = {c['id']: c for c in deck}
    unmet = [c for c in sorted(deck, key=lambda c: c['ord']) if c['id'] not in met and not c.get('dup')]
    cand = unmet[:WINDOW]; tail = unmet[WINDOW:]
    W = trip_weights(sent, scenes)
    bywd = collections.defaultdict(list)
    for x in sent:
        for w in set(x['w']): bywd[w].append(x)
    scene_words = []
    for sc in scenes:
        for l in sc['lines']:
            for w in {y['id']: y for y in sent}[l['sid']]['w']:
                if w not in met and w not in scene_words and w in D and not D[w].get('dup'):
                    scene_words.append(w)
    # a scene word outside the window is pulled into it
    inwin = {c['id'] for c in cand}
    for w in scene_words:
        if w not in inwin:
            cand.append(D[w]); inwin.add(w); tail = [c for c in tail if c['id'] != w]
    for w in ESSENTIALS:
        if w not in inwin and w not in met:
            cand.append(D[w]); inwin.add(w); tail = [c for c in tail if c['id'] != w]
    known = set(met)
    pool = [c for c in cand if c['id'] not in LATE]
    late = [c for c in cand if c['id'] in LATE]
    ess = [D[w] for w in ESSENTIALS if w not in met]
    # A scene opens when every line has at most one unknown word, so a word
    # that is the only gap left in each of its lines need not be there first.
    # The words that can wait are chosen from the least useful (latest in the
    # curated order), never from the essentials.
    lines = [[w for w in {y['id']: y for y in sent}[l['sid']]['w'] if w not in met]
             for sc in scenes for l in sc['lines']]
    waived = set()
    for w in sorted(scene_words, key=lambda w: -base_ord_of(D, w)):
        if w in ESSENTIALS: continue
        trial = waived | {w}
        if all(sum(1 for v in ln if v in trial) <= 1 for ln in lines):
            waived = trial
    need_scene = [w for w in scene_words if w not in LATE and w not in waived]
    out = []; placed_at = {}
    rom_at = {}
    base_ord = {c['id']: c['ord'] for c in deck}

    def homo_ok(c, k):
        j = rom_at.get(c['romaji'])
        return j is None or k - j >= HOMO_GAP

    def score(c):
        sc = 0.0
        for x in bywd[c['id']]:
            miss = sum(1 for w in x['w'] if w not in known and w != c['id'])
            sc += W.get(x['id'], 0.1) * (1.0 if miss == 0 else 0.4 if miss == 1 else 0.1 if miss == 2 else 0)
        return sc - base_ord[c['id']] / 400.0

    while pool or late:
        k = len(out)
        if k >= LATE_FROM and late:
            pool += late; late = []
        if not pool:
            pool += late; late = []
        last3 = out[-2:]
        need_verb = (len(out) >= 2 and not any(D[x]['pos'] == 'verb' for x in last3)
                     and any(c['pos'] == 'verb' for c in pool))
        clu_block = any(is_clu(D[x]) for x in last3)
        left_scene = [w for w in need_scene if w not in placed_at]
        force_scene = left_scene and (SCENE_BY - k) <= len(left_scene)
        pick = None
        if ess and k % 3 == 0:
            for c in ess:
                if c in pool and homo_ok(c, k) and not (clu_block and is_clu(c)):
                    pick = c; break
        if pick is None:
            best = None; bs = -1e18
            for c in pool:
                if need_verb and c['pos'] != 'verb': continue
                if clu_block and is_clu(c) and not need_verb: continue
                if not homo_ok(c, k): continue
                if force_scene and c['id'] not in left_scene: continue
                s = score(c)
                if s > bs: bs = s; best = c
            if best is None:            # constraints cannot all be met: relax in order
                for c in pool:
                    if homo_ok(c, k) and (not force_scene or c['id'] in left_scene):
                        best = c; break
            pick = best or pool[0]
        pool.remove(pick)
        if pick in ess: ess.remove(pick)
        out.append(pick['id']); placed_at[pick['id']] = k; known.add(pick['id'])
        rom_at[pick['romaji']] = k
    full = out + [c['id'] for c in tail]
    # the second meanings go past the whole re-sequenced window, so none of
    # them sits inside the trip window (the first 804 words) without a sentence
    lat = [w for w in full if w in LATE]
    rest = [w for w in full if w not in LATE]
    at = max(LATE_FROM, len(out) + 20)
    return rest[:at] + lat + rest[at:]


def assign(deck, order, met):
    """give the unmet words their new ords from the set they already held"""
    D = {c['id']: c for c in deck}
    movable = sorted(D[w]['ord'] for w in order)
    new = {w: movable[i] for i, w in enumerate(order)}
    for c in deck:
        if c['id'] in new: c['ord'] = new[c['id']]
    ords = [c['ord'] for c in deck]
    assert len(ords) == len(set(ords)), 'ord values are no longer unique'
    return new


def simulate(deck, sent, scenes, met, order, n_new):
    D = {c['id']: c for c in deck}
    S = {x['id']: x for x in sent}
    known = set(met) | set(order[:n_new])
    full = lambda x: all(w in known for w in x['w'])
    say = [x for x in sent if x.get('say')]
    you = {l['sid'] for sc in scenes for l in sc['lines'] if l['who'] == 'you'}
    reh = 0
    for sc in scenes:
        if all(sum(1 for w in S[l['sid']]['w'] if w not in known) <= 1 for l in sc['lines']):
            reh += 1
    return dict(words_met=len(known), verbs=sum(1 for w in known if D[w]['pos'] == 'verb'),
                say_lines_sayable='%d of %d' % (sum(1 for x in say if full(x)), len(say)),
                scene_you_lines_sayable='%d of %d' % (sum(1 for s in you if full(S[s])), len(you)),
                scenes_rehearsable='%d of %d' % (reh, len(scenes)),
                essentials_missed=sum(1 for w in ESSENTIALS if w not in known),
                pack_sayable='%d of %d' % (sum(1 for x in sent if x.get('pk') and full(x)), sum(1 for x in sent if x.get('pk'))))


def scene_open_day(deck, sent, scenes, met, order):
    """day (at 3 words a day, from 28 Sep) each scene becomes rehearsable"""
    S = {x['id']: x for x in sent}
    out = {}
    for sc in scenes:
        for n in range(0, len(order) + 1, 3):
            known = set(met) | set(order[:n])
            if all(sum(1 for w in S[l['sid']]['w'] if w not in known) <= 1 for l in sc['lines']):
                out[sc['id']] = n // 3; break
    return out


def main():
    deck = cdata.deck(); sent = cdata.sents(); scenes = cdata.scenes()
    met = met_words(deck)
    before = [c['id'] for c in sorted(deck, key=lambda c: c['ord']) if c['id'] not in met and not c.get('dup')]
    after = sequence(deck, sent, scenes, met)
    assert sorted(after) == sorted(before)
    rep = {}
    for lab, order in (('before', before), ('after', after)):
        rep[lab] = {'3 a day, 53 intake days': simulate(deck, sent, scenes, met, order, 3 * INTAKE_DAYS),
                    '3 a day at 78% of days': simulate(deck, sent, scenes, met, order,
                                                        3 * int(INTAKE_DAYS * ACTIVE)),
                    'scene open day': scene_open_day(deck, sent, scenes, met, order)}
    print(json.dumps(rep, indent=1))
    if '--sim' in sys.argv:
        return
    assign(deck, after, met)
    cdata.save(deck, 'deck', 'deck_full.json')
    json.dump(rep, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'reorder_0928_sim.json'), 'w'), indent=1)
    D = {c['id']: c for c in deck}
    print('first 60 new:', ' '.join(D[w]['romaji'] for w in after[:60]))


if __name__ == '__main__':
    main()
