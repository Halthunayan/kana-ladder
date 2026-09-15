/* The voice probe must recover from every way WebKit can withhold its voice
   list, and must never silently drop listening without saying so. */
const {chromium}=require('playwright');
const fails=[]; const __kl_on=v=>v===true;
const ok=(c,m)=>{ if(c) console.log('  PASS  '+m); else { fails.push(m); console.log('  FAIL  '+m);} };
const today=new Date(Date.now()-14400000).toISOString().slice(0,10);  // the app's day starts at 04:00 UTC
const state=(over)=>{ const now=Date.now(), items={};
  for(let i=0;i<40;i++){ const id='c'+String(i).padStart(4,'0');
    items[id+'|j']=[1,0,5,2.5,20,now+20*86400000,0,0,8,8,4,20,now-86400000]; }
  return {rev:99,
    settings:Object.assign({sched:"fsrs",retention:0.9,newPerDay:0,revCap:150,reverse:"grad",
      separate:true,sentences:true,conj:true,listen:true,tts:true,autoPlay:true,typing:false,
      kanji:true,theme:"dark"},(over||{}).settings),
    daily:{key:today,newDone:0,revDone:0,ans:0,ok:0,credit:0,sentDone:0,conjDone:0,consDone:0,
      noNew:false,buried:{},done:{},missed:{}},
    hist:{}, streak:{cur:1,best:1,last:""}, life:{ans:80,ok:70,practice:0},
    backup:{last:""}, notes:{}, susp:{}, pfail:{}, log:[], items}; };
(async()=>{
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
// mode: 'never' | 'empty-then-ja' | 'english-then-ja' | 'onSpeak' | 'onEvent'
const open=async(mode, over)=>{
  const ctx=await b.newContext({viewport:{width:393,height:852}});
  await ctx.addInitScript(([m,st])=>{
    const EN={lang:'en-US',name:'Samantha'}, JA={lang:'ja-JP',name:'Kyoko'};
    let voices = (m==='english-then-ja') ? [EN] : [];
    if(m==='always') voices=[EN,JA];
    window.__speakCalls=0;
    window.SpeechSynthesisUtterance=function(t){this.text=t;this.rate=1;this.volume=1;this.lang='';this.voice=null;};
    const listeners=[];
    try{
      Object.defineProperty(window.speechSynthesis,'getVoices',{value:()=>voices.slice()});
      window.speechSynthesis.speak=function(){ window.__speakCalls++;
        if(m==='onSpeak' && voices.indexOf(JA)<0){ voices=[EN,JA];
          setTimeout(()=>listeners.forEach(f=>f()),50); } };
      window.speechSynthesis.cancel=function(){};
      window.speechSynthesis.addEventListener=function(ev,f){ if(ev==='voiceschanged') listeners.push(f); };
    }catch(e){}
    if(m==='empty-then-ja' || m==='english-then-ja'){
      setTimeout(()=>{ voices=[EN,JA]; },3000);          // arrives late, after the old 1.2s giveup
    }
    if(m==='onEvent'){
      setTimeout(()=>{ voices=[EN,JA]; listeners.forEach(f=>f()); },2000);
    }
    localStorage.setItem('kanaladder.v1',JSON.stringify(st));
  }, [mode, state(over)]);
  const p=await ctx.newPage(); const errs=[];
  p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  await p.goto('http://localhost:8100/index.html'); await p.waitForTimeout(1200);
  return {ctx,p,errs};
};

console.log('\n1. the voice list arriving late is still picked up');
for(const [mode,label] of [['empty-then-ja','empty list, Japanese arrives at 3s'],
                           ['english-then-ja','English only, Japanese arrives at 3s'],
                           ['onEvent','voiceschanged fires at 2s']]){
  const {ctx,p,errs}=await open(mode);
  const early=await p.evaluate(()=>__kl.TTS.ja);
  await p.waitForTimeout(6000);
  const late=await p.evaluate(()=>({ja:__kl.TTS.ja, n:__kl.TTS.voices.length}));
  ok(early===false && late.ja===true, label+': not found at first, found later ('+late.n+' voice)');
  const bars3=await p.evaluate(()=>document.querySelectorAll('#skillStrip .sk').length);
  ok(__kl_on(await p.evaluate(()=>__kl.listenOn())) && bars3===3,'and the deck goes back to three cards per word');
  ok(errs.length===0,'no errors while recovering');
  await ctx.close();
}

console.log('\n2. a tap nudges WebKit into loading its voices');
{
const {ctx,p,errs}=await open('onSpeak');
ok(await p.evaluate(()=>__kl.TTS.ja)===false,'no Japanese voice before any interaction');
ok(await p.evaluate(()=>window.__speakCalls===0),'nothing was spoken yet');
await p.click('body',{position:{x:200,y:400}}); await p.waitForTimeout(1600);
const after=await p.evaluate(()=>({ja:__kl.TTS.ja, calls:window.__speakCalls}));
ok(after.calls>0,'the first tap fired a silent utterance to wake the engine');
ok(after.ja===true,'and the Japanese voice appeared straight after');
ok(errs.length===0,'no errors from the nudge');
await ctx.close();
}

console.log('\n3. when there really is no Japanese voice, it says so');
{
const {ctx,p,errs}=await open('never');
await p.waitForTimeout(1500);
ok(await p.evaluate(()=>__kl.TTS.ja)===false,'no voice is found, correctly');
const warn=await p.evaluate(()=>{ const w=document.getElementById('listenWarn');
  return {hidden:w.hidden, txt:w.textContent}; });
ok(!warn.hidden,'a warning is shown on the study screen');
ok(/Listening cards are paused/.test(warn.txt) && /Accessibility/.test(warn.txt),
   'it explains the cause and the fix');
ok(await p.evaluate(()=>{ const k=__kl; const m=k.AUD.man; k.AUD.man=null;
     const v=k.listenOn(); k.AUD.man=m; return v; })===false,
   'with nothing able to speak Japanese, listening is off, so two cards per word');
ok(await p.evaluate(()=>__kl.listenOn())===true,
   'but the pre-rendered library brings it back without a device voice');
const bars=await p.evaluate(()=>document.querySelectorAll('#skillStrip .sk').length);
ok(bars===2,'the skill strip drops to two bars');
ok(errs.length===0,'no errors');
await ctx.close();
}

console.log('\n4. listening switched off by choice shows no warning');
{
const {ctx,p}=await open('always',{settings:{listen:false}});
await p.waitForTimeout(800);
ok(await p.evaluate(()=>document.getElementById('listenWarn').hidden),
   'turning it off yourself is not treated as a fault');
await ctx.close();
}
{
const {ctx,p}=await open('always');
await p.waitForTimeout(800);
ok(await p.evaluate(()=>__kl.TTS.ja===true),'a device with a Japanese voice is detected at once');
ok(await p.evaluate(()=>document.getElementById('listenWarn').hidden),'and shows no warning');
const bars=await p.evaluate(()=>document.querySelectorAll('#skillStrip .sk').length);
ok(bars===3,'all three skills are shown');
await ctx.close();
}
await b.close();
console.log('\n'+(fails.length? fails.length+' FAILURES: '+fails.join('; ') : 'LISTENING RECOVERS AND NEVER FAILS SILENTLY'));
process.exit(fails.length?1:0);})();
