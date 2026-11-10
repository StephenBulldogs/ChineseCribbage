part of 'controller.dart';

/// Accounts, XP, coins & shop, admin, stats, friends, challenges, boards.
///
/// users/{uid}: { name, provider, friendCode, email, online, lastSeen, xp,
///   coins, premium, banner, cardDesign, faceDeck, campaign, active,
///   stats:{...}, friends:{fuid:{name}}, challenges:{id:{from,fromName,code,createdAt}},
///   games:{code:{at}} }
/// friendCodes/{code}: uid      leaderboard/{uid}: {name,stars,cleared,level,plevel,banner}
extension Account on App {
  bool get isGuest => profile != null && profile!['provider'] == 'guest';
  bool get isAdmin => email == adminEmail;
  int get coins => toInt(profile?['coins']);
  XpLevel get xpLevel => levelFromXp(profile?['xp'] as num?);
  String get activeCardDesign => (profile?['cardDesign'] as String?) ?? 'classic';
  String get activeFaceDeck => (profile?['faceDeck'] as String?) ?? 'none';

  bool designUnlocked(Design d, [Map<String, dynamic>? prof, Campaign? camp]) =>
      d.need(levelFromXp((prof ?? profile ?? {})['xp'] as num?).level, (camp ?? campaign).totalStars);
  bool bannerUnlocked(ProfileBanner b, [Map<String, dynamic>? prof, Campaign? camp]) =>
      b.need(levelFromXp((prof ?? profile ?? {})['xp'] as num?).level, (camp ?? campaign).totalStars);

  // ---- XP & coins ----
  int addXp(int n) {
    if (uid == null || profile == null) return 0;
    profile!['xp'] = toInt(profile!['xp']) + n;
    if (hasDb) ref('users/$uid/xp').set(profile!['xp']).catchError((_) {});
    pushLeaderboard();
    return n;
  }

  int addCoins(int n) {
    if (n == 0 || uid == null || profile == null) return 0;
    profile!['coins'] = coins + n;
    if (hasDb) ref('users/$uid/coins').set(profile!['coins']).catchError((_) {});
    refresh();
    return n;
  }

  bool spendCoins(int n) {
    if (uid == null || profile == null || coins < n) return false;
    profile!['coins'] = coins - n;
    if (hasDb) ref('users/$uid/coins').set(profile!['coins']).catchError((_) {});
    refresh();
    return true;
  }

  void openShop() {
    if (uid == null || profile == null) {
      openOnline();
      return;
    }
    refreshLives();
    dlg.showShop(this);
  }

  void buyPremium() {
    if (uid == null || profile == null || profile!['premium'] == true || isGuest) return;
    if (!spendCoins(shopPremiumCost)) return;
    profile!['premium'] = true;
    if (hasDb) ref('users/$uid/premium').set(true).catchError((_) {});
    refresh();
  }

  void buyLife() {
    if (uid == null || profile == null || isGuest) return;
    refreshLives();
    if (campaign.lives >= maxLives) return;
    if (!spendCoins(shopLifeCost)) return;
    campaign.lives = math.min(maxLives, campaign.lives + 1);
    saveCampaign();
    refresh();
  }

  // ---- admin (client-side gate only, same trust model as the website) ----
  Future<void> loadAdminUsers() async {
    if (!isAdmin) return;
    adminUsers = null;
    adminError = null;
    refresh();
    try {
      final snap = await ref('users').get();
      adminUsers = snap.exists ? asMap(snap.value) : {};
    } catch (_) {
      adminUsers = {};
      adminError = 'Could not load accounts.';
    }
    refresh();
  }

  Future<void> toggleAdminPremium(String id) async {
    final u = adminUsers?[id];
    if (u is! Map) return;
    final next = u['premium'] != true;
    try {
      await ref('users/$id/premium').set(next);
      u['premium'] = next;
      if (id == uid && profile != null) profile!['premium'] = next;
      refresh();
    } catch (_) {}
  }

  Future<void> setAdminCoins(String id, String val) async {
    final u = adminUsers?[id];
    if (u is! Map) return;
    final n = math.max(0, (num.tryParse(val) ?? 0).floor());
    try {
      await ref('users/$id/coins').set(n);
      u['coins'] = n;
      if (id == uid && profile != null) profile!['coins'] = n;
      refresh();
    } catch (_) {}
  }

  Future<void> setAdminLives(String id, String val) async {
    final u = adminUsers?[id];
    if (u is! Map) return;
    final n = math.max(0, math.min(maxLives, (num.tryParse(val) ?? 0).floor()));
    u['campaign'] = (u['campaign'] is Map) ? u['campaign'] : <String, dynamic>{};
    u['campaign']['lives'] = n;
    try {
      await ref('users/$id/campaign/lives').set(n);
      if (id == uid) campaign.lives = n;
      refresh();
    } catch (_) {}
  }

  void pushLeaderboard() {
    if (uid == null || profile == null || isGuest || !hasDb) return;
    ref('leaderboard/$uid').set({
      'name': profile!['name'],
      'stars': campaign.totalStars,
      'cleared': campaign.cleared,
      'level': campaign.level,
      'plevel': xpLevel.level,
      'banner': profile!['banner'] ?? 'lacquer',
    }).catchError((_) {});
  }

  // ---- sign-in ----
  String _friendlyAuthMessage(Object err) {
    if (err is FirebaseAuthException) {
      const msgs = {
        'web-context-canceled': 'The sign-in window closed before finishing. Please try again.',
        'canceled': 'The sign-in window closed before finishing. Please try again.',
        'network-request-failed': 'Network error during sign-in. Check your connection and try again.',
        'operation-not-allowed': 'This sign-in method is not enabled for this Firebase project yet.',
        'user-mismatch': 'That was a different account. Sign in with the account you want to delete.',
      };
      return msgs[err.code] ?? err.message ?? 'Sign-in failed. Please try again.';
    }
    return 'Sign-in failed. Please try again.';
  }

  Future<void> signInGoogle() async {
    authError = null;
    refresh();
    if (!hasDb) return;
    try {
      // Native Google OAuth flow handled by Firebase Auth on Android & iOS.
      await FirebaseAuth.instance.signInWithProvider(GoogleAuthProvider());
      // authStateChanges() fires → _onAuth → establishUser
    } catch (err) {
      authError = _friendlyAuthMessage(err);
      refresh();
    }
  }

  /// Sign in with Apple (iOS). Apple requires it alongside Google sign-in.
  Future<void> signInApple() async {
    authError = null;
    refresh();
    if (!hasDb) return;
    try {
      final provider = AppleAuthProvider()
        ..addScope('email')
        ..addScope('name');
      await FirebaseAuth.instance.signInWithProvider(provider);
    } catch (err) {
      authError = _friendlyAuthMessage(err);
      refresh();
    }
  }

  /// Which provider a Firebase user signed in with: 'google' | 'apple'.
  String _providerOf(User user) {
    for (final p in user.providerData) {
      if (p.providerId == 'apple.com') return 'apple';
    }
    return 'google';
  }

  /// Permanently delete this account and its data (required by both app
  /// stores). Google/Apple accounts confirm by signing in again first, which
  /// also satisfies Firebase's "recent login" rule for deleting a user.
  /// Returns null on success, or a message to show.
  Future<String?> deleteAccount() async {
    final id = uid;
    final prof = profile;
    if (id == null || prof == null || !hasDb) return 'Not signed in.';
    final guest = prof['provider'] == 'guest';
    User? user;
    if (!guest) {
      user = FirebaseAuth.instance.currentUser;
      if (user == null || user.uid != id) return 'Sign in again, then try deleting.';
      try {
        final AuthProvider p = _providerOf(user) == 'apple' ? AppleAuthProvider() : GoogleAuthProvider();
        await user.reauthenticateWithProvider(p);
      } catch (err) {
        return _friendlyAuthMessage(err);
      }
    }
    if (code != null) leaveRoom();
    try {
      // Stop presence from re-creating users/{uid} when the connection drops.
      await ref('users/$id').onDisconnect().cancel();
      final updates = <String, Object?>{
        'users/$id': null,
        'leaderboard/$id': null,
      };
      final fc = prof['friendCode'];
      if (fc != null) updates['friendCodes/$fc'] = null;
      for (final fuid in friends.keys) {
        updates['users/$fuid/friends/$id'] = null;
      }
      await _db!.ref().update(updates);
    } catch (err) {
      return 'Could not delete your data: $err';
    }
    if (user != null) {
      try {
        await user.delete();
      } catch (err) {
        // Data is gone; the sign-in record will be orphaned but harmless.
        debugPrint('auth user delete failed: $err');
      }
    }
    uid = null;
    myName = '';
    _resetAccountState();
    if (view == AppView.online) oPanel = OPanel.auth;
    refresh();
    return null;
  }

  /// Guest: a plain local session. No auth provider, no password.
  Future<void> signInGuest(String name) async {
    if (!hasDb) return;
    try {
      pendingName = name.trim();
      final rnd = math.Random();
      final id = 'g${List.generate(8, (_) => '0123456789abcdefghijklmnopqrstuvwxyz'[rnd.nextInt(36)]).join()}'
          '${_now().toRadixString(36)}';
      await _establishUser(id, isAnonymous: true, displayName: null, mail: null);
    } catch (err) {
      authError = '$err';
      refresh();
    }
  }

  void doSignOut() {
    try {
      if (uid != null && hasDb) ref('users/$uid/online').set(false).catchError((_) {});
      if (profile != null && profile!['provider'] != 'guest') FirebaseAuth.instance.signOut();
    } catch (_) {}
    uid = null;
    myName = '';
    _resetAccountState();
    if (view == AppView.online && code == null) oPanel = OPanel.auth;
    refresh();
  }

  Future<void> _onAuth(User? user) async {
    // Google/Apple auth state changes only. Never clobber an active guest session.
    if (user == null) {
      if (isGuest) return;
      if (uid != null) {
        uid = null;
        _resetAccountState();
        refresh();
      }
      return;
    }
    if (uid == user.uid) return;
    await _establishUser(user.uid,
        isAnonymous: false, displayName: user.displayName, mail: user.email, provider: _providerOf(user));
  }

  void _resetAccountState() {
    profile = null;
    email = null;
    campaign = Campaign.blank();
    activeSnap = null;
    friends = {};
    friendInfo = {};
    challenges = {};
    for (final s in friendWatches.values) {
      s.cancel();
    }
    friendWatches.clear();
    for (final s in _socialSubs) {
      s.cancel();
    }
    _socialSubs.clear();
    statsRecorded.clear();
  }

  Future<void> _establishUser(String id,
      {required bool isAnonymous, String? displayName, String? mail, String provider = 'google'}) async {
    // Wipe any in-memory state from a previous account so nothing leaks.
    _resetAccountState();
    uid = id;
    email = mail;
    try {
      final snap = await ref('users/$id').get();
      if (snap.exists) {
        profile = asMap(snap.value);
        profile!['stats'] ??= blankStats();
        if (mail != null && profile!['email'] != mail) {
          profile!['email'] = mail;
          ref('users/$id/email').set(mail).catchError((_) {});
        }
      } else {
        final name = (displayName != null && displayName.isNotEmpty ? displayName.split(' ').first : null) ??
            (pendingName.isNotEmpty ? pendingName : null) ??
            '${isAnonymous ? 'Guest' : 'Player'}-${1000 + math.Random().nextInt(9000)}';
        final fc = makeFriendCode();
        profile = {
          'name': name,
          'provider': isAnonymous ? 'guest' : provider,
          'friendCode': fc,
          'email': mail,
          'createdAt': _now(),
          'online': true,
          'stats': blankStats(),
          'coins': 0,
          'premium': false,
        };
        await ref('users/$id').set(profile);
        await ref('friendCodes/$fc').set(id);
      }
      myName = '${profile!['name']}';
      loadCampaign(profile!['campaign']);
      final act = profile!['active'];
      activeSnap = act is Map ? asMap(act) : null;
      saveCampaign();
      // user-level presence for the friends list
      final me = ref('users/$id');
      me.update({'online': true}).catchError((_) {});
      me.onDisconnect().update({'online': false, 'lastSeen': ServerValue.timestamp});
      _watchSocial();
    } catch (err) {
      authError = '$err';
    }
    if (view == AppView.online && code == null && uid != null) oPanel = OPanel.lobby;
    refresh();
  }

  void _watchSocial() {
    _socialSubs.add(ref('users/$uid/friends').onValue.listen((ev) {
      friends = ev.snapshot.exists ? asMap(ev.snapshot.value) : {};
      _syncFriendWatches();
      refresh();
    }));
    _socialSubs.add(ref('users/$uid/challenges').onValue.listen((ev) {
      challenges = ev.snapshot.exists ? asMap(ev.snapshot.value) : {};
      _maybeShowChallenge();
      refresh();
    }));
  }

  void _syncFriendWatches() {
    for (final fuid in friends.keys) {
      if (friendWatches.containsKey(fuid)) continue;
      friendWatches[fuid] = ref('users/$fuid').onValue.listen((ev) {
        if (ev.snapshot.exists) {
          final v = asMap(ev.snapshot.value);
          friendInfo[fuid] = {'name': v['name'], 'online': v['online'] == true, 'stats': v['stats']};
        } else {
          friendInfo.remove(fuid);
        }
        refresh();
      });
    }
    for (final fuid in friendWatches.keys.toList()) {
      if (!friends.containsKey(fuid)) {
        friendWatches.remove(fuid)!.cancel();
        friendInfo.remove(fuid);
      }
    }
  }

  int get onlineFriendCount =>
      friends.keys.where((u) => friendInfo[u] != null && friendInfo[u]!['online'] == true).length;

  List<MapEntry<String, dynamic>> get freshChallenges => challenges.entries
      .where((c) => c.value is Map && _now() - toInt(c.value['createdAt']) < 3600000)
      .toList()
    ..sort((a, b) => toInt(b.value['createdAt']).compareTo(toInt(a.value['createdAt'])));

  // ---- stats ----
  void _bumpStats(void Function(Map<String, dynamic> st) mut) {
    if (uid == null || profile == null) return;
    final st = profile!['stats'] is Map ? profile!['stats'] as Map<String, dynamic> : blankStats();
    profile!['stats'] = st;
    mut(st);
    if (hasDb) ref('users/$uid/stats').set(st).catchError((_) {});
  }

  void recordHand(List<e.HandScore> rowScores, int handTotal) {
    if (uid == null) return;
    _bumpStats((st) {
      final hi = rowScores.map((x) => x.total).reduce(math.max);
      if (hi > toInt(st['highestHand'])) st['highestHand'] = hi;
      if (handTotal > toInt(st['highestTotal'])) st['highestTotal'] = handTotal;
    });
  }

  void _recordMatchEnd(Map<String, dynamic> room) {
    if (uid == null || seat < 0 || code == null || statsRecorded.contains(code)) return;
    statsRecorded.add(code!);
    final result = room['result'];
    if (result == 'closed') {
      if (hasDb) ref('users/$uid/games/$code').remove().catchError((_) {});
      return;
    }
    final rounds = asMap(room['rounds']).length;
    _bumpStats((st) {
      st['gamesPlayed'] = toInt(st['gamesPlayed']) + 1;
      if (result == 'tie') {
        st['ties'] = toInt(st['ties']) + 1;
      } else if (result == 'p$seat') {
        st['wins'] = toInt(st['wins']) + 1;
        if (toInt(st['fastestWin']) == 0 || rounds < toInt(st['fastestWin'])) st['fastestWin'] = rounds;
      } else {
        st['losses'] = toInt(st['losses']) + 1;
      }
      if (rounds > toInt(st['longestGame'])) st['longestGame'] = rounds;
    });
    addXp(result == 'tie' ? xpMatchTie : result == 'p$seat' ? xpMatchWin : xpMatchLoss);
    if (result == 'p$seat') addCoins(1);
    if (hasDb) ref('users/$uid/games/$code').remove().catchError((_) {});
  }

  void _trackGame(String c) {
    if (uid != null && hasDb) ref('users/$uid/games/$c').set({'at': _now()}).catchError((_) {});
  }

  // ---- friends ----
  Future<void> addFriendByCode(String raw) async {
    friendError = null;
    final fc = raw.trim().toUpperCase();
    if (fc.length < 4) return _friendErr('Friend codes are six characters.');
    if (profile != null && fc == profile!['friendCode']) return _friendErr("That's your own code.");
    try {
      final snap = await ref('friendCodes/$fc').get();
      if (!snap.exists) return _friendErr('No player with that code.');
      final fuid = '${snap.value}';
      final fsnap = await ref('users/$fuid').get();
      if (!fsnap.exists) return _friendErr('No player with that code.');
      final fname = asMap(fsnap.value)['name'] ?? 'Player';
      await ref('users/$uid/friends/$fuid').set({'name': fname});
      await ref('users/$fuid/friends/$uid').set({'name': profile!['name']});
      refresh();
    } catch (err) {
      _friendErr('$err');
    }
  }

  void _friendErr(String m) {
    friendError = m;
    refresh();
  }

  Future<void> addFriend(String fuid, String name) async {
    await ref('users/$uid/friends/$fuid').set({'name': name}).catchError((_) {});
    await ref('users/$fuid/friends/$uid').set({'name': profile!['name']}).catchError((_) {});
  }

  void removeFriend(String fuid) {
    ref('users/$uid/friends/$fuid').remove().catchError((_) {});
    ref('users/$fuid/friends/$uid').remove().catchError((_) {});
  }

  // ---- challenges ----
  Future<void> sendChallenge(String fuid) async {
    if (uid == null) return;
    try {
      final c = await _createTable(size: 2, seatCfg: const ['open'], visibility: 'private');
      await ref('users/$fuid/challenges/c${_now()}')
          .set({'from': uid, 'fromName': profile!['name'], 'code': c, 'createdAt': _now()});
      _enterRoomAsHost(c);
    } catch (err) {
      _friendErr('$err');
    }
  }

  void _maybeShowChallenge() {
    if (code != null) return; // already at a table
    final entries = freshChallenges;
    if (entries.isEmpty || dlg.isOpen('challenge')) return;
    final first = entries.first;
    pendingChallenge = {'id': first.key, ...asMap(first.value)};
    dlg.showChallengeInvite(this);
  }

  void acceptChallenge([String? id]) {
    if (id != null) {
      final c = challenges[id];
      if (c is! Map) return;
      pendingChallenge = {'id': id, ...asMap(c)};
    }
    final c = pendingChallenge;
    if (c == null) return;
    dlg.close('challenge');
    ref('users/$uid/challenges/${c['id']}').remove().catchError((_) {});
    pendingChallenge = null;
    show(AppView.online);
    joinByCode('${c['code']}');
  }

  void declineChallenge([String? id]) {
    final cid = id ?? pendingChallenge?['id'];
    dlg.close('challenge');
    if (cid != null && hasDb) ref('users/$uid/challenges/$cid').remove().catchError((_) {});
    pendingChallenge = null;
  }

  // ---- profile ----
  Future<void> setBanner(String id) async {
    profile!['banner'] = id;
    if (hasDb) ref('users/$uid/banner').set(id).catchError((_) {});
    pushLeaderboard();
    refresh();
  }

  void setCardDesign(String id) {
    profile!['cardDesign'] = id;
    if (hasDb) ref('users/$uid/cardDesign').set(id).catchError((_) {});
    refresh();
  }

  void setFaceDeck(String id) {
    profile!['faceDeck'] = id;
    if (hasDb) ref('users/$uid/faceDeck').set(id).catchError((_) {});
    refresh();
  }

  Future<void> rename(String nn) async {
    nn = nn.trim();
    if (nn.isEmpty) return;
    profile!['name'] = nn;
    myName = nn;
    await ref('users/$uid/name').set(nn).catchError((_) {});
    refresh();
  }

  Future<List<String>> myGameCodes() async {
    try {
      final gs = await ref('users/$uid/games').get();
      if (gs.exists) return asMap(gs.value).keys.toList();
    } catch (_) {}
    return [];
  }

  Future<Map<String, dynamic>?> fetchUser(String id) async {
    try {
      final s = await ref('users/$id').get();
      return s.exists ? asMap(s.value) : null;
    } catch (_) {
      return null;
    }
  }

  Future<List<Map<String, dynamic>>> leaderboard(bool friendsOnly) async {
    var rows = <Map<String, dynamic>>[];
    try {
      final snap = await ref('leaderboard').get();
      final all = snap.exists ? asMap(snap.value) : <String, dynamic>{};
      rows = [for (final en in all.entries) if (en.value is Map) {'uid': en.key, ...asMap(en.value)}];
      if (friendsOnly) rows = rows.where((r) => r['uid'] == uid || friends.containsKey(r['uid'])).toList();
    } catch (_) {}
    int g(Map m, String k) => toInt(m[k]);
    rows.sort((a, b) {
      var c = g(b, 'stars').compareTo(g(a, 'stars'));
      if (c == 0) c = g(b, 'cleared').compareTo(g(a, 'cleared'));
      if (c == 0) c = g(b, 'plevel').compareTo(g(a, 'plevel'));
      return c;
    });
    return rows.take(20).toList();
  }
}
