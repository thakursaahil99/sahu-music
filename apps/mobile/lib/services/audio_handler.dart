import 'dart:async';
import 'dart:math';

import 'package:audio_service/audio_service.dart';
import 'package:just_audio/just_audio.dart';

import '../models.dart';

/// Background audio + lock-screen / notification controls.
///
/// just_audio plays the stream; audio_service exposes it to the OS so playback
/// continues in the background and can be controlled from the lock screen,
/// notification shade, headset buttons, Android Auto / CarPlay.
class SahuAudioHandler extends BaseAudioHandler with SeekHandler {
  SahuAudioHandler() {
    _player.playbackEventStream.listen((_) => _broadcast(), onError: (Object _, StackTrace _) => _onPlayerError());
    _player.playerStateStream.listen((s) {
      _broadcast();
      if (s.processingState == ProcessingState.completed) _onCompleted();
    });
  }

  final _player = AudioPlayer();
  final _rng = Random();
  List<Track> _tracks = [];
  int _index = -1;
  int _failures = 0;

  /// Final rights gate, injected by the app (provider rights + admin blocklist).
  bool Function(Track t) canPlay = (t) => t.playable;
  bool autoplayNext = true;
  void Function(Track t)? onTrackStarted;
  void Function(String message)? onError;

  final _tracksCtrl = StreamController<List<Track>>.broadcast();
  final _currentCtrl = StreamController<Track?>.broadcast();

  List<Track> get tracks => List.unmodifiable(_tracks);
  int get index => _index;
  Track? get current => _index >= 0 && _index < _tracks.length ? _tracks[_index] : null;
  Stream<List<Track>> get tracksStream => _tracksCtrl.stream;
  Stream<Track?> get currentStream => _currentCtrl.stream;
  Stream<Duration> get positionStream => _player.positionStream;
  Stream<Duration?> get durationStream => _player.durationStream;
  Duration get position => _player.position;
  Duration? get duration => _player.duration;

  MediaItem _item(Track t) => MediaItem(
        id: t.key,
        title: t.title,
        artist: t.artist,
        album: 'SAHU MUSIC',
        duration: t.duration > 0 ? Duration(seconds: t.duration) : null,
        artUri: (t.artworkLarge ?? t.artwork) != null ? Uri.tryParse((t.artworkLarge ?? t.artwork)!) : null,
      );

  void _broadcast() {
    final playing = _player.playing;
    playbackState.add(playbackState.value.copyWith(
      controls: [
        MediaControl.skipToPrevious,
        if (playing) MediaControl.pause else MediaControl.play,
        MediaControl.skipToNext,
      ],
      systemActions: const {MediaAction.seek, MediaAction.seekForward, MediaAction.seekBackward},
      androidCompactActionIndices: const [0, 1, 2],
      processingState: switch (_player.processingState) {
        ProcessingState.idle => AudioProcessingState.idle,
        ProcessingState.loading => AudioProcessingState.loading,
        ProcessingState.buffering => AudioProcessingState.buffering,
        ProcessingState.ready => AudioProcessingState.ready,
        ProcessingState.completed => AudioProcessingState.completed,
      },
      playing: playing,
      updatePosition: _player.position,
      bufferedPosition: _player.bufferedPosition,
      speed: _player.speed,
      queueIndex: _index < 0 ? null : _index,
    ));
  }

  void _publishQueue() {
    queue.add(_tracks.map(_item).toList());
    _tracksCtrl.add(tracks);
  }

  /// Replace the queue and start playing at [startIndex].
  Future<void> playTracks(List<Track> list, int startIndex) async {
    _tracks = list.where(canPlay).toList();
    if (_tracks.isEmpty) {
      onError?.call('This track is not available for streaming.');
      return;
    }
    final wanted = list[startIndex.clamp(0, list.length - 1)];
    final i = _tracks.indexWhere((t) => t.key == wanted.key);
    _publishQueue();
    await _load(i < 0 ? 0 : i);
  }

  Future<void> _load(int i, {bool autoplay = true}) async {
    if (i < 0 || i >= _tracks.length) return;
    final t = _tracks[i];
    if (!canPlay(t)) {
      onError?.call('This track is not available for streaming.');
      return;
    }
    _index = i;
    mediaItem.add(_item(t));
    _currentCtrl.add(t);
    try {
      final uri = Uri.parse(t.streamUrl);
      if (uri.scheme == 'file') {
        await _player.setFilePath(uri.toFilePath());
      } else {
        await _player.setUrl(t.streamUrl);
      }
      _failures = 0;
      final d = _player.duration;
      if (d != null) mediaItem.add(_item(t).copyWith(duration: d));
      if (autoplay) {
        onTrackStarted?.call(t);
        unawaited(_player.play());
      }
    } on PlayerInterruptedException {
      // another track was requested before this one finished loading
    } catch (_) {
      _onPlayerError();
    }
  }

  void _onPlayerError() {
    _failures++;
    if (_failures <= 2 && _tracks.length > 1) {
      onError?.call('Could not play this track. Skipping…');
      unawaited(skipToNext());
    } else {
      onError?.call('This track could not be played. Check your connection.');
      unawaited(_player.stop());
    }
  }

  void _onCompleted() {
    final repeat = playbackState.value.repeatMode;
    if (repeat == AudioServiceRepeatMode.one) {
      unawaited(_player.seek(Duration.zero).then((_) => _player.play()));
    } else if (autoplayNext || repeat == AudioServiceRepeatMode.all) {
      unawaited(_advance(auto: true));
    }
  }

  Future<void> _advance({required bool auto}) async {
    if (_tracks.isEmpty) return;
    final shuffle = playbackState.value.shuffleMode == AudioServiceShuffleMode.all;
    var next = _index + 1;
    if (shuffle && _tracks.length > 1) {
      do {
        next = _rng.nextInt(_tracks.length);
      } while (next == _index);
    }
    if (next >= _tracks.length) {
      if (playbackState.value.repeatMode == AudioServiceRepeatMode.all || !auto) {
        next = 0;
      } else {
        await _player.pause();
        await _player.seek(Duration.zero);
        return;
      }
    }
    await _load(next);
  }

  @override
  Future<void> play() => _player.play();
  @override
  Future<void> pause() => _player.pause();
  @override
  Future<void> seek(Duration position) => _player.seek(position);
  @override
  Future<void> skipToNext() => _advance(auto: false);

  @override
  Future<void> skipToPrevious() async {
    if (_player.position > const Duration(seconds: 3) || _index <= 0) {
      await _player.seek(Duration.zero);
    } else {
      await _load(_index - 1);
    }
  }

  @override
  Future<void> skipToQueueItem(int index) => _load(index);

  @override
  Future<void> setShuffleMode(AudioServiceShuffleMode shuffleMode) async =>
      playbackState.add(playbackState.value.copyWith(shuffleMode: shuffleMode));

  @override
  Future<void> setRepeatMode(AudioServiceRepeatMode repeatMode) async =>
      playbackState.add(playbackState.value.copyWith(repeatMode: repeatMode));

  Future<void> toggleShuffle() => setShuffleMode(
      playbackState.value.shuffleMode == AudioServiceShuffleMode.all ? AudioServiceShuffleMode.none : AudioServiceShuffleMode.all);

  Future<void> cycleRepeat() => setRepeatMode(switch (playbackState.value.repeatMode) {
        AudioServiceRepeatMode.none => AudioServiceRepeatMode.all,
        AudioServiceRepeatMode.all => AudioServiceRepeatMode.one,
        _ => AudioServiceRepeatMode.none,
      });

  Future<void> addToQueue(Track t) async {
    if (!canPlay(t)) return onError?.call('This track is not available for streaming.');
    if (_tracks.any((x) => x.key == t.key)) return;
    if (_tracks.isEmpty) return playTracks([t], 0);
    _tracks = [..._tracks, t];
    _publishQueue();
  }

  Future<void> playNext(Track t) async {
    if (!canPlay(t)) return onError?.call('This track is not available for streaming.');
    if (_tracks.isEmpty) return playTracks([t], 0);
    if (current?.key == t.key) return;
    final cur = current!;
    final rest = _tracks.where((x) => x.key != t.key).toList();
    final ci = rest.indexWhere((x) => x.key == cur.key);
    rest.insert(ci + 1, t);
    _tracks = rest;
    _index = ci;
    _publishQueue();
  }

  Future<void> removeAt(int i) async {
    if (i < 0 || i >= _tracks.length) return;
    final wasCurrent = i == _index;
    _tracks = [..._tracks]..removeAt(i);
    if (_tracks.isEmpty) {
      _index = -1;
      await _player.stop();
      mediaItem.add(null);
      _currentCtrl.add(null);
    } else if (wasCurrent) {
      await _load(min(i, _tracks.length - 1), autoplay: _player.playing);
    } else if (i < _index) {
      _index--;
    }
    _publishQueue();
    _broadcast();
  }

  @override
  Future<void> stop() async {
    await _player.stop();
    await super.stop();
  }

  @override
  Future<void> onTaskRemoved() async {
    // Swiping the app away while paused ends the session; while playing, music continues.
    if (!_player.playing) await stop();
  }
}
