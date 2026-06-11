// Two-client simulation of the turn-based online protocol.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// ---- shared in-memory "Realtime Database" ----
const store = {};
const listeners = [];
const getPath = (p) => p.split('/').reduce((o, k) => (o == null ? undefined : o[k]), store);
const setPath = (p, v) => {
  const ks = p.split('/'); let o = store;
  for (let i = 0; i < ks.length - 1; i++) { o[ks[i]] = o[ks[i]] || {}; o = o[ks[i]]; }
  o[ks[ks.length - 1]] = JSON.parse(JSON.stringify(v));
};
const notify = () => { for (const l of listeners.slice()) l(); };
const fakeFirebase = {
  initializeApp: () => {},
  database: () => ({
    ref: (path) => ({
      set: async (v) => { setPath(path, v); setTimeout(notify, 0); },
      update: async (obj) => { for (const k in obj) setPath(path + '/' + k, obj[k]); setTimeout(notify, 0); },
      get: async () => { const v = getPath(path); return { exists: () => v != null, val: () => JSON.parse(JSON.stringify(v)) }; },
      on: (ev, cb) => {
        const l = () => { const v = getPath(path); cb({ exists: () => v != null, val: () => v == null ? null : JSON.parse(JSON.stringify(v)) }); };
        listeners.push(l); setTimeout(l, 0); return cb;
      },
      off: () => {},
    }),
  }),
};

function makeClient() {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(window) { window.firebase = fakeFirebase; } });
  const { window } = dom;
  window.HTMLDialogElement.prototype.showModal = function(){ this.open = true; };
  window.HTMLDialogElement.prototype.close = function(){ this.open = false; };
  // make the CDN <script> loads "succeed" instantly (firebase is already faked)
  const head = window.document.head;
  const realAppend = head.appendChild.bind(head);
  head.appendChild = (el) => { const r = realAppend(el);
    if (el.tagName === 'SCRIPT' && el.src) setTimeout(() => el.onload && el.onload(), 0); return r; };
  return window;
}

let fails = 0;
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const A = makeClient(), B = makeClient();
  const $a = (id) => A.document.getElementById(id);
  const $b = (id) => B.document.getElementById(id);

  // Host creates a room
  $a('tile-online').click();
  check('A: configured → lobby shown (no setup notice)', !$a('o-lobby').classList.contains('hidden'));
  $a('o-name').value = 'Anna';
  $a('o-create').click();
  await sleep(50);
  const code = $a('o-room-code').textContent.trim();
  check('A: room code displayed', /^[A-Z2-9]{5}$/.test(code));
  check('A: waiting room shown', !$a('o-wait').classList.contains('hidden'));

  // Guest joins
  $b('tile-online').click();
  $b('o-name').value = 'Ben';
  $b('o-code').value = code;
  $b('o-join').click();
  await sleep(80);

  check('A: host plays first (board visible)', $a('o-play').children.length > 0);
  check('B: guest waits their turn', !$b('o-waiting').classList.contains('hidden'));
  check('B: waiting text names Anna', $b('o-waiting-text').textContent.includes('Anna'));
  check('B: no board while waiting', $b('o-play').children.length === 0);

  // Each client plays a round when it's their turn, alternating until done
  const playRound = async (win) => {
    const doc = win.document;
    let safety = 0, placements = 0;
    while (safety++ < 25) {
      const btn = doc.querySelector('#o-play .row-btn:not([disabled])');
      if (!btn) break;
      btn.click(); placements++;
    }
    const submit = doc.getElementById('o-submit');
    if (!submit) return { placements, submitted: false };
    submit.click();
    await sleep(60);
    return { placements, submitted: true };
  };

  // Round 1 explicit alternation checks
  let r1 = await playRound(A);
  check('A: round took exactly 12 placements', r1.placements === 12 && r1.submitted);
  check('A: now waiting for Ben', !$a('o-waiting').classList.contains('hidden') && $a('o-waiting-text').textContent.includes('Ben'));
  check('B: board appears on their turn', $b('o-play').children.length > 0);
  let r1b = await playRound(B);
  check('B: round took exactly 12 placements', r1b.placements === 12 && r1b.submitted);
  await sleep(60);
  const room = getPath('rooms/' + code);
  check('host advanced totals after both nets', room.totals.t0 !== 0 || room.totals.t1 !== 0 || room.status === 'done');
  check('different shuffles: nets independent (round recorded)', room.rounds && room.rounds[0] && 'net0' in room.rounds[0] && 'net1' in room.rounds[0]);

  // Force an endgame: put the host near certain victory, then play one
  // final round pair to exercise the finish path deterministically.
  setPath('rooms/' + code + '/totals', { t0: 200, t1: 0 });
  notify();
  await sleep(60);
  let guard = 0;
  while (getPath('rooms/' + code).status !== 'done' && guard++ < 8) {
    if ($a('o-play').children.length > 0) await playRound(A);
    else if ($b('o-play').children.length > 0) await playRound(B);
    else await sleep(40);
  }
  const final = getPath('rooms/' + code);
  check('match reached done', final.status === 'done');
  check('result recorded', ['p0', 'p1', 'tie'].includes(final.result));
  check('equal rounds: every round has both nets', Object.values(final.rounds).every((e) => 'net0' in e && 'net1' in e));
  check('winner has the higher total (or tie)',
    final.result === 'tie' ? final.totals.t0 === final.totals.t1
    : final.result === 'p0' ? final.totals.t0 > final.totals.t1 : final.totals.t1 > final.totals.t0);
  check('someone is at or past 29', final.totals.t0 >= 29 || final.totals.t1 >= 29);
  check('guest got their answer round before the finish', 'net1' in final.rounds[final.totals && Object.keys(final.rounds).length - 1]);
  await sleep(60);
  check('A: match-over dialog shown', $a('d-over').open);
  check('B: match-over dialog shown', $b('d-over').open);
  console.log('INFO final:', JSON.stringify(final.totals), final.result, 'in', Object.keys(final.rounds).length, 'rounds');

  console.log(fails === 0 ? '\nONLINE PROTOCOL TEST PASSED' : `\n${fails} FAILURES`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('CRASH:', e); process.exit(1); });
