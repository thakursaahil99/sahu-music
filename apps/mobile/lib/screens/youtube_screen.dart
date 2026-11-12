import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:youtube_player_iframe/youtube_player_iframe.dart';

import '../models.dart';
import '../state/app_state.dart';
import '../theme.dart';
import '../widgets.dart';

/// Original film songs in YouTube's OFFICIAL embedded player.
///
/// YouTube's terms: the video stays visible while it plays and playback stops when the app
/// leaves the screen, so this is a separate screen (not the background audio service).
/// Background music from other sources is paused while a video plays.
class YoutubeScreen extends ConsumerStatefulWidget {
  const YoutubeScreen({super.key, required this.tracks, required this.startIndex});
  final List<Track> tracks;
  final int startIndex;

  @override
  ConsumerState<YoutubeScreen> createState() => _YoutubeScreenState();
}

class _YoutubeScreenState extends ConsumerState<YoutubeScreen> with WidgetsBindingObserver {
  late final YoutubePlayerController _ctrl;
  late int _index;
  StreamSubscription<YoutubePlayerValue>? _sub;
  PlayerState _state = PlayerState.unknown;
  String? _error;
  int _failures = 0;

  Track get _current => widget.tracks[_index];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _index = widget.startIndex.clamp(0, widget.tracks.length - 1);
    // only one thing plays at a time
    ref.read(audioHandlerProvider).pause();
    _ctrl = YoutubePlayerController.fromVideoId(
      videoId: _current.providerTrackId,
      autoPlay: true,
      params: const YoutubePlayerParams(showFullscreenButton: true, strictRelatedVideos: true, playsInline: true),
    );
    _sub = _ctrl.listen((v) {
      if (!mounted) return;
      if (v.playerState != _state) setState(() => _state = v.playerState);
      if (v.playerState == PlayerState.playing) _failures = 0;
      if (v.playerState == PlayerState.ended) _go(_index + 1);
      if (v.error != YoutubeError.none) {
        final embed = v.error == YoutubeError.notEmbeddable || v.error == YoutubeError.sameAsNotEmbeddable || v.error == YoutubeError.videoNotFound;
        setState(() => _error = embed ? 'The owner of this video does not allow it to play outside YouTube.' : 'This video could not be played.');
        if (++_failures <= 3 && _index + 1 < widget.tracks.length) _go(_index + 1);
      }
    });
    ref.read(libraryProvider.notifier).addHistory(_current);
  }

  void _go(int i) {
    if (i < 0 || i >= widget.tracks.length) return;
    setState(() {
      _index = i;
      _error = null;
    });
    _ctrl.loadVideoById(videoId: _current.providerTrackId);
    ref.read(libraryProvider.notifier).addHistory(_current);
  }

  /// YouTube does not allow background playback: pause when the app is no longer on screen.
  /// `inactive` keeps playing: the app is still visible then (split screen with another app in
  /// focus, the notification shade pulled down), so the video stays on screen as YouTube requires.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.hidden || state == AppLifecycleState.paused || state == AppLifecycleState.detached) {
      _ctrl.pauseVideo();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _sub?.cancel();
    _ctrl.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = _current;
    final playing = _state == PlayerState.playing || _state == PlayerState.buffering;
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(tooltip: 'Close', icon: const Icon(Icons.keyboard_arrow_down_rounded, size: 32), onPressed: () => Navigator.pop(context)),
        centerTitle: true,
        title: Row(mainAxisSize: MainAxisSize.min, children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(color: const Color(0xFFFF0033), borderRadius: BorderRadius.circular(4)),
            child: const Text('YouTube', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Colors.white)),
          ),
          const SizedBox(width: 8),
          const Text('NOW PLAYING', style: TextStyle(fontSize: 12, letterSpacing: 3, color: Brand.gold, fontWeight: FontWeight.w800)),
        ]),
      ),
      body: SafeArea(
        child: Column(children: [
          // the official player, always visible (16:9, full width)
          YoutubePlayer(controller: _ctrl, backgroundColor: Colors.black),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 8, 0),
            child: Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(t.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 2),
                  Text(t.official ? '${t.artist} · official' : t.artist, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Brand.muted)),
                ]),
              ),
              FavoriteButton(t, size: 26),
            ]),
          ),
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            IconButton(tooltip: 'Previous', iconSize: 38, icon: const Icon(Icons.skip_previous_rounded), onPressed: _index > 0 ? () => _go(_index - 1) : null),
            const SizedBox(width: 12),
            SizedBox(
              width: 64,
              height: 64,
              child: FilledButton(
                style: FilledButton.styleFrom(shape: const CircleBorder(), padding: EdgeInsets.zero),
                onPressed: () => playing ? _ctrl.pauseVideo() : _ctrl.playVideo(),
                child: Icon(playing ? Icons.pause_rounded : Icons.play_arrow_rounded, size: 38, semanticLabel: playing ? 'Pause' : 'Play'),
              ),
            ),
            const SizedBox(width: 12),
            IconButton(tooltip: 'Next', iconSize: 38, icon: const Icon(Icons.skip_next_rounded), onPressed: _index + 1 < widget.tracks.length ? () => _go(_index + 1) : null),
          ]),
          if (_error != null) Padding(padding: const EdgeInsets.symmetric(horizontal: 20), child: Text(_error!, style: const TextStyle(color: Color(0xFFFCA5A5)))),
          const Padding(
            padding: EdgeInsets.fromLTRB(20, 4, 20, 8),
            child: Text('Plays in YouTube’s official player. The video stays on screen and pauses when you leave the app, as YouTube requires.',
                textAlign: TextAlign.center, style: TextStyle(color: Brand.muted, fontSize: 11)),
          ),
          const Divider(height: 1),
          Expanded(
            child: ListView.builder(
              itemCount: widget.tracks.length,
              itemBuilder: (_, i) {
                final x = widget.tracks[i];
                final active = i == _index;
                return ListTile(
                  leading: Artwork(x.artwork, size: 46, radius: 8),
                  title: Text(x.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: FontWeight.w600, color: active ? Brand.gold : Colors.white)),
                  subtitle: Text(x.artist, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Brand.muted, fontSize: 12)),
                  trailing: Text(formatDuration(Duration(seconds: x.duration)), style: const TextStyle(color: Brand.muted, fontSize: 12)),
                  onTap: active ? null : () => _go(i),
                );
              },
            ),
          ),
        ]),
      ),
    );
  }
}
