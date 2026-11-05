// Renders icons/icon.svg into the PNG sizes needed for installing allo OS.
// Usage: node tools/make-pngs.cjs   (needs Playwright + Chromium)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const svg = fs.readFileSync(path.join(root, 'icons/icon.svg'), 'utf8');
const out = [
  ['icon-192.png', 192, 0.22],
  ['icon-512.png', 512, 0.22],
  ['icon-maskable-512.png', 512, 0],
  ['apple-touch-icon.png', 180, 0]
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [name, size, radius] of out) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">
      <div style="width:${size}px;height:${size}px;border-radius:${radius * 100}%;overflow:hidden">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</div></body></html>`);
    await page.screenshot({ path: path.join(root, 'icons', name), omitBackground: true });
  }
  await browser.close();
  console.log('done');
})();
