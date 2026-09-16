/* The fifth round: trip-window sentence coverage, the tai form, and the form
   table's named-triple layout. Checked against the running app, not the files. */
const {chromium}=require('playwright');
const fails=[]; const ok=(c,m)=>{ if(c) console.log('  PASS  '+m); else { fails.push(m); console.log('  FAIL  '+m);} };
const today=new Date(Date.now()-14400000).toISOString().slice(0,10);
const base=()=>({rev:9,
  settings:{sched:"fsrs",retention:0.9,newPerDay:12,revCap:150,separate:true,
    sentences:true,conj:true,listen:true,tts:true,autoPlay:false,typing:true,kanji:true,
    theme:"dark",carAudio:false,carChecked:true},
  daily:{key:today,newDone:0,revDone:0,ans:0,ok:0,credit:0,sentDone:0,conjDone:0,consDone:0,
    noNew:false,buried:{},done:{},missed:{}},
  hist:{}, streak:{cur:2,best:2,last:""}, life:{ans:100,ok:90,practice:0},
  backup:{last:""}, notes:{}, susp:{}, pfail:{}, crep:{}, carSeen:{},
  checks:[], log:[], items:{}});
(async()=>{
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const ctx=await b.newContext({viewport:{width:393,height:852}});
await ctx.addInitScript(s=>{
  try{Object.defineProperty(window.speechSynthesis,'getVoices',{value:()=>[{lang:'ja-JP',name:'Kyoko'}]});}catch(e){}
  window.SpeechSynthesisUtterance=function(x){this.text=x;this.rate=1;};
  try{window.speechSynthesis.speak=u=>setTimeout(()=>u.onend&&u.onend(),10);
      window.speechSynthesis.cancel=()=>{};}catch(e){}
  localStorage.setItem('kanaladder.v1',JSON.stringify(s));
},base());
const p=await ctx.newPage(); const errs=[];
p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
await p.goto('http://localhost:8100/index.html'); await p.waitForTimeout(1300);

console.log('1. every trip-window word that can carry a sentence now carries one');
const cov=await p.evaluate(()=>{
  const order=__kl.DECK.slice().sort((a,b)=>{
    const x=(typeof a.ord==='number')?a.ord:a._i, y=(typeof b.ord==='number')?b.ord:b._i; return x-y;});
  const win=order.slice(0,804);
  const carried={}; __kl.SENT.forEach(x=>x.w.forEach(w=>carried[w]=1));
  const missing=win.filter(c=>!carried[c.id]);
  return {win:win.length, missing:missing.length,
          nonExpr:missing.filter(c=>c.pos!=='expr').length,
          sample:missing.slice(0,3).map(c=>c.romaji)};
});
ok(cov.nonExpr===0, 'no content word in the trip window is left without an example sentence ('
   +cov.missing+' left, all of them set phrases)');
ok(cov.missing===17, 'what remains is 17 set phrases that are already complete utterances and need no example ('+cov.missing+')');

console.log('\n2. the tai form');
const tai=await p.evaluate(()=>{
  const names=r=>{const o=[];for(let i=0;i+2<r.length;i+=3)o.push(r[i]);return o;};
  const formOf=(r,n)=>{const i=names(r).indexOf(n);return i<0?null:r[i*3+1];};
  const byRomaji={}; __kl.DECK.forEach(c=>{ if(!byRomaji[c.romaji]) byRomaji[c.romaji]=c.id; });
  const get=rj=>__kl.FORMS[byRomaji[rj]]||null;
  const has=rj=>{const r=get(rj); return r? names(r).indexOf('tai')>=0 : null;};
  const withTai=Object.values(__kl.FORMS).filter(r=>names(r).indexOf('tai')>=0).length;
  return {nomu:formOf(get('nomu'),'tai'), taberu:formOf(get('taberu'),'tai'),
          iku:formOf(get('iku'),'tai'), suru:formOf(get('suru'),'tai'),
          kuru:formOf(get('kuru'),'tai'),
          aru:has('aru'), wakaru:has('wakaru'), tsukareru:has('tsukareru'),
          withTai};
});
ok(tai.nomu==='のみたいです','nomu (to drink) gives nomitai desu, I want to drink ('+tai.nomu+')');
ok(tai.taberu==='たべたいです','taberu (to eat) gives tabetai desu, I want to eat ('+tai.taberu+')');
ok(tai.iku==='いきたいです','iku (to go) gives ikitai desu, I want to go ('+tai.iku+')');
ok(tai.suru==='したいです','suru (to do) gives shitai desu ('+tai.suru+')');
ok(tai.kuru==='きたいです','kuru (to come) gives kitai desu ('+tai.kuru+')');
ok(tai.aru===false,'aru (to exist) has no tai form, because nothing chooses to exist');
ok(tai.wakaru===false,'wakaru (to understand) has no tai form');
ok(tai.tsukareru===false,'tsukareru (to get tired) has no tai form');
ok(tai.withTai>=240,'the tai form reaches the volitional verbs ('+tai.withTai+' rows)');

console.log('\n3. the form table carries its own form names');
const shape=await p.evaluate(()=>{
  const KNOWN={masu:1,mashita:1,masen:1,masendeshita:1,potential:1,te:1,tai:1,past:1,politepast:1,neg:1};
  let bad=0, dup=0, rows=0, unlabelled=0;
  for(const id in __kl.FORMS){
    const r=__kl.FORMS[id]; rows++;
    if(r.length%3!==0){ bad++; continue; }
    const seen={}, kana={};
    for(let i=0;i+2<r.length;i+=3){
      if(!KNOWN[r[i]]) bad++;
      if(seen[r[i]]) dup++; seen[r[i]]=1;
      if(kana[r[i+1]]) dup++; kana[r[i+1]]=1;
    }
    const set=__kl.formSet? __kl.formSet(r) : null;
    if(set && set.some(s=>!s[1])) unlabelled++;
  }
  return {bad,dup,rows,unlabelled};
});
ok(shape.bad===0,'every row is whole triples with a known form name ('+shape.rows+' rows)');
ok(shape.dup===0,'no row repeats a form name or a surface, so no question has two right answers');

console.log('\n4. a conjugation question still builds, with the right label');
const q=await p.evaluate(()=>{
  const out=[];
  for(const id of ['c0115','c0114','c0180']){
    for(let n=0;n<12;n++){
      const qq=__kl.makeQuestion('conj',id);
      if(!qq){ out.push(id+': no question'); break; }
      const right=qq.opts.filter(o=>o.ok);
      if(right.length!==1) out.push(id+': '+right.length+' right answers');
      if(!qq.form) out.push(id+': no form label');
      const t=qq.opts.map(o=>o.text);
      if(new Set(t).size!==t.length) out.push(id+': repeated option');
    }
  }
  return out;
});
ok(q.length===0, q.length? q.join(' ; ') : 'thirty-six conjugation questions, each with one right answer, a label and no repeated option');

console.log('\n5. every cloze gap still lands exactly on its word');
const gaps=await p.evaluate(()=>{
  let n=0, bad=0;
  __kl.SENT.forEach(x=>{
    if(!x.g) return;
    for(const wid in x.g){
      n++;
      const c=__kl.IDX[wid]; const at=x.g[wid];
      if(!c || x.kana.substr(at,c.kana.length)!==c.kana) bad++;
      else if(x.kana.split(c.kana).length-1!==1) bad++;
    }
  });
  return {n,bad};
});
ok(gaps.bad===0,'all '+gaps.n+' cloze gaps sit exactly on the word they hide, and only there');
ok(gaps.n>=5000,'the punctuation fix recovered the gaps that alignment used to refuse ('+gaps.n+')');

console.log('\n6. the sentence queue is ordered by when a sentence becomes readable');
const q2=await p.evaluate(()=>{
  __kl.sentQueueOrder();
  const rank=__kl.SENT_RANK, at=__kl.SENT_AT;
  const ids=__kl.SENT.map(x=>x.id);
  const missing=ids.filter(i=>typeof rank[i]!=='number'||rank[i]>=1e9).length;
  // the appended batches must not all sit at the back of the queue
  const order=ids.slice().sort((a,b)=> rank[a]-rank[b] || at[a]-at[b]);
  const pos={}; order.forEach((i,n)=>pos[i]=n);
  const nw=ids.filter(i=>i[0]==='n').map(i=>pos[i]).sort((a,b)=>a-b);
  const med=nw[Math.floor(nw.length/2)];
  return {missing, total:ids.length, med, first:nw[0]};
});
ok(q2.missing===0,'every sentence has a real readiness rank, none falls back to the sentinel');
ok(q2.med < q2.total*0.75,'the appended batches are spread through the queue rather than stuck behind it (median position '+q2.med+' of '+q2.total+')');

console.log('\n7. the audio library is addressed by content');
const au=await p.evaluate(()=>fetch('audio/v1/manifest.json',{cache:'no-store'}).then(r=>r.json()).catch(()=>null));
ok(au && au.version===2,'the manifest is version 2');
ok(au && au.files && Object.keys(au.sprites).every(k=>!!au.files[k]),'every sprite resolves through the files map');
ok(au && au.sigs && Object.keys(au.sprites).every(k=>!!au.sigs[k]),'every sprite carries a content signature, so a rewritten line cannot reuse its old clip');
ok(au && Object.keys(au.sprites).every(k=>au.sprites[k].clips>0),'no sprite shipped empty');

console.log('\n8. a clip is never asked for under two meanings');
const ho=await p.evaluate(()=>{
  const bad=[];
  const byr={};
  __kl.DECK.forEach(c=>{ if(c.dup) return; (byr[c.romaji]=byr[c.romaji]||[]).push(c.id); });
  for(const r in byr) if(byr[r].length>1) byr[r].forEach(id=>{ if(!__kl.soundIsAmbiguous(id)) bad.push(id+' ('+r+')'); });
  // and a card whose only twin is written the same but said differently keeps its listening card
  const wa=__kl.DECK.filter(c=>c.kana==='は');
  return {bad, waBoth:wa.length, waAmbig:wa.filter(c=>__kl.soundIsAmbiguous(c.id)).length};
});
ok(ho.bad.length===0, ho.bad.length? ho.bad.join(', ') : 'every word that sounds like another is held out of the listening card');
ok(ho.waBoth===2 && ho.waAmbig===0,'wa the topic marker and ha the tooth are written alike but not said alike, and both keep their listening card');

console.log('\n9. every conjugation label names one form only');
const lab=await p.evaluate(()=>{
  const seen={}, dup=[];
  for(const id in __kl.FORMS){
    const r=__kl.FORMS[id], set=__kl.formSet(r), names={};
    set.forEach(t=>{ if(names[t[1]]) dup.push(id+': '+t[1]); names[t[1]]=1; });
  }
  return dup;
});
ok(lab.length===0, lab.length? lab.slice(0,4).join(' ; ') : 'no word carries two forms with the same label, so a question never has two right answers');

console.log('\n10. focus never asks the same word twice in a row');
{
const now=Date.now();
const weak=(lapses,seen,okN,df)=>[1,0,4,1.5,2,now+86400000,lapses,0,seen,okN,df,2,now-86400000];
const st=base(); st.settings.newPerDay=0;
for(let i=0;i<60;i++) st.items['c'+String(i).padStart(4,'0')+'|j']=weak(3,12,6,4.2);
const ctx2=await b.newContext({viewport:{width:393,height:852}});
await ctx2.addInitScript(x=>{
  try{Object.defineProperty(window.speechSynthesis,'getVoices',{value:()=>[{lang:'ja-JP',name:'Kyoko'}]});}catch(e){}
  window.SpeechSynthesisUtterance=function(t){this.text=t;this.rate=1;};
  try{window.speechSynthesis.speak=u=>setTimeout(()=>u.onend&&u.onend(),10);
      window.speechSynthesis.cancel=()=>{};}catch(e){}
  localStorage.setItem('kanaladder.v1',JSON.stringify(x));
}, st);
const p2=await ctx2.newPage();
await p2.goto('http://localhost:8100/index.html'); await p2.waitForTimeout(1300);
const fq=await p2.evaluate(()=>{
  const out=[];
  for(let run=0;run<25;run++){
    const q=__kl.focusQueue();
    let worst=1, streak=1;
    for(let i=1;i<q.length;i++){
      if(q[i].id===q[i-1].id){ streak++; if(streak>worst) worst=streak; }
      else streak=1;
    }
    out.push({len:q.length, worst, words:new Set(q.map(x=>x.id)).size});
  }
  return {runs:out, weak:__kl.weakWords().length};
});
const runs=fq.runs.filter(r=>r.len>3);
const backToBack=runs.filter(r=>r.worst>1).length;
ok(fq.weak>=10,'the weak list is populated ('+fq.weak+' words)');
ok(runs.length>=20,'the focus queue builds every time ('+runs.length+' of 25 runs had more than three questions)');
ok(backToBack===0,'not one run asks the same word twice in a row ('+backToBack+' of '+runs.length+' did)');
ok(runs.every(r=>r.words>=3),'each run spreads across several words (fewest '+Math.min.apply(null,runs.map(r=>r.words))+')');
await ctx2.close();
}

console.log('\n11. a word cannot be trapped in the weak list by a stale average');
{
const now=Date.now(), day=86400000;
const st=base(); st.settings.newPerDay=0;
// six answers on the card's own counters, four of them right, but the two most
// recent logged answers are both Easy: the shape that kept chotto in Focus
st.items['c0019|j']=[1,0,3,2.5,52,now+52*day,0,0,6,4,1,50.5,now-day];
st.log=[[Math.round((now-3*day)/1000),19,0,4,1,1],
        [Math.round((now-day)/1000),19,0,4,1,1]];
const ctx3=await b.newContext({viewport:{width:393,height:852}});
await ctx3.addInitScript(x=>{
  try{Object.defineProperty(window.speechSynthesis,'getVoices',{value:()=>[{lang:'ja-JP',name:'Kyoko'}]});}catch(e){}
  window.SpeechSynthesisUtterance=function(t){this.text=t;this.rate=1;};
  try{window.speechSynthesis.speak=u=>setTimeout(()=>u.onend&&u.onend(),10);
      window.speechSynthesis.cancel=()=>{};}catch(e){}
  localStorage.setItem('kanaladder.v1',JSON.stringify(x));
}, st);
const p3=await ctx3.newPage();
await p3.goto('http://localhost:8100/index.html'); await p3.waitForTimeout(1300);
const w=await p3.evaluate(()=>{
  const weak=__kl.weakWords();
  const bad=[1,0,3,2.5,2,Date.now(),0,0,6,4,1,2,Date.now()];
  return {listed: weak.some(x=>x.id==='c0019'),
          score: (__kl.weakness('c0019')||{}).score || 0,
          total: weak.length};
});
ok(w.listed===false,'a word whose last two answers were both Easy is no longer called weak on its lifetime average');
ok(w.score===0,'and it scores zero rather than one ('+w.score+')');
await ctx3.close();
}

console.log('\n12. a freshly taught word that is going badly reaches Focus');
{
const now=Date.now(), day=86400000;
const st=base(); st.settings.newPerDay=0;
const mk=(id,iv,seen,okN,df)=>{ st.items[id+'|j']=[1,0,3,2.5,iv,now+iv*day,seen-okN,0,seen,okN,df,iv,now-day]; };
// a new number the scheduler still wants back tomorrow, answered wrong twice,
// but whose last three answers happened to be right: the shape that used to
// clear itself out of Focus entirely
mk('c0037',1,8,5,9.6);
mk('c0040',2,5,4,6.4);
// and one that is genuinely settled: long interval, never missed
mk('c0100',40,6,6,3.0);
st.log=[];
let t=Math.round((now-4*day)/1000);
for(const g of [1,2,1,1,4,2,4]){ st.log.push([t,37,0,g,1,1]); t+=Math.round(day/1000); }
const ctx4=await b.newContext({viewport:{width:393,height:852}});
await ctx4.addInitScript(x=>{
  try{Object.defineProperty(window.speechSynthesis,'getVoices',{value:()=>[{lang:'ja-JP',name:'Kyoko'}]});}catch(e){}
  window.SpeechSynthesisUtterance=function(t){this.text=t;this.rate=1;};
  try{window.speechSynthesis.speak=u=>setTimeout(()=>u.onend&&u.onend(),10);
      window.speechSynthesis.cancel=()=>{};}catch(e){}
  localStorage.setItem('kanaladder.v1',JSON.stringify(x));
}, st);
const p4=await ctx4.newPage();
await p4.goto('http://localhost:8100/index.html'); await p4.waitForTimeout(1300);
const f=await p4.evaluate(()=>{
  const weak=__kl.weakWords().map(x=>x.id);
  const w37=__kl.weakness('c0037'), w100=__kl.weakness('c0100');
  return {fresh: weak.indexOf('c0037')>=0, settled: weak.indexOf('c0100')>=0,
          why: w37? w37.why : null, settledScore: w100? w100.score : 0};
});
ok(f.fresh===true,'a word on a one day interval with lapses is in the weak list even after three right answers ("'+f.why+'")');
ok(f.settled===false,'a word on a long interval that has never been missed is left alone');
await ctx4.close();
}

console.log('\n13. a cloze is only ever built from a sentence he can read');
{
const now=Date.now(), day=86400000;
const st=base(); st.settings.newPerDay=0;
// he knows exactly one word of the sentence: the one being asked
st.items['c0250|j']=[1,0,3,2.5,1,now+day,3,0,7,2,9.9,1,now-day];
const ctx5=await b.newContext({viewport:{width:393,height:852}});
await ctx5.addInitScript(x=>{
  try{Object.defineProperty(window.speechSynthesis,'getVoices',{value:()=>[{lang:'ja-JP',name:'Kyoko'}]});}catch(e){}
  window.SpeechSynthesisUtterance=function(t){this.text=t;this.rate=1;};
  try{window.speechSynthesis.speak=u=>setTimeout(()=>u.onend&&u.onend(),10);
      window.speechSynthesis.cancel=()=>{};}catch(e){}
  localStorage.setItem('kanaladder.v1',JSON.stringify(x));
}, st);
const p5=await ctx5.newPage();
await p5.goto('http://localhost:8100/index.html'); await p5.waitForTimeout(1300);
const cz=await p5.evaluate(()=>{
  const q=__kl.makeQuestion('cloze','c0250');
  // and across every word in the deck, no cloze may carry an unknown word
  let built=0, unreadable=0;
  for(const c of __kl.DECK){
    const s=__kl.sentenceWith(c.id);
    if(!s) continue;
    built++;
    const others=__kl.sentMissing(s).filter(x=>x!==c.id);
    if(others.length) unreadable++;
  }
  return {offered: !!q, built, unreadable};
});
ok(cz.offered===false,'no cloze is offered for a word whose only sentences are full of words he has not met');
ok(cz.unreadable===0,'not one example sentence anywhere carries a second unknown word ('+cz.built+' checked)');
await ctx5.close();
}

console.log('\n14. the Japanese plays with the question, not after the answer');
{
const now=Date.now(), day=86400000;
const st=base(); st.settings.newPerDay=0; st.settings.autoPlay=true; st.settings.tts=true;
for(let i=0;i<40;i++) st.items['c'+String(i).padStart(4,'0')+'|j']=
  [1,0,4,1.5,2,now+day,3,0,12,6,4.2,2,now-day];
const ctx6=await b.newContext({viewport:{width:393,height:852}});
await ctx6.addInitScript(x=>{
  window.__spoke=[];
  try{Object.defineProperty(window.speechSynthesis,'getVoices',{value:()=>[{lang:'ja-JP',name:'Kyoko'}]});}catch(e){}
  window.SpeechSynthesisUtterance=function(t){this.text=t;this.rate=1;};
  try{window.speechSynthesis.speak=u=>{window.__spoke.push(u.text);setTimeout(()=>u.onend&&u.onend(),5);};
      window.speechSynthesis.cancel=()=>{};}catch(e){}
  localStorage.setItem('kanaladder.v1',JSON.stringify(x));
}, st);
const p6=await ctx6.newPage();
await p6.goto('http://localhost:8100/index.html'); await p6.waitForTimeout(1300);
const sp=await p6.evaluate(()=>{
  const out={};
  // flip questions are drawn by the ordinary card renderer, not this one
  const kinds=[['mcJE',true],['mcEJ',false],['type',false],['cloze',false]];
  for(const [kind,want] of kinds){
    let tried=0, spokeAtQuestion=null;
    for(const c of __kl.DECK){
      const q=__kl.makeQuestion(kind,c.id);
      if(!q) continue;
      /* Both channels. speakCard plays the pre-rendered clip when the library
         is there and only falls back to the device voice when it is not, so a
         test that watches speechSynthesis alone watches a path his phone does
         not take. __heard counts either. */
      window.__spoke=[]; __kl.AUD.log.length=0;
      __kl.sess().q=q; __kl.sess().answered=false; __kl.sess().queue=[q]; __kl.sess().qi=0;
      __kl.renderFocusCard();
      spokeAtQuestion = (window.__spoke.length + __kl.AUD.log.length) > 0;
      tried++; break;
    }
    out[kind]={tried, spoke:spokeAtQuestion, want};
  }
  return out;
});
const good=Object.keys(sp).filter(k=>sp[k].tried && sp[k].spoke===sp[k].want);
const bad=Object.keys(sp).filter(k=>sp[k].tried && sp[k].spoke!==sp[k].want);
ok(bad.length===0, bad.length? bad.map(k=>k+' spoke='+sp[k].spoke+' want='+sp[k].want).join(', ')
   : 'the Japanese is spoken up front on '+good.filter(k=>sp[k].want).join(' and ')
     +', and stays silent on '+good.filter(k=>!sp[k].want).join(', '));
await ctx6.close();
}

console.log('\n15. a word in the car waits out its gap before coming back');
{
const g=await p.evaluate(()=>{
  // the drive loop only plays an item once it is due; before this the gap was
  // written and then ignored
  const it={id:'c0000', reps:0, due:0};
  __kl.CAR.started=Date.now(); __kl.CAR.pool=[it]; __kl.CAR.backlog=[];
  __kl.CAR.played=[]; __kl.CAR.touched=[];
  __kl.carAdvance(it);
  const afterFirst=it.due-(Date.now()-__kl.CAR.started);
  __kl.carAdvance(it);
  const afterSecond=it.due-(Date.now()-__kl.CAR.started);
  return {afterFirst, afterSecond, reps:it.reps};
});
ok(g.afterFirst>30000,'the second pass is held back by the first gap ('+Math.round(g.afterFirst/1000)+'s)');
ok(g.afterSecond>120000,'and the third by the longer one ('+Math.round(g.afterSecond/1000)+'s)');
}

console.log('\n16. a miss only holds the screen when there is something to read');
{
const fs2=require('fs');
const ctx7=await b.newContext({viewport:{width:393,height:852}});
const p7=await ctx7.newPage();
await p7.addInitScript(r=>{try{localStorage.setItem('kanaladder.v1',r);}catch(e){}},
  fs2.readFileSync('/tmp/bk.json','utf8'));
await p7.goto('http://127.0.0.1:8100/index.html',{timeout:20000});
await p7.waitForFunction(()=>window.__kl&&window.__kl.DECK.length>0,null,{timeout:20000});
await p7.waitForTimeout(900);
const m=await p7.evaluate(()=>{
  const k=window.__kl; let withNeighbour=0, without=0, threw=0;
  for(const key of Object.keys(k.S.items)){
    const c=k.cardOf(key); if(!c||k.isSent(c)||k.isConj(c)) continue;
    try{ k.missHtml(key) ? withNeighbour++ : without++; }catch(e){ threw++; }
  }
  return {withNeighbour, without, threw};
});
ok(m.threw===0,'missHtml never throws on his real deck ('+(m.withNeighbour+m.without)+' word cards)');
ok(m.without>m.withNeighbour,
   'most words have no confusable twin, so the hold must be conditional ('
   +m.without+' without, '+m.withNeighbour+' with)');
// the button itself: miss a word with no twin and the grade row must not be replaced
const pick=await p7.evaluate(()=>{
  const k=window.__kl;
  for(const key of Object.keys(k.S.items)){
    if(key.slice(-2)!=='|j') continue;
    const c=k.cardOf(key); if(!c||k.isSent(c)||k.isConj(c)) continue;
    if(k.missHtml(key)) continue;
    for(const o in k.S.items) k.S.items[o].due=Date.now()+9e8;
    k.S.items[key].due=Date.now()-1000;
    return {key, romaji:c.romaji};
  }
  return null;
});
await p7.click('#startBtn').catch(()=>{}); await p7.waitForTimeout(600);
await p7.click('#showBtn').catch(()=>{}); await p7.waitForTimeout(250);
await p7.click('.grade.g0').catch(()=>{}); await p7.waitForTimeout(400);
const held=await p7.evaluate(()=>({next:!!document.getElementById('missNext'),
                                   box:!!document.querySelector('.missbox')}));
ok(pick && held.next===false && held.box===false,
   pick ? 'missing "'+pick.romaji+'" moves straight on, no empty Next card button'
        : 'could not reach a word without a twin');
await ctx7.close();
}

console.log('\n17. the pre-rendered library still works, because car mode needs it');
{
/* The reason yon shipped swallowed and the autoplay bug went unseen: every
   audio assertion in the suite hooked speechSynthesis, which is the fallback.
   audPlay could not even reach a sprite until something else had fetched the
   manifest, and only the settings screen and car mode ever did, so a phone
   that opened the app and studied used the device voice all session and the
   downloaded library sat unused. These assert the real path. */
const ctx8=await b.newContext({viewport:{width:393,height:852}});
const p8=await ctx8.newPage();
await p8.addInitScript(()=>{ window.__spoke=[];
  try{ window.speechSynthesis.speak=u=>{ window.__spoke.push(u.text); setTimeout(()=>u.onend&&u.onend(),5); };
       window.speechSynthesis.cancel=()=>{}; }catch(e){}
});
await p8.goto('http://localhost:8100/index.html');
await p8.waitForFunction(()=>window.__kl&&__kl.DECK.length>0,null,{timeout:20000});
await p8.waitForTimeout(1500);
const warm=await p8.evaluate(()=>({man:!!__kl.AUD.man}));
ok(warm.man===true,'the manifest is fetched at boot, without opening settings or car mode');
const played=await p8.evaluate(async()=>{
  __kl.AUD.log.length=0; window.__spoke=[];
  const ok1=await __kl.audPlay('wj:c0000',1);
  return {ok:ok1, log:__kl.AUD.log.slice(), fellBack:window.__spoke.length};
});
ok(played.ok===true && played.log.length===1 && played.log[0].k==='wj:c0000',
   'a word plays from the sprite on a fresh load ('+JSON.stringify(played.log.map(x=>x.k))+')');
ok(played.fellBack===0,'and the device voice is not used as a fallback');
const noMan=await p8.evaluate(async()=>{
  const m=__kl.AUD.man; __kl.AUD.man=null; __kl.AUD.tried=true;
  const r=await __kl.audPlay('wj:c0000',1);
  __kl.AUD.man=m; __kl.AUD.tried=false; return r;
});
ok(noMan===false,'and with no manifest it reports failure so the caller can fall back');
await ctx8.close();
}

console.log('\n17a. a card is read by the phone\u2019s own voice, not the downloaded one');
{
/* The downloaded library exists because iOS will not send Web Speech to
   CarPlay. That is a car mode problem. Routing study cards through it too made
   every card play a small model that mispronounces a word said on its own: yon
   arrived as "yeiiin" while the phone's own Kyoko had been saying it correctly
   all along. The rule is now explicit and asserted: a phone with a Japanese
   voice hears that voice on a card, a phone without one falls back to the
   library, and car mode is untouched either way. */
const ctxA=await b.newContext({viewport:{width:393,height:852}});
const pA=await ctxA.newPage();
await pA.addInitScript(()=>{ window.__spoke=[];
  try{Object.defineProperty(window.speechSynthesis,'getVoices',{value:()=>[{lang:'ja-JP',name:'Kyoko'}]});}catch(e){}
  window.SpeechSynthesisUtterance=function(t){this.text=t;this.rate=1;};
  try{ window.speechSynthesis.speak=u=>{ window.__spoke.push(u.text); setTimeout(()=>u.onend&&u.onend(),5); };
       window.speechSynthesis.cancel=()=>{}; }catch(e){}
});
await pA.goto('http://localhost:8100/index.html');
await pA.waitForFunction(()=>window.__kl&&__kl.DECK.length>0,null,{timeout:20000});
await pA.waitForTimeout(1500);
const withVoice=await pA.evaluate(async()=>{
  const k=window.__kl; k.AUD.log.length=0; window.__spoke=[];
  k.speakCard(k.IDX['c0037']);
  await new Promise(r=>setTimeout(r,500));
  return {ja:k.ttsReady(), spoke:window.__spoke.slice(), clips:k.AUD.log.map(x=>x.k)};
});
ok(withVoice.ja===true,'the device reports a Japanese voice');
ok(withVoice.spoke.length===1 && withVoice.spoke[0]==='\u3088\u3093',
   'the card is read by that voice ('+JSON.stringify(withVoice.spoke)+')');
ok(withVoice.clips.length===0,
   'and the downloaded library is not touched on a card ('+JSON.stringify(withVoice.clips)+')');
/* His phone lists no Japanese voice and speaks correct Japanese anyway, so an
   empty voice list is no longer a reason to go to the library: the card path
   asks whether Japanese can be spoken, not whether a voice is named. Only a
   phone with no speech engine at all falls back. */
const unlisted=await pA.evaluate(async()=>{
  const k=window.__kl; k.TTS.ja=null; k.TTS.seen=true;
  k.AUD.log.length=0; window.__spoke=[];
  k.speakCard(k.IDX['c0037']);
  await new Promise(r=>setTimeout(r,900));
  return {clips:k.AUD.log.map(x=>x.k), spoke:window.__spoke.slice()};
});
ok(unlisted.spoke.indexOf('\u3088\u3093')>=0,
   'a phone that lists no Japanese voice is still read by the device ('+JSON.stringify(unlisted.spoke)+')');
ok(unlisted.clips.length===0,
   'and is not sent to the library ('+JSON.stringify(unlisted.clips)+')');
const noEngine=await pA.evaluate(async()=>{
  const k=window.__kl; k.TTS.ja=null; k.TTS.seen=false;
  k.AUD.log.length=0; window.__spoke=[];
  k.speakCard(k.IDX['c0037']);
  await new Promise(r=>setTimeout(r,900));
  const r={clips:k.AUD.log.map(x=>x.k), spoke:window.__spoke.slice()};
  k.TTS.seen=true; return r;
});
ok(noEngine.clips.indexOf('wj:c0037')>=0,
   'a phone with no speech engine still gets the word, from the library ('+JSON.stringify(noEngine.clips)+')');
await ctxA.close();
}

console.log('\n17b. a card that has moved on does not speak over the next one');
{
/* Found while looking for more of the same defect as the car one: an async
   operation holding a reference to something that has since changed. speakCard
   fetches a sprite, which takes time, and nothing cancelled the old request.
   Answer the card while its clip is still loading and the previous word
   arrives over the new one; on an English to Japanese card that is the answer
   read out. It could not happen while study mode never reached a clip at all,
   and became live the moment that was fixed. */
const ctx9=await b.newContext({viewport:{width:393,height:852}});
const p9=await ctx9.newPage();
/* The supersession this guards against lives on the library path. A phone with
   no listed Japanese voice no longer reaches it, because an unlisted voice
   still speaks, so the path is reached the way a person reaches it: by turning
   on "use the downloaded voice on cards too" in Settings. */
await p9.addInitScript(()=>{ window.__spoke=[];
  try{Object.defineProperty(window.speechSynthesis,'getVoices',{value:()=>[{lang:'en-US',name:'Samantha'}]});}catch(e){}
  window.SpeechSynthesisUtterance=function(t){this.text=t;this.rate=1;};
  try{ window.speechSynthesis.speak=u=>{ window.__spoke.push(u.text); setTimeout(()=>u.onend&&u.onend(),5); };
       window.speechSynthesis.cancel=()=>{}; }catch(e){}
});
await p9.goto('http://localhost:8100/index.html');
await p9.waitForFunction(()=>window.__kl&&__kl.DECK.length>0,null,{timeout:20000});
await p9.waitForTimeout(1500);
const r=await p9.evaluate(async()=>{
  const k=window.__kl;
  k.S.settings.cardAudio=true;          // the switch that forces the library
  k.AUD.loaded={}; k.AUD.want={}; k.AUD.log.length=0; window.__spoke=[];
  const A=k.IDX['c0000'], B=k.IDX['c0500'];
  /* Superseded in the same tick, so there is no race to argue about: A has not
     had a chance to start and must never be heard. A 30 ms gap would let a warm
     sprite begin legitimately, and a sound already started cannot be unheard. */
  k.speakCard(A);
  k.speakCard(B);
  await new Promise(r=>setTimeout(r,5000));
  return {played:k.AUD.log.map(x=>x.k), spoke:window.__spoke.slice(),
          a:k.clipFor(A), bKey:k.clipFor(B), aKana:A.kana, aRom:A.romaji, bRom:B.romaji};
});
ok(r.played.indexOf(r.bKey)>=0,
   'the word actually on screen ('+r.bRom+') plays ('+JSON.stringify(r.played)+')');
ok(r.played.indexOf(r.a)<0,
   'the superseded word ('+r.aRom+') is never played');
ok(r.spoke.indexOf(r.aKana)<0,
   'and it is not read by the device voice as a fallback either');
await ctx9.close();
}

console.log('\n18. no page errors');
ok(errs.length===0, errs.length? errs.join(' ; ') : 'the app ran clean');

await ctx.close(); await b.close();
console.log(fails.length? '\nFAILED: '+fails.length : '\nall checks passed');
process.exit(fails.length?1:0);
})();
