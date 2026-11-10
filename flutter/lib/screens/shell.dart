import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app/controller.dart';
import '../theme.dart';
import 'dialogs.dart' as dlg;
import 'game_view.dart';
import 'home_view.dart';
import 'map_view.dart';
import 'online_view.dart';
import 'social_views.dart';

class Shell extends StatefulWidget {
  final App app;
  const Shell({super.key, required this.app});
  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  final _scroll = ScrollController();
  App get app => widget.app;

  @override
  void initState() {
    super.initState();
    app.scrollToTop.addListener(_toTop);
  }

  void _toTop() {
    if (_scroll.hasClients) _scroll.jumpTo(0);
  }

  @override
  void dispose() {
    app.scrollToTop.removeListener(_toTop);
    _scroll.dispose();
    super.dispose();
  }

  /// Hardware keys 1–4 place the current card (tablets with keyboards).
  KeyEventResult _onKey(FocusNode n, KeyEvent ev) {
    if (ev is! KeyDownEvent) return KeyEventResult.ignored;
    final ch = ev.character;
    if (ch == null || ch.length != 1) return KeyEventResult.ignored;
    final i = '1234'.indexOf(ch);
    if (i < 0 || app.count?.active == true) return KeyEventResult.ignored;
    if (app.view == AppView.game) {
      app.place(i);
    } else if (app.view == AppView.online && app.seat >= 0) {
      app.onlinePlace(i);
    }
    return KeyEventResult.handled;
  }

  /// Android back: walk back the way the website's back buttons do.
  void _onBack() {
    switch (app.view) {
      case AppView.game:
        dlg.confirm(context, app.challenge != null ? 'Quit this level? It counts as a fail and costs a life.' : 'Quit this game?',
            'Quit', app.quitGame);
      case AppView.online:
        if (app.code != null) {
          dlg.confirm(context, 'Leave this table? Your seat is held so you can rejoin.', 'Leave', app.leaveRoom);
        } else if (app.oPanel == OPanel.make || app.oPanel == OPanel.find || app.oPanel == OPanel.conquestPanel) {
          app.showPanel(OPanel.lobby);
        } else {
          app.show(AppView.home);
        }
      case AppView.map:
        app.leaveMap();
      case AppView.home:
        if (app.offlineTilesOpen) {
          app.offlineTilesOpen = false;
          app.refresh();
        } else {
          SystemNavigator.pop();
        }
      default:
        app.show(AppView.home);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: app,
      builder: (context, _) {
        final body = switch (app.view) {
          AppView.home => HomeView(app: app),
          AppView.game => GameView(app: app),
          AppView.online => OnlineView(app: app),
          AppView.map => MapView(app: app),
          AppView.friends => FriendsView(app: app),
          AppView.messages => MessagesView(app: app),
        };
        final isMap = app.view == AppView.map;
        return PopScope(
          canPop: false,
          onPopInvokedWithResult: (didPop, _) {
            if (!didPop) _onBack();
          },
          child: Focus(
            autofocus: true,
            onKeyEvent: _onKey,
            child: Scaffold(
              backgroundColor: C.lacquer,
              body: Stack(children: [
                const Positioned.fill(child: _TableBackground()),
                SafeArea(
                  bottom: false,
                  child: Column(children: [
                    _AppBar(app: app),
                    Expanded(
                      child: isMap
                          ? body
                          : SingleChildScrollView(
                              controller: _scroll,
                              padding: EdgeInsets.fromLTRB(16, 8, 16, app.inGame ? 32 : 96),
                              child: Center(
                                child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 720), child: body),
                              ),
                            ),
                    ),
                  ]),
                ),
              ]),
              bottomNavigationBar: app.inGame ? null : _BottomNav(app: app),
            ),
          ),
        );
      },
    );
  }
}

class _TableBackground extends StatelessWidget {
  const _TableBackground();
  @override
  Widget build(BuildContext context) => Stack(fit: StackFit.expand, children: [
        Image.asset('assets/bg/table-bg.jpg', fit: BoxFit.cover, alignment: Alignment.topCenter),
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0x6B160B09), Color(0x99160B09)],
            ),
          ),
        ),
      ]);
}

class _IconBtn extends StatelessWidget {
  final Widget child;
  final VoidCallback onTap;
  final String tooltip;
  const _IconBtn({required this.child, required this.onTap, required this.tooltip});
  @override
  Widget build(BuildContext context) => Tooltip(
        message: tooltip,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            height: 38,
            constraints: const BoxConstraints(minWidth: 38),
            padding: const EdgeInsets.symmetric(horizontal: 8),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: const Color(0xB33A1E19),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: C.lacquerEdge),
            ),
            child: child,
          ),
        ),
      );
}

class _AppBar extends StatelessWidget {
  final App app;
  const _AppBar({required this.app});
  @override
  Widget build(BuildContext context) {
    final signed = app.uid != null && app.profile != null;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      decoration: const BoxDecoration(
        color: Color(0xCC1F100E),
        border: Border(bottom: BorderSide(color: C.lacquerEdge)),
      ),
      child: Row(children: [
        Expanded(
          child: GestureDetector(
            onTap: () => app.inGame ? null : app.show(AppView.home),
            child: FittedBox(
              alignment: Alignment.centerLeft,
              fit: BoxFit.scaleDown,
              child: Text.rich(TextSpan(style: display(22), children: const [
                TextSpan(text: 'Chinese '),
                TextSpan(text: 'Cribbage', style: TextStyle(color: C.brass)),
              ])),
            ),
          ),
        ),
        if (app.view == AppView.game) ...[
          _IconBtn(
            tooltip: 'Quit',
            onTap: () => dlg.confirm(
                context,
                app.challenge != null ? 'Quit this level? It counts as a fail and costs a life.' : 'Quit this game?',
                'Quit',
                app.quitGame),
            child: const Icon(Icons.close_rounded, size: 20, color: C.cream),
          ),
          const SizedBox(width: 8),
        ],
        if (signed) ...[
          _IconBtn(
            tooltip: 'Shop',
            onTap: app.openShop,
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              const CoinIcon(),
              const SizedBox(width: 6),
              Text('${app.coins}', style: display(14, color: C.brass, weight: FontWeight.w700)),
            ]),
          ),
          const SizedBox(width: 8),
        ],
        _IconBtn(
            tooltip: 'How to play',
            onTap: () => dlg.showRules(app),
            child: const Icon(Icons.info_outline_rounded, size: 20, color: C.cream)),
        const SizedBox(width: 8),
        _IconBtn(
            tooltip: 'Settings',
            onTap: () => dlg.showSettings(app),
            child: const Icon(Icons.settings_rounded, size: 20, color: C.cream)),
      ]),
    );
  }
}

class _BottomNav extends StatelessWidget {
  final App app;
  const _BottomNav({required this.app});
  @override
  Widget build(BuildContext context) {
    final tabs = [
      ('home', Icons.home_rounded, 'Home', 0),
      ('conquest', Icons.shield_rounded, 'Conquest', 0),
      ('friends', Icons.people_alt_rounded, 'Friends', app.onlineFriendCount),
      ('messages', Icons.mail_rounded, 'Messages', app.freshChallenges.length),
      ('profile', Icons.person_rounded, 'Profile', 0),
    ];
    return Container(
      decoration: const BoxDecoration(
        color: Color(0xF21F100E),
        border: Border(top: BorderSide(color: C.lacquerEdge)),
        boxShadow: [BoxShadow(color: Color(0x66000000), blurRadius: 14, offset: Offset(0, -2))],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
          child: Row(children: [
            for (final t in tabs)
              Expanded(
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: () => app.gotoTab(t.$1),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    decoration: BoxDecoration(
                      color: app.activeTab == t.$1 ? C.brass.withValues(alpha: .12) : null,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Stack(clipBehavior: Clip.none, alignment: Alignment.center, children: [
                      Column(mainAxisSize: MainAxisSize.min, children: [
                        Icon(t.$2, size: 22, color: app.activeTab == t.$1 ? C.brass : C.creamDim),
                        const SizedBox(height: 3),
                        Text(t.$3,
                            style: TextStyle(
                                fontSize: 10.5,
                                fontWeight: FontWeight.w700,
                                color: app.activeTab == t.$1 ? C.brass : C.creamDim)),
                      ]),
                      if (t.$4 > 0)
                        Positioned(
                          top: -4,
                          right: 10,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                            decoration: BoxDecoration(color: C.inkRed, borderRadius: BorderRadius.circular(999)),
                            child: Text('${t.$4}',
                                style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Colors.white)),
                          ),
                        ),
                    ]),
                  ),
                ),
              ),
          ]),
        ),
      ),
    );
  }
}
