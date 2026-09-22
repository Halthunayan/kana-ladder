const {chromium}=require('playwright');
const fails=[]; const ok=(c,m)=>{ if(c) console.log('  PASS  '+m); else { fails.push(m); console.log('  FAIL  '+m);} };
(async()=>{
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const ctx=await b.newContext({viewport:{width:393,height:852}});
await ctx.addInitScript(()=>{
  // capture every utterance instead of speaking it
  window.__spoken=[];
  const v=[{lang:'ja-JP',name:'Kyoko'},{lang:'ja-JP',name:'Otoya'}];
  // a plain stand-in for the utterance, so a stubbed voice can actually be set
  window.SpeechSynthesisUtterance=function(t){ this.text=t; this.lang=''; this.rate=1; this.voice=null; this.volume=1; };
  try{ Object.defineProperty(window.speechSynthesis,'getVoices',{value:()=>v}); }catch(e){}
  /* onstart has to fire. The app now treats an utterance that never starts as
     a voice iOS lists but cannot speak with, and says the line again without
     naming one. A stub that records and stays silent looks exactly like that
     fault, and the reveal assertion below then sees the retry. */
  /* The silent trial the app runs on each voice is at volume 0 and is not
     heard; recording it would make every assertion below count a phantom. */
  try{ window.speechSynthesis.speak=(u)=>{ if(u.volume!==0) window.__spoken.push({t:u.text,r:u.rate,v:u.voice&&u.voice.name});
         setTimeout(()=>{ u.onstart&&u.onstart(); u.onend&&u.onend(); },5); };
       window.speechSynthesis.cancel=()=>{}; }catch(e){}
  const now=Date.now(), items={};
  // c0114 taberu is a verb with a 30 day interval, so its anchors are open
  items['c0114|j']=[1,0,6,2.5,30,now+30*86400000,0,0,9,9,5,30,now-3*86400000];
  items['c0115|j']=[1,0,6,2.5,30,now-86400000,0,0,9,9,5,30,now-3*86400000];      // due now
  items['c0116|e']=[1,0,6,2.5,30,now-86400000,0,0,9,9,5,30,now-3*86400000];      // reverse, due now
  items['c0116|j']=[1,0,6,2.5,60,now+60*86400000,0,0,9,9,5,60,now-3*86400000];
  localStorage.setItem('kanaladder.v1', JSON.stringify({rev:99,
    settings:{sched:"fsrs",retention:0.9,newPerDay:0,revCap:150,reverse:"grad",
      sentences:false,conj:true,conjPerDay:2,listen:true,tts:true,autoPlay:true,
      speechRate:0.85,speechVary:true,theme:"dark",kanji:true},
    daily:{key:"",newDone:0,revDone:0,ans:0,ok:0}, hist:{}, streak:{cur:1,best:1,last:""},
    life:{ans:20,ok:18,practice:0}, log:[], items}));
});
const p=await ctx.newPage(); const errs=[];
p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
await p.goto('http://localhost:8100/index.html'); await p.waitForTimeout(1400);
await p.evaluate(()=>{ __kl.TTS.ja=true; __kl.TTS.voices=speechSynthesis.getVoices(); });

/* Both channels, merged and normalised. speakCard plays the pre-rendered clip
   whenever the library is reachable and only falls back to speechSynthesis
   when it is not, so a helper that reads window.__spoken alone reports silence
   on exactly the path a phone with the library takes. A clip entry is turned
   back into the kana it holds so the assertions below can stay as they are. */
const clear=()=>p.evaluate(()=>{ window.__spoken=[]; __kl.AUD.log.length=0; });
const spoken=()=>p.evaluate(()=>{
  const out=window.__spoken.map(x=>({t:x.t, r:x.r, v:x.v, via:'voice'}));
  for(const e of (__kl.AUD.log||[])){
    const parts=(e.k||'').split(':');
    let t=e.k;
    if(parts[0]==='fj'){                       // a conjugated form: text is in the word's table
      const row=(__kl.FORMS||{})[parts[1]]||[]; t=row[(+parts[2])*3+1]||e.k;
    } else {
      const c=__kl.IDX[parts[1]] || (__kl.SENT||[]).find(x=>x.id===parts[1]);
      t=c? c.kana : e.k;
    }
    out.push({t:t, r:e.pb||1, v:null, via:'clip'});
  }
  return out;
});

console.log('\n1. a Japanese to English card speaks as it appears');
await clear();
await p.click('#startBtn'); await p.waitForTimeout(500);
let info=await p.evaluate(()=>({dir:__kl.sess().key.split('|')[1], kana:__kl.cardOf(__kl.sess().key).kana,
  conj:__kl.isConj(__kl.cardOf(__kl.sess().key))}));
let sp=await spoken();
console.log('   first card: '+info.dir+(info.conj?' (conjugation)':'')+' '+info.kana+' -> spoke '+JSON.stringify(sp));
if(info.dir==='j' && !info.conj){
  ok(sp.length===1 && sp[0].t===info.kana,'it played the kana on the front without a tap');
  await clear();
  await p.click('#showBtn'); await p.waitForTimeout(300);
  const sp2=await spoken();
  ok(sp2.length===0,'it did not play the same word again on reveal');
} else { console.log('   SKIP  first card was not a plain JP to EN card'); }

console.log('\n2. rate is jittered, and no voice is named');
/* Jitter belongs to the device voice: a clip plays at the rate the card asks
   for and nothing else. The library is the voice on cards now, so this section
   puts the device voice back in front for its own run, which is the thing it
   was written to check. */
await p.evaluate(()=>{ __kl.S.settings.cardAudio=false; });
await clear();
for(let i=0;i<8;i++){
  const s=await p.$('#showBtn'); if(s&&await s.isVisible()){await s.click();await p.waitForTimeout(40);}
  const g=await p.$('.grade.g2'); if(g&&await g.isVisible()){await g.click();await p.waitForTimeout(120);} else break;
}
const all=await spoken();
const rates=[...new Set(all.map(x=>x.r&&x.r.toFixed(3)))];
const voices=[...new Set(all.map(x=>x.v))];
ok(rates.length>1,'playback rate varies across cards: '+rates.join(', '));
/* Voices used to be rotated. His phone offers only compressed ones, and an
   utterance that names none is given a voice iOS does not advertise which
   sounds markedly better, so naming any of them is a restriction rather than
   variety. The variety that remains, and that matters, is the rate. */
ok(voices.every(v=>!v),'no card names a voice, leaving the choice to the engine: '+JSON.stringify(voices));
ok(all.every(x=>x.r>=0.70 && x.r<=1.00),'every rate stayed inside the expected band');

await p.evaluate(()=>{ __kl.S.settings.cardAudio=true; });
console.log('\n3. an English to Japanese card stays silent until the answer');
{
const ctx2=await b.newContext({viewport:{width:393,height:852}});
await ctx2.addInitScript(()=>{
  window.__spoken=[];
  const v=[{lang:'ja-JP',name:'Kyoko'}];
  try{ Object.defineProperty(window.speechSynthesis,'getVoices',{value:()=>v}); }catch(e){}
  try{ window.speechSynthesis.speak=(u)=>{ if(u.volume!==0) window.__spoken.push({t:u.text}); };
       window.speechSynthesis.cancel=()=>{}; }catch(e){}
  const now=Date.now(), items={};
  items['c0116|j']=[1,0,6,2.5,60,now+60*86400000,0,0,9,9,5,60,now-3*86400000];
  items['c0116|e']=[1,0,6,2.5,30,now-86400000,0,0,9,9,5,30,now-3*86400000];
  localStorage.setItem('kanaladder.v1', JSON.stringify({rev:99,
    settings:{sched:"fsrs",retention:0.9,newPerDay:0,revCap:150,reverse:"grad",
      sentences:false,conj:false,listen:false,tts:true,autoPlay:true,theme:"dark",kanji:true},
    daily:{key:"",newDone:0,revDone:0,ans:0,ok:0}, hist:{}, streak:{cur:1,best:1,last:""},
    life:{ans:20,ok:18,practice:0}, log:[], items}));
});
const p2=await ctx2.newPage();
await p2.goto('http://localhost:8100/index.html'); await p2.waitForTimeout(1400);
await p2.evaluate(()=>{ __kl.TTS.ja=true; __kl.TTS.voices=speechSynthesis.getVoices(); });
await p2.click('#startBtn'); await p2.waitForTimeout(500);
const d=await p2.evaluate(()=>__kl.sess().key);
const before=await p2.evaluate(()=>window.__spoken.concat((__kl.AUD.log||[]).map(x=>({t:x.k}))));
ok(d.endsWith('|e'),'the card served is English to Japanese ('+d+')');
ok(before.length===0,'nothing was spoken while only the English was showing');
await p2.click('#showBtn'); await p2.waitForTimeout(300);
const after=await p2.evaluate(()=>window.__spoken.concat((__kl.AUD.log||[]).map(x=>({t:x.k}))));
ok(after.length===1,'the Japanese was read once the answer appeared');
await ctx2.close();
}

console.log('\n4. a conjugation card plays the dictionary form, never the answer');
{
const ctx3=await b.newContext({viewport:{width:393,height:852}});
await ctx3.addInitScript(()=>{
  window.__spoken=[];
  const v=[{lang:'ja-JP',name:'Kyoko'}];
  try{ Object.defineProperty(window.speechSynthesis,'getVoices',{value:()=>v}); }catch(e){}
  try{ window.speechSynthesis.speak=(u)=>{ if(u.volume!==0) window.__spoken.push({t:u.text}); };
       window.speechSynthesis.cancel=()=>{}; }catch(e){}
  const now=Date.now(), items={};
  items['c0115|j']=[1,0,6,2.5,30,now+30*86400000,0,0,9,9,5,30,now-3*86400000];
  localStorage.setItem('kanaladder.v1', JSON.stringify({rev:99,
    settings:{sched:"fsrs",retention:0.9,newPerDay:0,revCap:150,reverse:"off",
      sentences:false,conj:true,conjPerDay:2,listen:false,tts:true,autoPlay:true,theme:"dark",kanji:true},
    daily:{key:"",newDone:0,revDone:0,ans:0,ok:0}, hist:{}, streak:{cur:1,best:1,last:""},
    life:{ans:20,ok:18,practice:0}, log:[], items}));
});
const p3=await ctx3.newPage();
await p3.goto('http://localhost:8100/index.html'); await p3.waitForTimeout(1400);
await p3.evaluate(()=>{ __kl.TTS.ja=true; __kl.TTS.voices=speechSynthesis.getVoices(); });
await p3.click('#startBtn'); await p3.waitForTimeout(500);
const c=await p3.evaluate(()=>{const x=__kl.cardOf(__kl.sess().key);
  return {conj:__kl.isConj(x), base:x.base, ans:x.kana,
          spoken:window.__spoken.concat((__kl.AUD.log||[]).map(y=>{const q=(y.k||'').split(':'); if(q[0]==='fj'){const row=(__kl.FORMS||{})[q[1]]||[]; return {t:row[(+q[2])*3+1]||y.k};} const c=__kl.IDX[q[1]]; return {t:c?c.kana:y.k};}))};});
ok(c.conj,'a conjugation anchor was served');
if(c.conj){
  console.log('   base '+c.base+' / answer '+c.ans+' -> spoke '+JSON.stringify(c.spoken.map(s=>s.t)));
  ok(c.spoken.length===1 && c.spoken[0].t===c.base,'it played the dictionary form');
  ok(!c.spoken.some(s=>s.t===c.ans),'it did not leak the answer');
  await p3.click('#showBtn'); await p3.waitForTimeout(300);
  const after=await p3.evaluate(()=>window.__spoken.concat((__kl.AUD.log||[]).map(y=>{const q=(y.k||'').split(':'); if(q[0]==='fj'){const row=(__kl.FORMS||{})[q[1]]||[]; return {t:row[(+q[2])*3+1]||y.k};} const c=__kl.IDX[q[1]]; return {t:c?c.kana:y.k};})));
  ok(after.some(s=>s.t===c.ans),'the conjugated form is read once revealed');
}
await ctx3.close();
}

console.log('\n5. the switch turns it off');
// follow-up cards have their own budget now, so a session can still be running here
await p.click('#quitBtn').catch(()=>{}); await p.waitForTimeout(300);
await p.click('.tab[data-go="set"]'); await p.waitForTimeout(400);
await p.click('#setAuto'); await p.waitForTimeout(300);
ok(await p.evaluate(()=>__kl.S.settings.autoPlay===false),'auto play flips off');
await p.click('.tab[data-go="home"]'); await p.waitForTimeout(300);
await clear();
await p.click('#startBtn').catch(()=>{}); await p.waitForTimeout(500);
const q=await spoken();
ok(q.length===0,'no card speaks by itself once it is off');
ok(errs.length===0, errs.length? errs.join(' | ') : 'no page errors');
await b.close();
console.log('\n'+(fails.length? fails.length+' FAILURES: '+fails.join('; ') : 'ALL AUDIO CHECKS PASSED'));
process.exit(fails.length?1:0);})();
