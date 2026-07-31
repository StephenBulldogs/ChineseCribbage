// Coins, Premium (20-minute heart regrow), the Shop, and the admin panel.
// Reuses the same jsdom + fake-Firebase harness style as newfeatures.test.js,
// extended with an `email` on the fake Google user (the admin gate checks it).
const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const store = {};
const getP = (p) => p.split('/').reduce((o, k) => (o == null ? undefined : o[k]), store);
const setP = (p, v) => { const ks = p.split('/'); let o = store;
  for (let i = 0; i < ks.length - 1; i++) { o[ks[i]] = o[ks[i]] || {}; o = o[ks[i]]; }
  o[ks[ks.length - 1]] = v === undefined ? null : JSON.parse(JSON.stringify(v)); };
function fakeFb(client) {
  const dbFn = () => ({ ref: (path) => ({
    set: async (v) => setP(path, v),
    update: async (o) => { for (const k in o) setP(path + '/' + k, o[k]); },
    get: async () => { const v = getP(path); return { exists: () => v != null, val: () => JSON.parse(JSON.stringify(v)) }; },
    remove: async () => setP(path, null),
    on: () => {}, off: () => {},
    onDisconnect: () => ({ update: async () => {}, cancel: async () => {} }),
  }) });
  dbFn.ServerValue = { TIMESTAMP: 'TS' };
  const authFn = () => ({
    onAuthStateChanged: (cb) => { client.authCb = cb; setTimeout(() => cb(client.user || null), 0); },
    signInWithPopup: async () => { client.user = { uid: client.uid, isAnonymous: false, displayName: client.name, email: client.email }; client.authCb(client.user); },
    signOut: async () => {},
  });
  authFn.GoogleAuthProvider = class {};
  return { initializeApp: () => {}, database: dbFn, auth: authFn };
}
function makeClient(uid, name, email) {
  const client = { uid, name, email };
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) { w.firebase = fakeFb(client); w.__fastCount = true; } });
  const w = dom.window;
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const head = w.document.head; const ap = head.appendChild.bind(head);
  head.appendChild = (el) => { const r = ap(el); if (el.tagName === 'SCRIPT' && el.src) setTimeout(() => el.onload && el.onload(), 0); return r; };
  client.window = w; return client;
}
let fails = 0; const check = (n, ok) => { console.log((ok ? 'PASS' : 'FAIL') + ' ' + n); if (!ok) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(20); } return fn(); };

(async () => {
  // ---- sign in a normal (non-admin) Google account ----
  const cA = makeClient('u-alice', 'Alice', 'alice@example.com');
  const A = cA.window, $A = (id) => A.document.getElementById(id);
  $A('splash-online').click(); await sleep(20);
  $A('auth-google').click();
  await waitFor(() => !$A('o-lobby').classList.contains('hidden'), 2000);
  const CC_A = A.__cc;
  check('coins: starts at 0', (CC_A.S.profile.coins || 0) === 0);
  check('coins: shop badge visible once signed in', !$A('btn-shop').classList.contains('hidden'));
  check('admin: a normal account is not admin', !CC_A.isAdmin());

  // ---- Conquest win pays 2 coins per star, replays included ----
  CC_A.S.campaign = { level: 1, stars: {}, lives: 5, lastLifeAt: Date.now() };
  CC_A.S.challenge = { level: CC_A.LEVELS[0], roundsUsed: 1 };
  CC_A.S.match = { totals: [29] }; CC_A.S.round = { rows: [[], [], [], [], []], complete: true };
  CC_A.challengeWin(3);
  await sleep(20);
  check('coins: +6 for a first 3-star Conquest clear', CC_A.S.profile.coins === 6);
  check('coins: shown in the clear dialog', $A('dcr-sub').textContent.includes('+6 coins'));
  check('coins: persisted to the account', getP('users/u-alice/coins') === 6);

  CC_A.S.challenge = { level: CC_A.LEVELS[0], roundsUsed: 1 };
  CC_A.S.match = { totals: [29] }; CC_A.S.round = { rows: [[], [], [], [], []], complete: true };
  CC_A.challengeWin(2);
  await sleep(20);
  check('coins: replaying an already-cleared level still pays out (+4)', CC_A.S.profile.coins === 10);

  // ---- a normal (vs-AI) win pays 1 coin; a loss pays none ----
  CC_A.S.mode = 'ai';
  CC_A.S.players = [{ name: 'You', kind: 'human' }, { name: 'Bot', kind: 'ai' }];
  CC_A.showMatchOver({ outcome: { kind: 'win', player: 0 }, totals: [29, 10] });
  check('coins: +1 for a vs-AI win by the human seat', CC_A.S.profile.coins === 11);
  CC_A.showMatchOver({ outcome: { kind: 'win', player: 1 }, totals: [10, 29] });
  check('coins: no coin when the AI wins instead', CC_A.S.profile.coins === 11);

  // ---- Shop: buy a life (20 coins), then upgrade to Premium (1000 coins) ----
  CC_A.S.profile.coins = 25;
  CC_A.S.campaign.lives = 3;
  CC_A.openShop();
  check('shop: life button enabled with enough coins and a heart missing', !$A('shop-life').disabled);
  $A('shop-life').click();
  check('shop: buying a life spends 20 coins', CC_A.S.profile.coins === 5);
  check('shop: buying a life adds a heart', CC_A.S.campaign.lives === 4);
  check('shop: not enough coins for Premium yet', $A('shop-premium').disabled);

  check('premium: standard regrow is 30 minutes before upgrading', CC_A.lifeRegrowMinutes() === 30);
  CC_A.S.profile.coins = 1000;
  CC_A.openShop();
  check('shop: premium button enabled at 1000 coins', !$A('shop-premium').disabled);
  $A('shop-premium').click();
  check('shop: upgrading spends all 1000 coins', CC_A.S.profile.coins === 0);
  check('shop: profile flips to premium', CC_A.S.profile.premium === true);
  check('shop: premium persisted to the account', getP('users/u-alice/premium') === true);
  check('premium: heart regrow drops to 15 minutes', CC_A.lifeRegrowMinutes() === 15);
  CC_A.openShop();
  check('shop: premium button now shows already-active', $A('shop-premium').disabled && $A('shop-premium').textContent.includes('active'));

  // ---- guest: coins track for the session, but Premium/lives purchases are blocked ----
  const cG = makeClient('g1', null, undefined);
  const G = cG.window, $G = (id) => G.document.getElementById(id);
  $G('splash-online').click(); await sleep(20);
  $G('auth-guest').click();
  await waitFor(() => !$G('o-lobby').classList.contains('hidden'), 2000);
  const CC_G = G.__cc;
  CC_G.S.profile.coins = 5000;
  CC_G.openShop();
  check('shop: guest cannot buy Premium', $G('shop-premium').disabled && $G('shop-premium').textContent.toLowerCase().includes('sign in'));
  check('shop: guest cannot buy a life', $G('shop-life').disabled && $G('shop-life').textContent.toLowerCase().includes('sign in'));

  // ---- admin: sign in as the admin email, grant Premium to Alice from the panel ----
  const cB = makeClient('u-boss', 'Boss', 'sschwender@gmail.com');
  const B = cB.window, $B = (id) => B.document.getElementById(id);
  $B('splash-online').click(); await sleep(20);
  $B('auth-google').click();
  await waitFor(() => !$B('o-lobby').classList.contains('hidden'), 2000);
  const CC_B = B.__cc;
  check('admin: the configured email is recognized as admin', CC_B.isAdmin());
  $B('btn-settings').click();
  check('admin: settings shows the admin-panel button', !$B('set-admin').classList.contains('hidden'));

  // reset Alice back off Premium so the toggle below is meaningful
  setP('users/u-alice/premium', false);
  $B('set-admin').click();
  await waitFor(() => $B('admin-list').textContent.includes('alice@example.com') || $B('admin-list').textContent.includes('Alice'), 2000);
  check('admin: account list loads all accounts, incl. Alice by email', $B('admin-list').textContent.includes('alice@example.com'));
  const row = Array.from(B.document.querySelectorAll('.admin-row')).find((r) => r.textContent.includes('alice@example.com'));
  check('admin: Alice starts without premium in the list', row && row.querySelector('[data-prem]').textContent.includes('Grant'));
  row.querySelector('[data-prem]').click();
  await sleep(20);
  check('admin: granting premium writes it to her account', getP('users/u-alice/premium') === true);
  const row2 = Array.from(B.document.querySelectorAll('.admin-row')).find((r) => r.textContent.includes('alice@example.com'));
  check('admin: the row flips to Revoke after granting', row2.querySelector('[data-prem]').textContent.includes('Revoke'));

  // admin can directly edit a player's coins and hearts
  const coinsInput = row2.querySelector('.admin-coins');
  coinsInput.value = '777';
  coinsInput.dispatchEvent(new B.Event('change', { bubbles: true }));
  await sleep(20);
  check('admin: editing coins writes the new balance', getP('users/u-alice/coins') === 777);
  const row3 = Array.from(B.document.querySelectorAll('.admin-row')).find((r) => r.textContent.includes('alice@example.com'));
  const livesInput = row3.querySelector('.admin-lives');
  livesInput.value = '2';
  livesInput.dispatchEvent(new B.Event('change', { bubbles: true }));
  await sleep(20);
  check('admin: editing hearts writes campaign.lives', getP('users/u-alice/campaign/lives') === 2);
  // out-of-range hearts get clamped to [0, MAX_LIVES]
  const row4 = Array.from(B.document.querySelectorAll('.admin-row')).find((r) => r.textContent.includes('alice@example.com'));
  const livesInput2 = row4.querySelector('.admin-lives');
  livesInput2.value = '99';
  livesInput2.dispatchEvent(new B.Event('change', { bubbles: true }));
  await sleep(20);
  check('admin: hearts are clamped to MAX_LIVES', getP('users/u-alice/campaign/lives') === CC_B.MAX_LIVES);

  // non-admin can't reach the panel at all
  $A('btn-settings').click();
  check('admin: a normal account never sees the admin button', $A('set-admin').classList.contains('hidden'));

  console.log(fails === 0 ? '\nSHOP TEST PASSED' : `\n${fails} FAILURES`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('CRASH:', e); process.exit(1); });
