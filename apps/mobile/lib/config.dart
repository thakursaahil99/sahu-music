import 'dart:io' show Platform;

/// Build-time configuration, passed with `--dart-define` (see README).
/// Everything is optional: with nothing set the app runs in guest mode on Audius.
class AppConfig {
  static const supabaseUrl = String.fromEnvironment('SUPABASE_URL');

  /// The ANON (public) key only. Never ship a service-role key in an app.
  static const supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');
  static const audiusAppName = String.fromEnvironment('AUDIUS_APP_NAME', defaultValue: 'SAHU_MUSIC');
  static const forceDemo = bool.fromEnvironment('DEMO_MODE');

  /// Free YouTube Data API key: original film songs in YouTube's official player. Optional.
  static const youtubeApiKey = String.fromEnvironment('YOUTUBE_API_KEY');
  static bool get youtubeConfigured => RegExp(r'^[A-Za-z0-9_-]{20,60}$').hasMatch(youtubeApiKey);

  /// Ads are OFF unless explicitly enabled. The app is fully usable without them.
  static const adsEnabled = bool.fromEnvironment('ADS_ENABLED');
  static const _bannerAndroid = String.fromEnvironment('ADMOB_BANNER_ANDROID');
  static const _bannerIos = String.fromEnvironment('ADMOB_BANNER_IOS');

  static bool get supabaseConfigured =>
      supabaseUrl.startsWith('http') && supabaseAnonKey.isNotEmpty && !supabaseAnonKey.startsWith('sb_secret_');

  /// Falls back to Google's public TEST banner units so development never serves live ads.
  static String get bannerUnitId {
    if (Platform.isIOS) return _bannerIos.isNotEmpty ? _bannerIos : 'ca-app-pub-3940256099942544/2934735716';
    return _bannerAndroid.isNotEmpty ? _bannerAndroid : 'ca-app-pub-3940256099942544/6300978111';
  }
}
