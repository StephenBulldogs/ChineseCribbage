
/* =====================================================================
   UI
   ===================================================================== */
const E = window.CCEngine;
const $ = (id) => document.getElementById(id);
const ROW_LABELS = ['Hand 1','Hand 2','Hand 3','Hand 4','Crib'];
const AI_NAMES = { easy:'Deckhand', medium:'Navigator', hard:'Captain' };
const LANE_COLORS = ['var(--brass)','var(--jade)','#B5703A','#7A86B8'];
const TAKEOVER_MS = () => (typeof window.__takeoverMs === 'number' ? window.__takeoverMs : 120000);

const S = {
  view:'home', mode:'ai', difficulty:'medium',
  players:[{name:'You',kind:'human'},{name:'Navigator',kind:'ai'}],
  match:null, round:null, lastResult:null, aiTimer:null,
  count:null, oCounted:-1,
  campaign:{level:1, stars:{}, lives:5, lastLifeAt:Date.now()}, challenge:null, activeSnap:null, cqDeal:null, sound:true, reduceMotion:false, pendingLevel:null, lastClearedLevel:null, mapTick:null,
  // online
  code:null, seat:0, room:null, myName:'', visibility:'public',
  roomSize:2, seatConfig:['open'], aiJob:'', aiTimerOnline:null, rosterTick:null,
  oRound:null, oSeed:0, oMoves:[], startedRound:-1,
  unwatch:null, pubUnwatch:null, publicRooms:null,
  // account & social
  uid:null, profile:null, pendingName:'', authWatched:false,
  friends:{}, friendInfo:{}, friendWatches:{}, challenges:{}, pendingChallenge:null,
  statsRecorded:{}
};

const ALL_VIEWS=['home','game','online','map','friends','messages'];
function show(view){
  S.view = view;
  for (const v of ALL_VIEWS){ const el=$('view-'+v); if(el) el.classList.toggle('hidden', v!==view); }
  $('btn-quit').classList.toggle('hidden', view!=='game');
  const navTabs={home:'home',friends:'friends',messages:'messages',map:'conquest'};
  const nav=$('botnav');
  const inGame = view==='game' || (view==='online' && S.code);
  if(nav){ nav.classList.toggle('show', !inGame);
    for(const b of nav.querySelectorAll('.botnav-btn'))
      b.classList.toggle('active', b.dataset.tab===(navTabs[view]||(view==='online'?'home':'')));
  }
  window.scrollTo(0,0);
}
function gotoTab(tab){
  if(tab==='home') show('home');
  else if(tab==='conquest'){ if(S.uid && S.profile && S.profile.provider!=='guest') openMap(); else openOnline(); }
  else if(tab==='friends'){ renderFriendsTab(); show('friends'); }
  else if(tab==='messages'){ renderMessages(); show('messages'); }
  else if(tab==='profile'){ if(S.uid) openProfile(null); else openOnline(); }
}
function renderFriendsTab(){
  const guest = !S.uid || (S.profile && S.profile.provider==='guest');
  const a=$('tab-friends-auth'), w=$('tab-friends-wrap');
  if(a) a.classList.toggle('hidden', !guest);
  if(w) w.classList.toggle('hidden', guest);
  if(!guest) renderFriends();
}
function renderMessages(){
  const box=$('msg-list'); if(!box) return;
  const ch=Object.entries(S.challenges||{}).filter(([,c])=>c && Date.now()-(c.createdAt||0)<3600000);
  if(ch.length===0){ box.innerHTML='<div class="pub-empty">No messages yet. Challenges from friends arrive here.</div>'; updateBadges(); return; }
  box.innerHTML=ch.map(([id,c])=>`<div class="pub-item"><div class="who">⚔ ${esc(c.fromName)} challenged you<span class="age">a private table is waiting</span></div>
    <div class="frow"><button class="btn btn-primary mini" data-acc="${id}">Play</button><button class="btn btn-ghost mini" data-dec="${id}">Dismiss</button></div></div>`).join('');
  for(const b of box.querySelectorAll('[data-acc]')) b.addEventListener('click',()=>{ const c=S.challenges[b.dataset.acc]; if(c){ S.pendingChallenge={id:b.dataset.acc,...c}; acceptChallenge(); } });
  for(const b of box.querySelectorAll('[data-dec]')) b.addEventListener('click',()=>{ if(fdb) fdb.ref('users/'+S.uid+'/challenges/'+b.dataset.dec).remove().catch(()=>{}); });
  updateBadges();
}
function updateBadges(){
  const online=Object.keys(S.friends||{}).filter(u=>S.friendInfo[u]&&S.friendInfo[u].online).length;
  const fb=$('bn-friends-badge'); if(fb){ fb.textContent=online; fb.classList.toggle('hidden', online===0); }
  const msgs=Object.values(S.challenges||{}).filter(c=>c && Date.now()-(c.createdAt||0)<3600000).length;
  const mb=$('bn-msg-badge'); if(mb){ mb.textContent=msgs; mb.classList.toggle('hidden', msgs===0); }
}

/* ---------- shared renderers ---------- */
const CARD_DESIGNS=[
  {id:'classic',  name:'Classic Cream',          need:()=>true},
  {id:'jade',     name:'Jade Garden',            need:(l,s)=>l>=2,  needText:'player level 2'},
  {id:'lacquer',  name:'Red Lacquer Imperial',   need:(l,s)=>l>=4,  needText:'player level 4'},
  {id:'bamboo',   name:'Bamboo Minimalist',      need:(l,s)=>s>=15, needText:'15 Conquest stars'},
  {id:'porcelain',name:'Porcelain Blue & White', need:(l,s)=>s>=40, needText:'40 Conquest stars'},
  {id:'dragon',   name:'Gold Dragon Ornate',     need:(l,s)=>l>=10, needText:'player level 10'},
  {id:'night',    name:'Dark Night Tournament',  need:(l,s)=>s>=90, needText:'90 Conquest stars'},
];
const cardDesignById=(id)=>CARD_DESIGNS.find(d=>d.id===id)||CARD_DESIGNS[0];
function cardDesignUnlocked(d,prof){ const l=levelFromXp((prof||S.profile||{}).xp).level;
  const s=totalStars((prof&&prof.campaign)||S.campaign); return d.need(l,s); }
const activeCardDesign=()=>(S.profile&&S.profile.cardDesign)||'classic';

// Full illustrated card-FACE decks (distinct from the card backs above).
// Art lives in FACE_DECKS (theme -> { 'SA','S2',...,'CK' } -> data URI).
const FACE_DECK_DESIGNS=[
  {id:'none',        name:'Standard Faces',      need:()=>true},
  {id:'imperial',    name:'Imperial Ink',        need:(l,s)=>l>=3,             needText:'player level 3'},
  {id:'dragonbrush', name:'Dragon Brush',        need:(l,s)=>s>=25,            needText:'25 Conquest stars'},
  {id:'jadeporc',    name:'Jade Porcelain',      need:(l,s)=>l>=8 && s>=50,    needText:'player level 8 + 50 stars'},
];
const faceDeckById=(id)=>FACE_DECK_DESIGNS.find(d=>d.id===id)||FACE_DECK_DESIGNS[0];
function faceDeckUnlocked(d,prof){ const l=levelFromXp((prof||S.profile||{}).xp).level;
  const s=totalStars((prof&&prof.campaign)||S.campaign); return d.need(l,s); }
const activeFaceDeck=()=>(S.profile&&S.profile.faceDeck)||'none';
function faceImg(card){
  const fd=activeFaceDeck();
  const FD=window.FACE_DECKS;
  if(fd==='none' || !FD || !FD[fd]) return null;
  const key=card.suit+E.rankLabel(card.rank);
  return FD[fd][key]||null;
}

function cardHTML(card, size, faceDown, animate, glow){
  const g = glow ? ' glow' : '';
  const dz = ' dz-'+activeCardDesign();
  if (faceDown || !card) return `<div class="card ${size} back ${animate?'deal-in':''}${g}${dz}"></div>`;
  const red = card.suit==='H'||card.suit==='D';
  const img = faceImg(card);
  if (img) return `<div class="card ${size} facedeck ${animate?'deal-in':''}${g}" style="background-image:url(${img})"></div>`;
  const txt = E.rankLabel(card.rank)+E.SUIT_GLYPHS[card.suit];
  return `<div class="card ${size} ${red?'red':'black'} ${animate?'deal-in':''}${g}${dz}">
    <span class="corner">${txt}</span><span class="pip">${txt}</span></div>`;
}
/** lanes: [{name,total}]. one lane for solo, two for vs modes. */
function railHTML(lanes, activeIdx){
  const MIN=-15, MAX=35;
  const pct=(v)=>((Math.max(MIN,Math.min(MAX,v))-MIN)/(MAX-MIN))*100;
  return lanes.map((l,p)=>`
    <div class="lane-row">
      <div class="lane-name ${activeIdx===p?'active':''}">${esc(l.name)}</div>
      <div class="lane">
        <div class="zero-zone" style="width:${pct(0)}%"></div>
        <div class="notch" style="left:${pct(E.TARGET)}%"></div>
        <div class="peg ${activeIdx===p?'active':''}" style="left:${pct(l.total)}%;background:${LANE_COLORS[p%LANE_COLORS.length]}"></div>
      </div>
      <div class="lane-total ${l.total<0?'neg':''}">${l.total}</div>
    </div>`).join('')+
    `<div class="rail-scale"><span>${MIN}</span><span>0</span><b>${E.TARGET} ★</b></div>`;
}
function rowsHTML(round, placeableFn, rowScores, count){
  return round.rows.map((cards,i)=>{
    const isCrib = i===E.CRIB_ROW;
    const placeable = !isCrib && placeableFn(i);
    const score = rowScores ? rowScores[i] : null;
    const counting = !!count;
    const hideFaces = (isCrib && !round.complete) || (counting && isCrib && !count.reveal);
    const badge = isCrib ? '<span class="key">auto</span>' : `<span class="key">${i+1}</span>`;
    const scoreHTML = counting
      ? (i<=count.row ? `<div class="row-score ${count.rowTotals[i]===0?'zero':''}">${count.rowTotals[i]}</div>` : '')
      : score ? `<div class="row-score ${score.total===0?'zero':''}">${score.total}</div><div class="row-break">${breakdownHTML(score)}</div>` : '';
    return `<button class="row-btn ${isCrib?'crib':''} ${placeable?'placeable':''} ${counting&&count.row===i?'count-row':''}"
      data-row="${i}" ${placeable?'':'disabled'} aria-label="${isCrib?'Crib. deals itself':'Place card in '+ROW_LABELS[i]}">
      <div><div class="row-label">${ROW_LABELS[i]}${badge}</div>${scoreHTML}</div>
      <div class="row-cards">
        ${[0,1,2,3].map(k=>cards[k]
          ? cardHTML(cards[k],'sm',hideFaces,k===cards.length-1, counting&&count.row===i&&count.set.has(k))
          : '<span class="slot sm"></span>').join('')}
      </div></button>`;
  }).join('');
}
function breakdownHTML(sc){
  if(!sc) return '';
  const parts=[];
  if(sc.fifteens) parts.push('fifteens '+sc.fifteens);
  if(sc.pairs) parts.push('pairs '+sc.pairs);
  if(sc.runs) parts.push('runs '+sc.runs);
  if(sc.flush) parts.push('flush '+sc.flush);
  if(sc.nobs) parts.push('nobs '+sc.nobs);
  return parts.length?parts.join(' &middot; '):'no count';
}
const esc=(s)=>String(s).replace(/[&<>"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ====================================================================
   THE COUNT. slow walkthrough of every combination, hand by hand
   ==================================================================== */
function comboLabel(c){
  return c.kind==='fifteen' ? 'Fifteen'
    : c.kind==='pair' ? 'A pair'
    : c.kind==='run' ? 'Run of '+c.pts
    : c.kind==='flush' ? 'Flush'
    : 'His nobs';
}
function countDelay(ev){
  if (window.__fastCount) return 1;
  return ev.t==='combo' ? 850 : ev.t==='row' ? 550 : 500;
}
function startCount(round, prefix, done){
  cancelCount();
  const queue=[];
  if (round.starter && round.starter.rank===11) queue.push({t:'heels'});
  for(let r=0;r<5;r++){
    const det=E.scoreHandDetail(round.rows[r], round.starter, r===E.CRIB_ROW);
    queue.push({t:'row', row:r});
    for(const c of det.combos) queue.push({t:'combo', row:r, combo:c});
    queue.push({t:'done', row:r, total:det.total});
  }
  S.count={round, prefix, queue, pos:0, rowTotals:[0,0,0,0,0], row:-1, set:new Set(),
           label:'The count', sub:'', reveal:false, doneCb:done, timer:null, active:true};
  stepCount();
}
function stepCount(){
  const c=S.count; if(!c||!c.active) return;
  if(c.pos>=c.queue.length) return finishCount();
  const ev=c.queue[c.pos++];
  if(ev.t==='heels'){
    c.row=-1; c.set=new Set([4]);
    c.label='His heels'; c.sub='+2. The starter is a Jack.';
  } else if(ev.t==='row'){
    c.row=ev.row; c.set=new Set();
    if(ev.row===E.CRIB_ROW) c.reveal=true;
    c.label=ROW_LABELS[ev.row]; c.sub= ev.row===E.CRIB_ROW ? 'the crib turns over…' : 'counting…';
  } else if(ev.t==='combo'){
    c.row=ev.row; c.set=new Set(ev.combo.idx);
    c.rowTotals[ev.row]+=ev.combo.pts;
    c.label=comboLabel(ev.combo);
    c.sub=`+${ev.combo.pts} · ${ROW_LABELS[ev.row]} has ${c.rowTotals[ev.row]}`;
  } else {
    c.set=new Set();
    c.label=`${ROW_LABELS[ev.row]}: ${ev.total}`;
    c.sub= ev.total===0 ? 'no count' : '';
  }
  renderCountView();
  c.timer=setTimeout(stepCount, countDelay(ev));
}
function finishCount(){
  const c=S.count; if(!c) return;
  c.active=false; S.count=null;
  if(c.doneCb) c.doneCb();
}
function skipCount(){
  const c=S.count; if(!c) return;
  clearTimeout(c.timer);
  finishCount();
}
function cancelCount(){
  if(S.count){ clearTimeout(S.count.timer); S.count=null; }
}
function renderCountView(){
  if(S.view==='game') renderGame(); else if(S.view==='online') renderOnline();
}
function calloutHTML(prefix, c){
  return `<div class="count-callout"><div><div class="cl">${c.label}</div>
    ${c.sub?`<div class="cs">${c.sub}</div>`:''}</div>
    <button class="btn btn-ghost" id="${prefix}-skip">Skip</button></div>`;
}

/* ====================================================================
   CHALLENGE MAP
   --------------------------------------------------------------------
   A winding campaign of 24 levels. Three challenge types:
     solo      reach 29 within N rounds
     bestRound score X or more in a single round, within N rounds
     ai        beat a named AI, who may start with a head start
   Lives: 5 hearts. Failing a level (or quitting mid-level) costs one.
   One heart regrows every 30 minutes (window.__lifeMs overrides in tests).
   Stars: 1 to 3 per level by margin. Progress saves to your account when
   signed in; otherwise it lives for the session.
   ==================================================================== */
/* XP and player levels: wins and Conquest clears earn experience.
   Level n to n+1 costs 100*n xp. Banners unlock by player level or
   total Conquest stars; the equipped banner shows on your profile. */
const XP_AWARDS = { matchWin: 100, matchTie: 40, matchLoss: 20, conquestRepeat: 10 };
const conquestClearXp = (stars) => 50 + 15 * stars;
function levelFromXp(xp) {
  let level = 1, need = 100, x = xp || 0;
  while (x >= need) { x -= need; level++; need = 100 * level; }
  return { level, into: x, need };
}
function addXp(n, why) {
  if (!S.uid || !S.profile) return 0;
  S.profile.xp = (S.profile.xp || 0) + n;
  if (fdb) fdb.ref('users/' + S.uid + '/xp').set(S.profile.xp).catch(() => {});
  pushLeaderboard();
  return n;
}
const BANNERS = [
  { id: 'lacquer',  name: 'Lacquer',     css: 'linear-gradient(100deg,#41221C,#2B1714)',          need: () => true,                         needText: 'default' },
  { id: 'jade',     name: 'Jade tide',   css: 'linear-gradient(100deg,#2C6557,#1d4a3f)',          need: (l,s) => l >= 3,                    needText: 'player level 3' },
  { id: 'wave',     name: 'Gold wave',   css: 'linear-gradient(100deg,#8A6F1F,#41221C)',          need: (l,s) => l >= 5,                    needText: 'player level 5' },
  { id: 'blossom',  name: 'Plum blossom',css: 'linear-gradient(100deg,#B5402F,#6e2018)',          need: (l,s) => l >= 8,                    needText: 'player level 8' },
  { id: 'lantern',  name: 'Lantern glow',css: 'linear-gradient(100deg,#C9A227,#B5402F)',          need: (l,s) => l >= 12,                   needText: 'player level 12' },
  { id: 'bamboo',   name: 'Bamboo grove',css: 'linear-gradient(100deg,#3E8E7E,#8A6F1F)',          need: (l,s) => s >= 10,                   needText: '10 Conquest stars' },
  { id: 'cloud',    name: 'Gold cloud',  css: 'linear-gradient(100deg,#C9A227,#7A86B8)',          need: (l,s) => s >= 30,                   needText: '30 Conquest stars' },
  { id: 'cloud2',   name: 'Twin clouds', css: 'linear-gradient(100deg,#7A86B8,#3E8E7E)',          need: (l,s) => s >= 60,                   needText: '60 Conquest stars' },
  { id: 'dragon',   name: 'Dragon',      css: 'linear-gradient(100deg,#B5402F,#C9A227,#3E8E7E)',  need: (l,s) => s >= 120,                  needText: '120 Conquest stars' },
  { id: 'phoenix',  name: 'Phoenix',     css: 'linear-gradient(100deg,#C9A227,#B5402F,#C9A227)',  need: (l,s) => s >= 200,                  needText: '200 Conquest stars' },
];
const totalStars = (camp) => Object.values((camp || S.campaign).stars || {}).reduce((n, v) => n + v, 0);
const clearedCount = (camp) => Object.keys((camp || S.campaign).stars || {}).length;
function bannerUnlocked(b, prof, camp) {
  const lvl = levelFromXp((prof || S.profile || {}).xp).level;
  return b.need(lvl, totalStars(camp));
}
function bannerById(id) { return BANNERS.find((b) => b.id === id) || BANNERS[0]; }
function pushLeaderboard() {
  if (!S.uid || !S.profile || S.profile.provider === 'guest' || !fdb) return;
  fdb.ref('leaderboard/' + S.uid).set({
    name: S.profile.name,
    stars: totalStars(),
    cleared: clearedCount(),
    level: S.campaign.level,
    plevel: levelFromXp(S.profile.xp).level,
    banner: S.profile.banner || 'lacquer',
  }).catch(() => {});
}

const MAX_LIVES = 5;
const LIFE_MS = () => (typeof window.__lifeMs === 'number' ? window.__lifeMs : 30 * 60 * 1000);

/* 100 Conquest levels, generated so the catalogue can grow without code
   churn. Types:
     solo      reach `target` total within `rounds` rounds
     bestRound score `score` or more in a single round, within `rounds`
     ai        beat `ais` opponents (each {difficulty,handicap}) racing to `target`
   Star rules (set in evaluation): solo/bestRound by rounds to spare,
   ai by rounds taken. */
const AI_TIERS = { easy:'Deckhand', medium:'Navigator', hard:'Captain' };

function genLevels(){
  const out=[];
  const soloNames=['First steps','Finding the fives','Tighter now','Four to shore','Three to shore','No slack',
    'Quick current','Steady hands','The short race','Down to the wire','Cutting it close','Sprint','Low tide','Riptide'];
  const bestNames=['One good deal','Forty or nothing','High tide','Half a hundred','Stacked deck','The legend hand',
    'Perfect storm','Golden hand','Treasure deal','Royal flush dreams','The big one','Jackpot','Master stroke'];
  const aiNames=['The Deckhand','Head start','The Navigator','Uphill water','Ten behind','The Captain','Rough seas',
    'Taking on water','Fifteen down','Twenty down','Two on one','The gauntlet','Triple threat','The admiralty',
    "The Captain's table",'Storm of three','The whole crew','Final reckoning'];
  let si=0,bi=0,ai=0;
  for(let id=1; id<=100; id++){
    const tier = id<=10?0 : id<=25?1 : id<=45?2 : id<=70?3 : 4; // ramps difficulty
    const cyc = id % 5;
    if (cyc===1 || cyc===3){
      // solo: target rises with tier, rounds tighten
      const target = [29,29,40,45,50][tier];
      const rounds = Math.max(2, [7,6,6,5,5][tier] - Math.floor((id-1)/20));
      out.push({ id, type:'solo', target, rounds,
        name: soloNames[si++ % soloNames.length],
        desc: `Reach ${target} total within ${rounds} rounds.` });
    } else if (cyc===0){
      // bestRound: score climbs
      const score = [33,38,44,52,60][tier] + Math.floor((id-1)/25)*4;
      const rounds = [5,5,5,6,6][tier];
      out.push({ id, type:'bestRound', score, rounds,
        name: bestNames[bi++ % bestNames.length],
        desc: `Score ${score}+ in a single round. ${rounds} rounds to do it.` });
    } else {
      // ai: 1 opponent early, 2 from tier 2, 3 from tier 4; handicaps grow
      const diff = ['easy','easy','medium','hard','hard'][tier];
      const nOpp = tier>=4 ? 3 : tier>=2 ? (id%2?2:1) : 1;
      const baseH = [0,5,5,10,12][tier] + Math.floor((id-1)/15)*2;
      const target = tier>=3 ? 35 : 29;
      const ais=[];
      for(let o=0;o<nOpp;o++) ais.push({ difficulty:diff, handicap: baseH + o*3 });
      const oppLabel = nOpp===1?`the ${AI_TIERS[diff]}`:`${nOpp} ${AI_TIERS[diff]}s`;
      out.push({ id, type:'ai', target, ais,
        name: aiNames[ai++ % aiNames.length] + (id>18?` ${Math.ceil(id/18)}`:''),
        desc: `Race to ${target}. Beat ${oppLabel}` + (baseH?` (they start +${baseH}+)`:'') + '.' });
    }
  }
  return out;
}
const LEVELS = genLevels();

function blankCampaign(){
  return { level: 1, stars: {}, lives: MAX_LIVES, lastLifeAt: Date.now() };
}

/** Lazy heart regrowth: one per LIFE_MS, capped at MAX_LIVES. */
function refreshLives(){
  const c = S.campaign;
  if (c.lives >= MAX_LIVES) { c.lastLifeAt = Date.now(); return; }
  const elapsed = Date.now() - c.lastLifeAt;
  const gained = Math.floor(elapsed / LIFE_MS());
  if (gained > 0) {
    c.lives = Math.min(MAX_LIVES, c.lives + gained);
    c.lastLifeAt = c.lives >= MAX_LIVES ? Date.now() : c.lastLifeAt + gained * LIFE_MS();
    saveCampaign();
  }
}
function loseLife(){
  refreshLives();
  const c = S.campaign;
  if (c.lives >= MAX_LIVES) c.lastLifeAt = Date.now(); // the regrow clock starts now
  c.lives = Math.max(0, c.lives - 1);
  saveCampaign();
}
function nextLifeIn(){
  const c = S.campaign;
  if (c.lives >= MAX_LIVES) return 0;
  return Math.max(0, LIFE_MS() - (Date.now() - c.lastLifeAt));
}
/* Persist the in-progress level so closing the tab loses neither the
   level nor the life. Only the human seat's deal needs replaying; an AI
   seat mid-round simply restarts its own deal on resume (it's the AI's
   round, not yours, so no progress of yours is lost). */
function saveChallengeSnapshot(){
  if (!S.uid || !fdb || !S.challenge) return;
  const lv=S.challenge.level;
  let snap;
  if (S.mode==='conquest'){
    const humanTurn = S.match.turn===0;
    snap={ id:lv.id, mode:'conquest',
      totals:S.cq.totals.slice(), roundsPlayed:S.match.roundsPlayed.slice(),
      rounds:S.cq.rounds, turn:S.match.turn,
      seed: humanTurn ? S.cqDeal.seed : 0,
      moves: humanTurn ? S.cqDeal.moves.slice() : [] };
  } else {
    snap={ id:lv.id, mode:'solo',
      total:S.match.totals[0], roundsUsed:S.challenge.roundsUsed,
      seed:S.cqDeal.seed, moves:S.cqDeal.moves.slice() };
  }
  S.activeSnap=snap;
  fdb.ref('users/'+S.uid+'/active').set(snap).catch(()=>{});
}
function clearChallengeSnapshot(){
  if (S.uid && fdb) fdb.ref('users/'+S.uid+'/active').remove().catch(()=>{});
}
function resumeChallenge(snap){
  const lv=LEVELS.find((x)=>x.id===snap.id); if(!lv) { clearChallengeSnapshot(); return; }
  S.pendingLevel=lv;
  S.challenge={ level:lv, roundsUsed:0, target:lv.target||E.TARGET };
  if (snap.mode==='conquest'){
    startConquestAiMatch(lv, { totals:snap.totals, roundsPlayed:snap.roundsPlayed,
      rounds:snap.rounds, turn:snap.turn, seed:snap.seed||E.randomSeed(), moves:snap.moves||[] });
  } else {
    startSoloChallenge(lv, { total:snap.total, roundsUsed:snap.roundsUsed, seed:snap.seed, moves:snap.moves||[] });
  }
}

function saveCampaign(){
  if (S.uid && fdb) fdb.ref('users/' + S.uid + '/campaign').set(S.campaign).catch(() => {});
  pushLeaderboard();
}
function loadCampaign(stored){
  // Replace local campaign with THIS account's stored progress (never merge
  // with whatever was in memory from a previous session/account).
  S.campaign = blankCampaign();
  if (stored){
    const c = S.campaign;
    c.level = stored.level || 1;
    c.stars = {};
    for (const k in (stored.stars || {})) c.stars[k] = stored.stars[k];
    if (typeof stored.lives === 'number') { c.lives = stored.lives; c.lastLifeAt = stored.lastLifeAt || Date.now(); }
  }
  refreshLives();
}

/* ---------- the map ---------- */
const NODE_X = [20, 38, 62, 80, 62, 38];
const NODE_TYPE_ICON = { solo:'🎯', bestRound:'💎', ai:'⚔' };
function renderMap(){
  refreshLives();
  const c = S.campaign;
  const wrap = $('map-path'); if (!wrap) return;
  const GAP = 92;
  const H = LEVELS.length * GAP + 120;
  wrap.style.height = H + 'px';
  const pts = LEVELS.map((lv, i) => ({ x: NODE_X[i % NODE_X.length], y: 70 + i * GAP }));
  // smooth gold trail through all nodes
  const path = pts.map((p,i)=>`${i?'L':'M'}${p.x},${(p.y/H)*1000}`).join(' ');
  const doneY = (() => { // glow the trail up to the furthest unlocked node
    const idx = Math.min(c.level, LEVELS.length) - 1;
    return ((pts[idx]?pts[idx].y:70)/H)*1000;
  })();
  let html = `<svg id="map-svg" viewBox="0 0 100 1000" preserveAspectRatio="none">
    <path d="${path}" fill="none" stroke="#1F100E" stroke-width="6" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    <path d="${path}" fill="none" stroke="var(--brass-dim)" stroke-width="3" stroke-dasharray="5 5" vector-effect="non-scaling-stroke" opacity=".7"/>
    <path d="${path}" fill="none" stroke="var(--brass)" stroke-width="3" stroke-linecap="round" vector-effect="non-scaling-stroke"
      style="stroke-dasharray:1000;stroke-dashoffset:${1000-(doneY/1000)*1000};opacity:.9"/></svg>`;
  html += LEVELS.map((lv, i) => {
    const p = pts[i];
    const stars = c.stars[lv.id] || 0;
    const unlocked = lv.id <= c.level;
    const done = stars > 0;
    const isNext = lv.id === c.level && !done;
    const cls = unlocked ? (done ? 'done' : (isNext?'open next':'open')) : 'locked';
    // pick a tile artwork for this node
    const milestone = lv.id % 10 === 0;
    let tile;
    if (!unlocked) tile = 'locked';
    else if (done) tile = 'cloud';
    else if (milestone) tile = 'dragon';
    else if (lv.type === 'ai') tile = 'battle';
    else if (lv.type === 'bestRound') tile = 'reward';
    else tile = 'blank';
    return `<button class="map-node ${cls} tile-${tile}" style="left:${p.x}%;top:${p.y}px"
        data-level="${lv.id}" ${unlocked ? '' : 'disabled'} aria-label="Level ${lv.id}: ${lv.name}">
      ${isNext?'<span class="ping"></span>':''}
      <span class="ic">${unlocked ? (done?NODE_TYPE_ICON[lv.type]:lv.id) : ''}</span>
      ${done?`<span class="stars">${'★'.repeat(stars)}<span class="se">${'★'.repeat(3-stars)}</span></span>`:''}
      ${unlocked&&!done&&!milestone?`<span class="lnum">${lv.id}</span>`:''}
    </button>`;
  }).join('');
  wrap.innerHTML = html;
  for (const b of wrap.querySelectorAll('.map-node:not([disabled])'))
    b.addEventListener('click', () => openLevel(+b.dataset.level));
  // scroll the next level into view
  const nextNode = wrap.querySelector('.map-node.next') || wrap.querySelector('.map-node.open');
  if (nextNode && !S.mapScrolled){ S.mapScrolled=true;
    setTimeout(()=>{ try{ nextNode.scrollIntoView({block:'center',behavior:'smooth'}); }catch(e){} },120); }
  renderLivesBar();
}
function renderLivesBar(){
  refreshLives();
  const c = S.campaign;
  const hearts = $('map-lives');
  if (hearts) hearts.innerHTML = '<span class="hful">'+'❤'.repeat(c.lives)+'</span><span class="dimheart">' + '♡'.repeat(MAX_LIVES - c.lives) + '</span>';
  const t = $('map-timer');
  if (t) {
    const ms = nextLifeIn();
    t.textContent = c.lives >= MAX_LIVES ? 'hearts full'
      : '+1 ❤ in ' + Math.floor(ms / 60000) + ':' + String(Math.ceil((ms % 60000) / 1000)).padStart(2, '0');
  }
  const sb = $('map-starcount'); if (sb) sb.textContent = totalStars() + ' ★';
}
function startMapTick(){
  if (S.mapTick) clearInterval(S.mapTick);
  S.mapTick = setInterval(() => {
    if (S.view !== 'map') return;
    const before = S.campaign.lives;
    renderLivesBar();
    if (S.campaign.lives !== before) renderMap();
  }, 1000);
}
/** Conquest is an online, account-bound mode. Guests are asked to sign in with Google. */
/** Conquest is an online, account-bound mode. Guests are asked to sign in with Google. */
function openMap(){
  if (!S.uid || !S.profile || S.profile.provider === 'guest'){
    show('online'); oShow(S.uid ? 'lobby' : 'auth');
    return;
  }
  show('map');
  S.mapScrolled=false;
  renderMap();
  startMapTick();
}
function renderConquestPanel(){
  const box=$('o-conquest'); if(!box) return;
  if (!S.uid){ box.innerHTML='<div class="pub-empty">Sign in to play Conquest.</div>'; return; }
  if (S.profile.provider==='guest'){
    box.innerHTML='<div class="pub-empty">Conquest, friends and leaderboards need a Google sign-in. Guest sessions stay casual.</div>';
    return;
  }
  refreshLives();
  const c=S.campaign;
  const snap=S.activeSnap;
  const resumeRow = snap ? `<div class="pub-item" style="border-color:var(--brass)">
      <div class="who">Resume level ${snap.id}<span class="age">a game is in progress</span></div>
      <button class="btn btn-primary" id="go-resume">Resume</button></div>` : '';
  box.innerHTML=resumeRow+`<div class="pub-item"><div class="who">Level ${c.level}
      <span class="age">${totalStars()} ★ · ${'❤'.repeat(c.lives)}${'♡'.repeat(MAX_LIVES-c.lives)}</span></div>
    <button class="btn ${snap?'btn-ghost':'btn-primary'}" id="go-conquest">${snap?'Map':'Play'}</button></div>`;
  $('go-conquest').addEventListener('click',openMap);
  const rb=$('go-resume'); if(rb) rb.addEventListener('click',()=>{ const sn=S.activeSnap; S.activeSnap=null; resumeChallenge(sn); });
}
function renderLobbyGates(){
  const guest = S.profile && S.profile.provider==='guest';
  const sub=$('hub-conquest-sub');
  if (sub){
    sub.textContent = guest ? 'Sign in with Google to climb the campaign.'
      : (S.activeSnap ? `Resume level ${S.activeSnap.id}, or pick a level on the map.`
      : `Level ${S.campaign.level} · ${totalStars()} stars earned.`);
  }
  renderConquestPanel();
}

/* ---------- level intro ---------- */
function openLevel(id){
  refreshLives();
  const lv = LEVELS.find((x) => x.id === id); if (!lv) return;
  S.pendingLevel = lv;
  $('dl-eyebrow').textContent = 'Level ' + lv.id + (S.campaign.stars[lv.id] ? ' · ' + '★'.repeat(S.campaign.stars[lv.id]) : '');
  $('dl-name').textContent = lv.name;
  $('dl-desc').textContent = lv.desc + ' Failing or quitting costs a life.';
  const ok = S.campaign.lives > 0;
  $('dl-play').disabled = !ok;
  $('dl-play').textContent = ok ? 'Play (1 ❤ at stake)' : 'No lives left';
  $('dl-lives').innerHTML = ok ? '' : 'A new heart grows every 30 minutes.';
  $('d-level').showModal();
}
function startLevel(){
  const lv = S.pendingLevel; if (!lv) return;
  refreshLives();
  if (S.campaign.lives <= 0) return;
  $('d-level').close();
  S.challenge = { level: lv, roundsUsed: 0, target: lv.target || E.TARGET };
  if (lv.type === 'ai') {
    startConquestAiMatch(lv);
  } else {
    startSoloChallenge(lv, null);
  }
}
function startSoloChallenge(lv, restore){
  cancelCount(); clearInterval(S.aiTimer);
  S.mode='solo';
  S.players=[{name:'You',kind:'human'},{name:'-',kind:'human'}];
  if (restore){
    S.match={ totals:[restore.total,0], roundsPlayed:[restore.roundsUsed,0], turn:0, outcome:{kind:'playing'} };
    S.challenge.roundsUsed=restore.roundsUsed;
    S.cqDeal={ seed:restore.seed, moves:(restore.moves||[]).slice() };
    let r=E.newRound(restore.seed);
    for (const m of S.cqDeal.moves) r=E.placeCard(r,m);
    S.round=r;
  } else {
    S.match=E.newMatch(0);
    S.cqDeal={ seed:E.randomSeed(), moves:[] };
    S.round=E.newRound(S.cqDeal.seed);
  }
  show('game'); renderGame();
  saveChallengeSnapshot();
}

/* Multi-opponent Conquest match. You are seat 0; opponents are AI seats
   1..n played locally. Everyone takes a full round per "turn cycle".
   First to the target after equal rounds wins; you must be strictly top. */
function startConquestAiMatch(lv, restore){
  cancelCount(); clearInterval(S.aiTimer);
  const ais = lv.ais || [{difficulty:'medium',handicap:0}];
  const names = ais.map((a,i)=> ais.length>1 ? `${AI_TIERS[a.difficulty]} ${i+1}` : AI_TIERS[a.difficulty]);
  S.mode='conquest';
  S.players=[{name:'You',kind:'human'}, ...names.map((n)=>({name:n,kind:'ai'}))];
  if (restore){
    S.cq={ ais, target: lv.target||E.TARGET, totals:restore.totals.slice(), rounds:restore.rounds, turn:restore.turn, n:ais.length+1 };
    S.match={ totals:S.cq.totals, roundsPlayed:restore.roundsPlayed.slice(), turn:restore.turn, outcome:{kind:'playing'} };
    beginConquestRound(restore.turn, restore.seed, restore.moves);
  } else {
    S.cq={ ais, target: lv.target||E.TARGET, totals:[0,...ais.map((a)=>a.handicap||0)], rounds:0, turn:0, n:ais.length+1 };
    S.match={ totals:S.cq.totals, roundsPlayed:S.cq.totals.map(()=>0), turn:0, outcome:{kind:'playing'} };
    beginConquestRound(0, E.randomSeed(), []);
  }
  show('game'); renderGame();
  if (S.players[S.match.turn].kind==='ai') runConquestAiRound(S.match.turn);
}
/* Open a round for `seat`, replaying any prior placements (for resume). */
function beginConquestRound(seat, seed, moves){
  S.cqDeal={ seed, moves: (moves||[]).slice() };
  let r=E.newRound(seed);
  for (const m of S.cqDeal.moves) r=E.placeCard(r,m);
  S.round=r;
  saveChallengeSnapshot();
}

/* ---------- evaluation ---------- */
// Solo & bestRound: 3 stars if you beat the deadline by 2+ rounds,
// 2 stars with 1 round to spare, 1 star on the final allowed round.
function challengeStarsByRounds(lv, roundsUsed){
  const spare = lv.rounds - roundsUsed; // 0 = used the final round
  return spare >= 2 ? 3 : spare === 1 ? 2 : 1;
}
// AI duels: by how many rounds it took. 1-3 rounds = 3 stars,
// 4-5 = 2 stars, 6+ = 1 star.
function challengeStarsByPace(roundsUsed){
  return roundsUsed <= 3 ? 3 : roundsUsed <= 5 ? 2 : 1;
}
/** Called from nextRound (solo modes) after totals update. True = handled. */
function challengeSoloStep(roundResult){
  const ch = S.challenge; if (!ch) return false;
  const lv = ch.level;
  ch.roundsUsed += 1;
  if (lv.type === 'bestRound') {
    if (roundResult.handTotal >= lv.score) { challengeWin(challengeStarsByRounds(lv, ch.roundsUsed)); return true; }
    if (ch.roundsUsed >= lv.rounds) { challengeFail(); return true; }
    return false;
  }
  // solo: reach the level's target total within N rounds
  if (S.match.totals[0] >= (lv.target || E.TARGET)) { challengeWin(challengeStarsByRounds(lv, ch.roundsUsed)); return true; }
  if (ch.roundsUsed >= lv.rounds) { challengeFail(); return true; }
  return false;
}
function challengeWin(stars){
  const ch = S.challenge; if (!ch) return;
  clearChallengeSnapshot(); S.activeSnap=null;
  const lv = ch.level;
  const c = S.campaign;
  const firstClear = !(c.stars[lv.id] > 0);
  const xp = addXp(firstClear ? conquestClearXp(stars) : XP_AWARDS.conquestRepeat, 'conquest');
  c.stars[lv.id] = Math.max(c.stars[lv.id] || 0, stars);
  if (lv.id >= c.level && lv.id < LEVELS.length) c.level = lv.id + 1;
  saveCampaign();
  S.challenge = null; S.match = null; S.round = null; cancelCount(); clearInterval(S.aiTimer);
  $('dcr-eyebrow').textContent = 'Level ' + lv.id + ' cleared';
  $('dcr-title').textContent = lv.name;
  $('dcr-stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  $('dcr-sub').textContent = 'The path continues.' + ` · +${xp} xp`;
  $('dcr-retry').classList.add('hidden');
  $('dcr-next').classList.toggle('hidden', lv.id >= LEVELS.length);
  S.lastClearedLevel = lv.id;
  $('d-chal').showModal();
}
function challengeFail(){
  const ch = S.challenge; if (!ch) return;
  clearChallengeSnapshot(); S.activeSnap=null;
  const lv = ch.level;
  loseLife();
  S.challenge = null; S.match = null; S.round = null; cancelCount(); clearInterval(S.aiTimer);
  $('dcr-eyebrow').textContent = 'Level ' + lv.id + ' failed · −1 ❤';
  $('dcr-title').textContent = lv.name;
  $('dcr-stars').textContent = '';
  $('dcr-sub').textContent = S.campaign.lives > 0
    ? 'You have ' + S.campaign.lives + (S.campaign.lives === 1 ? ' life' : ' lives') + ' left.'
    : 'No lives left. A new heart grows every 30 minutes.';
  $('dcr-retry').classList.toggle('hidden', S.campaign.lives <= 0);
  $('dcr-next').classList.add('hidden');
  S.lastClearedLevel = null;
  S.pendingLevel = lv;
  $('d-chal').showModal();
}

/* ====================================================================
   LOCAL GAME (solo / vs AI / pass & play)
   ==================================================================== */
function startMatch(mode){
  cancelCount();
  S.mode = mode;
  S.players = mode==='ai'
    ? [{name:'You',kind:'human'},{name:AI_NAMES[S.difficulty],kind:'ai'}]
    : mode==='pass'
      ? [{name:'Player 1',kind:'human'},{name:'Player 2',kind:'human'}]
      : [{name:'You',kind:'human'},{name:'-',kind:'human'}]; // solo
  S.match = E.newMatch(0);
  S.round = E.newRound(S.match.roundSeed);
  S.lastResult = null;
  show('game');
  renderGame();
}

function renderGame(){
  const m=S.match, r=S.round; if(!m) return;
  const seat=m.turn;
  if (S.challenge){
    const lv=S.challenge.level;
    const budget = lv.type==='ai' ? '' : ` / ${lv.rounds}`;
    $('g-round').textContent = `Level ${lv.id} · Round ${m.roundsPlayed[seat]+1}${budget}`;
    const oppNames = S.players.slice(1).map((p)=>p.name).join(', ');
    $('g-goal').textContent = 'Goal: ' + (
      lv.type==='solo' ? `reach ${lv.target||29} within ${lv.rounds} rounds`
      : lv.type==='bestRound' ? `score ${lv.score}+ in a single round`
      : `reach ${lv.target||29} and finish above ${oppNames}`);
    $('g-goal').classList.remove('hidden');
  } else {
    $('g-round').textContent = `Round ${m.roundsPlayed[seat]+1}`;
    $('g-goal').classList.add('hidden');
  }
  let lanes;
  if (S.mode==='solo') lanes=[{name:'You', total:m.totals[0]}];
  else lanes=S.players.map((p,i)=>({name:p.name, total:m.totals[i]||0}));
  $('g-rail').innerHTML = railHTML(lanes, S.mode==='solo'?0:seat);
  if(!r){ $('g-rows').innerHTML=''; $('g-draw-card').innerHTML=''; $('g-callout').innerHTML=''; return; }

  const counting = S.count && S.count.active && S.count.prefix==='g';
  const humanTurn = S.players[seat].kind==='human';
  const rowScores = r.complete && !counting ? E.scoreRound(r).rowScores : null;
  if (r.complete){
    $('g-draw-label').textContent='Starter';
    $('g-draw-sub').textContent= counting ? 'counting the hands…' : 'Counts in all five hands.';
    $('g-draw-card').innerHTML=cardHTML(r.starter,'lg',false,true, counting&&S.count.set.has(4));
  } else {
    $('g-draw-label').textContent= S.mode==='solo' ? 'Your card' : `${S.players[seat].name} to place`;
    $('g-draw-sub').textContent= humanTurn ? 'Tap a hand or press 1–4.' : `${S.players[seat].name} is thinking…`;
    $('g-draw-card').innerHTML=cardHTML(r.current,'lg',!humanTurn && S.mode==='pass',true);
  }
  $('g-callout').innerHTML = counting ? calloutHTML('g', S.count) : '';
  if (counting){ const sk=$('g-skip'); if(sk) sk.addEventListener('click',skipCount); }
  $('g-rows').innerHTML = rowsHTML(r,(i)=>humanTurn && !counting && E.canPlace(r,i),rowScores, counting?S.count:null);
  for (const b of $('g-rows').querySelectorAll('.row-btn:not([disabled])'))
    b.addEventListener('click',()=>place(+b.dataset.row));
}

function place(rowIndex){
  const r=S.round; if(!r||!E.canPlace(r,rowIndex)) return;
  S.round = E.placeCard(r,rowIndex);
  if (S.challenge && S.cqDeal) { S.cqDeal.moves.push(rowIndex); saveChallengeSnapshot(); }
  renderGame();
  if (S.round.complete) startCount(S.round,'g',onRoundComplete);
}
function onRoundComplete(){
  const result=E.scoreRound(S.round);
  S.lastResult={result,seat:S.match.turn};
  const {handTotal,net}=result;
  if (S.players[S.match.turn].kind==='human') recordHand(result.rowScores, handTotal);
  $('ds-hands').innerHTML=result.rowScores.map((sc,i)=>
    `<div class="ds-row"><span class="nm">${ROW_LABELS[i]}</span><span class="bd">${breakdownHTML(sc)}</span><b>${sc.total}</b></div>`).join('')
    + (result.heels ? `<div class="ds-row"><span class="nm">Starter</span><span class="bd">his heels, a Jack turned</span><b>2</b></div>` : '');
  const seatName = S.mode==='solo' ? 'Round complete' : `${esc(S.players[S.match.turn].name)} · round complete`;
  $('ds-eyebrow').textContent= seatName;
  $('ds-line').innerHTML=`${handTotal} <span class="dim">− 29 =</span> <span class="${net>=0?'pos':'neg'}">${net>=0?'+':''}${net}</span>`;
  $('ds-sub').textContent= net>=0 ? 'Pegging up the rail.' : 'Under par, pegging backwards.';
  renderGame();
  $('d-score').showModal();
}

function nextRound(){
  $('d-score').close();
  if (S.mode==='conquest'){ conquestAdvance(); return; }
  if (S.mode==='solo'){
    const challengeRound=S.lastResult.result;
    S.match.totals[0]+=S.lastResult.result.net;
    S.match.roundsPlayed[0]+=1;
    S.lastResult=null;
    if (S.challenge){
      if (challengeSoloStep(challengeRound)) return;
      S.cqDeal={ seed:E.randomSeed(), moves:[] };
      S.round=E.newRound(S.cqDeal.seed);
      saveChallengeSnapshot();
      renderGame();
      return;
    }
    if (S.match.totals[0]>=E.TARGET){
      const n=S.match.roundsPlayed[0];
      S.round=null; renderGame();
      $('do-title').textContent='You made it home';
      $('do-sub').textContent=`Reached ${S.match.totals[0]} in ${n} round${n===1?'':'s'}. Think you can do it in fewer?`;
      $('d-over').showModal();
      return;
    }
    S.round=E.newRound(E.randomSeed());
    renderGame();
    return;
  }
  const adv=E.applyRoundNet(S.match,S.lastResult.result.net);
  S.match=adv; S.lastResult=null;
  if (adv.outcome.kind!=='playing'){ S.round=null; renderGame(); return showMatchOver(adv); }
  S.round=E.newRound(adv.roundSeed);
  renderGame();
  const next=S.players[adv.turn];
  if (S.mode==='pass' && next.kind==='human'){
    $('dh-name').textContent=next.name;
    $('d-handoff').showModal();
  } else if (next.kind==='ai') runAiRound();
}

function runAiRound(){
  clearInterval(S.aiTimer);
  S.aiTimer=setInterval(()=>{
    const r=S.round;
    if(!r||r.complete){ clearInterval(S.aiTimer); return; }
    S.round=E.placeCard(r,E.aiChooseRow(r,S.difficulty));
    renderGame();
    if (S.round.complete){ clearInterval(S.aiTimer); startCount(S.round,'g',onRoundComplete); }
  },300);
}

/* Conquest turn cycle: seat 0 (you), then each AI opponent, all play one
   round per cycle. After the score sheet for the current seat, advance. */
function conquestAdvance(){
  const cq=S.cq, seat=S.match.turn;
  cq.totals[seat]+=S.lastResult.result.net;
  S.match.totals=cq.totals;
  S.match.roundsPlayed[seat]+=1;
  S.lastResult=null;
  const nextSeat=(seat+1)%cq.n;
  S.match.turn=nextSeat;
  if (nextSeat===0){
    // a full cycle done: everyone has played cq.rounds+1 rounds
    cq.rounds+=1;
    const me=cq.totals[0];
    const top=Math.max(...cq.totals);
    const anyHome=cq.totals.some((t)=>t>=cq.target);
    if (anyHome){
      if (me===top && cq.totals.filter((t)=>t===top).length===1){
        challengeWin(challengeStarsByPace(cq.rounds));
      } else {
        challengeFail();
      }
      return;
    }
  }
  beginConquestRound(nextSeat, E.randomSeed(), []);
  renderGame();
  if (S.players[nextSeat].kind==='ai') runConquestAiRound(nextSeat);
}
function runConquestAiRound(seat){
  clearInterval(S.aiTimer);
  const diff=S.cq.ais[seat-1].difficulty;
  S.aiTimer=setInterval(()=>{
    const r=S.round;
    if(!r||r.complete){ clearInterval(S.aiTimer); return; }
    S.round=E.placeCard(r,E.aiChooseRow(r,diff));
    renderGame();
    if (S.round.complete){ clearInterval(S.aiTimer); startCount(S.round,'g',onRoundComplete); }
  }, window.__fastCount?5:280);
}

function showMatchOver(m){
  const o=m.outcome;
  $('do-title').textContent= o.kind==='tie' ? "It's a tie" : `${S.players[o.player].name} wins`;
  $('do-sub').textContent=`${S.players[0].name} ${m.totals[0]} · ${S.players[1].name} ${m.totals[1]}`;
  $('d-over').showModal();
}

/* ====================================================================
   ACCOUNT, STATS, FRIENDS & CHALLENGES
   --------------------------------------------------------------------
   users/{uid}: { name, provider, friendCode, online, lastSeen,
                  stats:{wins,losses,ties,gamesPlayed,highestHand,
                         highestTotal,fastestWin,longestGame},
                  friends:{fuid:{name}}, challenges:{id:{from,fromName,code,createdAt}},
                  games:{code:{at}} }
   friendCodes/{code}: uid
   Sign-in: Google popup or anonymous guest (one click, no password).
   ==================================================================== */
const STAT_LABELS=[['currentGames','Current games'],['wins','Wins'],['losses','Losses'],['ties','Ties'],
  ['gamesPlayed','Games played'],['highestHand','Highest hand'],['highestTotal','Highest total'],
  ['fastestWin','Fastest win'],['longestGame','Longest game']];
const blankStats=()=>({wins:0,losses:0,ties:0,gamesPlayed:0,highestHand:0,highestTotal:0,fastestWin:0,longestGame:0});
const FRIEND_ALPHA='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const makeFriendCode=()=>Array.from({length:6},()=>FRIEND_ALPHA[Math.floor(Math.random()*FRIEND_ALPHA.length)]).join('');

function ensureAuthWatcher(){
  if(S.authWatched || typeof firebase==='undefined' || !firebase.auth) return;
  S.authWatched=true;
  firebase.auth().onAuthStateChanged(onAuth);
}
async function signInGoogle(){
  try{
    await loadFirebase();
    await loadFirebaseAuth(); // the auth SDK is only needed for Google
    ensureAuthWatcher();
    await firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider());
  }catch(e){ authError(e.message); }
}
/** Guest: a plain local session. No auth provider, no password, nothing stored. */
async function signInGuest(){
  try{
    await loadFirebase();
    S.pendingName=($('auth-name')&&$('auth-name').value.trim())||'';
    const uid='g'+Math.random().toString(36).slice(2,10)+Date.now().toString(36);
    await establishUser({uid, isAnonymous:true, displayName:null});
  }catch(e){ authError(e.message); }
}
function doSignOut(){
  try{
    if(S.uid) fdb.ref('users/'+S.uid+'/online').set(false).catch(()=>{});
    if(S.profile && S.profile.provider==='google' && firebase.auth) firebase.auth().signOut();
  }catch(e){}
  S.uid=null; S.profile=null; S.myName=''; S.friends={}; S.challenges={};
  for(const u in S.friendWatches){ S.friendWatches[u](); }
  S.friendWatches={}; S.friendInfo={};
  resetAccountState();
  renderAccount();
  if(S.view==='online' && !S.code) oShow('auth');
}
function authError(msg){ const e=$('auth-err'); if(e){ e.textContent=msg; e.classList.remove('hidden'); } }

async function onAuth(user){
  // Google auth state changes only. Never clobber an active guest session.
  if(!user){
    if(S.profile && S.profile.provider==='guest') return;
    S.uid=null; S.profile=null; renderAccount(); return;
  }
  await establishUser(user);
}
function resetAccountState(){
  S.profile=null;
  S.campaign=blankCampaign();
  S.activeSnap=null;
  S.friends={}; S.friendInfo={}; S.challenges={};
  for(const u in S.friendWatches){ try{ S.friendWatches[u](); }catch(e){} }
  S.friendWatches={};
  S.statsRecorded={};
}
async function establishUser(user){
  // Wipe any in-memory state from a previous account/guest in this browser
  // session so nothing leaks across accounts.
  resetAccountState();
  S.uid=user.uid;
  try{
    const snap=await fdb.ref('users/'+user.uid).get();
    if(snap.exists()){
      S.profile=snap.val();
      if(!S.profile.stats) S.profile.stats=blankStats();
    } else {
      const name=(user.displayName&&user.displayName.split(' ')[0]) || S.pendingName
        || 'Guest-'+Math.floor(1000+Math.random()*9000);
      const friendCode=makeFriendCode();
      S.profile={name, provider:user.isAnonymous?'guest':'google', friendCode,
        createdAt:Date.now(), online:true, stats:blankStats()};
      await fdb.ref('users/'+user.uid).set(S.profile);
      await fdb.ref('friendCodes/'+friendCode).set(user.uid);
    }
    S.myName=S.profile.name;
    loadCampaign(S.profile.campaign);
    S.activeSnap = S.profile.active || null;
    saveCampaign();
    // user-level presence for the friends list
    const meRef=fdb.ref('users/'+S.uid);
    meRef.update({online:true}).catch(()=>{});
    if(meRef.onDisconnect) meRef.onDisconnect().update({online:false,lastSeen:firebase.database.ServerValue.TIMESTAMP});
    watchSocial();
  }catch(e){ authError(e.message); }
  renderAccount();
  if(S.view==='online' && !S.code && S.uid) oShow('lobby');
}

function watchSocial(){
  fdb.ref('users/'+S.uid+'/friends').on('value',(snap)=>{
    S.friends=snap.exists()?snap.val():{};
    syncFriendWatches(); renderFriends();
  });
  fdb.ref('users/'+S.uid+'/challenges').on('value',(snap)=>{
    S.challenges=snap.exists()?snap.val():{};
    maybeShowChallenge();
  });
}
function syncFriendWatches(){
  for(const fuid in S.friends){
    if(S.friendWatches[fuid]) continue;
    const ref=fdb.ref('users/'+fuid);
    const cb=ref.on('value',(snap)=>{
      S.friendInfo[fuid]=snap.exists()?{name:snap.val().name,online:!!snap.val().online,stats:snap.val().stats}:null;
      renderFriends();
    });
    S.friendWatches[fuid]=()=>ref.off('value',cb);
  }
  for(const fuid in S.friendWatches){
    if(!(fuid in S.friends)){ S.friendWatches[fuid](); delete S.friendWatches[fuid]; delete S.friendInfo[fuid]; }
  }
}

/* ---------- stats ---------- */
function bumpStats(mut){
  if(!S.uid||!S.profile) return;
  mut(S.profile.stats);
  if(fdb) fdb.ref('users/'+S.uid+'/stats').set(S.profile.stats).catch(()=>{});
}
function recordHand(rowScores, handTotal){
  if(!S.uid) return;
  bumpStats((st)=>{
    const hi=Math.max(...rowScores.map((x)=>x.total));
    if(hi>(st.highestHand||0)) st.highestHand=hi;
    if(handTotal>(st.highestTotal||0)) st.highestTotal=handTotal;
  });
}
function recordMatchEnd(room){
  if(!S.uid||S.seat<0||!S.code||S.statsRecorded[S.code]) return;
  S.statsRecorded[S.code]=true;
  const rounds=Object.keys(room.rounds||{}).length;
  bumpStats((st)=>{
    st.gamesPlayed=(st.gamesPlayed||0)+1;
    if(room.result==='tie') st.ties=(st.ties||0)+1;
    else if(room.result==='p'+S.seat){
      st.wins=(st.wins||0)+1;
      if(!st.fastestWin||rounds<st.fastestWin) st.fastestWin=rounds;
    } else st.losses=(st.losses||0)+1;
    if(rounds>(st.longestGame||0)) st.longestGame=rounds;
  });
  addXp(room.result==='tie' ? XP_AWARDS.matchTie : room.result==='p'+S.seat ? XP_AWARDS.matchWin : XP_AWARDS.matchLoss, 'match');
  if(fdb) fdb.ref('users/'+S.uid+'/games/'+S.code).remove().catch(()=>{});
}
function trackGame(code){
  if(S.uid&&fdb) fdb.ref('users/'+S.uid+'/games/'+code).set({at:Date.now()}).catch(()=>{});
}

/* ---------- friends ---------- */
async function addFriendByCode(codeRaw){
  const code=(codeRaw||'').trim().toUpperCase();
  if(code.length<4) return friendError('Friend codes are six characters.');
  if(S.profile && code===S.profile.friendCode) return friendError("That's your own code.");
  try{
    const snap=await fdb.ref('friendCodes/'+code).get();
    if(!snap.exists()) return friendError('No player with that code.');
    const fuid=snap.val();
    const fsnap=await fdb.ref('users/'+fuid).get();
    if(!fsnap.exists()) return friendError('No player with that code.');
    const fname=fsnap.val().name||'Player';
    await fdb.ref('users/'+S.uid+'/friends/'+fuid).set({name:fname});
    await fdb.ref('users/'+fuid+'/friends/'+S.uid).set({name:S.profile.name});
    for(const id of ['friend-code','friend-code2']){ const el=$(id); if(el) el.value=''; }
  }catch(e){ friendError(e.message); }
}
function removeFriend(fuid){
  fdb.ref('users/'+S.uid+'/friends/'+fuid).remove().catch(()=>{});
  fdb.ref('users/'+fuid+'/friends/'+S.uid).remove().catch(()=>{});
}
function friendError(msg){ for(const id of ['friend-err','friend-err2']){ const e=$(id); if(e){ e.textContent=msg; e.classList.remove('hidden'); } } }

function renderFriends(){ renderFriendsInto('o-friends-list2','my-friend-code2'); updateBadges(); }
function renderFriendsInto(boxId, codeId){
  const box=$(boxId); if(!box) return;
  const mine=$(codeId); if(mine&&S.profile) mine.textContent=S.profile.friendCode;
  const fuids=Object.keys(S.friends||{});
  if(fuids.length===0){ box.innerHTML='<div class="pub-empty">No friends yet. swap codes to add one.</div>'; return; }
  box.innerHTML=fuids.map((fuid)=>{
    const info=S.friendInfo[fuid]||{name:(S.friends[fuid]||{}).name||'Player',online:false};
    return `<div class="pub-item"><div class="who"><span class="dot ${info.online?'on':'offl'}"></span>${esc(info.name)}
        <span class="age">${info.online?'online':'offline'}</span></div>
      <div class="frow">
        ${info.online?`<button class="btn btn-ghost mini" data-chal="${fuid}">challenge</button>`:''}
        <button class="btn btn-ghost mini" data-view="${fuid}">profile</button>
        <button class="btn btn-ghost mini" data-unfriend="${fuid}">remove</button>
      </div></div>`;
  }).join('');
  for(const b of box.querySelectorAll('[data-chal]')) b.addEventListener('click',()=>sendChallenge(b.dataset.chal));
  for(const b of box.querySelectorAll('[data-view]')) b.addEventListener('click',()=>openProfile(b.dataset.view));
  for(const b of box.querySelectorAll('[data-unfriend]')) b.addEventListener('click',()=>removeFriend(b.dataset.unfriend));
}

/* ---------- challenges ---------- */
async function sendChallenge(fuid){
  if(!S.uid) return;
  try{
    const code=await createTable({size:2, seatCfg:['open'], visibility:'private'});
    const id='c'+Date.now();
    await fdb.ref('users/'+fuid+'/challenges/'+id).set({
      from:S.uid, fromName:S.profile.name, code, createdAt:Date.now()});
    enterRoomAsHost(code);
  }catch(e){ friendError(e.message); }
}
function maybeShowChallenge(){
  updateBadges();
  if(S.view==='messages') renderMessages();
  if(S.code) return; // already at a table
  const entries=Object.entries(S.challenges||{})
    .filter(([,c])=>c && Date.now()-(c.createdAt||0) < 60*60*1000)
    .sort((a,b)=>(b[1].createdAt||0)-(a[1].createdAt||0));
  if(entries.length===0 || $('d-challenge').open) return;
  const [id,c]=entries[0];
  S.pendingChallenge={id,...c};
  $('dc-text').textContent=`${c.fromName} challenges you to a duel.`;
  $('d-challenge').showModal();
}
function acceptChallenge(){
  const c=S.pendingChallenge; if(!c) return;
  $('d-challenge').close();
  fdb.ref('users/'+S.uid+'/challenges/'+c.id).remove().catch(()=>{});
  S.pendingChallenge=null;
  show('online');
  joinByCode(c.code);
}
function declineChallenge(){
  const c=S.pendingChallenge; if(!c) return;
  $('d-challenge').close();
  fdb.ref('users/'+S.uid+'/challenges/'+c.id).remove().catch(()=>{});
  S.pendingChallenge=null;
}

/* ---------- profile ---------- */
async function openProfile(uid){
  const self=!uid||uid===S.uid;
  let prof, gamesCount=0, gameCodes=[];
  if(self){
    prof=S.profile;
    try{
      const gs=await fdb.ref('users/'+S.uid+'/games').get();
      if(gs.exists()){ gameCodes=Object.keys(gs.val()); gamesCount=gameCodes.length; }
    }catch(e){}
  } else {
    try{
      const snap=await fdb.ref('users/'+uid).get();
      if(!snap.exists()) return;
      prof=snap.val();
    }catch(e){ return; }
  }
  if(!prof) return;
  const st={...blankStats(),...(prof.stats||{})};
  st.currentGames=self?gamesCount:undefined;
  const camp = self ? S.campaign : (prof.campaign || { level: 1, stars: {} });
  const lv = levelFromXp(prof.xp);
  const grid=STAT_LABELS
    .filter(([k])=>!(k==='currentGames'&&!self))
    .map(([k,label])=>`<div class="stat"><div class="sv">${k==='currentGames'?gamesCount:(st[k]||0)}${(k==='fastestWin'||k==='longestGame')&&st[k]?' r':''}</div><div class="sl">${label}</div></div>`)
    .join('')
    + `<div class="stat"><div class="sv">${clearedCount(camp)}</div><div class="sl">Conquest cleared</div></div>`
    + `<div class="stat"><div class="sv">${totalStars(camp)}</div><div class="sl">Conquest stars</div></div>`;
  const isFriend=!self && S.friends && uid in S.friends;
  const banner=bannerById(prof.banner);
  $('dp-banner').style.background=banner.css;
  $('dp-name').textContent=prof.name||'Player';
  $('dp-level').textContent='Lv '+lv.level;
  $('dp-xp').style.width=Math.round((lv.into/lv.need)*100)+'%';
  $('dp-sub').textContent= self
    ? `your friend code: ${prof.friendCode||'-'} · ${lv.into}/${lv.need} xp to level ${lv.level+1}`
    : (prof.online?'online now':'offline');
  $('dp-stats').innerHTML=grid;
  const pick=$('dp-banners');
  if (self && prof.provider!=='guest'){
    pick.classList.remove('hidden');
    pick.innerHTML='<div class="sl" style="margin-bottom:6px">PROFILE BANNER</div>'+BANNERS.map((b)=>{
      const open=bannerUnlocked(b, prof, camp);
      const sel=(prof.banner||'lacquer')===b.id;
      return `<button class="banner-swatch ${sel?'sel':''} ${open?'':'lockd'}" data-banner="${b.id}"
        style="background:${b.css}" title="${b.name}${open?'':' (unlocks at '+b.needText+')'}" ${open?'':'disabled'}>${open?'':'🔒'}</button>`;
    }).join('');
    for(const b of pick.querySelectorAll('[data-banner]:not([disabled])'))
      b.addEventListener('click',()=>{
        S.profile.banner=b.dataset.banner;
        if(fdb) fdb.ref('users/'+S.uid+'/banner').set(b.dataset.banner).catch(()=>{});
        pushLeaderboard();
        openProfile(null);
      });
  } else {
    pick.classList.add('hidden'); pick.innerHTML='';
  }
  const cd=$('dp-cards');
  if (cd && self && prof.provider!=='guest'){
    cd.classList.remove('hidden');
    cd.innerHTML='<div class="sl" style="margin:14px 0 6px">CARD DESIGN</div><div class="cd-grid">'+CARD_DESIGNS.map(d=>{
      const open=cardDesignUnlocked(d,prof), sel=activeCardDesign()===d.id;
      return `<button class="cd-swatch dz-${d.id} ${sel?'sel':''} ${open?'':'lockd'}" data-cd="${d.id}"
        title="${d.name}${open?'':' \u2013 unlocks at '+d.needText}" ${open?'':'disabled'}>
        <span class="cd-mini"><span class="cd-pip">A\u2660</span></span>
        <span class="cd-name">${d.name}${open?'':' \ud83d\udd12'}</span></button>`;
    }).join('')+'</div>';
    for(const b of cd.querySelectorAll('[data-cd]:not([disabled])'))
      b.addEventListener('click',()=>{ S.profile.cardDesign=b.dataset.cd;
        if(fdb) fdb.ref('users/'+S.uid+'/cardDesign').set(b.dataset.cd).catch(()=>{}); openProfile(null); });
  } else if(cd){ cd.classList.add('hidden'); cd.innerHTML=''; }
  const fdp=$('dp-decks');
  if (fdp && self && prof.provider!=='guest'){
    fdp.classList.remove('hidden');
    fdp.innerHTML='<div class="sl" style="margin:14px 0 6px">DECK (CARD FACES)</div><div class="cd-grid fd-grid">'+FACE_DECK_DESIGNS.map(d=>{
      const open=faceDeckUnlocked(d,prof), sel=activeFaceDeck()===d.id;
      const prev = d.id==='none' ? '' : (window.FACE_DECKS && window.FACE_DECKS[d.id] ? window.FACE_DECKS[d.id]['SA'] : '');
      const mini = prev ? `style="background-image:url(${prev})"` : '';
      return `<button class="cd-swatch fd-swatch ${sel?'sel':''} ${open?'':'lockd'}" data-fd="${d.id}"
        title="${d.name}${open?'':' \\u2013 unlocks at '+d.needText}" ${open?'':'disabled'}>
        <span class="cd-mini fd-mini" ${mini}>${prev?'':'A\\u2660'}</span>
        <span class="cd-name">${d.name}${open?'':' \\ud83d\\udd12'}</span></button>`;
    }).join('')+'</div>';
    for(const b of fdp.querySelectorAll('[data-fd]:not([disabled])'))
      b.addEventListener('click',()=>{ S.profile.faceDeck=b.dataset.fd;
        if(fdb) fdb.ref('users/'+S.uid+'/faceDeck').set(b.dataset.fd).catch(()=>{}); openProfile(null); });
  } else if(fdp){ fdp.classList.add('hidden'); fdp.innerHTML=''; }
  $('dp-extra').innerHTML= self
    ? (gameCodes.length?`<div class="dp-games">Active tables: ${gameCodes.map((c)=>`<button class="btn btn-ghost mini" data-rejoin="${c}">${c}</button>`).join(' ')}</div>`:'')
      +`<div class="join-row" style="margin-top:12px"><input type="text" id="dp-rename" maxlength="16" placeholder="change display name"><button class="btn btn-ghost" id="dp-rename-go">rename</button></div>`
    : `<button class="btn ${isFriend?'btn-ghost':'btn-primary'}" id="dp-friend" style="width:100%;margin-top:12px">${isFriend?'Remove friend':'Add friend'}</button>`;
  if(self){
    for(const b of $('dp-extra').querySelectorAll('[data-rejoin]'))
      b.addEventListener('click',()=>{ $('d-profile').close(); show('online'); joinByCode(b.dataset.rejoin); });
    const rn=$('dp-rename-go');
    if(rn) rn.addEventListener('click',async()=>{
      const nn=$('dp-rename').value.trim(); if(!nn) return;
      S.profile.name=nn; S.myName=nn;
      await fdb.ref('users/'+S.uid+'/name').set(nn).catch(()=>{});
      renderAccount(); $('dp-name').textContent=nn;
    });
  } else {
    $('dp-friend').addEventListener('click',async()=>{
      if(isFriend) removeFriend(uid);
      else {
        await fdb.ref('users/'+S.uid+'/friends/'+uid).set({name:prof.name}).catch(()=>{});
        await fdb.ref('users/'+uid+'/friends/'+S.uid).set({name:S.profile.name}).catch(()=>{});
      }
      $('d-profile').close();
    });
  }
  $('d-profile').showModal();
}

async function openBoard(tab){
  S.boardTab = tab || S.boardTab || 'global';
  let rows=[];
  try{
    const snap=await fdb.ref('leaderboard').get();
    const all=snap.exists()?snap.val():{};
    rows=Object.entries(all).map(([uid,v])=>({uid,...v}));
    if(S.boardTab==='friends') rows=rows.filter((r)=>r.uid===S.uid||(S.friends&&r.uid in S.friends));
  }catch(e){}
  rows.sort((a,b)=>(b.stars||0)-(a.stars||0)||(b.cleared||0)-(a.cleared||0)||(b.plevel||0)-(a.plevel||0));
  rows=rows.slice(0,20);
  const trophies=['🥇','🥈','🥉'];
  $('db-list').innerHTML = rows.length===0
    ? '<div class="pub-empty">Nobody on the board yet.</div>'
    : rows.map((r,i)=>`<div class="board-row ${r.uid===S.uid?'me':''}">
        <span class="rank">${trophies[i]||'#'+(i+1)}</span>
        <span class="bswatch" style="background:${bannerById(r.banner).css}"></span>
        <span class="bname">${esc(r.name||'Player')} <span class="age">Lv ${r.plevel||1}</span></span>
        <span class="bstars">${r.stars||0} ★</span>
      </div>`).join('');
  $('db-global').setAttribute('aria-pressed', String(S.boardTab==='global'));
  $('db-friends').setAttribute('aria-pressed', String(S.boardTab==='friends'));
  if(!$('d-board').open) $('d-board').showModal();
}

function renderAccount(){
  const bar=$('o-account'); if(!bar) return;
  if(!S.uid||!S.profile){ bar.innerHTML=''; renderLobbyGates(); return; }
  const lv=levelFromXp(S.profile.xp);
  const initial=(S.profile.name||'?').trim().charAt(0).toUpperCase();
  bar.innerHTML=`<div class="acct-chip">
      <div class="acct-av">${esc(initial)}</div>
      <div class="acct-meta">
        <div class="acct-name">${esc(S.profile.name)}</div>
        <div class="acct-lv"><span class="lvchip">Lv ${lv.level}</span><span class="acct-xp"><i style="width:${Math.round((lv.into/lv.need)*100)}%"></i></span></div>
      </div>
    </div>
    <button class="btn btn-ghost mini" id="acct-profile">profile</button>
    <button class="btn btn-ghost mini" id="acct-out">sign out</button>`;
  $('acct-profile').addEventListener('click',()=>openProfile(null));
  $('acct-out').addEventListener('click',doSignOut);
  renderLobbyGates();
}

/* ====================================================================
   ONLINE TABLE. 2–4 players, AI seat-fillers, live spectating, rejoin
   --------------------------------------------------------------------
   rooms/{code}: size, players{p0..p3:{name,joined,ai?,difficulty?,connected}},
                 status, currentRound, turn, totals{t0..}, rounds{i:{net0..}},
                 live{round,seat,seed,moves[]}, result ('p0'..'p3'|'tie')
   publicRooms/{code}: {host,createdAt,size}
   - Everyone plays each round in seat order with their own fresh shuffle.
   - AI seats are played by the HOST's client (so the host must be online
     for AI turns. the table simply waits otherwise).
   - Presence: each client flags connected/disconnected via onDisconnect;
     a dropped player's seat is shown as held open until they rejoin with
     the same name. The live move log restores their half-played round.
   ==================================================================== */
function oShow(part){
  for (const p of ['o-auth','o-lobby','o-make','o-find','o-conquest-panel','o-setup','o-wait','o-game']) $(p).classList.toggle('hidden',p!=='o-'+part);
}
const seatKeys=(room)=>Array.from({length:room.size||2},(_,k)=>'p'+k);
const seatName=(room,k)=>{const p=(room.players||{})['p'+k];return p?p.name:'open seat';};
async function openOnline(){
  show('online');
  if (!firebaseConfigured()) return oShow('setup');
  oShow(S.uid?'lobby':'auth');
  renderSeatConfig();
  renderAccount();
  try{
    await loadFirebase();
    try{ await loadFirebaseAuth(); ensureAuthWatcher(); }catch(e){}
    if (!S.pubUnwatch){
      const ref=fdb.ref('publicRooms');
      const cb=ref.on('value',(snap)=>{ S.publicRooms=snap.exists()?snap.val():{}; renderPublicRooms(); });
      S.pubUnwatch=()=>ref.off('value',cb);
    }
  }catch(e){ $('o-public').innerHTML=`<div class="pub-empty">Couldn't reach the lobby. check your connection.</div>`; }
}
function renderSeatConfig(){
  const box=$('o-seats'); if(!box) return;
  while (S.seatConfig.length < S.roomSize-1) S.seatConfig.push('open');
  S.seatConfig.length = S.roomSize-1;
  box.innerHTML = S.seatConfig.map((cfg,idx)=>`
    <div class="row"><span class="lbl">Seat ${idx+2}</span>
      ${['open','easy','medium','hard'].map(v=>
        `<span class="pill" role="button" tabindex="0" data-seat="${idx}" data-cfg="${v}"
           aria-pressed="${cfg===v}">${v==='open'?'open':v+' AI'}</span>`).join('')}
    </div>`).join('');
  for (const p of box.querySelectorAll('.pill')){
    const pick=()=>{ S.seatConfig[+p.dataset.seat]=p.dataset.cfg; renderSeatConfig(); };
    p.addEventListener('click',pick);
    p.addEventListener('keydown',(e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); pick(); }});
  }
}
function renderPublicRooms(){
  const box=$('o-public'); if(!box) return;
  const now=Date.now();
  const entries=Object.entries(S.publicRooms||{})
    .filter(([,v])=>v && now-(v.createdAt||0) < 24*60*60*1000)
    .sort((a,b)=>(b[1].createdAt||0)-(a[1].createdAt||0));
  if (entries.length===0){ box.innerHTML='<div class="pub-empty">No open tables right now. open one above.</div>'; return; }
  box.innerHTML=entries.map(([code,v])=>{
    const mins=Math.max(0,Math.round((now-(v.createdAt||0))/60000));
    const playing=v.status==='playing';
    return `<div class="pub-item"><div class="who">${esc(v.host||'Someone')}'s table<span class="age">${v.size||2} seats · ${playing?'in play':'open'} · ${mins<1?'just now':mins+' min ago'}</span></div>
      <button class="btn btn-ghost" data-join="${code}">${playing?'Watch':'Join'}</button></div>`;
  }).join('');
  for (const b of box.querySelectorAll('[data-join]'))
    b.addEventListener('click',()=>joinByCode(b.dataset.join));
}
function oError(msg){ const e=$('o-err'); e.textContent=msg; e.classList.remove('hidden'); }

const AI_SEAT_NAMES={easy:'Deckhand',medium:'Navigator',hard:'Captain'};

async function createTable({size, seatCfg, visibility}){
  const db=await loadFirebase();
  const code=makeRoomCode();
  const players={p0:{name:S.myName,uid:S.uid,joined:true,connected:true}};
  const totals={};
  for(let k=0;k<size;k++) totals['t'+k]=0;
  seatCfg.forEach((cfg,idx)=>{
    if(cfg!=='open') players['p'+(idx+1)]={
      name:`${AI_SEAT_NAMES[cfg]} (AI ${idx+2})`, joined:true, ai:true, difficulty:cfg, connected:true };
  });
  await db.ref('rooms/'+code).set({
    createdAt:Date.now(), size, players,
    rounds:{}, currentRound:0, turn:0, totals,
    status:'waiting', visibility
  });
  if (visibility==='public') await db.ref('publicRooms/'+code).set({host:S.myName,createdAt:Date.now(),size});
  return code;
}
function enterRoomAsHost(code){
  S.code=code; S.seat=0; S.startedRound=-1; S.aiJob=''; S.oCounted=-1;
  $('o-room-code').textContent=code; $('o-wait-title').textContent='Room '+code;
  show('online'); oShow('wait'); watchRoom(); registerPresence(); startRosterTick(); trackGame(code);
}
async function oCreate(){
  if(!S.uid) return oShow('auth');
  try{
    const code=await createTable({size:S.roomSize, seatCfg:S.seatConfig, visibility:S.visibility});
    enterRoomAsHost(code);
  }catch(e){ oError(e.message); }
}

/** Join OR rejoin: a seat already carrying your name is yours to take back. */
async function joinByCode(code){
  if(!S.uid) return oShow('auth');
  const name=S.myName;
  if(!code||code.length!==5) return oError('Room codes are five letters.');
  try{
    const db=await loadFirebase();
    const snap=await db.ref('rooms/'+code).get();
    if(!snap.exists()){
      db.ref('publicRooms/'+code).remove().catch(()=>{});
      return oError('Room not found. check the code.');
    }
    const room=snap.val();
    const size=room.size||2;
    let seat=-1;
    for(let k=0;k<size;k++){
      const p=(room.players||{})['p'+k];
      if(p && p.joined && !p.ai && (p.uid===S.uid || p.name===name)){ seat=k; break; } // rejoin
    }
    if(seat===-1) for(let k=0;k<size;k++){
      const p=(room.players||{})['p'+k];
      if(!p || !p.joined){ seat=k; break; }                            // fresh open seat
    }
    if(seat===-1) for(let k=0;k<size;k++){
      const p=(room.players||{})['p'+k];
      if(p && !p.ai && p.connected===false && p.disconnectedAt
         && Date.now()-p.disconnectedAt>=TAKEOVER_MS()){ seat=k; break; } // abandoned seat
    }
    if(seat>=0){
      const existing=(room.players||{})['p'+seat];
      if(!existing || (existing.uid!==S.uid && existing.name!==name))
        await db.ref('rooms/'+code+'/players/p'+seat).set({name,uid:S.uid,joined:true,connected:true});
      trackGame(code);
    }
    S.code=code; S.seat=seat; S.startedRound=-1; S.aiJob=''; S.oCounted=-1; // seat -1 → spectator
    if (seat===0 && room.status==='waiting'){
      $('o-room-code').textContent=code; $('o-wait-title').textContent='Room '+code; oShow('wait');
    }
    watchRoom();
    if(seat>=0) registerPresence();
    startRosterTick();
  }catch(e){ oError(e.message); }
}

async function claimSeat(k){
  if(!S.room||!S.code||S.seat>=0) return;
  const p=(S.room.players||{})['p'+k];
  if(!p || p.ai || p.connected!==false || !p.disconnectedAt || Date.now()-p.disconnectedAt<TAKEOVER_MS()) return;
  await fdb.ref('rooms/'+S.code+'/players/p'+k).set({name:S.myName,uid:S.uid,joined:true,connected:true});
  S.seat=k; S.startedRound=-1; S.oCounted=-1;
  registerPresence(); trackGame(S.code);
}

function registerPresence(){
  try{
    const ref=fdb.ref('rooms/'+S.code+'/players/p'+S.seat);
    ref.update({connected:true, disconnectedAt:null}).catch(()=>{});
    if (ref.onDisconnect) ref.onDisconnect().update({
      connected:false,
      disconnectedAt: firebase.database.ServerValue.TIMESTAMP
    });
  }catch(e){}
}
function startRosterTick(){
  if(S.rosterTick) clearInterval(S.rosterTick);
  S.rosterTick=setInterval(()=>{
    if(S.view!=='online'||!S.room) return;
    if(S.count && S.count.active) return;
    if(S.room.status==='waiting'){ $('o-roster').innerHTML=rosterHTML(S.room); bindClaims($('o-roster')); }
    else renderOnline();
  },5000);
}

function watchRoom(){
  if(S.unwatch) S.unwatch();
  const r=fdb.ref('rooms/'+S.code);
  const cb=r.on('value',(snap)=>{ S.room=snap.exists()?snap.val():null; onRoomUpdate(); });
  S.unwatch=()=>r.off('value',cb);
}
function leaveRoom(){
  cancelCount();
  if(S.aiTimerOnline){ clearInterval(S.aiTimerOnline); S.aiTimerOnline=null; }
  if(S.rosterTick){ clearInterval(S.rosterTick); S.rosterTick=null; }
  if (S.room && S.code){
    if (S.seat===0 && S.room.status==='waiting'){
      fdb.ref('rooms/'+S.code).remove().catch(()=>{});
      fdb.ref('publicRooms/'+S.code).remove().catch(()=>{});
    } else if (S.seat>=0){
      fdb.ref('rooms/'+S.code+'/players/p'+S.seat).update({connected:false,disconnectedAt:Date.now()}).catch(()=>{});
    }
  }
  if(S.unwatch){ S.unwatch(); S.unwatch=null; }
  S.code=null; S.room=null; S.oRound=null; S.oMoves=[]; S.startedRound=-1; S.aiJob=''; S.oCounted=-1; S.seat=0;
  show('home');
}
const normMoves=(m)=>Array.isArray(m)?m.slice():m?Object.values(m):[];

function rosterHTML(room){
  const size=room.size||2;
  let out='';
  const now=Date.now();
  for(let k=0;k<size;k++){
    const p=(room.players||{})['p'+k];
    if(!p||!p.joined){ out+=`<span class="chip open">seat ${k+1} · open</span>`; continue; }
    const off=!p.ai && p.connected===false;
    const claimable=off && p.disconnectedAt && now-p.disconnectedAt>=TAKEOVER_MS() && S.seat===-1;
    const heldFor=off && p.disconnectedAt ? Math.max(0, Math.ceil((TAKEOVER_MS()-(now-p.disconnectedAt))/1000)) : 0;
    const profAttr=p.uid&&p.uid!==S.uid&&!p.ai?` data-uid="${p.uid}" role="button" tabindex="0" title="view profile"`:'';
    out+=`<span class="chip ${off?'off':''} ${profAttr?'clicky':''}"${profAttr}><span class="dot"></span>${esc(p.name)}${k===S.seat?' (you)':''}
      ${p.ai?'<span class="tag-ai">AI</span>':''}
      ${off ? (claimable
        ? `<button class="btn btn-ghost claim" data-claim="${k}">take seat</button>`
        : `<span class="held">seat held${heldFor>0?' '+heldFor+'s':''}</span>`) : ''}</span>`;
  }
  if(S.seat===-1) out+=`<span class="chip"><span class="dot" style="background:#9a8f7a"></span>You. spectating</span>`;
  return out;
}
function bindClaims(container){
  for (const b of container.querySelectorAll('[data-claim]'))
    b.addEventListener('click',(e)=>{ e.stopPropagation(); claimSeat(+b.dataset.claim); });
  for (const c of container.querySelectorAll('[data-uid]'))
    c.addEventListener('click',()=>openProfile(c.dataset.uid));
}

function onRoomUpdate(){
  const room=S.room;
  if(!room){ oShow('lobby'); return oError('The room was closed.'); }
  const size=room.size||2;

  // Host: start the game once every seat is filled.
  if(S.seat===0 && room.status==='waiting'){
    const full=seatKeys(room).every((pk)=>room.players&&room.players[pk]&&room.players[pk].joined);
    if(full){
      fdb.ref('rooms/'+S.code).update({status:'playing'});
      if(room.visibility==='public') fdb.ref('publicRooms/'+S.code).update({status:'playing'}).catch(()=>{});
      return;
    }
  }
  if(room.status==='waiting'){
    $('o-room-code').textContent=S.code; $('o-wait-title').textContent='Room '+S.code;
    $('o-roster').innerHTML=rosterHTML(room);
    bindClaims($('o-roster'));
    return oShow('wait');
  }

  const i=room.currentRound;
  const entry=(room.rounds||{})[i]||{};
  const mySubmitted=S.seat>=0 && entry['net'+S.seat]!==undefined;

  // My turn and I haven't started this round locally yet:
  if(S.seat>=0 && room.status==='playing' && S.startedRound!==i && room.turn===S.seat && !mySubmitted){
    S.startedRound=i; S.oCounted=-1;
    const live=room.live;
    if (live && live.round===i && live.seat===S.seat && live.seed!==undefined){
      // Rejoin: rebuild my in-progress round from the published move log.
      S.oSeed=live.seed; S.oMoves=normMoves(live.moves);
      let r=E.newRound(S.oSeed);
      for (const m of S.oMoves) r=E.placeCard(r,m);
      S.oRound=r;
    } else {
      S.oSeed=E.randomSeed(); S.oMoves=[];
      S.oRound=E.newRound(S.oSeed);
      fdb.ref('rooms/'+S.code+'/live').set({round:i,seat:S.seat,seed:S.oSeed,moves:[]}).catch(()=>{});
    }
  }

  // Host plays AI seats when their turn comes.
  if(S.seat===0 && room.status==='playing'){
    const tp=(room.players||{})['p'+room.turn];
    if(tp && tp.ai && entry['net'+room.turn]===undefined && S.aiJob!==i+':'+room.turn){
      runRemoteAi(i, room.turn, tp.difficulty||'medium', size);
    }
  }

  // Host advances when every seat's net for this round is in.
  if(S.seat===0 && room.status==='playing'){
    let all=true;
    for(let k=0;k<size;k++) if(entry['net'+k]===undefined){ all=false; break; }
    if(all){
      const totals={};
      let best=-Infinity, bestCount=0, bestSeat=0, anyHome=false;
      for(let k=0;k<size;k++){
        const t=(room.totals['t'+k]||0)+entry['net'+k];
        totals['t'+k]=t;
        if(t>=E.TARGET) anyHome=true;
        if(t>best){ best=t; bestSeat=k; bestCount=1; } else if(t===best) bestCount++;
      }
      const updates={ totals };
      if(anyHome){
        updates.status='done'; updates.result=bestCount>1?'tie':'p'+bestSeat;
        fdb.ref('publicRooms/'+S.code).remove().catch(()=>{});
      }
      else { updates.currentRound=i+1; updates.turn=0; }
      fdb.ref('rooms/'+S.code).update(updates);
    }
  }
  renderOnline();
}

/** Host-side AI runner: publishes moves live so everyone can watch. */
function runRemoteAi(roundIndex, seat, difficulty, size){
  S.aiJob=roundIndex+':'+seat;
  if(S.aiTimerOnline) clearInterval(S.aiTimerOnline);
  const seed=E.randomSeed();
  let r=E.newRound(seed);
  const moves=[];
  fdb.ref('rooms/'+S.code+'/live').set({round:roundIndex,seat,seed,moves:[]}).catch(()=>{});
  S.aiTimerOnline=setInterval(()=>{
    if(!S.room || S.room.status!=='playing'){ clearInterval(S.aiTimerOnline); return; }
    if(r.complete){
      clearInterval(S.aiTimerOnline); S.aiTimerOnline=null;
      const net=E.scoreRound(r).net;
      fdb.ref('rooms/'+S.code).update({
        ['rounds/'+roundIndex+'/net'+seat]:net,
        turn:(seat+1)%size
      }).catch(()=>{});
      return;
    }
    const m=E.aiChooseRow(r,difficulty);
    r=E.placeCard(r,m);
    moves.push(m);
    fdb.ref('rooms/'+S.code+'/live/moves').set(moves.slice()).catch(()=>{});
  }, window.__fastCount ? 5 : 350);
}

function historyHTML(room){
  const size=room.size||2;
  const rounds=room.rounds||{};
  const keys=Object.keys(rounds).map(Number).sort((a,b)=>a-b);
  if(keys.length===0) return '';
  const fmt=(n)=>n===undefined?'…':(n>=0?'+':'')+n;
  return keys.map(k=>{
    const e=rounds[k]||{};
    const parts=[];
    for(let s=0;s<size;s++) parts.push(`<b>${esc(seatName(room,s))}</b> ${fmt(e['net'+s])}`);
    return `R${k+1}: `+parts.join(' · ');
  }).join('<br>');
}

function renderOnline(){
  const room=S.room; if(!room||room.status==='waiting') return;
  oShow('game');
  const size=room.size||2;
  $('o-round').textContent=`Round ${room.currentRound+1}`;
  const lanes=[];
  for(let k=0;k<size;k++) lanes.push({name:seatName(room,k)+(k===S.seat?' (you)':''), total:room.totals['t'+k]||0});
  $('o-rail').innerHTML=railHTML(lanes, room.status==='playing'?room.turn:-1);
  $('o-game-roster').innerHTML=rosterHTML(room);
  bindClaims($('o-game-roster'));
  $('o-history').innerHTML=historyHTML(room);

  if(room.status==='done'){
    recordMatchEnd(room);
    const iWon=S.seat>=0 && room.result==='p'+S.seat;
    $('do-title').textContent= room.result==='tie'?"It's a tie": iWon?'You win the table':`${seatName(room,+room.result.slice(1))} takes it`;
    $('do-sub').textContent=lanes.map(l=>`${l.name.replace(' (you)','')} ${l.total}`).join(' · ');
    $('o-play').innerHTML=''; $('o-spectate').innerHTML=''; $('o-waiting').classList.add('hidden');
    if(!$('d-over').open) $('d-over').showModal();
    return;
  }

  const entry=(room.rounds||{})[room.currentRound]||{};
  const mySubmitted=S.seat>=0 && entry['net'+S.seat]!==undefined;
  const myTurn=S.seat>=0 && room.turn===S.seat && !mySubmitted;
  const r=S.oRound;

  if(myTurn && r){
    $('o-spectate').innerHTML=''; $('o-waiting').classList.add('hidden');
    const counting=S.count && S.count.active && S.count.prefix==='o';
    if(r.complete && S.oCounted!==room.currentRound && !counting){
      startCount(r,'o',()=>{ S.oCounted=room.currentRound; renderOnline(); });
      return;
    }
    const rowScores=r.complete && !counting ? E.scoreRound(r).rowScores : null;
    const head = r.complete
      ? `<div class="draw"><div><div class="label">Starter</div><div class="sub">${counting?'counting the hands…':'Counts in all five hands.'}</div></div>${cardHTML(r.starter,'lg',false,true, counting&&S.count.set.has(4))}</div>`
      : `<div class="draw"><div><div class="label">Your card</div><div class="sub">Tap a hand or press 1–4. the table is watching.</div></div>${cardHTML(r.current,'lg',false,true)}</div>`;
    const callout = counting ? calloutHTML('o', S.count) : '';
    const submit = r.complete && !counting
      ? `<button class="btn btn-primary" id="o-submit" style="width:100%;margin-top:6px">Submit ${E.scoreRound(r).net>=0?'+':''}${E.scoreRound(r).net}</button>` : '';
    $('o-play').innerHTML=head+callout+rowsHTML(r,(i)=>!counting&&E.canPlace(r,i),rowScores, counting?S.count:null)+submit;
    if (counting){ const sk=$('o-skip'); if(sk) sk.addEventListener('click',skipCount); }
    for (const b of $('o-play').querySelectorAll('.row-btn:not([disabled])'))
      b.addEventListener('click',()=>{
        if(!E.canPlace(S.oRound,+b.dataset.row)) return;
        S.oRound=E.placeCard(S.oRound,+b.dataset.row);
        S.oMoves.push(+b.dataset.row);
        fdb.ref('rooms/'+S.code+'/live/moves').set(S.oMoves.slice()).catch(()=>{});
        renderOnline();
      });
    const sb=$('o-submit');
    if(sb) sb.addEventListener('click',()=>{
      const res=E.scoreRound(S.oRound);
      recordHand(res.rowScores, res.handTotal);
      const net=res.net;
      fdb.ref('rooms/'+S.code).update({
        ['rounds/'+room.currentRound+'/net'+S.seat]:net,
        turn:(S.seat+1)%size
      });
    });
    return;
  }

  // Not my turn: watch whoever is placing, move for move.
  $('o-play').innerHTML='';
  const live=room.live;
  const turnPlayer=(room.players||{})['p'+room.turn];
  const turnName=turnPlayer?turnPlayer.name:'…';
  if (live && live.round===room.currentRound && live.seat!==S.seat && live.seed!==undefined){
    let lr=E.newRound(live.seed);
    for (const m of normMoves(live.moves)) lr=E.placeCard(lr,m);
    const liveName=seatName(room,live.seat);
    const rowScores=lr.complete?E.scoreRound(lr).rowScores:null;
    const livePlayer=(room.players||{})['p'+live.seat];
    const liveOff=livePlayer && !livePlayer.ai && livePlayer.connected===false;
    const head=lr.complete
      ? `<div class="draw"><div><div class="label">${esc(liveName)}'s starter</div><div class="sub">Counting up their five hands…</div></div>${cardHTML(lr.starter,'lg',false,true)}</div>`
      : liveOff
        ? `<div class="draw"><div><div class="label">${esc(liveName)} disconnected<span class="live-badge" style="background:var(--brass-dim)">SEAT HELD</span></div><div class="sub">Board frozen. They can rejoin with the same name and code.</div></div>${cardHTML(lr.current,'lg',false,true)}</div>`
        : `<div class="draw"><div><div class="label">${esc(liveName)} is placing<span class="live-badge">LIVE</span></div><div class="sub">Every move shows as they make it.</div></div>${cardHTML(lr.current,'lg',false,true)}</div>`;
    $('o-spectate').innerHTML=head+rowsHTML(lr,()=>false,rowScores);
    $('o-waiting').classList.add('hidden');
  } else {
    $('o-spectate').innerHTML='';
    $('o-waiting').classList.remove('hidden');
    const off=turnPlayer && !turnPlayer.ai && turnPlayer.connected===false;
    $('o-waiting-text').textContent= off
      ? `${turnName} is disconnected. Their seat is held while the table waits.`
      : `${turnName} is playing their round…`;
  }
}

/* ====================================================================
   WIRING
   ==================================================================== */
$('tile-solo').addEventListener('click',()=>startMatch('solo'));
$('splash-offline').addEventListener('click',()=>{
  $('offline-tiles').classList.toggle('hidden');
  $('splash-offline').setAttribute('aria-expanded', String(!$('offline-tiles').classList.contains('hidden')));
});
$('splash-online').addEventListener('click',openOnline);
// hub navigation
function requireAuth(then){ if(!S.uid){ oShow('auth'); return; } then(); }
$('hub-make').addEventListener('click',()=>requireAuth(()=>{ renderSeatConfig(); oShow('make'); }));
$('hub-find').addEventListener('click',()=>requireAuth(()=>{ renderPublicRooms(); renderFriends(); oShow('find'); }));
$('hub-conquest').addEventListener('click',()=>{
  if(!S.uid){ oShow('auth'); return; }
  if(S.profile && S.profile.provider==='guest'){ renderConquestPanel(); oShow('conquest-panel'); return; }
  openMap();
});
$('make-back').addEventListener('click',()=>oShow('lobby'));
$('find-back').addEventListener('click',()=>oShow('lobby'));
$('conq-back').addEventListener('click',()=>oShow('lobby'));
$('map-back').addEventListener('click',()=>{ if(S.mapTick) clearInterval(S.mapTick); show('online'); oShow('lobby'); });
$('map-board').addEventListener('click',()=>openBoard());
$('map-board-lobby').addEventListener('click',()=>openBoard());
$('db-global').addEventListener('click',()=>openBoard('global'));
$('db-friends').addEventListener('click',()=>openBoard('friends'));
$('db-close').addEventListener('click',()=>$('d-board').close());
$('dl-play').addEventListener('click',startLevel);
$('dl-close').addEventListener('click',()=>$('d-level').close());
$('dcr-map').addEventListener('click',()=>{ $('d-chal').close(); openMap(); });
$('dcr-retry').addEventListener('click',()=>{ $('d-chal').close(); startLevel(); });
$('dcr-next').addEventListener('click',()=>{ $('d-chal').close();
  const nxt=LEVELS.find((x)=>x.id===(S.lastClearedLevel||0)+1);
  if(nxt){ S.pendingLevel=nxt; startLevel(); } else openMap(); });
for(const b of document.querySelectorAll('.botnav-btn')) b.addEventListener('click',()=>gotoTab(b.dataset.tab));
{ const fa=$('friend-add2'); if(fa) fa.addEventListener('click',()=>addFriendByCode($('friend-code2').value)); }
window.__cc={ get S(){return S;}, LEVELS, challengeWin, challengeFail, refreshLives, renderMap, openLevel, openMap, levelFromXp, totalStars, gotoTab, CARD_DESIGNS, FACE_DECK_DESIGNS, updateBadges };
$('tile-ai').addEventListener('click',(e)=>{ if(e.target.closest('.pill')) return; startMatch('ai'); });
$('tile-pass').addEventListener('click',()=>startMatch('pass'));
for (const p of document.querySelectorAll('#diff-picker .pill')){
  const pick=()=>{ S.difficulty=p.dataset.d;
    document.querySelectorAll('#diff-picker .pill').forEach(x=>x.setAttribute('aria-pressed',String(x===p))); };
  p.addEventListener('click',(e)=>{ e.stopPropagation(); pick(); });
  p.addEventListener('keydown',(e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); e.stopPropagation(); pick(); }});
}
for (const p of document.querySelectorAll('.size-row .pill')){
  const pick=()=>{ S.roomSize=+p.dataset.n;
    document.querySelectorAll('.size-row .pill').forEach(x=>x.setAttribute('aria-pressed',String(x===p)));
    renderSeatConfig(); };
  p.addEventListener('click',pick);
  p.addEventListener('keydown',(e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); pick(); }});
}
for (const p of document.querySelectorAll('.vis-row .pill')){
  const pick=()=>{ S.visibility=p.dataset.v;
    document.querySelectorAll('.vis-row .pill').forEach(x=>x.setAttribute('aria-pressed',String(x===p)));
    $('o-create').textContent = S.visibility==='public' ? 'Open a table' : 'Create a private room'; };
  p.addEventListener('click',pick);
  p.addEventListener('keydown',(e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); pick(); }});
}
$('btn-quit').addEventListener('click',()=>{
  ['d-score','d-handoff','d-over'].forEach(d=>{ if($(d).open)$(d).close(); });
  if (S.challenge){ challengeFail(); return; }
  cancelCount(); clearInterval(S.aiTimer); S.match=null; S.round=null; show('home'); });
$('ds-continue').addEventListener('click',nextRound);
$('dh-ready').addEventListener('click',()=>$('d-handoff').close());
$('do-rematch').addEventListener('click',()=>{ $('d-over').close();
  if(S.view==='online'){ leaveRoom(); openOnline(); } else startMatch(S.mode); });
$('do-home').addEventListener('click',()=>{ $('d-over').close(); if(S.view==='online') leaveRoom(); else { S.match=null; show('home'); } });
$('btn-info').addEventListener('click',()=>$('d-rules').showModal());
$('dr-close').addEventListener('click',()=>$('d-rules').close());
$('auth-google').addEventListener('click',signInGoogle);
$('auth-guest').addEventListener('click',signInGuest);
$('auth-back').addEventListener('click',()=>show('home'));
$('dp-close').addEventListener('click',()=>$('d-profile').close());
$('dc-accept').addEventListener('click',acceptChallenge);
$('dc-decline').addEventListener('click',declineChallenge);
$('o-create').addEventListener('click',oCreate);
$('o-join').addEventListener('click',()=>joinByCode($('o-code').value.trim().toUpperCase()));
$('o-back').addEventListener('click',()=>show('home'));
$('o-setup-back').addEventListener('click',()=>show('home'));
$('o-cancel').addEventListener('click',leaveRoom);
$('o-leave').addEventListener('click',leaveRoom);

// ----- settings panel -----
function openSettings(){
  $('set-sound').setAttribute('aria-checked', String(S.sound!==false));
  $('set-motion').setAttribute('aria-checked', String(!!S.reduceMotion));
  $('set-fast').setAttribute('aria-checked', String(!!window.__fastCount));
  const acc=$('set-account');
  if (S.uid && S.profile){
    acc.innerHTML=`<div class="set-row"><span>Signed in as <b>${esc(S.profile.name)}</b></span>
      <button class="btn btn-ghost mini" id="set-signout">sign out</button></div>`;
    $('set-signout').addEventListener('click',()=>{ $('d-settings').close(); doSignOut(); });
  } else {
    acc.innerHTML=`<div class="set-row"><span>Not signed in</span></div>`;
  }
  $('d-settings').showModal();
}
function toggleSetting(el, apply){
  const on = el.getAttribute('aria-checked')!=='true';
  el.setAttribute('aria-checked', String(on));
  apply(on);
}
$('btn-settings').addEventListener('click',openSettings);
$('set-close').addEventListener('click',()=>$('d-settings').close());
$('set-rules').addEventListener('click',()=>{ $('d-settings').close(); $('d-rules').showModal(); });
$('set-sound').addEventListener('click',function(){ toggleSetting(this,(on)=>{ S.sound=on; }); });
$('set-motion').addEventListener('click',function(){ toggleSetting(this,(on)=>{ S.reduceMotion=on; document.body.classList.toggle('reduce-motion',on); }); });
$('set-fast').addEventListener('click',function(){ toggleSetting(this,(on)=>{ window.__fastCount=on; }); });

document.addEventListener('keydown',(e)=>{
  if(e.key<'1'||e.key>'4'||e.repeat) return;
  const i=+e.key-1;
  if(S.count && S.count.active) return;
  if(S.view==='game' && S.round && S.players[S.match.turn].kind==='human'){ place(i); }
  else if(S.view==='online' && S.seat>=0 && S.oRound && !S.oRound.complete && E.canPlace(S.oRound,i)){
    const room=S.room;
    if(room && room.turn===S.seat){
      S.oRound=E.placeCard(S.oRound,i);
      S.oMoves.push(i);
      fdb.ref('rooms/'+S.code+'/live/moves').set(S.oMoves.slice()).catch(()=>{});
      renderOnline();
    }
  }
});

