// Vergleicht die Clips der Tiere aus Blender (src/models/clips/quadruped.glb +
// .json) mit der Formel des Shaders (Zweig "beast" in
// src/gl/entityRenderer.ts, hier Zeile für Zeile nachgebaut) - für jede Art mit
// jedem ihrer Clips, an den vier Hufen bzw. Pfoten, am Maul und vorn und
// hinten am Körper, auf jedem Bild und zwischen zwei Bildern (so mischt das
// Spiel). Gebacken wird wie im Spiel: src/gl/clips.ts (QUADRUPED), je Art
// mit ihren Maßen.
//
// Ausgabe je Punkt: größte Abweichung auf den Bildern / zwischen zwei Bildern,
// in cm bei der echten Größe des Tiers.
//
// Aufruf: node tools/blender/parity-animals.mjs [Ausgabeordner für clips.js]

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { SPECIES, animalPart, measureAnimal } from '../export/animal-poses.mjs';
import { parseObj } from '../export/gltf.mjs';
import { readModel } from '../models/glb.mjs';

const root = new URL('../../', import.meta.url).pathname;
const out = process.argv[2] ?? `${tmpdir()}/pgm-parity-animals`;
mkdirSync(out, { recursive: true });
execFileSync('npx', ['tsc', `${root}src/gl/clips.ts`, '--ignoreConfig', '--outDir', out,
  '--module', 'es2022', '--target', 'es2022', '--skipLibCheck'], { cwd: root, stdio: 'inherit' });
writeFileSync(`${out}/package.json`, '{"type":"module"}\n');
const { loadClips, bakeClip, QUADRUPED, QUADRUPED_BONE } = await import(`${out}/clips.js`);

const glb = readFileSync(`${root}src/models/clips/quadruped.glb`);
const manifest = JSON.parse(readFileSync(`${root}src/models/clips/quadruped.json`, 'utf8'));
const clips = loadClips(`data:model/gltf-binary;base64,${glb.toString('base64')}`, manifest, QUADRUPED);
const bones = QUADRUPED.bones.length;

// --- Die Formel des Shaders (Modell-Koordinaten: x vorn, y links, z oben) -----

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** swingAt im Shader: um das Gelenk (vorn, oben) = pivot in der Ebene x-z. */
const swingAt = ([x, y, z], [px, pz], a) => {
  const qx = x - px, qz = z - pz;
  return [px + qx * Math.cos(a) - qz * Math.sin(a), y, pz + qx * Math.sin(a) + qz * Math.cos(a)];
};
function formula(kind, pose, phase, part, p0, J) {
  let p = [...p0];
  const hare = kind === 'hare';
  const jump = hare || (pose === 5 && kind !== 'cow');
  const front = part === 'leg.FL' || part === 'leg.FR';
  const leg = part.startsWith('leg.');
  const pivot = [front ? J.legs[0] : J.legs[1], J.hip];
  let bob = 0, dip = 0;
  if (pose === 1 || pose === 5) {
    const amp = pose === 5 ? 0.8 : 0.45;
    const s = Math.sin(phase);
    let a;
    if (jump) {
      a = (front ? s : -s) * amp;
      bob = Math.max(0, Math.sin(phase + 1.2)) * (hare ? 0.25 : 0.1);
    } else {
      a = (part === 'leg.FL' || part === 'leg.BR' ? s : -s) * amp;
      bob = Math.abs(Math.cos(phase)) * 0.015;
    }
    if (leg) p = swingAt(p, pivot, a);
    dip = pose === 5 ? 0.15 : -0.1;
  } else if (pose === 0) {
    const up = smoothstep(0.6, 0.9, Math.sin(phase * 0.21 + 1));
    dip = J.graze + (0 - J.graze) * up + Math.sin(phase * 2.3) * 0.05 * (1 - up);
  }
  if (part === 'head') p = swingAt(p, J.neck, -dip);
  p[2] += bob;
  if (pose === 6) p = [p[0], -p[2], p[1] + J.side];
  return p;
}

// --- Der Clip je Punkt (wie der Shader: Knochen je Teil, Matrix aus dem Backen) --

function clipPoint(baked, frame, part, p) {
  const bone = part === 'body' ? QUADRUPED_BONE.root : QUADRUPED_BONE[part];
  const o = (frame * bones + bone) * 12;
  const r = (k) => baked[o + k * 4] * p[0] + baked[o + k * 4 + 1] * p[1] + baked[o + k * 4 + 2] * p[2] + baked[o + k * 4 + 3];
  return [r(0), r(1), r(2)];
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const lerp3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

let worstAll = 0;
for (const kind of SPECIES) {
  const tris = parseObj(readModel(`animals/${kind}`).obj);
  const J = measureAnimal(tris);
  const local = ([x, y, z]) => [z / J.H, x / J.H, (y - J.minY) / J.H];
  // Messpunkte: je Bein der tiefste Punkt, am Kopf der vorderste (Maul), am
  // Körper der vorderste und der hinterste.
  const pick = (test, better) => {
    let best = null;
    for (const t of tris) for (const q of t.points) {
      const m = local(q);
      if (test(animalPart(t.object)) && (!best || better(m, best))) best = m;
    }
    return best;
  };
  const points = {
    'Huf VL': ['leg.FL', pick((part) => part === 'leg.FL', (a, b) => a[2] < b[2])],
    'Huf VR': ['leg.FR', pick((part) => part === 'leg.FR', (a, b) => a[2] < b[2])],
    'Huf HL': ['leg.BL', pick((part) => part === 'leg.BL', (a, b) => a[2] < b[2])],
    'Huf HR': ['leg.BR', pick((part) => part === 'leg.BR', (a, b) => a[2] < b[2])],
    Maul: ['head', pick((part) => part === 'head', (a, b) => a[0] > b[0])],
    'Körper vorn': ['body', pick((part) => part === 'body', (a, b) => a[0] > b[0])],
    'Körper hinten': ['body', pick((part) => part === 'body', (a, b) => a[0] < b[0])],
  };
  for (const clip of clips) {
    if (clip.species.length > 0 && !clip.species.includes(kind)) continue;
    const meta = manifest.clips.find((c) => c.name === clip.name);
    const baked = bakeClip(clip, J, {}, QUADRUPED);
    const cells = [];
    for (const [label, [part, p]] of Object.entries(points)) {
      const w = [0, 0];
      const last = Math.max(1, clip.frames - 1);
      for (let f = 0; f < last; f++) {
        for (const [k, half] of [[0, 0], [1, 0.5]]) {
          const phase = meta.phase_shift + ((f + half) / last) * meta.phase_period;
          const want = formula(kind, meta.pose, phase, part, p, J);
          const got = lerp3(clipPoint(baked, f, part, p), clipPoint(baked, Math.min(f + 1, clip.frames - 1), part, p), half);
          w[k] = Math.max(w[k], dist(want, got) * J.H * 100);
        }
      }
      worstAll = Math.max(worstAll, w[0]);
      cells.push(`${label} ${w[0].toFixed(2)} / ${w[1].toFixed(2)} cm`);
    }
    console.log(`${kind.padEnd(6)} ${clip.name.padEnd(9)} ${cells.join(' | ')}`);
  }
}
console.log(`größte Abweichung auf den Bildern: ${worstAll.toFixed(2)} cm`);
