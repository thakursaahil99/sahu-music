import 'package:flutter_test/flutter_test.dart';
import 'package:sahu_music/models.dart';
import 'package:sahu_music/services/sources.dart';

Map<String, dynamic> video(String id, {Map<String, dynamic> status = const {}, String duration = 'PT4M22S', String channel = 'T-Series', String? rating}) => {
      'id': id,
      'snippet': {
        'title': 'Tum Hi Ho &amp; More',
        'channelTitle': channel,
        'liveBroadcastContent': 'none',
        'thumbnails': {'high': {'url': 'https://i.ytimg.com/vi/$id/hqdefault.jpg'}},
      },
      'contentDetails': {'duration': duration, if (rating != null) 'contentRating': {'ytRating': rating}},
      'status': {'embeddable': true, 'privacyStatus': 'public', ...status},
      'statistics': {'viewCount': '1000'},
    };

void main() {
  final yt = YoutubeProvider(apiKey: 'AIzaTESTKEY_0123456789abcdefghij');

  test('YouTube: embeddable song-length videos become playable video tracks', () {
    final list = yt.mapVideos([
      video('aaaaaaaaaaa'),
      video('bbbbbbbbbbb', status: {'embeddable': false}),
      video('ccccccccccc', duration: 'PT40S'),
      video('ddddddddddd', rating: 'ytAgeRestricted'),
      video('eeeeeeeeeee', channel: 'Bob Covers'),
      {'id': '../bad', 'snippet': {}},
    ]);
    expect(list.map((t) => t.providerTrackId).toList(), ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ddddddddddd', 'eeeeeeeeeee']);
    final ok = list.first;
    expect(ok.video, isTrue);
    expect(ok.official, isTrue);
    expect(ok.title, 'Tum Hi Ho & More');
    expect(ok.duration, 262);
    expect(ok.playable, isTrue);
    expect(list[1].playable, isFalse); // owner does not allow embedding
    expect(list[2].playable, isFalse); // age restricted
    expect(list[3].official, isFalse);
  });

  test('YouTube: needs a key; durations and official channels', () {
    expect(YoutubeProvider(apiKey: '').configured, isFalse);
    expect(yt.configured, isTrue);
    expect(YoutubeProvider.parseIsoDuration('PT1H2M3S'), 3723);
    expect(YoutubeProvider.parseIsoDuration('nonsense'), 0);
    expect(YoutubeProvider.isOfficialChannel('Arijit Singh - Topic'), isTrue);
    expect(YoutubeProvider.isOfficialChannel('Zee Music Company'), isTrue);
    expect(YoutubeProvider.isOfficialChannel('Some Uploader'), isFalse);
  });

  test('live and video flags survive the library JSON round trip', () {
    const rights = TrackRights(status: 'approved', streamingPermitted: true, commercialUse: Permission.unconfirmed, advertising: Permission.unconfirmed, license: null, basis: 'x');
    const radio = Track(provider: 'radio', providerTrackId: 'r1', title: 'Bollywood FM', artist: 'Live radio', streamUrl: 'https://s.example/1.mp3', duration: 0, live: true, rights: rights);
    const vid = Track(provider: 'youtube', providerTrackId: 'aaaaaaaaaaa', title: 'Song', artist: 'T-Series', streamUrl: 'https://www.youtube.com/watch?v=aaaaaaaaaaa', duration: 262, video: true, official: true, rights: rights);
    expect(Track.fromJson(radio.toJson()).live, isTrue);
    final back = Track.fromJson(vid.toJson());
    expect(back.video, isTrue);
    expect(back.official, isTrue);
    expect(back.playable, isTrue);
  });

  test('categories include live radio and the YouTube chart', () {
    expect(categories.where((c) => c.radioTerms.isNotEmpty).map((c) => c.slug), containsAll(['bollywood-radio', 'retro-radio', 'bhakti-radio']));
    expect(categories.firstWhere((c) => c.slug == 'bollywood-top').youtubeChart, isTrue);
  });
}
