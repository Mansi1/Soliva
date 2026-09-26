// Exportiert Mühle und Fahne am Sammelpunkt mit Skelett und Clip als glTF
// (.glb) - Ausgangspunkt für src/models/clips/mill.glb und clips/flag.glb,
// heute zum Vergleich. Die Clips rechnen dieselben Formeln wie
// bisher der Shader (src/gl/entityRenderer.ts, P_SAILS und P_CLOTH):
//
//   sails  Die Flügel drehen um die Nabe, dazu Böen. Eine Schleife sind 7
//          Böen-Takte = genau 16 Umdrehungen (SAIL_SPEED / GUST_RATE = 16/7),
//          gemessen in "Mühlenzeit" (Spielzeit * Drehzahl der Mühle).
//   wave   Das Tuch weht: eine Welle läuft vom Mast zum Ende. Die Knochen
//          cloth.0-6 liegen dort, wo das Tuch seine Eckpunkte hat, und
//          verschieben sich seitwärts - so genau wie die Formel.
//
// Daneben je <name>.clips.json: Bildrate, Maßeinheit (height) und je Clip den
// Zeitbereich einer Schleife (phase_period) - daraus werden Custom
// Properties der Actions.
//
// Aufruf: node tools/export/props.mjs   (schreibt tools/export/out/mill.glb, flag.glb)

import { writeFileSync } from 'node:fs';
import { GltfBuilder, parseMtl, parseObj, qAxis } from './gltf.mjs';
import { readModel } from '../models/glb.mjs';

const root = new URL('../../', import.meta.url).pathname;
const out = `${root}tools/export/out`;
/** Spielerfarbe wie in der Galerie - für Paint. */
const PLAYER = [64 / 255, 160 / 255, 72 / 255];

// Wie in src/gl/entityRenderer.ts (SAIL_SPEED, GUST_AMOUNT, GUST_RATE).
const SAIL_SPEED = 0.8;
const GUST_AMOUNT = 0.6;
const GUST_RATE = 0.35;
/** Tuch: Welle sin(5 t - 14 y) * 0.12 y (y in Modell-Einheiten), wie P_CLOTH. */
const WAVE_SPEED = 5;
const WAVE_NUMBER = 14;
const WAVE_AMOUNT = 0.12;
/** Wie FLAG_SEGMENTS in src/gl/clips.ts. */
const FLAG_SEGMENTS = 6;

const range = (points, i) => [Math.min(...points.map((p) => p[i])), Math.max(...points.map((p) => p[i]))];
const mid = ([a, b]) => (a + b) / 2;

function sidecar(name, fps, height, clips) {
  writeFileSync(`${out}/${name}.clips.json`, JSON.stringify({ rig: name, fps, height, clips }, null, 2) + '\n');
}

// --- Mühle ------------------------------------------------------------------

{
  const mill = readModel('buildings/mill');
  const tris = parseObj(mill.obj).filter((t) => !t.object.startsWith('Entry'));
  const colors = parseMtl(mill.mtl);
  colors.set('Paint', PLAYER);
  const sails = tris.filter((t) => t.object.startsWith('Sails')).flatMap((t) => t.points);
  const hub = [mid(range(sails, 0)), mid(range(sails, 1)), mid(range(sails, 2))];
  // Maßeinheit wie loadModel(..., 'width'): Breite der feststehenden Teile.
  const width = (([a, b]) => b - a)(range(tris.filter((t) => !t.object.startsWith('Sails')).flatMap((t) => t.points), 0));

  const g = new GltfBuilder();
  const { nodes, skin } = g.skeleton('mill', [['root', null, [0, 0, 0]], ['sails', 'root', hub]]);
  const mesh = g.mesh('Mühle', tris, colors, (t) => (t.object.startsWith('Sails') ? 1 : 0));
  const meshNode = g.node({ name: 'Mühle', mesh, skin });

  const fps = 10;
  const loop = (7 * 2 * Math.PI) / GUST_RATE;
  const frames = Math.round(loop * fps) + 1;
  const times = [], rotations = [];
  for (let i = 0; i < frames; i++) {
    times.push(i / fps);
    const t = (i / (frames - 1)) * loop;
    // Die Flügel drehen um die Blickachse (Datei-z), rückwärts wie im Shader.
    rotations.push(...qAxis([0, 0, 1], -(t * SAIL_SPEED + GUST_AMOUNT * Math.sin(t * GUST_RATE))));
  }
  g.animation('sails', times, [[nodes[1], 'rotation', rotations]]);
  const rig = g.node({ name: 'mill', children: [nodes[0], meshNode] });
  const bytes = g.write(`${out}/mill.glb`, 'Mühle', [rig]);
  sidecar('mill', fps, width, [{ name: 'sails', frames, props: '', kneel: false, phase_period: loop, phase_shift: 0 }]);
  console.log(`${out}/mill.glb - ${(bytes / 1024).toFixed(0)} KB, sails ${frames} Bilder (${fps} fps), Nabe`, hub.map((v) => v.toFixed(2)));
}

// --- Fahne am Sammelpunkt ---------------------------------------------------

{
  const flag = readModel('props/rally_flag');
  const tris = parseObj(flag.obj);
  const colors = parseMtl(flag.mtl);
  colors.set('Paint', PLAYER);
  const all = tris.flatMap((t) => t.points);
  const [minY, maxY] = range(all, 1);
  // Maßeinheit wie loadModel(..., 'height'): die Höhe.
  const H = maxY - minY;
  const cloth = tris.filter((t) => t.object.startsWith('Cloth')).flatMap((t) => t.points);
  const [x0, x1] = range(cloth, 0);
  const cy = mid(range(cloth, 1));
  const at = (j) => x0 + ((x1 - x0) * j) / FLAG_SEGMENTS;

  const g = new GltfBuilder();
  const bones = [['root', null, [0, 0, 0]], ...Array.from({ length: FLAG_SEGMENTS + 1 }, (_, j) => [`cloth.${j}`, 'root', [at(j), cy, 0]])];
  const { nodes, skin } = g.skeleton('flag', bones);
  // Jeder Eckpunkt des Tuchs liegt an einem Knochen - am nächsten.
  const mesh = g.mesh('Fahne', tris, colors, (t, [x]) => (t.object.startsWith('Cloth')
    ? 1 + Math.round(((x - x0) / (x1 - x0)) * FLAG_SEGMENTS) : 0));
  const meshNode = g.node({ name: 'Fahne', mesh, skin });

  const fps = 30;
  const period = (2 * Math.PI) / WAVE_SPEED;
  const frames = Math.round(period * fps) + 1;
  const times = Array.from({ length: frames }, (_, i) => i / fps);
  const tracks = [];
  for (let j = 0; j <= FLAG_SEGMENTS; j++) {
    // Datei-x ist Modell-y (links), Datei-z ist Modell-x (vorn) - je Höhe H.
    const y = at(j) / H;
    const values = [];
    for (let i = 0; i < frames; i++) {
      const t = (i / (frames - 1)) * period;
      const forward = Math.sin(WAVE_SPEED * t - WAVE_NUMBER * y) * WAVE_AMOUNT * y;
      values.push(at(j), cy, forward * H);
    }
    tracks.push([nodes[j + 1], 'translation', values]);
  }
  g.animation('wave', times, tracks);
  const rig = g.node({ name: 'flag', children: [nodes[0], meshNode] });
  const bytes = g.write(`${out}/flag.glb`, 'Fahne', [rig]);
  sidecar('flag', fps, H, [{ name: 'wave', frames, props: '', kneel: false, phase_period: period, phase_shift: 0 }]);
  console.log(`${out}/flag.glb - ${(bytes / 1024).toFixed(0)} KB, wave ${frames} Bilder (${fps} fps), Tuch x ${x0}..${x1}`);
}
