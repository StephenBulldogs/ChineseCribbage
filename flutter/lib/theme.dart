import 'package:flutter/material.dart';

/// Palette lifted from the website's CSS custom properties.
class C {
  static const lacquer = Color(0xFF2B1714);
  static const lacquerDeep = Color(0xFF1F100E);
  static const lacquerLight = Color(0xFF41221C);
  static const lacquerEdge = Color(0xFF5A322A);
  static const brass = Color(0xFFC9A227);
  static const brassDim = Color(0xFF8A6F1F);
  static const jade = Color(0xFF3E8E7E);
  static const cream = Color(0xFFF3E9D7);
  static const creamDim = Color(0xFFC9BBA4);
  static const inkBlack = Color(0xFF22201C);
  static const inkRed = Color(0xFFB5402F);
  static const panel = Color(0xD91C0E0C); // rgba(28,14,12,.85)
  static const rowBg = Color(0xDB3A1E19); // rgba(58,30,25,.86)
  static const laneColors = [brass, jade, Color(0xFFB5703A), Color(0xFF7A86B8)];
}

const displayFont = 'Georgia';
const displayFallback = ['serif', 'Times New Roman', 'Noto Serif'];

TextStyle display(double size, {Color color = C.cream, FontWeight? weight}) =>
    TextStyle(
        fontFamily: displayFont,
        fontFamilyFallback: displayFallback,
        fontSize: size,
        color: color,
        fontWeight: weight);

ThemeData buildTheme() {
  final base = ThemeData(
    brightness: Brightness.dark,
    useMaterial3: true,
    scaffoldBackgroundColor: C.lacquer,
    colorScheme: const ColorScheme.dark(
      primary: C.brass,
      onPrimary: C.lacquerDeep,
      secondary: C.jade,
      surface: C.lacquerDeep,
      onSurface: C.cream,
      error: C.inkRed,
    ),
  );
  return base.copyWith(
    textTheme: base.textTheme.apply(bodyColor: C.cream, displayColor: C.cream),
    dialogTheme: const DialogThemeData(
      backgroundColor: C.lacquer,
      shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(18)),
          side: BorderSide(color: C.lacquerEdge)),
    ),
    inputDecorationTheme: InputDecorationTheme(
      isDense: true,
      filled: true,
      fillColor: C.lacquerDeep,
      hintStyle: const TextStyle(color: C.creamDim, fontSize: 14),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: C.lacquerEdge)),
      focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: C.brass)),
    ),
  );
}

/// Pill-shaped primary (brass) button.
class PrimaryButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final bool expand;
  final bool mini;
  const PrimaryButton(this.label,
      {super.key, this.onPressed, this.expand = true, this.mini = false});
  @override
  Widget build(BuildContext context) {
    final b = FilledButton(
      onPressed: onPressed,
      style: FilledButton.styleFrom(
        backgroundColor: C.brass,
        foregroundColor: C.lacquerDeep,
        disabledBackgroundColor: C.brass.withValues(alpha: .4),
        disabledForegroundColor: C.lacquerDeep.withValues(alpha: .7),
        padding: mini
            ? const EdgeInsets.symmetric(horizontal: 12, vertical: 6)
            : const EdgeInsets.symmetric(horizontal: 22, vertical: 13),
        minimumSize: mini ? const Size(0, 30) : null,
        textStyle: TextStyle(
            fontWeight: FontWeight.w700,
            fontSize: mini ? 12 : 14,
            letterSpacing: .3),
        shape: const StadiumBorder(),
      ),
      child: Text(label, textAlign: TextAlign.center),
    );
    return expand ? SizedBox(width: double.infinity, child: b) : b;
  }
}

/// Outlined ghost button.
class GhostButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final bool expand;
  final bool mini;
  const GhostButton(this.label,
      {super.key, this.onPressed, this.expand = true, this.mini = false});
  @override
  Widget build(BuildContext context) {
    final b = OutlinedButton(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        foregroundColor: C.cream,
        side: const BorderSide(color: C.lacquerEdge),
        padding: mini
            ? const EdgeInsets.symmetric(horizontal: 12, vertical: 6)
            : const EdgeInsets.symmetric(horizontal: 22, vertical: 13),
        minimumSize: mini ? const Size(0, 30) : null,
        textStyle: TextStyle(
            fontWeight: FontWeight.w700, fontSize: mini ? 12 : 14),
        shape: const StadiumBorder(),
      ),
      child: Text(label, textAlign: TextAlign.center),
    );
    return expand ? SizedBox(width: double.infinity, child: b) : b;
  }
}

/// Toggle pill (aria-pressed in the web version).
class Pill extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const Pill(this.label,
      {super.key, required this.selected, required this.onTap});
  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
          decoration: BoxDecoration(
            color: selected ? C.brass : Colors.transparent,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: selected ? C.brass : C.lacquerEdge),
          ),
          child: Text(label,
              style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: selected ? C.lacquerDeep : C.creamDim)),
        ),
      );
}

/// Translucent rounded panel (.online-box / .draw in the CSS).
class Panel extends StatelessWidget {
  final Widget child;
  final EdgeInsets padding;
  final Color? border;
  final Color? color;
  final EdgeInsets margin;
  const Panel(
      {super.key,
      required this.child,
      this.padding = const EdgeInsets.all(18),
      this.border,
      this.color,
      this.margin = EdgeInsets.zero});
  @override
  Widget build(BuildContext context) => Container(
        margin: margin,
        padding: padding,
        decoration: BoxDecoration(
          color: color ?? C.panel,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: border ?? C.lacquerEdge),
        ),
        child: child,
      );
}

class Eyebrow extends StatelessWidget {
  final String text;
  const Eyebrow(this.text, {super.key});
  @override
  Widget build(BuildContext context) => Text(text.toUpperCase(),
      style: const TextStyle(
          color: C.brass,
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 2.2));
}

class ErrText extends StatelessWidget {
  final String? text;
  const ErrText(this.text, {super.key});
  @override
  Widget build(BuildContext context) => text == null || text!.isEmpty
      ? const SizedBox.shrink()
      : Padding(
          padding: const EdgeInsets.only(top: 10),
          child: Text(text!,
              style: const TextStyle(color: Color(0xFFE08070), fontSize: 13)),
        );
}

class EmptyNote extends StatelessWidget {
  final String text;
  const EmptyNote(this.text, {super.key});
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 14),
        child: Text(text,
            textAlign: TextAlign.center,
            style: const TextStyle(color: C.creamDim, fontSize: 13)),
      );
}

/// A list row with a title, a dim sub-line and trailing actions (.pub-item).
class ListItem extends StatelessWidget {
  final Widget title;
  final String? sub;
  final List<Widget> actions;
  final Color? border;
  const ListItem(
      {super.key,
      required this.title,
      this.sub,
      this.actions = const [],
      this.border});
  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: C.lacquerDeep.withValues(alpha: .8),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: border ?? C.lacquerEdge),
        ),
        child: Row(children: [
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                DefaultTextStyle.merge(
                    style: const TextStyle(
                        fontWeight: FontWeight.w600, fontSize: 14),
                    child: title),
                if (sub != null)
                  Text(sub!,
                      style:
                          const TextStyle(color: C.creamDim, fontSize: 11.5)),
              ])),
          Wrap(spacing: 6, runSpacing: 6, children: actions),
        ]),
      );
}

/// Gold coin glyph (the SVG coin from the web app bar).
class CoinIcon extends StatelessWidget {
  final double size;
  const CoinIcon({super.key, this.size = 16});
  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: const Color(0xFFD8AF3D),
          shape: BoxShape.circle,
          border: Border.all(color: C.brassDim, width: size / 16),
        ),
        alignment: Alignment.center,
        child: Container(
            width: size * .28, height: size * .28, color: C.lacquerLight),
      );
}
