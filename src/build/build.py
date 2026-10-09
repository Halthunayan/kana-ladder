import os
# project root resolves from this file, so the tree can live anywhere
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def R(*p): return os.path.join(ROOT, *p)
B = R('build') + os.sep
style=open(B+'style.css',encoding='utf-8').read()
fonts=open(B+'fonts.css',encoding='utf-8').read()
body=open(B+'body.html',encoding='utf-8').read()
js=open(B+'app.core.js',encoding='utf-8').read()
# Scenes live in their own file so the feature can be read as one piece; the
# duplicate-declaration guard below runs over the joined script.
# app.core.js is one closure, so the scenes module is spliced in before its
# boot line rather than appended after it: inside the scope, ahead of the first
# render, which reads the scene data.
_boot='loadLocal(); rollDay(); applySettings();'
assert js.count(_boot)==1, 'the boot line moved; scenes.js needs a place inside the closure before it'
# speaking.js is spliced in right after scenes.js: it calls scenes.js's own
# listenOnce, kanaSim, kanaKey, kanaToRomaji and kanjiToKana rather than
# duplicating them, so it has to live in the same closure, after the module
# it borrows from.
js=js.replace(_boot, open(B+'scenes.js',encoding='utf-8').read()+'\n'+
                      open(B+'speaking.js',encoding='utf-8').read()+'\n'+_boot, 1)
scenes_src=open(R('scenes','scenes.json'),encoding='utf-8').read()
_audio_ok = os.path.exists(R('pwa','audio','v1','manifest.json'))
js=js.replace('__AUDIO_SHIPPED__', 'true' if _audio_ok else 'false')
deck=open(R('deck', 'deck_full.json'),encoding='utf-8').read()
sent=open(R('sentences', 'sent_full.json'),encoding='utf-8').read()
conj=open(R('conj', 'anchors.json'),encoding='utf-8').read()
forms=open(R('conj', 'forms.json'),encoding='utf-8').read()
examples=open(R('deck', 'examples.json'),encoding='utf-8').read()

# ---- guard: no two top level declarations may share a name ----
# Twice in two days a new function or variable was given a name the app already
# used. The later declaration wins and the earlier one silently stops existing:
# audReady became a promise and turned the listening gate permanently off, and
# SPK, the speaker icon, became a counter so every clip decided it had been
# superseded and nothing played. Both were caught by tests, but only after a
# build. This is a one line check and it catches the whole class before one.
import re as _re0, collections as _c0
_names = _c0.Counter(m.group(1) for m in
    _re0.finditer(r'^(?:var|function)\s+([A-Za-z_$][\w$]*)', js, _re0.M))
_dups = sorted(n for n, c in _names.items() if c > 1)
if _dups:
    raise SystemExit('app.core.js declares these names more than once at the top '
                     'level, and the later one silently replaces the earlier: '
                     + ', '.join(_dups))

# ---- guards: the deck must stay usable in both directions ----
import json as _j, collections as _c, re as _re
_d=_j.loads(deck); _s=_j.loads(sent)

# ---- guard: an inflected adjective still has to be a word the sentence knows ----
# A sentence unlocks when at most one of its words is unknown, and that one gap
# is glossed. The gate can only count words the sentence lists, so a word that
# appears inflected and is not listed is invisible to it: tesuto wa muzukashiku
# nakatta desu shipped with tesuto as the declared gap while muzukashii, right
# there in the middle of it, was never counted. He met the sentence with two
# unknown words in it and said so. An i-adjective's adverbial and past forms are
# regular, so they can be checked here rather than trusted.
import re as _re1
_adj=[(c['id'], c['romaji'][:-1]) for c in _d
      if c.get('pos')=='adj-i' and (c.get('romaji') or '').endswith('i')
      and len(c.get('romaji') or '')>2]
_IDIOM={'yoroshiku'}          # a set greeting, not the adjective in use
# A token that is itself a card the sentence links is that card, not an
# inflection: hayaku (early, quickly) and chikaku (nearby) are words of their
# own. And an adjective whose sound is shared (atsui, hot weather and hot to the
# touch) is satisfied by whichever of the two the sentence links.
_rom_of={c['id']:(c.get('romaji') or '').lower() for c in _d}
_ids_by_rom=_c0.defaultdict(set)
for _cc in _d: _ids_by_rom[_rom_of[_cc['id']]].add(_cc['id'])
_gaps=[]
for _x in _s:
    _toks=set(_re1.split(r"[^a-z']+", (_x.get('romaji') or '').lower()))
    _lw=set(_x.get('w') or [])
    _linked_toks={_rom_of[_w] for _w in _lw if _w in _rom_of}
    for _wid,_stem in _adj:
        _forms={_stem+suf for suf in ('ku','katta','kute','kereba','kunai','kunakatta')}-_IDIOM
        _hit=(_forms & _toks)-_linked_toks
        if _hit and not (_ids_by_rom[_rom_of[_wid]] & _lw):
            _gaps.append(_x['id']+' needs '+_wid)
if _gaps:
    raise SystemExit('these sentences use an inflected i-adjective they do not '
                     'list as one of their words, so the readability gate cannot '
                     'see it: ' + ', '.join(_gaps[:12]) +
                     (' and %d more' % (len(_gaps)-12) if len(_gaps)>12 else ''))

def _gloss(_t):
    # Case and punctuation are not something the learner types, so two glosses
    # that differ only in those are the same prompt. A bracketed note is kept:
    # it is the deck's own way of separating ohayou from ohayou gozaimasu, and
    # the learner can read it. What it must not be is a label that carries no
    # information, which is a judgement no normaliser can make.
    _t=_t.strip().lower()
    return _re.sub(r'[^a-z0-9() ]','',_t).strip()
_g=_c.defaultdict(list)
for _e in _d: _g[_gloss(_e['en'])].append(_e['id'])
_dup=[(k,v) for k,v in _g.items() if len(v)>1]
assert not _dup, 'two cards share an English gloss, so the English to Japanese card is unanswerable: %r' % _dup[:5]
_ids={_e['id'] for _e in _d}
for _x in _s:
    assert _x['w'], 'sentence %s links to no word and can never unlock' % _x['id']
    for _w in _x['w']:
        assert _w in _ids, 'sentence %s links to missing word %s' % (_x['id'], _w)
# An English gloss is the whole prompt in the English to Japanese direction, so
# two items that share one make that prompt unanswerable: whichever the learner
# types, it is graded against the other one's romaji.
_gs=_c.defaultdict(list)
for _x in _s: _gs[_gloss(_x['en'])].append(_x['id'])
for _e in _d: _gs[_gloss(_e['en'])].append(_e['id'])
_gdup=[(k,v) for k,v in _gs.items() if len(v)>1]
assert not _gdup, 'two items share an English gloss, so the English to Japanese prompt is unanswerable: %r' % _gdup[:8]
# An English gloss that differs from another only by word order or by an
# article is the same prompt to the person reading it. The exact-match check
# above cannot see that: "pleased to meet you (polite)" and "pleased to meet
# you / regards" are different strings and were two different answers to one
# question for weeks. Articles are dropped because English has them and
# Japanese does not; nothing else is, because this, that, my, your, and, or
# and the question word all carry meaning the learner has to reproduce.
# A question mark is not punctuation here, it is the difference between "this
# is my book" and "is this my book", which are two different Japanese sentences.
# It is kept as a token of its own rather than stripped with the rest.
_ART={'a','an','the'}
def _wordset(_t):
    _t=_t.lower()
    _q=' qmark' if '?' in _t else ''
    _t=_re.sub(r'[^a-z0-9 ]',' ',_t)+_q
    return frozenset(_w for _w in _t.split() if _w and _w not in _ART)
_ws=_c.defaultdict(list)
for _x in _s: _ws[_wordset(_x['en'])].append((_x['id'], _x['en']))
for _e in _d: _ws[_wordset(_e['en'])].append((_e['id'], _e['en']))
_wdup=[_v for _k,_v in _ws.items() if _k and len(_v)>1]
assert not _wdup, ('two items ask the same English question once word order and '
                   'articles are ignored, so the prompt has no single answer: %r' % _wdup[:5])

# The English side of a card is the whole prompt in the English to Japanese
# direction. A bracketed note that repeats a word of the answer's own romaji
# hands him the answer: "I am a doctor (wa, saying what my job is)" is not a
# test. Rewriting the English so it carries the difference is the fix; this
# refuses the shortcut. A note that names a DIFFERENT word, as "softer than
# kara" does, is a real teaching note and is left alone.
for _e in list(_d)+list(_s):
    _mine={_w for _w in _re.split(r'[^a-z]+', _e['romaji'].lower()) if len(_w)>1}
    for _note in _re.findall(r'\(([^)]*)\)', _e['en']):
        _hit=sorted(_mine.intersection(
            _w for _w in _re.split(r'[^a-z]+', _note.lower()) if len(_w)>1))
        assert not _hit, ('the English prompt for %s repeats its own answer, '
                          'so the card gives itself away: %r in %r'
                          % (_e['id'], _hit, _e['en']))

_kana=_re.compile(r'^[\u3040-\u309f\u30a0-\u30ff\u30fc]+$')
for _e in _d:
    assert _kana.match(_e['kana']), 'card %s has a non-kana face: %s' % (_e['id'], _e['kana'])
    assert _e['en'].strip() and _e['romaji'].strip(), 'card %s has an empty field' % _e['id']
_cj=_j.loads(conj); _fm=_j.loads(forms)
import sys as _sys; _sys.path.insert(0,R('tools'))
import kana as _K
for _a in _cj:
    assert _a['w'] and _a['w'][0] in _ids, 'anchor %s links to no word' % _a['id']
    assert _kana.match(_a['kana']), 'anchor %s has a non-kana face: %s' % (_a['id'], _a['kana'])
    assert _a['kana'] != _a['base'], 'anchor %s is identical to its dictionary form' % _a['id']
    assert _K.check(_a['kana'], _a['romaji'])[0] == 'OK', \
        'anchor %s romaji does not match its kana: %s / %s' % (_a['id'], _a['kana'], _a['romaji'])
_forms_n = 0
# Form names, as the app labels them. Since 28 Sep 2026 a verb's te-form is
# drilled as the request it makes (tekudasai: matte kudasai, please wait), and an
# adjective carries the polite past and the polite negative (politeneg:
# takakunai desu, shizuka ja arimasen) the corpus uses, plus its te-form. An
# adjective row is three forms (nine entries); a verb row four to seven.
_NAMES={'masu','mashita','masen','masendeshita','potential','tekudasai','tai',
        'politepast','politeneg','te'}
_VERB_NAMES={'masu','mashita','masen','masendeshita','potential','tekudasai','tai'}
_ADJ_NAMES={'politepast','politeneg','te'}
# ---- guard: a verb that happens to you has no "can" and no "want to" ----
# komaremasu (can be troubled), yogoretai desu (want to get dirty) and shinde
# kudasai (please die) are drill cards that teach something no one says. The
# list lives with the tool that wrote the table; the build refuses a table in
# which one of those forms has come back.
from forms_0928 import NON_VOLITIONAL as _NONVOL, NO_TEKUDASAI as _NOTEK, NO_TEKUDASAI_IDS as _NOTEK_IDS
_rom_by_id={c['id']:c['romaji'] for c in _d}
_pos_by_id={c['id']:c['pos'] for c in _d}
for _wid, _row in _fm.items():
    _names_here=set(_row[0::3])
    _bad=_NONVOL.get(_rom_by_id.get(_wid), set()) & _names_here
    if 'tekudasai' in _names_here and (_rom_by_id.get(_wid) in _NOTEK or _wid in _NOTEK_IDS):
        _bad=_bad|{'tekudasai'}
    assert not _bad, ('forms row %s (%s) carries %s, which is not a word for a verb that '
                      'happens to you' % (_wid, _rom_by_id.get(_wid), sorted(_bad)))
for _wid, _row in _fm.items():
    assert _wid in _ids, 'forms table names a missing word %s' % _wid
    assert len(_row) % 3 == 0 and 9 <= len(_row) <= 21, \
        'forms row %s has %d entries' % (_wid, len(_row))
    _want = _VERB_NAMES if _pos_by_id[_wid] == 'verb' else _ADJ_NAMES
    assert set(_row[0::3]) <= _want, \
        'forms row %s (%s) mixes verb and adjective forms: %r' % (_wid, _pos_by_id[_wid], _row[0::3])
    _kanas=[_row[_i+1] for _i in range(0, len(_row), 3)]
    assert len(set(_kanas))==len(_kanas), \
        'forms row %s repeats a form, so two questions share one answer: %r' % (_wid, _kanas)
    for _i in range(0, len(_row), 3):
        assert _row[_i] in _NAMES, 'forms row %s has an unknown form name %r' % (_wid, _row[_i])
        assert _K.check(_row[_i+1], _row[_i+2])[0] == 'OK', \
            'generated form %s does not match its romaji: %s / %s' % (_wid, _row[_i+1], _row[_i+2])
        _forms_n += 1

# ---- guard: any deck word a sentence uses has to be one of its words ----
# The adjective check above catches inflection. This one catches the rest: a
# noun, adjective, adverb or pronoun standing in the sentence exactly as its
# card writes it, and a verb in any form a beginner meets, not only the seven in
# its table. Until 28 Sep 2026 this guard knew the table only, so 141 sentences
# carried a verb as -mashou, -masen ka, -nakereba, -naide, -te mo, a negative or
# a potential that the readability gate never counted. It now also knows a
# number fused with its counter (gohyaku, shichinin, nibansen), since each of
# those numbers is a card. A token covered by a linked card (onegai inside a
# linked "onegai shimasu") or by a linked grammar pattern (arimasen inside "ga
# arimasu") is not a gap, and ikemasen after "te wa" is "must not", not iku.
# The recognition is the linker's own (tools/link_sentences.py), imported, so
# the tool that writes the links and the guard that checks them cannot drift.
import link_sentences as _LS
_gaps2=_LS.guard_unlinked(_s, _d, _fm)
if _gaps2:
    raise SystemExit('these sentences use a deck word they do not list, so the '
                     'readability gate cannot count it: ' + ', '.join(sorted(set(_gaps2))[:12]) +
                     (' and %d more' % (len(set(_gaps2))-12) if len(set(_gaps2))>12 else ''))

# ---- guard: every word a sentence uses has a card, and the sentence links it ----
# The guard above checks the words that have cards. A word with no card at all
# was invisible to it and to the gate: ano kikai de chaaji dekimasu (you can
# top it up at that machine) opened on 9 Oct 2026 on the strength of ano and
# dekimasu, with kikai and chaaji never taught. Every token must now be a
# linked card, one of its forms, a fusion the linker splits, or a pattern.
_unc=_LS.guard_uncovered(_s, _d, _fm)
if _unc:
    _unc=sorted(set(_unc))
    raise SystemExit('these sentences use a word no linked card covers, so the '
                     'readability gate cannot see it: ' + ', '.join(_unc[:12]) +
                     (' and %d more' % (len(_unc)-12) if len(_unc)>12 else ''))
# The guard proves itself on every build: a sentence carrying a word with no
# card, and one with its word unlinked, must both be refused, or a guard that
# had quietly stopped working would pass everything above.
_probe=[dict(_s[0], id='probe-a', romaji=_s[0]['romaji'].rstrip('.')+' zzqx.'),
        dict(next(_x for _x in _s if _x['id']=='nT005'), id='probe-b',
             w=[_w for _w in next(_x for _x in _s if _x['id']=='nT005')['w'] if _w!='c1812'])]
_pr=_LS.guard_uncovered(_probe, _d, _fm)
assert any(_m.startswith('probe-a uses zzqx') for _m in _pr) and \
       any(_m.startswith('probe-b uses kikai') for _m in _pr), \
    'the uncovered-word guard no longer refuses a word without a card: %r' % _pr

# ---- guard: one sound, one card ----
# ni is both "two" and the particle, ima both "now" and "living room", kaze both
# "wind" and "a cold". Linking both twins for one occurrence made 251 sentences
# wait for ni (two), 11 "now" sentences wait for a living room and every cold
# sentence wait for the wind. Two cards with the same romaji may share a
# sentence only if the sound occurs twice in it (a number fused into a counter,
# as in sen nihyaku en ni narimasu, counts as an occurrence).
_twins=_LS.guard_twins(_s, _d)
if _twins:
    raise SystemExit('these sentences link two cards for one occurrence of a sound, '
                     'so the gate waits for a word the sentence does not use: ' + ', '.join(_twins[:12]))

# ---- guard: every word carries one worked example, and it resolves ----
# A word on its own teaches recognition and nothing about use. Every word card
# now shows one sentence on its back. Where the deck already has a sentence the
# example is a reference to it and costs nothing; where it does not, the line is
# carried inline. Either way the page must be able to resolve it, or the card
# shows an empty box.
_ex = _j.loads(examples)
_sids = {_x['id'] for _x in _s}
_sbyid = {_x['id']: _x for _x in _s}
_bykana = _c.defaultdict(list)
for _e in _d: _bykana[_e['kana']].append(_e['id'])
_shared_kana = {_i for _v in _bykana.values() if len(_v) > 1 for _i in _v}
_page_ex = {}
def _stems(_e):
    # what an inflected word or pattern leaves standing in a sentence: the
    # stem of a verb or adjective (hara ga tachimashita for hara ga tatsu), the
    # noun of a suru compound (junbi o shite imasu), a pattern without its
    # conjugating tail (koto ni shimashita, shika arimasen), and te-patterns
    # after a verb whose te-form ends in de (yonde imasu for te imasu)
    _k = _K.kata2hira(_e['kana']); _out = []
    if _e.get('pos') not in ('verb', 'adj-i', 'expr'): return _out
    if _k.endswith('する') and len(_k) > 2: _out.append(_k[:-2])
    if _k.endswith('ない') and len(_k) > 2: _out.append(_k[:-2])
    if len(_k) >= 2: _out.append(_k[:-1])
    _out += ['で' + _o[1:] for _o in _out if _o.startswith('て')]
    return [_o for _o in _out if _o]
def _face(_row, _i):
    # the request form stands for its te-form: utte kudasai is found as utte
    _k = _row[_i+1]
    return _k[:-len('ください')] if _row[_i] == 'tekudasai' else _k
for _e in _d:
    _v = _ex.get(_e['id'])
    assert _v, 'word %s (%s) has no example sentence' % (_e['id'], _e['romaji'])
    if isinstance(_v, str):
        assert _v in _sids, 'the example for %s points at missing sentence %s' % (_e['id'], _v)
        # A borrowed sentence has to actually contain the word, or the card
        # teaches whatever the sentence happens to be about. And a card whose
        # kana is shared with another card can never borrow one at all: the
        # same sentence fits both spellings, so half of every such pair would
        # be taught the wrong meaning, which is exactly what happened to hana
        # (nose) being illustrated with flowers.
        assert _e['id'] not in _shared_kana, \
            ('%s shares its kana with another card, so it cannot borrow sentence %s; '
             'it needs an example written for it' % (_e['id'], _v))
        _x = _sbyid[_v]
        _row = _fm.get(_e['id'])
        # (the same test tests/examples_check.js makes, kept strict on purpose)
        _hit = (_e['kana'] in _x['kana']
                or _e['id'] in (_x.get('g') or {})
                or (_row and any(_row[_i+1] in _x['kana'] for _i in range(0, len(_row), 3)))
                or (_e.get('pos') in ('verb', 'adj-i') and len(_e['kana']) > 2
                    and _e['kana'][:-1] in _x['kana']))
        assert _hit, ('the example for %s (%s) is sentence %s, which does not contain it: %s'
                      % (_e['id'], _e['romaji'], _v, _x['romaji']))
        _page_ex[_e['id']] = _v
    else:
        assert len(_v) == 3 and _v[1].strip() and _v[2].strip(), \
            'the written example for %s is not kana, romaji and English' % _e['id']
        # check_sentence returns a (verdict, detail) pair, and a non-empty tuple
        # is always true: asserting on the pair itself could never fail
        assert _K.check_sentence(_v[0], _v[1])[0] == 'OK', \
            'the written example for %s does not read as its romaji: %s / %s' % (_e['id'], _v[0], _v[1])
        # A written example has to contain its word, the same test a borrowed
        # one passes: okanjou onegai shimasu was illustrated with okaikei.
        _row = _fm.get(_e['id'])
        _vk = _K.kata2hira(_v[0]); _ek = _K.kata2hira(_e['kana'])
        _hit = (_ek in _vk
                or (_row and any(_K.kata2hira(_face(_row, _i)) in _vk for _i in range(0, len(_row), 3)))
                or any(_st in _vk for _st in _stems(_e))
                or (_e.get('say') and _K.kata2hira(_e['say']) in _vk))
        assert _hit, ('the written example for %s (%s) does not contain it: %s'
                      % (_e['id'], _e['romaji'], _v[1]))
        # the phone never shows the kana, so it never has to carry it
        _page_ex[_e['id']] = [_v[1], _v[2]]
# ---- guard: the spoken form of a bound counter ----
# A counter is a suffix. Spoken alone it is not Japanese, and the voice returns
# something no native says: fun arrived as "un". Those cards carry a say form,
# the smallest real word containing the suffix. Three things must hold or the
# card teaches a different word from the one on its face: the say form must
# actually contain the card's kana, it must read as its own romaji, and it must
# come with a gloss, because it is shown to a reader who cannot read kana.
_say_n = 0
for _e in _d:
    if not _e.get('say'):
        assert not _e.get('sayR') and not _e.get('sayE'), \
            '%s has a spoken gloss but no spoken form' % _e['id']
        continue
    assert _e.get('sayR') and _e.get('sayE'), \
        'the spoken form of %s needs both romaji and an English gloss' % _e['id']
    assert _e['kana'] in _e['say'], \
        'the spoken form of %s (%s) does not contain the card itself (%s)' \
        % (_e['id'], _e['say'], _e['kana'])
    assert _e['say'] != _e['kana'], \
        'the spoken form of %s is just the card again' % _e['id']
    assert _K.check_sentence(_e['say'], _e['sayR'])[0] == 'OK', \
        'the spoken form of %s does not read as its romaji: %s / %s' \
        % (_e['id'], _e['say'], _e['sayR'])
    # A word ending in n is where the phone's voice is least reliable: it
    # releases the nasal into an audible vowel, so gofun came back as
    # "go-fun-o". Every spoken form ends on a real vowel instead, which is
    # also how the counter is actually heard in a sentence.
    assert not _e['say'].endswith('\u3093'), \
        ('the spoken form of %s (%s) ends in n, which the device voice renders '
         'with a trailing vowel; put it in a phrase that ends on a vowel'
         % (_e['id'], _e['say']))
    _say_n += 1
print('spoken forms: %d bound counters given a real word to be said in' % _say_n)

examples = _j.dumps(_page_ex, ensure_ascii=False, separators=(',', ':'))
print('examples: %d words, %d pointing at a deck sentence, %d written inline'
      % (len(_page_ex), sum(1 for _v in _page_ex.values() if isinstance(_v, str)),
         sum(1 for _v in _page_ex.values() if not isinstance(_v, str))))

# ---- guard: a scene is made of sentences that exist, and has a part for him ----
_scenes=_j.loads(scenes_src)
_sid={x['id'] for x in _s}
for _sc in _scenes:
    assert _sc.get('id') and _sc.get('title') and _sc.get('lines'), 'scene without id, title or lines: %r' % _sc.get('id')
    for _l in _sc['lines']:
        assert _l['sid'] in _sid, 'scene %s names a sentence that does not exist: %s' % (_sc['id'], _l['sid'])
        assert _l['who'] in ('you','them'), 'scene %s line %s has no speaker' % (_sc['id'], _l['sid'])
    assert any(_l['who']=='you' for _l in _sc['lines']), 'scene %s has no line for him to say' % _sc['id']
    assert len(_sc['lines'])<=11, 'scene %s is too long to rehearse (%d lines)' % (_sc['id'], len(_sc['lines']))
_scene_ids=[_sc['id'] for _sc in _scenes]
assert len(set(_scene_ids))==len(_scene_ids), 'duplicate scene id'
scenes_src=_j.dumps(_scenes, ensure_ascii=False, separators=(',', ':'))

# ---- the English a card is read aloud as (council item 1, his own request) ----
# A gloss is written to be read: "this ~ (before a noun)", "to / at / in (time,
# destination)", "certainly, said by staff". Read aloud it became "this tilde
# before a noun" and "to slash at slash in". tools/spoken.py turns a gloss into
# what a person would say, and every card whose spoken form differs from its
# gloss carries it as "sy"; car mode speaks sy, and the "we:" clips are
# rendered from it by the same function. Cleaning makes some glosses identical
# (ohayou and ohayou gozaimasu are both "good morning"); a card in such a group
# carries "sq" and is never asked English to Japanese by voice alone, because
# the spoken prompt has two right answers.
from spoken import spoken_en as _spoken, spoken_key as _skey, BAD as _SBAD
def _with_sy(_items, _what):
    _n=0
    for _e in _items:
        _sy=_spoken(_e['en'])
        assert _sy and _sy.strip(), 'the spoken form of %s %s is empty: %r' % (_what, _e['id'], _e['en'])
        assert not _SBAD.search(_sy), \
            'the spoken form of %s %s still carries ~ ( ) [ ] / or ;: %r' % (_what, _e['id'], _sy)
        if _sy != _e['en']: _e['sy']=_sy; _n+=1
        else: _e.pop('sy', None)
    return _n
_sy_d=_with_sy(_d, 'card')
_grp=_c.defaultdict(list)
for _e in _d:
    _e.pop('sq', None)
    if not _e.get('dup'): _grp[_skey(_e.get('sy') or _e['en'])].append(_e)
_sq_n=0
for _v in _grp.values():
    if len(_v) > 1:
        for _e in _v: _e['sq']=1; _sq_n+=1
_sy_s=_with_sy(_s, 'sentence')
_sy_a=_with_sy(_cj, 'anchor')
deck=_j.dumps(_d, ensure_ascii=False, separators=(',', ':'))
if _sy_s: sent=_j.dumps(_s, ensure_ascii=False, separators=(',', ':'))
if _sy_a: conj=_j.dumps(_cj, ensure_ascii=False, separators=(',', ':'))
print('spoken English: %d cards read differently from their gloss, %d cards in %d groups '
      'that sound alike once cleaned; %d sentences, %d anchors changed'
      % (_sy_d, _sq_n, sum(1 for _v in _grp.values() if len(_v) > 1), _sy_s, _sy_a))

# ---- guard: pattern cards, staff phrases and the survival pack ----
# A pattern card (mashou, tai desu, temo ii desu ka) names the verbs any one of
# which unlocks it ("needs"); they must be verbs. "rec" marks a phrase only
# staff say. "pk" orders the survival pack: one to N, no gaps, no repeats,
# every one a line he says.
_byid_d={c['id']:c for c in _d}
for _e in _d:
    for _v in _e.get('needs') or []:
        assert _v in _byid_d and _byid_d[_v]['pos']=='verb', \
            'pattern card %s needs %s, which is not a verb in the deck' % (_e['id'], _v)
    assert _e.get('rec') in (None, 1), 'rec on %s must be 1' % _e['id']
_pk=sorted((_x['pk'], _x['id']) for _x in _s if _x.get('pk'))
assert [p for p, _i in _pk]==list(range(1, len(_pk)+1)), 'the survival pack order has gaps or repeats: %r' % _pk
for _p, _i in _pk:
    assert _sbyid[_i].get('say'), 'pack phrase %s is not marked as a line he says' % _i

# ---- particle minimal pairs (council item 8) ----
# Two sentences that differ ONLY in the particle, with different English: the
# engine shows them side by side and asks which is which. A pair that differs
# in anything else teaches the other difference instead.
_pairs=_j.load(open(R('deck','pairs.json'),encoding='utf-8'))
_pids=set()
for _pp in _pairs:
    assert _pp['id'] not in _pids, 'duplicate pair id %s' % _pp['id']; _pids.add(_pp['id'])
    _pa, _pb = _pp['p']; _sa, _sb = _pp['s']
    for _w in (_pa, _pb):
        assert _w in _byid_d and _byid_d[_w]['pos']=='particle', 'pair %s names %s, not a particle card' % (_pp['id'], _w)
    for _i in (_sa, _sb):
        assert _i in _sbyid, 'pair %s names a missing sentence %s' % (_pp['id'], _i)
    _ta, _tb = _LS.toks(_sbyid[_sa]['romaji']), _LS.toks(_sbyid[_sb]['romaji'])
    _diff=[(_x, _y) for _x, _y in zip(_ta, _tb) if _x != _y]
    assert len(_ta)==len(_tb) and len(_diff)==1, \
        'pair %s is not a minimal pair: %s / %s' % (_pp['id'], _sbyid[_sa]['romaji'], _sbyid[_sb]['romaji'])
    assert {_diff[0][0], _diff[0][1]}=={_byid_d[_pa]['romaji'], _byid_d[_pb]['romaji']}, \
        'pair %s differs in %r, not in its particles %s and %s' % (_pp['id'], _diff[0], _pa, _pb)
    assert _gloss(_sbyid[_sa]['en'])!=_gloss(_sbyid[_sb]['en']), 'pair %s has one English for two sentences' % _pp['id']
pairs_src=_j.dumps(_pairs, ensure_ascii=False, separators=(',', ':'))
print('particle pairs: %d' % len(_pairs))

# ---- guard: house style of romaji and English (council item 54) ----
# A syllabic n before a vowel or y is written n' (kin'youbi, ten'in), found by
# aligning kana to romaji rather than guessed from letters; onegai shimasu is
# two words; the hour counter is joined (shichiji); yen stands apart (hyaku
# en); isshoni is one word. And no English field carries an em or en dash.
import romaji_rules as _RR
_style=[]
def _rchk(_kn, _rm, _where):
    if _RR.needs_apostrophe(_kn, _rm): _style.append("%s needs n': %s" % (_where, _rm))
    if _RR.spacing_fix(_rm) != _rm: _style.append('%s spacing: %s' % (_where, _rm))
for _e in _d: _rchk(_e['kana'], _e['romaji'], _e['id'])
for _x in _s: _rchk(_x['kana'], _x['romaji'], _x['id'])
for _k, _v in _ex.items():
    if isinstance(_v, list): _rchk(_v[0], _v[1], 'example ' + _k)
for _a in _cj: _rchk(_a['kana'], _a['romaji'], _a['id'])
for _wid, _row in _fm.items():
    for _i in range(0, len(_row), 3): _rchk(_row[_i+1], _row[_i+2], 'form %s %s' % (_wid, _row[_i]))
_DASH=_re.compile('[' + chr(0x2013) + chr(0x2014) + ']')   # en and em dash
def _dchk(_t, _where):
    if isinstance(_t, str) and _DASH.search(_t): _style.append('%s has a dash: %s' % (_where, _t))
for _e in _d:
    for _f in ('en', 'sayE'): _dchk(_e.get(_f), _e['id'])
for _x in _s: _dchk(_x['en'], _x['id'])
for _k, _v in _ex.items():
    if isinstance(_v, list): _dchk(_v[2], 'example ' + _k)
for _a in _cj:
    for _f in ('en', 'baseEn', 'formEn', 'use', 'rule'): _dchk(_a.get(_f), _a['id'])
for _sc in _scenes:
    _dchk(_sc['title'], _sc['id']); _dchk(_sc['en'], _sc['id'])
assert not _style, 'romaji or English breaks the house style: ' + '; '.join(_style[:12])

# ---- the kanji reading table for grading speech ----
# The phone's recogniser writes kanji. The learner's targets are kana. Every
# deck card that has a kanji spelling gives one replacement, and a stem pair
# besides so conjugated forms convert too: 使う / つかう yields 使 -> つか, which
# turns 使えます into つかえます. Longest spelling first, so a longer match is
# never broken by a shorter one inside it.
_hira=lambda ch: '\u3041'<=ch<='\u3096' or ch in 'ー'
_kmap={}
def _put(k,v):
    if k and v and k!=v and k not in _kmap: _kmap[k]=v
for _c in _d:
    _kj,_kn=_c.get('kanji') or '',_c.get('kana') or ''
    if not _kj or _kj==_kn: continue
    _put(_kj,_kn)
    # strip the common trailing kana (okurigana) to get a stem pair
    _n=0
    while _n<min(len(_kj),len(_kn)) and _kj[-1-_n]==_kn[-1-_n] and _hira(_kj[-1-_n]): _n+=1
    if _n and len(_kj)-_n>0 and len(_kn)-_n>0:
        _put(_kj[:len(_kj)-_n], _kn[:len(_kn)-_n])
_kanji_tbl=sorted(_kmap.items(), key=lambda kv: -len(kv[0]))
kanji_src=_j.dumps(_kanji_tbl, ensure_ascii=False, separators=(',', ':'))
print('scenes: %d scenes, %d lines; kanji readings: %d' % (len(_scenes), sum(len(x['lines']) for x in _scenes), len(_kanji_tbl)))

print('guards passed: %d words, %d sentences, %d anchors, %d generated forms, all romaji verified'
      % (len(_d), len(_s), len(_cj), _forms_n))

tail=('\n<script type="application/json" id="deck-data">'+deck+'</script>'
      '\n<script type="application/json" id="sent-data">'+sent+'</script>'
      '\n<script type="application/json" id="conj-data">'+conj+'</script>'
      '\n<script type="application/json" id="forms-data">'+forms+'</script>'
      '\n<script type="application/json" id="example-data">'+examples+'</script>'
      '\n<script type="application/json" id="scenes-data">'+scenes_src+'</script>'
      '\n<script type="application/json" id="pairs-data">'+pairs_src+'</script>'
      '\n<script type="application/json" id="kanji-data">'+kanji_src+'</script>'
      '\n<script>\n'+js+'\n</script>\n')

# ---- PWA: complete standalone document ----
reset=('<style>\n*,*::before,*::after{box-sizing:border-box}\nhtml{-webkit-text-size-adjust:100%}\n'
       'body{margin:0}\nimg{max-width:100%}\n[hidden]{display:none!important}\n</style>')
pwa=('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
 '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
 '<title>Kana Ladder</title>\n'
 '<meta name="description" content="A '+'{:,}'.format(len(_d))+'-word Japanese vocabulary trainer on the FSRS spaced repetition schedule.">\n'
 '<link rel="manifest" href="manifest.webmanifest">\n'
 '<meta name="theme-color" content="#F6F2EA" media="(prefers-color-scheme: light)">\n'
 '<meta name="theme-color" content="#151412" media="(prefers-color-scheme: dark)">\n'
 '<meta name="color-scheme" content="light dark">\n'
 '<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="mobile-web-app-capable" content="yes">\n'
 '<meta name="apple-mobile-web-app-status-bar-style" content="default">\n'
 '<meta name="apple-mobile-web-app-title" content="Kana Ladder">\n'
 '<meta name="robots" content="noindex,nofollow">\n'
 '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">\n'
 '<link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png">\n'
 + reset + '\n<style>\n'+fonts+'\n</style>\n<style>'+style+'</style>\n'
 '<style>\nbody{overscroll-behavior-y:contain}\n</style>\n</head>\n<body>\n' + body + tail + '</body>\n</html>\n')
open(R('pwa', 'index.html'),'w',encoding='utf-8').write(pwa)

# ---- Artifact: content only, wrapper supplies doctype/head/body ----
# The reset belongs here too. Without it the only rule hiding a [hidden]
# element is the user agent's, which a class that sets display beats, so
# panels the app hides by attribute stayed on screen and intercepted taps
# in this variant alone. Two builds of one app must not disagree on what
# hidden means, and the test suites run against this one.
art=('<title>Kana Ladder</title>\n'
 '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
 '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
 + reset + '\n'
 '<style>\n'+fonts+'\n</style>\n<style>'+style+'</style>\n' + body + tail)
open(R('app', 'index.html'),'w',encoding='utf-8').write(art)

# ---- local preview of the PWA build ----
open(R('build', 'preview.html'),'w',encoding='utf-8').write(pwa)
print('pwa',len(pwa),'artifact',len(art))
