import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config.dart';
import '../theme.dart';
import '../widgets.dart';

/// A newer Android build announced by the website.
class AppUpdate {
  const AppUpdate({required this.version, required this.build, required this.url, this.notes = ''});
  final String version;
  final int build;
  final String url;
  final String notes;
}

/// The website publishes /app-version.json on every deploy (built from apps/mobile/pubspec.yaml):
///   {"android": {"version": "1.0.1", "build": 2, "url": "https://…/download/", "notes": "…"}}
/// Returns the update when that build is newer than [currentBuild].
AppUpdate? parseUpdate(Map<String, dynamic> json, int currentBuild) {
  final a = json['android'];
  if (a is! Map) return null;
  final build = a['build'] is num ? (a['build'] as num).toInt() : int.tryParse('${a['build']}') ?? 0;
  final url = '${a['url'] ?? ''}';
  if (build <= currentBuild || !url.startsWith('https://')) return null;
  return AppUpdate(version: '${a['version'] ?? build}', build: build, url: url, notes: '${a['notes'] ?? ''}');
}

class Updates {
  Updates._();

  static PackageInfo? _info;
  static DateTime _lastCheck = DateTime.fromMillisecondsSinceEpoch(0);
  static bool _dialogOpen = false;

  static Future<PackageInfo> info() async => _info ??= await PackageInfo.fromPlatform();

  /// Asks the website whether a newer app build exists.
  static Future<AppUpdate?> check({http.Client? client}) async {
    if (!AppConfig.backendConfigured) return null;
    final current = int.tryParse((await info()).buildNumber) ?? 0;
    final c = client ?? http.Client();
    final res = await c
        .get(Uri.parse('${AppConfig.apiBaseUrl}/app-version.json'), headers: {'Cache-Control': 'no-cache'})
        .timeout(const Duration(seconds: 15));
    if (res.statusCode != 200) return null;
    final j = jsonDecode(res.body);
    return j is Map<String, dynamic> ? parseUpdate(j, current) : null;
  }

  /// Quiet check at start-up and when the app comes back to the foreground (at most every 6 hours).
  static Future<void> checkInBackground() async {
    if (DateTime.now().difference(_lastCheck) < const Duration(hours: 6)) return;
    _lastCheck = DateTime.now();
    try {
      final u = await check();
      if (u != null) await prompt(u);
    } catch (_) {
      // offline: try again next time
    }
  }

  /// "Check for updates" in Settings.
  static Future<void> checkNow() async {
    try {
      final u = await check();
      if (u == null) {
        toast('You have the latest version (${(await info()).version}).');
      } else {
        await prompt(u);
      }
    } catch (_) {
      toast('Could not check for updates. Check your connection.', error: true);
    }
  }

  static Future<void> prompt(AppUpdate u) async {
    final ctx = navigatorKey.currentContext;
    if (ctx == null || _dialogOpen) return;
    _dialogOpen = true;
    final go = await showDialog<bool>(
      context: ctx,
      builder: (c) => AlertDialog(
        backgroundColor: Brand.charcoal,
        title: const Text('Update available'),
        content: Text(
          'SAHU MUSIC ${u.version} is ready.${u.notes.isNotEmpty ? '\n\n${u.notes}' : ''}\n\n'
          'Tap Update to download it, then open the file to install it over this version. Your library stays.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Later')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Update')),
        ],
      ),
    );
    _dialogOpen = false;
    if (go == true) {
      final ok = await launchUrl(Uri.parse(u.url), mode: LaunchMode.externalApplication);
      if (!ok) toast('Open ${u.url} in your browser to download the update.', error: true);
    }
  }
}
