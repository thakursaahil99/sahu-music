// Generates PWA / favicon / mobile launcher PNGs from the SVG logo.  Run: npm run icons
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const logo = await readFile(join(root, 'apps/web/public/logo.svg'));

// Maskable icons need the artwork inside the central "safe zone", on a full-bleed background.
const maskable = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#0B0B0B"/>
   <g transform="translate(86 86) scale(0.664)" stroke="#D7AE55" stroke-linecap="round" fill="none">
     <path d="M330 172c0-52-140-62-140 18 0 80 140 50 140 135 0 80-145 70-150 15" stroke-width="44"/>
     <path d="M92 216v80M128 186v140M384 186v140M420 216v80" stroke-width="22"/>
   </g></svg>`,
);

const targets = [
  ['apps/web/public/icons/icon-192.png', logo, 192],
  ['apps/web/public/icons/icon-512.png', logo, 512],
  ['apps/web/public/icons/maskable-512.png', maskable, 512],
  ['apps/web/public/icons/apple-touch-icon.png', maskable, 180],
  ['apps/web/public/favicon.png', logo, 48],
  ['apps/admin/public/favicon.png', logo, 48],
  ['apps/admin/public/logo.png', logo, 192],
  ['apps/mobile/assets/icon.png', maskable, 1024],
  ['apps/mobile/assets/logo.png', logo, 512],
];

for (const [out, src, size] of targets) {
  const file = join(root, out);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, await sharp(src, { density: 384 }).resize(size, size).png().toBuffer());
  console.log('wrote', out);
}
