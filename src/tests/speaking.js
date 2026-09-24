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
      sub:document.getElementById('spDoneSub').textContent, tiles:tiles};
  });
  ok(r.starts===3,'the mic reopened once per direction change, not once per attempt ('+r.starts+')');
  ok(r.state[0]==='good' && r.state[1]==='good' && r.state[2]==='good','all three end up correct ('+JSON.stringify(r.state)+')');
  ok(/3 of 3/.test(r.sub),'the round reports three of three ('+r.sub+')');
  ok(r.tiles.every(c=>/s-good/.test(c)),'every ticket ends up green, even the one that was wrong first ('+r.tiles.join(' | ')+')');
  // tap a solved ticket and see the answer
  await p.click('#spTiles .sptile[data-i="0"]'); await p.waitForTimeout(80);
  const peek=await p.evaluate(()=>({hidden:document.getElementById('spPeek').hidden, text:document.getElementById('spPeek').textContent}));
  ok(!peek.hidden && /konnichiwa/.test(peek.text),'tapping a ticket shows what it was ('+peek.text+')');
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
  const r=await p.evaluate(()=>({state:window.__kl.SP.state, sub:document.getElementById('spDoneSub').textContent}));
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

await b.close();
console.log('\n'+(fails.length? 'FAILED: '+fails.length+'\n  '+fails.join('\n  ') : 'SPEAKING GRADES BOTH DIRECTIONS, NO CLICKS NEEDED'));
process.exit(fails.length?1:0);
})();
