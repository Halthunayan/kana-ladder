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

/* a recogniser that answers with whatever the test scripted next */
const fakeRec=()=>{
  window.__recScript=[]; window.__recStarts=0; window.__recLangs=[];
  window.SpeechRecognition=window.webkitSpeechRecognition=function(){
    const R=this; R.lang=""; R.start=function(){ window.__recStarts++; window.__recLangs.push(R.lang);
      const next=window.__recScript.shift();
      setTimeout(function(){
        if(next===undefined){ R.onerror&&R.onerror({error:'no-speech'}); R.onend&&R.onend(); return; }
        if(next===null){ R.onerror&&R.onerror({error:'not-allowed'}); R.onend&&R.onend(); return; }
        const alts=(Array.isArray(next)?next:[next]).map(t=>({transcript:t,confidence:0.9}));
        R.onresult&&R.onresult({results:[alts]}); R.onend&&R.onend();
      },60); };
    R.stop=function(){}; R.abort=function(){};
  };
  window.__spoke=[];
  window.SpeechSynthesisUtterance=function(t){this.text=t;this.rate=1;};
  try{ speechSynthesis.speak=u=>{ window.__spoke.push(u.text); setTimeout(()=>{u.onstart&&u.onstart(); u.onend&&u.onend();},5); }; speechSynthesis.cancel=()=>{}; }catch(e){}
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
    // three words, directions fixed by hand so the script below is deterministic
    k.SP.ids=['c0000','c0001','c0004']; k.SP.dir={c0000:'e',c0001:'j',c0004:'e'};
    k.SP.state={}; k.SP.cur=-1; k.SP.running=true; k.go('speak');
    // word0 (say こんにちは): wrong, then right. word1 (say "good morning"): right first try.
    // word2 (say さようなら): right first try.
    window.__recScript=['さようなら','こんにちは','good morning','さようなら'];
    k.spAsk(0);
  });
  await p.waitForFunction(()=>!document.getElementById('spDone').hidden,null,{timeout:20000});
  const r=await p.evaluate(()=>{ const k=window.__kl;
    const tiles=Array.prototype.map.call(document.querySelectorAll('#spTiles .sptile'),t=>t.className);
    return {starts:window.__recStarts, state:k.SP.state, head:document.getElementById('spDoneHead').textContent,
      sub:document.getElementById('spDoneSub').textContent, tiles:tiles};
  });
  ok(r.starts===4,'the phone listened four times: one retry, three first tries ('+r.starts+')');
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
    window.__recScript=['さようなら'];   // wrong, and nothing queued after it
    k.spAsk(0);
  });
  await p.waitForFunction(()=>window.__kl.SP.state[0]==='bad',null,{timeout:20000});
  const mid=await p.evaluate(()=>{
    const t=document.querySelector('#spTiles .sptile[data-i="0"]');
    return {cls:t.className, heard:document.getElementById('spHeard').textContent};
  });
  ok(/s-bad/.test(mid.cls),'the ticket is red right after the wrong answer ('+mid.cls+')');
  ok(/Not that/.test(mid.heard),'and it says the answer was not right');
  await p.evaluate(()=>{ window.__recScript=['こんにちは']; });
  await p.waitForFunction(()=>window.__kl.SP.state[0]==='good',null,{timeout:20000});
  ok(true,'and it retries the same word on its own until it is said correctly');
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

await b.close();
console.log('\n'+(fails.length? 'FAILED: '+fails.length+'\n  '+fails.join('\n  ') : 'SPEAKING GRADES BOTH DIRECTIONS, NO CLICKS NEEDED'));
process.exit(fails.length?1:0);
})();
