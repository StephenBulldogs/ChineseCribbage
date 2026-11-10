import 'package:chinese_cribbage/app/controller.dart';
import 'package:chinese_cribbage/app/json.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('RTDB arrays with null holes become index-keyed maps', () {
    // {"1":3,"2":2} comes back from RTDB as [null, 3, 2]
    final m = asMap([null, 3, 2]);
    expect(m, {'1': 3, '2': 2});
    final c = Campaign.fromJson({'level': 3, 'stars': [null, 3, 2], 'lives': 4, 'lastLifeAt': 5});
    expect(c.stars, {1: 3, 2: 2});
    expect(c.totalStars, 5);
    expect(c.lives, 4);
  });
  test('move logs from arrays or maps', () {
    expect(normMoves([0, 1, 3]), [0, 1, 3]);
    expect(normMoves({'1': 2, '0': 1}), [1, 2]);
    expect(normMoves(null), <int>[]);
  });
  test('round entries keyed by index survive list shape', () {
    final rounds = asMap([{'net0': 3, 'net1': -2}, {'net0': 1}]);
    expect(asMap(rounds['1'])['net0'], 1);
    expect(asMap(rounds['0'])['net1'], -2);
  });
}
