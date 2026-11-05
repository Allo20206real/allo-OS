// Generates the SVG icons for the system and built-in apps.
// Usage: node tools/make-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const W = 'stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"';

function icon(top, bottom, glyph) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>
  <radialGradient id="sh" cx=".3" cy=".1" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient>
</defs>
<rect width="100" height="100" fill="url(#bg)"/>
<rect width="100" height="100" fill="url(#sh)"/>
${glyph}
</svg>
`;
}

const icons = {
  settings: icon('#9aa5b3', '#5b6676', `
  <g ${W}>
    <circle cx="50" cy="50" r="11"/>
    <path d="M50 22v8M50 70v8M22 50h8M70 50h8M30.2 30.2l5.7 5.7M64.1 64.1l5.7 5.7M30.2 69.8l5.7-5.7M64.1 35.9l5.7-5.7"/>
    <circle cx="50" cy="50" r="22"/>
  </g>`),
  store: icon('#4aa8ff', '#1662f0', `
  <g ${W}>
    <path d="M30 38h40l-3 34a5 5 0 0 1-5 4.5H38A5 5 0 0 1 33 72z" fill="#fff" fill-opacity=".18"/>
    <path d="M40 38v-4a10 10 0 0 1 20 0v4"/>
    <path d="M42 56l8 8 8-8M50 46v18"/>
  </g>`),
  clock: icon('#3a3d45', '#15161a', `
  <circle cx="50" cy="50" r="30" fill="#fff"/>
  <g stroke="#15161a" stroke-width="5" stroke-linecap="round"><path d="M50 50V32M50 50l11 7"/></g>
  <path d="M50 50 44 66" stroke="#ff7a1a" stroke-width="2.5" stroke-linecap="round"/>
  <circle cx="50" cy="50" r="3.5" fill="#ff7a1a"/>`),
  calculator: icon('#ffad4a', '#ff6f12', `
  <g ${W}>
    <path d="M28 33h14M35 26v14M58 33h14M28 66h14M58 61h14M58 71h14M30.5 58.5l9 9M39.5 58.5l-9 9"/>
  </g>`),
  notes: icon('#ffd966', '#ffb21a', `
  <rect x="26" y="22" width="48" height="56" rx="8" fill="#fff"/>
  <g stroke="#ffb21a" stroke-width="5" stroke-linecap="round"><path d="M36 38h28M36 50h28M36 62h16"/></g>`),
  weather: icon('#63ccff', '#2385ee', `
  <circle cx="40" cy="42" r="13" fill="#ffd54a"/>
  <path d="M38 74h30a12 12 0 0 0 0-24 16 16 0 0 0-30 4 10 10 0 0 0 0 20z" fill="#fff"/>`),
  camera: icon('#4d5059', '#202227', `
  <g ${W}>
    <path d="M24 40a6 6 0 0 1 6-6h8l5-7h14l5 7h8a6 6 0 0 1 6 6v26a6 6 0 0 1-6 6H30a6 6 0 0 1-6-6z"/>
    <circle cx="50" cy="53" r="10"/>
  </g>
  <circle cx="68" cy="43" r="2.6" fill="#ffd54a"/>`),
  gallery: icon('#ff9a7a', '#ff4d7d', `
  <rect x="22" y="26" width="56" height="48" rx="9" fill="#fff" fill-opacity=".2" stroke="#fff" stroke-width="6"/>
  <circle cx="39" cy="42" r="6" fill="#fff"/>
  <path d="M25 70l17-17 11 11 8-8 15 15" ${W}/>`),
  calendar: icon('#ff7466', '#ef3348', `
  <rect x="24" y="28" width="52" height="48" rx="9" fill="#fff"/>
  <path d="M24 44h52" stroke="#ef3348" stroke-width="5"/>
  <g stroke="#fff" stroke-width="6" stroke-linecap="round"><path d="M37 22v10M63 22v10"/></g>
  <g fill="#ef3348"><circle cx="37" cy="56" r="3.6"/><circle cx="50" cy="56" r="3.6"/><circle cx="63" cy="56" r="3.6"/><circle cx="37" cy="67" r="3.6"/><circle cx="50" cy="67" r="3.6"/></g>`),
  tasks: icon('#56dc8f', '#18b062', `
  <circle cx="50" cy="50" r="25" ${W}/>
  <path d="M39 50.5l7.5 7.5 15-15" ${W}/>`),
  sketch: icon('#b884ff', '#7244ee', `
  <g ${W}>
    <path d="M62 24l14 14-34 34H28V58z"/>
    <path d="M55 31l14 14"/>
  </g>`),
  recorder: icon('#ff7272', '#e1323f', `
  <g ${W}><path d="M26 44v12M36 34v32M46 26v48M56 38v24M66 30v40M76 44v12"/></g>`),
  units: icon('#45dccc', '#109f99', `
  <g ${W}>
    <path d="M28 38h42l-10-10M72 62H30l10 10"/>
  </g>`)
};

for (const [id, svg] of Object.entries(icons)) {
  const f = join(root, 'apps', id, 'icon.svg');
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, svg);
}

// allo OS logo
const logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7a6bff"/><stop offset=".55" stop-color="#3f6ff2"/><stop offset="1" stop-color="#22c3d8"/></linearGradient>
  <radialGradient id="sh" cx=".25" cy=".1" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".25"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient>
</defs>
<rect width="100" height="100" fill="url(#bg)"/>
<rect width="100" height="100" fill="url(#sh)"/>
<circle cx="46" cy="52" r="17" fill="none" stroke="#fff" stroke-width="9"/>
<path d="M67 34v36" stroke="#fff" stroke-width="9" stroke-linecap="round"/>
</svg>
`;
writeFileSync(join(root, 'icons', 'icon.svg'), logo);
console.log('icons written:', Object.keys(icons).length + 1);
