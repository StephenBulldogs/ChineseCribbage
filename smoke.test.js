const { JSDOM } = require('jsdom');
const html = require('fs').readFileSync('index.html', 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
const { window } = dom;
  const win = window;
const doc = window.document;

// jsdom lacks <dialog> showModal — shim it
window.HTMLDialogElement.prototype.showModal = function(){ this.open = true; this.setAttribute('open',''); };
window.HTMLDialogElement.prototype.close = function(){ this.open = false; this.removeAttribute('open'); };

let fails = 0;
const check = (name, ok) => { console.log(`${ok?'PASS':'FAIL'} ${name}`); if(!ok) fails++; };
const $ = (id) => doc.getElementById(id);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const waitFor = async (fn, ms) => { const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(40); } return fn(); };
  check('home visible at load', !$('view-home').classList.contains('hidden'));

  // ---- the slow count + skip (normal speed) ----
  $('tile-solo').click();
  let p = 0;
  while (p++ < 14) {
    const b = doc.querySelector('#g-rows .row-btn:not([disabled])');
    if (!b) break; b.click();
  }
  await waitFor(() => $('g-callout').innerHTML.includes('count-callout'), 2000);
  check('count: callout appears after the starter flips', $('g-callout').innerHTML.includes('count-callout'));
  await waitFor(() => doc.querySelector('#g-rows .card.glow') !== null, 3000);
  check('count: combination cards glow', doc.querySelector('#g-rows .card.glow') !== null);
  check('count: rows are not clickable during the count', doc.querySelector('#g-rows .row-btn:not([disabled])') === null);
  check('count: skip button present', $('g-skip') !== null);
  $('g-skip').click();
  await waitFor(() => $('d-score').open, 1000);
  check('count: skip jumps straight to the score sheet', $('d-score').open);
  $('ds-continue').click();
  $('btn-quit').click();
  win.__fastCount = true; // animations near-instant for the rest of the suite

  // ---- rules info dialog ----
  $('btn-info').click();
  check('info button opens the rules dialog', $('d-rules').open);
  check('rules dialog covers the crib rule', $('d-rules').textContent.includes('crib'));
  $('dr-close').click();
  check('rules dialog closes', !$('d-rules').open);

  // ---- solo mode ----
  $('tile-solo').click();
  check('solo: game opens', !$('view-game').classList.contains('hidden'));
  check('solo: single lane on the rail', doc.querySelectorAll('#g-rail .lane-row').length === 1);
  let soloSafety = 0, soloPlacements = 0;
  while (soloSafety++ < 25) {
    const b = doc.querySelector('#g-rows .row-btn:not([disabled])');
    if (!b) break; b.click(); soloPlacements++;
  }
  await waitFor(() => $('d-score').open, 3000);
  check('solo: round completes in 12 placements', $('d-score').open && soloPlacements === 12);
  check('count: every row shows its breakdown', doc.querySelectorAll('#g-rows .row-break').length === 5);
  check('count: score sheet itemizes all 5 hands', doc.querySelectorAll('#ds-hands .ds-row').length === 5);
  check('count: breakdown names the combinations', /fifteens|pairs|runs|flush|nobs|no count/.test($('ds-hands').textContent));
  $('ds-continue').click();
  check('solo: next round or finish flows on', $('d-over').open || $('g-round').textContent === 'Round 2');
  if ($('d-over').open) $('do-home').click(); else $('btn-quit').click();
  check('solo: back home', !$('view-home').classList.contains('hidden'));

  // pick hard difficulty via pill (must NOT start a match)
  doc.querySelectorAll('#diff-picker .pill')[2].click();
  check('pill click does not start match', !$('view-game').classList.contains('hidden') === false);

  // start vs AI
  $('tile-ai').click();
  check('game visible after tile click', !$('view-game').classList.contains('hidden'));
  check('quit button shown', !$('btn-quit').classList.contains('hidden'));

  // new deal rules: crib starts hidden with 1 auto card, never clickable
  check('crib starts with a hidden card', doc.querySelector('#g-rows .row-btn.crib .card.back') !== null);
  check('crib button is disabled', doc.querySelector('#g-rows .row-btn.crib').disabled);
  // play my round: always click first enabled row — should take exactly 12 placements
  let safety = 0, placements = 0;
  while (safety++ < 25) {
    const b = doc.querySelector('#g-rows .row-btn:not([disabled])');
    if (!b) break;
    b.click(); placements++;
  }
  await waitFor(() => $('d-score').open, 3000);
  check('score sheet opens after exactly 12 placements', $('d-score').open && placements === 12);
  check('crib revealed at the count', doc.querySelector('#g-rows .row-btn.crib .card.back') === null);
  check('score line shows − 29', $('ds-line').textContent.includes('29'));
  check('starter shown', $('g-draw-label').textContent === 'Starter');
  check('row scores revealed', doc.querySelectorAll('#g-rows .row-score').length === 5);

  // continue → AI round runs on a 300ms interval
  $('ds-continue').click();
  check('round header flips to AI seat round 1', $('g-round').textContent === 'Round 1');
  await sleep(300 * 21 + 1500); // 20 placements + completion delay
  check('AI round produced a score sheet', $('d-score').open);
  check('AI eyebrow names Captain', $('ds-eyebrow').textContent.includes('Captain'));
  $('ds-continue').click();
  check('round 2 begins for human', $('g-round').textContent === 'Round 2');

  // keyboard placement: keys 1-4 only
  safety = 0;
  let kdone = false;
  while (!kdone && safety++ < 30) {
    for (const k of ['1','2','3','4'])
      doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true }));
    kdone = doc.querySelector('#g-rows .row-btn:not([disabled])') === null;
  }
  await waitFor(() => $('d-score').open, 3000);
  check('keyboard-only round completes with keys 1-4', $('d-score').open);

  // quit cleanly mid-match
  $('ds-continue').click();
  $('btn-quit').click();
  check('quit returns home', !$('view-home').classList.contains('hidden'));

  // pass & play handoff
  $('tile-pass').click();
  safety = 0;
  while (safety++ < 25) {
    const b = doc.querySelector('#g-rows .row-btn:not([disabled])');
    if (b) b.click(); else break;
  }
  await waitFor(() => $('d-score').open, 3000);
  $('ds-continue').click();
  check('handoff dialog appears in pass mode', $('d-handoff').open);
  check('handoff names Player 2', $('dh-name').textContent === 'Player 2');
  $('dh-ready').click();
  check('card hidden is NOT in effect for active player', doc.querySelector('#g-draw-card .card.back') === null);
  $('btn-quit').click();

  // online configured → sign-in gate first
  $('tile-online').click();
  check('online requires sign-in (auth panel shown)', !$('o-auth').classList.contains('hidden'));
  check('Google + guest options, no passwords', $('auth-google') !== null && $('auth-guest') !== null);
  check('lobby has visibility pills', doc.querySelectorAll('.vis-row .pill').length === 2);
  check('lobby has an open-tables section', $('o-public') !== null);
  $('auth-back').click();
  check('back returns home', !$('view-home').classList.contains('hidden'));

  console.log(fails === 0 ? '\nSMOKE TEST PASSED' : `\n${fails} FAILURES`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
