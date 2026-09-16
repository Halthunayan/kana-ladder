/* His phone's Japanese list, from the screenshot: Eloquence, Kyoko, Kyoko
   (Enhanced), O-ren, Otoya, Siri Voice 1, Siri Voice 2. The old code rotated
   through whatever Safari exposed with no quality check at all, so a formant
   synthesiser from the 1980s got the same share as a 119 MB recorded voice. */
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

/* exactly the list on his screen */
const HIS=[{name:'Eloquence',lang:'ja-JP',localService:true},
           {name:'Kyoko',lang:'ja-JP',localService:true,default:true},
           {name:'Kyoko (Enhanced)',lang:'ja-JP',localService:true},
           {name:'O-ren',lang:'ja-JP',localService:true},
           {name:'Otoya',lang:'ja-JP',localService:true},
           {name:'Siri Voice 1',lang:'ja-JP',localService:true},
           {name:'Samantha',lang:'en-US',localService:true}];

(async()=>{
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const ctx=await b.newContext({viewport:{width:393,height:852}});
await ctx.addInitScript(s=>{ localStorage.setItem('kanaladder.v1',JSON.stringify(s)); }, base());
await ctx.addInitScript(v=>{ window.__spoke=[]; window.__voice=[];
  try{Object.defineProperty(window.speechSynthesis,'getVoices',{value:()=>v});}catch(e){}
  window.SpeechSynthesisUtterance=function(t){this.text=t;this.rate=1;};
  try{ window.speechSynthesis.speak=u=>{ window.__spoke.push(u.text); window.__voice.push(u.voice?u.voice.name:null);
        setTimeout(()=>u.onend&&u.onend(),5); };
       window.speechSynthesis.cancel=()=>{}; }catch(e){}
}, HIS);
const p=await ctx.newPage(); const errs=[];
p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
await p.goto('http://localhost:8100/index.html');
await p.waitForFunction(()=>window.__kl&&__kl.DECK.length>0,null,{timeout:20000});
await p.waitForTimeout(1500);

console.log('1. the ranking, run against the exact voice list on his phone');
const r=await p.evaluate(()=>{
  const k=window.__kl;
  return {ranked:k.jaRanked().map(v=>v.name+' ('+k.jaScore(v)+')'),
          top:k.jaTop().map(v=>v.name),
          onlyJa:k.jaRanked().every(v=>v.lang.indexOf('ja')===0)};
});
console.log('   ranked: '+r.ranked.join('  |  '));
ok(r.ranked[0].indexOf('Kyoko (Enhanced)')===0,'Kyoko Enhanced ranks first, above the compact Kyoko ('+r.ranked[0]+')');
ok(r.ranked[r.ranked.length-1].indexOf('Eloquence')===0,'Eloquence ranks last, below everything ('+r.ranked[r.ranked.length-1]+')');
ok(r.top.indexOf('Eloquence')<0,'the rotation pool never contains the robot ('+JSON.stringify(r.top)+')');
ok(r.top.length===1 && r.top[0]==='Kyoko (Enhanced)','with Enhanced present the pool is just that one voice ('+JSON.stringify(r.top)+')');
ok(r.onlyJa,'only Japanese voices are considered, the English list is separate');

console.log('\n2. what actually speaks a card');
const spoke=await p.evaluate(async()=>{
  const k=window.__kl; window.__spoke=[]; window.__voice=[];
  for(let i=0;i<6;i++){ k.speakCard(k.IDX['c0037']); await new Promise(r=>setTimeout(r,60)); }
  return {voices:window.__voice.slice(), texts:window.__spoke.slice()};
});
ok(spoke.voices.every(v=>v==='Kyoko (Enhanced)'),
   'six consecutive cards all use the best voice, never the robot ('+JSON.stringify([...new Set(spoke.voices)])+')');

console.log('\n3. a phone with no Enhanced download still rotates, but only among good voices');
const noEnh=await p.evaluate(async()=>{
  const k=window.__kl;
  k.TTS.voices=[{name:'Eloquence',lang:'ja-JP',localService:true},
                {name:'Kyoko',lang:'ja-JP',localService:true,default:true},
                {name:'O-ren',lang:'ja-JP',localService:true}];
  const top=k.jaTop().map(v=>v.name);
  window.__voice=[];
  for(let i=0;i<6;i++){ k.speakCard(k.IDX['c0037']); await new Promise(r=>setTimeout(r,60)); }
  return {top:top, used:[...new Set(window.__voice)]};
});
ok(noEnh.top.indexOf('Eloquence')<0,'Eloquence is still excluded ('+JSON.stringify(noEnh.top)+')');
ok(noEnh.used.indexOf('Eloquence')<0,'and never speaks ('+JSON.stringify(noEnh.used)+')');
ok(noEnh.used.length>1,'the two good voices still alternate, so variety survives ('+JSON.stringify(noEnh.used)+')');

console.log('\n4. a chosen voice overrides the ranking');
const chosen=await p.evaluate(async()=>{
  const k=window.__kl;
  k.TTS.voices=[{name:'Eloquence',lang:'ja-JP'},{name:'Kyoko',lang:'ja-JP'},{name:'O-ren',lang:'ja-JP'}];
  k.S.settings.jaVoice='O-ren'; window.__voice=[];
  for(let i=0;i<4;i++){ k.speakCard(k.IDX['c0037']); await new Promise(r=>setTimeout(r,60)); }
  const used=[...new Set(window.__voice)];
  k.S.settings.jaVoice='auto';
  return used;
});
ok(chosen.length===1 && chosen[0]==='O-ren','picking a voice in Settings pins it ('+JSON.stringify(chosen)+')');

console.log('\n5. a short word is no longer spoken at a random speed');
const rate=await p.evaluate(()=>{
  const k=window.__kl;
  return {yon:k.moraCount('よん'), gofun:k.moraCount('ごふん'),
          kyou:k.moraCount('きょう'), gakkou:k.moraCount('がっこう'),
          sent:k.moraCount('いまなんじですか')};
});
ok(rate.yon===2,'yon is two morae ('+rate.yon+')');
ok(rate.kyou===2,'kyou is two morae, the small yo does not count ('+rate.kyou+')');
ok(rate.gakkou===4,'gakkou is four, the small tsu and the long vowel do count ('+rate.gakkou+')');
ok(rate.gofun===3,'gofun is three, so it keeps its variety ('+rate.gofun+')');
const jit=await p.evaluate(async()=>{
  const k=window.__kl; const seen={short:{},long:{}};
  const grab=async(t,bin)=>{ for(let i=0;i<14;i++){
    let got=null;
    const S=window.SpeechSynthesisUtterance;
    window.SpeechSynthesisUtterance=function(x){ this.text=x; this.rate=1;
      Object.defineProperty(this,'rate',{set:v=>{got=v;},get:()=>got,configurable:true}); };
    k.speakCard(k.IDX[t]);
    window.SpeechSynthesisUtterance=S;
    if(got!=null) seen[bin][got.toFixed(3)]=1;
    await new Promise(r=>setTimeout(r,20)); } };
  await grab('c0037','short');
  await grab('c1798','long');
  return {short:Object.keys(seen.short), long:Object.keys(seen.long)};
});
ok(jit.short.length===1,'yon is spoken at one fixed rate every time ('+JSON.stringify(jit.short)+')');
ok(jit.long.length>1,'gofun, being three morae, still varies ('+jit.long.length+' distinct rates)');

console.log('\n6. no page errors');
ok(errs.length===0,'the app ran clean'+(errs.length?': '+errs[0]:''));
await b.close();
console.log(fails.length? '\n'+fails.length+' FAILED:\n  '+fails.join('\n  ') : '\nall checks passed');
process.exit(fails.length?1:0);
})();
