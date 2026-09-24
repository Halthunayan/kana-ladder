/* Scenes: a short real exchange he rehearses out loud, graded by what the
   phone heard. Checked against the running app with a scripted recogniser,
   because a real microphone is not available here and the flow has to be
   right whether or not the phone will listen. */
const {chromium}=require('playwright');
const fails=[]; const ok=(c,m)=>{ if(c) console.log('  PASS  '+m); else { fails.push(m); console.log('  FAIL  '+m);} };
const today=new Date(Date.now()-14400000).toISOString().slice(0,10);
const known=(ids)=>{ const it={}; const now=Date.now();
  for(const id of ids) it[id+'|j']=[1,0,4,2.5,20,now+86400000*10,0,0,6,6,0.3,8,0]; return it; };
const base=(items)=>({rev:9,
  settings:{sched:"fsrs",retention:0.9,newPerDay:12,revCap:150,separate:true,sentences:true,conj:true,listen:true,
    tts:true,autoPlay:false,typing:true,kanji:true,theme:"dark",carAudio:true,carChecked:true,cardAudio:true},
  daily:{key:today,newDone:0,revDone:0,ans:0,ok:0,credit:0,sentDone:0,conjDone:0,consDone:0,noNew:false,buried:{},done:{},missed:{}},
  hist:{}, streak:{cur:2,best:2,last:""}, life:{ans:100,ok:90,practice:0}, backup:{last:""}, notes:{}, susp:{}, pfail:{}, crep:{}, carSeen:{},
  checks:[], log:[], items:items||{}});

/* a recogniser whose answers the test delivers on demand, via __recSay,
   rather than off a blind timer - the same way a real person only speaks
   once the prompt is actually on screen, never on a schedule racing the
   app's own pacing. undefined = nothing heard, null = permission denied.
   A one-shot session ends itself either way; a continuous one (the
   rehearse mic, which stays open for the whole scene) keeps listening for
   the next call instead, exactly like the real API. */
const fakeRec=()=>{
  window.__recStarts=0; window.__recActive=null;
  window.SpeechRecognition=window.webkitSpeechRecognition=function(){
    const R=this; R.lang=""; R.continuous=false;
    R.start=function(){ window.__recStarts++; window.__recActive=R; };
    R.stop=function(){ if(window.__recActive===R) window.__recActive=null; };
    R.abort=function(){ if(window.__recActive===R) window.__recActive=null; R.onend&&R.onend(); };
  };
  window.__spoke=[];
  window.SpeechSynthesisUtterance=function(t){this.text=t;this.rate=1;};
  try{ speechSynthesis.speak=u=>{ window.__spoke.push(u.text); setTimeout(()=>{u.onstart&&u.onstart(); u.onend&&u.onend();},5); }; speechSynthesis.cancel=()=>{}; }catch(e){}
  window.__recSay=function(next){
    const R=window.__recActive; if(!R) return false;
    if(next===undefined){ R.onerror&&R.onerror({error:'no-speech'}); if(!R.continuous) window.__recActive=null; R.onend&&R.onend(); return true; }
    if(next===null){ R.onerror&&R.onerror({error:'not-allowed'}); window.__recActive=null; R.onend&&R.onend(); return true; }
    const alts=(Array.isArray(next)?next:[next]).map(t=>({transcript:t,confidence:0.9}));
    R.onresult&&R.onresult({results:[alts]});
    if(!R.continuous){ window.__recActive=null; R.onend&&R.onend(); }
    return true;
  };
};

(async()=>{
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

/* ---------- 1. the data and the readiness rule ---------- */
console.log('1. every scene is whole, and a scene opens only when its lines do');
{
  const ctx=await b.newContext({viewport:{width:393,height:852}});
  await ctx.addInitScript(s=>{ localStorage.setItem('kanaladder.v1',JSON.stringify(s)); }, base({}));
  await ctx.addInitScript(fakeRec);
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8100/index.html');
  await p.waitForFunction(()=>window.__kl&&__kl.DECK.length>0,null,{timeout:20000});
  const d=await p.evaluate(()=>{ const k=window.__kl;
    return {n:k.SCENES.length, lines:k.SCENES.reduce((a,s)=>a+s.lines.length,0),
      whole:k.SCENES.every(s=>s.lines.every(l=>!!k.SIDX[l.sid])),
      you:k.SCENES.every(s=>s.lines.some(l=>l.who==='you')),
      readyFresh:k.SCENES.filter(s=>k.sceneReady(s)).length,
      gaps0:k.sceneGaps(k.SCENES[0]).length,
      btn:!!document.getElementById('scenesBtn'), sub:document.getElementById('scenesBtnSub').textContent};
  });
  ok(d.n===12,'twelve scenes shipped ('+d.n+')');
  ok(d.lines>=100,'about a hundred lines between them ('+d.lines+')');
  ok(d.whole,'every line is a sentence the deck has');
  ok(d.you,'every scene has lines for him to say');
  ok(d.readyFresh===0,'a fresh state has no scene open ('+d.readyFresh+')');
  ok(d.gaps0>0,'and the first scene names the words it needs ('+d.gaps0+')');
  ok(d.btn,'the Scenes button is on the home screen');
  ok(/learn a few words first/.test(d.sub),'and says nothing is ready yet ('+d.sub+')');
  ok(errs.length===0,'no page errors ('+errs.join('; ')+')');
  await ctx.close();
}

/* ---------- 2. grading ---------- */
console.log('\n2. what the phone heard is graded by sound, not spelling');
{
  const ctx=await b.newContext({viewport:{width:393,height:852}});
  await ctx.addInitScript(s=>{ localStorage.setItem('kanaladder.v1',JSON.stringify(s)); }, base({}));
  await ctx.addInitScript(fakeRec);
  const p=await ctx.newPage();
  await p.goto('http://localhost:8100/index.html');
  await p.waitForFunction(()=>window.__kl&&__kl.DECK.length>0,null,{timeout:20000});
  const g=await p.evaluate(()=>{ const k=window.__kl;
    return {
      kj:k.kanjiToKana('これをお願いします'), kk:k.kanaKey('クレジットカードは使えますか。'),
      ro:k.kanaToRomaji('おねがいします'), ro2:k.kanaToRomaji('きっぷ'), ro3:k.kanaToRomaji('コーヒー'), ro4:k.kanaToRomaji('しんぶん'),
      exact:k.sceneGrade('これをおねがいします。',['これをお願いします']).verdict,
      kana:k.sceneGrade('これをおねがいします。',['これをおねがいします']).verdict,
      near:k.sceneGrade('げんきんでおねがいします。',['げんきんでおねがいしま']).verdict,
      wrong:k.sceneGrade('げんきんでおねがいします。',['えいごのメニューはありますか']).verdict,
      alts:k.sceneGrade('ふたりです。',['ふたつです','ふたりです']).verdict,
      empty:k.sceneGrade('ふたりです。',[]).verdict,
      conj:k.kanjiToKana('使えますか'),
      heard:k.sceneGrade('とおいですか。',['遠いですか']).heardRomaji };
  });
  ok(g.kj==='これをおねがいします','kanji in a transcript becomes kana ('+g.kj+')');
  ok(g.kk==='くれじっとかーどはつかえますか','katakana, kanji and punctuation fold to one key ('+g.kk+')');
  ok(g.conj==='つかえますか','a conjugated verb converts through its stem ('+g.conj+')');
  ok(g.ro==='onegaishimasu','romaji for him to read ('+g.ro+')');
  ok(g.ro2==='kippu' && g.ro3==='koohii' && g.ro4==='shinbun','small tsu, long vowels and n ('+[g.ro2,g.ro3,g.ro4].join(', ')+')');
  ok(g.exact==='good','the right line in kanji passes');
  ok(g.kana==='good','the right line in kana passes');
  ok(g.near==='good' || g.near==='close','a clipped ending is close or good ('+g.near+')');
  ok(g.wrong==='missed','a different sentence is missed');
  ok(g.alts==='good','the best of several alternatives is used');
  ok(g.empty==='missed','nothing heard is not a pass');
  ok(g.heard==='tooi desu ka.','a line the phone got right is shown as its own romaji ('+g.heard+')');
  await ctx.close();
}

/* ---------- 3. a rehearsal runs on its own ---------- */
console.log('\n3. rehearse: their lines play, his lines are heard, nothing needs a tap');
{
  const ctx=await b.newContext({viewport:{width:393,height:852}});
  await ctx.addInitScript(s=>{ localStorage.setItem('kanaladder.v1',JSON.stringify(s)); }, base({}));
  await ctx.addInitScript(fakeRec);
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8100/index.html');
  await p.waitForFunction(()=>window.__kl&&__kl.DECK.length>0,null,{timeout:20000});
  // make every word of the directions scene known, then script the answers
  const prep=await p.evaluate(()=>{ const k=window.__kl; const sc=k.SCENES.find(s=>s.id==='sc08');
    const words=new Set(); sc.lines.forEach(l=>k.SIDX[l.sid].w.forEach(w=>words.add(w)));
    const now=Date.now();
    words.forEach(w=>{ k.S.items[w+'|j']={s:1,st:0,n:4,ef:2.5,iv:20,due:now+864000000,lapses:0,piv:0,seen:6,ok:6,df:0.3,sb:8,lr:0}; });
    const you=sc.lines.map((l,i)=>({i,kana:k.SIDX[l.sid].kana})).filter((x,j)=>sc.lines[x.i].who==='you');
    window.__youLineIdx=you.map(x=>x.i);
    // right first try; wrong three times running (uses up all three tries,
    // so the line reveals and holds rather than advancing); right first try
    window.__youAnswers=[[you[0].kana],
      ['えいごのメニューはありますか','えいごのメニューはありますか','えいごのメニューはありますか'],
      [you[2].kana]];
    return {ready:k.sceneReady(sc), you:you.length};
  });
  ok(prep.ready,'the scene is open once its words are known');
  await p.click('#scenesBtn'); await p.waitForTimeout(300);
  const list=await p.evaluate(()=>({on:document.getElementById('s-scenes').classList.contains('on'),
    items:document.querySelectorAll('#scList .scitem').length, ready:document.querySelectorAll('#scList .scitem:not(.shut)').length}));
  ok(list.on && list.items===12,'the scene list shows on its own screen');
  ok(list.ready===1,'and exactly one scene is marked ready ('+list.ready+')');
  await p.click('#scList .scitem:not(.shut)'); await p.waitForTimeout(200);
  const brief=await p.evaluate(()=>({title:document.getElementById('scTitle').textContent,
    lines:document.querySelectorAll('#scLines .scl').length, reh:document.getElementById('scRehearse').disabled,
    gap:document.getElementById('scGapHead').textContent}));
  ok(brief.title==='Asking directions','the brief opens the chosen scene ('+brief.title+')');
  ok(brief.lines===7,'and lists all of its lines ('+brief.lines+')');
  ok(brief.reh===false,'Rehearse is enabled');
  await p.click('#scRehearse');
  // one attempt at a time: wait until the rehearse is actually prompting
  // for that exact line before "saying" the next attempt, rather than
  // firing everything on a timer and hoping the pacing lines up. A line
  // with more than one scripted answer is a line that is meant to be
  // gotten wrong until its tries run out - each retry returns to the same
  // "prompt" state on the same line, which is what the wait below catches.
  const idxs=await p.evaluate(()=>window.__youLineIdx), answers=await p.evaluate(()=>window.__youAnswers);
  for(let k=0;k<idxs.length;k++){
    for(const text of answers[k]){
      await p.waitForFunction((i)=>{ const kl=window.__kl;
        return !!kl && kl.SC.line===i && /prompt/.test(document.getElementById('scState').className);
      }, idxs[k], {timeout:20000});
      await p.evaluate((t)=>window.__recSay(t), text);
    }
  }
  await p.waitForFunction(()=>!document.getElementById('scDone').hidden,null,{timeout:30000});
  const r=await p.evaluate(()=>{ const k=window.__kl;
    return {starts:window.__recStarts, results:k.SC.results.map(x=>x.verdict), head:document.getElementById('scDoneHead').textContent,
      saved:k.S.scenes&&k.S.scenes.sc08, plays:k.AUD.log.filter(x=>/^sj:/.test(x.k)).length,
      list:document.getElementById('scDoneList').textContent,
      rowCls:Array.prototype.map.call(document.querySelectorAll('#scDoneList .scres'),el=>el.className)}; });
  ok(r.starts===1,'the phone opened the mic once for the whole rehearsal, not once per line ('+r.starts+')');
  ok(JSON.stringify(r.results)==='["good","missed","good"]','graded right, wrong (out of tries), right ('+JSON.stringify(r.results)+')');
  ok(/^67%$/.test(r.head),'the score is shown ('+r.head+')');
  ok(r.saved && Math.abs(r.saved.last-2/3)<0.01 && r.saved.n===1,'and saved for the scene ('+JSON.stringify(r.saved)+')');
  // their lines (4 of the scene's 7) are shown on screen, not spoken. His
  // own 3 lines each play once as the model answer - the two retries on
  // the middle line do not play it again, only the final grade does -
  // whether that grade is a pass or the reveal after the third miss.
  ok(r.plays===3,'each of his three lines played once, as the model answer, not once per attempt ('+r.plays+')');
  ok(/100%/.test(r.list) && /50%/.test(r.list),'the history shows a numeric grade per line, not just a colour ('+r.list.slice(0,200)+')');
  ok(/You say/.test(r.list) && /Correct/.test(r.list) && /You said/.test(r.list),
    'each row names the question, the correct line and what he actually said');
  // the colour is not the grade's closeness, it's how easily the answer came:
  // first-try right is green, never right in three tries is red
  ok(/\bscres good\b/.test(r.rowCls[0]) && /\bscres good\b/.test(r.rowCls[2]),
    'the two first-try lines are green ('+r.rowCls[0]+', '+r.rowCls[2]+')');
  ok(/\bscres bad\b/.test(r.rowCls[1]),'the line never said right in three tries is red, not just "missed" ('+r.rowCls[1]+')');
  ok(errs.length===0,'no page errors ('+errs.join('; ')+')');
  await ctx.close();
}

/* ---------- 4. no recogniser, and a blocked microphone ---------- */
console.log('\n4. a phone that cannot listen still rehearses, and is not scored');
{
  const ctx=await b.newContext({viewport:{width:393,height:852}});
  await ctx.addInitScript(s=>{ localStorage.setItem('kanaladder.v1',JSON.stringify(s)); }, base({}));
  await ctx.addInitScript(()=>{ delete window.webkitSpeechRecognition; delete window.SpeechRecognition;
    window.__spoke=[]; window.SpeechSynthesisUtterance=function(t){this.text=t;};
    try{ speechSynthesis.speak=u=>{ window.__spoke.push(u.text); setTimeout(()=>{u.onend&&u.onend();},5); }; speechSynthesis.cancel=()=>{}; }catch(e){} });
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8100/index.html');
  await p.waitForFunction(()=>window.__kl&&__kl.DECK.length>0,null,{timeout:20000});
  await p.evaluate(()=>{ const k=window.__kl; const sc=k.SCENES.find(s=>s.id==='sc08'); const now=Date.now();
    sc.lines.forEach(l=>k.SIDX[l.sid].w.forEach(w=>{ k.S.items[w+'|j']={s:1,st:0,n:4,ef:2.5,iv:20,due:now+864000000,lapses:0,piv:0,seen:6,ok:6,df:0.3,sb:8,lr:0}; }));
    k.scenesStart(); k.sceneOpen('sc08'); });
  const note=await p.evaluate(()=>document.getElementById('scMicNote').textContent);
  ok(/cannot listen/.test(note),'the brief says so before he starts');
  await p.evaluate(()=>window.__kl.sceneRun('rehearse'));
  await p.waitForFunction(()=>!document.getElementById('scDone').hidden,null,{timeout:40000});
  const r=await p.evaluate(()=>({head:document.getElementById('scDoneHead').textContent, saved:!!(window.__kl.S.scenes&&window.__kl.S.scenes.sc08)}));
  ok(/not scored/i.test(r.head),'the run ends unscored ('+r.head+')');
  ok(r.saved===false,'and nothing is saved as a score');
  ok(errs.length===0,'no page errors');
  await ctx.close();
}

/* ---------- 5. learn these first ---------- */
console.log('\n5. the words a scene needs can be put at the front of the new-card queue');
{
  const ctx=await b.newContext({viewport:{width:393,height:852}});
  await ctx.addInitScript(s=>{ localStorage.setItem('kanaladder.v1',JSON.stringify(s)); }, base({}));
  await ctx.addInitScript(fakeRec);
  const p=await ctx.newPage();
  await p.goto('http://localhost:8100/index.html');
  await p.waitForFunction(()=>window.__kl&&__kl.DECK.length>0,null,{timeout:20000});
  const r=await p.evaluate(()=>{ const k=window.__kl; const sc=k.SCENES[0];
    const gaps=k.sceneGaps(sc); const before=k.pools().nw.slice(0,3);
    k.sceneWant(gaps); const after=k.pools().nw.slice(0,gaps.length);
    return {gaps, before, after, want:k.S.want.slice()}; });
  const frontIsGaps = r.after.every(x=>r.gaps.indexOf(x.split('|')[0])>=0);
  ok(r.gaps.length>0,'the first scene has gaps to queue ('+r.gaps.length+')');
  ok(frontIsGaps,'those words now lead the new-card queue ('+r.after.slice(0,3).join(', ')+')');
  ok(JSON.stringify(r.before)!==JSON.stringify(r.after.slice(0,3)),'which is not the order it had before');
  ok(r.want.length===r.gaps.length,'and the request is saved with the state');
  await ctx.close();
}

await b.close();
console.log('\n'+(fails.length? 'FAILED: '+fails.length+'\n  '+fails.join('\n  ') : 'SCENES PLAY, LISTEN AND GRADE'));
process.exit(fails.length?1:0);
})();
