(function(){
"use strict";
var DECK = JSON.parse(document.getElementById("deck-data").textContent);
var POS_JA = {noun:"名詞",verb:"動詞","adj-i":"形容詞","adj-na":"形容動詞",adv:"副詞",expr:"表現",
  particle:"助詞",counter:"助数詞",pron:"代名詞",num:"数詞",conj:"接続詞",interj:"感動詞"};
var POS_EN = {noun:"noun",verb:"verb","adj-i":"i-adjective","adj-na":"na-adjective",adv:"adverb",expr:"expression",
  particle:"particle",counter:"counter",pron:"pronoun",num:"number",conj:"conjunction",interj:"interjection"};
var SENT = JSON.parse(document.getElementById("sent-data").textContent);
/* One worked example per word, shown on the back of the card once the answer
   is out. It is romaji and English only: he does not read Japanese, and putting
   the example on the front would hand him the answer in either direction. */
var EXAMPLE = JSON.parse(document.getElementById("example-data").textContent);
var SIDX = {};
SENT.forEach(function(x){ SIDX[x.id]=x; });
var IDX = {};
DECK.forEach(function(c,i){ c._i=i; c.t="w"; IDX[c.id]=c; });
/* Fourteen pairs of cards share a kana face, so an audio question about one of
   them has two correct answers and the app can only accept one. Those cards
   keep their reading and meaning cards and lose the listening one. */
var HOMO={};
(function(){
  /* Keyed on the sound, not the spelling. Keyed on kana it also stripped the
     listening card from wa (topic marker) and ha (tooth), which are written the
     same and sound nothing alike, and from a card whose only twin is a duplicate
     the app never introduces. */
  var byr={};
  for(var i=0;i<DECK.length;i++){
    if(DECK[i].dup) continue;
    var k=DECK[i].romaji;
    if(byr[k]!==undefined){ HOMO[DECK[i].id]=1; HOMO[byr[k]]=1; }
    else byr[k]=DECK[i].id;
  }
})();
function soundIsAmbiguous(id){ return !!HOMO[id]; }
var INTRO=DECK.slice().sort(function(a,b){
  var x=(typeof a.ord==="number")?a.ord:a._i, y=(typeof b.ord==="number")?b.ord:b._i;
  return x-y; });
SENT.forEach(function(x,i){ x._i=i; x.t="s"; x.pos="sentence"; x.tags=[x.grammar]; IDX[x.id]=x; });
/* Conjugation. CONJ holds the small set of scheduled anchor cards, one per
   rule; FORMS holds every generated form for every verb and adjective and is
   used only by the practice drill, which costs no review time. Both were
   generated and romaji-checked at build time so the rules live in one place. */
var CONJ = JSON.parse(document.getElementById("conj-data").textContent);
var FORMS = JSON.parse(document.getElementById("forms-data").textContent);
CONJ.forEach(function(x,i){ x._i=i; x.t="g"; x.pos="conjugation"; IDX[x.id]=x; });
function isConj(c){ return c && c.t==="g"; }
var CONJ_GATE=3;   // days of interval a word must hold before its forms are drilled
function isSent(c){ return c && c.t==="s"; }

var LEARN = [60, 600], RELEARN = [600], SHARDS = 8, LS_KEY = "kanaladder.v1";
var DEFAULTS = {sched:"fsrs", retention:0.90, newPerDay:12, revCap:150, tripDate:"", reverse:"grad", softCap:true, separate:true, listen:true, consPerDay:"auto", sentGap:1, sentences:true, sentPerDay:4, conj:true, conjPerDay:2, speechRate:0.85, speechVary:true, jaVoice:"auto", autoPlay:true, car:true, carDir:"mix", carGap:4, carMin:0, enVoice:"auto", carAudio:true, carEcho:true, carSlow:true, carSent:true, carConj:true, carChecked:false, badge:true, typing:true, kanji:true, tts:true, theme:"auto"};

var S = {rev:0, items:{}, settings:Object.assign({},DEFAULTS),
  daily:{key:"",newDone:0,revDone:0,ans:0,ok:0,credit:0,sentDone:0,conjDone:0,consDone:0,noNew:false,buried:{},done:{},missed:{}}, hist:{}, streak:{cur:0,best:0,last:""}, life:{ans:0,ok:0,practice:0,carSec:0,carHeard:0,carSent:0}, backup:{last:""}, notes:{}, susp:{}, pfail:{}, crep:{}, carSeen:{}, checks:[], log:[]};

/* ---------- time ---------- */
function dayKey(t){var d=new Date(t-14400000);
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
function dayEnd(t){var d=new Date(t-14400000); d.setHours(0,0,0,0);
  return d.getTime()+14400000+86400000;}
function prevKey(k,n){var p=k.split("-"); var d=new Date(+p[0],+p[1]-1,+p[2]); d.setDate(d.getDate()-n);
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
function rollDay(){var k=dayKey(Date.now()); if(S.daily.key!==k){S.daily={key:k,newDone:0,revDone:0,ans:0,ok:0,credit:0,sentDone:0,conjDone:0,consDone:0,noNew:false,buried:{},done:{},missed:{}};}}

/* ---------- FSRS-6 ----------
   Free Spaced Repetition Scheduler, version 6, with the published default
   parameters. Every card carries two numbers instead of one ease factor:
     D  difficulty,  1 to 10
     S  stability,   the number of days at which recall probability falls to
                     the target retention
   Formulas transcribed from the FSRS algorithm specification.            */
var FSRS_W = [0.212,1.2931,2.3065,8.2956,6.4133,0.8334,3.0194,0.001,1.8722,
              0.1666,0.796,1.4835,0.0614,0.2629,1.6483,0.6014,1.8729,0.5425,
              0.0912,0.0658,0.1542];
var S_MIN=0.01, S_MAX=36500, D_MIN=1, D_MAX=10;

function fClampS(x){ return (!isFinite(x)||x<S_MIN) ? S_MIN : (x>S_MAX ? S_MAX : x); }
function fClampD(x){ return (!isFinite(x)||x<D_MIN) ? D_MIN : (x>D_MAX ? D_MAX : x); }
function fDecay(){ return -FSRS_W[20]; }
function fFactor(){ return Math.pow(0.9, 1/fDecay()) - 1; }

// probability of recall t days after the last review, given stability S
function fR(t,S){
  if(S<=0) return 0;
  return Math.pow(1 + fFactor()*(Math.max(0,t)/S), fDecay());
}
// days until recall probability falls to r
function fInterval(S,r){
  return (S/fFactor()) * (Math.pow(r, 1/fDecay()) - 1);
}
function fS0(g){ return fClampS(FSRS_W[g-1]); }
function fD0(g){ return fClampD(FSRS_W[4] - Math.exp(FSRS_W[5]*(g-1)) + 1); }

function fNextD(D,g){
  var delta = -FSRS_W[6]*(g-3);
  var damped = D + delta*(10-D)/9;                      // linear damping
  var reverted = FSRS_W[7]*fD0(4) + (1-FSRS_W[7])*damped;  // mean reversion
  return fClampD(reverted);
}
function fSRecall(D,S,R,g){
  var hard = (g===2) ? FSRS_W[15] : 1;
  var easy = (g===4) ? FSRS_W[16] : 1;
  var growth = Math.exp(FSRS_W[8]) * (11-D) * Math.pow(S,-FSRS_W[9]) *
               (Math.exp(FSRS_W[10]*(1-R))-1) * hard * easy;
  return fClampS(S * (1 + growth));
}
function fSForget(D,S,R){
  var sf = FSRS_W[11] * Math.pow(D,-FSRS_W[12]) *
           (Math.pow(S+1,FSRS_W[13])-1) * Math.exp(FSRS_W[14]*(1-R));
  // a lapse can never leave a card more stable than it already was
  return fClampS(Math.min(sf,S));
}
function fSSameDay(S,g){
  return fClampS(S * Math.exp(FSRS_W[17]*(g-3+FSRS_W[18])) * Math.pow(S,-FSRS_W[19]));
}

/* Convert an SM-2 card into an FSRS memory state.
   The current interval is the best available estimate of stability, and the
   ease factor is the only signal available about difficulty. */
function fFromSM2(ef, iv){
  var S = fClampS(iv>0 ? iv : fS0(3));
  var D = fClampD(fD0(3) + (2.5 - (ef||2.5))*4);
  return {d:D, s:S};
}

/* ---------- SM-2 ---------- */
function newItem(){return {s:0,st:0,n:0,ef:2.5,iv:0,due:0,lapses:0,piv:0,seen:0,ok:0,df:0,sb:0,lr:0};}
function clamp(v,a,b){return v<a?a:v>b?b:v;}
function grad(o,iv,now){o.s=1;o.st=0;o.n=Math.max(1,o.n+1);o.iv=iv;o.due=now+iv*86400000;o.lr=now;}
function schedule(it,g,now,preview){
  if(S.settings.sched!=="sm2") return fsrsSchedule(it,g,now,preview);
  return sm2Schedule(it,g,now,preview);
}
/* FSRS keeps the short intraday learning steps as a separate layer, exactly as
   Anki does, so a brand new word still comes back inside the same session. The
   memory state moves on every repetition; the long schedule comes from it. */
function fsrsSchedule(it,g,now,preview){
  var o=Object.assign({},it), G=g+1, r=S.settings.retention||0.9;

  if(o.s===0 || o.s===2){
    var steps=(o.s===0)?LEARN:RELEARN;
    if(!(o.sb>0)){ o.df=fD0(G); o.sb=fS0(G); }
    else { o.sb=fSSameDay(o.sb,G); o.df=fNextD(o.df,G); }
    o.lr=now;
    if(g===0){ o.st=0; o.due=now+steps[0]*1000; return o; }
    if(g===1){ o.due=now+steps[Math.min(o.st,steps.length-1)]*1000; return o; }
    if(g===2){
      o.st++;
      if(o.st<steps.length){ o.due=now+steps[o.st]*1000; return o; }
    }
    o.s=1; o.st=0; o.n=Math.max(1,o.n+1);
    var iv0=clamp(Math.round(fInterval(o.sb,r)),1,730);
    o.iv=iv0; o.due=now+iv0*86400000;
    return o;
  }

  var elapsed = o.lr ? Math.max(0,(now-o.lr)/86400000) : (o.iv||0);
  var hasMem = o.sb>0;
  var R = hasMem ? fR(elapsed,o.sb) : 0.9;
  if(!hasMem){ o.df=fD0(G); o.sb=fS0(G); }
  else if(elapsed<1){ o.sb=fSSameDay(o.sb,G); o.df=fNextD(o.df,G); }
  else if(g===0){ o.sb=fSForget(o.df,o.sb,R); o.df=fNextD(o.df,G); }
  else { o.sb=fSRecall(o.df,o.sb,R,G); o.df=fNextD(o.df,G); }
  o.lr=now;

  if(g===0){ o.lapses++; o.piv=o.iv; o.s=2; o.st=0; o.due=now+RELEARN[0]*1000; return o; }
  o.n++;
  var iv=clamp(Math.round(fInterval(o.sb,r)),1,730);
  if(!preview && iv>=4) iv=clamp(Math.round(iv*(0.95+Math.random()*0.10)),1,730);
  o.iv=iv; o.s=1; o.due=now+iv*86400000;
  return o;
}
function sm2Schedule(it,g,now,preview){
  var o=Object.assign({},it);
  if(o.s===0){
    if(g===0){o.st=0;o.due=now+LEARN[0]*1000;}
    else if(g===1){o.due=now+LEARN[Math.min(o.st,LEARN.length-1)]*1000;}
    else if(g===2){o.st++; if(o.st>=LEARN.length){grad(o,1,now);} else {o.due=now+LEARN[o.st]*1000;}}
    else {grad(o,4,now);}
    return o;
  }
  if(o.s===2){
    if(g===0){o.st=0;o.due=now+RELEARN[0]*1000;}
    else if(g===1){o.due=now+RELEARN[Math.min(o.st,RELEARN.length-1)]*1000;}
    else if(g===2){grad(o,Math.max(1,Math.round(o.piv*0.5)),now);}
    else {grad(o,Math.max(2,Math.round(o.piv*0.7)),now);}
    return o;
  }
  if(g===0){o.lapses++;o.ef=Math.max(1.3,o.ef-0.2);o.piv=o.iv;o.s=2;o.st=0;o.due=now+RELEARN[0]*1000;o.lr=now;return o;}
  var q = g===1?3:(g===2?4:5);
  o.ef = clamp(o.ef + (0.1-(5-q)*(0.08+(5-q)*0.02)), 1.3, 3.0);
  o.n++;
  var iv;
  if(g===1) iv = Math.max(o.iv+1, Math.round(o.iv*1.2));
  else if(o.n<=1) iv = (g===3?4:1);
  else if(o.n===2) iv = (g===3?8:6);
  else iv = Math.round(o.iv*o.ef*(g===3?1.3:1));
  iv = clamp(Math.round(iv),1,730);
  if(!preview && iv>=4) iv = clamp(Math.round(iv*(0.95+Math.random()*0.10)),1,730);
  o.iv=iv;o.s=1;o.due=now+iv*86400000;o.lr=now;
  return o;
}
function ivLabel(ms){
  if(ms<=0) return "now";
  var s=Math.max(30,ms/1000);
  if(s<3570) return Math.max(1,Math.round(s/60))+"m";
  if(s<86400) return Math.max(1,Math.round(s/3600))+"h";
  var d=s/86400;
  if(d<30) return Math.round(d)+"d";
  if(d<365) return trimz((d/30.44).toFixed(d<90?1:0))+"mo";
  return trimz((d/365).toFixed(1))+"y";
}
function trimz(x){return String(x).replace(/\.0$/,"");}

/* ---------- storage ---------- */
function packItem(o){return [o.s,o.st,o.n,Math.round(o.ef*1000)/1000,o.iv,o.due,o.lapses,o.piv,o.seen,o.ok,
  Math.round((o.df||0)*1000)/1000, Math.round((o.sb||0)*1000)/1000, o.lr||0];}
function unpackItem(a){
  var o={s:a[0],st:a[1],n:a[2],ef:a[3],iv:a[4],due:a[5],lapses:a[6],piv:a[7],seen:a[8],ok:a[9],
         df:a[10]||0, sb:a[11]||0, lr:a[12]||0};
  // a card saved before FSRS existed carries only an ease factor and an interval
  if(!(o.sb>0) && o.s===1 && o.iv>0){
    var m=fFromSM2(o.ef,o.iv); o.df=m.d; o.sb=m.s;
    if(!o.lr) o.lr=o.due-o.iv*86400000;
  }
  return o;
}
/* A backup carries no version, so a file written by a newer build could be
   restored by an older one and lose whatever it did not recognise, silently.
   The stamp lets the importer say so instead. */
var SCHEMA=6;
function packAll(){var it={}; for(var k in S.items) it[k]=packItem(S.items[k]);
  return {schema:SCHEMA,rev:S.rev,settings:S.settings,daily:S.daily,hist:S.hist,streak:S.streak,life:S.life,backup:S.backup,notes:S.notes,susp:S.susp,pfail:S.pfail,crep:S.crep,carSeen:S.carSeen,checks:S.checks,log:S.log,items:it};}
function applyBlob(b){
  if(!b) return;
  S.rev = b.rev||0;
  S.settings = Object.assign({},DEFAULTS,b.settings||{});
  S.daily = Object.assign({key:"",newDone:0,revDone:0,ans:0,ok:0,credit:0,sentDone:0,conjDone:0,consDone:0,noNew:false,buried:{},done:{},missed:{}},b.daily||{});
  if(!S.daily.buried) S.daily.buried={};
  if(!S.daily.done) S.daily.done={};
  if(!S.daily.missed) S.daily.missed={};
  S.hist = b.hist||{}; S.streak = Object.assign({cur:0,best:0,last:""},b.streak||{});
  S.life = Object.assign({ans:0,ok:0,practice:0,carSec:0,carHeard:0,carSent:0},b.life||{});
  S.backup = Object.assign({last:""},b.backup||{});
  S.notes = b.notes||{}; S.susp = b.susp||{}; S.pfail = b.pfail||{}; S.crep = b.crep||{}; S.carSeen = b.carSeen||{};
  S.checks = Array.isArray(b.checks)? b.checks : [];
  S.log = Array.isArray(b.log) ? b.log : [];
  S.items = {}; var it=b.items||{};
  for(var k in it){
    if(!IDX[k.split("|")[0]]) continue;
    var a=it[k];
    if(!Array.isArray(a) || a.length<10) continue;
    var okNums=true;
    for(var q=0;q<10;q++){ if(typeof a[q]!=="number" || !isFinite(a[q])) { okNums=false; break; } }
    if(!okNums) continue;
    S.items[k]=unpackItem(a);          // extra trailing fields are ignored, never fatal
  }
}
// A backup must look like one before it is allowed to replace a schedule.
function validateBlob(b){
  if(!b || typeof b!=="object" || Array.isArray(b)) return "That file is not a Kana Ladder backup";
  if(typeof b.schema==="number" && b.schema>SCHEMA)
    return "That backup was written by a newer version of Kana Ladder. Update the app first, or some of your history would be dropped.";
  var it=b.items;
  if(!it || typeof it!=="object" || Array.isArray(it)) return "That backup has no cards in it";
  var total=0, valid=0;
  for(var k in it){
    total++;
    var a=it[k];
    if(!Array.isArray(a) || a.length<10) continue;
    var okNums=true;
    for(var i=0;i<10;i++){ if(typeof a[i]!=="number" || !isFinite(a[i])) okNums=false; }
    if(okNums && IDX[k.split("|")[0]]) valid++;
  }
  if(!total) return "That backup is empty";
  if(!valid) return "That backup holds no cards from this deck";
  if(valid < total*0.5) return "That backup looks damaged";
  return null;
}
function loadLocal(){
  try{var raw=localStorage.getItem(LS_KEY); if(raw) applyBlob(JSON.parse(raw));}catch(e){}
}
var SAVE_FAILED=false;
function saveLocal(){
  try{ localStorage.setItem(LS_KEY,JSON.stringify(packAll())); SAVE_FAILED=false; }
  catch(e){
    if(!SAVE_FAILED){ SAVE_FAILED=true; setSync("full");
      toast("This browser will not store more data. Download a backup."); }
  }
  idbPut();
}
function touch(key){ Remote.dirty[shardOf(key)]=1; save(); }
var DIRTY_SINCE_BOOT=false;
function save(){ S.rev++; DIRTY_SINCE_BOOT=true; saveLocal(); remoteQueue(); }
function setSync(mode){
  var dot=document.getElementById("syncDot"), lab=document.getElementById("syncLabel");
  var note=document.getElementById("syncNote");
  if(mode==="cloud"){ dot.className="syncdot"; lab.innerHTML='<span class="syncdot" id="syncDot"></span> synced';
    note.textContent="Progress is saved to your Claude account and to this browser, so the schedule follows you to any device you open this on."; }
  else if(mode==="device"){ dot.className="syncdot"; lab.innerHTML='<span class="syncdot" id="syncDot"></span> on device';
    note.textContent="Progress is written to this phone twice over, to the browser store and to a local database, and marked persistent so iOS will not clear it. It never leaves the device, which also means it is only as safe as the phone. Download a backup now and then."; }
  else if(mode==="full"){ dot.className="syncdot off"; lab.innerHTML='<span class="syncdot off" id="syncDot"></span> not saving';
    note.textContent="This browser refused to store the last save, usually because site data is full or blocked. Download a backup now: progress made from here may not survive a reload."; }
  else { dot.className="syncdot off"; lab.innerHTML='<span class="syncdot off" id="syncDot"></span> on device';
    note.textContent="Progress is stored in this browser. Download a backup now and then so a cleared browser cannot reset the deck."; }
}

/* ---------- level and score ---------- */
var LEVELS=[
 {min:0,    n:1,  ja:"入門",     en:"Getting started",     d:"The deck is open. The first words you meet carry most of everyday survival Japanese, so early progress is worth more than it looks."},
 {min:18,   n:2,  ja:"挨拶",     en:"Greetings",           d:"Greeting, thanking, apologising and introducing yourself are starting to come without effort."},
 {min:45,   n:3,  ja:"数と時",   en:"Numbers and time",    d:"Counts, prices, days of the week and clock times are becoming yours."},
 {min:90,   n:4,  ja:"毎日",     en:"Everyday things",     d:"Food, family, the home and the objects in it are turning automatic."},
 {min:155,  n:5,  ja:"動詞",     en:"Verbs in play",       d:"Enough verbs and adjectives to say what you do and what things are like."},
 {min:250,  n:6,  ja:"文",       en:"Sentence building",   d:"Particles and set patterns let you assemble sentences of your own rather than repeat fixed ones."},
 {min:375,  n:7,  ja:"会話",     en:"Conversational",      d:"You recognise most of what a slow, simple conversation is made of."},
 {min:520,  n:8,  ja:"定着",     en:"Consolidating",       d:"The core is largely known and intervals are long. Recall in Japanese is catching up to recognition."},
 {min:690,  n:9,  ja:"N5相当",   en:"N5 vocabulary range", d:"Your vocabulary covers the ground JLPT N5 tests. Grammar, kanji and listening are separate battles."},
 {min:860,  n:10, ja:"基礎完成", en:"Foundation complete", d:"The first thousand words are done. From here the deck moves into the vocabulary that carries real conversation."},
 {min:960,  n:11, ja:"拡張",     en:"Widening out",        d:"Past survival Japanese. You are picking up the words that let you say more than the minimum."},
 {min:1060, n:12, ja:"仕事",     en:"Work and study",      d:"Offices, schedules, documents and study language are entering the rotation."},
 {min:1160, n:13, ja:"気持ち",   en:"Feelings and people", d:"Emotions, character and relationships beyond happy and sad."},
 {min:1260, n:14, ja:"表現",     en:"Fuller expression",   d:"Adjectives and adverbs precise enough to say what you actually mean."},
 {min:1360, n:15, ja:"文法",     en:"Grammar in depth",    d:"The patterns that turn sentences into paragraphs: conditionals, causatives, hearsay, intent."},
 {min:1450, n:16, ja:"生活",     en:"Daily life mastered", d:"Renting, banking, travel, shopping and the city hold no vocabulary surprises."},
 {min:1530, n:17, ja:"流暢へ",   en:"Toward fluency",      d:"Most of what an ordinary conversation contains is now familiar in both directions."},
 {min:1600, n:18, ja:"N4相当",   en:"N4 vocabulary range", d:"Your vocabulary covers the ground JLPT N4 tests."},
 {min:1660, n:19, ja:"熟成",     en:"Deep consolidation",  d:"Nearly everything is on long intervals. The deck is maintaining itself."},
 {min:1710, n:20, ja:"完成",     en:"Deck mastered",       d:"Both directions strong across all 1,759 words. Time for native material rather than a deck."}
];
var SECTORS=[
 ["Greetings & courtesy",["greetings","courtesy","responses","phrases","intro","classroom"]],
 ["Numbers & time",["numbers","counters","time","calendar","frequency"]],
 ["People & family",["people","family","pronouns","jobs"]],
 ["Body & health",["body","health"]],
 ["Food & drink",["food","drink","cooking","taste","restaurant"]],
 ["Home & objects",["home","objects","clothes"]],
 ["School, work & tech",["school","work","technology"]],
 ["Money & shopping",["money","shopping"]],
 ["Places & travel",["places","buildings","city","transport","directions","travel"]],
 ["Nature & animals",["nature","weather","animals","colors"]],
 ["Verbs",["verbs","godan","ichidan","irregular"]],
 ["Adjectives & adverbs",["adjectives","adverbs"]],
 ["Grammar & particles",["grammar","particles","patterns","questions","demonstratives"]],
 ["Leisure & feelings",["hobbies","sports","music","feelings"]],
 ["Media & society",["media","society"]]
];
var TAG2SEC={};
SECTORS.forEach(function(sec,i){ sec[1].forEach(function(t){ if(!(t in TAG2SEC)) TAG2SEC[t]=i; }); });
DECK.forEach(function(c){ var si=SECTORS.length;
  for(var i=0;i<c.tags.length;i++){ if(c.tags[i] in TAG2SEC){ si=TAG2SEC[c.tags[i]]; break; } }
  c._sec = si<SECTORS.length ? si : 0; });

// A card's strength is how far its interval has carried it, 0 at first sight and 1 at two months.
function strengthOf(it){
  if(!it) return 0;
  if(it.s!==1) return 0.12;
  // a damaged interval must never poison the score with a NaN
  var iv = (typeof it.iv==="number" && isFinite(it.iv) && it.iv>0) ? it.iv : 1;
  var base = Math.min(1, Math.log(1+iv)/Math.log(61));
  /* The interval alone says what was scheduled, not what is still known, so a
     card left months overdue used to score as if it had just been answered and
     the level never moved when study stopped. Past its due date the strength
     follows the chance of still recalling it. */
  var due = it.due;
  if(typeof due==="number" && isFinite(due)){
    var over = (Date.now()-due)/86400000;
    if(over>0){
      var sb = (typeof it.sb==="number" && isFinite(it.sb) && it.sb>0) ? it.sb : iv;
      var r = fR(iv+over, sb);
      if(isFinite(r) && r>=0 && r<1) base *= Math.max(0, Math.min(1, r/0.9));
    }
  }
  return Math.max(0, Math.min(1, base)); }
/* A word is scored across three skills, not one. Listening used to be tracked
   and then ignored, which let the level read healthy while the skill that a
   conversation actually tests sat at zero. The weights are renormalised when a
   direction is switched off, so turning listening off cannot cap the score. */
function scoreWeights(){
  var w={j:0.45, e:0.35, a:0.20};
  if(S.settings.reverse==="off") w.e=0;
  if(!listenOn()) w.a=0;
  var t=w.j+w.e+w.a;
  return {j:w.j/t, e:w.e/t, a:w.a/t};
}
function wordScore(id){
  var w=scoreWeights();
  return w.j*strengthOf(S.items[id+"|j"]) + w.e*strengthOf(S.items[id+"|e"]) +
         w.a*strengthOf(S.items[id+"|a"]);
}
function scoreParts(){
  var W=scoreWeights();
  var sc=0, rec=0, rcl=0, lis=0, known=0, sec=[], i;
  for(i=0;i<=SECTORS.length;i++) sec.push({sum:0,n:0,known:0});
  for(i=0;i<DECK.length;i++){
    var c=DECK[i], a=strengthOf(S.items[c.id+"|j"]), b=strengthOf(S.items[c.id+"|e"]);
    var d=strengthOf(S.items[c.id+"|a"]);
    var w=W.j*a + W.e*b + W.a*d;
    sc+=w; rec+=a; rcl+=b; lis+=d; if(a>=0.5) known++;
    var g=sec[c._sec]; g.sum+=w; g.n++; if(a>=0.5) g.known++;
  }
  var sn=0, snTot=SENT.length;
  for(i=0;i<SENT.length;i++){ if(strengthOf(S.items[SENT[i].id+"|j"])>=0.4) sn++; }
  var gn=0, gnTot=CONJ.length;
  for(i=0;i<CONJ.length;i++){ if(strengthOf(S.items[CONJ[i].id+"|j"])>=0.4) gn++; }
  var dims=[{k:"recog", label:"Recognition", v:rec/DECK.length, w:W.j,
             note:"reading a word and knowing what it means"},
            {k:"recall", label:"Recall",      v:rcl/DECK.length, w:W.e,
             note:"producing the Japanese from the English"},
            {k:"listen", label:"Listening",   v:lis/DECK.length, w:W.a,
             note:"hearing a word and knowing what it means"}];
  var live=dims.filter(function(x){return x.w>0;});
  var weakest=null;
  if(live.length>1){
    live.sort(function(x,y){return x.v-y.v;});
    // only call it a weak link when it trails the best by a real margin
    if(live[live.length-1].v - live[0].v > 0.08) weakest=live[0];
  }
  return {score:sc, recog:rec/DECK.length, recall:rcl/DECK.length, listen:lis/DECK.length,
          known:known, sec:sec, sent:sn, sentTot:snTot, conj:gn, conjTot:gnTot,
          W:W, dims:dims, weakest:weakest};
}
/* Over a 1,759 word denominator a whole number percent cannot resolve anything
   under about 18 words, so early progress reads as a flat zero. Below ten
   percent the figure carries one decimal. */
function pct(v){
  var x=v*100;
  if(x>0 && x<10) return (Math.round(x*10)/10).toFixed(1)+"%";
  return Math.round(x)+"%";
}
function levelOf(score){ var L=LEVELS[0];
  for(var i=0;i<LEVELS.length;i++) if(score>=LEVELS[i].min) L=LEVELS[i];
  return L; }
function nextLevel(L){ var i=LEVELS.indexOf(L); return i<LEVELS.length-1?LEVELS[i+1]:null; }

/* ---------- soft daily cap ---------- */
// The base cap is a floor, not a ceiling: easy first answers buy more new words,
// a wrong first answer takes some back. It can at most double the base.
function newAllowance(){
  if(inTaper()) return 0;
  if(S.daily.noNew) return 0;          // "no new words today" suppresses all fresh intake
  var base=S.settings.newPerDay;
  if(!S.settings.softCap) return base;
  return base + clamp(Math.floor(S.daily.credit), 0, base);
}
/* Recall and listening cards for words already learned used to draw on the new
   word budget, so every fresh word starved the word before it and the queue of
   second directions could never be caught up. They have their own allowance. */
/* Every new word emits the produce-it card and, where there is a voice, the
   listening card. A flat budget of four against an intake of five meant the
   two directions that carry most of the level fell six cards behind every day,
   so most words would have existed only as recognition. The budget is now
   derived from the intake by construction: whatever goes in can come out. */
var POOL_CS_N=0;
/* How many follow-up cards are already generated and waiting. Counted rather
   than remembered, so the budget does not depend on which function ran last. */
function consWaiting(){
  var n=0, mode=S.settings.reverse, ls=listenOn();
  for(var i=0;i<DECK.length;i++){
    var id=DECK[i].id, j=S.items[id+"|j"];
    if(!j) continue;
    var grad=j.s===1;
    if(mode!=="off" && !S.items[id+"|e"] && !S.susp[id+"|e"] && (mode==="now"||grad)) n++;
    if(ls && !soundIsAmbiguous(id) && !S.items[id+"|a"] && !S.susp[id+"|a"] && grad) n++;
  }
  return n;
}
function consAllowance(){
  if(S.daily.noNew) return 0;
  var n=S.settings.consPerDay;
  if(n==="auto" || typeof n!=="number" || !isFinite(n) || n<0){
    var per = 1 + (listenOn() ? 1 : 0);
    /* newAllowance is zero during the taper, and the taper is exactly when the
       follow-ups need serving, so the rate is taken from the setting rather
       than from today's permitted intake. A backlog drains over a week. */
    // asking for no new words at all means no follow-ups either
    if(S.settings.newPerDay===0) return 0;
    var base = Math.max(2, Math.ceil((S.settings.newPerDay||5)*per));
    var waiting = consWaiting();
    return Math.max(base, Math.min(base*2, Math.ceil(waiting/7)));
  }
  return Math.floor(n);
}
function newBonus(){ return newAllowance()-S.settings.newPerDay; }

var IDB=null;
function idbOpen(){return new Promise(function(res){
  if(!window.indexedDB) return res(null);
  try{ var r=indexedDB.open("kanaladder",1);
    r.onupgradeneeded=function(){ try{r.result.createObjectStore("kv");}catch(e){} };
    r.onsuccess=function(){res(r.result);}; r.onerror=function(){res(null);}; r.onblocked=function(){res(null);};
  }catch(e){res(null);} });}
function idbPut(){ if(!IDB) return; try{ IDB.transaction("kv","readwrite").objectStore("kv").put(packAll(),"state"); }catch(e){} }
function idbGet(){ return new Promise(function(res){ if(!IDB) return res(null);
  try{ var q=IDB.transaction("kv","readonly").objectStore("kv").get("state");
    q.onsuccess=function(){res(q.result||null);}; q.onerror=function(){res(null);};
  }catch(e){res(null);} });}

var SHARDS=8, Remote={kind:"none", db:null, dirty:{}, timer:null};
function shardOf(key){var c=IDX[key.split("|")[0]]; return c?c._i%SHARDS:0;}
function packShard(n){var o={}; for(var k in S.items){ if(shardOf(k)===n) o[k]=packItem(S.items[k]); } return o;}
function packMeta(){return {rev:S.rev,settings:S.settings,daily:S.daily,hist:S.hist,streak:S.streak,life:S.life,backup:S.backup,notes:S.notes,susp:S.susp,pfail:S.pfail};}
function remoteQueue(){ if(Remote.kind!=="claude") return;
  if(Remote.timer) clearTimeout(Remote.timer);
  Remote.timer=setTimeout(remoteFlush,1400); }
function remoteFlush(){ Remote.timer=null;
  if(Remote.kind!=="claude"||!Remote.db) return;
  var d=Remote.dirty; Remote.dirty={};
  var jobs=[Remote.db.doc("srs/meta").set(packMeta())];
  for(var n in d) jobs.push(Remote.db.doc("srs/s"+n).set({items:packShard(+n)}));
  Promise.all(jobs).catch(function(){
    // put the flags back so the next save retries instead of silently losing the shard
    for(var m in d) Remote.dirty[m]=1;
    setSync("error");
  }); }
function markAll(){ for(var i=0;i<SHARDS;i++) Remote.dirty[i]=1; }

function initStorage(){
  if(navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function(){});
  if(window.claude && typeof window.claude.use==="function"){
    window.claude.use("db").then(function(db){
      if(!db) return initIdb();
      Remote.kind="claude"; Remote.db=db;
      var reads=[db.doc("srs/meta").get()], i;
      for(i=0;i<SHARDS;i++) reads.push(db.doc("srs/s"+i).get());
      return Promise.all(reads).then(function(sn){
        var meta = sn[0].exists ? sn[0].data() : null;
        var remoteAns = meta && meta.life ? (meta.life.ans||0) : -1;
        var newer = meta && ((meta.rev||0) > S.rev ||
          ((meta.rev||0) === S.rev && remoteAns > (S.life.ans||0)));
        if(newer && !Sess.on && !DIRTY_SINCE_BOOT){
          var items={};
          for(var j=1;j<sn.length;j++){ if(sn[j].exists){ var m=sn[j].data().items||{}; for(var k in m) items[k]=m[k]; } }
          applyBlob({rev:meta.rev,settings:meta.settings,daily:meta.daily,hist:meta.hist,streak:meta.streak,life:meta.life,backup:meta.backup,notes:meta.notes,susp:meta.susp,pfail:meta.pfail,items:items});
          saveLocal(); applySettings(); render(); renderBrowse();
        } else if(S.rev>0 || Object.keys(S.items).length){ markAll(); remoteFlush(); }
        setSync("cloud");
      });
    }).catch(function(){ initIdb(); });
  } else { initIdb(); }
}
function initIdb(){
  idbOpen().then(function(db){
    IDB=db;
    if(!db){ setSync("local"); return; }
    return idbGet().then(function(blob){
      if(blob && (blob.rev||0) > S.rev && !Sess.on && !DIRTY_SINCE_BOOT){
        applyBlob(blob); saveLocal(); applySettings(); render(); renderBrowse();
      }
      else { idbPut(); }
      setSync("device");
    });
  }).catch(function(){ setSync("local"); });
}

/* ---------- queues ---------- */
function cardOf(key){return IDX[key.split("|")[0]];}
function dirOf(key){return key.split("|")[1];}
var DIRS=["j","e","a"];
function siblingsOf(key){
  var p=key.split("|"), out=[];
  for(var i=0;i<DIRS.length;i++){ if(DIRS[i]!==p[1]) out.push(p[0]+"|"+DIRS[i]); }
  return out;
}
// A word is never tested in both directions on the same day: answering one
// direction holds the other back, so its answer is never fresh from the card before.
// Two holds, both cleared at the day boundary:
//  done   - this card was answered today and is already back on the long schedule,
//           so studying ahead never re-serves what you just did.
//  buried - the opposite direction of a word answered today (setting: separate).
function isBuried(key){
  if(S.daily.done && S.daily.done[key]) return true;
  return S.settings.separate!==false && !!(S.daily.buried&&S.daily.buried[key]);
}

// A sentence is held back until every word it contains has graduated out of
// learning. Partial knowledge makes a sentence a vocabulary test, not reading.
function sentMissing(x){
  var out=[];
  for(var i=0;i<x.w.length;i++){ var it=S.items[x.w[i]+"|j"]; if(!it || it.s!==1) out.push(x.w[i]); }
  return out;
}
function sentReady(x){
  if(!x.w.length) return 0;
  return (x.w.length-sentMissing(x).length)/x.w.length;
}
/* Requiring every word to be known first left 0 of 1,190 sentences readable.
   One unknown word inside a known frame is the ordinary way isolated words
   become usable language, so a single gap is allowed and the missing word is
   glossed on the card. The gap word is never graded here and still enters the
   deck as a word of its own. */
function sentGap(){
  var n=S.settings.sentGap;
  if(typeof n!=="number" || !isFinite(n) || n<0) n=DEFAULTS.sentGap;
  return Math.min(1, Math.floor(n));      // one gap at most, by design
}
function sentOpen(x){ return x.w.length>0 && sentMissing(x).length<=sentGap(); }
/* When a sentence first becomes readable: the introduction rank of its
   second-latest word, since one word is allowed to still be missing. Built once,
   and only from data that never changes at runtime. */
var SENT_RANK={}, SENT_AT={}, SENT_RANK_BUILT=false;
function sentQueueOrder(){
  if(SENT_RANK_BUILT) return;
  SENT_RANK_BUILT=true;
  var pos={}, i, j, n=0;
  for(i=0;i<INTRO.length;i++){ if(INTRO[i].dup) continue; pos[INTRO[i].id]=n++; }
  for(i=0;i<SENT.length;i++){
    var x=SENT[i], r=[];
    for(j=0;j<x.w.length;j++){ var v=pos[x.w[j]]; r.push(v===undefined?1e9:v); }
    r.sort(function(a,b){return a-b;});
    SENT_RANK[x.id]= r.length>1 ? r[r.length-2] : (r.length?r[0]:1e9);
    /* A sentence written to show one bound form in use belongs next to that
       form's own card, not wherever the rest of its words happen to land. */
    if(x.wx && x.wx.length){
      var wr=pos[x.wx[0]];
      if(wr!==undefined) SENT_RANK[x.id]=wr;
    }
    SENT_AT[x.id]=i;
  }
}
function suspended(key){ return !!S.susp[key]; }
function usable(key){ return !isBuried(key) && !suspended(key); }

function pools(){
  var now=Date.now(), de=dayEnd(now), lrn=[], rev=[];
  rollDay();
  for(var k in S.items){ var it=S.items[k];
    if(!usable(k)) continue;
    if(it.s===1){ if(it.due<=de) rev.push(k); }
    else lrn.push(k);
  }
  rev.sort(function(a,b){return S.items[a].due-S.items[b].due;});
  lrn.sort(function(a,b){return S.items[a].due-S.items[b].due;});
  var all=[]; for(var kk in S.items){ if(S.items[kk].s===1 && usable(kk)) all.push(kk); }
  all.sort(function(a,b){return S.items[a].due-S.items[b].due;});

  var nw=[], cs=[], sn=[], mode=S.settings.reverse, listen=S.settings.listen!==false && ttsReady();
  // consolidation: the other directions of words already learned, interleaved per word
  for(var i=0;i<DECK.length;i++){
    var id=DECK[i].id, j=S.items[id+"|j"];
    if(!j) continue;
    var grad = j.s===1;
    if(mode!=="off" && !S.items[id+"|e"] && usable(id+"|e") && (mode==="now"||grad)) cs.push(id+"|e");
    if(listen && !soundIsAmbiguous(id) && !S.items[id+"|a"] && usable(id+"|a") && grad) cs.push(id+"|a");
  }
  /* Fresh words in introduction order, which is carried in the card's own `ord`
     field rather than by array position: the answer log indexes cards by
     position and the audio sprites are grouped by it, so the array must never
     be reshuffled. The order puts the trip first and spreads the tags, so five
     numbers do not arrive on the same day. */
  for(var m=0;m<INTRO.length;m++){ var jj=INTRO[m].id+"|j";
    if(INTRO[m].dup) continue;                  // the same word written another way
    if(!S.items[jj] && usable(jj)) nw.push(jj); }
  // sentences have their own small budget, and only open once their words are known
  if(S.settings.sentences!==false){
    sentQueueOrder();
    for(var q=0;q<SENT.length;q++){
      var x=SENT[q], sj=x.id+"|j", sa=x.id+"|a";
      if(!S.items[sj]){ if(usable(sj) && sentOpen(x)) sn.push(sj); }
      else {
        /* The transactional lines, and only those, are also asked the other way
           round: the English is shown and he has to produce the Japanese. That
           is the target task, and reading a sentence for meaning is not it. */
        var se=x.id+"|e";
        if(x.say && !S.items[se] && usable(se) && S.items[sj].s===1) sn.push(se);
        /* Hearing a sentence again is consolidation, not a new sentence, and it
           was taking nearly half of a budget meant for reading new ones. It goes
           on the follow-up allowance, where the word listening cards already are. */
        if(listen && !S.items[sa] && usable(sa) && S.items[sj].s===1) cs.push(sa);
      }
    }
    /* The queue used to be whatever order the sentence file happened to be in,
       and pickNext only ever takes the first entry. From the second week on the
       pool is oversubscribed, so the front of the file won every day and
       anything appended to the end was unreachable: a batch added for the trip
       would not have been seen once before the flight. Serving them in the
       order they became readable puts each sentence next to the words it is
       made of, which is also what makes it readable rather than a vocabulary
       test. */
    sn.sort(function(a,b){
      var ra=SENT_RANK[a.split("|")[0]], rb=SENT_RANK[b.split("|")[0]];
      if(ra!==rb) return ra-rb;
      return SENT_AT[a.split("|")[0]]-SENT_AT[b.split("|")[0]];
    });
  }
  // Conjugation waits for the base word to survive a real gap, not just to leave
  // the learning steps. Drilling tabemasu while taberu is still shaky makes the
  // two compete; a week of retained interval is enough to know it has stuck.
  var cj=[];
  if(S.settings.conj!==false){
    for(var q2=0;q2<CONJ.length;q2++){
      var g=CONJ[q2], gj=g.id+"|j";
      if(S.items[gj]) continue;
      if(!usable(gj)) continue;
      var par=S.items[g.w[0]+"|j"];
      if(par && par.s===1 && par.iv>=CONJ_GATE) cj.push(gj);
    }
  }
  POOL_CS_N=cs.length;
  return {lrn:lrn, rev:rev, all:all, nw:nw, cs:cs, sn:sn, cj:cj, now:now, de:de};
}
function counts(){
  var p=pools(); rollDay();
  var newLeft=Math.max(0,newAllowance()-S.daily.newDone);
  var revLeft=Math.max(0,S.settings.revCap-S.daily.revDone);
  var sentLeft=S.daily.noNew?0:Math.max(0,(S.settings.sentPerDay||0)-S.daily.sentDone);
  var conjLeft=S.daily.noNew?0:Math.max(0,(S.settings.conjPerDay||0)-S.daily.conjDone);
  var consLeft=Math.max(0,consAllowance()-S.daily.consDone);
  return {newN:Math.min(newLeft,p.nw.length)+Math.min(consLeft,p.cs.length)+
               Math.min(sentLeft,p.sn.length)+Math.min(conjLeft,p.cj.length),
          lrnN:p.lrn.length, dueN:Math.min(revLeft,p.rev.length),
          aheadN:p.all.length+p.lrn.length+Math.min(newLeft,p.nw.length)+Math.min(consLeft,p.cs.length)+
                 Math.min(sentLeft,p.sn.length)+Math.min(conjLeft,p.cj.length), p:p};
}

/* ---------- practice: drills that never touch the schedule ---------- */
// Answering a card early would otherwise compress its interval, so practice is
// deliberately inert. Repeated failures are collected and offered as a reset instead.
var PRESETS={
  all: {label:"Practice", note:"Everything you have met, mixed"}
};
var PRACTICE_CAP=40;
function shuffle(a){ for(var i=a.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)); var t=a[i]; a[i]=a[j]; a[j]=t; } return a; }
function inRotation(k){ return !!S.items[k] && !S.susp[k]; }

/* Practice-only conjugation cards. Built on demand from FORMS for words the
   learner already knows, registered in IDX so the normal card renderer can
   draw them, and never written into S.items: they cost no review time and
   move no interval. */
/* Not every verb carries every form: dekiru is already a potential, aru and
   mieru cannot take one, and a verb with no agent to do the wanting takes no
   tai form either, so those rows are shorter and the te-form moves up a slot.
   Every forms row is a flat list of (form name, kana, romaji) triples. The set
   of forms a word carries is read out of the row rather than inferred from its
   length: inferring broke the moment two different form sets had the same
   number of entries, which is what adding the tai form did. */
var FORM_LABEL={masu:"polite present", mashita:"polite past", masen:"polite negative",
  masendeshita:"polite past negative", potential:"can do it form", te:"te-form",
  tai:"want to do it form", past:"plain past", politepast:"polite past", neg:"negative"};
function formSet(row){
  var out=[];
  for(var i=0;i+2<row.length;i+=3) out.push([row[i], FORM_LABEL[row[i]]||row[i]]);
  return out;
}
var PSEUDO_BUILT=false;
function buildConjPractice(){
  if(PSEUDO_BUILT) return;
  PSEUDO_BUILT=true;
  for(var id in FORMS){
    var w=IDX[id]; if(!w) continue;
    var row=FORMS[id], set=formSet(row);
    for(var i=0;i<set.length && i*3+2<row.length;i++){
      var pid="x"+id+"_"+i;
      IDX[pid]={id:pid, t:"g", _i:w._i, pos:"conjugation", practiceOnly:true,
        kana:row[i*3+1], romaji:row[i*3+2],
        en:w.en+", "+set[i][1],
        base:w.kana, baseRomaji:w.romaji, baseEn:w.en,
        form:set[i][0], formEn:set[i][1],
        use:"drill only, nothing here is scheduled",
        rule:"", tags:["conjugation",set[i][0]], w:[id]};
    }
  }
}
// every conjugation card the learner has earned: its base word must be known
function conjPracticeKeys(){
  buildConjPractice();
  var out=[];
  for(var id in FORMS){
    var it=S.items[id+"|j"];
    if(!it || it.s!==1 || it.iv<CONJ_GATE) continue;
    var row=FORMS[id], n=formSet(row).length;
    for(var i=0;i<n;i++){ var pk="x"+id+"_"+i+"|j"; if(IDX["x"+id+"_"+i]) out.push(pk); }
  }
  return out;
}

/* ---------- focus mode ---------- */
/* Regular practice sweeps everything. Focus mode does the opposite: it finds
   the words that are actually failing and works only on those, from several
   angles rather than one. A word is weak for a reason, and a plain flip card
   never says what the reason is. Recognising it among four look-alikes,
   producing it from English, hearing it, and reading it inside a sentence each
   probe a different part of knowing a word. Nothing here touches the schedule. */
var FOCUS_WORDS=12, FOCUS_CAP=40;
var FOCUS_OPEN=true;   // a focus session runs until it is left, not to a card count

/* A word's recent answers, newest last, read from the log the app already keeps.
   Lifetime counters cannot see that a word has been answered correctly for a
   week, so the run and the windowed accuracy come from here instead. */
function answerLog(id, dir){
  var c=IDX[id]; if(!c) return [];
  var base = isSent(c) ? 100000 + c._i : (isConj(c) ? 200000 + c._i : c._i);
  var want = dir==="j" ? 0 : (dir==="e" ? 1 : (dir==="a" ? 2 : -1));
  var out=[];
  for(var i=0;i<S.log.length;i++){
    var r=S.log[i];
    if(r[1]!==base) continue;
    if(want>=0 && r[2]!==want) continue;  // one direction, or all three when dir is omitted
    out.push(r);
  }
  return out;
}
/* Recognition, production and listening are close to separate skills, and a
   word he reads perfectly but cannot say used to look healthy because the three
   were summed. The score now knows which one is failing, and focus drills it. */
function dirAccuracy(id, dir){
  var rows=answerLog(id, dir);
  if(rows.length<3) return null;
  var win=rows.slice(-WEAK_WINDOW), good=0;
  for(var i=0;i<win.length;i++) if(win[i][3]>1) good++;
  return {acc:good/win.length, n:win.length};
}
function worstDirection(id){
  var best=null;
  ["j","e","a"].forEach(function(d){
    if(!S.items[id+"|"+d]) return;
    var a=dirAccuracy(id,d);
    if(!a) return;
    if(!best || a.acc<best.acc) best={dir:d, acc:a.acc, n:a.n};
  });
  return best;
}
/* consecutive correct answers, and how many separate days they span. A run
   inside one sitting is weak evidence; a run across days is retention. */
function cleanRun(rows){
  var run=0, days={};
  for(var i=rows.length-1;i>=0;i--){
    if(rows[i][3]<=1) break;             // grade 1 is "again"
    run++; days[dayKey(rows[i][0]*1000)]=1;
  }
  var n=0; for(var k in days) n++;
  return {run:run, days:n};
}

var WEAK_WINDOW=8;        // answers considered recent
var WEAK_RUN=3;           // consecutive correct that clears a word
var WEAK_RUN_DAYS=2;      // spread over at least this many days
/* A clean run is only evidence once the card has survived a real gap. Three
   correct answers on three consecutive days, on a card the scheduler is still
   showing every single day, say nothing about whether the word has stuck, and
   they were quietly clearing freshly taught words out of Focus. The numbers
   were the obvious casualty: yon at 57 percent with three lapses, cleared. */
var WEAK_SETTLED=7;       // days of interval before a short clean run is believed

// how badly a word is going, from the evidence the app already holds
function weakness(id){
  var j=S.items[id+"|j"]; if(!j) return null;
  var e=S.items[id+"|e"], a=S.items[id+"|a"];
  var seen=(j.seen||0)+((e&&e.seen)||0)+((a&&a.seen)||0);
  var okN =(j.ok||0)+((e&&e.ok)||0)+((a&&a.ok)||0);
  var lapses=(j.lapses||0)+((e&&e.lapses)||0)+((a&&a.lapses)||0);
  var pf=(S.pfail[id+"|j"]||0)+(S.pfail[id+"|e"]||0)+(S.pfail[id+"|a"]||0);
  var missed=(S.daily.missed&&(S.daily.missed[id+"|j"]||S.daily.missed[id+"|e"]||S.daily.missed[id+"|a"]))?1:0;
  // a word only just met is new, not weak
  if(seen<3 && !lapses && !pf && !missed) return null;

  var rows=answerLog(id), cr=cleanRun(rows), wd=worstDirection(id);
  /* A word answered correctly several times across several days is known, and
     no amount of early fumbling changes that. Missing it in practice today
     still overrides, so the queue stays responsive. */
  var rep=S.crep[id]||0;
  /* A settled card clears on three correct answers. A card the scheduler still
     wants back within the week has not survived a gap worth the name, so three
     correct days in a row prove little and it takes twice as many. Six in a row
     is evidence on any card. */
  var enough = (j.iv>=WEAK_SETTLED) ? WEAK_RUN : WEAK_RUN*2;
  if(cr.run>=enough && cr.days>=WEAK_RUN_DAYS && !pf && !missed && !rep && j.s===1) return null;

  /* Accuracy over the recent window rather than the whole life of the card.
     The threshold used to be four logged answers, and below it the lifetime
     figure decided on its own. That trapped words: a card answered Easy twice
     since its last miss still scored on the old average, and because only a
     scheduled review is logged, a word on a fifty day interval could not clear
     itself for fifty days however often Focus asked it. Two logged answers are
     already the most recent evidence there is, so they are what counts. */
  var win=rows.slice(-WEAK_WINDOW), acc, lap;
  if(win.length>=2){
    var good=0, bad=0;
    for(var i=0;i<win.length;i++){ if(win[i][3]>1) good++; else bad++; }
    acc = good/win.length; lap = bad;
  } else {
    acc = seen ? okN/seen : 1; lap = lapses;
  }

  var sc = 0, why=[];
  if(lap){ sc += 2.0*lap; why.push(lap+" lapse"+(lap>1?"s":"")); }
  if(seen>=3 && acc<0.85){ sc += 3.0*(1-acc); why.push(Math.round(acc*100)+"% correct"); }
  /* Difficulty records how hard a card was to learn, not whether it is known
     now, and FSRS barely lowers it once it reaches the ceiling. It only counts
     when recall is actually poor. */
  if(j.sb>0 && j.df>5.5 && acc<0.85){ sc += 0.4*(j.df-5.5); why.push("difficulty "+j.df.toFixed(1)); }
  if(j.s===2){ sc += 2.0; why.push("relearning"); }
  if(pf){ sc += 1.5*pf; why.push("missed in practice"); }
  if(missed){ sc += 2.0; why.push("missed today"); }
  /* Asking for a word again in the car is the only signal that mode produces.
     It moves nothing in the schedule; it only tells Focus where to look. */
  if(rep){ sc += 1.2*Math.min(rep,3); why.push("replayed in the car"); }
  /* A direction that is failing on its own counts, even when the other two
     carry the average. This is what the first council called the blind spot. */
  if(wd && wd.acc<0.7){
    sc += 2.0*(1-wd.acc);
    why.push((wd.dir==="j"?"reading":wd.dir==="e"?"saying it":"hearing it")+
             " "+Math.round(wd.acc*100)+"%");
  }
  /* A word the scheduler still wants back within the week is not yet known, and
     Focus is exactly where a half learned word belongs. It only counts against
     a word that is also getting answers wrong, so a clean new word is left
     alone and the queue does not fill with things that are simply recent. */
  if(j.s===1 && j.iv<WEAK_SETTLED && (lap || acc<0.9)){
    sc += 1.0 + 2.0*(1-acc);
    why.push("still new, "+Math.round(acc*100)+"% correct");
  }
  if(sc<=0) return null;
  return {id:id, score:sc, why:why.join(", "), dir:(wd&&wd.acc<0.7)?wd.dir:null};
}
function weakWords(){
  var out=[];
  for(var i=0;i<DECK.length;i++){
    if(reservedFor(DECK[i].id)) continue;     // drilled by nothing, so the check stays clean
    var w=weakness(DECK[i].id);
    if(w && !S.susp[DECK[i].id+"|j"]) out.push(w);
  }
  out.sort(function(a,b){ return b.score-a.score; });
  return out;
}
// four plausible options: same part of speech and same area where possible
function distractors(c, n){
  var pool=[], i, d;
  for(i=0;i<DECK.length;i++){ d=DECK[i];
    if(d.id===c.id) continue;
    if(d.pos===c.pos && d._sec===c._sec) pool.push(d); }
  if(pool.length<n) for(i=0;i<DECK.length;i++){ d=DECK[i];
    if(d.id!==c.id && d.pos===c.pos && pool.indexOf(d)<0) pool.push(d); }
  if(pool.length<n) for(i=0;i<DECK.length;i++){ d=DECK[i];
    if(d.id!==c.id && pool.indexOf(d)<0) pool.push(d); }
  shuffle(pool);
  // never offer two options that read the same
  /* Byte-identical glosses were refused, which let "a place, a spot" sit
     against "a place, in the abstract" as two options in one question. The
     first sense of a gloss is what a learner reads, so that is what is
     compared, and a card marked as another card's duplicate never appears. */
  function sense(x){ return String(x).split(/[\/,(]/)[0].trim().toLowerCase()
    .replace(/^(a|an|the|to)\s+/,""); }
  var out=[], usedEn={}, usedKana={};
  usedEn[sense(c.en)]=1; usedKana[c.kana]=1;
  for(i=0;i<pool.length && out.length<n;i++){
    if(pool[i].dup) continue;
    if(usedEn[sense(pool[i].en)]||usedKana[pool[i].kana]) continue;
    usedEn[sense(pool[i].en)]=1; usedKana[pool[i].kana]=1; out.push(pool[i]);
  }
  return out;
}
/* The romaji gap is cut on a token boundary too, or the line is left whole
   rather than mutilated: a half-cut romaji under a cut kana gives the answer
   away and teaches a false parse at the same time. */
function romajiGap(sx, c, kanaAt){
  var want=String(c.romaji).toLowerCase().split(/\s+/);
  var raw=sx.romaji, low=raw.toLowerCase();
  var re=/[a-z']+/g, m, toks=[];
  while((m=re.exec(low))) toks.push({t:m[0], i:m.index, n:m[0].length});
  function eq(a,b){
    if(a===b) return true;
    var pair={wa:"ha",ha:"wa",e:"he",he:"e",o:"wo",wo:"o"};
    return pair[a]===b;
  }
  for(var i=0;i+want.length<=toks.length;i++){
    var ok=true;
    for(var j=0;j<want.length;j++) if(!eq(toks[i+j].t, want[j])){ ok=false; break; }
    if(!ok) continue;
    var st=toks[i].i, en=toks[i+want.length-1].i+toks[i+want.length-1].n;
    return raw.slice(0,st)+"____"+raw.slice(en);
  }
  return raw;
}
function sentenceWith(id){
  var list=sentencesFor(id), ok=[];
  for(var i=0;i<list.length;i++){
    var x=list[i];
    // only a sentence the build proved has a safe gap for this word
    if(!x.g || typeof x.g[id]!=="number") continue;
    /* And only a sentence he can actually read. A cloze is a reading question:
       the blank is worked out from the words around it. One sentence offered
       for dewa arimasen was yasai wa amari suki ____, where four of the five
       words were ones he had never been taught, so there was nothing to reason
       from and the four endings on offer were a coin toss. Every word except
       the answer has to be known. */
    var miss=sentMissing(x), unknown=0;
    for(var m=0;m<miss.length;m++) if(miss[m]!==id) unknown++;
    if(unknown===0) ok.push(x);
  }
  if(!ok.length) return null;
  /* Always returning the first one meant a word with four usable sentences was
     only ever seen in one of them, and what got learned was that sentence rather
     than the word. Rotated on how many times the word has been answered, so it
     is stable within a card and moves on between them. */
  var it=S.items[id+"|j"], n=(it && it.r) ? it.r : 0;
  return ok[n % ok.length];
}
// the question types available for one word, given what the app knows about it
function focusTypes(id){
  var c=IDX[id]; if(!c) return [];
  var t=["mcJE","mcEJ","flipJ","flipE"];
  if(S.settings.tts!==false && listenOn() && !soundIsAmbiguous(id)) t.push("mcAudio");
  if(FORMS[id]) t.push("conj");
  if(sentenceWith(id)) t.push("cloze");
  t.push("type");
  return t;
}
function makeQuestion(kind, id){
  var c=IDX[id]; if(!c) return null;
  var key=id+"|j", d3, opts, i;
  if(kind==="mcJE" || kind==="mcAudio"){
    d3=distractors(c,3); if(d3.length<3) return null;
    opts=shuffle(d3.map(function(x){return {text:x.en, ok:false};})
      .concat([{text:c.en, ok:true}]));
    return {kind:kind, id:id, key: kind==="mcAudio" ? id+"|a" : key, opts:opts,
      ask: kind==="mcAudio" ? "What did you hear?" : "What does this mean?"};
  }
  if(kind==="mcEJ"){
    d3=distractors(c,3); if(d3.length<3) return null;
    opts=shuffle(d3.map(function(x){return {text:x.kana, sub:x.romaji, ok:false};})
      .concat([{text:c.kana, sub:c.romaji, ok:true}]));
    return {kind:kind, id:id, key:id+"|e", opts:opts, ask:"Which one is it?"};
  }
  if(kind==="conj"){
    var row=FORMS[id]; if(!row) return null;
    var set=formSet(row);
    var pick=Math.floor(Math.random()*set.length);
    if(pick*3+2>=row.length) pick=0;
    var right=row[pick*3+1], rightR=row[pick*3+2];
    /* Two different verbs can share a form: itte is the te-form of both iku
       (to go) and iu (to say). An option list with the same word twice is not a
       question, so every candidate is checked against what is already there. */
    var wrong=[], others=[], used={};
    used[right]=1;
    function addWrong(pair){ if(used[pair[0]]) return false; used[pair[0]]=1; wrong.push(pair); return true; }
    for(i=0;i<set.length;i++) if(i!==pick && i*3+2<row.length) others.push([row[i*3+1],row[i*3+2]]);
    /* Taken in row order these were always forms 0 and 1, so two thirds of the
       drill showed the same pair of decoys and the question could be answered by
       elimination without reading which form was asked for. */
    shuffle(others);
    /* Fill up with the SAME form taken from other verbs, so the choice is real.
       The form is matched by name: matching by row position only worked while
       every row happened to list its forms in the same order. */
    var want=set[pick][0];
    var pool=[]; for(var q in FORMS){ if(q===id) continue; var r2=FORMS[q];
      for(var z=0;z+2<r2.length;z+=3){ if(r2[z]===want){ pool.push([r2[z+1],r2[z+2]]); break; } } }
    shuffle(pool);
    for(i=0;i<others.length && wrong.length<2;i++) addWrong(others[i]);
    for(i=0;i<pool.length && wrong.length<3;i++) addWrong(pool[i]);
    if(wrong.length<3) return null;
    opts=shuffle(wrong.map(function(x){return {text:x[0], sub:x[1], ok:false};})
      .concat([{text:right, sub:rightR, ok:true}]));
    return {kind:"conj", id:id, key:key, opts:opts, form:set[pick][1],
      ask:"Which is the "+set[pick][1]+" of this word?"};
  }
  if(kind==="cloze"){
    var sx=sentenceWith(id); if(!sx) return null;
    d3=distractors(c,3); if(d3.length<3) return null;
    opts=shuffle(d3.map(function(x){return {text:x.kana, sub:x.romaji, ok:false};})
      .concat([{text:c.kana, sub:c.romaji, ok:true}]));
    /* split/join blanked every occurrence of the string, so a question about
       ni (に) shredded nihon (にほん, Japan) in the same sentence. Only the first
       occurrence is cut, and the English translation is no longer shown while
       the question is live: printing it under the gap handed over the answer. */
    /* indexOf found the kana anywhere, so a question about de (で) cut a hole
       in the middle of desu (です) and a question about ga (が) scooped a
       syllable out of onegai shimasu (おねがいします, please). The build now
       computes the one safe offset per sentence and word, by matching whole
       romaji tokens, and stores it. No stored offset, no cloze. */
    var at = (sx.g && typeof sx.g[id]==="number") ? sx.g[id] : -1;
    if(at<0 || sx.kana.substr(at, c.kana.length)!==c.kana) return null;
    var blank = sx.kana.slice(0,at)+"\u3000____\u3000"+sx.kana.slice(at+c.kana.length);
    var blankR = romajiGap(sx, c, at);
    return {kind:"cloze", id:id, key:key, opts:opts, sent:sx,
      blank:blank, blankR:blankR, ask:"Which word fills the gap?"};
  }
  if(kind==="type") return {kind:"type", id:id, key:id+"|e", ask:"Type it in romaji"};
  if(kind==="flipE") return {kind:"flip", id:id, key:id+"|e", dir:"e"};
  return {kind:"flip", id:id, key:key, dir:"j"};
}
function focusQueue(){
  var weak=weakWords();
  if(!weak.length) return [];
  var picks=shuffle(weak.slice(0, FOCUS_WORDS)), out=[], rounds=[];
  /* A blind shuffle of eight question types gave roughly one weak word in three
     nothing but four-option questions, where the guess floor is 25 percent.
     Every word now gets one recognition question, one that demands production
     from memory, and one free choice, in that order. */
  /* mcEJ is four Japanese options with a 25 percent guess floor, which is
     recognition wearing a production label, so it sits with the others. */
  var RECOG=["mcJE","mcAudio","cloze","conj","mcEJ"], PRODUCE=["type","flipE"];
  // mcEJ is four Japanese options, so it belongs with recognition, not here
  var BYDIR={j:["mcJE","cloze"], e:["type","flipE"], a:["mcAudio"]};
  function makeKind(t){ return (t==="flipE"||t==="flipJ") ? "flip" : t; }
  function firstOf(list, id){
    var l=shuffle(list.slice());
    for(var t=0;t<l.length;t++){ var q=makeQuestion(l[t], id); if(q) return q; }
    return null;
  }
  for(var i=0;i<picks.length;i++){
    var id=picks[i].id, avail=focusTypes(id), made=[];
    // the failing direction gets the first slot when the score names one
    var lead=picks[i].dir ? BYDIR[picks[i].dir] : null;
    var r=lead ? firstOf(lead.filter(function(t){return avail.indexOf(t)>=0;}), id) : null;
    if(!r) r=firstOf(RECOG.filter(function(t){return avail.indexOf(t)>=0;}), id);
    if(r) made.push(r);
    /* when the failing direction is production, the lead list and the produce
       list are the same two types, so the lead is excluded here or the word
       gets the same question twice and no recognition probe at all */
    var pr=firstOf(PRODUCE.filter(function(t){
      return avail.indexOf(t)>=0 && !(r && makeKind(t)===r.kind); }), id);
    if(pr) made.push(pr);
    var rest=shuffle(avail.slice());
    for(var j=0;j<rest.length && made.length<3;j++){
      var q=makeQuestion(rest[j], id);
      if(q && !made.some(function(m){return m.kind===q.kind;})) made.push(q);
    }
    if(!made.length){ var f=makeQuestion("flipJ",id); if(f) made.push(f); }
    for(var m2=0;m2<made.length;m2++){
      made[m2].why=picks[i].why;
      (rounds[m2] = rounds[m2] || []).push(made[m2]);
    }
  }
  /* One round of every word before the second round of any of them. Pushing a
     word's three questions straight into the queue asked the same word three
     times in a row, and the second question was then a free look at the answer
     the first one had just shown. The order inside a word still holds: the
     rounds are concatenated in order and the first round is the one aimed at
     the direction that is failing. */
  for(var rr=0;rr<rounds.length;rr++){
    var band=shuffle(rounds[rr]);
    /* the seam between two rounds is the one place the same word can still meet
       itself, so the incoming round starts on a different word */
    if(out.length && band.length>1 && band[0].id===out[out.length-1].id){
      for(var sw=1;sw<band.length;sw++){
        if(band[sw].id!==band[0].id){ var t=band[0]; band[0]=band[sw]; band[sw]=t; break; }
      }
    }
    out=out.concat(band);
  }
  return FOCUS_OPEN ? out : out.slice(0, FOCUS_CAP);
}
function startFocus(){
  var q=focusQueue();
  /* Regular practice was removed: everything it served, focus serves better.
     So focus must never dead end. With nothing going badly it falls back to a
     mixed draw over everything met, which is what regular practice was. */
  if(!q.length){
    var keys=practiceQueue();
    if(!keys.length){ toast("Nothing met yet. Study a few words first."); return; }
    startPractice(); return;
  }
  var words={}; for(var i=0;i<q.length;i++) words[q[i].id]=1;
  Sess.on=true; Sess.practice=true; Sess.focus=true; Sess.preset="focus";
  Sess.queue=q; Sess.qi=0; Sess.done=0; Sess.plan=q.length; Sess.undo=null; Sess.last=null;
  Sess.pOk=0; Sess.pMiss=0; Sess.pMissedKeys=[]; Sess.focusWords=Object.keys(words).length;
  go("review"); document.getElementById("tabs").classList.add("hide");
  Sess.q=q[0]; Sess.key=q[0].key; Sess.shown=false; Sess.answered=false; renderCard();
}

/* One queue over everything already met. Today's mistakes go in first, then the
   shakiest cards, then a random draw from the rest, so a single session always
   covers what was just missed, what is weak, and what is merely old. */
function practiceQueue(){
  var seen={}, out=[], k, all=[];
  function take(k){ if(seen[k]) return; if(reservedFor(k.split("|")[0])) return;
    seen[k]=1; out.push(k); }

  for(k in (S.daily.missed||{})) if(inRotation(k)) take(k);

  var weak=[];
  for(k in S.items){ if(!inRotation(k)) continue;
    var it=S.items[k];
    if(it.s===1 || it.lapses) weak.push(k);
    all.push(k); }
  weak.sort(function(a,b){
    var A=S.items[a], B=S.items[b];
    if(B.lapses!==A.lapses) return B.lapses-A.lapses;
    return A.ef-B.ef; });
  for(var i=0;i<weak.length && out.length<Math.round(PRACTICE_CAP*0.4);i++) take(weak[i]);

  // a quarter of the session is conjugation, once any of it has been earned
  if(S.settings.conj!==false){
    var cj=shuffle(conjPracticeKeys());
    for(var m=0;m<cj.length && out.length<Math.round(PRACTICE_CAP*0.65);m++) take(cj[m]);
  }

  shuffle(all);
  for(var j=0;j<all.length && out.length<PRACTICE_CAP;j++) take(all[j]);
  return shuffle(out);
}
function startPractice(){
  var q=practiceQueue();
  if(!q.length){ toast("Nothing met yet. Study a few words first."); return; }
  Sess.on=true; Sess.practice=true; Sess.focus=false; Sess.preset="all"; Sess.queue=q; Sess.qi=0;
  Sess.done=0; Sess.plan=q.length; Sess.undo=null; Sess.last=null;
  Sess.pOk=0; Sess.pMiss=0; Sess.pMissedKeys=[];
  go("review"); document.getElementById("tabs").classList.add("hide");
  Sess.key=q[0]; Sess.shown=false; renderCard();
}
function practiceAnswer(ok){
  var k=Sess.key;
  S.life.practice=(S.life.practice||0)+1;
  var scheduled = !!S.items[k];
  if(ok){ Sess.pOk++; if(S.pfail[k]) delete S.pfail[k]; }
  else {
    Sess.pMiss++;
    if(scheduled){
      S.pfail[k]=(S.pfail[k]||0)+1;
      if(Sess.pMissedKeys.indexOf(k)<0) Sess.pMissedKeys.push(k);
    }
  }
  save();
  Sess.done++; Sess.last=k; Sess.qi++;
  if(Sess.qi>=Sess.queue.length){ endPractice(); return; }
  var nx=Sess.queue[Sess.qi];
  if(Sess.focus){ Sess.q=nx; Sess.key=nx.key; Sess.answered=false; }
  else Sess.key=nx;
  Sess.shown=false; renderCard();
}
function endPractice(){
  var stale=[];
  for(var i=0;i<Sess.pMissedKeys.length;i++){
    var k=Sess.pMissedKeys[i];
    if((S.pfail[k]||0)>=2 && S.items[k] && S.items[k].s===1) stale.push(k);
  }
  var ok=Sess.pOk, miss=Sess.pMiss, total=ok+miss;
  var wasFocus=Sess.focus, nWords=Sess.focusWords||0;
  Sess.on=false; Sess.practice=false; Sess.focus=false; Sess.q=null;
  Sess.queue=null; Sess.undo=null; Sess.last=null;
  document.getElementById("tabs").classList.remove("hide");
  go("home"); render();
  if(wasFocus && !stale.length){
    toast(ok+" of "+total+" recalled across "+nWords+" weak word"+(nWords>1?"s":"")+
      ". Nothing scheduled changed.");
    return;
  }
  if(stale.length) showResetOffer(stale, ok, total);
  else toast(total ? ok+" of "+total+" recalled. Nothing scheduled changed." : "Practice ended.");
}
function showResetOffer(keys, ok, total){
  var el=document.getElementById("sheet");
  var rows=keys.map(function(k){
    var c=cardOf(k), it=S.items[k];
    return '<div class="exline"><div class="ex-jp">'+esc(c.kana)+'</div>'+
      '<div class="ex-rm">'+esc(c.romaji)+'</div>'+
      '<div class="ex-en">'+esc(c.en)+'<span class="ex-st">next in '+ivLabel(it.due-Date.now())+'</span></div></div>';
  }).join("");
  el.innerHTML='<div class="sheet-in">'+
    '<div class="sheet-head"><button class="x" id="sheetClose" aria-label="Close">&times;</button></div>'+
    '<h3 class="sheet-title">'+ok+' of '+total+' recalled</h3>'+
    '<p class="fine">Nothing in your schedule changed. These '+keys.length+' card'+(keys.length>1?"s":"")+
    ' you have now missed twice in practice while still sitting on a long interval. '+
    'Resetting sends them back through the learning steps.</p>'+
    '<div class="sheet-sec">'+rows+'</div>'+
    '<div class="sheet-acts">'+
      '<button class="btn btn-ghost" id="resetSkip">Leave them</button>'+
      '<button class="btn" id="resetGo">Reset '+keys.length+'</button>'+
    '</div></div>';
  el.hidden=false;
  if(!el._wired){ el._wired=1; el.addEventListener("click",function(e){ if(e.target===el) closeSheet(); }); }
  document.getElementById("sheetClose").addEventListener("click",closeSheet);
  document.getElementById("resetSkip").addEventListener("click",function(){
    keys.forEach(function(k){ delete S.pfail[k]; }); save(); closeSheet();
  });
  document.getElementById("resetGo").addEventListener("click",function(){
    var now=Date.now();
    keys.forEach(function(k){
      var it=S.items[k];
      S.items[k]={s:0,st:0,n:0,ef:it.ef,iv:0,due:now,lapses:it.lapses,piv:it.iv,seen:it.seen,ok:it.ok};
      delete S.pfail[k]; Remote.dirty[shardOf(k)]=1;
    });
    save(); closeSheet(); render(); toast(keys.length+" card"+(keys.length>1?"s":"")+" back in learning");
  });
}

/* ---------- session ---------- */
var Sess = {on:false, mode:"today", practice:false, preset:null, queue:null, qi:0,
  pOk:0, pMiss:0, pMissedKeys:[], key:null, last:null, shown:false, done:0, plan:0, intro:0, typed:false, undo:null};
function pickNext(){
  rollDay();
  var p=pools(), now=p.now, ahead=(Sess.mode==="ahead");
  var dueLrn=p.lrn.filter(function(k){return S.items[k].due<=now;});
  if(dueLrn.length){
    if(dueLrn[0]!==Sess.last || dueLrn.length===1) return dueLrn[0];
    return dueLrn[1];
  }
  /* Study ahead lifts the review cap and the due date, nothing else. Pulling
     future reviews forward is the point of it; introducing unlimited new words,
     sentences and conjugation was never meant to be, and it quietly overran a
     new-words-per-day setting of 2. Every budget for fresh material still
     applies here exactly as it does in a normal session. */
  var revPool = ahead ? p.all : p.rev;
  var newLeft  = Math.max(0,newAllowance()-S.daily.newDone);
  var revLeft  = ahead ? revPool.length : Math.max(0,S.settings.revCap-S.daily.revDone);
  var sentLeft = S.daily.noNew?0:Math.max(0,(S.settings.sentPerDay||0)-S.daily.sentDone);
  var conjLeft = S.daily.noNew?0:Math.max(0,(S.settings.conjPerDay||0)-S.daily.conjDone);
  var consLeft = Math.max(0,consAllowance()-S.daily.consDone);
  var picks=[];
  if(revPool.length && revLeft>0) picks.push(revPool[0]);
  if(p.nw.length && newLeft>0)    picks.push(p.nw[0]);
  if(p.cs.length && consLeft>0)   picks.push(p.cs[0]);
  if(p.sn.length && sentLeft>0)   picks.push(p.sn[0]);
  if(p.cj.length && conjLeft>0)   picks.push(p.cj[0]);
  if(picks.length) return picks[Sess.done % picks.length];
  /* Learn ahead only when something is close, and never the card just
     answered. The "|| p.lrn.length===1" that used to sit on this test was the
     loophole: with one learning card left it handed back the card that had
     just been graded, up to twenty minutes before it was due, so the same
     card appeared twice in a row for no reason. Ending the session a card
     early is the better answer, and the card is still there in ten minutes.
     The due-learning branch above keeps its version of that clause because
     there the card has genuinely come round again. */
  for(var li=0; li<p.lrn.length; li++){
    var lk=p.lrn[li];
    if(S.items[lk].due-now >= (ahead?3600000:1200000)) break;
    if(lk!==Sess.last) return lk;
  }
  return null;
}
function planSize(){var c=counts(); return c.newN+c.dueN+c.lrnN;}
function buriedCount(){
  if(S.settings.separate===false) return 0;
  var n=0, b=S.daily.buried||{};
  for(var k in b){
    if(S.daily.done && S.daily.done[k]) continue;
    var p=k.split("|"), c=IDX[p[0]];
    if(!c) continue;
    if(p[1]==="e" && (isSent(c) || isConj(c) || S.settings.reverse==="off")) continue;
    if(p[1]==="a" && !listenOn()) continue;
    if(S.susp[k]) continue;
    n++;
  }
  return n; }

function startSession(mode){
  Sess.on=true; Sess.practice=false; Sess.queue=null; Sess.mode=mode||"today"; Sess.done=0; Sess.undo=null; Sess.last=null;
  Sess.plan = Sess.mode==="ahead" ? 0 : planSize();
  go("review"); document.getElementById("tabs").classList.add("hide");
  nextCard();
}
function endSession(msg){
  Sess.on=false; Sess.practice=false; Sess.queue=null; Sess.undo=null; Sess.last=null;
  document.getElementById("tabs").classList.remove("hide");
  go("home"); render(); if(msg) toast(msg);
}
function nextCard(){
  var k=pickNext();
  if(!k){ endSession(sessionEndMsg()); return; }
  Sess.key=k; Sess.shown=false; Sess.typed=null; Sess.verdict=null; Sess.override=false;
  renderCard();
}
function sessionEndMsg(){
  var p=pools(), now=Date.now();
  var held=buriedCount();
  if(p.lrn.length) return p.lrn.length+" card"+(p.lrn.length>1?"s":"")+" come back in "+ivLabel(S.items[p.lrn[0]].due-now);
  if(held) return held+" follow-up card"+(held>1?"s":"")+" held until tomorrow.";
  if(Sess.mode==="ahead") return "Nothing left to pull forward.";
  return "Today's queue is clear. Start again to study ahead.";
}

/* ---------- rendering: review ---------- */
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
var TTS={checked:false, ja:false, voices:[], en:[], seen:false, nudged:false};
/* Listening needs a Japanese voice on the device. With none installed the
   cards cannot be shown, so they are left out of every pool, every count and
   every budget, and their schedules are preserved untouched for the day a
   voice appears. */
/* Listening no longer depends on the phone owning a Japanese voice: the
   downloaded clips are a voice. Only a device with neither is excluded. */
function audReady(){ return audOn() && !!AUD.man; }
function listenOn(){ return S.settings.listen!==false && (ttsReady() || audReady()); }
function listenWanted(){ return S.settings.listen!==false; }
function listenBlocked(){ return listenWanted() && !ttsReady() && !audReady(); }
function ttsReady(){ return TTS.ja; }
/* His phone lists no Japanese voice at all and speaks correct Japanese anyway:
   an utterance with lang ja-JP and no voice named is given one iOS keeps to
   itself. The Settings test does exactly that and works, while every card was
   sent to the downloaded library instead, because the card path asked whether a
   Japanese voice was in the list rather than whether Japanese could be spoken.
   Those are not the same question, and on this phone the answer to the first is
   no and to the second is yes. The engine having produced a voice list at all
   is what card audio now waits for; the library remains the fallback for a
   phone with no speech engine, and the switch in Settings still forces it. */
function ttsUsable(){ return ("speechSynthesis" in window) && (TTS.ja || TTS.seen); }
/* WebKit hands out its voice list lazily. On an iPhone, and especially in a
   Home Screen web app, getVoices() can return an empty list, or an English-only
   list, until speech has actually been used inside a user gesture. The old
   probe scanned once, gave up after 1.2 seconds, and stopped: a device that had
   a Japanese voice but had not yet loaded it was recorded as having none, which
   silently dropped every listening card out of the deck and out of the score.
   This version keeps looking: on the voiceschanged event, on a retry schedule,
   on the first tap (nudging the engine with a silent utterance), and whenever
   the app comes back to the foreground. */
function ttsScan(){
  var v=[];
  try{ v=speechSynthesis.getVoices()||[]; }catch(e){}
  var ja=v.filter(function(x){ return (x.lang||"").toLowerCase().indexOf("ja")===0; });
  var was=TTS.ja;
  // car mode speaks the English side too, so the English voices are kept as well
  TTS.en=v.filter(function(x){ return (x.lang||"").toLowerCase().indexOf("en")===0; });
  TTS.voices=ja;
  TTS.ja=ja.length>0;
  if(v.length) TTS.seen=true;
  if(TTS.ja!==was){ TTS.checked=true; try{ render(); }catch(e){} return true; }
  if(TTS.ja) TTS.checked=true;
  return false;
}
// a silent utterance is the only reliable way to make WebKit load its voices
function ttsNudge(){
  if(TTS.ja || TTS.nudged || !("speechSynthesis" in window)) return;
  TTS.nudged=true;
  try{
    var u=new SpeechSynthesisUtterance(" ");
    u.volume=0; u.rate=1; u.lang="ja-JP";
    speechSynthesis.speak(u);
  }catch(e){}
  setTimeout(ttsScan, 300);
  setTimeout(ttsScan, 1200);
}
function ttsProbe(){
  if(!("speechSynthesis" in window)) { TTS.checked=true; return; }
  ttsScan();
  try{ speechSynthesis.addEventListener("voiceschanged", ttsScan); }catch(e){}
  [300,1000,2500,5000,10000].forEach(function(ms){
    setTimeout(function(){ if(!TTS.ja) ttsScan(); }, ms);
  });
  // the first touch anywhere is the opening WebKit needs
  ["pointerdown","touchstart","click"].forEach(function(ev){
    document.addEventListener(ev, ttsNudge, {once:false, passive:true});
  });
  document.addEventListener("visibilitychange",function(){
    if(document.visibilityState!=="visible") return;
    if(!TTS.ja) setTimeout(ttsScan,200);
  });
}
/* Real speech is not one voice at one fixed speed. A card that always plays at
   0.85 with the same voice trains recognition of that recording, not of the
   word. Rate is jittered around the setting, and where the device offers more
   than one Japanese voice they are rotated. speakSlow is the deliberate escape
   hatch: same word, clearly slower, for when the normal speed did not land. */
var VOICE_N=0;
/* The English side was given a ranking because rotating blind produced robots.
   The Japanese side was left rotating blind, which was an oversight and not a
   small one: an iPhone's Japanese list can hold Eloquence, a formant
   synthesiser from the 1980s, next to Kyoko Enhanced, a 119 MB recorded voice,
   and the old code gave them equal turns. It also gave a compact voice equal
   turns with its own enhanced version, and a compact voice loses the quietest
   sound first, which in Japanese is fu. Same shape as enScore, applied to the
   language the app is actually teaching. */
var JA_ROBOT=["eloquence","grandma","grandpa","reed","rocko","sandy","shelley","flo","eddy",
  "glen","bells","boing","bubbles","cellos","jester","organ","trinoids","whisper","wobble",
  "zarvox","albert","bad news","good news","superstar","deranged","hysterical"];
var JA_GOOD=["kyoko","o-ren","oren","otoya","hattori","siri"];
/* Safari does not put the quality in the name. Downloading Kyoko Enhanced put
   a second voice in the list also called "Kyoko", and the first version of
   this ranking scored them identically, rotated between them, and printed
   "Now using Kyoko, Kyoko" in Settings. The identifier is the only field that
   can carry the difference, so both are read; if it does not carry it either,
   nothing is lost, because the tie is broken below instead of guessed at. */
function vId(v){ return (v && (v.voiceURI || v.name)) || ""; }
function vText(v){ return ((v&&v.name)||"")+" "+vId(v); }
function jaScore(v){
  var n=vText(v).toLowerCase(), sc=0, i;
  for(i=0;i<JA_ROBOT.length;i++) if(n.indexOf(JA_ROBOT[i])>=0) sc-=100;
  if(/enhanced|premium|neural/.test(n)) sc+=40;
  /* his phone offers com.apple.voice.compact and com.apple.voice.super-compact
     of the same Kyoko; the smaller one is the worse one */
  if(/super-compact/.test(n)) sc-=30;
  else if(/compact/.test(n)) sc-=20;
  for(i=0;i<JA_GOOD.length;i++) if(n.indexOf(JA_GOOD[i])>=0){ sc+=20; break; }
  if(v.localService) sc+=2;
  if(v.default) sc+=1;
  return sc;
}
/* Two voices called Kyoko, and both identifiers contain the word "compact",
   so naming the quality told them apart not at all: the picker showed
   "Kyoko - compact" twice. A label is only useful if it is unique, so the
   quality word is tried first, and where that still collides the labels fall
   back to the part of the identifier that actually differs between them, and
   failing even that to a number. Nothing here assumes what Apple puts in an
   identifier; it shows whatever is there and distinct. */
function jaQuality(v){
  var t=vText(v).toLowerCase();
  if(/premium/.test(t)) return "premium";
  if(/enhanced/.test(t)) return "enhanced";
  if(/neural/.test(t)) return "neural";
  if(/compact/.test(t)) return "compact";
  return "";
}
/* Guessing at what distinguishes two identifiers produced worse labels than
   not guessing: both of his say "compact", and trimming the common prefix left
   one of them with nothing to show. So a shared name is distinguished by the
   quality word only when the quality words actually differ, and otherwise by a
   plain number, which is always unique and is all a person needs in order to
   pick each one and listen. The identifier itself is printed once, next to the
   voice in use, where it is diagnosis rather than decoration. */
function jaLabels(list){
  var n=list.length, i, k;
  var base=list.map(function(v){ return (v && v.name) || "voice"; });
  var out=base.slice(), groups={};
  for(i=0;i<n;i++){ (groups[base[i]]=groups[base[i]]||[]).push(i); }
  for(var nm in groups){
    var g=groups[nm];
    if(g.length<2) continue;
    var qs=g.map(function(ix){ return jaQuality(list[ix]); });
    var uniq={}, allSet=true;
    for(k=0;k<qs.length;k++){ if(!qs[k]) allSet=false; uniq[qs[k]]=1; }
    if(allSet && Object.keys(uniq).length===g.length){
      for(k=0;k<g.length;k++) out[g[k]]=nm+" \u00b7 "+qs[k];
    } else {
      for(k=0;k<g.length;k++) out[g[k]]=nm+" \u00b7 "+(k+1);
    }
  }
  return out;
}
function jaLabel(v, list){
  var l=jaLabels(list), i;
  for(i=0;i<list.length;i++) if(list[i]===v) return l[i];
  return (v && v.name) || "voice";
}
function jaUsable(){ return (TTS.voices||[]).slice(); }
function jaRanked(){
  var v=jaUsable().slice();
  v.sort(function(a,b){ var d=jaScore(b)-jaScore(a);
    return d!==0 ? d : String(a.name||"").localeCompare(String(b.name||"")); });
  return v;
}
/* Variety is still worth having, but only among voices that are all good. The
   rotation now runs across the top tier and never reaches down into it. */
/* One voice per name in the rotation. Two entries called Kyoko are a compact
   voice and a 119 MB recorded one, and alternating between them means half the
   cards are read by the worse of the two at random. Ranked order already puts
   the better one first where the identifier says so; where it does not, taking
   the first is still a fixed choice rather than a coin flip, and the picker is
   there to override it by ear. */
function jaTop(){
  var r=jaRanked(); if(!r.length) return [];
  var best=jaScore(r[0]), out=[], seen={}, i, nm;
  for(i=0;i<r.length;i++){
    if(jaScore(r[i])<best-5) break;
    nm=(r[i].name||"")+"";
    if(seen[nm]) continue;
    seen[nm]=1; out.push(r[i]);
  }
  return out;
}
/* Naming a voice is not an improvement, it is a restriction. His phone lists
   only com.apple.voice.compact.ja-JP.Kyoko and its super-compact sibling, both
   compressed and both robotic, while an utterance that names nothing is given a
   voice iOS does not advertise and which sounds markedly better: that is what
   he heard while the list was empty, and the robot is what came back the moment
   the list did. So nothing is named unless he names it. The ranking still
   decides what the picker offers and what it calls things, and it still keeps a
   formant synthesiser out of the list, but it no longer overrides the engine's
   own judgement by default. */
function jaVoice(){
  var want=S.settings.jaVoice, list=jaUsable(), i;
  if(!want || want==="auto") return null;   // let iOS choose, it chooses better
  /* pinned by identifier, not by name: two voices share the name Kyoko, so a
     name would have pinned whichever happened to be first. A pin to a voice
     that has since gone silent is ignored rather than honoured. */
  if(want && want!=="auto"){
    for(i=0;i<list.length;i++) if(vId(list[i])===want){ TTS.last=list[i]; return list[i]; }
    for(i=0;i<list.length;i++) if(list[i].name===want){ TTS.last=list[i]; return list[i]; }
  }
  var top=jaTop();
  if(!top.length){ TTS.last=list[0]||null; return list[0]||null; }
  var pick = (top.length<2 || S.settings.speechVary===false) ? top[0] : top[(VOICE_N++) % top.length];
  TTS.last=pick;
  return pick;
}
/* Safari hands out only a subset of the voices iOS actually has, and on many
   devices the English half of that subset is the Eloquence family: a formant
   synthesiser from the 1980s that sounds like a robot, because it is one.
   Rotating through them, the way the Japanese side deliberately does, means a
   different robot every time. English gets one stable, ranked choice instead,
   and a picker in settings for when the ranking guesses wrong. */
var EN_NOVELTY=["albert","bad news","bahh","bells","boing","bubbles","cellos","deranged",
  "good news","jester","organ","superstar","trinoids","whisper","wobble","zarvox","hysterical",
  "pipe organ","bruce","junior","kathy","princess","ralph","fred"];
var EN_ELOQUENCE=["eddy","flo","grandma","grandpa","reed","rocko","sandy","shelley","glen",
  "eloquence"];
var EN_GOOD=["samantha","alex","ava","allison","susan","tom","nicky","aaron","karen","daniel",
  "moira","tessa","serena","fiona","rishi","kate","oliver","evan","joelle","nathan","zoe"];
function enScore(v){
  var n=(v.name||"").toLowerCase(), lang=(v.lang||"").toLowerCase(), sc=0, i;
  for(i=0;i<EN_NOVELTY.length;i++) if(n.indexOf(EN_NOVELTY[i])>=0) sc-=100;
  for(i=0;i<EN_ELOQUENCE.length;i++) if(n.indexOf(EN_ELOQUENCE[i])>=0) sc-=60;
  for(i=0;i<EN_GOOD.length;i++) if(n.indexOf(EN_GOOD[i])>=0){ sc+=30; break; }
  if(/premium|enhanced/.test(n)) sc+=25;
  if(/compact/.test(n)) sc-=10;
  if(v.default) sc+=12;
  if(lang.indexOf("en-us")===0) sc+=8;
  else if(lang.indexOf("en-gb")===0) sc+=6;
  else if(lang.indexOf("en-au")===0 || lang.indexOf("en-ie")===0) sc+=3;
  if(v.localService) sc+=2;
  return sc;
}
function enRanked(){
  var v=(TTS.en||[]).slice();
  v.sort(function(a,b){ var d=enScore(b)-enScore(a);
    return d!==0 ? d : String(a.name||"").localeCompare(String(b.name||"")); });
  return v;
}
function enVoice(){
  var want=S.settings.enVoice;
  var list=TTS.en||[];
  if(want==="off") return null;                 // leave it to the device entirely
  if(want && want!=="auto"){
    for(var i=0;i<list.length;i++) if(list[i].name===want) return list[i];
  }
  var r=enRanked();
  return r.length ? r[0] : null;                // a stable choice, never a rotation
}
/* Two attempts to be clever here silenced the app completely, in both
   languages, while the pre-rendered audio kept playing. First a timer that
   watched for a line that never started and said it again; then a silent trial
   utterance for each voice at boot. Both call cancel and speak in quick
   succession, and on iOS that is a reliable way to wedge the speech engine for
   the life of the page: nothing then speaks, whatever voice is named, in any
   language, and no amount of ranking or striking off makes any difference
   because the engine has stopped listening. Both were built on a theory about
   which voice was at fault that was never true, and both were shipped without
   ever being run on the phone they were for.
   This function says the line. It does not probe, retry, or measure. If a
   voice turns out to be unusable there is a picker in Settings, which is a
   worse outcome than automatic recovery and a far better one than silence. */
var SPEAK_GEN=0;
/* Six hours went on this because nothing on the phone could say what the phone
   was doing. The fault could not be reproduced anywhere: a stubbed engine
   always accepts a line, and the only real one available off-device uses a
   different backend and never misbehaves. So the app records what it asked for
   and what came back, and Settings shows it. Listening for onstart and onend
   is not extra traffic to the engine, which is the whole reason the previous
   two attempts to be clever here silenced it. Nothing in this log speaks. */
var SPEECH_LOG=[];
function speechNote(rec){ SPEECH_LOG.push(rec); if(SPEECH_LOG.length>16) SPEECH_LOG.shift(); }
function speakAt(text, rate, fixedVoice){
  if(!("speechSynthesis" in window)){ speechNote({t:text, why:"no engine in this browser"}); return; }
  if(!S.settings.tts){ speechNote({t:text, why:"read aloud is off in settings"}); return; }
  try{
    SPEAK_GEN++;
    speechSynthesis.cancel();
    var u=new SpeechSynthesisUtterance(text);
    u.lang="ja-JP";
    u.rate=clamp(rate,0.4,1.5);
    // a rejected voice must never take the whole playback down with it
    var nm=null;
    if(!fixedVoice){ var v=jaVoice(); if(v){ try{ u.voice=v; nm=v.name||vId(v); }catch(e){} } }
    var rec={t:text, v:nm, at:Date.now(), started:false, ended:false, err:null};
    speechNote(rec);
    try{
      u.onstart=function(){ rec.started=true; };
      u.onend=function(){ rec.ended=true; };
      u.onerror=function(e){ rec.err=(e&&e.error)||"error"; };
    }catch(e){}
    speechSynthesis.speak(u);
  }catch(e){ speechNote({t:text, why:"the engine threw: "+(e&&e.message||e)}); }
}
/* Read-only. It must never ask the engine for anything: a diagnostic that
   speaks is the same mistake in a different coat. */
function speechReport(){
  var has=("speechSynthesis" in window), L=[], i, r;
  L.push("read aloud: "+(S.settings.tts?"on":"OFF"));
  L.push("engine: "+(has?"present":"MISSING"));
  if(has){
    var sp="?", pd="?";
    try{ sp=String(speechSynthesis.speaking); pd=String(speechSynthesis.pending); }catch(e){}
    L.push("speaking: "+sp+", pending: "+pd);
  }
  var vs=TTS.voices||[];
  L.push("japanese voices seen: "+vs.length);
  for(i=0;i<vs.length;i++) L.push("  "+(vs[i].name||"?")+"  "+vId(vs[i]));
  L.push("setting: "+(S.settings.jaVoice||"auto"));
  var cur=null; try{ cur=jaVoice(); }catch(e){}
  L.push("would use: "+(cur?((cur.name||"?")+"  "+vId(cur)):"none, iOS picks"));
  L.push("");
  L.push("last "+SPEECH_LOG.length+" attempts, newest last:");
  if(!SPEECH_LOG.length) L.push("  nothing has been asked for yet");
  for(i=0;i<SPEECH_LOG.length;i++){
    r=SPEECH_LOG[i];
    if(r.why){ L.push("  skipped: "+r.why); continue; }
    L.push("  "+(r.v||"no voice named")
      +"  started:"+(r.started?"yes":"NO")
      +"  ended:"+(r.ended?"yes":"no")
      +(r.err?("  error:"+r.err):""));
  }
  return L.join("\n");
}
/* A clip if there is one, the device voice otherwise. speakCard is what every
   card now calls, so the listening card and the audio question are heard in
   the same voice the car uses instead of whatever the phone happens to have. */
/* Small ya, yu and yo ride on the mora before them; everything else, the small
   tsu and the n included, is its own beat. */
function moraCount(t){
  t=String(t||""); var n=0;
  for(var i=0;i<t.length;i++) if("\u3083\u3085\u3087\u30e3\u30e5\u30e7".indexOf(t.charAt(i))<0) n++;
  return n;
}
function speak(text){
  var base=S.settings.speechRate||0.85;
  /* The jitter is there so a word is learned as a word and not as one
     recording. On two morae there is nothing for it to vary and plenty to
     ruin: a random slowdown to 0.73 stretches the word past Japanese mora
     timing and smears the one consonant that was already hardest to hear.
     Slowing yon down is what made yon worse. Below three morae the word is
     spoken at the rate he set, every time. */
  var jitter=(S.settings.speechVary===false || moraCount(text)<3) ? 0 : (Math.random()*0.24-0.12);
  speakAt(text, base+jitter, false);
}
function clipFor(c){
  if(!c) return null;
  if(isSent(c)) return "sj:"+c.id;
  if(isConj(c)) return null;
  if(c.practiceOnly) return null;
  return "wj:"+c.id;
}
/* Every call supersedes the last. speakAt already cancels the device voice, but
   a clip has to be fetched first and that takes time: answer the card while its
   sprite is still loading and the old word used to arrive over the new one, and
   on an English to Japanese card that is the answer read aloud. It could not
   happen while nothing in study mode ever reached a clip; it can now. */
var SAY_GEN=0;
/* A counter is a suffix, not a word. Nobody says fun, ji, ko or do standing on
   its own, and a voice asked to read one alone produces something no Japanese
   person ever utters: fun came back sounding like "un" because an isolated fu
   has nothing after it to lean on. The card still teaches the suffix, because
   that is the thing worth knowing, but it is spoken in the smallest real form
   that contains it: gofun, ikko, sanjuudo. The card says so underneath, so the
   audio and the kana are never seen to disagree. */
/* A card says the word it shows. The counters carried a spoken form instead,
   a whole phrase, because the bare suffix came back sounding like "un" when
   every card was being read by the downloaded library at a randomised speed.
   Both of those are fixed, yon is right again, and a card that shows fun and
   says "gofun desu, it is five minutes" is now just wrong. The spoken form
   stays on the back of the card as writing, where it teaches that a counter is
   used with a number without putting words in the voice's mouth. */
function sayTextOf(c){ return c ? c.kana : ""; }
function speakCard(c, slow){
  if(!c) return;
  var base=S.settings.speechRate||0.85;
  var rate = slow ? Math.max(0.4, base-0.30) : base;
  var say=sayTextOf(c);
  /* The phone's own Japanese voice reads the card. The pre-rendered library
     exists for one reason: iOS will not route Web Speech to CarPlay. That is a
     car mode problem and only a car mode problem. Routing study cards through
     it as well was a mistake, and an expensive one: the library is a small
     model that mispronounces a word standing on its own, so yon arrived as
     "yeiiin" on every card, while the phone's own voice had been saying it
     correctly all along. The library stays where it is needed and nowhere
     else, and it is still the fallback for a phone with no Japanese voice. */
  if(ttsUsable() && S.settings.cardAudio!==true){
    SAY_GEN++;
    slow ? speakSlow(say) : speak(say);
    return;
  }
  /* A card with a spoken form would rather not use its clip, because the clip
     was rendered from the bare kana and the bare kana is the thing this change
     exists to stop playing. But only rather than. When the phone has no
     Japanese voice at all, refusing the clip leaves nothing, and that is what
     happened: his phone stopped reporting a Japanese voice, every other card
     fell back to the library and played, and these twenty went silent. A
     roughly said word beats no word, so the clip is skipped only while there
     is a real voice available to say the fuller form instead. */
  var key=clipFor(c);
  if(key && audOn()){
    var g=++SAY_GEN;
    audStop();
    audPlay(key, clamp(rate/0.85,0.5,1.6), function(){ return g===SAY_GEN; }).then(function(ok){
      if(!ok && g===SAY_GEN){ slow ? speakSlow(say) : speak(say); }
    });
    return;
  }
  SAY_GEN++;
  slow ? speakSlow(say) : speak(say);
}
function speakSlow(text){ speakAt(text, Math.max(0.4,(S.settings.speechRate||0.85)-0.30), true); }
function jpBlockHtml(c){
  var sent = isSent(c);
  if(isConj(c)) return '<div class="kana">'+esc(c.kana)+'</div>'+
    '<div class="romaji">'+esc(c.romaji)+'</div>'+
    '<button class="speak" data-speak="1" aria-label="Read aloud">'+SPK+'</button>';
  return '<div class="kana'+(sent?" sent":"")+'">'+esc(c.kana)+'</div>'+
    '<div class="romaji'+(sent?" sent":"")+'">'+esc(c.romaji)+'</div>'+
    (!sent && S.settings.kanji && c.kanji ? '<div class="kanji">'+esc(c.kanji)+'</div>' : "")+
    '<button class="speak" data-speak="1" aria-label="Read aloud">'+SPK+'</button>';
}
var SPK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6.5 9H3v6h3.5L11 19z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
function tagsHtml(c){
  var label = isSent(c) ? "sentence" : (isConj(c) ? "conjugation" : (POS_EN[c.pos]||c.pos));
  var extra = isSent(c) ? [c.grammar] : (c.tags||[]);
  return '<div class="tags"><span>'+esc(label)+'</span>'+
    extra.map(function(t){return "<span>"+esc(t)+"</span>";}).join("")+'</div>';
}
/* The single word a sentence may still be missing is shown under it with its
   reading and meaning, so the sentence can be read rather than guessed. It is
   never graded here; it arrives as a word card of its own in the normal way. */
function gapHtml(c){
  if(!isSent(c) || !c.w || !c.w.length) return "";
  var miss=sentMissing(c);
  if(!miss.length) return "";
  var out="";
  for(var i=0;i<miss.length && i<2;i++){
    var w=IDX[miss[i]]; if(!w) continue;
    out+='<div class="gap-word"><span class="gap-k">'+esc(w.kana)+'</span>'+
         '<span class="gap-r">'+esc(w.romaji)+'</span>'+
         '<span class="gap-e">'+esc(w.en)+'</span></div>';
  }
  if(!out) return "";
  return '<div class="gap-box"><div class="gap-lab">new word in this sentence</div>'+out+'</div>';
}
/* A word on its own is not much use; one sentence showing it in place is. The
   example is a reference to a sentence already in the deck where there is one,
   and a written line where there is not, so the common case costs no bytes. */
function exampleFor(c){
  if(!c || isSent(c) || isConj(c) || c.practiceOnly) return null;
  var e = EXAMPLE[c.id];
  if(!e) return null;
  if(typeof e === "string"){
    var x = SIDX[e];
    /* the sentence is in the deck, so its clip is in the library already */
    return x ? {romaji:x.romaji, en:x.en, key:"sj:"+x.id} : null;
  }
  return (e[0] && e[1]) ? {romaji:e[0], en:e[1], key:null} : null;
}
function exHtml(c){
  var e = exampleFor(c);
  if(!e) return "";
  /* The button is there only when there is something to press: an example that
     is a deck sentence has a recorded clip, one written for this card does not
     yet. Romaji with no way to hear it teaches a pronunciation he invented, so
     where the sound exists it is offered. */
  var play = e.key ? '<button class="ex-play" data-ex-key="'+esc(e.key)+'" aria-label="Play the example">'+SPK+'</button>' : "";
  return '<div class="ex-box"><div class="ex-head"><span class="ex-lab">example</span>'+play+'</div>'+
    '<div class="ex-r">'+esc(e.romaji)+'</div>'+
    '<div class="ex-e">'+esc(e.en)+'</div></div>';
}
/* The voice says gofun while the card shows fun, which looks like a fault
   unless the card says why. Back only: on an English to Japanese card the
   spoken form is the answer, and on a Japanese to English card its gloss is
   half the answer. */
function sayHtml(c){
  if(!c || !c.say || !c.sayR) return "";
  return '<div class="saybox"><span class="say-lab">spoken as</span>'+
    '<span class="say-r">'+esc(c.sayR)+'</span>'+
    (c.sayE ? '<span class="say-e">'+esc(c.sayE)+'</span>' : "")+
    '<button class="say-play" data-speak="1" aria-label="Read the spoken form aloud">'+SPK+'</button></div>';
}
function noteHtml(c){
  var n=S.notes[c.id];
  return n ? '<div class="cardnote">'+esc(n)+'</div>' : "";
}
function leechHtml(it,k){
  if(!it || it.lapses<8) return "";
  return '<div class="leech">Failed '+it.lapses+' times. '+
    '<button class="lk" data-act="note">Add a hint</button> · '+
    '<button class="lk" data-act="susp">Set aside</button></div>';
}
function optionsHtml(opts){
  return '<div class="opts">'+opts.map(function(o,i){
    return '<button class="opt-btn" data-opt="'+i+'">'+
      '<span class="ot'+(o.sub?" jp":"")+'">'+esc(o.text)+'</span>'+
      (o.sub?'<span class="os">'+esc(o.sub)+'</span>':"")+'</button>';
  }).join("")+'</div>';
}
/* A focus question grades itself: the options are the answer, so there is no
   "did I get that right" to fudge. The right option is always revealed, and a
   wrong pick waits for a tap so the answer can actually be read. */
function renderFocusCard(){
  var q=Sess.q, c=IDX[q.id], it=S.items[q.key]||newItem();
  var front=document.getElementById("faceFront"), back=document.getElementById("faceBack");
  document.getElementById("fold").hidden=true;
  (function(){ var mb=document.querySelector(".missbox"); if(mb) mb.remove(); })();
  var chip=document.getElementById("dirChip");
  var chipTxt={mcJE:"Japanese &rarr; English", mcEJ:"English &rarr; Japanese",
    mcAudio:"Listening", conj:"Conjugation", cloze:"In a sentence", type:"Type it"};
  chip.className="chip "+(q.kind==="mcAudio"?"dir-a":(q.kind==="mcEJ"||q.kind==="type"?"dir-e":"dir-j"));
  chip.innerHTML=chipTxt[q.kind]||"Japanese &rarr; English";
  document.getElementById("posChip").textContent="重点";
  document.getElementById("revCount").textContent="focus · "+(Sess.qi+1)+"/"+Sess.queue.length;
  document.getElementById("undoBtn").hidden=true;
  document.getElementById("pracBanner").hidden=false;
  document.getElementById("pracLabel").textContent =
    "Focus · "+esc(q.why||"one to work on")+" · nothing here changes your schedule";
  renderPips();

  var head="";
  if(q.kind==="mcAudio"){
    head='<button class="playbig" data-speak="1" aria-label="Play the audio">'+SPK+'</button>'+
         '<button class="slowbtn" data-slow="1">Play it slower</button>';
  } else if(q.kind==="mcJE"){
    head=jpBlockHtml(c);
  } else if(q.kind==="mcEJ" || q.kind==="type"){
    head='<div class="english">'+esc(c.en)+'</div>';
  } else if(q.kind==="conj"){
    head='<div class="conj-base"><div class="kana sm">'+esc(c.kana)+'</div>'+
         '<div class="romaji sm">'+esc(c.romaji)+'</div>'+
         '<div class="conj-gloss">'+esc(c.en)+'</div></div>';
  } else if(q.kind==="cloze"){
    head='<div class="kana sent">'+esc(q.blank)+'</div>'+
         '<div class="cloze-rm">'+esc(q.blankR||"")+'</div>';
  }
  var body = (q.kind==="type")
    ? '<div class="typebox"><input id="typeIn" type="text" inputmode="latin" autocomplete="off" '+
      'autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="romaji"></div>'+
      '<button class="btn" id="typeGo">Check</button><div class="verdict" id="verdict"></div>'
    : optionsHtml(q.opts);
  front.innerHTML = head + '<div class="hint">'+esc(q.ask||"")+'</div>' + body;
  back.innerHTML = "";
  document.getElementById("grades").innerHTML="";
  wireSpeak(c);
  /* The Japanese plays when the question appears, not after it is answered.
     It used to be spoken only on the way out, which is the one moment the
     learner no longer needs it. Only on the questions that already show the
     Japanese: on English to Japanese, on typing, and on a gap in a sentence the
     clip is the answer, so it stays silent until the answer is in. */
  var showsJa = q.kind==="mcJE";     // the only focus kind that shows the Japanese
  if(S.settings.tts!==false && (q.kind==="mcAudio" || (showsJa && S.settings.autoPlay!==false)))
    speakCard(c);
  if(q.kind==="type"){
    var ti=document.getElementById("typeIn");
    document.getElementById("typeGo").addEventListener("click",checkTyped);
    ti.addEventListener("keydown",function(e){ if(e.key==="Enter"){e.preventDefault(); checkTyped();} });
    setTimeout(function(){ti.focus();},60);
  } else {
    Array.prototype.forEach.call(front.querySelectorAll(".opt-btn"),function(btnEl){
      btnEl.addEventListener("click",function(){ pickOption(+btnEl.dataset.opt); });
    });
  }
}
function checkTyped(){
  if(Sess.answered) return;
  var q=Sess.q, c=IDX[q.id], ti=document.getElementById("typeIn");
  var good = romajiMatches(ti.value, c.romaji);
  Sess.answered=true; ti.blur();
  var v=document.getElementById("verdict");
  v.className="verdict "+(good?"ok":"no");
  v.textContent = good ? "correct" : "it is "+c.kana+" · "+c.romaji;
  showAfter(good);
}
function pickOption(i){
  if(Sess.answered) return;
  Sess.answered=true;
  var q=Sess.q, good=!!q.opts[i].ok;
  Array.prototype.forEach.call(document.querySelectorAll(".opt-btn"),function(btnEl,n){
    btnEl.disabled=true;
    if(q.opts[n].ok) btnEl.classList.add("right");
    else if(n===i) btnEl.classList.add("wrong");
  });
  showAfter(good);
}
// after an answer: correct moves on by itself, wrong waits to be read
function showAfter(good){
  var q=Sess.q, c=IDX[q.id];
  var g=document.getElementById("grades");
  var heardAlready = q.kind==="mcAudio" ||
    (q.kind==="mcJE" && S.settings.autoPlay!==false);
  if(good && S.settings.tts!==false && !heardAlready) speakCard(c);
  if(good){
    g.innerHTML='<button class="btn" id="nextBtn">Next</button>';
    document.getElementById("nextBtn").addEventListener("click",function(){ practiceAnswer(true); });
    Sess.autoNext=setTimeout(function(){ if(Sess.answered) practiceAnswer(true); },850);
  } else {
    /* On a cloze, the word on its own does not explain the miss. The sentence
       is never translated while the question is live, because the English would
       hand over the answer, so this is the only place he gets to find out what
       he was reading. */
    var extra='';
    if(q.kind==="cloze" && q.sent){
      extra='<div class="focus-ans"><div class="kana sm">'+esc(q.sent.kana)+'</div>'+
            '<div class="romaji sm">'+esc(q.sent.romaji)+'</div>'+
            '<div class="conj-gloss">'+esc(q.sent.en)+'</div></div>';
    }
    g.innerHTML='<div class="focus-ans"><div class="kana sm">'+esc(c.kana)+'</div>'+
      '<div class="romaji sm">'+esc(c.romaji)+'</div>'+
      '<div class="conj-gloss">'+esc(c.en)+'</div></div>'+ extra +
      '<button class="btn" id="nextBtn">Next</button>';
    document.getElementById("nextBtn").addEventListener("click",function(){ practiceAnswer(false); });
  }
}
function renderCard(){
  if(Sess.autoNext){ clearTimeout(Sess.autoNext); Sess.autoNext=null; }
  // a free-recall question has no options, so the ordinary card renderer draws it
  if(Sess.focus && Sess.q && Sess.q.kind!=="flip") return renderFocusCard();
  var k=Sess.key, c=cardOf(k), d=dirOf(k), it=S.items[k]||newItem();
  var front=document.getElementById("faceFront"), back=document.getElementById("faceBack");
  document.getElementById("fold").hidden=true;
  (function(){ var mb=document.querySelector(".missbox"); if(mb) mb.remove(); })();
  var chip=document.getElementById("dirChip");
  chip.className="chip "+(d==="a"?"dir-a":(d==="j"?"dir-j":"dir-e"));
  chip.innerHTML = d==="a" ? "Listening" : (d==="j" ? "Japanese &rarr; English" : "English &rarr; Japanese");
  document.getElementById("posChip").textContent = isSent(c) ? "文" : (isConj(c) ? "活用" : (POS_JA[c.pos]||c.pos));
  document.getElementById("revCount").textContent = Sess.practice
    ? (Sess.focus?"focus · ":"practice · ")+(Sess.qi+1)+"/"+Sess.queue.length
    : (Sess.mode==="ahead" ? "ahead · "+Sess.done : Sess.done+"/"+Math.max(Sess.plan,Sess.done+1));
  document.getElementById("undoBtn").hidden = !Sess.undo || Sess.practice;
  document.getElementById("pracBanner").hidden = !Sess.practice;
  if(Sess.practice) document.getElementById("pracLabel").textContent =
    (Sess.focus && Sess.q)
      ? "Focus · "+(Sess.q.why||"one to work on")+" · nothing here changes your schedule"
      : "Practice · nothing you answer here changes your schedule";
  renderPips();

  if(d==="a"){
    front.innerHTML = '<button class="playbig" data-speak="1" aria-label="Play the audio">'+SPK+'</button>'+
      '<div class="hint">What did you hear?<br><span class="sub2">tap to play again</span></div>'+
      '<button class="slowbtn" data-slow="1">Play it slower</button>';
    back.innerHTML = jpBlockHtml(c) +
      '<div class="english'+(isSent(c)?" sent":"")+'">'+esc(c.en)+'</div>'+ gapHtml(c) + sayHtml(c) + exHtml(c) + noteHtml(c) + tagsHtml(c) + leechHtml(it,k);
  } else if(isConj(c)){
    var ruleHtml = c.rule ? '<div class="conj-rule">'+esc(c.rule)+'</div>' : "";
    front.innerHTML =
      '<div class="conj-base"><div class="kana sm">'+esc(c.base)+'</div>'+
        '<div class="romaji sm">'+esc(c.baseRomaji)+'</div>'+
        '<div class="conj-gloss">'+esc(c.baseEn)+'</div></div>'+
      '<div class="conj-ask">Say the <b>'+esc(c.formEn)+'</b></div>';
    back.innerHTML = jpBlockHtml(c) + ruleHtml +
      '<div class="conj-use">'+esc(c.use)+'</div>'+ noteHtml(c) + tagsHtml(c) + leechHtml(it,k);
  } else if(d==="j"){
    front.innerHTML = jpBlockHtml(c) +
      '<div class="hint">'+(Sess.focus?"From memory: what does this mean?":"What does this mean?")+'</div>';
    back.innerHTML = '<div class="english'+(isSent(c)?" sent":"")+'">'+esc(c.en)+'</div>'+ gapHtml(c) + sayHtml(c) + exHtml(c) + noteHtml(c) + tagsHtml(c) + leechHtml(it,k);
  } else {
    front.innerHTML = '<div class="english">'+esc(c.en)+'</div>'+
      '<div class="hint">Say it in Japanese</div>'+
      (S.settings.typing ? '<div class="typebox"><input id="typeIn" type="text" inputmode="latin" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="romaji"></div><div class="verdict" id="verdict"></div>' : "");
    back.innerHTML = jpBlockHtml(c) + sayHtml(c) + exHtml(c) + noteHtml(c) + tagsHtml(c) + leechHtml(it,k);
  }
  wireSpeak(c);
  wireLeech(c,k);
  var ti=document.getElementById("typeIn");
  if(ti){ ti.addEventListener("keydown",function(e){ if(e.key==="Enter"){e.preventDefault(); reveal();} }); setTimeout(function(){ti.focus();},60); }
  renderGrades(false);
  /* Play whatever Japanese is already on the front, as soon as the card appears.
     Called straight from the tap that advanced the card rather than from a
     timer, because WebKit only allows speech inside the user gesture that
     started it. A conjugation card plays its dictionary form, never the answer. */
  if(S.settings.tts && S.settings.autoPlay!==false){
    if(d==="a") speakCard(c);
    else if(isConj(c)) speak(c.base);
    else if(d==="j") speakCard(c);
  }
}
function wireLeech(c,k){
  Array.prototype.forEach.call(document.querySelectorAll(".leech .lk"),function(b){
    b.addEventListener("click",function(e){
      e.stopPropagation();
      if(b.dataset.act==="susp"){
        S.susp[k]=1; touch(k); toast("Set aside. Bring it back from Browse.");
        Sess.undo=null; nextCard();
      } else {
        var cur=S.notes[c.id]||"";
        var v=prompt("A hint for "+c.kana+" ("+c.romaji+")", cur);
        if(v===null) return;
        if(v.trim()) S.notes[c.id]=v.trim().slice(0,140); else delete S.notes[c.id];
        save(); var wasShown=Sess.shown; renderCard(); if(wasShown){ Sess.shown=false; reveal(); }
      }
    });
  });
}
function wireSpeak(c){
  Array.prototype.forEach.call(document.querySelectorAll("[data-slow]"),function(b){
    b.addEventListener("click",function(e){ e.stopPropagation(); speakCard(c,true); });
  });
  Array.prototype.forEach.call(document.querySelectorAll(".card [data-speak]"),function(b){
    b.addEventListener("click",function(e){
      e.stopPropagation();
      if(!S.settings.tts){ toast("Read aloud is off in Settings"); return; }
      speakCard(c);
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll(".card [data-ex-key]"),function(b){
    b.addEventListener("click",function(e){
      e.stopPropagation();
      var key=b.getAttribute("data-ex-key");
      var g=++SAY_GEN;
      audStop();
      /* The word on this card is read by the phone's own voice, so the example
         under it has to be read by the same voice. It was not: the example went
         to the downloaded library, which is the one that cannot pronounce fu.
         One card taught two different pronunciations of its own word, and the
         wrong one sat directly beneath the right one. */
      var sx = (key.indexOf("sj:")===0) ? SIDX[key.slice(3)] : null;
      if(sx && sx.kana && ttsUsable() && S.settings.cardAudio!==true){ speak(sx.kana); return; }
      if(!audOn()){ toast("Turn the downloaded voice on in Settings to hear examples"); return; }
      audPlay(key, 1, function(){ return g===SAY_GEN; }).then(function(ok){
        if(!ok && g===SAY_GEN) toast("That example has no recording yet");
      });
    });
  });
}
function renderPips(){
  var el=document.getElementById("pips"), n=12, h="";
  var filled = Sess.mode==="ahead" ? (Sess.done%(n+1)) : (Sess.plan?Math.round(Sess.done/Math.max(Sess.plan,1)*n):0);
  for(var i=0;i<n;i++) h+='<i class="'+(i<filled?(Sess.mode==="ahead"?"b":"a"):"")+'"></i>';
  el.innerHTML=h;
}
function normRomaji(x){return String(x).toLowerCase().replace(/[^a-z]/g,"");}

/* ---------- romaji answer matching ----------
   A typed answer is judged by the Japanese it describes, not by its spelling.
   Two spellings that produce the same mora are the same answer: si and shi,
   tu and tsu, hu and fu, desu and des. Anything that would change the mora is
   still wrong. A general typo tolerance was measured and rejected: 679 of the
   1,745 deck words sit within one edit of another real word, so forgiving a
   single character would quietly accept ageru for akeru and akai for amai. */

var MACRON={"ā":"aa","ī":"ii","ū":"uu","ē":"ee","ō":"ou",
            "â":"aa","î":"ii","û":"uu","ê":"ee","ô":"ou"};

/* input spelling -> canonical Hepburn mora. Longest match wins, so the three
   character entries must be tried before the two character ones. */
var MORA3={
  shi:"shi", chi:"chi", tsu:"tsu",
  sha:"sha", shu:"shu", sho:"sho", she:"she",
  cha:"cha", chu:"chu", cho:"cho", che:"che",
  sya:"sha", syu:"shu", syo:"sho",
  tya:"cha", tyu:"chu", tyo:"cho",
  zya:"ja",  zyu:"ju",  zyo:"jo",
  jya:"ja",  jyu:"ju",  jyo:"jo",
  dya:"ja",  dyu:"ju",  dyo:"jo",
  kya:"kya", kyu:"kyu", kyo:"kyo",
  gya:"gya", gyu:"gyu", gyo:"gyo",
  nya:"nya", nyu:"nyu", nyo:"nyo",
  hya:"hya", hyu:"hyu", hyo:"hyo",
  bya:"bya", byu:"byu", byo:"byo",
  pya:"pya", pyu:"pyu", pyo:"pyo",
  mya:"mya", myu:"myu", myo:"myo",
  rya:"rya", ryu:"ryu", ryo:"ryo",
  tsa:"tsa", tsi:"tsi", tse:"tse", tso:"tso",
  kwa:"kwa", kwi:"kwi", kwe:"kwe", kwo:"kwo", gwa:"gwa",
  fya:"fya", fyu:"fyu", fyo:"fyo"
};
var MORA2={
  ka:"ka", ki:"ki", ku:"ku", ke:"ke", ko:"ko",
  ga:"ga", gi:"gi", gu:"gu", ge:"ge", go:"go",
  sa:"sa", si:"shi", su:"su", se:"se", so:"so",
  za:"za", zi:"ji",  zu:"zu", ze:"ze", zo:"zo",
  ta:"ta", ti:"chi", tu:"tsu", te:"te", to:"to",
  da:"da", di:"ji",  du:"zu", de:"de", do:"do",
  na:"na", ni:"ni",  nu:"nu", ne:"ne", no:"no",
  ha:"ha", hi:"hi",  hu:"fu", he:"he", ho:"ho",
  fa:"fa", fi:"fi",  fu:"fu", fe:"fe", fo:"fo",
  ba:"ba", bi:"bi",  bu:"bu", be:"be", bo:"bo",
  pa:"pa", pi:"pi",  pu:"pu", pe:"pe", po:"po",
  ma:"ma", mi:"mi",  mu:"mu", me:"me", mo:"mo",
  ya:"ya", yu:"yu",  yo:"yo", ye:"ye",
  ra:"ra", ri:"ri",  ru:"ru", re:"re", ro:"ro",
  wa:"wa", wi:"wi",  we:"we", wo:"o",
  ja:"ja", ji:"ji",  ju:"ju", je:"je", jo:"jo",
  va:"va", vi:"vi",  vu:"vu", ve:"ve", vo:"vo",
  nn:"n"
};
var VOW="aeiou";

/* the u of desu and masu is devoiced in speech and often written away.
   These four are the only shapes accepted, and no entry in the deck ends in
   des or mas, so nothing else can be swallowed by the rule. */
function undevoice(t){
  t=t.replace(/deshta/g,"deshita").replace(/mashta/g,"mashita");
  // no entry in the whole deck ends in des or mas, so this cannot swallow a word
  t=t.replace(/des(?=[kny]|$)/g,"desu");
  t=t.replace(/mas(?=[kny]|$)/g,"masu");
  return t;
}

/* one token -> canonical mora string, or null when it is not readable romaji */
function moraOf(t){
  var out=[], i=0, n=t.length;
  while(i<n){
    var c=t[i];
    if(c==="'"){ i++; continue; }                       // n'yo style separator
    // ん : n not starting a mora of its own
    if(c==="n"){
      var nx=t[i+1];
      if(nx===undefined || (VOW.indexOf(nx)<0 && nx!=="y" && nx!=="n")){ out.push("n"); i++; continue; }
      if(nx==="n" && VOW.indexOf(t[i+2]||"")<0){ out.push("n"); i+=2; continue; }
    }
    // ん written m before b, m, p
    if(c==="m" && "bmp".indexOf(t[i+1]||"")>=0){ out.push("n"); i++; continue; }
    // sokuon: a doubled consonant, and the tch of matcha
    if(c===t[i+1] && VOW.indexOf(c)<0 && c!=="n"){ out.push("Q"); i++; continue; }
    if(c==="t" && t.substr(i,3)==="tch"){ out.push("Q"); i++; continue; }
    var m3=t.substr(i,3), m2=t.substr(i,2), m1=c;
    if(MORA3[m3]!==undefined){ out.push(MORA3[m3]); i+=3; continue; }
    if(MORA2[m2]!==undefined){ out.push(MORA2[m2]); i+=2; continue; }
    if(VOW.indexOf(m1)>=0){ out.push(m1); i++; continue; }
    return null;                                        // unreadable
  }
  return out.join(".");
}

/* whole answer -> canonical key, or null */
function prep(s){
  if(s===null||s===undefined) return "";
  s=String(s).toLowerCase();
  for(var k in MACRON) s=s.split(k).join(MACRON[k]);
  return s.replace(/[^a-z' ]+/g," ").replace(/\s+/g," ").trim();
}
function moraKey(s){
  s=prep(s);
  if(!s) return null;
  var toks=s.split(" "), out=[];
  for(var i=0;i<toks.length;i++){
    var m=moraOf(undevoice(toks[i]));
    if(m===null) return null;
    out.push(m);
  }
  return out.join(".");
}

/* Particles are written as one kana and spoken as another. The alternate is
   offered only where the answer itself has the particle in that position, and
   never when the whole answer is that single token, so the picture e cannot be
   answered with the direction he. */
var PART={wa:"ha", e:"he", o:"wo"};
function answerKeys(romaji){
  var s=prep(romaji);
  if(!s) return {};
  var toks=s.split(" ");
  var keys={};
  var slots=[];
  if(toks.length>1){
    for(var i=0;i<toks.length;i++) if(PART[toks[i]]!==undefined) slots.push(i);
  }
  if(slots.length>6) slots=slots.slice(0,6);
  var total=1<<slots.length;
  if(total>64) total=64;
  for(var m=0;m<total;m++){
    var v=toks.slice();
    for(var b=0;b<slots.length;b++) if(m&(1<<b)) v[slots[b]]=PART[v[slots[b]]];
    var k=moraKey(v.join(" "));
    if(k) keys[k]=1;
    var kj=moraKey(v.join(""));
    if(kj) keys[kj]=1;
  }
  return keys;
}

/* the check itself */
function romajiMatches(typed, romaji){
  var t=moraKey(typed);
  if(!t) return false;
  var keys=answerKeys(romaji);
  if(keys[t]) return true;
  var tj=moraKey(String(typed).replace(/\s+/g,""));
  return !!(tj && keys[tj]);
}

function reveal(){
  if(Sess.shown) return;
  // a focus question is answered by choosing, not by flipping: a stray tap on
  // the card must not repaint the grade row over the answer feedback
  if(Sess.focus && Sess.q && Sess.q.kind!=="flip") return;
  var c=cardOf(Sess.key), d=dirOf(Sess.key);
  if(d==="e" && S.settings.typing){
    var ti=document.getElementById("typeIn"), v=document.getElementById("verdict");
    if(ti && v){ var ok=romajiMatches(ti.value, c.romaji);
      v.textContent = ti.value ? (ok?"correct":"you typed "+ti.value) : "";
      v.className="verdict "+(ok?"ok":"no");
      Sess.typed = ti.value ? ok : null;
      // 1 right, 0 wrong, 2 the box was left empty: all three are evidence
      Sess.verdict = ti.value ? (ok?1:0) : 2;
      ti.blur(); }
  }
  Sess.shown=true;
  document.getElementById("fold").hidden=false;
  renderGrades(true);
  // do not repeat what was already played on the front
  var heard = S.settings.autoPlay!==false && (d==="a" || (d==="j" && !isConj(c)));
  if(S.settings.tts && !heard) speakCard(c);
}
function renderGrades(shown){
  var g=document.getElementById("grades");
  g.classList.remove("prac2");
  if(!shown){ g.innerHTML='<button class="btn showbtn" id="showBtn">Show answer</button>';
    document.getElementById("showBtn").addEventListener("click",reveal); return; }
  if(Sess.practice){
    g.classList.add("prac2");
    g.innerHTML='<button class="grade prac g0" data-ok="0"><span class="lb">Missed it</span></button>'+
                '<button class="grade prac g3" data-ok="1"><span class="lb">Got it</span></button>';
    Array.prototype.forEach.call(g.querySelectorAll(".grade"),function(b){
      b.addEventListener("click",function(){ practiceAnswer(b.dataset.ok==="1"); });
    });
    return;
  }
  var it=S.items[Sess.key]||newItem(), now=Date.now();
  var labels=["Again","Hard","Good","Easy"], h="";
  /* A typed answer is evidence, and evidence outranks a self-report. When the
     mora matcher has judged the answer, the grades that contradict it are not
     offered: a wrong answer cannot be Good, a right one cannot be Again. The
     override stays reachable, because a typo is not the same as not knowing. */
  var lo=0, hi=3;
  if(Sess.typed===false){ hi=0; }
  else if(Sess.typed===true){ lo=1; }
  for(var i=0;i<4;i++){
    if(i<lo || i>hi) continue;
    var nx=schedule(it,i,now,true);
    h+='<button class="grade g'+i+'" data-g="'+i+'"><span class="iv">'+ivLabel(nx.due-now)+'</span><span class="lb">'+labels[i]+'</span></button>';
  }
  if(Sess.typed===true||Sess.typed===false)
    h+='<button class="grade gx" id="gradeAll"><span class="lb">'+
       (Sess.typed?"I did not really know it":"I knew it, that was a typo")+'</span></button>';
  g.innerHTML=h;
  var ga=document.getElementById("gradeAll");
  if(ga) ga.addEventListener("click",function(){
    /* The matcher's judgement is what goes in the log whatever he presses
       here, or the one number built to escape self-grading would be curated
       by the button labelled "that was a typo". */
    Sess.override=true; Sess.typed=null; renderGrades(true); });
  Array.prototype.forEach.call(g.querySelectorAll(".grade"),function(b){
    b.addEventListener("click",function(){ answer(+b.dataset.g); });
  });
}
function snapshot(k){
  return {key:k,
    item: S.items[k] ? JSON.parse(JSON.stringify(S.items[k])) : null,
    daily: JSON.parse(JSON.stringify(S.daily)),
    life: JSON.parse(JSON.stringify(S.life)),
    streak: JSON.parse(JSON.stringify(S.streak)),
    histKey: S.daily.key, histVal: S.hist[S.daily.key],
    done: Sess.done};
}
function undoLast(){
  var u=Sess.undo; if(!u) return;
  if(u.item) S.items[u.key]=u.item; else delete S.items[u.key];
  S.daily=u.daily; S.life=u.life; S.streak=u.streak;
  if(u.histVal===undefined) delete S.hist[u.histKey]; else S.hist[u.histKey]=u.histVal;
  Sess.done=u.done; Sess.undo=null; Sess.key=u.key; Sess.shown=false;
  touch(u.key); renderCard(); toast("Answer undone");
}
/* A wrong answer used to show exactly what a right one showed, so a confusion
   between two words that read alike was never named at the one moment the app
   had both the evidence and his attention. */
function missHtml(k){
  var c=cardOf(k); if(!c) return "";
  if(isSent(c) || isConj(c)) return "";      // a sentence has no confusable twin
  /* Only real neighbours: the same reading, or one mora away. Filling the box
     with arbitrary same-part-of-speech words asserted a confusion that did not
     exist, at the moment he was most likely to believe it. */
  var near=[], i, kana=c.kana, rom=c.romaji, mk=moraKey(rom);
  for(i=0;i<DECK.length && near.length<3;i++){
    var d=DECK[i];
    if(d.id===c.id || d.dup) continue;
    if(!S.items[d.id+"|j"]) continue;        // a word he has not met is not a confusion
    if(d.kana===kana || d.romaji===rom){ near.push(d); continue; }
    // moraKey returns null on a reading it cannot split, and reading .length
    // off that throws in the middle of drawing a card he has just missed
    var dk=moraKey(d.romaji);
    if(dk && mk && dk.length===mk.length){
      var diff=0;
      for(var q=0;q<dk.length;q++) if(dk[q]!==mk[q]) diff++;
      if(diff===1) near.push(d);
    }
  }
  if(!near.length) return "";
  var rows=near.slice(0,2).map(function(d){
    return '<div class="misline"><span class="mk">'+esc(d.kana)+'</span>'+
           '<span class="mr">'+esc(d.romaji)+'</span>'+
           '<span class="me">'+esc(d.en)+'</span></div>'; }).join("");
  return '<div class="missbox"><div class="mh">Do not confuse this with</div>'+rows+'</div>';
}
function answer(gr){
  rollDay();
  var k=Sess.key, fresh=!S.items[k], it=S.items[k]||newItem(), now=Date.now();
  Sess.undo=snapshot(k);
  var wasReview = it.s===1;
  var next=schedule(it,gr,now,false);
  next.seen=(it.seen||0)+1; next.ok=(it.ok||0)+(gr>0?1:0);
  S.items[k]=next;
  if(gr>0){
    var _wid=k.split("|")[0];
    if(S.crep[_wid]) delete S.crep[_wid];
    // a practice miss used to sit on the weakness score for ever, because only
    // another practice answer could clear it. A real review clears it now.
    if(S.pfail[k]) delete S.pfail[k];
  }
  if(fresh){
    if(isSent(cardOf(k))) S.daily.sentDone++;
    else if(isConj(cardOf(k))) S.daily.conjDone++;
    else if(dirOf(k)==="j"){
      S.daily.newDone++;
      // only a brand new WORD earns room for another; follow-ups and sentences do not
      if(gr===3) S.daily.credit+=0.5; else if(gr===0) S.daily.credit-=0.75;
      S.daily.credit=clamp(S.daily.credit,-S.settings.newPerDay,S.settings.newPerDay*2);
    }
    else S.daily.consDone++;
  }
  if(wasReview) S.daily.revDone++;
  S.daily.ans++; if(gr>0) S.daily.ok++;
  logReview(k, gr, it, now);
  if(!S.daily.missed) S.daily.missed={};
  if(gr===0) S.daily.missed[k]=1; else delete S.daily.missed[k];
  S.life.ans++; if(gr>0) S.life.ok++;
  if(!S.daily.buried) S.daily.buried={};
  if(!S.daily.done) S.daily.done={};
  /* A sibling that has not been introduced yet must still be held, or the
     consolidation queue could open it later the same day and the word would be
     tested in two directions within hours. A listening sibling is different:
     with no Japanese voice it can never be introduced at all, so holding it
     only writes a row that stands for nothing. */
  if(S.settings.separate!==false){
    var sib=siblingsOf(k), lsOn=listenOn();
    for(var si=0;si<sib.length;si++){
      var sk=sib[si];
      if(dirOf(sk)==="a" && !lsOn && !S.items[sk]) continue;
      S.daily.buried[sk]=1;
    }
  }
  if(next.s===1) S.daily.done[k]=1;
  var dk=S.daily.key; S.hist[dk]=(S.hist[dk]||0)+1;
  trimHist();
  if(S.streak.last!==dk){
    S.streak.cur = (S.streak.last===prevKey(dk,1)) ? S.streak.cur+1 : 1;
    S.streak.best = Math.max(S.streak.best,S.streak.cur); S.streak.last=dk;
  }
  Sess.done++; Sess.last=k;
  touch(k);
  /* A miss holds the screen once, with the words it is most likely confused
     with. Only when there are any: the neighbour rule needs a word already
     introduced whose reading is one mora away, and against his real deck that
     is true of 2 cards out of 83. The other 81 held the screen behind a "Next
     card" button with nothing above it to read, which is a tap for nothing. */
  if(gr===0 && !Sess.practice){
    var box=document.getElementById("fold"), mh=missHtml(k);
    if(box && mh){
      box.insertAdjacentHTML("beforeend", mh);
      var g=document.getElementById("grades");
      g.classList.remove("prac2");
      g.innerHTML='<button class="btn showbtn" id="missNext">Next card</button>';
      document.getElementById("missNext").addEventListener("click",function(){ nextCard(); });
      // undo has to stay reachable while the correction is on screen
      var ub=document.getElementById("undoBtn"); if(ub) ub.hidden = !Sess.undo;
      return;
    }
  }
  nextCard();
}
var LOG_CAP=12000;
// One row per scheduled answer: the raw material a parameter fit would need.
// [ unix seconds, card index, direction, grade 1..4, days since last review, state before ]
function logReview(key, gr, before, now){
  if(!Array.isArray(S.log)) S.log=[];
  var p=key.split("|"), c=IDX[p[0]];
  if(!c) return;
  // each kind of card needs its own range, or a conjugation anchor and the deck
  // word of the same index write into one another's history
  var idx = isSent(c) ? 100000 + c._i : (isConj(c) ? 200000 + c._i : c._i);
  var dir = p[1]==="j" ? 0 : (p[1]==="e" ? 1 : 2);
  var elapsed = before.lr ? Math.max(0,(now-before.lr)/86400000) : 0;
  /* A seventh field: what the mora matcher said about the typed answer, when
     there was one. 1 right, 0 wrong, absent when nothing was typed. Without it
     the log holds only self-grades, which is the corpus the trip check exists
     to escape. */
  var row=[Math.round(now/1000), idx, dir, gr+1, Math.round(elapsed*100)/100, before.s];
  if(Sess.verdict!==null && Sess.verdict!==undefined) row.push(Sess.verdict);
  S.log.push(row);
  if(S.log.length>LOG_CAP) S.log.splice(0, S.log.length-LOG_CAP);
}
/* "Lifetime accuracy" counts the learning steps taken seconds after the answer
   was on screen, so it reads high whatever real retention is. This is the real
   one: first answers to cards that were already review cards, at least a day
   after the last time they were seen. */
/* Unaided production: the typed answers only, judged by the matcher rather
   than by him. This is the honest number for whether he can produce a word. */
function typedAccuracy(days){
  var cut=Date.now()/1000 - (days||30)*86400, ok=0, n=0, skip=0;
  for(var i=0;i<S.log.length;i++){
    var r=S.log[i];
    if(r[0]<cut || r.length<7) continue;
    if(r[6]===2){ skip++; continue; }       // shown without typing, counted but not scored
    n++; if(r[6]===1) ok++;
  }
  return {n:n, ok:ok, skip:skip, pct: n? ok/n : null};
}
function trueRetention(days){
  var cut=Date.now()/1000 - (days||30)*86400, ok=0, n=0;
  for(var i=0;i<S.log.length;i++){
    var r=S.log[i];
    if(r[0]<cut) continue;
    if(r[5]!==1) continue;          // it was a review card, not learning
    if(!(r[4]>=1)) continue;        // and a day or more had passed
    n++; if(r[3]>1) ok++;           // grade 1 in the log is "again"
  }
  return {n:n, ok:ok, pct: n? ok/n : null};
}
function trimHist(){
  var ks=Object.keys(S.hist); if(ks.length<=400) return;
  ks.sort(); ks.slice(0,ks.length-400).forEach(function(k){delete S.hist[k];});
}



/* ---------- pre-rendered voice ---------- */
/* iOS never routes Web Speech to CarPlay. An <audio> element routes like any
   other media, so every line car mode needs is synthesised ahead of time with
   a neural voice, packed into sprites, and played from a real audio element.
   The sprites are sliced client side into one blob per clip, which avoids
   relying on seeking inside a long file. The device voices remain the
   fallback, for a phone with no downloaded audio and no signal. */
/* the build stamps this, so a build shipped without the voice files never
   asks the network for a manifest that is not there */
var AUD_SHIPPED=__AUDIO_SHIPPED__;
var AUD_BASE="audio/v1/", AUD_CACHE="kana-audio-v1";
/* log: the last few clip keys actually played, newest last. The audio
   assertions in the suite used to hook speechSynthesis, which is only the
   fallback, so they described a path a phone with the library never takes.
   Two lines here make the real channel observable, which is the only way a
   test can assert what is heard rather than what was nearly heard. */
var AUD={man:null, tried:false, want:{}, loaded:{}, el:null, url:null, fin:null, log:[]};
function audNote(key){ AUD.log.push({k:key, t:Date.now()}); if(AUD.log.length>40) AUD.log.shift(); }

function audOn(){ return S.settings.carAudio!==false; }
function pad3(n){ return ("00"+n).slice(-3); }
function audSpriteFor(key){
  var m=AUD.man; if(!m) return null;
  var cut=key.indexOf(":"); if(cut<0) return null;
  var kind=key.slice(0,cut), rest=key.slice(cut+1);
  if(kind==="p") return "p-000";
  var id=rest.split(":")[0], c=IDX[id];
  if(!c || typeof c._i!=="number") return null;
  if(kind==="wj"||kind==="we") return "w-"+pad3(Math.floor(c._i/m.wPer));
  if(kind==="sj"||kind==="se") return "s-"+pad3(Math.floor(c._i/m.sPer));
  if(kind==="fj")              return "f-"+pad3(Math.floor(c._i/m.fPer));
  return null;
}
/* The shell cache is versioned and wiped on every deploy. The voice must not
   be, or a two line code change would cost a forty megabyte re-download. */
function audFetch(url){
  if(!("caches" in self)) return fetch(url);
  return caches.open(AUD_CACHE).then(function(c){
    return c.match(url).then(function(hit){
      if(hit) return hit;
      return fetch(url).then(function(res){
        if(res && res.ok) c.put(url, res.clone()).catch(function(){});
        return res;
      });
    });
  }).catch(function(){ return fetch(url); });
}
/* Sprite files are named after their own contents, so an unchanged sprite keeps
   its URL and stays in the phone's cache while a changed one can never be
   served stale. The manifest is the only file that has to be fresh, so it is
   fetched from the network first and falls back to the cached copy offline. */
function audFile(sprite){
  var m=AUD.man;
  return (m && m.files && m.files[sprite]) || sprite;
}
function audManifest(){
  if(AUD.man) return Promise.resolve(AUD.man);
  if(!AUD_SHIPPED) return Promise.resolve(null);
  if(AUD.tried) return Promise.resolve(null);
  AUD.tried=true;   // cleared again below if this attempt fails, see the catch
  var url=AUD_BASE+"manifest.json";
  return fetch(url, {cache:"no-store"})
    .then(function(r){
      if(!r||!r.ok) throw 0;
      if("caches" in self){
        var copy=r.clone();
        caches.open(AUD_CACHE).then(function(c){ c.put(url, copy).catch(function(){}); })
          .catch(function(){});
      }
      return r.json();
    })
    .catch(function(){
      return audFetch(url).then(function(r){ if(!r||!r.ok) throw 0; return r.json(); });
    })
    .then(function(m){ AUD.man=m; audPrune(m); return m; })
    /* One tunnel at the start of a drive used to turn the pre-rendered voice off
       for the rest of the session. A failed attempt is just a failed attempt. */
    .catch(function(){ AUD.tried=false; return null; });
}
/* Sprite files are named after their contents, so a changed sprite arrives under
   a new name and its predecessor would sit in the cache forever. The bucket is
   about fifty megabytes to begin with, and on iOS overflowing the origin quota
   evicts everything, the app shell included. Anything the current manifest does
   not name is dead and goes. */
function audPrune(m){
  if(!m || !m.files || !("caches" in self)) return;
  var live={"manifest.json":1};
  for(var k in m.files){ live[m.files[k]+".mp3"]=1; live[m.files[k]+".json"]=1; }
  caches.open(AUD_CACHE).then(function(c){
    return c.keys().then(function(keys){
      for(var i=0;i<keys.length;i++){
        var u=keys[i].url;
        if(u.indexOf(AUD_BASE)<0) continue;
        var base=u.slice(u.lastIndexOf("/")+1);
        if(!live[base]) c.delete(keys[i]).catch(function(){});
      }
    });
  }).catch(function(){});
}
var AUD_WAIT=8000;   // a drive cannot stand still waiting for a file
function audLoad(sprite){
  if(AUD.want[sprite]) return AUD.want[sprite];
  var f=audFile(sprite);
  var p=Promise.all([
    audFetch(AUD_BASE+f+".json").then(function(r){ if(!r||!r.ok) throw 0; return r.json(); }),
    audFetch(AUD_BASE+f+".mp3").then(function(r){ if(!r||!r.ok) throw 0; return r.arrayBuffer(); })
  ]).then(function(a){ var o={idx:a[0], buf:a[1]}; AUD.loaded[sprite]=o; return o; })
    .catch(function(){ return null; });
  var timed=new Promise(function(res){ setTimeout(function(){ res(null); }, AUD_WAIT); });
  var out=Promise.race([p, timed]).then(function(r){
    /* A miss is not a verdict. Forgetting it lets the next word try again,
       instead of the device voice for the rest of the drive. */
    if(!r) delete AUD.want[sprite];
    return r;
  });
  AUD.want[sprite]=out; return out;
}
function audHas(key){
  var sp=audSpriteFor(key); if(!sp) return false;
  var s=AUD.loaded[sp];
  return !!(s && s.idx && s.idx[key]);
}
function audEl(){
  if(!AUD.el){
    AUD.el=new Audio();
    AUD.el.preload="auto";
    try{ AUD.el.setAttribute("playsinline",""); }catch(e){}
  }
  return AUD.el;
}
function audStop(){
  try{ if(AUD.el) AUD.el.pause(); }catch(e){}
  if(AUD.fin){ var f=AUD.fin; AUD.fin=null; f(false); }
}
function audPlayBytes(bytes, pb){
  return new Promise(function(res){
    var el=audEl(), done=false, t=null;
    function fin(ok){
      if(done) return; done=true;
      if(AUD.fin===fin) AUD.fin=null;
      el.onended=null; el.onerror=null;
      if(t) clearTimeout(t);
      /* Detach the element from the blob before revoking it. Revoking a URL the
         element is still pointed at makes it fetch a URL that no longer exists,
         which logs net::ERR_FILE_NOT_FOUND against a blob: address on every
         clip that is cut short. Harmless to hear, but it is noise in the one
         place a real audio failure would show up. */
      if(AUD.url){
        var dead=AUD.url; AUD.url=null;
        try{ el.removeAttribute("src"); el.load(); }catch(e){}
        try{ URL.revokeObjectURL(dead); }catch(e){}
      }
      res(ok);
    }
    AUD.fin=fin;
    try{
      AUD.url=URL.createObjectURL(new Blob([bytes],{type:"audio/mpeg"}));
      el.onended=function(){ fin(true); };
      el.onerror=function(){ fin(false); };
      el.src=AUD.url;
      el.playbackRate=clamp(pb||1, 0.5, 2);
      var pr=el.play();
      if(pr && pr.catch) pr.catch(function(){ fin(false); });
    }catch(e){ fin(false); return; }
    t=setTimeout(function(){ fin(true); }, 30000);   // never hang the drive
  });
}
/* The manifest maps a sprite to the content-addressed file it actually lives
   in, and audSpriteFor returns null without it, so every call below this line
   silently did nothing until something else had fetched it. Only the car sound
   check, the settings screen and the two buttons on it ever did. That meant a
   phone that opened the app and started studying used the device voice for the
   whole session, and the pre-rendered library it had already downloaded went
   unused, however many megabytes of it were sitting there. Fetching it is the
   responsibility of the thing that needs it. */
function audManifestReady(){
  if(AUD.man) return Promise.resolve(AUD.man);
  return Promise.race([
    audManifest(),
    new Promise(function(res){ setTimeout(function(){ res(null); }, AUD_WAIT); })
  ]);
}
/* alive: an optional "is this still wanted" test, checked after the fetch and
   again before playback. A clip can take seconds to arrive and the card it was
   for may be long gone by then. Returning true from here would send the caller
   down its fallback path and speak the stale word anyway, so a superseded clip
   reports success and plays nothing. */
function audPlay(key, pb, alive){
  if(!audOn()) return Promise.resolve(false);
  if(alive && !alive()) return Promise.resolve(true);
  return audManifestReady().then(function(m){
  if(!m) return false;
  if(alive && !alive()) return true;
  var sp=audSpriteFor(key);
  if(!sp) return false;
  return audLoad(sp).then(function(s){
    if(!s || !s.idx[key]) return false;
    if(alive && !alive()) return true;
    var r=s.idx[key];
    audNote(key);
    return audPlayBytes(s.buf.slice(r[0], r[0]+r[1]), pb);
  });
  }).catch(function(){ return false; });
}
/* Every sprite a drive can reach: the word, its conjugations, and the sentences
   it can quote. The sentence sprites are nearly half the library, and leaving
   them out of this list meant the download control could never reach a hundred
   per cent and a drive fetched them one at a time at the roadside instead. */
function audSpritesFor(ids){
  var out=[], seen={}, i, j;
  function add(key){ var sp=audSpriteFor(key); if(sp && !seen[sp]){ seen[sp]=1; out.push(sp); } }
  for(i=0;i<ids.length;i++){
    add("wj:"+ids[i]); add("fj:"+ids[i]+":0");
    var ss=sentencesFor(ids[i]);
    for(j=0;j<ss.length;j++) add("sj:"+ss[j].id);
  }
  if(!seen["p-000"]) out.push("p-000");
  return out;
}
/* What is fetched before the first word plays is capped by size, not by a count
   of words: eighteen words can mean two sprites or twelve, and twenty-four
   megabytes at the kerbside is not a preload. Whatever has not arrived is
   fetched during the drive, and the device voice covers the gap. */
var AUD_PRELOAD_MB=8;
function audPreload(ids, cap){
  return audManifest().then(function(m){
    if(!m) return false;
    var all=audSpritesFor(ids.slice(0, cap||18)), list=[], mbs=0;
    for(var i=0;i<all.length;i++){
      var sz=(m.sprites[all[i]]||{}).bytes||0;
      if(list.length && mbs+sz > AUD_PRELOAD_MB*1048576) break;
      list.push(all[i]); mbs+=sz;
    }
    return Promise.all(list.map(audLoad)).then(function(r){
      for(var i=0;i<r.length;i++) if(r[i]) return true;
      return false;
    });
  });
}
// every sprite in the library, which is what the download control offers
function audAllSprites(){
  var m=AUD.man; if(!m) return [];
  var out=[]; for(var k in m.sprites) out.push(k);
  return out;
}
function audBytesCached(){
  var m=AUD.man; if(!m) return Promise.resolve({have:0,total:0});
  var total=0, byFile={};
  for(var k in m.sprites){ total+=m.sprites[k].bytes; byFile[audFile(k)+".mp3"]=m.sprites[k].bytes; }
  if(!("caches" in self)) return Promise.resolve({have:0,total:total});
  return caches.open(AUD_CACHE).then(function(c){ return c.keys(); }).then(function(keys){
    var have=0, seen={};
    for(var i=0;i<keys.length;i++){
      var u=keys[i].url, base=u.slice(u.lastIndexOf("/")+1);
      if(byFile[base] && !seen[base]){ seen[base]=1; have+=byFile[base]; }
    }
    return {have:have, total:total};
  }).catch(function(){ return {have:0,total:total}; });
}
function mb(n){ return (n/1048576).toFixed(1)+" MB"; }

/* ---------- car mode: hands free, audio only ---------- */
/* iOS stops web speech the moment the app is backgrounded or the screen locks,
   so car mode holds a screen wake lock and expects the phone awake in a mount.
   Nothing here touches the schedule. A drive is exposure, not examination: you
   cannot grade honestly at 100 km/h, and a blind grade would corrupt FSRS. The
   one signal it produces is a replay, which feeds Focus and nothing else. */
var CAR_ACTIVE=6, CAR_GAPS=[40000,140000], CAR_REPS=3;
/* A test-only clock multiplier. The gap between a word's passes is 40 seconds
   and then 140, so asserting that a word really waits it out costs three
   minutes of wall clock per word, which is why nothing ever asserted it and
   why the repetition bug shipped. CAR_CLK scales the drive's sense of elapsed
   time and every wait it schedules by the same factor, so the same arithmetic
   is observable in under a second. It is 1 everywhere except in a test, is
   never read from or written to saved state, and setting it does not change
   any threshold: only how fast the clock that feeds them runs. */
var CAR_CLK=1;
function carEl(){ return (Date.now()-CAR.started)*CAR_CLK; }
var CAR_COVER_DAYS=2;   // how long a word stays at the back of the queue after a drive
var CAR_TOP=5;          // the worst words come back anyway, however recently they played
var CAR_KEEP_DAYS=7;    // coverage older than this is forgotten
var CAR_SILENCE="data:audio/wav;base64,UklGRmQGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YUAGAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA";
var CAR={running:false, paused:false, gen:0, pool:[], backlog:[], item:null,
  started:0, endAt:0, pausedAt:0, heard:0, sent:0, wake:null, audio:null,
  warned:false, waitT:null, waitR:null, clockT:null, auto:false,
  /* mid: true only while CAR.item is actually being played, false once its
     pass has been counted. Pause, skip and repeat all act on CAR.item, and
     without this they could not tell a word that is mid-sentence from one that
     finished a minute ago and is sitting out its gap. Acting on the second
     kind replays it and counts the pass twice. */
  mid:false,
  played:[], touched:[], again:{}};

/* A drive is as long as the drive. Ending on a clock meant reaching for the
   phone at a red light to start the next one, which is the one thing this mode
   exists to avoid. It now runs until the words run out or he ends it. */
function carMinutes(){
  var n=S.settings.carMin;
  if(typeof n!=="number" || !isFinite(n) || n<=0) return 0;   // 0 is "until I stop"
  return clamp(Math.round(n),1,60);
}
function carOpenEnded(){ return carMinutes()===0; }
function carGapMs(){
  var n=S.settings.carGap;
  if(typeof n!=="number" || !isFinite(n)) n=DEFAULTS.carGap;
  return clamp(Math.round(n),2,8)*1000;
}
function carDirection(){ var d=S.settings.carDir; return (d==="je"||d==="ej")?d:"mix"; }
function carReady(){ return S.settings.tts!==false && ttsReady(); }
function carFmt(sec){
  if(sec<60) return sec+" second"+(sec===1?"":"s");
  var m=Math.round(sec/60); return m+" minute"+(m===1?"":"s");
}
function isWordId(id){ var c=IDX[id]; return !!c && !isSent(c) && !isConj(c); }

function carHeardRecently(id){
  var t=S.carSeen[id];
  if(typeof t!=="number" || !isFinite(t)) return false;
  return (Date.now()/1000 - t) < CAR_COVER_DAYS*86400;
}
function carPrune(){
  var cut=Date.now()/1000 - CAR_KEEP_DAYS*86400;
  for(var id in S.carSeen){
    var t=S.carSeen[id];
    if(typeof t!=="number" || !isFinite(t) || t<cut) delete S.carSeen[id];
  }
}
/* What the drive draws on: the words that are going badly, then what is due,
   then anything already met. No new words ever, by design.

   A drive also remembers what it covered. Anything heard in the last two days
   drops to the back, so the next drive moves on instead of replaying the same
   six words every morning. The worst handful are exempt: a word that is still
   failing has earned the repetition, and shuffling it away to look varied
   would be the wrong kind of honest. */
function carWords(){
  var seen={}, front=[], back=[], i, k, id;
  var w=weakWords(), top={};
  for(i=0;i<w.length && i<CAR_TOP;i++) top[w[i].id]=1;
  function take(x){
    if(seen[x]) return; if(!isWordId(x)) return;
    if(reservedFor(x)) return;                 // held out of drilling for the check
    if(!inRotation(x+"|j")) return;
    seen[x]=1;
    if(carHeardRecently(x) && !top[x]) back.push(x); else front.push(x);
  }
  for(i=0;i<w.length;i++) take(w[i].id);
  var now=Date.now(), due=[], rest=[];
  for(k in S.items){
    if(dirOf(k)!=="j") continue;
    id=k.split("|")[0];
    if(!isWordId(id) || !inRotation(k)) continue;
    if(S.items[k].due<=now) due.push(id); else rest.push(id);
  }
  shuffle(due); for(i=0;i<due.length;i++) take(due[i]);
  shuffle(rest); for(i=0;i<rest.length;i++) take(rest[i]);
  return front.concat(back);
}
function carMake(id){ return {id:id, reps:0, due:0}; }
/* Each word comes back two more times at widening gaps inside the same drive,
   which is the whole point: one pass is listening, three passes is learning. */
function carPick(){
  if(!CAR.pool.length){
    // an open ended drive goes round again rather than stopping mid journey
    if(!CAR.backlog.length && carOpenEnded()) CAR.backlog=(CAR.ids||carWords()).slice();
    if(!CAR.backlog.length) return null;
    CAR.pool.push(carMake(CAR.backlog.shift()));
  }
  var el=carEl(), best=CAR.pool[0];
  for(var i=1;i<CAR.pool.length;i++) if(CAR.pool[i].due<best.due) best=CAR.pool[i];
  /* Nothing due yet. A word waiting out its gap must not be brought forward,
     but sitting in silence is not the alternative: there are dozens of words
     in the backlog and a drive should never go quiet while they exist. The
     pool cap only ever governed how many words are in rotation at once, and
     holding the drive to it turned a forty second gap into forty seconds of
     nothing, which is indistinguishable from the app having stopped. */
  if(best.due>el && CAR.backlog.length){
    var n=carMake(CAR.backlog.shift());
    CAR.pool.push(n);
    return n;
  }
  return best;
}
function carAdvance(it){
  it.reps++; CAR.heard++;
  /* Coverage is only claimed for a word that finished all three passes. A word
     the drive cut off after one pass has never been produced from English, and
     suppressing it for two days would starve exactly the thinnest exposure. */
  if(it.reps>=CAR_REPS && CAR.played.indexOf(it.id)<0) CAR.played.push(it.id);
  if(CAR.touched.indexOf(it.id)<0) CAR.touched.push(it.id);
  var el=carEl(), i=CAR.pool.indexOf(it);
  if(it.reps>=CAR_REPS){
    if(i>=0) CAR.pool.splice(i,1);
    if(CAR.backlog.length) CAR.pool.push(carMake(CAR.backlog.shift()));
  } else it.due = el + CAR_GAPS[Math.min(it.reps-1, CAR_GAPS.length-1)];
}
function carSentence(id){
  var list=sentencesFor(id), c=IDX[id];
  for(var i=0;i<list.length;i++){
    var sx=list[i];
    if(!inRotation(sx.id+"|j")) continue;
    if(c && sx.kana.indexOf(c.kana)<0) continue;
    return sx;
  }
  return null;
}
function carConjPick(id){
  var it=S.items[id+"|j"];
  if(!it || it.s!==1 || it.iv<CONJ_GATE) return null;
  var row=FORMS[id]; if(!row) return null;
  var set=formSet(row);
  var n=Math.min(set.length, Math.floor(row.length/3));
  if(n<=0) return null;
  var i=Math.floor(Math.random()*n);
  return {label:set[i][1], kana:row[i*3+1], romaji:row[i*3+2], i:i};
}

/* One utterance, with a watchdog. WebKit drops speech silently on long runs,
   and a car session that stalls in silence is worse than useless. */
/* A clip first, the device voice second. The clip is what reaches CarPlay;
   the device voice is what still works on a phone with neither the download
   nor a signal. */
function carSay(text, lang, rate, clip){
  if(CAR.paused) return Promise.resolve();
  if(clip && audOn()){
    var pb = lang==="en" ? 1 : clamp((rate||0.85)/0.85, 0.5, 1.6);
    return audPlay(clip, pb).then(function(ok){
      return ok ? null : carSpeak(text, lang, rate);
    });
  }
  return carSpeak(text, lang, rate);
}
function carSpeak(text, lang, rate){
  return new Promise(function(res){
    if(CAR.paused || !text || !("speechSynthesis" in window)){ res(); return; }
    var done=false, t=null;
    function fin(){ if(done) return; done=true; if(t) clearTimeout(t); res(); }
    try{
      speechSynthesis.cancel();
      var u=new SpeechSynthesisUtterance(String(text));
      u.lang = lang==="en" ? "en-US" : "ja-JP";
      u.rate = clamp(rate,0.4,1.5);
      var v = lang==="en" ? enVoice() : jaVoice();
      if(v){ try{ u.voice=v; }catch(e){} }
      u.onend=fin; u.onerror=fin;
      speechSynthesis.speak(u);
    }catch(e){ fin(); return; }
    var est = 800 + String(text).length*(lang==="en"?95:190)/Math.max(0.5,rate);
    t=setTimeout(fin, Math.min(25000, est+4000));
  });
}
function carHold(ms){
  return new Promise(function(res){
    if(CAR.waitT) clearTimeout(CAR.waitT);
    CAR.waitR=res;
    // ms is in drive time, so it is divided by the same factor carEl multiplies by
    CAR.waitT=setTimeout(function(){ CAR.waitR=null; res(); }, ms/CAR_CLK);
  });
}
// any control that interrupts the chain must also release whatever it is waiting on
function carBreak(){
  if(CAR.waitT){ clearTimeout(CAR.waitT); CAR.waitT=null; }
  if(CAR.waitR){ var r=CAR.waitR; CAR.waitR=null; r(); }
}
function carBump(){ CAR.gen++; try{ speechSynthesis.cancel(); }catch(e){} audStop(); carBreak(); }

async function carPlay(it, g){
  var c=IDX[it.id]; if(!c) return;
  var rate=S.settings.speechRate||0.85;
  var dir=carDirection();
  /* Mixed alternates on purpose: hear it first and place the meaning, then
     produce it from English on the way back. Recognition is the easier half. */
  var toJa = dir==="ej" || (dir==="mix" && it.reps>0);
  if(dir==="je") toJa=false;

  var kJa="wj:"+it.id, kEn="we:"+it.id;
  carPaint(it,"ask",toJa);
  if(toJa){
    carPhase("say this in Japanese");
    await carSay(c.en,"en",1.0,kEn);               if(g!==CAR.gen) return;
    await carHold(carGapMs());                     if(g!==CAR.gen) return;
    carPhase("the answer"); carPaint(it,"answer",toJa);
    await carSay(c.kana,"ja",rate,kJa);            if(g!==CAR.gen) return;
    if(S.settings.carSlow!==false){
      await carHold(350);                          if(g!==CAR.gen) return;
      await carSay(c.kana,"ja",Math.max(0.4,rate-0.25),kJa); if(g!==CAR.gen) return;
    }
  } else {
    carPhase("what does this mean");
    await carSay(c.kana,"ja",rate,kJa);            if(g!==CAR.gen) return;
    await carHold(carGapMs());                     if(g!==CAR.gen) return;
    carPhase("the answer"); carPaint(it,"answer",toJa);
    await carSay(c.en,"en",1.0,kEn);               if(g!==CAR.gen) return;
    await carHold(300);                            if(g!==CAR.gen) return;
    await carSay(c.kana,"ja",rate,kJa);            if(g!==CAR.gen) return;
  }
  if(S.settings.carEcho!==false){
    carPhase("now say it yourself");
    await carHold(2400);                           if(g!==CAR.gen) return;
  }
  // the second pass earns a conjugation, the last pass earns a sentence
  if(S.settings.carConj!==false && it.reps===1){
    var f=carConjPick(it.id);
    if(f){
      carPhase("the "+f.label);
      await carSay("Now the "+f.label+" of","en",1.0,"p:f-"+f.label); if(g!==CAR.gen) return;
      await carSay(c.kana,"ja",rate,kJa);              if(g!==CAR.gen) return;
      await carHold(carGapMs());                       if(g!==CAR.gen) return;
      await carSay(f.kana,"ja",rate,"fj:"+it.id+":"+f.i); if(g!==CAR.gen) return;
    }
  }
  if(S.settings.carSent!==false && it.reps===CAR_REPS-1){
    var sx=carSentence(it.id);
    if(sx){
      carPhase("in a sentence");
      await carSay(sx.kana,"ja",rate,"sj:"+sx.id); if(g!==CAR.gen) return;
      await carHold(carGapMs());                   if(g!==CAR.gen) return;
      await carSay(sx.en,"en",1.0,"se:"+sx.id);    if(g!==CAR.gen) return;
      CAR.sent++;
    }
  }
  await carHold(600);
}
async function carRun(g){
  while(CAR.running && !CAR.paused && g===CAR.gen){
    if(Date.now()>=CAR.endAt){ carFinish(); return; }
    if(!CAR.warned && !carOpenEnded() && carMinutes()>=3 && CAR.endAt-Date.now()<=60000){
      CAR.warned=true;
      await carSay("One minute left.","en",1.0,"p:warn");
      if(g!==CAR.gen) return;
    }
    var it=carPick();
    if(!it){ carFinish(); return; }
    /* The gap between a word's passes is written into it.due, and until now
       nothing ever waited for it: whatever the queue handed back was played at
       once. The spacing only appeared when some other word happened to be due
       sooner, so on a second lap, with the backlog refilled and few words
       competing, a word's three passes ran straight into each other and the
       second was a free look at the answer the first had just given. */
    var wait=it.due-carEl();
    if(wait>250){
      await carHold(Math.min(wait, CAR_GAPS[CAR_GAPS.length-1]));
      if(!CAR.running || CAR.paused || g!==CAR.gen) return;
    }
    CAR.item=it; CAR.mid=true;
    await carPlay(it,g);
    if(g!==CAR.gen) return;
    carAdvance(it); CAR.mid=false;
  }
}

function carStart(){
  if(!carReady()){ toast("Car mode needs a Japanese voice on this device"); return; }
  var ids=carWords();
  if(!ids.length){ toast("Nothing met yet. Study a few words first."); return; }
  CAR.ids=ids;
  go("car"); document.getElementById("tabs").classList.add("hide");
  var need = S.settings.carChecked!==true;
  document.getElementById("carCheck").hidden = !need;
  document.getElementById("carMain").hidden = need;
  document.getElementById("carActs").hidden = need;
  if(need){ carPhase("sound check"); return; }
  carBegin(ids);
}
function carBegin(ids){
  var list=(ids||CAR.ids||carWords());
  if(audOn() && !AUD.man){
    carPhase("loading the voice");
    /* Time boxed. A sprite that never arrives used to leave the screen reading
       "loading the voice" with the drive never started. */
    var went=false;
    var go=function(){ if(!went){ went=true; carBegin2(list); } };
    setTimeout(go, AUD_WAIT+2000);
    audPreload(list).then(go, go);
    return;
  }
  if(audOn()) audPreload(list);
  carBegin2(list);
}
function carBegin2(ids){
  CAR.running=true; CAR.paused=false; CAR.auto=false; CAR.gen++;
  CAR.backlog=(ids||CAR.ids||carWords()).slice(); CAR.pool=[];
  for(var i=0;i<CAR_ACTIVE && CAR.backlog.length;i++) CAR.pool.push(carMake(CAR.backlog.shift()));
  CAR.item=null; CAR.mid=false; CAR.heard=0; CAR.sent=0; CAR.warned=false;
  CAR.played=[]; CAR.touched=[]; CAR.again={};
  CAR.started=Date.now();
  CAR.endAt = carOpenEnded() ? Infinity : CAR.started+carMinutes()*60000;
  document.getElementById("carCheck").hidden=true;
  document.getElementById("carDone").hidden=true;
  document.getElementById("carMain").hidden=false;
  document.getElementById("carActs").hidden=false;
  var pb=document.getElementById("carPause"); if(pb) pb.textContent="Pause";
  carWakeOn(); carAudioOn(); carMediaInit(); carClock();
  carRun(CAR.gen);
}
function carRepeat(){
  if(!CAR.running || !CAR.item || CAR.paused || !CAR.mid) return;
  var id=CAR.item.id;
  S.crep[id]=Math.min(9,(S.crep[id]||0)+1);
  CAR.again[id]=1; save();
  carBump();
  var g=CAR.gen, it=CAR.item;
  (async function(){
    await carPlay(it,g);
    if(g!==CAR.gen) return;
    carAdvance(it); CAR.mid=false;
    carRun(g);
  })();
}
function carSkip(){
  if(!CAR.running || CAR.paused) return;
  /* Skip during the gap has nothing to skip: the word it would advance has
     already been counted, and advancing it again spends a rep that was never
     played. Releasing the wait and moving on is the whole job. */
  var it=CAR.mid ? CAR.item : null;
  carBump();
  if(it){ carAdvance(it); CAR.mid=false; }
  carRun(CAR.gen);
}
function carPause(auto){
  if(!CAR.running || CAR.paused) return;
  CAR.paused=true; CAR.auto=!!auto; CAR.pausedAt=Date.now();
  carBump();
  carPhase(auto ? "paused, the app left the screen" : "paused");
  var b=document.getElementById("carPause"); if(b) b.textContent="Resume";
  try{ if(CAR.audio) CAR.audio.pause(); }catch(e){}
  try{ if("mediaSession" in navigator) navigator.mediaSession.playbackState="paused"; }catch(e){}
}
/* A phone call or a navigation prompt must not eat the drive, so the clock and
   every pending gap shift by exactly the time lost, and the interrupted word
   starts again from the top rather than resuming mid-answer. */
function carResume(){
  if(!CAR.running || !CAR.paused) return;
  var lost=Date.now()-(CAR.pausedAt||Date.now());
  CAR.endAt+=lost; CAR.started+=lost;
  CAR.paused=false; CAR.auto=false;
  var b=document.getElementById("carPause"); if(b) b.textContent="Pause";
  carWakeOn(); carAudioOn();
  try{ if("mediaSession" in navigator) navigator.mediaSession.playbackState="playing"; }catch(e){}
  CAR.gen++;
  /* Only a word that was actually interrupted gets played again. A pause that
     landed in the gap between two passes used to replay the previous word and
     count its pass a second time, so the word came back immediately and its
     rep counter ran ahead of what had been heard. Three of those and the word
     left the rotation having been played once, which is why a second round
     stopped arriving on a drive with the screen going on and off. */
  var g=CAR.gen, it=CAR.mid ? CAR.item : null;
  (async function(){
    if(it){ await carPlay(it,g); if(g!==CAR.gen) return; carAdvance(it); CAR.mid=false; }
    carRun(g);
  })();
}
function carFinish(){
  if(!CAR.running) return;
  var secs=Math.max(0,Math.round(carEl()/1000));
  CAR.running=false; CAR.paused=false; carBump();
  S.life.carSec=(S.life.carSec||0)+secs;
  S.life.carHeard=(S.life.carHeard||0)+CAR.heard;
  S.life.carSent=(S.life.carSent||0)+CAR.sent;
  var stamp=Math.round(Date.now()/1000);
  for(var i=0;i<CAR.played.length;i++) S.carSeen[CAR.played[i]]=stamp;
  carPrune();
  save();
  carWakeOff(); carAudioOff();
  if(CAR.clockT){ clearInterval(CAR.clockT); CAR.clockT=null; }
  try{ if("mediaSession" in navigator) navigator.mediaSession.playbackState="none"; }catch(e){}
  carSummary(secs);
}
/* The drive ends on the screen, not in a toast that vanishes while you are
   still parking. It says what was covered and hands the words you asked for
   again straight to Focus, which is the only place they can do any work. */
function carSummary(secs){
  var main=document.getElementById("carMain"); if(main) main.hidden=true;
  var acts=document.getElementById("carActs"); if(acts) acts.hidden=true;
  var el=document.getElementById("carDone"); if(!el) return;
  el.hidden=false;
  carPhase("drive over");
  var clk=document.getElementById("carClock"); if(clk) clk.textContent="\u2014";
  document.getElementById("carDoneHead").textContent =
    CAR.heard+" play"+(CAR.heard===1?"":"s")+" over "+carFmt(secs);
  document.getElementById("carDoneSub").textContent =
    CAR.touched.length+" word"+(CAR.touched.length===1?"":"s")+" covered"+
    (CAR.sent ? ", "+CAR.sent+" sentence"+(CAR.sent===1?"":"s") : "")+
    ". Nothing in your schedule changed.";
  var ids=Object.keys(CAR.again||{});
  var list=document.getElementById("carDoneList"), fb=document.getElementById("carToFocus");
  if(ids.length){
    var rows="";
    for(var i=0;i<ids.length;i++){
      var c=IDX[ids[i]]; if(!c) continue;
      rows+='<div class="cd-row"><span class="cd-rm">'+esc(c.romaji)+'</span>'+
            '<span class="cd-k">'+esc(c.kana)+'</span>'+
            '<span class="cd-en">'+esc(c.en)+'</span></div>';
    }
    list.innerHTML='<div class="cd-h">You asked for these again</div>'+rows+
      '<div class="fine">They are flagged for Focus.</div>';
    list.hidden=false; fb.hidden=false;
    fb.textContent="Focus on these now";
  } else {
    list.hidden=true; list.innerHTML=""; fb.hidden=true;
  }
}
function carLeave(){
  document.getElementById("tabs").classList.remove("hide");
  var el=document.getElementById("carDone"); if(el) el.hidden=true;
  go("home"); render();
}
/* iOS drops the lock when the app goes to the background, and coming back runs
   two handlers that both ask for it. The request is async, so CAR.wake is still
   null when the second one checks, and the drive ended up holding two locks and
   leaking one past the end of the session. */
function carWakeOn(){
  try{
    if(!navigator.wakeLock || CAR.wake || CAR.waking) return;
    CAR.waking=true;
    var p=navigator.wakeLock.request("screen");
    if(p && p.then) p.then(function(w){
      CAR.waking=false;
      CAR.wake=w;
      try{ w.addEventListener("release",function(){ CAR.wake=null; }); }catch(e){}
    }).catch(function(){ CAR.waking=false; });
    else CAR.waking=false;
  }catch(e){ CAR.waking=false; }
}
function carWakeOff(){ CAR.waking=false; try{ if(CAR.wake){ CAR.wake.release(); CAR.wake=null; } }catch(e){} }
/* A silent loop holds the media session open, which is what puts pause, next
   and previous on the steering wheel and the lock screen. */
function carAudioOn(){
  try{
    if(!CAR.audio){ CAR.audio=new Audio(CAR_SILENCE); CAR.audio.loop=true; CAR.audio.volume=0.001; }
    var p=CAR.audio.play(); if(p && p.catch) p.catch(function(){});
  }catch(e){}
}
function carAudioOff(){ try{ if(CAR.audio) CAR.audio.pause(); }catch(e){} }
function carMediaInit(){
  if(!("mediaSession" in navigator)) return;
  try{
    navigator.mediaSession.setActionHandler("play",function(){ carResume(); });
    navigator.mediaSession.setActionHandler("pause",function(){ carPause(false); });
    navigator.mediaSession.setActionHandler("nexttrack",function(){ carSkip(); });
    navigator.mediaSession.setActionHandler("previoustrack",function(){ carRepeat(); });
    navigator.mediaSession.playbackState="playing";
  }catch(e){}
}
function carPhase(txt){ var el=document.getElementById("carPhase"); if(el) el.textContent=txt; }
/* stage is "ask" or "answer". Showing the romaji and the English together was
   a bug: a glance at a red light handed you the answer you were supposed to be
   recalling. The prompt side only, until the answer plays. */
var HIDDEN="\u00b7 \u00b7 \u00b7";
function carPaint(it, stage, toJa){
  var c=IDX[it.id]; if(!c) return;
  var show = stage!=="ask";
  var r=document.getElementById("carRomaji");
  var e=document.getElementById("carEn");
  var k=document.getElementById("carKana");
  var jp = show || !toJa;        // the Japanese is the prompt on a meaning pass
  var en = show || !!toJa;       // the English is the prompt on a production pass
  if(r) r.textContent = jp ? c.romaji : HIDDEN;
  if(k) k.textContent = jp ? c.kana : "";
  if(e) e.textContent = en ? c.en : HIDDEN;
  var n=document.getElementById("carRep");    if(n) n.textContent="pass "+(it.reps+1)+" of "+CAR_REPS;
  /* The head unit is a screen at eye level. Showing the word and its meaning
     there during the silent gap undid the blanking above, so it carries the
     answer only once the answer has been said. */
  if("mediaSession" in navigator){
    try{ navigator.mediaSession.metadata=new MediaMetadata(show
      ? {title:c.romaji, artist:c.en, album:"Kana Ladder car mode"}
      : {title:"Kana Ladder", artist:"listen", album:"Kana Ladder car mode"}); }catch(err){}
  }
}
function carClock(){
  if(CAR.clockT) clearInterval(CAR.clockT);
  CAR.clockT=setInterval(function(){
    if(!CAR.running){ clearInterval(CAR.clockT); CAR.clockT=null; return; }
    if(CAR.paused) return;
    if(isFinite(CAR.endAt) && Date.now()>=CAR.endAt+5000){ carFinish(); return; }
    var el=document.getElementById("carClock");
    if(el){
      // open ended: count up, so the number is time spent rather than time left
      var t = carOpenEnded() ? carEl() : Math.max(0,CAR.endAt-Date.now());
      var m=Math.floor(t/60000), sc=Math.floor((t%60000)/1000);
      el.textContent=m+":"+String(sc).padStart(2,"0");
    }
    var cc=document.getElementById("carCount");
    if(cc) cc.textContent=CAR.heard+" play"+(CAR.heard===1?"":"s");
  },500);
}
function carSoundTest(){
  audManifest().then(function(){
    return carSay("Car mode. If you can hear this through the car, you are ready.",
                  "en",1.0,"p:test");
  }).then(function(){
    return carSay("こんにちは","ja",S.settings.speechRate||0.85,"wj:c0000");
  });
}
function bindCar(){
  var b=document.getElementById("carBtn");
  if(b) b.addEventListener("click",function(){ carStart(); });
  var t=document.getElementById("carTest");
  if(t) t.addEventListener("click",function(){ carSoundTest(); });
  var h=document.getElementById("carHeard");
  if(h) h.addEventListener("click",function(){
    S.settings.carChecked=true; save(); carBegin(CAR.ids||carWords()); });
  var no=document.getElementById("carNoSound");
  if(no) no.addEventListener("click",function(){
    var tr=document.getElementById("carTrouble"); if(tr) tr.hidden=false; });
  var rp=document.getElementById("carZoneRepeat");
  if(rp) rp.addEventListener("click",function(){ carRepeat(); });
  var sk=document.getElementById("carZoneSkip");
  if(sk) sk.addEventListener("click",function(){ carSkip(); });
  var pb=document.getElementById("carPause");
  if(pb) pb.addEventListener("click",function(){ CAR.paused ? carResume() : carPause(false); });
  var en=document.getElementById("carEnd");
  if(en) en.addEventListener("click",function(){
    if(CAR.running) carFinish(); else carLeave();
  });
  var cb2=document.getElementById("checkBtn");
  if(cb2) cb2.addEventListener("click",function(){ startCheck(); });
  var cq=document.getElementById("checkQuit");
  if(cq) cq.addEventListener("click",function(){
    CHK.on=false; document.getElementById("tabs").classList.remove("hide"); go("stats"); });
  var dn=document.getElementById("carDoneBtn");
  if(dn) dn.addEventListener("click",function(){ carLeave(); });
  var tf=document.getElementById("carToFocus");
  if(tf) tf.addEventListener("click",function(){ carLeave(); startFocus(); });
  document.addEventListener("visibilitychange",function(){
    if(!CAR.running) return;
    if(document.visibilityState!=="visible") carPause(true);
    else { carWakeOn(); if(CAR.paused && CAR.auto) carResume(); }
  });
}

/* ---------- the trip check ---------- */
/* Every number the app shows is derived from cards it has drilled and he has
   graded himself. This is the one measurement that is not: a fixed reserved
   pool that no mode ever teaches, tested objectively, every fortnight, with a
   verdict that is allowed to be bad news. */
var CHECK_EVERY=14, CHECK_N=24;
function reservedFor(id){
  // a stable hash so the same cards are held out on every device and every build
  var h=0; for(var i=0;i<id.length;i++) h=(h*31+id.charCodeAt(i))>>>0;
  return h%17===3;
}
/* The first version of this held its pool out of teaching, which did not make
   the check honest, it deleted 107 words from the course and then tested him on
   them. What is held out is the DRILLING: these words are taught and scheduled
   like any other, and the practice modes leave them alone, so the check measures
   what scheduled review alone retained. Nothing is ever untaught. */
function checkPool(){
  var out=[];
  for(var i=0;i<DECK.length;i++){
    var c=DECK[i];
    if(!reservedFor(c.id)) continue;
    var it=S.items[c.id+"|j"];
    if(!it || it.s!==1) continue;        // only words he has actually been taught
    if(S.susp[c.id+"|j"]) continue;
    out.push(c);
  }
  return out;
}
function checkReady(){ return checkPool().length>=12; }
function checkDue(){
  if(!checkReady()) return false;
  var last=(S.checks&&S.checks.length)? S.checks[S.checks.length-1].t : 0;
  var gap=CHECK_EVERY;
  var d=tripDays();
  if(d!==null && d<=28) gap=7;        // weekly in the last month
  return (Date.now()-last)/86400000 >= gap;
}
function checkBuild(){
  var pool=shuffle(checkPool().slice()), items=[], per=Math.floor(CHECK_N/4);
  function take(kind,n){
    var got=0;
    for(var i=0;i<pool.length && got<n;i++){
      var c=pool[i];
      if(items.some(function(q){return q.id===c.id;})) continue;
      var q=null;
      // a homophone has two right answers to one clip, here as anywhere else
      if(kind==="listen") q=soundIsAmbiguous(c.id) ? null : makeQuestion("mcAudio", c.id);
      else if(kind==="produce") q={kind:"ctype", id:c.id, key:c.id+"|e"};
      else if(kind==="read") q=makeQuestion("mcJE", c.id);
      else if(kind==="conj") q=makeQuestion("conj", c.id);
      if(q){ q.block=kind; items.push(q); got++; }
    }
    return got;
  }
  take("listen",per); take("produce",per); take("read",per); take("conj",per);
  while(items.length<CHECK_N && take("read",1)){}
  return shuffle(items);
}
function startCheck(){
  var q=checkBuild();
  if(q.length<8){ toast("Not enough held-out words yet. Study a little more first."); return; }
  CHK={on:true, q:q, i:0, right:0, block:{}, answered:false};
  go("check"); document.getElementById("tabs").classList.add("hide");
  renderCheck();
}
var CHK={on:false, q:[], i:0, right:0, block:{}, answered:false};
function checkScore(kind, ok){
  var b=CHK.block[kind]||{n:0,ok:0};
  b.n++; if(ok) b.ok++; CHK.block[kind]=b;
  if(ok) CHK.right++;
}
function renderCheck(){
  var el=document.getElementById("checkBody"); if(!el) return;
  if(CHK.i>=CHK.q.length){ endCheck(); return; }
  var q=CHK.q[CHK.i], c=IDX[q.id];
  document.getElementById("checkCount").textContent=(CHK.i+1)+" of "+CHK.q.length;
  var head="", body="";
  if(q.block==="listen"){ head="What did you hear?"; body='<button class="playbig" id="chkPlay">'+SPK+'</button>'; }
  else if(q.block==="produce"){ head="Type it in romaji";
    body='<div class="chk-en">'+esc(c.en)+'</div>'+
         '<input id="chkIn" class="typein" autocomplete="off" autocapitalize="off" spellcheck="false">'+
         '<button class="btn" id="chkGo">Answer</button>'; }
  else if(q.block==="read"){ head="What does this mean?"; body='<div class="chk-jp">'+esc(c.kana)+'</div>'; }
  else { head=q.ask||"Which form is it?"; body='<div class="chk-jp">'+esc(c.base||c.kana)+'</div>'; }
  var opts="";
  if(q.opts){
    for(var i=0;i<q.opts.length;i++)
      opts+='<button class="opt-btn" data-opt="'+i+'">'+esc(q.opts[i].text)+
            (q.opts[i].sub?'<span class="sub">'+esc(q.opts[i].sub)+'</span>':'')+'</button>';
  }
  el.innerHTML='<div class="chk-h">'+esc(head)+'</div>'+body+'<div class="opts">'+opts+'</div>';
  if(q.block==="listen"){
    var pb=document.getElementById("chkPlay");
    pb.addEventListener("click",function(){ speakCard(c); });
    speakCard(c);
  }
  if(q.block==="produce"){
    document.getElementById("chkGo").addEventListener("click",function(){
      var v=document.getElementById("chkIn").value;
      checkScore("produce", romajiMatches(v, c.romaji)); CHK.i++; renderCheck();
    });
  }
  Array.prototype.forEach.call(el.querySelectorAll(".opt-btn"),function(b){
    b.addEventListener("click",function(){
      checkScore(q.block, !!q.opts[+b.dataset.opt].ok); CHK.i++; renderCheck();
    });
  });
}
function endCheck(){
  CHK.on=false;
  var pct=CHK.q.length? CHK.right/CHK.q.length : 0;
  var rec={t:Date.now(), n:CHK.q.length, ok:CHK.right, block:{}};
  for(var k in CHK.block) rec.block[k]=CHK.block[k];
  if(!S.checks) S.checks=[];
  S.checks.push(rec);
  if(S.checks.length>20) S.checks.splice(0, S.checks.length-20);
  /* The band drives a decision, not a badge. Below half, intake is cut so the
     pile he has can consolidate rather than grow. */
  /* A single bad result is not a mandate. The intake is only cut after two
     checks in a row below half, and the figure it was cut from is remembered so
     it can be put back. */
  var prev=S.checks.length>1 ? S.checks[S.checks.length-2] : null;
  var prevBad = prev && (prev.ok/prev.n) < 0.5;
  if(pct<0.5 && prevBad && S.settings.newPerDay>3){
    rec.was=S.settings.newPerDay; S.settings.newPerDay=3; rec.cut=1;
  } else if(pct>=0.6 && S.settings.newPerDay<=3){
    // and a good one puts it back, to whatever it was cut from
    var was=0;
    for(var q=S.checks.length-2;q>=0;q--) if(S.checks[q].was && !S.checks[q].spent){
      was=S.checks[q].was; S.checks[q].spent=1; break; }
    if(was>3){ S.settings.newPerDay=was; rec.restored=was; }
  }
  save();
  document.getElementById("tabs").classList.remove("hide");
  go("stats"); render();
  toast(Math.round(pct*100)+"% on the trip check. "+
    (rec.cut ? "New words cut to 3 a day, from "+rec.was+"."
     : rec.restored ? "New words back to "+rec.restored+" a day." : "Saved."));
}
function renderCheckPanel(){
  var el=document.getElementById("checkNote"); if(!el) return;
  var h=S.checks||[];
  if(!h.length){ el.textContent="Never taken. It is 24 held-out items, about three minutes, and nothing in it is ever drilled."; }
  else {
    var last=h[h.length-1], pct=Math.round(last.ok/last.n*100);
    var parts=[];
    for(var k in last.block) parts.push(k+" "+Math.round(last.block[k].ok/last.block[k].n*100)+"%");
    var delta="";
    if(h.length>1){ var prev=h[h.length-2];
      var d=pct-Math.round(prev.ok/prev.n*100);
      delta=(d>=0?" up ":" down ")+Math.abs(d)+" points since last time."; }
    el.textContent = pct+"% overall ("+parts.join(", ")+")."+delta+
      (pct<50 ? " On this evidence you will not follow spoken Japanese yet." :
       pct<75 ? " Useable, but the weakest block is where the next fortnight should go." :
                " Strong enough to transact in the areas covered.");
  }
  var b=document.getElementById("checkBtn");
  if(b) b.textContent = checkDue()? "Take the trip check" : "Take it again anyway";
}
/* ---------- rendering: home ---------- */
function stateOf(it){
  if(!it) return "new";
  if(it.s!==1) return "lrn";
  return it.iv>=21 ? "mat" : "yng";
}
function render(){
  rollDay();
  var c=counts();
  setTile("tileNew",c.newN); setTile("tileLrn",c.lrnN); setTile("tileDue",c.dueN);
  var total=c.newN+c.lrnN+c.dueN;
  var btn=document.getElementById("startBtn"), ahead=document.getElementById("aheadBtn");
  var note=document.getElementById("startNote");
  if(total>0){
    btn.disabled=false;
    btn.textContent="Start review · "+total+" card"+(total>1?"s":"");
    btn.dataset.mode="today";
    ahead.hidden=false; ahead.textContent="Study ahead instead";
    var b=newBonus();
    note.textContent = b>0 ? b+" extra new word"+(b>1?"s":"")+" earned by easy answers today" : "";
  } else {
    btn.disabled = c.aheadN===0;
    btn.textContent = c.aheadN===0 ? "Nothing to pull forward" : "Study ahead";
    btn.dataset.mode="ahead";
    ahead.hidden=true;
    var p=c.p;
    var held=buriedCount();
    note.textContent = p.lrn.length
      ? p.lrn.length+" learning card"+(p.lrn.length>1?"s":"")+" return in "+ivLabel(S.items[p.lrn[0]].due-Date.now())+". Study ahead runs with no cap."
      : (held ? held+" follow-up card"+(held>1?"s":"")+" for the words you studied today are held until tomorrow, so no word is tested twice in one day. Study ahead skips them too."
              : "Today's scheduled queue is clear. Study ahead pulls tomorrow's cards forward, with no limit.");
  }
  renderLevel();
  updateBadge(total);
  renderPracticePanel();

  /* The rail must account for every schedulable card, and the word count must
     count only words. Mixing sentence and conjugation ids into "words started"
     inflates it, and leaving conjugation out of the total made the four rail
     numbers fail to add up to the deck. */
  var mat=0,yng=0,lrn=0,words={};
  for(var k in S.items){ var st=stateOf(S.items[k]); if(st==="mat")mat++; else if(st==="yng")yng++; else lrn++;
    var wid=k.split("|")[0], wc=IDX[wid];
    if(wc && !isSent(wc) && !isConj(wc)) words[wid]=1; }
  var lsOn = listenOn();
  var perWord = 1 + (S.settings.reverse==="off"?0:1) + (lsOn?1:0);
  var totalCards = DECK.length*perWord
    + (S.settings.sentences!==false ? SENT.length*(1+(lsOn?1:0)) : 0)
    + (S.settings.conj!==false ? CONJ.length : 0);
  var touched=mat+yng+lrn, nwords=Object.keys(words).length;
  /* The header counts words, the legend counts cards, and a word makes up to
     three of them. Shown side by side with no unit those two read as a
     contradiction, so both units are now stated outright. */
  document.getElementById("progAux").textContent=
    nwords.toLocaleString()+" words · "+touched.toLocaleString()+" cards started";
  var rail=document.getElementById("rail").children;
  rail[0].style.width=(mat/totalCards*100)+"%";
  rail[1].style.width=(yng/totalCards*100)+"%";
  rail[2].style.width=(lrn/totalCards*100)+"%";
  document.getElementById("lgMat").textContent=mat;
  document.getElementById("lgYng").textContent=yng;
  document.getElementById("lgLrn").textContent=lrn;
  document.getElementById("lgNew").textContent=Math.max(0,totalCards-touched);

  document.getElementById("kvAns").textContent=S.daily.ans;
  document.getElementById("kvAcc").textContent=S.daily.ans?Math.round(S.daily.ok/S.daily.ans*100)+"%":"—";
  document.getElementById("kvNewToday").textContent=S.daily.newDone;
  var kb=document.getElementById("kvBackup");
  kb.textContent=backupLabel();
  kb.style.color = backupStale()?"var(--ohdo)":"";
  renderStats();
}
function tripDays(){
  var t=S.settings.tripDate;
  if(!t || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  var end=new Date(t+"T00:00:00").getTime();
  if(!isFinite(end)) return null;
  return Math.ceil((end-Date.now())/86400000);
}
/* Ten days out, new intake stops on its own. The week before a trip is when the
   queue peaks and the time runs short, and meeting new words then buys nothing
   that can still mature. */
var TAPER_DAYS=10;
function inTaper(){ var d=tripDays(); return d!==null && d<=TAPER_DAYS && d>=0; }
function renderTrip(){
  var el=document.getElementById("tripNote"); if(!el) return;
  var d=tripDays();
  if(d===null){ el.hidden=true; return; }
  el.hidden=false;
  if(d<0){ el.textContent="The trip date has passed. Clear it in Settings."; return; }
  var met=0; for(var k in S.items){ if(dirOf(k)==="j" && S.items[k] && !S.susp[k]) met++; }
  var perDay=newAllowance();
  var proj=met+Math.max(0,d)*Math.min(perDay, INTRO.length);
  el.textContent = d+" day"+(d===1?"":"s")+" to go. "+met+" words met, about "+
    Math.round(proj)+" by then at "+perDay+" a day"+
    (inTaper()? ". New words are paused for the last "+TAPER_DAYS+" days so the rest can settle." : ".");
}
function renderPracticePanel(){
  var sw=document.getElementById("noNewSw");
  if(sw) sw.setAttribute("aria-checked", String(!!S.daily.noNew));
  var miss=0; for(var k in (S.daily.missed||{})) if(S.items[k]) miss++;
  var el=document.getElementById("pracMissed");
  if(el) el.textContent = miss ? miss+" waiting" : "none today";
  var n=0; for(var k2 in S.items){ if(S.items[k2] && !S.susp[k2]) n++; }
  var note=document.getElementById("pracNote");
  if(note) note.textContent = n ? n+" in rotation" : "nothing yet";

  renderTrip();
  var lw=document.getElementById("listenWarn");
  if(lw){
    /* The pre-rendered library speaks Japanese perfectly well without a device
       voice, and listenOn has always said so. This panel used to look only at
       the device voice, so on a phone running on the library it announced that
       listening was paused while listening was running. It follows the same
       test the deck follows now. */
    var stopped = listenBlocked();
    lw.hidden = !stopped;
    if(stopped) lw.innerHTML =
      "<b>Listening cards are paused.</b> This device is not offering a Japanese voice, so the "+
      "audio cards cannot play and are being left out of the deck and the score. On iPhone: "+
      "Settings, Accessibility, Spoken Content, Voices, Japanese, then download a voice and reopen this app. "+
      "Downloading the pre-rendered voice in Settings also brings them back.";
  }
  var cb=document.getElementById("carBtn"), cs=document.getElementById("carBtnSub");
  if(cb){
    var words=0;
    for(var wk in S.items){ if(dirOf(wk)==="j" && !S.susp[wk] && isWordId(wk.split("|")[0])) words++; }
    var noVoice=!carReady();
    cb.disabled = noVoice || words===0;
    if(cs) cs.textContent = noVoice
      ? "needs a Japanese voice on this device"
      : (words ? carMinutes()+" minutes, audio only, eyes on the road"
               : "nothing met yet");
  }
  var weak=weakWords(), fb=document.getElementById("focusBtn"),
      fs=document.getElementById("focusBtnSub");
  if(fb){
    fb.disabled = false;
    if(fs) fs.textContent = weak.length
      ? Math.min(weak.length,FOCUS_WORDS)+" word"+(weak.length>1?"s":"")+
        " you are struggling with, drilled from three angles each"
      : (n ? "nothing is going badly, so a mixed draw over the "+n+" you have met"
           : "nothing met yet");
  }
}
function renderCarNumbers(){
  var mins=Math.round((S.life.carSec||0)/60);
  var a=document.getElementById("nCarMin"); if(a) a.textContent=mins;
  var b=document.getElementById("nCarHeard"); if(b) b.textContent=(S.life.carHeard||0);
}
function setTile(id,n){var el=document.getElementById(id); el.querySelector(".n").textContent=n; el.classList.toggle("zero",n===0);}

var LAST=null;
function renderLevel(){
  var sp=scoreParts(); LAST=sp;
  var sc=Math.round(sp.score), L=levelOf(sc), N=nextLevel(L);
  var pct = N ? (sc-L.min)/(N.min-L.min) : 1;
  document.getElementById("lvlN").textContent="Level "+L.n;
  document.getElementById("lvlName").textContent=L.ja+" · "+L.en;
  document.getElementById("lvlFill").style.width=Math.max(2,Math.round(pct*100))+"%";
  document.getElementById("lvlScore").textContent=sc+" / "+DECK.length;
  document.getElementById("lvlNext").textContent = N ? (N.min-sc)+" to Level "+N.n : "top level";
  var sa=document.getElementById("streakAux");
  if(sa) sa.textContent = S.streak.cur
    ? S.streak.cur+" day"+(S.streak.cur>1?"s":"")+" · best "+S.streak.best : "not started";
  drawStreak();
  renderSkillStrip(sp);
}
// three segments under the level bar, so a skill sitting at zero is impossible to miss
function renderSkillStrip(sp){
  [ "skillStrip", "skillStrip2" ].forEach(function(id){ paintSkills(id, sp); });
  var w=document.getElementById("skillWeak");
  if(w){
    if(sp.weakest){ w.hidden=false;
      w.textContent="Weakest skill: "+sp.weakest.label.toLowerCase()+", "+
        Math.round(sp.weakest.v*100)+" percent. "+sp.weakest.note+".";
    } else w.hidden=true;
  }
}
function paintSkills(id, sp){
  var el=document.getElementById(id); if(!el) return;
  var cls={recog:"sk-j", recall:"sk-e", listen:"sk-a"};
  var live=sp.dims.filter(function(d){return d.w>0;});
  el.innerHTML = live.map(function(d){
    return '<div class="sk '+cls[d.k]+'" title="'+esc(d.label)+'">'+
      '<div class="sk-lb">'+esc(d.label)+'</div>'+
      '<div class="sk-bar"><i style="width:'+Math.max(1,Math.round(d.v*100))+'%"></i></div>'+
      '<div class="sk-pc">'+Math.round(d.v*100)+'%</div></div>';
  }).join("");
}

function svgBars(el,vals,labels,color,unit,emptyMsg){
  var W=320,H=+el.getAttribute("viewBox").split(" ")[3],pad=14,bw=W/vals.length;
  var real=Math.max.apply(null,vals), max=Math.max(real,1);
  var h="";
  h+='<line x1="0" y1="'+(H-pad)+'" x2="'+W+'" y2="'+(H-pad)+'" stroke="var(--rule)" stroke-width="1"/>';
  for(var i=0;i<vals.length;i++){
    var bh=vals[i]/max*(H-pad-8), x=i*bw+bw*0.16, w=bw*0.68;
    if(vals[i]>0) h+='<rect x="'+x.toFixed(1)+'" y="'+(H-pad-bh).toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+bh.toFixed(1)+'" rx="1.6" fill="'+color+'"/>';
    else h+='<rect x="'+x.toFixed(1)+'" y="'+(H-pad-2)+'" width="'+w.toFixed(1)+'" height="2" rx="1" fill="var(--rule)"/>';
  }
  if(labels) for(var j=0;j<labels.length;j++){ if(!labels[j]) continue;
    var lx=j*bw+bw/2, anchor="middle";
    if(lx < 22){ lx=0; anchor="start"; } else if(lx > W-22){ lx=W; anchor="end"; }
    h+='<text x="'+lx.toFixed(1)+'" y="'+(H-3)+'" text-anchor="'+anchor+'" font-size="8" fill="var(--ink-3)" font-family="IBM Plex Mono, monospace">'+labels[j]+'</text>';
  }
  if(real>0) h+='<text x="0" y="9" font-size="8.5" fill="var(--ink-3)" font-family="IBM Plex Mono, monospace">'+real+(unit||"")+'</text>';
  else h+='<text x="'+(W/2)+'" y="'+((H-pad)/2+3)+'" text-anchor="middle" font-size="10" fill="var(--ink-3)">'+(emptyMsg||"")+'</text>';
  el.innerHTML=h;
}
function drawStreak(){
  var today=dayKey(Date.now()), vals=[], labs=[];
  for(var i=29;i>=0;i--){ var k=prevKey(today,i); vals.push(S.hist[k]||0);
    labs.push(i===29?k.slice(5).replace("-","/"):(i===0?"today":"")); }
  svgBars(document.getElementById("streakChart"),vals,labs,"var(--ai)","","No reviews logged yet");
}
function renderStats(){
  var sp = LAST || scoreParts();
  var sc=Math.round(sp.score), L=levelOf(sc), N=nextLevel(L);
  document.getElementById("pLvlBig").textContent=L.n;
  document.getElementById("pLvlJa").textContent=L.ja+" · "+L.en;
  document.getElementById("pLvlDesc").textContent=L.d;
  document.getElementById("pLvlOf").textContent="of "+LEVELS.length;
  document.getElementById("pLvlScore").textContent=sc;
  document.getElementById("pLvlNext").textContent = N ? (N.min-sc)+" pts" : "—";
  document.getElementById("pRecog").textContent=pct(sp.recog);
  document.getElementById("pRecall").textContent=pct(sp.recall);
  document.getElementById("pListen").textContent=pct(sp.listen);
  if(listenBlocked()){
    var frozen=0; for(var fk in S.items) if(dirOf(fk)==="a") frozen++;
    document.getElementById("pListen").textContent="paused";
    document.getElementById("pListen").title=
      frozen+" listening card"+(frozen===1?"":"s")+" frozen, no Japanese voice on this device";
  }
  document.getElementById("pSent").textContent=sp.sent+" / "+sp.sentTot;
  document.getElementById("pConj").textContent=sp.conj+" / "+sp.conjTot;
  var wt=document.getElementById("scoreNote");
  if(wt) wt.textContent =
    "The level is a weighted sum over all "+DECK.length+" words: recognition "+Math.round(sp.W.j*100)+
    " percent, recall in Japanese "+Math.round(sp.W.e*100)+" percent, listening "+Math.round(sp.W.a*100)+
    " percent"+(listenBlocked()?", which is zero because this device has no Japanese voice":"")+
    ". Each word counts for more as its interval grows, reaching full value at two months, and drops "+
    "back if it falls overdue. "+
    "A skill you never practise holds the level down, by design. Sentences and conjugation are counted "+
    "separately and do not move it. It measures this deck only: JLPT also tests grammar and kanji.";
  renderSkillStrip(sp);
  document.getElementById("lvlAux").textContent=sp.known+" words recognised";

  var h="";
  for(var i=0;i<SECTORS.length;i++){
    var g=sp.sec[i], m=g.n?g.sum/g.n:0, pc=Math.round(m*100);
    var tint=(m*50).toFixed(1);
    h+='<div class="cell" style="background:var(--paper-2);background:color-mix(in srgb, var(--matcha) '+tint+'%, var(--paper-2))">'+
       '<span class="nm">'+esc(SECTORS[i][0])+'</span>'+
       '<span><span class="pc">'+pc+'<small>%</small></span>'+
       '<span class="ct">'+g.known+' of '+g.n+' recognised</span></span></div>';
  }
  document.getElementById("heat").innerHTML=h;
  /* The percentage and the count measure different things: the percentage is
     how strongly the whole area is held, averaged over every word in it, while
     the count is how many of those words you can already read. Seven percent
     and 14 of 130 look contradictory until that is said out loud. */
  var hn=document.getElementById("heatNote");
  if(hn) hn.textContent =
    "The percentage is how strongly the area is held on average across every word in it, "+
    "counting a word for more as its interval grows. The line under it counts the words you "+
    "can already read. They are different measures, so they do not match.";

  var avg=function(a){return a.length?a.reduce(function(x,y){return x+y;},0)/a.length:0;};
  /* "Cards in rotation" has to mean the same thing here as it does under
     Practice on the study screen: everything the scheduler can still show, in
     any state, minus what has been set aside. It used to count only cards in
     review and to include suspended ones, so the two screens disagreed. The
     interval and difficulty averages stay over review cards, where they mean
     something, but they drop suspended cards too. */
  var efs=[],ivs=[],mx=0,rot=0;
  for(var k in S.items){ var it=S.items[k];
    if(S.susp[k]) continue;
    rot++;
    if(it.s!==1) continue;
    efs.push(it.ef); ivs.push(it.iv); if(it.iv>mx) mx=it.iv; }
  document.getElementById("nRot").textContent=rot;
  var fsrs=S.settings.sched!=="sm2";
  var lab=document.getElementById("nEfLabel");
  if(lab) lab.textContent = fsrs ? "Average difficulty" : "Average ease factor";
  if(fsrs){
    var ds=[]; for(var k3 in S.items){ var i3=S.items[k3]; if(i3.s===1&&i3.sb>0) ds.push(i3.df); }
    document.getElementById("nEf").textContent = ds.length ? avg(ds).toFixed(1)+" / 10" : "—";
  } else {
    document.getElementById("nEf").textContent=efs.length?avg(efs).toFixed(2):"—";
  }
  document.getElementById("nIv").textContent=ivs.length?trimz(avg(ivs).toFixed(1))+"d":"—";
  document.getElementById("nAns").textContent=S.life.ans;
  document.getElementById("nAcc").textContent=S.life.ans?Math.round(S.life.ok/S.life.ans*100)+"%":"—";
  document.getElementById("nMax").textContent=mx?ivLabel(mx*86400000):"—";
  document.getElementById("nPrac").textContent=S.life.practice||0;
  document.getElementById("nLog").textContent=(Array.isArray(S.log)?S.log.length:0).toLocaleString();
  renderCarNumbers();
  var tr=trueRetention(30), rn=document.getElementById("nRet");
  if(rn) rn.textContent = tr.pct===null ? "\u2014" : Math.round(tr.pct*100)+"% of "+tr.n;
  var ta=typedAccuracy(30), tn=document.getElementById("nTyped");
  if(tn) tn.textContent = ta.pct===null ? "\u2014"
    : Math.round(ta.pct*100)+"% of "+ta.n+(ta.skip? ", "+ta.skip+" skipped":"");
  document.getElementById("statsSub").textContent="Level "+L.n+" · "+sc+" pts";
}

/* ---------- browse ---------- */
function renderBrowse(){
  var q=document.getElementById("q").value.trim().toLowerCase();
  var f=document.getElementById("filt").value;
  var src = (f==="sent") ? SENT
          : (f==="s1") ? DECK.filter(function(c){return (c.stage||1)===1;})
          : (f==="s2") ? DECK.filter(function(c){return c.stage===2;})
          : DECK;
  var out=[], nq=normRomaji(q);
  for(var i=0;i<src.length && out.length<200;i++){
    var c=src[i];
    if(q){ var hit = c.kana.indexOf(q)>=0 || (c.kanji||"").indexOf(q)>=0 ||
      (nq && normRomaji(c.romaji).indexOf(nq)>=0) || c.en.toLowerCase().indexOf(q)>=0;
      if(!hit) continue; }
    var it=S.items[c.id+"|j"], st=stateOf(it), susp=!!S.susp[c.id+"|j"];
    if(f!=="all" && f!=="sent" && f!=="s1" && f!=="s2"){
      if(f==="hard"){ if(!it || it.lapses<3) continue; }
      else if(f==="susp"){ if(!susp) continue; }
      else if(f!==st) continue;
    }
    out.push({c:c,it:it,st:st,susp:susp});
  }
  var h="";
  for(var j=0;j<out.length;j++){
    var o=out[j], sent=isSent(o.c);
    var lab = o.susp ? "aside" : (o.st==="new"?"new":(o.st==="lrn"?"learning":ivLabel(o.it.iv*86400000)));
    h+='<button class="row" data-id="'+o.c.id+'"><span><span class="jp'+(sent?" sm":"")+'">'+esc(o.c.kana)+
      (!sent&&S.settings.kanji&&o.c.kanji?' <span style="color:var(--ink-3);font-size:15px">'+esc(o.c.kanji)+'</span>':"")+
      '</span><span class="rm"> '+esc(o.c.romaji)+'</span><span class="en">'+esc(o.c.en)+'</span></span>'+
      '<span class="state s-'+(o.susp?"susp":o.st)+'">'+lab+'</span></button>';
  }
  document.getElementById("rows").innerHTML = h || '<div class="empty"><div class="big">無</div>Nothing matches that.</div>';
  document.getElementById("browseCount").textContent = DECK.length+" words · "+SENT.length+" sentences";
  document.getElementById("browseNote").textContent = out.length>=200 ? "Showing the first 200 matches. Narrow the search to see more." : (out.length+" shown");
  Array.prototype.forEach.call(document.querySelectorAll("#rows .row"),function(b){
    b.addEventListener("click",function(){ openSheet(b.dataset.id); });
  });
}

/* ---------- word sheet ---------- */
var SHEET=null, WORD2SENT=null;
function sentencesFor(id){
  if(!WORD2SENT){
    WORD2SENT={};
    for(var i=0;i<SENT.length;i++){ var x=SENT[i];
      for(var j=0;j<x.w.length;j++){ (WORD2SENT[x.w[j]] = WORD2SENT[x.w[j]]||[]).push(x); }
    }
  }
  return WORD2SENT[id]||[];
}
function schedLine(key){
  var it=S.items[key];
  if(S.susp[key]) return "set aside";
  if(!it) return "not started";
  if(it.s!==1) return "in learning";
  var base="due "+ivLabel(it.due-Date.now())+" from now, interval "+it.iv+"d";
  base += (S.settings.sched!=="sm2" && it.sb>0)
    ? ", stability "+it.sb.toFixed(1)+"d, difficulty "+it.df.toFixed(1)+"/10"
    : ", ease "+it.ef.toFixed(2);
  return base + (it.lapses?", "+it.lapses+" lapses":"");
}
function openSheet(id, quiet){
  var c=IDX[id]; if(!c) return;
  SHEET=id;
  var el=document.getElementById("sheet");
  var dirs=[["j","Japanese to English"],["e","English to Japanese"],["a","Listening"]];
  var rows=dirs.map(function(d){
    var key=id+"|"+d[0];
    if(d[0]==="e" && S.settings.reverse==="off") return "";
    return '<div class="kv"><span>'+d[1]+'</span><b class="sm">'+esc(schedLine(key))+'</b></div>';
  }).join("");
  var anySusp = !!(S.susp[id+"|j"]||S.susp[id+"|e"]||S.susp[id+"|a"]);
  el.innerHTML =
    '<div class="sheet-in">'+
      '<div class="sheet-head"><button class="x" id="sheetClose" aria-label="Close">&times;</button></div>'+
      '<div class="sheet-word"><div class="kana">'+esc(c.kana)+'</div>'+
        '<div class="romaji">'+esc(c.romaji)+'</div>'+
        (c.kanji?'<div class="kanji">'+esc(c.kanji)+'</div>':"")+
        '<div class="english">'+esc(c.en)+'</div>'+
        '<button class="speak" id="sheetSpeak" aria-label="Read aloud">'+SPK+'</button></div>'+
      (S.notes[id]?'<div class="cardnote">'+esc(S.notes[id])+'</div>':"")+
      '<div class="sheet-kv">'+rows+'</div>'+
      sentBlock(id, c)+
      '<div class="sheet-acts">'+
        '<button class="btn btn-ghost" id="sheetNote">'+(S.notes[id]?"Edit hint":"Add a hint")+'</button>'+
        '<button class="btn btn-ghost'+(anySusp?"":" danger")+'" id="sheetSusp">'+(anySusp?"Bring back":"Set aside")+'</button>'+
      '</div>'+
      '<div class="sheet-acts"><button class="btn btn-ghost" id="sheetReset">Reset this word</button></div>'+
    '</div>';
  el.hidden=false;
  if(!el._wired){ el._wired=1; el.addEventListener("click",function(e){ if(e.target===el) closeSheet(); }); }
  document.getElementById("sheetClose").addEventListener("click",closeSheet);
  document.getElementById("sheetSpeak").addEventListener("click",function(){ speakCard(c); });
  document.getElementById("sheetNote").addEventListener("click",function(){
    var v=prompt("A hint for "+c.kana+" ("+c.romaji+")", S.notes[id]||"");
    if(v===null) return;
    if(v.trim()) S.notes[id]=v.trim().slice(0,140); else delete S.notes[id];
    save(); openSheet(id,true);
  });
  document.getElementById("sheetSusp").addEventListener("click",function(){
    ["j","e","a"].forEach(function(d){ if(anySusp) delete S.susp[id+"|"+d]; else S.susp[id+"|"+d]=1; });
    save(); openSheet(id,true); renderBrowse(); render();
  });
  document.getElementById("sheetReset").addEventListener("click",function(){
    if(!confirm("Forget everything scheduled for "+c.kana+" and start it over?")) return;
    ["j","e","a"].forEach(function(d){ delete S.items[id+"|"+d]; delete S.susp[id+"|"+d]; });
    save(); closeSheet(); renderBrowse(); render(); toast("Word reset");
  });
  if(!quiet) speakCard(c);
}
function sentBlock(id, c){
  if(isSent(c)) return "";
  var list=sentencesFor(id);
  if(!list.length) return '<div class="sheet-sec"><h3>In sentences</h3>'+
    '<p class="fine">No sentence in the deck uses this word yet.</p></div>';
  var h='<div class="sheet-sec"><h3>In sentences</h3>';
  for(var i=0;i<Math.min(list.length,4);i++){
    var x=list[i], it=S.items[x.id+"|j"];
    var mark = it ? (it.s===1 ? "seen" : "learning") : "locked";
    h+='<div class="exline"><div class="ex-jp">'+esc(x.kana)+'</div>'+
       '<div class="ex-rm">'+esc(x.romaji)+'</div>'+
       '<div class="ex-en">'+esc(x.en)+'<span class="ex-st">'+mark+'</span></div></div>';
  }
  if(list.length>4) h+='<p class="fine">and '+(list.length-4)+' more</p>';
  return h+'</div>';
}
function closeSheet(){ SHEET=null; document.getElementById("sheet").hidden=true; }

/* ---------- settings ---------- */
function applySettings(){
  document.getElementById("setNew").value=S.settings.newPerDay;
  document.getElementById("setRev").value=S.settings.revCap;
  document.getElementById("setRev2").value=S.settings.reverse;
  document.getElementById("setType").setAttribute("aria-checked",String(!!S.settings.typing));
  document.getElementById("setKanji").setAttribute("aria-checked",String(!!S.settings.kanji));
  document.getElementById("setTts").setAttribute("aria-checked",String(!!S.settings.tts));
  document.getElementById("setSoft").setAttribute("aria-checked",String(!!S.settings.softCap));
  document.getElementById("setSep").setAttribute("aria-checked",String(S.settings.separate!==false));
  document.getElementById("setListen").setAttribute("aria-checked",String(S.settings.listen!==false));
  document.getElementById("setSent").setAttribute("aria-checked",String(S.settings.sentences!==false));
  document.getElementById("setBadge").setAttribute("aria-checked",String(S.settings.badge!==false));
  document.getElementById("setCons").value=(S.settings.consPerDay==="auto")?"":S.settings.consPerDay;
  document.getElementById("setGap").setAttribute("aria-checked",String(sentGap()>0));
  document.getElementById("setSentN").value=S.settings.sentPerDay;
  document.getElementById("setConj").setAttribute("aria-checked",String(S.settings.conj!==false));
  document.getElementById("setConjN").value=S.settings.conjPerDay;
  (function(){ var b=document.getElementById("setCardAudio");
    if(b) b.setAttribute("aria-checked", String(S.settings.cardAudio===true)); })();
  document.getElementById("setRate").value=Math.round((S.settings.speechRate||0.85)*100);
  document.getElementById("setVary").setAttribute("aria-checked",String(S.settings.speechVary!==false));
  document.getElementById("setAuto").setAttribute("aria-checked",String(S.settings.autoPlay!==false));
  document.getElementById("setCarAudio").setAttribute("aria-checked",String(audOn()));
  renderAudNote();
  document.getElementById("setTrip").value=S.settings.tripDate||"";
  document.getElementById("setCarMin").value=String(carMinutes());
  document.getElementById("setCarDir").value=carDirection();
  document.getElementById("setCarGap").value=Math.round(carGapMs()/1000);
  document.getElementById("setCarEcho").setAttribute("aria-checked",String(S.settings.carEcho!==false));
  document.getElementById("setCarSlow").setAttribute("aria-checked",String(S.settings.carSlow!==false));
  document.getElementById("setCarSent").setAttribute("aria-checked",String(S.settings.carSent!==false));
  document.getElementById("setCarConj").setAttribute("aria-checked",String(S.settings.carConj!==false));
  var enc=document.getElementById("enVoiceCount");
  if(enc) enc.textContent=(TTS.en&&TTS.en.length)?TTS.en.length:0;
  renderEnVoicePicker();
  var vn=document.getElementById("voiceCount");
  if(vn) vn.textContent = (TTS.voices&&TTS.voices.length) ? TTS.voices.length : 0;
  document.getElementById("sentCountTxt").textContent=SENT.length.toLocaleString();
  document.getElementById("conjCountTxt").textContent=CONJ.length.toLocaleString();
  document.getElementById("deckCountTxt").textContent=DECK.length.toLocaleString();
  document.getElementById("setTheme").value=S.settings.theme;
  document.getElementById("setSched").value=S.settings.sched||"fsrs";
  document.getElementById("setRet").value=Math.round((S.settings.retention||0.9)*100);
  renderSchedNote();
  if(S.settings.theme==="auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme",S.settings.theme);
}
/* Built from the voices this device actually offers, because which of them
   exist is decided by iOS and cannot be known in advance. */
function renderAudNote(){
  var el=document.getElementById("audNote"); if(!el) return;
  var scr=document.getElementById("s-set");
  if(!scr || !scr.classList.contains("on")){ el.textContent=""; return; }
  if(!audOn()){ el.textContent="Off, so car mode uses the device voices, which do not reach CarPlay."; return; }
  audManifest().then(function(m){
    if(!m){ el.textContent="The voice files are not reachable right now."; return; }
    audBytesCached().then(function(b){
      el.textContent = b.have
        ? mb(b.have)+" downloaded of "+mb(b.total)+" available."
        : "Nothing downloaded yet, of "+mb(b.total)+" available. A drive will fetch what it needs if you have signal.";
    });
  });
}
function audDownload(){
  var btn=document.getElementById("audGet");
  audManifest().then(function(m){
    if(!m){ toast("The voice files are not reachable right now"); return; }
    var ids=carWords();
    if(!ids.length){ toast("Nothing met yet"); return; }
    var list=audAllSprites();
    if(btn){ btn.disabled=true; btn.textContent="Downloading"; }
    return Promise.all(list.map(audLoad)).then(function(){
      if(btn){ btn.disabled=false; btn.textContent="Download"; }
      renderAudNote();
      toast("Voice downloaded");
    });
  }).catch(function(){
    if(btn){ btn.disabled=false; btn.textContent="Download"; }
    toast("The download did not finish");
  });
}
/* He could not tell which voice was speaking, and neither could I. That is the
   whole reason a wrong pronunciation went three rounds before anyone looked at
   the voice list. The name of the voice now sits on screen. */
/* The sample is read out of the deck, not typed here. It was typed here once,
   as gofun, and then the card changed to gofun desu and the button did not:
   Settings went on playing the bare word, which is the one case the voice
   cannot say, and reported a fault in a fix that had already worked. The two
   cannot drift apart again if there is only one of them. */
function jaSampleText(){
  var c=IDX["c1798"];
  return (c && sayTextOf(c)) || "\u3054\u3075\u3093\u3067\u3059";
}
function jaSample(){ speakAt(jaSampleText(), S.settings.speechRate||0.85, false); }
function renderJaVoicePicker(){
  var sel=document.getElementById("setJaVoice"); if(!sel) return;
  var list=jaRanked(), cur=S.settings.jaVoice||"auto", html="", i;
  html+='<option value="auto">Best available (let iOS choose)</option>';
  var labels=jaLabels(list);
  for(i=0;i<list.length;i++){
    html+='<option value="'+esc(vId(list[i]))+'">'+esc(labels[i])+'</option>';
  }
  sel.innerHTML=html;
  var found=(cur==="auto");
  if(!found) for(i=0;i<list.length;i++) if(vId(list[i])===cur) found=true;
  sel.value = found ? cur : "auto";
  var now=document.getElementById("jaVoiceNow");
  if(now){
    var top=jaTop();
    /* The identifier is printed with the name, because two voices called Kyoko
       cost three rounds of guessing while nothing on screen said what the phone
       was actually reporting. */
    var chosen=jaVoice();
    var label;
    if(chosen){
      label=jaLabel(chosen, list);
      if(vId(chosen) && vId(chosen)!==chosen.name) label+=" ("+vId(chosen)+")";
    } else if(ttsUsable()){
      label="whatever iOS picks for Japanese, which sounds better than anything it lists";
    } else {
      label="no speech engine on this phone";
    }
    now.textContent=label;
  }
}
function renderEnVoicePicker(){
  renderJaVoicePicker();
  var sel=document.getElementById("setEnVoice"); if(!sel) return;
  var list=enRanked(), cur=S.settings.enVoice||"auto", html="";
  html+='<option value="auto">Best available</option>';
  html+='<option value="off">Device default</option>';
  for(var i=0;i<list.length;i++){
    var nm=list[i].name||("voice "+(i+1));
    html+='<option value="'+esc(nm)+'">'+esc(nm)+" \u00b7 "+esc(list[i].lang||"")+'</option>';
  }
  sel.innerHTML=html;
  var found=(cur==="auto"||cur==="off");
  if(!found) for(var j=0;j<list.length;j++) if(list[j].name===cur) found=true;
  sel.value = found ? cur : "auto";
  var now=document.getElementById("enVoiceNow");
  if(now){
    var v=enVoice();
    now.textContent = v ? (v.name+" \u00b7 "+(v.lang||"")) : "whatever the device picks";
  }
}
function bindSettings(){
  document.getElementById("setNew").addEventListener("change",function(){
    S.settings.newPerDay=clamp(parseInt(this.value,10)||0,0,80); this.value=S.settings.newPerDay; save(); render();});
  document.getElementById("setRev").addEventListener("change",function(){
    S.settings.revCap=clamp(parseInt(this.value,10)||10,10,600); this.value=S.settings.revCap; save(); render();});
  document.getElementById("setRev2").addEventListener("change",function(){S.settings.reverse=this.value; save(); render();});
  document.getElementById("setCons").addEventListener("change",function(){
    if(this.value===""){ S.settings.consPerDay="auto"; save(); render(); return; }
    S.settings.consPerDay=clamp(parseInt(this.value,10)||0,0,60); this.value=S.settings.consPerDay; save(); render();});
  document.getElementById("setTrip").addEventListener("change",function(){
    S.settings.tripDate=this.value||""; save(); render();});
  document.getElementById("setGap").addEventListener("click",function(){
    S.settings.sentGap = sentGap()>0 ? 0 : 1;
    this.setAttribute("aria-checked",String(sentGap()>0)); save(); render();});
  document.getElementById("setSentN").addEventListener("change",function(){
    S.settings.sentPerDay=clamp(parseInt(this.value,10)||0,0,20); this.value=S.settings.sentPerDay; save(); render();});
  document.getElementById("setConj").addEventListener("click",function(){
    S.settings.conj=!(S.settings.conj!==false);
    this.setAttribute("aria-checked",String(S.settings.conj)); save(); render();});
  document.getElementById("setConjN").addEventListener("change",function(){
    S.settings.conjPerDay=clamp(parseInt(this.value,10)||0,0,10); this.value=S.settings.conjPerDay; save(); render();});
  document.getElementById("setRate").addEventListener("change",function(){
    S.settings.speechRate=clamp((parseInt(this.value,10)||85)/100, 0.50, 1.20);
    this.value=Math.round(S.settings.speechRate*100); save();
    speak("こんにちは");});
  document.getElementById("setVary").addEventListener("click",function(){
    S.settings.speechVary=!(S.settings.speechVary!==false);
    this.setAttribute("aria-checked",String(S.settings.speechVary)); save();});
  document.getElementById("setAuto").addEventListener("click",function(){
    S.settings.autoPlay=!(S.settings.autoPlay!==false);
    this.setAttribute("aria-checked",String(S.settings.autoPlay)); save();});
  document.getElementById("setCarDir").addEventListener("change",function(){
    S.settings.carDir=this.value; save(); });
  document.getElementById("setCarAudio").addEventListener("click",function(){
    var want=!audOn();
    S.settings.carAudio=want; this.setAttribute("aria-checked",String(want));
    save(); renderAudNote();
  });
  document.getElementById("setCardAudio").addEventListener("click",function(){
    var want = S.settings.cardAudio!==true;
    S.settings.cardAudio = want; this.setAttribute("aria-checked", String(want)); save();
  });
  document.getElementById("audGet").addEventListener("click",function(){ audDownload(); });
  document.getElementById("audTest").addEventListener("click",function(){
    audManifest().then(function(m){
      if(!m){ toast("The voice files are not reachable right now"); return; }
      return audPlay("p:test",1).then(function(ok){
        if(!ok) toast("That clip is not downloaded yet");
        else return audPlay("wj:c0000",1);
      });
    });
  });
  document.getElementById("setJaVoice").addEventListener("change",function(){
    S.settings.jaVoice=this.value; save(); renderJaVoicePicker(); jaSample(); });
  document.getElementById("jaVoiceTest").addEventListener("click",function(){
    renderJaVoicePicker(); jaSample(); });
  document.getElementById("speechDiagBtn").addEventListener("click",function(){
    var box=document.getElementById("speechDiag");
    if(!box) return;
    box.textContent=speechReport();
    box.hidden=!box.hidden;
    this.textContent=box.hidden?"Show":"Hide";
  });
  document.getElementById("setEnVoice").addEventListener("change",function(){
    S.settings.enVoice=this.value; save(); renderEnVoicePicker();
    carSay("This is how the English side will sound.","en",1.0); });
  document.getElementById("enVoiceTest").addEventListener("click",function(){
    carSay("This is how the English side will sound.","en",1.0); });
  document.getElementById("setCarMin").addEventListener("change",function(){
    var v=parseInt(this.value,10);
    S.settings.carMin = (v>0) ? clamp(v,1,60) : 0;
    this.value=String(carMinutes()); save(); render(); });
  document.getElementById("setCarGap").addEventListener("change",function(){
    S.settings.carGap=clamp(parseInt(this.value,10)||4,2,8); this.value=Math.round(carGapMs()/1000); save(); });
  [["setCarEcho","carEcho"],["setCarSlow","carSlow"],["setCarSent","carSent"],["setCarConj","carConj"]]
    .forEach(function(p){
      document.getElementById(p[0]).addEventListener("click",function(){
        var want=!(S.settings[p[1]]!==false);
        S.settings[p[1]]=want; this.setAttribute("aria-checked",String(want)); save(); });
    });
  document.getElementById("setTheme").addEventListener("change",function(){S.settings.theme=this.value; applySettings(); save();});
  document.getElementById("setSched").addEventListener("change",function(){
    S.settings.sched=this.value; save(); render(); renderSchedNote();
    toast(this.value==="fsrs" ? "Switched to FSRS-6" : "Switched to SM-2");
  });
  document.getElementById("setRet").addEventListener("change",function(){
    S.settings.retention=clamp(Math.round((parseFloat(this.value)||90))/100, 0.80, 0.97);
    this.value=Math.round(S.settings.retention*100); save(); render(); renderSchedNote();
  });
  [["setType","typing"],["setKanji","kanji"],["setTts","tts"],["setSoft","softCap"],["setSep","separate"],["setListen","listen"],["setSent","sentences"],["setBadge","badge"]].forEach(function(p){
    document.getElementById(p[0]).addEventListener("click",function(){
      var want=!S.settings[p[1]];
      if(want && p[1]==="badge" && !("setAppBadge" in navigator)){
        toast("This device does not show a count on the icon"); return;
      }
      if(want && p[1]==="listen" && !ttsReady()){
        toast("No Japanese voice is installed on this device"); return;
      }
      if(want && p[1]==="tts" && !("speechSynthesis" in window)){
        toast("This device cannot read aloud"); return;
      }
      S.settings[p[1]]=want; this.setAttribute("aria-checked",String(want)); save();
      if(p[1]==="kanji") renderBrowse();
      if(p[1]==="softCap"||p[1]==="separate"||p[1]==="listen"||p[1]==="sentences") render();
      if(p[1]==="badge"){ if(want) enableBadge(); render(); }
    });
  });
  document.getElementById("exportBtn").addEventListener("click",function(){
    var name="kana-ladder-"+dayKey(Date.now())+".json", text=JSON.stringify(packAll());
    function anchorSave(){
      try{
        var a=document.createElement("a");
        a.href=URL.createObjectURL(new Blob([text],{type:"application/json"}));
        a.download=name; document.body.appendChild(a); a.click();
        setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},2000);
        S.backup={last:dayKey(Date.now())}; save(); storageReport(); render();
        toast("Backup saved. Choose Save to Files to keep it.");
      }catch(e){ toast("Could not create the backup file"); }
    }
    if(window.claude && typeof window.claude.use==="function"){
      window.claude.use("downloads").then(function(dl){
        if(!dl) return anchorSave();
        return dl.save({filename:name, data:text}).then(
          function(){ S.backup={last:dayKey(Date.now())}; save(); storageReport(); render(); toast("Backup saved"); },
          function(err){ toast(err && err.code==="declined" ? "Backup cancelled" : "Backup was not saved"); });
      }).catch(anchorSave);
    } else anchorSave();
  });
  document.getElementById("importBtn").addEventListener("click",function(){ document.getElementById("importFile").click(); });
  document.getElementById("importFile").addEventListener("change",function(){
    var f=this.files&&this.files[0]; if(!f) return; var self=this;
    var fr=new FileReader();
    fr.onload=function(){
      try{
        var b=JSON.parse(fr.result);
        var why=validateBlob(b);
        if(why) throw new Error(why);
        var n=0; for(var kk in b.items){ if(IDX[kk.split("|")[0]]) n++; }
        if(!confirm("Replace the schedule on this phone with a backup holding "+n+" cards"+
          (b.daily&&b.daily.key?", saved "+b.daily.key:"")+"?")) { self.value=""; return; }
        var rollback=packAll();
        try{ localStorage.setItem(LS_KEY+".prev", JSON.stringify(rollback)); }catch(e2){}
        var keepRev=Math.max(S.rev, b.rev||0)+1;
        applyBlob(b); S.rev=keepRev; saveLocal(); markAll(); remoteQueue(); applySettings(); render(); renderBrowse();
        toast("Backup restored: "+n+" cards");
      }catch(e){ toast(String(e.message||"That file is not a Kana Ladder backup")); }
      self.value="";
    };
    fr.readAsText(f);
  });
  document.getElementById("resetBtn").addEventListener("click",function(){
    if(!confirm("Erase all scheduling and start the deck from zero? This cannot be undone.")) return;
    S.items={}; S.daily={key:"",newDone:0,revDone:0,ans:0,ok:0,credit:0,sentDone:0,conjDone:0,consDone:0,noNew:false,buried:{},done:{},missed:{}}; S.hist={}; S.notes={}; S.susp={}; S.pfail={}; S.log=[]; S.streak={cur:0,best:0,last:""}; S.life={ans:0,ok:0};
    markAll(); save(); render(); renderBrowse(); toast("Deck reset");
  });
}

/* ---------- home screen badge ---------- */
function updateBadge(n){
  if(!("setAppBadge" in navigator)) return;
  try{
    if(S.settings.badge!==false && n>0) navigator.setAppBadge(n);
    else if(navigator.clearAppBadge) navigator.clearAppBadge();
  }catch(e){}
}
function enableBadge(){
  if(!("setAppBadge" in navigator)){ toast("This device does not support icon badges"); return; }
  if(window.Notification && Notification.permission==="default"){
    try{ Notification.requestPermission().then(function(){ render(); }); }catch(e){}
  }
}

function renderSchedNote(){
  var el=document.getElementById("schedNote"); if(!el) return;
  var fsrs=S.settings.sched!=="sm2", r=S.settings.retention||0.9;
  var n=Array.isArray(S.log)?S.log.length:0;
  el.textContent = fsrs
    ? "FSRS-6 tracks two numbers per card, difficulty and stability, and schedules the next review for the day your chance of recall falls to "+Math.round(r*100)+" percent. Running on the published default parameters, which were fitted to 727 million reviews. "+n+" of your own answers logged so far."
    : "SM-2 multiplies each interval by a single ease factor. Simpler, and the algorithm you started on. Target retention does not apply to it.";
  var ret=document.getElementById("retRow");
  if(ret) ret.style.opacity = fsrs ? "1" : "0.45";
}
/* ---------- storage report ---------- */
function daysBetween(a,b){
  var pa=a.split("-"), pb=b.split("-");
  return Math.round((Date.UTC(+pb[0],+pb[1]-1,+pb[2])-Date.UTC(+pa[0],+pa[1]-1,+pa[2]))/86400000);
}
function backupLabel(){
  if(!S.backup||!S.backup.last) return "never";
  var d=daysBetween(S.backup.last,dayKey(Date.now()));
  return d<=0?"today":(d===1?"yesterday":d+" days ago");
}
function backupStale(){
  if(!S.backup||!S.backup.last) return S.life.ans>200;
  return daysBetween(S.backup.last,dayKey(Date.now()))>30;
}
function storageReport(){
  var el=document.getElementById("stMode"); if(!el) return;
  var standalone=(window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches)||navigator.standalone===true;
  el.textContent = standalone?"installed app":"browser tab";
  var p=document.getElementById("stPersist"), note=document.getElementById("stNote");
  if(navigator.storage&&navigator.storage.persisted){
    navigator.storage.persisted().then(function(ok){
      p.textContent = ok?"persistent":"best effort";
      p.style.color = ok?"var(--matcha)":"var(--ohdo)";
      note.textContent = ok
        ? "iOS has marked this app's data persistent, which excludes it from the automatic clearing that hits ordinary websites after seven days untouched."
        : (standalone
          ? "Not persistent yet. iOS grants this once it has seen the installed app used a few times. Answer some cards and check back."
          : "Not persistent. Open the app from its Home Screen icon rather than a Safari tab, and iOS will grant it.");
    },function(){ p.textContent="unknown"; });
  } else { p.textContent="unsupported"; note.textContent="This browser does not report its storage mode."; }
  if(navigator.storage&&navigator.storage.estimate){
    navigator.storage.estimate().then(function(e){
      var kb=Math.round((e.usage||0)/1024);
      document.getElementById("stUsage").textContent = kb<1024 ? kb+" KB" : (kb/1024).toFixed(1)+" MB";
    },function(){});
  }
  document.getElementById("stBackup").textContent=backupLabel();
}

/* ---------- shell ---------- */
function go(name){
  if(SHEET) closeSheet();
  ["home","review","browse","stats","set","car","check"].forEach(function(n){
    document.getElementById("s-"+n).classList.toggle("on",n===name);
  });
  Array.prototype.forEach.call(document.querySelectorAll(".tab"),function(t){
    t.classList.toggle("on",t.dataset.go===name);
  });
  window.scrollTo(0,0);
  if(name==="browse") renderBrowse();
  if(name==="stats") renderCheckPanel();
  if(name==="home"||name==="stats") render();
  if(name==="set"){ applySettings(); storageReport(); }
}
var toastTimer=null;
function toast(msg){
  var t=document.getElementById("toast"); t.textContent=msg; t.classList.add("on");
  if(toastTimer) clearTimeout(toastTimer);
  toastTimer=setTimeout(function(){t.classList.remove("on");},2600);
}
function bind(){
  Array.prototype.forEach.call(document.querySelectorAll(".tab"),function(t){
    t.addEventListener("click",function(){ if(Sess.on) return; go(t.dataset.go); });
  });
  document.getElementById("startBtn").addEventListener("click",function(){ startSession(this.dataset.mode||"today"); });
  document.getElementById("aheadBtn").addEventListener("click",function(){ startSession("ahead"); });
  document.getElementById("focusBtn").addEventListener("click",function(){ startFocus(); });
  document.getElementById("noNewSw").addEventListener("click",function(){
    rollDay();
    S.daily.noNew=!S.daily.noNew;
    this.setAttribute("aria-checked",String(S.daily.noNew));
    save(); render();
  });
  document.getElementById("undoBtn").addEventListener("click",undoLast);
  document.getElementById("quitBtn").addEventListener("click",function(){
    if(Sess.practice){ endPractice(); return; } endSession(Sess.done?Sess.done+" answered this session":""); });
  document.getElementById("q").addEventListener("input",renderBrowse);
  document.getElementById("filt").addEventListener("change",renderBrowse);
  document.getElementById("faceFront").addEventListener("click",function(e){
    if(e.target.closest("[data-speak]")||e.target.closest("input")||e.target.closest(".lk")) return;
    if(Sess.on&&!Sess.shown) reveal();
  });
  document.addEventListener("keydown",function(e){
    if(!Sess.on) return;
    // never steal a keystroke from the romaji field
    var tg=e.target, tn=tg&&tg.tagName;
    if(tn==="INPUT"||tn==="TEXTAREA"||tn==="SELECT"||(tg&&tg.isContentEditable)) return;
    if(e.key===" "||e.key==="Enter"){ if(!Sess.shown){e.preventDefault();reveal();} }
    else if(Sess.shown && Sess.practice && (e.key==="1"||e.key==="2")){ practiceAnswer(e.key==="2"); }
    else if(Sess.shown && !Sess.practice && e.key>="1" && e.key<="4"){ answer(+e.key-1); }
    else if(e.key==="z" && Sess.undo){ undoLast(); }
  });
  document.addEventListener("visibilitychange",function(){
    if(document.visibilityState==="hidden"){ saveLocal(); if(Remote.timer){clearTimeout(Remote.timer);remoteFlush();} }
  });
  ["pagehide","beforeunload"].forEach(function(ev){
    window.addEventListener(ev,function(){ saveLocal(); if(Remote.timer){clearTimeout(Remote.timer);remoteFlush();} });
  });
  setInterval(function(){ if(!Sess.on) render(); },60000);
}

loadLocal(); rollDay(); applySettings(); bind(); bindSettings(); bindCar(); render(); renderBrowse(); setSync("local"); storageReport(); ttsProbe(); initStorage();
/* Warm the manifest at boot so the first card does not pay for the round trip.
   It is one small network-first JSON, and audPlay no longer depends on anyone
   having done this, so a failure here costs nothing. */
if(audOn()) audManifest().catch(function(){});
if("serviceWorker" in navigator){
  // a read-only handle for the local test harness; never attached in production
  if(location.hostname==="localhost"||location.hostname==="127.0.0.1"){
    window.__kl={S:S, DECK:DECK, SENT:SENT, CONJ:CONJ, FORMS:FORMS, IDX:IDX, TTS:TTS,
      pools:pools, counts:counts, cardOf:cardOf, isConj:isConj, isSent:isSent, ivLabel:ivLabel, scoreParts:scoreParts, romajiMatches:romajiMatches, moraKey:moraKey, answerKeys:answerKeys, render:render, renderCard:renderCard, renderFocusCard:renderFocusCard, weakness:weakness, answerLog:answerLog, cleanRun:cleanRun, sentOpen:sentOpen, sentMissing:sentMissing, sentQueueOrder:sentQueueOrder, SENT_RANK:SENT_RANK, SENT_AT:SENT_AT, sentenceWith:sentenceWith, listenOn:listenOn, listenBlocked:listenBlocked, consAllowance:consAllowance, newAllowance:newAllowance, strengthOf:strengthOf, packAll:packAll, validateBlob:validateBlob, answer:answer, pct:pct, weakWords:weakWords, focusQueue:focusQueue, startFocus:startFocus, makeQuestion:makeQuestion,
      CAR:CAR, carWords:carWords, carStart:carStart, carBegin:carBegin, carPick:carPick,
      carAdvance:carAdvance, carSkip:carSkip, carRepeat:carRepeat, carPause:carPause,
      carResume:carResume, carFinish:carFinish, carMinutes:carMinutes, carDirection:carDirection,
      carGapMs:carGapMs, exampleFor:exampleFor, EXAMPLE:EXAMPLE, speakCard:speakCard, ttsReady:ttsReady, sayTextOf:sayTextOf, sayHtml:sayHtml, SIDX:SIDX, carSentence:carSentence, carConjPick:carConjPick, carReady:carReady,
      carHeardRecently:carHeardRecently, carPrune:carPrune, carLeave:carLeave,
      enVoice:enVoice, enRanked:enRanked, enScore:enScore, jaVoice:jaVoice, jaRanked:jaRanked, jaScore:jaScore, jaTop:jaTop, jaLabel:jaLabel, jaLabels:jaLabels, jaSampleText:jaSampleText, jaUsable:jaUsable, ttsUsable:ttsUsable, speakAt:speakAt, speechReport:speechReport, SPEECH_LOG:SPEECH_LOG, jaQuality:jaQuality, vId:vId, moraCount:moraCount,
      AUD:AUD, audPlay:audPlay, audHas:audHas, audLoad:audLoad, audSpriteFor:audSpriteFor,
      audManifest:audManifest, audManifestReady:audManifestReady, audPreload:audPreload, audOn:audOn, audBytesCached:audBytesCached,
      audSpritesFor:audSpritesFor, audAllSprites:audAllSprites, audPrune:audPrune, formSet:formSet, carSay:carSay, carBegin2:carBegin2,
      trueRetention:trueRetention, typedAccuracy:typedAccuracy, dirAccuracy:dirAccuracy,
      worstDirection:worstDirection, tripDays:tripDays, inTaper:inTaper, INTRO:INTRO,
      soundIsAmbiguous:soundIsAmbiguous, speakCard:speakCard, missHtml:missHtml, sayGen:function(){return SAY_GEN;}, clipFor:clipFor,
      carOpenEnded:carOpenEnded, practiceQueue:practiceQueue, startPractice:startPractice,
      CHK:CHK, checkBuild:checkBuild, startCheck:startCheck, checkPool:checkPool,
      reservedFor:reservedFor, checkDue:checkDue, endCheck:endCheck,
      pickNext:pickNext, startSession:startSession, dayEnd:dayEnd, rollDay:rollDay,
      carClock:function(n){ CAR_CLK=(typeof n==='number'&&n>0)?n:1; return CAR_CLK; }, carEl:carEl,
      sess:function(){return Sess;}};
  }
  window.addEventListener("load",function(){
    var hadController = !!navigator.serviceWorker.controller, reloaded=false;
    navigator.serviceWorker.register("sw.js").catch(function(){});
    navigator.serviceWorker.addEventListener("controllerchange",function(){
      // a newer build just took over: save, then pick it up straight away
      if(reloaded || !hadController) return;
      reloaded=true; saveLocal(); location.reload();
    });
  });
}
})();
