/* =====================================================================
   UI
   ===================================================================== */
const E = window.CCEngine;
const $ = (id) => document.getElementById(id);
const ROW_LABELS = ['Hand 1','Hand 2','Hand 3','Hand 4','Crib'];
const AI_NAMES = { easy:'Deckhand', medium:'Navigator', hard:'Captain' };
const LANE_COLORS = ['var(--brass)','var(--jade)'];

const S = {
  view:'home', mode:'ai', difficulty:'medium',
  players:[{name:'You',kind:'human'},{name:'Navigator',kind:'ai'}],
  match:null, round:null, lastResult:null, aiTimer:null,
  // online
  code:null, seat:0, room:null, myName:'', visibility:'public',
  oRound:null, oSeed:0, oMoves:[], startedRound:-1,
  unwatch:null, pubUnwatch:null, publicRooms:null
};

function show(view){
  S.view = view;
  for (const v of ['home','game','online']) $('view-'+v).classList.toggle('hidden', v!==view);
  $('btn-quit').classList.toggle('hidden', view!=='game');
  window.scrollTo(0,0);
}

/* ---------- shared renderers ---------- */
function cardHTML(card, size, faceDown, animate){
  if (faceDown || !card) return `<div class="card ${size} back ${animate?'deal-in':''}"></div>`;
  const red = card.suit==='H'||card.suit==='D';
  const txt = E.rankLabel(card.rank)+E.SUIT_GLYPHS[card.suit];
  return `<div class="card ${size} ${red?'red':'black'} ${animate?'deal-in':''}">
    <span class="corner">${txt}</span><span class="pip">${txt}</span></div>`;
}
/** lanes: [{name,total}] — one lane for solo, two for vs modes. */
function railHTML(lanes, activeIdx){
  const MIN=-15, MAX=35;
  const pct=(v)=>((Math.max(MIN,Math.min(MAX,v))-MIN)/(MAX-MIN))*100;
  return lanes.map((l,p)=>`
    <div class="lane-row">
      <div class="lane-name ${activeIdx===p?'active':''}">${esc(l.name)}</div>
      <div class="lane">
        <div class="zero-zone" style="width:${pct(0)}%"></div>
        <div class="notch" style="left:${pct(E.TARGET)}%"></div>
        <div class="peg ${activeIdx===p?'active':''}" style="left:${pct(l.total)}%;background:${LANE_COLORS[p%2]}"></div>
      </div>
      <div class="lane-total ${l.total<0?'neg':''}">${l.total}</div>
    </div>`).join('')+
    `<div class="rail-scale"><span>${MIN}</span><span>0</span><b>${E.TARGET} ★</b></div>`;
}
function rowsHTML(round, placeableFn, rowScores){
  return round.rows.map((cards,i)=>{
    const isCrib = i===E.CRIB_ROW;
    const placeable = !isCrib && placeableFn(i);
    const score = rowScores ? rowScores[i] : null;
    const hideFaces = isCrib && !round.complete; // the crib stays hidden until the count
    const badge = isCrib ? '<span class="key">auto</span>' : `<span class="key">${i+1}</span>`;
    return `<button class="row-btn ${isCrib?'crib':''} ${placeable?'placeable':''}"
      data-row="${i}" ${placeable?'':'disabled'} aria-label="${isCrib?'Crib — deals itself':'Place card in '+ROW_LABELS[i]}">
      <div><div class="row-label">${ROW_LABELS[i]}${badge}</div>
        ${score?`<div class="row-score ${score.total===0?'zero':''}">${score.total}</div>`:''}</div>
      <div class="row-cards">
        ${[0,1,2,3].map(k=>cards[k]?cardHTML(cards[k],'sm',hideFaces,k===cards.length-1):'<span class="slot sm"></span>').join('')}
      </div></button>`;
  }).join('');
}
const esc=(s)=>String(s).replace(/[&<>"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ====================================================================
   LOCAL GAME (solo / vs AI / pass & play)
   ==================================================================== */
function startMatch(mode){
  S.mode = mode;
  S.players = mode==='ai'
    ? [{name:'You',kind:'human'},{name:AI_NAMES[S.difficulty],kind:'ai'}]
    : mode==='pass'
      ? [{name:'Player 1',kind:'human'},{name:'Player 2',kind:'human'}]
      : [{name:'You',kind:'human'},{name:'—',kind:'human'}]; // solo
  S.match = E.newMatch(0);
  S.round = E.newRound(S.match.roundSeed);
  S.lastResult = null;
  show('game');
  renderGame();
}

function renderGame(){
  const m=S.match, r=S.round; if(!m) return;
  const seat=m.turn;
  $('g-round').textContent = `Round ${m.roundsPlayed[seat]+1}`;
  const lanes = S.mode==='solo'
    ? [{name:'You', total:m.totals[0]}]
    : [{name:S.players[0].name,total:m.totals[0]},{name:S.players[1].name,total:m.totals[1]}];
  $('g-rail').innerHTML = railHTML(lanes, S.mode==='solo'?0:seat);
  if(!r){ $('g-rows').innerHTML=''; $('g-draw-card').innerHTML=''; return; }

  const humanTurn = S.players[seat].kind==='human';
  const rowScores = r.complete ? E.scoreRound(r).rowScores : null;
  if (r.complete){
    $('g-draw-label').textContent='Starter';
    $('g-draw-sub').textContent='Counts in all five hands.';
    $('g-draw-card').innerHTML=cardHTML(r.starter,'lg',false,true);
  } else {
    $('g-draw-label').textContent= S.mode==='solo' ? 'Your card' : `${S.players[seat].name} to place`;
    $('g-draw-sub').textContent= humanTurn ? 'Tap a hand — or press 1–4 — to place this card. The crib deals itself.' : `${S.players[seat].name} is thinking…`;
    $('g-draw-card').innerHTML=cardHTML(r.current,'lg',!humanTurn && S.mode==='pass',true);
  }
  $('g-rows').innerHTML = rowsHTML(r,(i)=>humanTurn && E.canPlace(r,i),rowScores);
  for (const b of $('g-rows').querySelectorAll('.row-btn:not([disabled])'))
    b.addEventListener('click',()=>place(+b.dataset.row));
}

function place(rowIndex){
  const r=S.round; if(!r||!E.canPlace(r,rowIndex)) return;
  S.round = E.placeCard(r,rowIndex);
  renderGame();
  if (S.round.complete) onRoundComplete();
}

function onRoundComplete(){
  const result=E.scoreRound(S.round);
  S.lastResult={result,seat:S.match.turn};
  const {handTotal,net}=result;
  $('ds-eyebrow').textContent= S.mode==='solo' ? 'Round complete' : `${esc(S.players[S.match.turn].name)} · round complete`;
  $('ds-line').innerHTML=`${handTotal} <span class="dim">− 29 =</span> <span class="${net>=0?'pos':'neg'}">${net>=0?'+':''}${net}</span>`;
  $('ds-sub').textContent= net>=0 ? 'Pegging up the rail.' : 'Under par — pegging backwards.';
  $('d-score').showModal();
}

function nextRound(){
  $('d-score').close();
  if (S.mode==='solo'){
    S.match.totals[0]+=S.lastResult.result.net;
    S.match.roundsPlayed[0]+=1;
    S.lastResult=null;
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
    if (S.round.complete){ clearInterval(S.aiTimer); setTimeout(onRoundComplete,600); }
  },300);
}

function showMatchOver(m){
  const o=m.outcome;
  $('do-title').textContent= o.kind==='tie' ? "It's a tie" : `${S.players[o.player].name} wins`;
  $('do-sub').textContent=`${S.players[0].name} ${m.totals[0]} · ${S.players[1].name} ${m.totals[1]}`;
  $('d-over').showModal();
}

/* ====================================================================
   ONLINE DUEL — turn-based, fresh shuffles, live spectating, rejoin
   --------------------------------------------------------------------
   rooms/{code}: players{p0,p1}, status, currentRound, turn, totals,
                 rounds{i:{net0,net1}}, result,
                 live{round,seat,seed,moves[]}   ← the active player's
                 move log; powers the opponent's live view AND restoring
                 your own round after a dropped connection.
   publicRooms/{code}: {host,createdAt} — open tables anyone can join.
   ==================================================================== */
function oShow(part){
  for (const p of ['o-lobby','o-setup','o-wait','o-game']) $(p).classList.toggle('hidden',p!=='o-'+part);
}
async function openOnline(){
  show('online');
  if (!firebaseConfigured()) return oShow('setup');
  oShow('lobby');
  try{
    await loadFirebase();
    if (!S.pubUnwatch){
      const ref=fdb.ref('publicRooms');
      const cb=ref.on('value',(snap)=>{ S.publicRooms=snap.exists()?snap.val():{}; renderPublicRooms(); });
      S.pubUnwatch=()=>ref.off('value',cb);
    }
  }catch(e){ $('o-public').innerHTML=`<div class="pub-empty">Couldn't reach the lobby — check your connection.</div>`; }
}
function renderPublicRooms(){
  const box=$('o-public'); if(!box) return;
  const now=Date.now();
  const entries=Object.entries(S.publicRooms||{})
    .filter(([,v])=>v && now-(v.createdAt||0) < 24*60*60*1000)
    .sort((a,b)=>(b[1].createdAt||0)-(a[1].createdAt||0));
  if (entries.length===0){ box.innerHTML='<div class="pub-empty">No open tables right now — open one above.</div>'; return; }
  box.innerHTML=entries.map(([code,v])=>{
    const mins=Math.max(0,Math.round((now-(v.createdAt||0))/60000));
    return `<div class="pub-item"><div class="who">${esc(v.host||'Someone')}'s table<span class="age">${mins<1?'just now':mins+' min ago'}</span></div>
      <button class="btn btn-ghost" data-join="${code}">Join</button></div>`;
  }).join('');
  for (const b of box.querySelectorAll('[data-join]'))
    b.addEventListener('click',()=>joinByCode(b.dataset.join));
}
function oError(msg){ const e=$('o-err'); e.textContent=msg; e.classList.remove('hidden'); }

async function oCreate(){
  const name=$('o-name').value.trim(); if(!name) return oError('Enter your name first.');
  S.myName=name;
  try{
    const db=await loadFirebase();
    const code=makeRoomCode();
    await db.ref('rooms/'+code).set({
      createdAt:Date.now(),
      players:{p0:{name,joined:true}},
      rounds:{}, currentRound:0, turn:0, totals:{t0:0,t1:0},
      status:'waiting', visibility:S.visibility
    });
    if (S.visibility==='public') await db.ref('publicRooms/'+code).set({host:name,createdAt:Date.now()});
    S.code=code; S.seat=0; S.startedRound=-1;
    $('o-room-code').textContent=code; $('o-wait-title').textContent='Room '+code;
    oShow('wait'); watchRoom();
  }catch(e){ oError(e.message); }
}

/** Join OR rejoin: if a seat already carries your name, you get it back. */
async function joinByCode(code){
  const name=$('o-name').value.trim(); if(!name) return oError('Enter your name first, then join.');
  if(!code||code.length!==5) return oError('Room codes are five letters.');
  S.myName=name;
  try{
    const db=await loadFirebase();
    const snap=await db.ref('rooms/'+code).get();
    if(!snap.exists()){
      db.ref('publicRooms/'+code).remove().catch(()=>{});
      return oError('Room not found — check the code.');
    }
    const room=snap.val();
    const p0=room.players&&room.players.p0, p1=room.players&&room.players.p1;
    if (p0 && p0.name===name){ S.seat=0; }                       // rejoin as host
    else if (p1 && p1.joined && p1.name===name){ S.seat=1; }     // rejoin as guest
    else if (!p1 || !p1.joined){                                  // fresh join
      await db.ref('rooms/'+code).update({'players/p1':{name,joined:true},status:'playing'});
      db.ref('publicRooms/'+code).remove().catch(()=>{});
      S.seat=1;
    } else return oError('That room is full — and your name doesn\u2019t match either seat.');
    S.code=code; S.startedRound=-1;
    if (room.status==='waiting' && S.seat===0){
      $('o-room-code').textContent=code; $('o-wait-title').textContent='Room '+code; oShow('wait');
    }
    watchRoom();
  }catch(e){ oError(e.message); }
}

function watchRoom(){
  if(S.unwatch) S.unwatch();
  const r=fdb.ref('rooms/'+S.code);
  const cb=r.on('value',(snap)=>{ S.room=snap.exists()?snap.val():null; onRoomUpdate(); });
  S.unwatch=()=>r.off('value',cb);
}
function leaveRoom(){
  if(S.unwatch){ S.unwatch(); S.unwatch=null; }
  // A host abandoning an un-started table takes it off the board.
  if (S.room && S.seat===0 && S.room.status==='waiting' && S.code){
    fdb.ref('rooms/'+S.code).remove().catch(()=>{});
    fdb.ref('publicRooms/'+S.code).remove().catch(()=>{});
  }
  S.code=null; S.room=null; S.oRound=null; S.oMoves=[]; S.startedRound=-1;
  show('home');
}
const normMoves=(m)=>Array.isArray(m)?m.slice():m?Object.values(m):[];

function onRoomUpdate(){
  const room=S.room;
  if(!room){ oShow('lobby'); return oError('The room was closed.'); }
  if(room.status==='waiting'){
    $('o-room-code').textContent=S.code; $('o-wait-title').textContent='Room '+S.code;
    return oShow('wait');
  }
  const i=room.currentRound;
  const entry=(room.rounds||{})[i]||{};
  const mySubmitted=entry['net'+S.seat]!==undefined;

  // My turn and I haven't started this round locally yet:
  if(room.status==='playing' && S.startedRound!==i && room.turn===S.seat && !mySubmitted){
    S.startedRound=i;
    const live=room.live;
    if (live && live.round===i && live.seat===S.seat && live.seed!==undefined){
      // Rejoin: rebuild my in-progress round from the published move log.
      S.oSeed=live.seed; S.oMoves=normMoves(live.moves);
      let r=E.newRound(S.oSeed);
      for (const m of S.oMoves) r=E.placeCard(r,m);
      S.oRound=r;
    } else {
      // Fresh round, my own shuffle. Publish it so my opponent can watch
      // — and so I can recover it if my connection drops.
      S.oSeed=E.randomSeed(); S.oMoves=[];
      S.oRound=E.newRound(S.oSeed);
      fdb.ref('rooms/'+S.code+'/live').set({round:i,seat:S.seat,seed:S.oSeed,moves:[]}).catch(()=>{});
    }
  }
  // Host advances when both nets for this round are in (rounds always equal).
  if(S.seat===0 && room.status==='playing'){
    if(entry.net0!==undefined && entry.net1!==undefined){
      const t0=room.totals.t0+entry.net0, t1=room.totals.t1+entry.net1;
      const updates={ totals:{t0,t1} };
      if (t0>=E.TARGET||t1>=E.TARGET){ updates.status='done'; updates.result=t0>t1?'p0':t1>t0?'p1':'tie'; }
      else { updates.currentRound=i+1; updates.turn=0; }
      fdb.ref('rooms/'+S.code).update(updates);
    }
  }
  renderOnline();
}

function historyHTML(room, myName, theirName){
  const rounds=room.rounds||{};
  const keys=Object.keys(rounds).map(Number).sort((a,b)=>a-b);
  if(keys.length===0) return '';
  const fmt=(n)=>n===undefined?'…':(n>=0?'+':'')+n;
  return keys.map(k=>{
    const e=rounds[k]||{};
    const mine=e['net'+S.seat], theirs=e['net'+(1-S.seat)];
    return `R${k+1} — <b>${esc(myName)}</b> ${fmt(mine)} · <b>${esc(theirName)}</b> ${fmt(theirs)}`;
  }).join('<br>');
}

function renderOnline(){
  const room=S.room; if(!room||room.status==='waiting') return;
  oShow('game');
  const myName=S.myName||'You';
  const theirName=(S.seat===0?(room.players.p1&&room.players.p1.name):(room.players.p0&&room.players.p0.name))||'Opponent';
  const totals=S.seat===0?[room.totals.t0,room.totals.t1]:[room.totals.t1,room.totals.t0];
  $('o-round').textContent=`Round ${room.currentRound+1}`;
  $('o-rail').innerHTML=railHTML([{name:myName,total:totals[0]},{name:theirName,total:totals[1]}],0);
  $('o-history').innerHTML=historyHTML(room,myName,theirName);

  if(room.status==='done'){
    const iWon=(room.result==='p0'&&S.seat===0)||(room.result==='p1'&&S.seat===1);
    $('do-title').textContent= room.result==='tie'?"It's a tie": iWon?'You win the duel':`${theirName} takes it`;
    $('do-sub').textContent=`${myName} ${totals[0]} · ${theirName} ${totals[1]}`;
    $('o-play').innerHTML=''; $('o-spectate').innerHTML=''; $('o-waiting').classList.add('hidden');
    if(!$('d-over').open) $('d-over').showModal();
    return;
  }

  const entry=(room.rounds||{})[room.currentRound]||{};
  const mySubmitted=entry['net'+S.seat]!==undefined;
  const myTurn=room.turn===S.seat && !mySubmitted;
  const r=S.oRound;

  if(myTurn && r){
    $('o-spectate').innerHTML=''; $('o-waiting').classList.add('hidden');
    const rowScores=r.complete?E.scoreRound(r).rowScores:null;
    const head = r.complete
      ? `<div class="draw"><div><div class="label">Starter</div><div class="sub">Counts in all five hands.</div></div>${cardHTML(r.starter,'lg',false,true)}</div>`
      : `<div class="draw"><div><div class="label">Your card</div><div class="sub">Your shuffle, your round — tap a hand or press 1–4. The crib deals itself. ${esc(theirName)} is watching live.</div></div>${cardHTML(r.current,'lg',false,true)}</div>`;
    const submit = r.complete
      ? `<button class="btn btn-primary" id="o-submit" style="width:100%;margin-top:6px">Submit ${E.scoreRound(r).net>=0?'+':''}${E.scoreRound(r).net}</button>` : '';
    $('o-play').innerHTML=head+rowsHTML(r,(i)=>E.canPlace(r,i),rowScores)+submit;
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
      const net=E.scoreRound(S.oRound).net;
      fdb.ref('rooms/'+S.code).update({
        ['rounds/'+room.currentRound+'/net'+S.seat]:net,
        turn: S.seat===0?1:0
      });
    });
    return;
  }

  // Not my turn: watch the opponent's placements live, move for move.
  $('o-play').innerHTML='';
  const live=room.live;
  if (live && live.round===room.currentRound && live.seat!==S.seat && live.seed!==undefined){
    let lr=E.newRound(live.seed);
    for (const m of normMoves(live.moves)) lr=E.placeCard(lr,m);
    const rowScores=lr.complete?E.scoreRound(lr).rowScores:null;
    const head=lr.complete
      ? `<div class="draw"><div><div class="label">${esc(theirName)}'s starter</div><div class="sub">Counting up their five hands…</div></div>${cardHTML(lr.starter,'lg',false,true)}</div>`
      : `<div class="draw"><div><div class="label">${esc(theirName)} is placing<span class="live-badge">LIVE</span></div><div class="sub">Their shuffle, their round — every move shows here as they make it.</div></div>${cardHTML(lr.current,'lg',false,true)}</div>`;
    $('o-spectate').innerHTML=head+rowsHTML(lr,()=>false,rowScores);
    $('o-waiting').classList.add('hidden');
  } else {
    $('o-spectate').innerHTML='';
    $('o-waiting').classList.remove('hidden');
    $('o-waiting-text').textContent=`${theirName} is playing their round…`;
  }
}

/* ====================================================================
   WIRING
   ==================================================================== */
$('tile-solo').addEventListener('click',()=>startMatch('solo'));
$('tile-ai').addEventListener('click',(e)=>{ if(e.target.closest('.pill')) return; startMatch('ai'); });
$('tile-pass').addEventListener('click',()=>startMatch('pass'));
$('tile-online').addEventListener('click',openOnline);
for (const p of document.querySelectorAll('#diff-picker .pill')){
  const pick=()=>{ S.difficulty=p.dataset.d;
    document.querySelectorAll('#diff-picker .pill').forEach(x=>x.setAttribute('aria-pressed',String(x===p))); };
  p.addEventListener('click',(e)=>{ e.stopPropagation(); pick(); });
  p.addEventListener('keydown',(e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); e.stopPropagation(); pick(); }});
}
for (const p of document.querySelectorAll('.vis-row .pill')){
  const pick=()=>{ S.visibility=p.dataset.v;
    document.querySelectorAll('.vis-row .pill').forEach(x=>x.setAttribute('aria-pressed',String(x===p)));
    $('o-create').textContent = S.visibility==='public' ? 'Open a table' : 'Create a private room'; };
  p.addEventListener('click',pick);
  p.addEventListener('keydown',(e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); pick(); }});
}
$('btn-quit').addEventListener('click',()=>{ clearInterval(S.aiTimer); S.match=null; S.round=null;
  ['d-score','d-handoff','d-over'].forEach(d=>{ if($(d).open)$(d).close(); }); show('home'); });
$('ds-continue').addEventListener('click',nextRound);
$('dh-ready').addEventListener('click',()=>$('d-handoff').close());
$('do-rematch').addEventListener('click',()=>{ $('d-over').close();
  if(S.view==='online'){ leaveRoom(); openOnline(); } else startMatch(S.mode); });
$('do-home').addEventListener('click',()=>{ $('d-over').close(); if(S.view==='online') leaveRoom(); else { S.match=null; show('home'); } });
$('o-create').addEventListener('click',oCreate);
$('o-join').addEventListener('click',()=>joinByCode($('o-code').value.trim().toUpperCase()));
$('o-back').addEventListener('click',()=>show('home'));
$('o-setup-back').addEventListener('click',()=>show('home'));
$('o-cancel').addEventListener('click',leaveRoom);
$('o-leave').addEventListener('click',leaveRoom);

document.addEventListener('keydown',(e)=>{
  if(e.key<'1'||e.key>'4'||e.repeat) return;
  const i=+e.key-1;
  if(S.view==='game' && S.round && S.players[S.match.turn].kind==='human'){ place(i); }
  else if(S.view==='online' && S.oRound && !S.oRound.complete && E.canPlace(S.oRound,i)){
    const room=S.room;
    if(room && room.turn===S.seat){
      S.oRound=E.placeCard(S.oRound,i);
      S.oMoves.push(i);
      fdb.ref('rooms/'+S.code+'/live/moves').set(S.oMoves.slice()).catch(()=>{});
      renderOnline();
    }
  }
});
