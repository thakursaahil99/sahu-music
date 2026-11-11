import 'package:flutter/material.dart';

/// Shared SAHU MUSIC design tokens (same values as the website).
class Brand {
  static const name = 'SAHU MUSIC';
  static const tagline = 'Har Gaana, Ek Jagah.';
  static const black = Color(0xFF050505);
  static const charcoal = Color(0xFF141414);
  static const charcoalLight = Color(0xFF1E1E1E);
  static const line = Color(0xFF2A2A2A);
  static const gold = Color(0xFFD7AE55);
  static const goldSoft = Color(0xFFE8C97F);
  static const muted = Color(0xFFA3A3A3);
}

ThemeData buildTheme() {
  const scheme = ColorScheme.dark(
    primary: Brand.gold,
    onPrimary: Brand.black,
    secondary: Brand.goldSoft,
    onSecondary: Brand.black,
    surface: Brand.charcoal,
    onSurface: Colors.white,
    error: Color(0xFFEF4444),
  );
  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    colorScheme: scheme,
    scaffoldBackgroundColor: Brand.black,
    splashFactory: InkRipple.splashFactory,
    appBarTheme: const AppBarTheme(
      backgroundColor: Brand.black,
      foregroundColor: Colors.white,
      elevation: 0,
      scrolledUnderElevation: 0,
      titleTextStyle: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800),
    ),
    cardTheme: CardThemeData(
      color: Brand.charcoal,
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: const Color(0xFF0A0A0A),
      indicatorColor: Brand.gold.withValues(alpha: 0.18),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (s) => TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: s.contains(WidgetState.selected) ? Brand.gold : Colors.white70),
      ),
      iconTheme: WidgetStateProperty.resolveWith(
        (s) => IconThemeData(color: s.contains(WidgetState.selected) ? Brand.gold : Colors.white70),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Brand.charcoalLight,
      hintStyle: const TextStyle(color: Brand.muted),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Brand.line)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Brand.line)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Brand.gold)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: Brand.gold,
        foregroundColor: Brand.black,
        shape: const StadiumBorder(),
        padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
        textStyle: const TextStyle(fontWeight: FontWeight.w800),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: Colors.white,
        side: const BorderSide(color: Brand.line),
        shape: const StadiumBorder(),
        padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
      ),
    ),
    sliderTheme: const SliderThemeData(
      activeTrackColor: Brand.gold,
      inactiveTrackColor: Brand.line,
      thumbColor: Colors.white,
      overlayColor: Color(0x33D7AE55),
      trackHeight: 3,
    ),
    snackBarTheme: const SnackBarThemeData(
      backgroundColor: Brand.gold,
      contentTextStyle: TextStyle(color: Brand.black, fontWeight: FontWeight.w600),
      behavior: SnackBarBehavior.floating,
    ),
    listTileTheme: const ListTileThemeData(iconColor: Colors.white70),
    dividerColor: Brand.line,
  );
}
