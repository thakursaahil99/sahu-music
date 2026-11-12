import { HttpError } from './db';
import { fail, json } from './http';
import * as account from './routes-account';
import * as admin from './routes-admin';
import * as library from './routes-library';
import * as pub from './routes-public';

type Handler = (req: Request) => Promise<Response>;

/** Every endpoint, by "METHOD path". Paths are relative to /api/v1/. */
const ROUTES: Record<string, Handler> = {
  'GET health': pub.health,
  'GET rules': pub.rules,
  'GET catalogue': pub.catalogue,
  'POST errors': pub.reportError,

  'POST auth/signup': account.signup,
  'POST auth/login': account.login,
  'POST auth/logout': account.logout,
  'GET auth/me': account.me,
  'POST auth/password': account.changePassword,
  'POST auth/delete': account.deleteAccount,
  'POST profile': account.updateProfile,

  'GET library': library.getLibrary,
  'POST favorites/add': library.addFavorite,
  'POST favorites/remove': library.removeFavorite,
  'POST history/add': library.addHistory,
  'POST history/clear': library.clearHistory,
  'POST playlists/create': library.createPlaylist,
  'POST playlists/rename': library.renamePlaylist,
  'POST playlists/delete': library.deletePlaylist,
  'POST playlists/add-track': library.addPlaylistTrack,
  'POST playlists/remove-track': library.removePlaylistTrack,
  'GET preferences': library.getPreferences,
  'POST preferences': library.savePreferences,

  'GET admin/stats': admin.adminStats,
  'POST admin/table': admin.adminTable,
  'POST admin/rights': admin.adminRights,
  'POST admin/import': admin.adminImport,
  'POST admin/prune-errors': admin.adminPruneErrors,
};

/** The API path, from the rewrite's ?route= or from the URL itself (/api/v1/<path>/). */
export function routeOf(req: Request): string {
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get('route');
  const raw = fromQuery ?? url.pathname.replace(/^\/api\/v1\/?/, '').replace(/^\/api\/server\/?/, '');
  return raw.replace(/^\/+|\/+$/g, '');
}

export async function handle(req: Request): Promise<Response> {
  const method = req.method === 'HEAD' ? 'GET' : req.method;
  const path = routeOf(req);
  const route = ROUTES[`${method} ${path}`];
  try {
    if (!route) {
      const known = Object.keys(ROUTES).some((k) => k.endsWith(` ${path}`));
      throw new HttpError(known ? 405 : 404, known ? 'Method not allowed.' : 'Not found.');
    }
    return await route(req);
  } catch (e) {
    return fail(e);
  }
}

export { json };
