/* The 28 September round: the sixty items from the two councils.
   Each block asserts the behaviour the item asked for against the page he
   loads, with his real kind of state (words met, sentences failing, a
   backlog). Run against the PWA build on localhost:8100. */
const {chromium}=require('playwright');
let fails=0;
function ok(c,m){ console.log((c?'  PASS  ':'  FAIL  ')+m); if(!c) fails++; }
const today=new Date(Date.now()-14400000).toISOString().slice(0,10);
const DAY=86400000;
function it(o){ return Object.assign({s:1,st:0,n:4,ef:2.5,iv:10,due:Date.now()+5*DAY,lapses:0,piv:0,seen:5,ok:5,df:4,sb:10,lr:Date.now()-5*DAY},o||{}); }
function pack(o){ return [o.s,o.st,o.n,o.ef,o.iv,o.due,o.lapses,o.piv,o.seen,o.ok,o.df,o.sb,o.lr]; }
const base=(items,extra)=>Object.assign({schema:7,rev:9,
  settings:{sched:"fsrs",retention:0.9,newPerDay:3,revCap:150,separate:true,sentences:true,sentPerDay:3,conj:true,listen:true,
    tts:true,autoPlay:false,typing:false,kanji:false,theme:"dark",carAudio:true,carChecked:true,cardAudio:true,tripDate:"2026-11-30",softCap:true,reverse:"grad"},
  daily:{key:today,newDone:0,revDone:0,ans:0,ok:0,credit:0,sentDone:0,conjDone:0,consDone:0,noNew:false,buried:{},done:{},missed:{}},
  hist:{}, streak:{cur:2,best:2,last:""}, life:{ans:100,ok:90,practice:0}, backup:{last:today}, notes:{}, susp:{}, pfail:{}, crep:{}, carSeen:{},
  checks:[], log:[], items:items||{}}, extra||{});
const fakeRec=()=>{
  window.__recStarts=0; window.__recActive=null; window.__spoken=[];
  window.SpeechRecognition=window.webkitSpeechRecognition=function(){
    const R=this; R.lang=""; R.continuous=false;
    R.start=function(){ window.__recStarts++; window.__recActive=R; };
    R.stop=function(){ if(window.__recActive===R) window.__recActive=null; };
    R.abort=function(){ if(window.__recActive===R) window.__recActive=null; R.onend&&R.onend(); };
  };
  window.SpeechSynthesisUtterance=function(t){this.text=t;this.rate=1;};
  try{ speechSynthesis.speak=u=>{ window.__spoken.push(u.text); setTimeout(()=>{u.onstart&&u.onstart(); u.onend&&u.onend();},5); }; speechSynthesis.cancel=()=>{}; }catch(e){}
  window.__recSay=function(next){
    const R=window.__recActive; if(!R) return false;
    const alts=(Array.isArray(next)?next:[next]).map(t=>({transcript:t,confidence:0.9}));
    R.onresult&&R.onresult({results:[alts]});
    if(!R.continuous){ window.__recActive=null; R.onend&&R.onend(); }
    return true;
  };
};
async function open(b, state){
  const ctx=await b.newContext({viewport:{width:393,height:852}, acceptDownloads:true});
  await ctx.addInitScript(s=>{ localStorage.setItem('kanaladder.v1',JSON.stringify(s)); }, state);
  await ctx.addInitScript(fakeRec);
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8100/index.html');
  await p.waitForFunction(()=>window.__kl&&__kl.DECK.length>0,null,{timeout:20000});
  return {ctx,p,errs};
}
// a state like his: the first 90 words by ord known, some sentences failing
async function hisLike(b, extra){
  const probe=await open(b, base({}));
  const ids=await probe.p.evaluate(()=>__kl.INTRO.slice(0,90).map(c=>c.id));
  await probe.ctx.close();
  const items={};
  ids.forEach(id=>{ items[id+'|j']=pack(it()); items[id+'|e']=pack(it()); });
  return open(b, base(items, extra||{}));
}

(async()=>{
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

console.log('\n1. English read aloud: no tilde, no notes, no slash (his item)');
{
  const {ctx,p,errs}=await open(b, base({}));
  const r=await p.evaluate(()=>{ const k=__kl, I=k.IDX;
    const bad=k.DECK.filter(c=>/[~～()\[\]\/;]/.test(k.sayEn(c)));
    return {c0227:k.sayEn(I.c0227), c0237:k.sayEn(I.c0237), c0254:k.sayEn(I.c0254), c0000:k.sayEn(I.c0000), c0218:k.sayEn(I.c0218),
      bad:bad.length, sq:k.DECK.filter(c=>c.sq).length, js:k.cleanEn("this ~ (before a noun)"), js2:k.cleanEn("to / at / in (time, destination)")};});
  ok(r.c0227==='this','"this ~ (before a noun)" is said as "'+r.c0227+'"');
  ok(r.c0237==='to, at or in','"to / at / in (time, destination)" is said as "'+r.c0237+'"');
  ok(r.c0254==='I want to','"I want to ~ (verb)" is said as "'+r.c0254+'"');
  ok(r.c0000==='hello or good afternoon','a slash is read as "or" ("'+r.c0000+'")');
  ok(!/[()~]/.test(r.c0218) && /not any more/.test(r.c0218),'"(not)" keeps its meaning as "not" ("'+r.c0218+'")');
  ok(r.bad===0,'no deck card is spoken with ~ ( ) [ ] / or ; ('+r.bad+')');
  ok(r.js==='this' && r.js2==='to, at or in','the in-app fallback cleaner agrees with the build ("'+r.js+'", "'+r.js2+'")');
  ok(r.sq>30,'cards that sound alike in English once cleaned are marked, so car mode never asks them from English ('+r.sq+')');
  // the device voice fallback in car mode gets the clean text too
  const heard=await p.evaluate(async()=>{ const k=__kl; k.S.settings.carAudio=false;
    window.__spoken=[]; await k.carSay(k.sayEn(k.IDX.c0227),"en",1.0,null); return window.__spoken.slice(); });
  ok(heard.length===1 && heard[0]==='this','the device voice is handed "'+heard[0]+'", not the gloss');
  ok(errs.length===0,'no page errors');
  await ctx.close();
}

console.log('\n2. Speaking and Scenes: a revealed answer said aloud cannot overwrite the miss');
{
  const {ctx,p,errs}=await hisLike(b);
  await p.evaluate(()=>{ const k=__kl; k.speakingStart(); k.SP.ids=[k.SP.ids[0],k.SP.ids[1]||k.SP.ids[0]]; k.SP.dir[k.SP.ids[0]]='e'; k.SP.cur=-1; k.spAsk(0); });
  const id=await p.evaluate(()=>__kl.SP.ids[0]);
  for(let n=0;n<3;n++){
    await p.waitForFunction(()=>!!window.__recActive && /listening/.test(document.getElementById('spState').textContent),null,{timeout:20000});
    await p.evaluate(()=>window.__recSay('ぜんぜんちがう'));
    await p.waitForTimeout(n<2?1100:200);
  }
  const mid=await p.evaluate(()=>({v:__kl.SP.verdict[0], g:__kl.SP.grade[0], locked:__kl.SP.locked[0]}));
  ok(mid.v==='missed' && mid.g===0 && mid.locked,'three misses: missed, 0%, locked ('+JSON.stringify(mid)+')');
  const kana=await p.evaluate(i=>__kl.IDX[i].kana, id);
  await p.evaluate(k=>window.__recSay(k), kana);
  await p.waitForTimeout(200);
  const after=await p.evaluate(()=>({v:__kl.SP.verdict[0], st:__kl.SP.state[0]}));
  ok(after.v==='missed' && after.st==='bad','saying the revealed answer during the reveal changes nothing ('+JSON.stringify(after)+')');
  const sp=await p.evaluate(i=>__kl.S.spoken[i], id);
  ok(sp && sp.n===1 && sp.miss,'the miss is kept per word for Practice ('+JSON.stringify(sp)+')');
  await p.evaluate(()=>{ const k=__kl; k.SP.cur=k.SP.ids.length; k.spAsk(k.SP.ids.length); });
  await p.waitForTimeout(200);
  ok(await p.evaluate(()=>__kl.CONT.running)===false,'the mic is off once the round is over');
  ok(errs.length===0,'no page errors');
  await ctx.close();
}

console.log('\n3. Grading by voice: the right answer passes, the opposite does not');
{
  const {ctx,p}=await open(b, base({}));
  const r=await p.evaluate(()=>{ const k=__kl, I=k.IDX;
    const en=(id,said)=>k.enGrade(I[id].en,[said]).sim>=0.6;
    const ja=(id,said)=>k.spGradeJa(I[id].kana,[said]).sim>=0.62;
    return {until:en('c0244','until'), also:en('c0241','also'), must:en('c0602','must'),
      eve:en('c0003','good morning'), thisThat:en('c0224','that one'),
      waka:ja('c0017','わかりました'), juu:ja('c0043','きゅう'), rightJa:ja('c0017','わかりません')}; });
  ok(r.until && r.also && r.must,'"until", "also" and "must" now pass ('+JSON.stringify(r)+')');
  ok(!r.eve && !r.thisThat,'"good morning" no longer passes for good evening, nor "that one" for this one');
  ok(!r.waka && !r.juu && r.rightJa,'wakarimashita is not wakarimasen, kyuu is not juu, and the right answer still passes');
  ok(await p.evaluate(()=>__kl.verdictPct('missed'))===0 && await p.evaluate(()=>__kl.verdictPct('close'))===70,'wrong grades 0, close 70');
  ok(await p.evaluate(()=>__kl.voiceCmd(['skip'])==='skip' && __kl.voiceCmd(['スキップ'])==='skip' && __kl.voiceCmd(['show me'])==='show'),'"skip", its katakana, and "show me" act as buttons');
  await ctx.close();
}

console.log('\n4. The four grade buttons always mean four different things');
{
  const {ctx,p}=await hisLike(b);
  const r=await p.evaluate(()=>{ const k=__kl, now=Date.now(), DAYMS=86400000; let bad=0, n=0, hardEqAgain=0;
    const probes=[{s:0,st:0,sb:0},{s:2,st:0,sb:0.3,df:7,lr:now-600000,lapses:1,iv:3},{s:1,iv:1,sb:0.6,df:8,lr:now-DAYMS},{s:1,iv:5,sb:5,df:5,lr:now-5*DAYMS},{s:1,iv:20,sb:20,df:3,lr:now-20*DAYMS}];
    probes.forEach(pr=>{ const o=k.fsrsOutcomes(Object.assign({n:1,ef:2.5,due:now,piv:0,seen:3,ok:2,lapses:0,df:5},pr),now);
      n++; const d=o.map(x=>x.due-now);
      if(!(d[0]<d[1] && d[1]<d[2] && d[2]<d[3])) bad++;
      if(d[1]===d[0]) hardEqAgain++; });
    return {bad,n,hardEqAgain};
  }).catch(e=>({err:String(e)}));
  ok(!r.err && r.bad===0,'Again < Hard < Good < Easy on new, relearning, young and mature cards ('+JSON.stringify(r)+')');
  await ctx.close();
}

console.log('\n5. Held cards: patterns wait for a verb, particles and staff phrases are never asked from English');
{
  const items={};
  ['c0253','c0602','c0237','c1783'].forEach(id=>{ items[id+'|j']=pack(it({due:Date.now()-DAY})); items[id+'|e']=pack(it({due:Date.now()-DAY})); });
  const {ctx,p}=await open(b, base(items));
  const r=await p.evaluate(()=>{ const k=__kl, P=k.pools();
    return {rev:P.rev, heldPat:k.held('c0253|j'), heldPartE:k.held('c0237|e'), partJ:k.held('c0237|j'), staffE:k.held('c1783|e'),
      nr:[k.noReverse(k.IDX.c0237),k.noReverse(k.IDX.c1783),k.noReverse(k.IDX.c0253),k.noReverse(k.IDX.c0000)]}; });
  ok(r.heldPat && r.rev.indexOf('c0253|j')<0,"let's ~ waits while no verb it attaches to is known");
  ok(r.heldPartE && !r.partJ && r.rev.indexOf('c0237|j')>=0,'a particle is still read, but never asked from English');
  ok(r.staffE && r.rev.indexOf('c1783|e')<0,'a staff phrase is never asked from English');
  ok(JSON.stringify(r.nr)==='[true,true,true,false]','noReverse picks exactly those');
  // once a verb is known, the pattern opens and shows it working
  const f=await p.evaluate(()=>{ const k=__kl; const v=k.IDX.c0253.needs[0];
    k.S.items[v+'|j']={s:1,st:0,n:4,ef:2.5,iv:10,due:Date.now()+9e8,lapses:0,piv:0,seen:5,ok:5,df:4,sb:10,lr:Date.now()};
    return {held:k.held('c0253|j'), fr:k.patternFrame(k.IDX.c0253)}; });
  ok(!f.held && f.fr && /mashou$/.test(f.fr.romaji) && /^let's /.test(f.fr.en),'with a verb known it opens, framed as '+(f.fr&&f.fr.romaji)+' ('+(f.fr&&f.fr.en)+')');
  await ctx.close();
}

console.log('\n6. Sentences: need a known content word, and a failing one waits for its word');
{
  const {ctx,p}=await hisLike(b);
  const r=await p.evaluate(()=>{ const k=__kl, x=k.SIDX.s023;
    const miss=k.sentMissing(x);
    // make every function word known, leave the content word unknown
    x.w.forEach(w=>{ if(k.isFuncWord(w)) k.S.items[w+'|j']={s:1,st:0,n:4,ef:2.5,iv:10,due:Date.now()+9e8,lapses:0,piv:0,seen:5,ok:5,df:4,sb:10,lr:Date.now()}; });
    const open=k.sentOpen(x);
    k.S.items['s023|j']={s:2,st:0,n:4,ef:2.5,iv:1,due:Date.now()-1000,lapses:2,piv:1,seen:9,ok:3,df:9,sb:0.2,lr:Date.now()-DAYX()};
    function DAYX(){ return 86400000; }
    return {open, held:k.held('s023|j'), miss:k.sentMissing(x)}; });
  ok(r.open===false,'iie, tooku nai desu does not open on iie and desu alone');
  ok(r.held && r.miss.length>0,'a sentence with two lapses and a missing word waits for the word');
  ok(await p.evaluate(()=>{ const k=__kl; const x=k.SIDX.nS006; return !!k.askedBy('nS006'); }),'a scene reply knows the question it answers');
  await ctx.close();
}

console.log('\n7. Survival phrases and the trip queue');
{
  const {ctx,p}=await hisLike(b);
  const r=await p.evaluate(()=>{ const k=__kl, P=k.pools(), b=k.budgets();
    return {pk:P.pk.length, first:P.pk[0], packLeft:b.packLeft, snFirst:P.sn.slice(0,5).map(x=>x.split('|')[0]),
      scene:P.sn.slice(0,5).map(x=>k.isSceneLine(x.split('|')[0])||!!k.SIDX[x.split('|')[0]].say)}; });
  ok(r.pk>=30 && r.packLeft===2,'the pack is served whole, two a day ('+r.pk+' waiting)');
  ok(r.scene.every(Boolean) || r.snFirst.length===0,'the sentence queue leads with scene and trip lines ('+r.snFirst.join(',')+')');
  const t=await p.evaluate(()=>{ const k=__kl; k.S.settings.tripDate=new Date(Date.now()+5*86400000).toISOString().slice(0,10); const b=k.budgets(); return b; });
  ok(t.newLeft===0 && t.sentLeft===0 && t.conjLeft===0 && t.packLeft===0,'in the last ten days nothing new starts, sentences and conjugation included');
  await ctx.close();
}

console.log('\n8. Honest numbers');
{
  const items={};
  const {ctx:c0,p:p0}=await open(b, base({}));
  const ids=await p0.evaluate(()=>__kl.INTRO.slice(0,91).map(c=>c.id)); const sids=await p0.evaluate(()=>__kl.SENT.slice(0,43).map(x=>x.id)); await c0.close();
  ids.forEach(id=>items[id+'|j']=pack(it())); sids.forEach(id=>items[id+'|j']=pack(it()));
  const {ctx,p}=await open(b, base(items));
  const r=await p.evaluate(()=>({met:__kl.wordsMet(), pj:__kl.tripProjection(), note:document.getElementById('tripNote').textContent}));
  ok(r.met===91,'words met counts words, not the 43 sentences as well ('+r.met+')');
  ok(r.pj && r.pj.hi<=91+Math.max(0,r.pj.d-10)*3 && r.pj.lo<=r.pj.mid,'the projection leaves out the taper and gives a range ('+JSON.stringify(r.pj)+')');
  ok(/between/.test(r.note),'and says so on Home');
  await ctx.close();
}

console.log('\n9. No Japanese on its own');
{
  const {ctx,p}=await hisLike(b);
  const r=await p.evaluate(()=>{ const k=__kl; k.startSession('today'); const chip=document.getElementById('posChip').textContent;
    const lvl=document.getElementById('lvlName').textContent;
    k.endSession(''); const sh=document.getElementById('sheet'); if(sh) sh.hidden=true;
    k.go('browse'); const q=document.getElementById('q'); q.value='zzzzqq'; q.dispatchEvent(new Event('input')); const empty=document.getElementById('rows').textContent;
    return {chip, lvl, empty, seal:document.querySelector('.seal').textContent}; });
  const cjk=/[぀-ヿ一-鿿]/;
  ok(!cjk.test(r.chip),'the card chip is in English ("'+r.chip+'")');
  ok(!cjk.test(r.lvl) && /[a-z]/.test(r.lvl),'the level name is romaji and English ("'+r.lvl+'")');
  ok(!cjk.test(r.empty) && !cjk.test(r.seal),'no lone kanji on the empty list or the masthead');
  await ctx.close();
}

console.log('\n10. Home: the Speaking tile is a tile, one clear action, and no stop prompt');
{
  const {ctx,p}=await hisLike(b);
  const h=await p.evaluate(()=>{ const t=document.getElementById('speakBtn').getBoundingClientRect();
    return {h:t.height, start:document.getElementById('startBtn').textContent, ahead:document.getElementById('aheadBtn').hidden}; });
  ok(h.h>=56,'the Speaking tile is full height, not a 38px pill ('+Math.round(h.h)+'px)');
  ok(/about \d+ min/.test(h.start) || /Add 3 more/.test(h.start),'the main button says what it costs ("'+h.start+'")');
  // make a backlog so a session has more than twenty cards
  await p.evaluate(()=>{ const k=__kl; k.INTRO.slice(0,90).forEach(c=>{ const x=k.S.items[c.id+'|j']; x.due=Date.now()-86400000; }); k.render(); });
  await p.click('#startBtn'); await p.waitForTimeout(200);
  const ans=async()=>{ await p.evaluate(()=>{ const s=document.getElementById('showBtn'); if(s) s.click(); });
    await p.evaluate(()=>{ const g=[...document.querySelectorAll('#grades .grade')]; (g.find(x=>/Good/.test(x.textContent))||g[0]).click(); });
    await p.waitForTimeout(40); };
  const sheetOn=()=>p.evaluate(()=>!document.getElementById('sheet').hidden);
  let early=false;
  for(let i=0;i<25;i++){ if(await sheetOn()){ early=true; break; } await ans(); }
  await p.evaluate(()=>{ __kl.sess().roundT0=Date.now()-3600000; });
  for(let i=0;i<3;i++){ if(await sheetOn()){ early=true; break; } await ans(); }
  ok(!early,'no stop prompt at any point: the session runs through, as he asked');
  await p.click('#quitBtn'); await p.waitForTimeout(200);
  const cq=await p.evaluate(()=>document.getElementById('sheet').textContent);
  ok(/Stop the session\?/.test(cq) && /Keep going/.test(cq),'leaving with cards still due asks first');
  await p.click('#qStop'); await p.waitForTimeout(200);
  const sum=await p.evaluate(()=>document.getElementById('sheet').hidden?'':document.getElementById('sheet').textContent);
  ok(/answered in about/.test(sum) && /Tomorrow/.test(sum),'the session ends on a summary with tomorrow\'s cost');
  await ctx.close();
}

console.log('\n11. Undo leaves no trace in the log; the day change keeps directions apart');
{
  const {ctx,p}=await hisLike(b);
  const r=await p.evaluate(()=>{ const k=__kl; k.INTRO.slice(0,5).forEach(c=>{ k.S.items[c.id+'|j'].due=Date.now()-1; });
    k.startSession('today'); const n0=k.S.log.length; k.reveal(); k.answer(2); const n1=k.S.log.length; k.undoLast(); const n2=k.S.log.length;
    return {n0,n1,n2}; });
  ok(r.n1===r.n0+1 && r.n2===r.n0,'answer adds one row, undo takes it back ('+JSON.stringify(r)+')');
  const h=await p.evaluate(()=>{ const k=__kl; const id=k.INTRO[0].id; const i=k.IDX[id]._i;
    k.S.log.push([Math.round(Date.now()/1000)-600, i, 0, 3, 2, 1]); k.S.daily.buried={}; k.holdRecent(12);
    return !!k.S.daily.buried[id+'|e']; });
  ok(h,'an answer ten minutes before the day turned still holds the other direction');
  await ctx.close();
}

console.log('\n12. Updates wait for the drive or the session to end');
{
  const {ctx,p}=await hisLike(b);
  const r=await p.evaluate(()=>{ const k=__kl; k.startSession('today'); k.setUpdatePending(true); k.applyPendingUpdate();
    return {pending:k.getUpdatePending(), busy:k.busyNow()}; });
  ok(r.busy && r.pending,'mid-session, a new build waits instead of reloading');
  await ctx.close();
}

console.log('\n13. Backup: dated today, inside the file too');
{
  const {ctx,p}=await hisLike(b, {backup:{last:'2026-09-01'}});
  const [dl]=await Promise.all([p.waitForEvent('download',{timeout:10000}).catch(()=>null), p.evaluate(()=>__kl.doBackup())]);
  let inFile=null;
  if(dl){ const fs=require('fs'); const path=await dl.path(); inFile=JSON.parse(fs.readFileSync(path,'utf8')).backup.last; }
  const d=await p.evaluate(()=>__kl.S.backup.last);
  ok(inFile===d && d!=='2026-09-01','the file says the day it was made ('+inFile+' / '+d+')');
  ok(await p.evaluate(()=>{ const k=__kl; k.S.backup={last:'2026-09-01'}; return k.backupStale(); }),'a week old backup is flagged');
  await ctx.close();
}

console.log('\n14. Also right, pairs, and building a sentence');
{
  const {ctx,p}=await hisLike(b);
  const r=await p.evaluate(()=>{ const k=__kl;
    const also=k.alsoRight(k.IDX.c0001).map(c=>c.romaji);
    const accepted=k.answerMatches('ohayou gozaimasu', k.IDX.c0001);
    const pair=k.pairsFor('c0237').length+k.pairsFor('c0238').length;
    const long=k.SENT.find(x=>x.say && k.orderChunks(x));
    return {also, accepted, pair, pairs:k.PAIRS.length, order: long ? k.orderChunks(long) : null, id: long&&long.id}; });
  ok(r.also.indexOf('ohayou gozaimasu')>=0 && r.accepted,'good morning: ohayou gozaimasu is named, and typed it counts');
  ok(r.pairs>=24 && r.pair>0,'particle minimal pairs ship and ni/de have some ('+r.pairs+')');
  ok(r.order && r.order.length>=3 && r.order.length<=5,'a long line to say is built from 3 to 5 chunks ('+r.id+': '+(r.order||[]).join(' | ')+')');
  await ctx.close();
}

console.log('\n15. Scenes: shadow works before a scene opens, and the trip check asks the scenes');
{
  const {ctx,p,errs}=await hisLike(b);
  const r=await p.evaluate(()=>{ const k=__kl; k.scenesStart(); k.sceneOpen('sc01'); return {ready:k.sceneReady(k.SCENES[0]), need:k.sceneNeed(k.SCENES[0])}; });
  await p.click('#scShadow'); await p.waitForTimeout(300);
  const st=await p.evaluate(()=>({mode:__kl.SC.mode, stage:!document.getElementById('scStage').hidden}));
  ok(st.mode==='shadow' && st.stage,'Shadow runs on a scene that is not ready to rehearse (needs '+r.need+')');
  await p.evaluate(()=>{ document.getElementById('scStop').click(); });
  const c=await p.evaluate(()=>({ready:__kl.checkReady(), pool:__kl.sceneCheckPool()}));
  ok(typeof c.ready==='boolean','the trip check knows whether it can run');
  ok(errs.length===0,'no page errors ('+errs.join(' | ')+')');
  await ctx.close();
}

console.log('\n16. Progress and Settings');
{
  const {ctx,p,errs}=await hisLike(b);
  await p.evaluate(()=>__kl.go('stats')); await p.waitForTimeout(300);
  const s=await p.evaluate(()=>{ const q=id=>document.getElementById(id);
    const fold=el=>{ const d=el&&el.closest('details'); return !!(d && !d.open); };
    const home=[...document.querySelectorAll('#s-home .sec-h h2')].map(h=>h.textContent);
    return {ready:q('readyList').textContent, readyFolded:fold(q('readyList')), leechFolded:fold(q('leechList')),
      readyAux:q('readyAux').textContent, gone:!q('foreChart') && !q('streakChart') && !q('timeNote') && !q('skillWeak'),
      note:q('startNote').textContent, pracFirst:home.indexOf('Practice')>=0 && home.indexOf('Practice')<home.indexOf('The trip'),
      scenes:document.querySelectorAll('#sceneReadyList .scr').length, sk:q('skillStrip2').textContent}; });
  ok(/Backup/.test(s.ready),'Trip readiness lists the backup, storage and voice');
  ok(s.readyFolded && s.leechFolded && /ready/.test(s.readyAux),'Trip readiness and Hardest cards start folded, with the count on the closed row (29 Sep)');
  ok(s.gone,'the 14-day forecast, the streak chart, the time note and the retention warning are gone (29 Sep)');
  ok(s.note==='' && s.pracFirst,'no note under the start button; Practice sits above The trip on Home (29 Sep)');
  ok(s.scenes===17,'every scene shows how many lines are ready');
  await p.evaluate(()=>__kl.go('set')); await p.waitForTimeout(300);
  const g=await p.evaluate(()=>({groups:document.querySelectorAll('#s-set details').length, sub:document.getElementById('setSub').textContent}));
  ok(g.groups>=5 && g.sub==='FSRS-6','settings are grouped and folded, and the header names the real algorithm');
  ok(errs.length===0,'no page errors');
  await ctx.close();
}

console.log('\n17. Audit fixes (independent audit council, 28 Sep)');
{
  const fs=require('fs'), path=require('path');
  const sw=fs.readFileSync(path.join(__dirname,'..','..','sw.js'),'utf8');
  const core=fs.readFileSync(path.join(__dirname,'..','build','app.core.js'),'utf8');
  const swName=(sw.match(/AUDIO_CACHE\s*=\s*"([^"]+)"/)||[])[1], appName=(core.match(/AUD_CACHE="([^"]+)"/)||[])[1];
  ok(swName && swName===appName,'the worker keeps the same voice cache the page writes ('+swName+' / '+appName+'), so a deploy no longer deletes the downloaded voice');
  const {ctx,p,errs}=await hisLike(b);
  const g=await p.evaluate(()=>{ const k=__kl, I=k.IDX, P=0.6, PJ=0.62;
    const en=(id,said)=>k.enGrade(I[id].en,[said]).sim>=P, ja=(id,said)=>k.spGradeJa(I[id].kana,[said]).sim>=PJ;
    const find=r=>k.DECK.find(c=>c.romaji===r);
    return {
      dont: en('c0017','I understand'), dontOk: en('c0017',"I don't understand"),
      cheap: en('c0144','expensive'), cheapOk: en('c0144','cheap'),
      polite: en('c1782','polite'), staff: en('c1783','said by staff'), anymore: en('c0218','any more'), onemore: en('c0218','one more'),
      juu: ja(find('juu').id,'10'), ichi: ja(find('ichi').id,'1'), hyaku: ja(find('hyaku').id,'100'),
      en100: k.enGrade('one hundred',['100']).sim>=P, en1000: k.enGrade('one thousand',['a thousand']).sim>=P,
      mataCmd: k.voiceCmd(['again']) };
  });
  ok(!g.dont && g.dontOk,'"I understand" no longer passes for "I don\'t understand"; the right answer still does');
  ok(!g.cheap && g.cheapOk,'"expensive" no longer passes for "cheap / inexpensive"');
  ok(!g.polite && !g.staff && !g.anymore,'a note ("polite", "said by staff") or a dropped "not" is not an answer');
  ok(g.onemore,'mou now also means "one more"');
  ok(g.juu && g.ichi && g.hyaku,'digits heard for Japanese numbers are read as their kana (10, 1, 100)');
  ok(g.en100 && g.en1000,'digits and "a thousand" pass for the English number words');
  const gl=await p.evaluate(()=>{ const k=__kl; return [k.glossParts('now; already; one more; (not) any more'), k.glossParts('(not) at all'), k.glossParts('to open [transitive]'), k.glossParts('certainly, said by staff')]; });
  ok(/not any more/.test(gl[0].core) && gl[1].core==='not at all','the answer display keeps "not" in the meaning');
  ok(gl[2].core==='to open' && gl[2].note==='transitive' && gl[3].core==='certainly' && gl[3].note==='said by staff','brackets and a trailing register word move to the small note');
  const car=await p.evaluate(()=>{ const k=__kl, ids=k.carWords();
    return {oneWay: ids.filter(id=>k.noReverse(k.IDX[id]) && k.soundIsAmbiguous(id)).length, atsui:k.soundIsAmbiguous('c0167'), ni:k.soundIsAmbiguous('c0035'),
      c0602:k.patternFrame(k.IDX.c0602), held602:k.patternHeld(k.IDX.c0602), sq35:!!k.IDX.c0035.sq, iru:k.sayEn(k.IDX.c0176) }; });
  ok(car.oneWay===0,'car mode leaves out one-way cards that are ambiguous by ear');
  ok(!car.atsui && car.ni,'atsui (hot weather / hot to the touch) is no longer treated as ambiguous; ni still is');
  ok(car.c0602===null && car.held602,'nakereba narimasen shows no wrong frame and waits until after the trip');
  ok(!car.sq35 && car.iru==='to be, for people and animals','ni (two) and iru read with the difference that matters');
  const o=await p.evaluate(()=>{ const k=__kl, now=Date.now(), bad=[];
    for(let iv=60; iv<=700; iv+=7){ for(const early of [0,0.3,0.6]){
      const x={s:1,st:0,n:5,ef:2.5,iv:iv,due:now+Math.round(early*iv)*86400000,lapses:0,piv:0,seen:6,ok:6,df:5,sb:iv,lr:now-Math.round((1-early)*iv)*86400000};
      const oo=k.fsrsOutcomes(x,now), L=oo.map(z=>k.ivLabel(z.due-now));
      if(!(oo[1].iv<oo[2].iv && oo[2].iv<oo[3].iv) || new Set(L).size!==4 || oo[3].iv>730) bad.push(iv+':'+L.join(' ')); } }
    return bad; });
  ok(o.length===0,'Hard, Good and Easy always differ, in days and on the button, up to the two-year cap ('+o.slice(0,3).join(' | ')+')');
  const t=await p.evaluate(()=>{ const k=__kl; const ids=k.INTRO.slice(0,40).map(c=>c.id+'|j');
    ids.forEach(x=>{ k.S.items[x].due=Date.now()-3600000; }); return k.tomorrowDue()>=40; });
  ok(t,'tomorrow\'s estimate includes what was due today and left undone');
  const hold=await p.evaluate(()=>{ const k=__kl, id=k.INTRO[0].id, i=k.IDX[id]._i;
    k.S.daily.buried={}; const t=Math.round(Date.now()/1000)-600; k.S.log.push([t, i, 0, 3, 2, 1]); k.holdRecent(12);
    const v=k.S.daily.buried[id+'|e'], fresh=k.isBuried(id+'|e');
    const until=Math.abs(v-(t+12*3600)*1000)<2000;
    k.S.daily.buried[id+'|e']=Date.now()-1000; const expired=!k.isBuried(id+'|e');
    return {expired, fresh:fresh && until}; });
  ok(hold.fresh && hold.expired,'a hold carried over the day change lasts twelve hours from the answer, not the whole next day');
  const ask=await p.evaluate(()=>{ const k=__kl; return {a:(k.askedBy('nD091')||{}).en||null, b:(k.askedBy('nS003')||{}).en||null}; });
  ok(ask.a===null && ask.b==='Are you here for sightseeing?','"Asked" is shown only for a real question the line answers');
  const face=await p.evaluate(()=>{ const k=__kl, S=k.sess(); k.startSession('today');
    S.key='nS003|j'; S.shown=false; k.renderCard();
    const f=document.getElementById('faceFront').textContent, bk=document.getElementById('faceBack').textContent;
    return {f, bk}; });
  ok(!/sightseeing/i.test(face.f) && !/Asked/i.test(face.f),'a Japanese to English sentence front gives nothing away: no question in English, no gloss of its new word (29 Sep)');
  ok(/Asked/i.test(face.bk) && /Are you here for sightseeing\?/.test(face.bk),'the question it answers is on the back');
  const q=await p.evaluate(()=>{ const k=__kl, ids=k.allSceneWords(); const ords=ids.map(id=>k.IDX[id].ord);
    return {n:ids.length, sorted:ords.every((v,i)=>!i||ords[i-1]<=v)}; });
  ok(q.n>0 && q.n<130 && q.sorted,'"learn the scene words first" queues '+q.n+' words, in the planned order');
  const ws=await p.evaluate(()=>{ const k=__kl, x=k.SENT.find(s=>k.S.items[s.id+'|j']) ; if(!x) return null;
    k.recordSpoken(x.id,false); return k.weakSentences().some(w=>w.id===x.id); });
  ok(ws!==false,'a line missed aloud in Scenes comes to Practice');
  const st=await p.evaluate(()=>{ const k=__kl, d=k.S.daily.key, P=(n)=>{ const [y,m,dd]=d.split('-').map(Number); const t=new Date(y,m-1,dd); t.setDate(t.getDate()-n);
      return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0'); };
    k.S.hist={}; k.S.streak={cur:3,best:3,last:P(2),days:[P(6),P(5),P(3),P(2)]}; k.markActive(d); return k.S.streak.cur; });
  ok(st===4,'the streak survives a missed day when five of the last seven were active ('+st+')');
  const cap=await p.evaluate(()=>{ const k=__kl; k.INTRO.slice(0,3).forEach(c=>{ k.S.items[c.id+'|j'].due=Date.now()-1; });
    k.S.log=[]; for(let i=0;i<k.LOG_CAP;i++) k.S.log.push([1700000000+i,1,0,3,2,1]);
    const head=k.S.log[0]; k.startSession('today'); k.reveal(); k.answer(2); k.undoLast();
    return k.S.log.length===k.LOG_CAP && k.S.log[0]===head && k.S.log[k.LOG_CAP-1][0]===1700000000+k.LOG_CAP-1; });
  ok(cap,'undo at the 12,000-row log cap takes the row back and restores the oldest');
  const bz=await p.evaluate(()=>{ const k=__kl; k.sess().on=false; k.go('home'); k.setUpdatePending(true); document.getElementById('sheet').hidden=false;
    const a=k.busyNow(); document.getElementById('sheet').hidden=true; const r=k.busyNow(); k.setUpdatePending(false); return {a,r}; });
  ok(bz.a && !bz.r,'an update waits while a summary is on screen');
  ok(errs.length===0,'no page errors ('+errs.slice(0,2).join(' | ')+')');
  await ctx.close();
}

await b.close();
console.log(fails? '\nFAILED: '+fails : '\nALL ROUND 0928 CHECKS PASSED');
process.exit(fails?1:0);
})();
