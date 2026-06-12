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
  campaign:{level:1, stars:{}, lives:5, lastLifeAt:Date.now()}, challenge:null, pendingLevel:null, lastClearedLevel:null, mapTick:null,
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

function show(view){
  S.view = view;
  for (const v of ['home','game','online','map']) $('view-'+v).classList.toggle('hidden', v!==view);
  $('btn-quit').classList.toggle('hidden', view!=='game');
  window.scrollTo(0,0);
}

/* ---------- shared renderers ---------- */
function cardHTML(card, size, faceDown, animate, glow){
  const g = glow ? ' glow' : '';
  if (faceDown || !card) return `<div class="card ${size} back ${animate?'deal-in':''}${g}"></div>`;
  const red = card.suit==='H'||card.suit==='D';
  const txt = E.rankLabel(card.rank)+E.SUIT_GLYPHS[card.suit];
  return `<div class="card ${size} ${red?'red':'black'} ${animate?'deal-in':''}${g}">
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
  if(ev.t==='row'){
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
const MAX_LIVES = 5;
const LIFE_MS = () => (typeof window.__lifeMs === 'number' ? window.__lifeMs : 30 * 60 * 1000);

const LEVELS = [
  { id: 1,  type: 'solo',      rounds: 8, name: 'First steps',        desc: 'Reach 29 within 8 rounds.' },
  { id: 2,  type: 'solo',      rounds: 6, name: 'Finding the fives',  desc: 'Reach 29 within 6 rounds.' },
  { id: 3,  type: 'bestRound', score: 35, rounds: 5, name: 'One good deal', desc: 'Score 35 or more in a single round. 5 rounds to do it.' },
  { id: 4,  type: 'ai', difficulty: 'easy',   handicap: 0,  name: 'The Deckhand',   desc: 'Beat the Deckhand in a race to 29.' },
  { id: 5,  type: 'solo',      rounds: 5, name: 'Tighter now',        desc: 'Reach 29 within 5 rounds.' },
  { id: 6,  type: 'ai', difficulty: 'easy',   handicap: 5,  name: 'Head start',     desc: 'The Deckhand starts 5 up the rail. Beat them anyway.' },
  { id: 7,  type: 'bestRound', score: 40, rounds: 5, name: 'Forty or nothing', desc: 'Score 40 or more in a single round. 5 rounds to do it.' },
  { id: 8,  type: 'ai', difficulty: 'medium', handicap: 0,  name: 'The Navigator',  desc: 'Beat the Navigator in a race to 29.' },
  { id: 9,  type: 'solo',      rounds: 4, name: 'Four rounds flat',   desc: 'Reach 29 within 4 rounds.' },
  { id: 10, type: 'ai', difficulty: 'medium', handicap: 5,  name: 'Uphill water',   desc: 'The Navigator starts 5 up. Beat them anyway.' },
  { id: 11, type: 'bestRound', score: 45, rounds: 5, name: 'High tide',     desc: 'Score 45 or more in a single round. 5 rounds to do it.' },
  { id: 12, type: 'ai', difficulty: 'medium', handicap: 10, name: 'Ten behind',     desc: 'The Navigator starts 10 up. Beat them anyway.' },
  { id: 13, type: 'solo',      rounds: 3, name: 'Three to shore',     desc: 'Reach 29 within 3 rounds.' },
  { id: 14, type: 'ai', difficulty: 'hard',   handicap: 0,  name: 'The Captain',    desc: 'Beat the Captain in a race to 29.' },
  { id: 15, type: 'bestRound', score: 50, rounds: 6, name: 'Half a hundred', desc: 'Score 50 or more in a single round. 6 rounds to do it.' },
  { id: 16, type: 'ai', difficulty: 'hard',   handicap: 5,  name: 'Rough seas',     desc: 'The Captain starts 5 up. Beat them anyway.' },
  { id: 17, type: 'solo',      rounds: 3, name: 'No slack',           desc: 'Reach 29 within 3 rounds. Again, but you know more now.' },
  { id: 18, type: 'ai', difficulty: 'hard',   handicap: 10, name: 'Taking on water', desc: 'The Captain starts 10 up. Beat them anyway.' },
  { id: 19, type: 'bestRound', score: 55, rounds: 6, name: 'Stacked deck',   desc: 'Score 55 or more in a single round. 6 rounds to do it.' },
  { id: 20, type: 'ai', difficulty: 'hard',   handicap: 15, name: 'Fifteen down',   desc: 'The Captain starts 15 up. Beat them anyway.' },
  { id: 21, type: 'solo',      rounds: 2, name: 'Two perfect rounds', desc: 'Reach 29 within 2 rounds. Average 44 a round. Good luck.' },
  { id: 22, type: 'ai', difficulty: 'hard',   handicap: 20, name: 'Twenty down',    desc: 'The Captain starts 20 up. Beat them anyway.' },
  { id: 23, type: 'bestRound', score: 60, rounds: 8, name: 'The legend hand', desc: 'Score 60 or more in a single round. 8 rounds to chase it.' },
  { id: 24, type: 'ai', difficulty: 'hard',   handicap: 25, name: "The Captain's table", desc: 'The Captain starts 25 up the rail. Take the table anyway.' },
];

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
function saveCampaign(){
  if (S.uid) fdb.ref('users/' + S.uid + '/campaign').set(S.campaign).catch(() => {});
}
function mergeCampaign(stored){
  if (!stored) return;
  const c = S.campaign;
  c.level = Math.max(c.level, stored.level || 1);
  for (const k in (stored.stars || {})) c.stars[k] = Math.max(c.stars[k] || 0, stored.stars[k]);
  if (typeof stored.lives === 'number') { c.lives = stored.lives; c.lastLifeAt = stored.lastLifeAt || Date.now(); }
  refreshLives();
}

/* ---------- the map ---------- */
const NODE_X = [18, 50, 82, 50];
function renderMap(){
  refreshLives();
  const c = S.campaign;
  const wrap = $('map-path'); if (!wrap) return;
  const H = LEVELS.length * 84 + 80;
  wrap.style.height = H + 'px';
  const pts = LEVELS.map((lv, i) => ({ x: NODE_X[i % NODE_X.length], y: 40 + i * 84 }));
  const svgPts = pts.map((p) => `${p.x},${(p.y / H) * 100}`).join(' ');
  let html = `<svg id="map-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
    <polyline points="${svgPts}" fill="none" stroke="var(--brass-dim)" stroke-width="1.1"
      stroke-dasharray="2.4 2.2" vector-effect="non-scaling-stroke" opacity="0.85"/></svg>`;
  html += LEVELS.map((lv, i) => {
    const p = pts[i];
    const stars = c.stars[lv.id] || 0;
    const unlocked = lv.id <= c.level;
    const done = stars > 0;
    return `<button class="map-node ${unlocked ? (done ? 'done' : 'open') : 'locked'}"
        style="left:${p.x}%;top:${p.y}px" data-level="${lv.id}" ${unlocked ? '' : 'disabled'}
        aria-label="Level ${lv.id}: ${lv.name}">
      <span class="num">${unlocked ? lv.id : '🔒'}</span>
      <span class="stars">${done ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : ''}</span>
    </button>`;
  }).join('');
  wrap.innerHTML = html;
  for (const b of wrap.querySelectorAll('.map-node:not([disabled])'))
    b.addEventListener('click', () => openLevel(+b.dataset.level));
  renderLivesBar();
}
function renderLivesBar(){
  refreshLives();
  const c = S.campaign;
  const hearts = $('map-lives');
  if (hearts) hearts.innerHTML = '❤'.repeat(c.lives) + '<span class="dimheart">' + '♡'.repeat(MAX_LIVES - c.lives) + '</span>';
  const t = $('map-timer');
  if (t) {
    const ms = nextLifeIn();
    t.textContent = c.lives >= MAX_LIVES ? 'hearts full'
      : 'next life in ' + Math.floor(ms / 60000) + ':' + String(Math.ceil((ms % 60000) / 1000)).padStart(2, '0');
  }
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
function openMap(){
  show('map');
  renderMap();
  startMapTick();
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
  S.challenge = { level: lv, roundsUsed: 0 };
  if (lv.type === 'ai') {
    S.difficulty = lv.difficulty;
    startMatch('ai');
    S.players[1].name = lv.name.startsWith('The') ? lv.name.replace('The ', '') : AI_NAMES[lv.difficulty];
    S.match.totals[1] = lv.handicap || 0;
    renderGame();
  } else {
    startMatch('solo');
  }
}

/* ---------- evaluation ---------- */
function challengeStarsSolo(lv, roundsUsed){
  return Math.max(1, Math.min(3, 1 + (lv.rounds - roundsUsed)));
}
function challengeStarsBest(lv, handTotal){
  return Math.max(1, Math.min(3, 1 + Math.floor((handTotal - lv.score) / 5)));
}
function challengeStarsAi(m, seat){
  const margin = m.totals[seat] - m.totals[1 - seat];
  return margin >= 20 ? 3 : margin >= 10 ? 2 : 1;
}
/** Called from nextRound (solo modes) after totals update. True = handled. */
function challengeSoloStep(roundResult){
  const ch = S.challenge; if (!ch) return false;
  const lv = ch.level;
  ch.roundsUsed += 1;
  if (lv.type === 'bestRound') {
    if (roundResult.handTotal >= lv.score) { challengeWin(challengeStarsBest(lv, roundResult.handTotal)); return true; }
    if (ch.roundsUsed >= lv.rounds) { challengeFail(); return true; }
    return false;
  }
  // solo: reach 29 within N rounds
  if (S.match.totals[0] >= E.TARGET) { challengeWin(challengeStarsSolo(lv, ch.roundsUsed)); return true; }
  if (ch.roundsUsed >= lv.rounds) { challengeFail(); return true; }
  return false;
}
function challengeWin(stars){
  const ch = S.challenge; if (!ch) return;
  const lv = ch.level;
  const c = S.campaign;
  c.stars[lv.id] = Math.max(c.stars[lv.id] || 0, stars);
  if (lv.id >= c.level && lv.id < LEVELS.length) c.level = lv.id + 1;
  saveCampaign();
  S.challenge = null; S.match = null; S.round = null; cancelCount(); clearInterval(S.aiTimer);
  $('dcr-eyebrow').textContent = 'Level ' + lv.id + ' cleared';
  $('dcr-title').textContent = lv.name;
  $('dcr-stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  $('dcr-sub').textContent = lv.id < LEVELS.length ? 'The path continues.' : 'You have cleared the whole map. Remarkable.';
  $('dcr-retry').classList.add('hidden');
  $('dcr-next').classList.toggle('hidden', lv.id >= LEVELS.length);
  S.lastClearedLevel = lv.id;
  $('d-chal').showModal();
}
function challengeFail(){
  const ch = S.challenge; if (!ch) return;
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
  } else {
    $('g-round').textContent = `Round ${m.roundsPlayed[seat]+1}`;
  }
  const lanes = S.mode==='solo'
    ? [{name:'You', total:m.totals[0]}]
    : [{name:S.players[0].name,total:m.totals[0]},{name:S.players[1].name,total:m.totals[1]}];
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
  renderGame();
  if (S.round.complete) startCount(S.round,'g',onRoundComplete);
}

function onRoundComplete(){
  const result=E.scoreRound(S.round);
  S.lastResult={result,seat:S.match.turn};
  const {handTotal,net}=result;
  if (S.players[S.match.turn].kind==='human') recordHand(result.rowScores, handTotal);
  $('ds-hands').innerHTML=result.rowScores.map((sc,i)=>
    `<div class="ds-row"><span class="nm">${ROW_LABELS[i]}</span><span class="bd">${breakdownHTML(sc)}</span><b>${sc.total}</b></div>`).join('');
  $('ds-eyebrow').textContent= S.mode==='solo' ? 'Round complete' : `${esc(S.players[S.match.turn].name)} · round complete`;
  $('ds-line').innerHTML=`${handTotal} <span class="dim">− 29 =</span> <span class="${net>=0?'pos':'neg'}">${net>=0?'+':''}${net}</span>`;
  $('ds-sub').textContent= net>=0 ? 'Pegging up the rail.' : 'Under par. pegging backwards.';
  renderGame();
  $('d-score').showModal();
}

function nextRound(){
  $('d-score').close();
  if (S.mode==='solo'){
    const challengeRound=S.lastResult.result;
    S.match.totals[0]+=S.lastResult.result.net;
    S.match.roundsPlayed[0]+=1;
    S.lastResult=null;
    if (S.challenge){
      if (challengeSoloStep(challengeRound)) return;
      S.round=E.newRound(E.randomSeed());
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

function showMatchOver(m){
  if (S.challenge && S.mode==='ai'){
    const o=m.outcome;
    if (o.kind==='win' && o.player===0) challengeWin(challengeStarsAi(m,0));
    else challengeFail();
    return;
  }
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
async function establishUser(user){
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
    mergeCampaign(S.profile.campaign);
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
  fdb.ref('users/'+S.uid+'/stats').set(S.profile.stats).catch(()=>{});
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
  fdb.ref('users/'+S.uid+'/games/'+S.code).remove().catch(()=>{});
}
function trackGame(code){
  if(S.uid) fdb.ref('users/'+S.uid+'/games/'+code).set({at:Date.now()}).catch(()=>{});
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
    $('friend-code').value='';
  }catch(e){ friendError(e.message); }
}
function removeFriend(fuid){
  fdb.ref('users/'+S.uid+'/friends/'+fuid).remove().catch(()=>{});
  fdb.ref('users/'+fuid+'/friends/'+S.uid).remove().catch(()=>{});
}
function friendError(msg){ const e=$('friend-err'); if(e){ e.textContent=msg; e.classList.remove('hidden'); } }

function renderFriends(){
  const box=$('o-friends-list'); if(!box) return;
  const mine=$('my-friend-code'); if(mine&&S.profile) mine.textContent=S.profile.friendCode;
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
  const grid=STAT_LABELS
    .filter(([k])=>!(k==='currentGames'&&!self))
    .map(([k,label])=>`<div class="stat"><div class="sv">${k==='currentGames'?gamesCount:(st[k]||0)}${(k==='fastestWin'||k==='longestGame')&&st[k]?' r':''}</div><div class="sl">${label}</div></div>`).join('');
  const isFriend=!self && S.friends && uid in S.friends;
  $('dp-name').textContent=prof.name||'Player';
  $('dp-sub').textContent= self
    ? `your friend code: ${prof.friendCode||'-'}`
    : (prof.online?'online now':'offline');
  $('dp-stats').innerHTML=grid;
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

function renderAccount(){
  const bar=$('o-account'); if(!bar) return;
  if(!S.uid||!S.profile){ bar.innerHTML=''; return; }
  bar.innerHTML=`<span class="chip"><span class="dot on"></span>${esc(S.profile.name)}</span>
    <button class="btn btn-ghost mini" id="acct-profile">profile</button>
    <button class="btn btn-ghost mini" id="acct-out">sign out</button>`;
  $('acct-profile').addEventListener('click',()=>openProfile(null));
  $('acct-out').addEventListener('click',doSignOut);
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
  for (const p of ['o-auth','o-lobby','o-setup','o-wait','o-game']) $(p).classList.toggle('hidden',p!=='o-'+part);
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
$('tile-map').addEventListener('click',openMap);
$('map-back').addEventListener('click',()=>{ if(S.mapTick) clearInterval(S.mapTick); show('home'); });
$('dl-play').addEventListener('click',startLevel);
$('dl-close').addEventListener('click',()=>$('d-level').close());
$('dcr-map').addEventListener('click',()=>{ $('d-chal').close(); openMap(); });
$('dcr-retry').addEventListener('click',()=>{ $('d-chal').close(); startLevel(); });
$('dcr-next').addEventListener('click',()=>{ $('d-chal').close();
  const nxt=LEVELS.find((x)=>x.id===(S.lastClearedLevel||0)+1);
  if(nxt){ S.pendingLevel=nxt; startLevel(); } else openMap(); });
window.__cc={ get S(){return S;}, LEVELS, challengeWin, challengeFail, refreshLives, renderMap, openLevel };
$('tile-ai').addEventListener('click',(e)=>{ if(e.target.closest('.pill')) return; startMatch('ai'); });
$('tile-pass').addEventListener('click',()=>startMatch('pass'));
$('tile-online').addEventListener('click',openOnline);
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
$('friend-add').addEventListener('click',()=>addFriendByCode($('friend-code').value));
$('o-create').addEventListener('click',oCreate);
$('o-join').addEventListener('click',()=>joinByCode($('o-code').value.trim().toUpperCase()));
$('o-back').addEventListener('click',()=>show('home'));
$('o-setup-back').addEventListener('click',()=>show('home'));
$('o-cancel').addEventListener('click',leaveRoom);
$('o-leave').addEventListener('click',leaveRoom);

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
