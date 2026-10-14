/* ---------- Kana recording studio (14 Oct 2026) ----------
   For the native speaker who records the course's single kana sounds. Opened
   from Settings, or by adding ?record to the app's address on any phone or
   laptop. Each sound is shown in both scripts with its romaji, recorded with
   speech recognition off, played back, and kept or redone. Takes are kept in
   this browser (IndexedDB) so the session can stop and resume, and the whole
   set is exported as one file to send back. tools/kana_audio_import.py turns
   that file into the course's audio, after the same checks the synthetic
   voice failed. */
var KREC_DB="kl-krec", KREC={i:0, ids:[], gen:0, take:null, have:{}};
var KREC_DBP=null;
function krecDb(){
  if(KREC_DBP) return KREC_DBP;
  KREC_DBP=new Promise(function(res){
    try{
      var rq=indexedDB.open(KREC_DB, 1);
      rq.onupgradeneeded=function(){ var db=rq.result; if(!db.objectStoreNames.contains("takes")) db.createObjectStore("takes", {keyPath:"id"}); };
      rq.onsuccess=function(){ res(rq.result); };
      rq.onerror=function(){ KREC_DBP=null; res(null); };
    }catch(e){ KREC_DBP=null; res(null); }
  });
  return KREC_DBP;
}
function krecPut(rec){ return krecDb().then(function(db){ if(!db) return false; return new Promise(function(res){ try{ var tx=db.transaction("takes","readwrite"); tx.objectStore("takes").put(rec); tx.oncomplete=function(){ res(true); }; tx.onerror=function(){ res(false); }; }catch(e){ res(false); } }); }); }
function krecAll(){ return krecDb().then(function(db){ if(!db) return []; return new Promise(function(res){ try{ var out=[], cur=db.transaction("takes","readonly").objectStore("takes").openCursor(); cur.onsuccess=function(){ var c=cur.result; if(c){ out.push(c.value); c.continue(); } else res(out); }; cur.onerror=function(){ res(out); }; }catch(e){ res([]); } }); }); }
/* one entry per distinct sound: ji and its rare spelling are one recording */
function krecIds(){
  var seen={}, out=[];
  for(var sid in KC.sounds){ var say=KC.sounds[sid].say; if(!seen[say] && KC.sounds[say]){ seen[say]=1; out.push(say); } }
  return out;
}
function krecOpen(){
  if(!KC || !vlRecOk()){ toast(!KC ? "The kana course did not load." : "This browser cannot record. Try Safari or Chrome."); return; }
  try{ spStop(); }catch(e){} try{ listenCancel(); }catch(e){} audStop();
  try{ if(navigator.storage && navigator.storage.persist) navigator.storage.persist(); }catch(e){}
  KREC.ids=krecIds(); KREC.gen++;
  document.getElementById("tabs").classList.add("hide");
  go("krec");
  krecAll().then(function(rows){
    KREC.have={}; rows.forEach(function(r){ KREC.have[r.id]=r; });
    krecPrepare();
    var first=KREC.ids.findIndex(function(id){ return !KREC.have[id]; });
    KREC.i = first<0 ? 0 : first;
    krecShow();
  });
}
function krecShow(){
  var id=KREC.ids[KREC.i], x=KC.sounds[id]; KREC.take=null; KREC.gen++;
  var n=Object.keys(KREC.have).length;
  document.getElementById("krProg").textContent=n+" / "+KREC.ids.length+" recorded";
  document.getElementById("krCard").innerHTML=
    '<div class="krno">'+(KREC.i+1)+' of '+KREC.ids.length+'</div>'+
    '<div class="krk">'+esc(x.k)+(x.h ? '<span>'+esc(x.h)+'</span>' : '')+'</div>'+
    '<div class="romaji">'+esc(x.r)+'</div>'+
    (x.note ? '<p class="fine">'+esc(x.note)+'</p>' : '');
  document.getElementById("krState").textContent = KREC.have[id] ? "Recorded. Play it, or record again." : "Tap Record, wait for the tone, then say the sound once.";
  document.getElementById("krPlay").disabled=!KREC.have[id];
  document.getElementById("krKeep").hidden=true;
  krecGrid();
}
function krecGrid(){
  var g=document.getElementById("krGrid");
  g.innerHTML=KREC.ids.map(function(id, i){ return '<button class="krg'+(KREC.have[id] ? " ok" : "")+(i===KREC.i ? " on" : "")+'" data-i="'+i+'">'+esc(KC.sounds[id].r)+'</button>'; }).join("");
  Array.prototype.forEach.call(g.querySelectorAll(".krg"), function(b){ b.onclick=function(){ vlCancel(); KREC.i=+b.dataset.i; krecShow(); }; });
}
function krecRecord(){
  var id=KREC.ids[KREC.i], st=document.getElementById("krState");
  vlCancel(); var vg=VL.gen, g=KREC.gen;
  st.textContent="Opening the microphone";
  document.getElementById("krRec").disabled=true;
  // a reference recording: no echo cancelling, no automatic gain, no noise
  // suppression, so the take is the voice as it was
  vlRecord(2200, vg, function(){ if(g===KREC.gen){ st.textContent="Now: say it once"; spCue("turn"); } },
    {echoCancellation:false, noiseSuppression:false, autoGainControl:false}).then(function(r){
    document.getElementById("krRec").disabled=false;
    if(g!==KREC.gen) return;
    if(!r || !r.blob){ st.textContent="Nothing recorded. Check the microphone permission, then try again."; return; }
    var an=vlAnalyse(r.buf);
    KREC.take={id:id, blob:r.blob, mime:r.blob.type||"audio/mp4", at:Date.now(), dur:an ? an.dur : null, peak:an ? an.max : null};
    var warn = an && an.max<0.05 ? " It was very quiet: move closer." : (an && an.max>0.98 ? " It clipped: move a little further away." : "");
    st.textContent="Listen back. Keep it, or record again."+warn;
    document.getElementById("krKeep").hidden=false;
    vlPlayTake(r);
  });
}
function krecKeep(){
  var t=KREC.take; if(!t) return;
  krecPut(t).then(function(ok){
    if(!ok){ toast("Could not save in this browser."); return; }
    KREC.have[t.id]=t; KREC.take=null; krecPrepare();
    var nx=KREC.ids.findIndex(function(id, i){ return i>KREC.i && !KREC.have[id]; });
    if(nx<0) nx=KREC.ids.findIndex(function(id){ return !KREC.have[id]; });
    if(nx<0){ toast("Every sound is recorded. Export the file."); krecShow(); return; }
    KREC.i=nx; krecShow();
  });
}
function krecPlay(){ var r=KREC.have[KREC.ids[KREC.i]]; if(r) vlPlayBlob(r.blob); }
function krecB64(blob){ return new Promise(function(res){ var fr=new FileReader(); fr.onload=function(){ res(String(fr.result).split(",")[1]||""); }; fr.onerror=function(){ res(""); }; fr.readAsDataURL(blob); }); }
/* The export file is built ahead, after every kept take, so the tap on Export
   can hand it to the share sheet at once: iPhone Safari refuses a share that
   starts after slow work, and a home-screen app cannot rely on a download. */
var KREC_FILE=null, KREC_PREP=0;
function krecPrepare(){
  var gen=++KREC_PREP;
  return krecAll().then(function(rows){
    return Promise.all(rows.map(function(r){ return krecB64(r.blob).then(function(b){ return [r.id, {mime:r.mime, at:r.at, b64:b}]; }); })).then(function(pairs){
      if(gen!==KREC_PREP) return;
      var items={}; pairs.forEach(function(p){ if(p[1].b64) items[p[0]]=p[1]; });
      var who=((document.getElementById("krName")||{}).value||"").trim();
      var body=JSON.stringify({v:1, kind:"kana-ladder-recordings", at:Date.now(), speaker:who, ua:navigator.userAgent, n:Object.keys(items).length, of:KREC.ids.length, items:items});
      var name="kana-recordings-"+dayKey(Date.now())+".json", file=null;
      try{ file=new File([body], name, {type:"application/json"}); }catch(e){}
      KREC_FILE={body:body, name:name, file:file, n:Object.keys(items).length};
    });
  });
}
function krecExport(){
  var f=KREC_FILE;
  if(!f || !f.n){ toast("Nothing recorded yet."); return; }
  if(f.file && navigator.canShare && navigator.canShare({files:[f.file]})){
    navigator.share({files:[f.file], title:"Kana recordings"}).catch(function(e){
      // closing the share sheet is a choice, not a failure
      if(!(e && e.name==="AbortError")) krecDownload(f.body, f.name);
    });
    return;
  }
  krecDownload(f.body, f.name);
}
function krecDownload(body, name){
  var u=URL.createObjectURL(new Blob([body], {type:"application/json"})), a=document.createElement("a");
  a.href=u; a.download=name; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(u); a.remove(); }, 2000);
}
function krecLeave(){ KREC.gen++; vlCancel(); document.getElementById("tabs").classList.remove("hide"); go("set"); }
function bindKanaRec(){
  var on=function(id, f){ var el=document.getElementById(id); if(el) el.addEventListener("click", f); };
  on("krecBtn", krecOpen); on("krBack", krecLeave);
  var nm=document.getElementById("krName"); if(nm) nm.addEventListener("change", krecPrepare); on("krRec", krecRecord); on("krKeep", krecKeep); on("krPlay", krecPlay); on("krExport", krecExport);
  on("krPrev", function(){ vlCancel(); KREC.i=Math.max(0, KREC.i-1); krecShow(); });
  on("krNext", function(){ vlCancel(); KREC.i=Math.min(KREC.ids.length-1, KREC.i+1); krecShow(); });
  try{ if(/[?&]record\b/.test(location.search)) setTimeout(krecOpen, 300); }catch(e){}
}
