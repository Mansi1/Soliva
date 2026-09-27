// Blüten der Blumen von oben als Textur: src/models/flowers/textures/<type>.webp,
// 512 x 512 (IMAGE_SIZE in entityRenderer.ts), Hintergrund durchsichtig.
// Blütenblätter mit Fugen, Klee als Tupfen, gewölbte Mitte - ohne Drehung und
// ohne Licht: blossomCard() in src/gl/entityRenderer.ts legt die Textur auf die
// Blütenkarte, dreht sie je Blume und gibt Licht und Glanzpunkt zur Sonne dazu.
// Die Farben sind mit der Deckung vormultipliziert (blossomCard teilt wieder):
// Sonst mischt die GPU beim Filtern das Schwarz der durchsichtigen Pixel als
// grauen Saum in den Rand. Das WebP schreibt der Headless-Chrome
// (canvas.toDataURL wie tools/ui/flower-photos.mjs), so braucht es keinen Encoder.
//
// Aufruf: npm run gen:flower-blossoms

import { mkdirSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import { launch } from '../ui/browser.mjs';
import type { FlowerType } from '../../src/gl/flowerModel.ts';
import  {BASE_FLOWER_TEXTURE_URL} from '../../src/gl/flowerModel.ts';
import { Color, type RGB } from '../../src/functions/Color.ts';
import { fileURLToPath } from 'node:url';

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

/** Läuft im Browser: RGBA-Pixel (Base64) als WebP-Daten-URL. */
const toWebp = ([pixels, size, quality]: [string, number, number]): string => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const data = Uint8ClampedArray.from(atob(pixels), (c) => c.charCodeAt(0));
  canvas.getContext('2d')!.putImageData(new ImageData(data, size, size), 0, 0);
  return canvas.toDataURL('image/webp', quality);
};

const createFlowerBlossoms = async () => {
  mkdirSync(BASE_FLOWER_TEXTURE_URL, { recursive: true });
  const browser = await launch();
  const page = await browser.newPage();
  for (const [type, flower] of Object.entries(FLOWERS)) {
    console.log(`Start painting flower ${type}`)
    const save_path = fileURLToPath(new URL(`${type}.webp`, BASE_FLOWER_TEXTURE_URL));
    const pixels = Buffer.from(paintFlower(flower, SIZE, BLOSSOM).buffer).toString('base64');
    const url = await page.evaluate(toWebp, [pixels, SIZE, QUALITY] as [string, number, number]);
    if (!url.startsWith('data:image/webp')) throw new Error(`${type}: Chrome schreibt kein WebP`);
    writeFileSync(save_path, Buffer.from(url.split(',')[1], 'base64'));
    console.log(`Saved flower ${type} => ${relative(process.cwd(), save_path)}`);
  }
  await browser.close();
  console.log('DONE!!!')
}

createFlowerBlossoms();