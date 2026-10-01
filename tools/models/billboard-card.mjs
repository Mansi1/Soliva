// Eine Bildkarte als .glb: ein Rechteck (4 Eckpunkte, 2 Dreiecke), unten
// mittig am Ursprung, Y oben, Vorderseite +Z, das Bild eingebettet (map_Kd) -
// wie die Billboards in src/models/fields/billboards/. Die Breite folgt dem
// Seitenverhältnis des Bilds. Das Spiel liest nur das Bild als Textur und die
// Lage; Alpha unter 0.5 verwirft der Shader (imageTexture).
//
// Aufruf: node tools/models/billboard-card.mjs <bild.png> <ziel.glb> <Material> [Höhe in m] [Kd "r g b"]
// Kd färbt das Bild ein (das Spiel multipliziert beim Hochladen, MODEL_IMAGES).
// Das Bild vorher verkleinern - die Karten im Spiel sind 256 px hoch -, etwa
// auf dem Mac: sips -Z 256 quelle.png --out bild.png
import { readFileSync, writeFileSync } from 'node:fs';
import { objToGlb } from './glb.mjs';

const [png, out, material, height = '1', kd = '1 1 1'] = process.argv.slice(2);
if (!png || !out || !material) throw new Error('Aufruf: billboard-card.mjs <bild.png> <ziel.glb> <Material> [Höhe]');
const bytes = readFileSync(png);
// PNG: Breite und Höhe im IHDR-Block.
const [w, h] = [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
const H = Number(height);
const half = (H * w) / h / 2;
const obj = [
  `o ${material}`,
  `v ${-half} 0 0`, `v ${half} 0 0`, `v ${half} ${H} 0`, `v ${-half} ${H} 0`,
  'vt 0 0', 'vt 1 0', 'vt 1 1', 'vt 0 1',
  `usemtl ${material}`,
  'f 1/1 2/2 3/3 4/4',
].join('\n');
const mtl = `newmtl ${material}\nKd ${kd}\nmap_Kd data:image/png;base64,${bytes.toString('base64')}\n`;
writeFileSync(out, objToGlb(obj, mtl));
console.log(`${out}: ${w}x${h} px, ${(half * 2).toFixed(3)} x ${H} m`);
