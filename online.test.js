// Multiplayer protocol test v4: 3-seat table (host + guest + AI), public
// join, live spectating, full-table spectators, disconnect → held seat →
// quick rejoin, abandonment → takeover by a spectator, endgame.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const SERVER_TS = '__SERVER_TS__';
const store = {};
const allListeners = [];
const getPath = (p) => p.split('/').reduce((o, k) => (o == null ? undefined : o[k]), store);
const setPath = (p, v) => {
  const ks = p.split('/'); let o = store;
  for (let i = 0; i < ks.length - 1; i++) { o[ks[i]] = o[ks[i]] || {}; o = o[ks[i]]; }
  let val = v === SERVER_TS ? Date.now() : JSON.parse(JSON.stringify(v ?? null));
  o[ks[ks.length - 1]] = val;
};
const delPath = (p) => { const ks = p.split('/'); let o = store;
  for (let i = 0; i < ks.length - 1; i++) { o = o[ks[i]]; if (!o) return; } delete o[ks[ks.length - 1]]; };
const notify = () => { for (const l of allListeners.slice()) if (!l.__dead) l(); };

function makeFakeFirebase(client) {
  const dbFn = () => ({
    ref: (path) => ({
      set: async (v) => { setPath(path, v); setTimeout(notify, 0); },
      update: async (obj) => { for (const k in obj) setPath(path + '/' + k, obj[k]); setTimeout(notify, 0); },
      get: async () => { const v = getPath(path); return { exists: () => v != null, val: () => JSON.parse(JSON.stringify(v)) }; },
      remove: async () => { delPath(path); setTimeout(notify, 0); },
      on: (ev, cb) => {
        const l = () => { const v = getPath(path); cb({ exists: () => v != null, val: () => v == null ? null : JSON.parse(JSON.stringify(v)) }); };
        client.listeners.push(l); allListeners.push(l); setTimeout(l, 0); return cb;
      },
      off: () => {},
      onDisconnect: () => ({
        update: async (obj) => { client.onDc.push({ path, obj }); },
        cancel: async () => { client.onDc = []; },
      }),
    }),
  });
  dbFn.ServerValue = { TIMESTAMP: SERVER_TS };
  return { initializeApp: () => {}, database: dbFn };
}

function makeClient(takeoverMs) {
  const client = { listeners: [], onDc: [] };
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(window) {
      window.firebase = makeFakeFirebase(client);
      window.__fastCount = true;
      if (takeoverMs !== undefined) window.__takeoverMs = takeoverMs;
    } });
  const { window } = dom;
  window.HTMLDialogElement.prototype.showModal = function(){ this.open = true; };
  window.HTMLDialogElement.prototype.close = function(){ this.open = false; };
  const head = window.document.head;
  const realAppend = head.appendChild.bind(head);
  head.appendChild = (el) => { const r = realAppend(el);
    if (el.tagName === 'SCRIPT' && el.src) setTimeout(() => el.onload && el.onload(), 0); return r; };
  client.window = window;
  client.kill = () => {
    for (const l of client.listeners) l.__dead = true;
    for (const { path, obj } of client.onDc) for (const k in obj) setPath(path + '/' + k, obj[k]);
    client.onDc = [];
    setTimeout(notify, 0);
  };
  return client;
}

let fails = 0;
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms, step = 80) => { const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(step); } return fn(); };
const faceUp = (doc) => doc.querySelectorAll('#o-play .row-btn:not(.crib) .card:not(.back)').length;
const cribBacks = (doc) => doc.querySelectorAll('#o-play .row-btn.crib .card.back').length;

const playOut = async (win) => {
  const doc = win.document;
  let safety = 0;
  while (safety++ < 25) {
    const btn = doc.querySelector('#o-play .row-btn:not([disabled])');
    if (!btn) break; btn.click(); await sleep(8);
  }
  const ok = await waitFor(() => doc.getElementById('o-submit') !== null, 4000);
  if (!ok) return false;
  doc.getElementById('o-submit').click();
  await sleep(80);
  return true;
};

(async () => {
  // ---------- host creates a 3-seat public table with an AI in seat 3 ----------
  const cA = makeClient(), A = cA.window;
  const $a = (id) => A.document.getElementById(id);
  $a('tile-online').click(); await sleep(50);
  A.document.querySelector('.size-row .pill[data-n="3"]').click(); await sleep(20);
  A.document.querySelector('#o-seats .pill[data-seat="1"][data-cfg="medium"]').click(); await sleep(20);
  $a('o-name').value = 'Anna';
  $a('o-create').click(); await sleep(80);
  const code = $a('o-room-code').textContent.trim();
  check('room: 3 seats, AI in p2', getPath('rooms/'+code).size === 3 && getPath('rooms/'+code).players.p2.ai === true);

  // ---------- guest joins from the public list ----------
  const cB = makeClient(), B = cB.window;
  const $b = (id) => B.document.getElementById(id);
  $b('tile-online').click(); await sleep(60);
  $b('o-name').value = 'Ben';
  B.document.querySelector('#o-public [data-join]').click();
  await waitFor(() => (getPath('rooms/'+code)||{}).status === 'playing', 2000);
  check('room auto-starts when seats fill', getPath('rooms/'+code).status === 'playing');
  check('registry persists as watchable, marked in play', (getPath('publicRooms/'+code)||{}).status === 'playing');

  // ---------- round 1: Anna → Ben → AI; spectator joins mid-round ----------
  await waitFor(() => $a('o-play').children.length > 0, 2000);
  check('A: host plays first (count ran, submit worked)', await playOut(A));

  // Cara opens the lobby, sees the in-play table with a Watch button
  const cC = makeClient(50), C = cC.window; // 50ms takeover window for the test
  const $c = (id) => C.document.getElementById(id);
  $c('tile-online').click(); await sleep(80);
  check("C: lobby shows Anna's table as watchable", $c('o-public').textContent.includes('in play') && $c('o-public').textContent.includes('Watch'));
  $c('o-name').value = 'Cara';
  C.document.querySelector('#o-public [data-join]').click();
  await waitFor(() => !$c('o-game').classList.contains('hidden'), 2000);
  check('C: spectating the full table', $c('o-game-roster').textContent.includes('spectating'));
  check('C: sees the 3-lane rail', C.document.querySelectorAll('#o-rail .lane-row').length === 3);

  await waitFor(() => $b('o-play').children.length > 0, 2000);
  check('B: plays second', await playOut(B));
  check('C: spectator watches the AI live', await waitFor(() => $c('o-spectate').textContent.includes('Navigator'), 4000));
  await waitFor(() => { const r = getPath('rooms/'+code); return r.currentRound === 1 || r.status === 'done'; }, 8000);
  check('round 1 advanced with all 3 nets', ['net0','net1','net2'].every(k => k in getPath('rooms/'+code).rounds[0]));

  // ---------- round 2: Ben drops, rejoins quickly (within the window) ----------
  await waitFor(() => $a('o-play').children.length > 0, 3000);
  await playOut(A);
  await waitFor(() => $b('o-play').children.length > 0, 2000);
  for (let i = 0; i < 3; i++) { B.document.querySelector('#o-play .row-btn:not([disabled])').click(); await sleep(15); }
  await sleep(50);
  cB.kill(); await sleep(80);
  check('presence: Ben flagged disconnected with timestamp', getPath('rooms/'+code).players.p1.connected === false && typeof getPath('rooms/'+code).players.p1.disconnectedAt === 'number');
  check('A: seat shown held (still inside the window)', $a('o-game-roster').textContent.includes('seat held'));

  const cB2 = makeClient(), B2 = cB2.window;
  const $b2 = (id) => B2.document.getElementById(id);
  $b2('tile-online').click(); await sleep(50);
  $b2('o-name').value = 'Ben'; $b2('o-code').value = code;
  $b2('o-join').click();
  await waitFor(() => $b2('o-play').children.length > 0, 2000);
  check('B2: quick rejoin restores 3 moves', faceUp(B2.document) === 7 && cribBacks(B2.document) === 1);
  check('B2: finishes restored round', await playOut(B2));
  await waitFor(() => { const r = getPath('rooms/'+code); return r.currentRound === 2 || r.status === 'done'; }, 8000);

  // ---------- round 3: Ben abandons; Cara takes the seat after the window ----------
  await waitFor(() => $a('o-play').children.length > 0, 3000);
  await playOut(A);
  await waitFor(() => $b2('o-play').children.length > 0, 2000);
  for (let i = 0; i < 2; i++) { B2.document.querySelector('#o-play .row-btn:not([disabled])').click(); await sleep(15); }
  await sleep(50);
  cB2.kill(); await sleep(150); // > Cara's 50ms takeover window
  notify(); await sleep(80);    // refresh rosters
  const claimBtn = C.document.querySelector('#o-game-roster [data-claim]');
  check('C: take-seat button appears after the window', claimBtn !== null);
  claimBtn.click();
  await waitFor(() => $c('o-play').children.length > 0, 2000);
  check('C: took the seat and inherited the half-played round', faceUp(C.document) === 6 && cribBacks(C.document) === 1);
  check("room: seat 1 now carries Cara's name", getPath('rooms/'+code).players.p1.name === 'Cara');
  check('A: roster shows Cara seated and green', $a('o-game-roster').textContent.includes('Cara') && !$a('o-game-roster').textContent.includes('seat held'));
  check('C: finishes the inherited round', await playOut(C));
  await waitFor(() => { const r = getPath('rooms/'+code); return r.currentRound === 3 || r.status === 'done'; }, 8000);

  // ---------- forced endgame ----------
  setPath('rooms/'+code+'/totals', { t0: 200, t1: 0, t2: 0 });
  notify(); await sleep(80);
  let guard = 0;
  while ((getPath('rooms/'+code)||{}).status !== 'done' && guard++ < 10) {
    if ($a('o-play').children.length > 0) await playOut(A);
    else if ($c('o-play').children.length > 0) await playOut(C);
    else await sleep(150);
  }
  await waitFor(() => (getPath('rooms/'+code)||{}).status === 'done', 10000);
  const final = getPath('rooms/'+code);
  check('match done, host wins', final.status === 'done' && final.result === 'p0');
  check('registry delisted at match end', getPath('publicRooms/'+code) === undefined);
  check('equal rounds: every round has all 3 nets', Object.values(final.rounds).every((e) => 'net0' in e && 'net1' in e && 'net2' in e));
  await sleep(80);
  check('A and C both reach the match-over dialog', $a('d-over').open && $c('d-over').open);
  console.log('INFO final:', JSON.stringify(final.totals), final.result, 'in', Object.keys(final.rounds).length, 'rounds');

  console.log(fails === 0 ? '\nMULTIPLAYER V4 TEST PASSED' : `\n${fails} FAILURES`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('CRASH:', e); process.exit(1); });
