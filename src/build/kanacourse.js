/* ---------- Kana course (14 Oct 2026) ----------
   A course of its own for hiragana and katakana, built slow: two or three new
   kana per lesson for the basic rows, a review lesson after every two rows,
   and each lesson unlocks only when the one before it was answered well.

   Every kana is a sound item per script ("h:ka", "k:ka"). Its memory is kept
   twice: as a schedule (FSRS, through the same schedule() as the words) for
   reading it ("|r") and, once the native recordings are installed, for
   hearing it ("|l"); and as plain statistics (answers, right, speed, the last
   twelve results, which kana it was mixed up with), which drive the progress
   chart, the strengths and the weak spots.

   Audio for a single kana is played only from the native-speaker library
   (sprite k-000, listed in the manifest's "kana" entry). Until that is
   installed, no single kana is ever voiced: the synthetic voice gets about a
   third of them wrong on their own (u and n it cannot say at all), and a
   course that plays a wrong sound teaches it. Words keep the word library.

   Japanese is never shown without romaji except where reading it is the
   question; the answer, with romaji and English, follows at once. */
var KC=(function(){ var el=document.getElementById("kana-data"); try{ return el ? JSON.parse(el.textContent) : null; }catch(e){ return null; } })();
var KCH=(KC && KC.hooks) || {h:{}, k:{}, rules:{}, pairs:[]};
var KC_FAST_MS=3000, KC_PASS=0.8, KC_PASS_REVIEW=0.85;

function kcS(){
  if(!S.kana || typeof S.kana!=="object") S.kana={};
  var k=S.kana;
  ["items","st","les","day","wst","say"].forEach(function(f){ if(!k[f] || typeof k[f]!=="object" || Array.isArray(k[f])) k[f]={}; });
  if(!Array.isArray(k.log)) k.log=[];
  return k;
}
function kcSnd(sid){ return KC.sounds[sid]; }
function kcForm(s, sid){ var x=KC.sounds[sid]; return x ? (s==="h" ? x.h : x.k) : ""; }
function kcKey(s, sid){ return s+":"+sid; }
function kcScriptName(s){ return s==="h" ? "hiragana" : "katakana"; }
function kcLessonIdx(id){ for(var i=0;i<KC.lessons.length;i++) if(KC.lessons[i].id===id) return i; return -1; }

/* ---- the native recordings ---- */
function kcAudioIds(){
  var m=AUD && AUD.man;
  if(!m || !m.sprites || !m.sprites["k-000"] || !m.kana || !Array.isArray(m.kana.ids)) return null;
  return m.kana.ids;
}
function kcHasAudio(sid){ var ids=kcAudioIds(); return !!(ids && ids.indexOf(kcSnd(sid).say)>=0); }
function kcAnyAudio(){ var ids=kcAudioIds(); return !!(ids && ids.length); }
/* A single kana has no fallback voice, so it plays whatever the "pre-rendered
   voice" setting says (that setting chooses between the library and the
   phone's own voice for words, and the phone's voice is never used for a
   single kana). On iPhone the audio session is asked for playback first, so
   the ring/silent switch does not mute it. */
function kcSession(t){ try{ if(navigator.audioSession) navigator.audioSession.type=t; }catch(e){} }
function kcPlayClip(key){
  kcSession("playback");
  return audManifestReady().then(function(m){
    var sp=m && audSpriteFor(key); if(!sp) return false;
    return audLoad(sp).then(function(s){
      if(!s || !s.idx[key]) return false;
      var r=s.idx[key]; audNote(key);
      return audPlayBytesWA(s.buf.slice(r[0], r[0]+r[1]));
    });
  }).catch(function(){ return false; });
}
function kcPlaySound(sid){
  if(!kcHasAudio(sid)) return Promise.resolve(false);
  return Promise.race([kcPlayClip("kj:"+kcSnd(sid).say), wait(4000).then(function(){ return false; })]);
}
function kcPlayWord(id){
  var c=IDX[id]; if(!c) return Promise.resolve(false);
  return Promise.race([audPlayWA("wj:"+id), wait(5000).then(function(){ return false; })]);
}

/* ---- what he knows ---- */
/* the lessons he has finished, in order; the kana taught in them */
function kcDone(id){ var l=kcS().les[id]; return !!(l && l.at); }
function kcPassed(id){ var l=kcS().les[id]; return !!(l && l.pass); }
function kcTaught(s, uptoIdx){
  var out=[], seen={};
  for(var i=0;i<KC.lessons.length;i++){
    var L=KC.lessons[i]; if(L.s!==s) continue;
    if(uptoIdx!=null ? i>uptoIdx : !kcDone(L.id)) continue;
    L.new.forEach(function(sid){ if(!seen[sid]){ seen[sid]=1; out.push(sid); } });
  }
  return out;
}
/* katakana opens once the basic hiragana review is passed */
var KC_K_GATE=(function(){ if(!KC) return null; for(var i=0;i<KC.lessons.length;i++){ var L=KC.lessons[i]; if(L.s==="h" && L.kind==="review" && /every basic/.test(L.t)) return L.id; } return null; })();
function kcUnlocked(i){
  var L=KC.lessons[i]; if(!L) return false;
  if(kcDone(L.id)) return true;
  var prev=null; for(var j=i-1;j>=0;j--) if(KC.lessons[j].s===L.s){ prev=KC.lessons[j]; break; }
  if(!prev) return L.s==="h" ? true : kcPassed(KC_K_GATE);
  return kcPassed(prev.id);
}
function kcNextLesson(s){
  for(var i=0;i<KC.lessons.length;i++){ var L=KC.lessons[i]; if(s && L.s!==s) continue; if(!kcPassed(L.id) && kcUnlocked(i)) return i; }
  return -1;
}
function kcStat(s, sid){ return kcS().st[kcKey(s,sid)] || null; }
function kcAcc(st, n){ if(!st || !st.rec) return null; var r=st.rec.slice(-(n||10)); if(!r.length) return null; var k=0; for(var i=0;i<r.length;i++) if(r[i]==="1") k++; return k/r.length; }
function kcAvgMs(st){ return st && st.n ? st.ms/st.n : null; }
/* 0 not taught, 1 learning, 2 known, 3 strong */
function kcMastery(s, sid){
  var st=kcStat(s, sid); if(!st || !st.n) return 0;
  var it=kcS().items[kcKey(s,sid)+"|r"], a5=kcAcc(st,5), a10=kcAcc(st,10), ms=kcAvgMs(st);
  var grad = it && it.s===1, iv = it ? (it.iv||0) : 0;
  if(grad && iv>=14 && a10>=0.9 && ms<2500) return 3;
  if(grad && a5>=0.8) return 2;
  return 1;
}
/* weakness: recent misses, slowness and mix-ups, 0 (fine) and up */
function kcWeakness(s, sid){
  var st=kcStat(s, sid); if(!st || !st.n) return 0;
  var a=kcAcc(st,10), ms=kcAvgMs(st)||0, conf=0; for(var c in (st.conf||{})) conf+=st.conf[c];
  return (1-(a==null?1:a))*3 + Math.max(0, (ms-2000)/2000) + Math.min(2, conf*0.25);
}
function kcDueItems(now){
  var K=kcS(), out=[], aud=kcAnyAudio();
  for(var k in K.items){
    var it=K.items[k]; if(!(it.due<=now)) continue;
    var p=k.split("|"), dir=p[1], ss=p[0].split(":");
    if(dir==="l" && !kcHasAudio(ss[1])) continue;
    if(!KC.sounds[ss[1]]) continue;
    out.push({s:ss[0], sid:ss[1], dir:dir, due:it.due});
  }
  out.sort(function(a,b){ return a.due-b.due; });
  return out;
}

/* ---- recording an answer ---- */
/* The schedule moves once per kana and direction per run: answering it four
   times inside one lesson must not walk it through every learning step in
   three minutes and send it away for days. Later answers in the same run
   still count in the statistics. */
function kcRecord(s, sid, dir, ok, ms, picked, noSched){
  var K=kcS(), key=kcKey(s,sid), now=Date.now(); ms=Math.max(0, Math.min(ms||0, 15000));
  var st=K.st[key] || (K.st[key]={n:0, ok:0, ms:0, last:0, rec:"", conf:{}, first:now});
  st.n++; if(ok) st.ok++; st.ms+=ms; st.last=now; st.rec=(st.rec+(ok?"1":"0")).slice(-12);
  if(!ok && picked && picked!==sid){ st.conf=st.conf||{}; st.conf[picked]=(st.conf[picked]||0)+1; }
  var ik=key+"|"+dir, it=K.items[ik] || newItem();
  // right is Good and wrong is Again, however long it took: a slow but sure
  // beginner must still move a kana on (Hard never leaves a learning step).
  // Speed is kept for the statistics and the weak-spot ranking.
  if(!noSched) K.items[ik]=schedule(it, ok ? 2 : 0, now);
  var dk=dayKey(now), dd=K.day[dk] || (K.day[dk]=[0,0,0]); dd[0]++; if(ok) dd[1]++; dd[2]+=ms;
  K.log.push([Math.round(now/1000), key, dir, ok?1:0, Math.round(ms), picked||""]);
  if(K.log.length>4000) K.log.splice(0, K.log.length-4000);
  save();
}

/* ---- questions ---- */
/* choices for one kana: its look-alikes first, then others he has learned,
   never two that read the same (ji and its rare spelling) */
function kcChoices(s, sid, pool, n, bySound){
  var out=[sid], used={}, said={}; used[kcSnd(sid).r]=1; said[kcSnd(sid).say]=1;
  var conf=[]; (KC.conf[s]||[]).forEach(function(g){ if(g.indexOf(sid)>=0) conf=conf.concat(g); });
  var cand=shuffle(conf.filter(function(x){ return x!==sid && pool.indexOf(x)>=0; }))
    .concat(shuffle(pool.filter(function(x){ return x!==sid; })));
  for(var i=0;i<cand.length && out.length<n;i++){
    var c=cand[i]; if(!KC.sounds[c] || !kcForm(s,c)) continue;
    var r=kcSnd(c).r, sy=kcSnd(c).say; if(used[r] || (bySound && said[sy])) continue; used[r]=1; said[sy]=1; out.push(c);
  }
  return shuffle(out);
}
/* reading a word: the right romaji among others of words he could also read */
function kcWordChoices(id, pool, kind){
  var c=IDX[id], t=c.romaji, out=[t], seen={}; seen[t]=1;
  if(kind==="tsu" || kind==="long"){
    var muts=kcMutations(t, kind);
    shuffle(muts).forEach(function(m){ if(out.length<4 && !seen[m]){ seen[m]=1; out.push(m); } });
  }
  var others=shuffle(pool.filter(function(x){ return x!==id && IDX[x]; }))
    .sort(function(a,b){ return Math.abs(IDX[a].romaji.length-t.length)-Math.abs(IDX[b].romaji.length-t.length); });
  for(var i=0;i<others.length && out.length<4;i++){ var r=IDX[others[i]].romaji; if(!seen[r]){ seen[r]=1; out.push(r); } }
  return shuffle(out);
}
/* the near misses a small tsu or a long vowel makes: kitte and kite */
function kcMutations(t, kind){
  var out=[];
  if(kind==="tsu"){
    var m=t.replace(/([bcdfghjkmprstwz])\1/, "$1"); if(m!==t) out.push(m);
    m=t.replace(/tch/, "ch"); if(m!==t) out.push(m);
    // and a doubling where the word has none, only where none is next to it
    var i=t.search(/[aeiou][kstp][aeiou]/); if(i>=0 && !/([bcdfghjkmprstwz])\1/.test(t.slice(Math.max(0,i-1), i+4))){ var j=i+1; out.push(t.slice(0,j)+t[j]+t.slice(j)); }
  } else {
    var a=t.replace(/(aa|ii|uu|ee|oo)/, function(x){ return x[0]; }); if(a!==t) out.push(a);
    a=t.replace(/ou/, "o"); if(a!==t) out.push(a);
    a=t.replace(/ei/, "e"); if(a!==t) out.push(a);
    var k=t.search(/(^|[^aeiou])[aeiou](?![aeiou])/); if(k>=0){ var v=k+(/[aeiou]/.test(t[k]) ? 0 : 1); out.push(t.slice(0,v+1)+t[v]+t.slice(v+1)); }
  }
  return out.filter(function(x){ return x && x!==t; });
}
/* deck words he can read by lesson i of script s */
function kcReadable(s, uptoIdx){
  var out=[];
  for(var i=0;i<KC.lessons.length && i<=uptoIdx;i++){ var L=KC.lessons[i]; if(L.s===s) out=out.concat(L.words||[]); }
  return out.filter(function(id){ return !!IDX[id]; });
}

/* ---- a run: one lesson, a review of what is due, or weak spots ---- */
var KR={on:false, mode:"", L:null, li:-1, s:"h", steps:[], i:-1, t0:0, res:[], gen:0, answered:false, retries:{}, sched:{}, tapGuard:350, shownAt:0};
function kcStart(mode, arg){
  if(!KC){ toast("The kana course did not load."); return; }
  try{ spStop(); }catch(e){} try{ listenCancel(); }catch(e){} audStop();
  // reset in place: other modules and the test handle hold this object
  Object.assign(KR, {on:true, mode:mode, L:null, li:-1, s:"h", steps:[], i:-1, t0:0, res:[], gen:(KR.gen||0)+1, answered:false, retries:{}, sched:{}, shownAt:0});
  if(mode==="lesson"){
    var i=arg; KR.li=i; KR.L=KC.lessons[i]; KR.s=KR.L.s; KR.steps=kcBuildLesson(i);
  } else if(mode==="due"){
    KR.steps=kcBuildDue();
  } else if(mode==="weak"){
    KR.s=arg||"h"; KR.steps=kcBuildWeak(KR.s);
  }
  if(!KR.steps.length){ toast(mode==="due" ? "Nothing is due. Come back later, or practise weak spots." : "Nothing to practise yet."); KR.on=false; return; }
  document.getElementById("tabs").classList.add("hide");
  go("klesson");
  kcStep();
}
function kcSpread(qs){
  // no kana twice in a row, so each answer is a fresh recall
  for(var k=0;k<4;k++){
    for(var i=1;i<qs.length;i++){
      if(qs[i].sid && qs[i].sid===qs[i-1].sid){
        for(var j=i+1;j<qs.length;j++){ if(qs[j].sid!==qs[i-1].sid && (j+1>=qs.length || qs[j+1].sid!==qs[i].sid)){ var t=qs[i]; qs[i]=qs[j]; qs[j]=t; break; } }
      }
    }
  }
  return qs;
}
function kcQType(sid, dirWanted){
  if(dirWanted==="l" || (dirWanted==null && kcHasAudio(sid) && Math.random()<0.34)) return "LK";
  return Math.random()<0.5 ? "KR" : "RK";
}
function kcBuildLesson(li){
  var L=KC.lessons[li], s=L.s, steps=[{t:"intro"}];
  var before=kcTaught(s, li-1), all=kcTaught(s, li);
  if(L.kind==="new"){
    L.new.forEach(function(sid, i){
      steps.push({t:"teach", sid:sid});
      if(i>0) steps.push({t:"q", q:"KR", sid:sid, pool:L.new.slice(0, i+1), check:true});
    });
    var qs=[];
    L.new.forEach(function(sid){
      qs.push({t:"q", q:"KR", sid:sid, isNew:true}, {t:"q", q:"RK", sid:sid, isNew:true});
      qs.push({t:"q", q:kcHasAudio(sid) ? "LK" : "KR", sid:sid, isNew:true});
    });
    var rv=before.slice().sort(function(a,b){ return kcWeakness(s,b)-kcWeakness(s,a); }).slice(0, Math.min(before.length, Math.ceil(qs.length*0.5)));
    rv.forEach(function(sid){ qs.push({t:"q", q:kcQType(sid), sid:sid}); });
    steps=steps.concat(kcSpread(shuffle(qs)));
  } else if(L.kind==="review"){
    // the eight weakest are always in, then up to four look-alike pairs he
    // has met, then a sample of the rest: 22 questions at most
    var pool=all.slice().sort(function(a,b){ return kcWeakness(s,b)-kcWeakness(s,a); });
    var q2=pool.slice(0, 8).map(function(sid){ return {t:"q", q:kcQType(sid), sid:sid, isNew:true}; });
    var pairs=[];
    (KC.conf[s]||[]).forEach(function(g){ var m=g.filter(function(x){ return all.indexOf(x)>=0; }); if(m.length>=2) pairs.push({t:"q", q:"KR", sid:m[Math.floor(Math.random()*m.length)], pool:m, pair:true, isNew:true}); });
    q2=q2.concat(shuffle(pairs).slice(0, 4));
    shuffle(pool.slice(8)).slice(0, 22-q2.length).forEach(function(sid){ q2.push({t:"q", q:kcQType(sid), sid:sid, isNew:true}); });
    steps=steps.concat(kcSpread(shuffle(q2)));
  }
  var words=(L.words||[]).slice();
  if(L.kind==="tsu" || L.kind==="long"){
    shuffle(words).slice(0, 7).forEach(function(id){ steps.push({t:"read", id:id, kind:L.kind, isNew:true}); });
  } else {
    var rd=words.length>=3 ? words : words.concat(shuffle(kcReadable(s, li).filter(function(x){ return words.indexOf(x)<0; })));
    shuffle(rd.slice(0, 12)).slice(0, L.kind==="review" ? 4 : 3).forEach(function(id){ steps.push({t:"read", id:id}); });
  }
  if(kcCanListen()){
    var sw=steps.filter(function(x){ return x.t==="read"; }).slice(0, 2);
    sw.forEach(function(x){ steps.push({t:"say", id:x.id}); });
  }
  steps.push({t:"done"});
  return steps;
}
function kcBuildDue(){
  var due=kcDueItems(Date.now()), steps=[{t:"intro"}];
  due.forEach(function(d){ steps.push({t:"q", q: d.dir==="l" ? "LK" : (Math.random()<0.5 ? "KR" : "RK"), sid:d.sid, s:d.s, sched:true}); });
  if(steps.length===1) return [];
  steps=[steps[0]].concat(kcSpread(steps.slice(1)));
  steps.push({t:"done"});
  return steps;
}
function kcBuildWeak(s){
  var taught=kcTaught(s); if(!taught.length) return [];
  var w=taught.slice().sort(function(a,b){ return kcWeakness(s,b)-kcWeakness(s,a); }).slice(0, 8);
  var steps=[{t:"intro"}], qs=[];
  w.forEach(function(sid){ qs.push({t:"q", q:kcQType(sid), sid:sid, s:s}, {t:"q", q:kcQType(sid), sid:sid, s:s}); });
  // a mix-up he actually makes, drilled with only the two of them as choices
  kcConfusions(s).slice(0, 3).forEach(function(p){ qs.push({t:"q", q:"KR", sid:p.a, s:s, pool:[p.a,p.b], pair:true}, {t:"q", q:"KR", sid:p.b, s:s, pool:[p.a,p.b], pair:true}); });
  steps=steps.concat(kcSpread(shuffle(qs)));
  steps.push({t:"done"});
  return steps;
}
function kcConfusions(s){
  var K=kcS(), out=[];
  for(var k in K.st){
    if(k.indexOf(s+":")!==0) continue;
    var sid=k.slice(2), c=K.st[k].conf||{};
    for(var o in c) out.push({a:sid, b:o, n:c[o]});
  }
  out.sort(function(x,y){ return y.n-x.n; });
  return out.filter(function(p){ return KC.sounds[p.b] && kcForm(s,p.b); });
}
function kcCanListen(){ return !!(window.SpeechRecognition || window.webkitSpeechRecognition) && typeof listenOnce==="function"; }

/* ---- the runner ---- */
function kcEl(id){ return document.getElementById(id); }
function kcProg(){
  var qs=KR.steps.filter(function(x){ return x.t!=="intro" && x.t!=="done"; }), n=0;
  for(var i=0;i<=KR.i && i<KR.steps.length;i++){ var t=KR.steps[i].t; if(t!=="intro" && t!=="done") n++; }
  kcEl("klProg").textContent = qs.length ? (Math.min(n, qs.length)+" / "+qs.length) : "";
  var bar=kcEl("klBar"); if(bar) bar.style.width = qs.length ? (100*Math.min(n,qs.length)/qs.length)+"%" : "0";
}
function kcStep(){
  if(Date.now()-(KR.shownAt||0)<KR.tapGuard) return;   // a double tap must not skip a card
  try{ listenCancel(); }catch(e){}
  KR.i++; KR.gen++; KR.answered=false; KR.shownAt=Date.now();
  var st=KR.steps[KR.i]; if(!st){ kcLeave(); return; }
  kcProg();
  var stage=kcEl("klStage"); stage.className="klstage kl-"+st.t;
  kcEl("klFoot").innerHTML="";
  ({intro:kcShowIntro, teach:kcShowTeach, q:kcShowQ, read:kcShowRead, say:kcShowSay, done:kcShowDone})[st.t](st);
}
function kcFoot(html){ kcEl("klFoot").innerHTML=html; }
function kcNextBtn(label){ kcFoot('<button class="btn" id="klNext">'+esc(label||"Next")+'</button>'); kcEl("klNext").onclick=kcStep; }
function kcRomajiOf(s, sid){ return kcSnd(sid).r; }
function kcShowIntro(){
  var b=kcEl("klBody"), h="";
  if(KR.mode==="lesson"){
    var L=KR.L;
    h+='<span class="chip dir-j">'+esc(kcScriptName(L.s))+' · lesson '+(kcLessonNo(KR.li))+'</span>';
    h+='<h2 class="kltitle">'+esc(L.t)+'</h2>';
    if(L.note) h+='<p class="klnote">'+esc(L.note)+'</p>';
    if(L.new.length){
      h+='<div class="klnewrow">'+L.new.map(function(sid){ return '<div class="klmini"><span class="kj">'+esc(kcForm(L.s,sid))+'</span><span class="kr">'+esc(kcSnd(sid).r)+'</span></div>'; }).join("")+'</div>';
      var rl=kcRuleFor(L); if(rl) h+='<p class="klnote fine">'+esc(rl)+'</p>';
    } else if(L.kind==="review"){
      h+='<p class="klnote fine">The '+esc(kcScriptName(L.s))+' met so far: your eight weakest always, the look-alikes side by side, a sample of the rest, then words to read.</p>';
    }
    var mute=L.new.filter(function(sid){ return !kcHasAudio(sid); });
    if(mute.length && L.new.length) h+='<p class="klnote fine">'+(mute.length===L.new.length ? 'These sounds are' : esc(mute.map(function(sid){ return kcSnd(sid).r; }).join(", "))+(mute.length===1 ? ' is' : ' are'))+' taught through words: no single-sound clip passed the accuracy checks.</p>';
  } else if(KR.mode==="due"){
    h+='<span class="chip dir-j">Kana review</span><h2 class="kltitle">'+(KR.steps.length-2)+' kana due</h2><p class="klnote">Each one is due because its memory is fading. Answer without rushing: being right decides when it comes back; speed only shows on the progress page.</p>';
  } else {
    h+='<span class="chip dir-j">Weak spots</span><h2 class="kltitle">Your weakest '+esc(kcScriptName(KR.s))+'</h2><p class="klnote">The kana you miss or answer slowly most, and the pairs you mix up, each with only the two of them as the choices.</p>';
  }
  b.innerHTML=h;
  kcNextBtn("Start");
}
function kcLessonNo(li){ var L=KC.lessons[li], n=0; for(var i=0;i<=li;i++) if(KC.lessons[i].s===L.s) n++; return n; }
function kcRuleFor(L){
  var x=kcSnd(L.new[0]), r=KCH.rules||{};
  if(!x || !x.rule) return "";
  var lines=[];
  if(x.g==="youon" && L.new[0]==="kya" && r["rule:youon"]) lines.push(r["rule:youon"]);
  if(x.g==="extended" && /^(ti|fa)$/.test(L.new[0]) && r["rule:extended"]) lines.push(r["rule:extended"]);
  if(r[x.rule]) lines.push(r[x.rule]);
  return lines.join(" ");
}
function kcHook(s, sid){ var t=(KCH[s]||{})[sid]; if(t) return t; var x=kcSnd(sid); return (x && x.rule && (KCH.rules||{})[x.rule]) || ""; }
function kcNote(s, sid){ var x=kcSnd(sid); return (s==="k" && x.note_k) ? x.note_k : (x.note||""); }
/* the look-alike tip for two kana he just confused, if there is one */
function kcPairTip(s, a, b){
  var ps=KCH.pairs||[];
  for(var i=0;i<ps.length;i++){ var p=ps[i]; if(p.s===s && p.ids.indexOf(a)>=0 && p.ids.indexOf(b)>=0) return p.tip; }
  return "";
}
function kcExample(s, sid){
  var L=KR.L, id=L && L.ex ? L.ex[sid] : null, c=id && IDX[id];
  if(!c) return "";
  return '<button class="klex" id="klEx" data-id="'+esc(id)+'"><span class="kj">'+esc(c.kana)+'</span><span class="kr">'+esc(c.romaji)+'</span><span class="ke">'+esc(c.en)+'</span><span class="kplay" aria-hidden="true">▶</span></button>';
}
function kcShowTeach(st){
  var s=KR.s, sid=st.sid, x=kcSnd(sid), b=kcEl("klBody"), aud=kcHasAudio(sid);
  b.innerHTML='<span class="chip dir-j">New: '+esc(x.r)+'</span>'+
    '<div class="klbig">'+esc(kcForm(s,sid))+'</div>'+
    '<div class="romaji klro">'+esc(x.r)+'</div>'+
    (kcNote(s,sid) ? '<p class="klnote fine">'+esc(kcNote(s,sid))+'</p>' : '')+
    '<p class="klhook">'+esc(kcHook(s,sid))+'</p>'+
    kcExample(s, sid);
  var ex=kcEl("klEx"); if(ex) ex.onclick=function(){ kcPlayWord(ex.dataset.id); };
  kcFoot((aud ? '<button class="btn btn-ghost" id="klHear">Hear it</button>' : '')+'<button class="btn" id="klNext">Got it</button>');
  if(aud){ kcEl("klHear").onclick=function(){ kcPlaySound(sid); }; kcPlaySound(sid); }
  else if(ex) kcPlayWord(ex.dataset.id);
  kcEl("klNext").onclick=kcStep;
}
function kcPool(st){
  if(st.pool) return st.pool;
  var s=st.s||KR.s;
  if(KR.mode==="lesson") return kcTaught(s, KR.li);
  return kcTaught(s);
}
function kcShowQ(st){
  var s=st.s||KR.s, sid=st.sid, x=kcSnd(sid), b=kcEl("klBody"), q=st.q;
  if(q==="LK" && !kcHasAudio(sid)) q=st.q="KR";
  var opts=kcChoices(s, sid, kcPool(st), st.pair ? 2 : 4, q==="LK");
  st.opts=opts;
  var prompt="", lab="";
  if(q==="KR"){ lab="Which sound is this?"; prompt='<div class="klbig">'+esc(kcForm(s,sid))+'</div>'; }
  else if(q==="RK"){ lab="Which kana is this?"; prompt='<div class="romaji klq">'+esc(x.r)+'</div>'; }
  else { lab="Which kana did you hear?"; prompt='<button class="btn btn-ghost klplay" id="klPlay">Play again</button>'; }
  b.innerHTML='<span class="chip dir-j">'+esc(lab)+'</span>'+prompt+
    '<div class="klopts '+(q==="KR" ? "ro" : "kj")+(opts.length<=2 ? " two" : "")+'" id="klOpts">'+opts.map(function(o){
      return '<button class="klopt" data-sid="'+esc(o)+'">'+esc(q==="KR" ? kcSnd(o).r : kcForm(s,o))+'</button>'; }).join("")+'</div>'+
    '<div class="klfb" id="klFb"></div>';
  KR.t0=Date.now();
  if(q==="LK"){ var g=KR.gen; kcPlaySound(sid).then(function(){ if(g===KR.gen) KR.t0=Date.now(); }); kcEl("klPlay").onclick=function(){ kcPlaySound(sid); }; }
  Array.prototype.forEach.call(document.querySelectorAll("#klOpts .klopt"), function(btn){ btn.onclick=function(){ kcAnswer(st, btn.dataset.sid); }; });
}
function kcAnswer(st, picked){
  if(KR.answered) return; KR.answered=true;
  var s=st.s||KR.s, sid=st.sid, ok=picked===sid, ms=Date.now()-KR.t0, dir=st.q==="LK" ? "l" : "r";
  var sk=s+":"+sid+"|"+dir, again=!!KR.sched[sk]; KR.sched[sk]=1;
  kcRecord(s, sid, dir, ok, ms, ok ? null : picked, again);
  KR.res.push({k:"q", s:s, sid:sid, ok:ok, ms:ms, isNew:!!st.isNew, check:!!st.check, retry:!!st.retry});
  try{ spCue(ok ? "good" : "miss"); }catch(e){}
  Array.prototype.forEach.call(document.querySelectorAll("#klOpts .klopt"), function(b){
    b.disabled=true;
    b.classList.add(b.dataset.sid===sid ? "right" : (b.dataset.sid===picked ? "wrong" : "dim"));
    // every kana on screen gets its romaji under it once answered
    if(st.q!=="KR") b.insertAdjacentHTML("beforeend", '<span class="kr">'+esc(kcSnd(b.dataset.sid).r)+'</span>');
  });
  var x=kcSnd(sid), fb=kcEl("klFb");
  if(ok){
    fb.innerHTML='<span class="scv good">Right</span> <span class="kans"><b>'+esc(kcForm(s,sid))+'</b> '+esc(x.r)+'</span>'+(ms>=KC_FAST_MS ? ' <span class="fine">(take your time, speed comes)</span>' : '');
    if(kcHasAudio(sid) && st.q!=="LK") kcPlaySound(sid);
    var g=KR.gen; setTimeout(function(){ if(g===KR.gen) kcStep(); }, ms<KC_FAST_MS ? 900 : 1300);
    kcNextBtn("Next");
  } else {
    var pk=kcSnd(picked);
    fb.innerHTML='<span class="scv missed">Not quite</span> <span class="kans"><b>'+esc(kcForm(s,sid))+'</b> is '+esc(x.r)+(pk ? '; <b>'+esc(kcForm(s,picked))+'</b> is '+esc(pk.r) : '')+'</span>'+
      '<p class="klhook fine">'+esc(kcPairTip(s, sid, picked) || kcHook(s,sid))+'</p>';
    if(kcHasAudio(sid)) kcPlaySound(sid);
    // a missed kana comes back later in the same run, at most twice
    {
      var n=KR.retries[s+sid]||0;
      if(n<2){ KR.retries[s+sid]=n+1;
        var at=Math.min(KR.steps.length-1, KR.i+3+Math.floor(Math.random()*2));
        while(at<KR.steps.length-1 && KR.steps[at].t!=="q" && KR.steps[at].t!=="read") at++;
        if(KR.steps[at] && KR.steps[at].t==="done") at=KR.steps.length-1;
        KR.steps.splice(at, 0, {t:"q", q:st.q==="LK" ? "LK" : "KR", sid:sid, s:s, retry:true, pool:st.pool, pair:st.pair});
      }
    }
    kcNextBtn("Next");
  }
}
function kcShowRead(st){
  var c=IDX[st.id], b=kcEl("klBody"), s=KR.s;
  var pool = KR.mode==="lesson" ? kcReadable(s, KR.li) : [];
  var opts=kcWordChoices(st.id, pool, st.kind);
  b.innerHTML='<span class="chip dir-e">Read the word</span>'+
    '<div class="klword">'+esc(c.kana)+'</div>'+
    '<div class="klopts ro words" id="klOpts">'+opts.map(function(o){ return '<button class="klopt" data-r="'+esc(o)+'">'+esc(o)+'</button>'; }).join("")+'</div>'+
    '<div class="klfb" id="klFb"></div>';
  KR.t0=Date.now();
  Array.prototype.forEach.call(document.querySelectorAll("#klOpts .klopt"), function(btn){ btn.onclick=function(){
    if(KR.answered) return; KR.answered=true;
    var ok=btn.dataset.r===c.romaji, ms=Date.now()-KR.t0, K=kcS();
    var w=K.wst[st.id] || (K.wst[st.id]={n:0, ok:0, last:0}); w.n++; if(ok) w.ok++; w.last=Date.now(); save();
    KR.res.push({k:"read", id:st.id, ok:ok, ms:ms, isNew:!!st.isNew});
    try{ spCue(ok ? "good" : "miss"); }catch(e){}
    Array.prototype.forEach.call(document.querySelectorAll("#klOpts .klopt"), function(o){ o.disabled=true; o.classList.add(o.dataset.r===c.romaji ? "right" : (o===btn ? "wrong" : "dim")); });
    kcEl("klFb").innerHTML=(ok ? '<span class="scv good">Right</span> ' : '<span class="scv missed">It reads</span> ')+
      '<span class="kans"><b>'+esc(c.romaji)+'</b>, '+esc(c.en)+'</span>';
    kcPlayWord(st.id);
    kcNextBtn("Next");
  }; });
}
function kcShowSay(st){
  var c=IDX[st.id], b=kcEl("klBody"), g=KR.gen;
  b.innerHTML='<span class="chip dir-e">Read it aloud</span>'+
    '<div class="klword">'+esc(c.kana)+'</div>'+
    '<div class="spstate" id="klSayState">Tap Speak, then read it out.</div>'+
    '<div class="klfb" id="klFb"></div>';
  kcFoot('<button class="btn btn-ghost" id="klSkip">Skip</button><button class="btn" id="klSpeak">Speak</button>');
  kcEl("klSkip").onclick=function(){
    try{ listenCancel(); }catch(e){}
    KR.gen++;
    kcEl("klSayState").textContent="";
    kcEl("klFb").innerHTML='<span class="kans">It is <b>'+esc(c.romaji)+'</b>, '+esc(c.en)+'</span>';
    kcPlayWord(st.id);
    KR.shownAt=0; kcNextBtn("Next");
  };
  kcEl("klSpeak").onclick=function(){
    kcSession("auto");   // the recogniser needs the microphone back
    var stEl=kcEl("klSayState"); stEl.textContent="listening"; stEl.className="spstate prompt";
    kcEl("klSpeak").disabled=true;
    listenOnce(SP_LISTEN_MS, "ja-JP", "klSayState").then(function(r){
      if(g!==KR.gen) return;
      stEl.className="spstate"; kcEl("klSpeak").disabled=false;
      if(!r || !r.alts || !r.alts.length){ stEl.textContent="Nothing heard. Tap Speak to try again, or Skip."; return; }
      var gr=spGradeJa(c.kana, r.alts, c), pass=gr.sim>=SP_PASS_JA, K=kcS();
      var w=K.say[st.id] || (K.say[st.id]={n:0, ok:0, last:0}); w.n++; if(pass) w.ok++; w.last=Date.now(); save();
      KR.res.push({k:"say", id:st.id, ok:pass});
      try{ spCue(pass ? "good" : "miss"); }catch(e){}
      stEl.textContent="";
      kcEl("klFb").innerHTML=(pass ? '<span class="scv good">Right</span> ' : '<span class="scv missed">Heard '+esc(gr.romaji||"")+'</span> ')+
        '<span class="kans">It is <b>'+esc(c.romaji)+'</b>, '+esc(c.en)+'</span>';
      kcPlayWord(st.id);
      kcFoot('<button class="btn btn-ghost" id="klSpeak2">Again</button><button class="btn" id="klNext">Next</button>');
      kcEl("klSpeak2").onclick=function(){ KR.i--; kcStep(); };
      kcEl("klNext").onclick=kcStep;
    });
  };
}
/* the end of a run: what went well, what did not, and whether the lesson is passed */
function kcShowDone(){
  try{ listenCancel(); }catch(e){}
  var qs=KR.res.filter(function(r){ return r.k==="q"; }), reads=KR.res.filter(function(r){ return r.k==="read"; });
  var scored=KR.res.filter(function(r){ return (r.k==="q" || r.k==="read") && !r.retry && !r.check && (KR.mode!=="lesson" || r.isNew || KR.L.kind!=="new" || r.k==="read"); });
  var right=scored.filter(function(r){ return r.ok; }).length, acc=scored.length ? right/scored.length : 0;
  var by={};
  qs.forEach(function(r){ if(r.retry) return; var k=r.s+":"+r.sid; var o=by[k]||(by[k]={s:r.s, sid:r.sid, n:0, ok:0, ms:0}); o.n++; if(r.ok) o.ok++; o.ms+=r.ms; });
  var rows=Object.keys(by).map(function(k){ return by[k]; });
  var weak=rows.filter(function(o){ return o.ok<o.n; }).sort(function(a,b){ return (a.ok/a.n)-(b.ok/b.n); });
  var good=rows.filter(function(o){ return o.ok===o.n; }).sort(function(a,b){ return a.ms/a.n-b.ms/b.n; });
  var h="", passNow=false;
  if(KR.mode==="lesson"){
    var L=KR.L, need = L.kind==="review" ? KC_PASS_REVIEW : KC_PASS, K=kcS();
    passNow = acc>=need;
    var rec=K.les[L.id] || (K.les[L.id]={at:0, best:0, n:0, pass:false});
    rec.n++; rec.at=Date.now(); rec.best=Math.max(rec.best||0, Math.round(acc*100)); if(passNow) rec.pass=true; rec.last=Math.round(acc*100);
    save();
    h+='<span class="chip '+(passNow ? "dir-e" : "dir-j")+'">'+(passNow ? "Lesson passed" : "Not yet")+'</span>';
    h+='<h2 class="kltitle">'+Math.round(acc*100)+'% right</h2>';
    h+='<p class="klnote">'+(passNow ? (kcNextLesson(L.s)>=0 ? "The next lesson is open. Reviews of these kana will come back on their own." : "That was the last lesson here.")
      : "The next lesson opens at "+Math.round(need*100)+"%. Take this one again; there is no limit on tries.")+'</p>';
  } else {
    h+='<span class="chip dir-e">Done</span><h2 class="kltitle">'+right+' of '+scored.length+' right</h2>';
  }
  var cell=function(o){ return '<span class="klchip"><b>'+esc(kcForm(o.s,o.sid))+'</b> '+esc(kcSnd(o.sid).r)+' <i>'+o.ok+'/'+o.n+'</i></span>'; };
  if(weak.length) h+='<div class="klsum"><span class="lbl">Needs work</span>'+weak.slice(0,4).map(cell).join("")+'</div>';
  if(good.length) h+='<div class="klsum"><span class="lbl">Strong</span>'+good.slice(0,4).map(cell).join("")+'</div>';
  if(reads.length) h+='<p class="fine">Words read: '+reads.filter(function(r){ return r.ok; }).length+' of '+reads.length+'</p>';
  kcEl("klBody").innerHTML=h;
  var again = KR.mode==="lesson" && !passNow;
  var nx = KR.mode==="lesson" && passNow ? kcNextLesson(KR.L.s) : -1;
  kcFoot('<button class="btn btn-ghost" id="klDone">Done</button>'+
    (again ? '<button class="btn" id="klAgain">Try again</button>' : (nx>=0 ? '<button class="btn" id="klGoNext">Next lesson</button>' : '')));
  kcEl("klDone").onclick=kcLeave;
  if(again){ var li=KR.li; kcEl("klAgain").onclick=function(){ kcStart("lesson", li); }; }
  if(nx>=0) kcEl("klGoNext").onclick=function(){ kcStart("lesson", nx); };
  KR.on=false;
}
function kcLeave(){
  KR.gen++; KR.on=false;
  try{ listenCancel(); }catch(e){} audStop();
  kcOpen();
}

/* ---- the course screen: where he is, what is next, how it is going ---- */
var KV={tab:"learn", s:"h", pick:null, page:{}};
function kcOpen(){
  if(!KC){ toast("The kana course did not load."); return; }
  try{ spStop(); }catch(e){}
  document.getElementById("tabs").classList.add("hide");
  go("kana");
  kcRender();
}
function kcCounts(s){
  var base=0, taught=0, known=0, strong=0;
  for(var sid in KC.sounds){ var x=KC.sounds[sid]; if(!kcForm(s,sid)) continue; if(x.g!=="base") continue; base++;
    var m=kcMastery(s,sid); if(m>=1) taught++; if(m>=2) known++; if(m>=3) strong++; }
  return {base:base, taught:taught, known:known, strong:strong};
}
function kcRender(){
  var host=kcEl("kcBody"); if(!host) return;
  Array.prototype.forEach.call(document.querySelectorAll("#kcTabs button"), function(b){ b.classList.toggle("on", b.dataset.tab===KV.tab); b.setAttribute("aria-pressed", String(b.dataset.tab===KV.tab)); });
  if(KV.tab==="learn") host.innerHTML=kcLearnHtml(); else if(KV.tab==="lessons") host.innerHTML=kcLessonsHtml(); else host.innerHTML=kcProgressHtml();
  kcBindBody();
}
function kcLearnHtml(){
  var h=kcCounts("h"), k=kcCounts("k"), due=kcDueItems(Date.now()).length, nh=kcNextLesson("h"), nk=kcNextLesson("k");
  var next = nh>=0 ? nh : nk;
  var bar=function(lab, c){ return '<div class="kcbar"><div class="kcbl"><span>'+lab+'</span><b>'+c.taught+' met · '+c.known+' known / '+c.base+'</b></div><div class="kctrack"><i style="width:'+(100*c.taught/c.base)+'%" class="t"></i><i style="width:'+(100*c.known/c.base)+'%" class="k"></i></div></div>'; };
  var out='<div class="kcbars">'+bar("Hiragana", h)+bar("Katakana", k)+'</div>';
  if(next>=0){
    var L=KC.lessons[next];
    out+='<button class="kccont" data-li="'+next+'"><span class="kcc1">'+(kcDone(L.id) ? "Repeat" : "Next")+': '+esc(kcScriptName(L.s))+' lesson '+kcLessonNo(next)+'</span>'+
      '<span class="kcc2">'+esc(L.t)+'</span>'+
      (L.new.length ? '<span class="kcc3">'+L.new.map(function(sid){ return '<span><b>'+esc(kcForm(L.s,sid))+'</b> '+esc(kcSnd(sid).r)+'</span>'; }).join("")+'</span>' : '')+'</button>';
    if(nh>=0 && nk>=0 && nk!==next){ var L2=KC.lessons[nk]; out+='<button class="btn btn-ghost kcalt" data-li="'+nk+'">Or katakana lesson '+kcLessonNo(nk)+': '+esc(L2.t)+'</button>'; }
  } else out+='<p class="klnote">Every lesson is passed. Reviews keep them fresh.</p>';
  out+='<div class="kcacts"><button class="btn'+(due ? "" : " btn-ghost")+'" id="kcDue"'+(due ? "" : " disabled")+'>'+(due ? "Review "+due+" due" : "Nothing due")+'</button>'+
    '<button class="btn btn-ghost" id="kcWeak"'+(h.taught ? "" : " disabled")+'>Weak spots</button></div>';
  var wk=kcWeakList("h").concat(kcWeakList("k")).sort(function(a,b){ return b.w-a.w; }).slice(0,3);
  if(wk.length) out+='<div class="klsum"><span class="lbl">Needs work</span>'+wk.map(function(o){ return '<span class="klchip"><b>'+esc(kcForm(o.s,o.sid))+'</b> '+esc(kcSnd(o.sid).r)+'</span>'; }).join("")+'</div>';
  var cf=kcConfusions("h").concat(kcConfusions("k").map(function(p){ p.k=1; return p; })).sort(function(a,b){ return b.n-a.n; })[0];
  if(cf){ var sc=cf.k ? "k" : "h"; out+='<p class="fine">Most mixed up: <b class="kjf">'+esc(kcForm(sc,cf.a))+'</b> '+esc(kcSnd(cf.a).r)+' answered as <b class="kjf">'+esc(kcForm(sc,cf.b))+'</b> '+esc(kcSnd(cf.b).r)+', '+cf.n+' time'+(cf.n===1?"":"s")+'</p>'; }
  if(!kcAnyAudio() && !h.taught) out+='<p class="fine kcaud">Single kana sounds are not installed yet; words carry the sound for now.</p>';
  return out;
}
function kcWeakList(s){
  return kcTaught(s).map(function(sid){ return {s:s, sid:sid, w:kcWeakness(s,sid)}; }).filter(function(o){ return o.w>0.6; }).sort(function(a,b){ return b.w-a.w; });
}
/* the lessons, a page at a time so the list never scrolls: as many as the
   screen holds, opening on the page with the next lesson */
function kcLessonsHtml(){
  var mine=[]; KC.lessons.forEach(function(L, i){ if(L.s===KV.s) mine.push(i); });
  var per=Math.max(4, Math.floor(((window.innerHeight||600)-262)/50));
  KV.page=KV.page||{};
  if(KV.page[KV.s]==null){ var nx=kcNextLesson(KV.s), at=Math.max(0, mine.indexOf(nx)); KV.page[KV.s]=Math.floor(at/per); }
  var pages=Math.ceil(mine.length/per), pg=Math.min(Math.max(0, KV.page[KV.s]), pages-1); KV.page[KV.s]=pg;
  var out='<div class="kcseg">'+["h","k"].map(function(s){ return '<button data-s="'+s+'" class="'+(KV.s===s ? "on" : "")+'">'+kcScriptName(s)+'</button>'; }).join("")+'</div><div class="kclist">';
  mine.slice(pg*per, pg*per+per).forEach(function(i){
    var L=KC.lessons[i], rec=kcS().les[L.id], open=kcUnlocked(i), pass=kcPassed(L.id);
    var cls=pass ? "pass" : (open ? "open" : "lock");
    out+='<button class="kcles '+cls+'" data-li="'+i+'"'+(open ? "" : " disabled")+'><span class="n">'+kcLessonNo(i)+'</span><span class="t">'+esc(L.t)+
      (L.new.length ? '<span class="ks">'+L.new.map(function(sid){ return esc(kcForm(L.s,sid))+' '+esc(kcSnd(sid).r); }).join(" · ")+'</span>' : '')+'</span>'+
      '<span class="r">'+(pass ? rec.best+"%" : (rec && rec.n ? rec.last+"%" : (open ? "open" : "locked")))+'</span></button>';
  });
  out+='</div><div class="kcpager"><button class="btn btn-ghost" id="kcPrev"'+(pg>0 ? "" : " disabled")+'>Earlier</button>'+
    '<span>'+(pg*per+1)+' to '+Math.min(mine.length, pg*per+per)+' of '+mine.length+'</span>'+
    '<button class="btn btn-ghost" id="kcNextPg"'+(pg<pages-1 ? "" : " disabled")+'>Later</button></div>';
  return out;
}
/* the chart: the basic kana in the order of the Japanese syllabary, coloured by
   how well each is known; tapping one shows its numbers */
var KC_GRID=[["a","i","u","e","o"],["ka","ki","ku","ke","ko"],["sa","shi","su","se","so"],["ta","chi","tsu","te","to"],["na","ni","nu","ne","no"],["ha","hi","fu","he","ho"],["ma","mi","mu","me","mo"],["ya","","yu","","yo"],["ra","ri","ru","re","ro"],["wa","","","","wo"],["n","","","",""]];
function kcProgressHtml(){
  var s=KV.s, out='<div class="kcseg">'+["h","k"].map(function(x){ return '<button data-s="'+x+'" class="'+(s===x ? "on" : "")+'">'+kcScriptName(x)+'</button>'; }).join("")+'</div>';
  out+='<div class="kcgrid">';
  KC_GRID.forEach(function(row){ row.forEach(function(sid){
    if(!sid){ out+='<span class="kcg empty"></span>'; return; }
    var m=kcMastery(s,sid);
    out+='<button class="kcg m'+m+(KV.pick===sid ? " pick" : "")+'" data-sid="'+sid+'"><b>'+esc(kcForm(s,sid))+'</b><i>'+esc(kcSnd(sid).r)+'</i></button>';
  }); });
  out+='</div>';
  out+='<div class="kclegend"><span class="m0">not met</span><span class="m1">learning</span><span class="m2">known</span><span class="m3">strong</span></div>';
  var det="";
  if(KV.pick){
    var st=kcStat(s,KV.pick), x=kcSnd(KV.pick);
    if(st && st.n){
      var a=kcAcc(st,10), conf=Object.keys(st.conf||{}).sort(function(p,q){ return st.conf[q]-st.conf[p]; })[0];
      var it=kcS().items[kcKey(s,KV.pick)+"|r"];
      det='<b class="kjf">'+esc(kcForm(s,KV.pick))+'</b> '+esc(x.r)+': '+st.ok+' of '+st.n+' right, last ten '+Math.round(100*a)+'%, '+(kcAvgMs(st)/1000).toFixed(1)+' s on average'+
        (it && it.due ? ', next review '+kcWhen(it.due) : '')+
        (conf ? '; mixed up with <b class="kjf">'+esc(kcForm(s,conf))+'</b> '+esc(kcSnd(conf).r)+' '+st.conf[conf]+'x' : '')+'.';
    } else det='<b class="kjf">'+esc(kcForm(s,KV.pick))+'</b> '+esc(x.r)+': not met yet.';
  } else {
    var c=kcCounts(s), K=kcS(), d7=kcLastDays(7);
    det='Met '+c.taught+' of '+c.base+', known '+c.known+', strong '+c.strong+'. '+
      (d7.n ? 'Last 7 days: '+d7.n+' answers, '+Math.round(100*d7.ok/d7.n)+'% right, '+(d7.ms/d7.n/1000).toFixed(1)+' s each.' : 'Tap a kana for its numbers.');
    var ext=kcGroupCounts(s); if(ext) det+=' '+ext;
  }
  out+='<p class="kcdet" id="kcDet">'+det+'</p>';
  return out;
}
function kcGroupCounts(s){
  var g={dakuten:[0,0], youon:[0,0], extended:[0,0]};
  for(var sid in KC.sounds){ var x=KC.sounds[sid]; if(!g[x.g] || !kcForm(s,sid)) continue; g[x.g][1]++; if(kcMastery(s,sid)>=2) g[x.g][0]++; }
  var parts=[]; if(g.dakuten[1]) parts.push("with marks "+g.dakuten[0]+"/"+g.dakuten[1]); if(g.youon[1]) parts.push("combined "+g.youon[0]+"/"+g.youon[1]); if(s==="k" && g.extended[1]) parts.push("loanword sounds "+g.extended[0]+"/"+g.extended[1]);
  return parts.length ? "Known: "+parts.join(", ")+"." : "";
}
function kcLastDays(n){
  var K=kcS(), out={n:0, ok:0, ms:0}, k=dayKey(Date.now());
  for(var i=0;i<n;i++){ var d=K.day[prevKey(k,i)]; if(d){ out.n+=d[0]; out.ok+=d[1]; out.ms+=d[2]; } }
  return out;
}
function kcWhen(t){ var d=Math.round((t-Date.now())/86400000); if(d<=0) return "today"; if(d===1) return "tomorrow"; return "in "+d+" days"; }
function kcBindBody(){
  var host=kcEl("kcBody");
  Array.prototype.forEach.call(host.querySelectorAll("[data-li]"), function(b){ b.onclick=function(){ kcStart("lesson", +b.dataset.li); }; });
  Array.prototype.forEach.call(host.querySelectorAll(".kcseg button"), function(b){ b.onclick=function(){ KV.s=b.dataset.s; KV.pick=null; if(KV.page) KV.page[KV.s]=null; kcRender(); }; });
  Array.prototype.forEach.call(host.querySelectorAll(".kcg[data-sid]"), function(b){ b.onclick=function(){ KV.pick = KV.pick===b.dataset.sid ? null : b.dataset.sid; kcRender(); }; });
  var d=kcEl("kcDue"); if(d) d.onclick=function(){ kcStart("due"); };
  var pv=kcEl("kcPrev"); if(pv) pv.onclick=function(){ KV.page[KV.s]--; kcRender(); };
  var nv=kcEl("kcNextPg"); if(nv) nv.onclick=function(){ KV.page[KV.s]++; kcRender(); };
  var w=kcEl("kcWeak"); if(w) w.onclick=function(){ kcStart("weak", kcCounts("k").taught && kcWeakList("k").length>kcWeakList("h").length ? "k" : "h"); };
}
function kcHomeLine(){
  if(!KC) return "";
  var h=kcCounts("h"), k=kcCounts("k"), due=kcDueItems(Date.now()).length;
  if(!h.taught) return "hiragana and katakana from the very first sound, slowly";
  return "hiragana "+h.known+"/"+h.base+", katakana "+k.known+"/"+k.base+(due ? ", "+due+" due" : "");
}
function bindKana(){
  var b=document.getElementById("kanaBtn"); if(b) b.addEventListener("click", kcOpen);
  var bk=document.getElementById("kcBack"); if(bk) bk.addEventListener("click", function(){ document.getElementById("tabs").classList.remove("hide"); go("home"); render(); });
  var kb=document.getElementById("klBack"); if(kb) kb.addEventListener("click", kcLeave);
  Array.prototype.forEach.call(document.querySelectorAll("#kcTabs button"), function(t){ t.addEventListener("click", function(){ KV.tab=t.dataset.tab; KV.pick=null; kcRender(); }); });
  if(typeof bindKanaRec==="function") bindKanaRec();
}
