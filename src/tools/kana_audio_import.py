# -*- coding: utf-8 -*-
"""Install the native speaker's kana recordings as the course audio.

    python3 kana_audio_import.py kana-recordings-2026-10-20.json [--accept ka,ki] [--dry-run]

Input: the file the in-app recording studio exports (Settings, Kana voice
recordings), one take per distinct sound, or a folder of files named
<audio id>.<ext>. Each take is decoded with ffmpeg, high-passed at 70 Hz,
trimmed to the sound with a short pad, peak-normalised to -1 dBFS with 8 ms
fades, and checked by kana_verify.py (phoneme recogniser, Whisper on the
sound said three times, and structure). A take that fails is left out unless
it is named in --accept after a person has listened to it: the gate exists
because a wrong sound in a kana course teaches the wrong sound.

Output: one sprite, audio/v1/k-000.<hash>.mp3 and .json (48 kbit/s mono,
higher than the word library because a single sound has nothing around it
to mask artefacts), and the manifest's "k-000" entries plus a "kana" entry
{src, speaker, at, ids} that the app reads to know which sounds it may play.
tools/voice.py keeps these entries when it rebuilds the word library.
"""
import argparse, base64, hashlib, json, os, subprocess, sys, tempfile
import numpy as np
HERE=os.path.dirname(os.path.abspath(__file__))
ROOT=os.path.abspath(os.path.join(HERE,'..','..'))
AUD=os.environ.get('KANA_AUDIO_OUT') or os.path.join(ROOT,'audio','v1')
COURSE=os.path.join(HERE,'..','deck','kana_course.json')
SR=44100

def ffmpeg_to_wav(src, dst):
    subprocess.run(['ffmpeg','-v','error','-y','-i',src,'-ac','1','-ar',str(SR),'-af','highpass=f=70',dst],check=True)
def read_wav(p):
    import wave
    with wave.open(p) as w:
        x=np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16).astype(np.float32)/32768
    return x
def write_wav(p, x):
    import wave
    with wave.open(p,'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x,-1,1)*32767).astype(np.int16).tobytes())
def clean(x):
    """trim to the sound against the take's own noise floor, normalise loudness, fade"""
    hop=int(SR*0.01); n=len(x)//hop
    if n<5: return None
    e=np.array([np.sqrt(np.mean(x[i*hop:(i+1)*hop]**2))+1e-9 for i in range(n)])
    floor=np.percentile(e,10); th=max(floor*4, e.max()*0.01)    # 12 dB over the room, at most 40 dB under the peak
    on=np.where(e>th)[0]
    if not len(on): return None
    a=max(0,(on[0]-4)*hop); b=min(len(x),(on[-1]+8)*hop)
    y=x[a:b].copy()
    voiced=e[on[0]:on[-1]+1]; rms=np.sqrt(np.mean(voiced**2))
    if rms<1e-4: return None
    y=y*(10**(-20/20)/rms)                                     # every sound at the same loudness
    pk=np.max(np.abs(y)); lim=10**(-1/20)
    if pk>lim: y=y*(lim/pk)                                     # never above -1 dBFS
    f=int(SR*0.008); r=np.linspace(0,1,f); y[:f]*=r; y[-f:]*=r[::-1]
    pad=np.zeros(int(SR*0.06),np.float32)
    return np.concatenate([pad,y,pad])

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('--accept',default='')
    ap.add_argument('--dry-run',action='store_true')
    a=ap.parse_args()
    course=json.load(open(COURSE,encoding='utf-8')); sounds=course['sounds']
    ids=sorted({s['say'] for s in sounds.values()})
    work=tempfile.mkdtemp(prefix='kana_rec_'); raw=os.path.join(work,'raw'); cl=os.path.join(work,'clean'); os.makedirs(raw); os.makedirs(cl)
    speaker=''
    if os.path.isdir(a.src):
        for f in os.listdir(a.src):
            sid,ext=os.path.splitext(f)
            if sid in ids: ffmpeg_to_wav(os.path.join(a.src,f), os.path.join(raw,sid+'.wav'))
    else:
        d=json.load(open(a.src,encoding='utf-8'))
        assert d.get('kind')=='kana-ladder-recordings', 'not a recordings export'
        speaker=d.get('speaker','')
        for sid,it in d['items'].items():
            if sid not in ids: print('skipping unknown id',sid); continue
            ext={'audio/mp4':'.m4a','audio/webm':'.webm','audio/ogg':'.ogg','audio/wav':'.wav','audio/mpeg':'.mp3'}.get((it.get('mime') or '').split(';')[0],'.bin')
            p=os.path.join(work,sid+ext); open(p,'wb').write(base64.b64decode(it['b64']))
            ffmpeg_to_wav(p, os.path.join(raw,sid+'.wav'))
    got=[]
    for sid in ids:
        p=os.path.join(raw,sid+'.wav')
        if not os.path.exists(p): continue
        y=clean(read_wav(p))
        if y is None: print('  %s: no sound in the take' % sid); continue
        write_wav(os.path.join(cl,sid+'.wav'), y); got.append(sid)
    print('%d of %d sounds have a usable take' % (len(got), len(ids)))
    accept=set(x for x in a.accept.split(',') if x)
    bad=accept-set(got)
    if bad: raise SystemExit('--accept names sounds with no usable take: %s' % ','.join(sorted(bad)))
    passed=set()
    if True:
        rep=os.path.join(work,'verify.json')
        subprocess.run([sys.executable, os.path.join(HERE,'kana_verify.py'), cl, '--ext','wav','--out',rep])
        r=json.load(open(rep))
        rows=r.get('clips', r) if isinstance(r,dict) else r
        passed=set()
        for sid,v in (rows.items() if isinstance(rows,dict) else []):
            if v.get('pass') or sid in accept: passed.add(sid)
        fail=sorted(set(got)-passed)
        print('verified: %d pass, %d left out: %s' % (len(passed), len(fail), ','.join(fail)))
        print('report:', rep)
    if a.dry_run or not passed: return
    index={}; blob=bytearray()
    for sid in sorted(passed):
        mp=os.path.join(work,sid+'.mp3')
        subprocess.run(['ffmpeg','-v','error','-y','-i',os.path.join(cl,sid+'.wav'),'-ac','1','-ar','44100','-b:a','48k',mp],check=True)
        b=open(mp,'rb').read(); index['kj:'+sid]=[len(blob),len(b)]; blob+=b
    body=bytes(blob); idx=json.dumps(index,separators=(',',':'))
    h=hashlib.sha1(body+idx.encode()).hexdigest()[:8]; base='k-000.'+h
    open(os.path.join(AUD,base+'.mp3'),'wb').write(body); open(os.path.join(AUD,base+'.json'),'w').write(idx)
    mp=os.path.join(AUD,'manifest.json'); m=json.load(open(mp))
    m['sprites']['k-000']={'bytes':len(body),'clips':len(index)}; m['files']['k-000']=base; m['sigs']['k-000']='native-'+h
    m['kana']={'src':'native','speaker':speaker,'at':__import__('time').strftime('%Y-%m-%d'),'ids':sorted(passed)}
    json.dump(m,open(mp,'w'),separators=(',',':'))
    print('installed %s with %d sounds; manifest updated' % (base, len(index)))
if __name__=='__main__': main()
