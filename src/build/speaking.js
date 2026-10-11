/* ---------- Speaking ----------
   A voice drill over the words Focus finds weak. A row of tickets stands for
   the words in this round; the stage asks one at a time, half in English and
   half in Japanese (each word's direction is a coin flip), grouped so every
   word asked in one direction comes before the other, which keeps one
   continuous mic session open across a whole language block.

   The flow, as rebuilt on 10 Oct 2026 after a review that measured about two
   seconds of dead time per word, in which anything he said was thrown away:
     * the mic is open as soon as the word is on screen (a quarter-second
       guard only absorbs a result the recogniser split in two);
     * a short sound marks his turn, a right answer, a near miss and a miss,
       so a round can be followed without watching the screen;
     * a wrong try keeps what was heard on screen, gives a hint (the first
       sound, then all but the last), and listens again at once, without
       re-showing the word; the third wrong try reveals the answer;
     * "I said it right" overrides a miss he is sure of; it counts as a pass
       for the round but is recorded as his own call, not the phone's;
     * a word missed in the round comes back once at the end;
     * Show answer and Skip after a wrong try still count the miss.
   Nothing here touches the schedule, the same as Focus and the car. */
var SP_WORDS=12, SP_LISTEN_MS=6000, SP_POOL=24;
var SP_PASS_JA=0.62, SP_PASS_EN=0.6;
/* a middle "close" band below pass, for a numeric grade rather than a flat
   pass/fail - same proportional gap Scenes keeps between its own pass and
   close thresholds (0.75 to 0.55), scaled down to these lower single-word
   bars. MAX_TRIES and REVEAL_MS are shared with Scenes, declared there. */
var SP_CLOSE_JA=0.42, SP_CLOSE_EN=0.4;
/* how long a result is ignored after the word goes up: long enough to absorb
   the tail of the answer to the word before, which the recogniser can split
   into a second result, and no longer */
var SP_GUARD_MS=250, SP_GUARD_PASS_MS=650, SP_GUARD_REVEAL_MS=900, SP_GOOD_MS=450, SP_REVIEW_TRIES=2;
var SP={ids:[], dir:{}, state:{}, cur:-1, gen:0, running:false, mic:"untried",
  tries:{}, heard:{}, grade:{}, verdict:{}, reason:{}, locked:{}, order:[], pos:-1,
  recorded:{}, self:{}, review:{}, inReview:false, guardUntil:0};

function spCard(id){ return IDX[id]; }
/* A card he can say out loud as an answer. A particle's gloss is a grammar
   note ("topic marker"), and a description of a counter is not something
   anyone says, so those are left to the study cards. */
var SP_DESCR=/\b(marker|counter for|the counter|particle|ending|joins a|suffix)\b/i;
function spSpeakable(c){
  if(!c || c.t!=="w" || patternHeld(c)) return false;
  if(c.pos==="particle") return false;
  if(SP_DESCR.test(c.en||"")) return false;
  var alts=enAlts(c.en), shortest=99;
  for(var i=0;i<alts.length;i++) shortest=Math.min(shortest, alts[i].split(" ").length);
  return shortest<=5;
}
/* The weak words Focus would draw on, but not always the same twelve: the
   round draws from the weakest two dozen, words already said right in the
   last twelve hours go to the back, and the rest are taken weakest first with
   a little shuffle, so "Again" brings a different set. */
function speakingWords(){
  var weak=weakWords().filter(function(w){ return spSpeakable(IDX[w.id]); }).slice(0, SP_POOL);
  if(weak.length){
    var now=Date.now(), fresh=[], recent=[];
    weak.forEach(function(w, k){
      var r=S.spoken && S.spoken[w.id];
      var item={id:w.id, key:k+Math.random()*6};
      if(r && r.okAt && now-r.okAt<12*3600000 && !(r.miss>r.okAt)) recent.push(item); else fresh.push(item);
    });
    fresh.sort(function(a,b){ return a.key-b.key; }); recent.sort(function(a,b){ return a.key-b.key; });
    return shuffle(fresh.concat(recent).slice(0, SP_WORDS).map(function(x){ return x.id; }));
  }
  /* nothing is going badly: fall back to a mixed draw over what has been met,
     the same fallback startFocus uses, so speaking never dead ends either */
  var keys=shuffle(practiceQueue()), seen={}, out=[];
  for(var i=0;i<keys.length && out.length<SP_WORDS;i++){
    var id=keys[i].split("|")[0];
    // practiceQueue mixes in sentences and conjugation drills; IDX indexes
    // all three under one id space (t:"w"/"s"/"g"), so a bare id lookup does
    // not tell them apart. Speaking is a word drill, so only "w" qualifies.
    if(seen[id] || !spSpeakable(IDX[id])) continue;
    seen[id]=1; out.push(id);
  }
  return out;
}

/* ---- grading the English half ----
   The gloss is cleaned first (notes and the tilde off) and split on every
   separator it uses, "/", ";" and ",". Then a few words that carry the whole
   meaning have to be there: "good morning" used to pass for "good evening",
   and "that one" for "this one". Since 10 Oct an answer is also compared after
   folding words that mean the same (big, large), sound the same (eight, ate)
   and are the same verb (eat, ate, eating), so a right answer said naturally
   is not marked wrong. */
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
  return String(s||"").toLowerCase().replace(/[‘’]/g,"'").replace(/\([^)]*\)/g,"").replace(/~/g," ")
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
/* An answer is compared word by word, never letter by letter. Letter
   similarity let "father" pass for mother (0.67), "next week" for last week,
   "seventeen" for seventy and "to ride" for to win (the audit of 10 Oct).
   Two words are the same word when they are spelled the same, sound the same
   (eight, ate: compared as said, never after reducing a verb), are the same
   verb (eat, ate, eating), or mean the same (big, large, after reducing).
   Every word of one accepted answer has to be there; what he said may carry
   no extra word on a one-word answer and one on a longer one, and a "not" or "no" he adds
   is never extra, it reverses the meaning. */
var EN_FILLER={"a":1,"an":1,"the":1,"um":1,"uh":1,"er":1,"it":1,"is":1,"it's":1,"that's":1,"i'm":1};
var EN_SOUND=(function(){
  var groups=["eight ate","right write","buy by bye","four for fore","two too to","see sea","here hear",
    "one won","meet meat","week weak","son sun","hour our","new knew","wait weight","flower flour",
    "pair pear","road rode","whole hole","tail tale","rain reign","nose knows","plane plain","sale sail",
    // the same word spelled two ways
    "colour color","favourite favorite","centre center","theatre theater","grey gray","practise practice",
    "metre meter","litre liter","jewellery jewelry","cheque check","programme program","neighbour neighbor",
    "flavour flavor","traveller traveler","travelling traveling","organise organize","realise realize"];
  var m={}; groups.forEach(function(g){ var w=g.split(" "); for(var i=0;i<w.length;i++) m[w[i]]=w[0]; }); return m;
})();
/* meaning twins, compared after verbs are reduced. Kept narrow: "little" is
   not "small" (sukoshi is a little), "hard" is not "difficult" (katai is
   firm), a photo is not a picture (e is a painting). */
var EN_SYN=(function(){
  var groups=["big large huge","small tiny","delicious tasty yummy","hello hi hey","shop store","begin start",
    "finish end","quick fast","child kid","toilet restroom bathroom lavatory washroom","movie film",
    "trash rubbish garbage","elevator lift","subway underground metro","mother mom mum","father dad",
    "okay ok alright","taxi cab","sick ill","glad happy","buy purchase","near nearby","station stop"];
  var m={}; groups.forEach(function(g){ var w=g.split(" "); for(var i=0;i<w.length;i++) m[w[i]]=w[0]; }); return m;
})();
var EN_IRR={went:"go",gone:"go",goes:"go",going:"go",doing:"do",came:"come",ate:"eat",eaten:"eat",bought:"buy",saw:"see",seen:"see",took:"take",
  taken:"take",wore:"wear",worn:"wear",gave:"give",given:"give",got:"get",said:"say",told:"tell",thought:"think",
  drank:"drink",drunk:"drink",wrote:"write",written:"write",slept:"sleep",met:"meet",ran:"run",sat:"sit",
  stood:"stand",understood:"understand",found:"find",lost:"lose",spoke:"speak",spoken:"speak",taught:"teach",heard:"hear",knew:"know",
  known:"know",forgot:"forget",forgotten:"forget",began:"begin",begun:"begin",became:"become",broke:"break",
  broken:"break",caught:"catch",fell:"fall",fallen:"fall",flew:"fly",sold:"sell",sent:"send",spent:"spend",
  woke:"wake",paid:"pay",made:"make",did:"do",done:"do",does:"do",children:"child",men:"man",women:"woman",feet:"foot",
  teeth:"tooth",has:"have",had:"have",used:"use",left:"left",
  people:"person",mice:"mouse",better:"good",best:"good",worse:"bad",worst:"bad"};
/* words whose final s is part of the word */
var EN_KEEP_S={"news":1,"always":1,"perhaps":1,"series":1,"means":1,"lens":1,"bus":1,"gas":1,"yes":1,"us":1,
  "this":1,"his":1,"its":1,"plus":1,"thus":1,"pants":1,"glasses":1,"clothes":1,"scissors":1,"trousers":1,"stairs":1};
/* the base forms a word could come from: coming may be com or come */
function enLemmas(w){
  if(EN_IRR[w]) return [EN_IRR[w]];
  var out=[w], s;
  // the stem with and without its e: coming may be come, eating eat
  function stem(x){ if(x.length>=3) out.push(x); out.push(x+"e"); if(/([b-df-hj-np-tv-z])\1$/.test(x) && x.length>=5) out.push(x.slice(0,-1)); }
  if(w.length>=5 && /ing$/.test(w)) stem(w.slice(0,-3));
  else if(w.length>=5 && /ied$/.test(w)) out.push(w.slice(0,-3)+"y");
  else if(w.length>=5 && /ed$/.test(w)) stem(w.slice(0,-2));
  else if(w.length>=5 && /ies$/.test(w)) out.push(w.slice(0,-3)+"y");
  else if(!EN_KEEP_S[w] && w.length>=4 && /(sses|shes|ches|xes)$/.test(w)) out.push(w.slice(0,-2));
  else if(!EN_KEEP_S[w] && w.length>=4 && /[^su]s$/.test(w)) out.push(w.slice(0,-1));
  return out;
}
/* An answer word that is itself a form (understood, hated, was) has to be
   said in that form: "to understand" is not "understood", or wakaru would
   pass for wakarimashita. A base word in the answer accepts any form of it
   that he says (eat: ate, eating). */
function enIsForm(w){ return !!EN_IRR[w] || (w.length>=5 && /(ed|ing)$/.test(w) && !/(eed|ning|ening|thing|ring|ling)$/.test(w)); }
function enWordEq(a, b){
  if(a===b) return true;
  if(EN_SOUND[a] && EN_SOUND[a]===EN_SOUND[b]) return true;
  if(EN_SYN[a] && EN_SYN[a]===EN_SYN[b]) return true;
  if(enIsForm(a)) return false;
  var sa=EN_SYN[a]||a, lb=enLemmas(b);
  for(var j=0;j<lb.length;j++){
    if(lb[j]===a) return true;
    var sb=EN_SYN[lb[j]];
    if(sb && sb===sa) return true;
  }
  return false;
}
var EN_NEGW={"not":1,"no":1,"never":1,"nothing":1};
/* the only extra words an answer can carry: "I eat" is to eat, "very big" is
   big, "X please" is X. A word that changes what is meant (before, after,
   next, junior, more) is never extra: "the year before last" is not last year. */
var EN_SOFT={"i":1,"you":1,"we":1,"very":1,"really":1,"so":1,"please":1,"just":1,"well":1,"oh":1,"much":1,"um":1};
function enWords(s){
  var all=enBare(s).split(" ").filter(Boolean);
  var ws=all.filter(function(w){ return !EN_FILLER[w]; });
  // an answer made only of small words ("is") keeps them
  if(!ws.length) ws=all;
  if(ws.length>1 && ws[0]==="to") ws.shift();
  return ws;
}
/* how one heard phrase meets one accepted answer: the share of the answer's
   words he said, and whether he said anything that turns it around */
function enMatch(cand, heard){
  var cw=enWords(cand), hw=enWords(heard);
  if(!cw.length || !hw.length) return {recall:0, ok:false};
  var used={}, hit=0;
  for(var i=0;i<cw.length;i++){
    for(var j=0;j<hw.length;j++){
      if(used[j]) continue;
      if(enWordEq(cw[i], hw[j])){ used[j]=1; hit++; break; }
    }
  }
  var hard=0, reversed=false;
  for(var k=0;k<hw.length;k++){
    if(used[k]) continue;
    if(EN_NEGW[hw[k]]) reversed=true;
    else if(!EN_SOFT[hw[k]]) hard++;
  }
  var recall=hit/cw.length;
  return {recall:recall, ok: recall===1 && !reversed && hard===0, reversed:reversed};
}
/* sim keeps its old meaning for the callers: at or above SP_PASS_EN is a
   pass, at or above SP_CLOSE_EN is close (most of the answer said) */
function enGrade(target, alts){
  var cands=enAlts(target), best={sim:-1, heard:alts[0]||"", keyOk:true};
  for(var i=0;i<alts.length;i++){
    var h=enNorm(alts[i]);
    for(var j=0;j<cands.length;j++){
      var m=enMatch(cands[j], h);
      var s = m.ok ? 1 : (m.reversed ? 0 : (m.recall>=0.5 ? SP_CLOSE_EN+(m.recall-0.5)*0.3 : m.recall*0.7));
      if(s>best.sim) best={sim:s, heard:alts[i], keyOk:!m.reversed};
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
   passed for wakarimashita, understood).
   Since 10 Oct the word being asked is read first in its own spellings: the
   reading table keeps one reading per kanji, so 家 came back as ie when uchi
   was asked, and 日本 or 幾つ, which no card spells, scored zero. And a digit
   is tried in each of its readings: 4 is yon, shi or yo, 7 nana or shichi. */
var ASR_SP=(function(){ var el=document.getElementById("asr-data"); try{ return el ? JSON.parse(el.textContent) : {}; }catch(e){ return {}; } })();
var SP_BY_KANA=null;
function spCardByKana(k){
  if(!SP_BY_KANA){ SP_BY_KANA={}; for(var i=0;i<DECK.length;i++) if(!SP_BY_KANA[DECK[i].kana]) SP_BY_KANA[DECK[i].kana]=DECK[i]; }
  return SP_BY_KANA[k]||null;
}
function spOwnSpellings(kana, card){
  var out=[];
  if(card && card.kanji && card.kanji!==card.kana) out.push(card.kanji);
  (ASR_SP[kana]||[]).forEach(function(k){ if(out.indexOf(k)<0) out.push(k); });
  return out.sort(function(a,b){ return b.length-a.length; });
}
/* a number the phone writes as digits, in every reading it could be: 4 is
   yon or shi, 7 nana or shichi, 9 kyuu or ku, 0 zero or rei, and 1 to 10 on
   their own also hitotsu to too. Only the reading of the digits changes,
   never kana he actually said. A digit with a counter after it is read the
   way that counter is read (11月 juuichigatsu, 3本 sanbon, 1杯 ippai). */
var JA_NATIVE=["","ひとつ","ふたつ","みっつ","よっつ","いつつ","むっつ","ななつ","やっつ","ここのつ","とお"];
function jaNumAlts(n, alone){
  var base=jaNumKana(n), out=[base];
  var swaps=[["よん","し"],["なな","しち"],["きゅう","く"],["ぜろ","れい"]];
  swaps.forEach(function(p){
    if(base.slice(-p[0].length)===p[0]) out.push(base.slice(0, base.length-p[0].length)+p[1]);
  });
  if(alone && n>=1 && n<=10) out.push(JA_NATIVE[n]);
  return out;
}
/* the sound changes a counter makes after its number: ippon, sanbon, roppon */
function jaSokuon(n){
  var b=jaNumKana(n);
  if(n%10===1 && n!==11) return b.slice(0,-1)+"っ";          // いち -> いっ
  if(n%10===6) return b.slice(0,-1)+"っ";                     // ろく -> ろっ
  if(n%10===8) return b.slice(0,-1)+"っ";                     // はち -> はっ
  if(n%10===0 && n%100===10 && n<100) return b.slice(0,-1)+"っ"; // じゅう -> じゅっ
  return null;
}
var JA_DAYS={1:"ついたち",2:"ふつか",3:"みっか",4:"よっか",5:"いつか",6:"むいか",7:"なのか",8:"ようか",9:"ここのか",10:"とおか",14:"じゅうよっか",20:"はつか",24:"にじゅうよっか"};
function jaCounter(n, c){
  var b=jaNumKana(n), so=jaSokuon(n), out=[];
  var h=function(plain, voiced, half){
    // h-row counters: 1, 6, 8, 10 take p (ippon); 3 takes b (sanbon)
    if(so && [1,6,8,0].indexOf(n%10)>=0) out.push(so+half);
    else if(n%10===3) out.push(b+voiced);
    else out.push(b+plain);
  };
  switch(c){
    case "月": out.push(n===4?"しがつ":n===7?"しちがつ":n===9?"くがつ":b+"がつ"); break;
    case "日": out.push(JA_DAYS[n]||b+"にち"); if(!JA_DAYS[n]) out.push(b+"か"); break;
    case "人": out.push(n===1?"ひとり":n===2?"ふたり":(n===4?"よにん":n===7?"しちにん":b+"にん")); if(n===7) out.push("ななにん"); break;
    case "本": h("ほん","ぼん","ぽん"); break;
    case "杯": h("はい","ばい","ぱい"); break;
    case "匹": h("ひき","びき","ぴき"); break;
    case "分": h("ふん","ぷん","ぷん"); break;
    case "階": out.push(so && [1,6,8,0].indexOf(n%10)>=0 ? so+"かい" : (n%10===3 ? b+"がい" : b+"かい")); if(n%10===3) out.push(b+"かい"); break;
    case "回": out.push(so && [1,6,8,0].indexOf(n%10)>=0 ? so+"かい" : b+"かい"); break;
    case "個": out.push(so && [1,6,8,0].indexOf(n%10)>=0 ? so+"こ" : b+"こ"); break;
    case "歳": case "才": out.push(n===20?"はたち":(so && [1,8,0].indexOf(n%10)>=0 ? so+"さい" : b+"さい")); if(n===20) out.push("にじゅっさい"); break;
    case "枚": out.push(b+"まい"); break;
    case "円": out.push(n===4?"よえん":b+"えん"); break;
    case "時": out.push(n===4?"よじ":n===7?"しちじ":n===9?"くじ":b+"じ"); break;
    case "つ": out.push(JA_NATIVE[n]||b+"つ"); break;
    case "万": out.push(b+"まん"); break;
    default: out.push(b+c);
  }
  return out;
}
function jaKeys(raw, kana, card){
  var t=String(raw||""), own=spOwnSpellings(kana, card);
  for(var i=0;i<own.length;i++) if(t.indexOf(own[i])>=0) t=t.split(own[i]).join(kana);
  t=t.replace(/[０-９]/g,function(d){ return String.fromCharCode(d.charCodeAt(0)-0xFEE0); }).replace(/(\d),(\d{3})/g,"$1$2");
  var runs=[], re=/(\d{1,8})([月日人本杯匹分階回個歳才枚円時つ万]?)/g, m;
  while((m=re.exec(t))){
    var n=+m[1], c=m[2];
    var alone = !c && m.index===0 && m.index+m[0].length===t.replace(/[。、.!?\s]+$/,"").length;
    runs.push({at:m.index, len:m[0].length, alts: c ? jaCounter(n, c) : jaNumAlts(n, alone)});
  }
  var texts=[t];
  for(var r=runs.length-1;r>=0;r--){
    var R=runs[r], next=[];
    texts.forEach(function(x){ R.alts.forEach(function(a){ if(next.length<16) next.push(x.slice(0,R.at)+a+x.slice(R.at+R.len)); }); });
    texts=next;
  }
  var out=[];
  texts.forEach(function(x){ var k=kanaKey(x); if(out.indexOf(k)<0) out.push(k); });
  out.digits = runs.length>0 || /\d/.test(t);
  return out;
}
/* how a word is pronounced, as romaji with long vowels written out: kooree
   for コーレー and こうれい alike, so a spelling difference is not a miss */
function jaPron(k){ return kanaToRomaji(k).replace(/'/g,"").replace(/ou/g,"oo").replace(/ei/g,"ee"); }
/* the same sounds with every long vowel and doubled consonant made short:
   ojisan and ojiisan, kite and kitte, collapse to one. Two words that only
   meet here differ in length alone, which is a real mistake (uncle is not
   grandfather) and never a pass. */
function jaShort(p){ return p.replace(/([aeiou])\1+/g,"$1").replace(/([bcdfghjkmprstwz])\1/g,"$1"); }
var JA_END=["ませんでした","ました","ません","ます","ましょう","たいです","です"];
function jaEnding(k){ for(var i=0;i<JA_END.length;i++) if(k.slice(-JA_END[i].length)===JA_END[i]) return JA_END[i]; return ""; }
/* What he said is another word of the deck, said right: that is the word
   he said, not a near miss of this one (omedetou for ohayou gozaimasu,
   obaasan for okaasan, onna no hito for otoko no hito, kare for karee). */
var SP_KEYS=null;
function spOtherWord(got, want){
  if(!SP_KEYS){ SP_KEYS={}; for(var i=0;i<DECK.length;i++){ var kk=kanaKey(DECK[i].kana); SP_KEYS[kk]=1; SP_KEYS[jaPron(kk)]=1; } }
  return got!==want && jaPron(got)!==jaPron(want) && !!(SP_KEYS[got] || SP_KEYS[jaPron(got)]);
}
function spGradeJa(targetKana, alts, card){
  card = card || spCardByKana(targetKana);
  var want=kanaKey(targetKana), wantP=jaPron(want), best={sim:-1, heard:alts[0]||""};
  // a number has to be the number: one wrong sound makes it another one
  var exactOnly = !!(card && (card.pos==="num" || card.pos==="counter"));
  for(var i=0;i<alts.length;i++){
    var keys=jaKeys(alts[i], targetKana, card);
    for(var k=0;k<keys.length;k++){
      var got=keys[k], gotP=jaPron(got), s;
      if(got===want || gotP===wantP) s=1;
      // a long vowel at the very end cut short, the way the phone writes a
      // casual form (honto for hontou, koohi for koohii), is the same word
      // in a word of three sounds or more
      else if(wantP.replace(/[^aeiou]/g,"").length>=3 && gotP.replace(/([aeiou])\1+$/,"$1")===wantP.replace(/([aeiou])\1+$/,"$1")) s=1;
      else if(jaShort(gotP)===jaShort(wantP)) s=SP_PASS_JA-0.01;
      else {
        s=kanaSim(want, got);
        // digits for a word that is not a number: the phone heard a number,
        // so a near match (14, juushi, for juusho, address) is not his word
        if((want.length<=4 || exactOnly || keys.digits) && got!==want) s=Math.min(s, SP_PASS_JA-0.01);
        var we=jaEnding(want); if(we && jaEnding(got)!==we) s=Math.min(s, SP_PASS_JA-0.01);
      }
      if(s>=SP_PASS_JA && spOtherWord(got, want)) s=SP_PASS_JA-0.01;
      if(s>best.sim) best={sim:s, heard:alts[i], key:got};
    }
  }
  best.romaji=kanaToRomaji(best.key!=null ? best.key : kanjiToKana(best.heard));
  return best;
}

/* ---- sounds ----
   Short tones from the shared audio context, never an audio element (an
   element played while the recogniser runs is what silences it on iOS).
   Different rhythm as well as pitch, so they are told apart without looking:
   your turn is one soft tick, right is two rising notes, close is one level
   note, a miss is two falling notes. */
function spCuesOn(){ return S.settings.spCues!==false; }
function spCue(kind){
  if(!spCuesOn()) return;
  var ctx=null; try{ ctx=audCtx(); }catch(e){}
  if(!ctx) return;
  var seq = kind==="turn" ? [[880,0,0.07,0.05]] :
            kind==="good" ? [[660,0,0.11,0.12],[990,0.13,0.14,0.12]] :
            kind==="close" ? [[620,0,0.16,0.10]] :
            kind==="miss" ? [[440,0,0.12,0.10],[300,0.15,0.16,0.10]] : [];
  try{
    var t0=ctx.currentTime+0.01;
    seq.forEach(function(n){
      var o=ctx.createOscillator(), g=ctx.createGain();
      o.type="sine"; o.frequency.value=n[0];
      g.gain.setValueAtTime(0.0001, t0+n[1]);
      g.gain.exponentialRampToValueAtTime(n[3], t0+n[1]+0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0+n[1]+n[2]);
      o.connect(g); g.connect(ctx.destination);
      o.start(t0+n[1]); o.stop(t0+n[1]+n[2]+0.02);
    });
  }catch(e){}
}

/* ---- hints ----
   A wrong try gives a little more each time, so the third try is still his
   own recall: first the opening sound and how long the word is, then all but
   its last sound. */
function spMorae(kana){
  var h=toHira(kana||""), out=[];
  for(var i=0;i<h.length;i++){
    var ch=h[i];
    if(/[ゃゅょぁぃぅぇぉ]/.test(ch) && out.length){ out[out.length-1]+=ch; continue; }
    if(ch==="ー" && out.length){ out[out.length-1]+=ch; continue; }
    out.push(ch);
  }
  return out.filter(function(m){ return /[ぁ-ゖ]/.test(m); });
}
function spHint(c, dir, level){
  if(dir==="e"){
    var m=spMorae(c.kana), r=m.map(function(x){ return kanaToRomaji(x); });
    if(!r.length) return "";
    if(level<=1) return "Starts with \""+r[0]+"\", "+r.length+" sound"+(r.length>1?"s":"");
    if(r.length<=1) return "Starts with \""+r[0]+"\"";
    return "\""+r.slice(0, r.length-1).join("")+"...\"";
  }
  var a=enWords(enAlts(c.en)[0]||"").join(" "), ws=a.split(" ");
  if(!a) return "";
  if(level<=1) return "Starts with \""+a[0]+"\", "+ws.length+" word"+(ws.length>1?"s":"");
  if(ws.length>1) return "\""+ws[0]+" ...\"";
  return "\""+a.slice(0, Math.max(1, Math.ceil(a.length/2)))+"...\"";
}

/* ---- the board ---- */
function spTileClass(i){
  var st=SP.state[i];
  // right first try is green; right on a later try, on the review at the end,
  // or by his own call is yellow - a pass, but not a clean one
  if(st==="good") return ((SP.tries[i]||1)<=1 && !SP.review[i] && !SP.self[i]) ? "good" : "retry";
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
  var n=document.getElementById("spProg");
  if(n) n.textContent = SP.inReview ? "Review" : (Math.max(0, SP.cur)+1)+" / "+SP.ids.length;
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
   finish screen's list. */
function spHistRow(i){
  var id=SP.ids[i], c=spCard(id), dir=SP.dir[id];
  var verdict = SP.verdict[i] || "none";
  var q = dir==="j" ? (c.kana+" ("+c.romaji+")") : c.en;
  var correct = dir==="j" ? c.en : (c.romaji || c.kana);
  var heardTxt = SP.reason[i]==="skipped" ? "Skipped" :
    SP.reason[i]==="shown" ? "Shown" :
    SP.reason[i]==="no-mic" ? "No microphone" :
    (SP.heard[i] ? SP.heard[i] : "Nothing heard");
  if(SP.self[i]) heardTxt += " (marked right by you)";
  else if(SP.review[i] && verdict==="good") heardTxt += " (right on the review)";
  var pct=SP.grade[i], gradeTxt = pct!=null ? pct+"%" : "-";
  var col = SP.review[i] && verdict==="good" ? "retry" : historyColor(verdict, SP.self[i] ? 2 : (SP.tries[i]||0));
  return '<div class="scres '+col+'">'+
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
    ? '<div class="kana'+(String(c.kana).length>11?" longer":String(c.kana).length>7?" long":"")+'">'+esc(c.kana)+'</div><div class="romaji">'+esc(c.romaji)+'</div>'
    : '<div class="spen">'+esc(c.en)+'</div>';
  document.getElementById("spDirChip").textContent = dir==="j" ? "Say the meaning in English" : "Say it in Japanese";
  document.getElementById("spHeard").innerHTML="";
  document.getElementById("spHint").textContent="";
  document.getElementById("spState").textContent="";
  document.getElementById("spState").className="spstate";
  document.getElementById("spMicBtn").hidden=true;
  document.getElementById("spSelfBtn").hidden=true;
}
function spShowHeard(g, pass, dir, close){
  var hd=document.getElementById("spHeard");
  var shown = dir==="j" ? (g.heard||"") : (g.romaji||"");
  hd.innerHTML = shown
    ? '<span class="scv '+(pass?"good":(close?"close":"missed"))+'">'+(pass?"Good":(close?"Close":"Not that"))+'</span>'+
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

/* ---- the order words are asked in ----
   SP.order lists word indexes; SP.pos walks it. A word missed in the round
   is appended once more at the end, as the review. A test (or any caller)
   that sets SP.ids by hand and calls spAsk gets the plain order. */
function spEnsureOrder(i){
  if(SP._orderFor!==SP.ids || !SP.order || !SP.order.length){
    SP.order=[]; for(var k=0;k<SP.ids.length;k++) SP.order.push(k);
    SP._orderFor=SP.ids; SP.pos=-1; SP.inReview=false;
    SP.recorded=SP.recorded||{}; SP.self=SP.self||{}; SP.review=SP.review||{};
  }
  var p=SP.order.indexOf(i, Math.max(0, SP.pos));
  if(p<0) p=SP.order.indexOf(i);
  if(p>=0) SP.pos=p;
}
function spNext(guardMs){
  if(!SP.running) return;
  SP.pos++;
  if(SP.pos<SP.order.length){ spAsk(SP.order[SP.pos], guardMs); return; }
  if(!SP.inReview){
    var miss=[];
    for(var i=0;i<SP.ids.length;i++){
      var missed = SP.state[i]==="bad" || (SP.state[i]==="skip" && (SP.tries[i]||0)>0);
      if(missed) miss.push(i);
    }
    if(miss.length){
      SP.inReview=true; SP._reviewIntro=true;
      SP.firstState=SP.firstState||{};
      miss.forEach(function(i){ SP.firstState[i]=SP.state[i]; SP.review[i]=true; SP.tries[i]=0; SP.reason[i]=null; SP.order.push(i); });
      spAsk(SP.order[SP.pos]);
      return;
    }
  }
  spFinish();
}
function spMaxTries(i){ return SP.review[i] ? SP_REVIEW_TRIES : MAX_TRIES; }
/* one word of the round: show it, open the mic, grade, then move on or retry */
function spAsk(i, guardMs){
  if(!SP.running) return;
  // nothing is asked while the app is in the background: the word waits
  if(document.visibilityState==="hidden"){ SP._pendingAsk=[i, guardMs]; return; }
  // past the last word is the end of the round, review or not
  if(i>=SP.ids.length){ spFinish(); return; }
  spEnsureOrder(i);
  var id=SP.ids[i], c=spCard(id), dir=SP.dir[id];
  var prev = SP.cur;
  SP.cur=i; SP.locked[i]=true; SP._failId=null;
  var gen=++SP.gen;
  spRenderTiles();
  spStageShow(c, dir);
  var lang = dir==="j" ? "en-US" : "ja-JP";
  // the mic is restarted only when its language is not this word's, or it
  // has stopped; a retry never comes through here, so it never restarts it
  var needMic = SP._contLang!==lang;
  var prevDir = (prev>=0 && prev!==i) ? SP.dir[SP.ids[prev]] : null;
  var pre = spAudioOn() ? spPlay(spPromptKey(id,dir), gen) : Promise.resolve();
  if(SP._reviewIntro){
    SP._reviewIntro=false;
    document.getElementById("spState").textContent="Review: the words you missed, once more.";
    pre = pre.then(function(){ return wait(900); });
  }
  else if(prevDir && prevDir!==dir){
    document.getElementById("spState").textContent = dir==="j" ? "Switching to English: say what each word means." : "Switching to Japanese: say each word in Japanese.";
    pre = pre.then(function(){ return wait(1200); });
  }
  pre.then(function(){
    if(gen!==SP.gen) return;
    if(!recAvailable()){
      SP.mic="unavailable";
      SP.verdict[i]="none"; SP.reason[i]="no-mic"; SP.heard[i]=""; SP.grade[i]=null;
      document.getElementById("spState").textContent="No microphone here";
      spShowHeard({heard:dir==="j"?c.en:c.kana, romaji:c.romaji}, null, dir);
      SP.state[i]="skip"; spRenderTiles();
      setTimeout(function(){ if(gen===SP.gen) spNext(); }, 1400);
      return;
    }
    if(SP.mic==="blocked"){ SP.locked[i]=false; SP.guardUntil=0; spBlocked(); return; }
    SP.guardUntil = Date.now() + (guardMs!=null ? guardMs : SP_GUARD_MS);
    SP.locked[i]=false;
    spListening(); spCue("turn");
    if(needMic || !CONT.running){
      SP._contLang=lang;
      contListenStart(lang, spOnHeard, "spState", function(){ SP.mic="blocked"; SP._contLang=null; spBlocked(); });
    }
    spArmQuiet(gen, i);
  });
}
function spArmQuiet(gen, i){
  setTimeout(function(){
    if(gen===SP.gen && SP.cur===i && SP.mic!=="blocked" && !SP.locked[i])
      document.getElementById("spState").textContent="Still not hearing you. Say it again, or say \"skip\" or \"show me\".";
  }, SP_LISTEN_MS);
}
/* a blocked microphone is a state, not a pause: it stays on screen with the
   way out, instead of a pulsing "listening" that can never hear anything */
function spBlocked(){
  var st=document.getElementById("spState");
  st.textContent="Microphone blocked. On iPhone: Settings, Apps, Safari, Microphone: Allow (and Settings, General, Keyboard, Enable Dictation). Then tap below."; st.className="spstate blocked";
  document.getElementById("spMicBtn").hidden=false;
}
function spRecord(i, ok){
  if(SP.recorded[i]) return;
  SP.recorded[i]=true; recordSpoken(SP.ids[i], ok);
}
/* One attempt at the current word. Only while the word is still open: the mic
   stays on through the reveal, and saying the revealed answer used to turn a
   three-try miss into a pass. */
function spAttempt(alts, fromTap){
  if(!SP.running || SP.cur<0 || SP.cur>=SP.ids.length) return;
  var i=SP.cur; if(SP.locked[i]) return;
  if(!fromTap && Date.now()<SP.guardUntil) return;
  var id=SP.ids[i], c=spCard(id), dir=SP.dir[id];
  /* graded first: "again" is the answer to mata, and "next" to tsugi, so a
     command word only acts as a command when it is not the right answer */
  var g = dir==="j" ? enGrade(c.en, alts) : spGradeJa(c.kana, alts, c);
  var pass = dir==="j" ? g.sim>=SP_PASS_EN : g.sim>=SP_PASS_JA;
  if(!pass){
    var cmd=voiceCmd(alts);
    if(cmd==="skip"){ spSkipTap(); return; }
    if(cmd==="show"){ spShowTap(); return; }
    if(cmd==="repeat"){ var g0=++SP.gen; if(spAudioOn()) spPlay(spPromptKey(id,dir), g0); spArmQuiet(g0, i); return; }
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
  spShowHeard(g, pass, dir, close);
  SP.mic="ok";
  SP.heard[i] = dir==="j" ? (g.heard||"") : (g.romaji||"");
  SP.verdict[i]=verdict; SP.grade[i]=verdictPct(verdict);
  SP.tries[i]=(SP.tries[i]||0)+1;
  if(pass){
    SP.locked[i]=true; if(!SP.review[i]) spRecord(i, true);
    SP.state[i]="good"; spRenderTiles(); spCue("good");
    document.getElementById("spSelfBtn").hidden=true;
    document.getElementById("spState").textContent="";
    if(dir==="e") document.getElementById("spHeard").insertAdjacentHTML("beforeend", vlPitchLine(c));
    if(dir==="e" && vlCompareOn() && vlRecOk()){
      wait(SP_GOOD_MS).then(function(){ if(gen===SP.gen) spCompareThen(c, gen, function(){ spNext(SP_GUARD_MS); }); });
      return;
    }
    // the end of a right answer can arrive as a second result: the next word
    // ignores anything in its first 0.65 s, so that tail is never its try
    spPlay(spAnswerKey(id,dir), gen).then(function(){ return wait(SP_GOOD_MS); }).then(function(){ if(gen===SP.gen) spNext(SP_GUARD_PASS_MS); });
    return;
  }
  spCue(close ? "close" : "miss");
  document.getElementById("spSelfBtn").hidden=false;
  if(SP.tries[i]>=spMaxTries(i)){
    SP.locked[i]=true; if(!SP.review[i]) spRecord(i, false);
    SP.state[i]="bad"; spRenderTiles();
    var reveal = dir==="j" ? c.en : (c.romaji||c.kana);
    document.getElementById("spHeard").innerHTML =
      '<span class="scv missed">Answer</span><div class="schrd">'+esc(reveal)+'</div>'+
      (dir==="e" ? vlPitchLine(c) : "")+
      '<div class="schrd">you said <b>'+esc(SP.heard[i]||"nothing clear")+'</b></div>';
    document.getElementById("spHint").textContent="";
    document.getElementById("spState").textContent="";
    spPlay(spAnswerKey(id,dir), gen);
    SP._revealGen=gen;
    setTimeout(function(){ if(gen!==SP.gen) return;
      if(dir==="e" && vlCompareOn() && vlRecOk()) spCompareThen(c, gen, spNextAfterReveal);
      else spNextAfterReveal(); }, REVEAL_MS);
    return;
  }
  /* a wrong try: what was heard stays on screen, a hint comes up, and the mic
     takes the next try straight away - the word is not shown again */
  document.getElementById("spHint").textContent=spHint(c, dir, SP.tries[i]);
  var stEl=document.getElementById("spState");
  stEl.textContent="Not quite ("+SP.tries[i]+" of "+spMaxTries(i)+"), listening again"; stEl.className="spstate prompt";
  SP.state[i]="bad"; spRenderTiles();
  if(fromTap || !CONT.running){ document.getElementById("spMicBtn").hidden=false; return; }
  SP.guardUntil=Date.now()+SP_GUARD_MS;
  spArmQuiet(gen, i);
}
/* compare my voice, then go on: the stage makes room for the panel, the
   mic is off while he records, and Back or Stop cancels it */
function spCompareThen(c, gen, then){
  var stage=document.getElementById("spStage"); stage.classList.add("cmp");
  SP._comparing=true; SP._cmpResume=null;
  var end=function(){
    stage.classList.remove("cmp"); SP._comparing=false; SP._cmpEnd=null;
    // a short gap so the recogniser does not start on a microphone that
    // the recording has only just let go of (iPhone)
    if(gen===SP.gen && SP.running) wait(300).then(function(){ if(gen===SP.gen && SP.running) then(); });
  };
  SP._cmpEnd=end;
  vlCompare(c, end);
}
/* after a reveal the next word waits a little longer before it listens, so
   the answer he says back to the reveal is not taken as its first try */
function spNextAfterReveal(){
  if(!SP.running) return;
  SP.pos++;
  if(SP.pos<SP.order.length){ spAsk(SP.order[SP.pos], SP_GUARD_REVEAL_MS); return; }
  SP.pos--; spNext();
}
/* "I said it right": his call against the phone's. It passes the word for
   this round and is shown as his own call; it is recorded as a pass only on
   the first pass through, never on the review. */
function spSelfTap(){
  if(!SP.running || SP.cur<0 || SP.cur>=SP.ids.length) return;
  var i=SP.cur; if(SP.state[i]==="good") return;
  listenCancel();
  var gen=++SP.gen;
  SP.locked[i]=true; SP.self[i]=true;
  SP.verdict[i]="good"; SP.grade[i]=100; SP.state[i]="good";
  if(!SP.recorded[i] && !SP.review[i]) spRecord(i, true);
  else if(SP.recorded[i] && !SP.review[i]){
    // the miss was already written: his call turns it into a pass, marked as his
    var r=S.spoken && S.spoken[SP.ids[i]];
    if(r){ r.self=(r.self||0)+1; r.ok=(r.ok||0)+1; r.okAt=Date.now(); save(); }
  }
  document.getElementById("spSelfBtn").hidden=true;
  document.getElementById("spHeard").innerHTML='<span class="scv good">Marked right</span>';
  document.getElementById("spState").textContent="";
  spRenderTiles(); spCue("good");
  setTimeout(function(){ if(gen===SP.gen){ if(SP._revealGen && SP.tries[i]>=spMaxTries(i)) spNextAfterReveal(); else spNext(); } }, 600);
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
/* Skip and Show move past a word unscored. After a wrong try, the miss stands:
   giving up on a word he could not say is still a word he could not say. */
function spGiveUp(reason){
  if(SP.cur<0 || SP.cur>=SP.ids.length) return null;
  // a word already answered, or on its reveal, is past giving up on; a word
  // still waiting for its mic (the switch pause, a prompt clip) is not
  if(SP.state[SP.cur]==="good" || (SP.tries[SP.cur]||0)>=spMaxTries(SP.cur)) return null;
  listenCancel();
  var gen=++SP.gen, i=SP.cur;
  SP.locked[i]=true;
  document.getElementById("spMicBtn").hidden=true;
  document.getElementById("spSelfBtn").hidden=true;
  document.getElementById("spHint").textContent="";
  if(SP.review[i]){
    // giving up on the review leaves the word as it was the first time
    SP.state[i]=(SP.firstState && SP.firstState[i]) || "bad"; spRenderTiles();
    return gen;
  }
  if((SP.tries[i]||0)>0) spRecord(i, false);
  SP.verdict[i]= (SP.tries[i]||0)>0 ? SP.verdict[i] : "none";
  SP.reason[i]=reason; SP.heard[i]=SP.heard[i]||""; if(!(SP.tries[i]>0)) SP.grade[i]=null;
  SP.state[i]="skip"; spRenderTiles();
  return gen;
}
function spSkipTap(){
  var gen=spGiveUp("skipped"); if(gen==null) return;
  document.getElementById("spHeard").innerHTML='<span class="scv none">Skipped</span>';
  setTimeout(function(){ if(gen===SP.gen) spNext(); }, 500);
}
function spShowTap(){
  var i=SP.cur; if(i<0 || i>=SP.ids.length) return;
  var id=SP.ids[i], c=spCard(id), dir=SP.dir[id];
  var gen=spGiveUp("shown"); if(gen==null) return;
  var shown = dir==="j" ? c.en : c.romaji;
  document.getElementById("spHeard").innerHTML='<span class="scv none">Answer</span><div class="schrd">'+esc(shown||"")+'</div>'+(dir==="e" ? vlPitchLine(c) : "");
  spPlay(spAnswerKey(id,dir), gen);
  setTimeout(function(){ if(gen===SP.gen) spNextAfterReveal(); }, 1400);
}
/* The finish screen fits one screen: the score, then only the words that were
   not a clean first-try pass. The full list is one tap away. */
function spFinish(){
  // the round is over: the mic goes off, or a late word re-grades the last tile
  contListenStop(); SP._contLang=null;
  var ok=0, clean=0, n=SP.ids.length;
  for(var i=0;i<n;i++){ if(SP.state[i]==="good"){ ok++; if(spTileClass(i)==="good") clean++; } }
  document.getElementById("spStage").hidden=true;
  var tl=document.getElementById("spTiles"); if(tl) tl.hidden=true;
  document.getElementById("spPeek").hidden=true;
  var pg=document.getElementById("spProg"); if(pg) pg.textContent="";
  var done=document.getElementById("spDone");
  document.getElementById("spDoneHead").textContent="Round done: "+ok+" of "+n;
  document.getElementById("spDoneSub").textContent=
    clean+" right first time. Missed words get extra Practice for a week; your schedule is unchanged.";
  var list=document.getElementById("spDoneList");
  if(list){
    var rough="", all="";
    for(var i2=0;i2<n;i2++){
      if(!SP.state[i2]) continue;
      var row=spHistRow(i2); all+=row;
      if(spTileClass(i2)!=="good") rough+=row;
    }
    list.innerHTML = '<div class="sprough">'+(rough || '<p class="fine">Every word right first time.</p>')+'</div>' +
      (rough!==all ? '<button class="btn btn-ghost spall" id="spAllBtn">Show all '+n+' words</button><div id="spAllList" hidden>'+all+'</div>' : "");
    var ab=document.getElementById("spAllBtn");
    if(ab) ab.addEventListener("click", function(){
      var al=document.getElementById("spAllList"); al.hidden=!al.hidden;
      var ro=list.querySelector(".sprough"); if(ro) ro.hidden=!al.hidden;
      ab.textContent = al.hidden ? "Show all "+n+" words" : "Hide the full list";
    });
  }
  done.hidden=false;
  SP.running=false;
}
function speakingStart(){
  var ids=speakingWords();
  if(!ids.length){ toast("Nothing met yet. Study a few words first."); return; }
  SP.dir={}; SP.state={}; SP.cur=-1; SP.running=true; SP.mic="untried"; SP._contLang=null;
  SP.tries={}; SP.heard={}; SP.grade={}; SP.verdict={}; SP.reason={}; SP.locked={}; SP._failId=null;
  SP.recorded={}; SP.self={}; SP.review={}; SP.inReview=false; SP.order=[]; SP.pos=-1; SP._revealGen=null;
  SP.firstState={}; SP._pendingAsk=null; SP._reviewIntro=false;
  SP._comparing=false; SP._cmpEnd=null; SP._cmpResume=null;
  for(var i=0;i<ids.length;i++){ var cc=IDX[ids[i]];
    /* one-way cards (patterns, staff phrases) are never asked from English,
       and with audio prompts on a card whose English is shared with another
       ("good morning") is asked from its Japanese */
    SP.dir[ids[i]] = (noReverse(cc) || (cc.sq && spAudioOn())) ? "j" : (Math.random()<0.5 ? "e" : "j"); }
  // each word's own direction is still a coin flip, but the order they're
  // asked in is grouped by direction so the mic can stay open across a
  // whole language block instead of reopening before every single word
  ids.sort(function(a,b){ return SP.dir[a]===SP.dir[b] ? 0 : (SP.dir[a]<SP.dir[b] ? -1 : 1); });
  SP.ids=ids; SP._orderFor=null;
  var tg=document.getElementById("spCmpToggle");
  if(tg){ tg.setAttribute("aria-pressed",String(S.settings.spCompare===true)); tg.textContent=S.settings.spCompare===true?"Compare: on":"Compare: off"; }
  var vb=document.getElementById("vcBtn"); if(vb && typeof vcDue==="function") vb.textContent = vcDue() ? "Weekly voice check (due)" : "Weekly voice check";
  document.getElementById("spDone").hidden=true;
  document.getElementById("spStage").hidden=false;
  var tl=document.getElementById("spTiles"); if(tl) tl.hidden=false;
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
  if(typeof vlCancel==="function") vlCancel();
  SP._comparing=false; SP._cmpEnd=null; SP._cmpResume=null;
  var cm=document.getElementById("spCmp"); if(cm) cm.hidden=true;
  var stg=document.getElementById("spStage"); if(stg) stg.classList.remove("cmp");
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
  var self=document.getElementById("spSelfBtn"); if(self) self.addEventListener("click", spSelfTap);
  var again=document.getElementById("spAgain"); if(again) again.addEventListener("click", speakingAgain);
  var dn=document.getElementById("spDoneBtn"); if(dn) dn.addEventListener("click", speakingLeave);
  document.addEventListener("visibilitychange",function(){
    if(!SP.running) return;
    if(document.visibilityState==="hidden"){
      contListenStop(); SP._contLang=null;
      // leaving the app mid-compare: stop the recording, and on return go
      // straight on to the next word
      if(SP._comparing && SP._cmpEnd){ var ce=SP._cmpEnd; vlCancel(); var cm=document.getElementById("spCmp"); if(cm) cm.hidden=true; SP._cmpResume=ce; }
      return;
    }
    if(SP._cmpResume){ var cr=SP._cmpResume; SP._cmpResume=null; cr(); return; }
    if(SP._pendingAsk){ var pa=SP._pendingAsk; SP._pendingAsk=null; spAsk(pa[0], pa[1]); return; }
    // back on the same word: the mic comes back, and what was on screen
    // (what was heard, the hint, "I said it right") stays
    if(SP.mic==="blocked"){ spBlocked(); return; }
    if(SP._comparing) return;
    if(SP.cur>=0 && !SP.locked[SP.cur]){
      var dir=SP.dir[SP.ids[SP.cur]], lang = dir==="j" ? "en-US" : "ja-JP";
      SP._contLang=lang; SP.guardUntil=Date.now()+SP_GUARD_MS;
      contListenStart(lang, spOnHeard, "spState", function(){ SP.mic="blocked"; SP._contLang=null; spBlocked(); });
    }
  });
  var host=document.getElementById("spTiles");
  if(host) host.addEventListener("click", function(e){
    var t=e.target.closest && e.target.closest(".sptile"); if(!t) return;
    spPeek(parseInt(t.dataset.i,10));
  });
}
