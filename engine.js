// Chinese Cribbage engine — plain JS port of the app's tested TypeScript engine.
// Kept dependency-free so it runs inline in the website and in Node for tests.

const SUITS = ['S', 'H', 'D', 'C'];
const SUIT_GLYPHS = { S: '\u2660', H: '\u2665', D: '\u2666', C: '\u2663' };
const RANK_LABELS = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
const PAR = 29;
const TARGET = 29;
const ROW_SIZE = 4;
const CRIB_ROW = 4;

const cardValue = (c) => Math.min(c.rank, 10);
const cardId = (c) => `${c.rank}${c.suit}`;
const rankLabel = (r) => RANK_LABELS[r] || String(r);

function freshDeck() {
  const deck = [];
  for (const suit of SUITS) for (let rank = 1; rank <= 13; rank++) deck.push({ rank, suit });
  return deck;
}

// Mulberry32 — deterministic deals from a shared seed (online fairness).
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(deck, rand) {
  const d = deck.slice();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

const randomSeed = () => Math.floor(Math.random() * 0xffffffff);

// --- Standard cribbage show scoring: 4-card hand + starter ---
function scoreHand(hand, starter, isCrib = false) {
  const all = hand.concat([starter]);
  let fifteens = 0;
  for (let mask = 1; mask < 1 << all.length; mask++) {
    let sum = 0;
    for (let i = 0; i < all.length; i++) if (mask & (1 << i)) sum += cardValue(all[i]);
    if (sum === 15) fifteens += 2;
  }
  let pairs = 0;
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) if (all[i].rank === all[j].rank) pairs += 2;

  const counts = new Map();
  for (const c of all) counts.set(c.rank, (counts.get(c.rank) || 0) + 1);
  const distinct = [...counts.keys()].sort((a, b) => a - b);
  let runs = 0, i = 0;
  while (i < distinct.length) {
    let j = i;
    while (j + 1 < distinct.length && distinct[j + 1] === distinct[j] + 1) j++;
    const len = j - i + 1;
    if (len >= 3) {
      let mult = 1;
      for (let k = i; k <= j; k++) mult *= counts.get(distinct[k]);
      runs += len * mult;
    }
    i = j + 1;
  }

  let flush = 0;
  const suit = hand[0].suit;
  if (hand.every((c) => c.suit === suit)) {
    if (starter.suit === suit) flush = 5;
    else if (!isCrib) flush = 4;
  }
  const nobs = hand.some((c) => c.rank === 11 && c.suit === starter.suit) ? 1 : 0;
  const total = fifteens + pairs + runs + flush + nobs;
  return { fifteens, pairs, runs, flush, nobs, total };
}

/**
 * Detailed show: every scoring combination with the indices of the cards
 * involved (0-3 = hand cards in order, 4 = starter). Drives the animated
 * count at the end of a round. Totals always match scoreHand.
 */
function scoreHandDetail(hand, starter, isCrib = false) {
  const all = hand.concat([starter]);
  const combos = [];
  for (let mask = 1; mask < 32; mask++) {
    let sum = 0; const idx = [];
    for (let i = 0; i < 5; i++) if (mask & (1 << i)) { sum += cardValue(all[i]); idx.push(i); }
    if (sum === 15) combos.push({ kind: 'fifteen', idx, pts: 2 });
  }
  for (let i = 0; i < 5; i++)
    for (let j = i + 1; j < 5; j++)
      if (all[i].rank === all[j].rank) combos.push({ kind: 'pair', idx: [i, j], pts: 2 });
  const byRank = new Map();
  for (let i = 0; i < 5; i++) {
    const r = all[i].rank;
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r).push(i);
  }
  const ranks = [...byRank.keys()].sort((a, b) => a - b);
  let i = 0;
  while (i < ranks.length) {
    let j = i;
    while (j + 1 < ranks.length && ranks[j + 1] === ranks[j] + 1) j++;
    const len = j - i + 1;
    if (len >= 3) {
      let acc = [[]];
      for (let k = i; k <= j; k++) {
        const next = [];
        for (const partial of acc) for (const ix of byRank.get(ranks[k])) next.push(partial.concat([ix]));
        acc = next;
      }
      for (const idx of acc) combos.push({ kind: 'run', idx, pts: len });
    }
    i = j + 1;
  }
  const suit = hand[0].suit;
  if (hand.every((c) => c.suit === suit)) {
    if (starter.suit === suit) combos.push({ kind: 'flush', idx: [0, 1, 2, 3, 4], pts: 5 });
    else if (!isCrib) combos.push({ kind: 'flush', idx: [0, 1, 2, 3], pts: 4 });
  }
  for (let k = 0; k < 4; k++)
    if (hand[k].rank === 11 && hand[k].suit === starter.suit) combos.push({ kind: 'nobs', idx: [k, 4], pts: 1 });
  const total = combos.reduce((n, c) => n + c.pts, 0);
  return { combos, total };
}

// --- Round ---
// The first five cards deal themselves: one to each hand, one FACE DOWN to
// the crib. The player places only into hands; no hand may hold more than
// (crib size + 1) cards, and whenever every hand reaches that cap the next
// card deals itself into the crib. Crib stays hidden until the count.
const maxHandSize = (s) => Math.min(s.rows[CRIB_ROW].length + 1, ROW_SIZE);

function newRound(seed) {
  const deck = shuffle(freshDeck(), mulberry32(seed));
  const rows = [[], [], [], [], []];
  for (let i = 0; i < CRIB_ROW; i++) rows[i].push(deck[i]);
  rows[CRIB_ROW].push(deck[CRIB_ROW]);
  return settle({ seed, deck: deck.slice(5), rows, current: null, starter: null, complete: false });
}

const canPlace = (s, r) =>
  !s.complete && s.current !== null && r >= 0 && r < CRIB_ROW && s.rows[r].length < maxHandSize(s);

function placeCard(s, r) {
  if (!canPlace(s, r)) return s;
  const rows = s.rows.map((row, i) => (i === r ? row.concat([s.current]) : row));
  return settle({ ...s, rows, current: null });
}

function settle(s) {
  const deck = s.deck.slice();
  const rows = s.rows.map((r) => r.slice());
  const cap = () => Math.min(rows[CRIB_ROW].length + 1, ROW_SIZE);
  const atCap = () => rows.slice(0, CRIB_ROW).every((r) => r.length >= cap());
  while (rows[CRIB_ROW].length < ROW_SIZE && atCap()) rows[CRIB_ROW].push(deck.shift());
  const placed = rows.reduce((n, r) => n + r.length, 0);
  if (placed >= 5 * ROW_SIZE) {
    const [starter, ...rest] = deck;
    return { ...s, rows, deck: rest, current: null, starter, complete: true };
  }
  const [current, ...rest] = deck;
  return { ...s, rows, deck: rest, current, complete: false };
}

function scoreRound(s) {
  const rowScores = s.rows.map((row, i) => scoreHand(row, s.starter, i === CRIB_ROW));
  // His heels: a Jack turned as the starter is 2 points to the dealer,
  // and in this game the player is always their own dealer.
  const heels = s.starter && s.starter.rank === 11 ? 2 : 0;
  const handTotal = rowScores.reduce((n, x) => n + x.total, 0) + heels;
  return { rowScores, heels, handTotal, net: handTotal - PAR };
}

// --- Match: race to 29, equal rounds guaranteed, ties allowed (2-4 seats) ---
function newMatch(firstPlayer = 0, seed, players = 2) {
  return {
    totals: Array.from({ length: players }, () => 0),
    roundsPlayed: Array.from({ length: players }, () => 0),
    turn: firstPlayer,
    roundSeed: seed == null ? randomSeed() : seed,
    outcome: { kind: 'playing' },
  };
}

function applyRoundNet(m, net, nextSeed) {
  const totals = m.totals.slice();
  const roundsPlayed = m.roundsPlayed.slice();
  totals[m.turn] += net;
  roundsPlayed[m.turn] += 1;
  const even = roundsPlayed.every((n) => n === roundsPlayed[0]);
  const home = totals.some((t) => t >= TARGET);
  let outcome = { kind: 'playing' };
  if (even && home) {
    const top = Math.max(...totals);
    const leaders = totals.reduce((a, t, i) => (t === top ? a.concat(i) : a), []);
    outcome = leaders.length === 1 ? { kind: 'win', player: leaders[0] } : { kind: 'tie' };
  }
  return { totals, roundsPlayed, turn: (m.turn + 1) % totals.length, roundSeed: nextSeed == null ? randomSeed() : nextSeed, outcome };
}

// --- AI ---
function synergy(row, card) {
  let s = 0;
  for (const c of row) {
    if (c.rank === card.rank) s += 2.4;
    const gap = Math.abs(c.rank - card.rank);
    if (gap === 1) s += 1.3; else if (gap === 2) s += 0.5;
    if (cardValue(c) + cardValue(card) === 15) s += 1.6;
    if (c.suit === card.suit) s += 0.25;
  }
  for (let i = 0; i < row.length; i++)
    for (let j = i + 1; j < row.length; j++)
      if (cardValue(row[i]) + cardValue(row[j]) + cardValue(card) === 15) s += 1.2;
  if (cardValue(card) === 5) s += 0.4;
  if (row.length === 0) s -= 0.3;
  return s;
}

const legalRows = (s) => [0, 1, 2, 3].filter((i) => canPlace(s, i));

function heuristicPick(s, noise) {
  const card = s.current;
  let best = null, bestScore = -Infinity;
  for (const r of legalRows(s)) {
    const score = synergy(s.rows[r], card) + (noise > 0 ? (Math.random() - 0.5) * noise : 0);
    if (score > bestScore) { bestScore = score; best = r; }
  }
  return best;
}

// The AI may only know its hands and the current card — the crib is face
// down, so its real cards stay in the unknown pool, same as for a human.
function unseenCards(s) {
  const seen = new Set();
  for (let i = 0; i < CRIB_ROW; i++) for (const c of s.rows[i]) seen.add(cardId(c));
  if (s.current) seen.add(cardId(s.current));
  return freshDeck().filter((c) => !seen.has(cardId(c)));
}

function monteCarloPick(s, samples) {
  const card = s.current;
  const candidates = legalRows(s);
  if (candidates.length === 1) return candidates[0];
  const unseen = unseenCards(s);
  let best = candidates[0], bestEv = -Infinity;
  for (const r of candidates) {
    // Crib simulated blind — its real cards are hidden from the AI.
    const placedRows = s.rows.map((row, i) => (i === CRIB_ROW ? [] : i === r ? row.concat([card]) : row.slice()));
    let total = 0;
    for (let n = 0; n < samples; n++) {
      const pool = unseen.slice();
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      let cursor = 0;
      const sim = placedRows.map((row) => row.slice());
      for (const row of sim) while (row.length < ROW_SIZE) row.push(pool[cursor++]);
      const starter = pool[cursor];
      for (let i = 0; i < sim.length; i++) total += scoreHand(sim[i], starter, i === CRIB_ROW).total;
    }
    const ev = total / samples;
    if (ev > bestEv) { bestEv = ev; best = r; }
  }
  return best;
}

function aiChooseRow(s, difficulty) {
  if (difficulty === 'easy') return heuristicPick(s, 3.5);
  if (difficulty === 'medium') return heuristicPick(s, 0);
  return monteCarloPick(s, 60);
}

// Export for Node tests; in the browser these become globals via window.CCEngine.
const CCEngine = {
  SUIT_GLYPHS, PAR, TARGET, CRIB_ROW, ROW_SIZE,
  cardValue, rankLabel, freshDeck, mulberry32, shuffle, randomSeed,
  scoreHand, scoreHandDetail, newRound, canPlace, placeCard, scoreRound, maxHandSize,
  newMatch, applyRoundNet, aiChooseRow,
};
if (typeof module !== 'undefined') module.exports = CCEngine;
if (typeof window !== 'undefined') window.CCEngine = CCEngine;
