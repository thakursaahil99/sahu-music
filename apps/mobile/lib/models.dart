/// Domain models – mirror `packages/models` used by the website so that
/// snapshots stored in the account backend are interchangeable between platforms.
library;

enum Permission { allowed, notAllowed, unconfirmed }

Permission _perm(String? s) => switch (s) {
      'allowed' => Permission.allowed,
      'not_allowed' => Permission.notAllowed,
      _ => Permission.unconfirmed,
    };

String _permStr(Permission p) => switch (p) {
      Permission.allowed => 'allowed',
      Permission.notAllowed => 'not_allowed',
      Permission.unconfirmed => 'unconfirmed',
    };

String permissionLabel(Permission p) => switch (p) {
      Permission.allowed => 'Allowed',
      Permission.notAllowed => 'Not allowed',
      Permission.unconfirmed => 'Unconfirmed',
    };

class TrackRights {
  const TrackRights({
    required this.status,
    required this.streamingPermitted,
    required this.commercialUse,
    required this.advertising,
    required this.license,
    required this.basis,
  });

  /// approved | pending | rejected | blocked
  final String status;
  final bool streamingPermitted;
  final Permission commercialUse;
  final Permission advertising;
  final String? license;
  final String basis;

  factory TrackRights.fromJson(Map<String, dynamic> j) => TrackRights(
        status: j['status'] as String? ?? 'rejected',
        streamingPermitted: j['streamingPermitted'] == true,
        commercialUse: _perm(j['commercialUse'] as String?),
        advertising: _perm(j['advertising'] as String?),
        license: j['license'] as String?,
        basis: j['basis'] as String? ?? '',
      );

  Map<String, dynamic> toJson() => {
        'status': status,
        'streamingPermitted': streamingPermitted,
        'commercialUse': _permStr(commercialUse),
        'advertising': _permStr(advertising),
        'license': license,
        'basis': basis,
      };
}

class Track {
  const Track({
    required this.provider,
    required this.providerTrackId,
    required this.title,
    required this.artist,
    required this.streamUrl,
    required this.duration,
    required this.rights,
    this.artistId,
    this.artwork,
    this.artworkLarge,
    this.genre,
    this.permalink,
    this.tags,
    this.playCount = 0,
    this.live = false,
    this.video = false,
    this.official = false,
  });

  final String provider;
  final String providerTrackId;
  final String title;
  final String artist;
  final String? artistId;
  final String? artwork;
  final String? artworkLarge;
  final String streamUrl;
  final int duration; // seconds
  final String? genre;
  final String? permalink;
  final String? tags;
  final int playCount;
  /// Live radio: no fixed length, no seeking.
  final bool live;
  /// Plays in YouTube's official video player (separate screen, never in the background).
  final bool video;
  /// From the label's or artist's own channel.
  final bool official;
  final TrackRights rights;

  String get key => '$provider:$providerTrackId';

  /// Rights gate: only tracks with confirmed streaming permission are playable.
  bool get playable => streamUrl.isNotEmpty && rights.streamingPermitted && rights.status == 'approved';

  factory Track.fromJson(Map<String, dynamic> j) => Track(
        provider: j['provider'] as String? ?? '',
        providerTrackId: '${j['providerTrackId'] ?? ''}',
        title: j['title'] as String? ?? '',
        artist: j['artist'] as String? ?? 'Unknown artist',
        artistId: j['artistId'] as String?,
        artwork: j['artwork'] as String?,
        artworkLarge: j['artworkLarge'] as String?,
        streamUrl: j['streamUrl'] as String? ?? '',
        duration: (j['duration'] as num?)?.round() ?? 0,
        genre: j['genre'] as String?,
        permalink: j['permalink'] as String?,
        tags: j['tags'] as String?,
        playCount: (j['playCount'] as num?)?.toInt() ?? 0,
        live: j['live'] == true,
        video: j['video'] == true,
        official: j['official'] == true,
        rights: TrackRights.fromJson((j['rights'] as Map?)?.cast<String, dynamic>() ?? const {}),
      );

  Map<String, dynamic> toJson() => {
        'provider': provider,
        'providerTrackId': providerTrackId,
        'title': title,
        'artist': artist,
        'artistId': artistId,
        'artwork': artwork,
        'artworkLarge': artworkLarge,
        'streamUrl': streamUrl,
        'duration': duration,
        'genre': genre,
        'permalink': permalink,
        'tags': tags,
        'playCount': playCount,
        if (live) 'live': true,
        if (video) 'video': true,
        if (official) 'official': true,
        'rights': rights.toJson(),
      };
}

class Artist {
  const Artist({required this.provider, required this.id, required this.name, this.image, this.bio, this.followers = 0, this.verified = false});
  final String provider;
  final String id;
  final String name;
  final String? image;
  final String? bio;
  final int followers;
  final bool verified;
}

class Collection {
  const Collection({
    required this.provider,
    required this.id,
    required this.title,
    required this.ownerName,
    required this.isAlbum,
    this.artwork,
    this.trackCount = 0,
    this.tracks = const [],
  });
  final String provider;
  final String id;
  final String title;
  final String ownerName;
  final bool isAlbum;
  final String? artwork;
  final int trackCount;
  final List<Track> tracks;
}

class UserPlaylist {
  const UserPlaylist({required this.id, required this.title, required this.tracks, required this.createdAt});
  final String id;
  final String title;
  final List<Track> tracks;
  final String createdAt;

  UserPlaylist copyWith({String? title, List<Track>? tracks}) =>
      UserPlaylist(id: id, title: title ?? this.title, tracks: tracks ?? this.tracks, createdAt: createdAt);

  factory UserPlaylist.fromJson(Map<String, dynamic> j) => UserPlaylist(
        id: j['id'] as String,
        title: j['title'] as String? ?? 'Playlist',
        createdAt: j['createdAt'] as String? ?? '',
        tracks: ((j['tracks'] as List?) ?? const []).map((e) => Track.fromJson((e as Map).cast<String, dynamic>())).toList(),
      );

  Map<String, dynamic> toJson() => {'id': id, 'title': title, 'createdAt': createdAt, 'tracks': tracks.map((t) => t.toJson()).toList()};
}

/// How a SAHU MUSIC category is filled from provider APIs (never hard-coded songs).
class Category {
  const Category(this.slug, this.name, this.blurb, this.color,
      {this.genre, this.queries = const [], this.trending = false, this.radioTerms = const [], this.youtubeChart = false});
  final String slug;
  final String name;
  final String blurb;
  final int color;
  final String? genre;
  final List<String> queries;
  final bool trending;
  /// Live radio stations tagged with / named after these terms.
  final List<String> radioTerms;
  /// YouTube's music chart for India (needs a YouTube key).
  final bool youtubeChart;
}

const categories = <Category>[
  Category('bollywood-top', 'Bollywood Top Songs', 'Original film songs trending in India, in YouTube’s official player', 0xFFB3122E, youtubeChart: true),
  Category('bollywood-radio', 'Bollywood Radio', 'Live Bollywood stations playing full songs non-stop', 0xFF7A1F5A, radioTerms: ['bollywood', 'hindi']),
  Category('retro-radio', 'Retro Hindi Radio', 'Live stations for 90s and golden-era Hindi songs', 0xFF5B3A12,
      radioTerms: ['bollywood 90s', 'retro bollywood', 'purane', 'old hindi', 'kishore', 'rafi', 'lata', 'mukesh']),
  Category('bhakti-radio', 'Bhakti Radio', 'Live bhajan and devotional stations', 0xFF8A5A0F, radioTerms: ['bhajan', 'devotional', 'hindu', 'bhakti']),
  Category('hindi', 'Hindi', 'Hindi tracks from independent creators', 0xFF7A5A12, queries: ['hindi', 'hindi song']),
  Category('bollywood', 'Bollywood', 'Bollywood-inspired originals shared by creators', 0xFF7A1F3D, queries: ['bollywood', 'bollywood remix']),
  Category('punjabi', 'Punjabi', 'Punjabi beats and bhangra', 0xFF8A4B0F, queries: ['punjabi', 'bhangra']),
  Category('haryanvi', 'Haryanvi', 'Haryanvi sounds', 0xFF2F5D2A, queries: ['haryanvi']),
  Category('english', 'English', 'Pop from around the world', 0xFF1F3F7A, genre: 'Pop'),
  Category('old-hindi', 'Old Hindi', 'Retro and classic Hindi flavours', 0xFF5B4636, queries: ['old hindi', 'old hindi songs']),
  Category('90s-classics', '90s Classics', 'Tracks tagged with the 90s sound', 0xFF4A2B7A, queries: ['90s hindi', '90s']),
  Category('2000s-hits', '2000s Hits', 'Tracks tagged with the 2000s sound', 0xFF0F5B6B, queries: ['2000s']),
  Category('romantic', 'Romantic', 'Love songs', 0xFF8A1F4F, queries: ['romantic', 'love song']),
  Category('sad', 'Sad', 'For the quiet hours', 0xFF2B3A55, queries: ['sad']),
  Category('party', 'Party', 'Turn it up', 0xFF7A1F7A, queries: ['party']),
  Category('devotional', 'Devotional', 'Bhajans, kirtan and spiritual music', 0xFF8A6A0F, genre: 'Devotional'),
  Category('independent-artists', 'Independent Artists', 'Trending from independent artists', 0xFFA8842F, trending: true),
];

String formatDuration(Duration d) {
  final s = d.inSeconds < 0 ? 0 : d.inSeconds;
  final m = s ~/ 60, sec = (s % 60).toString().padLeft(2, '0');
  return m >= 60 ? '${m ~/ 60}:${(m % 60).toString().padLeft(2, '0')}:$sec' : '$m:$sec';
}
