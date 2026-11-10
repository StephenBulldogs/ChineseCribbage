// Chinese Cribbage engine — Dart port of the web app's engine.js.
//
// Bit-for-bit compatible with the JavaScript engine: the same seed produces
// the same shuffle (Mulberry32 + Fisher–Yates over the same fresh-deck order),
// so a phone and a browser can share a Firebase room and replay each other's
// move logs exactly.
import 'dart:math' as math;

const suits = ['S', 'H', 'D', 'C'];
const suitGlyphs = {'S': '♠', 'H': '♥', 'D': '♦', 'C': '♣'};
const _rankLabels = {1: 'A', 11: 'J', 12: 'Q', 13: 'K'};
const par = 29;
const target = 29;
const rowSize = 4;
const cribRow = 4;

class PlayingCard {
  final int rank; // 1..13
  final String suit; // S H D C
  const PlayingCard(this.rank, this.suit);

  int get value => math.min(rank, 10);
  String get id => '$rank$suit';
  bool get isRed => suit == 'H' || suit == 'D';
  String get label => rankLabel(rank) + suitGlyphs[suit]!;

  /// Key into the illustrated face decks, e.g. 'SA', 'H10', 'CK'.
  String get faceKey => suit + rankLabel(rank);

  @override
  bool operator ==(Object other) =>
      other is PlayingCard && other.rank == rank && other.suit == suit;
  @override
  int get hashCode => rank * 7 + suit.codeUnitAt(0);
  @override
  String toString() => id;
}

String rankLabel(int r) => _rankLabels[r] ?? '$r';
int cardValue(PlayingCard c) => c.value;

List<PlayingCard> freshDeck() => [
      for (final s in suits)
        for (var r = 1; r <= 13; r++) PlayingCard(r, s),
    ];

// --- Mulberry32, matching JS uint32 semantics exactly ---
int _imul(int a, int b) => (a * b) & 0xFFFFFFFF;

typedef Rand = double Function();

Rand mulberry32(int seed) {
  var a = seed & 0xFFFFFFFF;
  return () {
    a = (a + 0x6d2b79f5) & 0xFFFFFFFF;
    var t = _imul(a ^ (a >>> 15), 1 | a);
    t = ((t + _imul(t ^ (t >>> 7), 61 | t)) & 0xFFFFFFFF) ^ t;
    return ((t ^ (t >>> 14)) & 0xFFFFFFFF) / 4294967296;
  };
}

List<T> shuffle<T>(List<T> deck, Rand rand) {
  final d = List<T>.of(deck);
  for (var i = d.length - 1; i > 0; i--) {
    final j = (rand() * (i + 1)).floor();
    final tmp = d[i];
    d[i] = d[j];
    d[j] = tmp;
  }
  return d;
}

final _rng = math.Random();
int randomSeed() => (_rng.nextDouble() * 0xffffffff).floor();

// --- Standard cribbage show scoring: 4-card hand + starter ---
class HandScore {
  final int fifteens, pairs, runs, flush, nobs, total;
  const HandScore(
      this.fifteens, this.pairs, this.runs, this.flush, this.nobs, this.total);

  String get breakdown {
    final parts = <String>[];
    if (fifteens > 0) parts.add('fifteens $fifteens');
    if (pairs > 0) parts.add('pairs $pairs');
    if (runs > 0) parts.add('runs $runs');
    if (flush > 0) parts.add('flush $flush');
    if (nobs > 0) parts.add('nobs $nobs');
    return parts.isEmpty ? 'no count' : parts.join(' · ');
  }
}

HandScore scoreHand(List<PlayingCard> hand, PlayingCard starter,
    [bool isCrib = false]) {
  final all = [...hand, starter];
  var fifteens = 0;
  for (var mask = 1; mask < (1 << all.length); mask++) {
    var sum = 0;
    for (var i = 0; i < all.length; i++) {
      if (mask & (1 << i) != 0) sum += all[i].value;
    }
    if (sum == 15) fifteens += 2;
  }
  var pairs = 0;
  for (var i = 0; i < all.length; i++) {
    for (var j = i + 1; j < all.length; j++) {
      if (all[i].rank == all[j].rank) pairs += 2;
    }
  }
  final counts = <int, int>{};
  for (final c in all) {
    counts[c.rank] = (counts[c.rank] ?? 0) + 1;
  }
  final distinct = counts.keys.toList()..sort();
  var runs = 0, i = 0;
  while (i < distinct.length) {
    var j = i;
    while (j + 1 < distinct.length && distinct[j + 1] == distinct[j] + 1) {
      j++;
    }
    final len = j - i + 1;
    if (len >= 3) {
      var mult = 1;
      for (var k = i; k <= j; k++) {
        mult *= counts[distinct[k]]!;
      }
      runs += len * mult;
    }
    i = j + 1;
  }
  var flush = 0;
  final suit = hand[0].suit;
  if (hand.every((c) => c.suit == suit)) {
    if (starter.suit == suit) {
      flush = 5;
    } else if (!isCrib) {
      flush = 4;
    }
  }
  final nobs = hand.any((c) => c.rank == 11 && c.suit == starter.suit) ? 1 : 0;
  return HandScore(fifteens, pairs, runs, flush, nobs,
      fifteens + pairs + runs + flush + nobs);
}

class Combo {
  final String kind; // fifteen | pair | run | flush | nobs
  final List<int> idx; // 0-3 hand cards, 4 = starter
  final int pts;
  const Combo(this.kind, this.idx, this.pts);

  String get label => switch (kind) {
        'fifteen' => 'Fifteen',
        'pair' => 'A pair',
        'run' => 'Run of $pts',
        'flush' => 'Flush',
        _ => 'His nobs',
      };
}

class HandDetail {
  final List<Combo> combos;
  final int total;
  const HandDetail(this.combos, this.total);
}

/// Every scoring combination with the indices of the cards involved. Drives
/// the animated count. Totals always match [scoreHand].
HandDetail scoreHandDetail(List<PlayingCard> hand, PlayingCard starter,
    [bool isCrib = false]) {
  final all = [...hand, starter];
  final combos = <Combo>[];
  for (var mask = 1; mask < 32; mask++) {
    var sum = 0;
    final idx = <int>[];
    for (var i = 0; i < 5; i++) {
      if (mask & (1 << i) != 0) {
        sum += all[i].value;
        idx.add(i);
      }
    }
    if (sum == 15) combos.add(Combo('fifteen', idx, 2));
  }
  for (var i = 0; i < 5; i++) {
    for (var j = i + 1; j < 5; j++) {
      if (all[i].rank == all[j].rank) combos.add(Combo('pair', [i, j], 2));
    }
  }
  final byRank = <int, List<int>>{};
  for (var i = 0; i < 5; i++) {
    byRank.putIfAbsent(all[i].rank, () => []).add(i);
  }
  final ranks = byRank.keys.toList()..sort();
  var i = 0;
  while (i < ranks.length) {
    var j = i;
    while (j + 1 < ranks.length && ranks[j + 1] == ranks[j] + 1) {
      j++;
    }
    final len = j - i + 1;
    if (len >= 3) {
      var acc = <List<int>>[[]];
      for (var k = i; k <= j; k++) {
        final next = <List<int>>[];
        for (final partial in acc) {
          for (final ix in byRank[ranks[k]]!) {
            next.add([...partial, ix]);
          }
        }
        acc = next;
      }
      for (final idx in acc) {
        combos.add(Combo('run', idx, len));
      }
    }
    i = j + 1;
  }
  final suit = hand[0].suit;
  if (hand.every((c) => c.suit == suit)) {
    if (starter.suit == suit) {
      combos.add(const Combo('flush', [0, 1, 2, 3, 4], 5));
    } else if (!isCrib) {
      combos.add(const Combo('flush', [0, 1, 2, 3], 4));
    }
  }
  for (var k = 0; k < 4; k++) {
    if (hand[k].rank == 11 && hand[k].suit == starter.suit) {
      combos.add(Combo('nobs', [k, 4], 1));
    }
  }
  return HandDetail(combos, combos.fold(0, (n, c) => n + c.pts));
}

// --- Round ---
// The first five cards deal themselves: one to each hand, one FACE DOWN to
// the crib. The player places only into hands; no hand may hold more than
// (crib size + 1) cards, and whenever every hand reaches that cap the next
// card deals itself into the crib. Crib stays hidden until the count.
class RoundState {
  final int seed;
  final List<PlayingCard> deck;
  final List<List<PlayingCard>> rows;
  final PlayingCard? current;
  final PlayingCard? starter;
  final bool complete;
  const RoundState({
    required this.seed,
    required this.deck,
    required this.rows,
    this.current,
    this.starter,
    this.complete = false,
  });
}

int maxHandSize(RoundState s) => math.min(s.rows[cribRow].length + 1, rowSize);

RoundState newRound(int seed) {
  final deck = shuffle(freshDeck(), mulberry32(seed));
  final rows = List.generate(5, (_) => <PlayingCard>[]);
  for (var i = 0; i < cribRow; i++) {
    rows[i].add(deck[i]);
  }
  rows[cribRow].add(deck[cribRow]);
  return _settle(RoundState(seed: seed, deck: deck.sublist(5), rows: rows));
}

bool canPlace(RoundState s, int r) =>
    !s.complete &&
    s.current != null &&
    r >= 0 &&
    r < cribRow &&
    s.rows[r].length < maxHandSize(s);

RoundState placeCard(RoundState s, int r) {
  if (!canPlace(s, r)) return s;
  final rows = [
    for (var i = 0; i < s.rows.length; i++)
      i == r ? [...s.rows[i], s.current!] : s.rows[i],
  ];
  return _settle(RoundState(seed: s.seed, deck: s.deck, rows: rows));
}

RoundState _settle(RoundState s) {
  final deck = List<PlayingCard>.of(s.deck);
  final rows = [for (final r in s.rows) List<PlayingCard>.of(r)];
  int cap() => math.min(rows[cribRow].length + 1, rowSize);
  bool atCap() => rows.take(cribRow).every((r) => r.length >= cap());
  while (rows[cribRow].length < rowSize && atCap()) {
    rows[cribRow].add(deck.removeAt(0));
  }
  final placed = rows.fold<int>(0, (n, r) => n + r.length);
  if (placed >= 5 * rowSize) {
    final starter = deck.removeAt(0);
    return RoundState(
        seed: s.seed, deck: deck, rows: rows, starter: starter, complete: true);
  }
  final current = deck.removeAt(0);
  return RoundState(seed: s.seed, deck: deck, rows: rows, current: current);
}

class RoundResult {
  final List<HandScore> rowScores;
  final int heels, handTotal, net;
  const RoundResult(this.rowScores, this.heels, this.handTotal, this.net);
}

RoundResult scoreRound(RoundState s) {
  final rowScores = [
    for (var i = 0; i < s.rows.length; i++)
      scoreHand(s.rows[i], s.starter!, i == cribRow),
  ];
  // His heels: a Jack turned as the starter is 2 points to the dealer,
  // and in this game the player is always their own dealer.
  final heels = s.starter != null && s.starter!.rank == 11 ? 2 : 0;
  final handTotal = rowScores.fold<int>(0, (n, x) => n + x.total) + heels;
  return RoundResult(rowScores, heels, handTotal, handTotal - par);
}

/// Rebuild a round from its seed and a list of row placements.
RoundState replay(int seed, Iterable<int> moves) {
  var r = newRound(seed);
  for (final m in moves) {
    r = placeCard(r, m);
  }
  return r;
}

// --- Match: race to 29, equal rounds guaranteed, ties allowed (2-4 seats) ---
class Outcome {
  final String kind; // playing | win | tie
  final int? player;
  const Outcome.playing()
      : kind = 'playing',
        player = null;
  const Outcome.tie()
      : kind = 'tie',
        player = null;
  const Outcome.win(int this.player) : kind = 'win';
  bool get isPlaying => kind == 'playing';
}

class MatchState {
  List<int> totals;
  List<int> roundsPlayed;
  int turn;
  int roundSeed;
  Outcome outcome;
  MatchState({
    required this.totals,
    required this.roundsPlayed,
    required this.turn,
    required this.roundSeed,
    this.outcome = const Outcome.playing(),
  });
}

MatchState newMatch([int firstPlayer = 0, int? seed, int players = 2]) =>
    MatchState(
      totals: List.filled(players, 0),
      roundsPlayed: List.filled(players, 0),
      turn: firstPlayer,
      roundSeed: seed ?? randomSeed(),
    );

MatchState applyRoundNet(MatchState m, int net, [int? nextSeed]) {
  final totals = List<int>.of(m.totals);
  final roundsPlayed = List<int>.of(m.roundsPlayed);
  totals[m.turn] += net;
  roundsPlayed[m.turn] += 1;
  final even = roundsPlayed.every((n) => n == roundsPlayed[0]);
  final home = totals.any((t) => t >= target);
  Outcome outcome = const Outcome.playing();
  if (even && home) {
    final top = totals.reduce(math.max);
    final leaders = [
      for (var i = 0; i < totals.length; i++)
        if (totals[i] == top) i
    ];
    outcome =
        leaders.length == 1 ? Outcome.win(leaders[0]) : const Outcome.tie();
  }
  return MatchState(
    totals: totals,
    roundsPlayed: roundsPlayed,
    turn: (m.turn + 1) % totals.length,
    roundSeed: nextSeed ?? randomSeed(),
    outcome: outcome,
  );
}

// --- AI ---
double _synergy(List<PlayingCard> row, PlayingCard card) {
  var s = 0.0;
  for (final c in row) {
    if (c.rank == card.rank) s += 2.4;
    final gap = (c.rank - card.rank).abs();
    if (gap == 1) {
      s += 1.3;
    } else if (gap == 2) {
      s += 0.5;
    }
    if (c.value + card.value == 15) s += 1.6;
    if (c.suit == card.suit) s += 0.25;
  }
  for (var i = 0; i < row.length; i++) {
    for (var j = i + 1; j < row.length; j++) {
      if (row[i].value + row[j].value + card.value == 15) s += 1.2;
    }
  }
  if (card.value == 5) s += 0.4;
  if (row.isEmpty) s -= 0.3;
  return s;
}

List<int> legalRows(RoundState s) =>
    [0, 1, 2, 3].where((i) => canPlace(s, i)).toList();

int _heuristicPick(RoundState s, double noise) {
  final card = s.current!;
  int? best;
  var bestScore = double.negativeInfinity;
  for (final r in legalRows(s)) {
    final score = _synergy(s.rows[r], card) +
        (noise > 0 ? (_rng.nextDouble() - 0.5) * noise : 0);
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best!;
}

// The AI may only know its hands and the current card — the crib is face
// down, so its real cards stay in the unknown pool, same as for a human.
List<PlayingCard> _unseenCards(RoundState s) {
  final seen = <String>{};
  for (var i = 0; i < cribRow; i++) {
    for (final c in s.rows[i]) {
      seen.add(c.id);
    }
  }
  if (s.current != null) seen.add(s.current!.id);
  return freshDeck().where((c) => !seen.contains(c.id)).toList();
}

int _monteCarloPick(RoundState s, int samples) {
  final card = s.current!;
  final candidates = legalRows(s);
  if (candidates.length == 1) return candidates[0];
  final unseen = _unseenCards(s);
  var best = candidates[0];
  var bestEv = double.negativeInfinity;
  for (final r in candidates) {
    // Crib simulated blind — its real cards are hidden from the AI.
    final placedRows = [
      for (var i = 0; i < s.rows.length; i++)
        i == cribRow
            ? <PlayingCard>[]
            : i == r
                ? [...s.rows[i], card]
                : List<PlayingCard>.of(s.rows[i]),
    ];
    var total = 0;
    for (var n = 0; n < samples; n++) {
      final pool = List<PlayingCard>.of(unseen);
      for (var i = pool.length - 1; i > 0; i--) {
        final j = _rng.nextInt(i + 1);
        final tmp = pool[i];
        pool[i] = pool[j];
        pool[j] = tmp;
      }
      var cursor = 0;
      final sim = [for (final row in placedRows) List<PlayingCard>.of(row)];
      for (final row in sim) {
        while (row.length < rowSize) {
          row.add(pool[cursor++]);
        }
      }
      final starter = pool[cursor];
      for (var i = 0; i < sim.length; i++) {
        total += scoreHand(sim[i], starter, i == cribRow).total;
      }
    }
    final ev = total / samples;
    if (ev > bestEv) {
      bestEv = ev;
      best = r;
    }
  }
  return best;
}

int aiChooseRow(RoundState s, String difficulty) {
  if (difficulty == 'easy') return _heuristicPick(s, 3.5);
  if (difficulty == 'medium') return _heuristicPick(s, 0);
  return _monteCarloPick(s, 60);
}
