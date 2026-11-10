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

Offline and online play both work out of the box. The Android and iOS apps are
registered in the `chinese-cribbage` Firebase project, and their config is in
`lib/firebase_options.dart`, `android/app/google-services.json` and
`ios/Runner/GoogleService-Info.plist`.

## Google sign-in: remaining console steps

Guest play needs nothing more. Google sign-in uses the provider already enabled
for the website, plus:

- **Android:** in Firebase console → Project settings → the Android app, add the
  SHA-1 and SHA-256 of each signing key you use. For the debug key, run
  `cd android && ./gradlew signingReport` (on Windows: `cd android` then `.\gradlew signingReport`).
  Add the release key's fingerprints too before you publish.
- **iOS:** the URL schemes the sign-in flow returns to are already in `ios/Runner/Info.plist`.

If you ever re-register the apps, update the values with
`flutterfire configure --project=chinese-cribbage --platforms=android,ios`
(this needs the Firebase CLI), or paste the new values in by hand.

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
