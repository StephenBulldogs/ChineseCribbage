// App state + logic: a direct port of ui.js's `S` object and the functions
// that act on it. Widgets read from [App] and call its methods; [App]
// notifies listeners whenever anything visible changes.
library;

import 'dart:async';
import 'dart:math' as math;

import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_database/firebase_database.dart';
import 'package:flutter/material.dart';

import '../engine/engine.dart' as e;
import '../firebase_options.dart';
import '../game/catalog.dart';
import '../screens/dialogs.dart' as dlg;
import 'json.dart';

part 'account.dart';
part 'conquest.dart';
part 'online.dart';

enum AppView { home, game, online, map, friends, messages }

enum OPanel { auth, lobby, make, find, conquestPanel, setup, wait, game }

class Player {
  final String name;
  final String kind; // human | ai
  const Player(this.name, this.kind);
  bool get isAi => kind == 'ai';
}

class Campaign {
  int level;
  Map<int, int> stars;
  int lives;
  int lastLifeAt;
  Campaign({required this.level, required this.stars, required this.lives, required this.lastLifeAt});
  factory Campaign.blank() =>
      Campaign(level: 1, stars: {}, lives: maxLives, lastLifeAt: DateTime.now().millisecondsSinceEpoch);
  Map<String, dynamic> toJson() => {
        'level': level,
        'stars': {for (final e in stars.entries) '${e.key}': e.value},
        'lives': lives,
        'lastLifeAt': lastLifeAt,
      };
  int get totalStars => stars.values.fold(0, (n, v) => n + v);
  int get cleared => stars.length;

  static Campaign fromJson(Object? raw) {
    final m = asMap(raw);
    final stars = <int, int>{};
    asMap(m['stars']).forEach((k, v) {
      final id = int.tryParse(k);
      if (id != null && v != null) stars[id] = toInt(v);
    });
    return Campaign(
        level: toInt(m['level'], 1),
        stars: stars,
        lives: m['lives'] is num ? toInt(m['lives']) : maxLives,
        lastLifeAt: toInt(m['lastLifeAt'], DateTime.now().millisecondsSinceEpoch));
  }
}

class Challenge {
  final Level level;
  int roundsUsed;
  final int target;
  Challenge(this.level, {this.roundsUsed = 0, required this.target});
}

class Deal {
  final int seed;
  final List<int> moves;
  Deal(this.seed, this.moves);
}

class ConquestMatch {
  final List<AiOpp> ais;
  final int target;
  List<int> totals;
  int rounds;
  final int n;
  ConquestMatch(this.ais, this.target, this.totals, this.rounds) : n = ais.length + 1;
}

class LastResult {
  final e.RoundResult result;
  final int seat;
  const LastResult(this.result, this.seat);
}

class CountEv {
  final String t; // heels | row | combo | done
  final int row;
  final e.Combo? combo;
  final int total;
  const CountEv(this.t, {this.row = -1, this.combo, this.total = 0});
}

/// The animated count: walks every scoring combination, hand by hand.
class CountState {
  final e.RoundState round;
  final String prefix; // g (local) | o (online)
  final List<CountEv> queue;
  int pos = 0;
  final List<int> rowTotals = [0, 0, 0, 0, 0];
  int row = -1;
  Set<int> set = {};
  String label = 'The count';
  String sub = '';
  bool reveal = false;
  final VoidCallback? done;
  Timer? timer;
  bool active = true;
  CountState(this.round, this.prefix, this.queue, this.done);
}

class ScoreSheet {
  final String eyebrow;
  final e.RoundResult result;
  const ScoreSheet(this.eyebrow, this.result);
}

class ChallengeResult {
  final String eyebrow, title, stars, sub;
  final bool showRetry, showNext;
  const ChallengeResult(this.eyebrow, this.title, this.stars, this.sub, this.showRetry, this.showNext);
}

class App extends ChangeNotifier {
  App();
  static final navKey = GlobalKey<NavigatorState>();

  // ---- firebase ----
  bool firebaseReady = false;
  FirebaseDatabase? _db;
  DatabaseReference ref(String path) => _db!.ref(path);
  bool get hasDb => _db != null;

  Future<void> initFirebase() async {
    if (!DefaultFirebaseOptions.isConfigured) return;
    try {
      await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
      _db = FirebaseDatabase.instance;
      firebaseReady = true;
      _authSub = FirebaseAuth.instance.authStateChanges().listen(_onAuth);
    } catch (err) {
      debugPrint('Firebase init failed: $err');
      firebaseReady = false;
      _db = null;
    }
    notifyListeners();
  }

  void refresh() => notifyListeners();

  // ---- navigation ----
  AppView view = AppView.home;
  bool offlineTilesOpen = false;
  final scrollToTop = ValueNotifier<int>(0);

  void show(AppView v) {
    view = v;
    scrollToTop.value++;
    notifyListeners();
  }

  bool get inGame => view == AppView.game || (view == AppView.online && code != null);

  void gotoTab(String tab) {
    switch (tab) {
      case 'home':
        show(AppView.home);
      case 'conquest':
        if (uid != null && profile != null && !isGuest) {
          openMap();
        } else {
          openOnline();
        }
      case 'friends':
        show(AppView.friends);
      case 'messages':
        show(AppView.messages);
      case 'profile':
        if (uid != null) {
          dlg.openProfile(this, null);
        } else {
          openOnline();
        }
    }
  }

  String get activeTab => switch (view) {
        AppView.home || AppView.online => 'home',
        AppView.friends => 'friends',
        AppView.messages => 'messages',
        AppView.map => 'conquest',
        AppView.game => '',
      };

  // ---- settings ----
  bool sound = true;
  bool reduceMotion = false;
  bool fastCount = false;

  // ---- local game ----
  String mode = 'ai'; // solo | ai | pass | conquest
  String difficulty = 'medium';
  int passCount = 2;
  final List<String> passNames = ['Player 1', 'Player 2', 'Player 3', 'Player 4'];
  List<Player> players = const [Player('You', 'human'), Player('Navigator', 'ai')];
  e.MatchState? match;
  e.RoundState? round;
  LastResult? lastResult;
  Timer? _aiTimer;
  CountState? count;
  ScoreSheet? scoreSheet;
  String overTitle = '', overSub = '';
  String handoffName = '';

  // ---- conquest ----
  Campaign campaign = Campaign.blank();
  Challenge? challenge;
  Map<String, dynamic>? activeSnap;
  Deal? cqDeal;
  ConquestMatch? cq;
  Level? pendingLevel;
  int? lastClearedLevel;
  bool mapScrolled = false;
  Timer? _mapTick;
  ChallengeResult? challengeResult;

  // ---- online ----
  OPanel oPanel = OPanel.lobby;
  String? oError;
  String? lobbyError;
  String? code;
  int seat = 0; // -1 = spectator
  Map<String, dynamic>? room;
  String myName = '';
  String visibility = 'public';
  int roomSize = 2;
  List<String> seatConfig = ['open'];
  String aiJob = '';
  Timer? _aiTimerOnline;
  Timer? _rosterTick;
  e.RoundState? oRound;
  int oSeed = 0;
  List<int> oMoves = [];
  int startedRound = -1;
  int oCounted = -1;
  StreamSubscription? _roomSub;
  StreamSubscription? _pubSub;
  Map<String, dynamic>? publicRooms;

  // ---- account & social ----
  String? uid;
  String? email;
  Map<String, dynamic>? profile;
  String pendingName = '';
  String? authError;
  String? friendError;
  Map<String, dynamic> friends = {};
  Map<String, Map<String, dynamic>> friendInfo = {};
  final Map<String, StreamSubscription> friendWatches = {};
  Map<String, dynamic> challenges = {};
  Map<String, dynamic>? pendingChallenge;
  final Set<String> statsRecorded = {};
  final List<StreamSubscription> _socialSubs = [];
  StreamSubscription? _authSub;
  Map<String, dynamic>? adminUsers;
  String? adminError;

  void startMatch(String m) {
    cancelCount();
    mode = m;
    players = m == 'ai'
        ? [const Player('You', 'human'), Player(aiNames[difficulty]!, 'ai')]
        : m == 'pass'
            ? [for (final n in passNames.take(passCount)) Player(n, 'human')]
            : const [Player('You', 'human'), Player('-', 'human')];
    match = e.newMatch(0, null, players.length);
    round = e.newRound(match!.roundSeed);
    lastResult = null;
    show(AppView.game);
  }

  bool get humanTurn => match != null && !players[match!.turn].isAi;
  bool get countingLocal => count != null && count!.active && count!.prefix == 'g';

  void place(int rowIndex) {
    final r = round;
    if (r == null || !e.canPlace(r, rowIndex) || !humanTurn || countingLocal) return;
    round = e.placeCard(r, rowIndex);
    if (challenge != null && cqDeal != null) {
      cqDeal!.moves.add(rowIndex);
      saveChallengeSnapshot();
    }
    notifyListeners();
    if (round!.complete) startCount(round!, 'g', _onRoundComplete);
  }

  void _onRoundComplete() {
    final result = e.scoreRound(round!);
    lastResult = LastResult(result, match!.turn);
    if (!players[match!.turn].isAi) recordHand(result.rowScores, result.handTotal);
    scoreSheet = ScoreSheet(
        mode == 'solo' ? 'Round complete' : '${players[match!.turn].name} · round complete', result);
    notifyListeners();
    dlg.showScore(this);
  }

  void nextRound() {
    dlg.close('score');
    final last = lastResult;
    if (last == null) return;
    if (mode == 'conquest') {
      _conquestAdvance();
      return;
    }
    final m = match!;
    if (mode == 'solo') {
      m.totals[0] += last.result.net;
      m.roundsPlayed[0] += 1;
      lastResult = null;
      if (challenge != null) {
        if (_challengeSoloStep(last.result)) return;
        cqDeal = Deal(e.randomSeed(), []);
        round = e.newRound(cqDeal!.seed);
        saveChallengeSnapshot();
        notifyListeners();
        return;
      }
      if (m.totals[0] >= e.target) {
        final n = m.roundsPlayed[0];
        round = null;
        overTitle = 'You made it home';
        overSub = 'Reached ${m.totals[0]} in $n round${n == 1 ? '' : 's'}. Think you can do it in fewer?';
        notifyListeners();
        dlg.showOver(this);
        return;
      }
      round = e.newRound(e.randomSeed());
      notifyListeners();
      return;
    }
    final adv = e.applyRoundNet(m, last.result.net);
    match = adv;
    lastResult = null;
    if (!adv.outcome.isPlaying) {
      round = null;
      notifyListeners();
      _showMatchOver(adv);
      return;
    }
    round = e.newRound(adv.roundSeed);
    notifyListeners();
    final next = players[adv.turn];
    if (mode == 'pass' && !next.isAi) {
      handoffName = next.name;
      dlg.showHandoff(this);
    } else if (next.isAi) {
      _runAiRound(difficulty);
    }
  }

  void _runAiRound(String diff, {int ms = 300}) {
    _aiTimer?.cancel();
    _aiTimer = Timer.periodic(Duration(milliseconds: fastCount ? 5 : ms), (t) {
      final r = round;
      if (r == null || r.complete) {
        t.cancel();
        return;
      }
      round = e.placeCard(r, e.aiChooseRow(r, diff));
      notifyListeners();
      if (round!.complete) {
        t.cancel();
        startCount(round!, 'g', _onRoundComplete);
      }
    });
  }

  void _showMatchOver(e.MatchState m) {
    final o = m.outcome;
    overTitle = o.kind == 'tie' ? "It's a tie" : '${players[o.player!].name} wins';
    var sub = [for (var i = 0; i < m.totals.length; i++) '${players[i].name} ${m.totals[i]}'].join(' · ');
    // Coins for a vs-AI win by the human seat (pass & play and solo don't pay).
    if (mode == 'ai' && o.kind == 'win' && !players[o.player!].isAi) {
      final coins = addCoins(1);
      if (coins > 0) sub += ' · +$coins coins';
    }
    overSub = sub;
    notifyListeners();
    dlg.showOver(this);
  }

  /// The ✕ in the app bar while a local game is up.
  void quitGame() {
    for (final d in ['score', 'handoff', 'over']) {
      dlg.close(d);
    }
    if (challenge != null) {
      challengeFail();
      return;
    }
    cancelCount();
    _aiTimer?.cancel();
    match = null;
    round = null;
    show(AppView.home);
  }

  void overRematch() {
    dlg.close('over');
    if (view == AppView.online) {
      leaveRoom();
      openOnline();
    } else {
      startMatch(mode);
    }
  }

  void overHome() {
    dlg.close('over');
    if (view == AppView.online) {
      leaveRoom();
    } else {
      match = null;
      show(AppView.home);
    }
  }

  // ---- the count ----
  int _countDelay(CountEv ev) {
    if (fastCount) return 1;
    return ev.t == 'combo' ? 850 : ev.t == 'row' ? 550 : 500;
  }

  void startCount(e.RoundState r, String prefix, VoidCallback done) {
    cancelCount();
    final q = <CountEv>[];
    if (r.starter != null && r.starter!.rank == 11) q.add(const CountEv('heels'));
    for (var i = 0; i < 5; i++) {
      final det = e.scoreHandDetail(r.rows[i], r.starter!, i == e.cribRow);
      q.add(CountEv('row', row: i));
      for (final c in det.combos) {
        q.add(CountEv('combo', row: i, combo: c));
      }
      q.add(CountEv('done', row: i, total: det.total));
    }
    count = CountState(r, prefix, q, done);
    _stepCount();
  }

  void _stepCount() {
    final c = count;
    if (c == null || !c.active) return;
    if (c.pos >= c.queue.length) return _finishCount();
    final ev = c.queue[c.pos++];
    switch (ev.t) {
      case 'heels':
        c.row = -1;
        c.set = {4};
        c.label = 'His heels';
        c.sub = '+2. The starter is a Jack.';
      case 'row':
        c.row = ev.row;
        c.set = {};
        if (ev.row == e.cribRow) c.reveal = true;
        c.label = rowLabels[ev.row];
        c.sub = ev.row == e.cribRow ? 'the crib turns over…' : 'counting…';
      case 'combo':
        c.row = ev.row;
        c.set = ev.combo!.idx.toSet();
        c.rowTotals[ev.row] += ev.combo!.pts;
        c.label = ev.combo!.label;
        c.sub = '+${ev.combo!.pts} · ${rowLabels[ev.row]} has ${c.rowTotals[ev.row]}';
      default:
        c.set = {};
        c.label = '${rowLabels[ev.row]}: ${ev.total}';
        c.sub = ev.total == 0 ? 'no count' : '';
    }
    notifyListeners();
    c.timer = Timer(Duration(milliseconds: _countDelay(ev)), _stepCount);
  }

  void _finishCount() {
    final c = count;
    if (c == null) return;
    c.active = false;
    count = null;
    c.done?.call();
    notifyListeners();
  }

  void skipCount() {
    final c = count;
    if (c == null) return;
    c.timer?.cancel();
    _finishCount();
  }

  void cancelCount() {
    if (count != null) {
      count!.timer?.cancel();
      count = null;
    }
  }

  @override
  void dispose() {
    _aiTimer?.cancel();
    _aiTimerOnline?.cancel();
    _rosterTick?.cancel();
    _mapTick?.cancel();
    _authSub?.cancel();
    super.dispose();
  }
}

int _now() => DateTime.now().millisecondsSinceEpoch;
