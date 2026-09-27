/// <reference path="../../src/models.d.ts" />
// Blüten der Blumen von oben als Texturen in src/models/flowers/textures/:
// je Zoomstufe mit Blumen-Modellen ein Streifen aller Arten nebeneinander in
// der Auflösung, die die Stufe braucht (flower-zoom<n>.webp), dazu der große
// für die Nahansicht der Galerie (flower-large.webp, 512 px je Art).
// flower-index.json sagt, welche Art an welcher Stelle steht und bis zu wie
// vielen Geräte-Pixeln je Tile ein Streifen reicht - danach wählt das Spiel.
// Blütenblätter mit Fugen, Klee als Tupfen, gewölbte Mitte - ohne Drehung und
// ohne Licht: blossomCard() in src/gl/entityRenderer.ts legt die Textur auf die
// Blütenkarte, dreht sie je Blume und gibt Licht und Glanzpunkt zur Sonne dazu.
// Die Farben sind mit der Deckung vormultipliziert (blossomCard teilt wieder):
// Sonst mischt die GPU beim Filtern das Schwarz der durchsichtigen Pixel als
// grauen Saum in den Rand. Das WebP schreibt der Headless-Chrome
// (canvas.toDataURL wie tools/models/download-flower-photos.ts), so braucht es keinen Encoder.
//
// Aufruf: npm run gen:flower-blossoms

import { mkdirSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import { launch } from '../ui/browser.mjs';
import type { FlowerType } from '../../src/gl/flowerModel.ts';
import  {BASE_FLOWER_TEXTURE_URL} from '../../src/gl/flowerModel.ts';
import { Color, type RGB } from '../../src/functions/Color.ts';
import { fileURLToPath } from 'node:url';
import { ZOOM_LEVELS } from '../../src/game/Camera.ts';
import { FLOWER_OBJECT_PIXELS } from '../../src/gl/terrainRenderer.ts';
import { FLOWER_SIZE } from '../../src/world/flowers.ts';
import flowerModel from '../../src/models/flowers/flower.glb?model';

const SIZE = 512;
/** WebP-Qualität wie bei den Blumenfotos: ein Drittel der PNG-Größe, im Mittel unter einer Farbstufe Abweichung. */
const QUALITY = 0.85;

type FlowerRenderProps = {
  /** Zahl der Blütenblätter - 0: Klee, ein rundes Köpfchen. */
  petals: number;
  petal: RGB;
  heart: RGB;
  /** Radius der Mitte als Anteil der Blüte. */
  heartSize: number;
};


/** Form und Farben der Blüte je Art, die Farben in 0..255 - nur hier, das Spiel liest die Texturen. */
const FLOWERS: Record<FlowerType, FlowerRenderProps> = {
  daisy: { petals: 10, petal: Color.rgb(247, 247, 240).toRGB(), heart: Color.rgb(250, 199, 38).toRGB(), heartSize: 0.32 },
  buttercup: { petals: 5, petal: Color.rgb(255, 219, 31).toRGB(), heart: Color.rgb(217, 158, 20).toRGB(), heartSize: 0.22 },
  poppy: { petals: 4, petal: Color.rgb(230, 41, 31).toRGB(), heart: Color.rgb(31, 20, 20).toRGB(), heartSize: 0.26 },
  cornflower: { petals: 8, petal: Color.rgb(77, 115, 242).toRGB(), heart: Color.rgb(51, 51, 140).toRGB(), heartSize: 0.2 },
  clover: { petals: 0, petal: Color.rgb(235, 128, 184).toRGB(), heart: Color.rgb(204, 89, 148).toRGB(), heartSize: 0 },
};

/** Maße und Formfaktoren der Blüte. */
const BLOSSOM = {
  /** Anteil des Bildes, den die Blüte ausfüllt. */
  fill: 0.95,
  /** Seite, zu der die Kuppel in der Mitte heller wird (fest, nicht die Sonne im Spiel). */
  sun: [-0.45, 0.35],
  /** Wie weit die hellste Stelle der Kuppel zur Sonne rückt, in Radien der Mitte. */
  domeShift: 0.4,
  /** Spitze der Blütenblätter: kleiner = runder. */
  petalPointiness: 0.6,
  /** Breite der dunklen Fugen zwischen den Blütenblättern. */
  jointWidth: 0.35,
  /** Radius des Klee-Köpfchens (Arten ohne Blütenblätter). */
  cloverRim: 0.8,
  /** Tupfen je Einheit im Klee-Köpfchen. */
  cloverDots: 3,
  /** Pixel mit weniger Deckung bleiben durchsichtig. */
  minAlpha: 0.02,
};
type Blossom = typeof BLOSSOM;

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};
const fract = (value: number) => value - Math.floor(value);

/** Die Blüte als RGBA-Pixel, Zeile für Zeile von oben, die Farbe mit der Deckung vormultipliziert. */
const paintFlower = (flower: FlowerRenderProps, size: number, blossom: Blossom): Uint8ClampedArray => {
  const image = new Uint8ClampedArray(size * size * 4);
  // Ein Pixel in Einheiten der Blüte - für weiche, aber scharfe Ränder.
  const pixel = 2 / blossom.fill / size;
  // Richtung der Kuppel-Aufhellung in der Mitte.
  const sunLength = Math.hypot(blossom.sun[0], blossom.sun[1]);
  const toSun = [blossom.sun[0] / sunLength, blossom.sun[1] / sunLength];
  const heartRadius = Math.max(flower.heartSize, 1e-3);
  for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) {
    // Punkt auf der Blüte, Mitte 0, Rand 1; die Blüte füllt das Bild fast bis an den Rand, y zeigt nach oben.
    const x = ((col + 0.5) / size - 0.5) * 2 / blossom.fill;
    const y = (0.5 - (row + 0.5) / size) * 2 / blossom.fill;
    const distance = Math.hypot(x, y);
    const angle = Math.atan2(y, x);
    const petalWave = Math.abs(Math.cos(angle * flower.petals * 0.5));
    const rim = flower.petals > 0 ? 0.5 + 0.5 * Math.pow(petalWave, blossom.petalPointiness) : blossom.cloverRim;
    const alpha = smoothstep(rim + pixel, rim - pixel, distance);
    if (alpha < blossom.minAlpha) continue;
    // Blütenblätter: zur Mitte hin dunkler, dunkle Fugen zwischen den Blättern.
    let petalShade = 0.72 + 0.3 * distance;
    if (flower.petals > 0) petalShade *= 0.82 + 0.18 * smoothstep(0, blossom.jointWidth, petalWave);
    else petalShade *= 0.85 + 0.3 * (fract((x + y) * blossom.cloverDots) * fract((x - y) * blossom.cloverDots) * 4 >= 0.5 ? 1 : 0);
    // Die Mitte als kleine Kuppel.
    const inHeart = smoothstep(flower.heartSize + pixel, flower.heartSize - pixel, distance);
    const domeDistance = Math.hypot(x / heartRadius - toSun[0] * blossom.domeShift, y / heartRadius - toSun[1] * blossom.domeShift);
    const heartShade = 0.75 + 0.45 * Math.min(1, Math.max(0, 1 - domeDistance));
    const offset = (row * size + col) * 4;
    for (let channel = 0; channel < 3; channel++) {
      image[offset + channel] = alpha * (flower.petal[channel] * petalShade * (1 - inHeart) + flower.heart[channel] * heartShade * inHeart);
    }
    image[offset + 3] = 255 * alpha;
  }
  return image;
};

/** Verkleinert um einen ganzzahligen Faktor, je Block das Mittel - richtig, weil die Farben vormultipliziert sind. */
const downscale = (rgba: Uint8ClampedArray, size: number, target: number): Uint8ClampedArray => {
  const factor = size / target;
  if (!Number.isInteger(factor)) throw new Error(`${size} cannot be scaled down evenly to ${target}`);
  // In Gleitkomma summieren - ein Uint8ClampedArray rundete nach jeder Addition.
  const sum = new Float32Array(target * target * 4);
  for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) {
    const from = (row * size + col) * 4;
    const to = (Math.floor(row / factor) * target + Math.floor(col / factor)) * 4;
    for (let channel = 0; channel < 4; channel++) sum[to + channel] += rgba[from + channel];
  }
  return Uint8ClampedArray.from(sum, (v) => v / (factor * factor));
};

/** Läuft im Browser: RGBA-Pixel (Base64) als WebP-Daten-URL; Qualität 1 schreibt Chrome verlustfrei. */
const toWebp = ([pixels, width, height, quality]: [string, number, number, number]): string => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const data = Uint8ClampedArray.from(atob(pixels), (c) => c.charCodeAt(0));
  canvas.getContext('2d')!.putImageData(new ImageData(data, width, height), 0, 0);
  return canvas.toDataURL('image/webp', quality);
};

/**
 * Wie breit die Blüte im Spiel höchstens ist, in Geräte-Pixeln, je Zoomstufe
 * und Pixel-Verhältnis - daran bemisst sich, wie groß die Textur sein muss.
 * null: Die Blumen malt dort das Gelände (unter FLOWER_OBJECT_PIXELS je Tile).
 */
/** Breite der größten Blüte in Tiles. */
const largestBlossomTiles = () => {
  // Blütenkarte als Anteil der Modellbreite - loadModel(..., 'width') bezieht
  // die Instanzgröße auf die Breite aller Teile (Schatten, Blätter, Blüte).
  let part = '', x0 = Infinity, x1 = -Infinity, bx0 = Infinity, bx1 = -Infinity;
  for (const line of flowerModel.obj.split('\n')) {
    if (line.startsWith('o ')) part = line.slice(2);
    if (!line.startsWith('v ')) continue;
    const x = Number(line.split(' ')[1]);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    if (part === 'Blossom') { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); }
  }
  // Größte Blume: FLOWER_SIZE mal 1,25 (plant() in src/world/flowers.ts streut 0,8 bis 1,25).
  return FLOWER_SIZE * 1.25 * (bx1 - bx0) / (x1 - x0);
};

const blossomScreenSizes = (pixelRatios = [1, 2, 3]) => {
  const blossomTiles = largestBlossomTiles();
  return ZOOM_LEVELS.map((tileSize, i) => ({
    zoom: i + 1,
    tileSize,
    pixels: pixelRatios.map((ratio) => tileSize * ratio < FLOWER_OBJECT_PIXELS ? null : Math.ceil(blossomTiles * tileSize * ratio)),
  }));
};

const createFlowerBlossoms = async () => {
  console.log('Largest blossom in game, in device pixels (pixel ratio 1 / 2 / 3, - = painted by the terrain):');
  const sizes = blossomScreenSizes();
  for (const { zoom, tileSize, pixels } of sizes) {
    console.log(`  Zoom ${zoom} (${tileSize} px/Tile): ${pixels.map((p) => p ?? '-').join(' / ')}`);
  }
  // Nötige Auflösung je Zoomstufe: die nächste Zweierpotenz über der größten
  // Blüte der Stufe - so hat jedes Pixel auf dem Schirm mindestens ein Texel,
  // und die Mipmaps gehen glatt auf. Stufen, auf denen das Gelände malt, fehlen.
  const zooms = sizes.flatMap(({ zoom, pixels }) => {
    const largest = Math.max(...pixels.map((p) => p ?? 0));
    return largest > 0 ? [{ zoom, largest, size: 2 ** Math.ceil(Math.log2(largest)) }] : [];
  });
  for (const { zoom, largest, size } of zooms) console.log(`Needed resolution zoom ${zoom}: ${size} x ${size} (largest blossom ${largest} px)`);

  mkdirSync(BASE_FLOWER_TEXTURE_URL, { recursive: true });
  const browser = await launch();
  const page = await browser.newPage();
  const save = async (name: string, rgba: Uint8ClampedArray, width: number, height: number, quality: number) => {
    const save_path = fileURLToPath(new URL(`${name}.webp`, BASE_FLOWER_TEXTURE_URL));
    const url = await page.evaluate(toWebp, [Buffer.from(rgba.buffer).toString('base64'), width, height, quality] as [string, number, number, number]);
    if (!url.startsWith('data:image/webp')) throw new Error(`${name}: Chrome did not write WebP`);
    writeFileSync(save_path, Buffer.from(url.split(',')[1], 'base64'));
    console.log(`Saved flower ${name} => ${relative(process.cwd(), save_path)}`);
  };
  // Je Zoomstufe ein Streifen aller Arten nebeneinander, verlustfrei - bei so
  // wenigen Pixeln fiele jeder Fehler auf -, dazu der große in SIZE, verlustbehaftet.
  const types = Object.keys(FLOWERS) as FlowerType[];
  const blossomTiles = largestBlossomTiles();
  const strips = [
    ...zooms.map(({ zoom, size }) => ({ name: `flower-zoom${zoom}`, zoom, size, quality: 1 })),
    { name: 'flower-large', zoom: null, size: SIZE, quality: QUALITY },
  ].map((strip) => ({ ...strip, rgba: new Uint8ClampedArray(types.length * strip.size * strip.size * 4) }));
  const index = {} as Record<FlowerType, number>;
  for (const [i, type] of types.entries()) {
    console.log(`Start painting flower ${type}`)
    const rgba = paintFlower(FLOWERS[type], SIZE, BLOSSOM);
    for (const { size, rgba: strip } of strips) {
      const tile = size === SIZE ? rgba : downscale(rgba, SIZE, size);
      for (let row = 0; row < size; row++) {
        strip.set(tile.subarray(row * size * 4, (row + 1) * size * 4), (row * types.length + i) * size * 4);
      }
    }
    index[type] = i;
  }
  for (const { name, size, rgba, quality } of strips) await save(name, rgba, types.length * size, size, quality);
  const index_path = fileURLToPath(new URL('flower-index.json', BASE_FLOWER_TEXTURE_URL));
  writeFileSync(index_path, JSON.stringify({
    index,
    // Größter Streifen zuletzt; maxPixelsPerTile null = reicht für jede Größe.
    strips: strips.map(({ name, zoom, size }, i) => ({
      file: `${name}.webp`, zoom, size,
      maxPixelsPerTile: i === strips.length - 1 ? null : Math.floor(size / blossomTiles),
    })),
  }, null, 2) + '\n');
  console.log(`Saved flower index => ${relative(process.cwd(), index_path)}`);
  await browser.close();
  console.log('DONE!!!')
}

createFlowerBlossoms();