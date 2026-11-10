# Chinese Cribbage — Android & iOS (Flutter)

A Flutter/Dart port of the web game in the repo root, for **Android and iOS**.
The website is untouched and still deploys from `index.html`; there is no
Flutter web build.

## What's in the app

Everything the website has:

- **Offline:** Solo run, Versus AI (easy / medium / hard Monte Carlo), Pass & play for 2–4 players with handoff screens.
- **The count:** an animated walk through every fifteen, pair, run, flush, nobs and his heels, plus a skippable callout and the score sheet.
- **Online tables:** 2–4 seats, AI seat-fillers played by the host, public/private rooms, live spectating, held seats with a 2-minute reclaim, seat takeover, forfeit, and auto-close after 72 h idle.
- **Accounts:** Google sign-in or one-tap guest, profile stats, XP and levels, banners, card backs, illustrated face decks, friends (codes, presence, challenges), messages, and global/friends leaderboards.
- **Conquest:** the 100-level campaign map with terrain zones, a winding road and tile art, plus stars, hearts with timed regrow, resume-after-close snapshots, and next/retry.
- **Coins, Shop & Premium**, plus the email-gated **Admin panel**.

### Cross-play with the website

The engine (`lib/engine/engine.dart`) is a bit-exact port of `engine.js`:
Mulberry32 + Fisher–Yates over the same deck order. The same seed deals the same
cards, and the AI picks the same rows. The tests check this against values
generated from `engine.js`. The app reads and writes the same Firebase
Realtime Database paths (`rooms/`, `publicRooms/`, `users/`, `friendCodes/`,
`leaderboard/`) in the same shapes. So a phone and a browser can sit at the same
table, and an account carries its progress, coins and friends across both.

## Layout

```
lib/
  engine/engine.dart       game rules, scoring, deal, AI (port of engine.js)
  game/catalog.dart        levels, zones, banners, card designs, XP/shop constants
  app/controller.dart      app state (the web's `S`), local games, the count
  app/conquest.dart        campaign, lives, snapshots, challenge flow
  app/account.dart         sign-in, profile, XP, coins, shop, admin, friends, boards
  app/online.dart          room protocol: create/join/rejoin, presence, host AI, spectating
  app/json.dart            Realtime Database value helpers
  screens/                 shell (app bar + tabs), home, game, online, map, friends/messages, dialogs
  widgets/board.dart       cards, peg rail, hand rows, count callout
assets/                    card backs, face decks (156 cards), map tiles, backgrounds
                           (extracted from the data URIs embedded in index.html / facedecks.js)
test/                      engine + cross-engine vectors, data helpers, widget flow tests
```

## Run it

```bash
cd flutter
flutter pub get
flutter run            # pick an Android emulator/device or iOS simulator
flutter test
```

Offline modes work immediately. **Online play needs the one-time Firebase step below.**
Until then, tapping *Online play* shows the setup notice, the same way the website
does without a config.

## One-time Firebase setup (online play)

The app uses the website's existing `chinese-cribbage` Firebase project. It just
needs the Android and iOS apps registered in it:

```bash
dart pub global activate flutterfire_cli
```

```bash
cd flutter && flutterfire configure --project=chinese-cribbage --platforms=android,ios
```

This registers the apps (Android package `com.chinesecribbage.chinese_cribbage`,
iOS bundle `com.chinesecribbage.chineseCribbage`). It also overwrites
`lib/firebase_options.dart` with real keys, and adds
`android/app/google-services.json` and `ios/Runner/GoogleService-Info.plist`.
Nothing else in the code changes.

For **Google sign-in** (Authentication → Sign-in method → Google is already
enabled for the website):

- **Android:** in Firebase console → Project settings → your Android app, add the
  SHA-1 and SHA-256 of your signing key. For the debug key, run
  `cd android && ./gradlew signingReport`.
- **iOS:** add the *Encoded App ID* from Project settings → your iOS app as a URL
  scheme. In Xcode, that's Runner → Info → URL Types.

Guest play needs no extra setup. Guests only use the Realtime Database, same as on the web.
The database rules in the root README apply unchanged.

## Notes and differences from the web

- Keyboard 1–4 placement works with a hardware keyboard. On a touchscreen you tap a hand.
- Android's back button walks back through panels. In a game or at a table it asks
  first, because quitting a Conquest level costs a life, same as the web's ✕.
- On the web, the Conquest *Resume* button only shows for guests. In the app, a
  signed-in player with a level in progress also gets *Resume* from the hub's
  Conquest card.
- The trust model is the same as the website's: client-side admin gate, open
  database rules, and casual-mode seeds in the live move log. See *Honest limits*
  in the root README.
