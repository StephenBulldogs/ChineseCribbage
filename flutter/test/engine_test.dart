// Port of the web suite (engine.test.js) plus cross-engine vectors generated
// from engine.js, so a phone and a browser deal identical cards per seed.
import 'package:chinese_cribbage/engine/engine.dart';
import 'package:flutter_test/flutter_test.dart';

PlayingCard c(int r, String s) => PlayingCard(r, s);
String rowsStr(RoundState r) =>
    r.rows.map((x) => x.map((c) => '${c.rank}${c.suit}').join(',')).join('|');

void main() {
  group('scoreHand (same vectors as the web/TS suites)', () {
    test('perfect 29', () => expect(scoreHand([c(5, 'H'), c(5, 'D'), c(5, 'C'), c(11, 'S')], c(5, 'S')).total, 29));
    test('zero hand', () => expect(scoreHand([c(1, 'H'), c(3, 'D'), c(7, 'C'), c(13, 'S')], c(10, 'H')).total, 0));
    test('double run + fifteens', () => expect(scoreHand([c(4, 'H'), c(4, 'D'), c(5, 'C'), c(6, 'S')], c(13, 'H')).total, 14));
    test('hand flush 4', () => expect(scoreHand([c(2, 'H'), c(4, 'H'), c(6, 'H'), c(9, 'H')], c(13, 'S')).total, 8));
    test('crib flush needs 5', () => expect(scoreHand([c(2, 'H'), c(4, 'H'), c(6, 'H'), c(9, 'H')], c(13, 'S'), true).total, 4));
    test('nobs', () => expect(scoreHand([c(11, 'H'), c(2, 'D'), c(8, 'C'), c(13, 'S')], c(7, 'H')).nobs, 1));
    final st = c(5, 'S');
    test('blog hands', () {
      expect(scoreHand([c(1, 'H'), c(2, 'D'), c(3, 'C'), c(13, 'H')], st).total, 7);
      expect(scoreHand([c(1, 'C'), c(2, 'H'), c(8, 'C'), c(12, 'H')], st).total, 4);
      expect(scoreHand([c(7, 'H'), c(7, 'D'), c(9, 'C'), c(9, 'H')], st).total, 4);
      expect(scoreHand([c(1, 'D'), c(4, 'H'), c(6, 'C'), c(12, 'D')], st).total, 9);
      expect(scoreHand([c(6, 'H'), c(9, 'D'), c(10, 'C'), c(10, 'H')], st, true).total, 8);
    });
  });

  test('deal rules', () {
    var r = newRound(12345);
    expect(r.rows.take(4).every((x) => x.length == 1), true);
    expect(r.rows[4].length, 1);
    expect(canPlace(r, 4), false);
    var ct = placeCard(r, 0);
    expect(canPlace(ct, 0), false);
    ct = placeCard(placeCard(placeCard(ct, 1), 2), 3);
    expect(ct.rows[4].length, 2);
    var placements = 0;
    while (!r.complete) {
      var moved = false;
      for (var i = 0; i < 4; i++) {
        final b = r;
        r = placeCard(r, i);
        if (!identical(r, b)) {
          moved = true;
          break;
        }
      }
      expect(moved, true);
      placements++;
    }
    expect(placements, 12);
    final res = scoreRound(r);
    expect(res.net, res.handTotal - par);
    expect(r.deck.length, 31);
  });

  test('match rules', () {
    var m = applyRoundNet(newMatch(0), 30);
    expect(m.outcome.kind, 'playing');
    m = applyRoundNet(m, 35);
    expect(m.outcome.kind, 'win');
    expect(m.outcome.player, 1);
    var m2 = applyRoundNet(applyRoundNet(newMatch(0), 29), 29);
    expect(m2.outcome.kind, 'tie');
    var m3 = newMatch(0, null, 3);
    expect(m3.totals, [0, 0, 0]);
    m3 = applyRoundNet(m3, 30);
    expect(m3.turn, 1);
    m3 = applyRoundNet(m3, 20);
    expect(m3.outcome.kind, 'playing');
    m3 = applyRoundNet(m3, 25);
    expect(m3.outcome.player, 0);
    var m4 = newMatch(0, null, 3);
    m4 = applyRoundNet(applyRoundNet(applyRoundNet(m4, 30), 30), 10);
    expect(m4.outcome.kind, 'tie');
  });

  test('his heels', () {
    final rows = [
      [c(2, 'H'), c(4, 'D'), c(7, 'C'), c(9, 'S')],
      [c(3, 'H'), c(6, 'D'), c(8, 'C'), c(13, 'S')],
      [c(2, 'D'), c(4, 'H'), c(7, 'S'), c(9, 'C')],
      [c(3, 'D'), c(6, 'H'), c(8, 'S'), c(13, 'C')],
      [c(2, 'C'), c(4, 'S'), c(7, 'H'), c(9, 'D')],
    ];
    final j = RoundState(seed: 0, deck: const [], rows: rows, starter: c(11, 'H'), complete: true);
    final t = RoundState(seed: 0, deck: const [], rows: rows, starter: c(10, 'H'), complete: true);
    final rowsOnly = [for (var i = 0; i < 5; i++) scoreHand(rows[i], c(11, 'H'), i == 4).total].reduce((a, b) => a + b);
    expect(scoreRound(j).handTotal, rowsOnly + 2);
    expect(scoreRound(j).heels, 2);
    expect(scoreRound(t).heels, 0);
  });

  test('detail scoring agrees with scoreHand', () {
    final rng = mulberry32(7);
    for (var n = 0; n < 300; n++) {
      final deck = shuffle(freshDeck(), rng);
      final hand = deck.sublist(0, 4);
      final isCrib = n.isEven;
      final det = scoreHandDetail(hand, deck[4], isCrib);
      expect(det.total, scoreHand(hand, deck[4], isCrib).total);
      for (final cb in det.combos) {
        expect(cb.idx.every((i) => i >= 0 && i <= 4), true);
      }
    }
    final det = scoreHandDetail([c(4, 'H'), c(4, 'D'), c(5, 'C'), c(6, 'S')], c(13, 'H'));
    expect(det.combos.length, 6);
    expect(det.combos.where((x) => x.kind == 'run').length, 2);
  });

  test('AI plays legal rounds at every difficulty', () {
    for (final d in ['easy', 'medium', 'hard']) {
      var ar = newRound(999);
      var g = 0;
      while (!ar.complete && g++ < 20) {
        ar = placeCard(ar, aiChooseRow(ar, d));
      }
      expect(ar.complete && ar.rows.every((x) => x.length == 4), true, reason: d);
    }
  });

  // Generated with engine.js (node) — must match exactly for cross-play.
  group('cross-engine compatibility with engine.js', () {
    const rand = {
      0: [0.26642920868471265, 0.0003297457005828619, 0.2232720274478197],
      1: [0.6270739405881613, 0.002735721180215478, 0.5274470399599522],
      12345: [0.9797282677609473, 0.3067522644996643, 0.484205421525985],
      4294967294: [0.1577923847362399, 0.04910933715291321, 0.7769853791687638],
      2863311530: [0.35264988895505667, 0.31494488124735653, 0.5336666523944587],
    };
    const rounds = {
      0: ['5C,5D,13S,5H|12C,11H,10D,12D|13D,6D,9D,6S|2S,7S,6H,8D|13C,3C,4S,7D', '1D', '021301230321', 41],
      1: ['12H,12C,2C,9S|6C,6D,9D,8D|11H,3C,10D,4S|11S,7S,10H,11C|5C,4D,12S,2H', '5S', '102323012310', 34],
      12345: ['5D,4D,12S,1C|10H,8C,8S,7C|13H,5S,13C,9H|6D,3C,1H,1S|2H,11D,6C,2D', '8D', '102331203120', 31],
      999: ['6S,12H,5D,4D|13H,1H,11H,4H|11C,1C,10H,11S|8C,8D,8H,10D|5S,4S,6D,5C', '10S', '120320312013', 48],
      4294967294: ['13S,4S,4D,4C|11C,5S,10S,7C|10H,12S,9D,1S|7H,2H,1H,1D|11D,2D,9C,12H', '8S', '012330210312', 19],
      2863311530: ['8D,10D,9S,9H|13C,5D,13S,2C|7C,12H,7H,10S|12C,12D,13H,11D|1C,3C,5C,7D', '1H', '103202133012', 30],
    };
    rand.forEach((seed, want) {
      test('mulberry32($seed)', () {
        final r = mulberry32(seed);
        expect([r(), r(), r()], want);
      });
    });
    rounds.forEach((seed, want) {
      test('medium-AI round from seed $seed', () {
        var rd = newRound(seed);
        final moves = StringBuffer();
        while (!rd.complete) {
          final m = aiChooseRow(rd, 'medium');
          moves.write(m);
          rd = placeCard(rd, m);
        }
        expect(rowsStr(rd), want[0]);
        expect('${rd.starter!.rank}${rd.starter!.suit}', want[1]);
        expect(moves.toString(), want[2]);
        expect(scoreRound(rd).handTotal, want[3]);
        // replaying the move log reproduces the same board
        expect(rowsStr(replay(seed, moves.toString().split('').map(int.parse))), want[0]);
      });
    });
  });
}
