# -*- coding: utf-8 -*-
import itertools, re

DIG = {
 'きゃ':'kya','きゅ':'kyu','きょ':'kyo','しゃ':'sha','しゅ':'shu','しょ':'sho',
 'ちゃ':'cha','ちゅ':'chu','ちょ':'cho','にゃ':'nya','にゅ':'nyu','にょ':'nyo',
 'ひゃ':'hya','ひゅ':'hyu','ひょ':'hyo','みゃ':'mya','みゅ':'myu','みょ':'myo',
 'りゃ':'rya','りゅ':'ryu','りょ':'ryo','ぎゃ':'gya','ぎゅ':'gyu','ぎょ':'gyo',
 'じゃ':'ja','じゅ':'ju','じょ':'jo','ぢゃ':'ja','ぢゅ':'ju','ぢょ':'jo',
 'びゃ':'bya','びゅ':'byu','びょ':'byo','ぴゃ':'pya','ぴゅ':'pyu','ぴょ':'pyo',
 'しぇ':'she','ちぇ':'che','じぇ':'je','てぃ':'ti','でぃ':'di','とぅ':'tu','どぅ':'du',
 'ふぁ':'fa','ふぃ':'fi','ふぇ':'fe','ふぉ':'fo','ふゅ':'fyu','うぃ':'wi','うぇ':'we','うぉ':'wo',
 'ゔぁ':'va','ゔぃ':'vi','ゔぇ':'ve','ゔぉ':'vo','くぁ':'kwa','くぃ':'kwi','くぇ':'kwe','くぉ':'kwo',
 'つぁ':'tsa','つぃ':'tsi','つぇ':'tse','つぉ':'tso','いぇ':'ye','でゅ':'dyu','てゅ':'tyu',
 'ぐぁ':'gwa','じゅ':'ju',
}
MONO = {
 'あ':'a','い':'i','う':'u','え':'e','お':'o',
 'か':'ka','き':'ki','く':'ku','け':'ke','こ':'ko',
 'が':'ga','ぎ':'gi','ぐ':'gu','げ':'ge','ご':'go',
 'さ':'sa','し':'shi','す':'su','せ':'se','そ':'so',
 'ざ':'za','じ':'ji','ず':'zu','ぜ':'ze','ぞ':'zo',
 'た':'ta','ち':'chi','つ':'tsu','て':'te','と':'to',
 'だ':'da','ぢ':'ji','づ':'zu','で':'de','ど':'do',
 'な':'na','に':'ni','ぬ':'nu','ね':'ne','の':'no',
 'は':'ha','ひ':'hi','ふ':'fu','へ':'he','ほ':'ho',
 'ば':'ba','び':'bi','ぶ':'bu','べ':'be','ぼ':'bo',
 'ぱ':'pa','ぴ':'pi','ぷ':'pu','ぺ':'pe','ぽ':'po',
 'ま':'ma','み':'mi','む':'mu','め':'me','も':'mo',
 'や':'ya','ゆ':'yu','よ':'yo',
 'ら':'ra','り':'ri','る':'ru','れ':'re','ろ':'ro',
 'わ':'wa','ゐ':'i','ゑ':'e','を':'o','ん':'n','ゔ':'vu',
 'ぁ':'a','ぃ':'i','ぅ':'u','ぇ':'e','ぉ':'o','ゃ':'ya','ゅ':'yu','ょ':'yo','ゎ':'wa',
}

def kata2hira(s):
    out=[]
    for ch in s:
        o=ord(ch)
        if 0x30A1<=o<=0x30F6: out.append(chr(o-0x60))
        else: out.append(ch)
    return ''.join(out)

PARTICLE_ALT={'は':['ha','wa'],'へ':['he','e'],'を':['o','wo']}

def romanize_variants(kana, cap=64):
    s=kata2hira(kana).replace('・','').replace('　',' ')
    toks=[]   # each token is list of alternatives
    i=0
    while i < len(s):
        c=s[i]
        if c in (' ',):
            toks.append([' ']); i+=1; continue
        if c in ('ー','−','-'):
            toks.append(['@LONG']); i+=1; continue
        if c in ('っ',):
            toks.append(['@SOKU']); i+=1; continue
        if i+1 < len(s) and s[i:i+2] in DIG:
            toks.append([DIG[s[i:i+2]]]); i+=2; continue
        if c in PARTICLE_ALT:
            toks.append(list(PARTICLE_ALT[c])); i+=1; continue
        if c in MONO:
            toks.append([MONO[c]]); i+=1; continue
        toks.append(['@?'+c]); i+=1
    # expand alternatives
    alt_idx=[k for k,t in enumerate(toks) if len(t)>1]
    combos=[]
    if len(alt_idx)>6:
        alt_idx=alt_idx[:6]
    for choice in itertools.product(*[toks[k] for k in alt_idx]) if alt_idx else [()]:
        cur=[]
        ci=0
        for k,t in enumerate(toks):
            if k in alt_idx:
                cur.append(choice[alt_idx.index(k)])
            else:
                cur.append(t[0])
        combos.append(assemble(cur))
        if len(combos)>=cap: break
    return set(combos)

def assemble(parts):
    out=''
    pending_soku=False
    for p in parts:
        if p=='@SOKU':
            pending_soku=True; continue
        if p=='@LONG':
            m=re.search(r'[aeiou]$', out)
            out += m.group(0) if m else ''
            continue
        if p.startswith('@?'):
            out += p; continue
        if pending_soku:
            first=p[0]
            if p.startswith('ch'): out += 't'
            else: out += first
            pending_soku=False
        out += p
    return out

def norm(r):
    r=r.lower().strip()
    r=r.replace("'", "").replace('-','').replace(' ','').replace('.','')
    return r

def equiv_forms(r):
    """acceptable spelling variants of a produced romaji"""
    s={norm(r)}
    add=set()
    for x in s:
        add.add(x.replace('tch','cch'))
        add.add(x.replace('cch','tch'))
        # n before b/m/p may be written m
        add.add(re.sub(r'n(?=[bmp])','m',x))
        add.add(re.sub(r'm(?=[bmp])','n',x))
        add.add(x.replace('ou','oo'))
        add.add(x.replace('oo','ou'))
        add.add(x.replace('uu','u'))
        add.add(x.replace('ii','i'))
        add.add(x.replace('ee','ei'))
        add.add(x.replace('ei','ee'))
    s|=add
    s2=set()
    for x in s:
        s2.add(x); s2.add(re.sub(r'n(?=[bmp])','m',x))
    return s2

def check(kana, romaji):
    gen=romanize_variants(kana)
    if any('@?' in g for g in gen):
        bad=[g for g in gen if '@?' in g]
        return ('UNKNOWN_CHAR', sorted(gen)[0])
    target=norm(romaji)
    acc=set()
    for g in gen: acc |= equiv_forms(g)
    tvars=equiv_forms(target)
    if acc & tvars: return ('OK', None)
    return ('MISMATCH', sorted(gen)[0])

def kana_regex(kana):
    """Regex for the romaji of a kana string; the three grammatical particles
    may be written either literally or as spoken."""
    s = kata2hira(kana)
    for ch in "、。 　,.!?！？「」":
        s = s.replace(ch, "")
    out=[]; i=0; pend=False
    ALT={'は':'(?:ha|wa)','へ':'(?:he|e)','を':'(?:o|wo)'}
    while i < len(s):
        c=s[i]
        if c in ('ー','−','-'):
            out.append('[aeiou]'); i+=1; continue
        if c=='っ':
            pend=True; i+=1; continue
        piece=None
        if i+1<len(s) and s[i:i+2] in DIG: piece=DIG[s[i:i+2]]; i+=2
        elif c in ALT:
            if pend: out.append('.'); pend=False
            out.append(ALT[c]); i+=1; continue
        elif c in MONO: piece=MONO[c]; i+=1
        else: return None
        if pend:
            out.append('[tc]' if piece.startswith('ch') else re.escape(piece[0])); pend=False
        out.append(re.escape(piece))
    return '^'+''.join(out)+'$'

def check_sentence(kana, romaji):
    rx = kana_regex(kana)
    if rx is None: return ('UNKNOWN_CHAR', None)
    t = romaji.lower()
    for ch in " ,.!?'-　、。":
        t = t.replace(ch, "")
    return ('OK', None) if re.match(rx, t) else ('MISMATCH', rx)
