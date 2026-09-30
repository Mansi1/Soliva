// Bildkarten der Feldpflanzen in drei Wachstumsstufen (Sätzling, Jungpflanze,
// erwachsen) aus src/textures/: je Stufe das Bild auf seinen deckenden Teil
// zugeschnitten, unten mittig in ein Quadrat gesetzt und auf 256 px gebracht -
// so stehen alle Stufen gleich auf dem Boden, die Größe beim Wachsen gibt der
// Shader vor (cropCard in gl/entityRenderer.ts). Je Stufe eine .glb in
// src/models/fields/: <feld>_card (die Karte, die der Acker benutzt),
// <feld>_card_1, <feld>_card_2 (nur ihr Bild zählt). Ein Quadrat so breit wie hoch.
// Ebenso die Steine aus src/textures/stone/ als src/models/foliage/stone_<n>.glb
// (1 m, die Größe gibt gl/grassRenderer.ts je Stein vor) und die Wiesenpflanzen
// aus src/textures/grass/ als src/models/foliage/meadow_<name>.glb (Kante des
// Quadrats in m, etwa die natürliche Höhe; welche wie oft wächst, steht in
// gl/grassRenderer.ts), ebenso die Büsche aus src/textures/bush/ als bush_<name>.glb.
//
// Aufruf: node tools/models/crop-cards.mjs  (braucht Chrome, wie tools/ui)
import { readFileSync, writeFileSync } from 'node:fs';
import { launch } from '../ui/browser.mjs';
import { objToGlb } from './glb.mjs';

const textures = new URL('../../src/textures/', import.meta.url);
const fields = new URL('../../src/models/fields/', import.meta.url);
const foliage = new URL('../../src/models/foliage/', import.meta.url);
const STONES = Array.from({ length: 10 }, (_, i) => `stein${i + 1}`);
/** Feld: die drei Bilder und die Höhe der erwachsenen Pflanze (m) - wie die früheren Modelle. */
const CROPS = {
  wheat: [['weizen_saetzling', 'weizen_jungpflanze', 'weizen_erwachsen'], 1.0],
  corn: [['mais_nur_sätzling', 'mais_jungpflanze', 'mais_erwachsen'], 2.3],
  tomato: [['tomate_saetzling', 'tomate_jungpflanze', 'tomate_erwachsen'], 1.45],
  potato: [['Kartoffel_saetzling', 'kartoffel_jungpflanze', 'kartoffel_erwachsen'], 0.55],
  hop: [['hopfen_saetzling', 'hopfen_jungpflanze', 'hopfen_erwachsen'], 3.2],
};
/** Wiesenpflanzen: Bild in src/textures/grass/ und Kante der Karte in m. */
const MEADOW = {
  'deutsches-weidelgras': 1.0, 'deutsches-weidelgras2': 1.0, 'deutsches-weidelgras3': 1.0,
  'diamant-reitgras': 1.3, 'diamant-reisgras2': 1.3, glatthafer: 1.3, knaulgras: 1.15, reitgras: 1.3,
  'wiesen-lieschengras1': 1.15, 'wiesen-lieschengras2': 1.15, 'wiesen-lieschengras3': 1.15,
  'wiesen-rispengras1': 1.0, 'wiesen-rispengras2': 1.0, ziergras: 1.15, wollgras: 0.7, spitzwegerich: 0.5,
  gaensebluemchen: 0.26, hahnenfuss: 0.8, 'kuckucks-lichtnelke': 1.05, rotklee: 0.6, weissklee: 0.4,
  schafgabe: 1.05, 'wiesen-flockenblume': 1.05, 'wiesen-glockenblume': 0.85, 'wiesen-labkraut': 1.05,
  'wiesen-margerite': 1.05, 'wiesen-schaumkraut': 0.7, wiesensauerampfer: 1.15,
  besenginster: 1.5, ginster: 1.2, besenheide: 0.5, heidekraut: 0.45, schneeheide: 0.3, preiselbeere: 0.25,
};
/** Büsche: Bild in src/textures/bush/ und Kante der Karte in m - als src/models/foliage/bush_<name>.glb. */
const BUSHES = {
  gemeiner_schneeball_busch: 2.0, ginsterbusch: 1.6, haselnussbusch: 2.5, roter_hartriegel_busch: 1.8,
  roter_holunderbusch: 2.2, schlehenbusch: 2.0, schwarzer_holunderbusch: 2.5, 'wacholder-busch': 2.2, weissdorn: 2.4,
};
const SIZE = 256;

const browser = await launch();
const page = await browser.newPage();
/** Zugeschnitten, unten mittig im Quadrat, SIZE px - als PNG (Base64). */
const squared = (png) => page.evaluate(async ({ src, size }) => {
  const image = new Image();
  image.src = src;
  await image.decode();
  const probe = new OffscreenCanvas(image.width, image.height).getContext('2d');
  probe.drawImage(image, 0, 0);
  const d = probe.getImageData(0, 0, image.width, image.height).data;
  let x0 = image.width, x1 = -1, y0 = image.height, y1 = -1;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (d[(y * image.width + x) * 4 + 3] <= 8) continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  const [w, h] = [x1 - x0 + 1, y1 - y0 + 1];
  const side = Math.max(w, h);
  const scale = size / side;
  const canvas = new OffscreenCanvas(size, size);
  const g = canvas.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(image, x0, y0, w, h, (size - w * scale) / 2, size - h * scale, w * scale, h * scale);
  const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}, { src: `data:image/png;base64,${png.toString('base64')}`, size: SIZE });

/** Eine quadratische Karte (unten mittig, `height` Meter) mit dem Bild `png` (Base64). */
function card(material, height, png) {
  const half = height / 2;
  const obj = [
    `o ${material}`,
    `v ${-half} 0 0`, `v ${half} 0 0`, `v ${half} ${height} 0`, `v ${-half} ${height} 0`,
    'vt 0 0', 'vt 1 0', 'vt 1 1', 'vt 0 1',
    `usemtl ${material}`,
    'f 1/1 2/2 3/3 4/4',
  ].join('\n');
  return objToGlb(obj, `newmtl ${material}\nKd 1 1 1\nmap_Kd data:image/png;base64,${png}\n`);
}

for (const [crop, [stages, height]] of Object.entries(CROPS)) {
  const material = `${crop[0].toUpperCase()}${crop.slice(1)}Card`;
  for (const [i, name] of stages.entries()) {
    const png = await squared(readFileSync(new URL(`${name}.png`, textures)));
    const file = `${crop}_card${i ? `_${i}` : ''}.glb`;
    writeFileSync(new URL(file, fields), card(`${material}${i}`, height, png));
    console.log(`${file}: ${name}, ${height} m`);
  }
}
for (const [i, name] of STONES.entries()) {
  const png = await squared(readFileSync(new URL(`stone/${name}.png`, textures)));
  writeFileSync(new URL(`stone_${i + 1}.glb`, foliage), card(`Stone${i + 1}`, 1, png));
  console.log(`stone_${i + 1}.glb: ${name}`);
}
for (const [name, height] of Object.entries(MEADOW)) {
  const png = await squared(readFileSync(new URL(`grass/${name}.png`, textures)));
  const material = `Meadow${name.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase())}`;
  writeFileSync(new URL(`meadow_${name}.glb`, foliage), card(material, height, png));
  console.log(`meadow_${name}.glb: ${height} m`);
}
for (const [name, height] of Object.entries(BUSHES)) {
  const png = await squared(readFileSync(new URL(`bush/${name}.png`, textures)));
  const material = `Bush${name.replace(/(^|[-_])(\w)/g, (_, __, c) => c.toUpperCase())}`;
  writeFileSync(new URL(`bush_${name}.glb`, foliage), card(material, height, png));
  console.log(`bush_${name}.glb: ${height} m`);
}
await browser.close();
