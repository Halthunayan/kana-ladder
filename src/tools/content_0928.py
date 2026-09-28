# -*- coding: utf-8 -*-
"""Content revision of 28 Sep 2026 (council items 15, 16, 17, 18, 7, 8, 54).

Run once, in this order, before link_sentences.py:
    python3 src/tools/content_0928.py
    python3 src/tools/forms_0928.py
    python3 src/tools/link_sentences.py
    python3 src/tools/reorder_0928.py
    python3 src/tools/link_sentences.py      (the containment rule reads ord)
    python3 src/tools/examples_0928.py

Every change is an assignment or an append-if-missing, so running it twice
leaves the files as running it once did. Nothing is ever deleted, reordered or
inserted mid-array: the review log stores each card's array index.
"""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cdata, kana as K, romaji_rules as RR

# ---------------------------------------------------------------------------
# F. content errors, fixed in place (ids kept)
SENT_FIX = {
    # a polite refusal, not an acceptance
    'nC001': dict(en="No thanks, I don't need this one."),
    # the shop's thank you for your custom, not goodbye
    'nS050': dict(en='Thank you for your custom.'),
    'nB014': dict(en='Is this all right?'),
    # asa takes no ni
    'nH021': dict(kana='あささんぽをします。', romaji='asa sanpo o shimasu.'),
    # "dochiraka kudasai" is not something a native says
    'nJ011': dict(kana='どちらかえらんでください。', romaji='dochiraka erande kudasai.',
                  en='Please choose either one.'),
    # you wait at a station alone; you meet there
    's247': dict(kana='あした、えきであいましょう。', romaji='ashita, eki de aimashou.',
                 en="Let's meet at the station tomorrow."),
    # register: ore is rough and male, shinimashita is blunt about a death
    's364': dict(kana='わたしはサッカーがすきです。', romaji='watashi wa sakkaa ga suki desu.'),
    's473': dict(kana='そふはきょねんなくなりました。', romaji='sofu wa kyonen nakunarimashita.',
                 en='My grandfather passed away last year.'),
    # he leaves on the 15th of December
    'nS005': dict(kana='じゅうごにちまでです。', romaji='juugonichi made desu.', en='Until the 15th.'),
    # nA011 and nS030 were the same sentence twice; nS030 now asks for the
    # formal receipt a taxi driver writes out
    'nS030': dict(kana='りょうしゅうしょをください。', romaji='ryoushuusho o kudasai.',
                  en='A formal receipt, please.'),
}
DECK_FIX = {
    'c0330': dict(en="it's good / that's fine / no thanks (declining)"),
    'c0665': dict(en='please call / please read it'),
    'c0218': dict(en='now; already; (not) any more'),
}
EXAMPLE_FIX = {
    # the okanjou card's example has to contain okanjou
    'c0876': ['すみません、おかんじょうおねがいします。', 'sumimasen, okanjou onegai shimasu.',
              'Excuse me, could we have the bill, please?'],
    # the refusal no longer illustrates kore, and kimi is not how he asks a name
    'c0224': 'nA004',
    'c0025': 's037',
    'c0330': 'nA005',
}
# em dashes in English, replaced with ordinary punctuation
EXAMPLE_EN = {
    'c0001': "Good morning, nice weather again today, isn't it?",
    'c0117': 'Thanks for the meal, it was really delicious.',
    'c0482': 'Excuse me, the check, please.',
    'c0866': "I'm going back to my country. Please take care.",
    'c1441': 'Nice to meet you. Here is my business card.',
}

# G. said by staff, never by him: recognition only, never asked English to Japanese
REC = ['c1783', 'c0641', 'c0872', 'c0991', 'c1784', 'c1758', 'c0312', 'c0314']

# D. pattern cards wait for one of these verbs (iku c0180, taberu c0114, nomu
# c0115, kau c0116, miru c0182, kaeru c0181, toru c0551, tsukau c0549, hanasu c0184)
NEEDS = {
    'c0252': ['c0180', 'c0114', 'c0115', 'c0182'],            # masen ka, won't you
    'c0253': ['c0180', 'c0114', 'c0115', 'c0181'],            # mashou, let's
    'c0254': ['c0180', 'c0114', 'c0115', 'c0116', 'c0182'],   # tai desu, want to
    'c0601': ['c0182', 'c0114', 'c0551', 'c0549'],            # temo ii desu ka, may I
    'c0602': ['c0180', 'c0181', 'c0116'],                     # nakereba narimasen, must
    'c0603': ['c0114', 'c0116', 'c0184', 'c0549'],            # koto ga dekimasu, can
}

# ---------------------------------------------------------------------------
# I. survival phrase pack, in the order he should get them
NEW_PACK = [
    # id, kana, romaji, en, level, grammar
    ('nP001', 'めんぜいできますか。', 'menzei dekimasu ka.', 'Can I buy tax-free?', 2, 'can'),
    ('nP002', 'みりんやおさけははいっていますか。', 'mirin ya osake wa haitte imasu ka.',
     'Does it contain mirin or alcohol?', 3, 'question'),
    ('nP003', 'ハラールですか。', 'haraaru desu ka.', 'Is it halal?', 1, 'question'),
    ('nP004', 'スイカにチャージしたいです。', 'suika ni chaaji shitai desu.', 'I want to top up my Suica.', 2, 'want'),
    ('nP005', 'クウェートからきました。', 'kuweeto kara kimashita.', "I'm from Kuwait.", 1, 'past'),
]
PACK = ['nA114', 'nA112', 'nA113', 'nA116', 'nA122', 'nE004', 'nA001', 'nA004', 'nA124',
        'nA009', 'nP001', 'nH162', 'nS008', 'nA067', 'nA069', 'nA071', 'nP002', 'nP003',
        's408', 'nS039', 'nA028', 'nA029', 'nP004', 'nA034', 'nA098', 'nG005', 'nA129',
        'nA094', 'nA089', 'nA096', 'nA092', 'nG018', 'nP005']

# J. scene lines that did not exist yet
NEW_SCENE = [
    ('nT001', 'どうしましたか。', 'dou shimashita ka.', 'What seems to be the problem?', 1, 'question', 0),
    ('nT002', 'かいさつがあきません。', 'kaisatsu ga akimasen.', "The ticket gate won't open.", 2, 'negation', 1),
    ('nT003', 'スイカをみせてください。', 'suika o misete kudasai.', 'Please show me your Suica.', 2, 'request', 0),
    ('nT004', 'ざんだかがたりません。', 'zandaka ga tarimasen.', "There isn't enough money on the card.", 3, 'negation', 0),
    ('nT005', 'あのきかいでチャージできます。', 'ano kikai de chaaji dekimasu.', 'You can top it up at that machine.', 3, 'can', 0),
    ('nT006', 'どのでんしゃですか。', 'dono densha desu ka.', 'Which train was it?', 1, 'question', 0),
    ('nT007', 'じゅうじごろのでんしゃです。', 'juuji goro no densha desu.', "The train at about ten o'clock.", 2, 'statement', 1),
    ('nT008', 'かばんのなかになにがありますか。', 'kaban no naka ni nani ga arimasu ka.', 'What is in the bag?', 2, 'question', 0),
    ('nT009', 'パスポートとさいふがあります。', 'pasupooto to saifu ga arimasu.', 'My passport and my wallet are in it.', 2, 'existence', 1),
    ('nT010', 'ここにじゅうしょとでんわばんごうをかいてください。', 'koko ni juusho to denwa bangou o kaite kudasai.',
     'Please write your address and phone number here.', 3, 'request', 0),
    ('nT011', 'ホテルのじゅうしょでいいですか。', 'hoteru no juusho de ii desu ka.', 'Is the hotel address all right?', 2, 'question', 1),
    ('nT012', 'みつかったら、れんらくします。', 'mitsukattara, renraku shimasu.', 'If we find it, we will contact you.', 3, 'conditional', 0),
    ('nT013', 'いいえ、ハラールではありません。', 'iie, haraaru dewa arimasen.', 'No, it is not halal.', 2, 'negation', 0),
    ('nT014', 'さかなのていしょくはぶたにくがはいっていません。', 'sakana no teishoku wa butaniku ga haitte imasen.',
     'The fish set meal has no pork in it.', 3, 'negation', 0),
    ('nT015', 'みりんがすこしはいっています。', 'mirin ga sukoshi haitte imasu.', 'There is a little mirin in it.', 3, 'ongoing', 0),
    ('nT016', 'みりんなしでつくれますか。', 'mirin nashi de tsukuremasu ka.', 'Can you make it without mirin?', 3, 'can', 1),
    ('nT017', 'はい、できます。', 'hai, dekimasu.', 'Yes, we can.', 1, 'reply', 0),
    ('nT018', 'じゃあ、それをおねがいします。', 'jaa, sore o onegai shimasu.', "Then I'll have that one, please.", 1, 'request', 1),
    ('nT019', 'このべんとうをおねがいします。', 'kono bentou o onegai shimasu.', 'This bento, please.', 1, 'request', 1),
    ('nT020', 'あたためますか。', 'atatamemasu ka.', 'Shall I heat it up?', 2, 'question', 0),
    ('nT021', 'ポイントカードはおもちですか。', 'pointo kaado wa omochi desu ka.', 'Do you have a point card?', 3, 'question', 0),
    ('nT022', 'いいえ、もっていません。', 'iie, motte imasen.', "No, I don't have one.", 2, 'negation', 1),
    ('nT023', 'はい、ひとつください。', 'hai, hitotsu kudasai.', 'Yes, one please.', 1, 'request', 1),
    ('nT024', 'ふくろはごりようですか。', 'fukuro wa goriyou desu ka.', 'Will you be using a bag?', 3, 'question', 0),
    ('nT025', 'スイカでおねがいします。', 'suika de onegai shimasu.', 'By Suica, please.', 1, 'request', 1),
    ('nT026', 'どちらからですか。', 'dochira kara desu ka.', 'Where are you from?', 1, 'question', 0),
    ('nT027', 'にほんははじめてですか。', 'nihon wa hajimete desu ka.', 'Is this your first time in Japan?', 1, 'question', 0),
    ('nT028', 'はい、はじめてです。', 'hai, hajimete desu.', "Yes, it's my first time.", 1, 'reply', 1),
    ('nT029', 'にほんはどうですか。', 'nihon wa dou desu ka.', 'How do you like Japan?', 1, 'question', 0),
    ('nT030', 'とてもきれいです。たのしいです。', 'totemo kirei desu. tanoshii desu.',
     "It's very beautiful. I'm enjoying it.", 2, 'adjective', 1),
    ('nT031', 'にほんごがじょうずですね。', 'nihongo ga jouzu desu ne.', 'Your Japanese is very good.', 2, 'adjective', 0),
    ('nT032', 'いいえ、まだまだです。', 'iie, mada mada desu.', 'No, I still have a lot to learn.', 2, 'reply', 1),
]
T, Y = 'them', 'you'
SCENES_NEW = [
    dict(id='sc13', title='Suica and the ticket gate',
         en='The gate will not open, the card needs topping up, and then a change of trains. Station staff at the window by the gates.',
         lines=[(Y, 'nA119'), (T, 'nT001'), (Y, 'nT002'), (T, 'nT003'), (Y, 'nS001'), (T, 'nT004'),
                (Y, 'nP004'), (T, 'nT005'), (Y, 'nA029'), (T, 'nB088'), (Y, 'nS010')]),
    dict(id='sc14', title='Lost bag at the police box',
         en='A bag left on a train, reported at a police box or the station office. Keep your hotel address to hand.',
         lines=[(Y, 'nA092'), (T, 'nT006'), (Y, 'nT007'), (T, 'nT008'), (Y, 'nT009'), (T, 'nT010'),
                (Y, 'nT011'), (T, 'nB018'), (T, 'nT012'), (Y, 'nA123')]),
    dict(id='sc15', title='Ordering with dietary needs',
         en='No pork, no alcohol and no mirin, asked politely before the food is made. Mirin is sweet rice wine used in many sauces.',
         lines=[(T, 'nB073'), (Y, 'nA126'), (Y, 'nP003'), (T, 'nT013'), (Y, 'nA067'), (T, 'nT014'),
                (Y, 'nP002'), (T, 'nT015'), (Y, 'nT016'), (T, 'nT017'), (Y, 'nT018')]),
    dict(id='sc16', title='Convenience store lunch',
         en='A bento at the register: heating it, the point card, chopsticks, a bag, and paying by Suica. The staff questions come fast and in this order.',
         lines=[(Y, 'nT019'), (T, 'nT020'), (Y, 'nS021'), (T, 'nT021'), (Y, 'nT022'), (T, 'nB069'),
                (Y, 'nT023'), (T, 'nT024'), (Y, 'nA124'), (T, 'nB030'), (Y, 'nT025')]),
    dict(id='sc17', title='Small talk',
         en='A friendly stranger, a taxi driver or hotel staff asking where you are from. Short answers are fine.',
         lines=[(T, 'nT026'), (Y, 'nP005'), (T, 'nT027'), (Y, 'nT028'), (T, 'nS004'), (Y, 'nS005'),
                (T, 'nT029'), (Y, 'nT030'), (T, 'nT031'), (Y, 'nT032')]),
]
# the existing convenience store scene gets the three real staff questions
SC05 = [(T, 'nB001'), (Y, 'nS033'), (T, 'nT020'), (Y, 'nS021'), (T, 'nT021'), (Y, 'nT022'),
        (T, 'nT024'), (Y, 'nA124'), (T, 'nB023'), (Y, 'nS029'), (T, 'nB006')]

# H. particle minimal pairs. Most already exist as the nC series; these fill in
# travel pairs for de/ni, kara/made, ka/ne, de/ga, ga/mo, e/made, o/ga, wa/ga.
NEW_PAIR_SENT = [
    ('nQ001', 'ここにとめてください。', 'koko ni tomete kudasai.', 'Please park it here.', 2, 'request'),
    ('nQ002', 'くうこうからバスがありますか。', 'kuukou kara basu ga arimasu ka.', 'Is there a bus from the airport?', 2, 'question'),
    ('nQ003', 'くうこうまでバスがありますか。', 'kuukou made basu ga arimasu ka.', 'Is there a bus to the airport?', 2, 'question'),
    ('nQ004', 'とおいですね。', 'tooi desu ne.', "It's far, isn't it?", 1, 'adjective'),
    ('nQ005', 'げんきんでいいですか。', 'genkin de ii desu ka.', 'Is cash all right?', 2, 'question'),
    ('nQ006', 'げんきんがいいですか。', 'genkin ga ii desu ka.', 'Would you prefer cash?', 2, 'question'),
    ('nQ007', 'おちゃがあります。', 'ocha ga arimasu.', 'There is tea.', 1, 'existence'),
    ('nQ008', 'おちゃもあります。', 'ocha mo arimasu.', 'There is tea as well.', 1, 'existence'),
    ('nQ009', 'えきまでいきます。', 'eki made ikimasu.', "I'll go as far as the station.", 1, 'plain'),
    ('nQ010', 'だれをよびましたか。', 'dare o yobimashita ka.', 'Who did you call?', 2, 'question'),
    ('nQ011', 'だれがよびましたか。', 'dare ga yobimashita ka.', 'Who was it that called?', 2, 'question'),
    ('nQ012', 'これはたかいです。', 'kore wa takai desu.', 'This is expensive.', 1, 'adjective'),
    ('nQ013', 'これがたかいです。', 'kore ga takai desu.', 'This one is the expensive one.', 1, 'adjective'),
]
P = dict(wa='c0234', ga='c0235', o='c0236', ni='c0237', de='c0238', e='c0239', to='c0240',
         mo='c0241', no='c0242', kara='c0243', made='c0244', ka='c0245', ne='c0246', yo='c0247', ya='c0598')
PAIRS = [
    (('wa', 'ga'), 'nC001', 'nC002'), (('wa', 'ga'), 'nC003', 'nC004'), (('wa', 'mo'), 'nC005', 'nC006'),
    (('o', 'mo'), 'nC007', 'nC008'), (('o', 'ga'), 'nC009', 'nC010'), (('o', 'ga'), 'nC011', 'nC012'),
    (('ni', 'de'), 'nC013', 'nC014'), (('ni', 'de'), 'nC015', 'nC016'), (('ni', 'to'), 'nC017', 'nC018'),
    (('to', 'ga'), 'nC019', 'nC020'), (('kara', 'made'), 'nC021', 'nC022'), (('kara', 'made'), 'nC023', 'nC024'),
    (('kara', 'made'), 'nC025', 'nC026'), (('to', 'ya'), 'nC027', 'nC028'), (('to', 'ya'), 'nC029', 'nC030'),
    (('ne', 'yo'), 'nC031', 'nC032'), (('ne', 'yo'), 'nC033', 'nC034'), (('no', 'to'), 'nC035', 'nC036'),
    (('ni', 'e'), 'nC039', 'nC040'), (('o', 'wa'), 'nC041', 'nC042'), (('ga', 'mo'), 'nC043', 'nC044'),
    (('to', 'ka'), 'nC045', 'nC046'),
    (('de', 'ni'), 'nA035', 'nQ001'), (('kara', 'made'), 'nQ002', 'nQ003'), (('ka', 'ne'), 'nS019', 'nQ004'),
    (('de', 'ga'), 'nQ005', 'nQ006'), (('ga', 'mo'), 'nQ007', 'nQ008'), (('e', 'made'), 'nC040', 'nQ009'),
    (('o', 'ga'), 'nQ010', 'nQ011'), (('wa', 'ga'), 'nQ012', 'nQ013'),
]


def new_sentence(sid, kana, romaji, en, level, grammar, say=False):
    assert K.check_sentence(kana, romaji)[0] == 'OK', (sid, kana, romaji)
    x = {'id': sid, 'kana': kana, 'romaji': romaji, 'en': en, 'level': level, 'grammar': grammar, 'w': []}
    if say: x['say'] = 1
    return x


SURU_TAIL = r'(shi|su|de|sa)'


def main():
    deck = cdata.deck(); D = {c['id']: c for c in deck}
    sent = cdata.sents(); S = {x['id']: x for x in sent}
    ex = cdata.examples(); anc = cdata.anchors(); scenes = cdata.scenes()

    # ---- M. romaji house rules -------------------------------------------
    suru_pre = []
    for c in deck:
        if c['pos'] == 'verb' and c['kana'].endswith('する') and c['kana'] != 'する':
            r = c['romaji']
            if not r.endswith(' suru') and r.endswith('suru'):
                c['romaji'] = r[:-4] + ' suru'
            suru_pre.append(c['romaji'][:-5])
    suru_rx = re.compile(r'\b(' + '|'.join(sorted(map(re.escape, suru_pre), key=len, reverse=True)) + r')' + SURU_TAIL)
    def fix_r(kana, r):
        r2 = RR.spacing_fix(r)
        r2 = suru_rx.sub(r'\1 \2', r2)
        r2 = RR.apostrophe_fix(kana, r2)
        return r2
    for c in deck:
        c['romaji'] = RR.apostrophe_fix(c['kana'], RR.spacing_fix(c['romaji']))
    for x in sent:
        x['romaji'] = fix_r(x['kana'], x['romaji'])
    for k, v in ex.items():
        if isinstance(v, list):
            v[1] = fix_r(v[0], v[1])
    for a in anc:
        a['romaji'] = fix_r(a['kana'], a['romaji'])
        a['baseRomaji'] = [c['romaji'] for c in deck if c['id'] == a['w'][0]][0]

    # ---- F ---------------------------------------------------------------
    for sid, ch in SENT_FIX.items(): S[sid].update(ch)
    for cid, ch in DECK_FIX.items(): D[cid].update(ch)
    for cid, v in EXAMPLE_FIX.items(): ex[cid] = v
    for cid, en in EXAMPLE_EN.items(): ex[cid][2] = en
    # ---- G, D ------------------------------------------------------------
    for cid in REC: D[cid]['rec'] = 1
    for cid, v in NEEDS.items(): D[cid]['needs'] = v

    # ---- I, J, H: new sentences, appended ---------------------------------
    for sid, k, r, en, lv, gr in NEW_PACK:
        if sid not in S:
            x = new_sentence(sid, k, r, en, lv, gr, True); sent.append(x); S[sid] = x
    for sid, k, r, en, lv, gr, say in NEW_SCENE:
        if sid not in S:
            x = new_sentence(sid, k, r, en, lv, gr, bool(say)); sent.append(x); S[sid] = x
    for sid, k, r, en, lv, gr in NEW_PAIR_SENT:
        if sid not in S:
            x = new_sentence(sid, k, r, en, lv, gr); sent.append(x); S[sid] = x
    for n, sid in enumerate(PACK, 1):
        S[sid]['pk'] = n
        S[sid]['say'] = 1

    have = {s['id'] for s in scenes}
    for sc in SCENES_NEW:
        if sc['id'] in have: continue
        scenes.append({'id': sc['id'], 'title': sc['title'], 'en': sc['en'],
                       'lines': [{'sid': sid, 'who': who} for who, sid in sc['lines']]})
    for sc in scenes:
        if sc['id'] == 'sc05':
            sc['lines'] = [{'sid': sid, 'who': who} for who, sid in SC05]

    pairs = []
    for n, (pp, a, b) in enumerate(PAIRS, 1):
        pairs.append({'id': 'pp%03d' % n, 'p': [P[pp[0]], P[pp[1]]], 's': [a, b]})

    cdata.save(deck, 'deck', 'deck_full.json')
    cdata.save(sent, 'sentences', 'sent_full.json')
    cdata.save(ex, 'deck', 'examples.json')
    cdata.save(anc, 'conj', 'anchors.json')
    cdata.save(scenes, 'scenes', 'scenes.json')
    cdata.save(pairs, 'deck', 'pairs.json')
    print('sentences', len(sent), 'scenes', len(scenes), 'pairs', len(pairs))

if __name__ == '__main__':
    main()
