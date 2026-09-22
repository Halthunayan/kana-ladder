/* ---------- Scenes ----------
   A scene is a short real exchange, six to eleven lines, half of them his.
   Listen plays it through. Rehearse plays the other side and asks him for his
   own lines: the phone listens, transcribes, and the transcript is graded
   against the line by how close it sounds. Nothing here touches the schedule;
   a scene is practice, like the car, and its score is its own.

   Everything in a scene is a sentence the deck already has, so every line has
   a clip, a romaji reading and links to its words. A scene opens under the
   same rule as a sentence card: at most one unknown word per line. The words
   it still needs are listed first, and one tap puts them at the front of the
   new-card queue. */
var SCENES = JSON.parse(document.getElementById("scenes-data").textContent);
var KANJI_TBL = JSON.parse(document.getElementById("kanji-data").textContent);
var SC = {cur:null, mode:null, gen:0, rec:null, results:[], line:-1, busy:false, mic:"untried"};
var SC_PASS=0.75, SC_CLOSE=0.55, SC_LISTEN_MS=7000;

function sceneById(id){ for(var i=0;i<SCENES.length;i++) if(SCENES[i].id===id) return SCENES[i]; return null; }
function sceneLine(l){ return SIDX[l.sid]; }
/* every unknown word across the scene, once each, in line order */
function sceneGaps(sc){
  var seen={}, out=[];
  for(var i=0;i<sc.lines.length;i++){
    var x=sceneLine(sc.lines[i]); if(!x) continue;
    var m=sentMissing(x);
    for(var j=0;j<m.length;j++){ if(!seen[m[j]]){ seen[m[j]]=1; out.push(m[j]); } }
  }
  return out;
}
/* the scene can be rehearsed: every line readable under the one-gap rule */
function sceneReady(sc){
  for(var i=0;i<sc.lines.length;i++){ var x=sceneLine(sc.lines[i]); if(!x || !sentOpen(x)) return false; }
  return true;
}
/* lines that are still shut, and the word count that shuts them */
function sceneShut(sc){
  var n=0; for(var i=0;i<sc.lines.length;i++){ var x=sceneLine(sc.lines[i]); if(x && !sentOpen(x)) n++; } return n;
}
function sceneScore(id){ return (S.scenes && S.scenes[id]) || null; }
function sceneYouCount(sc){ var n=0; for(var i=0;i<sc.lines.length;i++) if(sc.lines[i].who==="you") n++; return n; }

/* ---- kana and romaji ---- */
function toHira(s){
  return String(s||"").replace(/[ァ-ヶ]/g,function(ch){ return String.fromCharCode(ch.charCodeAt(0)-0x60); });
}
/* A transcript arrives with kanji. Every deck word with a kanji spelling gave
   the build a replacement, longest first, plus a stem pair for conjugation. */
function kanjiToKana(s){
  var t=String(s||"");
  for(var i=0;i<KANJI_TBL.length;i++){
    var k=KANJI_TBL[i][0]; if(t.indexOf(k)<0) continue;
    t=t.split(k).join(KANJI_TBL[i][1]);
  }
  return t;
}
/* what is compared: hiragana only, no spaces or punctuation, katakana folded */
function kanaKey(s){
  return toHira(kanjiToKana(s)).replace(/[^ぁ-ゖー]/g,"");
}
var _KR={
  "あ":"a","い":"i","う":"u","え":"e","お":"o",
  "か":"ka","き":"ki","く":"ku","け":"ke","こ":"ko","さ":"sa","し":"shi","す":"su","せ":"se","そ":"so",
  "た":"ta","ち":"chi","つ":"tsu","て":"te","と":"to","な":"na","に":"ni","ぬ":"nu","ね":"ne","の":"no",
  "は":"ha","ひ":"hi","ふ":"fu","へ":"he","ほ":"ho","ま":"ma","み":"mi","む":"mu","め":"me","も":"mo",
  "や":"ya","ゆ":"yu","よ":"yo","ら":"ra","り":"ri","る":"ru","れ":"re","ろ":"ro","わ":"wa","を":"o","ん":"n",
  "が":"ga","ぎ":"gi","ぐ":"gu","げ":"ge","ご":"go","ざ":"za","じ":"ji","ず":"zu","ぜ":"ze","ぞ":"zo",
  "だ":"da","ぢ":"ji","づ":"zu","で":"de","ど":"do","ば":"ba","び":"bi","ぶ":"bu","べ":"be","ぼ":"bo",
  "ぱ":"pa","ぴ":"pi","ぷ":"pu","ぺ":"pe","ぽ":"po",
  "きゃ":"kya","きゅ":"kyu","きょ":"kyo","しゃ":"sha","しゅ":"shu","しょ":"sho","ちゃ":"cha","ちゅ":"chu","ちょ":"cho",
  "にゃ":"nya","にゅ":"nyu","にょ":"nyo","ひゃ":"hya","ひゅ":"hyu","ひょ":"hyo","みゃ":"mya","みゅ":"myu","みょ":"myo",
  "りゃ":"rya","りゅ":"ryu","りょ":"ryo","ぎゃ":"gya","ぎゅ":"gyu","ぎょ":"gyo","じゃ":"ja","じゅ":"ju","じょ":"jo",
  "びゃ":"bya","びゅ":"byu","びょ":"byo","ぴゃ":"pya","ぴゅ":"pyu","ぴょ":"pyo",
  "てぃ":"ti","でぃ":"di","ふぁ":"fa","ふぃ":"fi","ふぇ":"fe","ふぉ":"fo","うぃ":"wi","うぇ":"we","うぉ":"wo","ゔ":"vu"
};
/* hiragana to romaji, for showing him what the phone heard */
function kanaToRomaji(s){
  var h=toHira(s), out="", i=0, pend=false;
  while(i<h.length){
    var ch=h[i], two=h.substr(i,2);
    if(ch==="っ"){ pend=true; i++; continue; }
    if(ch==="ー"){ var v=out.match(/[aeiou]$/); out+= v? v[0] : ""; i++; continue; }
    var r=_KR[two], step=2;
    if(!r){ r=_KR[ch]; step=1; }
    if(!r){ if(/[ぁ-ゖ]/.test(ch)) r=""; else r=ch; step=1; }
    if(pend && r){ out+=r[0]; pend=false; }
    /* n before a vowel or y reads as a separate mora */
    if(out.slice(-1)==="n" && r && /^[aeiouy]/.test(r)) out+="'";
    out+=r; i+=step;
  }
  return out;
}
/* What to show him for a transcript. A transcript has no word breaks and the
   converter cannot tell the particle は (wa) from the syllable は (ha), so a
   line the phone got right is shown as the line's own romaji, and only a miss
   shows the raw conversion, with its punctuation turned into breaks. */
function heardRomaji(heard, verdict, target){
  if(!heard) return "";
  if(verdict==="good" && target){ var x=SIDX_BY_KANA[target]; if(x) return x.romaji; }
  return kanaToRomaji(kanjiToKana(heard)).replace(/[、。,.?!\u3000]+/g," ").replace(/\s+/g," ").trim();
}
var SIDX_BY_KANA={};
(function(){ for(var i=0;i<SENT.length;i++) SIDX_BY_KANA[SENT[i].kana]=SENT[i]; })();
/* how alike two kana keys sound: 1 is identical, 0 is nothing in common */
function kanaSim(a,b){
  if(!a && !b) return 1; if(!a || !b) return 0;
  var m=a.length, n=b.length, prev=[], cur, i, j;
  for(j=0;j<=n;j++) prev[j]=j;
  for(i=1;i<=m;i++){
    cur=[i];
    for(j=1;j<=n;j++){
      var c = a[i-1]===b[j-1] ? 0 : 1;
      cur[j]=Math.min(prev[j]+1, cur[j-1]+1, prev[j-1]+c);
    }
    prev=cur;
  }
  return 1 - prev[n]/Math.max(m,n);
}
/* grade a list of transcripts against a target line */
function sceneGrade(target, alts){
  var want=kanaKey(target), best={sim:0, heard:""};
  for(var i=0;i<alts.length;i++){
    var s=kanaSim(want, kanaKey(alts[i]));
    if(s>best.sim){ best={sim:s, heard:alts[i]}; }
  }
  best.verdict = best.sim>=SC_PASS ? "good" : (best.sim>=SC_CLOSE ? "close" : "missed");
  best.heardRomaji = heardRomaji(best.heard, best.verdict, target);
  return best;
}

/* ---- the phone listens ---- */
function recCtor(){ return window.SpeechRecognition || window.webkitSpeechRecognition || null; }
function recAvailable(){ return !!recCtor(); }

/* A running log of every listen attempt, read-only from Settings. This exists
   because of a documented WebKit bug (bugs.webkit.org 321436, 225298): on
   iOS, SpeechRecognition can silently stop delivering onresult/onerror/onend
   at all right after an <audio> element has played, or in a home-screen
   installed PWA specifically. The mic permission indicator still shows, so
   there is nothing to see on screen; this log is the only way to tell "the
   recognizer never started" apart from "it started and heard nothing" apart
   from "it is not allowed to run here at all". Nothing in here listens back. */
var MIC_LOG=[];
function micNote(rec){ MIC_LOG.push(rec); if(MIC_LOG.length>20) MIC_LOG.shift(); }
function isStandalone(){
  try{ return window.matchMedia && window.matchMedia("(display-mode: standalone)").matches || navigator.standalone===true; }
  catch(e){ return false; }
}
/* the last time any clip or TTS actually played, so a listen attempt can be
   correlated against the WebKit "hangs right after audio" bug above */
var LAST_AUDIO_AT=0;
function noteAudioPlayed(){ LAST_AUDIO_AT=Date.now(); }

/* Best known mitigation for the same WebKit bug: a short pause plus a
   throwaway getUserMedia grab before starting the recognizer. Documented as
   "partial, unreliable" relief by the people who filed the bug, not a fix -
   it costs under a second and is cheap insurance either way. Never rejects.
   Kept separate from micWaveStart below: this one is a true grab-and-release
   with nothing left open, so it stays safe to call on its own (the __kl test
   hook exposes it directly) even though listenOnce no longer calls it - the
   live stream micWaveStart holds for the wave already primes the mic just
   as well, for as long as the wave is on screen. */
function micPrime(delayMs){
  return new Promise(function(res){
    setTimeout(function(){
      try{
        if(navigator.mediaDevices && navigator.mediaDevices.getUserMedia){
          navigator.mediaDevices.getUserMedia({audio:true}).then(function(stream){
            stream.getTracks().forEach(function(t){ try{ t.stop(); }catch(e){} });
            res();
          }, function(){ res(); });
          return;
        }
      }catch(e){}
      res();
    }, delayMs||0);
  });
}

/* One utterance. Resolves with {alts:[...]} or {alts:[], err:"..."}. Never
   rejects, never hangs: a hard timeout stops it whatever the engine does.
   lang defaults to Japanese; Speaking mode passes "en-US" for the half of its
   questions that are answered in English. stateElId, when given, is the id
   of the "listening" line on screen (spState / scState) - the mic wave bars
   are mounted right after it for the length of this one attempt, so he can
   see whether the phone is hearing anything at all, not just guess from a
   line of text that never changes. */
function listenOnce(ms, lang, stateElId){
  var sinceAudio=Date.now()-LAST_AUDIO_AT;
  var wave=null;
  if(stateElId){
    var stateEl=document.getElementById(stateElId);
    wave=micWaveMount(stateEl);
  }
  var primed = wave
    ? micWaveStart(function(levels){
        for(var i=0;i<wave.bars.length && i<levels.length;i++){
          wave.bars[i].style.height=Math.max(4, Math.round(levels[i]*26))+"px";
        }
      }, wave.bars.length)
    : micWaveStart(null);
  return primed.then(function(){
    return new Promise(function(res){
      var C=recCtor();
      if(!C){
        micWaveStop(); if(wave) wave.remove();
        micNote({at:Date.now(),lang:lang,sinceAudio:sinceAudio,standalone:isStandalone(),started:false,result:false,err:"unavailable"});
        res({alts:[], err:"unavailable"}); return;
      }
      var R, done=false, timer=null, alts=[], started=false, t0=Date.now();
      function fin(r){
        if(done) return; done=true; if(timer) clearTimeout(timer); try{ R.abort(); }catch(e){} SC.rec=null;
        micWaveStop(); if(wave) wave.remove();
        micNote({at:t0,lang:lang,sinceAudio:sinceAudio,standalone:isStandalone(),started:started,result:!!(r.alts&&r.alts.length),err:r.err||null,ms:Date.now()-t0});
        res(r);
      }
      try{
        R=new C(); SC.rec=R;
        R.lang=lang||"ja-JP"; R.interimResults=false; R.maxAlternatives=5; R.continuous=false;
        R.onstart=function(){ started=true; };
        R.onresult=function(e){
          try{ var rs=e.results[e.results.length-1];
            for(var i=0;i<rs.length;i++){ if(rs[i] && rs[i].transcript) alts.push(rs[i].transcript); } }catch(x){}
          fin({alts:alts});
        };
        R.onerror=function(e){ fin({alts:alts, err:(e&&e.error)||"error"}); };
        R.onend=function(){ fin(alts.length? {alts:alts} : {alts:[], err:"no-speech"}); };
        R.start();
        timer=setTimeout(function(){ try{ R.stop(); }catch(e){} setTimeout(function(){ fin(alts.length? {alts:alts} : {alts:[], err:"timeout"}); },400); }, ms||SC_LISTEN_MS);
      }catch(e){ fin({alts:[], err:"start:"+(e&&e.message||e)}); }
    });
  });
}
/* Read-only report for Settings, mirroring speechReport()'s pattern for TTS.
   Never starts a recognizer itself. */
function micReport(){
  var L=[], i, r;
  L.push("recognizer: "+(recAvailable()?"present":"MISSING"));
  L.push("running as: "+(isStandalone()?"installed, home screen":"a browser tab"));
  L.push("");
  L.push("last "+MIC_LOG.length+" attempts, newest last:");
  if(!MIC_LOG.length) L.push("  nothing has listened yet");
  for(i=0;i<MIC_LOG.length;i++){
    r=MIC_LOG[i];
    L.push("  lang:"+(r.lang||"ja-JP")
      +"  since audio:"+(r.sinceAudio<0?"?":r.sinceAudio+"ms")
      +"  standalone:"+(r.standalone?"yes":"no")
      +"  started:"+(r.started?"yes":"NO")
      +"  result:"+(r.result?"yes":"no")
      +(r.err?("  err:"+r.err):"")
      +(r.ms!=null?("  took:"+r.ms+"ms"):""));
  }
  return L.join("\n");
}

/* ---- audio for a line ---- */
function sceneClipKey(x){ return "sj:"+x.id; }
function estSpeechMs(text){ return 600 + moraCount(text)*170; }
/* play a line; resolves when it is over. The library first, the device voice if
   the library has nothing, a timed pause if neither can play. */
function scenePlay(x, gen){
  var alive=function(){ return gen===SC.gen; };
  noteAudioPlayed();
  if(audOn() && S.settings.cardAudio!==false){
    return audPlayWA(sceneClipKey(x), alive).then(function(ok){
      if(ok || !alive()) return;
      speak(x.kana); return wait(estSpeechMs(x.kana));
    });
  }
  speak(x.kana); return wait(estSpeechMs(x.kana));
}
function wait(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

/* ---- screens ---- */
function scenesList(){
  var host=document.getElementById("scList"); if(!host) return;
  var html="";
  for(var i=0;i<SCENES.length;i++){
    var sc=SCENES[i], ready=sceneReady(sc), gaps=sceneGaps(sc), shut=sceneShut(sc), sc0=sceneScore(sc.id);
    var state = ready ? (sc0 ? "best "+Math.round(sc0.best*100)+"%" : "ready")
                      : (gaps.length+" word"+(gaps.length>1?"s":"")+" to learn");
    html+='<button class="scitem'+(ready?"":" shut")+'" data-sc="'+sc.id+'">'+
      '<span class="sct">'+esc(sc.title)+'</span>'+
      '<span class="scd">'+esc(sc.en)+'</span>'+
      '<span class="scs'+(ready?" ok":"")+'">'+esc(state)+'</span></button>';
  }
  host.innerHTML=html;
  Array.prototype.forEach.call(host.querySelectorAll(".scitem"),function(b){
    b.addEventListener("click",function(){ sceneOpen(b.dataset.sc); });
  });
}
function scenesStart(){
  SC.gen++; SC.cur=null; SC.mode=null;
  go("scenes"); document.getElementById("tabs").classList.add("hide");
  document.getElementById("scPick").hidden=false;
  document.getElementById("scOne").hidden=true;
  scenesList();
}
function sceneOpen(id){
  var sc=sceneById(id); if(!sc) return;
  SC.gen++; SC.cur=sc; SC.mode=null; SC.results=[]; SC.line=-1;
  document.getElementById("scPick").hidden=true;
  document.getElementById("scOne").hidden=false;
  document.getElementById("scTitle").textContent=sc.title;
  document.getElementById("scSub").textContent=sc.en;
  sceneBrief(sc);
  document.getElementById("scStage").hidden=true;
  document.getElementById("scDone").hidden=true;
  document.getElementById("scBrief").hidden=false;
}
/* the words the scene needs that he does not have yet, with a way to get them */
function sceneBrief(sc){
  var gaps=sceneGaps(sc), ready=sceneReady(sc), host=document.getElementById("scGaps");
  var head=document.getElementById("scGapHead");
  if(!gaps.length){ head.textContent="You know every word in this scene."; host.innerHTML=""; }
  else {
    head.textContent = (ready ? "One word per line is still new, glossed on screen: " : "Not ready yet. Learn these first: ");
    var html="";
    for(var i=0;i<gaps.length;i++){ var c=IDX[gaps[i]]; if(!c) continue;
      html+='<span class="scgap"><b>'+esc(c.romaji)+'</b> '+esc(c.en)+'</span>'; }
    host.innerHTML=html;
  }
  var want=document.getElementById("scWant");
  want.hidden = !gaps.length;
  want.textContent = gaps.length ? "Learn these first" : "";
  want.onclick=function(){ sceneWant(gaps); };
  var lines=document.getElementById("scLines"), lh="";
  for(var j=0;j<sc.lines.length;j++){ var x=sceneLine(sc.lines[j]); if(!x) continue;
    lh+='<div class="scl '+sc.lines[j].who+'"><span class="who">'+(sc.lines[j].who==="you"?"you":"them")+'</span>'+
        '<span class="rm">'+esc(x.romaji)+'</span><span class="en">'+esc(x.en)+'</span></div>';
  }
  lines.innerHTML=lh;
  var reh=document.getElementById("scRehearse");
  reh.disabled=!ready;
  reh.textContent = ready ? "Rehearse" : "Rehearse (learn the words first)";
  document.getElementById("scMicNote").textContent = recAvailable()
    ? "Rehearse: the phone listens after each of your lines and grades what it heard."
    : "This browser cannot listen, so Rehearse shows each of your lines after a pause instead of grading it.";
}
/* put the scene's missing words at the front of the new-card queue */
function sceneWant(ids){
  S.want = S.want || [];
  var added=0;
  for(var i=0;i<ids.length;i++){ if(S.want.indexOf(ids[i])<0 && !S.items[ids[i]+"|j"]){ S.want.push(ids[i]); added++; } }
  save();
  toast(added ? added+" word"+(added>1?"s":"")+" moved to the front of your new cards" : "Already queued");
}
/* words already introduced leave the want list on their own */
function scenePruneWant(){
  if(!S.want || !S.want.length) return;
  S.want = S.want.filter(function(id){ return !S.items[id+"|j"]; });
}

/* ---- running a scene ---- */
function sceneRun(mode){
  var sc=SC.cur; if(!sc) return;
  if(mode==="rehearse" && !sceneReady(sc)){ toast("Learn the missing words first"); return; }
  var gen=++SC.gen; SC.mode=mode; SC.results=[]; SC.line=-1;
  document.getElementById("scBrief").hidden=true;
  document.getElementById("scDone").hidden=true;
  document.getElementById("scStage").hidden=false;
  document.getElementById("scMicBtn").hidden=true;
  sceneStep(gen, 0);
}
function sceneShow(l, x, state, extra){
  var who=document.getElementById("scWho"), en=document.getElementById("scEn"), rm=document.getElementById("scRm"),
      st=document.getElementById("scState"), hd=document.getElementById("scHeard");
  who.textContent = l.who==="you" ? "You say" : "They say";
  who.className = "scwho "+l.who;
  en.textContent = x.en;
  rm.textContent = state==="prompt" ? "" : x.romaji;
  st.textContent = ({prompt:"listening", play:"", grade:"", offline:"say it, then listen"})[state] || "";
  st.className = "scstate "+state;
  hd.innerHTML = extra || "";
  document.getElementById("scProg").textContent = (SC.line+1)+" / "+SC.cur.lines.length;
}
function sceneStep(gen, i){
  if(gen!==SC.gen) return;
  var sc=SC.cur;
  if(i>=sc.lines.length){ sceneFinish(gen); return; }
  SC.line=i;
  var l=sc.lines[i], x=sceneLine(l);
  if(!x){ sceneStep(gen, i+1); return; }
  if(SC.mode==="listen" || l.who==="them"){
    sceneShow(l, x, "play");
    scenePlay(x, gen).then(function(){ return wait(500); }).then(function(){ sceneStep(gen, i+1); });
    return;
  }
  /* his line: prompt in English, listen, grade, then the model answer */
  sceneShow(l, x, recAvailable() ? "prompt" : "offline");
  var p = recAvailable() ? listenOnce(SC_LISTEN_MS, null, "scState") : wait(3500).then(function(){ return {alts:[], err:"unavailable"}; });
  p.then(function(r){
    if(gen!==SC.gen) return;
    var g=null;
    if(r.alts.length){ g=sceneGrade(x.kana, r.alts); SC.mic="ok"; }
    else if(r.err && /not-allowed|service-not-allowed|start:/.test(r.err)){ SC.mic="blocked"; }
    var rec={sid:x.id, verdict: g ? g.verdict : "none", sim: g ? g.sim : 0, heard: g ? g.heard : "", err: r.err||null};
    SC.results.push(rec);
    var html;
    if(g){
      html='<div class="scv '+g.verdict+'">'+({good:"Good",close:"Close",missed:"Not that"})[g.verdict]+'</div>'+
           '<div class="schrd">heard <b>'+esc(g.heardRomaji||"")+'</b></div>';
    } else if(SC.mic==="blocked"){
      html='<div class="scv none">Microphone blocked</div><div class="schrd">allow the microphone for this site, or tap the mic on each line</div>';
      document.getElementById("scMicBtn").hidden=false;
    } else {
      html='<div class="scv none">'+(r.err==="unavailable"?"No grading here":"Nothing heard")+'</div>';
    }
    sceneShow(l, x, "grade", html);
    return scenePlay(x, gen).then(function(){ return wait(g && g.verdict==="good" ? 700 : 1400); });
  }).then(function(){ sceneStep(gen, i+1); });
}
/* a tap-to-speak fallback for a phone that will not open the microphone on its own */
function sceneMicTap(){
  var gen=SC.gen, sc=SC.cur; if(!sc || SC.line<0) return;
  var l=sc.lines[SC.line], x=sceneLine(l); if(l.who!=="you") return;
  SC.gen++; gen=SC.gen;
  sceneShow(l, x, "prompt");
  listenOnce(SC_LISTEN_MS, null, "scState").then(function(r){
    if(gen!==SC.gen) return;
    var g = r.alts.length ? sceneGrade(x.kana, r.alts) : null;
    if(SC.results.length && SC.results[SC.results.length-1].sid===x.id) SC.results.pop();
    SC.results.push({sid:x.id, verdict:g?g.verdict:"none", sim:g?g.sim:0, heard:g?g.heard:"", err:r.err||null});
    var html = g ? '<div class="scv '+g.verdict+'">'+({good:"Good",close:"Close",missed:"Not that"})[g.verdict]+'</div><div class="schrd">heard <b>'+esc(g.heardRomaji||"")+'</b></div>'
                 : '<div class="scv none">Nothing heard</div>';
    sceneShow(l, x, "grade", html);
    return scenePlay(x, gen).then(function(){ return wait(900); });
  }).then(function(){ sceneStep(gen, SC.line+1); });
}
function sceneFinish(gen){
  if(gen!==SC.gen) return;
  var sc=SC.cur;
  document.getElementById("scStage").hidden=true;
  var done=document.getElementById("scDone"); done.hidden=false;
  var head=document.getElementById("scDoneHead"), sub=document.getElementById("scDoneSub"), list=document.getElementById("scDoneList");
  if(SC.mode==="listen"){ head.textContent="Heard it through"; sub.textContent="Now try Rehearse, and say your lines out loud."; list.innerHTML=""; return; }
  var graded=SC.results.filter(function(r){ return r.verdict!=="none"; });
  var good=graded.filter(function(r){ return r.verdict==="good"; }).length;
  var close=graded.filter(function(r){ return r.verdict==="close"; }).length;
  if(!graded.length){
    head.textContent="Rehearsed, not scored";
    sub.textContent="The phone could not listen this time, so nothing was graded.";
  } else {
    var score = (good + 0.5*close)/graded.length;
    S.scenes = S.scenes || {};
    var prev=S.scenes[sc.id]||{best:0,n:0};
    S.scenes[sc.id]={best:Math.max(prev.best||0, score), last:score, n:(prev.n||0)+1, at:Date.now()};
    save();
    head.textContent=Math.round(score*100)+"%";
    sub.textContent=good+" good, "+close+" close, "+(graded.length-good-close)+" missed of "+graded.length+" line"+(graded.length>1?"s":"")+
      (S.scenes[sc.id].best>score ? ". Best so far "+Math.round(S.scenes[sc.id].best*100)+"%." : ".");
  }
  var html="";
  for(var i=0;i<SC.results.length;i++){ var r=SC.results[i], x=SIDX[r.sid]; if(!x) continue;
    html+='<div class="scres '+r.verdict+'"><span class="rm">'+esc(x.romaji)+'</span>'+
      (r.heard ? '<span class="hd">heard '+esc(heardRomaji(r.heard, r.verdict, x.kana))+'</span>' : '')+'</div>';
  }
  list.innerHTML=html;
}
function sceneStop(){ SC.gen++; if(SC.rec){ try{ SC.rec.abort(); }catch(e){} SC.rec=null; } audStop(); }
function sceneBack(){
  sceneStop();
  if(!document.getElementById("scOne").hidden){ scenesStart(); return; }
  document.getElementById("tabs").classList.remove("hide");
  go("home"); render();
}
function bindScenes(){
  var b=document.getElementById("scenesBtn");
  if(b) b.addEventListener("click",function(){ scenesStart(); });
  var back=document.getElementById("scBack"); if(back) back.addEventListener("click",sceneBack);
  var li=document.getElementById("scListen"); if(li) li.addEventListener("click",function(){ sceneRun("listen"); });
  var re=document.getElementById("scRehearse"); if(re) re.addEventListener("click",function(){ sceneRun("rehearse"); });
  var mic=document.getElementById("scMicBtn"); if(mic) mic.addEventListener("click",sceneMicTap);
  var again=document.getElementById("scAgain"); if(again) again.addEventListener("click",function(){ sceneRun("rehearse"); });
  var dn=document.getElementById("scDoneBtn"); if(dn) dn.addEventListener("click",function(){ sceneStop(); sceneOpen(SC.cur.id); });
  var stop=document.getElementById("scStop"); if(stop) stop.addEventListener("click",function(){ sceneStop(); sceneOpen(SC.cur.id); });
}
