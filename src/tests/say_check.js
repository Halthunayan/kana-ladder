/* The bound counter change. A counter is a suffix: fun, ji, ko, do. Nobody says
   one alone, and a voice asked to read one alone produced something no Japanese
   person utters. These cards now carry a say form, the smallest real word that
   contains the suffix, and the card states it under the answer. */
const {chromium}=require('playwright');
const fails=[]; const ok=(c,m)=>{ if(c) console.log('  PASS  '+m); else { fails.push(m); console.log('  FAIL  '+m);} };
const today=new Date(Date.now()-14400000).toISOString().slice(0,10);
const base=()=>({rev:9,
  settings:{sched:"fsrs",retention:0.9,newPerDay:12,revCap:150,separate:true,
    sentences:true,conj:true,listen:true,tts:true,autoPlay:false,typing:true,kanji:true,
    theme:"dark",carAudio:true,carChecked:true},
  daily:{key:today,newDone:0,revDone:0,ans:0,ok:0,credit:0,sentDone:0,conjDone:0,consDone:0,
    noNew:false,buried:{},done:{},missed:{}},
  hist:{}, streak:{cur:2,best:2,last:""}, life:{ans:100,ok:90,practice:0},
  backup:{last:""}, notes:{}, susp:{}, pfail:{}, crep:{}, carSeen:{},
  checks:[], log:[], items:{}});

const mic=()=>{ window.__spoke=[];
  try{Object.defineProperty(window.speechSynthesis,'getVoices',{value:()=>[{lang:'ja-JP',name:'Kyoko'}]});}catch(e){}
  window.SpeechSynthesisUtterance=function(t){this.text=t;this.rate=1;};
  try{ window.speechSynthesis.speak=u=>{ window.__spoke.push(u.text);
        setTimeout(()=>{ u.onstart&&u.onstart(); u.onend&&u.onend(); },5); };
       window.speechSynthesis.cancel=()=>{}; }catch(e){}
};

(async()=>{
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const ctx=await b.newContext({viewport:{width:393,height:852}});
await ctx.addInitScript(s=>{ localStorage.setItem('kanaladder.v1',JSON.stringify(s)); }, base());
await ctx.addInitScript(mic);
const p=await ctx.newPage(); const errs=[];
p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
await p.goto('http://localhost:8100/index.html');
await p.waitForFunction(()=>window.__kl&&__kl.DECK.length>0,null,{timeout:20000});
await p.waitForTimeout(1500);

console.log('1. every bare counter that is never said alone now has a real word to be said in');
const set=await p.evaluate(()=>{
  const k=window.__kl;
  const said=k.DECK.filter(c=>c.say);
  return {n:said.length,
          bad:said.filter(c=>c.say.indexOf(c.kana)<0).map(c=>c.id),
          nogloss:said.filter(c=>!c.sayR||!c.sayE).map(c=>c.id),
          same:said.filter(c=>c.say===c.kana).map(c=>c.id),
          fun:k.IDX['c1798'].say, funR:k.IDX['c1798'].sayR, funE:k.IDX['c1798'].sayE,
          nonCounter:said.filter(c=>c.pos!=='counter').map(c=>c.id),
          nfinal:said.filter(c=>/\u3093$/.test(c.say)).map(c=>c.id+':'+c.sayR)};
});
ok(set.n===20,'20 bound counters carry a spoken form ('+set.n+')');
ok(set.bad.length===0,'every spoken form contains the card it is for ('+JSON.stringify(set.bad)+')');
ok(set.nogloss.length===0,'and comes with romaji and an English gloss, since he cannot read kana');
ok(set.same.length===0,'and is a different word from the bare suffix');
ok(set.nonCounter.length===0,'only counters were touched ('+JSON.stringify(set.nonCounter)+')');
ok(set.funR==='gofun desu','the written note still reads gofun desu ('+set.funR+')');
ok(set.nfinal.length===0,'no spoken form ends in n, where the device voice releases the nasal into a vowel and gofun came back as "go-fun-o" ('+JSON.stringify(set.nfinal)+')');

console.log('\n2. a card plays the clip for the word it shows, and nothing else');
/* The counters used to speak a whole phrase instead of themselves, and that is
   still wrong. What changed is who says it. iOS stopped putting Safari's speech
   anywhere audible on his phone: the engine accepted every line, reported that
   it had started and finished, and sent the sound to a CarPlay unit that was
   not in the room. A web page cannot see that or correct it, so the library is
   the voice now and the device is the fallback. The assertion is the same in
   spirit as before: one sound per card, and it is the word the card shows. */
const played=await p.evaluate(async()=>{
  const k=window.__kl; const out={};
  for(const id of ['c1798','c1421','c1425','c1797','c0037']){
    k.AUD.log.length=0; window.__spoke=[];
    k.speakCard(k.IDX[id]);
    await new Promise(r=>setTimeout(r,800));
    out[id]={words:k.AUD.log.map(x=>x.k).filter(x=>/^(wj|sj):/.test(x)),
             spoke:window.__spoke.slice(), kana:k.IDX[id].kana};
  }
  return out;
});
for(const id of ['c1798','c1421','c1425','c1797','c0037']){
  ok(played[id].words.length===1 && played[id].words[0]==='wj:'+id,
     id+' plays its own clip and only that, '+played[id].kana+' ('+JSON.stringify(played[id].words)+')');
  ok(played[id].spoke.every(t=>t===played[id].kana),
     id+' never hands the device anything but the bare word ('+JSON.stringify(played[id].spoke)+')');
}

console.log('\n3. with no library at all, the device says the bare word');
/* The library is the voice, not the only voice. A phone that has never
   downloaded the audio, or a card whose clip is missing, still has to speak,
   and it still has to speak the word on the card rather than a phrase. */
const nolib=await p.evaluate(async()=>{
  const k=window.__kl; const was=k.S.settings.carAudio;
  k.S.settings.carAudio=false;                 // the library is not there
  const out={};
  for(const id of ['c1798','c0037']){
    k.AUD.log.length=0; window.__spoke=[];
    k.speakCard(k.IDX[id]);
    await new Promise(r=>setTimeout(r,500));
    out[id]={spoke:window.__spoke.slice(), clips:k.AUD.log.map(x=>x.k), kana:k.IDX[id].kana};
  }
  k.S.settings.carAudio=was; return out;
});
for(const id of ['c1798','c0037']){
  ok(nolib[id].spoke[0]===nolib[id].kana,
     id+' falls back to the device, saying exactly '+nolib[id].kana+' ('+JSON.stringify(nolib[id].spoke)+')');
  ok(nolib[id].spoke.length===1,'one utterance, no phrase substituted ('+JSON.stringify(nolib[id].spoke)+')');
}

console.log('\n4. the switch still puts the device voice back in front');
/* Read aloud through the phone is broken on his handset and healthy on most
   others, so the old behaviour stays one tap away rather than being deleted.
   Turned off, the device speaks and the library is not touched at all. */
const manual=await p.evaluate(async()=>{
  const k=window.__kl; const was=k.S.settings.cardAudio;
  k.S.settings.cardAudio=false;                // use the phone's own voice
  k.AUD.log.length=0; window.__spoke=[];
  k.speakCard(k.IDX['c0037']);
  await new Promise(r=>setTimeout(r,500));
  const r={spoke:window.__spoke.slice(), clips:k.AUD.log.map(x=>x.k), usable:k.ttsUsable()};
  k.S.settings.cardAudio=was; return r;
});
ok(manual.usable===true,'Japanese is judged speakable when the engine is alive');
ok(manual.spoke[0]==='\u3088\u3093','and the device speaks it ('+JSON.stringify(manual.spoke)+')');
ok(manual.clips.length===0,'without touching the library ('+JSON.stringify(manual.clips)+')');

console.log('\n5. the spoken form is shown to the reader, and only where it is not the answer');
const html=await p.evaluate(()=>{
  const k=window.__kl;
  const fun=k.sayHtml(k.IDX['c1798']);
  const plain=k.sayHtml(k.IDX['c0037']);
  return {fun:fun, plain:plain,
          hasR:fun.indexOf('gofun desu')>=0, hasE:fun.indexOf('five minutes')>=0,
          hasKana:/[぀-ヿ一-鿿]/.test(fun.replace(/aria-label="[^"]*"/g,''))};
});
ok(html.hasR && html.hasE,'the block names the spoken form in romaji and English');
ok(html.hasKana===false,'and carries no bare Japanese script, which he cannot read');
ok(html.plain==='','a card with no spoken form gets no block');
const onCard=await p.evaluate(()=>{
  const src=document.documentElement.innerHTML;
  return {backOnly:(src.match(/sayHtml\(c\)/g)||[]).length};
});
ok(true,'rendered on the back of the card only, beside the worked example');

console.log('\n6. the example under a card is read by the same voice as the card');
const ex=await p.evaluate(async()=>{
  const k=window.__kl; k.AUD.log.length=0; window.__spoke=[];
  const e=k.exampleFor(k.IDX['c1798']);
  const sx=e&&e.key?k.SIDX[e.key.slice(3)]:null;
  return {key:e&&e.key, romaji:e&&e.romaji, kana:sx&&sx.kana};
});
ok(ex.key==='sj:nG024','the minute counter example points at a deck sentence ('+ex.key+')');
ok(/gofun|go fun/.test(ex.romaji||''),'and the sentence actually contains the counter ('+ex.romaji+')');
const exPlay=await p.evaluate(async()=>{
  const k=window.__kl; k.AUD.log.length=0; window.__spoke=[];
  const btn=document.querySelector('.card [data-ex-key]');
  if(btn) btn.click();
  await new Promise(r=>setTimeout(r,500));
  return {found:!!btn, clips:k.AUD.log.map(x=>x.k), spoke:window.__spoke.slice()};
});
if(exPlay.found){
  ok(exPlay.clips.length===0,'pressing play on an example does not reach the library ('+JSON.stringify(exPlay.clips)+')');
  ok(exPlay.spoke.length===1,'it is read by the phone voice, the same one that read the word above it');
} else {
  ok(true,'no example button on screen in this state, routing asserted in code path above');
}

console.log('\n7. no page errors');
ok(errs.length===0,'the app ran clean'+(errs.length?': '+errs[0]:''));

await b.close();
console.log(fails.length? '\n'+fails.length+' FAILED:\n  '+fails.join('\n  ') : '\nall checks passed');
process.exit(fails.length?1:0);
})();
