import 'package:flutter/material.dart';

import '../app/controller.dart';
import '../game/catalog.dart';
import '../theme.dart';
import 'dialogs.dart' as dlg;

/// The Conquest map: a winding stone road through 100 level tiles, with a
/// terrain zone every 10 levels and a gold progress trail.
class MapView extends StatefulWidget {
  final App app;
  const MapView({super.key, required this.app});
  @override
  State<MapView> createState() => _MapViewState();
}

const _nodeX = [22.0, 40.0, 62.0, 78.0, 60.0, 38.0];
const _gap = 96.0, _top = 70.0;

class _MapViewState extends State<MapView> {
  final _scroll = ScrollController();

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void _scrollToNext(double viewport) {
    final app = widget.app;
    if (app.mapScrolled) return;
    app.mapScrolled = true;
    final idx = (app.campaign.level.clamp(1, levels.length)) - 1;
    final y = _top + idx * _gap - viewport / 2;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      final target = y.clamp(0.0, _scroll.position.maxScrollExtent);
      if (MediaQuery.of(context).disableAnimations || app.reduceMotion) {
        _scroll.jumpTo(target);
      } else {
        _scroll.animateTo(target, duration: const Duration(milliseconds: 500), curve: Curves.easeOut);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final app = widget.app;
    final c = app.campaign;
    final height = levels.length * _gap + 140;
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 6),
        child: Row(children: [
          Expanded(
              child: FittedBox(
                  alignment: Alignment.centerLeft, fit: BoxFit.scaleDown, child: Text('Conquest', style: display(26)))),
          GhostButton('Leaderboard', mini: true, expand: false, onPressed: () => dlg.showBoard(app)),
          const SizedBox(width: 8),
          GhostButton('Back', mini: true, expand: false, onPressed: app.leaveMap),
        ]),
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
        child: Panel(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          child: Row(children: [
            Expanded(child: Text('${c.totalStars} ★', style: display(22, color: C.brass))),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text.rich(TextSpan(children: [
                TextSpan(text: '❤' * c.lives, style: const TextStyle(color: Color(0xFFE0533F), fontSize: 18)),
                TextSpan(text: '♡' * (maxLives - c.lives), style: const TextStyle(color: C.creamDim, fontSize: 18)),
              ])),
              Text(app.lifeTimerText, style: const TextStyle(fontSize: 11, color: C.creamDim)),
            ]),
          ]),
        ),
      ),
      Expanded(
        child: LayoutBuilder(builder: (ctx, bc) {
          _scrollToNext(bc.maxHeight);
          final w = bc.maxWidth;
          final pts = [for (var i = 0; i < levels.length; i++) Offset(_nodeX[i % _nodeX.length] / 100 * w, _top + i * _gap)];
          return ClipRect(
            child: SingleChildScrollView(
              controller: _scroll,
              padding: const EdgeInsets.only(bottom: 40),
              child: SizedBox(
                height: height,
                child: Stack(clipBehavior: Clip.none, children: [
                  Positioned.fill(
                    child: Opacity(
                      opacity: .55,
                      child: Image.asset('assets/bg/map-bg.jpg', fit: BoxFit.cover, repeat: ImageRepeat.repeatY),
                    ),
                  ),
                  Positioned.fill(child: CustomPaint(painter: _RoadPainter(pts, c.level))),
                  for (var z = 0; z * 10 < levels.length; z++)
                    Positioned(
                      top: pts[z * 10].dy - _gap / 2 + 6,
                      left: 0,
                      right: 0,
                      child: Center(
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 3),
                          decoration: BoxDecoration(
                              color: const Color(0x99000000), borderRadius: BorderRadius.circular(999)),
                          child: Text(mapZones[z % mapZones.length].name.toUpperCase(),
                              style: display(13,
                                      color: levels[z * 10].id <= c.level + 9 ? C.cream : C.creamDim.withValues(alpha: .5))
                                  .copyWith(letterSpacing: 1.5)),
                        ),
                      ),
                    ),
                  for (var i = 0; i < levels.length; i++) _node(app, levels[i], pts[i]),
                ]),
              ),
            ),
          );
        }),
      ),
    ]);
  }

  Widget _node(App app, Level lv, Offset p) {
    final c = app.campaign;
    final stars = c.stars[lv.id] ?? 0;
    final unlocked = lv.id <= c.level;
    final done = stars > 0;
    final isNext = lv.id == c.level && !done;
    final String tile;
    if (!unlocked) {
      tile = 'locked';
    } else if (done) {
      tile = 'cloud';
    } else if (lv.id % 10 == 0) {
      tile = 'dragon';
    } else if (lv.type == 'ai') {
      tile = 'battle';
    } else if (lv.type == 'bestRound') {
      tile = 'reward';
    } else {
      tile = 'blank';
    }
    const size = 68.0;
    return Positioned(
      left: p.dx - size / 2,
      top: p.dy - size / 2,
      width: size,
      height: size + 16,
      child: Semantics(
        button: true,
        label: 'Level ${lv.id}: ${lv.name}',
        child: GestureDetector(
          onTap: unlocked ? () => app.openLevel(lv.id) : null,
          child: Column(children: [
            SizedBox(
              width: size,
              height: size,
              child: Stack(alignment: Alignment.center, clipBehavior: Clip.none, children: [
                if (isNext) _Ping(reduce: app.reduceMotion),
                Opacity(
                  opacity: unlocked ? 1 : .55,
                  child: Image.asset('assets/tiles/$tile.webp', width: size, height: size, fit: BoxFit.contain),
                ),
                Positioned(
                  bottom: 10,
                  child: Text('${lv.id}',
                      style: display(15, color: Colors.white, weight: FontWeight.w700).copyWith(
                          shadows: const [Shadow(color: Colors.black, blurRadius: 4)])),
                ),
              ]),
            ),
            if (done)
              Text.rich(TextSpan(children: [
                TextSpan(text: '★' * stars, style: const TextStyle(color: C.brass)),
                TextSpan(text: '★' * (3 - stars), style: const TextStyle(color: Color(0x55FFFFFF))),
              ]), style: const TextStyle(fontSize: 11, height: 1)),
          ]),
        ),
      ),
    );
  }
}

class _Ping extends StatefulWidget {
  final bool reduce;
  const _Ping({required this.reduce});
  @override
  State<_Ping> createState() => _PingState();
}

class _PingState extends State<_Ping> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1600));
  @override
  void initState() {
    super.initState();
    if (!widget.reduce) _c.repeat();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _c,
        builder: (_, _) {
          final t = widget.reduce ? .3 : _c.value;
          return Container(
            width: 60 + 30 * t,
            height: 60 + 30 * t,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: C.brass.withValues(alpha: (1 - t) * .9), width: 3),
            ),
          );
        },
      );
}

class _RoadPainter extends CustomPainter {
  final List<Offset> pts;
  final int level;
  _RoadPainter(this.pts, this.level);

  Path _road(int upTo) {
    final path = Path()..moveTo(pts[0].dx, pts[0].dy);
    for (var i = 1; i <= upTo && i < pts.length; i++) {
      final prev = pts[i - 1], cur = pts[i];
      final my = (prev.dy + cur.dy) / 2;
      // SVG "Q prev.x,my mid,my T cur" — the T control point reflects to (cur.x, my).
      path.quadraticBezierTo(prev.dx, my, (prev.dx + cur.dx) / 2, my);
      path.quadraticBezierTo(cur.dx, my, cur.dx, cur.dy);
    }
    return path;
  }

  @override
  void paint(Canvas canvas, Size size) {
    // zone bands
    for (var z = 0; z * 10 < pts.length; z++) {
      final first = z * 10, last = (first + 9).clamp(0, pts.length - 1);
      final y0 = pts[first].dy - _gap / 2, y1 = pts[last].dy + _gap / 2;
      final reached = first + 1 <= level + 9;
      canvas.drawRect(Rect.fromLTRB(0, y0, size.width, y1),
          Paint()..color = mapZones[z % mapZones.length].color.withValues(alpha: reached ? .45 : .7));
    }
    final full = _road(pts.length - 1);
    final stroke = Paint()
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    canvas.drawPath(full, stroke..color = const Color(0xFF3A2A18)..strokeWidth = 26);
    canvas.drawPath(
        full,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeCap = StrokeCap.round
          ..strokeWidth = 20
          ..shader = const LinearGradient(colors: [Color(0xFF7C6A48), Color(0xFFD9C7A0), Color(0xFF7C6A48)])
              .createShader(Rect.fromLTWH(0, 0, size.width, size.height)));
    // dashed centre line
    final dash = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round
      ..color = const Color(0x80FFFFFF);
    for (final m in full.computeMetrics()) {
      for (var d = 0.0; d < m.length; d += 18) {
        canvas.drawPath(m.extractPath(d, d + 6), dash);
      }
    }
    // gold progress overlay up to the current level
    final idx = (level.clamp(1, pts.length)) - 1;
    if (idx > 0) {
      canvas.drawPath(
          _road(idx),
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeCap = StrokeCap.round
            ..strokeWidth = 6
            ..color = C.brass.withValues(alpha: .85));
    }
  }

  @override
  bool shouldRepaint(_RoadPainter old) => old.level != level || old.pts.first != pts.first;
}
