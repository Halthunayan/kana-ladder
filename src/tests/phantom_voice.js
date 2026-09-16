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

console.log('\n1b. the trial runs before anything is played, and strikes both off');
const trial=await p.evaluate(async()=>{
  const k=window.__kl;
  k.jaVerify();
  await new Promise(r=>setTimeout(r,3000));
  return {bad:Object.keys(k.BAD_VOICE).length, usable:k.jaUsable().length, heard:window.__heard.length};
});
ok(trial.bad===2,'both silent voices are found out ('+trial.bad+' of 2)');
ok(trial.usable===0,'none is left to name ('+trial.usable+')');
ok(trial.heard===0,'and the trial is itself silent ('+trial.heard+')');

console.log('\n2. nothing on the playback path waits');
/* There is no timer here any more. The one that used to be is what spoke over
   the tap that followed it. A card is handed over once and heard at once. */
const one=await p.evaluate(async()=>{
  const k=window.__kl; window.__heard=[]; window.__handed=[];
  k.speakCard(k.IDX['c0037']);
  await new Promise(r=>setTimeout(r,60));
  return {heard:window.__heard.slice(), handed:window.__handed.slice()};
});
ok(one.handed.length===1,'the card is handed over once, with no retry to wait for ('+one.handed.length+')');
ok(one.handed[0] && one.handed[0].v===null,'and names no voice, leaving iOS to use what it really has');
ok(one.heard.length===1 && one.heard[0]==='\u3088\u3093','yon is heard within 60 ms ('+JSON.stringify(one.heard)+')');

console.log('\n3. five cards in a row');
const after=await p.evaluate(async()=>{
  const k=window.__kl;
  const bad=Object.keys(k.BAD_VOICE);
  window.__heard=[]; window.__handed=[];
  for(let i=0;i<5;i++){ k.speakCard(k.IDX['c0037']); await new Promise(r=>setTimeout(r,120)); }
  return {bad, heard:window.__heard.length, handed:window.__handed.length,
          named:window.__handed.filter(x=>x.v).length,
          top:k.jaTop().map(v=>v.voiceURI)};
});
ok(after.bad.length===2,'both stay struck off ('+JSON.stringify(after.bad)+')');
ok(after.heard===5,'all five are heard ('+after.heard+' of 5)');
ok(after.named===0,'none names a voice ('+after.named+')');
ok(after.handed===5,'five cards, five attempts, nothing retried ('+after.handed+')');

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

console.log('\n3c0. the voices are tried out silently before any card asks for one');
const pre=await p.evaluate(async()=>{
  const k=window.__kl;
  for(const key in k.BAD_VOICE) delete k.BAD_VOICE[key];
  for(const key in k.VOICE_OK) delete k.VOICE_OK[key];
  k.TTS.voices=[{name:'Kyoko',lang:'ja-JP',voiceURI:'com.apple.voice.compact.ja-JP.Kyoko',localService:true,default:true},
                {name:'Kyoko',lang:'ja-JP',voiceURI:'com.apple.voice.compact.ja-JP.Kyoko.2',localService:true}];
  window.__heard=[];
  k.jaVerify();
  await new Promise(r=>setTimeout(r,3000));
  return {bad:Object.keys(k.BAD_VOICE).length, ok:Object.keys(k.VOICE_OK).length,
          heard:window.__heard.length, usable:k.jaUsable().length};
});
ok(pre.bad===2,'both silent voices are found out before a card is played ('+pre.bad+' of 2)');
ok(pre.usable===0,'so none is left to name ('+pre.usable+')');
ok(pre.heard===0,'and the trial itself is silent, nothing is heard ('+pre.heard+')');

console.log('\n3c. tapping the speaker repeatedly, which is what a person does');
/* The fault this section exists for: with no generation guard, tap one's timer
   fired during tap two, cancelled it and spoke over it, and tap two's timer
   then saw the engine busy and never struck its voice off. Nothing was retired
   and about one tap in four was heard. */
const rapid=await p.evaluate(async()=>{
  const k=window.__kl;
  window.__heard=[]; window.__handed=[];
  /* eight taps, 250 ms apart: faster than the 700 ms the check waits, so every
     timer fires while a later line is already in flight */
  for(let i=0;i<8;i++){ k.speakCard(k.IDX['c0037']); await new Promise(r=>setTimeout(r,250)); }
  await new Promise(r=>setTimeout(r,1500));
  return {heard:window.__heard.length, bad:Object.keys(k.BAD_VOICE).length};
});
ok(rapid.bad===2,'both stay struck off through the overlapping taps ('+rapid.bad+' of 2)');
ok(rapid.heard===8,'all eight taps are heard, where before the fix it was one ('+rapid.heard+' of 8)');
const settled2=await p.evaluate(async()=>{
  const k=window.__kl; window.__heard=[]; window.__handed=[];
  for(let i=0;i<6;i++){ k.speakCard(k.IDX['c0037']); await new Promise(r=>setTimeout(r,250)); }
  await new Promise(r=>setTimeout(r,800));
  return {heard:window.__heard.length, named:window.__handed.filter(x=>x.v).length};
});
ok(settled2.heard===6,'once settled, every tap is heard ('+settled2.heard+' of 6)');
ok(settled2.named===0,'and no voice is named any more ('+settled2.named+')');

console.log('\n3d. a working voice survives the same trial');
const good=await p.evaluate(async()=>{
  const k=window.__kl;
  for(const key in k.BAD_VOICE) delete k.BAD_VOICE[key];
  for(const key in k.VOICE_OK) delete k.VOICE_OK[key];
  /* from here on the engine speaks whatever it is given, voice or not */
  window.speechSynthesis.speak=u=>{ window.__handed.push({t:u.text,v:u.voice?u.voice.voiceURI:null});
    if(u.volume!==0) window.__heard.push(u.text);
    setTimeout(()=>{ u.onstart&&u.onstart(); u.onend&&u.onend(); },5); };
  k.TTS.voices=[{name:'Kyoko',lang:'ja-JP',voiceURI:'com.apple.voice.compact.ja-JP.Kyoko',localService:true,default:true},
                {name:'O-ren',lang:'ja-JP',voiceURI:'com.apple.voice.compact.ja-JP.Oren',localService:true}];
  window.__heard=[]; window.__handed=[];
  k.jaVerify();
  await new Promise(r=>setTimeout(r,3000));
  return {bad:Object.keys(k.BAD_VOICE).length, ok:Object.keys(k.VOICE_OK).length,
          heard:window.__heard.length, usable:k.jaUsable().length};
});
ok(good.bad===0,'neither working voice is struck off ('+good.bad+')');
ok(good.ok===2,'both are recorded as usable ('+good.ok+' of 2)');
ok(good.usable===2,'and both remain available ('+good.usable+')');
ok(good.heard===0,'the trial stays silent on a working phone too ('+good.heard+')');

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
