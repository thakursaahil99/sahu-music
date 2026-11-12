import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fully static export → deployable for free on Cloudflare Pages (no server needed).
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  transpilePackages: ['@sahu/api', '@sahu/models', '@sahu/shared'],
  reactStrictMode: true,
  experimental: {
    // Pages are generated in ONE worker, so the music catalogue written into them
    // (src/lib/catalogue-build.ts) is fetched once per build instead of once per worker.
    cpus: 1,
  },
};

// `next dev` and `next build` must not share an output folder: a build that runs while
// the dev server is up overwrites its chunks ("Cannot find module './383.js'").
export default (phase) => ({
  ...nextConfig,
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
});
