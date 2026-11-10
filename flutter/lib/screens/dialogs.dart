// Every modal from the website's <dialog> elements, opened by id so the
// controller can open/close them the way ui.js calls showModal()/close().
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../app/controller.dart';
import '../engine/engine.dart' show PlayingCard;
import '../game/catalog.dart';
import '../theme.dart';
import '../widgets/board.dart';
import 'online_view.dart' show XpBar;

final Map<String, Route> _open = {};

bool isOpen(String id) => _open[id]?.isActive ?? false;

void close(String id) {
  final r = _open.remove(id);
  if (r != null && r.isActive) r.navigator?.removeRoute(r);
}

void _show(String id, App app, WidgetBuilder builder, {bool dismissible = false}) {
  final nav = App.navKey.currentState;
  if (nav == null) return;
  close(id);
  final route = DialogRoute<void>(
    context: nav.context,
    barrierDismissible: dismissible,
    barrierColor: const Color(0xB3000000),
    builder: (ctx) => ListenableBuilder(listenable: app, builder: (c, _) => builder(c)),
  );
  _open[id] = route;
  nav.push(route).then((_) {
    if (_open[id] == route) _open.remove(id);
  });
}

class _Sheet extends StatelessWidget {
  final List<Widget> children;
  const _Sheet({required this.children});
  @override
  Widget build(BuildContext context) => Dialog(
        insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 460),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(22),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: children,
            ),
          ),
        ),
      );
}

Widget _big(String t, {double size = 30}) =>
    Padding(padding: const EdgeInsets.only(top: 6, bottom: 6), child: Text(t, style: display(size)));
Widget _sub(String t, {Color color = C.creamDim}) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: Text(t, style: TextStyle(color: color, fontSize: 13.5, height: 1.5)));
const _gap = SizedBox(height: 10);

void confirm(BuildContext context, String message, String action, VoidCallback onYes) {
  showDialog<void>(
    context: context,
    builder: (ctx) => _Sheet(children: [
      _sub(message, color: C.cream),
      PrimaryButton(action, onPressed: () {
        Navigator.pop(ctx);
        onYes();
      }),
      _gap,
      GhostButton('Cancel', onPressed: () => Navigator.pop(ctx)),
    ]),
  );
}

// ---------- round score sheet ----------
void showScore(App app) => _show('score', app, (ctx) {
      final s = app.scoreSheet;
      if (s == null) return const SizedBox.shrink();
      final r = s.result;
      return _Sheet(children: [
        Eyebrow(s.eyebrow),
        const SizedBox(height: 12),
        for (var i = 0; i < r.rowScores.length; i++)
          _scoreRow(rowLabels[i], r.rowScores[i].breakdown, r.rowScores[i].total),
        if (r.heels > 0) _scoreRow('Starter', 'his heels, a Jack turned', 2),
        const SizedBox(height: 8),
        Text.rich(
            TextSpan(style: display(30), children: [
              TextSpan(text: '${r.handTotal} '),
              const TextSpan(text: '− 29 = ', style: TextStyle(color: C.creamDim)),
              TextSpan(
                  text: '${r.net >= 0 ? '+' : ''}${r.net}',
                  style: TextStyle(color: r.net >= 0 ? C.jade : C.inkRed)),
            ]),
            textAlign: TextAlign.center),
        _sub(r.net >= 0 ? 'Pegging up the rail.' : 'Under par, pegging backwards.'),
        PrimaryButton('Continue', onPressed: app.nextRound),
      ]);
    });

Widget _scoreRow(String name, String bd, int total) => Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(children: [
        SizedBox(width: 64, child: Text(name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13))),
        Expanded(child: Text(bd, style: const TextStyle(color: C.creamDim, fontSize: 12))),
        Text('$total', style: display(17, color: C.brass)),
      ]),
    );

void showOver(App app) => _show('over', app, (ctx) => _Sheet(children: [
      const Eyebrow('Match over'),
      _big(app.overTitle),
      _sub(app.overSub),
      PrimaryButton('Rematch', onPressed: app.overRematch),
      _gap,
      GhostButton('Home', onPressed: app.overHome),
    ]));

void showHandoff(App app) => _show('handoff', app, (ctx) => _Sheet(children: [
      const Eyebrow('Pass the device'),
      _big(app.handoffName),
      _sub('Your round. No peeking.'),
      PrimaryButton("I'm ready", onPressed: () => close('handoff')),
    ]));

// ---------- pass & play setup ----------
void showPassSetup(App app) {
  final ctrls = [for (final n in app.passNames) TextEditingController(text: n)];
  void capture() {
    for (var i = 0; i < 4; i++) {
      final v = ctrls[i].text.trim();
      app.passNames[i] = v.isEmpty ? 'Player ${i + 1}' : (v.length > 16 ? v.substring(0, 16) : v);
    }
  }

  _show('pass', app, (ctx) => _Sheet(children: [
        const Eyebrow('Pass & play'),
        const SizedBox(height: 12),
        const Text('PLAYERS', style: TextStyle(color: C.creamDim, fontSize: 11, fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        Wrap(spacing: 8, children: [
          for (final n in [2, 3, 4])
            Pill('$n players', selected: app.passCount == n, onTap: () {
              app.passCount = n;
              app.refresh();
            }),
        ]),
        const SizedBox(height: 14),
        const Text('NAMES', style: TextStyle(color: C.creamDim, fontSize: 11, fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        for (var i = 0; i < app.passCount; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(children: [
              SizedBox(width: 56, child: Text('Seat ${i + 1}', style: const TextStyle(color: C.creamDim, fontSize: 12))),
              Expanded(
                  child: TextField(
                      controller: ctrls[i], maxLength: 16, decoration: const InputDecoration(counterText: ''))),
            ]),
          ),
        const SizedBox(height: 6),
        PrimaryButton('Start match', onPressed: () {
          capture();
          close('pass');
          app.startMatch('pass');
        }),
        _gap,
        GhostButton('Cancel', onPressed: () {
          capture();
          close('pass');
        }),
      ]));
}

// ---------- conquest ----------
void showLevel(App app) => _show('level', app, (ctx) {
      final lv = app.pendingLevel;
      if (lv == null) return const SizedBox.shrink();
      final st = app.campaign.stars[lv.id] ?? 0;
      final ok = app.campaign.lives > 0;
      return _Sheet(children: [
        Eyebrow('Level ${lv.id}${st > 0 ? ' · ${'★' * st}' : ''}'),
        _big(lv.name),
        _sub('${lv.desc} Failing or quitting costs a life.'),
        if (!ok) _sub('A new heart grows every ${app.lifeRegrowMinutes} minutes.', color: C.inkRed),
        PrimaryButton(ok ? 'Play (1 ❤ at stake)' : 'No lives left', onPressed: ok ? app.startLevel : null),
        _gap,
        GhostButton('Not yet', onPressed: () => close('level')),
      ]);
    }, dismissible: true);

void showChallengeResult(App app) => _show('chal', app, (ctx) {
      final r = app.challengeResult;
      if (r == null) return const SizedBox.shrink();
      return _Sheet(children: [
        Eyebrow(r.eyebrow),
        _big(r.title),
        if (r.stars.isNotEmpty)
          Text(r.stars, textAlign: TextAlign.center, style: const TextStyle(fontSize: 38, color: C.brass)),
        _sub(r.sub),
        if (r.showNext) ...[PrimaryButton('Next level', onPressed: app.chalNext), _gap],
        if (r.showRetry) ...[PrimaryButton('Retry (1 ❤)', onPressed: app.chalRetry), _gap],
        GhostButton('Back to map', onPressed: app.chalToMap),
      ]);
    });

void showChallengeInvite(App app) => _show('challenge', app, (ctx) => _Sheet(children: [
      const Eyebrow('Challenge!'),
      _big('${app.pendingChallenge?['fromName'] ?? 'A friend'} challenges you to a duel.', size: 24),
      _sub('A private table is waiting for you.'),
      PrimaryButton('Accept', onPressed: () => app.acceptChallenge()),
      _gap,
      GhostButton('Decline', onPressed: () => app.declineChallenge()),
    ]));

// ---------- leaderboard ----------
void showBoard(App app) {
  var friendsOnly = false;
  _show('board', app, (ctx) => StatefulBuilder(builder: (ctx, setS) {
        return _Sheet(children: [
          const Eyebrow('Conquest leaderboard'),
          const SizedBox(height: 10),
          Wrap(spacing: 8, children: [
            Pill('global', selected: !friendsOnly, onTap: () => setS(() => friendsOnly = false)),
            Pill('friends', selected: friendsOnly, onTap: () => setS(() => friendsOnly = true)),
          ]),
          const SizedBox(height: 10),
          FutureBuilder<List<Map<String, dynamic>>>(
            key: ValueKey(friendsOnly),
            future: app.hasDb ? app.leaderboard(friendsOnly) : Future.value(const []),
            builder: (ctx, snap) {
              if (!snap.hasData) return const EmptyNote('Loading…');
              final rows = snap.data!;
              if (rows.isEmpty) return const EmptyNote('Nobody on the board yet.');
              const trophies = ['🥇', '🥈', '🥉'];
              return Column(children: [
                for (var i = 0; i < rows.length; i++)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
                    decoration: BoxDecoration(
                      color: rows[i]['uid'] == app.uid ? C.brass.withValues(alpha: .08) : null,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(children: [
                      SizedBox(width: 40, child: Text(i < 3 ? trophies[i] : '#${i + 1}', style: const TextStyle(fontSize: 16))),
                      Container(
                          width: 22,
                          height: 14,
                          decoration: BoxDecoration(
                              gradient: bannerById(rows[i]['banner'] as String?).gradient,
                              borderRadius: BorderRadius.circular(4))),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text.rich(TextSpan(children: [
                          TextSpan(text: '${rows[i]['name'] ?? 'Player'} '),
                          TextSpan(
                              text: 'Lv ${rows[i]['plevel'] ?? 1}',
                              style: const TextStyle(color: C.creamDim, fontSize: 11)),
                        ]), overflow: TextOverflow.ellipsis),
                      ),
                      Text('${rows[i]['stars'] ?? 0} ★',
                          style: const TextStyle(color: C.brass, fontWeight: FontWeight.w700)),
                    ]),
                  ),
              ]);
            },
          ),
          const SizedBox(height: 14),
          GhostButton('Close', onPressed: () => close('board')),
        ]);
      }), dismissible: true);
}

// ---------- profile ----------
Future<void> openProfile(App app, String? uid) async {
  final self = uid == null || uid == app.uid;
  if (app.uid == null && self) return;
  List<String> codes = [];
  Map<String, dynamic>? other;
  if (self) {
    codes = app.hasDb ? await app.myGameCodes() : [];
  } else {
    other = await app.fetchUser(uid);
    if (other == null) return;
  }
  final rename = TextEditingController();
  _show('profile', app, (ctx) {
    final prof = self ? app.profile : other;
    if (prof == null) return const SizedBox.shrink();
    final camp = self ? app.campaign : Campaign.fromJson(prof['campaign']);
    final lv = levelFromXp(prof['xp'] as num?);
    final st = {...blankStats(), ...(prof['stats'] is Map ? prof['stats'] as Map<String, dynamic> : {})};
    final isFriend = !self && app.friends.containsKey(uid);
    final banner = bannerById(prof['banner'] as String?);
    final showPickers = self && prof['provider'] != 'guest';
    final stats = <(String, String)>[
      for (final s in statLabels)
        if (!(s[0] == 'currentGames' && !self))
          (
            s[0] == 'currentGames'
                ? '${codes.length}'
                : '${st[s[0]] ?? 0}${(s[0] == 'fastestWin' || s[0] == 'longestGame') && (st[s[0]] ?? 0) != 0 ? ' r' : ''}',
            s[1]
          ),
      ('${camp.cleared}', 'Conquest cleared'),
      ('${camp.totalStars}', 'Conquest stars'),
    ];
    return _Sheet(children: [
      const Eyebrow('Player profile'),
      const SizedBox(height: 10),
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        decoration: BoxDecoration(gradient: banner.gradient, borderRadius: BorderRadius.circular(12)),
        child: Row(children: [
          Expanded(child: Text('${prof['name'] ?? 'Player'}', style: display(26, color: Colors.white))),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(
                color: const Color(0x55000000),
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: const Color(0x22FFFFFF))),
            child: Text('Lv ${lv.level}', style: const TextStyle(fontWeight: FontWeight.w800)),
          ),
        ]),
      ),
      const SizedBox(height: 8),
      XpBar(fraction: lv.into / lv.need),
      const SizedBox(height: 8),
      _sub(self
          ? 'your friend code: ${prof['friendCode'] ?? '-'} · ${lv.into}/${lv.need} xp to level ${lv.level + 1}'
          : (prof['online'] == true ? 'online now' : 'offline')),
      if (showPickers) ...[
        const _Label('PROFILE BANNER'),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final b in banners)
            Builder(builder: (_) {
              final open = app.bannerUnlocked(b, prof, camp);
              final sel = (prof['banner'] ?? 'lacquer') == b.id;
              return Tooltip(
                message: '${b.name}${open ? '' : ' (unlocks at ${b.needText})'}',
                child: InkWell(
                  onTap: open ? () => app.setBanner(b.id) : null,
                  child: Container(
                    width: 52,
                    height: 30,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      gradient: b.gradient,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: sel ? C.brass : C.lacquerEdge, width: sel ? 2.5 : 1),
                    ),
                    child: Opacity(opacity: open ? 1 : .8, child: Text(open ? '' : '🔒', style: const TextStyle(fontSize: 12))),
                  ),
                ),
              );
            }),
        ]),
        const _Label('CARD DESIGN'),
        _designGrid(
          app,
          cardDesigns,
          app.activeCardDesign,
          prof,
          camp,
          app.setCardDesign,
          (d) => CardView(card: null, width: 34, faceDown: true, backDesign: d.id),
        ),
        const _Label('DECK (CARD FACES)'),
        _designGrid(
          app,
          faceDeckDesigns,
          app.activeFaceDeck,
          prof,
          camp,
          app.setFaceDeck,
          (d) => CardView(card: const PlayingCard(1, 'S'), width: 34, faceDeck: d.id),
        ),
      ],
      const SizedBox(height: 14),
      GridView.count(
        crossAxisCount: 3,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 8,
        crossAxisSpacing: 8,
        childAspectRatio: 1.35,
        children: [
          for (final s in stats)
            Container(
              decoration: BoxDecoration(
                  color: C.lacquerDeep, borderRadius: BorderRadius.circular(10), border: Border.all(color: C.lacquerEdge)),
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
              child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                FittedBox(child: Text(s.$1, style: display(22, color: C.brass))),
                const SizedBox(height: 3),
                Text(s.$2.toUpperCase(),
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 9, color: C.creamDim, letterSpacing: .5)),
              ]),
            ),
        ],
      ),
      const SizedBox(height: 12),
      if (self) ...[
        if (codes.isNotEmpty)
          Wrap(spacing: 6, runSpacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
            const Text('Active tables:', style: TextStyle(fontSize: 12, color: C.creamDim)),
            for (final c in codes)
              GhostButton(c, mini: true, expand: false, onPressed: () {
                close('profile');
                app.show(AppView.online);
                app.joinByCode(c);
              }),
          ]),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(
              child: TextField(
                  controller: rename,
                  maxLength: 16,
                  decoration: const InputDecoration(hintText: 'change display name', counterText: ''))),
          const SizedBox(width: 8),
          GhostButton('rename', expand: false, onPressed: () => app.rename(rename.text)),
        ]),
      ] else
        isFriend
            ? GhostButton('Remove friend', onPressed: () {
                app.removeFriend(uid);
                close('profile');
              })
            : PrimaryButton('Add friend', onPressed: () async {
                await app.addFriend(uid, '${prof['name']}');
                close('profile');
              }),
      const SizedBox(height: 14),
      GhostButton('Close', onPressed: () => close('profile')),
    ]);
  }, dismissible: true);
}

class _Label extends StatelessWidget {
  final String text;
  const _Label(this.text);
  @override
  Widget build(BuildContext context) => Padding(
      padding: const EdgeInsets.only(top: 14, bottom: 6),
      child: Text(text, style: const TextStyle(fontSize: 9.5, color: C.creamDim, letterSpacing: .5)));
}

Widget _designGrid(App app, List<Design> designs, String active, Map<String, dynamic> prof, Campaign camp,
    void Function(String) pick, Widget Function(Design) preview) {
  return Wrap(spacing: 8, runSpacing: 8, children: [
    for (final d in designs)
      Builder(builder: (_) {
        final open = app.designUnlocked(d, prof, camp);
        final sel = active == d.id;
        return Tooltip(
          message: '${d.name}${open ? '' : ' – unlocks at ${d.needText}'}',
          child: InkWell(
            onTap: open ? () => pick(d.id) : null,
            borderRadius: BorderRadius.circular(10),
            child: Container(
              width: 96,
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: C.lacquerDeep,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: sel ? C.brass : C.lacquerEdge, width: sel ? 2 : 1),
              ),
              child: Opacity(
                opacity: open ? 1 : .45,
                child: Column(children: [
                  preview(d),
                  const SizedBox(height: 4),
                  Text('${d.name}${open ? '' : ' 🔒'}',
                      textAlign: TextAlign.center, style: const TextStyle(fontSize: 10, color: C.cream)),
                ]),
              ),
            ),
          ),
        );
      }),
  ]);
}

// ---------- settings / rules ----------
void showSettings(App app) => _show('settings', app, (ctx) {
      Widget toggle(String label, bool v, ValueChanged<bool> on) => Row(children: [
            Expanded(child: Text(label)),
            Switch(value: v, onChanged: on, activeThumbColor: C.lacquerDeep, activeTrackColor: C.brass),
          ]);
      return _Sheet(children: [
        const Eyebrow('Settings'),
        const SizedBox(height: 8),
        toggle('Sound effects', app.sound, (v) {
          app.sound = v;
          app.refresh();
        }),
        toggle('Reduce motion', app.reduceMotion, (v) {
          app.reduceMotion = v;
          app.refresh();
        }),
        toggle('Fast count', app.fastCount, (v) {
          app.fastCount = v;
          app.refresh();
        }),
        const Divider(color: C.lacquerEdge, height: 24),
        if (app.uid != null && app.profile != null)
          Row(children: [
            Expanded(
                child: Text.rich(TextSpan(children: [
              const TextSpan(text: 'Signed in as '),
              TextSpan(text: '${app.profile!['name']}', style: const TextStyle(fontWeight: FontWeight.w700)),
            ]))),
            GhostButton('sign out', mini: true, expand: false, onPressed: () {
              close('settings');
              app.doSignOut();
            }),
          ])
        else
          const Text('Not signed in', style: TextStyle(color: C.creamDim)),
        const SizedBox(height: 12),
        GhostButton('How to play', onPressed: () {
          close('settings');
          showRules(app);
        }),
        _gap,
        GhostButton('Privacy policy', onPressed: () {
          launchUrl(Uri.parse(privacyPolicyUrl), mode: LaunchMode.externalApplication);
        }),
        if (app.uid != null && app.profile != null) ...[
          _gap,
          TextButton(
            onPressed: () => _confirmDeleteAccount(app),
            style: TextButton.styleFrom(foregroundColor: const Color(0xFFE08070)),
            child: const Text('Delete account'),
          ),
        ],
        if (app.isAdmin) ...[
          _gap,
          GhostButton('Admin panel', onPressed: () {
            close('settings');
            showAdmin(app);
          }),
        ],
        _gap,
        GhostButton('Close', onPressed: () => close('settings')),
      ]);
    }, dismissible: true);

void showRules(App app) => _show('rules', app, (ctx) {
      Widget h(String t) => Padding(
          padding: const EdgeInsets.only(top: 14, bottom: 4), child: Text(t, style: display(17, color: C.brass)));
      Widget p(String t) => Text(t, style: const TextStyle(color: C.creamDim, fontSize: 13.5, height: 1.55));
      return _Sheet(children: [
        const Eyebrow('How to play'),
        h('The deal'),
        p('The first five cards deal themselves: one to each of the four hands, one face down to the crib. You place every '
            'card after that into a hand of your choice. Never the crib; once placed, a card stays.'),
        h('The crib feeds itself'),
        p('No hand may hold more than one card beyond the crib. Each time all four hands catch up, the next card deals '
            'itself face down into the crib. You only see it at the count.'),
        h('The count'),
        p('When all twenty cards are out, a starter flips and counts in every row. Fifteens score 2, pairs 2, runs their '
            'length, four of a suit a flush (the crib needs all five), a jack matching the starter suit is a nob.'),
        h('Par is 29'),
        p('Total all five rows, subtract 29. Over par pegs you up the rail; under pegs you backwards (totals can go negative).'),
        h('Winning'),
        p('Everyone plays the same number of rounds. The match ends once rounds are equal and someone has 29 or more. '
            'If a rival gets there first, you still get your answer round. Highest total wins; equal totals tie.'),
        h('Online tables'),
        p("2–4 players, turn-based in seat order, each with their own fresh shuffle. Empty seats can be filled with AI "
            "(played by the host's device; the table waits if the host is offline). Public tables are listed for anyone; "
            'private rooms use a five-letter code. While you wait, you watch the active player place every card live.'),
        h('Dropped connection?'),
        p('Your seat is held. Rejoin with the same name and room code (or tap your table in the lobby) and your '
            'half-played round comes back exactly as you left it.'),
        h('Tips'),
        p('Fives are gold: every face card makes fifteen with them. Keep one hand loose early as a dumping ground, and '
            'remember the hidden crib counts too.'),
        const SizedBox(height: 16),
        PrimaryButton('Close', onPressed: () => close('rules')),
      ]);
    }, dismissible: true);

// ---------- shop ----------
void showShop(App app) => _show('shop', app, (ctx) {
      final guest = app.isGuest;
      final coins = app.coins;
      final premium = app.profile?['premium'] == true;
      app.refreshLives();
      String premLabel;
      VoidCallback? premTap;
      if (premium) {
        premLabel = 'Premium active';
      } else if (guest) {
        premLabel = 'Sign in with Google to upgrade';
      } else {
        premLabel = 'Upgrade — 1,000 coins';
        premTap = coins >= shopPremiumCost ? app.buyPremium : null;
      }
      String lifeLabel;
      VoidCallback? lifeTap;
      if (guest) {
        lifeLabel = 'Sign in with Google to buy';
      } else if (app.campaign.lives >= maxLives) {
        lifeLabel = 'Hearts already full';
      } else {
        lifeLabel = 'Buy a life — $shopLifeCost coins';
        lifeTap = coins >= shopLifeCost ? app.buyLife : null;
      }
      Widget card(String title, String body, String label, VoidCallback? onTap, {bool coin = false}) => Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
                color: C.lacquerDeep, borderRadius: BorderRadius.circular(12), border: Border.all(color: C.lacquerEdge)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                if (coin) ...[const CoinIcon(), const SizedBox(width: 6)],
                Text(title, style: display(16)),
              ]),
              const SizedBox(height: 4),
              Text(body, style: const TextStyle(color: C.creamDim, fontSize: 13, height: 1.5)),
              const SizedBox(height: 10),
              PrimaryButton(label, onPressed: onTap),
            ]),
          );
      return _Sheet(children: [
        const Eyebrow('Shop'),
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 14),
          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            const CoinIcon(size: 26),
            const SizedBox(width: 8),
            Text('$coins', style: display(30, color: C.brass)),
          ]),
        ),
        card('Premium', 'Hearts regrow every 15 minutes instead of 30. A one-time upgrade for your account.', premLabel,
            premTap,
            coin: true),
        card('Extra life', 'Refill one Conquest heart right now.', lifeLabel, lifeTap),
        _sub('Earn coins by winning matches (+1) and clearing Conquest levels (+2 per star, replays included).'),
        if (guest) _sub('Guest sessions are casual: sign in with Google to keep coins and Premium.'),
        GhostButton('Close', onPressed: () => close('shop')),
      ]);
    }, dismissible: true);

// ---------- admin ----------
void showAdmin(App app) {
  if (!app.isAdmin) return;
  var query = '';
  app.loadAdminUsers();
  _show('admin', app, (ctx) => StatefulBuilder(builder: (ctx, setS) {
        final users = app.adminUsers;
        Widget list;
        if (users == null) {
          list = const EmptyNote('Loading…');
        } else if (app.adminError != null) {
          list = EmptyNote(app.adminError!);
        } else {
          final q = query.trim().toLowerCase();
          final rows = users.entries
              .where((en) =>
                  en.value is Map &&
                  (q.isEmpty ||
                      '${en.value['name'] ?? ''}'.toLowerCase().contains(q) ||
                      '${en.value['email'] ?? ''}'.toLowerCase().contains(q)))
              .toList()
            ..sort((a, b) => '${a.value['name'] ?? ''}'.compareTo('${b.value['name'] ?? ''}'));
          list = rows.isEmpty
              ? const EmptyNote('No matching accounts.')
              : Column(children: [for (final r in rows) _AdminRow(app: app, id: r.key, u: r.value as Map)]);
        }
        return _Sheet(children: [
          const Eyebrow('Admin · accounts'),
          const SizedBox(height: 12),
          TextField(
            decoration: const InputDecoration(hintText: 'filter by name or email'),
            onChanged: (v) => setS(() => query = v),
          ),
          const SizedBox(height: 12),
          list,
          const SizedBox(height: 14),
          GhostButton('Close', onPressed: () => close('admin')),
        ]);
      }));
}

class _AdminRow extends StatelessWidget {
  final App app;
  final String id;
  final Map u;
  const _AdminRow({required this.app, required this.id, required this.u});
  @override
  Widget build(BuildContext context) {
    final camp = u['campaign'];
    final lives = camp is Map && camp['lives'] is num ? (camp['lives'] as num).toInt() : maxLives;
    Widget numField(String label, int value, void Function(String) onDone) =>
        Expanded(child: _AdminNum(key: ValueKey('$id-$label'), label: label, value: value, onDone: onDone));
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
          color: C.lacquerDeep, borderRadius: BorderRadius.circular(10), border: Border.all(color: C.lacquerEdge)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('${u['name'] ?? 'Player'}', style: const TextStyle(fontWeight: FontWeight.w700)),
        Text('${u['email'] ?? u['provider'] ?? 'guest'}', style: const TextStyle(fontSize: 11.5, color: C.creamDim)),
        const SizedBox(height: 10),
        Row(children: [
          numField('Coins', (u['coins'] as num?)?.toInt() ?? 0, (v) => app.setAdminCoins(id, v)),
          const SizedBox(width: 8),
          numField('Hearts', lives, (v) => app.setAdminLives(id, v)),
        ]),
        const SizedBox(height: 8),
        u['premium'] == true
            ? GhostButton('Revoke premium', mini: true, onPressed: () => app.toggleAdminPremium(id))
            : PrimaryButton('Grant premium', mini: true, onPressed: () => app.toggleAdminPremium(id)),
      ]),
    );
  }
}

/// Number field that commits on submit or when it loses focus (the web's `change` event).
class _AdminNum extends StatefulWidget {
  final String label;
  final int value;
  final void Function(String) onDone;
  const _AdminNum({super.key, required this.label, required this.value, required this.onDone});
  @override
  State<_AdminNum> createState() => _AdminNumState();
}

class _AdminNumState extends State<_AdminNum> {
  late final _c = TextEditingController(text: '${widget.value}');
  final _f = FocusNode();
  @override
  void initState() {
    super.initState();
    _f.addListener(() {
      if (!_f.hasFocus && _c.text != '${widget.value}') widget.onDone(_c.text);
    });
  }

  @override
  void didUpdateWidget(_AdminNum old) {
    super.didUpdateWidget(old);
    if (!_f.hasFocus && old.value != widget.value) _c.text = '${widget.value}';
  }

  @override
  void dispose() {
    _c.dispose();
    _f.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => TextField(
        controller: _c,
        focusNode: _f,
        keyboardType: TextInputType.number,
        decoration: InputDecoration(labelText: widget.label),
        onSubmitted: widget.onDone,
      );
}

// ---------- account deletion ----------
void _confirmDeleteAccount(App app) {
  final guest = app.isGuest;
  _show('delete', app, (ctx) => _Sheet(children: [
        const Eyebrow('Delete account'),
        _big('Delete everything?', size: 26),
        _sub('This permanently removes your profile, stats, XP, coins, Premium, Conquest progress, '
            'friends and leaderboard entry. It can\'t be undone.'),
        if (!guest) _sub('To confirm, you\'ll be asked to sign in again.'),
        FilledButton(
          onPressed: () async {
            close('delete');
            close('settings');
            final err = await app.deleteAccount();
            _notice(app, err == null ? 'Account deleted' : 'Not deleted',
                err ?? 'Your account and its data have been removed.');
          },
          style: FilledButton.styleFrom(
              backgroundColor: C.inkRed,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 13),
              shape: const StadiumBorder()),
          child: const Text('Delete my account', style: TextStyle(fontWeight: FontWeight.w700)),
        ),
        _gap,
        GhostButton('Cancel', onPressed: () => close('delete')),
      ]));
}

void _notice(App app, String title, String body) => _show('notice', app, (ctx) => _Sheet(children: [
      _big(title, size: 24),
      _sub(body),
      PrimaryButton('OK', onPressed: () => close('notice')),
    ]), dismissible: true);
