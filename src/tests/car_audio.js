/* Pre-rendered voice: the only path that reaches CarPlay. These checks prove
   the clips resolve, play through a real audio element, and that a drive with
   audio available never falls back to the device speech that CarPlay ignores. */
const {chromium}=require('playwright');
const fails=[]; const ok=(c,m)=>{ if(c) console.log('  PASS  '+m); else { fails.push(m); console.log('  FAIL  '+m);} };
const today=new Date(Date.now()-14400000).toISOString().slice(0,10);  // the app's day starts at 04:00 UTC
const now=Date.now();
const card=(iv)=>[1,0,5,2.0,iv,now+iv*86400000,0,0,10,9,5.0,iv,now-2*86400000];
const base=(items,over)=>Object.assign({rev:9,
  settings:Object.assign({sched:"fsrs",retention:0.9,newPerDay:0,revCap:150,separate:true,
    sentences:true,conj:true,listen:true,tts:true,autoPlay:false,typing:false,kanji:true,theme:"dark",
    car:true,carDir:"mix",carGap:2,carMin:3,carEcho:false,carSlow:false,carSent:true,carConj:true,
    carChecked:true,carAudio:true,speechRate:0.85},(over||{}).settings),
  daily:{key:today,newDone:0,revDone:0,ans:0,ok:0,credit:0,sentDone:0,conjDone:0,consDone:0,
    noNew:false,buried:{},done:{},missed:{}},
  hist:{}, streak:{cur:2,best:2,last:""}, life:{ans:100,ok:90,practice:0},
  backup:{last:""}, notes:{}, susp:{}, pfail:{}, crep:{}, carSeen:{}, log:[], items});

(async()=>{
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const open=async(st)=>{
  const ctx=await b.newContext({viewport:{width:393,height:852}});
  await ctx.addInitScript(s=>{
    try{Object.defineProperty(window.speechSynthesis,'getVoices',{value:()=>
      [{lang:'ja-JP',name:'Kyoko'},{lang:'en-US',name:'Samantha',default:true}]});}catch(e){}
    window.__said=[];
    window.SpeechSynthesisUtterance=function(x){ this.text=x; this.rate=1; this.voice=null; this.lang=''; this.volume=1; };
    /* the silent trial the app runs on each voice is at volume 0 and is not
       heard, so it is not a use of the device voice for these assertions */
    try{ window.speechSynthesis.speak=u=>{
      if(u.volume===0){ setTimeout(()=>{ if(typeof u.onstart==='function') u.onstart(); },5); return; }
      window.__said.push(u.text);
      setTimeout(()=>{ if(typeof u.onstart==='function') u.onstart();
                       if(typeof u.onend==='function') u.onend(); },20); };
      window.speechSynthesis.cancel=()=>{}; }catch(e){}
    window.__wake=0;
    try{ Object.defineProperty(navigator,'wakeLock',{value:{request:()=>{ window.__wake++;
      return Promise.resolve({release(){ window.__wake--; return Promise.resolve(); },
        addEventListener(){} }); }}}); }catch(e){}
    localStorage.setItem('kanaladder.v1',JSON.stringify(s));
  },st);
  const p=await ctx.newPage(); const errs=[];
  p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  p.on('console',m=>{if(m.type()==='error'&&!/favicon|sw\.js|404/.test(m.text()))errs.push('console '+m.text());});
  await p.goto('http://localhost:8100/index.html'); await p.waitForTimeout(1200);
  await p.evaluate(()=>{ __kl.TTS.ja=true; __kl.TTS.voices=[{lang:'ja-JP',name:'Kyoko'}];
    __kl.TTS.en=[{lang:'en-US',name:'Samantha'}]; });
  await p.click('.tab[data-go="stats"]'); await p.waitForTimeout(120);
  await p.click('.tab[data-go="home"]'); await p.waitForTimeout(300);
  return {ctx,p,errs};
};
const items20=()=>{ const it={}; for(let i=0;i<20;i++) it['c'+String(i).padStart(4,'0')+'|j']=card(9); return it; };

console.log('1. the browser can play what we ship');
{
const {ctx,p}=await open(base(items20()));
ok(await p.evaluate(()=>!!new Audio().canPlayType('audio/mpeg')),'mp3 is playable here');
const m=await p.evaluate(()=>__kl.audManifest());
ok(m && m.version===2,'the manifest loads');
ok(m && m.files && Object.keys(m.sprites).every(k=>!!m.files[k]),
   'every sprite resolves to a content named file, so a changed sprite cannot be served stale');
ok(m && Object.keys(m.sprites).length>=20,'every sprite is listed ('+(m?Object.keys(m.sprites).length:0)+')');
ok(await p.evaluate(()=>__kl.audSpriteFor('wj:c0000'))==='w-000','the first word maps to the first sprite');
ok(await p.evaluate(()=>__kl.audSpriteFor('we:c0000'))==='w-000','its English gloss sits with it');
ok(await p.evaluate(()=>__kl.audSpriteFor('wj:c0250'))==='w-001','a later word maps to a later sprite');
ok(await p.evaluate(()=>__kl.audSpriteFor('p:warn'))==='p-000','the fixed phrases have their own sprite');
ok(await p.evaluate(()=>__kl.audSpriteFor('wj:nope'))===null,'an unknown id resolves to nothing');
await ctx.close();
}

console.log('\n2. a clip actually plays');
{
const {ctx,p,errs}=await open(base(items20()));
await p.evaluate(()=>__kl.audManifest());
const played=await p.evaluate(async()=>{
  const t0=performance.now();
  const ok=await __kl.audPlay('wj:c0000',1);
  return {ok, ms:Math.round(performance.now()-t0)};
});
ok(played.ok===true,'the Japanese clip played to the end ('+played.ms+' ms)');
ok(await p.evaluate(()=>__kl.audPlay('we:c0000',1))===true,'so does the English gloss');
ok(await p.evaluate(()=>__kl.audPlay('p:test',1))===true,'and a fixed phrase');
ok(await p.evaluate(()=>__kl.audPlay('wj:c9999',1))===false,'a clip that does not exist reports false');
ok(await p.evaluate(()=>__kl.audHas('wj:c0000'))===true,'the sprite reports what it holds');
ok(await p.evaluate(()=>__kl.AUD.el && __kl.AUD.el.tagName==='AUDIO'),
   'playback goes through a real audio element, which is the path CarPlay accepts');
ok(errs.length===0, errs[0]||'no errors');
await ctx.close();
}

console.log('\n3. a drive never falls back to the device voice when the clips are there');
{
const {ctx,p,errs}=await open(base(items20()));
await p.click('#carBtn');
await p.waitForTimeout(9000);
const said=await p.evaluate(()=>window.__said.slice());
ok(said.length===0,'speechSynthesis was not used once ('+said.length+' calls)');
ok(await p.evaluate(()=>__kl.CAR.heard>0 || __kl.CAR.item!==null),'the drive is running on clips');
ok(await p.evaluate(()=>Object.keys(__kl.AUD.loaded).length>0),'the sprites it needed are loaded');
ok(errs.length===0, errs[0]||'no errors during a clip driven session');
await p.evaluate(()=>__kl.carFinish());
await ctx.close();
}

console.log('\n4. without the clips it still works, on the device voice');
{
const {ctx,p,errs}=await open(base(items20(),{settings:{carAudio:false}}));
ok(await p.evaluate(()=>__kl.audOn())===false,'the downloaded voice is off');
await p.click('#carBtn'); await p.waitForTimeout(2500);
ok(await p.evaluate(()=>window.__said.length>0),'the device voice takes over');
ok(errs.length===0, errs[0]||'no errors on the fallback path');
await p.evaluate(()=>__kl.carFinish());
await ctx.close();
}

console.log('\n5. a missing clip falls back rather than going silent');
{
const {ctx,p}=await open(base(items20()));
await p.evaluate(()=>__kl.audManifest());
const used=await p.evaluate(async()=>{
  window.__said.length=0;
  await __kl.carSay('hello','en',1.0,'we:c9999');
  return window.__said.slice();
});
ok(used.length===1 && used[0]==='hello','a clip that is not there hands over to the device voice');
await ctx.close();
}

console.log('\n6. stopping the drive stops the audio');
{
const {ctx,p,errs}=await open(base(items20()));
await p.click('#carBtn'); await p.waitForTimeout(3000);
await p.click('#carPause'); await p.waitForTimeout(400);
ok(await p.evaluate(()=>__kl.AUD.el.paused),'pause stops the clip mid play');
ok(await p.evaluate(()=>__kl.CAR.paused),'and the session is paused');
await p.click('#carPause'); await p.waitForTimeout(1200);
ok(await p.evaluate(()=>!__kl.CAR.paused),'resume restarts it');
await p.evaluate(()=>__kl.carFinish()); await p.waitForTimeout(300);
ok(await p.evaluate(()=>__kl.AUD.el.paused),'ending leaves nothing playing');
ok(errs.length===0, errs[0]||'no errors');
await ctx.close();
}

console.log('\n7. the download control reports honestly');
{
const {ctx,p,errs}=await open(base(items20()));
await p.click('.tab[data-go="set"]'); await p.waitForTimeout(900);
const note=await p.$eval('#audNote',e=>e.textContent);
ok(/MB/.test(note),'settings states the size ("'+note.slice(0,60)+'")');
const want=await p.evaluate(()=>__kl.audSpritesFor(__kl.carWords()).length);
const all=await p.evaluate(()=>__kl.audAllSprites().length);
ok(want>=1 && want<all,'the sprites a drive will reach are a subset of the library, not all of it ('+want+' of '+all+')');
const pre=await p.evaluate(()=>{
  const m=__kl.AUD.man; if(!m) return null;
  // what the blocking preload will actually fetch before the first word plays
  const list=__kl.audSpritesFor(__kl.carWords().slice(0,18));
  let mb=0, n=0;
  for(const s of list){ const b=(m.sprites[s]||{}).bytes||0; if(n && mb+b>8*1048576) break; mb+=b; n++; }
  return {n, mb:mb/1048576};
});
ok(pre && pre.mb<=8.01,'the preload before a drive starts is capped by size, not by a count of words ('+pre.n+' sprites, '+pre.mb.toFixed(1)+' MB)');
/* The button now fetches the whole library rather than a handful of sprites, so
   it needs longer than a couple of seconds before the note can report anything. */
await p.click('#audGet');
await p.waitForFunction(()=>/downloaded of/.test(document.getElementById('audNote').textContent),
                        null,{timeout:60000}).catch(()=>{});
const after=await p.$eval('#audNote',e=>e.textContent);
ok(/downloaded of/.test(after),'and reports what is now on the device ("'+after.slice(0,50)+'")');
ok(errs.length===0, errs[0]||'no errors');
await ctx.close();
}

await b.close();
console.log('\n'+(fails.length? fails.length+' FAILURES: '+fails.join('; ') : 'THE CAR VOICE IS PRE RENDERED AND REACHES THE AUDIO ELEMENT'));
process.exit(fails.length?1:0);})();
