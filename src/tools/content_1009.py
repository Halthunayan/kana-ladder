# -*- coding: utf-8 -*-
"""Cards for every word a sentence used without one, 9 Oct 2026.

ano kikai de chaaji dekimasu (you can top it up at that machine) opened for
him with kikai and chaaji never taught: neither had a card, so the readability
gate could not count them. 43 sentences carried such a word. This appends a
card for each (array order is append-only: the review log stores indexes),
gives the new verbs and the adjective their forms rows and every new card an
example, and slots the new words into his introduction order without moving a
word he has met.

Run once, then:
    python3 src/tools/link_sentences.py
Safe to run twice: every step is an append-if-missing or an assignment.
A card already appended is brought back in line with NEW (gloss, say form).
"""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cdata

SAVE = '/root/.claude/uploads/ca8da01a-87a5-5321-a002-45fa57e4831f/1cbf4914-kana-ladder-2026-10-09_2.json'

def card(cid, kana, kanji, romaji, en, pos, tags, tier=1, **kw):
    c = dict(kana=kana, kanji=kanji, romaji=romaji, en=en, pos=pos, tier=tier, tags=tags,
             id=cid, stage=2, ord=None)
    c.update(kw)
    return c

NEW = [
    card('c1812', 'きかい', '機械', 'kikai', 'machine', 'noun', ['technology', 'travel']),
    card('c1813', 'チャージ', '', 'chaaji', 'top-up (money added to a travel card)', 'noun', ['money', 'transport']),
    card('c1814', 'ざんだか', '残高', 'zandaka', 'balance left on a card or account', 'noun', ['money', 'transport']),
    card('c1815', 'みりん', '', 'mirin', 'sweet rice wine used in cooking', 'noun', ['food', 'cooking']),
    card('c1816', 'ハラール', '', 'haraaru', 'halal, permitted by Islamic law', 'noun', ['food', 'restaurant']),
    card('c1817', 'めんぜい', '免税', 'menzei', 'tax-free, tax exemption', 'noun', ['shopping', 'money']),
    card('c1818', 'カード', '', 'kaado', 'card (bank, credit or point card)', 'noun', ['shopping', 'money']),
    card('c1819', 'スイカ', '', 'suika', 'the JR East prepaid IC card (Tokyo)', 'noun', ['transport', 'travel']),
    card('c1820', 'かんじ', '漢字', 'kanji', 'Chinese characters used in Japanese writing', 'noun', ['language', 'school']),
    card('c1821', 'クウェート', '', 'kuweeto', 'Kuwait', 'noun', ['places', 'intro']),
    card('c1822', 'こと', '事', 'koto', 'thing, matter (something abstract)', 'noun', ['grammar'], tier=2),
    card('c1823', 'さま', '様', 'sama', 'Mr or Ms, very polite (said by staff)', 'noun', ['people', 'courtesy'], rec=1,
         say='おきゃくさま', sayR='okyakusama', sayE='customer, said very politely'),
    card('c1824', 'りよう', '利用', 'riyou', 'use, making use of (a service)', 'noun', ['shopping', 'travel']),
    card('c1825', 'あずかる', '預かる', 'azukaru', 'to keep, look after (luggage, money)', 'verb', ['verbs', 'godan']),
    card('c1826', 'どの', '', 'dono', 'which ~ (before a noun)', 'pron', ['demonstratives', 'questions']),
    card('c1827', 'ごろ', '頃', 'goro', 'around ~ (a time of day)', 'particle', ['time', 'particles']),
    card('c1828', 'なし', '', 'nashi', 'none, with no ~ (after a noun)', 'noun', ['food', 'restaurant']),
    card('c1829', 'こい', '濃い', 'koi', 'strong, dense (coffee or tea); dark (colour)', 'adj-i', ['adjectives', 'taste'], tier=2),
    card('c1830', 'たりる', '足りる', 'tariru', 'to be enough', 'verb', ['verbs', 'ichidan']),
    card('c1831', 'あそぶ', '遊ぶ', 'asobu', 'to play, have fun', 'verb', ['verbs', 'godan'], tier=2),
    card('c1832', 'なくなる', '', 'nakunaru', 'to pass away; to run out, go missing', 'verb', ['verbs', 'godan'], tier=2),
    card('c1833', 'な', '', 'na', 'joins a na-adjective to a noun; da before node', 'particle', ['particles', 'grammar'], tier=2),
    card('c1834', 'じゃあ', '', 'jaa', 'well then, in that case', 'interj', ['responses', 'phrases']),
    card('c1835', 'てはいけません', '', 'te wa ikemasen', 'must not ~, is not allowed to ~', 'expr',
         ['grammar', 'patterns'], needs=['c0551', 'c0115', 'c0579']),
    # second pass, after the audit: counters that were fused into a number
    # (nihai, juugonichi) with no card behind the counter
    card('c1836', 'はい', '杯', 'hai', 'the counter for cups and glasses', 'counter', ['counters', 'drink'],
         say='にはい', sayR='nihai', sayE='two glasses'),
    card('c1837', 'にち', '日', 'nichi', 'the counter for days of the month', 'counter', ['counters', 'calendar'],
         say='じゅうごにち', sayR='juugonichi', sayE='the fifteenth'),
]

FORMS = {
    'c1825': ['masu', 'あずかります', 'azukarimasu', 'mashita', 'あずかりました', 'azukarimashita',
              'masen', 'あずかりません', 'azukarimasen', 'masendeshita', 'あずかりませんでした', 'azukarimasen deshita',
              'potential', 'あずかれます', 'azukaremasu', 'tekudasai', 'あずかってください', 'azukatte kudasai',
              'tai', 'あずかりたいです', 'azukaritai desu'],
    'c1830': ['masu', 'たります', 'tarimasu', 'mashita', 'たりました', 'tarimashita',
              'masen', 'たりません', 'tarimasen', 'masendeshita', 'たりませんでした', 'tarimasen deshita'],
    'c1831': ['masu', 'あそびます', 'asobimasu', 'mashita', 'あそびました', 'asobimashita',
              'masen', 'あそびません', 'asobimasen', 'masendeshita', 'あそびませんでした', 'asobimasen deshita',
              'potential', 'あそべます', 'asobemasu', 'tekudasai', 'あそんでください', 'asonde kudasai',
              'tai', 'あそびたいです', 'asobitai desu'],
    'c1832': ['masu', 'なくなります', 'nakunarimasu', 'mashita', 'なくなりました', 'nakunarimashita',
              'masen', 'なくなりません', 'nakunarimasen', 'masendeshita', 'なくなりませんでした', 'nakunarimasen deshita'],
    'c1829': ['politepast', 'こかったです', 'kokatta desu', 'politeneg', 'こくないです', 'kokunai desu',
              'te', 'こくて', 'kokute'],
}

# each new word borrows a deck sentence that contains it
EXAMPLES = {
    'c1812': 'nT005', 'c1813': 'nP004', 'c1814': 'nT004', 'c1815': 'nT015', 'c1816': 'nP003',
    'c1817': 'nP001', 'c1818': 'nB030', 'c1819': 'nT003', 'c1820': 'nF002', 'c1821': 'nP005',
    'c1822': 'nE070', 'c1823': 'nB061', 'c1824': 'nT024', 'c1826': 'nT006',
    'c1827': 'nT007', 'c1828': 'nT016', 'c1829': 's414', 'c1830': 'nT004', 'c1831': 'nC038',
    'c1832': 's473', 'c1833': 's064', 'c1834': 'nT018', 'c1835': 'nD116',
    # the cashier's oazukari shimasu hides the verb; this shows it
    'c1825': ['にもつをあずかってください。', 'nimotsu o azukatte kudasai.', 'Please keep my luggage for me.'],
    # hai shares its kana with hai (yes), so it cannot borrow a sentence
    'c1836': ['おちゃをにはいおねがいします。', 'ocha o nihai onegai shimasu.', 'Two cups of tea, please.'],
    'c1837': 'nS005',
    # hai (yes) now shares its kana with hai the counter, so it can no longer
    # borrow; it carries the same line it always showed, written inline
    'c0013': ['はい、どうぞ。', 'hai, douzo.', 'Here you are.'],
}

# Introduction order. The trip words go into every third of his next slots,
# most useful first; the rest go just after the last word their sentence needs.
TRIP = ['c1813', 'c1819', 'c1812', 'c1814', 'c1830', 'c1818', 'c1817', 'c1816', 'c1815',
        'c1828', 'c1821', 'c1835', 'c1820', 'c1826', 'c1827', 'c1834', 'c1823', 'c1824', 'c1825',
        'c1836', 'c1837']
LATER = {'c1822': 'nE070', 'c1829': 's414', 'c1831': 'nC038', 'c1832': 's473', 'c1833': 's064'}
TRIP_FROM, TRIP_EVERY = 2, 3


def main():
    deck = cdata.deck()
    have = {c['id'] for c in deck}
    assert len(deck) >= 1812, 'deck is not the one this was written for'
    added = [c for c in NEW if c['id'] not in have]
    # cards already appended take later corrections to their text fields
    byid = {c['id']: c for c in NEW}
    for c in deck:
        n = byid.get(c['id'])
        if n:
            for k in ('en', 'say', 'sayR', 'sayE'):
                if n.get(k) is not None: c[k] = n[k]
    if added:
        assert [c['id'] for c in added] == ['c%04d' % i for i in range(len(deck), len(deck) + len(added))]
        new_ids = {c['id'] for c in added}
        met = {k.split('|')[0] for k in json.load(open(SAVE))['items']}
        D = {c['id']: c for c in deck}
        before = {c['id']: c['ord'] for c in deck}
        unmet = [c['id'] for c in sorted(deck, key=lambda c: c['ord']) if c['id'] not in met and not c.get('dup')]
        movable = sorted(D[w]['ord'] for w in unmet)
        top = max(c['ord'] for c in deck)
        movable += list(range(top + 1, top + 1 + len(added)))
        seq = list(unmet)
        # a trip word keeps the slot its place in TRIP gives it, whichever
        # pass appended it, so a later pass slots in behind the earlier one
        for k, w in enumerate(TRIP):
            if w in new_ids: seq.insert(TRIP_FROM + k * TRIP_EVERY, w)
        S = {x['id']: x for x in cdata.sents()}
        pos = {w: i for i, w in enumerate(seq)}
        for w, sid in LATER.items():
            if w not in new_ids: continue
            need = [v for v in S[sid]['w'] if v in pos]
            at = max([pos[v] for v in need] + [TRIP_FROM + len(TRIP) * TRIP_EVERY]) + 1
            seq.insert(at, w)
            pos = {v: i for i, v in enumerate(seq)}
        assert len(seq) == len(movable) and len(set(seq)) == len(seq)
        new_ord = dict(zip(seq, movable))
        for c in deck:
            if c['id'] in new_ord: c['ord'] = new_ord[c['id']]
        for c in added:
            c['ord'] = new_ord[c['id']]
            deck.append(c)
        ords = [c['ord'] for c in deck]
        assert len(ords) == len(set(ords)), 'ord values are no longer unique'
        assert all(c['ord'] == before[c['id']] for c in deck if c['id'] in met), 'a met word moved'
    cdata.save(deck, 'deck', 'deck_full.json')
    F = cdata.forms()
    for k, v in FORMS.items(): F.setdefault(k, v)
    cdata.save(F, 'conj', 'forms.json')
    E = cdata.load('deck', 'examples.json')
    for k, v in EXAMPLES.items(): E[k] = v
    cdata.save(E, 'deck', 'examples.json')
    print('cards added:', len(added), [(c['id'], c['romaji'], c['ord']) for c in added])


if __name__ == '__main__':
    main()
