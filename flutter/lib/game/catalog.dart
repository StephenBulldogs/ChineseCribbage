// Static game data ported from ui.js: Conquest levels, zones, banners,
// card-back and face-deck designs, XP and shop constants.
import 'dart:math' as math;
import 'package:flutter/material.dart';

const rowLabels = ['Hand 1', 'Hand 2', 'Hand 3', 'Hand 4', 'Crib'];
const aiNames = {'easy': 'Deckhand', 'medium': 'Navigator', 'hard': 'Captain'};

const adminEmail = 'sschwender@gmail.com';

/// Hosted with the website on GitHub Pages (privacy.html in the repo root).
const privacyPolicyUrl = 'https://stephenbulldogs.github.io/ChineseCribbage/privacy.html';

// Online seat takeover / idle expiry.
const takeoverMs = 120000;
const expireMs = 72 * 60 * 60 * 1000;

// Coins & shop
const shopPremiumCost = 1000;
const shopLifeCost = 20;

// Lives
const maxLives = 5;
const standardLifeMs = 30 * 60 * 1000;
const premiumLifeMs = 15 * 60 * 1000;

// XP
const xpMatchWin = 100, xpMatchTie = 40, xpMatchLoss = 20, xpConquestRepeat = 10;
int conquestClearXp(int stars) => 50 + 15 * stars;

class XpLevel {
  final int level, into, need;
  const XpLevel(this.level, this.into, this.need);
}

XpLevel levelFromXp(num? xp) {
  var level = 1, need = 100;
  var x = (xp ?? 0).toInt();
  while (x >= need) {
    x -= need;
    level++;
    need = 100 * level;
  }
  return XpLevel(level, x, need);
}

typedef Need = bool Function(int level, int stars);

class Design {
  final String id, name;
  final Need need;
  final String needText;
  const Design(this.id, this.name, this.need, [this.needText = '']);
}

bool _always(int l, int s) => true;

final cardDesigns = <Design>[
  const Design('classic', 'Classic Cream', _always),
  Design('jade', 'Jade Garden', (l, s) => l >= 2, 'player level 2'),
  Design('lacquer', 'Red Lacquer Imperial', (l, s) => l >= 4, 'player level 4'),
  Design('bamboo', 'Bamboo Minimalist', (l, s) => s >= 15, '15 Conquest stars'),
  Design('porcelain', 'Porcelain Blue & White', (l, s) => s >= 40, '40 Conquest stars'),
  Design('dragon', 'Gold Dragon Ornate', (l, s) => l >= 10, 'player level 10'),
  Design('night', 'Dark Night Tournament', (l, s) => s >= 90, '90 Conquest stars'),
];

final faceDeckDesigns = <Design>[
  const Design('none', 'Standard Faces', _always),
  Design('imperial', 'Imperial Ink', (l, s) => l >= 3, 'player level 3'),
  Design('dragonbrush', 'Dragon Brush', (l, s) => s >= 25, '25 Conquest stars'),
  Design('jadeporc', 'Jade Porcelain', (l, s) => l >= 8 && s >= 50, 'player level 8 + 50 stars'),
];

class ProfileBanner {
  final String id, name;
  final List<Color> colors;
  final Need need;
  final String needText;
  const ProfileBanner(this.id, this.name, this.colors, this.need, this.needText);
  Gradient get gradient => LinearGradient(
      colors: colors,
      begin: Alignment.centerLeft,
      end: Alignment.centerRight,
      transform: const GradientRotation(math.pi / 18));
}

final banners = <ProfileBanner>[
  const ProfileBanner('lacquer', 'Lacquer', [Color(0xFF41221C), Color(0xFF2B1714)], _always, 'default'),
  ProfileBanner('jade', 'Jade tide', const [Color(0xFF2C6557), Color(0xFF1D4A3F)], (l, s) => l >= 3, 'player level 3'),
  ProfileBanner('wave', 'Gold wave', const [Color(0xFF8A6F1F), Color(0xFF41221C)], (l, s) => l >= 5, 'player level 5'),
  ProfileBanner('blossom', 'Plum blossom', const [Color(0xFFB5402F), Color(0xFF6E2018)], (l, s) => l >= 8, 'player level 8'),
  ProfileBanner('lantern', 'Lantern glow', const [Color(0xFFC9A227), Color(0xFFB5402F)], (l, s) => l >= 12, 'player level 12'),
  ProfileBanner('bamboo', 'Bamboo grove', const [Color(0xFF3E8E7E), Color(0xFF8A6F1F)], (l, s) => s >= 10, '10 Conquest stars'),
  ProfileBanner('cloud', 'Gold cloud', const [Color(0xFFC9A227), Color(0xFF7A86B8)], (l, s) => s >= 30, '30 Conquest stars'),
  ProfileBanner('cloud2', 'Twin clouds', const [Color(0xFF7A86B8), Color(0xFF3E8E7E)], (l, s) => s >= 60, '60 Conquest stars'),
  ProfileBanner('dragon', 'Dragon', const [Color(0xFFB5402F), Color(0xFFC9A227), Color(0xFF3E8E7E)], (l, s) => s >= 120, '120 Conquest stars'),
  ProfileBanner('phoenix', 'Phoenix', const [Color(0xFFC9A227), Color(0xFFB5402F), Color(0xFFC9A227)], (l, s) => s >= 200, '200 Conquest stars'),
];

ProfileBanner bannerById(String? id) =>
    banners.firstWhere((b) => b.id == id, orElse: () => banners.first);
Design cardDesignById(String? id) =>
    cardDesigns.firstWhere((d) => d.id == id, orElse: () => cardDesigns.first);

// --- Conquest levels ---
class AiOpp {
  final String difficulty;
  final int handicap;
  const AiOpp(this.difficulty, this.handicap);
}

class Level {
  final int id;
  final String type; // solo | bestRound | ai
  final String name, desc;
  final int? target, rounds, score;
  final List<AiOpp> ais;
  const Level(
      {required this.id,
      required this.type,
      required this.name,
      required this.desc,
      this.target,
      this.rounds,
      this.score,
      this.ais = const []});
}

List<Level> _genLevels() {
  const soloNames = ['First steps', 'Finding the fives', 'Tighter now', 'Four to shore', 'Three to shore', 'No slack',
    'Quick current', 'Steady hands', 'The short race', 'Down to the wire', 'Cutting it close', 'Sprint', 'Low tide', 'Riptide'];
  const bestNames = ['One good deal', 'Forty or nothing', 'High tide', 'Half a hundred', 'Stacked deck', 'The legend hand',
    'Perfect storm', 'Golden hand', 'Treasure deal', 'Royal flush dreams', 'The big one', 'Jackpot', 'Master stroke'];
  const aiLevelNames = ['The Deckhand', 'Head start', 'The Navigator', 'Uphill water', 'Ten behind', 'The Captain', 'Rough seas',
    'Taking on water', 'Fifteen down', 'Twenty down', 'Two on one', 'The gauntlet', 'Triple threat', 'The admiralty',
    "The Captain's table", 'Storm of three', 'The whole crew', 'Final reckoning'];
  final out = <Level>[];
  var si = 0, bi = 0, ai = 0;
  for (var id = 1; id <= 100; id++) {
    final tier = id <= 10 ? 0 : id <= 25 ? 1 : id <= 45 ? 2 : id <= 70 ? 3 : 4;
    final cyc = id % 5;
    if (cyc == 1 || cyc == 3) {
      final target = const [29, 29, 40, 45, 50][tier];
      final rounds = math.max(2, const [7, 6, 6, 5, 5][tier] - ((id - 1) ~/ 20));
      out.add(Level(id: id, type: 'solo', target: target, rounds: rounds,
          name: soloNames[si++ % soloNames.length],
          desc: 'Reach $target total within $rounds rounds.'));
    } else if (cyc == 0) {
      final score = const [33, 38, 44, 52, 60][tier] + ((id - 1) ~/ 25) * 4;
      final rounds = const [5, 5, 5, 6, 6][tier];
      out.add(Level(id: id, type: 'bestRound', score: score, rounds: rounds,
          name: bestNames[bi++ % bestNames.length],
          desc: 'Score $score+ in a single round. $rounds rounds to do it.'));
    } else {
      final diff = const ['easy', 'easy', 'medium', 'hard', 'hard'][tier];
      final nOpp = tier >= 4 ? 3 : tier >= 2 ? (id.isOdd ? 2 : 1) : 1;
      final baseH = const [0, 5, 5, 10, 12][tier] + ((id - 1) ~/ 15) * 2;
      final target = tier >= 3 ? 35 : 29;
      final ais = [for (var o = 0; o < nOpp; o++) AiOpp(diff, baseH + o * 3)];
      final oppLabel = nOpp == 1 ? 'the ${aiNames[diff]}' : '$nOpp ${aiNames[diff]}s';
      out.add(Level(id: id, type: 'ai', target: target, ais: ais,
          name: aiLevelNames[ai++ % aiLevelNames.length] + (id > 18 ? ' ${(id / 18).ceil()}' : ''),
          desc: 'Race to $target. Beat $oppLabel${baseH > 0 ? ' (they start +$baseH+)' : ''}.'));
    }
  }
  return out;
}

final levels = _genLevels();
Level? levelById(int id) {
  for (final l in levels) {
    if (l.id == id) return l;
  }
  return null;
}

class Zone {
  final String name;
  final Color color;
  const Zone(this.name, this.color);
}

const mapZones = [
  Zone('Bamboo Vale', Color(0xFF3F5A32)),
  Zone('Jade Cliffs', Color(0xFF1F5A4D)),
  Zone('Lantern Town', Color(0xFF7A3322)),
  Zone('Misty Range', Color(0xFF4A5560)),
  Zone('Autumn Maples', Color(0xFF8A4A1F)),
  Zone('Lotus Waters', Color(0xFF2F6A72)),
  Zone('Stone Pass', Color(0xFF5C5446)),
  Zone('Snow Peaks', Color(0xFF7D8A99)),
  Zone('Imperial Road', Color(0xFF6E2630)),
  Zone('Dragon Summit', Color(0xFF7A5A12)),
];

// Solo & bestRound: 3 stars if you beat the deadline by 2+ rounds,
// 2 stars with 1 round to spare, 1 star on the final allowed round.
int challengeStarsByRounds(Level lv, int roundsUsed) {
  final spare = lv.rounds! - roundsUsed;
  return spare >= 2 ? 3 : spare == 1 ? 2 : 1;
}

// AI duels: 1-3 rounds = 3 stars, 4-5 = 2 stars, 6+ = 1 star.
int challengeStarsByPace(int roundsUsed) =>
    roundsUsed <= 3 ? 3 : roundsUsed <= 5 ? 2 : 1;

const statLabels = [
  ['currentGames', 'Current games'], ['wins', 'Wins'], ['losses', 'Losses'], ['ties', 'Ties'],
  ['gamesPlayed', 'Games played'], ['highestHand', 'Highest hand'], ['highestTotal', 'Highest total'],
  ['fastestWin', 'Fastest win'], ['longestGame', 'Longest game'],
];

Map<String, dynamic> blankStats() => {
      'wins': 0, 'losses': 0, 'ties': 0, 'gamesPlayed': 0,
      'highestHand': 0, 'highestTotal': 0, 'fastestWin': 0, 'longestGame': 0,
    };

const codeAlphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
final _r = math.Random();
String randomCode(int n) =>
    List.generate(n, (_) => codeAlphabet[_r.nextInt(codeAlphabet.length)]).join();
String makeRoomCode() => randomCode(5);
String makeFriendCode() => randomCode(6);
