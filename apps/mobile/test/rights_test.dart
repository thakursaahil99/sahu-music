import 'package:flutter_test/flutter_test.dart';
import 'package:sahu_music/models.dart';
import 'package:sahu_music/services/music_api.dart';

void main() {
  final audius = AudiusProvider(appName: 'TEST');

  Map<String, dynamic> raw({bool streamable = true, bool gated = false, String? license}) => {
        'id': 'AbC123',
        'title': 'Test song',
        'duration': 200,
        'is_streamable': streamable,
        'is_stream_gated': gated,
        'license': license,
        'user': {'id': 'u1', 'name': 'Tester'},
      };

  test('streamable, ungated Audius track is playable with a stream URL', () {
    final t = audius.mapTrack(raw())!;
    expect(t.playable, isTrue);
    expect(t.streamUrl, contains('/tracks/AbC123/stream'));
    expect(t.rights.advertising, Permission.unconfirmed);
  });

  test('gated or non-streamable tracks are never playable and get no stream URL', () {
    for (final t in [audius.mapTrack(raw(gated: true))!, audius.mapTrack(raw(streamable: false))!]) {
      expect(t.playable, isFalse);
      expect(t.streamUrl, isEmpty);
      expect(t.rights.status, 'rejected');
    }
  });

  test('malformed provider data is dropped', () {
    expect(audius.mapTrack({'id': '../etc', 'title': 'x'}), isNull);
    expect(audius.mapTrack({'title': 'no id'}), isNull);
  });

  test('commercial use is derived from the licence, unknown stays unconfirmed', () {
    expect(commercialUseFromLicense(null), Permission.unconfirmed);
    expect(commercialUseFromLicense('Attribution CC BY'), Permission.allowed);
    expect(commercialUseFromLicense('Attribution-NonCommercial CC BY-NC'), Permission.notAllowed);
    expect(commercialUseFromLicense('All rights reserved'), Permission.notAllowed);
  });

  test('admin blocklist overrides provider approval', () {
    final music = MusicService(providers: [audius]);
    final t = audius.mapTrack(raw())!;
    expect(music.isPlayable(t), isTrue);
    music.blocklist = {t.key};
    expect(music.isPlayable(t), isFalse);
  });

  test('track snapshot JSON round-trips (shared format with the website)', () {
    final t = audius.mapTrack(raw(license: 'CC0'))!;
    final back = Track.fromJson(t.toJson());
    expect(back.key, t.key);
    expect(back.playable, isTrue);
    expect(back.rights.commercialUse, Permission.allowed);
  });

  test('demo audio is a valid WAV', () {
    final wav = DemoProvider.synthWav(120, 220, [0, 4, 7, -99]);
    expect(String.fromCharCodes(wav.sublist(0, 4)), 'RIFF');
    expect(String.fromCharCodes(wav.sublist(8, 12)), 'WAVE');
    expect(wav.length, greaterThan(44));
  });

  test('search ranking: the typed song name comes first, unrelated results are dropped', () {
    Track t(String title, {int duration = 240, String? tags, int plays = 100}) => Track(
          provider: 'audius',
          providerTrackId: title.hashCode.toString() + duration.toString(),
          title: title,
          artist: 'Someone',
          streamUrl: 'https://api.audius.co/v1/tracks/x/stream',
          duration: duration,
          tags: tags,
          playCount: plays,
          rights: const TrackRights(status: 'approved', streamingPermitted: true, commercialUse: Permission.unconfirmed, advertising: Permission.unconfirmed, license: null, basis: 'test'),
        );
    final ranked = rankSearch('lag ja gale', [t('Hold Me Now'), t('Random EDM Banger', plays: 90000), t('Lag Ja Gale'), t('Lag_Jaa_Gale_ke_Phir_Ye_Haseen_Raat')]);
    expect(ranked.map((x) => x.title).toList(), ['Lag Ja Gale', 'Lag_Jaa_Gale_ke_Phir_Ye_Haseen_Raat']);

    // short words are whole-word matches, clips sink below full songs
    expect(rankSearch('kal ho na ho', [t('Hologram Nation Kalimba'), t('Kal Ho Na Ho')]).map((x) => x.title).toList(), ['Kal Ho Na Ho']);
    expect(rankSearch('tum hi ho', [t('Tum Hi Ho', duration: 28), t('Tum Hi Ho', duration: 262)]).first.duration, 262);

    expect(isHindiLeaning(t('Dil', tags: 'Hindi,Bollywood')), isTrue);
    expect(isHindiLeaning(t('Summer Nights')), isFalse);
    expect(normalizeText('Lag_Jaa-Gale!!'), 'lag ja gale');
  });
}
