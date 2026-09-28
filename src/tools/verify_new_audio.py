"""Check every clip the last render drew fresh (not copied from the shipped
library): English by transcription against the spoken text, with a hard
failure on any "tilde", "slash" or bracket word read aloud; Japanese by
transcription compared phoneme to phoneme, plus a duration sanity check."""
import json, os, sys, re, difflib, io, wave, subprocess
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('AUDIO_OUT','/home/claude/audio_new/v1')
import voice as V
SR=16000
def pcm(b):
    p=subprocess.run(['ffmpeg','-loglevel','error','-y','-i','pipe:0','-f','wav','-ar',str(SR),'-ac','1','pipe:1'],input=b,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    w=wave.open(io.BytesIO(p.stdout)); return np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').astype(np.float32)/32768.0
def main():
    out=V.OUT
    g=V.plan(); oi=V.old_plan_items(); V.load_reuse('/home/claude/pwa/audio/v1', oi)
    man=json.load(open(os.path.join(out,'manifest.json')))
    todo=[]
    for sp,items in g.items():
        base=man['files'][sp]; idx=json.load(open(os.path.join(out,base+'.json'))); blob=open(os.path.join(out,base+'.mp3'),'rb').read()
        for key,lang,text,kind in items:
            if (lang,text,kind) in V.REUSE: continue
            off,ln=idx[key]; todo.append((key,lang,text,kind,blob[off:off+ln]))
    print('fresh clips to verify:',len(todo),flush=True)
    from faster_whisper import WhisperModel
    from piper import PiperVoice
    en=WhisperModel('base.en',device='cpu',compute_type='int8')
    ja=WhisperModel(os.environ.get('JA_MODEL','small'),device='cpu',compute_type='int8')
    pv=PiperVoice.load('/tmp/claude-0/voices/ja.onnx')
    def ph(t):
        try: return ''.join(x for s in pv.phonemize(t) for x in s if x not in '↑↓,.?!# ').replace('ei','ee').replace('ou','oo')
        except Exception: return ''
    pad=np.zeros(SR,dtype=np.float32); bad=[]; res=[]
    for n,(key,lang,text,kind,b) in enumerate(todo):
        a=pcm(b); dur=len(a)/SR
        if lang=='en':
            segs,_=en.transcribe(np.concatenate([pad,a,pad]),language='en',beam_size=5,condition_on_previous_text=False)
            got=' '.join(s.text for s in segs).strip()
            gw=re.sub(r'[^a-z0-9 ]',' ',got.lower()).split(); ww=re.sub(r'[^a-z0-9 ]',' ',text.lower()).split()
            r=difflib.SequenceMatcher(None,ww,gw).ratio()
            leak=bool(re.search(r'\b(tilde|slash|bracket|parenthes)',got.lower()))
            ok=(not leak) and (r>=0.6 or ' '.join(ww) in ' '.join(gw))
        else:
            segs,_=ja.transcribe(np.concatenate([pad,a,pad]),language='ja',beam_size=5,condition_on_previous_text=False,vad_filter=False)
            got=''.join(s.text for s in segs).strip()
            w,gp=ph(text),ph(got); r=difflib.SequenceMatcher(None,w,gp).ratio() if w and gp else 0
            m=V.morae(text) if hasattr(V,'morae') else len(text)
            per=dur/max(1,m)
            ok=(r>=0.75 or (w and w in gp)) and 0.05<=per<=0.6
        res.append({'key':key,'text':text,'got':got,'ratio':round(r,2),'dur':round(dur,2),'ok':bool(ok)})
        if not ok: bad.append(res[-1])
        if n%50==0: print(n,len(bad),flush=True)
    json.dump(res,open('/home/claude/audio_verify.json','w'),ensure_ascii=False,indent=0)
    print('checked',len(res),'flagged',len(bad))
    for x in bad[:80]: print(x)
if __name__=='__main__': main()
