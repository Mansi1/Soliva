// Fotos der Blumen fürs Auswahl-Panel: lädt je Art ein Bild aus Wikipedia
// (Wikimedia Commons) und legt es als src/models/flowers/photos/<type>.webp ab
// (flowerPhoto in src/gl/flowerModel.ts). Vorhandene Dateien bleiben, wie sie
// sind. Umgewandelt wird im Headless-Chrome (canvas.toDataURL), so braucht es
// keinen eigenen WebP-Encoder.
//
// Aufruf: npm run download:flower-photos

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../ui/browser.mjs';
import { BASE_FLOWER_PHOTO_URL, type FlowerType } from '../../src/gl/flowerModel.ts';

const COMMONS = 'https://upload.wikimedia.org/wikipedia/commons/thumb/';
/** WebP-Qualität der Fotos. */
const QUALITY = 0.85;

/** Vorschaubild je Art auf Wikimedia Commons, 250 px breit. */
const PHOTOS: Record<FlowerType, string> = {
  daisy: '1/18/Gaensebluemchen-Krusenkoppel-2022_05_msu-7425-7154.jpg/250px-Gaensebluemchen-Krusenkoppel-2022_05_msu-7425-7154.jpg',
  buttercup: 'c/cb/RanunculusAcris.jpg/250px-RanunculusAcris.jpg',
  poppy: '7/72/Papaver_rhoeas_Lincolnshire_2026.jpg/250px-Papaver_rhoeas_Lincolnshire_2026.jpg',
  cornflower: '1/1d/Kornblume02.JPG/250px-Kornblume02.JPG',
  clover: '9/9d/Trifolium_pratense_-_Keila.jpg/250px-Trifolium_pratense_-_Keila.jpg',
};

/** Wikimedia verlangt einen User-Agent und bremst schnelle Folgen (429) - dann warten. */
const download = async (type: FlowerType, path: string): Promise<Response> => {
  let res = await fetch(COMMONS + path, { headers: { 'User-Agent': 'soliva-flower-photos/1.0' } });
  for (let tries = 1; res.status === 429 && tries < 5; tries++) {
    const wait = Number(res.headers.get('retry-after')) || 2 ** tries * 2;
    console.log(`${type}: too many requests, waiting ${wait} s`);
    await new Promise((r) => setTimeout(r, wait * 1000));
    res = await fetch(COMMONS + path, { headers: { 'User-Agent': 'soliva-flower-photos/1.0' } });
  }
  if (!res.ok) throw new Error(`${type}: HTTP ${res.status}`);
  return res;
};

/** Läuft im Browser: Bild (Daten-URL) als WebP-Daten-URL. */
const toWebp = async ([src, quality]: [string, number]): Promise<string> => {
  const img = new Image();
  img.src = src;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext('2d')!.drawImage(img, 0, 0);
  return canvas.toDataURL('image/webp', quality);
};

const downloadFlowerPhotos = async () => {
  mkdirSync(BASE_FLOWER_PHOTO_URL, { recursive: true });
  const missing = (Object.entries(PHOTOS) as [FlowerType, string][])
    .filter(([type]) => !existsSync(new URL(`${type}.webp`, BASE_FLOWER_PHOTO_URL)));
  if (missing.length === 0) {
    console.log('all flower photos already there');
    return;
  }
  const browser = await launch();
  const page = await browser.newPage();
  try {
    for (const [type, path] of missing) {
      console.log(`Start downloading flower photo ${type}`);
      const res = await download(type, path);
      const src = `data:${res.headers.get('content-type')};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
      const url = await page.evaluate(toWebp, [src, QUALITY] as [string, number]);
      if (!url.startsWith('data:image/webp')) throw new Error(`${type}: Chrome did not write WebP`);
      const save_path = fileURLToPath(new URL(`${type}.webp`, BASE_FLOWER_PHOTO_URL));
      writeFileSync(save_path, Buffer.from(url.split(',')[1], 'base64'));
      console.log(`Saved flower photo ${type} => ${relative(process.cwd(), save_path)}`);
    }
  } finally {
    await browser.close();
  }
  console.log('DONE!!!');
};

downloadFlowerPhotos();
