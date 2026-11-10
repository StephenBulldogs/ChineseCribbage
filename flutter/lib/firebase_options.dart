// Firebase configuration for the `chinese-cribbage` project — the same
// project the website uses, so app and browser players share rooms,
// accounts, friends and leaderboards.
//
// Values come from the Android and iOS apps registered in the Firebase
// console (android/app/google-services.json and
// ios/Runner/GoogleService-Info.plist). Like the web apiKey in index.html,
// these are public identifiers; security comes from the database rules.
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
    apiKey: 'AIzaSyC3Pk5odlH9jgDB54cMNiMssDrfWEHyW2w',
    appId: '1:726195341835:android:975d071c537a6aadc2150e',
    messagingSenderId: '726195341835',
    projectId: 'chinese-cribbage',
    databaseURL: 'https://chinese-cribbage-default-rtdb.firebaseio.com',
    storageBucket: 'chinese-cribbage.firebasestorage.app',
  );

  static const ios = FirebaseOptions(
    apiKey: 'AIzaSyBPhFKW24LEsy677Htz48Sbp6wZ89vIdRk',
    appId: '1:726195341835:ios:33ee90d66a76556cc2150e',
    messagingSenderId: '726195341835',
    projectId: 'chinese-cribbage',
    databaseURL: 'https://chinese-cribbage-default-rtdb.firebaseio.com',
    storageBucket: 'chinese-cribbage.firebasestorage.app',
    iosClientId: '726195341835-8a9v55c4rplu0p91ve5t4kfusuekgimk.apps.googleusercontent.com',
    iosBundleId: 'com.chinesecribbage.chineseCribbage',
  );

  /// False if the values above are ever reset to placeholders.
  static bool get isConfigured {
    try {
      final o = currentPlatform;
      return !o.appId.startsWith('REPLACE') && !o.apiKey.startsWith('REPLACE');
    } catch (_) {
      return false;
    }
  }
}
