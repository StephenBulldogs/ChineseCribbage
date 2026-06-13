// Conquest resume: close the tab mid-level, reopen, and verify the level,
// the in-progress deal, and your lives all survive (no life lost).
const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// shared fake RTDB
const store = {};
const getP = (p) => p.split('/').reduce((o,k)=>o==null?undefined:o[k], store);
const setP = (p,v) => { const ks=p.split('/'); let o=store;
  for(let i=0;i<ks.length-1;i++){o[ks[i]]=o[ks[i]]||{};o=o[ks[i]];} o[ks[ks.length-1]]=v===undefined?null:JSON.parse(JSON.stringify(v)); };
const delP = (p) => { const ks=p.split('/'); let o=store; for(let i=0;i<ks.length-1;i++){o=o[ks[i]];if(!o)return;} delete o[ks[ks.length-1]]; };
function fakeFb(client){
  const dbFn=()=>({ ref:(path)=>({
    set:async(v)=>setP(path,v), update:async(o)=>{for(const k in o)setP(path+'/'+k,o[k]);},
    get:async()=>{const v=getP(path);return {exists:()=>v!=null,val:()=>JSON.parse(JSON.stringify(v))};},
    remove:async()=>delP(path), on:()=>{}, off:()=>{},
    onDisconnect:()=>({update:async()=>{},cancel:async()=>{}}),
  })});
  dbFn.ServerValue={TIMESTAMP:'TS'};
  const authFn=()=>({ onAuthStateChanged:(cb)=>{client.authCb=cb;setTimeout(()=>cb(client.user||null),0);},
    signInWithPopup:async()=>{client.user={uid:client.uid,isAnonymous:false,displayName:client.name};client.authCb(client.user);},
    signInAnonymously:async()=>{}, signOut:async()=>{} });
  authFn.GoogleAuthProvider=class{};
  return {initializeApp:()=>{},database:dbFn,auth:authFn};
}
function makeClient(uid,name){
  const client={uid,name};
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,
    beforeParse(w){ w.firebase=fakeFb(client); w.__fastCount=true; w.__lifeMs=600000; }});
  const w=dom.window;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const head=w.document.head; const ap=head.appendChild.bind(head);
  head.appendChild=(el)=>{const r=ap(el);if(el.tagName==='SCRIPT'&&el.src)setTimeout(()=>el.onload&&el.onload(),0);return r;};
  client.window=w; return client;
}
let fails=0; const check=(n,ok)=>{console.log((ok?'PASS':'FAIL')+' '+n);if(!ok)fails++;};
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const waitFor=async(fn,ms)=>{const t=Date.now();while(Date.now()-t<ms){if(fn())return true;await sleep(30);}return fn();};

(async()=>{
  // ---- session 1: sign in, start a solo level, place a few cards, then "close" ----
  const c1=makeClient('u1','Resumer'); const w1=c1.window; const $1=(id)=>w1.document.getElementById(id);
  $1('splash-online').click(); await sleep(40);
  $1('auth-google').click();
  await waitFor(()=>!$1('o-lobby').classList.contains('hidden'),2000);
  const CC1=w1.__cc;
  const livesBefore=CC1.S.campaign.lives;
  check('session1: full hearts to start', livesBefore===5);
  // start level 1 (solo)
  CC1.openMap(); await sleep(30);
  w1.document.querySelector('.map-node[data-level="1"]').click();
  $1('dl-play').click(); await sleep(30);
  check('session1: a solo challenge is running', CC1.S.challenge && CC1.S.challenge.level.id===1);
  // place two cards into hands
  let placed=0;
  for(let k=0;k<2;k++){ const b=w1.document.querySelector('#g-rows .row-btn:not([disabled])'); if(b){b.click();placed++;} }
  await sleep(20);
  const snap=getP('users/u1/active');
  check('session1: in-progress level snapshotted to the account', snap && snap.id===1 && snap.mode==='solo');
  check('session1: snapshot captured the deal seed + your placements', typeof snap.seed==='number' && snap.moves.length===placed);
  const placedCardsBefore = CC1.S.round.rows.flat().length;

  // ---- session 2: brand-new client (tab closed + reopened) ----
  const c2=makeClient('u1','Resumer'); const w2=c2.window; const $2=(id)=>w2.document.getElementById(id);
  $2('splash-online').click(); await sleep(40);
  $2('auth-google').click();
  await waitFor(()=>!$2('o-lobby').classList.contains('hidden'),2000);
  const CC2=w2.__cc;
  check('session2: lives intact, none lost by closing', CC2.S.campaign.lives===livesBefore);
  check('session2: Conquest panel offers Resume', $2('o-conquest').textContent.includes('Resume'));
  $2('go-resume').click(); await sleep(40);
  check('session2: resumed straight into the game', !$2('view-game').classList.contains('hidden') && CC2.S.challenge && CC2.S.challenge.level.id===1);
  check('session2: the exact placements were restored', CC2.S.round.rows.flat().length === placedCardsBefore);
  check('session2: same deal seed (deterministic board)', CC2.S.cqDeal.seed === snap.seed);

  // ---- finish/fail and confirm the snapshot clears ----
  CC2.challengeFail();
  check('after resolve: snapshot cleared from the account', getP('users/u1/active') == null);
  check('after resolve: a life was spent on the actual fail (not the close)', CC2.S.campaign.lives === livesBefore-1);

  console.log(fails===0?'\nRESUME TEST PASSED':`\n${fails} FAILURES`);
  process.exit(fails?1:0);
})().catch(e=>{console.error('CRASH:',e);process.exit(1);});
