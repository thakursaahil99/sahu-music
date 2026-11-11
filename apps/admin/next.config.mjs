/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fully static export → deployable for free on Cloudflare Pages (no server needed).
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  transpilePackages: ['@sahu/api', '@sahu/models', '@sahu/shared'],
  reactStrictMode: true,
};

export default nextConfig;
