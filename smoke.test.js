const { JSDOM } = require('jsdom');
const html = require('fs').readFileSync('index.html', 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
const { window } = dom;
const doc = window.document;

// jsdom lacks <dialog> showModal — shim it
window.HTMLDialogElement.prototype.showModal = function(){ this.open = true; this.setAttribute('open',''); };
window.HTMLDialogElement.prototype.close = function(){ this.open = false; this.removeAttribute('open'); };

let fails = 0;
const check = (name, ok) => { console.log(`${ok?'PASS':'FAIL'} ${name}`); if(!ok) fails++; };
const $ = (id) => doc.getElementById(id);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  check('home visible at load', !$('view-home').classList.contains('hidden'));

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
  while (!$('d-score').open && safety++ < 25) {
    const b = doc.querySelector('#g-rows .row-btn:not([disabled])');
    if (!b) break;
    b.click(); placements++;
  }
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
  while (!$('d-score').open && safety++ < 30) {
    for (const k of ['1','2','3','4']) {
      doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true }));
      if ($('d-score').open) break;
    }
  }
  check('keyboard-only round completes with keys 1-4', $('d-score').open);

  // quit cleanly mid-match
  $('ds-continue').click();
  $('btn-quit').click();
  check('quit returns home', !$('view-home').classList.contains('hidden'));

  // pass & play handoff
  $('tile-pass').click();
  safety = 0;
  while (!$('d-score').open && safety++ < 25) {
    const b = doc.querySelector('#g-rows .row-btn:not([disabled])');
    if (b) b.click();
  }
  $('ds-continue').click();
  check('handoff dialog appears in pass mode', $('d-handoff').open);
  check('handoff names Player 2', $('dh-name').textContent === 'Player 2');
  $('dh-ready').click();
  check('card hidden is NOT in effect for active player', doc.querySelector('#g-draw-card .card.back') === null);
  $('btn-quit').click();

  // online configured → lobby
  $('tile-online').click();
  check('online lobby shown (Firebase configured)', !$('o-lobby').classList.contains('hidden'));
  $('o-back').click();
  check('back returns home', !$('view-home').classList.contains('hidden'));

  console.log(fails === 0 ? '\nSMOKE TEST PASSED' : `\n${fails} FAILURES`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
