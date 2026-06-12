/* ====================================================================
   ONLINE TABLE — 2–4 players, AI seat-fillers, live spectating, rejoin
   --------------------------------------------------------------------
   rooms/{code}: size, players{p0..p3:{name,joined,ai?,difficulty?,connected}},
                 status, currentRound, turn, totals{t0..}, rounds{i:{net0..}},
                 live{round,seat,seed,moves[]}, result ('p0'..'p3'|'tie')
   publicRooms/{code}: {host,createdAt,size}
   - Everyone plays each round in seat order with their own fresh shuffle.
   - AI seats are played by the HOST's client (so the host must be online
     for AI turns — the table simply waits otherwise).
   - Presence: each client flags connected/disconnected via onDisconnect;
     a dropped player's seat is shown as held open until they rejoin with
     the same name. The live move log restores their half-played round.
   ==================================================================== */
function oShow(part){
  for (const p of ['o-lobby','o-setup','o-wait','o-game']) $(p).classList.toggle('hidden',p!=='o-'+part);
}
const seatKeys=(room)=>Array.from({length:room.size||2},(_,k)=>'p'+k);
const seatName=(room,k)=>{const p=(room.players||{})['p'+k];return p?p.name:'open seat';};
async function openOnline(){
  show('online');
  if (!firebaseConfigured()) return oShow('setup');
  oShow('lobby');
  renderSeatConfig();
  try{
    await loadFirebase();
    if (!S.pubUnwatch){
      const ref=fdb.ref('publicRooms');
      const cb=ref.on('value',(snap)=>{ S.publicRooms=snap.exists()?snap.val():{}; renderPublicRooms(); });
      S.pubUnwatch=()=>ref.off('value',cb);
    }
  }catch(e){ $('o-public').innerHTML=`<div class="pub-empty">Couldn't reach the lobby — check your connection.</div>`; }
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
  if (entries.length===0){ box.innerHTML='<div class="pub-empty">No open tables right now — open one above.</div>'; return; }
  box.innerHTML=entries.map(([code,v])=>{
    const mins=Math.max(0,Math.round((now-(v.createdAt||0))/60000));
    return `<div class="pub-item"><div class="who">${esc(v.host||'Someone')}'s table<span class="age">${v.size||2} seats · ${mins<1?'just now':mins+' min ago'}</span></div>
      <button class="btn btn-ghost" data-join="${code}">Join</button></div>`;
  }).join('');
  for (const b of box.querySelectorAll('[data-join]'))
    b.addEventListener('click',()=>joinByCode(b.dataset.join));
}
function oError(msg){ const e=$('o-err'); e.textContent=msg; e.classList.remove('hidden'); }

const AI_SEAT_NAMES={easy:'Deckhand',medium:'Navigator',hard:'Captain'};

async function oCreate(){
  const name=$('o-name').value.trim(); if(!name) return oError('Enter your name first.');
  S.myName=name;
  try{
    const db=await loadFirebase();
    const code=makeRoomCode();
    const size=S.roomSize;
    const players={p0:{name,joined:true,connected:true}};
    const totals={};
    for(let k=0;k<size;k++) totals['t'+k]=0;
    S.seatConfig.forEach((cfg,idx)=>{
      if(cfg!=='open') players['p'+(idx+1)]={
        name:`${AI_SEAT_NAMES[cfg]} (AI ${idx+2})`, joined:true, ai:true, difficulty:cfg, connected:true };
    });
    await db.ref('rooms/'+code).set({
      createdAt:Date.now(), size, players,
      rounds:{}, currentRound:0, turn:0, totals,
      status:'waiting', visibility:S.visibility
    });
    if (S.visibility==='public') await db.ref('publicRooms/'+code).set({host:name,createdAt:Date.now(),size});
    S.code=code; S.seat=0; S.startedRound=-1; S.aiJob='';
    $('o-room-code').textContent=code; $('o-wait-title').textContent='Room '+code;
    oShow('wait'); watchRoom(); registerPresence();
  }catch(e){ oError(e.message); }
}

/** Join OR rejoin: a seat already carrying your name is yours to take back. */
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
    const size=room.size||2;
    let seat=-1;
    for(let k=0;k<size;k++){
      const p=(room.players||{})['p'+k];
      if(p && p.joined && !p.ai && p.name===name){ seat=k; break; }   // rejoin
    }
    if(seat===-1){
      for(let k=0;k<size;k++){
        const p=(room.players||{})['p'+k];
        if(!p || !p.joined){ seat=k; break; }                          // fresh open seat
      }
      if(seat===-1) return oError('That table is full — and your name doesn\u2019t match any seat.');
      await db.ref('rooms/'+code+'/players/p'+seat).set({name,joined:true,connected:true});
    }
    S.code=code; S.seat=seat; S.startedRound=-1; S.aiJob='';
    watchRoom(); registerPresence();
  }catch(e){ oError(e.message); }
}

function registerPresence(){
  try{
    const ref=fdb.ref('rooms/'+S.code+'/players/p'+S.seat);
    ref.update({connected:true}).catch(()=>{});
    if (ref.onDisconnect) ref.onDisconnect().update({connected:false});
  }catch(e){}
}

function watchRoom(){
  if(S.unwatch) S.unwatch();
  const r=fdb.ref('rooms/'+S.code);
  const cb=r.on('value',(snap)=>{ S.room=snap.exists()?snap.val():null; onRoomUpdate(); });
  S.unwatch=()=>r.off('value',cb);
}
function leaveRoom(){
  if(S.aiTimerOnline){ clearInterval(S.aiTimerOnline); S.aiTimerOnline=null; }
  if (S.room && S.code){
    if (S.seat===0 && S.room.status==='waiting'){
      fdb.ref('rooms/'+S.code).remove().catch(()=>{});
      fdb.ref('publicRooms/'+S.code).remove().catch(()=>{});
    } else {
      fdb.ref('rooms/'+S.code+'/players/p'+S.seat+'/connected').set(false).catch(()=>{});
    }
  }
  if(S.unwatch){ S.unwatch(); S.unwatch=null; }
  S.code=null; S.room=null; S.oRound=null; S.oMoves=[]; S.startedRound=-1; S.aiJob='';
  show('home');
}
const normMoves=(m)=>Array.isArray(m)?m.slice():m?Object.values(m):[];

function rosterHTML(room){
  const size=room.size||2;
  let out='';
  for(let k=0;k<size;k++){
    const p=(room.players||{})['p'+k];
    if(!p||!p.joined){ out+=`<span class="chip open">seat ${k+1} · open</span>`; continue; }
    const off=!p.ai && p.connected===false;
    out+=`<span class="chip ${off?'off':''}"><span class="dot"></span>${esc(p.name)}${k===S.seat?' (you)':''}
      ${p.ai?'<span class="tag-ai">AI</span>':''}${off?'<span class="held">seat held — can rejoin</span>':''}</span>`;
  }
  return out;
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
      fdb.ref('publicRooms/'+S.code).remove().catch(()=>{});
      return;
    }
  }
  if(room.status==='waiting'){
    $('o-room-code').textContent=S.code; $('o-wait-title').textContent='Room '+S.code;
    $('o-roster').innerHTML=rosterHTML(room);
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
      if(anyHome){ updates.status='done'; updates.result=bestCount>1?'tie':'p'+bestSeat; }
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
  },350);
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
    return `R${k+1} — `+parts.join(' · ');
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
  $('o-history').innerHTML=historyHTML(room);

  if(room.status==='done'){
    const iWon=room.result==='p'+S.seat;
    $('do-title').textContent= room.result==='tie'?"It's a tie": iWon?'You win the table':`${seatName(room,+room.result.slice(1))} takes it`;
    $('do-sub').textContent=lanes.map(l=>`${l.name.replace(' (you)','')} ${l.total}`).join(' · ');
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
      : `<div class="draw"><div><div class="label">Your card</div><div class="sub">Your shuffle, your round — tap a hand or press 1–4. The crib deals itself. The table is watching live.</div></div>${cardHTML(r.current,'lg',false,true)}</div>`;
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
        ? `<div class="draw"><div><div class="label">${esc(liveName)} disconnected<span class="live-badge" style="background:var(--brass-dim)">SEAT HELD</span></div><div class="sub">Their board is frozen where they left it — the table waits, and they can rejoin with the same name and code to pick it right back up.</div></div>${cardHTML(lr.current,'lg',false,true)}</div>`
        : `<div class="draw"><div><div class="label">${esc(liveName)} is placing<span class="live-badge">LIVE</span></div><div class="sub">Their shuffle, their round — every move shows here as they make it.</div></div>${cardHTML(lr.current,'lg',false,true)}</div>`;
    $('o-spectate').innerHTML=head+rowsHTML(lr,()=>false,rowScores);
    $('o-waiting').classList.add('hidden');
  } else {
    $('o-spectate').innerHTML='';
    $('o-waiting').classList.remove('hidden');
    const off=turnPlayer && !turnPlayer.ai && turnPlayer.connected===false;
    $('o-waiting-text').textContent= off
      ? `${turnName} is disconnected — their seat is held while the table waits.`
      : `${turnName} is playing their round…`;
  }
}
