/* Verifies a real deployment from the outside, using only what a visitor can
   see: no __kl test hook, which is deliberately absent off localhost. Set BASE
   to the live URL. Complements deploy_check.js, which needs the hook and so
   only runs against a local server. */
const {chromium}=require('playwright');
const fails=[]; const ok=(c,m)=>{ if(c) console.log('  PASS  '+m); else { fails.push(m); console.log('  FAIL  '+m);} };
const BASE=process.env.BASE||'https://halthunayan.github.io/kana-ladder/';
(async()=>{
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const ctx=await b.newContext({viewport:{width:393,height:852}});
const p=await ctx.newPage(); const errs=[]; const bad=[];
p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
p.on('console',m=>{if(m.type()==='error'){const l=m.location()||{};errs.push(m.text()+' @ '+(l.url||'?'));}});
p.on('response',r=>{ if(!r.ok() && r.url().indexOf('halthunayan.github.io')>=0) bad.push(r.status()+' '+r.url()); });

console.log('\n1. the live site loads and is the build we made');
await p.goto(BASE, {waitUntil:'load', timeout:40000});
await p.waitForSelector('#lvlN', {timeout:25000});
await p.waitForTimeout(3000);
const m=await p.evaluate(()=>({
  title:document.title,
  words:JSON.parse(document.getElementById('deck-data').textContent).length,
  sents:JSON.parse(document.getElementById('sent-data').textContent).length,
  hasKl: !!window.__kl,
  home: !!document.getElementById('startBtn'),
  car: !!document.getElementById('carBtn'),
  focus: !!document.getElementById('focusBtn')
}));
ok(/Kana/.test(m.title), 'the page is Kana Ladder ("'+m.title+'")');
ok(m.words===1812 && m.sents===1442, 'the whole deck shipped ('+m.words+' words, '+m.sents+' sentences)');
ok(m.hasKl===false, 'the test hook is correctly absent in production');
ok(m.home && m.car && m.focus, 'the home screen, car mode and Focus buttons are all present');
ok(bad.length===0, bad.length? 'failed requests: '+bad.slice(0,3).join(' ; ') : 'every asset resolved');

console.log('\n2. the pre-rendered voice is reachable from the live path');
const aud=await p.evaluate(async()=>{
  const r=await fetch('audio/v1/manifest.json', {cache:'no-store'});
  if(!r.ok) return {ok:false, why:'manifest '+r.status};
  const man=await r.json();
  const sprite=man.files['w-000'];
  const idx=await fetch('audio/v1/'+sprite+'.json');
  const mp3=await fetch('audio/v1/'+sprite+'.mp3');
  const j=await idx.json();
  return {ok:true, sprites:Object.keys(man.files).length, sprite,
          idxOk:idx.ok, mp3Ok:mp3.ok, clips:Object.keys(j).length,
          bytes:(await mp3.arrayBuffer()).byteLength};
});
ok(aud.ok===true, 'the audio manifest is served ('+(aud.sprites||0)+' sprites)');
ok(aud.idxOk && aud.mp3Ok, 'a sprite and its clip index both download ('+aud.sprite+')');
ok(aud.clips>0 && aud.bytes>100000, aud.clips+' clips in '+Math.round((aud.bytes||0)/1024)+' KB');

console.log('\n3. the service worker installs and the app works offline');
await p.waitForFunction(()=>!!navigator.serviceWorker.controller, null, {timeout:30000}).catch(()=>{});
ok(await p.evaluate(()=>!!navigator.serviceWorker.controller), 'the service worker took control');
const swv=await p.evaluate(async()=>{
  const c=await caches.keys(); return c;
});
/* The cache name is no longer typed by hand. CI derives it from the page it
   is shipping, so the check is not "is it v44" but "does the name match the
   page actually being served" - which is the property that matters, and the
   one a forgotten bump used to break. */
const crypto=require('crypto');
const pageBytes=await (await fetch(BASE+'index.html')).arrayBuffer();
const want='kana-ladder-'+crypto.createHash('sha1').update(Buffer.from(pageBytes)).digest('hex').slice(0,8);
ok(swv.indexOf(want)>=0, 'the cache name is derived from the page being served ('+want+' in ['+swv.join(', ')+'])');
await ctx.setOffline(true);
await p.reload({waitUntil:'load'}).catch(()=>{});
await p.waitForTimeout(3000);
const off=await p.evaluate(()=>({t:document.title,
  words:(document.getElementById('deck-data')?JSON.parse(document.getElementById('deck-data').textContent).length:0)}));
ok(/Kana/.test(off.t) && off.words===1812, 'it reopens offline with the whole deck');
await ctx.setOffline(false);

console.log('\n4. no errors');
ok(errs.length===0, errs.length? errs.slice(0,2).join(' | ') : 'clean');
await b.close();
console.log('\n'+(fails.length? fails.length+' FAILURES: '+fails.join('; ') : 'LIVE SITE VERIFIED'));
process.exit(fails.length?1:0);})();
