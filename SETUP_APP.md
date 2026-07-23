# Building the Android & iOS apps

This branch (`claude/native-app-shell`) packages the same self-contained
`index.html` from the website branch as installable Android and iOS apps,
using [Capacitor](https://capacitorjs.com/) as a native WebView shell. No
game logic was rewritten: `engine.js`, `ui.js`, `online.js`, `facedecks.js`
and their Node test suites stay exactly as they are on the website branch,
kept here purely for reference/tests — the actual runtime code is still the
inline `<script>` blocks in `index.html`.

```
package.json            npm scripts + Capacitor dependencies
capacitor.config.json   app id / name / webDir
scripts/copy-web.js     copies index.html -> www/ (the Capacitor webDir)
www/                    generated, gitignored — do not edit by hand
android/                native Android Studio project (generated, committed)
ios/                    native Xcode project (generated, committed)
```

## Prerequisites

- **Node.js** 18+ and npm (already used by the test suites).
- **Android builds:** [Android Studio](https://developer.android.com/studio)
  (bundles the Android SDK) and a JDK 17. Run everything from Android
  Studio's "SDK Manager" once to install platform tools.
- **iOS builds:** a Mac with **Xcode** (latest stable) and
  [CocoaPods](https://cocoapods.org/) (`sudo gem install cocoapods`). Xcode
  projects cannot be built or signed on Linux/Windows — this is an Apple
  requirement, not a project limitation.

## First-time setup

```bash
npm install          # installs @capacitor/core, cli, android, ios
npm run build:www    # copies index.html into www/
npx cap sync         # pushes www/ into android/ and ios/ and installs plugins
```

(`android/` and `ios/` are already generated and committed in this branch,
so `cap sync` is what you run after pulling — `cap add <platform>` is only
needed if a platform folder is ever deleted and needs regenerating.)

## Running during development

```bash
npm run android      # npm run sync, then opens the project in Android Studio
npm run ios          # npm run sync, then opens the project in Xcode
```

From there, press Run in Android Studio / Xcode with an emulator, simulator,
or a plugged-in device selected, same as any native project.

Whenever you change `index.html` (or pull a change to it from the website
branch), re-run `npm run sync` before rebuilding so the native shells pick up
the new copy.

## App icons & splash screen

No branded icon/splash source art exists yet — Android Studio / Xcode ship
with Capacitor's default placeholder icon. To generate real ones from a
1024×1024 source PNG:

```bash
npm install -D @capacitor/assets
npx capacitor-assets generate --iconBackgroundColor '#0b1f17' --splashBackgroundColor '#0b1f17'
```

This reads `resources/icon.png` and `resources/splash.png` (create the
`resources/` folder first) and writes every required density into
`android/` and `ios/` automatically.

## Signing & store submission

- **Android:** generate a release keystore (`keytool -genkey -v -keystore
  release.keystore -alias chinese-cribbage -keyalg RSA -keysize 2048
  -validity 10000`), wire it into `android/app/build.gradle` under
  `signingConfigs`, then `./gradlew bundleRelease` from `android/` to produce
  an `.aab` for the Play Console. Keep the keystore and its password out of
  git.
- **iOS:** create an App ID + provisioning profile in the Apple Developer
  portal matching `capacitor.config.json`'s `appId`
  (`com.stephenbulldogs.chinesecribbage`), set your Team in Xcode's Signing &
  Capabilities tab, then Product → Archive to upload to App Store Connect.

## Known gaps before a store-ready build

These are pre-existing behaviors of the website that need attention because
they don't translate cleanly into a native WebView, not new bugs introduced
by this branch:

1. **Google sign-in.** `index.html` calls
   `firebase.auth().signInWithPopup(...)`. Popup-based OAuth is blocked by
   Google inside embedded/native WebViews (`disallowed_useragent`), so this
   will fail as-is in the packaged app. Swap it for native sign-in via the
   [`@capacitor-firebase/authentication`](https://github.com/capawesome-team/capacitor-firebase)
   plugin (or `@capacitor/browser` + a custom redirect handler) before
   shipping — guest sign-in is unaffected and works today.
2. **Firebase authorized domains / SHA fingerprints.** Add the app's
   Android package name + SHA-1/SHA-256 signing fingerprints, and the iOS
   bundle ID, to the Firebase project (`chinese-cribbage`) under
   Authentication settings once you have real signing credentials — native
   Google Sign-In plugins need these to work, same as the "Authorized
   domains" step already documented for the website.
3. **App icons/splash** are placeholders until real artwork is generated
   (see above).
4. **Back button (Android):** Capacitor's hardware back button by default
   exits the WebView's history stack; verify it feels right against the
   in-app modals/dialogs (how-to-play, settings, profile) and wire
   `App.addListener('backButton', ...)` if a custom handler is needed.

## Keeping this branch in sync with the website branch

The website branch is the source of truth for `index.html` and the game
logic. When it changes, merge those commits into this branch and re-run
`npm run sync` — this branch should never fork the actual game code, only
the native wrapper around it.
