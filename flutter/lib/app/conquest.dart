part of 'controller.dart';

/// Conquest: campaign map, lives, stars, resume snapshots, challenge flow.
extension Conquest on App {
  int get lifeMs => (profile?['premium'] == true) ? premiumLifeMs : standardLifeMs;
  int get lifeRegrowMinutes => (lifeMs / 60000).round();

  /// Lazy heart regrowth: one per lifeMs, capped at maxLives.
  void refreshLives() {
    final c = campaign;
    if (c.lives >= maxLives) {
      c.lastLifeAt = _now();
      return;
    }
    final elapsed = _now() - c.lastLifeAt;
    final gained = elapsed ~/ lifeMs;
    if (gained > 0) {
      c.lives = math.min(maxLives, c.lives + gained);
      c.lastLifeAt = c.lives >= maxLives ? _now() : c.lastLifeAt + gained * lifeMs;
      saveCampaign();
    }
  }

  void loseLife() {
    refreshLives();
    final c = campaign;
    if (c.lives >= maxLives) c.lastLifeAt = _now(); // the regrow clock starts now
    c.lives = math.max(0, c.lives - 1);
    saveCampaign();
  }

  int nextLifeIn() {
    final c = campaign;
    if (c.lives >= maxLives) return 0;
    return math.max(0, lifeMs - (_now() - c.lastLifeAt));
  }

  String get lifeTimerText {
    if (campaign.lives >= maxLives) return 'hearts full';
    final ms = nextLifeIn();
    return '+1 ❤ in ${ms ~/ 60000}:${((ms % 60000) / 1000).ceil().toString().padLeft(2, '0')}';
  }

  void saveCampaign() {
    if (uid != null && hasDb) ref('users/$uid/campaign').set(campaign.toJson()).catchError((_) {});
    pushLeaderboard();
  }

  void loadCampaign(Object? stored) {
    // Replace with THIS account's progress (never merge with a previous one).
    campaign = stored == null ? Campaign.blank() : Campaign.fromJson(stored);
    refreshLives();
  }

  /* Persist the in-progress level so closing the app loses neither the
     level nor the life. Only the human seat's deal needs replaying. */
  void saveChallengeSnapshot() {
    if (uid == null || !hasDb || challenge == null) return;
    final lv = challenge!.level;
    Map<String, dynamic> snap;
    if (mode == 'conquest') {
      final humanTurn = match!.turn == 0;
      snap = {
        'id': lv.id,
        'mode': 'conquest',
        'totals': List<int>.of(cq!.totals),
        'roundsPlayed': List<int>.of(match!.roundsPlayed),
        'rounds': cq!.rounds,
        'turn': match!.turn,
        'seed': humanTurn ? cqDeal!.seed : 0,
        'moves': humanTurn ? List<int>.of(cqDeal!.moves) : <int>[],
      };
    } else {
      snap = {
        'id': lv.id,
        'mode': 'solo',
        'total': match!.totals[0],
        'roundsUsed': challenge!.roundsUsed,
        'seed': cqDeal!.seed,
        'moves': List<int>.of(cqDeal!.moves),
      };
    }
    activeSnap = snap;
    ref('users/$uid/active').set(snap).catchError((_) {});
  }

  void clearChallengeSnapshot() {
    if (uid != null && hasDb) ref('users/$uid/active').remove().catchError((_) {});
  }

  void resumeChallenge(Map<String, dynamic> snap) {
    final lv = levelById(toInt(snap['id']));
    if (lv == null) {
      clearChallengeSnapshot();
      return;
    }
    pendingLevel = lv;
    challenge = Challenge(lv, target: lv.target ?? e.target);
    if (snap['mode'] == 'conquest') {
      _startConquestAiMatch(lv, restore: snap);
    } else {
      _startSoloChallenge(lv, restore: snap);
    }
  }

  // ---- map ----
  /// Conquest is account-bound; guests are sent to sign in with Google.
  void openMap() {
    if (uid == null || profile == null || isGuest) {
      openOnline();
      return;
    }
    mapScrolled = false;
    refreshLives();
    show(AppView.map);
    _mapTick?.cancel();
    _mapTick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (view != AppView.map) return;
      refreshLives();
      refresh();
    });
  }

  void leaveMap() {
    _mapTick?.cancel();
    show(AppView.online);
    oPanel = OPanel.lobby;
    refresh();
  }

  void openLevel(int id) {
    refreshLives();
    final lv = levelById(id);
    if (lv == null) return;
    pendingLevel = lv;
    dlg.showLevel(this);
  }

  void startLevel() {
    final lv = pendingLevel;
    if (lv == null) return;
    refreshLives();
    if (campaign.lives <= 0) return;
    dlg.close('level');
    challenge = Challenge(lv, target: lv.target ?? e.target);
    if (lv.type == 'ai') {
      _startConquestAiMatch(lv);
    } else {
      _startSoloChallenge(lv);
    }
  }

  void _startSoloChallenge(Level lv, {Map<String, dynamic>? restore}) {
    cancelCount();
    _aiTimer?.cancel();
    mode = 'solo';
    players = const [Player('You', 'human'), Player('-', 'human')];
    if (restore != null) {
      final used = toInt(restore['roundsUsed']);
      match = e.MatchState(totals: [toInt(restore['total']), 0], roundsPlayed: [used, 0], turn: 0, roundSeed: 0);
      challenge!.roundsUsed = used;
      cqDeal = Deal(toInt(restore['seed']), normMoves(restore['moves']));
      round = e.replay(cqDeal!.seed, cqDeal!.moves);
    } else {
      match = e.newMatch(0);
      cqDeal = Deal(e.randomSeed(), []);
      round = e.newRound(cqDeal!.seed);
    }
    show(AppView.game);
    saveChallengeSnapshot();
  }

  /* Multi-opponent Conquest match. You are seat 0; opponents are local AI
     seats. First to the target after equal rounds wins; you must be top. */
  void _startConquestAiMatch(Level lv, {Map<String, dynamic>? restore}) {
    cancelCount();
    _aiTimer?.cancel();
    final ais = lv.ais.isEmpty ? const [AiOpp('medium', 0)] : lv.ais;
    final names = [
      for (var i = 0; i < ais.length; i++)
        ais.length > 1 ? '${aiNames[ais[i].difficulty]} ${i + 1}' : aiNames[ais[i].difficulty]!
    ];
    mode = 'conquest';
    players = [const Player('You', 'human'), for (final n in names) Player(n, 'ai')];
    if (restore != null) {
      final totals = [for (final t in (restore['totals'] as List? ?? [])) toInt(t)];
      cq = ConquestMatch(ais, lv.target ?? e.target, totals, toInt(restore['rounds']));
      final turn = toInt(restore['turn']);
      match = e.MatchState(
          totals: cq!.totals,
          roundsPlayed: [for (final t in (restore['roundsPlayed'] as List? ?? [])) toInt(t)],
          turn: turn,
          roundSeed: 0);
      final seed = toInt(restore['seed']);
      _beginConquestRound(turn, seed == 0 ? e.randomSeed() : seed, normMoves(restore['moves']));
    } else {
      cq = ConquestMatch(ais, lv.target ?? e.target, [0, for (final a in ais) a.handicap], 0);
      match = e.MatchState(totals: cq!.totals, roundsPlayed: List.filled(cq!.n, 0), turn: 0, roundSeed: 0);
      _beginConquestRound(0, e.randomSeed(), []);
    }
    show(AppView.game);
    if (players[match!.turn].isAi) _runConquestAiRound(match!.turn);
  }

  void _beginConquestRound(int seat, int seed, List<int> moves) {
    cqDeal = Deal(seed, List<int>.of(moves));
    round = e.replay(seed, cqDeal!.moves);
    saveChallengeSnapshot();
  }

  /// Called from nextRound (solo modes) after totals update. True = handled.
  bool _challengeSoloStep(e.RoundResult roundResult) {
    final ch = challenge;
    if (ch == null) return false;
    final lv = ch.level;
    ch.roundsUsed += 1;
    if (lv.type == 'bestRound') {
      if (roundResult.handTotal >= lv.score!) {
        challengeWin(challengeStarsByRounds(lv, ch.roundsUsed));
        return true;
      }
      if (ch.roundsUsed >= lv.rounds!) {
        challengeFail();
        return true;
      }
      return false;
    }
    if (match!.totals[0] >= (lv.target ?? e.target)) {
      challengeWin(challengeStarsByRounds(lv, ch.roundsUsed));
      return true;
    }
    if (ch.roundsUsed >= lv.rounds!) {
      challengeFail();
      return true;
    }
    return false;
  }

  void _conquestAdvance() {
    final c = cq!, seat = match!.turn;
    c.totals[seat] += lastResult!.result.net;
    match!.totals = c.totals;
    match!.roundsPlayed[seat] += 1;
    lastResult = null;
    final nextSeat = (seat + 1) % c.n;
    match!.turn = nextSeat;
    if (nextSeat == 0) {
      // a full cycle done
      c.rounds += 1;
      final me = c.totals[0];
      final top = c.totals.reduce(math.max);
      if (c.totals.any((t) => t >= c.target)) {
        if (me == top && c.totals.where((t) => t == top).length == 1) {
          challengeWin(challengeStarsByPace(c.rounds));
        } else {
          challengeFail();
        }
        return;
      }
    }
    _beginConquestRound(nextSeat, e.randomSeed(), []);
    refresh();
    if (players[nextSeat].isAi) _runConquestAiRound(nextSeat);
  }

  void _runConquestAiRound(int seat) => _runAiRound(cq!.ais[seat - 1].difficulty, ms: 280);

  void challengeWin(int stars) {
    final ch = challenge;
    if (ch == null) return;
    clearChallengeSnapshot();
    activeSnap = null;
    final lv = ch.level;
    final c = campaign;
    final firstClear = !((c.stars[lv.id] ?? 0) > 0);
    final xp = addXp(firstClear ? conquestClearXp(stars) : xpConquestRepeat);
    final coins = addCoins(stars * 2); // replays still pay out
    c.stars[lv.id] = math.max(c.stars[lv.id] ?? 0, stars);
    if (lv.id >= c.level && lv.id < levels.length) c.level = lv.id + 1;
    saveCampaign();
    challenge = null;
    match = null;
    round = null;
    cancelCount();
    _aiTimer?.cancel();
    lastClearedLevel = lv.id;
    challengeResult = ChallengeResult('Level ${lv.id} cleared', lv.name, '★' * stars + '☆' * (3 - stars),
        'The path continues. · +$xp xp${coins > 0 ? ' · +$coins coins' : ''}', false, lv.id < levels.length);
    refresh();
    dlg.showChallengeResult(this);
  }

  void challengeFail() {
    final ch = challenge;
    if (ch == null) return;
    clearChallengeSnapshot();
    activeSnap = null;
    final lv = ch.level;
    loseLife();
    challenge = null;
    match = null;
    round = null;
    cancelCount();
    _aiTimer?.cancel();
    lastClearedLevel = null;
    pendingLevel = lv;
    final l = campaign.lives;
    challengeResult = ChallengeResult(
        'Level ${lv.id} failed · −1 ❤',
        lv.name,
        '',
        l > 0
            ? 'You have $l ${l == 1 ? 'life' : 'lives'} left.'
            : 'No lives left. A new heart grows every $lifeRegrowMinutes minutes.',
        l > 0,
        false);
    refresh();
    dlg.showChallengeResult(this);
  }

  void chalToMap() {
    dlg.close('chal');
    openMap();
  }

  void chalRetry() {
    dlg.close('chal');
    startLevel();
  }

  void chalNext() {
    dlg.close('chal');
    final nxt = levelById((lastClearedLevel ?? 0) + 1);
    if (nxt != null) {
      pendingLevel = nxt;
      startLevel();
    } else {
      openMap();
    }
  }

  String get conquestHubSub => isGuest
      ? 'Sign in with Google to climb the campaign.'
      : activeSnap != null
          ? 'Resume level ${activeSnap!['id']}, or pick a level on the map.'
          : 'Level ${campaign.level} · ${campaign.totalStars} stars earned.';
}
