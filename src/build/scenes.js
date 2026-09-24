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
/* Shared by Scenes and Speaking: three tries at a word or line before the
   correct answer is shown for him to review, and how long that reveal
   holds before moving on. */
var MAX_TRIES=3, REVEAL_MS=4000;
/* good/close/missed maps to a percentage grade shown to him - the numbers
   he asked for (100 when it's right, a lower number the further off a
   wrong attempt was). "none" (skipped, shown, nothing heard, no
   microphone) has no percentage - there was nothing said to grade. Shared
   by Scenes and Speaking, which both grade to this same three-tier scale,
   just at different similarity thresholds. */
function verdictPct(v){ return v==="good"?100:(v==="close"?70:(v==="missed"?50:null)); }
/* The history's colour is a different question from the grade above: not
   how close the answer was, but how easily it came. Right first try is
   green. Right on the second or third try is yellow - it counts the same
   as a first-try pass for the grade, but took more than one attempt. Never
   right in three tries is red, whether the last attempt was close or
   nowhere near. Skipped, shown, or nothing heard is neither - grey, same
   as "none" carries elsewhere. */
function historyColor(verdict, tries){
  if(verdict==="good") return tries<=1 ? "good" : "retry";
  if(verdict==="close" || verdict==="missed") return "bad";
  return "none";
}

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
var LAST_AUDIO_AT=0, AUDIO_BUSY=0;
function noteAudioPlayed(){ LAST_AUDIO_AT=Date.now(); }
/* Wrap any promise that only resolves once our own speaker output is done.
   A continuous mic (below) is listening the whole time, including while
   scenePlay is reading a line or the model answer out loud, so without
   this it would try to grade its own voice. Speaking no longer plays any
   prompt audio at all (the word or line is read, not heard), so this only
   guards Scenes now. A count, not a flag, in case two clips are ever in
   flight together. */
function audioGate(p){
  AUDIO_BUSY++;
  return p.then(function(v){ AUDIO_BUSY--; return v; }, function(e){ AUDIO_BUSY--; throw e; });
}

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

/* A Skip or Show-answer tap needs whatever is currently listening to end
   right away, rather than left running out its own several-second timeout
   in the background while the next question already starts - two
   recognizer sessions overlapping is exactly the kind of thing this file's
   own WebKit notes warn about. abort() fires the live attempt's onerror,
   which runs its normal fin() cleanup (stops the mic wave, logs the
   attempt); the caller bumping its own generation counter first, same as
   sceneMicTap already does, is what keeps that attempt's resolved promise
   from also advancing the round a second time. */
function listenCancel(){
  if(SC.rec){ try{ SC.rec.abort(); }catch(e){} }
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

/* A persistent recognizer for an "always on" round: continuous=true, and it
   restarts itself the moment the platform ends the session on its own -
   both iOS and Chrome do this after a stretch of silence even in continuous
   mode, so staying "always on" for a whole round means re-arming quietly in
   the background rather than surfacing that as a gap. Every accepted final
   result is handed to onFinal(alts); it is up to the caller to work out
   which word or line that belongs to, since one session can span several of
   them. Results that arrive while AUDIO_BUSY is set are dropped before they
   ever reach onFinal, so the round never grades its own speaker output.
   onStall(err), if given, fires once on a hard failure (blocked mic, no
   recognizer) that the loop will not recover from on its own - the caller
   falls back to a manual tap-to-speak button in that case. */
var CONT={rec:null, gen:0, running:false, wave:null};
function contListenStart(lang, onFinal, stateElId, onStall){
  contListenStop();
  var gen=++CONT.gen;
  CONT.running=true;
  var stateEl = stateElId ? document.getElementById(stateElId) : null;
  CONT.wave = stateEl ? micWaveMount(stateEl) : null;
  micWaveStart(CONT.wave ? function(levels){
    for(var i=0;i<CONT.wave.bars.length && i<levels.length;i++){
      CONT.wave.bars[i].style.height=Math.max(4, Math.round(levels[i]*26))+"px";
    }
  } : null, CONT.wave ? CONT.wave.bars.length : 10);
  (function spin(){
    if(gen!==CONT.gen || !CONT.running) return;
    var C=recCtor();
    if(!C){
      micNote({at:Date.now(),lang:lang,sinceAudio:Date.now()-LAST_AUDIO_AT,standalone:isStandalone(),started:false,result:false,err:"unavailable"});
      CONT.running=false; if(onStall) onStall("unavailable");
      return;
    }
    var R, t0=Date.now(), started=false, blocked=false;
    try{
      R=new C(); SC.rec=R; CONT.rec=R;
      R.lang=lang||"ja-JP"; R.interimResults=false; R.maxAlternatives=5; R.continuous=true;
      R.onstart=function(){ started=true; };
      R.onresult=function(e){
        try{
          var rs=e.results[e.results.length-1]; if(!rs) return;
          // interimResults is off, so - same as the one-shot listenOnce -
          // every result that reaches here is already final
          var alts=[]; for(var i=0;i<rs.length;i++){ if(rs[i] && rs[i].transcript) alts.push(rs[i].transcript); }
          if(!alts.length) return;
          micNote({at:t0,lang:lang,sinceAudio:Date.now()-LAST_AUDIO_AT,standalone:isStandalone(),started:started,result:true,err:AUDIO_BUSY?"muted (own audio playing)":null,ms:Date.now()-t0});
          t0=Date.now();
          if(AUDIO_BUSY>0 || gen!==CONT.gen) return;
          onFinal(alts);
        }catch(x){}
      };
      R.onerror=function(e){
        var err=(e&&e.error)||"error";
        micNote({at:t0,lang:lang,sinceAudio:Date.now()-LAST_AUDIO_AT,standalone:isStandalone(),started:started,result:false,err:err,ms:Date.now()-t0});
        if(/not-allowed|service-not-allowed/.test(err)){ blocked=true; CONT.running=false; if(onStall) onStall(err); }
      };
      R.onend=function(){ if(gen===CONT.gen && CONT.running && !blocked) setTimeout(spin, 150); };
      R.start();
    }catch(e){
      micNote({at:t0,lang:lang,sinceAudio:Date.now()-LAST_AUDIO_AT,standalone:isStandalone(),started:false,result:false,err:"start:"+(e&&e.message||e)});
      if(gen===CONT.gen && CONT.running) setTimeout(spin, 300);
    }
  })();
}
function contListenStop(){
  CONT.gen++; CONT.running=false;
  if(CONT.rec){ try{ CONT.rec.abort(); }catch(e){} CONT.rec=null; }
  SC.rec=null;
  micWaveStop(); if(CONT.wave){ CONT.wave.remove(); CONT.wave=null; }
}

/* ---- audio for a line ---- */
function sceneClipKey(x){ return "sj:"+x.id; }
function estSpeechMs(text){ return 600 + moraCount(text)*170; }
/* play a line; resolves when it is over. The library first, the device voice if
   the library has nothing, a timed pause if neither can play. Wrapped in
   audioGate so a continuous mic session never grades this line's own audio. */
function scenePlay(x, gen){ return audioGate(scenePlayRun(x, gen)); }
function scenePlayRun(x, gen){
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
    ? "Rehearse: the phone stays listening for the whole scene and grades each of your lines as you say it."
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
  var gen=++SC.gen; SC.mode=mode; SC.results=[]; SC.line=-1; SC._failSid=null; SC._tries=0;
  document.getElementById("scBrief").hidden=true;
  document.getElementById("scDone").hidden=true;
  document.getElementById("scStage").hidden=false;
  document.getElementById("scMicBtn").hidden=true;
  /* one mic session for the whole rehearse - every scene line is Japanese,
     so there is no language switch to force a restart between lines the
     way Speaking has. sceneOnHeard works out which line a result belongs
     to, and results are ignored on lines that are not "his line" anyway. */
  if(mode==="rehearse" && recAvailable()){
    contListenStart(null, sceneOnHeard, "scState", function(){
      SC.mic="blocked";
      document.getElementById("scMicBtn").hidden=false;
    });
  }
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
  var canBail = l.who==="you" && (state==="prompt" || state==="offline");
  var show=document.getElementById("scShowBtn"), skip=document.getElementById("scSkipBtn");
  if(show) show.hidden=!canBail;
  if(skip) skip.hidden=!canBail;
}
function sceneStep(gen, i){
  if(gen!==SC.gen) return;
  var sc=SC.cur;
  if(i>=sc.lines.length){ sceneFinish(gen); return; }
  SC.line=i;
  var l=sc.lines[i], x=sceneLine(l);
  if(!x){ sceneStep(gen, i+1); return; }
  if(SC.mode==="listen"){
    // Listen mode is a full read-through: every line plays out loud,
    // his and theirs, the same as the car.
    sceneShow(l, x, "play");
    scenePlay(x, gen).then(function(){ return wait(500); }).then(function(){ sceneStep(gen, i+1); });
    return;
  }
  if(l.who==="them"){
    // Rehearse: their line sets up his turn. It is shown on screen (kana,
    // romaji, English) rather than spoken - he reads it himself - so this
    // just holds for as long as saying it would take, then moves on.
    sceneShow(l, x, "play");
    wait(estSpeechMs(x.kana)+500).then(function(){ if(gen===SC.gen) sceneStep(gen, i+1); });
    return;
  }
  /* his line: prompt in Japanese, listen, grade, then the model answer.
     When a recognizer exists, the continuous session started in sceneRun
     is already listening; sceneOnHeard grades whatever it hears next and
     advances from there. Nothing to kick off per line. */
  if(!recAvailable()){
    sceneShow(l, x, "offline");
    var html='<div class="scv none">No grading here</div>';
    sceneShow(l, x, "grade", html);
    scenePlay(x, gen).then(function(){ return wait(1400); }).then(function(){ if(gen===SC.gen) sceneStep(gen, i+1); });
    return;
  }
  sceneShow(l, x, "prompt");
}
/* Grades whatever the continuous mic just heard against the line currently
   on screen. Only meaningful mid-rehearse, on his own line, before it has
   already been graded once - the recognizer keeps running the whole time
   (including over "they say" lines and the model-answer readback), so
   plenty of what reaches here is not actually his turn to speak.

   Right advances straight away. Wrong gets up to MAX_TRIES total (this one
   plus two more) on the same line, the mic already open - no restart
   needed. The third wrong attempt reveals the line and holds for REVEAL_MS
   so there is real time to read it, rather than snapping straight to the
   next line. */
function sceneOnHeard(alts){
  var sc=SC.cur; if(!sc || SC.mode!=="rehearse" || SC.line<0) return;
  var l=sc.lines[SC.line]; if(l.who!=="you") return;
  var x=sceneLine(l); if(!x) return;
  // a continuous session can occasionally split one utterance into two
  // final results before the first has finished advancing the line; bump
  // the generation the moment a result is accepted, same as sceneMicTap
  // does, so only the latest one actually moves the round forward
  SC.gen++; var gen=SC.gen;
  var g=sceneGrade(x.kana, alts); SC.mic="ok";
  // the try count is per line, not per call - it must only reset when the
  // LINE changes, never on every result, or a retry could never count past one
  if(SC._failSid!==x.id){ SC._failSid=x.id; SC._tries=0; }
  SC._tries++;
  if(SC.results.length && SC.results[SC.results.length-1].sid===x.id) SC.results.pop();
  SC.results.push({sid:x.id, verdict:g.verdict, sim:g.sim, heard:g.heard, err:null, tries:SC._tries});
  var label=({good:"Good",close:"Close",missed:"Not that"})[g.verdict];
  if(g.verdict==="good"){
    SC._tries=0;
    var html='<div class="scv good">Good</div><div class="schrd">heard <b>'+esc(g.heardRomaji||"")+'</b></div>';
    sceneShow(l, x, "grade", html);
    scenePlay(x, gen).then(function(){ return wait(700); }).then(function(){ if(gen===SC.gen) sceneStep(gen, SC.line+1); });
    return;
  }
  if(SC._tries<MAX_TRIES){
    var rhtml='<div class="scv '+g.verdict+'">'+label+'</div>'+
      '<div class="schrd">heard <b>'+esc(g.heardRomaji||"")+'</b> &middot; try again ('+SC._tries+' of '+MAX_TRIES+')</div>';
    sceneShow(l, x, "grade", rhtml);
    // the mic is still the same open session - just go back to prompting
    // for this same line once he has had a moment to read the feedback
    setTimeout(function(){ if(gen===SC.gen) sceneShow(l, x, "prompt"); }, 1000);
    return;
  }
  // out of tries: reveal the line and hold, then move on
  SC._tries=0;
  var fhtml='<div class="scv missed">Answer</div><div class="schrd">'+esc(x.romaji)+'</div>'+
    '<div class="schrd">you said <b>'+esc(g.heardRomaji||"nothing clear")+'</b></div>';
  sceneShow(l, x, "grade", fhtml);
  scenePlay(x, gen).then(function(){ return wait(REVEAL_MS); }).then(function(){ if(gen===SC.gen) sceneStep(gen, SC.line+1); });
}
/* a tap-to-speak fallback for a phone that will not open the microphone on
   its own - same right-advances / wrong-retries-up-to-MAX_TRIES rule as the
   continuous path above, just one explicit tap per attempt instead of the
   mic staying open on its own. */
function sceneMicTap(){
  var gen=SC.gen, sc=SC.cur; if(!sc || SC.line<0) return;
  var l=sc.lines[SC.line], x=sceneLine(l); if(l.who!=="you") return;
  SC.gen++; gen=SC.gen;
  sceneShow(l, x, "prompt");
  listenOnce(SC_LISTEN_MS, null, "scState").then(function(r){
    if(gen!==SC.gen) return;
    if(!r.alts.length){
      // nothing heard is not an attempt to grade - unscored, moves on
      if(SC.results.length && SC.results[SC.results.length-1].sid===x.id) SC.results.pop();
      SC.results.push({sid:x.id, verdict:"none", sim:0, heard:"", err:r.err||null});
      SC._tries=0;
      sceneShow(l, x, "grade", '<div class="scv none">Nothing heard</div>');
      return scenePlay(x, gen).then(function(){ return wait(900); }).then(function(){ if(gen===SC.gen) sceneStep(gen, SC.line+1); });
    }
    var g=sceneGrade(x.kana, r.alts);
    if(SC._failSid!==x.id){ SC._failSid=x.id; SC._tries=0; }
    SC._tries++;
    if(SC.results.length && SC.results[SC.results.length-1].sid===x.id) SC.results.pop();
    SC.results.push({sid:x.id, verdict:g.verdict, sim:g.sim, heard:g.heard, err:null, tries:SC._tries});
    var label=({good:"Good",close:"Close",missed:"Not that"})[g.verdict];
    if(g.verdict==="good"){
      SC._tries=0;
      sceneShow(l, x, "grade", '<div class="scv good">Good</div><div class="schrd">heard <b>'+esc(g.heardRomaji||"")+'</b></div>');
      return scenePlay(x, gen).then(function(){ return wait(700); }).then(function(){ if(gen===SC.gen) sceneStep(gen, SC.line+1); });
    }
    if(SC._tries<MAX_TRIES){
      sceneShow(l, x, "grade", '<div class="scv '+g.verdict+'">'+label+'</div>'+
        '<div class="schrd">heard <b>'+esc(g.heardRomaji||"")+'</b> &middot; try again ('+SC._tries+' of '+MAX_TRIES+')</div>');
      document.getElementById("scMicBtn").hidden=false;
      return;
    }
    SC._tries=0;
    sceneShow(l, x, "grade", '<div class="scv missed">Answer</div><div class="schrd">'+esc(x.romaji)+'</div>'+
      '<div class="schrd">you said <b>'+esc(g.heardRomaji||"nothing clear")+'</b></div>');
    return scenePlay(x, gen).then(function(){ return wait(REVEAL_MS); }).then(function(){ if(gen===SC.gen) sceneStep(gen, SC.line+1); });
  });
}
/* Skip this line unscored - for a mic that will not cooperate, or a word he
   just wants past. Only meaningful on his own lines, mid-listen. */
function sceneSkipTap(){
  var sc=SC.cur; if(!sc || SC.line<0) return;
  var l=sc.lines[SC.line]; if(l.who!=="you") return;
  var x=sceneLine(l); if(!x) return;
  listenCancel();
  var gen=++SC.gen; SC._tries=0;
  if(SC.results.length && SC.results[SC.results.length-1].sid===x.id) SC.results.pop();
  SC.results.push({sid:x.id, verdict:"none", sim:0, heard:"", err:"skipped"});
  document.getElementById("scMicBtn").hidden=true;
  sceneStep(gen, SC.line+1);
}
/* Reveal the model line without grading whatever he said - same "unscored"
   result as Skip, but shows the answer first and plays it before moving on. */
function sceneShowTap(){
  var sc=SC.cur; if(!sc || SC.line<0) return;
  var l=sc.lines[SC.line]; if(l.who!=="you") return;
  var x=sceneLine(l); if(!x) return;
  listenCancel();
  var gen=++SC.gen; SC._tries=0;
  if(SC.results.length && SC.results[SC.results.length-1].sid===x.id) SC.results.pop();
  SC.results.push({sid:x.id, verdict:"none", sim:0, heard:"", err:"shown"});
  document.getElementById("scMicBtn").hidden=true;
  sceneShow(l, x, "grade", '<div class="scv none">Answer</div><div class="schrd">'+esc(x.romaji)+'</div>');
  scenePlay(x, gen).then(function(){ return wait(1400); }).then(function(){ sceneStep(gen, SC.line+1); });
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
  for(var i=0;i<SC.results.length;i++){ html+=sceneHistRow(SC.results[i]); }
  list.innerHTML=html;
}
/* One row of the rehearsed-scene history: what he was asked, the correct
   line, what he actually said (his last attempt, if the line took more
   than one), and a numeric grade - replacing a plain colour swatch with
   the four things he asked to see. */
function sceneHistRow(r){
  var x=SIDX[r.sid]; if(!x) return "";
  var pct=verdictPct(r.verdict), gradeTxt = pct!=null ? pct+"%" : "—";
  var heardTxt = r.err==="skipped" ? "Skipped" : r.err==="shown" ? "Shown" :
    (r.heard ? heardRomaji(r.heard, r.verdict, x.kana) : "Nothing heard");
  return '<div class="scres '+historyColor(r.verdict, r.tries||0)+'">'+
    '<div class="scres-q"><span class="lbl">You say</span><b>'+esc(x.en)+'</b></div>'+
    '<div class="scres-a"><span class="lbl">Correct</span><b>'+esc(x.romaji)+'</b></div>'+
    '<div class="scres-h"><span class="lbl">You said</span><b>'+esc(heardTxt)+'</b></div>'+
    '<div class="scres-g">'+gradeTxt+'</div>'+
  '</div>';
}
function sceneStop(){ SC.gen++; contListenStop(); audStop(); }
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
  var show=document.getElementById("scShowBtn"); if(show) show.addEventListener("click",sceneShowTap);
  var skip=document.getElementById("scSkipBtn"); if(skip) skip.addEventListener("click",sceneSkipTap);
  var again=document.getElementById("scAgain"); if(again) again.addEventListener("click",function(){ sceneRun("rehearse"); });
  var dn=document.getElementById("scDoneBtn"); if(dn) dn.addEventListener("click",function(){ sceneStop(); sceneOpen(SC.cur.id); });
  var stop=document.getElementById("scStop"); if(stop) stop.addEventListener("click",function(){ sceneStop(); sceneOpen(SC.cur.id); });
}
