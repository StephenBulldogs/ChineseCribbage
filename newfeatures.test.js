// Tests for the new online-table rules:
//   - 72h idle auto-close (unique leader wins; tie / 0-0 -> neutral 'closed')
//   - player Forfeit ends the game and awards the win to the opponent
// Reuses the same jsdom + fake-Firebase harness style as online.test.js.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const SERVER_TS = '__SERVER_TS__';
const store = {};
const allListeners = [];
const getPath = (p) => p.split('/').reduce((o, k) => (o == null ? undefined : o[k]), store);
const setPath = (p, v) => { const ks = p.split('/'); let o = store;
  for (let i = 0; i < ks.length - 1; i++) { o[ks[i]] = o[ks[i]] || {}; o = o[ks[i]]; }
  o[ks[ks.length - 1]] = v === SERVER_TS ? Date.now() : JSON.parse(JSON.stringify(v ?? null)); };
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
      on: (ev, cb) => { const l = () => { const v = getPath(path); cb({ exists: () => v != null, val: () => v == null ? null : JSON.parse(JSON.stringify(v)) }); };
        client.listeners.push(l); allListeners.push(l); setTimeout(l, 0); return cb; },
      off: () => {},
      onDisconnect: () => ({ update: async (obj) => { client.onDc.push({ path, obj }); }, cancel: async () => { client.onDc = []; } }),
    }),
  });
  dbFn.ServerValue = { TIMESTAMP: SERVER_TS };
  const authObj = {
    onAuthStateChanged: (cb) => { client.authCb = cb; setTimeout(() => cb(client.user || null), 0); },
    signInWithPopup: async () => { client.user = { uid: client.uid, isAnonymous: false, displayName: client.googleName || 'G' }; client.authCb && client.authCb(client.user); },
    signOut: async () => { client.user = null; client.authCb && client.authCb(null); },
  };
  const authFn = () => authObj; authFn.GoogleAuthProvider = class {};
  return { initializeApp: () => {}, database: dbFn, auth: authFn };
}

function makeClient() {
  const client = { listeners: [], onDc: [], uid: 'u' + Math.random().toString(36).slice(2, 10) };
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(window) { window.firebase = makeFakeFirebase(client); window.__fastCount = true; window.confirm = () => true; } });
  const { window } = dom;
  window.HTMLDialogElement.prototype.showModal = function(){ this.open = true; };
  window.HTMLDialogElement.prototype.close = function(){ this.open = false; };
  const head = window.document.head; const realAppend = head.appendChild.bind(head);
  head.appendChild = (el) => { const r = realAppend(el); if (el.tagName === 'SCRIPT' && el.src) setTimeout(() => el.onload && el.onload(), 0); return r; };
  client.window = window;
  client.kill = () => { for (const l of client.listeners) l.__dead = true;
    for (const { path, obj } of client.onDc) for (const k in obj) setPath(path + '/' + k, obj[k]); client.onDc = []; setTimeout(notify, 0); };
  return client;
}

let fails = 0;
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms, step = 40) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(step); } return fn(); };

const signIn = async (client, name) => { const doc = client.window.document; client.googleName = name;
  doc.getElementById('splash-online').click(); await sleep(50);
  doc.getElementById('auth-google').click();
  await waitFor(() => !doc.getElementById('o-lobby').classList.contains('hidden'), 2000); };

const makeTable = async (client, vis = 'private') => { const doc = client.window.document;
  doc.getElementById('hub-make').click(); await sleep(20);
  doc.querySelector(`#o-make .vis-row .pill[data-vis="${vis}"]`)?.click(); await sleep(10);
  doc.getElementById('o-create').click(); await sleep(120);
  return doc.getElementById('o-room-code').textContent.trim(); };

(async () => {
  // ============ Forfeit: opponent is awarded the win ============
  const cA = makeClient(), A = cA.window; await signIn(cA, 'Anna');
  const code = await makeTable(cA, 'private');
  check('forfeit: 2-seat table created in waiting', getPath('rooms/'+code).size === 2 && getPath('rooms/'+code).status === 'waiting');

  const cB = makeClient(), B = cB.window; await signIn(cB, 'Bram');
  // Bram joins by code
  B.document.getElementById('hub-find').click(); await sleep(20);
  B.document.getElementById('o-code').value = code;
  B.document.getElementById('o-join').click();
  await waitFor(() => getPath('rooms/'+code).status === 'playing', 3000);
  check('forfeit: game started once both seats filled', getPath('rooms/'+code).status === 'playing');

  // Anna (seat 0) forfeits -> Bram (seat 1) should win.
  await waitFor(() => !A.document.getElementById('o-forfeit').classList.contains('hidden'), 2000);
  check('forfeit: forfeit button visible to seated player', !A.document.getElementById('o-forfeit').classList.contains('hidden'));
  A.document.getElementById('o-forfeit').click();
  await waitFor(() => getPath('rooms/'+code).status === 'done', 2000);
  const fr = getPath('rooms/'+code);
  check('forfeit: game ended', fr.status === 'done');
  check('forfeit: opponent (seat 1) awarded the win', fr.result === 'p1');
  check('forfeit: forfeiting seat recorded', fr.forfeitedBy === 0);
  // Bram's client should announce a win.
  await sleep(150);
  check('forfeit: winner sees "You win the table"', B.document.getElementById('do-title').textContent.includes('You win'));
  cA.kill(); cB.kill(); await sleep(50);

  // ============ 72h idle close: unique leader wins ============
  const cC = makeClient(), C = cC.window; await signIn(cC, 'Cara');
  const code2 = await makeTable(cC, 'private');
  // Simulate progress with a clear leader, then make the table look idle for >72h.
  setPath('rooms/'+code2+'/status', 'playing');
  setPath('rooms/'+code2+'/totals', { t0: 12, t1: 4 });
  setPath('rooms/'+code2+'/rounds', { 0: { net0: 12, net1: 4 } });
  setPath('rooms/'+code2+'/lastActive', Date.now() - (72*60*60*1000 + 5000));
  C.window.__expireMs = 72*60*60*1000; // default; explicit for clarity
  notify(); await waitFor(() => getPath('rooms/'+code2).status === 'done', 2000);
  const lr = getPath('rooms/'+code2);
  check('idle-close: stale table auto-closed', lr.status === 'done' && lr.closedIdle === true);
  check('idle-close: unique leader (seat 0) wins', lr.result === 'p0');
  cC.kill(); await sleep(50);

  // ============ 72h idle close: tie (and 0/0) -> neutral 'closed', no stats ============
  const cD = makeClient(), D = cD.window; await signIn(cD, 'Dee');
  const beforeStats = JSON.stringify(getPath('users/'+cD.uid+'/stats') || {});
  const code3 = await makeTable(cD, 'private');
  setPath('rooms/'+code3+'/status', 'playing');
  setPath('rooms/'+code3+'/totals', { t0: 7, t1: 7 }); // tied, not 0/0
  setPath('rooms/'+code3+'/rounds', { 0: { net0: 7, net1: 7 } });
  setPath('rooms/'+code3+'/lastActive', Date.now() - (72*60*60*1000 + 5000));
  notify(); await waitFor(() => getPath('rooms/'+code3).status === 'done', 2000);
  const tr = getPath('rooms/'+code3);
  check('idle-close: tied table closes with no tie/winner ("closed")', tr.result === 'closed');
  await sleep(150);
  check('idle-close: closed table shows neutral "Table closed"', D.document.getElementById('do-title').textContent.includes('Table closed'));
  const afterStats = JSON.stringify(getPath('users/'+cD.uid+'/stats') || {});
  check('idle-close: neutral close records NO stats', beforeStats === afterStats);

  // 0/0 also resolves to neutral closed.
  const code4 = await makeTable(cD, 'private');
  setPath('rooms/'+code4+'/status', 'playing');
  setPath('rooms/'+code4+'/totals', { t0: 0, t1: 0 });
  setPath('rooms/'+code4+'/lastActive', Date.now() - (72*60*60*1000 + 5000));
  notify(); await waitFor(() => getPath('rooms/'+code4).status === 'done', 2000);
  check('idle-close: 0/0 table closes with no winner ("closed")', getPath('rooms/'+code4).result === 'closed');
  cD.kill(); await sleep(50);

  console.log(fails === 0 ? '\nNEW FEATURES TEST PASSED' : `\nNEW FEATURES TEST FAILED (${fails})`);
  process.exit(fails === 0 ? 0 : 1);
})();
