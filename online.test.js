// Multiplayer protocol test: 3-seat table (host + guest + AI),
// public join, live spectating, AI turns, disconnect → held seat → rejoin.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// ---- shared in-memory "Realtime Database" with presence support ----
const store = {};
const allListeners = [];
const getPath = (p) => p.split('/').reduce((o, k) => (o == null ? undefined : o[k]), store);
const setPath = (p, v) => {
  const ks = p.split('/'); let o = store;
  for (let i = 0; i < ks.length - 1; i++) { o[ks[i]] = o[ks[i]] || {}; o = o[ks[i]]; }
  o[ks[ks.length - 1]] = JSON.parse(JSON.stringify(v));
};
const delPath = (p) => { const ks = p.split('/'); let o = store;
  for (let i = 0; i < ks.length - 1; i++) { o = o[ks[i]]; if (!o) return; } delete o[ks[ks.length - 1]]; };
const notify = () => { for (const l of allListeners.slice()) if (!l.__dead) l(); };

function makeFakeFirebase(client) {
  return {
    initializeApp: () => {},
    database: () => ({
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
    }),
  };
}

function makeClient() {
  const client = { listeners: [], onDc: [] };
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(window) { window.firebase = makeFakeFirebase(client); } });
  const { window } = dom;
  window.HTMLDialogElement.prototype.showModal = function(){ this.open = true; };
  window.HTMLDialogElement.prototype.close = function(){ this.open = false; };
  const head = window.document.head;
  const realAppend = head.appendChild.bind(head);
  head.appendChild = (el) => { const r = realAppend(el);
    if (el.tagName === 'SCRIPT' && el.src) setTimeout(() => el.onload && el.onload(), 0); return r; };
  client.window = window;
  // Simulate the browser dying: stop its listeners, fire its onDisconnect writes.
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
const waitFor = async (fn, ms, step = 100) => { const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(step); } return fn(); };
const faceUp = (doc, sel) => doc.querySelectorAll(sel + ' .row-btn:not(.crib) .card:not(.back)').length;
const cribBacks = (doc, sel) => doc.querySelectorAll(sel + ' .row-btn.crib .card.back').length;

(async () => {
  // ---------- host creates a 3-seat public table with an AI in seat 3 ----------
  const cA = makeClient(), A = cA.window;
  const $a = (id) => A.document.getElementById(id);
  $a('tile-online').click();
  await sleep(50);
  A.document.querySelector('.size-row .pill[data-n="3"]').click();
  await sleep(20);
  check('A: seat config shows 2 configurable seats', A.document.querySelectorAll('#o-seats .row').length === 2);
  A.document.querySelector('#o-seats .pill[data-seat="1"][data-cfg="medium"]').click();
  await sleep(20);
  $a('o-name').value = 'Anna';
  $a('o-create').click();
  await sleep(80);
  const code = $a('o-room-code').textContent.trim();
  const room0 = getPath('rooms/' + code);
  check('room: 3 seats, AI seated in p2', room0.size === 3 && room0.players.p2 && room0.players.p2.ai === true);
  check('A: waiting roster shows open seat + AI chip', $a('o-roster').textContent.includes('open') && $a('o-roster').textContent.includes('AI'));
  check('registry: lists 3 seats', getPath('publicRooms/' + code).size === 3);

  // ---------- guest joins from the public list ----------
  const cB = makeClient(), B = cB.window;
  const $b = (id) => B.document.getElementById(id);
  $b('tile-online').click();
  await sleep(60);
  $b('o-name').value = 'Ben';
  B.document.querySelector('#o-public [data-join]').click();
  await waitFor(() => (getPath('rooms/' + code) || {}).status === 'playing', 2000);
  check('room auto-starts when the last human seat fills', getPath('rooms/' + code).status === 'playing');
  check('registry: removed once playing', getPath('publicRooms/' + code) === undefined);

  // ---------- round 1: Anna → Ben → AI ----------
  await waitFor(() => $a('o-play').children.length > 0, 2000);
  const playOut = async (win) => {
    const doc = win.document;
    let safety = 0;
    while (safety++ < 25) {
      const btn = doc.querySelector('#o-play .row-btn:not([disabled])');
      if (!btn) break; btn.click(); await sleep(10);
    }
    const submit = doc.getElementById('o-submit');
    if (submit) { submit.click(); await sleep(80); return true; }
    return false;
  };
  check('A: host plays first', await playOut(cA.window));
  await waitFor(() => $b('o-play').children.length > 0, 2000);
  check('B: plays second', await playOut(cB.window));

  // AI's turn — host runs it; both humans should see it live
  const sawLive = await waitFor(() => $b('o-spectate').textContent.includes('Navigator') && $b('o-spectate').innerHTML.includes('LIVE'), 4000);
  check('B: watches the AI placing live', sawLive);
  check('A: watches the AI too', await waitFor(() => $a('o-spectate').textContent.includes('Navigator'), 2000));
  await waitFor(() => { const r = getPath('rooms/' + code); return r.currentRound === 1 || r.status === 'done'; }, 10000);
  const afterR1 = getPath('rooms/' + code);
  check('round 1 advanced with all 3 nets in', afterR1.rounds[0] && ['net0','net1','net2'].every(k => k in afterR1.rounds[0]));
  check('A: history line shows 3 players', ($a('o-history').textContent.match(/·/g) || []).length >= 2);

  // ---------- round 2: Ben disconnects mid-round ----------
  await waitFor(() => $a('o-play').children.length > 0, 3000);
  await playOut(cA.window);
  await waitFor(() => $b('o-play').children.length > 0, 2000);
  for (let i = 0; i < 3; i++) { B.document.querySelector('#o-play .row-btn:not([disabled])').click(); await sleep(20); }
  await sleep(60);
  cB.kill(); // tab dies mid-placement
  await sleep(80);
  check('room: Ben flagged disconnected by presence', getPath('rooms/' + code).players.p1.connected === false);
  check('A: roster shows the seat held open', $a('o-game-roster').textContent.includes('seat held'));
  check('A: frozen board explains the held seat', $a('o-spectate').textContent.includes('disconnected') && $a('o-spectate').textContent.includes('SEAT HELD'));

  // ---------- Ben rejoins from a fresh browser ----------
  const cB2 = makeClient(), B2 = cB2.window;
  const $b2 = (id) => B2.document.getElementById(id);
  $b2('tile-online').click();
  await sleep(50);
  $b2('o-name').value = 'Ben';
  $b2('o-code').value = code;
  $b2('o-join').click();
  await waitFor(() => $b2('o-play').children.length > 0, 2000);
  check('B2: rejoined straight into his held seat', $b2('o-play').children.length > 0);
  check('B2: 3 placed moves restored (7 face-up hand cards)', faceUp(B2.document, '#o-play') === 7);
  check('B2: crib restored at 1 hidden card', cribBacks(B2.document, '#o-play') === 1);
  check('room: Ben marked connected again', getPath('rooms/' + code).players.p1.connected === true);
  await waitFor(() => !$a('o-game-roster').textContent.includes('seat held'), 2000);
  check('A: roster chip back to green', !$a('o-game-roster').textContent.includes('seat held'));

  check('B2: finishes the restored round', await playOut(cB2.window));
  await waitFor(() => { const r = getPath('rooms/' + code); return r.currentRound === 2 || r.status === 'done'; }, 10000);
  check('round 2 advanced (AI played again)', (() => { const r = getPath('rooms/' + code); return r.currentRound === 2 || r.status === 'done'; })());

  // ---------- forced endgame ----------
  setPath('rooms/' + code + '/totals', { t0: 200, t1: 0, t2: 0 });
  notify(); await sleep(80);
  let guard = 0;
  while ((getPath('rooms/' + code) || {}).status !== 'done' && guard++ < 10) {
    if ($a('o-play').children.length > 0) await playOut(cA.window);
    else if ($b2('o-play').children.length > 0) await playOut(cB2.window);
    else await sleep(200);
  }
  await waitFor(() => (getPath('rooms/' + code) || {}).status === 'done', 12000);
  const final = getPath('rooms/' + code);
  check('match done with a 3-player result', final.status === 'done' && final.result === 'p0');
  check('equal rounds: every round has all 3 nets', Object.values(final.rounds).every((e) => 'net0' in e && 'net1' in e && 'net2' in e));
  await sleep(80);
  check('A: match-over dialog', $a('d-over').open);
  check('B2: match-over dialog', $b2('d-over').open);
  console.log('INFO final:', JSON.stringify(final.totals), final.result, 'in', Object.keys(final.rounds).length, 'rounds');

  console.log(fails === 0 ? '\nMULTIPLAYER TEST PASSED' : `\n${fails} FAILURES`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('CRASH:', e); process.exit(1); });
