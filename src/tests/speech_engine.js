/* Twice in one afternoon the app went completely silent, in both languages,
   while the pre-rendered audio kept playing. Both times the cause was code I
   had added to the speech path: a timer that spoke a line again when it had
   not started, and a silent trial utterance for each voice at boot. Both call
   cancel and speak in quick succession, which on iOS wedges the engine for the
   life of the page.
   This suite does not test a recovery mechanism, because there is no longer one
   to test. It asserts that speaking a line is one call and nothing else, which
   is the property that was lost. */
const {chromium}=require('playwright');
const fails=[]; const ok=(c,m)=>{ if(c) console.log('  PASS  '+m); else { fails.push(m); console.log('  FAIL  '+m);} };
const today=new Date(Date.now()-14400000).toISOString().slice(0,10);
const base=()=>({rev:9,
  settings:{sched:"fsrs",retention:0.9,newPerDay:12,revCap:150,separate:true,
    sentences:true,conj:true,listen:true,tts:true,autoPlay:false,typing:true,kanji:true,
    theme:"dark",carAudio:false,carChecked:true,speechVary:true},
  daily:{key:today,newDone:0,revDone:0,ans:0,ok:0,credit:0,sentDone:0,conjDone:0,consDone:0,
    noNew:false,buried:{},done:{},missed:{}},
  hist:{}, streak:{cur:2,best:2,last:""}, life:{ans:100,ok:90,practice:0},
  backup:{last:""}, notes:{}, susp:{}, pfail:{}, crep:{}, carSeen:{},
  checks:[], log:[], items:{}});

(async()=>{
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const ctx=await b.newContext({viewport:{width:393,height:852}});
await ctx.addInitScript(s=>{ localStorage.setItem('kanaladder.v1',JSON.stringify(s)); }, base());
await ctx.addInitScript(()=>{
  const V=[{name:'Kyoko',lang:'ja-JP',voiceURI:'com.apple.voice.compact.ja-JP.Kyoko',localService:true,default:true},
           {name:'Kyoko',lang:'ja-JP',voiceURI:'com.apple.voice.compact.ja-JP.Kyoko.2',localService:true}];
  try{Object.defineProperty(window.speechSynthesis,'getVoices',{value:()=>V});}catch(e){}
  window.SpeechSynthesisUtterance=function(t){this.text=t;this.rate=1;this.voice=null;this.lang='';this.volume=1;};
  /* every call to the engine, in order, so the test can see abuse of it */
  window.__calls=[]; window.__heard=[];
  try{
    window.speechSynthesis.speak=u=>{
      window.__calls.push({fn:'speak', t:u.text, vol:u.volume, v:u.voice?u.voice.voiceURI:null});
      if(u.volume!==0) window.__heard.push(u.text);
      setTimeout(()=>{ u.onstart&&u.onstart(); u.onend&&u.onend(); },5);
    };
    window.speechSynthesis.cancel=()=>{ window.__calls.push({fn:'cancel'}); };
  }catch(e){}
});
const p=await ctx.newPage(); const errs=[];
p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
await p.goto('http://localhost:8100/index.html');
await p.waitForFunction(()=>window.__kl&&__kl.DECK.length>0,null,{timeout:20000});
await p.waitForTimeout(500);

console.log('1. nothing touches the engine except a card asking for a line');
/* Every event the app listens on is delivered, with voices already known, so
   anything it does at boot or on waking happens now. Two versions of this app
   spoke here, silently, to try each voice out, and that is what wedged the
   engine on the phone. The rule is simple enough to assert: the only traffic
   the engine ever sees is a card asking for a line. */
await p.evaluate(()=>{
  const k=window.__kl;
  k.TTS.voices=speechSynthesis.getVoices().filter(v=>(v.lang||'').indexOf('ja')===0);
  k.TTS.ja=k.TTS.voices.length>0; k.TTS.checked=true; k.TTS.nudged=false;
  window.__calls=[]; window.__heard=[];
});
await p.mouse.click(196,400);
await p.evaluate(()=>{
  try{ document.dispatchEvent(new Event('pointerdown')); }catch(e){}
  try{ document.dispatchEvent(new Event('visibilitychange')); }catch(e){}
  try{ speechSynthesis.dispatchEvent(new Event('voiceschanged')); }catch(e){}
});
await p.waitForTimeout(6000);
const boot=await p.evaluate(()=>({calls:window.__calls.slice(), heard:window.__heard.length}));
const silentSpeaks=boot.calls.filter(c=>c.fn==='speak' && c.vol===0).length;
const anySpeaks=boot.calls.filter(c=>c.fn==='speak').length;
ok(silentSpeaks===0,'no silent trial utterance is spoken at boot or on waking ('+silentSpeaks+')');
ok(anySpeaks===0,'nothing at all is spoken before a card asks ('+anySpeaks+')');
ok(boot.heard===0,'and nothing is heard ('+boot.heard+')');

console.log('\n2. one line is one speak, preceded by one cancel, and nothing more');
const one=await p.evaluate(async()=>{
  const k=window.__kl; window.__calls=[]; window.__heard=[];
  k.speakCard(k.IDX['c0037']);
  await new Promise(r=>setTimeout(r,1500));   // far longer than any old timer
  return {calls:window.__calls.slice(), heard:window.__heard.slice()};
});
ok(one.calls.length===2,'exactly two engine calls ('+JSON.stringify(one.calls.map(c=>c.fn))+')');
ok(one.calls[0].fn==='cancel' && one.calls[1].fn==='speak','a cancel then a speak, in that order');
ok(one.heard.length===1 && one.heard[0]==='\u3088\u3093','yon is heard once ('+JSON.stringify(one.heard)+')');

console.log('\n3. tapping the speaker eight times gives eight lines and no extra calls');
const rapid=await p.evaluate(async()=>{
  const k=window.__kl; window.__calls=[]; window.__heard=[];
  for(let i=0;i<8;i++){ k.speakCard(k.IDX['c0037']); await new Promise(r=>setTimeout(r,250)); }
  await new Promise(r=>setTimeout(r,1500));
  return {speaks:window.__calls.filter(c=>c.fn==='speak').length,
          cancels:window.__calls.filter(c=>c.fn==='cancel').length,
          heard:window.__heard.length};
});
ok(rapid.speaks===8,'eight taps, eight utterances ('+rapid.speaks+')');
ok(rapid.cancels===8,'and eight cancels, one before each ('+rapid.cancels+')');
ok(rapid.heard===8,'all eight heard ('+rapid.heard+' of 8)');

console.log('\n4. read aloud off means the engine is not touched at all');
const off=await p.evaluate(async()=>{
  const k=window.__kl; k.S.settings.tts=false;
  window.__calls=[]; window.__heard=[];
  k.speakCard(k.IDX['c0037']);
  await new Promise(r=>setTimeout(r,600));
  k.S.settings.tts=true;
  return {calls:window.__calls.length, heard:window.__heard.length};
});
ok(off.calls===0,'no calls to the engine ('+off.calls+')');
ok(off.heard===0,'and nothing heard ('+off.heard+')');

console.log('\n5. the diagnostic reports without touching the engine');
const diag=await p.evaluate(async()=>{
  const k=window.__kl;
  k.speakCard(k.IDX['c0037']);
  await new Promise(r=>setTimeout(r,300));
  window.__calls=[];
  const txt=k.speechReport();
  const calls=window.__calls.length;
  const btn=document.getElementById('speechDiagBtn');
  let shown=null;
  if(btn){ btn.click(); const box=document.getElementById('speechDiag');
           shown=box && !box.hidden && box.textContent.length>0; }
  await new Promise(r=>setTimeout(r,200));
  return {txt, calls, callsAfterClick:window.__calls.length, shown};
});
ok(diag.calls===0,'building the report calls the engine zero times ('+diag.calls+')');
ok(diag.callsAfterClick===0,'and pressing Show calls it zero times ('+diag.callsAfterClick+')');
ok(diag.shown===true,'the panel renders something');
ok(/read aloud: on/.test(diag.txt),'it states whether read aloud is on');
ok(/engine: present/.test(diag.txt),'and whether the engine is there');
ok(/started:yes/.test(diag.txt),'and whether the last line actually started');
ok(/japanese voices seen:/.test(diag.txt),'and what the phone offered');

console.log('\n6. read aloud off is recorded as a reason, not as silence');
const why=await p.evaluate(async()=>{
  const k=window.__kl; k.S.settings.tts=false;
  k.speakCard(k.IDX['c0037']);
  await new Promise(r=>setTimeout(r,200));
  const txt=k.speechReport(); k.S.settings.tts=true;
  return txt;
});
ok(/read aloud is off in settings/.test(why),'the log says why nothing was spoken');

console.log('\n7. no page errors');
ok(errs.length===0,'the app ran clean'+(errs.length?': '+errs[0]:''));
await b.close();
console.log(fails.length? '\n'+fails.length+' FAILED:\n  '+fails.join('\n  ') : '\nall checks passed');
process.exit(fails.length?1:0);
})();
