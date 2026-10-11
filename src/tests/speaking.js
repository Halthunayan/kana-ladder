/* Speaking: the words Focus already flagged as weak, drilled out loud. Checked
   against the running app with a scripted recogniser, because a real
   microphone is not available here and the flow has to be right whether or
   not the phone will listen. */
const {chromium}=require('playwright');
const fails=[]; const ok=(c,m)=>{ if(c) console.log('  PASS  '+m); else { fails.push(m); console.log('  FAIL  '+m);} };
const today=new Date(Date.now()-14400000).toISOString().slice(0,10);
const base=(items)=>({rev:9,
  settings:{sched:"fsrs",retention:0.9,newPerDay:12,revCap:150,separate:true,sentences:true,conj:true,listen:true,
    tts:true,autoPlay:false,typing:true,kanji:true,theme:"dark",carAudio:true,carChecked:true,cardAudio:true},
  daily:{key:today,newDone:0,revDone:0,ans:0,ok:0,credit:0,sentDone:0,conjDone:0,consDone:0,noNew:false,buried:{},done:{},missed:{}},
  hist:{}, streak:{cur:2,best:2,last:""}, life:{ans:100,ok:90,practice:0}, backup:{last:""}, notes:{}, susp:{}, pfail:{}, crep:{}, carSeen:{},
  checks:[], log:[], items:items||{}});
/* a weak item: a couple of lapses and poor recent accuracy, the same shape
   weakness() looks for, so weakWords() and speakingWords() both pick it up */
const weak=(now)=>[1,0,4,2.0,3,now+259200000,2,0,4,1,6.0,3.0,now];

/* a recogniser whose answers the test delivers on demand, via __recSay,
   rather than off a blind timer - the same way a real person only speaks
   once the prompt is actually on screen, never on a schedule racing the
   app's own pacing. undefined = nothing heard, null = permission denied.
   A one-shot session ends itself either way; a continuous one (Speaking's
   mic, which stays open across a whole same-direction block of words)
   keeps listening for the next call instead, exactly like the real API. */
const fakeRec=()=>{
  window.__recStarts=0; window.__recLangs=[]; window.__recActive=null;
  window.SpeechRecognition=window.webkitSpeechRecognition=function(){
    const R=this; R.lang=""; R.continuous=false;
    R.start=function(){ window.__recStarts++; window.__recLangs.push(R.lang); window.__recActive=R; };
    R.stop=function(){ if(window.__recActive===R) window.__recActive=null; };
    R.abort=function(){ if(window.__recActive===R) window.__recActive=null; R.onend&&R.onend(); };
  };
  window.__spoke=[];
  window.SpeechSynthesisUtterance=function(t){this.text=t;this.rate=1;};
  try{ speechSynthesis.speak=u=>{ window.__spoke.push(u.text); setTimeout(()=>{u.onstart&&u.onstart(); u.onend&&u.onend();},5); }; speechSynthesis.cancel=()=>{}; }catch(e){}
  window.__recSay=function(next){
    // nobody answers within a quarter second of seeing the word or the miss:
    // a line said that fast is held until the app's guard window has passed,
    // which is what a person speaking would do anyway
    const K=window.__kl;
    if(K && K.SP && K.SP.guardUntil && Date.now()<K.SP.guardUntil){
      setTimeout(()=>window.__recSay(next), K.SP.guardUntil-Date.now()+10); return true; }
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

/* ---------- 1. the button, the screen, and the word pool ---------- */
console.log('1. Speaking draws the same weak words Focus would, and dead ends the same way');
{
  const ctx=await b.newContext({viewport:{width:393,height:852}});
  await ctx.addInitScript(s=>{ localStorage.setItem('kanaladder.v1',JSON.stringify(s)); }, base({}));
  await ctx.addInitScript(fakeRec);
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8100/index.html');
  await p.waitForFunction(()=>window.__kl&&__kl.DECK.length>0,null,{timeout:20000});
  const d0=await p.evaluate(()=>({
    btn:!!document.getElementById('speakBtn'),
    label:document.getElementById('speakBtn').textContent,
    screen:!!document.getElementById('s-speak'),
    parts:['spTiles','spPrompt','spDirChip','spState','spHeard','spMicBtn','spStop','spDone','spDoneHead','spDoneSub','spDoneBtn','spAgain','spBack','spProg','spPeek']
      .every(id=>!!document.getElementById(id)),
    freshWords:window.__kl.speakingWords().length
  }));
  ok(d0.btn,'the Speaking button is on the home screen');
  ok(/Speaking/.test(d0.label),'labelled Speaking');
  ok(d0.screen && d0.parts,'the speaking screen has every part it needs');
  ok(d0.freshWords===0,'a fresh profile has nothing weak to draw on (' +d0.freshWords+')');
  await p.click('#speakBtn'); await p.waitForTimeout(150);
  const toastTxt=await p.evaluate(()=>document.getElementById('toast').textContent);
  ok(/Nothing met yet/.test(toastTxt),'and says so instead of opening ('+toastTxt+')');

  const w=await p.evaluate(()=>{ const k=window.__kl; const now=Date.now();
    ['c0000','c0001','c0004','c0005'].forEach(id=>{ k.S.items[id+'|j']=
      {s:1,st:0,n:4,ef:2.0,iv:3,due:now+259200000,lapses:2,piv:0,seen:4,ok:1,df:6.0,sb:3.0,lr:now}; });
    return {focus:k.weakWords().map(x=>x.id).sort(), speak:k.speakingWords().slice().sort()}; });
  ok(JSON.stringify(w.focus)===JSON.stringify(w.speak),
    'once four words are weak, Speaking draws exactly the set Focus would ('+w.speak.join(',')+')');
  ok(errs.length===0,'no page errors ('+errs.join('; ')+')');
  await ctx.close();
}

/* ---------- 2. grading, in both directions ---------- */
console.log('\n2. right is graded by sound in Japanese and by sense in English');
{
  const ctx=await b.newContext({viewport:{width:393,height:852}});
  await ctx.addInitScript(s=>{ localStorage.setItem('kanaladder.v1',JSON.stringify(s)); }, base({}));
  await ctx.addInitScript(fakeRec);
  const p=await ctx.newPage();
  await p.goto('http://localhost:8100/index.html');
  await p.waitForFunction(()=>window.__kl&&__kl.DECK.length>0,null,{timeout:20000});
  const g=await p.evaluate(()=>{ const k=window.__kl;
    return {
      jaExact:k.spGradeJa('こんにちは',['こんにちは']).sim,
      jaNear:k.spGradeJa('すみません',['すいません']).sim,
      jaWrong:k.spGradeJa('こんにちは',['さようなら']).sim,
      enExact:k.enGrade('hello / good afternoon',['hello']).sim,
      enInfinitive:k.enGrade('to eat',['eat']).sim,
      enAltPick:k.enGrade('excuse me / sorry / thank you',['sorry']).sim,
      enWrong:k.enGrade('goodbye',['hello']).sim,
      enEmpty:k.enGrade('goodbye',[]).sim
    };
  });
  ok(g.jaExact===1,'an exact Japanese echo scores 1');
  ok(g.jaNear>0.62,'a one kana slip on six morae still passes ('+g.jaNear.toFixed(2)+')');
  ok(g.jaWrong<0.62,'a different word does not ('+g.jaWrong.toFixed(2)+')');
  ok(g.enExact>0.6,'the first sense of a slash gloss passes ('+g.enExact.toFixed(2)+')');
  ok(g.enInfinitive>0.6,'"eat" passes for a gloss written "to eat" ('+g.enInfinitive.toFixed(2)+')');
  ok(g.enAltPick>0.6,'any one alternative of a slash gloss passes ('+g.enAltPick.toFixed(2)+')');
  ok(g.enWrong<0.6,'an unrelated word does not ('+g.enWrong.toFixed(2)+')');
  ok(g.enEmpty<0.6,'nothing heard is not a pass ('+g.enEmpty+')');
  await ctx.close();
}

/* ---------- 3. a round runs on its own, wrong answers retry in place ---------- */
console.log('\n3. wrong turns a ticket red and asks again; right turns it green and moves on');
{
  const ctx=await b.newContext({viewport:{width:393,height:852}});
  await ctx.addInitScript(s=>{ localStorage.setItem('kanaladder.v1',JSON.stringify(s)); }, base({}));
  await ctx.addInitScript(fakeRec);
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8100/index.html');
  await p.waitForFunction(()=>window.__kl&&__kl.DECK.length>0,null,{timeout:20000});
  await p.evaluate(()=>{
    const k=window.__kl;
    // three words, directions fixed by hand so the script below is deterministic -
    // each direction differs from the one before it, so the mic reopens at
    // every word here (a grouped round, as speakingStart now builds, would
    // not reopen between two words that share a direction)
    k.SP.ids=['c0000','c0001','c0004']; k.SP.dir={c0000:'e',c0001:'j',c0004:'e'};
    k.SP.state={}; k.SP.cur=-1; k.SP.running=true; k.go('speak');
    k.spAsk(0);
  });
  // word0 (say こんにちは): wrong, then right. word1 (say "good morning"): right
  // first try. word2 (say さようなら): right first try. Each answer is "said"
  // only once the app is actually listening IN THAT WORD'S OWN LANGUAGE -
  // checking the active recognizer's lang, not just whose turn it is, is
  // what proves the language-block restart actually happened rather than
  // catching the previous word's session still lingering before it swaps.
  async function say(i, text, lang){
    await p.waitForFunction((a)=>{ const k=window.__kl;
      return !!window.__recActive && k.SP.cur===a.i && window.__recActive.lang===a.lang;
    }, {i,lang}, {timeout:20000});
    await p.evaluate((t)=>window.__recSay(t), text);
  }
  await say(0, 'さようなら', 'ja-JP');
  await p.waitForFunction(()=>window.__kl.SP.state[0]==='bad',null,{timeout:20000});
  await say(0, 'こんにちは', 'ja-JP');
  await p.waitForFunction(()=>window.__kl.SP.state[0]==='good',null,{timeout:20000});
  await say(1, 'good morning', 'en-US');
  await p.waitForFunction(()=>window.__kl.SP.state[1]==='good',null,{timeout:20000});
  await say(2, 'さようなら', 'ja-JP');
  await p.waitForFunction(()=>!document.getElementById('spDone').hidden,null,{timeout:20000});
  const r=await p.evaluate(()=>{ const k=window.__kl;
    const tiles=Array.prototype.map.call(document.querySelectorAll('#spTiles .sptile'),t=>t.className);
    return {starts:window.__recStarts, state:k.SP.state, head:document.getElementById('spDoneHead').textContent,
      sub:document.getElementById('spDoneHead').textContent+' '+document.getElementById('spDoneSub').textContent, tiles:tiles};
  });
  ok(r.starts===3,'the mic reopened once per direction change, not once per attempt ('+r.starts+')');
  ok(r.state[0]==='good' && r.state[1]==='good' && r.state[2]==='good','all three end up correct ('+JSON.stringify(r.state)+')');
  ok(/3 of 3/.test(r.sub),'the round reports three of three ('+r.sub+')');
  // word0 took two tries, so its ticket is yellow, not green - green is
  // reserved for a first-try answer, same as the other two
  ok(/s-retry/.test(r.tiles[0]),'the one that needed a second try is yellow, not green ('+r.tiles[0]+')');
  ok(/s-good/.test(r.tiles[1]) && /s-good/.test(r.tiles[2]),'the two first-try answers are green ('+r.tiles[1]+', '+r.tiles[2]+')');
  // the finish screen lists the word that took two tries, with its answer;
  // the tickets are gone there (tapping one used to open a panel and scroll)
  const fin=await p.evaluate(()=>({tiles:document.getElementById('spTiles').hidden, list:document.getElementById('spDoneList').textContent}));
  ok(fin.tiles && /konnichiwa/.test(fin.list),'the finish lists what it was, without the tickets ('+fin.list.slice(0,80)+')');
  ok(errs.length===0,'no page errors ('+errs.join('; ')+')');
  await ctx.close();
}

/* ---------- 4. a wrong answer really does turn the ticket red before the retry ---------- */
console.log('\n4. the wrong colour shows before the question repeats');
{
  const ctx=await b.newContext({viewport:{width:393,height:852}});
  await ctx.addInitScript(s=>{ localStorage.setItem('kanaladder.v1',JSON.stringify(s)); }, base({}));
  await ctx.addInitScript(fakeRec);
  const p=await ctx.newPage();
  await p.goto('http://localhost:8100/index.html');
  await p.waitForFunction(()=>window.__kl&&__kl.DECK.length>0,null,{timeout:20000});
  await p.evaluate(()=>{
    const k=window.__kl;
    k.SP.ids=['c0000']; k.SP.dir={c0000:'e'}; k.SP.state={}; k.SP.cur=-1; k.SP.running=true; k.go('speak');
    k.spAsk(0);
  });
  await p.waitForFunction(()=>!!window.__recActive,null,{timeout:20000});
  await p.evaluate(()=>window.__recSay('さようなら'));   // wrong
  await p.waitForFunction(()=>window.__kl.SP.state[0]==='bad',null,{timeout:20000});
  const mid=await p.evaluate(()=>{
    const t=document.querySelector('#spTiles .sptile[data-i="0"]');
    return {cls:t.className, heard:document.getElementById('spHeard').textContent};
  });
  ok(/s-bad/.test(mid.cls),'the ticket is red right after the wrong answer ('+mid.cls+')');
  ok(/Not that/.test(mid.heard),'and it says the answer was not right');
  await p.evaluate(()=>window.__recSay('こんにちは'));   // same continuous session, no restart needed
  await p.waitForFunction(()=>window.__kl.SP.state[0]==='good',null,{timeout:20000});
  const starts=await p.evaluate(()=>window.__recStarts);
  ok(starts===1,'it retries the same word on the mic already open, without reopening it ('+starts+')');
  await ctx.close();
}

/* ---------- 5. no microphone: unscored, but it still finishes on its own ---------- */
console.log('\n5. no recogniser here still runs the round, without hanging or scoring it');
{
  const ctx=await b.newContext({viewport:{width:393,height:852}});
  await ctx.addInitScript(s=>{ localStorage.setItem('kanaladder.v1',JSON.stringify(s)); }, base({}));
  await ctx.addInitScript(()=>{ delete window.webkitSpeechRecognition; delete window.SpeechRecognition;
    window.SpeechSynthesisUtterance=function(t){this.text=t;};
    try{ speechSynthesis.speak=u=>{ setTimeout(()=>{u.onend&&u.onend();},5); }; speechSynthesis.cancel=()=>{}; }catch(e){} });
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8100/index.html');
  await p.waitForFunction(()=>window.__kl&&__kl.DECK.length>0,null,{timeout:20000});
  await p.evaluate(()=>{ const k=window.__kl;
    k.SP.ids=['c0000','c0001']; k.SP.dir={c0000:'e',c0001:'j'}; k.SP.state={}; k.SP.cur=-1; k.SP.running=true; k.go('speak');
    k.spAsk(0);
  });
  await p.waitForFunction(()=>!document.getElementById('spDone').hidden,null,{timeout:20000});
  const r=await p.evaluate(()=>({state:window.__kl.SP.state, sub:document.getElementById('spDoneHead').textContent}));
  ok(r.state[0]==='skip' && r.state[1]==='skip','both words are marked skipped, not right or wrong ('+JSON.stringify(r.state)+')');
  ok(/0 of 2/.test(r.sub),'the round says nothing was scored ('+r.sub+')');
  ok(errs.length===0,'no page errors ('+errs.join('; ')+')');
  await ctx.close();
}

/* ---------- 6. the fallback pool never hands out a sentence or a conjugation drill ---------- */
console.log('\n6. when nothing is weak, the fallback draws only plain words, never a sentence or a drill');
{
  const ctx=await b.newContext({viewport:{width:393,height:852}});
  await ctx.addInitScript(s=>{ localStorage.setItem('kanaladder.v1',JSON.stringify(s)); }, base({}));
  await ctx.addInitScript(fakeRec);
  const p=await ctx.newPage();
  await p.goto('http://localhost:8100/index.html');
  await p.waitForFunction(()=>window.__kl&&__kl.DECK.length>0,null,{timeout:20000});
  const r=await p.evaluate(()=>{
    const k=window.__kl, now=Date.now();
    // a sentence id and a conjugation id, both real entries in IDX under the
    // same id space as plain words: practiceQueue() mixes all three kinds in
    const sentId=Object.keys(k.IDX).find(id=>k.IDX[id].t==='s');
    const conjId=Object.keys(k.IDX).find(id=>k.IDX[id].t==='g');
    // in rotation, but not weak, so weakWords() stays empty and the fallback
    // (practiceQueue) is what speakingWords() actually has to filter
    [sentId, conjId, 'c0002', 'c0003', 'c0006', 'c0007'].forEach(id=>{
      k.S.items[id+'|j']={s:0,st:2,n:6,ef:2.3,iv:12,due:now+999999999,lapses:0,piv:0,seen:6,ok:6,df:2.0,sb:9.0,lr:now};
    });
    const ids=k.speakingWords();
    const bad=ids.filter(id=>!k.IDX[id] || k.IDX[id].t!=='w');
    return {weak:k.weakWords().length, count:ids.length, bad, sentId, conjId};
  });
  ok(r.weak===0,'nothing is weak, so the fallback path is what runs ('+r.weak+')');
  ok(r.count>0,'the fallback still finds words to draw ('+r.count+')');
  ok(r.bad.length===0,'the sentence and the conjugation drill were both filtered out ('+JSON.stringify(r.bad)+')');
  await ctx.close();
}

/* ---------- 7. the longest real word or gloss in the deck still fits the phone ---------- */
console.log('\n7. even the longest word, gloss or greeting in the deck stays on screen');
{
  const ctx=await b.newContext({viewport:{width:390,height:844}});
  await ctx.addInitScript(s=>{ localStorage.setItem('kanaladder.v1',JSON.stringify(s)); }, base({}));
  await ctx.addInitScript(fakeRec);
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8100/index.html');
  await p.waitForFunction(()=>window.__kl&&__kl.DECK.length>0,null,{timeout:20000});
  const overflow=async (id, dir)=>p.evaluate(({id,dir})=>{
    const k=window.__kl;
    k.SP.ids=[id]; k.SP.dir={}; k.SP.dir[id]=dir; k.SP.state={}; k.SP.cur=-1; k.SP.running=true;
    k.go('speak'); k.spAsk(0);
    const vw=window.innerWidth, bad=[];
    document.querySelectorAll('#s-speak *').forEach(el=>{
      const r=el.getBoundingClientRect();
      if(r.right>vw+1 || r.left<-1) bad.push(el.className||el.id||el.tagName);
    });
    return bad;
  }, {id,dir});
  const picks=await p.evaluate(()=>{
    const k=window.__kl; let longestEn=null, longestJa=null;
    for(const id in k.IDX){ const c=k.IDX[id]; if(!c||c.t!=='w'||!c.en||!c.kana) continue;
      if(!longestEn || c.en.length>k.IDX[longestEn].en.length) longestEn=id;
      const jlen=c.kana.length+(c.romaji||'').length;
      if(!longestJa || jlen>(k.IDX[longestJa].kana.length+(k.IDX[longestJa].romaji||'').length)) longestJa=id; }
    return {longestEn, longestJa};
  });
  const badEn=await overflow(picks.longestEn,'e');
  const badJa=await overflow(picks.longestJa,'j');
  ok(badEn.length===0,'the longest English gloss in the deck wraps instead of running off screen ('+badEn.join(',')+')');
  ok(badJa.length===0,'the longest kana and romaji in the deck wraps instead of running off screen ('+badJa.join(',')+')');
  ok(errs.length===0,'no page errors ('+errs.join('; ')+')');
  await ctx.close();
}

/* ---------- 8. total silence never makes the mic give up, it just says so and keeps listening ---------- */
console.log('\n8. total silence never makes the mic give up - it says so plainly and keeps listening');
{
  const ctx=await b.newContext({viewport:{width:393,height:852}});
  await ctx.addInitScript(s=>{ localStorage.setItem('kanaladder.v1',JSON.stringify(s)); }, base({}));
  await ctx.addInitScript(fakeRec);
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8100/index.html');
  await p.waitForFunction(()=>window.__kl&&__kl.DECK.length>0,null,{timeout:20000});
  await p.evaluate(()=>{
    const k=window.__kl;
    k.SP.ids=['c0000']; k.SP.dir={c0000:'e'}; k.SP.state={}; k.SP.cur=-1; k.SP.running=true; k.go('speak');
    k.spAsk(0);
  });
  await p.waitForFunction(()=>!!window.__recActive,null,{timeout:20000});
  // nobody says anything at all for longer than one listen window
  await p.waitForFunction(()=>/Still not hearing you/.test(document.getElementById('spState').textContent),null,{timeout:10000});
  const r=await p.evaluate(()=>({
    starts:window.__recStarts,
    state:document.getElementById('spState').textContent,
    cur:window.__kl.SP.cur,
    micHidden:document.getElementById('spMicBtn').hidden,
    showHidden:document.getElementById('spShowBtn').hidden,
    skipHidden:document.getElementById('spSkipBtn').hidden
  }));
  ok(r.starts===1,'the mic opened once and just kept listening through the silence, no restart ('+r.starts+')');
  ok(/Still not hearing you/.test(r.state),'and says plainly that nothing is being heard ('+r.state+')');
  ok(r.cur===0,'the word has not been failed or skipped on its own ('+r.cur+')');
  ok(!r.showHidden && !r.skipHidden,'Show answer and Skip are there as the way past it ('+r.showHidden+','+r.skipHidden+')');
  ok(r.micHidden,'the tap-to-speak button stays hidden - this is silence, not a blocked mic ('+r.micHidden+')');
  // the session never actually died: saying it now still grades normally,
  // on the same mic, with no reopen
  await p.evaluate(()=>window.__recSay('こんにちは'));
  await p.waitForFunction(()=>window.__kl.SP.state[0]==='good',null,{timeout:20000});
  const starts2=await p.evaluate(()=>window.__recStarts);
  ok(starts2===1,'and it was the same open mic that finally heard it ('+starts2+')');
  ok(errs.length===0,'no page errors ('+errs.join('; ')+')');
  await ctx.close();
}

/* ---------- 9. three wrong tries reveal the answer, grade it, and move on ---------- */
console.log('\n9. three wrong tries in a row reveal the answer, grade it at the bottom of the scale, and move on');
{
  const ctx=await b.newContext({viewport:{width:393,height:852}});
  await ctx.addInitScript(s=>{ localStorage.setItem('kanaladder.v1',JSON.stringify(s)); }, base({}));
  await ctx.addInitScript(fakeRec);
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8100/index.html');
  await p.waitForFunction(()=>window.__kl&&__kl.DECK.length>0,null,{timeout:20000});
  await p.evaluate(()=>{
    const k=window.__kl;
    // two words, so there is something to move on to once the first one
    // runs out of tries
    k.SP.ids=['c0000','c0001']; k.SP.dir={c0000:'e',c0001:'e'};
    k.SP.state={}; k.SP.cur=-1; k.SP.running=true; k.go('speak');
    k.spAsk(0);
  });
  for(let i=0;i<3;i++){
    await p.waitForFunction(()=>!!window.__recActive,null,{timeout:20000});
    await p.evaluate(()=>window.__recSay('さようなら'));   // wrong, every single time, on purpose
    await p.waitForFunction((n)=>window.__kl.SP.tries[0]===n,i+1,{timeout:20000});
  }
  const mid=await p.evaluate(()=>({state:window.__kl.SP.state[0], grade:window.__kl.SP.grade[0],
    verdict:window.__kl.SP.verdict[0], tries:window.__kl.SP.tries[0],
    heardShown:document.getElementById('spHeard').textContent}));
  ok(mid.tries===3,'exactly three tries were used, not more or fewer ('+mid.tries+')');
  ok(mid.state==='bad','the ticket is marked wrong, not left pending ('+mid.state+')');
  ok(mid.verdict==='missed' && mid.grade===0,'a completely wrong answer grades at the bottom of the scale ('+mid.verdict+', '+mid.grade+')');
  ok(/konnichiwa/.test(mid.heardShown),'the correct answer is revealed on screen ('+mid.heardShown+')');
  const tileCls=await p.evaluate(()=>document.querySelector('#spTiles .sptile[data-i="0"]').className);
  ok(/s-bad/.test(tileCls),'never right in three tries shows red, not yellow or green ('+tileCls+')');
  // the reveal actually holds for a beat - it is not an instant skip to the next word
  await p.waitForTimeout(600);
  const stillHere=await p.evaluate(()=>window.__kl.SP.cur);
  ok(stillHere===0,'the reveal holds before moving on, rather than advancing straight away ('+stillHere+')');
  // and it does move on by itself once that hold is over, with no tap needed
  await p.waitForFunction(()=>window.__kl.SP.cur===1,null,{timeout:20000});
  await p.click('#spSkipBtn');   // move past word1 without needing to know its own gloss
  // the word missed three times comes back once at the end, as the review
  await p.waitForFunction(()=>window.__kl.SP.inReview && window.__kl.SP.cur===0 && !window.__kl.SP.locked[0],null,{timeout:20000});
  const rv=await p.evaluate(()=>({st:document.getElementById('spState').textContent, prog:document.getElementById('spProg').textContent}));
  ok(/Review/.test(rv.prog),'the missed word comes back at the end, marked as the review ('+rv.prog+')');
  await p.click('#spSkipBtn');
  await p.waitForFunction(()=>!document.getElementById('spDone').hidden,null,{timeout:20000});
  const st0=await p.evaluate(()=>({s:window.__kl.SP.state[0], g:window.__kl.SP.grade[0]}));
  ok(st0.s==='bad' && st0.g===0,'skipping the review leaves it as missed, with its grade ('+JSON.stringify(st0)+')');
  const list=await p.evaluate(()=>document.getElementById('spDoneList').textContent);
  ok(/(^|[^0-9])0%/.test(list),'the finish screen\'s history carries the numeric grade through ('+list.slice(0,160)+')');
  ok(/konnichiwa/.test(list),'and the correct answer it was graded against');
  ok(errs.length===0,'no page errors ('+errs.join('; ')+')');
  await ctx.close();
}

console.log('\n10. reading the Japanese aloud is not an answer and does not cost a try (10 Oct)');
{
  const ctx=await b.newContext({viewport:{width:393,height:852}});
  await ctx.addInitScript(s=>{ localStorage.setItem('kanaladder.v1',JSON.stringify(s)); }, base({}));
  await ctx.addInitScript(fakeRec);
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8100/index.html');
  await p.waitForFunction(()=>window.__kl&&__kl.DECK.length>0,null,{timeout:20000});
  // a Japanese-answer word first, so the English block has a switch to announce
  await p.evaluate(()=>{ const k=window.__kl;
    k.SP.ids=['c0000','c0238','c0050']; k.SP.dir={c0000:'e',c0238:'j',c0050:'j'};
    k.SP.state={}; k.SP.tries={}; k.SP.cur=-1; k.SP.running=true; k.go('speak'); k.spAsk(0); });
  await p.waitForFunction(()=>!!window.__recActive,null,{timeout:20000});
  await p.evaluate(()=>window.__recSay('こんにちは'));
  await p.waitForFunction(()=>window.__kl.SP.cur===1,null,{timeout:20000});
  const sw=await p.evaluate(()=>({st:document.getElementById('spState').textContent, chip:document.getElementById('spDirChip').textContent}));
  ok(/Switching to English/.test(sw.st),'the switch to English is announced ('+sw.st+')');
  ok(/in English/.test(sw.chip),'the direction label says it in words ('+sw.chip+')');
  await p.waitForFunction(()=>!!window.__recActive && window.__recActive.lang==='en-US' && !window.__kl.SP.locked[1],null,{timeout:20000});
  await p.evaluate(()=>window.__recSay('D'));
  await p.waitForTimeout(1100);   // past the guard after a pass, and graded
  const r1=await p.evaluate(()=>({tries:window.__kl.SP.tries[1]||0, state:window.__kl.SP.state[1], cur:window.__kl.SP.cur,
    heard:document.getElementById('spHeard').textContent, st:document.getElementById('spState').textContent}));
  ok(r1.tries===0 && r1.state!=='bad' && r1.cur===1,'"D" for de is the Japanese read aloud: no try used, still on de ('+JSON.stringify(r1)+')');
  ok(/That was the Japanese/.test(r1.heard) && /did not count/.test(r1.st),'and he is told to say the meaning instead');
  await p.evaluate(()=>window.__recSay('at'));
  await p.waitForFunction(()=>window.__kl.SP.state[1]==='good',null,{timeout:20000});
  ok(true,'then "at" passes de');
  await p.waitForFunction(()=>window.__kl.SP.cur===2 && !window.__kl.SP.locked[2],null,{timeout:20000});
  await p.evaluate(()=>window.__recSay('N'));
  await p.waitForTimeout(1100);
  const r2=await p.evaluate(()=>({tries:window.__kl.SP.tries[2]||0, state:window.__kl.SP.state[2]}));
  ok(r2.tries===0 && r2.state!=='bad','"N" for en is not counted either ('+JSON.stringify(r2)+')');
  // a real wrong English answer still costs a try
  await p.evaluate(()=>window.__recSay('banana'));
  await p.waitForFunction(()=>(window.__kl.SP.tries[2]||0)===1,null,{timeout:20000});
  ok(true,'a wrong English answer still costs a try');
  await p.waitForTimeout(2500);   // the retry re-asks the word after a short beat
  await p.evaluate(()=>window.__recSay('yen'));
  await p.waitForFunction(()=>window.__kl.SP.state[2]==='good',null,{timeout:20000});
  ok(true,'and "yen" passes en');
  ok(errs.length===0,'no page errors ('+errs.join('; ')+')');
  await ctx.close();
}

console.log('\n11. the rebuilt round: fairer grading, no dead time, hints, his own call, cues (10 Oct)');
{
  const ctx=await b.newContext({viewport:{width:393,height:852}});
  await ctx.addInitScript(s=>{ localStorage.setItem('kanaladder.v1',JSON.stringify(s)); }, base({}));
  await ctx.addInitScript(fakeRec);
  await ctx.addInitScript(()=>{ window.__cues=[]; const C=window.AudioContext;
    window.AudioContext=function(){ const c=new C(); const o=c.createOscillator.bind(c);
      c.createOscillator=function(){ window.__cues.push(Date.now()); return o(); }; return c; }; });
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8100/index.html');
  await p.waitForFunction(()=>window.__kl&&__kl.DECK.length>0,null,{timeout:20000});
  const g=await p.evaluate(()=>{ const k=window.__kl, I=k.IDX, P=0.62, E=0.6;
    const ja=(id,said)=>k.spGradeJa(I[id].kana,[said],I[id]).sim>=P, en=(id,said)=>k.enGrade(I[id].en,[said]).sim>=E;
    return {
      uchiKanji:ja('c0119','家'), nihonKanji:ja('c1761','日本'), ikutsuKanji:ja('c0360','幾つ'),
      shichiDigit:ja('c0672','7'), shichiKanji:ja('c0672','七'), hachiDigit:ja('c0041','8'),
      uchiWrong:ja('c0119','いえ'),
      large:en('c0189','large'), tasty:en('c0113','tasty'), ate:en('c0041','ate'), went:en('c0180','went'), going:en('c0180','going'),
      notUnderstand:en('c0017','I understand'), expensive:en('c0144','expensive'), evening:en('c0001','good evening'),
      particleOut:k.speakingWords.toString().length>0 && !k.IDX.c0234 ? null : true
    }; });
  ok(g.uchiKanji && g.nihonKanji && g.ikutsuKanji,'the word asked is read in its own spelling: 家 is uchi, 日本 nihon, 幾つ ikutsu ('+JSON.stringify([g.uchiKanji,g.nihonKanji,g.ikutsuKanji])+')');
  ok(g.shichiDigit && g.shichiKanji && g.hachiDigit,'a digit is tried in each reading: 7 is shichi as well as nana');
  ok(!g.uchiWrong,'and a different word is still wrong: ie is not uchi');
  ok(g.large && g.tasty && g.ate && g.went && g.going,'English said naturally passes: large, tasty, ate (eight), went, going ('+JSON.stringify([g.large,g.tasty,g.ate,g.went,g.going])+')');
  ok(!g.notUnderstand && !g.expensive && !g.evening,'and the opposites still fail: I understand, expensive, good evening');

  // the pool leaves out particles and grammar descriptions
  const pool=await p.evaluate(()=>{ const k=window.__kl, now=Date.now();
    ['c0234','c0119','c0189','c0113','c0041'].forEach(id=>{ k.S.items[id+'|j']={s:1,st:0,n:4,ef:2.0,iv:3,due:now+259200000,lapses:2,piv:0,seen:4,ok:1,df:6.0,sb:3.0,lr:now}; });
    return k.speakingWords(); });
  ok(pool.indexOf('c0234')<0 && pool.length===4,'a particle (wa, topic marker) is not asked as speech ('+pool.join(',')+')');

  // flow: from a right answer to the next word listening, no dead time
  await p.evaluate(()=>{ const k=window.__kl;
    k.SP.ids=['c0119','c0189','c0113']; k.SP.dir={c0119:'e',c0189:'e',c0113:'e'};
    k.SP.state={}; k.SP.tries={}; k.SP.cur=-1; k.SP.running=true; k.SP._orderFor=null; k.go('speak'); k.spAsk(0); });
  await p.waitForFunction(()=>!!window.__recActive && !window.__kl.SP.locked[0],null,{timeout:20000});
  const t0=await p.evaluate(()=>{ window.__recSay('うち'); return Date.now(); });
  await p.waitForFunction(()=>window.__kl.SP.cur===1 && !window.__kl.SP.locked[1],null,{timeout:20000});
  const gap=await p.evaluate(t=>({ms:Date.now()-t, guard:window.__kl.SP.guardUntil-Date.now()}), t0);
  // speech that starts as the word appears is heard: only a result that
  // arrives inside the first 0.65 s (the tail of the last answer) is dropped,
  // and no answer to a new word can be finished that fast
  ok(gap.ms<800 && gap.guard<=700,'from a right answer to the next word listening takes under 0.8 s ('+gap.ms+' ms; it was 1.4 to 4.5 s)');
  // a wrong try: what was heard stays, a hint comes up, the mic is not restarted
  const starts0=await p.evaluate(()=>window.__recStarts);
  await p.evaluate(()=>window.__recSay('ちいさい'));
  await p.waitForFunction(()=>window.__kl.SP.state[1]==='bad',null,{timeout:20000});
  await p.waitForTimeout(400);
  const w1=await p.evaluate(()=>({heard:document.getElementById('spHeard').textContent, hint:document.getElementById('spHint').textContent,
    self:!document.getElementById('spSelfBtn').hidden, prompt:document.getElementById('spPrompt').textContent, starts:window.__recStarts}));
  ok(/heard/.test(w1.heard) && /Starts with "o"/.test(w1.hint),'after a miss the heard line stays and a hint shows the first sound ('+w1.hint+')');
  ok(w1.starts===starts0,'the retry does not restart the mic ('+starts0+' then '+w1.starts+')');
  ok(w1.self,'"I said it right" is offered after a miss');
  await p.evaluate(()=>window.__recSay('おおい'));
  await p.waitForFunction(()=>(window.__kl.SP.tries[1]||0)===2,null,{timeout:20000});
  const h2=await p.evaluate(()=>document.getElementById('spHint').textContent);
  ok(/"ooki\.\.\."/.test(h2) || /ooki/.test(h2),'the second hint gives all but the last sound ('+h2+')');
  // his own call
  await p.click('#spSelfBtn');
  await p.waitForFunction(()=>window.__kl.SP.state[1]==='good',null,{timeout:20000});
  const sf=await p.evaluate(()=>({self:window.__kl.SP.self[1], rec:window.__kl.S.spoken.c0189,
    tile:document.querySelector('#spTiles .sptile[data-i="1"]').className}));
  ok(sf.self && sf.rec && sf.rec.ok===1 && /s-retry/.test(sf.tile),'marked right by him: a pass, recorded, shown yellow not green ('+sf.tile+')');
  // Show after a miss still records the miss
  await p.waitForFunction(()=>window.__kl.SP.cur===2 && !window.__kl.SP.locked[2],null,{timeout:20000});
  await p.evaluate(()=>window.__recSay('まずい'));
  await p.waitForFunction(()=>window.__kl.SP.state[2]==='bad',null,{timeout:20000});
  await p.click('#spShowBtn');
  await p.waitForTimeout(200);
  const sh=await p.evaluate(()=>window.__kl.S.spoken.c0113);
  ok(sh && sh.miss && !sh.ok,'Show answer after a wrong try still counts the miss ('+JSON.stringify(sh)+')');
  const cues=await p.evaluate(()=>window.__cues.length);
  ok(cues>=6,'sound cues play for turns, passes and misses ('+cues+' tones)');
  ok(errs.length===0,'no page errors ('+errs.join('; ')+')');
  await ctx.close();
}

console.log('\n12. the speaking screen and its finish fit one screen, no scrolling (10 Oct)');
for(const [w,h] of [[375,580],[393,759]]){
  const ctx=await b.newContext({viewport:{width:w,height:h}});
  await ctx.addInitScript(s=>{ localStorage.setItem('kanaladder.v1',JSON.stringify(s)); }, base({}));
  await ctx.addInitScript(fakeRec);
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8100/index.html');
  await p.waitForFunction(()=>window.__kl&&__kl.DECK.length>0,null,{timeout:20000});
  const fits=()=>p.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1);
  await p.evaluate(()=>{ document.getElementById('tabs').classList.add('hide'); const k=__kl;
    k.SP.ids=['c0189','c0113','c0119','c0001','c0041','c0180','c0144','c0360','c0672','c1761','c0017','c0034'];
    k.SP.dir={}; k.SP.ids.forEach((x,i)=>k.SP.dir[x]=i<6?'e':'j');
    k.SP.state={}; k.SP.tries={}; k.SP.cur=-1; k.SP.running=true; k.SP._orderFor=null; k.go('speak'); k.spAsk(0); });
  await p.waitForFunction(()=>!!window.__recActive && !window.__kl.SP.locked[0],null,{timeout:20000});
  ok(await fits(),'at '+w+'x'+h+' a word on screen fits');
  await p.evaluate(()=>window.__recSay('ちいさい'));
  await p.waitForFunction(()=>window.__kl.SP.state[0]==='bad',null,{timeout:20000});
  ok(await fits(),'at '+w+'x'+h+' a miss with its hint and three buttons fits');
  await p.evaluate(()=>{ const k=__kl; for(let i=0;i<12;i++){ const m=i%3===0; k.SP.state[i]=m?'bad':'good'; k.SP.tries[i]=m?3:1;
    k.SP.verdict[i]=m?'missed':'good'; k.SP.grade[i]=m?0:100; k.SP.heard[i]='x'; } k.spAsk(99); });
  await p.waitForFunction(()=>!document.getElementById('spDone').hidden,null,{timeout:20000});
  ok(await fits(),'at '+w+'x'+h+' the finish screen with four misses fits; its list scrolls inside');
  await p.click('#spAllBtn');
  ok(await fits(),'and still fits with the full list open');
  ok(errs.length===0,'no page errors ('+errs.join('; ')+')');
  await ctx.close();
}

console.log('\n13. the audit of 10 Oct: no false passes, and the round cannot be knocked over');
{
  const ctx=await b.newContext({viewport:{width:393,height:852}});
  await ctx.addInitScript(s=>{ localStorage.setItem('kanaladder.v1',JSON.stringify(s)); }, base({}));
  await ctx.addInitScript(fakeRec);
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8100/index.html');
  await p.waitForFunction(()=>window.__kl&&__kl.DECK.length>0,null,{timeout:20000});
  const EN=[['to win','to ride',0],['to lose','to go',0],['to give','to take',0],['to like','to hate',0],['sea','saw',0],['meat','met',0],
    ['right','wrote',0],['here','heard',0],['new','news',0],['father','mother',0],['next week','last week',0],['seventy','seventeen',0],
    ['eighty','eighteen',0],['north','south',0],['man','woman',0],['easy, not difficult','not easy',0],['a little','small',0],
    ['firm, hard','difficult',0],['one','one hundred',0],['four','for example',0],['is / am / are (polite)','was',0],
    ['understood / I see','to understand',0],['disliked, hated','hat',0],['bus','boss',0],
    ['to eat','ate',1],['eight','ate',1],['to eat','eating',1],['to go','went',1],['to go','going',1],['to come','coming',1],
    ['big, large','huge',1],['right','write',1],['two','to',1],['to understand','understood',1],["I don't understand",'I do not understand',1],
    ['excuse me / sorry / thank you',"I'm sorry",1],['big','it is big',1],['one hundred','100',1],['station','the station',1]];
  const en=await p.evaluate(cs=>cs.filter(([t,h,w])=>(window.__kl.enGrade(t,[h]).sim>=0.6)!==!!w).map(c=>c.join(' | ')), EN);
  ok(en.length===0,'English: '+EN.length+' cases, opposites and look-alikes fail, natural answers pass'+(en.length?' (wrong: '+en.join('; ')+')':''));
  const JA=[['じゅうはち','17',0],['じゅうはち','18',1],['はちじゅう','70',0],['ろくじゅう','90',0],['じゅうろく','19',0],['じゅうしょ','14',0],
    ['おじいさん','おじさん',0],['おじさん','おじいさん',0],['おばあさん','おばさん',0],['きって','きて',0],
    ['おじいさん','おじーさん',1],['コーヒー','こうひい',1],['こんにちは','今日は',1],['こんにちは','こんにちわ',1],['しち','7',1],['いくつ','幾つ',1]];
  const ja=await p.evaluate(cs=>cs.filter(([t,h,w])=>(window.__kl.spGradeJa(t,[h]).sim>=0.62)!==!!w).map(c=>c.join(' | ')), JA);
  ok(ja.length===0,'Japanese: '+JA.length+' cases, wrong numbers and long-vowel pairs fail, spellings of the right word pass'+(ja.length?' (wrong: '+ja.join('; ')+')':''));

  // Skip tapped in the moment after a right answer does not undo it
  await p.evaluate(()=>{ const k=window.__kl;
    k.SP.ids=['c0119','c0189']; k.SP.dir={c0119:'e',c0189:'e'};
    k.SP.state={}; k.SP.tries={}; k.SP.cur=-1; k.SP.running=true; k.SP._orderFor=null; k.go('speak'); k.spAsk(0); });
  await p.waitForFunction(()=>!!window.__recActive && !window.__kl.SP.locked[0],null,{timeout:20000});
  await p.evaluate(()=>window.__recSay('うち'));
  await p.waitForFunction(()=>window.__kl.SP.state[0]==='good',null,{timeout:20000});
  await p.click('#spSkipBtn');
  const sk=await p.evaluate(()=>({st:window.__kl.SP.state[0], order:window.__kl.SP.order.slice()}));
  ok(sk.st==='good' && sk.order.length===2,'Skip in the beat after a right answer leaves it right ('+JSON.stringify(sk)+')');
  // "I said it right" after the reveal turns the stored miss into his pass
  await p.waitForFunction(()=>window.__kl.SP.cur===1 && !window.__kl.SP.locked[1],null,{timeout:20000});
  for(let n=0;n<3;n++){
    await p.evaluate(()=>window.__recSay('まずい'));
    await p.waitForFunction(m=>(window.__kl.SP.tries[1]||0)===m,n+1,{timeout:20000});
  }
  await p.click('#spSelfBtn');
  const sr=await p.evaluate(()=>window.__kl.S.spoken.c0189);
  ok(sr && sr.ok===1 && sr.self===1 && sr.okAt>=sr.miss,'"I said it right" after the reveal records his pass over the miss ('+JSON.stringify(sr)+')');
  ok(errs.length===0,'no page errors ('+errs.join('; ')+')');
  await ctx.close();
}
{
  // a blocked mic: the tap fallback grades the word
  const ctx=await b.newContext({viewport:{width:393,height:852}});
  await ctx.addInitScript(s=>{ localStorage.setItem('kanaladder.v1',JSON.stringify(s)); }, base({}));
  await ctx.addInitScript(fakeRec);
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8100/index.html');
  await p.waitForFunction(()=>window.__kl&&__kl.DECK.length>0,null,{timeout:20000});
  await p.evaluate(()=>{ const k=window.__kl;
    k.SP.ids=['c0119','c0189']; k.SP.dir={c0119:'e',c0189:'e'};
    k.SP.state={}; k.SP.tries={}; k.SP.cur=-1; k.SP.running=true; k.SP._orderFor=null; k.SP.mic='blocked'; k.go('speak'); k.spAsk(0); });
  await p.waitForFunction(()=>!document.getElementById('spMicBtn').hidden,null,{timeout:20000});
  await p.click('#spMicBtn');
  await p.waitForFunction(()=>!!window.__recActive,null,{timeout:20000});
  await p.evaluate(()=>window.__recSay('うち'));
  await p.waitForFunction(()=>window.__kl.SP.state[0]==='good',null,{timeout:20000});
  ok(true,'with the mic blocked, the tap-to-speak fallback grades the word');
  ok(errs.length===0,'no page errors ('+errs.join('; ')+')');
  await ctx.close();
}

await b.close();
console.log('\n'+(fails.length? 'FAILED: '+fails.length+'\n  '+fails.join('\n  ') : 'SPEAKING GRADES BOTH DIRECTIONS, NO CLICKS NEEDED'));
process.exit(fails.length?1:0);
})();
