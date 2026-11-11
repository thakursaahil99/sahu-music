import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../models.dart';
import 'music_api.dart';

/// Shared HTTP helper for the extra sources: timeout, small memory cache, clear errors.
class _Http {
  _Http(this.provider, {this.cacheFor = const Duration(minutes: 30)});
  final String provider;
  final Duration cacheFor;
  final _client = http.Client();
  final _cache = <String, (DateTime, dynamic)>{};

  Future<dynamic> getJson(Uri uri, {Map<String, String>? headers, Duration timeout = const Duration(seconds: 12)}) async {
    final key = uri.toString();
    final hit = _cache[key];
    if (hit != null && DateTime.now().difference(hit.$1) < cacheFor) return hit.$2;
    try {
      final res = await _client.get(uri, headers: {'Accept': 'application/json', ...?headers}).timeout(timeout);
      if (res.statusCode != 200) throw ApiException('$provider responded ${res.statusCode}', status: res.statusCode, endpoint: uri.path);
      final data = jsonDecode(res.body);
      if (_cache.length > 100) _cache.remove(_cache.keys.first);
      _cache[key] = (DateTime.now(), data);
      return data;
    } on TimeoutException {
      throw ApiException('$provider request timed out', endpoint: uri.path);
    } on SocketException {
      throw ApiException('No internet connection', endpoint: uri.path);
    } on http.ClientException {
      throw ApiException('Network error contacting $provider', endpoint: uri.path);
    }
  }
}

mixin _NoCollections implements MusicProvider {
  @override
  Future<List<Artist>> searchArtists(String query, {int limit = 10}) async => [];
  @override
  Future<List<Collection>> searchCollections(String query, {int limit = 10}) async => [];
  @override
  Future<List<Collection>> trendingCollections({int limit = 10}) async => [];
  @override
  Future<Artist?> artist(String id) async => null;
  @override
  Future<List<Track>> artistTracks(String id, {int limit = 20, int offset = 0}) async => [];
  @override
  Future<Collection?> collection(String id) async => null;
}

TrackRights _rights(bool ok, String basis, {String? license}) => TrackRights(
      status: ok ? 'approved' : 'rejected',
      streamingPermitted: ok,
      commercialUse: commercialUseFromLicense(license),
      advertising: Permission.unconfirmed,
      license: license,
      basis: ok ? basis : 'Not playable: the provider did not confirm streaming permission.',
    );

// ── Live radio (Radio Browser directory, free, no key) ───────────────
class RadioProvider with _NoCollections implements MusicProvider {
  static final _uuid = RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', caseSensitive: false);
  static const _basis =
      'Live broadcast stream published by the radio station itself and listed in the Radio Browser directory. The station is responsible for its broadcast licences.';
  final _http = _Http('Radio Browser');

  @override
  String get id => 'radio';
  @override
  String get name => 'Live radio';

  Future<List<Track>> _stations(Map<String, String> params) async {
    final uri = Uri.https('de1.api.radio-browser.info', '/json/stations/search', {'hidebroken': 'true', 'order': 'clickcount', 'reverse': 'true', ...params});
    final rows = await _http.getJson(uri, headers: {'User-Agent': 'SAHU_MUSIC/1.0'});
    return rows is List ? rows.map(_map).whereType<Track>().toList() : <Track>[];
  }

  Track? _map(dynamic r) {
    if (r is! Map) return null;
    final id = '${r['stationuuid'] ?? ''}'.toLowerCase();
    final url = '${r['url_resolved'] ?? ''}'.trim();
    if (!_uuid.hasMatch(id) || r['name'] == null || !url.startsWith('https://') || r['hls'] == 1) return null;
    final ok = r['lastcheckok'] == 1;
    final favicon = '${r['favicon'] ?? ''}';
    final place = [r['state'], r['country']].where((x) => x is String && x.isNotEmpty).join(', ');
    return Track(
      provider: 'radio',
      providerTrackId: id,
      title: '${r['name']}'.trim(),
      artist: place.isEmpty ? 'Live radio' : 'Live radio · $place',
      artwork: favicon.startsWith('https://') ? favicon : null,
      streamUrl: ok ? url : '',
      duration: 0,
      live: true,
      genre: 'Radio',
      tags: r['tags'] is String ? r['tags'] as String : null,
      playCount: (r['clickcount'] as num?)?.toInt() ?? 0,
      rights: _rights(ok, _basis),
    );
  }

  List<Track> _dedupe(Iterable<Track> all, int limit) {
    final ids = <String>{};
    final names = <String>{};
    final out = all.where((t) => ids.add(t.providerTrackId) && names.add(t.title.toLowerCase())).toList()
      ..sort((a, b) => b.playCount.compareTo(a.playCount));
    return out.take(limit).toList();
  }

  /// Stations tagged with, or named after, any of the terms.
  Future<List<Track>> stations(List<String> terms, {int limit = 30}) async {
    final lists = await Future.wait([
      for (final term in terms) ...[
        _stations({'tag': term.toLowerCase(), 'limit': '40'}).catchError((_) => <Track>[]),
        _stations({'name': term, 'limit': '20'}).catchError((_) => <Track>[]),
      ],
    ]);
    return _dedupe(lists.expand((l) => l), limit);
  }

  @override
  Future<List<Track>> searchTracks(String query, {int limit = 20, int offset = 0}) async {
    final q = query.trim();
    if (q.length < 3 || offset > 0) return [];
    final lists = await Future.wait([
      _stations({'name': q, 'limit': '15'}).catchError((_) => <Track>[]),
      _stations({'tag': q.toLowerCase(), 'limit': '15'}).catchError((_) => <Track>[]),
    ]);
    return _dedupe(lists.expand((l) => l), 12);
  }

  @override
  Future<List<Track>> trending({String? genre, int limit = 20, int offset = 0}) async => [];
}

// ── Internet Archive (free, no key, openly licensed items only) ───────
class ArchiveProvider with _NoCollections implements MusicProvider {
  static final _item = RegExp(r'^[A-Za-z0-9._-]{1,100}$');
  static final _open = RegExp(r'creativecommons\.org/(licenses|publicdomain)/', caseSensitive: false);
  final _http = _Http('Internet Archive', cacheFor: const Duration(hours: 1));

  @override
  String get id => 'archive';
  @override
  String get name => 'Internet Archive';

  static String _text(dynamic v) => (v is List ? v.join(', ') : v is String ? v : '').trim();
  static int _seconds(dynamic len) {
    final s = '${len ?? ''}';
    if (s.contains(':')) return s.split(':').fold(0, (acc, p) => acc * 60 + (int.tryParse(p) ?? 0));
    return (double.tryParse(s) ?? 0).round();
  }

  Future<List<Track>> _itemTracks(String identifier) async {
    if (!_item.hasMatch(identifier)) return [];
    final j = await _http.getJson(Uri.https('archive.org', '/metadata/$identifier'), timeout: const Duration(seconds: 15));
    if (j is! Map) return [];
    final md = (j['metadata'] as Map?) ?? const {};
    final licence = _text(md['licenseurl']);
    if (!_open.hasMatch(licence) || md['access-restricted-item'] == 'true' || md['mediatype'] != 'audio') return [];
    final files = (j['files'] as List?) ?? const [];
    bool isMp3(dynamic f) => f is Map && f['name'] is String && '${f['format'] ?? ''}'.toLowerCase().contains('mp3');
    final originals = files.where((f) => isMp3(f) && f['source'] == 'original').toList();
    final pick = (originals.isNotEmpty ? originals : files.where(isMp3).toList()).take(8);
    final album = _text(md['title']).isEmpty ? identifier : _text(md['title']);
    final creator = _text(md['creator']);
    final seen = <String>{};
    final out = <Track>[];
    for (final f in pick) {
      final duration = _seconds(f['length']);
      if (duration < 45 || duration > 25 * 60) continue;
      final name = f['name'] as String;
      final title = (_text(f['title']).isEmpty ? name.replaceAll(RegExp(r'\.[a-z0-9]+$', caseSensitive: false), '').replaceAll(RegExp(r'[_-]+'), ' ') : _text(f['title']))
          .replaceAll(RegExp(r'\s+vbr$', caseSensitive: false), '')
          .trim();
      if (title.isEmpty || !seen.add(title.toLowerCase())) continue;
      final artist = creator.isNotEmpty && creator.toLowerCase() != album.toLowerCase() ? creator : 'Internet Archive';
      out.add(Track(
        provider: 'archive',
        providerTrackId: base64Url.encode(utf8.encode('$identifier/$name')).replaceAll('=', ''),
        title: title,
        artist: artist,
        artwork: 'https://archive.org/services/img/$identifier',
        streamUrl: 'https://archive.org/download/$identifier/${name.split('/').map(Uri.encodeComponent).join('/')}',
        duration: duration,
        tags: _text(md['subject']),
        permalink: 'https://archive.org/details/$identifier',
        rights: _rights(
          true,
          'Uploaded to the Internet Archive with an open licence declared by the uploader ($licence). Admins can block any item.',
          license: licence,
        ),
      ));
    }
    return out;
  }

  @override
  Future<List<Track>> searchTracks(String query, {int limit = 20, int offset = 0}) async {
    final q = query.replaceAll(RegExp(r'[^\p{L}\p{N} ]+', unicode: true), ' ').replaceAll(RegExp(r'\s+'), ' ').trim();
    if (q.length < 2) return [];
    final lucene = '(title:($q) OR subject:($q) OR creator:($q)) AND mediatype:audio AND licenseurl:*creativecommons.org*';
    final uri = Uri.https('archive.org', '/advancedsearch.php', {
      'q': lucene,
      'fl[]': 'identifier',
      'rows': '5',
      'start': '${offset ~/ 8}',
      'sort[]': 'downloads desc',
      'output': 'json',
    });
    final j = await _http.getJson(uri);
    final response = j is Map ? j['response'] : null;
    final docs = (response is Map ? response['docs'] as List? : null) ?? const [];
    final lists = await Future.wait(docs.map((d) => _itemTracks('${(d as Map)['identifier'] ?? ''}').catchError((_) => <Track>[])));
    return lists.expand((l) => l).toList();
  }

  @override
  Future<List<Track>> trending({String? genre, int limit = 20, int offset = 0}) async => [];
}

// ── YouTube (official API + official embedded player; needs a free key) ─
class YoutubeProvider with _NoCollections implements MusicProvider {
  YoutubeProvider({required this.apiKey, this.region = 'IN'});
  final String apiKey;
  final String region;
  final _http = _Http('YouTube', cacheFor: const Duration(hours: 6));
  static final _id = RegExp(r'^[A-Za-z0-9_-]{11}$');
  static const _official = [
    't-series', 'sony music india', 'zee music company', 'saregama music', 'saregama', 'tips official', 'tips music', 'yrf', 'speed records',
    'times music', 'venus', 'shemaroo filmi gaane', 'eros now music', 'white hill music', 'desi music factory', 'aditya music', 'lahari music',
    'goldmines gaane sune ansune', 'ultra bollywood', 'pen music', 'junglee music', 'universal music india', 'warner music india', 'jass records',
  ];
  static const _basis =
      'Played in YouTube’s official embedded player. The video’s owner allows embedding and YouTube’s Terms of Service apply; SAHU MUSIC never stores or extracts the audio.';

  bool get configured => RegExp(r'^[A-Za-z0-9_-]{20,60}$').hasMatch(apiKey);

  @override
  String get id => 'youtube';
  @override
  String get name => 'YouTube';

  static int parseIsoDuration(String? iso) {
    final m = RegExp(r'^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$').firstMatch(iso ?? '');
    if (m == null) return 0;
    int g(int i) => int.tryParse(m.group(i) ?? '') ?? 0;
    return g(1) * 86400 + g(2) * 3600 + g(3) * 60 + g(4);
  }

  static bool isOfficialChannel(String channel) {
    final c = channel.toLowerCase().trim();
    return c.endsWith(' - topic') || c.endsWith('vevo') || _official.any((o) => c == o || c.startsWith('$o '));
  }

  static String _unescape(String s) =>
      s.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>');

  Future<dynamic> _get(String path, Map<String, String> params) async {
    try {
      return await _http.getJson(Uri.https('www.googleapis.com', '/youtube/v3$path', {...params, 'key': apiKey}));
    } on ApiException catch (e) {
      if (e.status == 403) throw ApiException('The YouTube daily quota is used up or the key is restricted. Try again tomorrow.', status: 403, endpoint: e.endpoint);
      rethrow;
    }
  }

  List<Track> mapVideos(dynamic items) {
    final out = <Track>[];
    for (final v in items is List ? items : const []) {
      if (v is! Map || v['id'] is! String || !_id.hasMatch(v['id'] as String)) continue;
      final id = v['id'] as String;
      final sn = (v['snippet'] as Map?) ?? const {};
      final cd = (v['contentDetails'] as Map?) ?? const {};
      final st = (v['status'] as Map?) ?? const {};
      final duration = parseIsoDuration(cd['duration'] as String?);
      if (duration < 60 || duration > 20 * 60) continue;
      if ((sn['liveBroadcastContent'] ?? 'none') != 'none') continue;
      final ok = st['embeddable'] == true && st['privacyStatus'] == 'public' && (cd['contentRating'] as Map?)?['ytRating'] != 'ytAgeRestricted';
      final thumbs = (sn['thumbnails'] as Map?) ?? const {};
      String? thumb(String k) => (thumbs[k] as Map?)?['url'] as String?;
      final channel = '${sn['channelTitle'] ?? ''}';
      out.add(Track(
        provider: 'youtube',
        providerTrackId: id,
        title: _unescape('${sn['title'] ?? 'Untitled'}'),
        artist: channel.replaceAll(RegExp(r' - Topic$'), '').isEmpty ? 'YouTube' : channel.replaceAll(RegExp(r' - Topic$'), ''),
        artwork: thumb('high') ?? thumb('medium') ?? thumb('default'),
        artworkLarge: thumb('maxres') ?? thumb('standard') ?? thumb('high'),
        streamUrl: ok ? 'https://www.youtube.com/watch?v=$id' : '',
        duration: duration,
        video: true,
        official: isOfficialChannel(channel),
        playCount: int.tryParse('${(v['statistics'] as Map?)?['viewCount'] ?? ''}') ?? 0,
        permalink: 'https://www.youtube.com/watch?v=$id',
        rights: _rights(ok, _basis),
      ));
    }
    return out;
  }

  /// Costs 100 quota units: only used for searches the listener typed.
  @override
  Future<List<Track>> searchTracks(String query, {int limit = 20, int offset = 0}) async {
    if (!configured || offset > 0) return [];
    final s = await _get('/search', {
      'part': 'snippet',
      'type': 'video',
      'videoEmbeddable': 'true',
      'videoSyndicated': 'true',
      'videoCategoryId': '10',
      'regionCode': region,
      'relevanceLanguage': 'hi',
      'safeSearch': 'moderate',
      'maxResults': '50',
      'q': query,
    });
    final ids = (((s as Map?)?['items'] as List?) ?? const [])
        .map((i) => ((i as Map)['id'] as Map?)?['videoId'])
        .whereType<String>()
        .where(_id.hasMatch)
        .toList();
    if (ids.isEmpty) return [];
    final v = await _get('/videos', {'part': 'snippet,contentDetails,status,statistics', 'id': ids.join(','), 'maxResults': '50'});
    final byId = {for (final t in mapVideos((v as Map?)?['items'])) t.providerTrackId: t};
    return ids.map((id) => byId[id]).whereType<Track>().toList();
  }

  /// Most popular music videos in the region (1 quota unit).
  @override
  Future<List<Track>> trending({String? genre, int limit = 50, int offset = 0}) async {
    if (!configured || genre != null || offset > 0) return [];
    final v = await _get('/videos', {
      'part': 'snippet,contentDetails,status,statistics',
      'chart': 'mostPopular',
      'videoCategoryId': '10',
      'regionCode': region,
      'maxResults': '50',
    });
    return mapVideos((v as Map?)?['items']).take(limit).toList();
  }
}
