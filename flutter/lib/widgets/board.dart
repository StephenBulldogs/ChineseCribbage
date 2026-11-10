import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../app/controller.dart';
import '../engine/engine.dart' as e;
import '../game/catalog.dart';
import '../theme.dart';

/// One playing card: face (text pips or illustrated deck), or a themed back.
class CardView extends StatelessWidget {
  final e.PlayingCard? card;
  final double width;
  final bool faceDown, glow, animate;
  final String backDesign; // classic | jade | ...
  final String faceDeck; // none | imperial | ...
  const CardView({
    super.key,
    required this.card,
    required this.width,
    this.faceDown = false,
    this.glow = false,
    this.animate = false,
    this.backDesign = 'classic',
    this.faceDeck = 'none',
  });

  @override
  Widget build(BuildContext context) {
    final h = width * 134 / 96;
    final radius = BorderRadius.circular(width * .085);
    Widget body;
    if (faceDown || card == null) {
      body = backDesign == 'classic'
          ? Container(
              decoration: BoxDecoration(color: C.brassDim, borderRadius: radius),
              padding: EdgeInsets.all(width * .05),
              child: Container(
                decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(width * .06),
                    border: Border.all(color: C.cream.withValues(alpha: .33), width: 2)),
              ),
            )
          : ClipRRect(
              borderRadius: radius,
              child: Image.asset('assets/backs/$backDesign.webp', fit: BoxFit.cover, width: width, height: h));
    } else if (faceDeck != 'none') {
      body = ClipRRect(
        borderRadius: radius,
        child: Image.asset('assets/faces/$faceDeck/${card!.faceKey}.webp',
            fit: BoxFit.cover, width: width, height: h, gaplessPlayback: true),
      );
    } else {
      final color = card!.isRed ? C.inkRed : C.inkBlack;
      final fs = width * (32 / 96);
      body = Container(
        decoration: BoxDecoration(
            color: C.cream, borderRadius: radius, border: Border.all(color: const Color(0x22000000))),
        child: Stack(children: [
          Positioned(
              top: width * .03,
              left: width * .06,
              child: Text(card!.label,
                  style: TextStyle(color: color, fontSize: fs * .6, fontWeight: FontWeight.w700, height: 1.1))),
          Center(
              child: Text(card!.label,
                  style: TextStyle(color: color, fontSize: fs, fontWeight: FontWeight.w600))),
        ]),
      );
    }
    Widget out = AnimatedContainer(
      duration: const Duration(milliseconds: 220),
      width: width,
      height: h,
      transform: Matrix4.translationValues(0, glow ? -6 : 0, 0),
      decoration: BoxDecoration(
        borderRadius: radius,
        boxShadow: glow
            ? const [
                BoxShadow(color: C.brass, spreadRadius: 3),
                BoxShadow(color: Color(0x99C9A227), blurRadius: 26, offset: Offset(0, 10)),
              ]
            : const [BoxShadow(color: Color(0x55000000), blurRadius: 4, offset: Offset(0, 2))],
      ),
      child: body,
    );
    if (animate) out = _DealIn(key: ValueKey(card?.id ?? 'back'), child: out);
    return out;
  }
}

class _DealIn extends StatelessWidget {
  final Widget child;
  const _DealIn({super.key, required this.child});
  @override
  Widget build(BuildContext context) {
    final reduce = MediaQuery.of(context).disableAnimations;
    if (reduce) return child;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 260),
      curve: Curves.easeOutBack,
      builder: (_, t, c) => Opacity(
        opacity: t.clamp(0, 1),
        child: Transform.translate(offset: Offset(0, (1 - t) * -14), child: Transform.scale(scale: .9 + .1 * t, child: c)),
      ),
      child: child,
    );
  }
}

/// Card using the signed-in player's chosen back + face deck.
class ThemedCard extends StatelessWidget {
  final App app;
  final e.PlayingCard? card;
  final double width;
  final bool faceDown, glow, animate;
  const ThemedCard(this.app, this.card,
      {super.key, required this.width, this.faceDown = false, this.glow = false, this.animate = false});
  @override
  Widget build(BuildContext context) => CardView(
        card: card,
        width: width,
        faceDown: faceDown,
        glow: glow,
        animate: animate,
        backDesign: app.activeCardDesign,
        faceDeck: app.activeFaceDeck,
      );
}

class Lane {
  final String name;
  final int total;
  const Lane(this.name, this.total);
}

/// The peg rail: −15 … 35, with the 29 notch.
class Rail extends StatelessWidget {
  final List<Lane> lanes;
  final int activeIdx;
  final bool reduceMotion;
  const Rail({super.key, required this.lanes, required this.activeIdx, this.reduceMotion = false});

  static const _min = -15.0, _max = 35.0;
  double _pct(num v) => ((math.max(_min, math.min(_max, v.toDouble())) - _min) / (_max - _min));

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 4, bottom: 16),
      child: Column(children: [
        for (var p = 0; p < lanes.length; p++)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Row(children: [
              SizedBox(
                width: 84,
                child: Text(lanes[p].name,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: activeIdx == p ? C.cream : C.creamDim)),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: LayoutBuilder(builder: (ctx, bc) {
                  final w = bc.maxWidth;
                  return SizedBox(
                    height: 20,
                    child: Stack(clipBehavior: Clip.none, alignment: Alignment.centerLeft, children: [
                      Container(
                        height: 14,
                        decoration: BoxDecoration(
                            color: const Color(0xE01C0E0C),
                            borderRadius: BorderRadius.circular(7),
                            border: Border.all(color: C.lacquerEdge)),
                      ),
                      Positioned(
                        left: 0,
                        width: w * _pct(0),
                        top: 3,
                        height: 14,
                        child: Container(
                            decoration: const BoxDecoration(
                                color: Color(0x55000000),
                                borderRadius: BorderRadius.horizontal(left: Radius.circular(7)))),
                      ),
                      Positioned(left: w * _pct(e.target) - 1, top: 0, bottom: 0, width: 2, child: Container(color: C.brass)),
                      AnimatedPositioned(
                        duration: Duration(milliseconds: reduceMotion ? 0 : 600),
                        curve: const Cubic(.2, .8, .3, 1),
                        left: w * _pct(lanes[p].total) - 9,
                        top: 1,
                        child: Container(
                          width: 18,
                          height: 18,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: C.laneColors[p % C.laneColors.length],
                            border: Border.all(color: activeIdx == p ? C.cream : C.lacquerDeep, width: 2),
                          ),
                        ),
                      ),
                    ]),
                  );
                }),
              ),
              const SizedBox(width: 8),
              SizedBox(
                width: 40,
                child: Text('${lanes[p].total}',
                    textAlign: TextAlign.right,
                    style: display(18, color: lanes[p].total < 0 ? C.inkRed : C.cream)),
              ),
            ]),
          ),
        Padding(
          padding: const EdgeInsets.only(left: 92, right: 48),
          child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            const Text('-15', style: TextStyle(fontSize: 10, color: C.creamDim)),
            const Text('0', style: TextStyle(fontSize: 10, color: C.creamDim)),
            Text('${e.target} ★', style: const TextStyle(fontSize: 10, color: C.brass, fontWeight: FontWeight.w700)),
          ]),
        ),
      ]),
    );
  }
}

/// The "draw" panel: a label, a sub-line and the big card.
class DrawPanel extends StatelessWidget {
  final Widget label;
  final String sub;
  final Widget card;
  const DrawPanel({super.key, required this.label, required this.sub, required this.card});
  @override
  Widget build(BuildContext context) => Panel(
        margin: const EdgeInsets.only(bottom: 14),
        padding: const EdgeInsets.all(14),
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              DefaultTextStyle.merge(style: display(18), child: label),
              const SizedBox(height: 4),
              Text(sub, style: const TextStyle(color: C.creamDim, fontSize: 12.5, height: 1.45)),
            ]),
          ),
          const SizedBox(width: 12),
          card,
        ]),
      );
}

class LiveBadge extends StatelessWidget {
  final String text;
  final Color color;
  const LiveBadge(this.text, {super.key, this.color = C.inkRed});
  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(left: 8),
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(4)),
        child: Text(text,
            style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w800, letterSpacing: 1, color: Colors.white)),
      );
}

/// The count's running commentary with a Skip button.
class CountCallout extends StatelessWidget {
  final CountState count;
  final VoidCallback onSkip;
  const CountCallout({super.key, required this.count, required this.onSkip});
  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
            color: const Color(0xEB1C0E0C),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: C.brassDim)),
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(count.label, style: display(24, color: C.brass)),
              if (count.sub.isNotEmpty)
                Text(count.sub, style: const TextStyle(color: C.creamDim, fontSize: 13)),
            ]),
          ),
          GhostButton('Skip', onPressed: onSkip, expand: false, mini: true),
        ]),
      );
}

/// The five rows (four hands + crib). Tapping a placeable hand places.
class RowsView extends StatelessWidget {
  final App app;
  final e.RoundState round;
  final bool Function(int) placeable;
  final List<e.HandScore>? rowScores;
  final CountState? count;
  final void Function(int)? onPlace;
  const RowsView(
      {super.key,
      required this.app,
      required this.round,
      required this.placeable,
      this.rowScores,
      this.count,
      this.onPlace});

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (ctx, bc) {
      // label column 82 + gaps; four cards scale to fit narrow phones.
      final cardW = math.min(58.0, (bc.maxWidth - 24 - 82 - 10 - 3 * 6) / 4);
      return Column(children: [
        for (var i = 0; i < round.rows.length; i++) _row(i, cardW),
      ]);
    });
  }

  Widget _row(int i, double cardW) {
    final cards = round.rows[i];
    final isCrib = i == e.cribRow;
    final canTap = !isCrib && placeable(i);
    final counting = count != null;
    final hideFaces = (isCrib && !round.complete) || (counting && isCrib && !count!.reveal);
    final score = rowScores?[i];
    final isCountRow = counting && count!.row == i;

    Widget? scoreW;
    if (counting) {
      if (i <= count!.row) {
        scoreW = Text('${count!.rowTotals[i]}',
            style: display(22, color: count!.rowTotals[i] == 0 ? C.creamDim : C.cream));
      }
    } else if (score != null) {
      scoreW = Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('${score.total}', style: display(22, color: score.total == 0 ? C.creamDim : C.cream)),
        Text(score.breakdown, style: const TextStyle(fontSize: 10, color: C.creamDim, height: 1.3)),
      ]);
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 9),
      child: Material(
        color: isCountRow ? const Color(0xFF4A2820) : C.rowBg,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(
              color: canTap
                  ? C.brass
                  : (isCrib || isCountRow)
                      ? C.brassDim
                      : Colors.transparent),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: canTap ? () => onPlace?.call(i) : null,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
            child: Row(children: [
              SizedBox(
                width: 82,
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Flexible(
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Text(rowLabels[i].toUpperCase(),
                            style: const TextStyle(
                                fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: .8, color: C.creamDim)),
                      ),
                    ),
                    Container(
                      margin: const EdgeInsets.only(left: 5),
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      decoration: BoxDecoration(
                          border: Border.all(color: C.lacquerEdge), borderRadius: BorderRadius.circular(4)),
                      child: Text(isCrib ? 'auto' : '${i + 1}',
                          style: const TextStyle(fontSize: 9, color: C.creamDim)),
                    ),
                  ]),
                  ?scoreW,
                ]),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Row(mainAxisAlignment: MainAxisAlignment.end, children: [
                  for (var k = 0; k < 4; k++) ...[
                    if (k > 0) const SizedBox(width: 6),
                    k < cards.length
                        ? ThemedCard(app, cards[k],
                            width: cardW,
                            faceDown: hideFaces,
                            animate: k == cards.length - 1,
                            glow: isCountRow && count!.set.contains(k))
                        : Container(
                            width: cardW,
                            height: cardW * 134 / 96,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(cardW * .085),
                              border: Border.all(color: C.lacquerEdge, width: 1.2),
                            ),
                          ),
                  ],
                ]),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}
