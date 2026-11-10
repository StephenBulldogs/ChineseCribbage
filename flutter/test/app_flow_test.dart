// Drives the real widget tree through the offline modes end to end.
import 'package:chinese_cribbage/app/controller.dart';
import 'package:chinese_cribbage/main.dart';
import 'package:chinese_cribbage/screens/dialogs.dart' as dlg;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Future<void> pump(WidgetTester t, [int ms = 50]) async {
  for (var i = 0; i < 6; i++) {
    await t.pump(Duration(milliseconds: ms));
  }
}

/// Place cards (tapping the first placeable hand) until the round is done,
/// then tap Continue on the score sheet.
Future<void> playMyRound(WidgetTester t, App app) async {
  var guard = 0;
  while (app.round != null && !app.round!.complete && app.humanTurn && guard++ < 20) {
    final before = app.round;
    for (var i = 0; i < 4; i++) {
      app.place(i);
      if (!identical(app.round, before)) break;
    }
    await pump(t, 5);
  }
  // fast count runs on 1ms timers
  for (var i = 0; i < 200 && app.scoreSheet == null; i++) {
    await t.pump(const Duration(milliseconds: 5));
  }
}

void main() {
  testWidgets('solo run: home → place → count → score sheet → next round', (t) async {
    await t.binding.setSurfaceSize(const Size(390, 844));
    final app = App()..fastCount = true;
    await t.pumpWidget(CribbageApp(app: app));
    await pump(t);
    expect(find.text('Offline play'), findsOneWidget);
    await t.tap(find.text('Offline play'));
    await pump(t);
    await t.tap(find.text('Solo run'));
    await pump(t);
    expect(app.view, AppView.game);
    expect(find.text('Round 1'), findsOneWidget);
    expect(find.text('HAND 1'), findsOneWidget);

    // tap a real row widget once to prove the InkWell wiring
    final placedBefore = app.round!.rows.fold<int>(0, (n, r) => n + r.length);
    await t.tap(find.text('HAND 1'));
    await pump(t);
    expect(app.round!.rows.fold<int>(0, (n, r) => n + r.length), greaterThan(placedBefore));

    await playMyRound(t, app);
    expect(app.scoreSheet, isNotNull);
    await pump(t);
    expect(find.text('Continue'), findsOneWidget);
    await t.tap(find.text('Continue'));
    await pump(t);
    expect(app.match!.roundsPlayed[0], 1);
    expect(find.text('Round 2'), findsOneWidget);
  });

  testWidgets('versus AI: AI takes its round after mine', (t) async {
    await t.binding.setSurfaceSize(const Size(390, 844));
    final app = App()..fastCount = true;
    await t.pumpWidget(CribbageApp(app: app));
    app.difficulty = 'hard';
    app.startMatch('ai');
    await pump(t);
    await playMyRound(t, app);
    app.scoreSheet = null;
    app.nextRound();
    await pump(t);
    expect(app.match!.turn, 1);
    for (var i = 0; i < 400 && app.scoreSheet == null; i++) {
      await t.pump(const Duration(milliseconds: 5));
    }
    expect(app.scoreSheet!.eyebrow, contains('Captain'));
    app.nextRound();
    await pump(t);
    expect(app.match!.turn, 0);
    expect(app.match!.roundsPlayed, [1, 1]);
  });

  testWidgets('pass & play: 3 seats, handoff between players', (t) async {
    await t.binding.setSurfaceSize(const Size(390, 844));
    final app = App()..fastCount = true;
    await t.pumpWidget(CribbageApp(app: app));
    app.passCount = 3;
    app.passNames[1] = 'Bo';
    app.startMatch('pass');
    await pump(t);
    expect(app.players.length, 3);
    await playMyRound(t, app);
    app.nextRound();
    await pump(t);
    expect(find.text('Bo'), findsWidgets);
    expect(find.text("I'm ready"), findsOneWidget);
    await t.tap(find.text("I'm ready"));
    await pump(t);
    expect(app.match!.turn, 1);
  });

  testWidgets('online without Firebase config shows the setup notice; quit returns home', (t) async {
    await t.binding.setSurfaceSize(const Size(390, 844));
    final app = App();
    await t.pumpWidget(CribbageApp(app: app));
    await t.tap(find.text('Online play'));
    await pump(t);
    expect(find.text('Online play needs a one-time setup'), findsOneWidget);
    app.startMatch('solo');
    await pump(t);
    app.quitGame();
    await pump(t);
    expect(app.view, AppView.home);
  });

  testWidgets('conquest: quitting a level costs a life and shows the fail sheet', (t) async {
    await t.binding.setSurfaceSize(const Size(390, 844));
    final app = App()..fastCount = true;
    await t.pumpWidget(CribbageApp(app: app));
    app.openLevel(2); // an AI duel
    await pump(t);
    expect(find.text('Play (1 ❤ at stake)'), findsOneWidget);
    await t.tap(find.text('Play (1 ❤ at stake)'));
    await pump(t);
    expect(app.mode, 'conquest');
    expect(app.players.length, 2);
    app.quitGame();
    await pump(t);
    expect(app.campaign.lives, 4);
    expect(find.textContaining('FAILED'), findsOneWidget);
    expect(find.text('Retry (1 ❤)'), findsOneWidget);
  });

  testWidgets('settings: privacy policy always, delete account only when signed in', (t) async {
    await t.binding.setSurfaceSize(const Size(390, 844));
    final app = App();
    await t.pumpWidget(CribbageApp(app: app));
    dlg.showSettings(app);
    await pump(t);
    expect(find.text('Privacy policy'), findsOneWidget);
    expect(find.text('Delete account'), findsNothing);
    dlg.close('settings');
    app.uid = 'g1';
    app.profile = {'name': 'Ann', 'provider': 'guest', 'friendCode': 'ABCDEF'};
    dlg.showSettings(app);
    await pump(t);
    expect(find.text('Delete account'), findsOneWidget);
    await t.tap(find.text('Delete account'));
    await pump(t);
    expect(find.text('Delete everything?'), findsOneWidget);
    expect(find.textContaining('sign in again'), findsNothing); // guests skip re-auth
  });
}
