# -*- coding: utf-8 -*-
"""Pitch marks for every card: one H or L per mora, Tokyo accent.
10 Oct 2026: first version, from OpenJTalk accent labels.
11 Oct 2026, after the release 2 audit (6% of cards wrong): single words now
come from a dictionary accent first, OpenJTalk only as a fallback.

Sources, in order:
  1. deck/pitch_overrides.json: hand-checked patterns (wins over all).
  2. deck/pitch_dict.json: the dictionary accent number for single-word
     cards, looked up in the kanjium accent list (accents.txt, NHK-style
     accent numbers, CC BY-SA 4.0) by the card's kanji and kana. Rebuild it
     with: python3 pitch_1010.py --dict /path/to/accents.txt
  3. OpenJTalk (needs pyopenjtalk): for phrases, and for single words the
     list does not have, and only when OpenJTalk reads the kanji as the
     card's kana. A single word whose OpenJTalk marks rise again after a
     fall (it split the word in two) gets no marks rather than wrong ones.

Accent number rule (Tokyo): 0 is L then H, and a particle after it stays
high; 1 is H then L; n is L, H up to mora n, then L. After an accented word
a particle is low. Single-word nouns get that particle mark as a ninth
character after a bar: "LHH|H" (heiban) or "LHH|L" (accent on the last
mora), so hashi (bridge) and hashi (edge) look different.

Writes deck/pitch.json."""
import json, re, os, sys, collections
HERE=os.path.dirname(os.path.abspath(__file__))
DECK=os.path.join(HERE,'..','deck')
d=json.load(open(os.path.join(DECK,'deck_full.json'),encoding='utf-8'))
SMALL=set('ゃゅょぁぃぅぇぉゎ')
NOUNISH={'noun','pron','num'}

def hira(s): return ''.join(chr(ord(c)-0x60) if 'ァ'<=c<='ヶ' else c for c in s)
def morae(k):
    out=[]
    for ch in hira(k):
        if ch in SMALL and out: out[-1]+=ch
        elif 'ぁ'<=ch<='ゖ' or ch=='ー': out.append(ch)
    return out
def one_word(c): return ' ' not in c['romaji'].strip()
def from_acc(n, a):
    if n==1: pt='H' if a==1 else 'L'
    elif a==0: pt='L'+'H'*(n-1)
    elif a==1: pt='H'+'L'*(n-1)
    else: pt=''.join('H' if 1<=i<a else 'L' for i in range(n))
    return pt, ('H' if a==0 else 'L')
def rise_after_fall(pt): return re.search(r'HL+H', pt) is not None

# ---- 2. the dictionary accent list, cut down to this deck ----
DICT=os.path.join(DECK,'pitch_dict.json')
ASR=json.load(open(os.path.join(DECK,'asr_spellings.json'),encoding='utf-8'))
if '--dict' in sys.argv:
    src=sys.argv[sys.argv.index('--dict')+1]
    # kana-only cards whose kana is several words: the word the card means
    HINT={'c1794':['時']}
    POSJ={'adv':'副','noun':'名','adj-na':'形動','verb':'動','adj-i':'形'}
    by_word=collections.defaultdict(list); by_read=collections.defaultdict(set)
    for line in open(src,encoding='utf-8'):
        p=line.rstrip('\n').split('\t')
        if len(p)<3: continue
        w=p[0]; r=hira(p[1] or p[0])
        # "0" or "0,2" or "(名;形動)0,(副)1": accents by part of speech
        acc=[]; lab=''
        for tok in p[2].split(','):
            m=re.match(r'\s*(?:\(([^)]*)\))?\s*(\d+)\s*$', tok)
            if not m: continue
            if m.group(1) is not None: lab=m.group(1)
            acc.append((lab,int(m.group(2))))
        if not acc: continue
        by_word[w].append((r,acc)); by_read[r].add(acc[0][1])
    out={}
    for c in d:
        if not one_word(c) or c.get('pos')=='particle': continue
        k=hira(c['kana']); hit=None
        for w in [c.get('kanji')]+ASR.get(k,[])+HINT.get(c['id'],[])+[c['kana'], k]:
            if not w: continue
            m=[a for r,a in by_word.get(w,[]) if r==k]
            if m:
                want=POSJ.get(c.get('pos'),'')
                pick=[a for lab,a in m[0] if want and want in lab]
                hit=(pick or [m[0][0][1]])[0]; break
        # kana-only card: trust the list only if every word read this way agrees
        if hit is None and not c.get('kanji') and len(by_read.get(k,()))==1:
            hit=next(iter(by_read[k]))
        if hit is not None: out[c['id']]=hit
    json.dump(out,open(DICT,'w',encoding='utf-8'),separators=(',',':'),sort_keys=True)
    print('pitch_dict.json:',len(out),'cards')
DACC=json.load(open(DICT,encoding='utf-8'))
OVR=json.load(open(os.path.join(DECK,'pitch_overrides.json'),encoding='utf-8'))

# ---- 3. OpenJTalk ----
import pyopenjtalk
def ojt_pattern(text):
    labs=pyopenjtalk.extract_fullcontext(text)
    # the phonemes of one mora share every field from /A: on; a new mora is a
    # change there (two one-mora phrases in a row still differ in /E: or /G:)
    seq=[]; last=None
    for l in labs:
        p=re.search(r'-(.+?)\+',l).group(1)
        if p in ('sil','pau'): last=None; continue
        a=re.search(r'/A:(-?\d+)\+(\d+)\+(\d+)/',l); f=re.search(r'/F:(\d+)_(\d+)',l)
        if not a or not f: return None
        ctx=l[l.index('/A:'):]
        if ctx==last: continue
        last=ctx
        seq.append((int(a.group(2)),int(f.group(1)),int(f.group(2))))
    out=[]
    for m,f1,f2 in seq:
        if f2==1: h= m==1
        elif f2==0: h= m!=1
        else: h= 2<=m<=f2
        out.append('H' if h else 'L')
    return ''.join(out)
def norm_read(k):
    """a reading as it sounds: long vowels and particles written one way"""
    mo=morae(k); out=[]
    V={'a':'あかさたなはまやらわがざだばぱ','i':'いきしちにひみりぎじぢびぴ','u':'うくすつぬふむゆるぐずづぶぷ','e':'えけせてねへめれげぜでべぺ','o':'おこそとのほもよろをごぞどぼぽ'}
    def vow(m):
        if m[-1] in 'ゃ': return 'a'
        if m[-1] in 'ゅ': return 'u'
        if m[-1] in 'ょ': return 'o'
        for v,s in V.items():
            if m[-1] in s: return v
        return ''
    for i,m in enumerate(mo):
        pv=vow(out[-1]) if out else ''
        if m=='ー' or (m=='う' and pv in 'ou' and pv) or (m=='い' and pv=='e'): out.append('ー'); continue
        out.append(m)
    return ''.join(out).replace('を','お')
def ojt_reads_as(text, kana):
    try: g=pyopenjtalk.g2p(text, kana=True)
    except Exception: return False
    return norm_read(re.sub(r'[、。？！\s]','',g))==norm_read(kana)

res={}; why=collections.Counter(); dropped=[]
for c in d:
    n=len(morae(c['kana'])); k=c['kana']
    # an empty override: a grammar ending, said joined to another word, gets no marks
    if c['id'] in OVR:
        if OVR[c['id']]: res[c['id']]=OVR[c['id']]
        why['override']+=1; continue
    if c.get('pos')=='particle': why['particle']+=1; continue
    if one_word(c) and c['id'] in DACC:
        pt,par=from_acc(n, DACC[c['id']])
        res[c['id']]=pt+('|'+par if c.get('pos') in NOUNISH else ''); why['dict']+=1; continue
    pt=None
    texts=[t for t in [c.get('kanji')]+ASR.get(hira(k),[]) if t and ojt_reads_as(t,k)]
    for text in texts+[k]:
        try: p=ojt_pattern(text)
        except Exception: p=None
        if p and len(p)==n and not (one_word(c) and rise_after_fall(p)): pt=p; break
    if pt is None: why['none']+=1; dropped.append(c['id']); continue
    res[c['id']]=pt; why['openjtalk']+=1
print(len(res),'patterns',dict(why))
for i in ['c0119','c0360','c0189','c0101','c0001','c0049','c0015','c0270','c0347']:
    c=[x for x in d if x['id']==i]
    if c: print(i,c[0]['romaji'],c[0]['kana'],res.get(i))
json.dump(res,open(os.path.join(DECK,'pitch.json'),'w',encoding='utf-8'),separators=(',',':'),sort_keys=True)
