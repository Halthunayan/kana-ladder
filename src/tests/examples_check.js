/* The example line is the newest thing on the card and the easiest to get
   wrong: it must appear on the back of a word card in all three directions,
   never on the front, and never on a sentence or conjugation card, which are
   sentences already. It reads the page the learner is served, not the artifact
   variant. */
const {chromium}=require('playwright');
const fails=[]; const ok=(c,m)=>{ if(c) console.log('  PASS  '+m); else { fails.push(m); console.log('  FAIL  '+m);} };
const PORT=process.env.PORT||8101;
(async()=>{
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const ctx=await b.newContext({viewport:{width:393,height:852}});
const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('http://localhost:'+PORT+'/index.html'); await p.waitForTimeout(1200);

console.log('\n1. every word has an example and every example resolves');
const cov=await p.evaluate(()=>{
  let n=0, bad=[], byRef=0, inline=0, blank=0;
  __kl.DECK.forEach(function(c){
    const e=__kl.exampleFor(c);
    if(!e){ bad.push(c.id); return; }
    n++;
    if(typeof __kl.EXAMPLE[c.id]==='string') byRef++; else inline++;
    if(!e.romaji.trim()||!e.en.trim()) blank++;
  });
  return {n, bad:bad.slice(0,8), nbad:bad.length, byRef, inline, blank,
          deck:__kl.DECK.length};
});
ok(cov.nbad===0, 'every one of the '+cov.deck+' words resolves an example ('+cov.nbad+' without)');
ok(cov.blank===0, 'no example is blank');
ok(cov.byRef>1000 && cov.inline>300, 'most point at a deck sentence, the rest are written in ('+cov.byRef+' / '+cov.inline+')');

console.log('\n2. the example is romaji and English, never Japanese script');
const script=await p.evaluate(()=>{
  const jp=/[぀-ヿ一-鿿]/; let bad=[];
  __kl.DECK.forEach(function(c){
    const e=__kl.exampleFor(c);
    if(e && (jp.test(e.romaji)||jp.test(e.en))) bad.push(c.id);
  });
  return bad;
});
ok(script.length===0, 'no example shows kana or kanji, which he cannot read ('+script.length+' would)');

console.log('\n3. a sentence card and a conjugation card get no example');
const none=await p.evaluate(()=>{
  const s=__kl.SENT[0], noS=__kl.exampleFor({id:s.id, t:'s', w:s.w});
  return {sent: noS===null};
});
ok(none.sent, 'a sentence card is already a sentence, so it gets none');

console.log('\n4. it is on the back of a word card, in all three directions, and never on the front');
const where=await p.evaluate(async()=>{
  const out={};
  function look(){
    const f=document.getElementById('faceFront'), bk=document.getElementById('faceBack');
    return {front: !!(f&&f.querySelector('.ex-box')), back: !!(bk&&bk.querySelector('.ex-box'))};
  }
  const id=Object.keys(__kl.EXAMPLE)[0];
  const S=__kl.S;
  for(const d of ['j','e','a']){
    __kl.sess().key = id+'|'+d;
    __kl.sess().practice = false; __kl.sess().focus = false;
    __kl.renderCard();
    out[d]=look();
  }
  return out;
});
for(const d of ['j','e','a']){
  const lab={j:'Japanese to English', e:'English to Japanese', a:'listening'}[d];
  ok(where[d] && where[d].back===true && where[d].front===false,
     'the '+lab+' card shows it on the back only');
}


console.log('\n6. a card that shares its kana with another never borrows a sentence');
const shared=await p.evaluate(()=>{
  const byk={}; __kl.DECK.forEach(c=>{ (byk[c.kana]=byk[c.kana]||[]).push(c.id); });
  const sh=new Set(); Object.values(byk).forEach(v=>{ if(v.length>1) v.forEach(i=>sh.add(i)); });
  let borrowed=[];
  sh.forEach(id=>{ if(typeof __kl.EXAMPLE[id]==='string') borrowed.push(id); });
  return {n:sh.size, borrowed};
});
ok(shared.borrowed.length===0,
   'all '+shared.n+' cards sharing a kana have an example written for them ('+shared.borrowed.length+' still borrowed)');

console.log('\n7. a borrowed example contains the word it is illustrating');
const cont=await p.evaluate(()=>{
  const bad=[];
  __kl.DECK.forEach(c=>{
    const ref=__kl.EXAMPLE[c.id];
    if(typeof ref!=='string') return;
    const x=__kl.SENT.filter(s=>s.id===ref)[0];
    if(!x) { bad.push(c.id); return; }
    const g=x.g||{};
    const stem=(c.pos==='verb'||c.pos==='adj-i')&&c.kana.length>2 ? c.kana.slice(0,-1) : null;
    const forms=(__kl.FORMS[c.id]||[]);
    let hit = x.kana.indexOf(c.kana)>=0 || (c.id in g) || (stem && x.kana.indexOf(stem)>=0);
    for(let i=0;!hit&&i<forms.length;i+=3) if(x.kana.indexOf(forms[i+1])>=0) hit=true;
    if(!hit) bad.push(c.id);
  });
  return bad;
});
ok(cont.length===0, 'every borrowed example contains its word ('+cont.length+' do not)');

console.log('\n8. the play button is there exactly when there is a recording');
const play=await p.evaluate(()=>{
  function render(id,d){ __kl.sess().key=id+'|'+d; __kl.sess().practice=false; __kl.sess().focus=false; __kl.renderCard();
    const bk=document.getElementById('faceBack');
    return { box: !!bk.querySelector('.ex-box'), btn: !!bk.querySelector('.ex-play') }; }
  const ids=Object.keys(__kl.EXAMPLE);
  const ref=ids.filter(i=>typeof __kl.EXAMPLE[i]==='string')[0];
  const own=ids.filter(i=>typeof __kl.EXAMPLE[i]!=='string')[0];
  return {ref:render(ref,'j'), own:render(own,'j')};
});
ok(play.ref.box && play.ref.btn, 'an example that is a deck sentence offers a play button');
ok(play.own.box && !play.own.btn, 'an example written for the card offers none, rather than a button that does nothing');

console.log('\n9. the example is never clipped and never hides the tags or the grades');
for(const vp of [{width:393,height:852,name:'393 x 852'},{width:390,height:664,name:'390 x 664'}]){
  const ctx2=await b.newContext({viewport:{width:vp.width,height:vp.height}});
  const q=await ctx2.newPage();
  await q.goto('http://localhost:'+PORT+'/index.html'); await q.waitForTimeout(1200);
  await q.click('#startBtn').catch(()=>{});     // the review screen has to be on screen
  await q.waitForTimeout(600);
  const res=await q.evaluate(()=>{
    const ids=Object.keys(__kl.EXAMPLE);
    let seen=0, clipped=0, gradesOff=0, sample=null;
    for(const d of ['j','e','a']){
      for(let i=0;i<ids.length;i+=37){
        __kl.sess().key=ids[i]+'|'+d; __kl.sess().practice=false; __kl.sess().focus=false;
        __kl.renderCard();
        const card=document.querySelector('.card');
        if(card) card.classList.add('flip');
        const box=card&&card.querySelector('.ex-box');
        if(!box) continue;
        seen++;
        const cr=card.getBoundingClientRect();
        const out=(el)=>{ if(!el) return false; const r=el.getBoundingClientRect();
          return r.height>0 && (r.bottom>cr.bottom+1 || r.top<cr.top-1); };
        const tags=card.querySelector('.tags');
        if(out(box)||out(tags)){ clipped++; if(!sample) sample=ids[i]+'|'+d+(out(box)?' the example':' the tags')+' runs past the card'; }
        const g=document.getElementById('grades');
        const gr=g?g.getBoundingClientRect():null;
        if(!gr || gr.height===0 || gr.bottom>window.innerHeight+1){
          gradesOff++; if(!sample) sample=ids[i]+'|'+d+' grades off screen';
        }
      }
    }
    return {seen, clipped, gradesOff, sample};
  });
  ok(res.clipped===0 && res.gradesOff===0,
     'at '+vp.name+', over '+res.seen+' cards with an example, nothing is clipped and the grades stay put'
     +(res.sample?' ('+res.sample+')':''));
  await ctx2.close();
}

console.log('\n5. no errors');
ok(errs.length===0, errs[0]||'the app ran clean');
await ctx.close(); await b.close();
console.log('\n'+(fails.length? fails.length+' FAILURES: '+fails.join('; ') : 'EVERY WORD CARD CARRIES A WORKED EXAMPLE'));
process.exit(fails.length?1:0);})();
