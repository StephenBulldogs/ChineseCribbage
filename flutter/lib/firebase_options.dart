// Firebase configuration for the `chinese-cribbage` project — the same
// project the website uses, so app and browser players share rooms,
// accounts, friends and leaderboards.
//
// ⚠️  The Android and iOS app IDs below are placeholders. Register the apps
// in the Firebase console and regenerate this file with:
//
//     dart pub global activate flutterfire_cli
//     flutterfire configure --project=chinese-cribbage --platforms=android,ios
//
// That overwrites this file with real values and drops
// android/app/google-services.json + ios/Runner/GoogleService-Info.plist.
// Until then the app runs fully offline, and the Online section shows the
// one-time setup notice (exactly like the website does with no config).
import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, TargetPlatform;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        return ios;
      default:
        throw UnsupportedError('Only Android and iOS are configured.');
    }
  }

  static const android = FirebaseOptions(
    apiKey: 'REPLACE_WITH_ANDROID_API_KEY',
    appId: 'REPLACE_WITH_ANDROID_APP_ID',
    messagingSenderId: '726195341835',
    projectId: 'chinese-cribbage',
    databaseURL: 'https://chinese-cribbage-default-rtdb.firebaseio.com',
    storageBucket: 'chinese-cribbage.firebasestorage.app',
  );

  static const ios = FirebaseOptions(
    apiKey: 'REPLACE_WITH_IOS_API_KEY',
    appId: 'REPLACE_WITH_IOS_APP_ID',
    messagingSenderId: '726195341835',
    projectId: 'chinese-cribbage',
    databaseURL: 'https://chinese-cribbage-default-rtdb.firebaseio.com',
    storageBucket: 'chinese-cribbage.firebasestorage.app',
    iosBundleId: 'com.chinesecribbage.chineseCribbage',
  );

  /// False while the placeholders above are still in place.
  static bool get isConfigured {
    try {
      final o = currentPlatform;
      return !o.appId.startsWith('REPLACE') && !o.apiKey.startsWith('REPLACE');
    } catch (_) {
      return false;
    }
  }
}
