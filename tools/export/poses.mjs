// Die Posen der Dorfbewohner, wie der Shader sie heute rechnet
// (src/gl/entityRenderer.ts, Figuren-Zweig, Posen 0-5) - als Gelenkwinkel je
// Phase. Daraus macht tools/export/bognerei.mjs die Clips für Blender
// (docs/ANIMATION.md, Phase 2), und tools/blender/parity.mjs vergleicht die
// Clips mit diesen Formeln.

import { readFileSync } from 'node:fs';

const models = new URL('../../src/models/', import.meta.url).pathname;
const MOW = JSON.parse(readFileSync(`${models}poses/mow.json`, 'utf8'));
const CARVE = JSON.parse(readFileSync(`${models}poses/carve.json`, 'utf8'));

const mix = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/**
 * Die Clips: Name, Pose, Werkzeuge in der Hand, welcher Phasenbereich
 * [shift, shift + period] den Clip bildet und wie viele Sekunden er in Blender
 * dauert (nur für Blender und die Dichte der Bilder - das Spiel rechnet die
 * Phase um: Clip-Zeit = (Phase - shift) * Dauer / period).
 * - stand: Phase = Sekunden. Die Formel wiederholt sich nie ganz; nach 34 s
 *   stehen ihre Schwingungen am nächsten wieder am Anfang.
 * - walk: Phase aus der Schrittlänge, sin/cos(phase) - 2π; in Blender 2 s
 *   lang, damit Knie und Füße zwischen den Bildern nicht abkürzen.
 * - chop: sin(phase) - 2π.
 * - pick: sin(0.6 phase) und sin(0.3 phase) - 4π / 0.6.
 * - mow: sin(0.6 phase) - 2π / 0.6.
 * - carve: 15 Züge (0.6 phase = 2π je Zug), ab dem Anfang eines Zugs.
 */
export const CLIPS = [
  { name: 'stand', pose: 0, props: 'axe', period: 34, shift: 0, seconds: 34 },
  // Gehen: 2 s statt der raschen Spielzeit - genug Bilder für Knie und Füße (61).
  { name: 'walk', pose: 1, props: 'axe', period: Math.PI * 2, shift: 0, seconds: 2 },
  { name: 'chop', pose: 2, props: 'axe', period: Math.PI * 2, shift: 0, seconds: (Math.PI * 2) / 6, strikeTempo: 1 },
  { name: 'pick', pose: 3, props: '', period: (Math.PI * 4) / 0.6, shift: 0, seconds: (Math.PI * 4) / 0.6 / 6, kneel: true, strikeTempo: 0.6 },
  { name: 'mow', pose: 4, props: 'scythe', period: (Math.PI * 2) / 0.6, shift: 0, seconds: (Math.PI * 2) / 0.6 / 6, strikeTempo: 0.6 },
  { name: 'carve', pose: 5, props: 'knife', period: (15 * Math.PI * 2) / 0.6, shift: 4.712389 / 0.6, seconds: (15 * Math.PI * 2) / 0.6 / 6, strikeTempo: 0.6 },
];

/**
 * Takt-Marken eines Clips (Custom Property `strike`): die Clip-Zeiten (s) in
 * einer Schleife, zu denen ein Hieb bzw. Griff zu hören ist - wie
 * VillagerWork.swing() es vor den Clips aus der Formel rechnete: der Ton kommt,
 * wenn Phase * strikeTempo 1,5π (+ 2π k) durchläuft (Hacken im vollen Takt,
 * Pflücken, Mähen und Schnitzen mit 0,6). `duration`: Länge der Schleife in
 * Blender. Ohne strikeTempo (Stehen, Gehen) keine.
 */
export function strikeTimes(clip, duration) {
  if (!clip.strikeTempo) return [];
  const step = (Math.PI * 2) / clip.strikeTempo;
  const first = (Math.PI * 1.5) / clip.strikeTempo;
  const times = [];
  // Erste Marke ab dem Anfang der Schleife (shift), eine Periode lang.
  let phase = first + Math.ceil((clip.shift - first) / step - 1e-6) * step;
  for (; phase < clip.shift + clip.period - 1e-6; phase += step) {
    times.push(Math.max(0, ((phase - clip.shift) * duration) / clip.period));
  }
  return times;
}

/**
 * Gelenkwinkel einer Pose zur Phase - der Abschnitt `if (pose == …)` im
 * Shader, mit seinen Vorgaben. `knee` ist uKnee (Modell-Einheiten), für die
 * Hüfthöhe beim Knien; `stride` ist uStride (Frau 0.6, Mann 1).
 *
 * Zusätzlich, weil der Shader es als Verformung statt als Drehung rechnet:
 * - yaw: Kopf dreht um die Hochachse (Stehen).
 * - nod: Kopf nickt um den Hals (Schnitzen).
 * - shift: Gewicht verlagern, p.y += shift * 0.02 * p.z (Stehen).
 * - breath: Atmen, Oberkörper gestreckt (Stehen) - kein Knochen kann das.
 */
export function pose(name, phase, { knee, stride = 1 }) {
  const a = {
    hipL: 0, hipR: 0, kneeL: -0.05, kneeR: -0.05,
    shL: -0.05, shR: -0.05, elL: 0.15, elR: 0.15,
    inL: 0, inR: 0, lean: 0, twist: 0, sway: 0, bob: 0,
    yaw: 0, nod: 0, shift: 0, breath: 0,
  };
  if (name === 'walk') {
    const s = Math.sin(phase), c = Math.cos(phase);
    a.hipL = s * 0.55 * stride;
    a.hipR = -s * 0.55 * stride;
    a.kneeL = -0.1 - 0.95 * Math.max(c, 0);
    a.kneeR = -0.1 - 0.95 * Math.max(-c, 0);
    a.shL = -s * 0.5;
    a.shR = s * 0.5;
    a.elL = 0.3 + 0.45 * Math.max(a.shL, 0);
    a.elR = 0.3 + 0.45 * Math.max(a.shR, 0);
    a.twist = s * 0.12;
    a.lean = 0.07;
    a.sway = s * 0.012;
    a.bob = Math.abs(c) * 0.03;
  } else if (name === 'chop') {
    const up = 0.5 + 0.5 * Math.sin(phase);
    Object.assign(a, { hipL: 0.25, hipR: -0.15, kneeL: -0.35, kneeR: -0.3 });
    a.shR = 0.6 + 1.9 * up;
    a.elR = 0.15 + 0.9 * up;
    a.shL = 0.7 + 0.2 * up;
    a.elL = 0.6;
    a.lean = 0.12 + 0.18 * (1 - up);
    a.twist = -0.15 + 0.3 * up;
    a.bob = -0.03;
  } else if (name === 'pick') {
    const t = phase * 0.6;
    const reach = 0.5 + 0.5 * Math.sin(t);
    Object.assign(a, { hipL: 1.95, kneeL: -1.95, hipR: -0.05, kneeR: -1.5 });
    a.shR = 0.3 + 0.85 * reach;
    a.elR = 1.95 - 1.85 * reach;
    a.shL = 1.05 + 0.08 * Math.sin(t * 0.5);
    a.elL = 0.75;
    a.lean = 0.32 + 0.08 * reach;
    a.twist = -0.1 + 0.12 * reach;
    a.bob = -(knee - 0.04);
  } else if (name === 'mow') {
    const r3 = (v) => Number(v.toFixed(3));
    const sweep = Math.sin(phase * 0.6);
    Object.assign(a, { hipL: 0.3, hipR: -0.2, kneeL: -0.4, kneeR: -0.3 });
    // Wie im Shader auf drei Stellen gerundet (toFixed(3) im GLSL-Text).
    a.shL = r3(MOW.left.forward); a.elL = r3(MOW.left.elbow); a.inL = r3(MOW.left.inward);
    a.shR = r3(MOW.right.forward); a.elR = r3(MOW.right.elbow); a.inR = r3(MOW.right.inward);
    a.lean = r3(MOW.lean);
    a.twist = sweep * 0.55;
    a.bob = r3(MOW.bob);
  } else if (name === 'carve') {
    const r3 = (v) => Number(v.toFixed(3));
    const t = phase * 0.6 - 4.712389;
    const k = Math.floor(t / 6.2831853);
    const cyc = t / 6.2831853 - k;
    const inspect = Math.round(((k % 5) + 5) % 5) === 4;
    let pull = cyc < 0.3 ? smoothstep(0, 0.3, cyc) : 1 - smoothstep(0.3, 1, cyc);
    let lift = 0;
    if (inspect) {
      lift = Math.sin(cyc * 3.1415927);
      pull = 0.4;
    }
    Object.assign(a, { hipL: 0.18, hipR: -0.12 });
    a.kneeL = -0.32 - 0.1 * pull;
    a.kneeR = -0.26 - 0.1 * pull;
    a.shL = a.shR = mix(r3(CARVE.extended.shoulder), r3(CARVE.pulled.shoulder), pull) + r3(CARVE.inspect.shoulder) * lift;
    a.elL = a.elR = mix(r3(CARVE.extended.elbow), r3(CARVE.pulled.elbow), pull) + r3(CARVE.inspect.elbow) * lift;
    a.inL = a.inR = 0.22;
    a.lean = mix(r3(CARVE.extended.lean), r3(CARVE.pulled.lean), pull) + r3(CARVE.inspect.lean) * lift;
    a.twist = 0.06 * Math.sin(k * 1.7);
    a.bob = -0.04 - 0.02 * pull;
    a.nod = 0.4 - 0.3 * lift;
  } else {
    // stand
    const t = phase;
    a.breath = Math.sin(t * 1.7);
    a.shL = Math.sin(t * 0.9) * 0.08 - 0.05;
    a.shR = Math.sin(t * 0.9 + 1.3) * 0.08 - 0.05;
    a.elL = 0.18 + Math.sin(t * 0.9) * 0.06;
    a.elR = 0.18 + Math.sin(t * 0.9 + 1.3) * 0.06;
    const s37 = Math.sin(t * 0.37);
    a.yaw = 0.6 * clamp(s37 * 2.5 - Math.sign(s37) * 1.2, -1, 1);
    a.shift = Math.sin(t * 0.55);
    a.kneeL = -0.05 - 0.12 * Math.max(a.shift, 0);
    a.kneeR = -0.05 - 0.12 * Math.max(-a.shift, 0);
    a.twist = Math.sin(t * 0.3) * 0.04;
  }
  return a;
}

// --- Knochen -----------------------------------------------------------------

export const qAxis = ([x, y, z], a) => {
  const s = Math.sin(a / 2);
  return [x * s, y * s, z * s, Math.cos(a / 2)];
};
export const qMul = ([ax, ay, az, aw], [bx, by, bz, bw]) => [
  aw * bx + ax * bw + ay * bz - az * by,
  aw * by - ax * bz + ay * bw + az * bx,
  aw * bz + ax * by - ay * bx + az * bw,
  aw * bw - ax * bx - ay * by - az * bz,
];
const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];

/**
 * Knochen-Drehungen (Datei-Koordinaten: x links, y oben, z vorn) und die
 * Verschiebung der Wurzel in Metern (H = Körperhöhe) für Gelenkwinkel `a`.
 * Die Drehungen des Shaders: swingAround(p, pivot, w) = Datei-x um -w,
 * swingSideways(p, pivot, w) = Datei-z um w, Drehen der Schultern (twist) =
 * Datei-y um twist, Vorneigen (swingAround um -lean) = Datei-x um lean.
 *
 * Gewicht verlagern (p.y += 0.02 shift p.z) ist im Shader eine Scherung vor
 * allen Gelenken; hier wird daraus ein Kippen der Wurzel um die Blickachse
 * (atan(0.02 shift) - bei kleinem Winkel fast dasselbe).
 */
export function boneRotations(a, H) {
  const roll = -Math.atan(0.02 * a.shift);
  return {
    translation: [a.sway * H, a.bob * H, 0],
    rotations: {
      root: qAxis(Z, roll),
      'thigh.L': qAxis(X, -a.hipL), 'shin.L': qAxis(X, -a.kneeL),
      'thigh.R': qAxis(X, -a.hipR), 'shin.R': qAxis(X, -a.kneeR),
      // Erst die Drehung der Schultern gegen die Hüfte, dann vorneigen.
      upperBody: qMul(qAxis(X, a.lean), qAxis(Y, a.twist)),
      // Kopf: nicken (Schnitzen) nach dem Umschauen (Stehen) - beide vor dem Oberkörper.
      head: qMul(qAxis(X, -a.nod), qAxis(Y, a.yaw)),
      'shoulder.L': qAxis(X, -a.shL), 'upperArm.L': qAxis(Z, -a.inL), 'forearm.L': qAxis(X, -a.elL),
      'shoulder.R': qAxis(X, -a.shR), 'upperArm.R': qAxis(Z, a.inR), 'forearm.R': qAxis(X, -a.elR),
    },
  };
}
