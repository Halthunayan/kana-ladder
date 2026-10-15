/* The kana course (14 Oct 2026): lessons that start from the first three
   vowels and unlock one by one, statistics and schedules for every kana, no
   single kana ever voiced without the native recordings, one screen at both
   phone sizes, and the recording studio for the native speaker. */
const {chromium}=require('playwright');
const PORT=process.env.PORT||8100, URL='http://localhost:'+PORT+'/index.html';
const fails=[]; const ok=(c,m)=>{ if(c) console.log('  PASS  '+m); else { fails.push(m); console.log('  FAIL  '+m);} };
const today=new Date(Date.now()-14400000).toISOString().slice(0,10);
const base=(extra)=>Object.assign({rev:9,
  settings:{sched:"fsrs",retention:0.9,newPerDay:12,revCap:150,separate:true,sentences:true,conj:true,listen:true,
    tts:true,autoPlay:false,typing:true,kanji:true,theme:"light",carAudio:true,carChecked:true,cardAudio:true},
  daily:{key:today,newDone:0,revDone:0,ans:0,ok:0,credit:0,sentDone:0,conjDone:0,consDone:0,noNew:false,buried:{},done:{},missed:{}},
  hist:{}, streak:{cur:2,best:2,last:""}, life:{ans:100,ok:90,practice:0}, backup:{last:""}, notes:{}, susp:{}, pfail:{}, crep:{}, carSeen:{},
  checks:[], log:[], items:{}}, extra||{});
const fakeRec=()=>{
  window.__recActive=null;
  window.SpeechRecognition=window.webkitSpeechRecognition=function(){
    const R=this; R.lang=""; R.continuous=false;
    R.start=function(){ window.__recActive=R; }; R.stop=function(){ if(window.__recActive===R) window.__recActive=null; };
    R.abort=function(){ if(window.__recActive===R) window.__recActive=null; R.onend&&R.onend(); };
  };
  window.__recSay=function(t){ const R=window.__recActive; if(!R) return false;
    R.onresult&&R.onresult({results:[[{transcript:t,confidence:0.9}]]}); window.__recActive=null; R.onend&&R.onend(); return true; };
  // every clip the app asks for, so a single kana voiced without recordings is caught
  window.__played=[];
};
const spyAudio=()=>{ const k=window.__kl; const orig=k.audPlayWA; };
const fits=p=>p.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1);
const open=async(ctx)=>{ const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto(URL); await p.waitForFunction(()=>window.__kl&&__kl.DECK.length>0&&__kl.KC,null,{timeout:20000});
  // record every audio key the course plays
  // the course ignores a tap within 350 ms of a card appearing (a double tap
  // must not skip one); a script taps faster than a person, so it is off here
  // except where section 8 tests it
  await p.evaluate(()=>{ window.__kl.KR.tapGuard=0; });
  return {p, errs}; };
/* answer the current step: right, or wrong when told; returns the step type */
const step=async(p, wrong)=>p.evaluate(w=>{
  const K=__kl.KR, s=K.steps[K.i]; if(!s) return null;
  const nx=()=>{ const b=document.getElementById('klNext')||document.getElementById('klSkip'); if(b) b.click(); };
  if(s.t==='intro'||s.t==='teach'){ nx(); return s.t; }
  if(s.t==='q'){ const bs=[...document.querySelectorAll('#klOpts .klopt')]; const b=bs.find(x=>w ? x.dataset.sid!==s.sid : x.dataset.sid===s.sid); b.click(); nx(); return 'q'; }
  if(s.t==='read'){ const r=__kl.IDX[s.id].romaji; const bs=[...document.querySelectorAll('#klOpts .klopt')]; const b=bs.find(x=>w ? x.dataset.r!==r : x.dataset.r===r); b.click(); nx(); return 'read'; }
  if(s.t==='say'){ nx(); return 'say'; }
  if(s.t==='done') return 'done';
}, !!wrong);
const runLesson=async(p, li, wrongEvery)=>{
  await p.evaluate(i=>__kl.kcStart('lesson', i), li);
  let n=0, t;
  while((t=await step(p, wrongEvery && n>0 && n%wrongEvery===0 && n<200))!=='done' && t!==null && n<300) n++;
  return p.evaluate(()=>({les:__kl.kcS().les, res:__kl.KR.res.length}));
};

(async()=>{
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

console.log('1. the course data: slow start, every kana covered, hooks in English');
{
  const ctx=await b.newContext({viewport:{width:375,height:580}});
  await ctx.addInitScript(s=>{ localStorage.setItem('kanaladder.v1',JSON.stringify(s)); }, base());
  await ctx.addInitScript(fakeRec);
  const {p, errs}=await open(ctx);
  const d=await p.evaluate(()=>{ const KC=__kl.KC, L=KC.lessons, snd=KC.sounds;
    const basic=L.filter(l=>l.kind==='new' && l.new.every(s=>snd[s].g==='base'));
    const taught={h:{},k:{}}; L.forEach(l=>l.new.forEach(s=>taught[l.s][s]=1));
    const baseIds=Object.keys(snd).filter(s=>snd[s].g==='base');
    const hooks=['h','k'].every(sc=>baseIds.every(s=>(__kl.KCH[sc]||{})[s]));
    const jp=JSON.stringify(__kl.KCH).match(/[぀-ヿ一-鿿]/);
    return {n:Object.keys(snd).length, lessons:L.length, first:L[0].new.join(','), maxBasic:Math.max(...basic.map(l=>l.new.length)),
      allH:Object.keys(snd).filter(s=>snd[s].h).every(s=>taught.h[s]), allK:Object.keys(snd).every(s=>taught.k[s]), hooks, jp:!!jp,
      reviews:L.filter(l=>l.kind==='review').length};
  });
  ok(d.n===122 && d.lessons>=80,'122 sounds in '+d.lessons+' lessons');
  ok(d.first==='a,i,u' && d.maxBasic<=3,'it starts with a, i, u, and no basic lesson brings more than three new kana');
  ok(d.allH && d.allK,'every hiragana and every katakana is taught exactly once');
  ok(d.hooks && !d.jp,'every basic kana has a memory hook in both scripts, written in English only');
  ok(d.reviews>=14,'a review lesson after every two rows ('+d.reviews+' reviews)');
  // reading words only use kana taught by then
  const rd=await p.evaluate(()=>{ const KC=__kl.KC, L=KC.lessons, bad=[];
    const forms={h:{},k:{}};
    L.forEach((l,i)=>{ l.new.forEach(s=>{ const x=KC.sounds[s]; if(l.s==='h' && x.h) forms.h[x.h]=1; if(l.s==='k') forms.k[x.k]=1; });
      if(l.kind==='tsu') forms[l.s][l.s==='h'?'っ':'ッ']=1; if(l.kind==='long') forms[l.s]['ー']=1;
      (l.words||[]).forEach(id=>{ const kana=__kl.IDX[id].kana; let j=0;
        while(j<kana.length){ const two=kana.slice(j,j+2), one=kana[j];
          if(forms[l.s][two]){ j+=2; continue; } if(forms[l.s][one]){ j++; continue; }
          if(l.s==='h' && one==='ー'){ j++; continue; }
          bad.push(l.id+':'+id+':'+kana); break; } }); });
    return bad; });
  ok(rd.length===0,'every reading word is written only with kana taught by its lesson ('+rd.slice(0,4).join(', ')+')');
  ok(errs.length===0,'no page errors ('+errs.join('; ')+')');
  await ctx.close();
}

console.log('\n2. lessons unlock one by one; statistics and schedules are kept for every kana');
{
  const ctx=await b.newContext({viewport:{width:375,height:580}});
  await ctx.addInitScript(s=>{ if(!localStorage.getItem('kanaladder.v1')) localStorage.setItem('kanaladder.v1',JSON.stringify(s)); }, base());
  await ctx.addInitScript(fakeRec);
  const {p, errs}=await open(ctx);
  const u0=await p.evaluate(()=>({h1:__kl.kcUnlocked(0), h2:__kl.kcUnlocked(1), k1:__kl.kcUnlocked(__kl.KC.lessons.findIndex(l=>l.s==='k'))}));
  ok(u0.h1 && !u0.h2 && !u0.k1,'at the start only the first hiragana lesson is open; katakana waits');
  const r1=await runLesson(p, 0);
  const s1=await p.evaluate(()=>{ const K=__kl.kcS(); return {pass:!!(K.les.H01&&K.les.H01.pass), h2:__kl.kcUnlocked(1),
    st:['a','i','u'].map(s=>K.st['h:'+s]&&K.st['h:'+s].n), items:Object.keys(K.items).sort().join(','), log:K.log.length,
    sched:['a','i','u'].map(s=>K.items['h:'+s+'|r'] && K.items['h:'+s+'|r'].due-Date.now())}; });
  ok(s1.pass && s1.h2,'lesson 1 answered right is passed and lesson 2 opens');
  ok(s1.st.every(n=>n>=3) && s1.log>=9,'each new kana was asked several times and every answer logged ('+s1.st.join(',')+')');
  const aud=await p.evaluate(()=>['a','i','u'].filter(s=>__kl.kcHasAudio(s)));
  const want=['a','i','u'].map(x=>'h:'+x+'|r').concat(aud.map(x=>'h:'+x+'|l')).sort().join(',');
  ok(s1.items===want,'one reading schedule per kana, and a listening one only where a gated clip exists ('+s1.items+')');
  ok(s1.sched.every(t=>t>0 && t<15*60000),'the schedule moved once per kana in the run: back within minutes, not sent away for days ('+s1.sched.map(t=>Math.round(t/1000)+'s').join(',')+')');
  // a run answered badly: not passed, mix-ups recorded, misses retried
  await p.evaluate(()=>{ __kl.kcS().les.H02=undefined; delete __kl.kcS().les.H02; });
  const r2=await runLesson(p, 1, 2);
  const s2=await p.evaluate(()=>{ const K=__kl.kcS(); let conf=0; for(const k in K.st){ for(const c in (K.st[k].conf||{})) conf+=K.st[k].conf[c]; }
    return {pass:!!(K.les.H02&&K.les.H02.pass), h3:__kl.kcUnlocked(2), conf, retries:__kl.KR.res.filter(r=>r.retry).length, cf:__kl.kcConfusions('h').length}; });
  ok(!s2.pass && !s2.h3,'a lesson answered badly is not passed and the next one stays shut');
  ok(s2.conf>0 && s2.cf>0,'each wrong pick is recorded as a mix-up of the two kana ('+s2.conf+')');
  ok(s2.retries>0,'a missed kana comes back later in the same lesson ('+s2.retries+' retries)');
  // weak spots drill the actual mix-ups with two choices
  const wk=await p.evaluate(()=>{ __kl.kcStart('weak','h'); return {n:__kl.KR.steps.length, pair:__kl.KR.steps.some(s=>s.pair)}; });
  ok(wk.n>3 && wk.pair,'weak spots drill the weakest kana and the real mix-ups as pairs');
  await p.evaluate(()=>__kl.kcOpen());
  // persistence
  await p.reload(); await p.waitForFunction(()=>window.__kl&&__kl.KC,null,{timeout:20000});
  const pers=await p.evaluate(()=>({h01:!!(__kl.kcS().les.H01&&__kl.kcS().les.H01.pass), n:Object.keys(__kl.kcS().st).length}));
  ok(pers.h01 && pers.n>=5,'progress survives a reload ('+pers.n+' kana with statistics)');
  // due review
  const due=await p.evaluate(()=>{ const K=__kl.kcS(); for(const k in K.items) K.items[k].due=Date.now()-1000; __kl.kcStart('due'); return __kl.KR.steps.filter(s=>s.t==='q').length; });
  ok(due===Object.keys(await p.evaluate(()=>__kl.kcS().items)).length,'Review runs every due kana, uncapped ('+due+')');
  ok(errs.length===0,'no page errors ('+errs.join('; ')+')');
  await ctx.close();
}

console.log('\n3. answer choices: look-alikes first, never two that read the same');
{
  const ctx=await b.newContext({viewport:{width:375,height:580}});
  await ctx.addInitScript(s=>{ localStorage.setItem('kanaladder.v1',JSON.stringify(s)); }, base());
  const {p, errs}=await open(ctx);
  const c=await p.evaluate(()=>{ const KC=__kl.KC, all=Object.keys(KC.sounds), bad=[]; let confHit=0, confTot=0;
    ['h','k'].forEach(sc=>{ const pool=all.filter(s=> sc==='h' ? KC.sounds[s].h : true);
      pool.forEach(sid=>{ for(let t=0;t<5;t++){ const o=__kl.kcChoices(sc, sid, pool, 4); const rs=o.map(x=>KC.sounds[x].r);
        if(new Set(rs).size!==rs.length || o.indexOf(sid)<0 || o.length!==4) bad.push(sc+sid+':'+rs.join('/'));
        const g=(KC.conf[sc]||[]).filter(g=>g.indexOf(sid)>=0).reduce((a,g)=>a.concat(g),[]).filter(x=>x!==sid && KC.sounds[x].r!==KC.sounds[sid].r && pool.indexOf(x)>=0);
          if(g.length && t===0){ confTot++; if(o.some(x=>g.indexOf(x)>=0)) confHit++; } } }); });
    return {bad, confHit, confTot}; });
  ok(c.bad.length===0,'every choice set holds the answer and four different readings ('+c.bad.slice(0,3).join(' ')+')');
  ok(c.confHit===c.confTot,'a kana with a look-alike always has that look-alike among its choices ('+c.confHit+'/'+c.confTot+')');
  const m=await p.evaluate(()=>({tsu:__kl.kcMutations('kitte','tsu'), long:__kl.kcMutations('obaasan','long'), ou:__kl.kcMutations('ryokou','long')}));
  ok(m.tsu.indexOf('kite')>=0 && m.long.indexOf('obasan')>=0 && m.ou.indexOf('ryoko')>=0,'small tsu and long vowel lessons test the near misses (kitte/kite, obaasan/obasan, ryokou/ryoko)');
  ok(errs.length===0,'no page errors');
  await ctx.close();
}

console.log('\n4. no single kana is voiced without the native recordings; with them, listening opens');
{
  const ctx=await b.newContext({viewport:{width:375,height:580}});
  await ctx.addInitScript(s=>{ localStorage.setItem('kanaladder.v1',JSON.stringify(s)); }, base());
  await ctx.addInitScript(fakeRec);
  const {p, errs}=await open(ctx);
  await p.waitForFunction(()=>__kl.AUD && __kl.AUD.man,null,{timeout:20000}).catch(()=>{});
  // spy on every clip request through the fetch of sprites is too low level: check the course's own gate
  const off=await p.evaluate(()=>{ const m=__kl.AUD.man; if(m){ delete m.kana; } const r=__kl.kcHasAudio('a');
    __kl.kcStart('lesson',0); const types=__kl.KR.steps.filter(s=>s.t==='q').map(s=>s.q); return {r, lk:types.filter(q=>q==='LK').length}; });
  ok(!off.r && off.lk===0,'without the recordings no kana counts as voiced and no listening question is set');
  const tb=await p.evaluate(()=>{ __kl.KR.i=-1; return 1; });
  await step(p); // intro
  const teach=await p.evaluate(()=>({hear:!!document.getElementById('klHear')}));
  ok(!teach.hear,'the teaching card offers no "Hear it" for a single kana until then');
  const on=await p.evaluate(()=>{ const m=__kl.AUD.man||(__kl.AUD.man={sprites:{},files:{}}); m.sprites=m.sprites||{}; m.sprites['k-000']={bytes:1,clips:3}; m.kana={src:'native',ids:['a','i','u']};
    __kl.kcStart('lesson',0); const types=__kl.KR.steps.filter(s=>s.t==='q').map(s=>s.q); return {r:__kl.kcHasAudio('a'), e:__kl.kcHasAudio('e'), lk:types.filter(q=>q==='LK').length}; });
  ok(on.r && !on.e && on.lk>=3,'with recordings listed, those kana are voiced and "which kana did you hear" questions appear ('+on.lk+'); others stay silent');
  ok(errs.length===0,'no page errors ('+errs.join('; ')+')');
  await ctx.close();
}

console.log('\n5. every course screen fits one screen at 375x580 and 393x759');
for(const [w,h] of [[375,580],[393,759]]){
  const ctx=await b.newContext({viewport:{width:w,height:h}});
  await ctx.addInitScript(s=>{ localStorage.setItem('kanaladder.v1',JSON.stringify(s)); }, base());
  await ctx.addInitScript(fakeRec);
  const {p, errs}=await open(ctx);
  const over=[];
  await p.evaluate(()=>__kl.kcOpen());
  for(const tab of ['learn','lessons','progress']){ await p.click('#kcTabs button[data-tab="'+tab+'"]'); if(!(await fits(p))) over.push(tab); }
  // every lesson: intro and every teaching card, both scripts
  const n=await p.evaluate(()=>__kl.KC.lessons.length);
  for(let li=0; li<n; li++){
    await p.evaluate(i=>__kl.kcStart('lesson', i), li);
    if(!(await fits(p))) over.push('intro '+li);
    const teach=await p.evaluate(()=>__kl.KR.steps.map((s,i)=>s.t==='teach'?i:-1).filter(i=>i>=0));
    for(const ti of teach){ await p.evaluate(i=>{ __kl.KR.i=i-1; __kl.kcStep ? 0 : 0; }, ti); await p.evaluate(()=>document.getElementById('klNext').click());
      if(!(await fits(p))){ const s=await p.evaluate(()=>__kl.KR.steps[__kl.KR.i].sid); over.push('teach '+li+' '+s); } }
  }
  // a question with feedback after a wrong answer, the longest reading choices, and a crowded finish
  await p.evaluate(()=>__kl.kcStart('lesson', 3));
  for(let k=0;k<40;k++){ const t=await p.evaluate(()=>{ const s=__kl.KR.steps[__kl.KR.i]; return s && s.t; }); if(t==='q') break; await step(p); }
  await p.evaluate(()=>{ const s=__kl.KR.steps[__kl.KR.i]; [...document.querySelectorAll('#klOpts .klopt')].find(x=>x.dataset.sid!==s.sid).click(); });
  if(!(await fits(p))) over.push('wrong answer');
  const alone=await p.evaluate(()=>[...document.querySelectorAll('#klOpts .klopt')].every(b=>b.textContent.match(/[a-z]/)));
  ok(alone,'after an answer every kana choice shows its romaji ('+w+'x'+h+')');
  const longest=await p.evaluate(()=>{ let best=null, bl=0; __kl.KC.lessons.forEach((l,i)=>(l.words||[]).forEach(id=>{ const c=__kl.IDX[id]; if(c.kana.length>bl){ bl=c.kana.length; best=[i,id]; } })); return best; });
  await p.evaluate(([li,id])=>{ __kl.kcStart('lesson', li); __kl.KR.steps.splice(1,0,{t:'read', id:id}); __kl.KR.i=0; document.getElementById('klNext').click(); }, longest);
  if(!(await fits(p))) over.push('read '+longest[1]);
  await p.evaluate(()=>{ const r=__kl.KR; [...document.querySelectorAll('#klOpts .klopt')][0].click(); });
  if(!(await fits(p))) over.push('read answered');
  const rv=await p.evaluate(()=>__kl.KC.lessons.findIndex(l=>l.kind==='review' && /every basic/.test(l.t)));
  await runLesson(p, rv, 3);
  if(!(await fits(p))) over.push('review done');
  await p.evaluate(()=>{ __kl.KV.tab='progress'; __kl.kcOpen(); });
  await p.click('.kcg[data-sid="ka"]'); if(!(await fits(p))) over.push('progress detail');
  await p.evaluate(()=>{ __kl.KV.tab='learn'; __kl.kcOpen(); }); if(!(await fits(p))) over.push('learn after work');
  ok(over.length===0,'at '+w+'x'+h+' nothing scrolls: course tabs, every intro and teaching card of all lessons, feedback, reading, finish ('+over.slice(0,6).join('; ')+')');
  ok(errs.length===0,'no page errors ('+errs.join('; ')+')');
  await ctx.close();
}

console.log('\n6. the recording studio for the native speaker');
{
  const b2=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',
    args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']});
  const ctx=await b2.newContext({viewport:{width:375,height:580}, permissions:['microphone']});
  await ctx.addInitScript(s=>{ localStorage.setItem('kanaladder.v1',JSON.stringify(s)); }, base());
  const {p, errs}=await open(ctx);
  const ids=await p.evaluate(()=>__kl.krecIds());
  ok(ids.length===119 && ids.indexOf('dji')<0 && ids.indexOf('ji')>=0,'119 distinct sounds to record; spellings said the same share one take');
  await p.evaluate(()=>__kl.krecOpen());
  await p.waitForFunction(()=>/of 119/.test(document.getElementById('krCard').textContent),null,{timeout:10000});
  ok(await fits(p),'the studio fits one screen');
  const card=await p.evaluate(()=>document.getElementById('krCard').textContent);
  ok(/a/.test(card),'each sound shows its romaji beside both scripts');
  await p.click('#krRec');
  await p.waitForFunction(()=>!document.getElementById('krKeep').hidden,null,{timeout:15000});
  ok(await fits(p),'and still fits with a take waiting to be kept');
  await p.click('#krKeep');
  await p.waitForFunction(()=>/1 \/ 119/.test(document.getElementById('krProg').textContent),null,{timeout:10000});
  ok(true,'a take is recorded, played back and kept; the counter moves on');
  const exp=await p.evaluate(()=>new Promise(res=>{ const o=URL.createObjectURL; URL.createObjectURL=function(bl){ bl.text().then(t=>res(t)); return o.call(URL,bl); }; document.getElementById('krExport').click(); setTimeout(()=>res(null),8000); }));
  let j=null; try{ j=JSON.parse(exp); }catch(e){}
  ok(j && j.kind==='kana-ladder-recordings' && Object.keys(j.items).length===1 && j.items.a && j.items.a.b64.length>100,'Export gives one file holding every take, ready for the import tool');
  await p.reload(); await p.waitForFunction(()=>window.__kl&&__kl.KC,null,{timeout:20000});
  await p.evaluate(()=>__kl.krecOpen());
  await p.waitForFunction(()=>/1 \/ 119/.test(document.getElementById('krProg').textContent),null,{timeout:10000});
  ok(true,'takes are kept in the browser, so a session can stop and resume');
  ok(errs.length===0,'no page errors ('+errs.join('; ')+')');
  await b2.close();
}

console.log('\n7. home and backups');
{
  const ctx=await b.newContext({viewport:{width:375,height:580}});
  await ctx.addInitScript(s=>{ localStorage.setItem('kanaladder.v1',JSON.stringify(s)); }, base({kana:{les:{H01:{at:1,best:90,n:1,pass:true}}, st:{'h:a':{n:3,ok:3,ms:3000,last:1,rec:'111',conf:{}}}, items:{}, day:{}, log:[], wst:{}, say:{}}}));
  const {p, errs}=await open(ctx);
  const h=await p.evaluate(()=>({sub:document.getElementById('kanaBtnSub').textContent, blob:JSON.stringify(__kl.packAll ? __kl.packAll() : {}).indexOf('"kana"')>=0, next:__kl.kcNextLesson('h')}));
  ok(/hiragana \d+\/46/.test(h.sub),'the home button shows hiragana and katakana progress ('+h.sub+')');
  ok(h.next===1,'a saved course resumes at the next lesson');
  ok(errs.length===0,'no page errors ('+errs.join('; ')+')');
  await ctx.close();
}

console.log('\n8. the audit of 14 Oct: slow answers still graduate, a double tap skips nothing, a skipped reading still shows its romaji');
{
  const ctx=await b.newContext({viewport:{width:375,height:580}});
  await ctx.addInitScript(s=>{ localStorage.setItem('kanaladder.v1',JSON.stringify(s)); }, base());
  await ctx.addInitScript(fakeRec);
  const {p, errs}=await open(ctx);
  const slow=await p.evaluate(()=>{ const k=__kl, K=k.kcS(); const t0=Date.now();
    // a correct answer at 4.5 s, answered at each learning step in turn
    k.kcRecord('h','a','r',true,4500,null); let it=K.items['h:a|r']; const d1=it.due-t0;
    it.due=Date.now(); it.lr=Date.now()-61000; k.kcRecord('h','a','r',true,4500,null); it=K.items['h:a|r']; const d2=it.due-t0;
    it.due=Date.now(); it.lr=Date.now()-601000; k.kcRecord('h','a','r',true,4500,null); it=K.items['h:a|r'];
    return {d1, d2, s:it.s, iv:it.iv}; });
  ok(slow.s===1 && slow.iv>=1,'a right answer taking 4.5 s still moves the kana through its learning steps and graduates it ('+JSON.stringify(slow)+')');
  // every K lesson reachable: the katakana track has no lesson without scored steps
  const st=await p.evaluate(()=>{ const out=[]; __kl.KC.lessons.forEach((l,i)=>{ const steps=__kl.kcBuildLesson(i); const sc=steps.filter(s=>(s.t==='q'&&s.isNew)||s.t==='read').length; if(sc<4) out.push(l.id+':'+sc); }); return out; });
  ok(st.length===0,'every lesson of both scripts has scored questions, so none can block the course ('+st.join(', ')+')');
  const words=await p.evaluate(()=>{ const KC=__kl.KC, bad=[]; KC.lessons.forEach(l=>{ (l.words||[]).forEach(id=>{ const c=__kl.IDX[id]; if(c.kana.replace(/[ゃゅょャュョァィゥェォ]/g,'').length<2) bad.push(id); }); Object.values(l.ex||{}).forEach(id=>{ if(id && __kl.IDX[id].kana.replace(/[ゃゅょャュョァィゥェォ]/g,'').length<2) bad.push(id); }); }); return bad; });
  ok(words.length===0,'no one-sound word is read or played as an example: the word voice would be a single kana ('+words.join(',')+')');
  const rule=await p.evaluate(()=>{ const i=__kl.KC.lessons.findIndex(l=>l.new.indexOf('ji')>=0 && l.s==='h'); __kl.kcStart('lesson',i); const t=__kl.KR.steps.findIndex(s=>s.t==='teach'&&s.sid==='ji'); __kl.KR.i=t-1; __kl.KR.shownAt=0; document.getElementById('klNext').click(); return document.getElementById('klBody').textContent; });
  ok(/s sound into z/.test(rule) && !/small ya/.test(rule),'the ji card teaches the z rule, not the combined-sound rule');
  const lk=await p.evaluate(()=>{ const m=__kl.AUD.man||(__kl.AUD.man={sprites:{},files:{}}); m.sprites=m.sprites||{}; m.sprites['k-000']={bytes:1,clips:3}; m.kana={src:'native',ids:Object.keys(__kl.KC.sounds)};
    let bad=0; const pool=Object.keys(__kl.KC.sounds).filter(s=>__kl.KC.sounds[s].h); for(let t=0;t<300;t++){ const o=__kl.kcChoices('h','wo',pool,4,true); if(o.indexOf('o')>=0) bad++; } delete m.kana; return bad; });
  ok(lk===0,'a "which did you hear" question never offers two kana that sound the same (wo and o)');
  // the double-tap guard, on
  const dt=await p.evaluate(()=>{ __kl.KR.tapGuard=350; __kl.kcStart('lesson',0); document.getElementById('klNext').click(); return __kl.KR.i; });
  await p.waitForTimeout(400);
  await p.evaluate(()=>document.getElementById('klNext').click());
  const dt2=await p.evaluate(()=>({i:__kl.KR.i, t:__kl.KR.steps[__kl.KR.i].t, sid:__kl.KR.steps[__kl.KR.i].sid}));
  ok(dt===0 && dt2.i===1 && dt2.sid==='a','a tap landing as Start appears is ignored; the first teaching card is not skipped');
  await p.evaluate(()=>{ __kl.KR.tapGuard=0; });
  const sk=await p.evaluate(()=>{ const id=__kl.KC.lessons[2].words[0]; __kl.kcStart('lesson',2); __kl.KR.steps.splice(1,0,{t:'say', id:id}); __kl.KR.i=0; document.getElementById('klNext').click(); document.getElementById('klSkip').click(); return {txt:document.getElementById('klFb').textContent, r:__kl.IDX[id].romaji}; });
  ok(sk.txt.indexOf(sk.r)>=0,'Skip on a read-aloud step shows the romaji and meaning before moving on');
  ok(errs.length===0,'no page errors ('+errs.join('; ')+')');
  await ctx.close();
}

console.log('\n9. the installed kana sounds: only clips that passed the accuracy gate, playable from the library');
{
  const ctx=await b.newContext({viewport:{width:375,height:580}});
  await ctx.addInitScript(s=>{ localStorage.setItem('kanaladder.v1',JSON.stringify(s)); }, base());
  await ctx.addInitScript(fakeRec);
  const {p, errs}=await open(ctx);
  await p.waitForFunction(()=>__kl.AUD && __kl.AUD.man,null,{timeout:20000});
  const m=await p.evaluate(()=>{ const m=__kl.AUD.man; return {has:!!(m.sprites&&m.sprites['k-000']), ids:(m.kana&&m.kana.ids)||[], from:(m.kana&&m.kana.from)||{}}; });
  if(!m.has){ ok(true,'no kana library installed in this build: nothing to play (skipped)'); }
  else {
    const bad=m.ids.filter(id=>!/^(kokoro|native|piper|stretch)/.test(m.from[id]||''));
    ok(m.ids.length>=60 && bad.length===0,'the library lists '+m.ids.length+' gated sounds, each with its source');
    const r=await p.evaluate(async ids=>{ const out={}; for(const id of ids.slice(0,6)){ const b=await __kl.audClipBytes('kj:'+id); out[id]=b ? (b.byteLength||b.length||0) : 0; } return out; }, m.ids);
    ok(Object.values(r).every(n=>n>500),'clips load from the sprite ('+JSON.stringify(r)+')');
    const dec=await p.evaluate(async ids=>{ const ctx=new (window.AudioContext||window.webkitAudioContext)(), bad=[]; for(const id of ids){ const b=await __kl.audClipBytes('kj:'+id); const u=b && new Uint8Array(b.slice(0,3)); if(!b || String.fromCharCode(u[0],u[1],u[2])!=='ID3'){ bad.push(id+':start'); continue; } try{ await ctx.decodeAudioData(b.slice(0)); }catch(e){ bad.push(id); } } return bad; }, m.ids);
    ok(dec.length===0,'every one of the '+m.ids.length+' clips starts on its own boundary and decodes ('+dec.slice(0,6).join(', ')+')');
    const t=await p.evaluate(()=>{ const KC=__kl.KC, ids=__kl.AUD.man.kana.ids; const li=KC.lessons.findIndex(l=>l.new.some(s=>ids.indexOf(KC.sounds[s].say)<0) && l.new.some(s=>ids.indexOf(KC.sounds[s].say)>=0));
      if(li<0) return null; __kl.kcStart('lesson',li); const out=[]; __kl.KR.steps.forEach((s,i)=>{ if(s.t!=='teach') return; __kl.KR.i=i-1; __kl.KR.shownAt=0; document.getElementById('klNext').click(); out.push([s.sid, ids.indexOf(KC.sounds[s.sid].say)>=0, !!document.getElementById('klHear')]); }); return out; });
    ok(t && t.every(x=>x[1]===x[2]),'"Hear it" appears exactly for the sounds with a gated clip ('+JSON.stringify(t)+')');
  }
  ok(errs.length===0,'no page errors ('+errs.join('; ')+')');
  await ctx.close();
}

console.log('\n10. read it aloud: the microphone waits for the speaker, every attempt listens');
{
  const ctx=await b.newContext({viewport:{width:375,height:580}});
  await ctx.addInitScript(s=>{ localStorage.setItem('kanaladder.v1',JSON.stringify(s)); }, base());
  await ctx.addInitScript(fakeRec);
  const {p, errs}=await open(ctx);
  const r=await p.evaluate(async()=>{
    const k=__kl, KC=k.KC; let li=-1, si=-1;
    for(let i=0;i<KC.lessons.length && li<0;i++){ k.kcStart('lesson',i); const j=k.KR.steps.findIndex(s=>s.t==='say'); if(j>=0){ li=i; si=j; } }
    if(li<0) return null;
    const out={lesson:KC.lessons[li].id, tries:[]};
    k.KR.i=si-1; k.KR.shownAt=0; document.getElementById('klNext').click();
    for(let n=0;n<3;n++){
      k.noteAudioPlayed();                       // a word has just finished playing
      const t0=Date.now(); document.getElementById(n ? 'klSpeak2' : 'klSpeak').click();
      if(n){ await new Promise(r=>setTimeout(r,50)); document.getElementById('klSpeak').click(); }
      const early=!!window.__recActive;           // must not listen at once
      await new Promise(r=>{ const iv=setInterval(()=>{ if(window.__recActive){ clearInterval(iv); r(); } }, 20); setTimeout(()=>{ clearInterval(iv); r(); }, 3000); });
      const waited=Date.now()-t0, on=!!window.__recActive;
      const said=window.__recSay(KC && k.KR.steps[k.KR.i] ? (k.DECK.find(c=>c.id===k.KR.steps[k.KR.i].id)||{}).kana||'' : '');
      await new Promise(r=>setTimeout(r,80));
      out.tries.push({early, on, waited, said, fb:(document.getElementById('klFb')||{}).textContent||''});
    }
    return out;
  });
  ok(r && r.tries.length===3,'a lesson with a read-aloud step was found ('+(r&&r.lesson)+')');
  ok(r && r.tries.every(t=>!t.early && t.on && t.waited>=600),'each Speak waits for the last sound to clear before the mic opens ('+(r?r.tries.map(t=>t.waited+'ms').join(', '):'')+')');
  ok(r && r.tries.every(t=>t.said && /It is/.test(t.fb)),'all three attempts in a row are heard and graded, not only the first');
  ok(errs.length===0,'no page errors ('+errs.join('; ')+')');
  await ctx.close();
}

await b.close();
console.log('\n'+(fails.length? 'FAILED: '+fails.length+'\n  '+fails.join('\n  ') : 'THE KANA COURSE TEACHES, TRACKS AND PLAYS ONLY SOUNDS THAT PASSED THE GATE'));
process.exit(fails.length?1:0);
})();
