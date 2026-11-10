part of 'controller.dart';

/* ONLINE TABLE — 2–4 players, AI seat-fillers, live spectating, rejoin.
   Identical room protocol to the website, so app and browser players can
   share a table:
   rooms/{code}: size, players{p0..p3:{name,uid,joined,ai?,difficulty?,connected,disconnectedAt}},
                 status, currentRound, turn, totals{t0..}, rounds{i:{net0..}},
                 live{round,seat,seed,moves[]}, result ('p0'..'p3'|'tie'|'closed'),
                 createdAt, lastActive, visibility, forfeitedBy?, closedIdle?
   publicRooms/{code}: {host,createdAt,lastActive,size,status?}            */
extension Online on App {
  Map<String, dynamic>? get roomPlayers => room == null ? null : asMap(room!['players']);
  Map<String, dynamic>? player(int k) {
    final p = roomPlayers?['p$k'];
    return p is Map<String, dynamic> ? p : null;
  }

  int get roomSizeOf => toInt(room?['size'], 2);
  String seatName(int k) => player(k)?['name']?.toString() ?? 'open seat';
  int roomTotal(int k) => toInt(asMap(room?['totals'])['t$k']);
  Map<String, dynamic> roundEntry(int i) => asMap(asMap(room?['rounds'])['$i']);

  void setOError(String? m) {
    oError = m;
    refresh();
  }

  void showPanel(OPanel p) {
    oPanel = p;
    oError = null;
    refresh();
  }

  void openOnline() {
    show(AppView.online);
    if (!firebaseReady) {
      oPanel = OPanel.setup;
      refresh();
      return;
    }
    oPanel = uid != null ? OPanel.lobby : OPanel.auth;
    oError = null;
    _pubSub ??= ref('publicRooms').onValue.listen((ev) {
      publicRooms = ev.snapshot.exists ? asMap(ev.snapshot.value) : {};
      refresh();
    }, onError: (_) {
      publicRooms = null;
      lobbyError = "Couldn't reach the lobby. Check your connection.";
      refresh();
    });
    refresh();
  }

  void requireAuth(VoidCallback then) {
    if (uid == null) {
      showPanel(OPanel.auth);
      return;
    }
    then();
  }

  void openConquestFromHub() {
    if (uid == null) return showPanel(OPanel.auth);
    // Guests see the sign-in note; an in-progress level offers Resume first.
    if (isGuest || activeSnap != null) return showPanel(OPanel.conquestPanel);
    openMap();
  }

  void setRoomSize(int n) {
    roomSize = n;
    while (seatConfig.length < n - 1) {
      seatConfig.add('open');
    }
    seatConfig = seatConfig.sublist(0, n - 1);
    refresh();
  }

  void setSeatConfig(int idx, String cfg) {
    seatConfig[idx] = cfg;
    refresh();
  }

  /// Open public tables (idle ones pruned), newest activity first.
  List<MapEntry<String, dynamic>> get publicTables {
    final now = _now();
    final out = <MapEntry<String, dynamic>>[];
    asMap(publicRooms).forEach((c, v) {
      if (v is! Map) return;
      final idle = now - toInt(v['lastActive'] ?? v['createdAt']);
      if (idle >= expireMs) {
        if (hasDb) ref('publicRooms/$c').remove().catchError((_) {});
        return;
      }
      out.add(MapEntry(c, v));
    });
    int last(MapEntry<String, dynamic> x) => toInt(x.value['lastActive'] ?? x.value['createdAt']);
    out.sort((a, b) => last(b).compareTo(last(a)));
    return out;
  }

  Future<String> _createTable({required int size, required List<String> seatCfg, required String visibility}) async {
    final c = makeRoomCode();
    final players = <String, dynamic>{
      'p0': {'name': myName, 'uid': uid, 'joined': true, 'connected': true}
    };
    final totals = {for (var k = 0; k < size; k++) 't$k': 0};
    for (var idx = 0; idx < seatCfg.length; idx++) {
      final cfg = seatCfg[idx];
      if (cfg != 'open') {
        players['p${idx + 1}'] = {
          'name': '${aiNames[cfg]} (AI ${idx + 2})',
          'joined': true,
          'ai': true,
          'difficulty': cfg,
          'connected': true
        };
      }
    }
    await ref('rooms/$c').set({
      'createdAt': _now(),
      'lastActive': _now(),
      'size': size,
      'players': players,
      'rounds': {},
      'currentRound': 0,
      'turn': 0,
      'totals': totals,
      'status': 'waiting',
      'visibility': visibility,
    });
    if (visibility == 'public') {
      await ref('publicRooms/$c').set({'host': myName, 'createdAt': _now(), 'lastActive': _now(), 'size': size});
    }
    return c;
  }

  void _enterRoomAsHost(String c) {
    code = c;
    seat = 0;
    startedRound = -1;
    aiJob = '';
    oCounted = -1;
    show(AppView.online);
    oPanel = OPanel.wait;
    _watchRoom();
    _registerPresence();
    _startRosterTick();
    _trackGame(c);
  }

  Future<void> oCreate() async {
    if (uid == null) return showPanel(OPanel.auth);
    try {
      final c = await _createTable(size: roomSize, seatCfg: seatConfig, visibility: visibility);
      _enterRoomAsHost(c);
    } catch (err) {
      setOError('$err');
    }
  }

  /// Join OR rejoin: a seat already carrying your uid/name is yours to take back.
  Future<void> joinByCode(String c) async {
    if (uid == null) return showPanel(OPanel.auth);
    final name = myName;
    c = c.trim().toUpperCase();
    if (c.length != 5) return setOError('Room codes are five letters.');
    try {
      final snap = await ref('rooms/$c').get();
      if (!snap.exists) {
        ref('publicRooms/$c').remove().catchError((_) {});
        return setOError('Room not found. Check the code.');
      }
      final rm = asMap(snap.value);
      final size = toInt(rm['size'], 2);
      final ps = asMap(rm['players']);
      Map? p(int k) => ps['p$k'] is Map ? ps['p$k'] as Map : null;
      var s = -1;
      for (var k = 0; k < size && s < 0; k++) {
        final x = p(k);
        if (x != null && x['joined'] == true && x['ai'] != true && (x['uid'] == uid || x['name'] == name)) s = k;
      }
      for (var k = 0; k < size && s < 0; k++) {
        final x = p(k);
        if (x == null || x['joined'] != true) s = k;
      }
      for (var k = 0; k < size && s < 0; k++) {
        final x = p(k);
        if (x != null &&
            x['ai'] != true &&
            x['connected'] == false &&
            x['disconnectedAt'] != null &&
            _now() - toInt(x['disconnectedAt']) >= takeoverMs) {
          s = k; // abandoned seat
        }
      }
      if (s >= 0) {
        final ex = p(s);
        if (ex == null || (ex['uid'] != uid && ex['name'] != name)) {
          await ref('rooms/$c/players/p$s').set({'name': name, 'uid': uid, 'joined': true, 'connected': true});
        }
        _trackGame(c);
      }
      code = c;
      seat = s; // -1 → spectator
      startedRound = -1;
      aiJob = '';
      oCounted = -1;
      oError = null;
      if (s == 0 && rm['status'] == 'waiting') oPanel = OPanel.wait;
      show(AppView.online);
      _watchRoom();
      if (s >= 0) _registerPresence();
      _startRosterTick();
    } catch (err) {
      setOError('$err');
    }
  }

  bool seatClaimable(int k) {
    final p = player(k);
    return seat == -1 &&
        p != null &&
        p['ai'] != true &&
        p['connected'] == false &&
        p['disconnectedAt'] != null &&
        _now() - toInt(p['disconnectedAt']) >= takeoverMs;
  }

  int seatHeldSeconds(int k) {
    final p = player(k);
    if (p == null || p['disconnectedAt'] == null) return 0;
    return math.max(0, ((takeoverMs - (_now() - toInt(p['disconnectedAt']))) / 1000).ceil());
  }

  Future<void> claimSeat(int k) async {
    if (room == null || code == null || seat >= 0 || !seatClaimable(k)) return;
    await ref('rooms/$code/players/p$k').set({'name': myName, 'uid': uid, 'joined': true, 'connected': true});
    seat = k;
    startedRound = -1;
    oCounted = -1;
    _registerPresence();
    _trackGame(code!);
  }

  void _registerPresence() {
    try {
      final r = ref('rooms/$code/players/p$seat');
      r.update({'connected': true, 'disconnectedAt': null}).catchError((_) {});
      r.onDisconnect().update({'connected': false, 'disconnectedAt': ServerValue.timestamp});
    } catch (_) {}
  }

  void _startRosterTick() {
    _rosterTick?.cancel();
    _rosterTick = Timer.periodic(const Duration(seconds: 5), (_) {
      if (view != AppView.online || room == null) return;
      if (count != null && count!.active) return;
      refresh(); // refresh held-seat countdowns / claim buttons
    });
  }

  void _watchRoom() {
    _roomSub?.cancel();
    _roomSub = ref('rooms/$code').onValue.listen((ev) {
      room = ev.snapshot.exists ? asMap(ev.snapshot.value) : null;
      _onRoomUpdate();
    });
  }

  void leaveRoom() {
    cancelCount();
    _aiTimerOnline?.cancel();
    _aiTimerOnline = null;
    _rosterTick?.cancel();
    _rosterTick = null;
    if (room != null && code != null) {
      if (seat == 0 && room!['status'] == 'waiting') {
        ref('rooms/$code').remove().catchError((_) {});
        ref('publicRooms/$code').remove().catchError((_) {});
      } else if (seat >= 0) {
        ref('rooms/$code/players/p$seat')
            .update({'connected': false, 'disconnectedAt': _now()}).catchError((_) {});
      }
    }
    _roomSub?.cancel();
    _roomSub = null;
    code = null;
    room = null;
    oRound = null;
    oMoves = [];
    startedRound = -1;
    aiJob = '';
    oCounted = -1;
    seat = 0;
    show(AppView.home);
  }

  /* Result when a table closes without anyone home: unique leader wins,
     otherwise a neutral 'closed' (no winner, loser, or tie recorded). */
  String _resolveByLead(int size) {
    var best = -1 << 30, bestSeat = 0, bestCount = 0;
    for (var k = 0; k < size; k++) {
      final t = roomTotal(k);
      if (t > best) {
        best = t;
        bestSeat = k;
        bestCount = 1;
      } else if (t == best) {
        bestCount++;
      }
    }
    return bestCount == 1 ? 'p$bestSeat' : 'closed';
  }

  /// A seated player forfeits: the leading opponent is awarded the win.
  void forfeitGame() {
    final rm = room;
    if (rm == null || rm['status'] != 'playing' || seat < 0) return;
    final size = roomSizeOf;
    var best = -1 << 30, winner = -1;
    for (var k = 0; k < size; k++) {
      if (k == seat) continue;
      final t = roomTotal(k);
      if (t > best) {
        best = t;
        winner = k;
      }
    }
    if (winner < 0) winner = (seat + 1) % size;
    ref('rooms/$code').update(
        {'status': 'done', 'result': 'p$winner', 'forfeitedBy': seat, 'lastActive': _now()}).catchError((_) {});
    ref('publicRooms/$code').remove().catchError((_) {});
  }

  void _onRoomUpdate() {
    final rm = room;
    if (rm == null) {
      _roomSub?.cancel();
      _roomSub = null;
      _rosterTick?.cancel();
      code = null;
      oPanel = OPanel.lobby;
      oError = 'The room was closed.';
      refresh();
      return;
    }
    final size = roomSizeOf;
    final status = rm['status'];

    // Auto-close: a table idle for 72h resolves and shuts down.
    if (status != 'done') {
      final idle = _now() - toInt(rm['lastActive'] ?? rm['createdAt']);
      if (idle >= expireMs) {
        ref('rooms/$code').update({
          'status': 'done',
          'result': _resolveByLead(size),
          'closedIdle': true,
          'lastActive': _now()
        }).catchError((_) {});
        ref('publicRooms/$code').remove().catchError((_) {});
        return;
      }
    }

    // Host: start the game once every seat is filled.
    if (seat == 0 && status == 'waiting') {
      final full = List.generate(size, (k) => player(k)).every((p) => p != null && p['joined'] == true);
      if (full) {
        ref('rooms/$code').update({'status': 'playing', 'lastActive': _now()});
        if (rm['visibility'] == 'public') {
          ref('publicRooms/$code').update({'status': 'playing', 'lastActive': _now()}).catchError((_) {});
        }
        return;
      }
    }
    if (status == 'waiting') {
      oPanel = OPanel.wait;
      refresh();
      return;
    }

    final i = toInt(rm['currentRound']);
    final entry = roundEntry(i);
    final turn = toInt(rm['turn']);
    final mySubmitted = seat >= 0 && entry['net$seat'] != null;

    // My turn and I haven't started this round locally yet:
    if (seat >= 0 && status == 'playing' && startedRound != i && turn == seat && !mySubmitted) {
      startedRound = i;
      oCounted = -1;
      final live = asMap(rm['live']);
      if (live.isNotEmpty && toInt(live['round'], -1) == i && toInt(live['seat'], -9) == seat && live['seed'] != null) {
        // Rejoin: rebuild my in-progress round from the published move log.
        oSeed = toInt(live['seed']);
        oMoves = normMoves(live['moves']);
        oRound = e.replay(oSeed, oMoves);
      } else {
        oSeed = e.randomSeed();
        oMoves = [];
        oRound = e.newRound(oSeed);
        ref('rooms/$code/live').set({'round': i, 'seat': seat, 'seed': oSeed, 'moves': []}).catchError((_) {});
      }
    }

    // Host plays AI seats when their turn comes.
    if (seat == 0 && status == 'playing') {
      final tp = player(turn);
      if (tp != null && tp['ai'] == true && entry['net$turn'] == null && aiJob != '$i:$turn') {
        _runRemoteAi(i, turn, '${tp['difficulty'] ?? 'medium'}', size);
      }
    }

    // Host advances when every seat's net for this round is in.
    if (seat == 0 && status == 'playing') {
      var all = true;
      for (var k = 0; k < size; k++) {
        if (entry['net$k'] == null) {
          all = false;
          break;
        }
      }
      if (all) {
        final totals = <String, int>{};
        var best = -1 << 30, bestCount = 0, bestSeat = 0;
        var anyHome = false;
        for (var k = 0; k < size; k++) {
          final t = roomTotal(k) + toInt(entry['net$k']);
          totals['t$k'] = t;
          if (t >= e.target) anyHome = true;
          if (t > best) {
            best = t;
            bestSeat = k;
            bestCount = 1;
          } else if (t == best) {
            bestCount++;
          }
        }
        final updates = <String, Object?>{'totals': totals, 'lastActive': _now()};
        if (anyHome) {
          updates['status'] = 'done';
          updates['result'] = bestCount > 1 ? 'tie' : 'p$bestSeat';
          ref('publicRooms/$code').remove().catchError((_) {});
        } else {
          updates['currentRound'] = i + 1;
          updates['turn'] = 0;
        }
        ref('rooms/$code').update(updates);
      }
    }
    oPanel = OPanel.game;
    _onlineEffects();
    refresh();
  }

  /// Side effects the website runs inside renderOnline(): end-of-match
  /// bookkeeping and the dialog, and kicking off my round's count.
  void _onlineEffects() {
    final rm = room;
    if (rm == null || rm['status'] == 'waiting') return;
    if (rm['status'] == 'done') {
      _recordMatchEnd(rm);
      if (rm['result'] == 'closed') {
        overTitle = 'Table closed';
        overSub = 'No result. The table sat idle too long.';
      } else {
        final res = '${rm['result']}';
        final iWon = seat >= 0 && res == 'p$seat';
        final fb = rm['forfeitedBy'];
        final note = fb != null
            ? (toInt(fb) == seat ? ' · you forfeited' : ' · ${seatName(toInt(fb))} forfeited')
            : '';
        overTitle = res == 'tie'
            ? "It's a tie"
            : iWon
                ? 'You win the table'
                : '${seatName(int.tryParse(res.substring(1)) ?? 0)} takes it';
        overSub = [for (var k = 0; k < roomSizeOf; k++) '${seatName(k)} ${roomTotal(k)}'].join(' · ') + note;
      }
      if (!dlg.isOpen('over')) dlg.showOver(this);
      return;
    }
    final r = oRound;
    if (onlineMyTurn && r != null && r.complete && oCounted != toInt(rm['currentRound']) && !countingOnline) {
      final cr = toInt(rm['currentRound']);
      startCount(r, 'o', () {
        oCounted = cr;
        refresh();
      });
    }
  }

  bool get countingOnline => count != null && count!.active && count!.prefix == 'o';

  bool get onlineMyTurn {
    final rm = room;
    if (rm == null || seat < 0) return false;
    final entry = roundEntry(toInt(rm['currentRound']));
    return toInt(rm['turn']) == seat && entry['net$seat'] == null;
  }

  void onlinePlace(int row) {
    final r = oRound;
    if (r == null || !onlineMyTurn || countingOnline || !e.canPlace(r, row)) return;
    oRound = e.placeCard(r, row);
    oMoves.add(row);
    ref('rooms/$code/live/moves').set(List<int>.of(oMoves)).catchError((_) {});
    _onlineEffects();
    refresh();
  }

  void onlineSubmit() {
    final r = oRound;
    final rm = room;
    if (r == null || rm == null || !r.complete) return;
    final res = e.scoreRound(r);
    recordHand(res.rowScores, res.handTotal);
    ref('rooms/$code').update({
      'rounds/${toInt(rm['currentRound'])}/net$seat': res.net,
      'turn': (seat + 1) % roomSizeOf,
      'lastActive': _now(),
    });
  }

  /// Host-side AI runner: publishes moves live so everyone can watch.
  void _runRemoteAi(int roundIndex, int s, String diff, int size) {
    aiJob = '$roundIndex:$s';
    _aiTimerOnline?.cancel();
    final seed = e.randomSeed();
    var r = e.newRound(seed);
    final moves = <int>[];
    ref('rooms/$code/live').set({'round': roundIndex, 'seat': s, 'seed': seed, 'moves': []}).catchError((_) {});
    _aiTimerOnline = Timer.periodic(Duration(milliseconds: fastCount ? 5 : 350), (t) {
      if (room == null || room!['status'] != 'playing') {
        t.cancel();
        return;
      }
      if (r.complete) {
        t.cancel();
        _aiTimerOnline = null;
        ref('rooms/$code').update({
          'rounds/$roundIndex/net$s': e.scoreRound(r).net,
          'turn': (s + 1) % size,
          'lastActive': _now(),
        }).catchError((_) {});
        return;
      }
      final m = e.aiChooseRow(r, diff);
      r = e.placeCard(r, m);
      moves.add(m);
      ref('rooms/$code/live/moves').set(List<int>.of(moves)).catchError((_) {});
    });
  }

  /// The live round of whoever is placing (spectator view), if any.
  e.RoundState? get liveRound {
    final rm = room;
    if (rm == null) return null;
    final live = asMap(rm['live']);
    if (live.isEmpty || live['seed'] == null) return null;
    if (toInt(live['round'], -1) != toInt(rm['currentRound']) || toInt(live['seat'], -9) == seat) return null;
    return e.replay(toInt(live['seed']), normMoves(live['moves']));
  }

  int get liveSeat => toInt(asMap(room?['live'])['seat'], -1);

  /// Round history lines: "R1: Ann +3 · Bob -2"
  List<String> get historyLines {
    final rounds = asMap(room?['rounds']);
    final keys = rounds.keys.map(int.parse).toList()..sort();
    String fmt(Object? n) => n == null ? '…' : (toInt(n) >= 0 ? '+${toInt(n)}' : '${toInt(n)}');
    return [
      for (final k in keys)
        'R${k + 1}: ${[for (var s = 0; s < roomSizeOf; s++) '${seatName(s)} ${fmt(asMap(rounds['$k'])['net$s'])}'].join(' · ')}'
    ];
  }
}
