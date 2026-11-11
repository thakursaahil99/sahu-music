import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

import 'config.dart';
import 'models.dart';
import 'screens/detail_screens.dart';
import 'screens/youtube_screen.dart';
import 'state/app_state.dart';
import 'theme.dart';

final messengerKey = GlobalKey<ScaffoldMessengerState>();
final navigatorKey = GlobalKey<NavigatorState>();

void toast(String text, {bool error = false}) {
  messengerKey.currentState
    ?..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      content: Text(text, style: TextStyle(color: error ? Colors.white : Brand.black)),
      backgroundColor: error ? const Color(0xFFDC2626) : Brand.gold,
      duration: const Duration(seconds: 3),
    ));
}

class LogoMark extends StatelessWidget {
  const LogoMark({super.key, this.size = 40});
  final double size;
  @override
  Widget build(BuildContext context) =>
      ClipRRect(borderRadius: BorderRadius.circular(size * 0.22), child: Image.asset('assets/logo.png', width: size, height: size, semanticLabel: 'SAHU MUSIC logo'));
}

class BrandTitle extends StatelessWidget {
  const BrandTitle({super.key});
  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        const LogoMark(size: 32),
        const SizedBox(width: 10),
        RichText(
          text: const TextSpan(
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, letterSpacing: 2.5, color: Colors.white),
            children: [TextSpan(text: 'SAHU '), TextSpan(text: 'MUSIC', style: TextStyle(color: Brand.gold))],
          ),
        ),
      ]);
}

/// Cached, lazily loaded artwork with a graceful fallback.
class Artwork extends StatelessWidget {
  const Artwork(this.url, {super.key, this.size, this.radius = 10});
  final String? url;
  final double? size;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final fallback = Container(
      color: Brand.charcoalLight,
      alignment: Alignment.center,
      child: Icon(Icons.music_note_rounded, color: Brand.gold.withValues(alpha: 0.6), size: (size ?? 80) * 0.45),
    );
    final cacheW = size == null ? 600 : (size! * 3).round();
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: SizedBox(
        width: size,
        height: size,
        child: AspectRatio(
          aspectRatio: 1,
          child: (url == null || !url!.startsWith('http'))
              ? fallback
              : CachedNetworkImage(
                  imageUrl: url!,
                  fit: BoxFit.cover,
                  memCacheWidth: cacheW,
                  fadeInDuration: const Duration(milliseconds: 150),
                  placeholder: (_, _) => Container(color: Brand.charcoalLight),
                  errorWidget: (_, _, _) => fallback,
                ),
        ),
      ),
    );
  }
}

class SectionHeader extends StatelessWidget {
  const SectionHeader(this.title, {super.key, this.onSeeAll});
  final String title;
  final VoidCallback? onSeeAll;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 22, 8, 10),
        child: Row(children: [
          Expanded(child: Text(title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800))),
          if (onSeeAll != null) TextButton(onPressed: onSeeAll, child: const Text('See all', style: TextStyle(color: Brand.gold))),
        ]),
      );
}

/// YouTube songs open the official video player screen; every other source plays in the background audio service.
void playTracks(WidgetRef ref, List<Track> list, int index) {
  if (list.isEmpty) return;
  final chosen = list[index.clamp(0, list.length - 1)];
  if (chosen.video) {
    final videos = list.where((t) => t.video && t.playable).toList();
    final start = videos.indexWhere((t) => t.key == chosen.key);
    if (start < 0) return toast('This video cannot be played.', error: true);
    navigatorKey.currentState?.push(MaterialPageRoute(fullscreenDialog: true, builder: (_) => YoutubeScreen(tracks: videos, startIndex: start)));
    return;
  }
  ref.read(audioHandlerProvider).playTracks(list.where((t) => !t.video).toList(), list.where((t) => !t.video).toList().indexWhere((t) => t.key == chosen.key));
}

/// LIVE / YouTube marker after a track's subtitle.
Widget sourceSubtitle(Track t, {double fontSize = 13}) {
  final style = TextStyle(color: Brand.muted, fontSize: fontSize);
  if (!t.live && !t.video) return Text(t.artist, maxLines: 1, overflow: TextOverflow.ellipsis, style: style);
  return Row(children: [
    Container(
      margin: const EdgeInsets.only(right: 6),
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
      decoration: BoxDecoration(color: t.live ? const Color(0x33EF4444) : const Color(0x33FF0033), borderRadius: BorderRadius.circular(4)),
      child: Text(t.live ? 'LIVE' : 'YOUTUBE', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: t.live ? const Color(0xFFF87171) : const Color(0xFFFF5C7A))),
    ),
    Expanded(child: Text(t.artist, maxLines: 1, overflow: TextOverflow.ellipsis, style: style)),
  ]);
}

class FavoriteButton extends ConsumerWidget {
  const FavoriteButton(this.track, {super.key, this.size = 22});
  final Track track;
  final double size;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final fav = ref.watch(libraryProvider.select((l) => l.isFavorite(track)));
    return IconButton(
      tooltip: fav ? 'Remove from favourites' : 'Add to favourites',
      iconSize: size,
      icon: Icon(fav ? Icons.favorite_rounded : Icons.favorite_border_rounded, color: fav ? Brand.gold : Colors.white60),
      onPressed: () => toast(ref.read(libraryProvider.notifier).toggleFavorite(track) ? 'Added to Favourites' : 'Removed from Favourites'),
    );
  }
}

class TrackTile extends ConsumerWidget {
  const TrackTile({super.key, required this.track, required this.list, required this.index, this.onRemove, this.onTap});
  final Track track;
  final List<Track> list;
  final int index;
  final VoidCallback? onRemove;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final active = ref.watch(currentTrackProvider).value?.key == track.key;
    return ListTile(
      contentPadding: const EdgeInsets.only(left: 16, right: 4),
      leading: Artwork(track.artwork, size: 50, radius: 8),
      title: Text(track.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15, color: active ? Brand.gold : Colors.white)),
      subtitle: sourceSubtitle(track),
      onTap: onTap ?? () => playTracks(ref, list, index),
      trailing: Row(mainAxisSize: MainAxisSize.min, children: [
        FavoriteButton(track, size: 20),
        if (onRemove != null) IconButton(tooltip: 'Remove', icon: const Icon(Icons.close_rounded, size: 20), onPressed: onRemove),
        IconButton(tooltip: 'More options', icon: const Icon(Icons.more_vert_rounded, size: 20), onPressed: () => showTrackMenu(context, ref, track)),
      ]),
    );
  }
}

class TrackCard extends ConsumerWidget {
  const TrackCard({super.key, required this.track, required this.list, required this.index});
  final Track track;
  final List<Track> list;
  final int index;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final active = ref.watch(currentTrackProvider).value?.key == track.key;
    return Semantics(
      button: true,
      label: 'Play ${track.title} by ${track.artist}',
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => playTracks(ref, list, index),
        child: SizedBox(
          width: 140,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Artwork(track.artwork, size: 140, radius: 14),
            const SizedBox(height: 8),
            Text(track.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: active ? Brand.gold : Colors.white)),
            sourceSubtitle(track, fontSize: 12),
          ]),
        ),
      ),
    );
  }
}

class HorizontalTracks extends StatelessWidget {
  const HorizontalTracks(this.tracks, {super.key});
  final List<Track> tracks;
  @override
  Widget build(BuildContext context) => SizedBox(
        height: 192,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          itemCount: tracks.length,
          separatorBuilder: (_, _) => const SizedBox(width: 14),
          itemBuilder: (_, i) => TrackCard(track: tracks[i], list: tracks, index: i),
        ),
      );
}

class ErrorBox extends StatelessWidget {
  const ErrorBox(this.message, {super.key, this.onRetry});
  final String message;
  final VoidCallback? onRetry;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.wifi_off_rounded, color: Brand.gold, size: 32),
          const SizedBox(height: 10),
          Text(message, textAlign: TextAlign.center, style: const TextStyle(color: Brand.muted)),
          if (onRetry != null) ...[const SizedBox(height: 12), OutlinedButton(onPressed: onRetry, child: const Text('Try again'))],
        ]),
      );
}

class EmptyBox extends StatelessWidget {
  const EmptyBox(this.title, {super.key, this.text});
  final String title;
  final String? text;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.all(28),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.music_note_rounded, color: Brand.gold.withValues(alpha: 0.7), size: 34),
          const SizedBox(height: 10),
          Text(title, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
          if (text != null) ...[const SizedBox(height: 6), Text(text!, textAlign: TextAlign.center, style: const TextStyle(color: Brand.muted, fontSize: 13))],
        ]),
      );
}

String errorText(Object e) => e.toString().replaceFirst('Exception: ', '');

/// Bottom sheet: play next, queue, add to playlist, go to artist, source & rights.
void showTrackMenu(BuildContext context, WidgetRef ref, Track track) {
  final handler = ref.read(audioHandlerProvider);
  showModalBottomSheet<void>(
    context: context,
    backgroundColor: Brand.charcoal,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (sheet) => SafeArea(
      child: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(
            leading: Artwork(track.artwork, size: 46, radius: 8),
            title: Text(track.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text(track.artist, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Brand.muted)),
          ),
          const Divider(height: 1),
          if (!track.video) ListTile(
            leading: const Icon(Icons.skip_next_rounded),
            title: const Text('Play next'),
            onTap: () {
              Navigator.pop(sheet);
              handler.playNext(track);
              toast('Playing next');
            },
          ),
          if (!track.video) ListTile(
            leading: const Icon(Icons.queue_music_rounded),
            title: const Text('Add to queue'),
            onTap: () {
              Navigator.pop(sheet);
              handler.addToQueue(track);
              toast('Added to queue');
            },
          ),
          ListTile(
            leading: const Icon(Icons.playlist_add_rounded),
            title: const Text('Add to playlist'),
            onTap: () {
              Navigator.pop(sheet);
              showAddToPlaylist(context, ref, track);
            },
          ),
          if (track.artistId != null && track.provider != 'demo')
            ListTile(
              leading: const Icon(Icons.person_rounded),
              title: const Text('Go to artist'),
              onTap: () {
                Navigator.pop(sheet);
                Navigator.of(context).push(MaterialPageRoute(builder: (_) => ArtistScreen(provider: track.provider, id: track.artistId!, name: track.artist)));
              },
            ),
          ListTile(
            leading: const Icon(Icons.info_outline_rounded),
            title: const Text('Source & rights'),
            onTap: () {
              Navigator.pop(sheet);
              showRightsDialog(context, track);
            },
          ),
        ]),
      ),
    ),
  );
}

void showAddToPlaylist(BuildContext context, WidgetRef ref, Track track) {
  final ctrl = TextEditingController();
  showModalBottomSheet<void>(
    context: context,
    backgroundColor: Brand.charcoal,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (sheet) => Consumer(builder: (_, r, _) {
      final playlists = r.watch(libraryProvider).playlists;
      final lib = r.read(libraryProvider.notifier);
      return Padding(
        padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + MediaQuery.of(sheet).viewInsets.bottom),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Row(children: [
            Expanded(child: TextField(controller: ctrl, maxLength: 80, decoration: const InputDecoration(hintText: 'New playlist name', counterText: ''))),
            const SizedBox(width: 10),
            FilledButton(
              onPressed: () {
                final id = lib.createPlaylist(ctrl.text);
                if (id == null) return toast('Enter a playlist name (max 80 characters).', error: true);
                lib.addToPlaylist(id, track);
                Navigator.pop(sheet);
                toast('Added to ${ctrl.text.trim()}');
              },
              child: const Text('Create'),
            ),
          ]),
          const SizedBox(height: 8),
          if (playlists.isEmpty) const Padding(padding: EdgeInsets.all(12), child: Text('No playlists yet.', style: TextStyle(color: Brand.muted))),
          ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 280),
            child: ListView(shrinkWrap: true, children: [
              for (final p in playlists)
                ListTile(
                  leading: const Icon(Icons.library_music_rounded),
                  title: Text(p.title, maxLines: 1, overflow: TextOverflow.ellipsis),
                  trailing: Text('${p.tracks.length}', style: const TextStyle(color: Brand.muted)),
                  onTap: () {
                    final added = lib.addToPlaylist(p.id, track);
                    Navigator.pop(sheet);
                    toast(added ? 'Added to ${p.title}' : 'Already in this playlist');
                  },
                ),
            ]),
          ),
        ]),
      );
    }),
  );
}

void showRightsDialog(BuildContext context, Track t) {
  Widget row(String k, String v) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(width: 120, child: Text(k, style: const TextStyle(color: Brand.muted, fontSize: 13))),
          Expanded(child: Text(v, style: const TextStyle(fontSize: 13))),
        ]),
      );
  showDialog<void>(
    context: context,
    builder: (_) => AlertDialog(
      backgroundColor: Brand.charcoal,
      title: const Text('Source & rights'),
      content: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          row('Provider', t.provider),
          row('Track ID', t.providerTrackId),
          row('Streaming', t.rights.streamingPermitted ? 'Confirmed by provider' : 'Not permitted'),
          row('Licence', t.rights.license ?? 'Not stated by provider'),
          row('Commercial use', permissionLabel(t.rights.commercialUse)),
          row('Advertising', permissionLabel(t.rights.advertising)),
          const SizedBox(height: 8),
          Text(t.rights.basis, style: const TextStyle(color: Brand.muted, fontSize: 12)),
        ]),
      ),
      actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Close', style: TextStyle(color: Brand.gold)))],
    ),
  );
}

/// Optional AdMob banner. Renders nothing unless ads were enabled at build time
/// (ADS_ENABLED=true) and the user has not switched them off. Banner only: it
/// never plays audio and never pauses or interrupts music.
class AdBanner extends ConsumerStatefulWidget {
  const AdBanner({super.key});
  @override
  ConsumerState<AdBanner> createState() => _AdBannerState();
}

class _AdBannerState extends ConsumerState<AdBanner> {
  BannerAd? _ad;
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    if (!AppConfig.adsEnabled) return;
    _ad = BannerAd(
      adUnitId: AppConfig.bannerUnitId,
      size: AdSize.banner,
      request: const AdRequest(),
      listener: BannerAdListener(
        onAdLoaded: (_) => mounted ? setState(() => _loaded = true) : null,
        onAdFailedToLoad: (ad, _) => ad.dispose(), // no fill / offline: simply show nothing
      ),
    )..load();
  }

  @override
  void dispose() {
    _ad?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final show = ref.watch(settingsProvider.select((s) => s.showAds));
    if (!AppConfig.adsEnabled || !show || !_loaded || _ad == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Center(child: SizedBox(width: _ad!.size.width.toDouble(), height: _ad!.size.height.toDouble(), child: AdWidget(ad: _ad!))),
    );
  }
}
