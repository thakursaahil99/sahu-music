import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

import '../models.dart';
import 'sources.dart';

/// Common interface every music source implements (same contract as the
/// TypeScript `MusicProvider` used by the website). Only legitimately free,
/// authorised APIs may be implemented – never scrape Spotify/YouTube/JioSaavn.
abstract class MusicProvider {
  String get id;
  String get name;
  Future<List<Track>> searchTracks(String query, {int limit = 20, int offset = 0});
  Future<List<Artist>> searchArtists(String query, {int limit = 10});
  Future<List<Collection>> searchCollections(String query, {int limit = 10});
  Future<List<Track>> trending({String? genre, int limit = 20, int offset = 0});
  Future<List<Collection>> trendingCollections({int limit = 10});
  Future<Artist?> artist(String id);
  Future<List<Track>> artistTracks(String id, {int limit = 20, int offset = 0});
  Future<Collection?> collection(String id);
}

class ApiException implements Exception {
  ApiException(this.message, {this.status = 0, this.endpoint = ''});
  final String message;
  final int status;
  final String endpoint;
  @override
  String toString() => message;
}

/// Derives commercial-use permission from a licence string. Unknown → unconfirmed.
Permission commercialUseFromLicense(String? license) {
  if (license == null || license.isEmpty) return Permission.unconfirmed;
  final l = license.toLowerCase();
  if (l.contains('all rights reserved')) return Permission.notAllowed;
  if (RegExp(r'(^|[^a-z])nc([^a-z]|$)').hasMatch(l) || l.contains('noncommercial') || l.contains('non-commercial')) {
    return Permission.notAllowed;
  }
  if (l.contains('cc0') || l.contains('public domain') || l.contains('attribution') || RegExp(r'(^|[^a-z])cc[ -]?by').hasMatch(l)) {
    return Permission.allowed;
  }
  return Permission.unconfirmed;
}

/// Audius – free public API, no key required. https://docs.audius.org
class AudiusProvider implements MusicProvider {
  AudiusProvider({required this.appName, http.Client? client, this.onError}) : _client = client ?? http.Client();

  static const _base = 'https://api.audius.co/v1';
  static final _idOk = RegExp(r'^[A-Za-z0-9]{1,32}$');

  final String appName;
  final http.Client _client;
  final void Function(ApiException e)? onError;
  final _cache = <String, (DateTime, dynamic)>{};
  DateTime _lastCall = DateTime.fromMillisecondsSinceEpoch(0);

  @override
  String get id => 'audius';
  @override
  String get name => 'Audius';

  Future<dynamic> _get(String path, [Map<String, String> params = const {}]) async {
    final uri = Uri.parse('$_base$path').replace(queryParameters: {...params, 'app_name': appName});
    final key = uri.toString();
    final hit = _cache[key];
    if (hit != null && DateTime.now().difference(hit.$1) < const Duration(minutes: 2)) return hit.$2;

    // Polite client: at most ~8 requests per second to the provider.
    final wait = const Duration(milliseconds: 120) - DateTime.now().difference(_lastCall);
    if (!wait.isNegative) await Future<void>.delayed(wait);
    _lastCall = DateTime.now();

    ApiException? last;
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        final res = await _client.get(uri, headers: {'Accept': 'application/json'}).timeout(const Duration(seconds: 12));
        if (res.statusCode == 200) {
          final data = (jsonDecode(res.body) as Map<String, dynamic>)['data'];
          if (_cache.length > 150) _cache.remove(_cache.keys.first);
          _cache[key] = (DateTime.now(), data);
          return data;
        }
        last = ApiException('Audius responded ${res.statusCode}', status: res.statusCode, endpoint: uri.path);
        if (res.statusCode != 429 && res.statusCode < 500) break;
      } on TimeoutException {
        last = ApiException('Audius request timed out', endpoint: uri.path);
      } on SocketException {
        last = ApiException('No internet connection', endpoint: uri.path);
      } on http.ClientException {
        last = ApiException('Network error contacting Audius', endpoint: uri.path);
      }
      await Future<void>.delayed(Duration(milliseconds: 400 * (1 << attempt)));
    }
    final err = last ?? ApiException('Unknown error', endpoint: uri.path);
    onError?.call(err);
    throw err;
  }

  String _streamUrl(String trackId) => '$_base/tracks/$trackId/stream?app_name=${Uri.encodeQueryComponent(appName)}';

  Track? mapTrack(dynamic t) {
    if (t is! Map || t['id'] is! String || !_idOk.hasMatch(t['id'] as String) || t['title'] == null) return null;
    final restricted = t['is_stream_gated'] == true ||
        t['is_delete'] == true ||
        t['is_unlisted'] == true ||
        t['is_available'] == false ||
        t['stream_conditions'] != null;
    final ok = t['is_streamable'] == true && !restricted;
    final license = t['license'] as String?;
    final art = t['artwork'] as Map?;
    final user = t['user'] as Map?;
    return Track(
      provider: 'audius',
      providerTrackId: t['id'] as String,
      title: '${t['title']}',
      artist: (user?['name'] ?? user?['handle'] ?? 'Unknown artist') as String,
      artistId: user?['id'] as String?,
      artwork: (art?['480x480'] ?? art?['150x150']) as String?,
      artworkLarge: (art?['1000x1000'] ?? art?['480x480']) as String?,
      streamUrl: ok ? _streamUrl(t['id'] as String) : '',
      duration: (t['duration'] as num?)?.round() ?? 0,
      genre: t['genre'] as String?,
      permalink: t['permalink'] != null ? 'https://audius.co${t['permalink']}' : null,
      tags: t['tags'] is String && (t['tags'] as String).isNotEmpty ? t['tags'] as String : null,
      playCount: (t['play_count'] as num?)?.toInt() ?? 0,
      rights: TrackRights(
        status: ok ? 'approved' : 'rejected',
        streamingPermitted: ok,
        commercialUse: commercialUseFromLicense(license),
        advertising: Permission.unconfirmed,
        license: (license == null || license.isEmpty) ? null : license,
        basis: ok
            ? 'Audius public API marks this track as streamable and not access-gated; it was published to Audius by its uploader for free streaming via the Audius API.'
            : 'Not playable: the provider did not confirm streaming permission.',
      ),
    );
  }

  List<Track> _tracks(dynamic data) => data is List ? data.map(mapTrack).whereType<Track>().toList() : <Track>[];

  Artist? _artist(dynamic u) {
    if (u is! Map || u['id'] is! String || u['is_deactivated'] == true) return null;
    final pic = u['profile_picture'] as Map?;
    return Artist(
      provider: 'audius',
      id: u['id'] as String,
      name: (u['name'] ?? u['handle'] ?? 'Unknown artist') as String,
      image: (pic?['480x480'] ?? pic?['150x150']) as String?,
      bio: u['bio'] as String?,
      followers: (u['follower_count'] as num?)?.toInt() ?? 0,
      verified: u['is_verified'] == true,
    );
  }

  Collection? _collection(dynamic p, {List<Track> tracks = const []}) {
    if (p is! Map || p['id'] is! String || p['is_private'] == true || p['is_delete'] == true || p['is_stream_gated'] == true) return null;
    final art = p['artwork'] as Map?;
    final user = p['user'] as Map?;
    return Collection(
      provider: 'audius',
      id: p['id'] as String,
      title: (p['playlist_name'] ?? 'Untitled') as String,
      ownerName: (user?['name'] ?? user?['handle'] ?? 'Unknown') as String,
      isAlbum: p['is_album'] == true,
      artwork: (art?['480x480'] ?? art?['150x150']) as String?,
      trackCount: (p['track_count'] as num?)?.toInt() ?? tracks.length,
      tracks: tracks,
    );
  }

  @override
  Future<List<Track>> searchTracks(String query, {int limit = 20, int offset = 0}) async {
    final params = {'query': query, 'limit': '$limit', 'offset': '$offset'};
    if (offset > 0) return _tracks(await _get('/tracks/search', params));
    // Audius' own ordering is weak: merge its "relevant" and "popular" orderings, MusicService re-ranks.
    final out = <Track>[];
    final seen = <String>{};
    Object? error;
    for (final extra in [<String, String>{}, {'sort_method': 'popular'}]) {
      try {
        for (final t in _tracks(await _get('/tracks/search', {...params, ...extra}))) {
          if (seen.add(t.providerTrackId)) out.add(t);
        }
      } catch (e) {
        error = e;
      }
    }
    if (out.isEmpty && error != null) throw error;
    return out;
  }

  @override
  Future<List<Artist>> searchArtists(String query, {int limit = 10}) async {
    final data = await _get('/users/search', {'query': query, 'limit': '$limit'});
    return data is List ? data.map(_artist).whereType<Artist>().toList() : [];
  }

  @override
  Future<List<Collection>> searchCollections(String query, {int limit = 10}) async {
    final data = await _get('/playlists/search', {'query': query, 'limit': '$limit'});
    return data is List ? data.map((p) => _collection(p)).whereType<Collection>().toList() : [];
  }

  @override
  Future<List<Track>> trending({String? genre, int limit = 20, int offset = 0}) async => _tracks(await _get('/tracks/trending', {
        'genre': ?genre,
        'time': genre == null ? 'week' : 'month',
        'limit': '$limit',
        'offset': '$offset',
      }));

  @override
  Future<List<Collection>> trendingCollections({int limit = 10}) async {
    final data = await _get('/playlists/trending', {'limit': '$limit'});
    return data is List ? data.map((p) => _collection(p)).whereType<Collection>().toList() : [];
  }

  @override
  Future<Artist?> artist(String id) async => _idOk.hasMatch(id) ? _artist(await _get('/users/$id')) : null;

  @override
  Future<List<Track>> artistTracks(String id, {int limit = 20, int offset = 0}) async =>
      _idOk.hasMatch(id) ? _tracks(await _get('/users/$id/tracks', {'limit': '$limit', 'offset': '$offset', 'sort': 'plays'})) : [];

  @override
  Future<Collection?> collection(String id) async {
    if (!_idOk.hasMatch(id)) return null;
    final meta = await _get('/playlists/$id');
    final tracks = _tracks(await _get('/playlists/$id/tracks'));
    return _collection(meta is List && meta.isNotEmpty ? meta.first : meta, tracks: tracks);
  }
}

/// DEMO PROVIDER – original sample audio, synthesized on the device (CC0).
/// Used only when the live catalogue is unreachable or DEMO_MODE=true.
class DemoProvider implements MusicProvider {
  static const _rate = 16000;
  static const _songs = [
    ('demo-1', 'Demo Tone – Subah (Morning Sketch)', 96, 261.63, [0, 2, 4, 7, 9, 7, 4, 2, 0, -99, 4, 7, 9, 12, 9, 7, 4, 2, 4, -99, 7, 9, 7, 4, 2, 0, 2, 4, 0, -99, 0, -99]),
    ('demo-2', 'Demo Tone – Shaam (Evening Sketch)', 72, 220.0, [0, 3, 5, 7, 10, 7, 5, 3, 0, -99, 7, 10, 12, 10, 7, 5, 3, 5, 7, -99, 3, 0, 3, 5, 3, 0, -2, 0, -99, 0, -99, -99]),
    ('demo-3', 'Demo Tone – Raat (Night Sketch)', 120, 196.0, [0, 7, 12, 7, 0, 7, 12, 14, 12, 7, 5, 7, 0, -99, 5, 12, 17, 12, 5, 12, 17, 19, 17, 12, 10, 12, 5, -99, 0, 7, 12, -99]),
  ];

  List<Track>? _cached;

  @override
  String get id => 'demo';
  @override
  String get name => 'SAHU MUSIC Demo';

  static Uint8List synthWav(int bpm, double root, List<int> notes, {int repeats = 2}) {
    final perNote = (60 / bpm / 2 * _rate).floor();
    final total = perNote * notes.length * repeats;
    final pcm = Int16List(total);
    for (var r = 0; r < repeats; r++) {
      for (var i = 0; i < notes.length; i++) {
        if (notes[i] == -99) continue; // rest
        final freq = root * pow(2, notes[i] / 12);
        final start = (r * notes.length + i) * perNote;
        final len = (perNote * 1.6).floor();
        for (var s = 0; s < len && start + s < total; s++) {
          final t = s / _rate;
          final env = min(1.0, s / 200) * exp(-3.2 * t);
          final ph = 2 * pi * freq * t;
          final v = (sin(ph) + 0.3 * sin(2 * ph) + 0.25 * sin(ph / 2)) * env * 0.42;
          pcm[start + s] = (pcm[start + s] + (v * 32767).round()).clamp(-32767, 32767);
        }
      }
    }
    final bytes = ByteData(44 + pcm.length * 2);
    void str(int o, String s) {
      for (var i = 0; i < s.length; i++) {
        bytes.setUint8(o + i, s.codeUnitAt(i));
      }
    }

    str(0, 'RIFF');
    bytes.setUint32(4, 36 + pcm.length * 2, Endian.little);
    str(8, 'WAVE');
    str(12, 'fmt ');
    bytes.setUint32(16, 16, Endian.little);
    bytes.setUint16(20, 1, Endian.little);
    bytes.setUint16(22, 1, Endian.little);
    bytes.setUint32(24, _rate, Endian.little);
    bytes.setUint32(28, _rate * 2, Endian.little);
    bytes.setUint16(32, 2, Endian.little);
    bytes.setUint16(34, 16, Endian.little);
    str(36, 'data');
    bytes.setUint32(40, pcm.length * 2, Endian.little);
    for (var i = 0; i < pcm.length; i++) {
      bytes.setInt16(44 + i * 2, pcm[i], Endian.little);
    }
    return bytes.buffer.asUint8List();
  }

  Future<List<Track>> _all() async {
    if (_cached != null) return _cached!;
    final dir = await getTemporaryDirectory();
    final out = <Track>[];
    for (final (id, title, bpm, root, notes) in _songs) {
      final file = File('${dir.path}/sahu_$id.wav');
      final wav = synthWav(bpm, root, notes);
      if (!file.existsSync() || file.lengthSync() != wav.length) await file.writeAsBytes(wav, flush: true);
      out.add(Track(
        provider: 'demo',
        providerTrackId: id,
        title: title,
        artist: 'SAHU MUSIC Demo',
        streamUrl: file.uri.toString(),
        duration: ((wav.length - 44) / 2 / _rate).round(),
        genre: 'Demo',
        rights: const TrackRights(
          status: 'approved',
          streamingPermitted: true,
          commercialUse: Permission.allowed,
          advertising: Permission.allowed,
          license: 'CC0 1.0 (original SAHU MUSIC sample audio)',
          basis: 'Original audio synthesized by the SAHU MUSIC app itself; owned by the project and released as CC0.',
        ),
      ));
    }
    return _cached = out;
  }

  @override
  Future<List<Track>> searchTracks(String query, {int limit = 20, int offset = 0}) => offset > 0 ? Future.value([]) : _all();
  @override
  Future<List<Artist>> searchArtists(String query, {int limit = 10}) async => [];
  @override
  Future<List<Collection>> searchCollections(String query, {int limit = 10}) async => [];
  @override
  Future<List<Track>> trending({String? genre, int limit = 20, int offset = 0}) => offset > 0 ? Future.value([]) : _all();
  @override
  Future<List<Collection>> trendingCollections({int limit = 10}) async => [];
  @override
  Future<Artist?> artist(String id) async => null;
  @override
  Future<List<Track>> artistTracks(String id, {int limit = 20, int offset = 0}) async => [];
  @override
  Future<Collection?> collection(String id) async => null;
}

// ── Search ranking (same rules as packages/api/src/rank.ts) ─────────
final _indic = RegExp(r'[\u0900-\u097F\u0A00-\u0A7F]');
const _hindiTerms = {
  'hindi', 'bollywood', 'punjabi', 'desi', 'india', 'indian', 'haryanvi', 'bhojpuri', 'urdu', 'ghazal', 'bhajan', 'qawwali', 'qawali',
  'sufi', 'filmi', 'hindustani', 'rajasthani', 'marathi', 'gujarati', 'bhangra', 'kirtan', 'aarti', 'mantra', 'chalisa', 'bhakti',
  'arijit', 'shreya', 'kishore', 'lata', 'rafi', 'atif', 'jubin', 'badshah', 'diljit', 'sidhu', 'udit', 'sanu', 'alka', 'sonu', 'neha',
  'kakkar', 'ghoshal', 'mangeshkar', 'nigam', 'pritam', 'rahman', 'hindisong', 'hindisongs', 'bollywoodsongs', 'lofihindi',
};

/// Lower-case, strip punctuation and fold doubled letters ("jaa" matches "ja").
String normalizeText(String s) => s
    .toLowerCase()
    .replaceAll(RegExp(r'[^\p{L}\p{N}]+', unicode: true), ' ')
    .replaceAllMapped(RegExp(r'(\p{L})\1+', unicode: true), (m) => m[1]!)
    .trim();

List<String> _tokens(String s) => normalizeText(s).split(' ').where((w) => w.isNotEmpty).toList();

bool _wordHits(String word, List<String> bag) =>
    bag.any((t) => t == word || (word.length >= 4 && t.startsWith(word)) || (t.length >= 5 && word.length >= 5 && word.startsWith(t)));

bool isHindiLeaning(Track t) {
  final text = '${t.title} ${t.artist} ${t.tags ?? ''} ${t.genre ?? ''}';
  return _indic.hasMatch(text) || _tokens(text).any(_hindiTerms.contains);
}

/// Best matches first; unrelated fuzzy results are dropped when real matches exist.
List<Track> rankSearch(String query, List<Track> tracks) {
  final q = normalizeText(query);
  final words = q.split(' ').where((w) => w.isNotEmpty).toList();
  if (words.isEmpty) return tracks;
  final scored = <(Track, double, double, int)>[];
  for (var i = 0; i < tracks.length; i++) {
    final t = tracks[i];
    final title = normalizeText(t.title);
    final titleBag = title.split(' ').where((w) => w.isNotEmpty).toList();
    final allBag = _tokens('${t.title} ${t.artist} ${t.tags ?? ''}');
    final inTitle = words.where((w) => _wordHits(w, titleBag)).length / words.length;
    final matched = words.where((w) => _wordHits(w, allBag)).length / words.length;
    var score = 0.0;
    if (title == q) {
      score += 120;
    } else if (title.startsWith('$q ')) {
      score += 95;
    } else if (' $title '.contains(' $q ')) {
      score += 80;
    }
    score += 60 * inTitle + 30 * matched;
    if (matched == 1) score += 25;
    if (isHindiLeaning(t)) score += 20;
    score += min(20.0, log(t.playCount + 1) / ln10 * 4);
    if (t.duration > 0 && t.duration < 45) {
      score -= 50; // ringtone-length clip, not a song
    } else if (t.duration > 0 && t.duration < 60) {
      score -= 15;
    }
    scored.add((t, score, matched, i));
  }
  final best = scored.fold<double>(0, (m, s) => max(m, s.$3));
  final keep = best >= 1 ? scored.where((s) => s.$3 >= 0.5).toList() : best > 0 ? scored.where((s) => s.$3 > 0).toList() : scored;
  keep.sort((a, b) {
    final c = b.$2.compareTo(a.$2);
    return c != 0 ? c : a.$4.compareTo(b.$4);
  });
  return keep.map((s) => s.$1).toList();
}

/// Aggregates providers, applies rights verification to every track, and falls
/// back to demo mode when the live catalogue cannot be reached.
class MusicService {
  MusicService({required List<MusicProvider> providers, this.forceDemo = false}) : _providers = providers; // ignore: prefer_initializing_formals

  final List<MusicProvider> _providers;
  final DemoProvider _demo = DemoProvider();
  final bool forceDemo;
  Set<String> blocklist = {};
  Set<String> disabledProviders = {};
  final demoMode = _DemoFlag();

  List<MusicProvider> get _active => forceDemo ? [] : _providers.where((p) => !disabledProviders.contains(p.id)).toList();

  bool isPlayable(Track t) => t.playable && !blocklist.contains(t.key);

  List<Track> _filter(Iterable<Track> tracks) {
    final seen = <String>{};
    return tracks.where((t) => isPlayable(t) && seen.add(t.key)).toList();
  }

  /// All sources in parallel. A slow Internet Archive gets 4.5 s; its answer is cached for next time.
  Future<List<T>> _fan<T>(Future<List<T>> Function(MusicProvider p) fn, {bool Function(MusicProvider p)? pick}) async {
    final active = _active.where(pick ?? (_) => true).toList();
    if (active.isEmpty) {
      demoMode.value = true;
      return fn(_demo);
    }
    final results = await Future.wait(active.map((p) async {
      try {
        final work = fn(p);
        return (p is ArchiveProvider ? await work.timeout(const Duration(milliseconds: 4500), onTimeout: () => <T>[]) : await work, null);
      } catch (e) {
        return (null, e);
      }
    }));
    final out = <T>[];
    var ok = 0;
    Object? lastError;
    for (final (list, err) in results) {
      if (list != null) {
        out.addAll(list);
        ok++;
      } else {
        lastError = err;
      }
    }
    // Some sources answer [] without asking anyone (radio has no chart).
    if (ok == 0 || (lastError != null && out.isEmpty)) {
      // Every live provider failed. Surface the error for search-style calls,
      // but mark demo mode so the home screen can offer sample audio.
      demoMode.value = true;
      final demo = await fn(_demo);
      if (demo.isEmpty && lastError != null) throw lastError;
      return demo;
    }
    demoMode.value = false;
    return out;
  }

  /// Best title match first, Hindi/Indian music ahead of the rest.
  /// YouTube (daily quota) only answers searches the listener typed ([userSearch]).
  Future<List<Track>> searchTracks(String q, {int limit = 50, int offset = 0, bool userSearch = false, Set<String> exclude = const {}}) async =>
      rankSearch(
          q,
          _filter(await _fan((p) => p.searchTracks(q, limit: limit, offset: offset),
              pick: (p) => (userSearch || p is! YoutubeProvider) && !exclude.contains(p.id))));

  bool get youtubeActive => _active.any((p) => p is YoutubeProvider && p.configured);

  Future<List<Track>> radio(List<String> terms) async {
    final r = _active.whereType<RadioProvider>().firstOrNull;
    return r == null ? [] : _filter(await r.stations(terms));
  }

  Future<List<Track>> youtubeChart() async {
    final y = _active.whereType<YoutubeProvider>().where((p) => p.configured).firstOrNull;
    return y == null ? [] : _filter(await y.trending());
  }

  /// Most played full-length Hindi/Indian tracks across several Hindi searches (home screen).
  Future<List<Track>> hindiHits({int limit = 20}) async {
    final pool = <Track>[];
    final seen = <String>{};
    Object? error;
    for (final q in const ['hindi', 'bollywood', 'hindi song', 'arijit singh']) {
      try {
        for (final t in await searchTracks(q, exclude: const {'archive', 'radio'})) {
          if (t.duration >= 90 && t.duration <= 600 && seen.add(t.key)) pool.add(t);
        }
      } catch (e) {
        error = e;
      }
    }
    if (pool.isEmpty && error != null) throw error;
    pool.sort((a, b) => b.playCount.compareTo(a.playCount));
    return [...pool.where(isHindiLeaning), ...pool.where((t) => !isHindiLeaning(t))].take(limit).toList();
  }
  Future<List<Artist>> searchArtists(String q) => _fan((p) => p.searchArtists(q));
  Future<List<Collection>> searchCollections(String q) => _fan((p) => p.searchCollections(q));
  Future<List<Track>> trending({String? genre, int limit = 20, int offset = 0}) async =>
      _filter(await _fan((p) => p.trending(genre: genre, limit: limit, offset: offset), pick: (p) => p is! YoutubeProvider));
  Future<List<Collection>> trendingCollections() => _fan((p) => p.trendingCollections());

  Future<List<Track>> categoryTracks(Category c, {int limit = 20, int offset = 0}) async {
    if (c.youtubeChart) return offset > 0 ? [] : youtubeChart();
    if (c.radioTerms.isNotEmpty) return offset > 0 ? [] : radio(c.radioTerms);
    if (c.trending) return trending(limit: limit, offset: offset);
    if (c.genre != null) return trending(genre: c.genre, limit: limit, offset: offset);
    final all = <Track>[];
    for (final q in c.queries) {
      try {
        all.addAll(await searchTracks(q, limit: limit, offset: offset));
      } catch (_) {
        if (q == c.queries.last && all.isEmpty) rethrow;
      }
    }
    return _filter(all);
  }

  MusicProvider? _byId(String id) => _active.where((p) => p.id == id).firstOrNull;

  Future<Artist?> artist(String provider, String id) async => _byId(provider)?.artist(id);
  Future<List<Track>> artistTracks(String provider, String id, {int offset = 0}) async =>
      _filter(await _byId(provider)?.artistTracks(id, offset: offset) ?? []);
  Future<Collection?> collection(String provider, String id) async {
    final c = await _byId(provider)?.collection(id);
    if (c == null) return null;
    return Collection(provider: c.provider, id: c.id, title: c.title, ownerName: c.ownerName, isAlbum: c.isAlbum, artwork: c.artwork, trackCount: c.trackCount, tracks: _filter(c.tracks));
  }
}

class _DemoFlag {
  final _ctrl = StreamController<bool>.broadcast();
  bool _v = false;
  bool get value => _v;
  set value(bool v) {
    if (v == _v) return;
    _v = v;
    _ctrl.add(v);
  }

  Stream<bool> get stream => _ctrl.stream;
}
