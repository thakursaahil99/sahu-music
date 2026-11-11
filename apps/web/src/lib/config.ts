/** Public runtime configuration. Only NEXT_PUBLIC_* values exist in the browser bundle. */
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || '',
  audiusAppName: process.env.NEXT_PUBLIC_AUDIUS_APP_NAME?.trim() || 'SAHU_MUSIC',
  jamendoClientId: process.env.NEXT_PUBLIC_JAMENDO_CLIENT_ID?.trim() || '',
  /** Opt-in 30-second Apple Music preview clips. OFF by default: only complete songs are played. */
  itunesPreviews: process.env.NEXT_PUBLIC_ITUNES_PREVIEWS === 'true',
  /** Android APK download link. Empty = use /downloads/sahu-music.apk when that file is bundled. */
  apkUrl: process.env.NEXT_PUBLIC_APK_URL?.trim() || '',
  itunesCountry: process.env.NEXT_PUBLIC_ITUNES_COUNTRY?.trim() || 'IN',
  /** Free YouTube Data API key: original film songs in YouTube's official player. Restrict it to your site's address. */
  youtubeApiKey: process.env.NEXT_PUBLIC_YOUTUBE_API_KEY?.trim() || '',
  youtubeRegion: process.env.NEXT_PUBLIC_YOUTUBE_REGION?.trim() || 'IN',
  /** Live radio (Radio Browser) and openly licensed Internet Archive audio. On unless set to "false". */
  radio: process.env.NEXT_PUBLIC_RADIO !== 'false',
  archive: process.env.NEXT_PUBLIC_ARCHIVE !== 'false',
  demoMode: process.env.NEXT_PUBLIC_DEMO_MODE === 'true',
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'http://localhost:3000',
  adsenseClient: process.env.NEXT_PUBLIC_ADSENSE_CLIENT?.trim() || '',
  adsenseSlot: process.env.NEXT_PUBLIC_ADSENSE_SLOT?.trim() || '',
};

export const adsConfigured = /^ca-pub-\d{10,20}$/.test(env.adsenseClient) && /^\d{6,20}$/.test(env.adsenseSlot);
