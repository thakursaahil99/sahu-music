import { createMusicService } from '@sahu/api';
import { CATEGORIES } from '@sahu/shared';
import { env } from './config';

/** One shared MusicService for the whole web app. */
export const music = createMusicService({
  audiusAppName: env.audiusAppName,
  jamendoClientId: env.jamendoClientId || undefined,
  itunesPreviews: env.itunesPreviews,
  itunesCountry: env.itunesCountry,
  youtubeApiKey: env.youtubeApiKey || undefined,
  youtubeRegion: env.youtubeRegion,
  radio: env.radio,
  archive: env.archive,
  forceDemo: env.demoMode,
});

/** Categories this deployment can fill (e.g. "Bollywood Top Songs" only when YouTube is set up). */
export const visibleCategories = CATEGORIES.filter((c) => c.needs !== 'youtube' || music.isActive('youtube'));

/** Original film songs are available only through the YouTube player. */
export const youtubeEnabled = music.isActive('youtube');
