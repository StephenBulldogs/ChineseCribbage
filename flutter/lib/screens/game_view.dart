import 'package:flutter/material.dart';

import '../app/controller.dart';
import '../engine/engine.dart' as e;
import '../theme.dart';
import '../widgets/board.dart';

/// Local board: solo, versus AI, pass & play and Conquest levels.
class GameView extends StatelessWidget {
  final App app;
  const GameView({super.key, required this.app});

  @override
  Widget build(BuildContext context) {
    final m = app.match;
    if (m == null) return const SizedBox.shrink();
    final r = app.round;
    final seat = m.turn;
    final ch = app.challenge;

    String roundText;
    String? goal;
    if (ch != null) {
      final lv = ch.level;
      final budget = lv.type == 'ai' ? '' : ' / ${lv.rounds}';
      roundText = 'Level ${lv.id} · Round ${m.roundsPlayed[seat] + 1}$budget';
      final opp = app.players.skip(1).map((p) => p.name).join(', ');
      goal = 'Goal: ${lv.type == 'solo' ? 'reach ${lv.target ?? 29} within ${lv.rounds} rounds' : lv.type == 'bestRound' ? 'score ${lv.score}+ in a single round' : 'reach ${lv.target ?? 29} and finish above $opp'}';
    } else {
      roundText = 'Round ${m.roundsPlayed[seat] + 1}';
    }

    final lanes = app.mode == 'solo'
        ? [Lane('You', m.totals[0])]
        : [for (var i = 0; i < app.players.length; i++) Lane(app.players[i].name, i < m.totals.length ? m.totals[i] : 0)];

    final counting = app.countingLocal;
    final humanTurn = app.humanTurn;

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Padding(
        padding: const EdgeInsets.only(top: 4, bottom: 10),
        child: Text(roundText, style: display(24)),
      ),
      if (goal != null)
        Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
              color: const Color(0xE01C0E0C),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: C.brassDim)),
          child: Text(goal, style: const TextStyle(color: C.brass, fontSize: 13, fontWeight: FontWeight.w600)),
        ),
      Rail(lanes: lanes, activeIdx: app.mode == 'solo' ? 0 : seat, reduceMotion: app.reduceMotion),
      if (r != null) ...[
        if (r.complete)
          DrawPanel(
            label: const Text('Starter'),
            sub: counting ? 'counting the hands…' : 'Counts in all five hands.',
            card: ThemedCard(app, r.starter, width: 84, animate: true, glow: counting && app.count!.set.contains(4)),
          )
        else
          DrawPanel(
            label: Text(app.mode == 'solo' ? 'Your card' : '${app.players[seat].name} to place'),
            sub: humanTurn ? 'Tap a hand to place it.' : '${app.players[seat].name} is thinking…',
            card: ThemedCard(app, r.current,
                width: 84, animate: true, faceDown: !humanTurn && app.mode == 'pass'),
          ),
        if (counting) CountCallout(count: app.count!, onSkip: app.skipCount),
        RowsView(
          app: app,
          round: r,
          placeable: (i) => humanTurn && !counting && e.canPlace(r, i),
          rowScores: r.complete && !counting ? e.scoreRound(r).rowScores : null,
          count: counting ? app.count : null,
          onPlace: app.place,
        ),
      ],
    ]);
  }
}
