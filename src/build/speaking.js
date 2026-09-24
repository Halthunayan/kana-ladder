/* ---------- Speaking ----------
   A drill over the same words Focus already found weak, tested by voice
   instead of a tap. A grid of tickets stands for the words in this round;
   the stage below asks one at a time, half in English and half in Japanese
   (each word's own direction is still a coin flip), grouped so all the
   words asked in one direction come before the other - that keeps one
   continuous mic session open across a whole language block, only
   reopening at the block boundary. The word or line he is asked for is
   shown on screen, kana and romaji or the English gloss - never spoken
   aloud, since he reads it himself; the pause before the mic opens just
   holds for as long as reading it would take. Say the answer: right turns
   that ticket green and moves on, wrong turns it red and asks the same
   word again, no click either way. Stuck on one word: Show answer or Skip
   move past it unscored. Tapping any ticket that has been asked shows
   what it was. Nothing here touches the schedule, the same as Focus and
   the car. */
var SP_WORDS=12, SP_LISTEN_MS=6000;
var SP_PASS_JA=0.62, SP_PASS_EN=0.6;
var SP={ids:[], dir:{}, state:{}, cur:-1, gen:0, running:false, mic:"untried"};

function spCard(id){ return IDX[id]; }
/* the same weak-word pool Focus draws its round from, so "the words in
   Focus" means the same twelve words either mode would open with right now */
function speakingWords(){
  var weak=weakWords();
  if(weak.length) return shuffle(weak.slice(0, SP_WORDS)).map(function(w){ return w.id; });
  /* nothing is going badly: fall back to a mixed draw over what has been met,
     the same fallback startFocus uses, so speaking never dead ends either */
  var keys=shuffle(practiceQueue()), seen={}, out=[];
  for(var i=0;i<keys.length && out.length<SP_WORDS;i++){
    var id=keys[i].split("|")[0];
    // practiceQueue mixes in sentences and conjugation drills; IDX indexes
    // all three under one id space (t:"w"/"s"/"g"), so a bare id lookup does
    // not tell them apart. Speaking is a word drill, so only "w" qualifies:
    // anything else was a full sentence sitting in a single tile, breaking
    // both the layout and the word-level grading thresholds.
    if(seen[id] || !IDX[id] || IDX[id].t!=="w") continue;
    seen[id]=1; out.push(id);
  }
  return out;
}

/* ---- grading the English half: normalise, split the gloss's alternatives
   on "/", and let the same edit-distance similarity that grades Japanese
   grade this too; a Levenshtein ratio does not care what alphabet it is
   given. "to eat" and "eat" are treated as the same answer. */
function enNorm(s){
  return String(s||"").toLowerCase().replace(/\([^)]*\)/g,"")
    .replace(/[^a-z0-9' ]+/g," ").replace(/\s+/g," ").trim();
}
function enBare(s){ return s.replace(/^(to|a|an|the)\s+/,""); }
function enAlts(en){
  var out=[];
  String(en||"").split("/").forEach(function(part){
    var n=enNorm(part); if(!n) return;
    out.push(n); var b=enBare(n); if(b!==n) out.push(b);
  });
  return out.length ? out : [enNorm(en)];
}
function enGrade(target, alts){
  var cands=enAlts(target), best={sim:-1, heard:alts[0]||""};
  for(var i=0;i<alts.length;i++){
    var h=enNorm(alts[i]), hb=enBare(h);
    for(var j=0;j<cands.length;j++){
      var s=Math.max(kanaSim(cands[j], h), kanaSim(cands[j], hb));
      if(s>best.sim) best={sim:s, heard:alts[i]};
    }
  }
  return best;
}
/* the Japanese half reuses the scene grader's own math, at a lower bar: one
   wrong mora in a two mora word is a much bigger hit than in a full sentence,
   so a word that would grade "close" in a scene counts as right here */
function spGradeJa(targetKana, alts){
  var want=kanaKey(targetKana), best={sim:-1, heard:alts[0]||""};
  for(var i=0;i<alts.length;i++){
    var s=kanaSim(want, kanaKey(alts[i]));
    if(s>best.sim) best={sim:s, heard:alts[i]};
  }
  best.romaji=kanaToRomaji(kanjiToKana(best.heard));
  return best;
}

/* ---- the board ---- */
function spTileClass(i){
  var st=SP.state[i];
  if(st==="good") return "good";
  if(st==="bad") return "bad";
  if(st==="skip") return "skip";
  return i===SP.cur ? "cur" : "pend";
}
function spRenderTiles(){
  var host=document.getElementById("spTiles"); if(!host) return;
  var html="";
  for(var i=0;i<SP.ids.length;i++){
    html+='<button class="sptile s-'+spTileClass(i)+'" data-i="'+i+'" aria-label="word '+(i+1)+
      (SP.state[i]?" answered":" not asked yet")+'"></button>';
  }
  host.innerHTML=html;
  var n=document.getElementById("spProg"); if(n) n.textContent=(SP.cur+1)+" / "+SP.ids.length;
}
function spPeek(i){
  if(i<0 || i>=SP.ids.length || !SP.state[i]) return;
  var c=spCard(SP.ids[i]), el=document.getElementById("spPeek"); if(!el) return;
  el.innerHTML='<div class="kana sm">'+esc(c.kana)+'</div>'+
    '<div class="romaji sm">'+esc(c.romaji)+'</div>'+
    '<div class="conj-gloss">'+esc(c.en)+'</div>';
  el.hidden=false;
  clearTimeout(SP._peekT);
  SP._peekT=setTimeout(function(){ el.hidden=true; }, 4500);
}

/* ---- the stage ---- */
function spStageShow(c, dir){
  document.getElementById("spPeek").hidden=true;
  var prompt=document.getElementById("spPrompt");
  prompt.innerHTML = dir==="j"
    ? '<div class="kana">'+esc(c.kana)+'</div><div class="romaji">'+esc(c.romaji)+'</div>'
    : '<div class="spen">'+esc(c.en)+'</div>';
  document.getElementById("spDirChip").textContent = dir==="j" ? "JP → EN, say it" : "EN → JP, say it";
  document.getElementById("spHeard").innerHTML="";
  document.getElementById("spState").textContent="";
  document.getElementById("spState").className="spstate";
  document.getElementById("spMicBtn").hidden=true;
}
function spShowHeard(g, pass, dir){
  var hd=document.getElementById("spHeard");
  var shown = dir==="j" ? (g.heard||"") : (g.romaji||"");
  hd.innerHTML = shown
    ? '<span class="scv '+(pass?"good":"missed")+'">'+(pass?"Good":"Not that")+'</span>'+
      '<div class="schrd">heard <b>'+esc(shown)+'</b></div>'
    : '<span class="scv none">Nothing clear</span>';
}
function spListening(){
  var st=document.getElementById("spState");
  st.textContent="listening"; st.className="spstate prompt";
}
/* one word of the round: show it, listen, grade, then move on or retry */
function spAsk(i){
  if(!SP.running) return;
  if(i>=SP.ids.length){ spFinish(); return; }
  SP.cur=i;
  var id=SP.ids[i], c=spCard(id), dir=SP.dir[id];
  var gen=++SP.gen;
  // the quiet retry on a wrong answer calls spAsk on this same index again,
  // so the fail count must only reset when the WORD changes, never on
  // every call, or it can never count past one
  if(SP._failId!==id){ SP._failId=id; SP._fails=0; }
  spRenderTiles();
  spStageShow(c, dir);
  var lang = dir==="j" ? "en-US" : "ja-JP";
  // words are grouped by direction (see speakingStart), so the mic only
  // needs to reopen at a language boundary - everywhere else within the
  // same block, the session already running keeps listening straight
  // through into this word
  var freshBlock = (i===0) || (SP.dir[SP.ids[i-1]]!==dir);
  // neither direction speaks the prompt aloud - he reads the kana/romaji
  // or the English gloss on screen himself; this just holds for as long
  // as reading it would take before the mic opens
  var pre = dir==="j" ? wait(estSpeechMs(c.kana))
                      : wait(500+Math.min(1300, String(c.en||"").length*16));
  pre.then(function(){
    if(gen!==SP.gen) return;
    if(!recAvailable()){
      // no grading is possible here: show the answer and move on, unscored
      SP.mic="unavailable";
      document.getElementById("spState").textContent="No microphone here";
      spShowHeard({heard:dir==="j"?c.en:c.kana, romaji:c.romaji}, null, dir);
      SP.state[i]="skip"; spRenderTiles();
      setTimeout(function(){ if(gen===SP.gen) spAsk(i+1); }, 1400);
      return;
    }
    spListening();
    if(freshBlock || SP._contLang!==lang){
      SP._contLang=lang;
      contListenStart(lang, spOnHeard, "spState", function(){
        SP.mic="blocked";
        document.getElementById("spState").textContent="Microphone blocked. Allow it, then tap to try again.";
        document.getElementById("spMicBtn").hidden=false;
        SP._contLang=null;
      });
    }
    // else: the continuous session opened for an earlier word in this same
    // language block is still listening; nothing more to start here

    // continuous mode never gives up on its own - it just waits, however
    // long that takes - but total silence for a while is worth a hint,
    // since Show answer / Skip are the way past a word it genuinely is
    // not hearing
    setTimeout(function(){
      if(gen===SP.gen && SP.cur===i) document.getElementById("spState").textContent="Still not hearing you. Say it again, or tap Show answer / Skip.";
    }, SP_LISTEN_MS);
  });
}
/* Grades whatever the continuous mic just heard against whichever word is
   current at the moment the result arrives - one session can span several
   words in the same language block, so "current" has to be read live
   rather than captured back when that session was opened. */
function spOnHeard(alts){
  if(SP.cur<0 || SP.cur>=SP.ids.length) return;
  // claim this result the same way sceneOnHeard/sceneMicTap do, so a
  // continuous session that occasionally splits one answer into two final
  // results can't advance the round twice
  SP.gen++; var gen=SP.gen;
  var i=SP.cur, id=SP.ids[i], c=spCard(id), dir=SP.dir[id];
  var g = dir==="j" ? enGrade(c.en, alts) : spGradeJa(c.kana, alts);
  var pass = dir==="j" ? g.sim>=SP_PASS_EN : g.sim>=SP_PASS_JA;
  spShowHeard(g, pass, dir);
  if(pass){
    SP._fails=0; SP.mic="ok";
    SP.state[i]="good"; spRenderTiles();
    setTimeout(function(){ if(gen===SP.gen) spAsk(i+1); }, 650);
  } else {
    SP.mic="ok";
    SP._fails=(SP._fails||0)+1;
    if(SP._fails>=4) document.getElementById("spState").textContent="Still not quite. Say it again, or tap Show answer / Skip.";
    SP.state[i]="bad"; spRenderTiles();
    setTimeout(function(){ if(gen===SP.gen) spAsk(i); }, 950);
  }
}
/* the tap-to-speak fallback for a phone that will not open the mic on its own */
function spMicTap(){
  if(SP.cur<0 || SP.cur>=SP.ids.length) return;
  var gen=++SP.gen, id=SP.ids[SP.cur], c=spCard(id), dir=SP.dir[id];
  document.getElementById("spMicBtn").hidden=true;
  spListening();
  listenOnce(SP_LISTEN_MS, dir==="j" ? "en-US" : "ja-JP", "spState").then(function(r){
    if(gen!==SP.gen) return;
    if(!r.alts.length){
      document.getElementById("spState").textContent="Still nothing heard.";
      document.getElementById("spMicBtn").hidden=false;
      return;
    }
    var g = dir==="j" ? enGrade(c.en, r.alts) : spGradeJa(c.kana, r.alts);
    var pass = dir==="j" ? g.sim>=SP_PASS_EN : g.sim>=SP_PASS_JA;
    spShowHeard(g, pass, dir);
    if(pass){ SP.state[SP.cur]="good"; spRenderTiles(); setTimeout(function(){ if(gen===SP.gen) spAsk(SP.cur+1); }, 650); }
    else { SP.state[SP.cur]="bad"; spRenderTiles(); document.getElementById("spMicBtn").hidden=false; }
  });
}

/* Skip this word unscored - for a mic that will not cooperate. */
function spSkipTap(){
  if(SP.cur<0 || SP.cur>=SP.ids.length) return;
  listenCancel();
  var gen=++SP.gen;
  document.getElementById("spMicBtn").hidden=true;
  document.getElementById("spHeard").innerHTML='<span class="scv none">Skipped</span>';
  SP.state[SP.cur]="skip"; spRenderTiles();
  setTimeout(function(){ if(gen===SP.gen) spAsk(SP.cur+1); }, 500);
}
/* Reveal the answer without grading whatever he said, same unscored result
   as Skip but shows the word first so he can hear/read it before moving on. */
function spShowTap(){
  if(SP.cur<0 || SP.cur>=SP.ids.length) return;
  listenCancel();
  var gen=++SP.gen, id=SP.ids[SP.cur], c=spCard(id), dir=SP.dir[id];
  document.getElementById("spMicBtn").hidden=true;
  var shown = dir==="j" ? c.en : c.romaji;
  document.getElementById("spHeard").innerHTML='<span class="scv none">Answer</span><div class="schrd">'+esc(shown||"")+'</div>';
  SP.state[SP.cur]="skip"; spRenderTiles();
  setTimeout(function(){ if(gen===SP.gen) spAsk(SP.cur+1); }, 1400);
}
function spFinish(){
  var ok=0; for(var i=0;i<SP.ids.length;i++) if(SP.state[i]==="good") ok++;
  document.getElementById("spStage").hidden=true;
  var done=document.getElementById("spDone");
  document.getElementById("spDoneHead").textContent="Round done";
  document.getElementById("spDoneSub").textContent=
    ok+" of "+SP.ids.length+" said back correctly. Nothing here changed your schedule.";
  done.hidden=false;
  SP.running=false;
}
function speakingStart(){
  var ids=speakingWords();
  if(!ids.length){ toast("Nothing met yet. Study a few words first."); return; }
  SP.dir={}; SP.state={}; SP.cur=-1; SP.running=true; SP.mic="untried"; SP._contLang=null;
  for(var i=0;i<ids.length;i++) SP.dir[ids[i]] = Math.random()<0.5 ? "e" : "j";
  // each word's own direction is still a coin flip, but the order they're
  // asked in is grouped by direction so the mic can stay open across a
  // whole language block instead of reopening before every single word
  ids.sort(function(a,b){ return SP.dir[a]===SP.dir[b] ? 0 : (SP.dir[a]<SP.dir[b] ? -1 : 1); });
  SP.ids=ids;
  document.getElementById("spDone").hidden=true;
  document.getElementById("spStage").hidden=false;
  document.getElementById("tabs").classList.add("hide");
  go("speak");
  spRenderTiles();
  spAsk(0);
}
function speakingAgain(){ spStop(); speakingStart(); }
function spStop(){
  SP.gen++; SP.running=false; SP._contLang=null;
  contListenStop();
  audStop();
}
function speakingLeave(){
  spStop();
  document.getElementById("tabs").classList.remove("hide");
  go("home"); render();
}
function bindSpeaking(){
  var b=document.getElementById("speakBtn");
  if(b) b.addEventListener("click", speakingStart);
  var back=document.getElementById("spBack"); if(back) back.addEventListener("click", speakingLeave);
  var stop=document.getElementById("spStop"); if(stop) stop.addEventListener("click", speakingLeave);
  var mic=document.getElementById("spMicBtn"); if(mic) mic.addEventListener("click", spMicTap);
  var show=document.getElementById("spShowBtn"); if(show) show.addEventListener("click", spShowTap);
  var skip=document.getElementById("spSkipBtn"); if(skip) skip.addEventListener("click", spSkipTap);
  var again=document.getElementById("spAgain"); if(again) again.addEventListener("click", speakingAgain);
  var dn=document.getElementById("spDoneBtn"); if(dn) dn.addEventListener("click", speakingLeave);
  var host=document.getElementById("spTiles");
  if(host) host.addEventListener("click", function(e){
    var t=e.target.closest && e.target.closest(".sptile"); if(!t) return;
    spPeek(parseInt(t.dataset.i,10));
  });
}
