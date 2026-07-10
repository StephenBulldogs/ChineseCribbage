const E = require('./engine.js');
let fails = 0;
const eq = (name, a, b) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`}`);
  if (!ok) fails++;
};
const c = (rank, suit) => ({ rank, suit });

// Same vectors as the app's TS suite
eq('perfect 29', E.scoreHand([c(5,'H'),c(5,'D'),c(5,'C'),c(11,'S')], c(5,'S')).total, 29);
eq('zero hand', E.scoreHand([c(1,'H'),c(3,'D'),c(7,'C'),c(13,'S')], c(10,'H')).total, 0);
eq('double run + fifteens', E.scoreHand([c(4,'H'),c(4,'D'),c(5,'C'),c(6,'S')], c(13,'H')).total, 14);
eq('hand flush 4', E.scoreHand([c(2,'H'),c(4,'H'),c(6,'H'),c(9,'H')], c(13,'S')).total, 8);
eq('crib flush needs 5', E.scoreHand([c(2,'H'),c(4,'H'),c(6,'H'),c(9,'H')], c(13,'S'), true).total, 4);
eq('nobs', E.scoreHand([c(11,'H'),c(2,'D'),c(8,'C'),c(13,'S')], c(7,'H')).nobs, 1);
const st = c(5,'S');
eq('blog hand 1', E.scoreHand([c(1,'H'),c(2,'D'),c(3,'C'),c(13,'H')], st).total, 7);
eq('blog hand 2', E.scoreHand([c(1,'C'),c(2,'H'),c(8,'C'),c(12,'H')], st).total, 4);
eq('blog hand 3', E.scoreHand([c(7,'H'),c(7,'D'),c(9,'C'),c(9,'H')], st).total, 4);
eq('blog hand 4', E.scoreHand([c(1,'D'),c(4,'H'),c(6,'C'),c(12,'D')], st).total, 9);
eq('blog crib', E.scoreHand([c(6,'H'),c(9,'D'),c(10,'C'),c(10,'H')], st, true).total, 8);

// New deal rules
let r = E.newRound(12345);
eq('auto-deal: hands start with 1', r.rows.slice(0,4).every(x => x.length === 1), true);
eq('auto-deal: crib starts with 1', r.rows[4].length, 1);
eq('cannot place into crib', E.canPlace(r, 4), false);
let ct = E.placeCard(r, 0);
eq('hand cannot exceed crib+1', E.canPlace(ct, 0), false);
ct = E.placeCard(ct, 1); ct = E.placeCard(ct, 2); ct = E.placeCard(ct, 3);
eq('crib auto-deals when hands catch up', ct.rows[4].length, 2);
// Cross-check vs TS engine: auto-dealt rows from seed 12345
console.log('INFO seed 12345 auto-deal:', r.rows.map(x => x.map(c => c.rank + c.suit).join('')).join('|'), 'current:', r.current.rank + r.current.suit);
let placements = 0;
while (!r.complete) {
  let moved = false;
  for (let i = 0; i < 4; i++) { const b = r; r = E.placeCard(r, i); if (r !== b) { moved = true; break; } }
  if (!moved) throw new Error('stuck');
  placements++;
}
eq('exactly 12 player placements', placements, 12);
const res = E.scoreRound(r);
eq('net = total - 29', res.net, res.handTotal - E.PAR);
eq('deck remainder', r.deck.length, 31);

let m = E.newMatch(0);
m = E.applyRoundNet(m, 30);
eq('equal rounds rule', m.outcome.kind, 'playing');
m = E.applyRoundNet(m, 35);
eq('higher total wins', m.outcome, { kind: 'win', player: 1 });
let m2 = E.newMatch(0); m2 = E.applyRoundNet(m2, 29); m2 = E.applyRoundNet(m2, 29);
eq('tie', m2.outcome.kind, 'tie');

// Multi-seat matches (pass & play): 2-4 players, seats rotate in order
let m3 = E.newMatch(0, undefined, 3);
eq('3p match sizes totals per seat', m3.totals, [0, 0, 0]);
m3 = E.applyRoundNet(m3, 30);
eq('3p turn rotates in seat order', m3.turn, 1);
m3 = E.applyRoundNet(m3, 20);
eq('3p waits until all rounds equal', m3.outcome.kind, 'playing');
m3 = E.applyRoundNet(m3, 25);
eq('3p unique leader wins', m3.outcome, { kind: 'win', player: 0 });
let m4 = E.newMatch(0, undefined, 3);
m4 = E.applyRoundNet(m4, 30); m4 = E.applyRoundNet(m4, 30); m4 = E.applyRoundNet(m4, 10);
eq('3p tied leaders tie', m4.outcome.kind, 'tie');

// His heels: Jack starter adds 2 to the round total
{
  const mk=(r,s)=>({rank:r,suit:s});
  const rows=[[mk(2,'H'),mk(4,'D'),mk(7,'C'),mk(9,'S')],[mk(3,'H'),mk(6,'D'),mk(8,'C'),mk(13,'S')],
    [mk(2,'D'),mk(4,'H'),mk(7,'S'),mk(9,'C')],[mk(3,'D'),mk(6,'H'),mk(8,'S'),mk(13,'C')],
    [mk(2,'C'),mk(4,'S'),mk(7,'H'),mk(9,'D')]];
  const jackState={rows, starter:mk(11,'H'), complete:true};
  const tenState={rows, starter:mk(10,'H'), complete:true};
  const rj=E.scoreRound(jackState), rt=E.scoreRound(tenState);
  const rowsOnlyJ=jackState.rows.reduce((n,row,i)=>n+E.scoreHand(row,jackState.starter,i===4).total,0);
  eq('heels: jack starter adds exactly 2', rj.handTotal, rowsOnlyJ+2);
  eq('heels: reported in the result', rj.heels, 2);
  eq('heels: non-jack starter adds nothing', rt.heels, 0);
  eq('heels: net includes the 2', rj.net, rj.handTotal-29);
}

// Detail scoring must always agree with scoreHand, card-for-card
let detailOk = true, comboIdxOk = true;
{
  const rng = E.mulberry32(7);
  for (let n = 0; n < 300; n++) {
    const deck = E.shuffle(E.freshDeck(), rng);
    const hand = deck.slice(0, 4), starter = deck[4];
    const isCrib = n % 2 === 0;
    const det = E.scoreHandDetail(hand, starter, isCrib);
    if (det.total !== E.scoreHand(hand, starter, isCrib).total) detailOk = false;
    for (const c of det.combos) if (!c.idx.every(i => i >= 0 && i <= 4)) comboIdxOk = false;
  }
}
eq('detail totals match scoreHand over 300 random hands', detailOk, true);
eq('detail combos reference valid card indices', comboIdxOk, true);
// Spot-check: 4,4,5,6 + K → two fifteens, one pair, two runs of 3
const det = E.scoreHandDetail([c(4,'H'),c(4,'D'),c(5,'C'),c(6,'S')], c(13,'H'));
eq('double-run detail: 6 combos (three fifteens, pair, two runs)', det.combos.length, 6);
eq('double-run detail: two runs', det.combos.filter(x=>x.kind==='run').length, 2);

for (const d of ['easy','medium','hard']) {
  let ar = E.newRound(999), g = 0;
  while (!ar.complete && g++ < 20) ar = E.placeCard(ar, E.aiChooseRow(ar, d));
  eq(`AI ${d} legal round`, ar.complete && ar.rows.every(x => x.length === 4), true);
}
console.log(fails === 0 ? 'ALL TESTS PASSED' : fails + ' FAILURES');
process.exit(fails ? 1 : 0);
