/** Category rows shown on the home page, in order (below the Hindi hits and the categories). */
export const HOME_ROWS = ['bollywood', 'retro-radio', 'punjabi', 'old-hindi', 'devotional', 'bhakti-radio', 'romantic', 'lofi-hindi', 'independent-artists'];
/** The live radio row right after the Hindi hits. */
export const HOME_RADIO_ROW = 'bollywood-radio';
/** Songs per home row. */
export const HOME_ROW_SIZE = 12;
/**
 * Data written into a page when the site was built is shown as is while it is younger than this;
 * older, the page refreshes it from the music servers in the background.
 */
export const BUILT_FRESH_MS = 6 * 60 * 60_000;
