import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:audio_service/audio_service.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../config.dart';
import '../models.dart';
import '../services/audio_handler.dart';
import '../services/music_api.dart';
import '../services/sources.dart';

// ── Singletons injected from main() ─────────────────────────────────
final prefsProvider = Provider<SharedPreferences>((_) => throw UnimplementedError('overridden in main'));
final audioHandlerProvider = Provider<SahuAudioHandler>((_) => throw UnimplementedError('overridden in main'));

SupabaseClient? get supabaseOrNull => AppConfig.supabaseConfigured ? Supabase.instance.client : null;

/// Throttled reporter → `api_errors` table for the admin panel.
DateTime _lastReport = DateTime.fromMillisecondsSinceEpoch(0);
void reportApiError(ApiException e) {
  final sb = supabaseOrNull;
  if (sb == null || DateTime.now().difference(_lastReport) < const Duration(seconds: 15)) return;
  _lastReport = DateTime.now();
  final msg = e.message.length > 300 ? e.message.substring(0, 300) : e.message;
  sb.from('api_errors').insert({'provider': 'audius', 'endpoint': e.endpoint, 'status': e.status, 'message': msg, 'client': 'mobile'}).then((_) {}, onError: (_) {});
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
  final sb = supabaseOrNull;
  if (sb == null) return;
  try {
    final blocked = await sb.from('music_rights').select('provider, provider_track_id').inFilter('rights_status', ['blocked', 'rejected']).limit(5000);
    music.blocklist = {for (final r in blocked) '${r['provider']}:${r['provider_track_id']}'};
    final off = await sb.from('music_providers').select('id').eq('enabled', false);
    music.disabledProviders = {for (final r in off) r['id'] as String};
  } catch (_) {
    // offline or schema not migrated – provider-level rights checks still apply
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
class AuthNotifier extends Notifier<User?> {
  StreamSubscription<AuthState>? _sub;

  @override
  User? build() {
    final sb = supabaseOrNull;
    if (sb == null) return null;
    _sub = sb.auth.onAuthStateChange.listen((e) => state = e.session?.user);
    ref.onDispose(() => _sub?.cancel());
    return sb.auth.currentUser;
  }

  /// Returns an error message, or null on success.
  Future<String?> signIn(String email, String password) async {
    try {
      await supabaseOrNull!.auth.signInWithPassword(email: email, password: password);
      return null;
    } on AuthException catch (e) {
      return e.message;
    } catch (_) {
      return 'Could not sign in. Check your connection.';
    }
  }

  /// Returns (error, needsEmailConfirmation).
  Future<(String?, bool)> signUp(String email, String password, String name) async {
    try {
      final res = await supabaseOrNull!.auth.signUp(
        email: email,
        password: password,
        data: {'display_name': name},
        emailRedirectTo: 'com.sahumusic.sahu_music://login-callback',
      );
      return (null, res.session == null);
    } on AuthException catch (e) {
      return (e.message, false);
    } catch (_) {
      return ('Could not sign up. Check your connection.', false);
    }
  }

  Future<void> signOut() async => supabaseOrNull?.auth.signOut();
}

final authProvider = NotifierProvider<AuthNotifier, User?>(AuthNotifier.new);

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

/// Guests: stored on the device. Signed-in users: stored in Supabase (RLS-protected).
/// Only metadata is stored – never audio. Demo tracks are not persisted.
class LibraryNotifier extends Notifier<LibraryState> {
  static const _key = 'library.v1';
  static const _historyMax = 100;
  String? _uid;

  bool get _remote => _uid != null && supabaseOrNull != null;
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
    final sb = supabaseOrNull!;
    final uid = _uid!;
    try {
      final fav = await sb.from('favorites').select('track').eq('user_id', uid).order('created_at', ascending: false).limit(1000);
      final hist = await sb.from('listening_history').select('track').eq('user_id', uid).order('played_at', ascending: false).limit(_historyMax);
      final pls = await sb.from('playlists').select('id, title, created_at, playlist_songs(track, position)').eq('owner_id', uid).order('created_at', ascending: false);
      Track tr(dynamic r) => Track.fromJson(((r as Map)['track'] as Map).cast<String, dynamic>());
      final seen = <String>{};
      if (_uid != uid) return;
      state = LibraryState(
        favorites: fav.map(tr).toList(),
        history: hist.map(tr).where((t) => seen.add(t.key)).toList(),
        playlists: pls.map((p) {
          final songs = [...(p['playlist_songs'] as List? ?? [])]..sort((a, b) => ((a['position'] as num?) ?? 0).compareTo((b['position'] as num?) ?? 0));
          return UserPlaylist(id: p['id'] as String, title: p['title'] as String, createdAt: '${p['created_at']}', tracks: songs.map(tr).toList());
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

  void _run(Future<dynamic> Function(SupabaseClient sb) fn) {
    if (!_remote) return;
    fn(supabaseOrNull!).then((_) {}, onError: (_) {});
  }

  Map<String, dynamic> _ref(Track t) => {'provider': t.provider, 'provider_track_id': t.providerTrackId};

  /// Returns true when the track is now a favourite.
  bool toggleFavorite(Track t) {
    final has = state.isFavorite(t);
    _set(state.copyWith(favorites: has ? state.favorites.where((f) => f.key != t.key).toList() : [t, ...state.favorites]));
    if (_persistable(t)) {
      _run((sb) => has
          ? sb.from('favorites').delete().match({'user_id': _uid!, ..._ref(t)})
          : sb.from('favorites').upsert({'user_id': _uid!, ..._ref(t), 'track': t.toJson()}));
    }
    return !has;
  }

  void addHistory(Track t) {
    _set(state.copyWith(history: [t, ...state.history.where((h) => h.key != t.key)].take(_historyMax).toList()));
    if (_persistable(t)) _run((sb) => sb.from('listening_history').insert({'user_id': _uid!, ..._ref(t), 'track': t.toJson()}));
  }

  void clearHistory() {
    _set(state.copyWith(history: []));
    _run((sb) => sb.from('listening_history').delete().eq('user_id', _uid!));
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
    _run((sb) => sb.from('playlists').insert({'id': pl.id, 'owner_id': _uid!, 'title': title, 'is_public': false}));
    return pl.id;
  }

  void renamePlaylist(String id, String rawTitle) {
    final title = rawTitle.trim();
    if (title.isEmpty || title.length > 80) return;
    _set(state.copyWith(playlists: [for (final p in state.playlists) p.id == id ? p.copyWith(title: title) : p]));
    _run((sb) => sb.from('playlists').update({'title': title}).eq('id', id));
  }

  void deletePlaylist(String id) {
    _set(state.copyWith(playlists: state.playlists.where((p) => p.id != id).toList()));
    _run((sb) => sb.from('playlists').delete().eq('id', id));
  }

  /// Returns false when the track is already in the playlist.
  bool addToPlaylist(String id, Track t) {
    final pl = state.playlists.where((p) => p.id == id).firstOrNull;
    if (pl == null || pl.tracks.any((x) => x.key == t.key)) return false;
    _set(state.copyWith(playlists: [for (final p in state.playlists) p.id == id ? p.copyWith(tracks: [...p.tracks, t]) : p]));
    if (_persistable(t)) {
      _run((sb) => sb.from('playlist_songs').insert({'playlist_id': id, ..._ref(t), 'track': t.toJson(), 'position': DateTime.now().millisecondsSinceEpoch}));
    }
    return true;
  }

  void removeFromPlaylist(String id, Track t) {
    _set(state.copyWith(playlists: [for (final p in state.playlists) p.id == id ? p.copyWith(tracks: p.tracks.where((x) => x.key != t.key).toList()) : p]));
    _run((sb) => sb.from('playlist_songs').delete().match({'playlist_id': id, ..._ref(t)}));
  }
}

final libraryProvider = NotifierProvider<LibraryNotifier, LibraryState>(LibraryNotifier.new);
