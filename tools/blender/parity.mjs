// Vergleicht die Clips aus Blender (src/models/clips/humanoid.glb + .json) mit
// den Formeln des Shaders (tools/export/poses.mjs, Figuren-Zweig in
// src/gl/entityRenderer.ts) - für Mann und Frau, an Händen, Füßen, Scheitel und
// unterem Rumpf, auf jedem Bild und zwischen zwei Bildern (so mischt das Spiel).
//
// Die Clips backt src/gl/clips.ts - dafür wird es einzeln nach JavaScript
// übersetzt (Ausgabe in einen Ordner außerhalb des Projekts).
//
// Ausgabe je Punkt: größte Abweichung auf den Bildern / zwischen zwei Bildern.
//
// Aufruf: node tools/blender/parity.mjs [Ausgabeordner für clips.js]
// Zur Diagnose schaltet PARITY_OHNE Verformungen der Formel ab, die kein
// Knochen tragen kann: PARITY_OHNE=atmen,rock (Atmen beim Stehen, Rock- und
// Hosenschwung mit dem Oberkörper).

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pose } from '../export/poses.mjs';
import { readModel } from '../models/glb.mjs';

const root = new URL('../../', import.meta.url).pathname;
const without = new Set((process.env.PARITY_OHNE ?? '').split(',').filter(Boolean));
const out = process.argv[2] ?? `${tmpdir()}/pgm-parity`;
mkdirSync(out, { recursive: true });
execFileSync('npx', ['tsc', `${root}src/gl/clips.ts`, '--ignoreConfig', '--outDir', out,
  '--module', 'es2022', '--target', 'es2022', '--skipLibCheck'], { cwd: root, stdio: 'inherit' });
writeFileSync(`${out}/package.json`, '{"type":"module"}\n');
const { loadClips, bakeClip, BONE, HUMANOID_BONES } = await import(`${out}/clips.js`);

const glb = readFileSync(`${root}src/models/clips/humanoid.glb`);
const manifest = JSON.parse(readFileSync(`${root}src/models/clips/humanoid.json`, 'utf8'));
const clips = loadClips(`data:model/gltf-binary;base64,${glb.toString('base64')}`, manifest);
const meta = new Map(manifest.clips.map((c) => [c.name, c]));

// --- Figur: Gelenke und Messpunkte wie loadModel() (Modell-Einheiten) -------

function figure(file, stride) {
  let obj = '';
  let hip = -1e9, sh = -1e9, el = -1e9, kn = -1e9, minY = 1e9, maxY = -1e9;
  const fa = [1e9, 0];
  const verts = [];
  // Hülle mit Knochen (Armature): Köpfe (j) und stärkster Knochen je Eckpunkt (vw).
  const heads = new Map();
  for (const l of readModel(file).obj.split('\n')) {
    if (l.startsWith('o ')) obj = l.slice(2);
    if (l.startsWith('j ')) heads.set(l.split(' ')[1], l.split(' ').slice(2).map(Number));
    if (l.startsWith('vw ')) verts.at(-1).bone = l.split(' ')[1];
    if (!l.startsWith('v ')) continue;
    const [x, y, z] = l.split(' ').slice(1).map(Number);
    verts.push({ obj, p: [x, y, z] });
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    if (/^Leg\.[LR]\.Lower/.test(obj)) kn = Math.max(kn, y);
    else if (/^Leg\.[LR]/.test(obj)) hip = Math.max(hip, y);
    if (/^Arm\.[LR]\.Lower/.test(obj) && !/Tool|Scythe/.test(obj)) {
      el = Math.max(el, y);
      fa[0] = Math.min(fa[0], Math.abs(x));
      fa[1] = Math.max(fa[1], Math.abs(x));
    } else if (/^Arm\.[LR]/.test(obj) && !/Tool|Scythe/.test(obj)) sh = Math.max(sh, y);
  }
  const H = maxY - minY;
  const m = ([x, y, z]) => [z / H, x / H, (y - minY) / H];
  const head = (bone) => m(heads.get(bone));
  // Mit Knochen: Gelenke aus den Köpfen, wie loadModel().
  const J = heads.size
    ? { hip: head('thigh.L')[2], knee: head('shin.L')[2], shoulder: head('upperArm.L')[2], elbow: head('forearm.L')[2], arm: Math.abs(head('upperArm.L')[1]) }
    : { hip: (hip - minY) / H, knee: (kn - minY) / H, shoulder: (sh - minY) / H, elbow: (el - minY) / H, arm: (fa[0] + fa[1]) / 2 / H };
  // Ein Teil: starr am Namen (re) oder - auf der Hülle - am stärksten Knochen.
  const of = (re, bone) => verts.filter((v) => (v.bone ? v.bone === bone : re.test(v.obj))).map((v) => m(v.p));
  const centre = (re) => {
    const ps = verts.filter((v) => re.test(v.obj)).map((v) => m(v.p));
    return ps.reduce((s, p) => s.map((c, i) => c + p[i] / ps.length), [0, 0, 0]);
  };
  const extreme = (ps, key) => ps.reduce((b, p) => (key(p) > key(b) ? p : b));
  // Unterer Rumpf: der tiefste Punkt des Rumpfs (Rock- bzw. Hosensaum), vorn.
  const torso = verts.filter((v) => (v.bone ? /Body$/.test(v.bone) : !/^(Leg|Arm|Head|Load|Knife)/.test(v.obj))).map((v) => m(v.p));
  const hem = torso.reduce((b, p) => (p[2] < b[2] - 1e-6 || (Math.abs(p[2] - b[2]) < 1e-6 && p[0] > b[0]) ? p : b));
  const foot = (p) => -p[2] + p[0] * 0.01;
  return {
    H, J, stride,
    points: {
      'Hand rechts': { part: 'forearm.R', p: heads.size ? head('hand.R') : centre(/^Arm\.R\.Lower\.Hand/) },
      'Hand links': { part: 'forearm.L', p: heads.size ? head('hand.L') : centre(/^Arm\.L\.Lower\.Hand/) },
      'Fuß rechts': { part: 'shin.R', p: extreme(of(/^Leg\.R\.Lower/, 'shin.R'), foot) },
      'Fuß links': { part: 'shin.L', p: extreme(of(/^Leg\.L\.Lower/, 'shin.L'), foot) },
      Scheitel: { part: 'head', p: extreme(of(/^Head/, 'head'), (p) => p[2]) },
      'Rumpf unten': { part: 'torso', p: hem },
    },
  };

}

// --- Die Formel des Shaders je Punkt ----------------------------------------

const swing = ([x, y, z], pv, a) => { const q = z - pv; return [x * Math.cos(a) - q * Math.sin(a), y, x * Math.sin(a) + q * Math.cos(a) + pv]; };
const side = ([x, y, z], [py, pz], a) => { const qy = y - py, qz = z - pz; return [x, py + qy * Math.cos(a) - qz * Math.sin(a), pz + qy * Math.sin(a) + qz * Math.cos(a)]; };

function formula(name, phase, part, p0, J, stride) {
  const a = pose(name, phase, { knee: J.knee, stride });
  const legL = part === 'thigh.L' || part === 'shin.L';
  const legR = part === 'thigh.R' || part === 'shin.R';
  const armL = part === 'upperArm.L' || part === 'forearm.L';
  const armR = part === 'upperArm.R' || part === 'forearm.R';
  const upper = !legL && !legR && (part !== 'torso' || p0[2] > J.hip);
  let p = [...p0];
  if (name === 'stand') {
    if (p[2] > J.hip && !without.has('atmen')) p[2] += a.breath * 0.008 * (p[2] - J.hip) / (1 - J.hip);
    if (part === 'head') {
      const c = Math.cos(a.yaw), s = Math.sin(a.yaw);
      p = [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]];
    }
    p[1] += a.shift * 0.02 * p[2];
  }
  if (name === 'carve' && part === 'head') p = swing(p, J.shoulder + 0.03, a.nod);
  if (part === 'shin.L') p = swing(p, J.knee, a.kneeL);
  if (part === 'shin.R') p = swing(p, J.knee, a.kneeR);
  if (part === 'forearm.L') p = swing(p, J.elbow, a.elL);
  if (part === 'forearm.R') p = swing(p, J.elbow, a.elR);
  if (legL) p = swing(p, J.hip, a.hipL);
  if (legR) p = swing(p, J.hip, a.hipR);
  if (armL && a.inL !== 0) p = side(p, [J.arm, J.shoulder], -a.inL);
  if (armR && a.inR !== 0) p = side(p, [-J.arm, J.shoulder], a.inR);
  if (armL) p = swing(p, J.shoulder, a.shL);
  if (armR) p = swing(p, J.shoulder, a.shR);
  if (upper) {
    const c = Math.cos(a.twist), s = Math.sin(a.twist);
    p = [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]];
    p = swing(p, J.hip, -a.lean);
  } else if (part === 'torso') {
    if (!without.has('rock')) p[1] += a.twist * 0.25 * (J.hip - p[2]);
    if (name === 'pick') {
      const below = (J.hip - p[2]) / J.hip;
      p[2] = J.hip - (J.hip - p[2]) * (J.hip + a.bob) / (J.hip - 0.02);
      p[0] += below * 0.14;
    }
  }
  p[1] += a.sway;
  p[2] += a.bob;
  return p;
}

// --- Der Clip je Punkt (wie der Shader im Spiel) ----------------------------

function clipPoint(baked, frame, part, p0, J, kneel) {
  const bones = HUMANOID_BONES.length;
  let p = [...p0];
  // Wie im Spiel (entityRenderer.ts, clipTwist): der untere Rumpf schwingt mit
  // der Drehung der Schultern - aus der Matrix des Oberkörpers (Zeile 1, Spalte 0).
  if (part === 'torso' && p[2] <= J.hip) {
    const u = (frame * bones + BONE.upperBody) * 12;
    const twist = Math.asin(Math.max(-1, Math.min(1, baked[u + 4])));
    p = [p[0], p[1] + twist * 0.25 * (J.hip - p[2]), p[2]];
  }
  // Wie im Spiel: kniend wird der Rock vor dem Skinning gestaucht.
  if (kneel && part === 'torso' && p[2] <= J.hip) {
    const bob = -(J.knee - 0.04);
    const below = (J.hip - p[2]) / J.hip;
    p = [p[0] + below * 0.14, p[1], J.hip - (J.hip - p[2]) * (J.hip + bob) / (J.hip - 0.02)];
  }
  const bone = part === 'torso' ? (p0[2] > J.hip ? BONE.upperBody : BONE.lowerBody) : BONE[part];
  const o = (frame * bones + bone) * 12;
  const r = (k) => baked[o + k * 4] * p[0] + baked[o + k * 4 + 1] * p[1] + baked[o + k * 4 + 2] * p[2] + baked[o + k * 4 + 3];
  return [r(0), r(1), r(2)];
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const lerp3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const cm = (v) => `${(v * 170).toFixed(2)} cm`;

const bodies = { Mann: figure('villagers/male', 1), Frau: figure('villagers/female', 0.6) };
for (const clip of clips) {
  const c = meta.get(clip.name);
  if (c?.pose === undefined) continue;
  for (const [who, body] of Object.entries(bodies)) {
    // Wie im Spiel: je Körper gebacken - Schrittweite beim Gehen, Kniehöhe beim Knien.
    const baked = bakeClip(clip, body.J, { stride: body.stride });
    const worst = {};
    for (const [label, { part, p }] of Object.entries(body.points)) {
      const w = [0, 0];
      for (let f = 0; f < clip.frames - 1; f++) {
        [0, 0.5].forEach((half, h) => {
          const phase = c.phase_shift + ((f + half) / (clip.frames - 1)) * c.phase_period;
          const want = formula(clip.name, phase, part, p, body.J, body.stride);
          const got = lerp3(clipPoint(baked, f, part, p, body.J, c.kneel), clipPoint(baked, f + 1, part, p, body.J, c.kneel), half);
          w[h] = Math.max(w[h], dist(want, got));
        });
      }
      worst[label] = w;
    }
    console.log(`${clip.name.padEnd(6)} ${who.padEnd(5)} ${Object.entries(worst).map(([k, [a, b]]) => `${k} ${cm(a)} / ${cm(b)}`).join(' | ')}`);
  }
}

// Wo die Formel nicht periodisch ist: Sprung am Schleifenende (stand) bzw.
// Abweichung ab der zweiten Runde (carve: der Zug-Versatz sin(k * 1.7)).
const man = bodies.Mann;
for (const name of ['stand', 'carve']) {
  const c = meta.get(name);
  let jump = 0;
  for (const { part, p } of Object.values(man.points)) {
    const end = formula(name, c.phase_shift + c.phase_period, part, p, man.J, 1);
    const start = formula(name, c.phase_shift, part, p, man.J, 1);
    jump = Math.max(jump, dist(end, start));
  }
  let later = 0;
  if (name === 'carve') {
    for (let f = 0; f < 3000; f++) {
      const phase = c.phase_shift + c.phase_period + (f / 3000) * c.phase_period * 3;
      const inClip = c.phase_shift + ((phase - c.phase_shift) % c.phase_period);
      for (const { part, p } of Object.values(man.points)) {
        later = Math.max(later, dist(formula(name, phase, part, p, man.J, 1), formula(name, inClip, part, p, man.J, 1)));
      }
    }
  }
  console.log(`${name}: Sprung am Schleifenende (Formel) ${cm(jump)}${name === 'carve' ? `, ab Runde 2 gegen die Formel ${cm(later)}` : ''}`);
}
