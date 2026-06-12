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
  const authObj = {
    onAuthStateChanged: (cb) => { client.authCb = cb; setTimeout(() => cb(client.user || null), 0); },
    signInAnonymously: async () => { client.user = { uid: client.uid, isAnonymous: true, displayName: null };
      client.authCb && client.authCb(client.user); },
    signInWithPopup: async () => { client.user = { uid: client.uid, isAnonymous: false, displayName: client.googleName || 'Google User' };
      client.authCb && client.authCb(client.user); },
    signOut: async () => { client.user = null; client.authCb && client.authCb(null); },
  };
  const authFn = () => authObj;
  authFn.GoogleAuthProvider = class {};
  return { initializeApp: () => {}, database: dbFn, auth: authFn };
}

function makeClient(takeoverMs) {
  const client = { listeners: [], onDc: [], uid: 'u' + Math.random().toString(36).slice(2, 10) };
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

const signIn = async (client, name, google = true) => {
  const doc = client.window.document;
  client.googleName = name;
  doc.getElementById('splash-online').click();
  await sleep(60);
  if (google) doc.getElementById('auth-google').click();
  else { doc.getElementById('auth-name').value = name; doc.getElementById('auth-guest').click(); }
  await waitFor(() => !doc.getElementById('o-lobby').classList.contains('hidden'), 2000);
};

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
  await signIn(cA, 'Anna');
  check('A: signed in with Google, lobby shown', !$a('o-lobby').classList.contains('hidden'));
  check('A: account bar shows Anna', $a('o-account').textContent.includes('Anna'));
  A.document.querySelector('.size-row .pill[data-n="3"]').click(); await sleep(20);
  A.document.querySelector('#o-seats .pill[data-seat="1"][data-cfg="medium"]').click(); await sleep(20);
  $a('o-create').click(); await sleep(120);
  const code = $a('o-room-code').textContent.trim();
  check('room: 3 seats, AI in p2', getPath('rooms/'+code).size === 3 && getPath('rooms/'+code).players.p2.ai === true);

  // ---------- guest joins from the public list ----------
  const cB = makeClient(), B = cB.window;
  const $b = (id) => B.document.getElementById(id);
  await signIn(cB, 'Ben');
  B.document.querySelector('#o-public [data-join]').click();
  await waitFor(() => (getPath('rooms/'+code)||{}).status === 'playing', 2000);
  check('room auto-starts when seats fill', getPath('rooms/'+code).status === 'playing');
  // keep the match from ending naturally before the scripted endgame
  setPath('rooms/'+code+'/totals', { t0: -500, t1: -500, t2: -1000 });
  notify(); await sleep(60);
  check('registry persists as watchable, marked in play', (getPath('publicRooms/'+code)||{}).status === 'playing');

  // ---------- round 1: Anna → Ben → AI; spectator joins mid-round ----------
  await waitFor(() => $a('o-play').children.length > 0, 2000);
  check('A: host plays first (count ran, submit worked)', await playOut(A));

  // Cara opens the lobby, sees the in-play table with a Watch button
  const cC = makeClient(50), C = cC.window; // 50ms takeover window for the test
  const $c = (id) => C.document.getElementById(id);
  await signIn(cC, 'Cara');
  check("C: lobby shows Anna's table as watchable", $c('o-public').textContent.includes('in play') && $c('o-public').textContent.includes('Watch'));
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
  await signIn(cB2, 'Ben');
  $b2('o-code').value = code;
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
  setPath('rooms/'+code+'/totals', { t0: 200, t1: -500, t2: -1000 });
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

  // ================= STATS, FRIENDS & CHALLENGES =================
  const byName = (n) => Object.entries(store.users || {}).find(([, u]) => u.name === n);
  const [aUid, aUser] = byName('Anna'), [cUid, cUser] = byName('Cara');
  check('stats: Anna recorded a win + game played', aUser.stats.wins === 1 && aUser.stats.gamesPlayed === 1);
  check('stats: fastest win and longest game tracked', aUser.stats.fastestWin > 0 && aUser.stats.longestGame >= aUser.stats.fastestWin);
  check('stats: highest hand and total captured', aUser.stats.highestHand > 0 && aUser.stats.highestTotal >= aUser.stats.highestHand);
  check('stats: Cara recorded the loss', cUser.stats.losses === 1 && cUser.stats.gamesPlayed === 1);

  // leave the finished table
  $a('do-home').click(); await sleep(60);
  $c('do-home').click(); await sleep(60);

  // own profile dialog
  $a('splash-online').click(); await sleep(60);
  $a('acct-profile').click();
  await waitFor(() => $a('d-profile').open, 1500);
  check('profile: shows all 11 stat tiles incl Conquest', A.document.querySelectorAll('#dp-stats .stat').length === 11);
  check('profile: level chip and xp from the match win', $a('dp-level').textContent.startsWith('Lv') && (store.users[aUid].xp || 0) >= 100);
  check('profile: banner picker with 8 banners, dragon locked', A.document.querySelectorAll('#dp-banners .banner-swatch').length === 8 && A.document.querySelector('[data-banner="dragon"]').disabled);
  check('profile: shows the friend code', $a('dp-sub').textContent.includes(aUser.friendCode));
  $a('dp-close').click();

  // add friend by code
  $a('friend-code').value = cUser.friendCode;
  $a('friend-add').click();
  await waitFor(() => store.users[aUid].friends && store.users[aUid].friends[cUid], 2000);
  check('friends: mutual add by code', !!store.users[cUid].friends[aUid]);
  await waitFor(() => $a('o-friends-list').textContent.includes('Cara'), 2000);
  check('friends: list shows Cara online', $a('o-friends-list').textContent.includes('online'));

  // challenge: Anna → Cara
  A.document.querySelector('#o-friends-list [data-chal]').click();
  await waitFor(() => $c('d-challenge').open, 2500);
  check('challenge: Cara receives the dialog', $c('dc-text').textContent.includes('Anna'));
  $c('dc-accept').click();
  const chalCode = () => Object.keys(store.rooms).find((k) => store.rooms[k].size === 2 && store.rooms[k].status !== 'done');
  await waitFor(() => { const k = chalCode(); return k && store.rooms[k].status === 'playing'; }, 3000);
  const ck = chalCode();
  check('challenge: private 2-seat duel started', store.rooms[ck].visibility === 'private' && store.rooms[ck].players.p1.uid === cUid);
  check('challenge: not listed publicly', !(store.publicRooms || {})[ck]);

  // opponent profile from the roster while playing
  await waitFor(() => A.document.querySelector('#o-game-roster [data-uid]') !== null, 2500);
  A.document.querySelector('#o-game-roster [data-uid]').click();
  await waitFor(() => $a('d-profile').open, 1500);
  check('profile: opponent dialog shows Cara with friend toggle', $a('dp-name').textContent === 'Cara' && $a('dp-friend').textContent === 'Remove friend');

  // Conquest progress, hearts and the regrow clock save to the account
  $a('dp-close') && $a('d-profile').open && $a('dp-close').click();
  A.__cc.openMap();
  await sleep(40);
  check('conquest: map opens for a Google account', !A.document.getElementById('view-map').classList.contains('hidden'));
  A.document.querySelector('.map-node[data-level="1"]').click();
  A.document.getElementById('dl-play').click();
  check('conquest: goal shown during play', $a('g-goal').textContent.includes('Goal'));
  A.__cc.challengeWin(2);
  await sleep(100);
  const camp = store.users[aUid].campaign || {};
  check('conquest: progress synced to the account', camp.level === 2 && camp.stars['1'] === 2);
  check('conquest: hearts and regrow clock stored too', typeof camp.lives === 'number' && typeof camp.lastLifeAt === 'number');
  check('conquest: clear paid xp on top of the match win', (store.users[aUid].xp || 0) >= 180);
  check('leaderboard: entry pushed with stars and level', (store.leaderboard[aUid] || {}).stars === 2 && store.leaderboard[aUid].plevel >= 2);

  // leaderboard dialog: global with trophies, then friends
  A.document.getElementById('dcr-map').click();
  await sleep(40);
  A.document.getElementById('map-board').click();
  await waitFor(() => $a('d-board').open, 2000);
  check('leaderboard: global list with a gold trophy', $a('db-list').textContent.includes('🥇'));
  A.document.getElementById('db-friends').click();
  await sleep(80);
  check('leaderboard: friends tab shows Anna and Cara', $a('db-list').textContent.includes('Anna') && $a('db-list').textContent.includes('Cara'));
  A.document.getElementById('db-close').click();

  // guests are gated out of friends and Conquest
  const cG = makeClient(), G = cG.window;
  await signIn(cG, 'Gus', false);
  const $g = (id) => G.document.getElementById(id);
  check('guest: friends section hidden', $g('lobby-friends').classList.contains('hidden'));
  check('guest: Conquest panel shows the sign-in note', $g('o-conquest').textContent.includes('Google'));
  G.__cc.openMap();
  await sleep(30);
  check('guest: cannot enter the Conquest map', G.document.getElementById('view-map').classList.contains('hidden'));

  console.log(fails === 0 ? '\nMULTIPLAYER V6 TEST PASSED' : `\n${fails} FAILURES`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('CRASH:', e); process.exit(1); });
