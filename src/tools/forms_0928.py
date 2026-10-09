# -*- coding: utf-8 -*-
"""Conjugation table and anchor revision of 28 Sep 2026 (council items 7, 47).

Applied to conj/forms.json and conj/anchors.json in place. Safe to run twice:
every step checks the shape it is about to change.

1. Adjectives speak the corpus's register. The plain negative (takakunai)
   becomes the polite one (takakunai desu, shizuka ja arimasen) under the name
   "politeneg", and the plain past (takakatta) is dropped: the polite past
   (takakatta desu) is what every sentence in the deck uses.
2. Non-volitional verbs lose the forms that are not Japanese words. A potential
   of komaru (komaremasu, "can be troubled") or a tai form of yogoreru
   (yogoretai desu, "want to get dirty") is a drill card that teaches a
   non-word. NON_VOLITIONAL names each verb and the forms it cannot take; the
   build refuses the table if one comes back.
3. The te-form is taught as the request he will actually make: "te" becomes
   "tekudasai", matte kudasai (please wait). A verb nobody can be asked to do
   (shinde kudasai, furu, kowareru) carries no request form at all.
4. A suru compound is spaced like its dictionary form: renshuu shimasu.
"""
import os, sys, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cdata, kana as K

# romaji -> forms it cannot take ('potential', 'tai', 'tekudasai')
NON_VOLITIONAL = {
    'komaru':        {'potential', 'tai', 'tekudasai'},
    'yogoreru':      {'potential', 'tai', 'tekudasai'},
    'shinu':         {'potential', 'tai', 'tekudasai'},
    'shiru':         {'potential'},                 # shiritai (want to know) is a word
    'owaru':         {'potential', 'tai', 'tekudasai'},
    'odoroku':       {'potential', 'tai', 'tekudasai'},
    'nureru':        {'potential', 'tai', 'tekudasai'},
    'chirakaru':     {'potential', 'tai', 'tekudasai'},
    'kizuku':        {'potential', 'tai'},
    'kogeru':        {'potential', 'tai', 'tekudasai'},
    'kusaru':        {'potential', 'tai', 'tekudasai'},
    'oosugiru':      {'potential', 'tai', 'tekudasai'},
    'nayamu':        {'potential', 'tai', 'tekudasai'},
    'makeru':        {'potential', 'tai', 'tekudasai'},
    'mayou':         {'potential', 'tai', 'tekudasai'},
    'okoru':         {'potential', 'tai', 'tekudasai'},
    'hotto suru':    {'potential', 'tai', 'tekudasai'},
    'shinpai suru':  {'potential', 'tai', 'tekudasai'},
    'shippai suru':  {'potential', 'tai', 'tekudasai'},
    'nareru':        {'potential'},
    'tariru':        {'potential', 'tai', 'tekudasai'},   # 9 Oct 2026
    'nakunaru':      {'potential', 'tai', 'tekudasai'},
}
# Verbs that happen to you, or to a thing: "please ..." cannot be asked of them.
NO_TEKUDASAI = {
    'aru', 'hajimaru', 'owaru', 'dekiru', 'odoroku', 'tsukareru', 'umareru', 'furu',
    'kowareru', 'kawaru', 'hareru', 'kikoeru', 'mieru', 'kimaru', 'tsuzuku', 'fueru',
    'heru', 'ochiru', 'waku', 'yakeru', 'kooru', 'tokeru', 'moeru', 'todoku',
    'nureru', 'komaru', 'yogoreru', 'niau', 'sugiru', 'oosugiru', 'chirakaru',
    'kogeru', 'kusaru', 'aku', 'shimaru', 'mitsukaru', 'kakaru', 'mayou', 'makeru',
    'okoru', 'nayamu', 'shinu', 'naku', 'hotto suru',
    'shinpai suru', 'shippai suru', 'tariru', 'nakunaru',
}
# iru (to need, c0858) shares its romaji with iru (to be, c0176, "ite kudasai",
# please stay), so it is named by id
NO_TEKUDASAI_IDS = {'c0858'}

ADJ_ORDER = ['politepast', 'politeneg', 'te']


def suru_spacing(row, dict_romaji):
    """renshuushimasu -> renshuu shimasu, for a spaced dictionary form"""
    if not dict_romaji.endswith(' suru'):
        return row
    pre = dict_romaji[:-5]
    out = list(row)
    for i in range(2, len(out), 3):
        r = out[i]
        if r.startswith(pre) and not r.startswith(pre + ' '):
            out[i] = pre + ' ' + r[len(pre):]
    return out


def verb_row(card, row):
    names = row[0::3]
    trip = {row[i]: (row[i+1], row[i+2]) for i in range(0, len(row), 3)}
    rom = card['romaji']
    bad = NON_VOLITIONAL.get(rom, set())
    out = []
    for n in names:
        k, r = trip[n]
        if n in bad:
            continue
        if n == 'te':
            if rom in NO_TEKUDASAI or card['id'] in NO_TEKUDASAI_IDS or 'tekudasai' in bad:
                continue
            n, k, r = 'tekudasai', k + 'ください', r + ' kudasai'
        if n == 'tekudasai' and (rom in NO_TEKUDASAI or card['id'] in NO_TEKUDASAI_IDS):
            continue
        out += [n, k, r]
    return out


def adj_row(card, row):
    names = row[0::3]
    if 'politeneg' in names:
        return row
    trip = {row[i]: (row[i+1], row[i+2]) for i in range(0, len(row), 3)}
    out = []
    pk, pr = trip['politepast']
    out += ['politepast', pk, pr]
    nk, nr = trip['neg']
    if card['pos'] == 'adj-i':
        out += ['politeneg', nk + 'です', nr + ' desu']
    else:
        assert nk.endswith('じゃない') and nr.endswith(' janai'), (card['id'], nk, nr)
        out += ['politeneg', nk[:-2] + 'ありません', nr[:-5] + 'ja arimasen']
    if 'te' in trip:
        out += ['te'] + list(trip['te'])
    return out


# te kudasai anchors: g022 shinde (to die) and g025 oyoide (to swim) are
# replaced by travel verbs that teach the same sub-rule: yobu (bu -> nde,
# yonde kudasai, please call) and isogu (gu -> ide, isoide kudasai, please hurry)
TE_REPLACE = {
    'g022': ('c0859', 'よぶ', 'yobu', 'to call / invite', 'よんで', 'yonde', 'call'),
    'g025': ('c0974', 'いそぐ', 'isogu', 'to hurry', 'いそいで', 'isoide', 'hurry'),
}
ADJ_ANCHOR = {
    # id: (form, kana, romaji, rule)
    'g031': ('politepast', 'たかかったです', 'takakatta desu', 'i-adjective: drop the final i, add katta desu'),
    'g032': ('politeneg', 'たかくないです', 'takakunai desu', 'i-adjective: drop the final i, add kunai desu'),
    'g033': ('politeneg', 'おいしくないです', 'oishikunai desu', 'i-adjective: drop the final i, add kunai desu'),
    'g034': ('politepast', 'よかったです', 'yokatta desu', 'ii is irregular: every form is built on yo-'),
    'g035': ('politeneg', 'よくないです', 'yokunai desu', 'ii is irregular: every form is built on yo-'),
    'g036': ('politepast', 'しずかでした', 'shizuka deshita', 'na-adjective: add deshita'),
    'g037': ('politeneg', 'しずかじゃありません', 'shizuka ja arimasen', 'na-adjective: add ja arimasen'),
    'g038': ('politepast', 'べんりでした', 'benri deshita', 'na-adjective: add deshita'),
}
FORM_EN = {'politepast': 'polite past', 'politeneg': 'polite negative', 'tekudasai': 'please form'}


def anchors(A, D):
    for a in A:
        if a['id'] in TE_REPLACE and a['form'] in ('te', 'tekudasai'):
            wid, bk, br, ben, tk, tr, verb = TE_REPLACE[a['id']]
            a.update(kana=tk + 'ください', romaji=tr + ' kudasai', base=bk, baseRomaji=br,
                     baseEn=D[wid]['en'], w=[wid], en=verb + ', please form', form='tekudasai')
            a['rule'] = ('godan te-form: verbs ending mu, bu or nu take nde' if br == 'yobu'
                         else 'godan te-form: verbs ending gu take ide')
        if a['form'] == 'te':
            a['kana'] = a['kana'] + 'ください'
            a['romaji'] = a['romaji'] + ' kudasai'
            a['en'] = a['en'].replace(', te-form', ', please form')
        if a['form'] in ('te', 'tekudasai'):
            a['form'] = 'tekudasai'
            a['formEn'] = FORM_EN['tekudasai']
            a['use'] = 'asking someone to do something: the te-form plus kudasai, as in matte kudasai, please wait'
            a['tags'] = ['conjugation', a['cls'], 'tekudasai']
        if a['id'] in ADJ_ANCHOR:
            f, k, r, rule = ADJ_ANCHOR[a['id']]
            a.update(form=f, kana=k, romaji=r, rule=rule, formEn=FORM_EN[f])
            base = a['en'].split(',')[0]
            a['en'] = base + ', ' + FORM_EN[f]
            a['tags'] = ['conjugation', a['cls'], f]
        assert K.check(a['kana'], a['romaji'])[0] == 'OK', (a['id'], a['kana'], a['romaji'])
    return A


def main():
    deck = cdata.deck(); D = {c['id']: c for c in deck}
    F = cdata.forms()
    changed = []
    for wid, row in F.items():
        c = D[wid]
        new = row
        if c['pos'] == 'verb':
            new = verb_row(c, suru_spacing(row, c['romaji']))
        elif c['pos'] in ('adj-i', 'adj-na'):
            new = adj_row(c, row)
        for i in range(0, len(new), 3):
            assert K.check(new[i+1], new[i+2])[0] == 'OK', (wid, new[i:i+3])
        if new != row:
            changed.append(wid)
            F[wid] = new
    cdata.save(F, 'conj', 'forms.json')
    A = anchors(cdata.anchors(), D)
    cdata.save(A, 'conj', 'anchors.json')
    print('forms rows changed:', len(changed))

if __name__ == '__main__':
    main()
