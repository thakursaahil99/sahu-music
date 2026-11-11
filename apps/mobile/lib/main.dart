import 'package:audio_service/audio_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'config.dart';
import 'screens/onboarding_auth.dart';
import 'services/audio_handler.dart';
import 'state/app_state.dart';
import 'theme.dart';
import 'widgets.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(SystemUiOverlayStyle.light.copyWith(systemNavigationBarColor: const Color(0xFF0A0A0A)));

  final prefs = await SharedPreferences.getInstance();

  // Optional backend. Without it the app runs in guest mode.
  if (AppConfig.supabaseConfigured) {
    await Supabase.initialize(url: AppConfig.supabaseUrl, publishableKey: AppConfig.supabaseAnonKey);
  }

  // Background playback, media notification and lock-screen controls.
  final handler = await AudioService.init(
    builder: SahuAudioHandler.new,
    config: const AudioServiceConfig(
      androidNotificationChannelId: 'com.sahumusic.sahu_music.playback',
      androidNotificationChannelName: 'SAHU MUSIC playback',
      androidNotificationOngoing: true,
      androidStopForegroundOnPause: true,
    ),
  );

  // Optional ads: only initialised when enabled at build time. Never required.
  if (AppConfig.adsEnabled) {
    MobileAds.instance.initialize().then((_) {}, onError: (_) {});
  }

  final container = ProviderContainer(overrides: [
    prefsProvider.overrideWithValue(prefs),
    audioHandlerProvider.overrideWithValue(handler),
  ]);

  final music = container.read(musicServiceProvider);
  handler
    ..canPlay = ((t) => music.isPlayable(t) && !t.video) // videos play in YouTube's own player screen
    ..onError = ((m) => toast(m, error: true))
    ..onTrackStarted = (t) => container.read(libraryProvider.notifier).addHistory(t);
  loadCatalogueRules(music);

  runApp(UncontrolledProviderScope(container: container, child: const SahuMusicApp()));
}

class SahuMusicApp extends StatelessWidget {
  const SahuMusicApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'SAHU MUSIC',
        debugShowCheckedModeBanner: false,
        scaffoldMessengerKey: messengerKey,
        navigatorKey: navigatorKey,
        theme: buildTheme(),
        home: const RootGate(),
      );
}
