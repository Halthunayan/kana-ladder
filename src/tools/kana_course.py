# -*- coding: utf-8 -*-
"""The hiragana and katakana course, 13 Oct 2026. Writes deck/kana_course.json.

Built slow on purpose: two or three new kana per lesson for the basic rows,
a review lesson after every two rows, and each new group only after the one
before it is answered well. Every kana is a sound item; hiragana and katakana
of the same sound share one audio clip (kj:<sound id>), because they are the
same sound. ji and zu each have two spellings (shi with dakuten and chi with
dakuten, su and tsu with dakuten) and share audio too.

Reading words come from the deck itself: after each lesson he reads real deck
words written only with the kana he has learned so far.

Audio for each sound is rendered from KATAKANA, never hiragana: a speech
front end reads hiragana ha and he on their own as the particles wa and e.
"""
import json, os, re, collections
HERE=os.path.dirname(os.path.abspath(__file__)); DECK=os.path.join(HERE,'..','deck')
d=json.load(open(os.path.join(DECK,'deck_full.json'),encoding='utf-8'))

def kata(s): return ''.join(chr(ord(c)+0x60) if 'ぁ'<=c<='ゖ' else c for c in s)

# (id, hiragana, romaji shown, audio id). Katakana is derived; extended sounds
# below exist in katakana only.
BASE=[('a','あ','a'),('i','い','i'),('u','う','u'),('e','え','e'),('o','お','o'),
 ('ka','か','ka'),('ki','き','ki'),('ku','く','ku'),('ke','け','ke'),('ko','こ','ko'),
 ('sa','さ','sa'),('shi','し','shi'),('su','す','su'),('se','せ','se'),('so','そ','so'),
 ('ta','た','ta'),('chi','ち','chi'),('tsu','つ','tsu'),('te','て','te'),('to','と','to'),
 ('na','な','na'),('ni','に','ni'),('nu','ぬ','nu'),('ne','ね','ne'),('no','の','no'),
 ('ha','は','ha'),('hi','ひ','hi'),('fu','ふ','fu'),('he','へ','he'),('ho','ほ','ho'),
 ('ma','ま','ma'),('mi','み','mi'),('mu','む','mu'),('me','め','me'),('mo','も','mo'),
 ('ya','や','ya'),('yu','ゆ','yu'),('yo','よ','yo'),
 ('ra','ら','ra'),('ri','り','ri'),('ru','る','ru'),('re','れ','re'),('ro','ろ','ro'),
 ('wa','わ','wa'),('wo','を','wo'),('n','ん','n')]
DAK=[('ga','が','ga'),('gi','ぎ','gi'),('gu','ぐ','gu'),('ge','げ','ge'),('go','ご','go'),
 ('za','ざ','za'),('ji','じ','ji'),('zu','ず','zu'),('ze','ぜ','ze'),('zo','ぞ','zo'),
 ('da','だ','da'),('dji','ぢ','ji'),('dzu','づ','zu'),('de','で','de'),('do','ど','do'),
 ('ba','ば','ba'),('bi','び','bi'),('bu','ぶ','bu'),('be','べ','be'),('bo','ぼ','bo'),
 ('pa','ぱ','pa'),('pi','ぴ','pi'),('pu','ぷ','pu'),('pe','ぺ','pe'),('po','ぽ','po')]
YO=[]
for head,hk,rr in [('k','き','ky'),('s','し','sh'),('c','ち','ch'),('n','に','ny'),('h','ひ','hy'),('m','み','my'),('r','り','ry'),('g','ぎ','gy'),('j','じ','j'),('b','び','by'),('p','ぴ','py')]:
    for sm,v in [('ゃ','a'),('ゅ','u'),('ょ','o')]:
        YO.append((rr+v, hk+sm, rr+v))
EXT=[('ti','ティ','ti'),('di','ディ','di'),('tu','トゥ','tu'),('fa','ファ','fa'),('fi','フィ','fi'),('fe','フェ','fe'),('fo','フォ','fo'),
 ('wi','ウィ','wi'),('we','ウェ','we'),('wo2','ウォ','wo'),('she','シェ','she'),('je','ジェ','je'),('che','チェ','che'),
 ('va','ヴァ','va'),('vi','ヴィ','vi'),('vu','ヴ','vu'),('ve','ヴェ','ve'),('vo','ヴォ','vo')]
# the sound each item is spoken as (shared clips)
SAY={'wo':'o','dji':'ji','dzu':'zu','wo2':'wo2'}

sounds={}
def add(sid,h,k,r,group):
    sounds[sid]={'id':sid,'h':h,'k':k,'r':r,'say':SAY.get(sid,sid),'g':group,
                 'tts':k}  # what the voice is given: katakana
for sid,h,r in BASE: add(sid,h,kata(h),r,'base')
for sid,h,r in DAK: add(sid,h,kata(h),r,'dakuten')
for sid,h,r in YO: add(sid,h,kata(h),r,'youon')
for sid,k,r in EXT: add(sid,None,k,r,'extended')
sounds['wo']['note']='said o; in hiragana it only marks the object of a verb'
sounds['wo']['note_k']='said o; in katakana it is almost never used, so it is here to be recognised'
sounds['dji']['note']='said ji; rare, the usual spelling of ji is the other one'
sounds['dzu']['note']='said zu; rare, the usual spelling of zu is the other one'
sounds['wo2']['note']='wo, as in a loanword'
sounds['n']['note']='a beat on its own: n, m or ng, by what follows'
# the rule line each derived sound is taught with (kana_hooks.json "rules")
RULE={}
for sid in ['ga','gi','gu','ge','go']: RULE[sid]='rule:g'
for sid in ['za','ji','zu','ze','zo']: RULE[sid]='rule:z'
for sid in ['da','dji','dzu','de','do']: RULE[sid]='rule:d'
for sid in ['ba','bi','bu','be','bo']: RULE[sid]='rule:b'
for sid in ['pa','pi','pu','pe','po']: RULE[sid]='rule:p'
for sid,h,r in YO: RULE[sid]='rule:'+re.sub('[aou]$','',sid)
for sid in ['ti','di','tu']: RULE[sid]='rule:ti-di-tu'
for sid in ['fa','fi','fe','fo']: RULE[sid]='rule:f'
for sid in ['wi','we','wo2']: RULE[sid]='rule:w'
for sid in ['she','je','che']: RULE[sid]='rule:she-je-che'
for sid in ['va','vi','vu','ve','vo']: RULE[sid]='rule:v'
for sid,r in RULE.items(): sounds[sid]['rule']=r

def L(script, title, new=None, kind='new', note=None):
    o={'s':script,'t':title,'kind':kind,'new':new or []}
    if note: o['note']=note
    return o
def rows(script):
    """the sound lessons and reviews, in order; small tsu and long vowels are
    placed afterwards, at the first point enough deck words can show them"""
    out=[]
    def lesson(ids, title, note=None): out.append(L(script,title,ids,note=note))
    def review(title): out.append(L(script,title,kind='review'))
    sc='hiragana' if script=='h' else 'katakana'
    lesson(['a','i','u'],'The first three vowels', 'Japanese has five vowels, always said the same way: a as in father, i as in see, u as in food but with flat lips.')
    lesson(['e','o'],'The last two vowels', 'e as in get, o as in or. Every other sound is a consonant plus one of these five.')
    lesson(['ka','ki','ku'],'k with a, i, u'); lesson(['ke','ko'],'k with e, o'); review('Review: vowels and k')
    lesson(['sa','shi','su'],'s with a, i, u','The s row has one odd sound: s with i is said shi.'); lesson(['se','so'],'s with e, o')
    lesson(['ta','chi','tsu'],'t with a, i, u','Two odd ones: t with i is chi, and t with u is tsu.'); lesson(['te','to'],'t with e, o'); review('Review: s and t')
    lesson(['na','ni','nu'],'n with a, i, u'); lesson(['ne','no'],'n with e, o')
    lesson(['ha','hi','fu'],'h with a, i, u','h with u is said fu, a soft f made with the lips, not the teeth.'); lesson(['he','ho'],'h with e, o'); review('Review: n and h')
    lesson(['ma','mi','mu'],'m with a, i, u'); lesson(['me','mo'],'m with e, o')
    lesson(['ya','yu','yo'],'y with a, u, o','Only three: there is no yi or ye.'); review('Review: m and y')
    lesson(['ra','ri','ru'],'r with a, i, u','The Japanese r is a light tap of the tongue, between r, l and d.'); lesson(['re','ro'],'r with e, o')
    lesson(['wa','wo','n'],'wa, wo and n',('wo is said o and only marks the object of a verb.' if script=='h' else 'wo is said o and is almost never used in katakana.')+' n is a full beat of its own.')
    review('Review: every basic '+sc)
    note_d='Two small strokes (dakuten) make a sound voiced: k becomes g, s becomes z, t becomes d, h becomes b. A small circle makes h into p.'
    lesson(['ga','gi','gu'],'g: k with two strokes', note_d); lesson(['ge','go'],'g with e, o')
    lesson(['za','ji','zu'],'z: s with two strokes','s with i becomes ji.'); lesson(['ze','zo'],'z with e, o'); review('Review: g and z')
    lesson(['da','dji','dzu'],'d: t with two strokes','The d row\'s i and u sound exactly like ji and zu, and are rare.'); lesson(['de','do'],'d with e, o')
    lesson(['ba','bi','bu'],'b: h with two strokes'); lesson(['be','bo'],'b with e, o'); review('Review: d and b')
    lesson(['pa','pi','pu'],'p: h with a small circle'); lesson(['pe','po'],'p with e, o'); review('Review: every voiced sound')
    yon='A small ya, yu or yo after an i-sound joins it into one beat: ki plus small ya is kya.'
    lesson(['kya','kyu','kyo'],'kya, kyu, kyo', yon); lesson(['sha','shu','sho'],'sha, shu, sho'); lesson(['cha','chu','cho'],'cha, chu, cho')
    review('Review: kya, sha, cha')
    lesson(['nya','nyu','nyo'],'nya, nyu, nyo'); lesson(['hya','hyu','hyo'],'hya, hyu, hyo'); lesson(['mya','myu','myo'],'mya, myu, myo')
    review('Review: nya, hya, mya')
    lesson(['rya','ryu','ryo'],'rya, ryu, ryo'); lesson(['gya','gyu','gyo'],'gya, gyu, gyo'); lesson(['ja','ju','jo'],'ja, ju, jo')
    review('Review: rya, gya, ja')
    lesson(['bya','byu','byo'],'bya, byu, byo'); lesson(['pya','pyu','pyo'],'pya, pyu, pyo')
    review('Review: every combined sound')
    if script=='k':
        lesson(['ti','di','tu'],'Loanword sounds: ti, di, tu','Katakana adds small vowels to write foreign sounds: te plus small i is ti.')
        lesson(['fa','fi','fe','fo'],'Loanword sounds: fa, fi, fe, fo')
        review('Review: ti and fa')
        lesson(['wi','we','wo2'],'Loanword sounds: wi, we, wo'); lesson(['she','je','che'],'Loanword sounds: she, je, che')
        lesson(['va','vi','vu'],'Loanword sounds: va, vi, vu','v sounds are written with u plus two strokes; most people say them as b.'); lesson(['ve','vo'],'Loanword sounds: ve, vo')
    review('Final review: all '+sc)
    return out
SPECIAL={'tsu':('The small tsu: a held beat','A small tsu doubles the next consonant: a short pause before k, t or p, a held s before s, one full beat long. kite (come) and kitte (stamp) are different words.'),
         'long_h':('Long vowels','A vowel held for two beats changes the word: obasan (aunt) and obaasan (grandmother). It is written by adding the vowel again; o is usually lengthened with u, e with i.'),
         'long_k':('The long-vowel dash','In katakana a long vowel is written with a dash: koohii (coffee) has two long vowels.')}

# ---- reading words: deck words written only with kana learned by each lesson ----
ALLK={}
for x in sounds.values():
    if x['h']: ALLK[x['h']]=x['id']
    ALLK.setdefault(x['k'],x['id'])
def tokens(kana):
    """split a word into course sounds (and the marks small tsu and long vowel)"""
    out=[]; i=0
    while i<len(kana):
        two=kana[i:i+2]
        if len(two)==2 and two in ALLK: out.append(ALLK[two]); i+=2; continue
        ch=kana[i]
        if ch in 'っッ': out.append('TSU'); i+=1; continue
        if ch=='ー': out.append('LONG'); i+=1; continue
        if ch in ALLK: out.append(ALLK[ch]); i+=1; continue
        return None
    return out
def translit(tk):
    """what the course has taught him to read these sounds as"""
    out=''
    for i,t in enumerate(tk):
        if t=='TSU':
            nx=tk[i+1] if i+1<len(tk) else None
            out+= sounds[nx]['r'][0] if nx and nx not in ('TSU','LONG') else ''
        elif t=='LONG':
            v=re.findall('[aeiou]',out); out+= v[-1] if v else ''
        else: out+= 'o' if t=='wo' else sounds[t]['r']
    return out
def script_of(kana):
    if re.fullmatch('[ぁ-ゖ]+',kana): return 'h'
    if re.fullmatch('[ァ-ヶー]+',kana): return 'k'
    return None
LONGV=re.compile('(aa|ii|uu|ee|oo|ou|ei)')
words=[]; dropped=collections.Counter()
for c in d:
    k=c['kana']; sc=script_of(k)
    if not sc or ' ' in c['romaji'].strip() or c.get('pos')=='particle': continue
    tk=tokens(k)
    if tk is None: continue
    # a one-sound word (ki, tree; te, hand) would be voiced by the word
    # library as a single kana, which the course never does without the
    # native recordings
    if len(tk)<2: dropped['one sound']+=1; continue
    # a word not read the way its kana are taught (konnichiwa, where ha is
    # read wa) would mark a correct reading wrong
    if translit(tk)!=c['romaji'].replace("'",'').replace('-',''): dropped['read otherwise']+=1; continue
    words.append({'id':c['id'],'s':sc,'t':tk,'tier':c.get('tier',9),'ord':c.get('ord',9999),
                  'long':bool(LONGV.search(c['romaji'])) or 'LONG' in tk, 'tsu':'TSU' in tk})

def readiness(seq, s):
    """for each word, the index in seq after which its sounds are all taught
    (ignoring the small tsu and long marks)"""
    at={}
    for i,l in enumerate(seq):
        for sid in l['new']: at[sid]=i
    res={}
    for w in words:
        if w['s']!=s: continue
        m=0; okw=True
        for t in w['t']:
            if t in ('TSU','LONG'): continue
            if t not in at: okw=False; break
            m=max(m,at[t])
        if okw: res[w['id']]=m
    return res
def place(seq, s):
    """put the small tsu and long-vowel lessons right after the first review
    by which at least six deck words can show each"""
    for kind in ('long','tsu'):
        rd=readiness(seq, s)
        need=[w for w in words if w['s']==s and w[kind] and w['id'] in rd]
        pos=None
        for i,l in enumerate(seq):
            if l['kind']!='review': continue
            if sum(1 for w in need if rd[w['id']]<=i and not (kind=='long' and w['tsu'] and not any(x['kind']=='tsu' for x in seq[:i+1]))) >= 6: pos=i+1; break
        if pos is None: raise SystemExit('no place for the %s lesson in %s' % (kind, s))
        key='tsu' if kind=='tsu' else 'long_'+s
        seq.insert(pos, L(s, SPECIAL[key][0], kind=kind, note=SPECIAL[key][1]))
    return seq
lessons=[]
for s,prefix in (('h','H'),('k','K')):
    seq=place(rows(s), s)
    for i,l in enumerate(seq): l['id']='%s%02d' % (prefix, i+1)
    lessons+=seq

# when each word becomes readable
learned_at={}
for i,l in enumerate(lessons):
    for sid in l['new']: learned_at[(l['s'],sid)]=i
tsu_at={l['s']:i for i,l in enumerate(lessons) if l['kind']=='tsu'}
long_at={l['s']:i for i,l in enumerate(lessons) if l['kind']=='long'}
def ready_at(w):
    m=0
    for t in w['t']:
        if t in ('TSU','LONG'): continue
        if (w['s'],t) not in learned_at: return None
        m=max(m,learned_at[(w['s'],t)])
    if w['tsu']: m=max(m,tsu_at[w['s']])
    if w['long']: m=max(m,long_at[w['s']])
    return m
for w in words: w['at']=ready_at(w)
words=[w for w in words if w['at'] is not None]
words.sort(key=lambda w:(w['at'],w['tier'],w['ord']))
for i,l in enumerate(lessons):
    mine=[w['id'] for w in words if w['at']==i]
    if l['kind'] in ('tsu','long'):
        # the lesson's own words show its mark; earlier readable words with the mark may join
        kind=l['kind']
        extra=[w['id'] for w in words if w['s']==l['s'] and w['at']<=i and w[kind] and w['id'] not in mine]
        mine=[x for x in mine if any(w['id']==x and w[kind] for w in words)]+extra
    l['words']=mine[:12]
# example word for each new sound: a deck word where the sound is clearly heard
# (not the u that only lengthens an o), preferably at the start and readable by then
def clear_at(tk, j):
    t=tk[j]
    if j==0: return True
    p=tk[j-1]
    if p in ('TSU','LONG'): return True
    pv=sounds[p]['r'][-1]
    if t in ('a','i','u','e','o') and (pv==t or (pv=='o' and t=='u') or (pv=='e' and t=='i')): return False
    return True
ex={}
for w in sorted(words,key=lambda w:(w['tier'],w['ord'])):
    for j,t in enumerate(w['t']):
        if t in ('TSU','LONG') or not clear_at(w['t'],j): continue
        key=(w['s'],t); score=(0 if j==0 else 1, w['tier'], w['ord'])
        if key not in ex or score<ex[key][0]: ex[key]=(score,w['id'])
anyw={}
for c in sorted(d,key=lambda c:(c.get('tier',9),c.get('ord',9999))):
    if c.get('pos')=='particle' or ' ' in c['romaji'].strip(): continue
    tk=tokens(c['kana'])
    if not tk or len(tk)<2: continue
    sc=script_of(c['kana'])
    if not sc: continue
    for j,t in enumerate(tk):
        if t in ('TSU','LONG') or not clear_at(tk,j): continue
        anyw.setdefault((sc,t),c['id'])
for l in lessons:
    l['ex']={sid:(ex[(l['s'],sid)][1] if (l['s'],sid) in ex else anyw.get((l['s'],sid))) for sid in l['new']}

# look-alikes, drilled side by side (pairs within one script); ji and zu with
# their rare spellings are not look-alikes to drill, they read the same
CONF={'h':[['nu','me'],['ne','re','wa'],['ru','ro'],['sa','chi'],['ki','sa'],['i','ri'],['ko','ni'],['ha','ho'],['a','o'],['u','ra'],['shi','tsu'],['ta','na'],['ma','ho']],
      'k':[['shi','tsu'],['so','n'],['ku','ke'],['chi','te'],['wa','u'],['ko','yu'],['fu','wa'],['ma','mu'],['ra','fu'],['no','me'],['ku','ta'],['to','ho']]}

# ---- refuse a course a learner can get stuck in ----
for l in lessons:
    if l['kind'] in ('tsu','long'): assert len(l['words'])>=5, '%s (%s) has only %d words' % (l['id'], l['t'], len(l['words']))
    if l['kind']=='new': assert 1<=len(l['new'])<=4, '%s teaches %d sounds' % (l['id'], len(l['new']))

out={'v':2,'sounds':sounds,'lessons':lessons,'conf':CONF}
json.dump(out,open(os.path.join(DECK,'kana_course.json'),'w',encoding='utf-8'),ensure_ascii=False,separators=(',',':'))
cnt=collections.Counter(l['s'] for l in lessons)
print('sounds',len(sounds),'unique audio',len({s['say'] for s in sounds.values()}),'lessons',dict(cnt),'reading words',len(words),'dropped',dict(dropped))
for l in lessons:
    if l['kind'] in ('tsu','long'): print(l['id'],l['t'],len(l['words']),l['words'][:5])
miss=[(l['id'],s) for l in lessons for s,v in l['ex'].items() if not v]
print('sounds without an example word',len(miss))
