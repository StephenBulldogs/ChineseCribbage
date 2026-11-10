import 'package:flutter/material.dart';

import '../app/controller.dart';
import '../theme.dart';
import 'dialogs.dart' as dlg;

class HomeView extends StatelessWidget {
  final App app;
  const HomeView({super.key, required this.app});

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const SizedBox(height: 8),
      LayoutBuilder(builder: (ctx, bc) {
        final offline = _Door(
          title: 'Offline play',
          sub: 'Solo runs · versus AI · pass and play. No account, no connection.',
          colors: const [Color(0xFF5D7A4E), Color(0xFF3F5A3A)],
          edge: const Color(0xFF2C4026),
          onTap: () {
            app.offlineTilesOpen = !app.offlineTilesOpen;
            app.refresh();
          },
        );
        final online = _Door(
          title: 'Online play',
          sub: 'Tables for 2 to 4 · Conquest · friends and leaderboards. Sign in or play as guest.',
          colors: const [Color(0xFFA4452B), Color(0xFF7A2E1C)],
          edge: const Color(0xFF561D11),
          onTap: () => app.openOnline(),
        );
        if (bc.maxWidth < 420) {
          return Column(children: [offline, const SizedBox(height: 14), online]);
        }
        return IntrinsicHeight(
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Expanded(child: offline),
            const SizedBox(width: 14),
            Expanded(child: online),
          ]),
        );
      }),
      AnimatedSize(
        duration: const Duration(milliseconds: 220),
        child: !app.offlineTilesOpen
            ? const SizedBox(width: double.infinity)
            : Padding(
                padding: const EdgeInsets.only(top: 22),
                child: Column(children: [
                  _Tile(
                    title: 'Solo run',
                    sub: 'You against the deck. Reach 29 fast.',
                    onTap: () => app.startMatch('solo'),
                  ),
                  _Tile(
                    title: 'Versus AI',
                    sub: 'Race the house to 29.',
                    onTap: () => app.startMatch('ai'),
                    extra: Wrap(spacing: 8, children: [
                      for (final d in ['easy', 'medium', 'hard'])
                        Pill(d, selected: app.difficulty == d, onTap: () {
                          app.difficulty = d;
                          app.refresh();
                        }),
                    ]),
                  ),
                  _Tile(
                    title: 'Pass & play',
                    sub: 'Two to four players, one screen.',
                    onTap: () => dlg.showPassSetup(app),
                  ),
                ]),
              ),
      ),
    ]);
  }
}

class _Door extends StatelessWidget {
  final String title, sub;
  final List<Color> colors;
  final Color edge;
  final VoidCallback onTap;
  const _Door({required this.title, required this.sub, required this.colors, required this.edge, required this.onTap});
  @override
  Widget build(BuildContext context) => Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(18),
          child: Ink(
            padding: const EdgeInsets.fromLTRB(22, 26, 22, 26),
            decoration: BoxDecoration(
              gradient: LinearGradient(colors: colors, begin: Alignment.topCenter, end: Alignment.bottomCenter),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: edge),
              boxShadow: [
                BoxShadow(color: edge, offset: const Offset(0, 3)),
                const BoxShadow(color: Color(0x73000000), blurRadius: 20, offset: Offset(0, 8)),
              ],
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: display(30, color: Colors.white)),
              const SizedBox(height: 8),
              Text(sub, style: const TextStyle(color: Color(0xFFEFE3CC), fontSize: 13.5, height: 1.5)),
            ]),
          ),
        ),
      );
}

class _Tile extends StatelessWidget {
  final String title, sub;
  final VoidCallback onTap;
  final Widget? extra;
  const _Tile({required this.title, required this.sub, required this.onTap, this.extra});
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Material(
          color: const Color(0xCC2B1714),
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14), side: const BorderSide(color: C.lacquerEdge)),
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(14),
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: SizedBox(
                width: double.infinity,
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(title, style: display(21)),
                  const SizedBox(height: 4),
                  Text(sub, style: const TextStyle(color: C.creamDim, fontSize: 13, height: 1.5)),
                  if (extra != null) ...[const SizedBox(height: 12), extra!],
                  const SizedBox(height: 10),
                  const Text('PLAYS OFFLINE',
                      style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1.5, color: C.brass)),
                ]),
              ),
            ),
          ),
        ),
      );
}
