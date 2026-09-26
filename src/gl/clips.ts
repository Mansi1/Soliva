// clips.ts
// Clips aus Blender (docs/ANIMATION.md): liest eine Clip-Bibliothek
// (src/models/clips/<name>.glb + .json, docs/ANIMATION.md) und
// backt jeden Clip für eine Figur zu Knochen-Matrizen, die der Shader aus einer
// Textur holt (Skinning).
//
// Wiederverwendbar über Körper hinweg: aus dem Clip wird je Knochen und Bild
// nur die Drehung gegenüber der Ruhelage genommen (wie Blender die Knochen
// intern ausrichtet, spielt so keine Rolle), dazu die Verschiebung der Wurzel
// in Körperhöhen. Gebacken wird mit den Gelenken der jeweiligen Figur - so
// passt ein Clip auf Mann und Frau.
//
// Skelette sind Daten (Rig): Knochen, Eltern und wo ihre Drehpunkte im Modell
// liegen. Heute gibt es HUMANOID (Dorfbewohner); Tiere, Mühle und Fahne
// bekommen ihr eigenes Rig und ihre eigene Clip-Bibliothek.

/** Knochen der Menschen-Figuren: Name und Eltern. Die Reihenfolge ist die Spalte in der Textur. */
export const HUMANOID_BONES: readonly (readonly [string, string | null])[] = [
  ['root', null],
  ['lowerBody', 'root'],
  ['thigh.L', 'lowerBody'], ['shin.L', 'thigh.L'],
  ['thigh.R', 'lowerBody'], ['shin.R', 'thigh.R'],
  ['upperBody', 'root'],
  ['head', 'upperBody'],
  ['shoulder.L', 'upperBody'], ['upperArm.L', 'shoulder.L'], ['forearm.L', 'upperArm.L'],
  ['shoulder.R', 'upperBody'], ['upperArm.R', 'shoulder.R'], ['forearm.R', 'upperArm.R'],
];
export const BONE = Object.fromEntries(HUMANOID_BONES.map(([name], i) => [name, i])) as Record<string, number>;

/** Höchstens so viele Knochen je Skelett - so breit ist ein Bild in der Clip-Textur. */
export const MAX_BONES = 16;

/**
 * Ein Skelett: Knochen (Name, Eltern) in der Reihenfolge ihrer Spalte in der
 * Textur und die Drehpunkte in Modell-Koordinaten (x vorn, y links, z oben)
 * aus den Maßen eines Modells. Die Knochennamen sind der Vertrag mit Blender.
 */
export interface Rig<J = never> {
  name: string;
  bones: readonly (readonly [string, string | null])[];
  pivots(joints: J): Vec3[];
  /**
   * Was je Körper anders gebacken wird als im Clip gespeichert: Knochen, deren
   * eigene Drehung (gegenüber dem Eltern) auf einen Anteil verkürzt bzw.
   * verlängert wird - ihre Kinder behalten ihre eigene Drehung.
   */
  scale?(clip: Clip, joints: J, options: BakeOptions): Record<string, number>;
  /** Feste Höhe der Wurzel (Modell-Einheiten) für diesen Körper statt der aus dem Clip - oder null. */
  rootZ?(clip: Clip, joints: J): number | null;
  /** Faktor auf die Verschiebungen der Knochen (Clip.moves) für diesen Körper - sonst 1. */
  moveScale?(joints: J): number;
}

/** Was ein Clip in der Hand braucht - Bits wie im Shader (uClipProps). */
export const PROP_BITS: Record<string, number> = { axe: 1, scythe: 2, knife: 4 };
/**
 * Bit in uClipProps: der Clip kniet - der Rock wird bis zum Boden gestaucht
 * (Knochen allein können das nicht).
 */
export const KNEEL_BIT = 8;

type Vec3 = [number, number, number];
type Quat = [number, number, number, number];

/** Ein Clip, unabhängig vom Körper: je Bild und Knochen die Drehung gegenüber der Ruhelage. */
export interface Clip {
  name: string;
  fps: number;
  frames: number;
  duration: number;
  /** Bits aus PROP_BITS. */
  props: number;
  /** Welche Pose (motion[2]) der Clip im Spiel ersetzt - null: keine. */
  pose: number | null;
  /**
   * Clip-Zeit = (Phase - phaseShift) * phaseRate. phaseRate = Länge des Clips
   * durch die Phase einer Schleife (phase_period) - so passt die Schleife
   * genau zur Phase des Spiels, und der Ton (strike) bleibt im Takt.
   */
  phaseRate: number;
  phaseShift: number;
  /**
   * Takt-Marken: Clip-Zeiten (s) in einer Schleife, zu denen ein Hieb bzw.
   * Griff zu hören ist (Custom Property `strike` der Action) - leer: keiner.
   */
  strike: number[];
  /** Kniend: der Rock wird gestaucht (KNEEL_BIT). */
  kneel: boolean;
  /** Tiere: nur für diese Arten (ANIMALS-Schlüssel wie 'hare') - leer: für alle. */
  species: string[];
  /** Tiere: liegt auf der Seite (erlegt) - so hoch, wie der Körper des Tiers breit ist. */
  lying: boolean;
  /** Tiere: Senken des Kopfs zum Äsen im Clip (Radiant) - je Art auf ihr eigenes uGraze gebracht. */
  grazeRef: number;
  /** frames * Knochen * 4: Drehung (Quaternion) in Modell-Achsen, je Knochen im Weltsinn. */
  rotations: Float32Array;
  /** frames * 3: Verschiebung der Wurzel in Modell-Achsen und Körperhöhen. */
  root: Float32Array;
  /**
   * frames * Knochen * 3: Verschiebung der anderen Knochen gegenüber ihrer
   * Ruhelage beim Eltern - in den Achsen des Eltern in Ruhelage (Modell-Achsen,
   * Körperhöhen). Bei den Dorfbewohnern überall 0 (nur Drehungen); das
   * Fahnentuch bewegt seine Knochen so seitwärts (FLAG).
   */
  moves: Float32Array;
}

interface Manifest {
  height: number;
  fps: number;
  /** Tiere: wie weit das Tier des Skeletts in Blender den Kopf zum Äsen senkt (uGraze, Radiant). */
  graze?: number;
  clips: {
    name: string; frames: number; duration: number; props?: string[];
    /** Angaben je Clip (von Hand in der .json gepflegt) - können fehlen. */
    pose?: number; phase_period?: number; phase_shift?: number; kneel?: boolean; strike?: number[];
    /** Tiere: nur für diese Arten (leer: alle) und ob es auf der Seite liegt. */
    species?: string[]; lying?: boolean;
  }[];
}

// --- Quaternionen und Matrizen ---------------------------------------------

const qMul = ([ax, ay, az, aw]: Quat, [bx, by, bz, bw]: Quat): Quat => [
  aw * bx + ax * bw + ay * bz - az * by,
  aw * by - ax * bz + ay * bw + az * bx,
  aw * bz + ax * by - ay * bx + az * bw,
  aw * bw - ax * bx - ay * by - az * bz,
];
const qInv = ([x, y, z, w]: Quat): Quat => [-x, -y, -z, w];
const qRotate = (q: Quat, [x, y, z]: Vec3): Vec3 => {
  const r = qMul(qMul(q, [x, y, z, 0]), qInv(q));
  return [r[0], r[1], r[2]];
};
/** Zwischen zwei Quaternionen, auf dem kürzeren Weg (normiert linear). */
function qLerp(a: Quat, b: Quat, t: number): Quat {
  const sign = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
  const q = a.map((v, i) => v + (b[i] * sign - v) * t) as Quat;
  const l = Math.hypot(...q) || 1;
  return q.map((v) => v / l) as Quat;
}
function qMatrix([x, y, z, w]: Quat): number[] {
  // Zeilenweise 3x3.
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
  ];
}

/**
 * Datei (glTF: x links, y oben, z vorn) -> Modell (x vorn, y links, z oben),
 * wie loadModel() in entityRenderer.ts. Die Abbildung ist eine Drehung
 * (zyklische Vertauschung), Quaternionen werden genauso vertauscht.
 */
const toModel = ([x, y, z]: Vec3): Vec3 => [z, x, y];
const quatToModel = ([x, y, z, w]: Quat): Quat => [z, x, y, w];

// --- glb lesen --------------------------------------------------------------

interface Gltf {
  nodes: { name?: string; children?: number[]; translation?: Vec3; rotation?: Quat }[];
  animations: { name: string; channels: { sampler: number; target: { node: number; path: string } }[];
    samplers: { input: number; output: number; interpolation?: string }[] }[];
  accessors: { bufferView: number; byteOffset?: number; count: number; type: string }[];
  bufferViews: { byteOffset?: number; byteLength: number }[];
}

const SIZE: Record<string, number> = { SCALAR: 1, VEC3: 3, VEC4: 4 };

function parseGlb(bytes: Uint8Array): { json: Gltf; bin: DataView } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('kein glb');
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as Gltf;
  const binStart = 20 + jsonLength + 8;
  const binLength = view.getUint32(20 + jsonLength, true);
  return { json, bin: new DataView(bytes.buffer, bytes.byteOffset + binStart, binLength) };
}

function readFloats(gltf: Gltf, bin: DataView, index: number): Float32Array {
  const a = gltf.accessors[index];
  const v = gltf.bufferViews[a.bufferView];
  const n = a.count * SIZE[a.type];
  const out = new Float32Array(n);
  const start = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  for (let i = 0; i < n; i++) out[i] = bin.getFloat32(start + i * 4, true);
  return out;
}

/** Wert eines Kanals zur Zeit t (LINEAR oder STEP; CUBICSPLINE: nur der Wert). */
function sample(times: Float32Array, values: Float32Array, size: number, t: number, interpolation: string): number[] {
  const cubic = interpolation === 'CUBICSPLINE';
  const stride = cubic ? size * 3 : size;
  const at = (k: number) => Array.from(values.subarray(k * stride + (cubic ? size : 0), k * stride + (cubic ? size : 0) + size));
  if (t <= times[0]) return at(0);
  const last = times.length - 1;
  if (t >= times[last]) return at(last);
  // Binär suchen: das letzte Bild mit times[k] <= t.
  let k = 0;
  let hi = last;
  while (hi - k > 1) {
    const mid = (k + hi) >> 1;
    if (times[mid] <= t) k = mid;
    else hi = mid;
  }
  if (interpolation === 'STEP') return at(k);
  const f = (t - times[k]) / (times[k + 1] - times[k]);
  if (size === 4) return qLerp(at(k) as Quat, at(k + 1) as Quat, f);
  return at(k).map((v, i) => v + (at(k + 1)[i] - v) * f);
}

/**
 * Liest die Clip-Bibliothek. `glbDataUrl` ist das glb als data:-URL (Vite
 * `?inline`), `manifest` die .json daneben.
 */
export function loadClips(glbDataUrl: string, manifest: Manifest, rig: Rig<any> = HUMANOID): Clip[] {
  const base64 = glbDataUrl.slice(glbDataUrl.indexOf(',') + 1);
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const { json, bin } = parseGlb(bytes);
  const byName = new Map(json.nodes.map((n, i) => [n.name ?? '', i]));
  const parentOf = new Map<number, number>();
  json.nodes.forEach((n, i) => n.children?.forEach((c) => parentOf.set(c, i)));
  const boneNodes = rig.bones.map(([name]) => byName.get(name));
  const rootNode = boneNodes[0];
  if (rootNode === undefined) throw new Error('Clip-Bibliothek ohne Knochen "root"');

  return manifest.clips.flatMap((meta) => {
    const anim = json.animations.find((a) => a.name === meta.name);
    if (!anim) return [];
    // Kanäle je Knoten: Drehung und Verschiebung.
    const channels = new Map<string, { times: Float32Array; values: Float32Array; interpolation: string }>();
    for (const c of anim.channels) {
      const s = anim.samplers[c.sampler];
      channels.set(`${c.target.node}.${c.target.path}`, {
        times: readFloats(json, bin, s.input), values: readFloats(json, bin, s.output), interpolation: s.interpolation ?? 'LINEAR',
      });
    }
    // Lage eines Knotens relativ zum Eltern: Ruhelage oder zur Zeit t.
    const local = (node: number, t: number | null): { r: Quat; p: Vec3 } => {
      const n = json.nodes[node];
      const rot = t === null ? undefined : channels.get(`${node}.rotation`);
      const pos = t === null ? undefined : channels.get(`${node}.translation`);
      return {
        r: rot ? sample(rot.times, rot.values, 4, t!, rot.interpolation) as Quat : (n.rotation ?? [0, 0, 0, 1]),
        p: pos ? sample(pos.times, pos.values, 3, t!, pos.interpolation) as Vec3 : (n.translation ?? [0, 0, 0]),
      };
    };
    // Weltlage im Raum des Skeletts: bis zur Wurzel, was darüber liegt (das
    // Objekt in Blender, seine Lage in der Szene) zählt nicht. Je Zeitpunkt
    // gemerkt - sonst rechnete jeder Knochen die Kette seiner Eltern neu.
    let cacheTime: number | null | undefined;
    const cache = new Map<number, { r: Quat; p: Vec3 }>();
    const global = (node: number, t: number | null): { r: Quat; p: Vec3 } => {
      if (t !== cacheTime) {
        cache.clear();
        cacheTime = t;
      }
      const known = cache.get(node);
      if (known) return known;
      const own = local(node, t);
      let result = own;
      if (node !== rootNode) {
        const parent = global(parentOf.get(node)!, t);
        const p = qRotate(parent.r, own.p);
        result = { r: qMul(parent.r, own.r), p: [p[0] + parent.p[0], p[1] + parent.p[1], p[2] + parent.p[2]] };
      }
      cache.set(node, result);
      return result;
    };
    const rest = boneNodes.map((n) => (n === undefined ? null : global(n, null)));

    const bones = rig.bones.length;
    const rotations = new Float32Array(meta.frames * bones * 4);
    const root = new Float32Array(meta.frames * 3);
    const moves = new Float32Array(meta.frames * bones * 3);
    // Knochen mit eigener Verschiebung (nicht nur die Wurzel).
    const moving = boneNodes.map((node, b) => b > 0 && node !== undefined && channels.has(`${node}.translation`));
    for (let f = 0; f < meta.frames; f++) {
      const t = f / manifest.fps;
      boneNodes.forEach((node, b) => {
        // Drehung gegenüber der Ruhelage, im Weltsinn: W = G_anim * G_ruhe^-1.
        const w: Quat = node === undefined ? [0, 0, 0, 1] : qMul(global(node, t).r, qInv(rest[b]!.r));
        rotations.set(quatToModel(w), (f * bones + b) * 4);
      });
      const now = global(rootNode, t).p;
      const move = toModel([now[0] - rest[0]!.p[0], now[1] - rest[0]!.p[1], now[2] - rest[0]!.p[2]]);
      root.set(move.map((v) => v / manifest.height), f * 3);
      boneNodes.forEach((node, b) => {
        if (!moving[b]) return;
        // Verschiebung beim Eltern, gedreht in dessen Ruhelage - so dreht das
        // Backen sie mit der Drehung des Eltern im Clip mit.
        const now = local(node!, t).p, was = local(node!, null).p;
        const parentRest = global(parentOf.get(node!)!, null).r;
        const d = toModel(qRotate(parentRest, [now[0] - was[0], now[1] - was[1], now[2] - was[2]]));
        moves.set(d.map((v) => v / manifest.height), (f * bones + b) * 3);
      });
    }
    const pose = meta.pose ?? null;
    const period = meta.phase_period;
    return [{
      name: meta.name, fps: manifest.fps, frames: meta.frames, duration: meta.duration,
      props: (meta.props ?? []).reduce((bits, p) => bits | (PROP_BITS[p] ?? 0), 0),
      pose: pose !== null && period ? pose : null,
      phaseRate: period ? meta.duration / period : 1,
      phaseShift: meta.phase_shift ?? 0,
      kneel: meta.kneel === true,
      strike: meta.strike ?? [],
      species: meta.species ?? [],
      lying: meta.lying === true,
      grazeRef: manifest.graze ?? 0,
      rotations, root, moves,
    }];
  });
}

/** Gelenke einer Figur in Modell-Einheiten (Körperhöhe 1), wie loadModel() sie liest. */
export interface Joints {
  hip: number;
  knee: number;
  shoulder: number;
  elbow: number;
  /** Abstand der Unterarme von der Mitte. */
  arm: number;
}

/** Drehpunkte der Knochen der Dorfbewohner (x vorn, y links, z oben) - wie im Shader. */
function humanoidPivots(j: Joints): Vec3[] {
  const neck = j.shoulder + 0.03;
  const at: Record<string, Vec3> = {
    root: [0, 0, 0], lowerBody: [0, 0, 0],
    'thigh.L': [0, 0, j.hip], 'shin.L': [0, 0, j.knee], 'thigh.R': [0, 0, j.hip], 'shin.R': [0, 0, j.knee],
    upperBody: [0, 0, j.hip], head: [0, 0, neck],
    'shoulder.L': [0, 0, j.shoulder], 'upperArm.L': [0, j.arm, j.shoulder], 'forearm.L': [0, 0, j.elbow],
    'shoulder.R': [0, 0, j.shoulder], 'upperArm.R': [0, -j.arm, j.shoulder], 'forearm.R': [0, 0, j.elbow],
  };
  return HUMANOID_BONES.map(([name]) => at[name]);
}

/** Das Skelett der Dorfbewohner (src/models/clips/humanoid.glb). */
export const HUMANOID: Rig<Joints> = {
  name: 'humanoid',
  bones: HUMANOID_BONES,
  pivots: humanoidPivots,
  // Gehen: die Frau schreitet im langen Rock kürzer (uStride auf die Oberschenkel).
  scale: (clip, _joints, options): Record<string, number> => (clip.pose === 1 && (options.stride ?? 1) !== 1
    ? { 'thigh.L': options.stride!, 'thigh.R': options.stride! } : {}),
  // Kniend: so tief, dass das Knie dieses Körpers den Boden berührt (-(uKnee - 0.04), wie der Rock im Shader).
  rootZ: (clip, joints) => (clip.kneel ? -(joints.knee - 0.04) : null),
};

// --- Vierbeiner ---------------------------------------------------------------

/**
 * Knochen der Tiere (src/models/clips/quadruped.glb): die vier Beine schwingen
 * um ihr oberes Gelenk, Hals und Kopf drehen um den Halsansatz. Der Hals trägt
 * das Senken zum Gras - je Art so weit, dass das Maul den Boden erreicht
 * (uGraze, beim Backen skaliert) -, der Kopf alles andere (Kauen, Heben).
 */
export const QUADRUPED_BONES: readonly (readonly [string, string | null])[] = [
  ['root', null],
  ['leg.FL', 'root'], ['leg.FR', 'root'], ['leg.BL', 'root'], ['leg.BR', 'root'],
  ['neck', 'root'], ['head', 'neck'],
];
export const QUADRUPED_BONE = Object.fromEntries(QUADRUPED_BONES.map(([name], i) => [name, i])) as Record<string, number>;

/** Maße eines Tiers in Modell-Einheiten (Höhe 1), wie loadModel() sie liest. */
export interface QuadrupedJoints {
  /** Oberkante der Beine - dort sitzen ihre Gelenke. */
  hip: number;
  /** Vorn-Lage der Vorder- und der Hinterbeine. */
  legs: [number, number];
  /** Halsansatz (vorn, oben) - um ihn nickt der Kopf. */
  neck: [number, number];
  /** So weit (Radiant) senkt diese Art den Kopf, bis das Maul den Boden erreicht. */
  graze: number;
  /** Halbe Breite des Körpers - so hoch liegt es auf der Seite. */
  side: number;
}

export const QUADRUPED: Rig<QuadrupedJoints> = {
  name: 'quadruped',
  bones: QUADRUPED_BONES,
  pivots: (j) => {
    const at: Record<string, Vec3> = {
      root: [0, 0, 0],
      'leg.FL': [j.legs[0], 0, j.hip], 'leg.FR': [j.legs[0], 0, j.hip],
      'leg.BL': [j.legs[1], 0, j.hip], 'leg.BR': [j.legs[1], 0, j.hip],
      neck: [j.neck[0], 0, j.neck[1]], head: [j.neck[0], 0, j.neck[1]],
    };
    return QUADRUPED_BONES.map(([name]) => at[name]);
  },
  // Äsen: jede Art senkt den Kopf so weit, bis ihr Maul den Boden erreicht.
  scale: (clip, joints): Record<string, number> => (clip.grazeRef > 0 ? { neck: joints.graze / clip.grazeRef } : {}),
  // Erlegt: auf der Seite, so hoch, wie der Körper dieser Art halb breit ist.
  rootZ: (clip, joints) => (clip.lying ? joints.side : null),
};

/** Maße einer Mühle für ihr Skelett: die Nabe der Flügel (links, oben) in Modell-Einheiten. */
export interface MillJoints {
  hub: [number, number];
}

/**
 * Die Flügel der Mühlen (src/models/clips/mill.glb): ein Knochen an der Nabe,
 * er dreht um die Blickachse. Alles andere steht still (root).
 */
export const MILL: Rig<MillJoints> = {
  name: 'mill',
  bones: [['root', null], ['sails', 'root']],
  pivots: (j) => [[0, 0, 0], [0, j.hub[0], j.hub[1]]],
};

/** Abschnitte des Fahnentuchs am Sammelpunkt: so viele Knochen + 1 längs des Tuchs. */
export const FLAG_SEGMENTS = 6;

/**
 * Maße einer Fahne für ihr Skelett: das Tuch vom Mast (y0) bis zum Ende (y1),
 * seine Höhe z. `stretch`: wie viel länger dieses Tuch ist als das am
 * Sammelpunkt, für das der Clip gemacht ist (in Modell-Einheiten) - so weit
 * schlägt es auch aus (die Fahne auf dem Hauptgebäude).
 */
export interface FlagJoints {
  cloth: [number, number, number];
  stretch?: number;
}

/**
 * Das Tuch der Fahne am Sammelpunkt (src/models/clips/flag.glb): Knochen
 * cloth.0 (am Mast) bis cloth.6 (am Ende) in gleichen Abständen - dort liegen
 * die Eckpunkte des Tuchs. Sie verschieben sich seitwärts; dazwischen mischt
 * der Shader die beiden Nachbarn nach der Lage im Tuch.
 */
export const FLAG: Rig<FlagJoints> = {
  name: 'flag',
  bones: [['root', null], ...Array.from({ length: FLAG_SEGMENTS + 1 }, (_, i) => [`cloth.${i}`, 'root'] as const)],
  pivots: ({ cloth: [y0, y1, z] }) => [
    [0, 0, 0],
    ...Array.from({ length: FLAG_SEGMENTS + 1 }, (_, i) => [0, y0 + ((y1 - y0) * i) / FLAG_SEGMENTS, z] as Vec3),
  ],
  moveScale: (j) => j.stretch ?? 1,
};

/** Texel je Knochen: drei Zeilen einer 3x4-Matrix. */
export const TEXELS_PER_BONE = 3;

/** Was je Körper anders gebacken wird als im Clip gespeichert. */
export interface BakeOptions {
  /**
   * Schrittweite des Körpers (uStride, 1 = voller Schritt): die Drehung der
   * Oberschenkel gegenüber dem Unterkörper wird damit skaliert - die Frau
   * schreitet im langen Rock kürzer. Nur für das Gehen (pose 1).
   */
  stride?: number;
}

/** Drehung auf `share` ihres Winkels verkürzt, um dieselbe Achse. */
function qScale([x, y, z, w]: Quat, share: number): Quat {
  const sign = w < 0 ? -1 : 1;
  const angle = 2 * Math.acos(Math.min(1, Math.abs(w)));
  const s = Math.sin(angle / 2);
  if (s < 1e-9) return [0, 0, 0, 1];
  const half = (angle * share) / 2;
  const k = (Math.sin(half) / s) * sign;
  return [x * k, y * k, z * k, Math.cos(half)];
}

/**
 * Backt einen Clip für eine Figur: je Bild eine Zeile mit den Skinning-
 * Matrizen aller Knochen (Modell-Koordinaten), als RGBA-Texel. Was vom
 * Körper abhängt: die Drehpunkte (Gelenke) und was das Rig je Körper anders
 * haben will (Rig.scale, Rig.rootZ) - z. B. Schrittweite und Kniehöhe der
 * Dorfbewohner, wie weit ein Tier zum Äsen den Kopf senkt.
 */
export function bakeClip<J>(clip: Clip, joints: J, options: BakeOptions = {}, rig: Rig<J> = HUMANOID as unknown as Rig<J>): Float32Array {
  const bones = rig.bones.length;
  const p = rig.pivots(joints);
  const out = new Float32Array(clip.frames * bones * TEXELS_PER_BONE * 4);
  const index = Object.fromEntries(rig.bones.map(([name], i) => [name, i])) as Record<string, number>;
  const parentIndex = rig.bones.map(([, parent]) => (parent === null ? -1 : index[parent]));
  // Was dieser Körper anders braucht (Rig): Anteil der eigenen Drehung je
  // Knochen, feste Höhe der Wurzel.
  const factors = Object.entries(rig.scale?.(clip, joints, options) ?? {}).filter(([, k]) => k !== 1);
  const factor = new Map(factors.map(([name, k]) => [index[name], k]));
  const rootZ = rig.rootZ?.(clip, joints) ?? null;
  const k = rig.moveScale?.(joints) ?? 1;
  for (let f = 0; f < clip.frames; f++) {
    const stored = (b: number) => Array.from(clip.rotations.subarray((f * bones + b) * 4, (f * bones + b) * 4 + 4)) as Quat;
    const rot: Quat[] = rig.bones.map((_, b) => stored(b));
    if (factor.size > 0) {
      // Eltern vor Kindern: jeder Knochen hängt seine eigene Drehung (gegenüber
      // dem Eltern im Clip) an die neue des Eltern - verkürzt, wo ein Anteil steht.
      for (let b = 0; b < bones; b++) {
        const parent = parentIndex[b];
        if (parent < 0) continue;
        const own = qMul(qInv(stored(parent)), stored(b));
        rot[b] = qMul(rot[parent], factor.has(b) ? qScale(own, factor.get(b)!) : own);
      }
    }
    const w = (b: number) => rot[b];
    // Weltlage je Knochen: Drehung (Weltsinn) und wohin sein Drehpunkt kommt.
    const where: Vec3[] = [];
    for (let b = 0; b < bones; b++) {
      const parent = parentIndex[b];
      if (parent < 0) {
        const z = rootZ ?? clip.root[f * 3 + 2];
        where.push([clip.root[f * 3], clip.root[f * 3 + 1], z]);
        continue;
      }
      // Der Drehpunkt hängt am Eltern: dessen Drehung, um dessen Drehpunkt -
      // dazu, was der Knochen selbst beim Eltern verschoben ist.
      const mo = (f * bones + b) * 3;
      const offset = qRotate(w(parent), [
        p[b][0] - p[parent][0] + k * clip.moves[mo], p[b][1] - p[parent][1] + k * clip.moves[mo + 1], p[b][2] - p[parent][2] + k * clip.moves[mo + 2],
      ]);
      where.push([where[parent][0] + offset[0], where[parent][1] + offset[1], where[parent][2] + offset[2]]);
    }
    for (let b = 0; b < bones; b++) {
      // Skinning: um den eigenen Drehpunkt drehen und dorthin schieben, wo er jetzt ist.
      const m = qMatrix(w(b));
      const rp = qRotate(w(b), p[b]);
      const t = [where[b][0] - rp[0], where[b][1] - rp[1], where[b][2] - rp[2]];
      const o = ((f * bones + b) * TEXELS_PER_BONE) * 4;
      out.set([m[0], m[1], m[2], t[0], m[3], m[4], m[5], t[1], m[6], m[7], m[8], t[2]], o);
    }
  }
  return out;
}
