# -*- coding: utf-8 -*-
"""Install a chosen set of single-kana clips as the course audio (sprite k-000).

    python3 kana_audio_build.py selection.json

selection.json: {"<audio id>": {"path": "<wav>", "src": "<where it came from>"}, ...}
Every clip listed must already have passed the accuracy gate (see
kana_audio_select.py); this script only cleans, encodes and packs. It writes
audio/v1/k-000.<hash>.mp3 and .json and the manifest's "k-000" and "kana"
entries ({src, ids, from: {id: source}}). tools/voice.py keeps both.
"""
import json, os, sys, hashlib, subprocess, tempfile, time
HERE=os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import kana_audio_import as K
AUD=os.environ.get('KANA_AUDIO_OUT') or os.path.join(HERE,'..','..','audio','v1')
sel=json.load(open(sys.argv[1]))
work=tempfile.mkdtemp(prefix='kana_build_')
index={}; blob=bytearray()
for sid in sorted(sel):
    w=os.path.join(work,sid+'.wav'); K.ffmpeg_to_wav(sel[sid]['path'], w)
    y=K.clean(K.read_wav(w))
    if y is None: raise SystemExit('%s: no sound in %s' % (sid, sel[sid]['path']))
    K.write_wav(w, y)
    mp=os.path.join(work,sid+'.mp3')
    subprocess.run(['ffmpeg','-v','error','-y','-i',w,'-ac','1','-ar','44100','-b:a','48k',mp],check=True)
    b=open(mp,'rb').read(); index['kj:'+sid]=[len(blob),len(b)]; blob+=b
body=bytes(blob); idx=json.dumps(index,separators=(',',':'))
h=hashlib.sha1(body+idx.encode()).hexdigest()[:8]; base='k-000.'+h
for f in os.listdir(AUD):
    if f.startswith('k-000.') and not f.startswith(base): os.remove(os.path.join(AUD,f))
open(os.path.join(AUD,base+'.mp3'),'wb').write(body); open(os.path.join(AUD,base+'.json'),'w').write(idx)
mp=os.path.join(AUD,'manifest.json'); m=json.load(open(mp))
m['sprites']['k-000']={'bytes':len(body),'clips':len(index)}; m['files']['k-000']=base; m['sigs']['k-000']='gated-'+h
srcs=sorted({v['src'].split(':')[0] for v in sel.values()})
m['kana']={'src':'+'.join(srcs),'at':time.strftime('%Y-%m-%d'),'ids':sorted(sel),'from':{k:v['src'] for k,v in sel.items()}}
json.dump(m,open(mp,'w'),separators=(',',':'))
print('installed %s: %d sounds (%s)' % (base, len(index), ', '.join(srcs)))
