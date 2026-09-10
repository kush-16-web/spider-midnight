'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const COMIC_DIR = path.join(ROOT, 'icons', 'superhero');
const RETRO_DIR = path.join(ROOT, 'icons', 'retro');

fs.mkdirSync(COMIC_DIR, { recursive: true });
fs.mkdirSync(RETRO_DIR, { recursive: true });

const svgWrap = (inner, viewBox = '0 0 24 24') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="${viewBox}">${inner}</svg>`;

function blockMono(rows, color, x0, y0, cell, rx = 0.3) {
  let out = '';
  rows.forEach((row, r) => {
    row.forEach((v, c) => {
      if (v) out += `<rect x="${round(x0 + c * cell)}" y="${round(y0 + r * cell)}" width="${cell}" height="${cell}" rx="${rx}" fill="${color}"/>`;
    });
  });
  return out;
}

const round = (n) => Math.round(n * 100) / 100;

const MONOS = {
  J: [
    [1, 1, 1],
    [0, 0, 1],
    [0, 0, 1],
    [0, 0, 1],
    [1, 1, 0]
  ],
  S: [
    [1, 1, 1],
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 1],
    [1, 1, 1]
  ],
  T: [
    [1, 1, 1],
    [0, 1, 0],
    [0, 1, 0],
    [0, 1, 0],
    [0, 1, 0]
  ],
  TL: [
    [1, 1, 1, 0],
    [0, 1, 0, 0],
    [0, 1, 0, 0],
    [0, 1, 0, 0],
    [0, 1, 0, 0]
  ],
  SL: [
    [1, 1, 1, 0],
    [1, 0, 0, 0],
    [1, 1, 1, 0],
    [0, 0, 1, 0],
    [1, 1, 1, 0]
  ]
};

/* ------------------------------------------------------------------ */
/* COMIC / SUPERHERO SET                                               */
/* ------------------------------------------------------------------ */

const C = {
  default: '#B0BEC5',
  html: '#FF7043',
  css: '#4FC3F7',
  js: '#FFD54F',
  ts: '#64B5F6',
  react: '#4DD0E1',
  py: '#9CCC65',
  json: '#BA68C8',
  md: '#90A4AE',
  hero: '#F38BA8',
  game: '#C6A0F6',
  gold: '#FFD54F',
  white: '#F2F4FA',
  dark: '#161B2E',
  screen: '#0E1220',
  border: '#232A45'
};

function comicBurst(x, y, s, color) {
  return `<path d="M${x} ${y - s} L${x + 0.8 * s} ${y - 0.35 * s} L${x + s} ${y - 0.9 * s} L${x +
    0.55 * s} ${y + 0.05 * s} L${x + 1.25 * s} ${y + 0.15 * s} L${x + 0.6 * s} ${y + 0.55 * s} L${
    x + 0.85 * s} ${y + 1.3 * s} L${x + 0.3 * s} ${y + 0.85 * s} L${x - 0.5 * s} ${y + 1.1 * s} L${
    x - 0.1 * s} ${y + 0.45 * s} L${x - 0.9 * s} ${y + 0.2 * s} L${x - 0.2 * s} ${y - 0.15 * s} L${
    x - 0.7 * s} ${y - 0.9 * s} L${x + 0.05 * s} ${y - 0.45 * s} Z" fill="${color}"/>`;
}

function comicDoc(accent, emblem, burstColor) {
  const b = burstColor || C.white;
  return svgWrap(
    `<rect x="3" y="1.5" width="18" height="21" rx="2.8" fill="${C.dark}" stroke="${accent}" stroke-width="1.4"/>` +
      `<rect x="4.6" y="3" width="14.8" height="3.4" rx="1" fill="${accent}"/>` +
      comicBurst(18.5, 4.2, 1.05, b) +
      emblem
  );
}

const stars5 = (cx, cy, r, fill) =>
  `<polygon points="${cx},${cy - r} ${cx + 0.4 * r},${cy - 0.3 * r} ${cx + r},${cy - 0.3 * r} ${
    cx + 0.55 * r},${cy + 0.15 * r} ${cx + 0.7 * r},${cy + 0.85 * r} ${cx},${cy + 0.4 * r} ${
    cx - 0.7 * r},${cy + 0.85 * r} ${cx - 0.55 * r},${cy + 0.15 * r} ${cx - r},${cy - 0.3 * r} ${
    cx - 0.4 * r},${cy - 0.3 * r}" fill="${fill}"/>`;

const COMIC_EMBLEMS = {
  html:
    `<path d="M6 9.5 L9.5 12 L6 14.5 M10.5 9.5 L14 12 L10.5 14.5 M15 14.8 L16.6 13.2" fill="none" stroke="#FF7043" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
  css:
    `<path d="M10 8.5 V15.5 M14 8.5 V15.5 M8 11.2 H16 M8 13.2 H16" fill="none" stroke="#4FC3F7" stroke-width="1.7" stroke-linecap="round"/>`,
  js:
    `<rect x="4.6" y="9" width="14.8" height="8" rx="1.6" fill="${C.screen}" stroke="#FFD54F" stroke-width="1"/>` +
    blockMono(MONOS.J, '#FFD54F', 7.2, 10.6, 1.45) +
    blockMono(MONOS.S, '#FFD54F', 13.6, 10.6, 1.45),
  ts:
    `<rect x="4.6" y="9" width="14.8" height="8" rx="1.6" fill="${C.screen}" stroke="#64B5F6" stroke-width="1"/>` +
    blockMono(MONOS.TL, '#64B5F6', 7.2, 10.6, 1.45) +
    blockMono(MONOS.SL, '#64B5F6', 13.4, 10.6, 1.45),
  react:
    `<g fill="none" stroke="#4DD0E1" stroke-width="1.6"><ellipse cx="12" cy="13.2" rx="6.4" ry="2.7"/><ellipse cx="12" cy="13.2" rx="6.4" ry="2.7" transform="rotate(60 12 13.2)"/><ellipse cx="12" cy="13.2" rx="6.4" ry="2.7" transform="rotate(120 12 13.2)"/></g>` +
    `<circle cx="12" cy="13.2" r="1.7" fill="#0E1220" stroke="#4DD0E1" stroke-width="1.1"/>`,
  py:
    `<path d="M9 8.6 C9 6.2 15 6.2 15 8.6 C15 11 9 11 9 13.4 C9 15.8 15 15.8 15 13.4" fill="none" stroke="#9CCC65" stroke-width="1.9" stroke-linecap="round"/>` +
    `<circle cx="9.3" cy="8" r="0.8" fill="#FFD54F"/><circle cx="14.7" cy="16.5" r="0.8" fill="#FFD54F"/>`,
  json:
    `<path d="M9.5 8.5 C8 8.5 8 10 8 11.5 V12.5 C8 13.9 7.1 14.6 6 14.6 C7.1 14.6 8 15.3 8 16.7 V17.7 C8 19.2 8 20.7 9.5 20.7 M14.5 8.5 C16 8.5 16 10 16 11.5 V12.5 C16 13.9 16.9 14.6 18 14.6 C16.9 14.6 16 15.3 16 16.7 V17.7 C16 19.2 16 20.7 14.5 20.7" fill="none" stroke="#BA68C8" stroke-width="1.5" stroke-linecap="round"/>`,
  md:
    `<path d="M7 17 L9.6 12.6 L11.6 15 L13.4 12.2 L17 17" fill="none" stroke="#90A4AE" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
  hero:
    `<circle cx="12" cy="14" r="8" fill="#F38BA8" stroke="#FF8859" stroke-width="0.6"/>` +
    `<circle cx="12" cy="14" r="4.6" fill="#64B5F6" stroke="#E8E9F3" stroke-width="0.5"/>` +
    stars5(12, 14, 1.7, C.white),
  game:
    `<rect x="5" y="11" width="14" height="7" rx="1.8" fill="${C.screen}" stroke="#C6A0F6" stroke-width="1.3"/>` +
    `<rect x="8" y="12.5" width="1.6" height="4" rx="0.3" fill="#C6A0F6"/><rect x="9.6" y="14.4" width="4" height="1.6" rx="0.3" fill="#C6A0F6"/>` +
    `<rect x="15.2" y="14.6" width="1.6" height="1.6" fill="#C6A0F6"/><rect x="13.2" y="13" width="2" height="2" rx="0.4" fill="#F5BDE6"/>`
};

function comicFile(kind) {
  return comicDoc(C[kind], COMIC_EMBLEMS[kind]);
}

/* Folder shapes (comic) */
const folderShape =
  `<path d="M3.5 6.6 A1.9 1.9 0 0 1 5.4 4.7 L6 4.8 H9.8 L11.4 6.7 H18.6 A1.9 1.9 0 0 1 20.5 8.6 V16.4 A1.9 1.9 0 0 1 18.6 18.3 H5.4 A1.9 1.9 0 0 1 3.5 16.4 Z" fill="${C.dark}" stroke="${C.border}" stroke-width="1.3"/>`;

const capePath =
  `<path d="M5.4 7.5 C7 11.4 8.4 14 12 16.2 C8.2 15.4 6 12 5 9.6 Z" fill="#F38BA8" stroke="#C0245A" stroke-width="0.6"/>`;

function comicFolder(emblem, open) {
  const em = comicBurst(15.8, 13.5, 1.1, C.gold) + emblem;
  if (!open) {
    return svgWrap(folderShape.replace('#232A45', C.border) + em);
  }
  return svgWrap(
    `<path d="M3.5 9.3 H20.5 L18.6 17.2 C18.4 17.8 17.9 18.3 17.3 18.3 H6.7 C6.1 18.3 5.6 17.8 5.4 17.2 Z" fill="#1A2136" stroke="${C.border}" stroke-width="1.3"/>` +
      `<path d="M9.8 4.7 H18.6 A1.9 1.9 0 0 1 20.5 6.6 V9.3 H3.5 V8.6 A1.9 1.9 0 0 1 5.4 6.7 L7 6.75 L8.8 5.1 Z" fill="${C.dark}" stroke="${C.border}" stroke-width="1.3"/>` +
      capePath +
      em
  );
}

const COMIC_FOLDER_EMBLEMS = {
  default: stars5(11.5, 13, 1.9, C.gold),
  src: `<path d="M12.4 9.2 L8.6 13.6 H11.3 L9.9 17.4 L14.4 12.5 H11.4 Z" fill="#FFD54F" stroke="#B98A00" stroke-width="0.5" stroke-linejoin="round"/>`,
  components: `<polygon points="12,8.6 15.2,10.1 15.2,13.6 12,15.1 8.8,13.6 8.8,10.1" fill="#4DD0E1" stroke="#0E1220" stroke-width="0.5"/><circle cx="12" cy="11.8" r="1.3" fill="#0E1220"/>`,
  assets: stars5(12, 12.8, 2.1, C.gold)
};

/* ------------------------------------------------------------------ */
/* RETRO / PIXEL SET                                                   */
/* ------------------------------------------------------------------ */

const RETRO = {
  bg: '#10151F',
  border: '#2A3446',
  dark: '#20293C',
  html: '#FF8A50',
  css: '#56CCF2',
  js: '#FFD54F',
  ts: '#6CC3FF',
  react: '#4DD0E1',
  py: '#A5DE6E',
  json: '#C792EA',
  md: '#9FB3CC',
  hero: '#F47067',
  game: '#E1A3F0',
  gold: '#FFD24D',
  white: '#E6EDFF'
};

function pxRect(x, y, w, h, color) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}"/>`;
}

function pixelFile(accent, emblems) {
  const em = emblems.map((e) => e).join('');
  return svgWrap(
    `<rect x="3" y="1.5" width="18" height="21" fill="${RETRO.bg}" stroke="${RETRO.border}" stroke-width="1.2"/>` +
      `<rect x="7" y="3.5" width="10" height="2" fill="${accent}"/>` +
      pxRect(18.5, 2.6, 2, 2, accent) +
      em
  );
}

function monogram(rows, color, x0, y0, cell) {
  let out = '';
  rows.forEach((row, r) => {
    row.forEach((v, c) => {
      if (v) out += pxRect(x0 + c * cell, y0 + r * cell, cell, cell, color);
    });
  });
  return out;
}

function pixelScreen(x, y, w, h, accent) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#070B12" stroke="${accent}" stroke-width="1"/>`;
}

const RETRO_EMBLEMS = {
  html:
    `<rect x="8" y="9" width="1.6" height="1.6" fill="#FF8A50"/><rect x="10.2" y="10.8" width="1.6" height="1.6" fill="#FF8A50"/><rect x="8" y="12.6" width="1.6" height="1.6" fill="#FF8A50"/>` +
    `<rect x="11.8" y="9" width="1.6" height="1.6" fill="#FF8A50"/><rect x="14" y="10.8" width="1.6" height="1.6" fill="#FF8A50"/><rect x="11.8" y="12.6" width="1.6" height="1.6" fill="#FF8A50"/>` +
    `<rect x="16.6" y="10" width="1.4" height="1.4" fill="#FF8A50"/><rect x="15.4" y="11.4" width="1.4" height="1.4" fill="#FF8A50"/><rect x="14.8" y="12.8" width="1.4" height="1.4" fill="#FF8A50"/>`,
  css:
    `<rect x="9.2" y="8.4" width="1.8" height="7.2" fill="#56CCF2"/><rect x="13" y="8.4" width="1.8" height="7.2" fill="#56CCF2"/>` +
    `<rect x="7.2" y="10.6" width="9.6" height="1.8" fill="#56CCF2"/><rect x="7.2" y="13.6" width="9.6" height="1.8" fill="#56CCF2"/>`,
  js:
    pixelScreen(4.5, 7, 15, 10.5, '#FFD54F') + blockMono(MONOS.J, '#FFD54F', 6.8, 8.8, 1.8, 0) + blockMono(MONOS.S, '#FFD54F', 13.2, 8.8, 1.8, 0),
  ts:
    pixelScreen(4.5, 7, 15, 10.5, '#6CC3FF') + blockMono(MONOS.T, '#6CC3FF', 6.9, 8.8, 1.8, 0) + blockMono(MONOS.S, '#6CC3FF', 13.2, 8.8, 1.8, 0),
  react:
    pxRect(10, 6.5, 4, 2, '#4DD0E1') +
    pxRect(7, 8.7, 2, 2, '#4DD0E1') + pxRect(15, 8.7, 2, 2, '#4DD0E1') +
    pxRect(5, 12, 2, 2, '#4DD0E1') + pxRect(17, 12, 2, 2, '#4DD0E1') +
    pxRect(7, 15.3, 2, 2, '#4DD0E1') + pxRect(15, 15.3, 2, 2, '#4DD0E1') +
    pxRect(11, 17.5, 2, 2, '#4DD0E1') +
    pxRect(11, 12, 2, 2, '#0F1B20') +
    pxRect(9.5, 12, 2, 2, '#4DD0E1') + pxRect(12.5, 17.1, 2, 2, '#4DD0E1'),
  py:
    pxRect(8.6, 8, 3, 2, '#A5DE6E') +
    pxRect(6.8, 10, 4, 3, '#A5DE6E') +
    pxRect(10.4, 8.6, 1.6, 1.6, '#FFD24D') +
    pxRect(14.2, 14.6, 1.6, 1.6, '#FFD24D') +
    pxRect(12.4, 13, 3, 2, '#A5DE6E') +
    pxRect(13, 15, 4, 3, '#A5DE6E') +
    pxRect(11.2, 12.4, 4, 1.6, '#A5DE6E'),
  json:
    pxRect(7.4, 8, 1.8, 7.6, '#C792EA') +
    pxRect(9.2, 9.4, 1.6, 1.6, '#C792EA') +
    pxRect(9.2, 12.6, 1.6, 1.6, '#F0C6FF') +
    pxRect(6, 11.2, 1.6, 1.6, '#F0C6FF') +
    pxRect(14.9, 8, 1.8, 7.6, '#C792EA') +
    pxRect(13.3, 9.4, 1.6, 1.6, '#F0C6FF') +
    pxRect(13.3, 12.6, 1.6, 1.6, '#C792EA') +
    pxRect(16.6, 11.2, 1.6, 1.6, '#C792EA'),
  md:
    pixelScreen(7, 8, 10, 8.5, '#9FB3CC') +
    monogram(
      [
        [1, 0, 0, 1, 0, 0, 1],
        [1, 1, 0, 1, 0, 1, 1],
        [1, 0, 1, 1, 1, 0, 1],
        [1, 0, 0, 1, 0, 0, 1]
      ],
      '#9FB3CC',
      8.8,
      10.4,
      1.3
    ),
  hero:
    `<rect x="8" y="10" width="8" height="9" fill="#F47067"/><rect x="8" y="7.5" width="8" height="2.5" clip-path="" fill="#F47067"/><polygon points="10,7.5 12,8.7 14,7.5 12,7.5" fill="#F47067"/><polygon points="8,10 10,10 8,9 10,5.4 12,6.6 14,5.4 16,9 14,10 16,10" fill="#F47067"/>` +
    `<path d="M9.6 12.2 L10.9 12.2 L12 10.9 L13.1 12.2 L14.4 12.2" fill="none" stroke="#10151F" stroke-width="0"/>` +
    pxRect(9, 12.4, 6, 1.4, '#FFE9EC') +
    pxRect(12, 11, 1.4, 1.4, '#FFE9EC') +
    pxRect(10.6, 13.2, 1.4, 1.4, '#FFE9EC'),
  game:
    pxRect(6, 13.4, 12, 1.8, '#E1A3F0') +
    pxRect(8, 11.6, 8, 1.8, '#E1A3F0') +
    pxRect(8.4, 12.2, 1.6, 2.2, '#10151F') +
    pxRect(6, 12.2, 1.6, 2.2, '#10151F') +
    pxRect(15, 12.2, 1.6, 2.2, '#10151F') +
    pxRect(16.4, 12.2, 1.6, 2.2, '#10151F') +
    pxRect(9.6, 14, 1.6, 1.6, '#10151F') +
    pxRect(13.6, 16.2, 1.6, 1.6, '#FF8A50') +
    pxRect(11.6, 14.6, 1.6, 1.6, '#56CCF2') +
    pxRect(12.8, 16.6, 1.6, 1.6, '#10151F')
};

function retroFile(kind) {
  let em = RETRO_EMBLEMS[kind];
  if (kind === 'default') {
    em = pxRect(9, 10, 6, 2, '#B0BEC5') + pxRect(11, 12.8, 4, 2, '#B0BEC5') + pxRect(13.4, 15.6, 1.6, 2, '#B0BEC5');
  }
  return pixelFile(RETRO[kind] || '#B0BEC5', em instanceof Array ? em : [em]);
}

const retroChest = (open) => {
  let lid;
  if (open) {
    lid =
      `<polygon points="6.5,6.5 17.5,6.5 15.5,4 8.5,4" fill="#C8893F" stroke="#2A2320" stroke-width="1.2"/>` +
      pxRect(10.5, 4, 1.6, 1.6, '#2A2320');
  } else {
    lid = `<rect x="5.5" y="6" width="13" height="3.6" fill="#C8893F" stroke="#2A2320" stroke-width="1.2"/>`;
  }
  return (
    lid +
    `<rect x="5.5" y="9.6" width="13" height="6.4" fill="#8A5A28" stroke="#2A2320" stroke-width="1.2"/>` +
    `<rect x="10.6" y="11" width="2.8" height="2.8" fill="#FFD24D" stroke="#2A2320" stroke-width="1"/>` +
    pxRect(11.5, 12.2, 1, 1.4, '#2A2320') +
    pxRect(7.5, 11.4, 1.6, 1.6, '#FFE9B8')
  );
};

const retroChestFolder = (open) =>
  svgWrap(
    retroChest(open) +
      (open
        ? pxRect(10, 2.8, 1.4, 2.8, '#FFD24D') + pxRect(7.4, 4.2, 2.2, 1.4, '#FFD24D') + pxRect(14.4, 4.2, 2.2, 1.4, '#FFD24D')
        : '')
  );

function retroFolder(emblem, open) {
  const body = open
    ? `<rect x="3.5" y="8" width="17" height="9.5" fill="#20293C" stroke="#2A3446" stroke-width="1.2"/>` +
      `<rect x="7" y="4.2" width="10" height="3.8" fill="#2A3446"/>` +
      pxRect(7, 4.2, 10, 1.4, '#3B4A63')
    : `<rect x="3.5" y="7.5" width="17" height="10" fill="#20293C" stroke="#2A3446" stroke-width="1.2"/>` +
      `<rect x="5.5" y="5" width="13" height="2.6" fill="#2A3446"/>` +
      pxRect(5.5, 5, 13, 1, '#3B4A63');
  return svgWrap(body + emblem);
}

const RETRO_FOLDER_EMBLEMS = {
  default: pxRect(10, 12.4, 4, 1.6, '#FFD24D') + pxRect(11.4, 11, 1.6, 4.6, '#FFD24D'),
  components:
    pxRect(8, 8.8, 8, 7, '#E5484D') +
    pxRect(8, 8.8, 8, 1.6, '#FF8F90') +
    pxRect(12, 12.4, 2, 2.2, '#7E1E22') +
    pxRect(8.6, 10.9, 1.4, 1.4, '#7E1E22') +
    pxRect(14, 14.5, 1.4, 1.4, '#7E1E22'),
  assets:
    pxRect(10.6, 10.8, 2.8, 2.8, '#FFD24D') +
    pxRect(9.2, 12, 5.6, 1.6, '#FFD24D') +
    pxRect(8.4, 13.6, 7.2, 1.6, '#FFB020') +
    pxRect(11.5, 10.3, 1, 1, '#FFF3C4') +
    pxRect(8.8, 15.2, 2, 0.8, '#8A5A20')
};

const RETRO_FOLDER_FUNCS = {
  default: (open) => retroFolder(RETRO_FOLDER_EMBLEMS.default, open),
  src: retroChestFolder,
  components: (open) => retroFolder(RETRO_FOLDER_EMBLEMS.components, open),
  assets: (open) => retroFolder(RETRO_FOLDER_EMBLEMS.assets, open)
};

/* ------------------------------------------------------------------ */
/* WRITE FILES                                                         */
/* ------------------------------------------------------------------ */

const comicKinds = ['default', 'html', 'css', 'js', 'ts', 'react', 'py', 'json', 'md', 'hero', 'game'];
for (const kind of comicKinds) {
  fs.writeFileSync(path.join(COMIC_DIR, `file-${kind === 'default' ? 'default' : kind}.svg`), comicFile(kind));
}

for (const name of ['default', 'src', 'components', 'assets']) {
  fs.writeFileSync(path.join(COMIC_DIR, `folder-${name}.svg`), comicFolder(COMIC_FOLDER_EMBLEMS[name], false));
  fs.writeFileSync(path.join(COMIC_DIR, `folder-${name}-open.svg`), comicFolder(COMIC_FOLDER_EMBLEMS[name], true));
}

const retroKinds = ['default', 'html', 'css', 'js', 'ts', 'react', 'py', 'json', 'md', 'hero', 'game'];
for (const kind of retroKinds) {
  fs.writeFileSync(path.join(RETRO_DIR, `file-${kind === 'default' ? 'default' : kind}.svg`), retroFile(kind));
}

for (const name of ['default', 'src', 'components', 'assets']) {
  fs.writeFileSync(path.join(RETRO_DIR, `folder-${name}.svg`), RETRO_FOLDER_FUNCS[name](false));
  fs.writeFileSync(path.join(RETRO_DIR, `folder-${name}-open.svg`), RETRO_FOLDER_FUNCS[name](true));
}

console.log(`Comic icons written to ${COMIC_DIR}`);
console.log(`Retro icons written to ${RETRO_DIR}`);