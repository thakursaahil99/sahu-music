import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

/**
 * The admin console is a static export served by the same site as the website, under /admin
 * (the Vercel build copies apps/admin/out into apps/web/out/admin). Sharing the origin means it
 * uses the same /api backend and the same secure session cookie.
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  output: 'export',
  basePath: '/admin',
  trailingSlash: true,
  images: { unoptimized: true },
  transpilePackages: ['@sahu/api', '@sahu/models', '@sahu/shared'],
  reactStrictMode: true,
};

export default (phase) => ({
  ...nextConfig,
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
});
