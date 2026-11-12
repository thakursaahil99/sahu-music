// SAHU MUSIC API (Vercel Function). Every /api/v1/* request is rewritten here (see vercel.json),
// so the whole backend is one function. The database is Neon (DATABASE_URL, set by the
// Vercel Neon integration); browsers never connect to it directly.
import { handle } from './_lib/router';

export const GET = handle;
export const POST = handle;
export const HEAD = handle;
