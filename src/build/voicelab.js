/* ---------- Voice lab (10 Oct 2026) ----------
   Four things the speaking review asked for, in one module spliced after
   speaking.js so it can use that module's grading and the audio library:
     * pitch marks: each sound of a Japanese answer drawn high or low, from
       the Tokyo dictionary accent (deck/pitch.json, OpenJTalk);
     * compare my voice: after a word, the native clip, then his own take
       recorded and played back, both drawn on one time scale with their
       loudness and pitch, so a long vowel he cut short or a pitch that went
       the wrong way can be seen as well as heard;
     * length pairs: twenty pairs of deck words told apart only by a long
       sound (ojisan, uncle, and ojiisan, grandfather): hear one, pick it,
       then say it;
     * the weekly voice check: the same eight survival phrases recorded once
       a week and kept on the phone, so he can hear himself improve.
   Recording uses its own microphone capture with speech recognition stopped:
   on iPhone a recording made while the recogniser runs goes silent. */
var PITCH=(function(){ var el=document.getElementById("pitch-data"); try{ return el ? JSON.parse(el.textContent) : {}; }catch(e){ return {}; } })();
var LENPAIRS=(function(){ var el=document.getElementById("lenpairs-data"); try{ return el ? JSON.parse(el.textContent) : []; }catch(e){ return []; } })();

/* ---- sounds and their pitch ---- */
/* the sounds of a word as Japanese counts them: a small tsu, n and a long
   vowel mark are a sound each; a small ya, yu or yo joins the one before */
function vlMorae(kana){
  var h=toHira(kana||""), out=[];
  for(var i=0;i<h.length;i++){
    var ch=h[i];
    if(/[ゃゅょぁぃぅぇぉゎ]/.test(ch) && out.length){ out[out.length-1]+=ch; continue; }
    if(/[ぁ-ゖー]/.test(ch)) out.push(ch);
  }
  return out;
}
/* romaji for each sound, taken from the card's own romaji so the marks sit
   over the letters he reads: wa for the particle は, cc in kicchin, che in
   chekkuin. ro[i] is the sound's letters, gap[i] is true where a word space
   comes before it. If the card's romaji cannot be lined up, each sound is
   spelled on its own. */
function vlMoraRomaji(morae, romaji){
  var al = romaji ? vlAlign(morae, romaji) : null;
  if(al) return al;
  var out=[], gap=[];
  for(var i=0;i<morae.length;i++){
    var m=morae[i], r;
    if(m==="っ"){ var nx=morae[i+1] ? kanaToRomaji(morae[i+1]) : ""; r = nx ? (nx.slice(0,2)==="ch" ? "c" : nx[0]) : ""; }
    else if(m==="ー"){ var pv=out.length ? out[out.length-1] : ""; var v=pv.match(/[aeiou]$/); r = v ? v[0] : ""; }
    else r=kanaToRomaji(m);
    out.push(r); gap.push(false);
  }
  return {ro:out, gap:gap};
}
function vlAlign(morae, romaji){
  var t=String(romaji).toLowerCase().replace(/[^a-z ]/g,"").replace(/\s+/g," ").trim();
  var p=0, ro=[], gap=[];
  for(var i=0;i<morae.length;i++){
    var sp=false; while(t[p]===" "){ p++; sp=true; }
    var rest=t.slice(p), m=morae[i], mt;
    if(m==="っ") mt=rest.match(/^[bcdfghjkmprstvwz]/);
    else if(m==="ん") mt=rest.match(/^[nm](?![aeiouy])|^n(?=[aeiouy])/);
    else mt=rest.match(/^[^aeiou ]*[aeiou]/);
    if(!mt) return null;
    ro.push(mt[0]); gap.push(sp && i>0); p+=mt[0].length;
  }
  return t.slice(p).trim()==="" ? {ro:ro, gap:gap} : null;
}
function vlPitchHtml(c){
  var raw=c && PITCH[c.id]; if(!raw) return "";
  var parts=raw.split("|"), pt=parts[0], par=parts[1]||"";
  var mo=vlMorae(c.kana); if(mo.length!==pt.length) return "";
  var al=vlMoraRomaji(mo, c.romaji), ro=al.ro, html="", desc=[];
  for(var i=0;i<pt.length;i++){
    var hi=pt[i]==="H", step = i>0 && pt[i]!==pt[i-1] && !al.gap[i];
    if(al.gap[i]) html+='<span class="pgap"></span>';
    html+='<span class="pm '+(hi?"hi":"lo")+(step?" st":"")+'">'+esc(ro[i]||"")+'</span>';
    desc.push((ro[i]||"")+" "+(hi?"high":"low"));
  }
  /* a particle after a noun: high after a flat word, low after one that
     falls on its last sound, which is all that tells hashi (bridge) from
     hashi (edge) */
  if(par){
    var ph=par==="H";
    html+='<span class="pm pt '+(ph?"hi":"lo")+(ph!==(pt[pt.length-1]==="H")?" st":"")+'">ga</span>';
    desc.push("then ga "+(ph?"high":"low"));
  }
  return '<span class="pitch" role="img" aria-label="pitch: '+esc(desc.join(", "))+'">'+html+'</span>';
}
/* the line shown under a Japanese answer in Speaking */
function vlPitchLine(c){
  var p=vlPitchHtml(c);
  return p ? '<div class="sppitch"><span class="lbl">pitch</span>'+p+'</div>' : "";
}

/* ---- audio helpers ---- */
function vlRecOk(){ return !!(window.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }
function vlDecode(bytes){
  return new Promise(function(res){
    var ctx=null; try{ ctx=audCtx(); }catch(e){}
    if(!ctx || !bytes){ res(null); return; }
    try{
      var copy=bytes.slice ? bytes.slice(0) : bytes;
      var p=ctx.decodeAudioData(copy, function(b){ res(b); }, function(){ res(null); });
      if(p && p.catch) p.catch(function(){ res(null); });
    }catch(e){ res(null); }
  });
}
var VL={src:null, el:null, rec:null, stream:null, gen:0};
function vlPlay(buf){
  return new Promise(function(res){
    var ctx=null; try{ ctx=audCtx(); }catch(e){}
    if(!ctx || !buf){ res(false); return; }
    vlStopPlay();
    try{
      var s=ctx.createBufferSource(); s.buffer=buf; s.connect(ctx.destination);
      s.onended=function(){ if(VL.src===s) VL.src=null; res(true); };
      VL.src=s; s.start();
      setTimeout(function(){ res(true); }, buf.duration*1000+400);
    }catch(e){ res(false); }
  });
}
/* a take the audio context could not decode is still played, through an
   audio element, so he always hears himself */
function vlPlayBlob(blob){
  return new Promise(function(res){
    if(!blob || !window.URL || !URL.createObjectURL){ res(false); return; }
    vlStopPlay();
    try{
      var u=URL.createObjectURL(blob), a=new Audio(u), done=false;
      var end=function(ok){ if(done) return; done=true; try{ URL.revokeObjectURL(u); }catch(e){} if(VL.el===a) VL.el=null; res(ok); };
      a.onended=function(){ end(true); }; a.onerror=function(){ end(false); };
      VL.el=a; var pr=a.play(); if(pr && pr.catch) pr.catch(function(){ end(false); });
      setTimeout(function(){ end(true); }, 7000);
    }catch(e){ res(false); }
  });
}
function vlPlayTake(t){ return t && t.buf ? vlPlay(t.buf) : vlPlayBlob(t && t.blob); }
/* a library clip, never waited on for more than a few seconds */
function vlPlayKey(key, maxMs){ return Promise.race([audPlayWA(key), wait(maxMs||6000)]); }
function vlStopPlay(){
  if(VL.src){ try{ VL.src.onended=null; VL.src.stop(); }catch(e){} VL.src=null; }
  if(VL.el){ try{ VL.el.pause(); }catch(e){} VL.el=null; }
}
/* iPhone: while the microphone is open, sound can drop to the earpiece;
   asking for play-and-record keeps it on the speaker, and "auto" hands the
   session back to the recogniser afterwards (Safari 16.4 and later) */
function vlSession(type){ try{ if(navigator.audioSession) navigator.audioSession.type=type; }catch(e){} }
/* record for ms milliseconds, with recognition already stopped. Each take
   has its own stream; gen is the caller's generation, and a take whose
   caller has moved on (Back, Skip, Again) closes its microphone at once,
   even when permission is granted only after he left. onLive runs once the
   microphone is open, so the "your turn" tone is heard only when it is
   really listening; recording starts just after the tone. */
function vlRecord(ms, gen, onLive){
  return new Promise(function(res){
    if(!vlRecOk()){ res(null); return; }
    var stale=function(){ return gen!=null && gen!==VL.gen; };
    vlSession("play-and-record");
    navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true, noiseSuppression:false, autoGainControl:true}}).then(function(stream){
      var stop=function(){ try{ stream.getTracks().forEach(function(t){ t.stop(); }); }catch(e){} if(VL.stream===stream) VL.stream=null; };
      if(stale()){ stop(); vlSession("auto"); res(null); return; }
      if(VL.stream && VL.stream!==stream){ try{ VL.stream.getTracks().forEach(function(t){ t.stop(); }); }catch(e){} }
      VL.stream=stream;
      var chunks=[], mr;
      try{ mr=new MediaRecorder(stream); }catch(e){ stop(); vlSession("auto"); res(null); return; }
      var settle=function(v){ stop(); vlSession("auto"); if(VL.rec===mr) VL.rec=null; res(v); };
      mr.ondataavailable=function(e){ if(e.data && e.data.size) chunks.push(e.data); };
      mr.onstop=function(){
        if(!chunks.length || stale()){ settle(null); return; }
        var blob=new Blob(chunks, {type: chunks[0].type || mr.mimeType || "audio/mp4"});
        stop(); vlSession("auto"); if(VL.rec===mr) VL.rec=null;
        var ab = blob.arrayBuffer ? blob.arrayBuffer() : new Promise(function(ok, no){ var fr=new FileReader(); fr.onload=function(){ ok(fr.result); }; fr.onerror=no; fr.readAsArrayBuffer(blob); });
        ab.then(function(b){ return vlDecode(b).then(function(buf){ res({blob:blob, buf:buf}); }); })
          .catch(function(){ res({blob:blob, buf:null}); });
      };
      mr.onerror=function(){ settle(null); };
      VL.rec=mr;
      if(onLive) try{ onLive(); }catch(e){}
      setTimeout(function(){
        if(stale() || VL.rec!==mr){ settle(null); return; }
        try{ mr.start(); }catch(e){ settle(null); return; }
        setTimeout(function(){ try{ if(mr.state!=="inactive") mr.stop(); else settle(null); }catch(e){ settle(null); } }, ms);
      }, onLive ? 220 : 0);
    }, function(){ vlSession("auto"); res(null); });
  });
}
function vlCancel(){
  VL.gen++; vlStopPlay();
  if(VL.rec){ var r=VL.rec; VL.rec=null; try{ if(r.state!=="inactive") r.stop(); }catch(e){} }
  if(VL.stream){ try{ VL.stream.getTracks().forEach(function(t){ t.stop(); }); }catch(e){} VL.stream=null; }
  vlSession("auto");
}
/* loudness and pitch every 10 ms, with the silence at both ends trimmed
   against the take's own noise floor, so a soft ending (a whispered -su, the
   fade of a long vowel) is kept and the two takes' lengths compare fairly */
function vlAnalyse(buf){
  if(!buf) return null;
  var x=buf.getChannelData(0), sr=buf.sampleRate, step=Math.max(1, Math.round(sr/8000));
  var y=[]; for(var i=0;i+step<=x.length;i+=step){ var s=0; for(var j=0;j<step;j++) s+=x[i+j]; y.push(s/step); }
  var fs=sr/step, hop=Math.round(fs*0.01), win=Math.round(fs*0.04), env=[], f0=[];
  var minLag=Math.floor(fs/400), maxLag=Math.ceil(fs/70);
  for(var t=0;t+win<y.length;t+=hop){
    var e=0; for(var k=0;k<win;k++) e+=y[t+k]*y[t+k];
    e=Math.sqrt(e/win); env.push(e);
    var best=0, bl=0;
    if(e>0.01){
      for(var lag=minLag;lag<=maxLag && lag<win;lag++){
        var c=0, n1=0, n2=0;
        for(var k2=0;k2+lag<win;k2++){ var a=y[t+k2], b=y[t+k2+lag]; c+=a*b; n1+=a*a; n2+=b*b; }
        var r=c/Math.sqrt(n1*n2+1e-9); if(r>best){ best=r; bl=lag; }
      }
    }
    f0.push(best>0.6 && bl ? fs/bl : 0);
  }
  var mx=0; env.forEach(function(v){ if(v>mx) mx=v; });
  var sorted=env.slice().sort(function(a,b){ return a-b; }), floor=sorted.length ? sorted[Math.floor(sorted.length*0.1)] : 0;
  var th=Math.max(floor*3, mx*0.03), a0=0, a1=env.length-1;
  while(a0<env.length && env[a0]<th) a0++;
  while(a1>a0 && env[a1]<th) a1--;
  a0=Math.max(0, a0-3); a1=Math.min(env.length-1, a1+6);   // a short hangover each side
  env=env.slice(a0, a1+1); f0=f0.slice(a0, a1+1);
  return {env:env, f0:f0, max:mx||1, dur:env.length*0.01};
}
function vlSemis(f0){
  var v=f0.filter(function(x){ return x>0; }).sort(function(a,b){ return a-b; });
  if(!v.length) return f0.map(function(){ return null; });
  var med=v[Math.floor(v.length/2)];
  return f0.map(function(x){ return x>0 ? 12*Math.log(x/med)/Math.LN2 : null; });
}
/* one row: loudness as a filled band, pitch as a line over it */
function vlDraw(cv, an, span, color){
  if(!cv || !cv.getContext) return;
  var dpr=window.devicePixelRatio||1, W=cv.clientWidth||300, H=cv.clientHeight||56;
  cv.width=Math.round(W*dpr); cv.height=Math.round(H*dpr);
  var g=cv.getContext("2d"); g.setTransform(dpr,0,0,dpr,0,0); g.clearRect(0,0,W,H);
  if(!an || !an.env.length) return;
  var css=getComputedStyle(document.documentElement);
  var band=css.getPropertyValue("--rule").trim()||"#555", line=css.getPropertyValue(color).trim()||"#c84";
  var px=W/Math.max(span, an.dur, 0.2)/100;   // pixels per 10 ms frame
  g.fillStyle=band; g.beginPath(); g.moveTo(0,H);
  for(var i=0;i<an.env.length;i++){ var h=Math.min(1, an.env[i]/an.max)*(H*0.9); g.lineTo(i*px, H-h); }
  g.lineTo((an.env.length-1)*px, H); g.closePath(); g.fill();
  var st=vlSemis(an.f0), lo=-8, hi=8;
  g.strokeStyle=line; g.lineWidth=2.5; g.beginPath(); var on=false;
  for(var k=0;k<st.length;k++){
    if(st[k]==null){ on=false; continue; }
    var yy=H/2 - Math.max(lo, Math.min(hi, st[k]))/(hi-lo)*H*0.8;
    if(!on){ g.moveTo(k*px, yy); on=true; } else g.lineTo(k*px, yy);
  }
  g.stroke();
}

/* ---- compare my voice ---- */
function vlCompareOn(){ return S.settings.spCompare===true; }
/* after a word in Speaking that he said in Japanese: the native clip, a
   tone, his take recorded and played back, both drawn. done() moves on;
   it is called on every path (no clip, nothing recorded, no permission),
   so hands-free practice never stalls on this panel. */
function vlCompare(c, done){
  var gen=++VL.gen, box=document.getElementById("spCmp");
  if(!box){ done(); return; }
  try{ contListenStop(); }catch(e){}
  SP._contLang=null;
  box.hidden=false;
  document.getElementById("spCmpPitch").innerHTML=vlPitchHtml(c);
  var st=document.getElementById("spCmpState"), nat=null, mine=null, natA=null, mineA=null, busy=false;
  var finish=function(){ if(gen!==VL.gen) return; clearTimeout(autoT); vlCancel(); box.hidden=true; done(); };
  var redraw=function(){
    var span=Math.max(natA?natA.dur:0, mineA?mineA.dur:0);
    vlDraw(document.getElementById("spCmpNat"), natA, span, "--matcha");
    vlDraw(document.getElementById("spCmpMine"), mineA, span, "--ohdo");
    document.getElementById("spCmpDur").textContent =
      (natA ? "Native "+natA.dur.toFixed(1)+" s" : "Native: no clip") + "  ·  " + (mineA ? "You "+mineA.dur.toFixed(1)+" s" : (mine ? "You: recorded" : "You: nothing recorded"));
  };
  var autoT=null;
  var armAuto=function(ms){ clearTimeout(autoT); autoT=setTimeout(function(){ if(gen===VL.gen) finish(); }, ms||3500); };
  var hold=function(){ clearTimeout(autoT); };
  var take=function(){
    if(gen!==VL.gen || busy) return;
    busy=true; st.textContent="Opening the microphone";
    var ms=Math.min(4000, Math.max(1800, (natA?natA.dur*1000:900)+1300));
    return vlRecord(ms, gen, function(){ if(gen===VL.gen){ st.textContent="Now you: say it"; spCue("turn"); } }).then(function(r){
      busy=false;
      if(gen!==VL.gen) return;
      mine=r; mineA=vlAnalyse(r && r.buf); redraw();
      if(!r){ st.textContent="Nothing recorded. Check the microphone. Moving on."; armAuto(2500); return; }
      st.textContent="Your take";
      return vlPlayTake(r).then(function(){ if(gen!==VL.gen) return; st.textContent="Compare them, then Next. Moving on in a moment."; armAuto(); });
    });
  };
  document.getElementById("spCmpNatBtn").onclick=function(){ hold(); if(nat && !busy) vlPlay(nat); };
  document.getElementById("spCmpMineBtn").onclick=function(){ hold(); if(mine && !busy) vlPlayTake(mine); };
  document.getElementById("spCmpAgain").onclick=function(){ hold(); if(busy) return; vlStopPlay(); take(); };
  document.getElementById("spCmpNext").onclick=function(){ finish(); };
  st.textContent="Native";
  redraw();
  var clip=(typeof audClipBytes==="function" ? audClipBytes("wj:"+c.id) : Promise.resolve(null));
  Promise.race([clip, wait(4000).then(function(){ return null; })]).then(function(b){ return b ? vlDecode(b) : null; }, function(){ return null; })
    .then(function(buf){
      if(gen!==VL.gen) return;
      nat=buf; natA=vlAnalyse(nat); redraw();
      return (nat ? vlPlay(nat) : Promise.resolve()).then(function(){ return wait(250); }).then(take);
    });
}

/* ---- length pairs ---- */
var LP={round:[], i:-1, ok:0, said:0, gen:0, target:null, other:null, picked:false};
function lpStart(){
  var pool=LENPAIRS.filter(function(p){ return IDX[p[0]] && IDX[p[1]]; });
  if(!pool.length){ toast("No length pairs in this deck."); return; }
  LP.round=shuffle(pool.slice()).slice(0, 8).map(function(p){ return Math.random()<0.5 ? [p[0],p[1]] : [p[1],p[0]]; });
  LP.i=-1; LP.ok=0; LP.said=0; LP.saidOk=0;
  spStop(); try{ listenCancel(); }catch(e){} audStop();
  document.getElementById("tabs").classList.add("hide");
  go("pairs");
  document.getElementById("lpDone").hidden=true; document.getElementById("lpStage").hidden=false;
  lpNext();
}
function lpPlay(id){ var c=IDX[id]; audStop(); return vlPlayKey("wj:"+id, 4000).then(function(ok){ if(!ok && c) speakCard(c); }); }
function lpNext(){
  LP.i++; LP.gen++;
  if(LP.i>=LP.round.length){ lpFinish(); return; }
  var pr=LP.round[LP.i], a=IDX[pr[0]], b=IDX[pr[1]];
  LP.target=a; LP.other=b; LP.picked=false;
  // the two choices in a fixed order (shorter first, then by spelling), so
  // where the answer sits gives nothing away
  try{ listenCancel(); }catch(e){}
  var opts=[a,b].sort(function(x,y){ return x.romaji.length-y.romaji.length || (x.romaji<y.romaji ? -1 : x.romaji>y.romaji ? 1 : (x.id<y.id ? -1 : 1)); });
  document.getElementById("lpProg").textContent=(LP.i+1)+" / "+LP.round.length;
  document.getElementById("lpQ").textContent="Which did you hear?";
  document.getElementById("lpOpts").innerHTML=opts.map(function(c){
    return '<button class="btn btn-ghost lpopt" data-id="'+c.id+'"><b>'+esc(c.romaji)+'</b><span>'+esc(c.en)+'</span></button>'; }).join("");
  document.getElementById("lpFb").innerHTML="";
  document.getElementById("lpSay").hidden=true;
  document.getElementById("lpSayBtn").hidden=true;
  lpPlay(a.id);
}
function lpPick(id){
  if(LP.picked) return; LP.picked=true;
  var right = id===LP.target.id; if(right) LP.ok++;
  spCue(right?"good":"miss");
  Array.prototype.forEach.call(document.querySelectorAll(".lpopt"), function(b){
    b.classList.add(b.dataset.id===LP.target.id ? "right" : (b.dataset.id===id ? "wrong" : "dim")); });
  document.getElementById("lpFb").innerHTML=(right?'<span class="scv good">Right</span>':'<span class="scv missed">That was the other one</span>')+
    '<div class="lppair">'+vlPitchHtml(LP.target)+' <span class="fine">and</span> '+vlPitchHtml(LP.other)+'</div>';
  document.getElementById("lpSayWord").textContent=LP.target.romaji+" ("+LP.target.en+")";
  document.getElementById("lpSay").hidden=false;
  document.getElementById("lpSayBtn").hidden=false;
  document.getElementById("lpSayState").textContent="";
}
function lpSayTap(){
  var gen=LP.gen, c=LP.target, st=document.getElementById("lpSayState");
  st.textContent="listening"; st.className="spstate prompt";
  listenOnce(SP_LISTEN_MS, "ja-JP", "lpSayState").then(function(r){
    if(gen!==LP.gen) return;
    st.className="spstate";
    if(!r.alts || !r.alts.length){ st.textContent="Nothing heard. Tap to try again, or Next."; return; }
    var g=spGradeJa(c.kana, r.alts, c), pass=g.sim>=SP_PASS_JA;
    LP.said++; if(pass) LP.saidOk++;
    spCue(pass?"good":"miss");
    var longer = vlMorae(c.kana).length > vlMorae(LP.other.kana).length;
    st.textContent=(pass?"Right: ":"Heard ")+g.romaji+(pass?"":(longer ? ". Hold the long sound." : ". Keep it short."));
  });
}
function lpFinish(){
  document.getElementById("lpStage").hidden=true;
  document.getElementById("lpDone").hidden=false;
  document.getElementById("lpDoneHead").textContent="Heard right: "+LP.ok+" of "+LP.round.length;
  document.getElementById("lpDoneSub").textContent=LP.said ? ("Said right: "+LP.saidOk+" of "+LP.said+".") : "Tap Say it after each pair to practise saying them too.";
}
function lpLeave(){ LP.gen++; try{ listenCancel(); }catch(e){} audStop(); document.getElementById("tabs").classList.remove("hide"); go("home"); render(); }

/* ---- the weekly voice check ---- */
var VC_N=8, VC_DB="kl-voice", VC={i:-1, ids:[], gen:0, week:""};
function vcWeek(d){
  d=d||new Date(); var t=new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  var day=t.getUTCDay()||7; t.setUTCDate(t.getUTCDate()+4-day);
  var y0=new Date(Date.UTC(t.getUTCFullYear(),0,1));
  return t.getUTCFullYear()+"-W"+("0"+Math.ceil(((t-y0)/86400000+1)/7)).slice(-2);
}
/* the same eight phrases every week: the first of the survival pack */
function vcPhrases(){
  var pk=SENT.filter(function(x){ return x.pk; }).sort(function(a,b){ return a.pk-b.pk; });
  return pk.slice(0, VC_N).map(function(x){ return x.id; });
}
var VC_DBP=null;
function vcDb(){
  if(VC_DBP) return VC_DBP;
  VC_DBP=new Promise(function(res){
    try{
      var rq=indexedDB.open(VC_DB, 1);
      rq.onupgradeneeded=function(){ var db=rq.result; if(!db.objectStoreNames.contains("takes")) db.createObjectStore("takes", {keyPath:"k"}); };
      rq.onsuccess=function(){ var db=rq.result; db.onversionchange=function(){ try{ db.close(); }catch(e){} VC_DBP=null; }; res(db); };
      rq.onerror=function(){ VC_DBP=null; res(null); };
    }catch(e){ VC_DBP=null; res(null); }
  });
  return VC_DBP;
}
function vcPut(rec){
  return vcDb().then(function(db){ if(!db) return false; return new Promise(function(res){
    try{ var tx=db.transaction("takes","readwrite"); tx.objectStore("takes").put(rec); tx.oncomplete=function(){ res(true); }; tx.onerror=function(){ res(false); }; }catch(e){ res(false); } }); });
}
function vcAll(){
  return vcDb().then(function(db){ if(!db) return []; return new Promise(function(res){
    try{ var out=[], tx=db.transaction("takes","readonly"), cur=tx.objectStore("takes").openCursor();
      cur.onsuccess=function(){ var c=cur.result; if(c){ out.push(c.value); c.continue(); } else res(out); };
      cur.onerror=function(){ res(out); }; }catch(e){ res([]); } }); });
}
function vcDue(){ var l=S.settings.vcLast||""; return l!==vcWeek(); }
function vcStart(){
  if(!vlRecOk()){ toast("This browser cannot record. Try Safari on the iPhone."); return; }
  VC.ids=vcPhrases(); VC.i=-1; VC.week=vcWeek(); VC.gen++; VC.saved=0;
  // ask the browser to keep these recordings (Safari otherwise may clear a
  // site's storage after a week without a visit)
  try{ if(navigator.storage && navigator.storage.persist) navigator.storage.persist(); }catch(e){}
  LP.gen++; spStop(); try{ listenCancel(); }catch(e){} audStop();
  document.getElementById("tabs").classList.add("hide");
  go("vcheck");
  document.getElementById("vcStage").hidden=false; document.getElementById("vcDone").hidden=true;
  vcNext();
}
function vcNext(){
  VC.i++; var gen=++VC.gen;
  if(VC.i>=VC.ids.length){ vcFinish(); return; }
  var x=SIDX[VC.ids[VC.i]];
  document.getElementById("vcProg").textContent=(VC.i+1)+" / "+VC.ids.length;
  document.getElementById("vcPhrase").innerHTML='<div class="romaji">'+esc(x.romaji)+'</div><div class="fine">'+esc(x.en)+'</div>';
  var st=document.getElementById("vcState");
  st.textContent="Native";
  audStop(); vlCancel(); var vg=VL.gen;
  vlPlayKey("sj:"+x.id, 8000).then(function(){ return wait(250); }).then(function(){
    if(gen!==VC.gen) return;
    st.textContent="Opening the microphone";
    return vlRecord(Math.min(6000, 1800+String(x.kana).length*160), vg, function(){ if(gen===VC.gen){ st.textContent="Now you: say it"; spCue("turn"); } }).then(function(r){
      if(gen!==VC.gen) return;
      if(!r || !r.blob){ st.textContent="Nothing recorded. Check the microphone, or Skip."; return; }
      // every take is kept (the first week stays as the baseline); the list
      // shows the first and the latest
      var at=Date.now();
      return vcPut({k:VC.week+"|"+x.id+"|"+at, week:VC.week, sid:x.id, at:at, blob:r.blob}).then(function(ok){
        if(gen!==VC.gen) return;
        if(!ok){ st.textContent="Could not save on this phone. Skip, or try later."; return; }
        VC.saved++;
        st.textContent="Saved"; setTimeout(function(){ if(gen===VC.gen) vcNext(); }, 500);
      });
    });
  });
}
function vcFinish(){
  // the week counts as done only if something was really saved
  if(VC.saved>0){ S.settings.vcLast=VC.week; save(); }
  document.getElementById("vcStage").hidden=true; document.getElementById("vcDone").hidden=false;
  vcRenderList();
}
/* every phrase: the native clip, his first week and this week, side by side */
function vcRenderList(){
  var host=document.getElementById("vcList");
  vcAll().then(function(rows){
    var by={}; rows.forEach(function(r){ (by[r.sid]=by[r.sid]||[]).push(r); });
    var weeks={}; rows.forEach(function(r){ weeks[r.week]=1; });
    document.getElementById("vcDoneSub").textContent=(VC.i>=0 && !VC.saved ? "Nothing saved this time. " : "")+Object.keys(weeks).length+" week"+(Object.keys(weeks).length===1?"":"s")+" recorded on this phone.";
    var html="";
    vcPhrases().forEach(function(sid){
      var x=SIDX[sid], rs=(by[sid]||[]).sort(function(a,b){ return a.at-b.at; });
      var first=rs[0], last=rs[rs.length-1];
      html+='<div class="vcrow"><div class="vcph"><b>'+esc(x.romaji)+'</b><span class="fine">'+esc(x.en)+'</span></div><div class="vcbtns">'+
        '<button class="btn btn-ghost vcplay" data-k="native" data-sid="'+sid+'">Native</button>'+
        (first ? '<button class="btn btn-ghost vcplay" data-k="'+esc(first.k)+'">'+esc(vcDay(first.at))+'</button>' : '')+
        (last && last!==first ? '<button class="btn btn-ghost vcplay" data-k="'+esc(last.k)+'">'+esc(vcDay(last.at))+'</button>' : '')+
        '</div></div>';
    });
    host.innerHTML=html;
    var map={}; rows.forEach(function(r){ map[r.k]=r; });
    Array.prototype.forEach.call(host.querySelectorAll(".vcplay"), function(b){
      b.onclick=function(){
        if(b.dataset.k==="native"){ audPlayWA("sj:"+b.dataset.sid); return; }
        var r=map[b.dataset.k]; if(!r) return;
        var ab = r.blob.arrayBuffer ? r.blob.arrayBuffer() : Promise.reject();
        ab.then(vlDecode, function(){ return null; }).then(function(buf){ vlPlayTake({buf:buf, blob:r.blob}); });
      };
    });
  });
}
function vcDay(t){ try{ return new Date(t).toLocaleDateString("en-GB",{day:"numeric",month:"short"}); }catch(e){ return ""; } }
function vcLeave(){ VC.gen++; vlCancel(); document.getElementById("tabs").classList.remove("hide"); go("home"); render(); }

function bindVoiceLab(){
  var t=document.getElementById("spCmpToggle");
  var paint=function(){ if(t){ t.setAttribute("aria-pressed", String(vlCompareOn())); t.textContent = vlCompareOn() ? "Compare: on" : "Compare: off"; } };
  if(t){ t.addEventListener("click", function(){ S.settings.spCompare=!vlCompareOn(); save(); paint(); }); paint(); }
  var lb=document.getElementById("lpBtn"); if(lb) lb.addEventListener("click", lpStart);
  var opts=document.getElementById("lpOpts");
  if(opts) opts.addEventListener("click", function(e){ var b=e.target.closest && e.target.closest(".lpopt"); if(b) lpPick(b.dataset.id); });
  var on=function(id, f){ var el=document.getElementById(id); if(el) el.addEventListener("click", f); };
  on("lpReplay", function(){ if(LP.target) lpPlay(LP.target.id); });
  on("lpSayBtn", lpSayTap);
  on("lpNext", lpNext);
  on("lpBack", lpLeave); on("lpDoneBtn", lpLeave); on("lpAgain", lpStart);
  on("vcBtn", vcStart);
  on("vcBack", function(){ vcLeave(); }); on("vcDoneBtn", vcLeave);
  on("vcSkip", function(){ VC.gen++; vlCancel(); vcNext(); });
}
