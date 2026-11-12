import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:audio_service/audio_service.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config.dart';
import '../models.dart';
import '../services/audio_handler.dart';
import '../services/backend.dart';
import '../services/music_api.dart';
import '../services/sources.dart';

// ── Singletons injected from main() ─────────────────────────────────
final prefsProvider = Provider<SharedPreferences>((_) => throw UnimplementedError('overridden in main'));
final audioHandlerProvider = Provider<SahuAudioHandler>((_) => throw UnimplementedError('overridden in main'));

Backend? _backend;

/// The SAHU MUSIC backend (accounts and synced libraries).
final backendProvider = Provider<Backend>((ref) => _backend = Backend(ref.watch(prefsProvider)));

/// Throttled reporter → API error log for the admin panel.
DateTime _lastReport = DateTime.fromMillisecondsSinceEpoch(0);
void reportApiError(ApiException e) {
  final b = _backend;
  if (b == null || !b.configured || DateTime.now().difference(_lastReport) < const Duration(seconds: 15)) return;
  _lastReport = DateTime.now();
  final msg = e.message.length > 300 ? e.message.substring(0, 300) : e.message;
  final endpoint = e.endpoint.length > 200 ? e.endpoint.substring(0, 200) : e.endpoint;
  b.call('POST', 'errors', {
    'provider': 'audius',
    'endpoint': endpoint.isEmpty ? '-' : endpoint,
    'status': e.status,
    'message': msg.isEmpty ? '-' : msg,
    'client': 'mobile',
  }).then((_) {}, onError: (_) {});
}

final musicServiceProvider = Provider<MusicService>((ref) {
  return MusicService(
    providers: [
      AudiusProvider(appName: AppConfig.audiusAppName, onError: reportApiError),
      RadioProvider(),
      ArchiveProvider(),
      if (AppConfig.youtubeConfigured) YoutubeProvider(apiKey: AppConfig.youtubeApiKey),
    ],
    forceDemo: AppConfig.forceDemo,
  );
});

/// Loads admin rules: blocked tracks + disabled providers.
Future<void> loadCatalogueRules(MusicService music) async {
  if (!AppConfig.backendConfigured) return;
  try {
    final res = await http.get(Uri.parse('${AppConfig.apiBaseUrl}/api/v1/rules/')).timeout(const Duration(seconds: 15));
    if (res.statusCode != 200) return;
    final j = jsonDecode(res.body) as Map<String, dynamic>;
    music.blocklist = {for (final k in (j['blocked'] as List? ?? const [])) '$k'};
    music.disabledProviders = {for (final id in (j['disabledProviders'] as List? ?? const [])) '$id'};
  } catch (_) {
    // offline – provider-level rights checks still apply
  }
}

final demoModeProvider = StreamProvider<bool>((ref) async* {
  final flag = ref.watch(musicServiceProvider).demoMode;
  yield flag.value;
  yield* flag.stream;
});

// ── Player streams ──────────────────────────────────────────────────
final currentTrackProvider = StreamProvider<Track?>((ref) async* {
  final h = ref.watch(audioHandlerProvider);
  yield h.current;
  yield* h.currentStream;
});

final playbackStateProvider = StreamProvider<PlaybackState>((ref) => ref.watch(audioHandlerProvider).playbackState);

final queueProvider = StreamProvider<List<Track>>((ref) async* {
  final h = ref.watch(audioHandlerProvider);
  yield h.tracks;
  yield* h.tracksStream;
});

final positionProvider = StreamProvider<Duration>((ref) => ref.watch(audioHandlerProvider).positionStream);
final durationProvider = StreamProvider<Duration?>((ref) => ref.watch(audioHandlerProvider).durationStream);

// ── Settings ────────────────────────────────────────────────────────
class AppSettings {
  const AppSettings({this.onboarded = false, this.autoplayNext = true, this.showAds = true});
  final bool onboarded;
  final bool autoplayNext;
  final bool showAds;
  AppSettings copyWith({bool? onboarded, bool? autoplayNext, bool? showAds}) =>
      AppSettings(onboarded: onboarded ?? this.onboarded, autoplayNext: autoplayNext ?? this.autoplayNext, showAds: showAds ?? this.showAds);
}

class SettingsNotifier extends Notifier<AppSettings> {
  @override
  AppSettings build() {
    final p = ref.watch(prefsProvider);
    final s = AppSettings(
      onboarded: p.getBool('onboarded') ?? false,
      autoplayNext: p.getBool('autoplayNext') ?? true,
      showAds: p.getBool('showAds') ?? true,
    );
    ref.read(audioHandlerProvider).autoplayNext = s.autoplayNext;
    return s;
  }

  void setOnboarded() {
    ref.read(prefsProvider).setBool('onboarded', true);
    state = state.copyWith(onboarded: true);
  }

  void setAutoplayNext(bool v) {
    ref.read(prefsProvider).setBool('autoplayNext', v);
    ref.read(audioHandlerProvider).autoplayNext = v;
    state = state.copyWith(autoplayNext: v);
  }

  void setShowAds(bool v) {
    ref.read(prefsProvider).setBool('showAds', v);
    state = state.copyWith(showAds: v);
  }
}

final settingsProvider = NotifierProvider<SettingsNotifier, AppSettings>(SettingsNotifier.new);

// ── Auth ────────────────────────────────────────────────────────────
class AuthNotifier extends Notifier<AppUser?> {
  static const _userKey = 'session.user';

  @override
  AppUser? build() {
    final backend = ref.watch(backendProvider);
    if (!backend.hasSession) return null;
    // Show the remembered account at once, then confirm the session with the server.
    AppUser? cached;
    try {
      final j = jsonDecode(ref.read(prefsProvider).getString(_userKey) ?? '') as Map<String, dynamic>;
      cached = AppUser(id: j['id'] as String, email: j['email'] as String, displayName: j['displayName'] as String?);
    } catch (_) {}
    backend.me().then((u) {
      if (u == null) {
        _forget();
      } else {
        _remember(u);
      }
    }, onError: (Object e) {
      if (e is BackendException && e.status == 401) _forget(); // signed out elsewhere or account deleted
    });
    return cached;
  }

  void _remember(AppUser u) {
    ref.read(prefsProvider).setString(_userKey, jsonEncode({'id': u.id, 'email': u.email, 'displayName': u.displayName}));
    if (state?.id != u.id || state?.email != u.email) state = u;
  }

  void _forget() {
    ref.read(prefsProvider).remove(_userKey);
    state = null;
  }

  /// Returns an error message, or null on success.
  Future<String?> signIn(String email, String password) async {
    try {
      final u = await ref.read(backendProvider).signIn(email, password);
      if (u != null) _remember(u);
      return null;
    } on BackendException catch (e) {
      return e.message;
    } catch (_) {
      return 'Could not sign in. Check your connection.';
    }
  }

  /// Returns (error, needsEmailConfirmation). Accounts are active at once.
  Future<(String?, bool)> signUp(String email, String password, String name) async {
    try {
      final u = await ref.read(backendProvider).signUp(email, password, name);
      if (u != null) _remember(u);
      return (null, false);
    } on BackendException catch (e) {
      return (e.message, false);
    } catch (_) {
      return ('Could not sign up. Check your connection.', false);
    }
  }

  Future<void> signOut() async {
    await ref.read(backendProvider).signOut();
    _forget();
  }
}

final authProvider = NotifierProvider<AuthNotifier, AppUser?>(AuthNotifier.new);

// ── Library: favourites, playlists, history ─────────────────────────
class LibraryState {
  const LibraryState({this.favorites = const [], this.history = const [], this.playlists = const [], this.ready = false});
  final List<Track> favorites;
  final List<Track> history;
  final List<UserPlaylist> playlists;
  final bool ready;

  bool isFavorite(Track t) => favorites.any((f) => f.key == t.key);

  LibraryState copyWith({List<Track>? favorites, List<Track>? history, List<UserPlaylist>? playlists, bool? ready}) => LibraryState(
        favorites: favorites ?? this.favorites,
        history: history ?? this.history,
        playlists: playlists ?? this.playlists,
        ready: ready ?? this.ready,
      );
}

/// Guests: stored on the device. Signed-in users: stored in the SAHU MUSIC backend (Neon).
/// Only metadata is stored – never audio. Demo tracks are not persisted.
class LibraryNotifier extends Notifier<LibraryState> {
  static const _key = 'library.v1';
  static const _historyMax = 100;
  String? _uid;

  bool get _remote => _uid != null && ref.read(backendProvider).hasSession;
  static bool _persistable(Track t) => t.provider != 'demo';

  @override
  LibraryState build() {
    _uid = ref.watch(authProvider)?.id;
    if (_remote) {
      _loadRemote();
      return const LibraryState();
    }
    return _loadLocal();
  }

  LibraryState _loadLocal() {
    try {
      final raw = ref.read(prefsProvider).getString(_key);
      if (raw == null) return const LibraryState(ready: true);
      final j = jsonDecode(raw) as Map<String, dynamic>;
      List<Track> list(String k) => ((j[k] as List?) ?? []).map((e) => Track.fromJson((e as Map).cast<String, dynamic>())).where(_persistable).toList();
      return LibraryState(
        favorites: list('favorites'),
        history: list('history'),
        playlists: ((j['playlists'] as List?) ?? []).map((e) => UserPlaylist.fromJson((e as Map).cast<String, dynamic>())).toList(),
        ready: true,
      );
    } catch (_) {
      return const LibraryState(ready: true);
    }
  }

  Future<void> _loadRemote() async {
    final uid = _uid!;
    try {
      final j = await ref.read(backendProvider).call('GET', 'library');
      Track tr(dynamic r) => Track.fromJson((r as Map).cast<String, dynamic>());
      final seen = <String>{};
      if (_uid != uid) return;
      state = LibraryState(
        favorites: ((j['favorites'] as List?) ?? const []).map(tr).toList(),
        history: ((j['history'] as List?) ?? const []).map((h) => tr((h as Map)['track'])).where((t) => seen.add(t.key)).toList(),
        playlists: ((j['playlists'] as List?) ?? const []).map((p) {
          final m = (p as Map).cast<String, dynamic>();
          return UserPlaylist(
            id: m['id'] as String,
            title: m['title'] as String,
            createdAt: '${m['createdAt']}',
            tracks: ((m['tracks'] as List?) ?? const []).map(tr).toList(),
          );
        }).toList(),
        ready: true,
      );
    } catch (_) {
      if (_uid == uid) state = const LibraryState(ready: true);
    }
  }

  void _set(LibraryState s) {
    state = s;
    if (!_remote) {
      ref.read(prefsProvider).setString(
            _key,
            jsonEncode({
              'favorites': s.favorites.where(_persistable).map((t) => t.toJson()).toList(),
              'history': s.history.where(_persistable).map((t) => t.toJson()).toList(),
              'playlists': s.playlists.map((p) => p.copyWith(tracks: p.tracks.where(_persistable).toList()).toJson()).toList(),
            }),
          );
    }
  }

  void _send(String path, Map<String, dynamic> body) {
    if (_remote) ref.read(backendProvider).send(path, body);
  }

  Map<String, dynamic> _ref(Track t) => {'provider': t.provider, 'providerTrackId': t.providerTrackId};

  /// Returns true when the track is now a favourite.
  bool toggleFavorite(Track t) {
    final has = state.isFavorite(t);
    _set(state.copyWith(favorites: has ? state.favorites.where((f) => f.key != t.key).toList() : [t, ...state.favorites]));
    if (_persistable(t)) {
      has ? _send('favorites/remove', _ref(t)) : _send('favorites/add', {'track': t.toJson()});
    }
    return !has;
  }

  void addHistory(Track t) {
    _set(state.copyWith(history: [t, ...state.history.where((h) => h.key != t.key)].take(_historyMax).toList()));
    if (_persistable(t)) _send('history/add', {'track': t.toJson()});
  }

  void clearHistory() {
    _set(state.copyWith(history: []));
    _send('history/clear', {});
  }

  static String _uuid() {
    final r = Random.secure();
    final b = List<int>.generate(16, (_) => r.nextInt(256));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    final h = b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
    return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
  }

  /// Returns the new playlist id, or null when the title is invalid.
  String? createPlaylist(String rawTitle) {
    final title = rawTitle.trim();
    if (title.isEmpty || title.length > 80) return null;
    final pl = UserPlaylist(id: _uuid(), title: title, tracks: const [], createdAt: DateTime.now().toUtc().toIso8601String());
    _set(state.copyWith(playlists: [pl, ...state.playlists]));
    _send('playlists/create', {'id': pl.id, 'title': title});
    return pl.id;
  }

  void renamePlaylist(String id, String rawTitle) {
    final title = rawTitle.trim();
    if (title.isEmpty || title.length > 80) return;
    _set(state.copyWith(playlists: [for (final p in state.playlists) p.id == id ? p.copyWith(title: title) : p]));
    _send('playlists/rename', {'id': id, 'title': title});
  }

  void deletePlaylist(String id) {
    _set(state.copyWith(playlists: state.playlists.where((p) => p.id != id).toList()));
    _send('playlists/delete', {'id': id});
  }

  /// Returns false when the track is already in the playlist.
  bool addToPlaylist(String id, Track t) {
    final pl = state.playlists.where((p) => p.id == id).firstOrNull;
    if (pl == null || pl.tracks.any((x) => x.key == t.key)) return false;
    _set(state.copyWith(playlists: [for (final p in state.playlists) p.id == id ? p.copyWith(tracks: [...p.tracks, t]) : p]));
    if (_persistable(t)) {
      _send('playlists/add-track', {'playlistId': id, 'track': t.toJson()});
    }
    return true;
  }

  void removeFromPlaylist(String id, Track t) {
    _set(state.copyWith(playlists: [for (final p in state.playlists) p.id == id ? p.copyWith(tracks: p.tracks.where((x) => x.key != t.key).toList()) : p]));
    _send('playlists/remove-track', {'playlistId': id, ..._ref(t)});
  }
}

final libraryProvider = NotifierProvider<LibraryNotifier, LibraryState>(LibraryNotifier.new);
