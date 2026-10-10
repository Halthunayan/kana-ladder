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
   that ticket green, grades 100%, and moves on. Wrong turns it red, grades
   70% or 0% by how close it was, and asks the same word again - up to
   three tries total. A third wrong try reveals the answer and holds for a
   few seconds before moving on. Stuck on one word: Show answer or Skip
   move past it unscored. Tapping any ticket that has been asked shows
   the question, the correct answer, what he actually said, and its grade -
   the same history the finish screen lists for the whole round. Nothing
   here touches the schedule, the same as Focus and the car. */
var SP_WORDS=12, SP_LISTEN_MS=6000;
var SP_PASS_JA=0.62, SP_PASS_EN=0.6;
/* a middle "close" band below pass, for a numeric grade rather than a flat
   pass/fail - same proportional gap Scenes keeps between its own pass and
   close thresholds (0.75 to 0.55), scaled down to these lower single-word
   bars. MAX_TRIES and REVEAL_MS are shared with Scenes, declared there. */
var SP_CLOSE_JA=0.42, SP_CLOSE_EN=0.4;
var SP={ids:[], dir:{}, state:{}, cur:-1, gen:0, running:false, mic:"untried",
  tries:{}, heard:{}, grade:{}, verdict:{}, reason:{}, locked:{}};

function spCard(id){ return IDX[id]; }
/* the same weak-word pool Focus draws its round from, so "the words in
   Focus" means the same twelve words either mode would open with right now */
function speakingWords(){
  var weak=weakWords();
  var okW=function(id){ var c=IDX[id]; return c && c.t==="w" && !patternHeld(c); };
  weak=weak.filter(function(w){ return okW(w.id); });
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
    if(seen[id] || !okW(id)) continue;
    seen[id]=1; out.push(id);
  }
  return out;
}

/* ---- grading the English half ----
   The gloss is cleaned first (notes and the tilde off) and split on every
   separator it uses, "/", ";" and ",": splitting on "/" alone made "until"
   fail against "until, as far as" and "must" against "must ~, have to ~".
   Then a few words that carry the whole meaning have to be there: "good
   morning" used to pass for "good evening", and "that one" for "this one". */
var EN_NUM=["zero","one","two","three","four","five","six","seven","eight","nine","ten",
  "eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
var EN_TENS=["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
/* digits the recogniser writes ("100", "1,000") read as the words in the gloss */
function enNumWords(n){
  if(n<20) return EN_NUM[n];
  if(n<100) return EN_TENS[Math.floor(n/10)]+(n%10?" "+EN_NUM[n%10]:"");
  if(n<1000) return EN_NUM[Math.floor(n/100)]+" hundred"+(n%100?" "+enNumWords(n%100):"");
  if(n<100000) return enNumWords(Math.floor(n/1000))+" thousand"+(n%1000?" "+enNumWords(n%1000):"");
  return String(n);
}
/* "don't" has to meet the "not" the gloss is keyed on: "I understand" passed
   for "I don't understand" because the two never compared as words */
function enNorm(s){
  return String(s||"").toLowerCase().replace(/[\u2018\u2019]/g,"'").replace(/\([^)]*\)/g,"").replace(/~/g," ")
    .replace(/\bwon't\b/g,"will not").replace(/\bcan't\b/g,"can not").replace(/\bcannot\b/g,"can not")
    .replace(/n't\b/g," not")
    .replace(/(\d),(\d{3})\b/g,"$1$2")
    .replace(/[^a-z0-9' ]+/g," ").replace(/\b\d{1,5}\b/g,function(m){ return enNumWords(+m); })
    .replace(/\ba (hundred|thousand)\b/g,"one $1")
    .replace(/\s+/g," ").trim();
}
function enBare(s){ return s.replace(/^(to|a|an|the)\s+/,""); }
/* the alternatives a right answer can match: notes, brackets and a trailing
   register word (", polite", "; said by staff") are not answers, so saying
   "polite" no longer passes; "(not) any more" keeps its "not" */
var EN_QUAL={"polite":1,"said by staff":1,"used by staff":1,"everyday":1,"casual":1,"formal":1,"humble":1,"honorific":1};
function enAlts(en){
  var t=String(en||"").replace(/～/g,"~").replace(/\(\s*not\s*\)/g,"not").replace(/\[[^\]]*\]/g," ").replace(/\([^)]*\)/g," ");
  var parts=t.split(/[\/;,]/).map(function(x){ return x.trim(); }).filter(Boolean);
  while(parts.length>1 && EN_QUAL[parts[parts.length-1].toLowerCase().replace(/[ .]+$/,"")]) parts.pop();
  var out=[];
  parts.forEach(function(part){
    var n=enNorm(part); if(!n) return;
    out.push(n); var b=enBare(n); if(b!==n) out.push(b);
  });
  return out.length ? out : [enNorm(en)];
}
var EN_KEY={"this":1,"that":1,"these":1,"those":1,"here":1,"there":1,"morning":1,"afternoon":1,"evening":1,"night":1,
  "yes":1,"no":1,"not":1,"left":1,"right":1,"up":1,"down":1,"before":1,"after":1,"yesterday":1,"today":1,"tomorrow":1,
  "one":1,"two":1,"three":1,"four":1,"five":1,"six":1,"seven":1,"eight":1,"nine":1,"ten":1,"hundred":1,"thousand":1,
  "come":1,"go":1,"buy":1,"sell":1,"open":1,"close":1,"hot":1,"cold":1,"big":1,"small":1,"understand":1};
var EN_NEG=/^(in|un|im|non|dis|il|ir)/;
function enKeyOk(cand, heard){
  var h={}, hs=heard.split(" "); hs.forEach(function(w){ h[w]=1; });
  var ws=cand.split(" "), cw={}; ws.forEach(function(w){ cw[w]=1; });
  for(var i=0;i<ws.length;i++) if(EN_KEY[ws[i]] && !h[ws[i]]) return false;
  // the reverse: a "not" or "no" he added turns a right answer into its opposite
  if((h["not"] && !cw["not"]) || (h["no"] && !cw["no"] && !cw["not"])) return false;
  // one side negated by a prefix: "expensive" is not "inexpensive"
  function neg(a, b){ for(var j=0;j<a.length;j++){ var m=a[j].match(EN_NEG);
    if(m && a[j].length-m[0].length>=4){ var rest=a[j].slice(m[0].length); if(b[rest] && !b[a[j]]) return true; } } return false; }
  if(neg(ws, h) || neg(hs, cw)) return false;
  return true;
}
function enGrade(target, alts){
  var cands=enAlts(target), best={sim:-1, heard:alts[0]||"", keyOk:true};
  for(var i=0;i<alts.length;i++){
    var h=enNorm(alts[i]), hb=enBare(h);
    for(var j=0;j<cands.length;j++){
      var s=Math.max(kanaSim(cands[j], h), kanaSim(cands[j], hb));
      var ok=enKeyOk(cands[j], h);
      if(!ok) s=Math.min(s, SP_PASS_EN-0.01);
      if(s>best.sim) best={sim:s, heard:alts[i], keyOk:ok};
    }
  }
  return best;
}
/* the Japanese half reuses the scene grader's own math, at a lower bar: one
   wrong mora in a two mora word is a much bigger hit than in a full sentence,
   so a word that would grade "close" in a scene counts as right here. Two
   limits: a word of four kana or fewer has to be heard exactly (juu, ten, and
   kyuu, nine, differ by one sound and used to pass for each other), and a
   polite ending has to be the right one (wakarimasen, I don't understand,
   passed for wakarimashita, understood). */
var JA_END=["ませんでした","ました","ません","ます","ましょう","たいです","です"];
function jaEnding(k){ for(var i=0;i<JA_END.length;i++) if(k.slice(-JA_END[i].length)===JA_END[i]) return JA_END[i]; return ""; }
function spGradeJa(targetKana, alts){
  var want=kanaKey(targetKana), best={sim:-1, heard:alts[0]||""};
  for(var i=0;i<alts.length;i++){
    var got=kanaKey(alts[i]), s=kanaSim(want, got);
    if(want.length<=4 && got!==want) s=Math.min(s, SP_PASS_JA-0.01);
    var we=jaEnding(want); if(we && jaEnding(got)!==we) s=Math.min(s, SP_PASS_JA-0.01);
    if(s>best.sim) best={sim:s, heard:alts[i]};
  }
  best.romaji=kanaToRomaji(kanjiToKana(best.heard));
  return best;
}

/* ---- the board ---- */
function spTileClass(i){
  var st=SP.state[i];
  // right first try is green; right on the second or third try is yellow -
  // the same pass for the grade, but it took more than one attempt
  if(st==="good") return (SP.tries[i]||1)<=1 ? "good" : "retry";
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
/* Tapping an answered ticket shows the same thing the finish screen's
   history does for that one word: what he was asked, the correct answer,
   what he actually said, and its grade - not just the tile's colour. */
function spPeek(i){
  if(i<0 || i>=SP.ids.length || !SP.state[i]) return;
  var el=document.getElementById("spPeek"); if(!el) return;
  el.innerHTML=spHistRow(i);
  el.hidden=false;
  clearTimeout(SP._peekT);
  SP._peekT=setTimeout(function(){ el.hidden=true; }, 4500);
}
/* One row of the round's history for word i: the question as shown, the
   correct answer, his last spoken attempt (or why there wasn't one to
   grade), and a numeric grade. Shared by the live peek panel above and the
   finish screen's full list. */
function spHistRow(i){
  var id=SP.ids[i], c=spCard(id), dir=SP.dir[id];
  var verdict = SP.verdict[i] || "none";
  var q = dir==="j" ? (c.kana+" ("+c.romaji+")") : c.en;
  var correct = dir==="j" ? c.en : (c.romaji || c.kana);
  var heardTxt = SP.reason[i]==="skipped" ? "Skipped" :
    SP.reason[i]==="shown" ? "Shown" :
    SP.reason[i]==="no-mic" ? "No microphone" :
    (SP.heard[i] ? SP.heard[i] : "Nothing heard");
  var pct=SP.grade[i], gradeTxt = pct!=null ? pct+"%" : "-";
  return '<div class="scres '+historyColor(verdict, SP.tries[i]||0)+'">'+
    '<div class="scres-q"><span class="lbl">'+(dir==="j"?"Say in English":"Say in Japanese")+'</span><b>'+esc(q)+'</b></div>'+
    '<div class="scres-a"><span class="lbl">Correct</span><b>'+esc(correct)+'</b></div>'+
    '<div class="scres-h"><span class="lbl">You said</span><b>'+esc(heardTxt)+'</b></div>'+
    '<div class="scres-g">'+gradeTxt+'</div>'+
  '</div>';
}

/* ---- the stage ---- */
function spStageShow(c, dir){
  document.getElementById("spPeek").hidden=true;
  var prompt=document.getElementById("spPrompt");
  prompt.innerHTML = dir==="j"
    ? '<div class="kana">'+esc(c.kana)+'</div><div class="romaji">'+esc(c.romaji)+'</div>'
    : '<div class="spen">'+esc(c.en)+'</div>';
  document.getElementById("spDirChip").textContent = dir==="j" ? "Say the meaning in English" : "Say it in Japanese";
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
/* With audio prompts on, the prompt and the answer are spoken, so a round
   can be done without looking: the Japanese clip for a Japanese prompt, the
   English clip (read without its notes) for an English one. The mic is muted
   while they play. */
function spAudioOn(){ return S.settings.spAudio===true && audOn(); }
function spPlay(key, gen){
  if(!spAudioOn()) return Promise.resolve();
  return audioGate(audPlayWA(key, function(){ return gen===SP.gen; })).then(function(){});
}
function spPromptKey(id, dir){ return dir==="j" ? "wj:"+id : "we:"+id; }
function spAnswerKey(id, dir){ return dir==="j" ? "we:"+id : "wj:"+id; }
/* one word of the round: show it, listen, grade, then move on or retry */
function spAsk(i){
  if(!SP.running) return;
  if(i>=SP.ids.length){ spFinish(); return; }
  /* held shut until the prompt has been read: the answer to the previous word,
     said during its reveal, used to land here as try one of this word */
  SP.cur=i; SP.locked[i]=true;
  var id=SP.ids[i], c=spCard(id), dir=SP.dir[id];
  var gen=++SP.gen;
  spRenderTiles();
  spStageShow(c, dir);
  var lang = dir==="j" ? "en-US" : "ja-JP";
  var freshBlock = (i===0) || (SP.dir[SP.ids[i-1]]!==dir);
  var pre = spAudioOn() ? spPlay(spPromptKey(id,dir), gen)
          : (dir==="j" ? wait(estSpeechMs(c.kana)) : wait(500+Math.min(1300, String(c.en||"").length*16)));
  /* the language changes here: say so, and give him a moment to switch */
  if(freshBlock && i>0){
    var st0=document.getElementById("spState");
    st0.textContent = dir==="j" ? "Switching to English: say what each word means." : "Switching to Japanese: say each word in Japanese.";
    pre = pre.then(function(){ return wait(1400); });
  }
  pre.then(function(){
    if(gen!==SP.gen) return;
    SP.locked[i]=false;
    if(!recAvailable()){
      SP.mic="unavailable";
      SP.verdict[i]="none"; SP.reason[i]="no-mic"; SP.heard[i]=""; SP.grade[i]=null;
      document.getElementById("spState").textContent="No microphone here";
      spShowHeard({heard:dir==="j"?c.en:c.kana, romaji:c.romaji}, null, dir);
      SP.state[i]="skip"; spRenderTiles();
      setTimeout(function(){ if(gen===SP.gen) spAsk(i+1); }, 1400);
      return;
    }
    if(SP.mic==="blocked"){ spBlocked(); return; }
    spListening();
    if(freshBlock || SP._contLang!==lang || !CONT.running){
      SP._contLang=lang;
      contListenStart(lang, spOnHeard, "spState", function(){ SP.mic="blocked"; SP._contLang=null; spBlocked(); });
    }
    setTimeout(function(){
      if(gen===SP.gen && SP.cur===i && SP.mic!=="blocked" && !SP.locked[i])
        document.getElementById("spState").textContent="Still not hearing you. Say it again, or tap Show answer / Skip.";
    }, SP_LISTEN_MS);
  });
}
/* a blocked microphone is a state, not a pause: it stays on screen with the
   way out, instead of a pulsing "listening" that can never hear anything */
function spBlocked(){
  var st=document.getElementById("spState");
  st.textContent="Microphone blocked. On iPhone: Settings, Apps, Safari, Microphone: Allow (and Settings, General, Keyboard, Enable Dictation). Then tap below."; st.className="spstate blocked";
  document.getElementById("spMicBtn").hidden=false;
}
/* One attempt at the current word. Only while the word is still open: the mic
   stays on through the reveal, and saying the revealed answer used to turn a
   three-try miss into a pass. */
function spAttempt(alts, fromTap){
  if(!SP.running || SP.cur<0 || SP.cur>=SP.ids.length) return;
  var i=SP.cur; if(SP.locked[i]) return;
  var id=SP.ids[i], c=spCard(id), dir=SP.dir[id];
  /* graded first: "again" is the answer to mata, and "next" to tsugi, so a
     command word only acts as a command when it is not the right answer */
  var g = dir==="j" ? enGrade(c.en, alts) : spGradeJa(c.kana, alts);
  var pass = dir==="j" ? g.sim>=SP_PASS_EN : g.sim>=SP_PASS_JA;
  if(!pass){
    var cmd=voiceCmd(alts);
    if(cmd==="skip"){ spSkipTap(); return; }
    if(cmd==="show"){ spShowTap(); return; }
    if(cmd==="repeat"){ var g0=++SP.gen; if(spAudioOn()) spPlay(spPromptKey(id,dir), g0); return; }
  }
  if(!pass && dir==="j" && g.sim<SP_CLOSE_EN && spReadAloud(c, alts)){
    document.getElementById("spHeard").innerHTML='<span class="scv none">That was the Japanese</span>'+
      '<div class="schrd">heard <b>'+esc(alts[0]||"")+'</b></div>';
    document.getElementById("spState").textContent="Now say what it means in English. That one did not count as a try.";
    return;
  }
  SP.gen++; var gen=SP.gen;
  var close = dir==="j" ? g.sim>=SP_CLOSE_EN : g.sim>=SP_CLOSE_JA;
  var verdict = pass ? "good" : (close ? "close" : "missed");
  spShowHeard(g, pass, dir);
  SP.mic="ok";
  SP.heard[i] = dir==="j" ? (g.heard||"") : (g.romaji||"");
  SP.verdict[i]=verdict; SP.grade[i]=verdictPct(verdict);
  if(SP._failId!==id){ SP._failId=id; SP.tries[i]=0; }
  SP.tries[i]=(SP.tries[i]||0)+1;
  if(pass){
    SP.locked[i]=true; recordSpoken(id, true);
    SP.state[i]="good"; spRenderTiles();
    spPlay(spAnswerKey(id,dir), gen).then(function(){ return wait(650); }).then(function(){ if(gen===SP.gen) spAsk(i+1); });
    return;
  }
  if(SP.tries[i]>=MAX_TRIES){
    SP.locked[i]=true; recordSpoken(id, false);
    SP.state[i]="bad"; spRenderTiles();
    var reveal = dir==="j" ? c.en : (c.romaji||c.kana);
    document.getElementById("spHeard").innerHTML =
      '<span class="scv missed">Answer</span><div class="schrd">'+esc(reveal)+'</div>'+
      '<div class="schrd">you said <b>'+esc(SP.heard[i]||"nothing clear")+'</b></div>';
    document.getElementById("spState").textContent="";
    spPlay(spAnswerKey(id,dir), gen);
    setTimeout(function(){ if(gen===SP.gen) spAsk(i+1); }, REVEAL_MS);
    return;
  }
  document.getElementById("spState").textContent="Not quite ("+SP.tries[i]+" of "+MAX_TRIES+"). Say it again, or tap Show answer / Skip.";
  SP.state[i]="bad"; spRenderTiles();
  if(fromTap){ document.getElementById("spMicBtn").hidden=false; return; }
  setTimeout(function(){ if(gen===SP.gen) spAsk(i); }, 950);
}
/* The Japanese read aloud, not answered. On 10 Oct the first two words of the
   English block, de and en, each burned all three tries as "D" and "N": the
   recogniser, listening for English, wrote down the Japanese word he read off
   the card. Reading the prompt is not an answer, so it is not a try. Letters
   are read as their names, the way the recogniser spells a sound it cannot
   place (D for de, N for en). */
var SP_LETTER={a:"ei",b:"bi",c:"shi",d:"de",e:"i",f:"efu",g:"ji",h:"eichi",i:"ai",j:"jei",k:"kei",
  l:"eru",m:"emu",n:"en",o:"o",p:"pi",q:"kyu",r:"aru",s:"esu",t:"ti",u:"yu",v:"bui",w:"daburu",
  x:"ekusu",y:"wai",z:"zetto"};
function spReadAloud(c, alts){
  var want=String(c.romaji||"").toLowerCase().replace(/[^a-z]/g,"");
  if(!want) return false;
  for(var i=0;i<alts.length;i++){
    var raw=String(alts[i]||"").toLowerCase(), flat=raw.replace(/[^a-z]/g,"");
    if(!flat) continue;
    var named=raw.split(/[^a-z]+/).filter(Boolean).map(function(w){ return w.length===1 && SP_LETTER[w] ? SP_LETTER[w] : w; }).join("");
    if(flat===want || named===want || kanaSim(want, flat)>=0.75 || kanaSim(want, named)>=0.75) return true;
  }
  return false;
}
function spOnHeard(alts){ spAttempt(alts, false); }
function spMicTap(){
  if(SP.cur<0 || SP.cur>=SP.ids.length) return;
  var gen=++SP.gen, i=SP.cur, id=SP.ids[i], dir=SP.dir[id];
  document.getElementById("spMicBtn").hidden=true;
  spListening();
  listenOnce(SP_LISTEN_MS, dir==="j" ? "en-US" : "ja-JP", "spState").then(function(r){
    if(gen!==SP.gen) return;
    if(r.err && /not-allowed|service-not-allowed/.test(r.err)){ SP.mic="blocked"; spBlocked(); return; }
    if(!r.alts.length){
      document.getElementById("spState").textContent="Still nothing heard.";
      document.getElementById("spMicBtn").hidden=false;
      return;
    }
    spAttempt(r.alts, true);
  });
}
function spSkipTap(){
  if(SP.cur<0 || SP.cur>=SP.ids.length) return;
  listenCancel();
  var gen=++SP.gen, i=SP.cur;
  SP.locked[i]=true;
  document.getElementById("spMicBtn").hidden=true;
  document.getElementById("spHeard").innerHTML='<span class="scv none">Skipped</span>';
  SP.verdict[i]="none"; SP.reason[i]="skipped"; SP.heard[i]=""; SP.grade[i]=null;
  SP.state[SP.cur]="skip"; spRenderTiles();
  setTimeout(function(){ if(gen===SP.gen) spAsk(SP.cur+1); }, 500);
}
function spShowTap(){
  if(SP.cur<0 || SP.cur>=SP.ids.length) return;
  listenCancel();
  var gen=++SP.gen, i=SP.cur, id=SP.ids[SP.cur], c=spCard(id), dir=SP.dir[id];
  SP.locked[i]=true;
  document.getElementById("spMicBtn").hidden=true;
  var shown = dir==="j" ? c.en : c.romaji;
  document.getElementById("spHeard").innerHTML='<span class="scv none">Answer</span><div class="schrd">'+esc(shown||"")+'</div>';
  SP.verdict[i]="none"; SP.reason[i]="shown"; SP.heard[i]=""; SP.grade[i]=null;
  SP.state[SP.cur]="skip"; spRenderTiles();
  spPlay(spAnswerKey(id,dir), gen);
  setTimeout(function(){ if(gen===SP.gen) spAsk(SP.cur+1); }, 1400);
}
function spFinish(){
  // the round is over: the mic goes off, or a late word re-grades the last tile
  contListenStop(); SP._contLang=null;
  var ok=0; for(var i=0;i<SP.ids.length;i++) if(SP.state[i]==="good") ok++;
  document.getElementById("spStage").hidden=true;
  var done=document.getElementById("spDone");
  document.getElementById("spDoneHead").textContent="Round done";
  document.getElementById("spDoneSub").textContent=
    ok+" of "+SP.ids.length+" said back correctly. Words you could not say go first in Practice; your schedule is not changed.";
  var list=document.getElementById("spDoneList");
  if(list){
    var html="";
    for(var i2=0;i2<SP.ids.length;i2++){ if(SP.state[i2]) html+=spHistRow(i2); }
    list.innerHTML=html;
  }
  done.hidden=false;
  SP.running=false;
}
function speakingStart(){
  var ids=speakingWords();
  if(!ids.length){ toast("Nothing met yet. Study a few words first."); return; }
  SP.dir={}; SP.state={}; SP.cur=-1; SP.running=true; SP.mic="untried"; SP._contLang=null;
  SP.tries={}; SP.heard={}; SP.grade={}; SP.verdict={}; SP.reason={}; SP.locked={}; SP._failId=null;
  for(var i=0;i<ids.length;i++){ var cc=IDX[ids[i]];
    /* one-way cards (particles, patterns, staff phrases) are never asked from
       English, and with audio prompts on a card whose English is shared with
       another ("good morning") is asked from its Japanese */
    SP.dir[ids[i]] = (noReverse(cc) || (cc.sq && spAudioOn())) ? "j" : (Math.random()<0.5 ? "e" : "j"); }
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
  document.addEventListener("visibilitychange",function(){
    if(!SP.running) return;
    if(document.visibilityState==="hidden"){ contListenStop(); SP._contLang=null; }
    else if(SP.cur>=0 && !SP.locked[SP.cur]) spAsk(SP.cur);
  });
  var host=document.getElementById("spTiles");
  if(host) host.addEventListener("click", function(e){
    var t=e.target.closest && e.target.closest(".sptile"); if(!t) return;
    spPeek(parseInt(t.dataset.i,10));
  });
}
