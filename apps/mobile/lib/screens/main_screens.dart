import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config.dart';
import '../models.dart';
import '../state/app_state.dart';
import '../theme.dart';
import '../widgets.dart';
import 'detail_screens.dart';
import 'onboarding_auth.dart';

// ── Shell: bottom navigation + mini player ──────────────────────────
class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});
  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(index: _tab, children: const [HomeScreen(), SearchScreen(), LibraryScreen(), SettingsScreen()]),
      bottomNavigationBar: Column(mainAxisSize: MainAxisSize.min, children: [
        const MiniPlayer(),
        NavigationBar(
          selectedIndex: _tab,
          height: 64,
          onDestinationSelected: (i) => setState(() => _tab = i),
          destinations: const [
            NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home_rounded), label: 'Home'),
            NavigationDestination(icon: Icon(Icons.search_rounded), label: 'Search'),
            NavigationDestination(icon: Icon(Icons.library_music_outlined), selectedIcon: Icon(Icons.library_music_rounded), label: 'Library'),
            NavigationDestination(icon: Icon(Icons.settings_outlined), selectedIcon: Icon(Icons.settings_rounded), label: 'Settings'),
          ],
        ),
      ]),
    );
  }
}

class MiniPlayer extends ConsumerWidget {
  const MiniPlayer({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final track = ref.watch(currentTrackProvider).value;
    if (track == null) return const SizedBox.shrink();
    final playing = ref.watch(playbackStateProvider).value?.playing ?? false;
    final pos = ref.watch(positionProvider).value ?? Duration.zero;
    final dur = ref.watch(durationProvider).value ?? Duration(seconds: track.duration);
    final handler = ref.read(audioHandlerProvider);
    final progress = dur.inMilliseconds > 0 ? (pos.inMilliseconds / dur.inMilliseconds).clamp(0.0, 1.0) : 0.0;

    return Material(
      color: const Color(0xFF0C0C0C),
      child: InkWell(
        onTap: () => Navigator.of(context).push(MaterialPageRoute(fullscreenDialog: true, builder: (_) => const PlayerScreen())),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          LinearProgressIndicator(value: progress, minHeight: 2, color: Brand.gold, backgroundColor: Brand.line),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
            child: Row(children: [
              Artwork(track.artwork, size: 44, radius: 8),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(track.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                  Text(track.artist, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Brand.muted, fontSize: 12)),
                ]),
              ),
              FavoriteButton(track),
              IconButton(
                tooltip: playing ? 'Pause' : 'Play',
                iconSize: 30,
                icon: Icon(playing ? Icons.pause_rounded : Icons.play_arrow_rounded),
                onPressed: playing ? handler.pause : handler.play,
              ),
              IconButton(tooltip: 'Next', iconSize: 28, icon: const Icon(Icons.skip_next_rounded), onPressed: handler.skipToNext),
            ]),
          ),
        ]),
      ),
    );
  }
}

// ── Home ────────────────────────────────────────────────────────────
/// Hindi leads the home screen: most played full-length Hindi tracks.
final trendingProvider = FutureProvider<List<Track>>((ref) => ref.watch(musicServiceProvider).hindiHits());
final trendingCollectionsProvider = FutureProvider<List<Collection>>((ref) => ref.watch(musicServiceProvider).trendingCollections());
final _categoryRowProvider = FutureProvider.family<List<Track>, String>((ref, slug) {
  final c = categories.firstWhere((x) => x.slug == slug);
  return ref.watch(musicServiceProvider).categoryTracks(c, limit: 12);
});

class CategoryGrid extends StatelessWidget {
  const CategoryGrid({super.key});
  @override
  Widget build(BuildContext context) => GridView.count(
        crossAxisCount: 2,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 16),
        mainAxisSpacing: 10,
        crossAxisSpacing: 10,
        childAspectRatio: 2.3,
        children: [
          for (final c in categories.where((c) => !c.youtubeChart || AppConfig.youtubeConfigured))
            Material(
              borderRadius: BorderRadius.circular(14),
              clipBehavior: Clip.antiAlias,
              child: Ink(
                decoration: BoxDecoration(gradient: LinearGradient(colors: [Color(c.color), Brand.charcoal], begin: Alignment.topLeft, end: Alignment.bottomRight)),
                child: InkWell(
                  onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => CategoryScreen(c))),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Align(alignment: Alignment.bottomLeft, child: Text(c.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15))),
                  ),
                ),
              ),
            ),
        ],
      );
}

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final trending = ref.watch(trendingProvider);
    final playlists = ref.watch(trendingCollectionsProvider);
    final recent = ref.watch(libraryProvider.select((l) => l.history)).take(12).toList();
    final demo = ref.watch(demoModeProvider).value ?? false;

    return Scaffold(
      appBar: AppBar(title: const BrandTitle(), titleSpacing: 16),
      body: RefreshIndicator(
        color: Brand.gold,
        onRefresh: () async {
          ref.invalidate(trendingProvider);
          ref.invalidate(trendingCollectionsProvider);
          await ref.read(trendingProvider.future).catchError((_) => <Track>[]);
        },
        child: ListView(padding: const EdgeInsets.only(bottom: 24), children: [
          if (demo)
            Container(
              margin: const EdgeInsets.fromLTRB(16, 4, 16, 0),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: Brand.gold.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(12)),
              child: const Text('Demo mode: showing original SAHU MUSIC sample audio because the live catalogue is unavailable.',
                  style: TextStyle(color: Brand.goldSoft, fontSize: 13)),
            ),
          Container(
            margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(22),
              gradient: const LinearGradient(colors: [Color(0xFF2A2110), Brand.charcoal, Brand.black], begin: Alignment.topLeft, end: Alignment.bottomRight),
              border: Border.all(color: Brand.gold.withValues(alpha: 0.25)),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              RichText(
                text: const TextSpan(
                  style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900, height: 1.15, color: Colors.white),
                  children: [TextSpan(text: 'Har Gaana,\n'), TextSpan(text: 'Ek Jagah.', style: TextStyle(color: Brand.gold))],
                ),
              ),
              const SizedBox(height: 8),
              const Text('Free music, streamed legally from open platforms.', style: TextStyle(color: Colors.white70, fontSize: 13)),
              const SizedBox(height: 14),
              FilledButton.icon(
                onPressed: trending.value == null || trending.value!.isEmpty ? null : () => playTracks(ref, trending.value!, 0),
                icon: const Icon(Icons.play_arrow_rounded),
                label: const Text('Play Hindi hits'),
              ),
            ]),
          ),
          if (recent.isNotEmpty) ...[const SectionHeader('Recently played'), HorizontalTracks(recent)],
          const SectionHeader('Hindi hits'),
          trending.when(
            loading: () => const SizedBox(height: 192, child: Center(child: CircularProgressIndicator(color: Brand.gold))),
            error: (e, _) => ErrorBox(errorText(e), onRetry: () => ref.invalidate(trendingProvider)),
            data: (t) => t.isEmpty ? const EmptyBox('No tracks available right now') : HorizontalTracks(t),
          ),
          if (AppConfig.youtubeConfigured) const _CategoryRow('bollywood-top'),
          const _CategoryRow('bollywood-radio'),
          const SectionHeader('Browse categories'),
          const CategoryGrid(),
          const AdBanner(),
          const SectionHeader('Trending playlists'),
          playlists.when(
            loading: () => const SizedBox(height: 192, child: Center(child: CircularProgressIndicator(color: Brand.gold))),
            error: (e, _) => ErrorBox(errorText(e), onRetry: () => ref.invalidate(trendingCollectionsProvider)),
            data: (list) => SizedBox(
              height: 192,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: list.length,
                separatorBuilder: (_, _) => const SizedBox(width: 14),
                itemBuilder: (_, i) => _CollectionCard(list[i]),
              ),
            ),
          ),
          for (final slug in const ['bollywood', 'retro-radio', 'punjabi', 'old-hindi', 'devotional', 'bhakti-radio', 'independent-artists']) _CategoryRow(slug),
        ]),
      ),
    );
  }
}

class _CollectionCard extends StatelessWidget {
  const _CollectionCard(this.c);
  final Collection c;
  @override
  Widget build(BuildContext context) => InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => CollectionScreen(provider: c.provider, id: c.id, title: c.title))),
        child: SizedBox(
          width: 140,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Artwork(c.artwork, size: 140, radius: 14),
            const SizedBox(height: 8),
            Text(c.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
            Text('${c.isAlbum ? 'Album' : 'Playlist'} · ${c.ownerName}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Brand.muted, fontSize: 12)),
          ]),
        ),
      );
}

class _CategoryRow extends ConsumerWidget {
  const _CategoryRow(this.slug);
  final String slug;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = categories.firstWhere((x) => x.slug == slug);
    final tracks = ref.watch(_categoryRowProvider(slug)).value;
    if (tracks == null || tracks.isEmpty) return const SizedBox.shrink(); // nothing real → show nothing
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      SectionHeader(c.name, onSeeAll: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => CategoryScreen(c)))),
      HorizontalTracks(tracks),
    ]);
  }
}

// ── Search ──────────────────────────────────────────────────────────
class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});
  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final _ctrl = TextEditingController();
  Timer? _debounce;
  String _query = '';
  bool _loading = false;
  String? _error;
  List<Track> _tracks = [];
  List<Artist> _artists = [];
  List<Collection> _collections = [];
  int _run = 0;

  @override
  void dispose() {
    _debounce?.cancel();
    _ctrl.dispose();
    super.dispose();
  }

  void _onChanged(String raw) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 450), () => _search(raw));
  }

  Future<void> _search(String raw) async {
    // input validation: strip control characters, collapse whitespace, cap length
    final q = raw.replaceAll(RegExp(r'[\x00-\x1F\x7F]'), ' ').replaceAll(RegExp(r'\s+'), ' ').trim();
    final query = q.length > 80 ? q.substring(0, 80) : q;
    final run = ++_run;
    if (query.length < 2) {
      setState(() {
        _query = '';
        _tracks = [];
        _artists = [];
        _collections = [];
        _error = null;
        _loading = false;
      });
      return;
    }
    setState(() {
      _query = query;
      _loading = true;
      _error = null;
    });
    final music = ref.read(musicServiceProvider);
    try {
      final tracks = await music.searchTracks(query, userSearch: true);
      final artists = await music.searchArtists(query).catchError((_) => <Artist>[]);
      final collections = await music.searchCollections(query).catchError((_) => <Collection>[]);
      if (run != _run || !mounted) return;
      setState(() {
        _tracks = tracks;
        _artists = artists;
        _collections = collections;
        _loading = false;
      });
    } catch (e) {
      if (run != _run || !mounted) return;
      setState(() {
        _error = errorText(e);
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Search')),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
          child: TextField(
            controller: _ctrl,
            onChanged: _onChanged,
            onSubmitted: _search,
            maxLength: 80,
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              hintText: 'Songs, artists, playlists…',
              counterText: '',
              prefixIcon: const Icon(Icons.search_rounded),
              suffixIcon: _ctrl.text.isEmpty
                  ? null
                  : IconButton(
                      tooltip: 'Clear',
                      icon: const Icon(Icons.close_rounded),
                      onPressed: () {
                        _ctrl.clear();
                        _search('');
                      }),
            ),
          ),
        ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator(color: Brand.gold))
              : _error != null
                  ? Center(child: ErrorBox(_error!, onRetry: () => _search(_ctrl.text)))
                  : _query.isEmpty
                      ? ListView(children: const [SectionHeader('Browse all'), CategoryGrid(), SizedBox(height: 24)])
                      : (_tracks.isEmpty && _artists.isEmpty && _collections.isEmpty)
                          ? Center(child: EmptyBox('No results for "$_query"', text: 'Only tracks with confirmed streaming permission are shown.'))
                          : ListView(padding: const EdgeInsets.only(bottom: 24), children: [
                              if (_artists.isNotEmpty) ...[
                                const SectionHeader('Artists'),
                                SizedBox(
                                  height: 150,
                                  child: ListView.separated(
                                    scrollDirection: Axis.horizontal,
                                    padding: const EdgeInsets.symmetric(horizontal: 16),
                                    itemCount: _artists.length,
                                    separatorBuilder: (_, _) => const SizedBox(width: 14),
                                    itemBuilder: (_, i) {
                                      final a = _artists[i];
                                      return InkWell(
                                        borderRadius: BorderRadius.circular(12),
                                        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => ArtistScreen(provider: a.provider, id: a.id, name: a.name))),
                                        child: SizedBox(
                                          width: 100,
                                          child: Column(children: [
                                            Artwork(a.image, size: 100, radius: 50),
                                            const SizedBox(height: 8),
                                            Text(a.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                                          ]),
                                        ),
                                      );
                                    },
                                  ),
                                ),
                              ],
                              if (_tracks.isNotEmpty) const SectionHeader('Songs'),
                              for (var i = 0; i < _tracks.length; i++) TrackTile(track: _tracks[i], list: _tracks, index: i),
                              if (_collections.isNotEmpty) ...[
                                const SectionHeader('Playlists & albums'),
                                SizedBox(
                                  height: 192,
                                  child: ListView.separated(
                                    scrollDirection: Axis.horizontal,
                                    padding: const EdgeInsets.symmetric(horizontal: 16),
                                    itemCount: _collections.length,
                                    separatorBuilder: (_, _) => const SizedBox(width: 14),
                                    itemBuilder: (_, i) => _CollectionCard(_collections[i]),
                                  ),
                                ),
                              ],
                            ]),
        ),
      ]),
    );
  }
}

// ── Library ─────────────────────────────────────────────────────────
class LibraryScreen extends ConsumerWidget {
  const LibraryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final lib = ref.watch(libraryProvider);
    final user = ref.watch(authProvider);
    final notifier = ref.read(libraryProvider.notifier);

    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Your Library'),
          bottom: const TabBar(
            indicatorColor: Brand.gold,
            labelColor: Brand.gold,
            unselectedLabelColor: Colors.white70,
            tabs: [Tab(text: 'Playlists'), Tab(text: 'Favourites'), Tab(text: 'History')],
          ),
        ),
        body: Column(children: [
          if (user == null)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: Brand.gold.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
              child: Text(
                AppConfig.backendConfigured
                    ? 'Guest mode: your library is saved on this device. Log in from Settings to sync it.'
                    : 'Guest mode: your library is saved on this device.',
                style: const TextStyle(color: Brand.goldSoft, fontSize: 13),
              ),
            ),
          Expanded(
            child: !lib.ready
                ? const Center(child: CircularProgressIndicator(color: Brand.gold))
                : TabBarView(children: [
                    // Playlists
                    ListView(padding: const EdgeInsets.only(bottom: 24), children: [
                      ListTile(
                        leading: const CircleAvatar(backgroundColor: Brand.gold, child: Icon(Icons.add_rounded, color: Brand.black)),
                        title: const Text('New playlist', style: TextStyle(fontWeight: FontWeight.w700)),
                        onTap: () async {
                          final ctrl = TextEditingController();
                          final name = await showDialog<String>(
                            context: context,
                            builder: (d) => AlertDialog(
                              backgroundColor: Brand.charcoal,
                              title: const Text('New playlist'),
                              content: TextField(controller: ctrl, maxLength: 80, autofocus: true, decoration: const InputDecoration(hintText: 'Playlist name')),
                              actions: [
                                TextButton(onPressed: () => Navigator.pop(d), child: const Text('Cancel')),
                                FilledButton(onPressed: () => Navigator.pop(d, ctrl.text), child: const Text('Create')),
                              ],
                            ),
                          );
                          if (name == null) return;
                          toast(notifier.createPlaylist(name) == null ? 'Enter a playlist name (max 80 characters).' : 'Playlist created');
                        },
                      ),
                      if (lib.playlists.isEmpty) const EmptyBox('No playlists yet', text: 'Create one, then add songs from the ⋮ menu on any track.'),
                      for (final p in lib.playlists)
                        ListTile(
                          leading: Artwork(p.tracks.isEmpty ? null : p.tracks.first.artwork, size: 50, radius: 8),
                          title: Text(p.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
                          subtitle: Text('${p.tracks.length} songs', style: const TextStyle(color: Brand.muted)),
                          trailing: const Icon(Icons.chevron_right_rounded),
                          onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => UserPlaylistScreen(p.id))),
                        ),
                    ]),
                    // Favourites
                    lib.favorites.isEmpty
                        ? const Center(child: EmptyBox('No favourites yet', text: 'Tap the heart on any song to save it here.'))
                        : ListView.builder(
                            padding: const EdgeInsets.only(bottom: 24),
                            itemCount: lib.favorites.length,
                            itemBuilder: (_, i) => TrackTile(track: lib.favorites[i], list: lib.favorites, index: i),
                          ),
                    // History
                    lib.history.isEmpty
                        ? const Center(child: EmptyBox('No listening history', text: 'Songs you play will appear here.'))
                        : ListView.builder(
                            padding: const EdgeInsets.only(bottom: 24),
                            itemCount: lib.history.length + 1,
                            itemBuilder: (_, i) => i == 0
                                ? Align(
                                    alignment: Alignment.centerLeft,
                                    child: Padding(
                                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                                      child: OutlinedButton.icon(onPressed: notifier.clearHistory, icon: const Icon(Icons.delete_outline_rounded, size: 18), label: const Text('Clear history')),
                                    ),
                                  )
                                : TrackTile(track: lib.history[i - 1], list: lib.history, index: i - 1),
                          ),
                  ]),
          ),
        ]),
      ),
    );
  }
}

// ── Settings ────────────────────────────────────────────────────────
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(settingsProvider);
    final user = ref.watch(authProvider);
    final notifier = ref.read(settingsProvider.notifier);

    Widget header(String t) => Padding(
          padding: const EdgeInsets.fromLTRB(16, 20, 16, 6),
          child: Text(t.toUpperCase(), style: const TextStyle(color: Brand.gold, fontWeight: FontWeight.w800, letterSpacing: 2, fontSize: 12)),
        );

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(padding: const EdgeInsets.only(bottom: 24), children: [
        header('Account'),
        if (user != null) ...[
          ListTile(leading: const Icon(Icons.person_rounded), title: Text(user.email), subtitle: const Text('Library synced to your account', style: TextStyle(color: Brand.muted))),
          ListTile(leading: const Icon(Icons.logout_rounded), title: const Text('Log out'), onTap: () => ref.read(authProvider.notifier).signOut()),
        ] else if (AppConfig.backendConfigured)
          ListTile(
            leading: const Icon(Icons.login_rounded),
            title: const Text('Log in or sign up'),
            subtitle: const Text('Sync favourites, playlists and history', style: TextStyle(color: Brand.muted)),
            onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const AuthScreen())),
          )
        else
          const ListTile(
            leading: Icon(Icons.info_outline_rounded, color: Brand.gold),
            title: Text('Guest mode'),
            subtitle: Text('Accounts are not configured in this build. Build with API_BASE_URL set to your SAHU MUSIC website to enable login (see README).',
                style: TextStyle(color: Brand.muted)),
          ),
        header('Playback'),
        SwitchListTile(
          activeThumbColor: Brand.gold,
          title: const Text('Autoplay next song'),
          subtitle: const Text('Keep playing through the queue', style: TextStyle(color: Brand.muted)),
          value: s.autoplayNext,
          onChanged: notifier.setAutoplayNext,
        ),
        header('Advertising'),
        SwitchListTile(
          activeThumbColor: Brand.gold,
          title: const Text('Show ads'),
          subtitle: Text(
            AppConfig.adsEnabled ? 'Banner ads help keep SAHU MUSIC free. They never interrupt playback.' : 'Ads are disabled in this build, so none are shown.',
            style: const TextStyle(color: Brand.muted),
          ),
          value: AppConfig.adsEnabled && s.showAds,
          onChanged: AppConfig.adsEnabled ? notifier.setShowAds : null,
        ),
        header('Library'),
        ListTile(
          leading: const Icon(Icons.history_rounded),
          title: const Text('Clear listening history'),
          onTap: () {
            ref.read(libraryProvider.notifier).clearHistory();
            toast('Listening history cleared');
          },
        ),
        header('About'),
        const ListTile(
          leading: LogoMark(size: 40),
          title: Text('${Brand.name} 1.0.0'),
          subtitle: Text(Brand.tagline, style: TextStyle(color: Brand.gold)),
        ),
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 16),
          child: Text(
            'Music is streamed from Audius, an open platform where artists share their own work, through its official free API. '
            'Only tracks whose provider confirms streaming permission can be played. Audio is streamed, never stored. '
            'We never scrape Spotify, YouTube or JioSaavn.',
            style: TextStyle(color: Brand.muted, fontSize: 13, height: 1.5),
          ),
        ),
      ]),
    );
  }
}
