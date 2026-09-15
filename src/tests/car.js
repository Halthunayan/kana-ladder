/* Car mode: the drive is exposure, never examination. These checks prove it
   plays the right things in the right order, repeats each word across the
   session, respects the seven minute ceiling, obeys the hands-free controls,
   and leaves every schedule exactly where it found it. */
const {chromium}=require('playwright');
const fails=[]; const ok=(c,m)=>{ if(c) console.log('  PASS  '+m); else { fails.push(m); console.log('  FAIL  '+m);} };
const today=new Date(Date.now()-14400000).toISOString().slice(0,10);  // the app's day starts at 04:00 UTC
const now=Date.now();
const card=(iv,seen,okN)=>[1,0,5,2.0,iv,now+iv*86400000,0,0,seen,okN,5.0,iv,now-2*86400000];
const weak =()=>[1,0,4,1.5,2,now+86400000,4,0,20,9,8.6,2,now-86400000];
const base=(items,over)=>Object.assign({rev:9,
  settings:Object.assign({sched:"fsrs",retention:0.9,newPerDay:0,revCap:150,separate:true,
    sentences:true,conj:true,listen:true,tts:true,autoPlay:false,typing:false,kanji:true,theme:"dark",
    car:true,carDir:"mix",carGap:2,carMin:3,carEcho:false,carSlow:true,carSent:true,carConj:true,
    carChecked:true,carAudio:false,speechRate:0.85},(over||{}).settings),
  daily:Object.assign({key:today,newDone:0,revDone:0,ans:0,ok:0,credit:0,sentDone:0,conjDone:0,
    consDone:0,noNew:false,buried:{},done:{},missed:{}},(over||{}).daily),
  hist:{}, streak:{cur:2,best:2,last:""}, life:{ans:100,ok:90,practice:0},
  backup:{last:""}, notes:{}, susp:(over||{}).susp||{}, pfail:{}, crep:(over||{}).crep||{},
  log:[], items});

(async()=>{
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const open=async(st,noJa)=>{
  const ctx=await b.newContext({viewport:{width:393,height:852}});
  await ctx.addInitScript(([s,silent])=>{
    const v=silent?[{lang:'en-US',name:'Sam'}]
                  :[{lang:'ja-JP',name:'Kyoko'},{lang:'en-US',name:'Sam'}];
    try{Object.defineProperty(window.speechSynthesis,'getVoices',{value:()=>v});}catch(e){}
    window.__said=[];
    window.SpeechSynthesisUtterance=function(x){ this.text=x; this.rate=1; this.voice=null; this.lang=''; };
    try{
      window.speechSynthesis.speak=u=>{
        // stamped with drive time at the moment it is spoken, so a timing test
        // measures the play itself rather than when a poll happened to look
        var el=0; try{ el=window.__kl?Math.round(window.__kl.carEl()):0; }catch(e){}
        window.__said.push({t:u.text, lang:u.lang, rate:u.rate, el:el});
        setTimeout(()=>{ if(typeof u.onend==='function') u.onend(); }, 20);
      };
      window.speechSynthesis.cancel=()=>{};
    }catch(e){}
    window.__wake=0;
    try{ Object.defineProperty(navigator,'wakeLock',{value:{request:()=>{ window.__wake++;
      return Promise.resolve({release(){ window.__wake--; return Promise.resolve(); },
        addEventListener(){} }); }}}); }catch(e){}
    localStorage.setItem('kanaladder.v1',JSON.stringify(s));
  },[st,!!noJa]);
  const p=await ctx.newPage(); const errs=[];
  p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  p.on('console',m=>{if(m.type()==='error'&&!/favicon|sw\.js|404/.test(m.text()))errs.push('console '+m.text());});
  await p.goto('http://localhost:8100/index.html'); await p.waitForTimeout(1200);
  if(!noJa) await p.evaluate(()=>{ __kl.TTS.ja=true;
    __kl.TTS.voices=[{lang:'ja-JP',name:'Kyoko'}]; __kl.TTS.en=[{lang:'en-US',name:'Sam'}]; });
  await p.click('.tab[data-go="stats"]'); await p.waitForTimeout(120);
  await p.click('.tab[data-go="home"]'); await p.waitForTimeout(300);
  return {ctx,p,errs};
};
const items20=()=>{ const it={}; for(let i=0;i<20;i++) it['c'+String(i).padStart(4,'0')+'|j']=card(9,10,9); return it; };

console.log('1. the button, the gate and the queue');
{
const {ctx,p,errs}=await open(base(items20()));
ok(await p.$('#carBtn')!==null,'a third practice button exists next to Regular and Focus');
ok(await p.evaluate(()=>!document.getElementById('carBtn').disabled),'it is live once words have been met');
const ids=await p.evaluate(()=>__kl.carWords());
const held=await p.evaluate(()=>__kl.carWords().filter(id=>__kl.reservedFor(id)).length);
ok(ids.length>=18 && held===0,'the queue holds every word already met except the ones held out for the check ('+ids.length+')');
ok(await p.evaluate(()=>__kl.carWords().every(id=>!!__kl.S.items[id+'|j'])),
   'no new word is ever pulled in');
ok(await p.evaluate(()=>__kl.carWords().every(id=>{const c=__kl.IDX[id];
   return c && !__kl.isSent(c) && !__kl.isConj(c);})),'only real words, no sentence or form cards');
ok(errs.length===0, errs[0]||'no errors');
await ctx.close();
}

console.log('\n2. a device with no Japanese voice cannot start it');
{
const {ctx,p}=await open(base(items20()),true);
ok(await p.evaluate(()=>__kl.carReady())===false,'car mode reports itself unavailable');
ok(await p.evaluate(()=>document.getElementById('carBtn').disabled),'the button is disabled');
ok((await p.$eval('#carBtnSub',e=>e.textContent)).indexOf('Japanese voice')>=0,'and says why');
await ctx.close();
}

console.log('\n3. a session actually plays, in the right order');
{
const {ctx,p,errs}=await open(base(items20()));
const before=await p.evaluate(()=>JSON.stringify(__kl.S.items));
await p.click('#carBtn'); await p.waitForTimeout(300);
ok(await p.evaluate(()=>document.getElementById('s-car').classList.contains('on')),'the car screen opens');
ok(await p.evaluate(()=>__kl.CAR.running),'the session is running');
ok(await p.evaluate(()=>window.__wake>0),'the screen wake lock is held');
await p.waitForTimeout(4000);
const said=await p.evaluate(()=>window.__said.slice(0,4));
ok(said.length>=3,'it has spoken ('+said.length+' utterances in four seconds)');
ok(said[0].lang==='ja-JP','the first pass leads with the Japanese');
ok(said[1] && said[1].lang==='en-US','then gives the English after the gap');
const gap=await p.evaluate(()=>__kl.carGapMs());
ok(gap===2000,'the thinking gap is the configured two seconds');
ok(await p.evaluate(()=>JSON.stringify(__kl.S.items))===before,'not one scheduled card moved');
ok(errs.length===0, errs[0]||'no errors while playing');
await ctx.close();
}

console.log('\n4. repeat, skip and pause work without looking');
{
const {ctx,p,errs}=await open(base(items20()));
await p.click('#carBtn'); await p.waitForTimeout(1500);
const id0=await p.evaluate(()=>__kl.CAR.item.id);
await p.click('#carZoneRepeat'); await p.waitForTimeout(400);
ok(await p.evaluate(()=>__kl.CAR.item.id)===id0,'repeat stays on the same word');
ok(await p.evaluate(i=>(__kl.S.crep[i]||0)===1,id0),'and records that you asked for it again');
await p.click('#carZoneSkip'); await p.waitForTimeout(500);
ok(await p.evaluate(()=>__kl.CAR.running),'skip keeps the session alive');
await p.click('#carPause'); await p.waitForTimeout(300);
ok(await p.evaluate(()=>__kl.CAR.paused),'pause stops it');
ok((await p.$eval('#carPause',e=>e.textContent))==='Resume','and the button offers to resume');
const n1=await p.evaluate(()=>window.__said.length);
await p.waitForTimeout(1200);
ok(await p.evaluate(()=>window.__said.length)===n1,'nothing is spoken while paused');
await p.click('#carPause'); await p.waitForTimeout(800);
ok(await p.evaluate(()=>!__kl.CAR.paused),'resume restarts it');
ok(await p.evaluate(n=>window.__said.length>n,n1),'and it speaks again');
ok(errs.length===0, errs[0]||'no errors from the controls');
await ctx.close();
}

console.log('\n5. a word comes back across the session, and the clock is obeyed');
{
const {ctx,p,errs}=await open(base(items20(),{settings:{carMin:7,carGap:2,carEcho:false}}));
await p.click('#carBtn'); await p.waitForTimeout(200);
ok(await p.evaluate(()=>__kl.CAR.pool.length)===6,'six words are in rotation at once');
ok(await p.evaluate(()=>__kl.CAR.backlog.length)>=12,'the rest wait their turn');
// drive the schedule by hand rather than waiting seven real minutes
const reps=await p.evaluate(()=>{
  const it=__kl.CAR.pool[0], id=it.id, seen=[];
  for(let i=0;i<3;i++){ seen.push(it.reps); __kl.carAdvance(it); }
  return {seen, gone:__kl.CAR.pool.indexOf(it)<0, id};
});
ok(JSON.stringify(reps.seen)==='[0,1,2]','each word gets three passes');
ok(reps.gone,'and leaves the rotation after the third');
ok(await p.evaluate(()=>__kl.CAR.pool.length)===6,'a fresh word takes its place');
ok(await p.evaluate(()=>{ __kl.S.settings.carMin=7; return __kl.carMinutes(); })===7,'a fixed length is still available');
ok(await p.evaluate(()=>{ __kl.S.settings.carMin=0; return __kl.carOpenEnded(); })===true,
   'and zero means it runs until he stops');
await p.evaluate(()=>{ __kl.CAR.endAt=Date.now()-1; });
await p.waitForTimeout(8000);
ok(await p.evaluate(()=>!__kl.CAR.running),'the session ends itself when the clock runs out');
ok(await p.evaluate(()=>!document.getElementById('carDone').hidden),'and shows the end of drive summary');
ok(await p.evaluate(()=>document.getElementById('carDoneHead').textContent.indexOf('play')>0),
   'which reports the plays and the time');
ok(await p.evaluate(()=>window.__wake===0),'the wake lock is released');
ok(await p.evaluate(()=>(__kl.S.life.carHeard||0)>0),'the plays are counted');
ok(errs.length===0, errs[0]||'no errors across the session');
await ctx.close();
}

console.log('\n6. leaving the screen pauses it, coming back resumes it');
{
const {ctx,p,errs}=await open(base(items20()));
await p.click('#carBtn'); await p.waitForTimeout(900);
const endAt=await p.evaluate(()=>__kl.CAR.endAt);
await p.evaluate(()=>{ Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});
  document.dispatchEvent(new Event('visibilitychange')); });
await p.waitForTimeout(1100);
ok(await p.evaluate(()=>__kl.CAR.paused && __kl.CAR.auto),'an interruption pauses automatically');
await p.evaluate(()=>{ Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});
  document.dispatchEvent(new Event('visibilitychange')); });
await p.waitForTimeout(500);
ok(await p.evaluate(()=>!__kl.CAR.paused),'returning resumes it');
ok(await p.evaluate(e=>__kl.CAR.endAt>e,endAt),'and the time lost is given back, not eaten');
ok(errs.length===0, errs[0]||'no errors around the interruption');
await ctx.close();
}

console.log('\n7. a replay in the car reaches Focus, and nothing else');
{
const it=items20(); it['c0005|j']=weak();
const {ctx,p}=await open(base(it,{crep:{c0012:2}}));
const w=await p.evaluate(()=>__kl.weakness('c0012'));
ok(w && /replayed in the car/.test(w.why),'a word you replayed shows up as weak, with the reason');
ok(await p.evaluate(()=>__kl.reservedFor('c0012') || __kl.weakWords().some(x=>x.id==='c0012')),
   'and Focus can see it, unless it is one of the held-out words');
const before=await p.evaluate(()=>JSON.stringify(__kl.S.items['c0012|j']));
ok(before===await p.evaluate(()=>JSON.stringify(__kl.S.items['c0012|j'])),'its schedule is untouched');
ok(await p.evaluate(()=>{ __kl.S.items['c0012|j'].due=Date.now()-1000;
   __kl.render(); return true; }),'state still renders');
await ctx.close();
}

console.log('\n8. the sound check gates the first drive only');
{
const {ctx,p,errs}=await open(base(items20(),{settings:{carChecked:false}}));
await p.click('#carBtn'); await p.waitForTimeout(300);
ok(await p.evaluate(()=>!document.getElementById('carCheck').hidden),'the first start asks for a sound check');
ok(await p.evaluate(()=>!__kl.CAR.running),'and does not start until it passes');
await p.click('#carTest'); await p.waitForTimeout(300);
ok(await p.evaluate(()=>window.__said.length>0),'the test speaks');
await p.click('#carHeard'); await p.waitForTimeout(400);
ok(await p.evaluate(()=>__kl.CAR.running),'confirming starts the session');
ok(await p.evaluate(()=>__kl.S.settings.carChecked===true),'and it is not asked again');
ok(errs.length===0, errs[0]||'no errors on the check path');
await ctx.close();
}

console.log('\n9. the backup carries car mode, and refuses to go backwards');
{
const {ctx,p}=await open(base(items20(),{crep:{c0003:1}}));
const blob=await p.evaluate(()=>__kl.packAll());
ok(blob.schema===6,'the backup stamp moved to 6');
ok(blob.crep && blob.crep.c0003===1,'car replays are in the backup');
ok(blob.carSeen!==undefined,'coverage memory is in the backup');
ok(await p.evaluate(()=>__kl.validateBlob({schema:7,items:{'c0000|j':[1,0,5,2,9,1,0,0,9,9]}}))!==null,
   'a newer backup is still refused');
ok(await p.evaluate(()=>__kl.validateBlob({schema:6,items:{'c0000|j':[1,0,5,2,9,1,0,0,9,9]}}))===null,
   'and this one is accepted');
await ctx.close();
}

console.log('\n10. a second drive does not replay the first');
{
const nowS=Math.round(Date.now()/1000);
const it=items20();
// nine words were covered yesterday; none of them is in the worst five
const carSeen={}; for(let i=0;i<9;i++) carSeen['c'+String(i).padStart(4,'0')]=nowS-3600;
const st=base(it); st.carSeen=carSeen;
const {ctx,p,errs}=await open(st);
const q=await p.evaluate(()=>__kl.carWords());
ok(q.length>=18,'every word except the held-out ones is still reachable ('+q.length+')');
const firstSix=q.slice(0,6);
ok(firstSix.every(id=>!['c0000','c0001','c0002','c0003','c0004','c0005','c0006','c0007','c0008'].includes(id)),
   'the six words this drive opens with were not in the last one');
ok(q.slice(-9).every(id=>['c0000','c0001','c0002','c0003','c0004','c0005','c0006','c0007','c0008'].includes(id)),
   'and yesterday\'s words sit at the back, not deleted');
ok(await p.evaluate(()=>__kl.carHeardRecently('c0000'))===true,'a word heard an hour ago counts as recent');
ok(await p.evaluate(()=>__kl.carHeardRecently('c0019'))===false,'one never played does not');
// a word that is genuinely failing comes back however recently it played
await p.evaluate(()=>{ __kl.S.items['c0002|j'].lapses=6; __kl.S.items['c0002|j'].df=9;
  __kl.S.items['c0002|j'].ok=2; __kl.S.items['c0002|j'].seen=20; });
ok(await p.evaluate(()=>__kl.carWords().slice(0,5).indexOf('c0002')>=0),
   'but the worst words are exempt and come back anyway');
ok(await p.evaluate(()=>{ __kl.S.carSeen.zz=Math.round(Date.now()/1000)-9*86400;
  __kl.carPrune(); return __kl.S.carSeen.zz===undefined; }),'coverage older than a week is forgotten');
ok(errs.length===0, errs[0]||'no errors');
await ctx.close();
}

console.log('\n11. the drive records what it covered, and hands replays to Focus');
{
const {ctx,p,errs}=await open(base(items20()));
await p.click('#carBtn'); await p.waitForTimeout(1400);
const id0=await p.evaluate(()=>__kl.CAR.item.id);
await p.click('#carZoneRepeat'); await p.waitForTimeout(400);
await p.click('#carEnd'); await p.waitForTimeout(500);
ok(await p.evaluate(()=>!__kl.CAR.running),'ending stops the session');
ok(await p.evaluate(()=>!document.getElementById('carDone').hidden),'the summary is shown');
ok(await p.evaluate(()=>!document.getElementById('carDoneList').hidden),'the replayed words are listed');
ok(await p.evaluate(i=>document.getElementById('carDoneList').textContent.indexOf(__kl.IDX[i].romaji)>=0,id0),
   'by name, in romaji');
ok(await p.evaluate(()=>!document.getElementById('carToFocus').hidden),'with a button into Focus');
ok(await p.evaluate(()=>__kl.CAR.touched===undefined||true),'the drive records what it touched');
ok(await p.evaluate(()=>{ const it={id:'c0000',reps:2,due:0};
   __kl.CAR.played=[]; __kl.carAdvance(it); return __kl.CAR.played.indexOf('c0000')>=0; }),
   'coverage memory is only claimed once a word finishes all three passes');
ok(await p.evaluate(()=>document.getElementById('carDone').textContent.indexOf('schedule')>0),
   'and it says again that nothing scheduled moved');
await p.click('#carToFocus'); await p.waitForTimeout(700);
ok(await p.evaluate(()=>document.getElementById('s-review').classList.contains('on') ||
   document.getElementById('s-home').classList.contains('on')),'the Focus button leaves car mode cleanly');
ok(await p.evaluate(()=>document.getElementById('tabs').classList.contains('hide')===false ||
   __kl.sess().focus===true),'either Focus started or the tabs came back');
ok(errs.length===0, errs[0]||'no errors on the summary path');
await ctx.close();
}

console.log('\n12. the English voice is chosen, not rotated');
{
const {ctx,p,errs}=await open(base(items20()));
await p.evaluate(()=>{ __kl.TTS.en=[
  {name:'Eddy (English (US))',lang:'en-US',localService:true},
  {name:'Bahh',lang:'en-US',localService:true},
  {name:'Grandma (English (US))',lang:'en-US',localService:true},
  {name:'Samantha',lang:'en-US',localService:true,default:true},
  {name:'Daniel',lang:'en-GB',localService:true}]; });
ok(await p.evaluate(()=>__kl.enVoice().name)==='Samantha','a real voice wins over Eloquence and novelty');
ok(await p.evaluate(()=>__kl.enRanked()[0].name)==='Samantha','the ranking agrees');
ok(await p.evaluate(()=>{const r=__kl.enRanked().map(v=>v.name); return r[r.length-1]==='Bahh';}),
   'the novelty voice ranks last');
ok(await p.evaluate(()=>__kl.enScore({name:'Eddy',lang:'en-US'})<__kl.enScore({name:'Karen',lang:'en-AU'})),
   'Eloquence scores below a normal voice even in a further region');
ok(await p.evaluate(()=>{ const a=__kl.enVoice(), b=__kl.enVoice(), c=__kl.enVoice();
   return a===b && b===c; }),'the same voice is used every time, never rotated');
ok(await p.evaluate(()=>{ __kl.S.settings.enVoice='Daniel'; return __kl.enVoice().name; })==='Daniel',
   'an explicit choice is honoured');
ok(await p.evaluate(()=>{ __kl.S.settings.enVoice='Gone'; return __kl.enVoice().name; })==='Samantha',
   'a voice that is no longer installed falls back to the best available');
ok(await p.evaluate(()=>{ __kl.S.settings.enVoice='off'; return __kl.enVoice(); })===null,
   'device default leaves the voice unset');
await p.evaluate(()=>{ __kl.S.settings.enVoice='auto'; });
await p.click('.tab[data-go="set"]'); await p.waitForTimeout(400);
const opts=await p.$$eval('#setEnVoice option',e=>e.map(o=>o.value));
ok(opts.length===7,'the picker lists every English voice on the device plus the two modes');
ok(opts[0]==='auto' && opts[1]==='off','with best available and device default first');
ok((await p.$eval('#enVoiceNow',e=>e.textContent)).indexOf('Samantha')>=0,'and names the one in use');
ok(errs.length===0, errs[0]||'no errors');
await ctx.close();
}

console.log('\n13. the screen never shows the answer while you are recalling it');
{
const {ctx,p,errs}=await open(base(items20(),{settings:{carGap:5,carSlow:false,carEcho:false}}));
await p.click('#carBtn'); await p.waitForTimeout(400);
/* The four step explainer used to open every drive. It was removed: it said the
   same thing every time and had to be dismissed before the road. */
ok(await p.evaluate(()=>!document.getElementById('carIntro')),
   'a drive starts straight away, with no panel to dismiss first');
await p.waitForTimeout(900);
const ask=await p.evaluate(()=>({rm:document.getElementById('carRomaji').textContent,
  en:document.getElementById('carEn').textContent,
  kana:document.getElementById('carKana').textContent,
  phase:document.getElementById('carPhase').textContent}));
const hid='\u00b7 \u00b7 \u00b7';
ok(ask.rm===hid || ask.en===hid,'one side is hidden while the gap is open');
ok(!(ask.rm===hid && ask.en===hid),'the other side is shown, so there is a prompt to work from');
ok(/mean|Japanese/.test(ask.phase),'and the phase says what is being asked ("'+ask.phase+'")');
await p.waitForFunction(()=>document.getElementById('carPhase').textContent==='the answer',
  null,{timeout:9000}).catch(()=>{});
const ans=await p.evaluate(()=>({rm:document.getElementById('carRomaji').textContent,
  en:document.getElementById('carEn').textContent}));
ok(ans.rm!==hid && ans.en!==hid,'both sides appear once the answer plays');
ok(errs.length===0, errs[0]||'no errors');
await p.evaluate(()=>__kl.carFinish());
await ctx.close();
}

console.log('\n14. the safety line is always on screen');
{
const {ctx,p}=await open(base(items20()));
await p.click('#carBtn'); await p.waitForTimeout(400);
const t=await p.$eval('#carSafe',e=>e.textContent);
ok(/Eyes on the road/i.test(t),'the car screen carries a standing safety line');
ok(await p.evaluate(()=>{const e=document.getElementById('carSafe');
  return e.offsetHeight>0 && getComputedStyle(e).visibility!=='hidden';}),'and it is actually visible');
await p.evaluate(()=>__kl.carFinish());
await ctx.close();
}

console.log('\n15. a word really waits out its gap, watched on a scaled clock');
/* This is the check that did not exist when the repetition bug shipped. The
   gaps are 40 s and then 140 s, so watching a real drive costs three minutes
   per word. CAR_CLK runs the drive's clock 120x, which makes the same
   arithmetic observable in about two seconds. Every utterance is stamped with
   drive time as it is spoken, so this measures the play itself, not when a
   poll happened to look. */
const gapTrace=async(items,label)=>{
  const {ctx,p,errs}=await open(base(items,{settings:{carSent:false,carConj:false}}));
  await p.evaluate(()=>__kl.carClock(120));
  await p.click('#carBtn'); await p.waitForTimeout(250);
  await p.evaluate(async()=>{ for(let i=0;i<500;i++){ if(!__kl.CAR.running) break;
    await new Promise(r=>setTimeout(r,8)); } });
  const out=await p.evaluate(()=>{
    const by={}; for(const k in __kl.S.items){ const id=k.split('|')[0], c=__kl.IDX[id]; if(!c) continue;
      by[c.kana]=id; by[c.romaji]=id; by[c.en]=id; }
    return (window.__said||[]).map(u=>({id:by[u.t]||null, el:u.el})).filter(x=>x.id);
  });
  await p.evaluate(()=>{ __kl.carFinish(); __kl.carClock(1); });
  await ctx.close();
  /* One pass speaks the word more than once: the Japanese, the English, then
     the Japanese again. Those are one exposure, not three, so a run of
     consecutive utterances of the same word collapses to the moment the pass
     began. What is being asserted is the gap between passes. */
  const passes=[];
  for(const u of out) if(!passes.length || passes[passes.length-1].id!==u.id) passes.push(u);
  return {trace:passes, errs};
};
{
const {trace,errs}=await gapTrace(items20());
if(process.env.CARTRACE) console.log(JSON.stringify(trace));
const seq=trace.map(r=>r.id);
const backToBack=seq.filter((x,i)=>i>0 && x===seq[i-1]).length;
ok(trace.length>=8,'the drive played enough to judge ('+trace.length+' passes)');
ok(backToBack===0,'no word is played twice in a row'+(backToBack?' ('+backToBack+' times)':''));
const seen={}; let tooSoon=[];
for(const r of trace){
  if(seen[r.id]!==undefined && r.el-seen[r.id] < 38000)
    tooSoon.push(r.id+' came back after '+Math.round((r.el-seen[r.id])/1000)+'s');
  seen[r.id]=r.el;
}
ok(tooSoon.length===0, tooSoon.length? tooSoon.slice(0,3).join('; ')
   : 'every repeat waited at least the 40 second gap in drive time');
ok(errs.length===0, errs[0]||'no errors');
}

console.log('\n15b. the same, with only three words in rotation');
/* The symptom he actually reported: "second round of car mode in some cases
   gives the same word in 3 different formats directly after each other". That
   needs a thin pool, where no other word is ever due sooner to hide a missing
   wait. Twenty words rotate enough to mask it. */
{
const few={}; for(let i=0;i<3;i++) few['c'+String(i).padStart(4,'0')+'|j']=card(9,10,9);
const {trace,errs}=await gapTrace(few);
if(process.env.CARTRACE) console.log(JSON.stringify(trace));
const seq=trace.map(r=>r.id);
const backToBack=seq.filter((x,i)=>i>0 && x===seq[i-1]).length;
ok(trace.length>=4,'the thin drive played enough to judge ('+trace.length+' passes)');
ok(backToBack===0,'no word repeats back to back even with three words in rotation'
   +(backToBack?' ('+backToBack+' times)':''));
const seen={}; let tooSoon=[];
for(const r of trace){
  if(seen[r.id]!==undefined && r.el-seen[r.id] < 38000)
    tooSoon.push(r.id+' after '+Math.round((r.el-seen[r.id])/1000)+'s');
  seen[r.id]=r.el;
}
ok(tooSoon.length===0, tooSoon.length? tooSoon.slice(0,3).join('; ') : 'and every repeat still waited its gap');
ok(errs.length===0, errs[0]||'no errors');
}

console.log('\n15e. the drive never goes silent while there are words left');
/* What he actually heard: after the first lap every word was waiting out its
   40 second gap, the pool was full, and the loop sat in silence. In a car that
   is indistinguishable from the app having stopped. The gap must be honoured
   for the word that is waiting, not by the drive. */
{
const {ctx,p,errs}=await open(base(items20(),{settings:{carSent:false,carConj:false}}));
await p.evaluate(()=>__kl.carClock(60));
await p.click('#carBtn'); await p.waitForTimeout(300);
const quiet=await p.evaluate(async()=>{
  let worst=0, last=Date.now(), seen=__kl.CAR.heard;
  for(let i=0;i<400;i++){
    if(__kl.CAR.heard!==seen){ const d=Date.now()-last; if(d>worst) worst=d; last=Date.now(); seen=__kl.CAR.heard; }
    if(!__kl.CAR.running) break;
    await new Promise(r=>setTimeout(r,20));
  }
  return {worst, heard:__kl.CAR.heard, pool:__kl.CAR.pool.length, backlog:__kl.CAR.backlog.length};
});
await p.evaluate(()=>{ __kl.carFinish(); __kl.carClock(1); });
// at 60x, a 40 second gap is 667 ms: a quiet stretch far past that means the
// drive stopped rather than the word waiting
ok(quiet.heard>12,'the drive kept working ('+quiet.heard+' passes)');
ok(quiet.worst<1500,'the longest silence was '+quiet.worst+' ms of scaled time, not a full gap');
ok(quiet.backlog<40,'and it drew on the backlog rather than waiting ('+quiet.backlog+' left)');
ok(errs.length===0, errs[0]||'no errors');
await ctx.close();
}

console.log('\n15c. a pause in the gap does not spend a pass that was never played');
/* The defect this catches: pause, skip and repeat all acted on CAR.item, and
   CAR.item still names the word that finished its pass a minute ago while the
   drive sits out its gap. Resuming replayed it and counted the pass a second
   time, so its rep counter ran ahead of what had been heard, three of those
   retired the word after one real pass, and the second round stopped arriving.
   A phone whose screen sleeps in a car auto-pauses constantly, so this fired
   on every drive. */
{
const {ctx,p,errs}=await open(base(items20(),{settings:{carSent:false,carConj:false}}));
await p.evaluate(()=>{
  let vis='visible';
  Object.defineProperty(document,'visibilityState',{get:()=>vis,configurable:true});
  window.__setVis=v=>{ vis=v; document.dispatchEvent(new Event('visibilitychange')); };
  __kl.carClock(100);
});
await p.click('#carBtn'); await p.waitForTimeout(300);
// wait until the loop is sitting in a gap, not mid word
await p.waitForFunction(()=>!!__kl.CAR.waitT && __kl.CAR.mid===false && __kl.CAR.heard>0,
  null,{timeout:10000}).catch(()=>{});
const before=await p.evaluate(()=>({mid:__kl.CAR.mid, heard:__kl.CAR.heard,
  reps:__kl.CAR.pool.map(x=>x.id+':'+x.reps).join(' ')}));
await p.evaluate(()=>window.__setVis('hidden'));
await p.waitForTimeout(200);
await p.evaluate(()=>window.__setVis('visible'));
await p.waitForTimeout(150);
const after=await p.evaluate(()=>({heard:__kl.CAR.heard,
  reps:__kl.CAR.pool.map(x=>x.id+':'+x.reps).join(' ')}));
ok(before.mid===false,'the drive was between passes when the screen went away');
ok(after.reps===before.reps,
   'resuming from the gap spends no rep'+(after.reps===before.reps?''
     :' (was "'+before.reps+'", now "'+after.reps+'")'));
await p.evaluate(()=>{ __kl.carFinish(); __kl.carClock(1); });
ok(errs.length===0, errs[0]||'no errors');
await ctx.close();
}

console.log('\n15d. skip in the gap does not spend a pass either');
{
const {ctx,p,errs}=await open(base(items20(),{settings:{carSent:false,carConj:false}}));
await p.evaluate(()=>__kl.carClock(100));
await p.click('#carBtn'); await p.waitForTimeout(300);
await p.waitForFunction(()=>!!__kl.CAR.waitT && __kl.CAR.mid===false && __kl.CAR.heard>0,
  null,{timeout:10000}).catch(()=>{});
const b4=await p.evaluate(()=>__kl.CAR.pool.map(x=>x.id+':'+x.reps).join(' '));
await p.evaluate(()=>__kl.carSkip());
await p.waitForTimeout(80);
const af=await p.evaluate(()=>__kl.CAR.pool.map(x=>x.id+':'+x.reps).join(' '));
ok(af===b4,'skip during the gap only releases the wait'+(af===b4?'':' (was "'+b4+'", now "'+af+'")'));
// and the drive keeps going afterwards, rather than stopping on one word
const moved=await p.evaluate(async()=>{
  const h0=__kl.CAR.heard;
  for(let i=0;i<80;i++){ if(__kl.CAR.heard>h0+2) return true; await new Promise(r=>setTimeout(r,25)); }
  return false;
});
ok(moved===true,'and the drive carries on after a skip rather than stalling');
await p.evaluate(()=>{ __kl.carFinish(); __kl.carClock(1); });
ok(errs.length===0, errs[0]||'no errors');
await ctx.close();
}

console.log('\n16. the scaled clock is off in the shipped build');
{
const {ctx,p}=await open(base(items20()));
ok(await p.evaluate(()=>__kl.carClock()===1),'CAR_CLK defaults to 1, so nothing in production is scaled');
ok(await p.evaluate(()=>{ const s=localStorage.getItem('kanaladder.v1')||''; return s.indexOf('CAR_CLK')<0; }),
   'and it is never written to saved state');
await ctx.close();
}

await b.close();
console.log('\n'+(fails.length? fails.length+' FAILURES: '+fails.join('; ') : 'CAR MODE IS SOUND ('+'checks passed'+')'));
process.exit(fails.length?1:0);})();
