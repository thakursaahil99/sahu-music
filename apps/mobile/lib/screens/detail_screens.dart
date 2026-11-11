import 'package:audio_service/audio_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models.dart';
import '../state/app_state.dart';
import '../theme.dart';
import '../widgets.dart';

// ── Paged track list (category) ─────────────────────────────────────
class CategoryScreen extends ConsumerStatefulWidget {
  const CategoryScreen(this.category, {super.key});
  final Category category;
  @override
  ConsumerState<CategoryScreen> createState() => _CategoryScreenState();
}

class _CategoryScreenState extends ConsumerState<CategoryScreen> {
  static const _page = 20;
  final _tracks = <Track>[];
  bool _loading = true, _more = false, _hasMore = true;
  String? _error;
  int _offset = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool more = false}) async {
    setState(() {
      more ? _more = true : _loading = true;
      _error = null;
    });
    try {
      final page = await ref.read(musicServiceProvider).categoryTracks(widget.category, limit: _page, offset: _offset);
      final seen = _tracks.map((t) => t.key).toSet();
      final fresh = page.where((t) => seen.add(t.key)).toList();
      if (!mounted) return;
      setState(() {
        _tracks.addAll(fresh);
        _offset += _page;
        _hasMore = fresh.isNotEmpty && page.length >= _page ~/ 2;
      });
    } catch (e) {
      if (mounted) setState(() => more ? _hasMore = false : _error = errorText(e));
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
          _more = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.category;
    return Scaffold(
      appBar: AppBar(title: Text(c.name)),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: Brand.gold))
          : _error != null
              ? Center(child: ErrorBox(_error!, onRetry: _load))
              : _tracks.isEmpty
                  ? Center(
                      child: EmptyBox('No ${c.name} tracks available right now',
                          text: 'This category is filled only from authorised music APIs. Nothing playable was returned, so nothing is shown.'))
                  : ListView.builder(
                      padding: const EdgeInsets.only(bottom: 24),
                      itemCount: _tracks.length + 2,
                      itemBuilder: (_, i) {
                        if (i == 0) {
                          return Padding(
                            padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(c.blurb, style: const TextStyle(color: Brand.muted)),
                              const SizedBox(height: 12),
                              Row(children: [
                                FilledButton.icon(onPressed: () => playTracks(ref, _tracks, 0), icon: const Icon(Icons.play_arrow_rounded), label: const Text('Play all')),
                              ]),
                            ]),
                          );
                        }
                        if (i == _tracks.length + 1) {
                          if (!_hasMore) return const SizedBox.shrink();
                          return Padding(
                            padding: const EdgeInsets.all(16),
                            child: Center(
                              child: _more
                                  ? const CircularProgressIndicator(color: Brand.gold)
                                  : OutlinedButton(onPressed: () => _load(more: true), child: const Text('Load more')),
                            ),
                          );
                        }
                        return TrackTile(track: _tracks[i - 1], list: _tracks, index: i - 1);
                      },
                    ),
    );
  }
}

// ── Artist ──────────────────────────────────────────────────────────
final _artistProvider = FutureProvider.autoDispose.family<(Artist?, List<Track>), (String, String)>((ref, key) async {
  final music = ref.watch(musicServiceProvider);
  final artist = await music.artist(key.$1, key.$2);
  final tracks = await music.artistTracks(key.$1, key.$2);
  return (artist, tracks);
});

class ArtistScreen extends ConsumerWidget {
  const ArtistScreen({super.key, required this.provider, required this.id, required this.name});
  final String provider;
  final String id;
  final String name;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final data = ref.watch(_artistProvider((provider, id)));
    return Scaffold(
      appBar: AppBar(title: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis)),
      body: data.when(
        loading: () => const Center(child: CircularProgressIndicator(color: Brand.gold)),
        error: (e, _) => Center(child: ErrorBox(errorText(e), onRetry: () => ref.invalidate(_artistProvider((provider, id))))),
        data: (d) {
          final (artist, tracks) = d;
          return ListView(padding: const EdgeInsets.only(bottom: 24), children: [
            const SizedBox(height: 8),
            Center(child: Artwork(artist?.image, size: 150, radius: 75)),
            const SizedBox(height: 12),
            Center(child: Text(artist?.name ?? name, textAlign: TextAlign.center, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800))),
            if (artist != null) Center(child: Text('${artist.followers} followers${artist.verified ? ' · Verified' : ''}', style: const TextStyle(color: Brand.muted))),
            const SizedBox(height: 12),
            if (tracks.isNotEmpty)
              Center(child: FilledButton.icon(onPressed: () => playTracks(ref, tracks, 0), icon: const Icon(Icons.play_arrow_rounded), label: const Text('Play'))),
            const SectionHeader('Popular tracks'),
            if (tracks.isEmpty) const EmptyBox('No playable tracks', text: 'This artist has no tracks with confirmed streaming permission.'),
            for (var i = 0; i < tracks.length; i++) TrackTile(track: tracks[i], list: tracks, index: i),
          ]);
        },
      ),
    );
  }
}

// ── Provider playlist / album ───────────────────────────────────────
final _collectionProvider = FutureProvider.autoDispose.family<Collection?, (String, String)>(
    (ref, key) => ref.watch(musicServiceProvider).collection(key.$1, key.$2));

class CollectionScreen extends ConsumerWidget {
  const CollectionScreen({super.key, required this.provider, required this.id, required this.title});
  final String provider;
  final String id;
  final String title;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final data = ref.watch(_collectionProvider((provider, id)));
    return Scaffold(
      appBar: AppBar(title: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis)),
      body: data.when(
        loading: () => const Center(child: CircularProgressIndicator(color: Brand.gold)),
        error: (e, _) => Center(child: ErrorBox(errorText(e), onRetry: () => ref.invalidate(_collectionProvider((provider, id))))),
        data: (c) {
          if (c == null) return const Center(child: EmptyBox('Not found', text: 'This playlist or album is unavailable.'));
          return ListView(padding: const EdgeInsets.only(bottom: 24), children: [
            const SizedBox(height: 8),
            Center(child: Artwork(c.artwork, size: 190, radius: 18)),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(c.title, textAlign: TextAlign.center, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
            ),
            Center(child: Text('${c.isAlbum ? 'Album' : 'Playlist'} · ${c.ownerName} · ${c.tracks.length} playable', style: const TextStyle(color: Brand.muted))),
            const SizedBox(height: 12),
            if (c.tracks.isNotEmpty)
              Center(child: FilledButton.icon(onPressed: () => playTracks(ref, c.tracks, 0), icon: const Icon(Icons.play_arrow_rounded), label: const Text('Play'))),
            const SizedBox(height: 8),
            if (c.tracks.isEmpty) const EmptyBox('No playable tracks', text: 'None of these tracks have confirmed streaming permission.'),
            for (var i = 0; i < c.tracks.length; i++) TrackTile(track: c.tracks[i], list: c.tracks, index: i),
          ]);
        },
      ),
    );
  }
}

// ── The user's own playlist ─────────────────────────────────────────
class UserPlaylistScreen extends ConsumerWidget {
  const UserPlaylistScreen(this.id, {super.key});
  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pl = ref.watch(libraryProvider.select((l) => l.playlists.where((p) => p.id == id).firstOrNull));
    final lib = ref.read(libraryProvider.notifier);
    if (pl == null) return Scaffold(appBar: AppBar(), body: const Center(child: EmptyBox('Playlist not found')));
    return Scaffold(
      appBar: AppBar(title: Text(pl.title, maxLines: 1, overflow: TextOverflow.ellipsis), actions: [
        IconButton(
          tooltip: 'Rename',
          icon: const Icon(Icons.edit_rounded),
          onPressed: () async {
            final ctrl = TextEditingController(text: pl.title);
            final name = await showDialog<String>(
              context: context,
              builder: (d) => AlertDialog(
                backgroundColor: Brand.charcoal,
                title: const Text('Rename playlist'),
                content: TextField(controller: ctrl, maxLength: 80, autofocus: true),
                actions: [
                  TextButton(onPressed: () => Navigator.pop(d), child: const Text('Cancel')),
                  FilledButton(onPressed: () => Navigator.pop(d, ctrl.text), child: const Text('Save')),
                ],
              ),
            );
            if (name != null) lib.renamePlaylist(id, name);
          },
        ),
        IconButton(
          tooltip: 'Delete playlist',
          icon: const Icon(Icons.delete_outline_rounded),
          onPressed: () async {
            final ok = await showDialog<bool>(
              context: context,
              builder: (d) => AlertDialog(
                backgroundColor: Brand.charcoal,
                title: const Text('Delete playlist?'),
                content: Text('"${pl.title}" will be removed. This cannot be undone.'),
                actions: [
                  TextButton(onPressed: () => Navigator.pop(d, false), child: const Text('Keep')),
                  FilledButton(onPressed: () => Navigator.pop(d, true), child: const Text('Delete')),
                ],
              ),
            );
            if (ok == true && context.mounted) {
              Navigator.pop(context);
              lib.deletePlaylist(id);
              toast('Playlist deleted');
            }
          },
        ),
      ]),
      body: pl.tracks.isEmpty
          ? const Center(child: EmptyBox('This playlist is empty', text: 'Use the ⋮ menu on any song and choose "Add to playlist".'))
          : ListView(padding: const EdgeInsets.only(bottom: 24), children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
                child: Row(children: [
                  FilledButton.icon(onPressed: () => playTracks(ref, pl.tracks, 0), icon: const Icon(Icons.play_arrow_rounded), label: const Text('Play')),
                  const SizedBox(width: 12),
                  Text('${pl.tracks.length} songs', style: const TextStyle(color: Brand.muted)),
                ]),
              ),
              for (var i = 0; i < pl.tracks.length; i++)
                TrackTile(track: pl.tracks[i], list: pl.tracks, index: i, onRemove: () => lib.removeFromPlaylist(id, pl.tracks[i])),
            ]),
    );
  }
}

// ── Full-screen player ──────────────────────────────────────────────
class PlayerScreen extends ConsumerWidget {
  const PlayerScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final track = ref.watch(currentTrackProvider).value;
    final state = ref.watch(playbackStateProvider).value;
    final handler = ref.read(audioHandlerProvider);
    if (track == null) {
      return Scaffold(appBar: AppBar(), body: const Center(child: EmptyBox('Nothing is playing', text: 'Pick a song to start listening.')));
    }
    final playing = state?.playing ?? false;
    final busy = state?.processingState == AudioProcessingState.loading || state?.processingState == AudioProcessingState.buffering;
    final shuffle = state?.shuffleMode == AudioServiceShuffleMode.all;
    final repeat = state?.repeatMode ?? AudioServiceRepeatMode.none;

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(tooltip: 'Close player', icon: const Icon(Icons.keyboard_arrow_down_rounded, size: 32), onPressed: () => Navigator.pop(context)),
        centerTitle: true,
        title: const Text('NOW PLAYING', style: TextStyle(fontSize: 12, letterSpacing: 3, color: Brand.gold, fontWeight: FontWeight.w800)),
        actions: [
          IconButton(tooltip: 'Queue', icon: const Icon(Icons.queue_music_rounded), onPressed: () => _showQueue(context)),
          IconButton(tooltip: 'More options', icon: const Icon(Icons.more_vert_rounded), onPressed: () => showTrackMenu(context, ref, track)),
        ],
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 20),
          child: Column(children: [
            Expanded(child: Center(child: AspectRatio(aspectRatio: 1, child: Artwork(track.artworkLarge ?? track.artwork, radius: 22)))),
            const SizedBox(height: 22),
            Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(track.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 2),
                  Text(track.artist, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Brand.muted, fontSize: 15)),
                ]),
              ),
              FavoriteButton(track, size: 28),
            ]),
            const SizedBox(height: 6),
            const _SeekBar(),
            const SizedBox(height: 4),
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              IconButton(tooltip: 'Shuffle', icon: Icon(Icons.shuffle_rounded, color: shuffle ? Brand.gold : Colors.white60), onPressed: handler.toggleShuffle),
              IconButton(tooltip: 'Previous', iconSize: 38, icon: const Icon(Icons.skip_previous_rounded), onPressed: handler.skipToPrevious),
              SizedBox(
                width: 72,
                height: 72,
                child: FilledButton(
                  style: FilledButton.styleFrom(shape: const CircleBorder(), padding: EdgeInsets.zero),
                  onPressed: playing ? handler.pause : handler.play,
                  child: busy
                      ? const SizedBox(width: 28, height: 28, child: CircularProgressIndicator(strokeWidth: 3, color: Brand.black))
                      : Icon(playing ? Icons.pause_rounded : Icons.play_arrow_rounded, size: 42, semanticLabel: playing ? 'Pause' : 'Play'),
                ),
              ),
              IconButton(tooltip: 'Next', iconSize: 38, icon: const Icon(Icons.skip_next_rounded), onPressed: handler.skipToNext),
              IconButton(
                tooltip: 'Repeat',
                icon: Icon(repeat == AudioServiceRepeatMode.one ? Icons.repeat_one_rounded : Icons.repeat_rounded,
                    color: repeat == AudioServiceRepeatMode.none ? Colors.white60 : Brand.gold),
                onPressed: handler.cycleRepeat,
              ),
            ]),
            const SizedBox(height: 10),
            Text('Streaming from ${track.provider} · permission confirmed by provider', style: const TextStyle(color: Brand.muted, fontSize: 11)),
          ]),
        ),
      ),
    );
  }

  void _showQueue(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Brand.charcoal,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (_) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.7,
        maxChildSize: 0.92,
        builder: (_, scroll) => Consumer(builder: (_, ref, _) {
          final queue = ref.watch(queueProvider).value ?? const <Track>[];
          final handler = ref.read(audioHandlerProvider);
          ref.watch(currentTrackProvider);
          return ListView.builder(
            controller: scroll,
            itemCount: queue.length + 1,
            itemBuilder: (_, i) {
              if (i == 0) {
                return Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                  child: Text('QUEUE · ${queue.length}', style: const TextStyle(color: Brand.gold, fontWeight: FontWeight.w800, letterSpacing: 2, fontSize: 12)),
                );
              }
              final t = queue[i - 1];
              return Opacity(
                opacity: i - 1 < handler.index ? 0.5 : 1,
                child: TrackTile(track: t, list: queue, index: i - 1, onTap: () => handler.skipToQueueItem(i - 1), onRemove: () => handler.removeAt(i - 1)),
              );
            },
          );
        }),
      ),
    );
  }
}

class _SeekBar extends ConsumerStatefulWidget {
  const _SeekBar();
  @override
  ConsumerState<_SeekBar> createState() => _SeekBarState();
}

class _SeekBarState extends ConsumerState<_SeekBar> {
  double? _drag;

  @override
  Widget build(BuildContext context) {
    final track = ref.watch(currentTrackProvider).value;
    final pos = ref.watch(positionProvider).value ?? Duration.zero;
    final dur = ref.watch(durationProvider).value ?? Duration(seconds: track?.duration ?? 0);
    final max = dur.inMilliseconds.toDouble();
    final value = (_drag ?? pos.inMilliseconds.toDouble()).clamp(0.0, max <= 0 ? 0.0 : max);
    return Column(children: [
      Slider(
        min: 0,
        max: max <= 0 ? 1 : max,
        value: max <= 0 ? 0 : value,
        semanticFormatterCallback: (v) => formatDuration(Duration(milliseconds: v.round())),
        onChanged: max <= 0 ? null : (v) => setState(() => _drag = v),
        onChangeEnd: (v) {
          ref.read(audioHandlerProvider).seek(Duration(milliseconds: v.round()));
          setState(() => _drag = null);
        },
      ),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 22),
        child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text(formatDuration(Duration(milliseconds: value.round())), style: const TextStyle(color: Brand.muted, fontSize: 12)),
          Text(formatDuration(dur), style: const TextStyle(color: Brand.muted, fontSize: 12)),
        ]),
      ),
    ]);
  }
}
