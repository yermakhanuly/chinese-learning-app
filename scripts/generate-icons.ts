/**
 * Renders the app icon (white 汉 on Chinese red) to every size the iPhone app and website need.
 *   node scripts/generate-icons.ts
 * Placeholder branding — replace the SVG below when a real logo exists.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RED = '#B8202E';
const FONT = "'PingFang SC', 'Hiragino Sans GB', 'Noto Sans SC', sans-serif";

/** glyphScale: share of the canvas the character occupies. */
function svg(size: number, { background, glyphScale }: { background: string | null; glyphScale: number }) {
  const fontSize = Math.round(size * glyphScale);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${background ? `<rect width="100%" height="100%" fill="${background}"/>` : ''}
    <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle"
      font-family="${FONT}" font-weight="600" font-size="${fontSize}" fill="#FFFFFF">汉</text>
  </svg>`;
}

const OUTPUTS: { file: string; size: number; background: string | null; glyphScale: number }[] = [
  { file: 'assets/images/icon.png', size: 1024, background: RED, glyphScale: 0.62 },
  { file: 'assets/images/splash-icon.png', size: 512, background: null, glyphScale: 0.8 },
  { file: 'assets/images/favicon.png', size: 48, background: RED, glyphScale: 0.7 },
  { file: 'public/icons/icon-192.png', size: 192, background: RED, glyphScale: 0.62 },
  { file: 'public/icons/icon-512.png', size: 512, background: RED, glyphScale: 0.62 },
  { file: 'public/icons/icon-maskable-512.png', size: 512, background: RED, glyphScale: 0.48 },
  { file: 'public/icons/apple-touch-icon.png', size: 180, background: RED, glyphScale: 0.62 },
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const out of OUTPUTS) {
    await page.setViewportSize({ width: out.size, height: out.size });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">${svg(out.size, out)}</body></html>`,
    );
    const target = join(ROOT, out.file);
    mkdirSync(dirname(target), { recursive: true });
    await page.screenshot({ path: target, omitBackground: out.background === null });
    console.log(`✔ ${out.file} (${out.size}px)`);
  }
} finally {
  await browser.close();
}
