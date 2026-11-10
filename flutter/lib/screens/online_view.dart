import 'package:flutter/foundation.dart' show TargetPlatform, defaultTargetPlatform;
import 'package:flutter/material.dart';

import '../app/controller.dart';
import '../engine/engine.dart' as e;
import '../game/catalog.dart';
import '../theme.dart';
import '../widgets/board.dart';
import 'dialogs.dart' as dlg;

class OnlineView extends StatelessWidget {
  final App app;
  const OnlineView({super.key, required this.app});

  @override
  Widget build(BuildContext context) {
    if (app.code != null && app.room != null && app.room!['status'] != 'waiting') {
      return _OnlineGame(app: app);
    }
    final panel = switch (app.oPanel) {
      OPanel.auth => _AuthPanel(app: app),
      OPanel.lobby => _Hub(app: app),
      OPanel.make => _MakePanel(app: app),
      OPanel.find => _FindPanel(app: app),
      OPanel.conquestPanel => _ConquestPanel(app: app),
      OPanel.setup => _SetupPanel(app: app),
      OPanel.wait => _WaitPanel(app: app),
      OPanel.game => _WaitPanel(app: app),
    };
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 460),
        child: Panel(margin: const EdgeInsets.only(top: 10), padding: const EdgeInsets.all(20), child: panel),
      ),
    );
  }
}

class _PanelHead extends StatelessWidget {
  final String title;
  final VoidCallback onBack;
  final Widget? trailing;
  const _PanelHead(this.title, this.onBack, {this.trailing});
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: Row(children: [
          IconButton(
            onPressed: onBack,
            icon: const Text('‹', style: TextStyle(fontSize: 26, color: C.cream, height: 1)),
            style: IconButton.styleFrom(side: const BorderSide(color: C.lacquerEdge)),
          ),
          const SizedBox(width: 10),
          Expanded(child: Text(title, style: display(26))),
          ?trailing,
        ]),
      );
}

const _p = TextStyle(color: C.creamDim, fontSize: 14, height: 1.6);
const _fieldLabel = TextStyle(color: C.creamDim, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1.4);

class _AuthPanel extends StatefulWidget {
  final App app;
  const _AuthPanel({required this.app});
  @override
  State<_AuthPanel> createState() => _AuthPanelState();
}

class _AuthPanelState extends State<_AuthPanel> {
  final _name = TextEditingController();
  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final app = widget.app;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text("Who's playing?", style: display(28)),
      const SizedBox(height: 10),
      const Text(
          'Sign in to keep your stats, friends and seats across devices, or jump in as a guest with one tap. No passwords either way.',
          style: _p),
      const SizedBox(height: 16),
      TextField(
          controller: _name,
          maxLength: 16,
          decoration: const InputDecoration(hintText: 'Display name (optional for guests)', counterText: '')),
      const SizedBox(height: 12),
      PrimaryButton('Continue with Google', onPressed: app.signInGoogle),
      if (defaultTargetPlatform == TargetPlatform.iOS) ...[
        const SizedBox(height: 10),
        // Apple's style rules: black or white button with the Apple logo.
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: app.signInApple,
            icon: const Icon(Icons.apple, size: 22),
            label: const Text('Sign in with Apple'),
            style: FilledButton.styleFrom(
              backgroundColor: Colors.white,
              foregroundColor: Colors.black,
              padding: const EdgeInsets.symmetric(vertical: 13),
              textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
              shape: const StadiumBorder(),
            ),
          ),
        ),
      ],
      const SizedBox(height: 10),
      GhostButton('Play as guest', onPressed: () => app.signInGuest(_name.text)),
      ErrText(app.authError),
      const SizedBox(height: 18),
      GhostButton('Back', onPressed: () => app.show(AppView.home)),
    ]);
  }
}

class _Hub extends StatelessWidget {
  final App app;
  const _Hub({required this.app});
  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _AccountBar(app: app),
      ErrText(app.oError),
      const SizedBox(height: 6),
      _HubCard(
        icon: Icons.handyman_rounded,
        title: 'Make Table',
        sub: 'Host 2 to 4 players, add AI seats, public or private.',
        colors: const [Color(0xFF3E8E7E), Color(0xFF1D4A3F)],
        border: const Color(0xFF5FC9B3),
        onTap: () => app.requireAuth(() => app.showPanel(OPanel.make)),
      ),
      _HubCard(
        icon: Icons.search_rounded,
        title: 'Find Table',
        sub: 'Browse open tables, join by code, or challenge a friend.',
        colors: const [Color(0xFF8A6F1F), Color(0xFF5A3B14)],
        border: const Color(0xFFD8B552),
        onTap: () => app.requireAuth(() => app.showPanel(OPanel.find)),
      ),
      _HubCard(
        icon: Icons.shield_rounded,
        title: 'Conquest',
        sub: app.uid == null ? 'Climb the campaign. Earn stars, banners and XP.' : app.conquestHubSub,
        colors: const [Color(0xFFB5402F), Color(0xFF6E2018)],
        border: const Color(0xFFE08070),
        onTap: app.openConquestFromHub,
      ),
      const SizedBox(height: 6),
      GhostButton('Back to home', onPressed: () => app.show(AppView.home)),
    ]);
  }
}

class _HubCard extends StatelessWidget {
  final IconData icon;
  final String title, sub;
  final List<Color> colors;
  final Color border;
  final VoidCallback onTap;
  const _HubCard(
      {required this.icon,
      required this.title,
      required this.sub,
      required this.colors,
      required this.border,
      required this.onTap});
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(16),
            child: Ink(
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: colors),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: border),
                boxShadow: const [BoxShadow(color: Color(0x66000000), blurRadius: 14, offset: Offset(0, 6))],
              ),
              child: Stack(children: [
                Positioned(
                  right: 14,
                  top: 0,
                  bottom: 0,
                  child: Center(
                      child: Opacity(
                          opacity: .22, child: Icon(icon, size: 54, color: Colors.white))),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(18, 18, 70, 18),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(title, style: display(26, color: Colors.white)),
                    const SizedBox(height: 4),
                    Text(sub, style: const TextStyle(color: Color(0xFFF3E9D7), fontSize: 13, height: 1.4)),
                  ]),
                ),
              ]),
            ),
          ),
        ),
      );
}

class _AccountBar extends StatelessWidget {
  final App app;
  const _AccountBar({required this.app});
  @override
  Widget build(BuildContext context) {
    if (app.uid == null || app.profile == null) return const SizedBox.shrink();
    final lv = app.xpLevel;
    final name = '${app.profile!['name'] ?? '?'}';
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(children: [
        CircleAvatar(
          radius: 20,
          backgroundColor: C.brass,
          child: Text(name.trim().isEmpty ? '?' : name.trim()[0].toUpperCase(),
              style: display(18, color: C.lacquerDeep, weight: FontWeight.w700)),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Row(children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
                decoration: BoxDecoration(color: C.brass, borderRadius: BorderRadius.circular(999)),
                child: Text('Lv ${lv.level}',
                    style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: C.lacquerDeep)),
              ),
              const SizedBox(width: 6),
              Expanded(child: XpBar(fraction: lv.into / lv.need, height: 6)),
            ]),
          ]),
        ),
        IconButton(
          tooltip: 'Profile',
          onPressed: () => dlg.openProfile(app, null),
          icon: const Icon(Icons.person_rounded, color: C.cream),
          style: IconButton.styleFrom(side: const BorderSide(color: C.lacquerEdge)),
        ),
        IconButton(
          tooltip: 'Sign out',
          onPressed: app.doSignOut,
          icon: const Icon(Icons.logout_rounded, color: C.cream),
          style: IconButton.styleFrom(side: const BorderSide(color: C.lacquerEdge)),
        ),
      ]),
    );
  }
}

class XpBar extends StatelessWidget {
  final double fraction;
  final double height;
  const XpBar({super.key, required this.fraction, this.height = 8});
  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: BorderRadius.circular(height),
        child: Container(
          height: height,
          color: C.lacquerDeep,
          alignment: Alignment.centerLeft,
          child: FractionallySizedBox(
            widthFactor: fraction.clamp(0, 1),
            child: Container(color: C.brass),
          ),
        ),
      );
}

class _MakePanel extends StatelessWidget {
  final App app;
  const _MakePanel({required this.app});
  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _PanelHead('Make Table', () => app.showPanel(OPanel.lobby)),
      const Text('PLAYERS', style: _fieldLabel),
      const SizedBox(height: 8),
      Wrap(spacing: 8, runSpacing: 8, children: [
        for (final n in [2, 3, 4]) Pill('$n players', selected: app.roomSize == n, onTap: () => app.setRoomSize(n)),
      ]),
      const SizedBox(height: 12),
      for (var idx = 0; idx < app.seatConfig.length; idx++)
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Row(children: [
            SizedBox(
                width: 56, child: Text('Seat ${idx + 2}', style: const TextStyle(color: C.creamDim, fontSize: 12))),
            Expanded(
              child: Wrap(spacing: 6, runSpacing: 6, children: [
                for (final v in ['open', 'easy', 'medium', 'hard'])
                  Pill(v == 'open' ? 'open' : '$v AI',
                      selected: app.seatConfig[idx] == v, onTap: () => app.setSeatConfig(idx, v)),
              ]),
            ),
          ]),
        ),
      const SizedBox(height: 8),
      const Text('VISIBILITY', style: _fieldLabel),
      const SizedBox(height: 8),
      Wrap(spacing: 8, children: [
        Pill('public table', selected: app.visibility == 'public', onTap: () {
          app.visibility = 'public';
          app.refresh();
        }),
        Pill('private room', selected: app.visibility == 'private', onTap: () {
          app.visibility = 'private';
          app.refresh();
        }),
      ]),
      const SizedBox(height: 16),
      PrimaryButton(app.visibility == 'public' ? 'Open a table' : 'Create a private room', onPressed: app.oCreate),
      ErrText(app.oError),
    ]);
  }
}

class _FindPanel extends StatefulWidget {
  final App app;
  const _FindPanel({required this.app});
  @override
  State<_FindPanel> createState() => _FindPanelState();
}

class _FindPanelState extends State<_FindPanel> {
  final _code = TextEditingController();
  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final app = widget.app;
    final tables = app.publicTables;
    final now = DateTime.now().millisecondsSinceEpoch;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _PanelHead('Find Table', () => app.showPanel(OPanel.lobby)),
      Row(children: [
        Expanded(
          child: TextField(
            controller: _code,
            maxLength: 5,
            textCapitalization: TextCapitalization.characters,
            decoration: const InputDecoration(hintText: 'Enter room code', counterText: ''),
            onSubmitted: (v) => app.joinByCode(v),
          ),
        ),
        const SizedBox(width: 8),
        PrimaryButton('Join', expand: false, onPressed: () => app.joinByCode(_code.text)),
      ]),
      ErrText(app.oError),
      const SizedBox(height: 18),
      Text('Open tables', style: display(18)),
      const SizedBox(height: 8),
      if (app.lobbyError != null)
        EmptyNote(app.lobbyError!)
      else if (app.publicRooms == null)
        const EmptyNote('Looking for open tables…')
      else if (tables.isEmpty)
        const EmptyNote('No open tables right now. Open one from Make Table.')
      else
        for (final t in tables)
          Builder(builder: (_) {
            final v = t.value as Map;
            final mins = ((now - ((v['createdAt'] as num?) ?? 0)) / 60000).round().clamp(0, 1 << 30);
            final playing = v['status'] == 'playing';
            return ListItem(
              title: Text("${v['host'] ?? 'Someone'}'s table"),
              sub: '${v['size'] ?? 2} seats · ${playing ? 'in play' : 'open'} · ${mins < 1 ? 'just now' : '$mins min ago'}',
              actions: [GhostButton(playing ? 'Watch' : 'Join', mini: true, expand: false, onPressed: () => app.joinByCode(t.key))],
            );
          }),
    ]);
  }
}

class _ConquestPanel extends StatelessWidget {
  final App app;
  const _ConquestPanel({required this.app});
  @override
  Widget build(BuildContext context) {
    final snap = app.activeSnap;
    final c = app.campaign;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _PanelHead('Conquest', () => app.showPanel(OPanel.lobby),
          trailing: GhostButton('leaderboard', mini: true, expand: false, onPressed: () => dlg.showBoard(app))),
      if (app.uid == null)
        const EmptyNote('Sign in to play Conquest.')
      else if (app.isGuest)
        const EmptyNote('Conquest, friends and leaderboards need a Google sign-in. Guest sessions stay casual.')
      else ...[
        if (snap != null)
          ListItem(
            border: C.brass,
            title: Text('Resume level ${snap['id']}'),
            sub: 'a game is in progress',
            actions: [
              PrimaryButton('Resume', mini: true, expand: false, onPressed: () {
                final s = app.activeSnap!;
                app.activeSnap = null;
                app.resumeChallenge(s);
              })
            ],
          ),
        ListItem(
          title: Text('Level ${c.level}'),
          sub: '${c.totalStars} ★ · ${'❤' * c.lives}${'♡' * (maxLives - c.lives)}',
          actions: [
            snap != null
                ? GhostButton('Map', mini: true, expand: false, onPressed: app.openMap)
                : PrimaryButton('Play', mini: true, expand: false, onPressed: app.openMap)
          ],
        ),
      ],
    ]);
  }
}

class _SetupPanel extends StatelessWidget {
  final App app;
  const _SetupPanel({required this.app});
  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('Online play needs a one-time setup', style: display(26)),
        const SizedBox(height: 10),
        const Text(
            'Online tables sync through the same Firebase project as the website. Register this Android/iOS app '
            'in the Firebase console and run `flutterfire configure --project=chinese-cribbage` to generate '
            'lib/firebase_options.dart (see flutter/README.md). Solo, versus AI and pass-and-play work right now, offline.',
            style: _p),
        const SizedBox(height: 16),
        GhostButton('Back', onPressed: () => app.show(AppView.home)),
      ]);
}

/// Roster chips: names, AI tags, held seats and take-seat buttons.
class Roster extends StatelessWidget {
  final App app;
  const Roster({super.key, required this.app});
  @override
  Widget build(BuildContext context) {
    final size = app.roomSizeOf;
    final chips = <Widget>[];
    for (var k = 0; k < size; k++) {
      final p = app.player(k);
      if (p == null || p['joined'] != true) {
        chips.add(_Chip(open: true, child: Text('seat ${k + 1} · open', style: const TextStyle(color: C.creamDim))));
        continue;
      }
      final off = p['ai'] != true && p['connected'] == false;
      final held = app.seatHeldSeconds(k);
      final profUid = p['uid'] != null && p['uid'] != app.uid && p['ai'] != true ? '${p['uid']}' : null;
      chips.add(_Chip(
        off: off,
        onTap: profUid == null ? null : () => dlg.openProfile(app, profUid),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(shape: BoxShape.circle, color: off ? const Color(0xFF9A8F7A) : C.jade)),
          const SizedBox(width: 6),
          Text('${p['name']}${k == app.seat ? ' (you)' : ''}'),
          if (p['ai'] == true) const LiveBadge('AI', color: C.brassDim),
          if (off)
            app.seatClaimable(k)
                ? Padding(
                    padding: const EdgeInsets.only(left: 8),
                    child: GhostButton('take seat', mini: true, expand: false, onPressed: () => app.claimSeat(k)))
                : Padding(
                    padding: const EdgeInsets.only(left: 8),
                    child: Text('seat held${held > 0 ? ' ${held}s' : ''}',
                        style: const TextStyle(fontSize: 11, color: C.brass))),
        ]),
      ));
    }
    if (app.seat == -1) {
      chips.add(const _Chip(child: Text('You · spectating', style: TextStyle(color: C.creamDim))));
    }
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Wrap(spacing: 8, runSpacing: 8, children: chips),
    );
  }
}

class _Chip extends StatelessWidget {
  final Widget child;
  final bool off, open;
  final VoidCallback? onTap;
  const _Chip({required this.child, this.off = false, this.open = false, this.onTap});
  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: C.lacquerDeep.withValues(alpha: .85),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: onTap != null ? C.brassDim : C.lacquerEdge),
          ),
          child: Opacity(
              opacity: off ? .75 : 1,
              child: DefaultTextStyle.merge(style: const TextStyle(fontSize: 12.5), child: child)),
        ),
      );
}

class _WaitPanel extends StatelessWidget {
  final App app;
  const _WaitPanel({required this.app});
  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('Room ${app.code ?? ''}', style: display(28)),
        const SizedBox(height: 8),
        const Text('Share this code. The game starts the moment every seat is filled.', style: _p),
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 22),
          child: SelectableText(app.code ?? '',
              textAlign: TextAlign.center, style: display(50, color: C.brass).copyWith(letterSpacing: 10)),
        ),
        if (app.room != null) Roster(app: app),
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 14),
          child: Center(child: SizedBox(width: 28, height: 28, child: CircularProgressIndicator(strokeWidth: 3))),
        ),
        GhostButton('Cancel', onPressed: app.leaveRoom),
      ]);
}

class _OnlineGame extends StatelessWidget {
  final App app;
  const _OnlineGame({required this.app});

  @override
  Widget build(BuildContext context) {
    final room = app.room!;
    final size = app.roomSizeOf;
    final status = room['status'];
    final turn = (room['turn'] as num?)?.toInt() ?? 0;
    final lanes = [
      for (var k = 0; k < size; k++) Lane('${app.seatName(k)}${k == app.seat ? ' (you)' : ''}', app.roomTotal(k))
    ];
    final history = app.historyLines;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Padding(
        padding: const EdgeInsets.only(top: 4, bottom: 10),
        child: Row(children: [
          Expanded(child: Text('Round ${((room['currentRound'] as num?)?.toInt() ?? 0) + 1}', style: display(24))),
          if (status == 'playing' && app.seat >= 0) ...[
            GhostButton('Forfeit',
                mini: true,
                expand: false,
                onPressed: () => dlg.confirm(
                    context, 'Forfeit this game? Your opponent will be awarded the win.', 'Forfeit', app.forfeitGame)),
            const SizedBox(width: 8),
          ],
          GhostButton('Leave', mini: true, expand: false, onPressed: app.leaveRoom),
        ]),
      ),
      Rail(lanes: lanes, activeIdx: status == 'playing' ? turn : -1, reduceMotion: app.reduceMotion),
      Roster(app: app),
      if (history.isNotEmpty)
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Text(history.join('\n'), style: const TextStyle(fontSize: 12, color: C.creamDim, height: 1.6)),
        ),
      if (status != 'done') _playArea(context, turn),
    ]);
  }

  Widget _playArea(BuildContext context, int turn) {
    final r = app.oRound;
    if (app.onlineMyTurn && r != null) {
      final counting = app.countingOnline;
      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        r.complete
            ? DrawPanel(
                label: const Text('Starter'),
                sub: counting ? 'counting the hands…' : 'Counts in all five hands.',
                card: ThemedCard(app, r.starter,
                    width: 84, animate: true, glow: counting && app.count!.set.contains(4)))
            : DrawPanel(
                label: const Text('Your card'),
                sub: 'Tap a hand to place it. The table is watching.',
                card: ThemedCard(app, r.current, width: 84, animate: true)),
        if (counting) CountCallout(count: app.count!, onSkip: app.skipCount),
        RowsView(
          app: app,
          round: r,
          placeable: (i) => !counting && e.canPlace(r, i),
          rowScores: r.complete && !counting ? e.scoreRound(r).rowScores : null,
          count: counting ? app.count : null,
          onPlace: app.onlinePlace,
        ),
        if (r.complete && !counting)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Builder(builder: (_) {
              final net = e.scoreRound(r).net;
              return PrimaryButton('Submit ${net >= 0 ? '+' : ''}$net', onPressed: app.onlineSubmit);
            }),
          ),
      ]);
    }

    // Not my turn: watch whoever is placing, move for move.
    final lr = app.liveRound;
    final tp = app.player(turn);
    final turnName = tp?['name']?.toString() ?? '…';
    if (lr != null) {
      final ls = app.liveSeat;
      final liveName = app.seatName(ls);
      final lp = app.player(ls);
      final liveOff = lp != null && lp['ai'] != true && lp['connected'] == false;
      final DrawPanel head;
      if (lr.complete) {
        head = DrawPanel(
            label: Text("$liveName's starter"),
            sub: 'Counting up their five hands…',
            card: ThemedCard(app, lr.starter, width: 84, animate: true));
      } else if (liveOff) {
        head = DrawPanel(
            label: Row(children: [
              Flexible(child: Text('$liveName disconnected')),
              const LiveBadge('SEAT HELD', color: C.brassDim)
            ]),
            sub: 'Board frozen. They can rejoin with the same name and code.',
            card: ThemedCard(app, lr.current, width: 84, animate: true));
      } else {
        head = DrawPanel(
            label: Row(children: [Flexible(child: Text('$liveName is placing')), const LiveBadge('LIVE')]),
            sub: 'Every move shows as they make it.',
            card: ThemedCard(app, lr.current, width: 84, animate: true));
      }
      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        head,
        RowsView(
            app: app,
            round: lr,
            placeable: (_) => false,
            rowScores: lr.complete ? e.scoreRound(lr).rowScores : null),
      ]);
    }
    final off = tp != null && tp['ai'] != true && tp['connected'] == false;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 30),
      child: Column(children: [
        const SizedBox(width: 28, height: 28, child: CircularProgressIndicator(strokeWidth: 3)),
        const SizedBox(height: 14),
        Text(
            off
                ? '$turnName is disconnected. Their seat is held while the table waits.'
                : '$turnName is playing their round…',
            textAlign: TextAlign.center,
            style: const TextStyle(color: C.creamDim)),
      ]),
    );
  }
}
