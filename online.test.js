// Dual-client + rejoin simulation of the online protocol v3:
// public tables, live spectating, stateless rejoin, history.
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
const delPath = (p) => { const ks = p.split('/'); let o = store;
  for (let i = 0; i < ks.length - 1; i++) { o = o[ks[i]]; if (!o) return; } delete o[ks[ks.length - 1]]; };
const notify = () => { for (const l of listeners.slice()) l(); };
const fakeFirebase = {
  initializeApp: () => {},
  database: () => ({
    ref: (path) => ({
      set: async (v) => { setPath(path, v); setTimeout(notify, 0); },
      update: async (obj) => { for (const k in obj) setPath(path + '/' + k, obj[k]); setTimeout(notify, 0); },
      get: async () => { const v = getPath(path); return { exists: () => v != null, val: () => JSON.parse(JSON.stringify(v)) }; },
      remove: async () => { delPath(path); setTimeout(notify, 0); },
      on: (ev, cb) => {
        const l = () => { const v = getPath(path); cb({ exists: () => v != null, val: () => v == null ? null : JSON.parse(JSON.stringify(v)) }); };
        l.__path = path; listeners.push(l); setTimeout(l, 0); return cb;
      },
      off: (ev, cb) => { /* simple: leave; zombie windows are closed in test */ },
    }),
  }),
};

function makeClient() {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(window) { window.firebase = fakeFirebase; } });
  const { window } = dom;
  window.HTMLDialogElement.prototype.showModal = function(){ this.open = true; };
  window.HTMLDialogElement.prototype.close = function(){ this.open = false; };
  const head = window.document.head;
  const realAppend = head.appendChild.bind(head);
  head.appendChild = (el) => { const r = realAppend(el);
    if (el.tagName === 'SCRIPT' && el.src) setTimeout(() => el.onload && el.onload(), 0); return r; };
  return window;
}

let fails = 0;
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const countFaceUp = (doc, sel) => doc.querySelectorAll(sel + ' .row-btn:not(.crib) .card:not(.back)').length;
const countCribBacks = (doc, sel) => doc.querySelectorAll(sel + ' .row-btn.crib .card.back').length;

(async () => {
  // ---------- public table creation ----------
  const A = makeClient();
  const $a = (id) => A.document.getElementById(id);
  $a('tile-online').click();
  await sleep(40);
  check('A: public is the default visibility', A.document.querySelector('.vis-row .pill[data-v="public"]').getAttribute('aria-pressed') === 'true');
  $a('o-name').value = 'Anna';
  $a('o-create').click();
  await sleep(60);
  const code = $a('o-room-code').textContent.trim();
  check('A: room created and waiting', /^[A-Z2-9]{5}$/.test(code));
  check('registry: public table listed', getPath('publicRooms/' + code) && getPath('publicRooms/' + code).host === 'Anna');

  // ---------- guest joins from the public list, no code typed ----------
  const B = makeClient();
  const $b = (id) => B.document.getElementById(id);
  $b('tile-online').click();
  await sleep(60);
  check("B: sees Anna's table in the lobby", $b('o-public').textContent.includes("Anna's table"));
  $b('o-name').value = 'Ben';
  B.document.querySelector('#o-public [data-join]').click();
  await sleep(80);
  check('B: joined without typing a code', $b('o-play').innerHTML !== '' || !$b('o-waiting').classList.contains('hidden') || $b('o-spectate').innerHTML !== '');
  check('registry: table removed once seated', getPath('publicRooms/' + code) === undefined);

  // ---------- live spectating ----------
  check('A: host plays first', $a('o-play').children.length > 0);
  // Anna places 5 cards
  for (let i = 0; i < 5; i++) { A.document.querySelector('#o-play .row-btn:not([disabled])').click(); await sleep(30); }
  await sleep(60);
  check('B: live view shows the LIVE badge', $b('o-spectate').innerHTML.includes('LIVE'));
  check("B: live view names Anna", $b('o-spectate').textContent.includes('Anna is placing'));
  check('B: sees all 9 of Anna\'s placed hand cards (4 auto + 5 moves)', countFaceUp(B.document, '#o-spectate') === 9);
  check('B: Anna\'s crib stays hidden even to the spectator', countCribBacks(B.document, '#o-spectate') === 2);

  // ---------- crash + rejoin ----------
  $a('o-leave') && $a('o-leave').click(); // simulate Anna's tab dying mid-round
  await sleep(40);
  const A2 = makeClient();
  const $a2 = (id) => A2.document.getElementById(id);
  $a2('tile-online').click();
  await sleep(40);
  $a2('o-name').value = 'Anna';
  $a2('o-code').value = code;
  $a2('o-join').click();
  await sleep(100);
  check('A2: rejoined into a live board (not the waiting room)', $a2('o-play').children.length > 0);
  check('A2: round restored with all 9 placed cards intact', countFaceUp(A2.document, '#o-play') === 9);
  check('A2: crib restored at 2 hidden cards', countCribBacks(A2.document, '#o-play') === 2);

  // Anna (rejoined) finishes her round: 7 more placements + submit
  const playOut = async (win) => {
    const doc = win.document;
    let safety = 0;
    while (safety++ < 25) {
      const btn = doc.querySelector('#o-play .row-btn:not([disabled])');
      if (!btn) break; btn.click(); await sleep(15);
    }
    const submit = doc.getElementById('o-submit');
    if (submit) { submit.click(); await sleep(80); return true; }
    return false;
  };
  check('A2: finished and submitted the restored round', await playOut(A2));
  check('B: board appears on their turn', $b('o-play').children.length > 0);
  check('A2: now spectating Ben', await (async()=>{ 
    B.document.querySelector('#o-play .row-btn:not([disabled])').click(); await sleep(60);
    return $a2('o-spectate').innerHTML.includes('LIVE') && $a2('o-spectate').textContent.includes('Ben is placing'); })());
  check('B: round finished', await playOut(B));
  await sleep(80);

  // ---------- history ----------
  check('A2: history shows round 1 with both nets', /R1 —/.test($a2('o-history').textContent) && !$a2('o-history').textContent.includes('…'));
  check('B: history visible too', /R1 —/.test($b('o-history').textContent));

  // ---------- endgame ----------
  setPath('rooms/' + code + '/totals', { t0: 200, t1: 0 });
  notify(); await sleep(60);
  let guard = 0;
  while ((getPath('rooms/' + code) || {}).status !== 'done' && guard++ < 8) {
    if ($a2('o-play').children.length > 0) await playOut(A2);
    else if ($b('o-play').children.length > 0) await playOut(B);
    else await sleep(40);
  }
  const final = getPath('rooms/' + code);
  check('match reached done', final.status === 'done');
  check('equal rounds: every round has both nets', Object.values(final.rounds).every((e) => 'net0' in e && 'net1' in e));
  await sleep(60);
  check('A2: match-over dialog', $a2('d-over').open);
  check('B: match-over dialog', $b('d-over').open);
  console.log('INFO final:', JSON.stringify(final.totals), final.result, 'in', Object.keys(final.rounds).length, 'rounds');

  console.log(fails === 0 ? '\nONLINE V3 TEST PASSED' : `\n${fails} FAILURES`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('CRASH:', e); process.exit(1); });
