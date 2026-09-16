/* Every speech suite before this one replaced speechSynthesis with a stub, so
   they tested the stub. A stub always accepts a line, so an engine wedged by
   the app's own cancel-and-speak traffic looked identical to a healthy one and
   nine suites stayed green while the phone was silent in both languages.
   This one uses WebKit, the engine Safari uses, and does not stub it. It does
   not assert that any particular line is audible, because a headless engine is
   not a speaker; it asserts that after the app has done its worst, the engine
   still accepts and starts an utterance. That is the property that was lost,
   twice, and that nothing was watching. */
const {webkit}=require('playwright');
const fails=[]; const ok=(c,m)=>{ if(c) console.log('  PASS  '+m); else { fails.push(m); console.log('  FAIL  '+m);} };
const PORT=process.env.PORT||8100;
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

/* asked of the real engine, with no app code involved */
const ALIVE = `(async()=>{
  return await new Promise(res=>{
    let done=false;
    const u=new SpeechSynthesisUtterance('a');
    u.volume=0; u.rate=1;
    u.onstart=()=>{ if(!done){done=true;res('start');} };
    u.onend=()=>{ if(!done){done=true;res('end');} };
    u.onerror=e=>{ if(!done){done=true;res('error');} };
    try{ speechSynthesis.speak(u); }catch(e){ res('throw'); return; }
    setTimeout(()=>{ if(!done){done=true;res('silent');} }, 4000);
  });
})()`;

(async()=>{
const b=await webkit.launch();
const ctx=await b.newContext({viewport:{width:393,height:852}});
await ctx.addInitScript(s=>{ localStorage.setItem('kanaladder.v1',JSON.stringify(s)); }, base());
const p=await ctx.newPage(); const errs=[];
p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
await p.goto('http://localhost:'+PORT+'/index.html');
await p.waitForFunction(()=>window.__kl&&__kl.DECK.length>0,null,{timeout:30000});
await p.waitForTimeout(1200);

console.log('1. the real engine is reachable before the app has spoken');
const before=await p.evaluate(ALIVE);
ok(before==='start'||before==='end','a bare utterance starts ('+before+')');
if(before==='silent'||before==='throw'){
  console.log('\n   the engine is unusable in this environment, so nothing below can be judged');
  await b.close(); process.exit(0);
}

console.log('\n1b. the app boots with voices present, and the engine survives it');
/* The gap that let this through twice: headless WebKit has no Japanese voice,
   so any code that only runs when one exists was never executed by a test. The
   engine's own voices are handed to the app as if they were Japanese, and the
   first touch is delivered, so whatever the app does at boot when it has
   voices happens here against a real engine rather than a stub. */
await p.evaluate(()=>{
  const k=window.__kl, v=speechSynthesis.getVoices()||[];
  k.TTS.voices=v.slice(0,2); k.TTS.ja=v.length>0; k.TTS.checked=true;
});
await p.mouse.click(196,400);
await p.waitForTimeout(6000);
const afterBoot=await p.evaluate(ALIVE);
ok(afterBoot==='start'||afterBoot==='end',
   'the engine still accepts an utterance after the app has booted with voices ('+afterBoot+')');

console.log('\n2. the app is asked for many lines, the way a person taps');
const traffic=await p.evaluate(async()=>{
  const k=window.__kl;
  let speaks=0, cancels=0;
  const rs=speechSynthesis.speak.bind(speechSynthesis);
  const rc=speechSynthesis.cancel.bind(speechSynthesis);
  speechSynthesis.speak=u=>{ speaks++; try{u.volume=0;}catch(e){} return rs(u); };
  speechSynthesis.cancel=()=>{ cancels++; return rc(); };
  for(let i=0;i<10;i++){ k.speakCard(k.IDX['c0037']); await new Promise(r=>setTimeout(r,250)); }
  await new Promise(r=>setTimeout(r,2500));   // longer than any timer the app ever had
  speechSynthesis.speak=rs; speechSynthesis.cancel=rc;
  return {speaks, cancels};
});
ok(traffic.speaks===10,'ten taps produced ten utterances, not more ('+traffic.speaks+')');
ok(traffic.cancels===10,'and ten cancels, one before each ('+traffic.cancels+')');

console.log('\n3. the engine still works afterwards, which is what silence took away');
await p.evaluate(()=>{ try{speechSynthesis.cancel();}catch(e){} });
await p.waitForTimeout(800);
const after=await p.evaluate(ALIVE);
ok(after==='start'||after==='end','a bare utterance still starts after the app has run ('+after+')');

console.log('\n4. and again after the app is asked to speak once more');
await p.evaluate(()=>{ const k=window.__kl; k.speakCard(k.IDX['c0037']); });
await p.waitForTimeout(1500);
await p.evaluate(()=>{ try{speechSynthesis.cancel();}catch(e){} });
await p.waitForTimeout(600);
const after2=await p.evaluate(ALIVE);
ok(after2==='start'||after2==='end','still alive ('+after2+')');

console.log('\n5. no page errors');
ok(errs.length===0,'the app ran clean'+(errs.length?': '+errs[0]:''));
await b.close();
console.log(fails.length? '\n'+fails.length+' FAILED:\n  '+fails.join('\n  ') : '\nall checks passed');
process.exit(fails.length?1:0);
})();
