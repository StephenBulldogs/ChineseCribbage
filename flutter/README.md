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

## Sign-in setup (Firebase console)

Guest play needs nothing more.

- **Google, Android:** Firebase console → ⚙ Project settings → *General* → *Your apps* → the Android app →
  **Add fingerprint**. Add the SHA-1 and SHA-256 of every key that signs the app:
  - your **debug key**, for `flutter run` on your PC (see the Windows commands below);
  - your **upload key** (see *Android signing*);
  - Google Play's **app signing key**, after your first upload (Play Console → *Setup → App signing*).
- **Google, iOS:** nothing more. The URL schemes are already in `ios/Runner/Info.plist`.
- **Apple (iOS):** Firebase console → *Authentication → Sign-in method* → **Add new provider → Apple → Enable**.
  For iOS-only use you can leave the Services ID and key fields empty. The app already has the
  *Sign in with Apple* entitlement (`ios/Runner/Runner.entitlements`). With automatic signing in Xcode,
  the capability is added to your App ID for you.

Getting the debug fingerprint on Windows needs Java, which comes with Android Studio:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
```
```powershell
& "$env:JAVA_HOME\bin\keytool.exe" -list -v -keystore "$env:USERPROFILE\.android\debug.keystore" -alias androiddebugkey -storepass android -keypass android
```

(The debug keystore is created the first time you `flutter run` to an Android device or emulator.)

If you ever re-register the apps, update the values with
`flutterfire configure --project=chinese-cribbage --platforms=android,ios`
(this needs the Firebase CLI), or paste the new values into `lib/firebase_options.dart` by hand.

## Publishing to Google Play and the App Store

### Already done in the code

- [x] **App icon & splash screen.** The icon is generated from the gold dragon tile (`assets/icon/`). To change
      it, replace `assets/icon/icon.png` (1024×1024, no transparency), `icon_foreground.png` (Android
      adaptive icon, artwork inside the middle ~66%) and `splash.png`, then run
      `dart run flutter_launcher_icons` and `dart run flutter_native_splash:create`.
- [x] **Android release signing.** `android/app/build.gradle.kts` reads `android/key.properties`.
      Without it, release builds fall back to the debug key.
- [x] **In-app account deletion.** Settings ⚙ → *Delete account*. Google/Apple users sign in again to confirm.
      It removes `users/{uid}`, the friend code, the leaderboard entry, the user from friends' lists, and the
      Firebase Auth user.
- [x] **Sign in with Apple.** Shown on iOS only, next to Google, as Apple's guideline 4.8 requires.
- [x] **Privacy policy.** `privacy.html` in the repo root, served by GitHub Pages at
      `https://stephenbulldogs.github.io/ChineseCribbage/privacy.html`. Settings ⚙ → *Privacy policy* opens it.
- [x] **Export compliance.** `ITSAppUsesNonExemptEncryption = false` in `Info.plist`, so App Store Connect
      won't ask about encryption on every upload.
- [x] App name "Chinese Cribbage", INTERNET permission, iOS 15 minimum, Android minSdk 24.

### Before either store

- [ ] **Check the privacy policy link works** once this is merged to `main` (open the URL above). GitHub Pages
      must be enabled for the repo: Settings → Pages → Source: *GitHub Actions*. The contact link in it
      points to GitHub Issues, so the repo needs to be public, or change the contact line to an email.
- [ ] **Decide the app IDs for good.** `com.chinesecribbage.chinese_cribbage` (Android) and
      `com.chinesecribbage.chineseCribbage` (iOS) can't change after the first upload. To change them, update
      `applicationId` in `android/app/build.gradle.kts`, `PRODUCT_BUNDLE_IDENTIFIER` in
      `ios/Runner.xcodeproj/project.pbxproj`, register the new IDs in Firebase, and update
      `lib/firebase_options.dart`.
- [ ] **Bump the version** in `pubspec.yaml` for every upload (`version: 1.0.0+1` → `1.0.1+2`; the `+N` must
      always increase).
- [ ] **Harden the database rules** (strongly recommended before a public launch). See *Database rules*
      below.
- [ ] **Take screenshots** on a phone or emulator: home, a hand being played, the count, the Conquest map,
      an online table.

### Android signing (one time)

Create an upload key. Keep the `.jks` file and its passwords safe and backed up; losing them is painful.
On Windows, with `JAVA_HOME` set as above:

```powershell
& "$env:JAVA_HOME\bin\keytool.exe" -genkey -v -keystore "$env:USERPROFILE\upload-keystore.jks" -storetype JKS -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

Then create `flutter/android/key.properties`. It's git-ignored; never commit it.

```properties
storePassword=YOUR_STORE_PASSWORD
keyPassword=YOUR_KEY_PASSWORD
keyAlias=upload
storeFile=C:\\Users\\YOU\\upload-keystore.jks
```

Add the upload key's SHA-1/SHA-256 to Firebase. Get them with the `keytool -list -v` command above, pointed at
`upload-keystore.jks` with alias `upload`.

### Google Play

1. Create a developer account at https://play.google.com/console ($25 once, ID verification).
2. **Create app**, then work through *Dashboard → Set up your app*:
   - **Privacy policy:** the URL above.
   - **App access:** "All functionality is available without special access". Guest play needs no login.
     If asked, mention that Google sign-in is optional.
   - **Ads:** No.
   - **Content rating:** questionnaire, a card game with no gambling for real money. Coins can't be bought.
   - **Target audience:** 13+ (keeps you out of the Families policy).
   - **Data safety:** collects *Name*, *Email address* (optional, sign-in), *User IDs*, and *App activity / in-app
     actions* (game progress). All are used for *App functionality* and *Account management*. Encrypted in
     transit: yes. Users can request deletion: yes, in-app. Not shared with third parties, not sold.
   - **Store listing:** short and full description, 512×512 icon (use `assets/icon/icon.png` resized),
     1024×500 feature graphic, and at least 2 phone screenshots.
3. Build: `flutter build appbundle`, which creates `build/app/outputs/bundle/release/app-release.aab`.
4. **New personal accounts must run a closed test with at least 12 testers for 14 days** before production
   access. Create a *Closed testing* track, upload the `.aab`, and add testers by email (friends and family).
5. After the first upload, copy the **App signing key** SHA-1/SHA-256 (Setup → App signing) into Firebase.
   Without this, Google sign-in fails in the store version.
6. Apply for production, then submit. Review usually takes a few days.

### Apple App Store

1. **You need macOS with Xcode to build iOS.** No Mac? Use a cloud build service such as
   [Codemagic](https://codemagic.io), which builds Flutter iOS apps from this repo and uploads to App
   Store Connect. Its docs cover the signing setup.
2. Join the Apple Developer Program at https://developer.apple.com/programs ($99/year; identity verification
   can take days).
3. Enable **Sign in with Apple** in Firebase (see *Sign-in setup* above).
4. In App Store Connect, **create the app** with bundle ID `com.chinesecribbage.chineseCribbage`, then fill in:
   - screenshots: 6.9" iPhone required (1320×2868 or 1290×2796); add iPad if you keep iPad support;
   - description, keywords, support URL (the GitHub repo or website), privacy policy URL;
   - **App Privacy:** Contact info → Name, Email (linked to user, app functionality); Identifiers →
     User ID; Usage data → Gameplay content/product interaction. No tracking;
   - **Age rating:** questionnaire. Answer "no" to real gambling. Simulated gambling? Cribbage scoring isn't
     gambling, and coins have no cash value;
   - **Review notes:** "Offline modes need no account. Online play offers guest, Google or Apple sign-in.
     Account deletion: Settings → Delete account."
5. On the Mac: `flutter build ipa`, then upload `build/ios/ipa/*.ipa` with the *Transporter* app (or let
   Codemagic do it).
6. Test via **TestFlight**, then **Submit for Review**. Review usually takes 1–3 days.

### Database rules

The rules in the root README are open: any client can write any user's coins, Premium, stats or rooms. That's
fine for friends and family, but on a public store app someone will edit their own coins. Hardening needs
every client to have a Firebase Auth identity, so **guests must switch to Firebase Anonymous Auth on both
the website and the app** first. Today, guests use a locally generated ID with no auth at all. The plan:

1. Firebase console → Authentication → enable **Anonymous**.
2. Website (`ui.js` → `signInGuest`) and app (`lib/app/account.dart` → `signInGuest`): call
   `signInAnonymously()` and use the returned `uid` instead of the random `g…` ID.
3. Then deploy rules along these lines:

```json
{
  "rules": {
    "users": {
      ".read": "auth != null",
      "$uid": {
        ".write": "auth != null && auth.uid === $uid",
        "friends":    { "$fuid": { ".write": "auth != null && (auth.uid === $uid || auth.uid === $fuid)" } },
        "challenges": { "$cid":  { ".write": "auth != null" } }
      }
    },
    "friendCodes": { ".read": "auth != null", "$code": { ".write": "auth != null && (!data.exists() || data.val() === auth.uid)" } },
    "leaderboard": { ".read": true, "$uid": { ".write": "auth != null && auth.uid === $uid" } },
    "rooms":       { "$code": { ".read": "auth != null", ".write": "auth != null" } },
    "publicRooms": { ".read": "auth != null", "$code": { ".write": "auth != null" } }
  }
}
```

That stops strangers editing your account. It doesn't stop a player editing **their own** coins or Premium,
and it would block the admin panel from editing other accounts. Truly locking coins/Premium down needs
Cloud Functions (server code) to handle purchases and admin edits. That's a bigger project; ask when you're
ready.

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
