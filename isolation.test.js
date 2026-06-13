// Per-account Conquest isolation: two accounts in ONE browser session must
// not share unlocks. Account A clears levels; account B (signing in after
// A signs out) must start fresh.
const { JSDOM } = require('jsdom');
const html = require('fs').readFileSync('index.html','utf8');

const store={};
const getP=(p)=>p.split('/').reduce((o,k)=>o==null?undefined:o[k],store);
const setP=(p,v)=>{const ks=p.split('/');let o=store;for(let i=0;i<ks.length-1;i++){o[ks[i]]=o[ks[i]]||{};o=o[ks[i]];}o[ks[ks.length-1]]=v===undefined?null:JSON.parse(JSON.stringify(v));};
const delP=(p)=>{const ks=p.split('/');let o=store;for(let i=0;i<ks.length-1;i++){o=o[ks[i]];if(!o)return;}delete o[ks[ks.length-1]];};
function fb(client){
  const dbFn=()=>({ref:(path)=>({
    set:async(v)=>setP(path,v),update:async(o)=>{for(const k in o)setP(path+'/'+k,o[k]);},
    get:async()=>{const v=getP(path);return{exists:()=>v!=null,val:()=>JSON.parse(JSON.stringify(v))};},
    remove:async()=>delP(path),on:()=>{},off:()=>{},
    onDisconnect:()=>({update:async()=>{},cancel:async()=>{}}),
  })});
  dbFn.ServerValue={TIMESTAMP:'TS'};
  const authFn=()=>({onAuthStateChanged:(cb)=>{client.authCb=cb;setTimeout(()=>cb(client.user||null),0);},
    signInWithPopup:async()=>{client.user={uid:client.pendingUid,isAnonymous:false,displayName:client.pendingName};client.authCb(client.user);},
    signInAnonymously:async()=>{client.user={uid:client.pendingUid,isAnonymous:true,displayName:null};client.authCb(client.user);},
    signOut:async()=>{client.user=null;client.authCb(null);}});
  authFn.GoogleAuthProvider=class{};
  return {initializeApp:()=>{},database:dbFn,auth:authFn};
}
let fails=0; const check=(n,ok)=>{console.log((ok?'PASS':'FAIL')+' '+n);if(!ok)fails++;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const waitFor=async(fn,ms)=>{const t=Date.now();while(Date.now()-t<ms){if(fn())return true;await sleep(25);}return fn();};

(async()=>{
  const client={};
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,
    beforeParse(w){ w.firebase=fb(client); w.__fastCount=true; w.__lifeMs=600000; }});
  const w=dom.window; const $=(id)=>w.document.getElementById(id);
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const head=w.document.head, ap=head.appendChild.bind(head);
  head.appendChild=(el)=>{const r=ap(el);if(el.tagName==='SCRIPT'&&el.src)setTimeout(()=>el.onload&&el.onload(),0);return r;};
  const CC=()=>w.__cc;
  const signInGoogle=async(uid,name)=>{ client.pendingUid=uid; client.pendingName=name;
    $('splash-online').click(); await sleep(40);
    if($('auth-google')) $('auth-google').click();
    await waitFor(()=>!$('o-lobby').classList.contains('hidden'),2000); };

  // ---- Account A: clear several levels ----
  await signInGoogle('uidA','Alice');
  check('A starts at level 1', CC().S.campaign.level===1 && CC().S.uid==='uidA');
  CC().openMap(); await sleep(20);
  // win level 1, 2, 3 via the hook
  for(let i=1;i<=3;i++){ w.document.querySelector(`.map-node[data-level="${i}"]`).click(); $('dl-play').click(); CC().challengeWin(3); await sleep(20); if($('dcr-map')) $('dcr-map').click(); await sleep(10); }
  check('A unlocked up to level 4', CC().S.campaign.level===4);
  check('A progress saved under its own uid', (getP('users/uidA/campaign')||{}).level===4);
  // sign out
  $('btn-settings') && null;
  CC().S; // noop
  // use the account bar sign-out
  await sleep(10);
  w.__cc.S; 
  // sign out via doSignOut by clicking acct-out if present, else call through openProfile? Use settings.
  // Simplest: trigger sign out through the exposed path:
  $('acct-out') && $('acct-out').click();
  await sleep(40);

  // ---- Account B: brand-new account, same browser session ----
  await signInGoogle('uidB','Bob');
  check('B is a different account', CC().S.uid==='uidB');
  check('B did NOT inherit A unlocks (starts at level 1)', CC().S.campaign.level===1);
  check('B has no stars', Object.keys(CC().S.campaign.stars).length===0);
  check('B record in DB is fresh', ((getP('users/uidB/campaign')||{}).level||1)===1);
  check('A record still intact and separate', getP('users/uidA/campaign').level===4);

  // ---- B earns its own progress, then back to A ----
  CC().openMap(); await sleep(20);
  w.document.querySelector('.map-node[data-level="1"]').click(); $('dl-play').click(); CC().challengeWin(2); await sleep(20);
  if($('dcr-map')) $('dcr-map').click(); await sleep(10);
  check('B now at level 2', CC().S.campaign.level===2 && getP('users/uidB/campaign').level===2);
  check('A unaffected by B playing', getP('users/uidA/campaign').level===4);

  $('acct-out') && $('acct-out').click(); await sleep(40);
  await signInGoogle('uidA','Alice');
  check('A reloads its own level 4', CC().S.campaign.level===4);
  check('A did not pick up B level-2-only state', CC().S.campaign.level===4);

  console.log(fails===0?'\nISOLATION TEST PASSED':`\n${fails} FAILURES`);
  process.exit(fails?1:0);
})().catch(e=>{console.error('CRASH:',e);process.exit(1);});
