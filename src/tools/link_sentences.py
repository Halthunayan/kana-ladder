# -*- coding: utf-8 -*-
"""Word links (w) and cloze gaps (g) for every sentence, revised 28 Sep 2026.

The earlier linker (kept in the session workspace as /home/claude/tools/
link_sentences.py) aligned kana to romaji and matched deck cards by their
romaji tokens and the forms table. It is the base of this one, with the
failures the council found fixed:

  * a verb is recognised in every form a beginner meets, not only the seven in
    the forms table: -mashou, -masen ka, -tai, -takunai, -nai, -nakereba,
    -naide, -nakatta, -te mo, the plain past, -tara, -ba and the potential
    (council item 5, 141 sentences had an unlinked verb);
  * a number fused with its counter (gohyaku, shichinin, nibansen, juubyou) and
    an honorific o- noun (onamae, omizu, ohashi) link the words inside them;
  * a card only matches where the sentence's kana at that spot IS the card's
    kana, so e (the picture, え) no longer matches e (the particle, へ), and wa
    (the particle) never matches ha (tooth), which the romaji writes as ha;
  * where two cards match the same span, the sentence's own English decides:
    sumimasen (excuse me) is not sumu (to live), ima is "now" unless the
    English says living room, kaze is a cold when the English says cold, ni is
    the particle unless the English says two. A phrase card matched exactly
    beats a verb matched through inflection. Only a tie with no evidence keeps
    both, and the build refuses same-romaji twins unless both really occur;
  * a sentence that uses a grammar pattern links the pattern's card (masen ka,
    mashou, tai desu, ga arimasu, ga imasu, te mo ii desu ka, nakereba
    narimasen and nakute wa ikemasen, koto ga dekimasu, and since 9 Oct 2026
    te wa ikemasen and nai to ikemasen), and the pattern swallows the words spelled
    inside it (te mo ii desu ka credits c0601, not mo, ii or desu).

A sentence whose link set comes out unchanged keeps its stored w and g exactly.
A changed sentence keeps the order of the words it still has and gets its gaps
recomputed. Run with --dry to print the changes without writing.
"""
import json, os, re, sys, collections
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import cdata, kana as K
from spoken import spoken_en

PUNCT = "、。？！,.!?\"　 "

# Inflected forms that collide with a far rarer verb (see the earlier linker):
# ikimasu is iku here, never ikiru; orimasu is oriru, never oru; kaimasu is kau,
# never katsu.
NO_FORM_MATCH = {'c0964', 'c1094', 'c1332'}

# A fused token and the deck cards inside it, for fusions no rule can split
# safely. Numbers and counters are split by rule (see split_number).
TOKEN_LINKS = {
    'nan': ['c0230'],             # nan is nani (what) before d, t and n
    'okyakusama': ['c0715', 'c1823'],
    'gozaimasen': ['c1784'],
    # 9 Oct 2026: fusions the rules cannot split. An honorific o- on a counter
    # (ofutari, ohitori), a number fused with do (degrees), the joined
    # spelling of kamo shiremasen, and tennai said as tennai desu ka.
    'ofutari': ['c0045'],
    'ohitori': ['c0044'],
    'sanjuudo': ['c0354', 'c1425'],
    'kamoshiremasen': ['c1389'],
    'tennai': ['c0999'],
}
# Two-token phrases that are a deck card written another way.
PHRASE_LINKS = {
    ('kamo', 'shiremasen'): 'c1389',
    ('kamo', 'shirenai'): 'c1389',
}
# Per-sentence corrections where the English cannot decide: 'drop' removes a
# card the matcher finds, 'add' links one it cannot.
OVERRIDE = {
    # Suica, the transit card, is spelled like suika (watermelon)
    'nP004': {'drop': ['c0746']}, 'nT003': {'drop': ['c0746']}, 'nT025': {'drop': ['c0746']},
    # yoku nai is ii (good) in the negative, not yoku (often)
    'nE108': {'drop': ['c0058'], 'add': ['c0193']},
    # ni the particle; "number" in the English is a phone number or a count,
    # not ni (two)
    'nE059': {'drop': ['c0035'], 'add': ['c0237']}, 'nT010': {'drop': ['c0035'], 'add': ['c0237']},
    # matanakute wa ikemasen ka asks whether he must; it is not an invitation
    'nD090': {'drop': ['c0252']},
    # tetsudatte kuremasen ka is a request, not an invitation
    'nA095': {'drop': ['c0252']},
}
# Pattern cards that swallow a word spelled inside them, for patterns matched
# as ordinary cards (koto ni suru) rather than by a pattern test, listed
# here.
SWALLOW = {
    'c1726': {'c1822'}, 'c1727': {'c1822'},       # koto ni suru / koto ni naru: koto
    'c0307': {'c1834'},                            # jaa ne: jaa
}

# grammar pattern cards: (id, test on the token list)
def _pat_masen_ka(t):
    return any(t[i].endswith('masen') and t[i+1] == 'ka' for i in range(len(t)-1))
def _pat_mashou(t):
    return any(x.endswith('mashou') and len(x) > 6 for x in t)
def _pat_tai(t, stems, cards=()):
    return any(t[i].endswith('tai') and len(t[i]) > 4 and t[i][:-3] in stems and t[i] not in cards
               and t[i+1] == 'desu' for i in range(len(t)-1))
def _pat_ga_arimasu(t):
    return any(t[i] == 'ga' and t[i+1] in ('arimasu', 'arimasen', 'arimashita') for i in range(len(t)-1))
def _pat_ga_imasu(t):
    return any(t[i] == 'ga' and t[i+1] in ('imasu', 'imasen', 'imashita') for i in range(len(t)-1))
def _pat_temo(t):
    for i in range(len(t)-2):
        if (t[i].endswith(('te', 'de')) and t[i+1] == 'mo' and t[i+2] in ('ii', 'yoroshii')):
            return True
        if t[i].endswith(('temo', 'demo')) and t[i+1] in ('ii', 'yoroshii'):
            return True
    return False
def _pat_nakereba(t):
    return any(t[i].endswith('nakereba') and t[i+1] in ('narimasen', 'ikemasen') for i in range(len(t)-1))
def _pat_tewa(t, te_forms=None):
    # te wa ikemasen, must not (totte wa ikemasen); nakute wa ikemasen is "must".
    # The word before wa has to be a verb's te-form: asatte wa ikemasen (I
    # cannot go the day after tomorrow) is iku, not the pattern.
    return any(len(t[i]) > 2 and t[i].endswith(('te', 'de')) and not t[i].endswith('nakute')
               and (te_forms is None or t[i] in te_forms)
               and t[i+1] == 'wa' and t[i+2] in ('ikemasen', 'ikenai', 'narimasen') for i in range(len(t)-2))
def _pat_nakutewa(t):
    return any(t[i].endswith('nakute') and t[i+1] == 'wa' and t[i+2] in ('ikemasen', 'narimasen')
               for i in range(len(t)-2))
def _pat_naito(t, nai_forms=None):
    # kakanai to ikemasen: have to (naito). The word before to has to be a
    # verb's -nai form: kanai to ikemasen is "I cannot go with my wife".
    return any(t[i].endswith('nai') and len(t[i]) > 3 and (nai_forms is None or t[i] in nai_forms)
               and t[i+1] == 'to' and t[i+2] in ('ikemasen', 'ikenai')
               for i in range(len(t)-2))
def _pat_koto(t):
    return any(t[i] == 'koto' and t[i+1] == 'ga' and t[i+2].startswith('deki') for i in range(len(t)-2))
# what each pattern swallows when it is linked: the words spelled inside it
PATTERN_INNER = {
    'c0254': {'c0249'},                            # tai desu: desu
    'c0255': {'c0177'},                            # ga arimasu: aru
    'c0256': {'c0176'},                            # ga imasu: iru
    'c0601': {'c0241', 'c0193', 'c0330', 'c0249', 'c0245', 'c1781'},   # te mo ii desu ka
    'c0602': {'c0580'},                            # nakereba narimasen: naru
    'c0603': {'c0581', 'c1822'},                   # koto ga dekimasu: dekiru, koto
    'c1835': set(),                                # te wa ikemasen
    'c1383': {'c0240'},                            # nai to ikemasen: to
    'c0252': set(), 'c0253': set(),
}

# Extra evidence for homophones whose glosses alone rarely appear in a
# sentence's English: the words a sentence about each sense tends to use.
HINTS = {k: set(v.split()) for k, v in {
    'c0167': 'summer weather today day outside sun sunny humid',          # atsui, hot weather
    'c0478': 'soup tea coffee bath water food drink ramen touch careful dish noodle burn',  # atsui, hot to touch
    'c0472': 'chopstick eat fork',                                         # hashi, chopsticks
    'c0807': 'bridge river cross',                                         # hashi, bridge
    'c0061': 'now moment currently right just',                            # ima, now
    'c0923': 'living room sofa',                                           # ima, living room
    'c0538': 'wind windy blow breeze strong',                              # kaze, wind
    'c0729': 'cold catch flu medicine sick fever',                         # kaze, a cold
    'c0181': 'home back return',                                           # kaeru, go home
    'c0984': 'change switch',                                              # kaeru, change
    'c0176': 'stay wait someone anyone',                                   # iru, to be
    'c0858': 'need necessary require',                                     # iru, to need
    'c0499': 'wear sweater coat kimono shirt jacket dress',                # kiru, to wear
    'c0920': 'cut hair nail knife slice scissors',                         # kiru, to cut
}.items()}

STOP = set('to a an the of or and be is am are it its in at on for with by as s something someone '
           'oneself one\'s thing things do does please i me my you your we us he she they this that '
           'there here not no yes get very'.split())
IRREG = {'went': 'go', 'gone': 'go', 'came': 'come', 'ate': 'eat', 'eaten': 'eat', 'bought': 'buy',
         'saw': 'see', 'seen': 'see', 'took': 'take', 'taken': 'take', 'wore': 'wear', 'worn': 'wear',
         'gave': 'give', 'given': 'give', 'got': 'get', 'said': 'say', 'told': 'tell', 'thought': 'think',
         'drank': 'drink', 'drunk': 'drink', 'wrote': 'write', 'written': 'write', 'slept': 'sleep',
         'left': 'leave', 'met': 'meet', 'ran': 'run', 'swam': 'swim', 'sat': 'sit', 'stood': 'stand',
         'found': 'find', 'lost': 'lose', 'spoke': 'speak', 'spoken': 'speak', 'taught': 'teach',
         'heard': 'hear', 'knew': 'know', 'known': 'know', 'forgot': 'forget', 'forgotten': 'forget',
         'began': 'begin', 'begun': 'begin', 'became': 'become', 'broke': 'break', 'broken': 'break',
         'caught': 'catch', 'fell': 'fall', 'fallen': 'fall', 'flew': 'fly', 'sold': 'sell', 'sent': 'send',
         'spent': 'spend', 'woke': 'wake', 'paid': 'pay', 'made': 'make', 'did': 'do', 'done': 'do',
         'children': 'child', 'teeth': 'tooth', 'feet': 'foot', 'men': 'man', 'women': 'woman',
         'lived': 'live', 'living': 'live', 'lives': 'live', 'colds': 'cold', 'caught': 'catch',
         'called': 'call', 'calling': 'call', 'died': 'die', 'dying': 'die', 'rode': 'ride', 'ridden': 'ride',
         'put': 'put', 'cut': 'cut', 'read': 'read', 'hurt': 'hurt', 'let': 'let', 'shut': 'shut'}

def lemma(w):
    w = w.lower().strip("'")
    if w in IRREG: return IRREG[w]
    for suf in ('ing', 'ed', 'es', 's'):
        if w.endswith(suf) and len(w) - len(suf) >= 3:
            b = w[:-len(suf)]
            if suf == 'ing' and len(b) > 3 and b[-1] == b[-2]: b = b[:-1]
            return b
    return w

def keywords(text):
    t = (text or '').lower().replace("n't", ' not').replace("'s", ' ').replace("'m", ' ').replace("'re", ' ')
    t = t.replace("'ll", ' ').replace("'ve", ' ').replace("'d", ' ')
    t = re.sub(r"[^a-z0-9' ]", ' ', t)
    return {lemma(w) for w in t.split() if w and w not in STOP and lemma(w) not in STOP}


def toks(r):
    r = r.lower().replace("'", '')
    for ch in PUNCT: r = r.replace(ch, ' ')
    return [t for t in r.split(' ') if t]


def morae(kana):
    out = []; i = 0
    while i < len(kana):
        if kana[i] in PUNCT: i += 1; continue
        if not out and (kana[i] == 'ー' or K.kata2hira(kana[i]) == 'っ'):
            i += 1; continue
        h2 = K.kata2hira(kana[i:i+2])
        if len(h2) == 2 and h2 in K.DIG: out.append((i, 2, K.DIG[h2])); i += 2; continue
        ch = kana[i]; h = K.kata2hira(ch)
        if ch == 'ー': out.append((i, 1, out[-1][2][-1] if out else 'u')); i += 1; continue
        if h == 'っ': out.append((i, 1, '')); i += 1; continue
        if h in K.MONO: out.append((i, 1, K.MONO[h])); i += 1; continue
        out.append((i, 1, '')); i += 1
    return out

ALT = {"wa": "ha", "ha": "wa", "e": "he", "he": "e", "o": "wo", "wo": "o"}

def align(kana, romaji):
    r = romaji.lower().replace("'", '')
    for ch in PUNCT: r = r.replace(ch, "")
    pos = []; ri = 0
    for (ki, klen, rm) in morae(kana):
        if rm == "":
            if ri < len(r): pos.append(ki); ri += 1
            continue
        cand = [rm] + ([ALT[rm]] if rm in ALT else [])
        hit = None
        for c in cand:
            if r.startswith(c, ri): hit = c; break
        if hit is None:
            if ri < len(r) and r[ri] == rm[0]: hit = rm[0]
            else: return None
        for _ in hit: pos.append(ki)
        ri += len(hit)
    if ri != len(r): return None
    return pos


def token_spans(romaji):
    out = []; off = 0
    for t in toks(romaji):
        out.append((t, off)); off += len(t)
    return out


# ---------------------------------------------------------------------------
# every surface a card is recognised by
GODAN_A = {'u': 'wa', 'ku': 'ka', 'gu': 'ga', 'su': 'sa', 'tsu': 'ta', 'nu': 'na', 'bu': 'ba', 'mu': 'ma', 'ru': 'ra'}
GODAN_E = {'u': 'e', 'ku': 'ke', 'gu': 'ge', 'su': 'se', 'tsu': 'te', 'nu': 'ne', 'bu': 'be', 'mu': 'me', 'ru': 're'}

def verb_class(card, row):
    kana = card['kana']
    trip = {row[i]: (row[i+1], row[i+2]) for i in range(0, len(row), 3)}
    mk = trip['masu'][0]
    if kana.endswith('する'): return 'suru'
    if kana == 'くる' or kana.endswith('てくる'): return 'kuru'
    if kana.endswith('る') and mk == kana[:-1] + 'ます': return 'ichidan'
    return 'godan'

def verb_surfaces(card, row):
    """{token tuple: form name} for a verb, generated from its own forms row"""
    trip = {row[i]: (row[i+1], row[i+2]) for i in range(0, len(row), 3)}
    rom = card['romaji']
    cls = verb_class(card, row)
    masu = trip['masu'][1]
    pre = ''
    if ' ' in masu:                       # a spaced suru compound: benkyou shimasu
        pre, masu = masu.rsplit(' ', 1)
        pre += ' '
    stem = masu[:-4]
    te = None
    if 'tekudasai' in trip: te = trip['tekudasai'][1][:-len(' kudasai')].split(' ')[-1]
    elif 'te' in trip: te = trip['te'][1].split(' ')[-1]
    base = rom.split(' ')[-1]
    if cls == 'suru': a, cond, dict_ = 'shi', 'sureba', 'suru'
    elif cls == 'kuru': a, cond, dict_ = base[:-4] + 'ko', base[:-4] + 'kureba', base
    elif cls == 'ichidan': a, cond, dict_ = base[:-2], base[:-2] + 'reba', base
    else:
        last = next(s for s in ('tsu', 'ku', 'gu', 'su', 'nu', 'bu', 'mu', 'ru', 'u') if base.endswith(s))
        a = base[:-len(last)] + GODAN_A[last]
        cond = base[:-len(last)] + GODAN_E[last] + 'ba'
        dict_ = base
    if te is None:
        if cls == 'suru': te = 'shite'
        elif cls == 'kuru': te = base[:-4] + 'kite'
        elif cls == 'ichidan': te = base[:-2] + 'te'
        else:
            last = next(s_ for s_ in ('tsu', 'ku', 'gu', 'su', 'nu', 'bu', 'mu', 'ru', 'u') if base.endswith(s_))
            TE = {'u': 'tte', 'tsu': 'tte', 'ru': 'tte', 'mu': 'nde', 'bu': 'nde', 'nu': 'nde',
                  'ku': 'ite', 'gu': 'ide', 'su': 'shite'}
            te = base[:-len(last)] + ('tte' if base == 'iku' else TE[last])
    past = te[:-1] + 'a' if te else None
    s = {}
    def add(surf, name):
        if not surf: return
        t = tuple((pre + surf).split(' '))
        s.setdefault(t, name)
    for name, (k, r) in trip.items():
        if card['kana'] == 'する' and name == 'potential': continue
        # the request form is the te-form plus kudasai, a word of its own
        if name == 'tekudasai': r = r[:-len(' kudasai')]; name = 'te'
        s.setdefault(tuple(r.split(' ')), name)
    for suf in ('masu', 'mashita', 'masen', 'mashou', 'tai', 'takunai', 'takatta', 'nagara', 'tagatte'):
        add(stem + suf, suf)
    add(stem + 'masen deshita', 'masendeshita')
    for suf in ('nai', 'nakatta', 'nakereba', 'naide', 'nakute', 'naku'):
        add(a + suf, 'neg-' + suf)
    if te:
        add(te, 'te'); add(te + 'mo', 'temo')
    if past:
        add(past, 'past'); add(past + 'ra', 'tara')
    add(cond, 'ba')
    if 'potential' in trip and card['kana'] != 'する':
        pr = trip['potential'][1].split(' ')[-1]
        ps = pr[:-4]
        for suf in ('masu', 'masen', 'mashita', 'ru', 'nai'):
            add(ps + suf, 'pot-' + suf)
    return s

# an adjective form that is another word: kokunai is domestic, not "not strong"
ADJ_SKIP = {'c1829': {'kokunai', 'kokunakatta'}}

def adj_surfaces(card):
    r = card['romaji']
    s = {}
    if card['pos'] == 'adj-i' and r.endswith('i') and (len(r) > 2 or r == 'ii') and card['id'] != 'c1775':
        st = 'yo' if r == 'ii' else r[:-1]
        for suf in ('ku', 'katta', 'kute', 'kereba', 'kunai', 'kunakatta', 'sou'):
            if st + suf not in ADJ_SKIP.get(card['id'], ()): s[(st + suf,)] = 'adj-' + suf
    return s


# numbers and counters, with their sound changes, for fused tokens
def number_pieces(deck):
    # a number or counter card only: ni the number, never ni the particle
    by = {}
    for c in deck:
        if not c.get('dup') and c['pos'] in ('num', 'counter'): by.setdefault(c['romaji'], c['id'])
    P = []
    NUM = {'ichi': ['ichi', 'ip', 'ik', 'is', 'it'], 'ni': ['ni'], 'san': ['san', 'sam'],
           'yon': ['yon', 'yo'], 'go': ['go'], 'roku': ['roku', 'rop', 'rok'],
           'nana': ['nana'], 'shichi': ['shichi'], 'hachi': ['hachi', 'hap', 'has', 'hat'],
           'kyuu': ['kyuu', 'ku'], 'juu': ['juu', 'jup', 'jus', 'jut', 'jip'],
           'hyaku': ['hyaku', 'byaku', 'pyaku'], 'sen': ['sen', 'zen'], 'man': ['man'], 'nan': ['nan']}
    for rom, vs in NUM.items():
        cid = by.get(rom) if rom != 'nan' else next((c['id'] for c in deck if c['romaji'] == 'nani'), None)
        for v in vs: P.append((v, cid, 'num'))
    COUNTERS = {'ji': 'ji', 'fun': 'fun', 'pun': 'fun', 'en': 'en', 'nin': 'nin', 'mai': 'mai',
                'mei': 'mei', 'sai': 'sai', 'byou': 'byou', 'bansen': 'bansen', 'gatsu': 'gatsu',
                'youbi': 'youbi', 'hai': 'hai', 'pai': 'hai', 'bai': 'hai', 'hon': None, 'pon': None,
                'bon': None, 'ko': 'ko', 'dai': 'dai', 'satsu': 'satsu', 'hiki': None, 'piki': None,
                'biki': None, 'kai': 'kai', 'ban': None, 'nichi': 'nichi', 'ka': None, 'jikan': None,
                'kagetsu': None, 'shuukan': None, 'kagetsu': None, 'mairu': None}
    for surf, rom in COUNTERS.items():
        P.append((surf, by.get(rom) if rom else None, 'ctr'))
    return P

def split_number(tok, pieces):
    """ids of the number and counter cards fused in tok, or None"""
    best = None
    def go(i, acc, nums):
        nonlocal best
        if i == len(tok):
            if nums and len(acc) >= 2 and (best is None or len(acc) < len(best)): best = list(acc)
            return
        for surf, cid, kind in pieces:
            if tok.startswith(surf, i):
                go(i + len(surf), acc + [(surf, cid, kind)], nums + (kind == 'num'))
    go(0, [], 0)
    if not best: return None
    kinds = [k for _, _, k in best]
    if 'num' not in kinds: return None
    # the counter comes last, and numbers only come before it
    if kinds.count('ctr') > 1 or (kinds.count('ctr') == 1 and kinds[-1] != 'ctr'): return None
    return [cid for _, cid, _ in best if cid]


def ikemasen_not_iku(st, i):
    return (st[i] in ('ikemasen', 'ikenai') and i > 0 and
            (st[i-1] in ('wa', 'to') or st[i-1].endswith(('nakereba', 'nakute'))))

# Where two cards share a sound and a sentence gives no evidence either way,
# the everyday sense is the one linked.
DEFAULT_SENSE = {'iru': 'c0176', 'kaeru': 'c0181', 'atsui': 'c0167', 'hashi': 'c0472',
                 'kiru': 'c0499', 'ima': 'c0061', 'kaze': 'c0729', 'hana': 'c0543',
                 'kami': 'c0503', 'shita': 'c0158', 'ni': 'c0237', 'hai': 'c0013'}

# the tokens a pattern card stands for once it is linked
PATTERN_COVERS = {
    'c0255': {'arimasu', 'arimasen', 'arimashita'},
    'c0256': {'imasu', 'imasen', 'imashita'},
    'c0601': {'ii', 'yoroshii', 'mo', 'desu', 'ka'},
    'c0602': {'narimasen', 'ikemasen'},
    'c0603': {'koto', 'dekimasu', 'dekimasen', 'dekimashita'},
    'c1835': {'ikemasen', 'ikenai', 'narimasen'},
    'c1383': {'to', 'ikemasen', 'ikenai'},
}


# ---------------------------------------------------------------------------
class Linker:
    def __init__(self):
        self.deck = cdata.deck()
        self.forms = cdata.forms()
        self.D = {c['id']: c for c in self.deck}
        rank = {c['id']: r for r, c in enumerate(sorted(self.deck, key=lambda c: (c['ord'], c['id'])))}
        self.rank = lambda cid: rank.get(cid, 1 << 30)
        seen = collections.defaultdict(list)
        for c in self.deck:
            if not c.get('dup'): seen[K.kata2hira(c['kana'])].append(c['id'])
        self.AMBIG = {i for v in seen.values() if len(v) > 1 for i in v}
        self.cands = {}           # id -> list of (token tuple, via, kana or None)
        self.stems = set()
        vs = {c['id']: verb_surfaces(c, self.forms[c['id']]) for c in self.deck
              if c['pos'] == 'verb' and self.forms.get(c['id']) and not c.get('dup')}
        common = set()
        for cid, sf in vs.items():
            if cid not in NO_FORM_MATCH: common |= set(sf)
        for c in self.deck:
            if c.get('dup'): continue
            L = [(tuple(toks(c['romaji'])), 'dict', c['kana'])]
            row = self.forms.get(c['id'])
            if c['id'] in vs:
                for t, name in vs[c['id']].items():
                    # a rare verb only keeps the forms no common verb shares
                    if c['id'] in NO_FORM_MATCH and t in common: continue
                    L.append((t, 'form', None))
            if c['pos'] == 'verb' and row and c['id'] not in NO_FORM_MATCH:
                m = {row[i]: row[i+2] for i in range(0, len(row), 3)}['masu']
                self.stems.add(m.split(' ')[-1][:-4])
            if c['pos'] == 'adj-i':
                for t, name in adj_surfaces(c).items():
                    L.append((t, 'form', None))
                row and [L.append((tuple(toks(row[i+2])), 'form', None)) for i in range(0, len(row), 3)]
            if c['pos'] == 'adj-na' and row:
                for i in range(0, len(row), 3): L.append((tuple(toks(row[i+2])), 'form', None))
            self.cands[c['id']] = L
        self.kw = {c['id']: keywords(spoken_en(c['en'])) | HINTS.get(c['id'], set()) for c in self.deck}
        self.pieces = number_pieces(self.deck)
        self.nouns = collections.defaultdict(list)
        for c in self.deck:
            if c['pos'] == 'noun' and ' ' not in c['romaji'] and len(c['romaji']) >= 3 and not c.get('dup'):
                self.nouns[c['romaji']].append(c['id'])
        self.by_romaji = collections.defaultdict(list)
        for c in self.deck:
            if not c.get('dup'): self.by_romaji[c['romaji'].replace("'", '')].append(c['id'])
        # te-forms and -nai forms of every verb, for the patterns built on them,
        # and every form of the verbs of motion, for "mi ni ikimasu"
        self.te_forms, self.nai_forms, self.motion = set(), set(), set()
        for cid, sf in vs.items():
            for t, name in sf.items():
                if len(t) != 1: continue
                if name == 'te': self.te_forms.add(t[0])
                if name == 'neg-nai': self.nai_forms.add(t[0])
                if cid in ('c0180', 'c0179', 'c0181'): self.motion.add(t[0])
        self.suru_nouns = {}
        for c in self.deck:
            if c['pos'] == 'verb' and c['romaji'].endswith(' suru'):
                self.suru_nouns[c['romaji'][:-5].replace("'", '')] = c['id']

    def kana_at(self, x, pos, start):
        if pos is None or start >= len(pos): return None
        return K.kata2hira(x['kana'][pos[start]:])

    def link(self, x):
        st = [t for t, _ in token_spans(x['romaji'])]
        spans = token_spans(x['romaji'])
        pos = align(x['kana'], x['romaji'])
        hk = K.kata2hira(x['kana'])
        ekw = keywords(x['en'])
        hits = {}          # id -> list of (i, n, via)
        first = {}         # id -> hits of the first candidate that hit (old gap rule)
        for cid, L in self.cands.items():
            c = self.D[cid]
            allh = []; fh = None
            for (cand, via, ck) in L:
                if not cand: continue
                n = len(cand); h = []
                for i in range(len(st) - n + 1):
                    if tuple(st[i:i+n]) == cand:
                        if via == 'dict':
                            at = self.kana_at(x, pos, spans[i][1])
                            ckh = K.kata2hira(ck)
                            if at is not None:
                                if not at.startswith(ckh): continue
                            elif ckh not in hk: continue
                        h.append((i, n, via))
                if h:
                    allh += h
                    if fh is None: fh = h
            if allh:
                hits[cid] = allh; first[cid] = fh
        # fused tokens: number + counter, honorific o-, suru nouns, curated
        for i, t in enumerate(st):
            if any(i >= a and i < a + n for v in hits.values() for (a, n, _) in v): continue
            ids = None
            if t in TOKEN_LINKS: ids = TOKEN_LINKS[t]
            else:
                ids = split_number(t, self.pieces)
                if ids is None and t.startswith('o') and t[1:] in self.stems and i + 1 < len(st) and st[i+1] in ('kudasai', 'shimasu', 'desu'):
                    ids = [v for v in self.verb_by_stem(t[1:])]
                if ids is None and t.startswith('o') and t[1:] in self.nouns and t not in self.by_romaji:
                    cs = self.nouns[t[1:]]
                    ids = [max(cs, key=lambda c: (len(self.kw[c] & ekw), -self.rank(c)))]
                # an honorific go- noun (goriyou, gokazoku)
                if ids is None and t.startswith('go') and t[2:] in self.nouns and t not in self.by_romaji:
                    cs = self.nouns[t[2:]]
                    ids = [max(cs, key=lambda c: (len(self.kw[c] & ekw), -self.rank(c)))]
                # a verb stem before ni and a verb of motion: mi ni ikimasu (go to see)
                if (ids is None and t in self.stems and i + 2 < len(st) and st[i+1] == 'ni'
                        and st[i+2] in self.motion):
                    ids = [v for v in self.verb_by_stem(t)]
                if ids is None and t in self.suru_nouns:
                    ids = [self.suru_nouns[t]]
            for cid in ids or []:
                hits.setdefault(cid, []).append((i, 1, 'fused'))
        for (a, b), cid in PHRASE_LINKS.items():
            for i in range(len(st) - 1):
                if st[i] == a and st[i+1] == b: hits.setdefault(cid, []).append((i, 2, 'phrase'))

        # ikemasen after te wa, nai to, nakereba or nakute is "must (not)", not iku
        if 'c0180' in hits:
            hits['c0180'] = [(i, n, v) for (i, n, v) in hits['c0180'] if not ikemasen_not_iku(st, i)]
            if not hits['c0180']: del hits['c0180']

        # resolve cards that claim exactly the same span
        byspan = collections.defaultdict(set)
        for cid, v in hits.items():
            for (i, n, via) in v:
                if via != 'fused': byspan[(i, n)].add(cid)
        drop = set()
        for sp, ids in byspan.items():
            if len(ids) < 2: continue
            ids = set(ids)
            vias = {cid: {via for (i, n, via) in hits[cid] if (i, n) == sp} for cid in ids}
            # a phrase card matched exactly beats a verb matched through inflection
            exact = {cid for cid in ids if 'dict' in vias[cid] and self.D[cid]['pos'] in ('expr', 'interj', 'noun', 'adv', 'pron', 'adj-na', 'adj-i', 'num', 'counter', 'conj')}
            infl = {cid for cid in ids if vias[cid] <= {'form'}}
            if exact and infl:
                keep = exact | (ids - infl)
                drop |= (ids - keep); ids = keep
            if len(ids) < 2: continue
            score = {cid: len(self.kw[cid] & ekw) for cid in ids}
            top = max(score.values())
            winners = {cid for cid in ids if score[cid] == top}
            if top > 0 and len(winners) < len(ids):
                # the same sound twice in one sentence can genuinely be both
                t = tuple(st[sp[0]:sp[0]+sp[1]])
                if sum(1 for j in range(len(st) - len(t) + 1) if tuple(st[j:j+len(t)]) == t) > 1:
                    continue
                drop |= ids - winners
                continue
            parts = {cid for cid in ids if self.D[cid]['pos'] == 'particle'}
            if parts and len(parts) < len(ids):
                drop |= ids - parts
                continue
            roms = {self.D[cid]['romaji'] for cid in ids}
            if len(roms) == 1 and DEFAULT_SENSE.get(roms.pop()) in ids:
                drop |= ids - {DEFAULT_SENSE[self.D[next(iter(ids))]['romaji']]}
                continue
            # two verbs read through inflection and nothing in the English to
            # choose: the one taught first (kimasu is kuru before it is kiru)
            if all(vias[cid] <= {'form'} for cid in ids):
                best = min(ids, key=self.rank)
                drop |= ids - {best}
        for cid in drop:
            # only drop a card from spans where it lost; a card that also
            # matched somewhere else on its own keeps that
            lost = [(i, n) for (i, n), s in byspan.items() if cid in s and len(s) > 1]
            hits[cid] = [(i, n, v) for (i, n, v) in hits[cid] if (i, n) not in lost]
            if not hits[cid]: del hits[cid]

        cover = {cid: frozenset(j for (i, n, _) in v for j in range(i, i + n)) for cid, v in hits.items()}
        w = []
        for cid in sorted(hits, key=lambda c: -len(self.D[c]['romaji'])):
            mine = cover[cid]
            if self.D[cid]['pos'] != 'particle':
                if any(cover[o] > mine and self.rank(o) < self.rank(cid) for o in hits if o != cid):
                    continue
                # bare suru inside a suru compound is the compound
                if cid == 'c0178' and any(cover[o] > mine and self.D[o]['romaji'].endswith(' suru') for o in hits if o != cid):
                    continue
            w.append(cid)

        # grammar patterns
        pats = []
        if _pat_masen_ka(st): pats.append('c0252')
        if _pat_mashou(st): pats.append('c0253')
        if _pat_tai(st, self.stems, self.by_romaji): pats.append('c0254')
        if _pat_ga_arimasu(st): pats.append('c0255')
        if _pat_ga_imasu(st): pats.append('c0256')
        if _pat_temo(st): pats.append('c0601')
        if _pat_nakereba(st): pats.append('c0602')
        if _pat_koto(st): pats.append('c0603')
        if _pat_tewa(st, self.te_forms): pats.append('c1835')
        if _pat_nakutewa(st): pats.append('c0602')
        if _pat_naito(st, self.nai_forms): pats.append('c1383')
        for p in pats:
            inner = set(PATTERN_INNER[p])
            if p == 'c0601':
                # mo, ii, desu and ka are swallowed only when the pattern is
                # their only occurrence
                for cid, tokset in (('c0241', 'mo'), ('c0193', 'ii'), ('c0249', 'desu'), ('c0245', 'ka'),
                                    ('c0330', 'ii'), ('c1781', 'yoroshii')):
                    if st.count(tokset) > 1: inner.discard(cid)
            else:
                # an inner word that also stands on its own elsewhere stays
                for cid in list(inner):
                    if cid == 'c0249' and st.count('desu') > 1: inner.discard(cid)
                    elif cid != 'c0249' and len(hits.get(cid, [])) > 1: inner.discard(cid)
            w = [c for c in w if c not in inner]
            if p not in w: w.append(p)

        for big, inner in SWALLOW.items():
            # a swallowed word that also stands on its own elsewhere stays
            if big in w: w = [c for c in w if c not in inner or len(hits.get(c, [])) > 1]

        for wid in x.get('wx', []):
            c = self.D[wid]
            assert c['kana'] in x['kana'], (x['id'], wid)
            if wid not in w: w.append(wid)
            inner = set()
            for o in self.deck:
                if o['id'] == wid or o['pos'] == 'particle': continue
                faces = [o['kana']]
                orow = self.forms.get(o['id'])
                if orow: faces += [orow[k] for k in range(1, len(orow), 3)]
                if any(f and f in c['kana'] for f in faces): inner.add(o['id'])
            w = [i for i in w if i not in inner]

        ov = OVERRIDE.get(x['id'], {})
        w = [c for c in w if c not in ov.get('drop', [])]
        for c in ov.get('add', []):
            if c not in w: w.append(c)
        if not w:
            w = [c for c in sorted(hits, key=lambda c: self.rank(c))][:1]

        # gaps: the old rule, on the first candidate that hit
        g = {}
        for cid in w:
            h = first.get(cid)
            if not h or pos is None or len(h) != 1: continue
            i, n, via = h[0]
            if via != 'dict': continue
            start = spans[i][1]
            if start >= len(pos): continue
            at = pos[start]
            ck = self.D[cid]['kana']
            if x['kana'][at:at+len(ck)] != ck: continue
            if x['kana'].count(ck) != 1: continue
            if cid in self.AMBIG: continue
            g[cid] = at
        return w, g

    def verb_by_stem(self, stem):
        out = []
        for c in self.deck:
            row = self.forms.get(c['id'])
            if c['pos'] == 'verb' and row and c['id'] not in NO_FORM_MATCH:
                m = {row[i]: row[i+2] for i in range(0, len(row), 3)}['masu']
                if m.split(' ')[-1][:-4] == stem: out.append(c['id'])
        return out[:1]


def relink(sent, lk, only=None):
    changed = []
    for x in sent:
        if only is not None and x['id'] not in only: continue
        w, g = lk.link(x)
        old = x.get('w') or []
        if set(w) == set(old):
            continue
        keep = [c for c in old if c in w] + [c for c in w if c not in old]
        changed.append((x['id'], sorted(set(old) - set(w)), sorted(set(w) - set(old))))
        x['w'] = keep
        # the gap map is recomputed for a sentence whose links changed
        g = {k: v for k, v in g.items() if k in keep}
        if g: x['g'] = g
        elif 'g' in x: del x['g']
        # keep the key order the file already uses: g after w and say
    return changed


def main():
    dry = '--dry' in sys.argv
    sent = cdata.sents()
    lk = Linker()
    ch = relink(sent, lk)
    D = lk.D
    cnt_rm = collections.Counter(); cnt_add = collections.Counter()
    for sid, rm, add in ch:
        for c in rm: cnt_rm[c] += 1
        for c in add: cnt_add[c] += 1
    print('sentences whose links changed:', len(ch))
    print('most removed:', [(c, D[c]['romaji'], n) for c, n in cnt_rm.most_common(25)])
    print('most added:', [(c, D[c]['romaji'], n) for c, n in cnt_add.most_common(40)])
    if '-v' in sys.argv:
        S = {x['id']: x for x in sent}
        for sid, rm, add in ch:
            print(sid, S[sid]['romaji'], '|', S[sid]['en'], '| -', [c + ':' + D[c]['romaji'] for c in rm], '| +', [c + ':' + D[c]['romaji'] for c in add])
    if not dry:
        cdata.save(sent, 'sentences', 'sent_full.json')


# ---------------------------------------------------------------------------
# build guards, shared with build.py so the two can never disagree
def guard_unlinked(sent, deck, forms):
    """sentences that use a deck word (in any form the linker knows) without
    listing it: the readability gate cannot count a word it is not told about"""
    D = {c['id']: c for c in deck}
    surf = collections.defaultdict(set)
    for c in deck:
        if c.get('dup'): continue
        r = c['romaji'].lower().replace("'", '')
        if ' ' not in r and len(r) >= 4 and c['pos'] not in ('particle', 'expr', 'interj', 'conj', 'counter', 'num'):
            surf[r].add(c['id'])
        row = forms.get(c['id'])
        if c['pos'] == 'verb' and row and c['id'] not in NO_FORM_MATCH:
            for t in verb_surfaces(c, row):
                if len(t) == 1 and len(t[0]) >= 5: surf[t[0]].add(c['id'])
        if c['pos'] == 'adj-i':
            for t in adj_surfaces(c):
                if len(t[0]) >= 5: surf[t[0]].add(c['id'])
    cardtok = {c['romaji'].lower().replace("'", '') for c in deck}
    pieces = number_pieces(deck)
    out = []
    for x in sent:
        linked = set(x.get('w') or [])
        covered = set()
        for w in linked:
            if w in D:
                covered |= set(toks(D[w]['romaji']))
                row = forms.get(w)
                if D[w]['pos'] == 'verb' and row:
                    for t in verb_surfaces(D[w], row): covered |= set(t)
                if D[w]['pos'] == 'adj-i':
                    for t in adj_surfaces(D[w]): covered |= set(t)
        for w in linked:
            covered |= PATTERN_COVERS.get(w, set())
        dropped = set(OVERRIDE.get(x['id'], {}).get('drop', []))
        st = toks(x['romaji'])
        for i, t in enumerate(st):
            if t in surf and surf[t] <= dropped: continue
            if surf.get(t) == {'c0180'} and ikemasen_not_iku(st, i): continue
            if t in surf and t not in covered and not (surf[t] & linked):
                out.append('%s uses %s' % (x['id'], t))
            elif t not in cardtok and t not in covered:
                ids = split_number(t, pieces)
                if ids and not (set(ids) <= linked):
                    out.append('%s uses %s (%s)' % (x['id'], t, '+'.join(D[i]['romaji'] for i in ids)))
    return out


# Tokens a sentence may carry with no card behind them, each with its reason.
# Empty on purpose: every word he reads is a word he can be taught.
ALLOW_UNCOVERED = {}


def number_parts(tok, pieces):
    """the number and counter pieces fused in tok as (surface, card id or None),
    or None when tok is not a number fused with a counter"""
    best = None
    def go(i, acc):
        nonlocal best
        if i == len(tok):
            if len(acc) >= 2 and (best is None or len(acc) < len(best)): best = list(acc)
            return
        for surf, cid, kind in pieces:
            if tok.startswith(surf, i): go(i + len(surf), acc + [(surf, cid, kind)])
    go(0, [])
    if not best or split_number(tok, pieces) is None: return None
    return [(sf, cid) for sf, cid, _ in best]


def guard_uncovered(sent, deck, forms):
    """every token of every sentence is accounted for by a card the sentence
    links, at that place in the sentence: the card itself, one of its forms, a
    fusion the linker splits, or a pattern that covers it. A word with no card
    at all is invisible to the readability gate: ano kikai de chaaji dekimasu
    opened on 9 Oct 2026 with kikai and chaaji never taught, because neither
    had a card to count. A multi-word card or form covers its words only where
    the whole of it occurs, so ga arimasu cannot vouch for a stray arimasu."""
    D = {c['id']: c for c in deck}
    pieces = number_pieces(deck)
    out = []
    for x in sent:
        linked = [w for w in (x.get('w') or []) if w in D]
        st = toks(x['romaji'])
        n = len(st)
        done = [False] * n
        nouns, stems, adjku = set(), set(), set()
        def mark(seq):
            k = len(seq)
            if not k: return
            for i in range(n - k + 1):
                if tuple(st[i:i+k]) == seq:
                    for j in range(i, i + k): done[j] = True
        for w in linked:
            c = D[w]
            mark(tuple(toks(c['romaji'])))
            row = forms.get(w)
            if c['pos'] == 'verb' and row:
                for t in verb_surfaces(c, row): mark(t)
                m = {row[i]: row[i+2] for i in range(0, len(row), 3)}.get('masu')
                if m: stems.add(m.split(' ')[-1][:-4])
            if c['pos'] == 'adj-i':
                for t, name in adj_surfaces(c).items():
                    mark(t)
                    if name == 'adj-ku': adjku.add(t[0])
            if row and c['pos'] in ('adj-i', 'adj-na'):
                for i in range(0, len(row), 3): mark(tuple(toks(row[i+2])))
            if c['pos'] == 'noun' and ' ' not in c['romaji']: nouns.add(c['romaji'])
            for t in PATTERN_COVERS.get(w, ()): mark((t,))
        for (a, b), cid in PHRASE_LINKS.items():
            if cid in linked: mark((a, b))
        for i, t in enumerate(st):
            if done[i]: continue
            if TOKEN_LINKS.get(t) and set(TOKEN_LINKS[t]) <= set(linked): continue
            parts = number_parts(t, pieces)
            if parts and all(cid for _, cid in parts) and {cid for _, cid in parts} <= set(linked): continue
            # an honorific prefix on a linked noun or on a linked verb's stem:
            # omizu, goriyou, omochi desu ka, oazukari shimasu
            if t[:1] == 'o' and (t[1:] in nouns or t[1:] in stems): continue
            if t[:2] == 'go' and t[2:] in nouns: continue
            # a linked verb's stem before ni and a verb of motion: mi ni ikimasen ka
            if t in stems and i + 2 < n and st[i+1] == 'ni': continue
            # an adjective's negative written apart: tooku nai, muzukashiku nakatta
            if t in ('nai', 'nakatta') and i > 0 and st[i-1] in adjku: continue
            if t in ALLOW_UNCOVERED: continue
            if parts and not all(cid for _, cid in parts):
                out.append('%s uses %s, a counter (%s) with no card' %
                           (x['id'], t, '+'.join(sf for sf, cid in parts if not cid)))
            else:
                out.append('%s uses %s, which no card it links covers' % (x['id'], t))
    return out


def guard_twins(sent, deck, allow=()):
    """two cards with the same romaji in one sentence's w, where the sound
    occurs once: at most one of them can be the word actually used"""
    D = {c['id']: c for c in deck}
    pieces = number_pieces(deck)
    cardtok = {c['romaji'].lower().replace("'", '') for c in deck}
    out = []
    for x in sent:
        by = collections.defaultdict(list)
        for w in x.get('w') or []:
            if w in D: by[D[w]['romaji'].lower()].append(w)
        st = toks(x['romaji'])
        for r, ids in by.items():
            if len(ids) < 2 or (x['id'], r) in allow: continue
            t = tuple(toks(r))
            n = sum(1 for j in range(len(st) - len(t) + 1) if tuple(st[j:j+len(t)]) == t)
            # a number fused into a counter (nihyaku) is an occurrence too
            n += sum(1 for tk in st if tk not in cardtok and set(split_number(tk, pieces) or []) & set(ids))
            if n < 2:
                out.append('%s links %s for one %r' % (x['id'], '+'.join(ids), r))
    return out

if __name__ == '__main__':
    main()
