/* iOS lists voices it cannot speak with. Downloading Kyoko Enhanced put a
   second "Kyoko" in Safari's list that produced silence when assigned: no
   error, no event. Every card went quiet while the downloaded audio file kept
   playing. This suite models a phantom voice and asserts the app recovers. */
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
/* His phone: BOTH listed Kyokos are silent. Naming any voice produces nothing,
   no error and no event. Leaving the voice unset is the only thing that works,
   which is what the fallback does. */
await ctx.addInitScript(()=>{
  const V=[{name:'Kyoko',lang:'ja-JP',voiceURI:'com.apple.voice.compact.ja-JP.Kyoko',localService:true,default:true},
           {name:'Kyoko',lang:'ja-JP',voiceURI:'com.apple.voice.compact.ja-JP.Kyoko.2',localService:true}];
  try{Object.defineProperty(window.speechSynthesis,'getVoices',{value:()=>V});}catch(e){}
  window.SpeechSynthesisUtterance=function(t){this.text=t;this.rate=1;this.voice=null;this.lang='';};
  window.__heard=[];       // utterances that actually produced sound
  window.__handed=[];      // every utterance handed to the engine
  let speaking=false;
  try{
    Object.defineProperty(window.speechSynthesis,'speaking',{get:()=>speaking});
    Object.defineProperty(window.speechSynthesis,'pending',{get:()=>false});
    window.speechSynthesis.speak=u=>{
      window.__handed.push({t:u.text, v:u.voice?u.voice.voiceURI:null});
      if(u.voice) return;            // any named voice: listed, silent, no event
      speaking=true; window.__heard.push(u.text);
      setTimeout(()=>{ speaking=false; u.onstart&&u.onstart(); u.onend&&u.onend(); },5);
    };
    window.speechSynthesis.cancel=()=>{ speaking=false; };
  }catch(e){}
});
const p=await ctx.newPage(); const errs=[];
p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
await p.goto('http://localhost:8100/index.html');
await p.waitForFunction(()=>window.__kl&&__kl.DECK.length>0,null,{timeout:20000});
await p.waitForTimeout(1500);

console.log('1. the fault is reproduced: a Japanese voice is reported and naming it gives silence');
const first=await p.evaluate(()=>{
  const k=window.__kl;
  return {top:k.jaTop().map(v=>v.voiceURI), ja:k.ttsReady(), n:k.TTS.voices.length};
});
ok(first.ja===true,'the device reports a Japanese voice');
ok(first.n===2,'two of them, both called Kyoko, exactly as his phone reports ('+first.n+')');
ok(first.top.length===1,'and the app names one of them on every card ('+JSON.stringify(first.top)+')');

console.log('\n2. the card is heard anyway');
const one=await p.evaluate(async()=>{
  const k=window.__kl; window.__heard=[]; window.__handed=[];
  k.speakCard(k.IDX['c0037']);
  await new Promise(r=>setTimeout(r,1200));
  return {heard:window.__heard.slice(), handed:window.__handed.slice()};
});
ok(one.handed.length===2,'the silent attempt is noticed and the line is spoken again ('+one.handed.length+' attempts)');
ok(one.handed[1] && one.handed[1].v===null,'the retry names no voice, leaving iOS to use what it really has');
ok(one.heard.length===1 && one.heard[0]==='よん','yon is heard ('+JSON.stringify(one.heard)+')');

console.log('\n3. the broken voice is struck off, so it costs one line and not every line');
const after=await p.evaluate(async()=>{
  const k=window.__kl;
  const bad=Object.keys(k.BAD_VOICE);
  window.__heard=[]; window.__handed=[];
  /* one card at a time, the way a person answers them: each utterance is given
     longer than the 700 ms the retry waits, so a retry that is due has fired */
  for(let i=0;i<5;i++){ k.speakCard(k.IDX['c0037']); await new Promise(r=>setTimeout(r,900)); }
  return {bad, heard:window.__heard.length, handed:window.__handed.length,
          named:window.__handed.filter(x=>x.v).length,
          top:k.jaTop().map(v=>v.voiceURI)};
});
ok(after.bad.length>=1,'the silent voice is recorded as unusable ('+JSON.stringify(after.bad)+')');
ok(after.heard===5,'the next five cards are all heard ('+after.heard+' of 5)');
ok(after.named<=1,'at most one of the five still names a voice, and only while the second is being found out ('+after.named+')');

console.log('\n3b. once both are struck off, nothing is named and every card is heard first time');
const settled=await p.evaluate(async()=>{
  const k=window.__kl; window.__heard=[]; window.__handed=[];
  for(let i=0;i<4;i++){ k.speakCard(k.IDX['c0037']); await new Promise(r=>setTimeout(r,900)); }
  return {handed:window.__handed.length, heard:window.__heard.length,
          named:window.__handed.filter(x=>x.v).length};
});
ok(settled.heard===4,'four cards, four heard ('+settled.heard+')');
ok(settled.named===0,'and no voice is named any more ('+settled.named+' named attempts)');
ok(settled.handed===4,'so there is nothing left to retry ('+settled.handed+' attempts)');

console.log('\n4. a phone whose only voice works is untouched');
const clean=await p.evaluate(async()=>{
  const k=window.__kl;
  for(const key in k.BAD_VOICE) delete k.BAD_VOICE[key];
  k.TTS.voices=[{name:'Kyoko',lang:'ja-JP',voiceURI:'com.apple.voice.compact.ja-JP.Kyoko',localService:true}];
  window.speechSynthesis.speak=u=>{ window.__handed.push({t:u.text,v:u.voice?u.voice.voiceURI:null});
    window.__heard.push(u.text); setTimeout(()=>{ u.onstart&&u.onstart(); u.onend&&u.onend(); },5); };
  window.__heard=[]; window.__handed=[];
  for(let i=0;i<4;i++){ k.speakCard(k.IDX['c0037']); await new Promise(r=>setTimeout(r,900)); }
  return {handed:window.__handed.length, heard:window.__heard.length, bad:Object.keys(k.BAD_VOICE)};
});
ok(clean.handed===4,'four cards, four attempts, no spurious retries ('+clean.handed+')');
ok(clean.heard===4,'all four heard ('+clean.heard+')');
ok(clean.bad.length===0,'and no working voice is wrongly struck off ('+JSON.stringify(clean.bad)+')');

console.log('\n5. no page errors');
ok(errs.length===0,'the app ran clean'+(errs.length?': '+errs[0]:''));
await b.close();
console.log(fails.length? '\n'+fails.length+' FAILED:\n  '+fails.join('\n  ') : '\nall checks passed');
process.exit(fails.length?1:0);
})();
