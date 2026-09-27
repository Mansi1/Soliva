// Fotos der Blumen fürs Auswahl-Panel: lädt je Art ein Bild aus Wikipedia
// (Wikimedia Commons) und legt es als public/assets/blumen/<Name>.webp ab -
// der Name wie in FLOWER_KINDS (src/gl/flowerModel.ts). Vorhandene Dateien
// bleiben, wie sie sind. Umgewandelt wird im Headless-Chrome (canvas.toDataURL),
// so braucht es keinen eigenen WebP-Encoder.
//
// Aufruf: npm run fetch:flowers

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { launch } from './browser.mjs';

const COMMONS = 'https://upload.wikimedia.org/wikipedia/commons/thumb/';
/** Name (wie in FLOWER_KINDS) → Vorschaubild, 250 px breit. */
const PHOTOS = {
  Gänseblümchen: '1/18/Gaensebluemchen-Krusenkoppel-2022_05_msu-7425-7154.jpg/250px-Gaensebluemchen-Krusenkoppel-2022_05_msu-7425-7154.jpg',
  Butterblume: 'c/cb/RanunculusAcris.jpg/250px-RanunculusAcris.jpg',
  Mohn: '7/72/Papaver_rhoeas_Lincolnshire_2026.jpg/250px-Papaver_rhoeas_Lincolnshire_2026.jpg',
  Kornblume: '1/1d/Kornblume02.JPG/250px-Kornblume02.JPG',
  Klee: '9/9d/Trifolium_pratense_-_Keila.jpg/250px-Trifolium_pratense_-_Keila.jpg',
};

// Prüfung: jede Art in FLOWER_KINDS hat hier ein Foto und umgekehrt.
const model = readFileSync(new URL('../../src/gl/flowerModel.ts', import.meta.url), 'utf8');
const kinds = [...model.matchAll(/ name: '([^']+)'/g)].map((m) => m[1]);
if (kinds.sort().join() !== Object.keys(PHOTOS).sort().join()) {
  throw new Error(`FLOWER_KINDS (${kinds.join(', ')}) passt nicht zu PHOTOS (${Object.keys(PHOTOS).join(', ')})`);
}

const out = new URL('../../public/assets/blumen/', import.meta.url);
mkdirSync(out, { recursive: true });
const missing = Object.entries(PHOTOS).filter(([name]) => !existsSync(new URL(`${name}.webp`, out)));
if (missing.length === 0) {
  console.log('alle Blumenfotos schon da');
  process.exit(0);
}

const browser = await launch();
const page = await browser.newPage();
for (const [name, path] of missing) {
  // Wikimedia verlangt einen User-Agent und bremst schnelle Folgen (429) - dann warten.
  let res;
  for (let tries = 0; tries < 5; tries++) {
    res = await fetch(COMMONS + path, { headers: { 'User-Agent': 'soliva-flower-photos/1.0' } });
    if (res.status !== 429) break;
    const wait = Number(res.headers.get('retry-after')) || 2 ** tries * 2;
    console.log(`${name}: zu viele Anfragen, warte ${wait} s`);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
  if (!res.ok) {
    await browser.close();
    throw new Error(`${name}: HTTP ${res.status}`);
  }
  const src = `data:${res.headers.get('content-type')};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
  const webp = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
    return canvas.toDataURL('image/webp', 0.85);
  }, src);
  if (!webp.startsWith('data:image/webp')) throw new Error(`${name}: Chrome schreibt kein WebP`);
  writeFileSync(new URL(`${name}.webp`, out), Buffer.from(webp.split(',')[1], 'base64'));
  console.log(`✓ ${name}.webp`);
}
await browser.close();
