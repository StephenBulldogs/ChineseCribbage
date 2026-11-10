import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'app/controller.dart';
import 'screens/shell.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(SystemUiOverlayStyle.light);
  final app = App();
  // Offline play never waits on the network; Firebase comes up alongside.
  app.initFirebase();
  runApp(CribbageApp(app: app));
}

class CribbageApp extends StatelessWidget {
  final App app;
  const CribbageApp({super.key, required this.app});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: app,
      builder: (context, _) => MaterialApp(
        title: 'Chinese Cribbage',
        debugShowCheckedModeBanner: false,
        navigatorKey: App.navKey,
        theme: buildTheme(),
        builder: (context, child) {
          final mq = MediaQuery.of(context);
          return MediaQuery(
            data: mq.copyWith(disableAnimations: mq.disableAnimations || app.reduceMotion),
            child: child!,
          );
        },
        home: Shell(app: app),
      ),
    );
  }
}
