import os
# project root resolves from this file, so the tree can live anywhere
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def R(*p): return os.path.join(ROOT, *p)
B = R('build') + os.sep
style=open(B+'style.css',encoding='utf-8').read()
fonts=open(B+'fonts.css',encoding='utf-8').read()
body=open(B+'body.html',encoding='utf-8').read()
js=open(B+'app.core.js',encoding='utf-8').read()
_audio_ok = os.path.exists(R('pwa','audio','v1','manifest.json'))
js=js.replace('__AUDIO_SHIPPED__', 'true' if _audio_ok else 'false')
deck=open(R('deck', 'deck_full.json'),encoding='utf-8').read()
sent=open(R('sentences', 'sent_full.json'),encoding='utf-8').read()
conj=open(R('conj', 'anchors.json'),encoding='utf-8').read()
forms=open(R('conj', 'forms.json'),encoding='utf-8').read()

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
for _wid, _row in _fm.items():
    assert _wid in _ids, 'forms table names a missing word %s' % _wid
    assert len(_row) % 3 == 0 and 12 <= len(_row) <= 21, \
        'forms row %s has %d entries' % (_wid, len(_row))
    _NAMES={'masu','mashita','masen','masendeshita','potential','te','tai',
            'past','politepast','neg'}
    _kanas=[_row[_i+1] for _i in range(0, len(_row), 3)]
    assert len(set(_kanas))==len(_kanas), \
        'forms row %s repeats a form, so two questions share one answer: %r' % (_wid, _kanas)
    for _i in range(0, len(_row), 3):
        assert _row[_i] in _NAMES, 'forms row %s has an unknown form name %r' % (_wid, _row[_i])
        assert _K.check(_row[_i+1], _row[_i+2])[0] == 'OK', \
            'generated form %s does not match its romaji: %s / %s' % (_wid, _row[_i+1], _row[_i+2])
        _forms_n += 1
print('guards passed: %d words, %d sentences, %d anchors, %d generated forms, all romaji verified'
      % (len(_d), len(_s), len(_cj), _forms_n))

tail=('\n<script type="application/json" id="deck-data">'+deck+'</script>'
      '\n<script type="application/json" id="sent-data">'+sent+'</script>'
      '\n<script type="application/json" id="conj-data">'+conj+'</script>'
      '\n<script type="application/json" id="forms-data">'+forms+'</script>'
      '\n<script>\n'+js+'\n</script>\n')

# ---- PWA: complete standalone document ----
reset=('<style>\n*,*::before,*::after{box-sizing:border-box}\nhtml{-webkit-text-size-adjust:100%}\n'
       'body{margin:0}\nimg{max-width:100%}\n[hidden]{display:none!important}\n</style>')
pwa=('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
 '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
 '<title>Kana Ladder</title>\n'
 '<meta name="description" content="A 1,000-word Japanese vocabulary trainer on the SM-2 spaced repetition schedule.">\n'
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
