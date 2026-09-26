// Exportiert die Bognerei mit schnitzendem Bogner als glTF (.glb) - zum
// Öffnen und Bearbeiten in Blender (Datei > Import > glTF 2.0).
//
// Im Shader dreht jedes Körperteil um feste Gelenklinien (src/gl/entityRenderer.ts,
// Posen 0-5). Hier wird daraus ein Skelett mit denselben Gelenken, und jede Pose
// wird mit denselben Formeln (tools/export/poses.mjs) als Animation
// hineingerechnet: stand, walk, chop, pick, mow, carve. Das Zugmesser hängt wie
// im Shader an beiden Unterarmen - je Eckpunkt zwei Gewichte, nach seiner Lage
// zwischen den Händen. Die Werkbank zeigt im Clip carve nacheinander die drei
// Stufen des Bogens (Craft.0-2), je fünf Züge lang - in Blender sind das drei
// Objekte, die per Skalierung ein- und ausgeblendet werden.
//
// Daneben schreibt es <Ausgabe>.clips.json: je Clip Pose, Werkzeuge und den
// Phasenbereich (wie in src/models/clips/humanoid.json).
//
// Aufruf: node tools/export/bognerei.mjs [frau] [Ausgabedatei]
//   Standard: Bogner (Mann), tools/export/out/bognerei.glb

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { CLIPS, boneRotations, pose, qAxis, strikeTimes } from './poses.mjs';
import { readModel } from '../models/glb.mjs';

const root = new URL('../../', import.meta.url).pathname;
const female = process.argv.includes('frau');
const outFile = process.argv.slice(2).find((a) => a.endsWith('.glb'))
  ?? `${root}tools/export/out/${female ? 'bognerei-bognerin' : 'bognerei'}.glb`;

/** Spielerfarbe wie in der Galerie - für Tunic und Paint. */
const PLAYER = [64 / 255, 160 / 255, 72 / 255];
/** Bilder je Sekunde der Keyframes. */
const FPS = 30;

// --- OBJ lesen (wie src/gl/obj.ts) -----------------------------------------

function parseObj(source) {
  const positions = [];
  const triangles = [];
  let object = '';
  let material = '';
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const [keyword, ...args] = line.split(/\s+/);
    if (keyword === 'v') positions.push(args.slice(0, 3).map(Number));
    else if (keyword === 'o' || keyword === 'g') object = args.join(' ');
    else if (keyword === 'usemtl') material = args.join(' ');
    else if (keyword === 'f') {
      const corners = args.map((a) => {
        const i = Number(a.split('/')[0]);
        return positions[i < 0 ? positions.length + i : i - 1];
      });
      for (let i = 1; i + 1 < corners.length; i++) triangles.push({ object, material, points: [corners[0], corners[i], corners[i + 1]] });
    }
  }
  return triangles;
}

function parseMtl(source) {
  const colors = new Map();
  let current = '';
  for (const raw of source.split('\n')) {
    const [keyword, ...args] = raw.trim().split(/\s+/);
    if (keyword === 'newmtl') current = args.join(' ');
    if (keyword === 'Kd' && current) colors.set(current, args.slice(0, 3).map(Number));
  }
  return colors;
}


// --- Figur: Teile und Gelenke wie loadModel() ------------------------------

/** Teile nach Objektname - wie PARTS in entityRenderer.ts (der erste passende Anfang zählt). */
const PARTS = [
  ['Leg.L.Lower', 'shin.L'], ['Leg.R.Lower', 'shin.R'],
  ['Arm.L.Lower', 'forearm.L'], ['Arm.R.Lower.Tool', null], ['Arm.R.Lower.Scythe', null], ['Arm.R.Lower', 'forearm.R'],
  ['Knife', 'knife'], ['Leg.L', 'thigh.L'], ['Leg.R', 'thigh.R'], ['Arm.L', 'upperArm.L'], ['Arm.R', 'upperArm.R'],
  ['Head', 'head'], ['Load', null],
];
const partOf = (object) => {
  const hit = PARTS.find(([prefix]) => object.startsWith(prefix));
  return hit ? hit[1] : 'torso';
};

const figure = readModel(female ? 'villagers/female' : 'villagers/male');
// ponytail: nur starre Körper (Teilnamen); eine Hülle mit Knochen (j/vw) bräuchte die Gewichte hier.
if (/^j /m.test(figure.obj)) throw new Error('bognerei.mjs kennt nur starre Körper - dieser hat Knochen (Armature)');
const figureTris = parseObj(figure.obj);
const figureColors = parseMtl(figure.mtl);
figureColors.set('Tunic', PLAYER);

// Gelenke in Metern (Datei-Koordinaten: x links, y oben, z vorn).
let hip = -Infinity, shoulder = -Infinity, knee = -Infinity, elbow = -Infinity;
let minY = Infinity, maxY = -Infinity;
const forearm = [Infinity, 0];
for (const t of figureTris) {
  const part = partOf(t.object);
  for (const [x, y] of t.points) {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    if (part === 'thigh.L' || part === 'thigh.R') hip = Math.max(hip, y);
    if (part === 'upperArm.L' || part === 'upperArm.R') shoulder = Math.max(shoulder, y);
    if (part === 'shin.L' || part === 'shin.R') knee = Math.max(knee, y);
    if (part === 'forearm.L' || part === 'forearm.R') {
      elbow = Math.max(elbow, y);
      forearm[0] = Math.min(forearm[0], Math.abs(x));
      forearm[1] = Math.max(forearm[1], Math.abs(x));
    }
  }
}
/** Körperhöhe - die Modell-Einheit der Shader-Formeln. */
const H = maxY - minY;
const arm = (forearm[0] + forearm[1]) / 2;
const neck = shoulder + 0.03 * H;

// Knochen: Name, Eltern, Drehpunkt in Ruhelage (global).
const BONES = [
  ['root', null, [0, 0, 0]],
  ['lowerBody', 'root', [0, 0, 0]],
  ['thigh.L', 'lowerBody', [0, hip, 0]], ['shin.L', 'thigh.L', [0, knee, 0]],
  ['thigh.R', 'lowerBody', [0, hip, 0]], ['shin.R', 'thigh.R', [0, knee, 0]],
  ['upperBody', 'root', [0, hip, 0]],
  ['head', 'upperBody', [0, neck, 0]],
  ['shoulder.L', 'upperBody', [0, shoulder, 0]], ['upperArm.L', 'shoulder.L', [arm, shoulder, 0]], ['forearm.L', 'upperArm.L', [0, elbow, 0]],
  ['shoulder.R', 'upperBody', [0, shoulder, 0]], ['upperArm.R', 'shoulder.R', [-arm, shoulder, 0]], ['forearm.R', 'upperArm.R', [0, elbow, 0]],
];
const boneIndex = new Map(BONES.map(([name], i) => [name, i]));

// Knie in Modell-Einheiten (Körperhöhe 1) - die Pose "pick" braucht es.
const kneeModel = (knee - minY) / H;
const Y = [0, 1, 0];

// --- glTF zusammenbauen -----------------------------------------------------

const chunks = [];
let byteLength = 0;
const bufferViews = [];
const accessors = [];

/** Legt Daten in den Puffer und gibt den Accessor zurück. */
function accessor(typed, type, componentType, count, extra = {}) {
  const pad = (4 - (byteLength % 4)) % 4;
  if (pad) {
    chunks.push(new Uint8Array(pad));
    byteLength += pad;
  }
  const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
  bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.byteLength });
  chunks.push(bytes);
  byteLength += bytes.byteLength;
  accessors.push({ bufferView: bufferViews.length - 1, componentType, count, type, ...extra });
  return accessors.length - 1;
}

const FLOAT = 5126, UBYTE = 5121;
const materials = [];
const materialIndex = new Map();
function material(name, rgb) {
  const key = `${name}|${rgb.join(',')}`;
  if (!materialIndex.has(key)) {
    materials.push({ name, pbrMetallicRoughness: { baseColorFactor: [...rgb, 1], metallicFactor: 0, roughnessFactor: 0.9 } });
    materialIndex.set(key, materials.length - 1);
  }
  return materialIndex.get(key);
}

const sub = (a, b) => a.map((v, i) => v - b[i]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a) => {
  const l = Math.hypot(...a) || 1;
  return a.map((v) => v / l);
};

/**
 * Ein Mesh aus Dreiecken, je Material ein Primitive, flach schattiert (jede
 * Fläche ihre eigenen Eckpunkte). `weights(p)` gibt für Skin-Meshes je
 * Eckpunkt [[Knochen, Gewicht], ...].
 */
function mesh(name, tris, colors, weights) {
  const byMaterial = new Map();
  for (const t of tris) {
    if (!byMaterial.has(t.material)) byMaterial.set(t.material, []);
    byMaterial.get(t.material).push(t);
  }
  const primitives = [];
  for (const [mtl, list] of byMaterial) {
    const pos = new Float32Array(list.length * 9);
    const nor = new Float32Array(list.length * 9);
    const joints = weights ? new Uint8Array(list.length * 12) : null;
    const wts = weights ? new Float32Array(list.length * 12) : null;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    list.forEach((t, i) => {
      const n = normalize(cross(sub(t.points[1], t.points[0]), sub(t.points[2], t.points[0])));
      t.points.forEach((p, c) => {
        const o = (i * 3 + c) * 3;
        pos.set(p, o);
        nor.set(n, o);
        p.forEach((v, j) => {
          min[j] = Math.min(min[j], v);
          max[j] = Math.max(max[j], v);
        });
        if (weights) {
          weights(t, p).forEach(([bone, w], j) => {
            joints[(i * 3 + c) * 4 + j] = bone;
            wts[(i * 3 + c) * 4 + j] = w;
          });
        }
      });
    });
    const count = list.length * 3;
    const attributes = {
      POSITION: accessor(pos, 'VEC3', FLOAT, count, { min, max }),
      NORMAL: accessor(nor, 'VEC3', FLOAT, count),
    };
    if (weights) {
      attributes.JOINTS_0 = accessor(joints, 'VEC4', UBYTE, count);
      attributes.WEIGHTS_0 = accessor(wts, 'VEC4', FLOAT, count);
    }
    primitives.push({ attributes, material: material(mtl, colors.get(mtl) ?? [0.6, 0.6, 0.6]) });
  }
  return { name, primitives };
}

const meshes = [];
const nodes = [];
const addNode = (node) => nodes.push(node) - 1;

// Bognerei: alles außer den Markierungen und dem Werkstück; die drei Stufen
// des Werkstücks als eigene Objekte.
const shop = readModel('buildings/bowyer');
const shopTris = parseObj(shop.obj);
const shopColors = parseMtl(shop.mtl);
shopColors.set('Paint', PLAYER);
const isMarker = (o) => o.startsWith('Entry') || o.startsWith('Work.');
meshes.push(mesh('Bognerei', shopTris.filter((t) => !isMarker(t.object) && !t.object.startsWith('Craft')), shopColors));
const shopNode = addNode({ name: 'Bognerei', mesh: meshes.length - 1 });
const STAGES = ['Bogen.1.grob', 'Bogen.2.ausgearbeitet', 'Bogen.3.gespannt'];
const stageNodes = STAGES.map((name, s) => {
  meshes.push(mesh(name, shopTris.filter((t) => new RegExp(`^Craft\\.${s}(\\.|$)`).test(t.object)), shopColors));
  return addNode({ name, mesh: meshes.length - 1 });
});

// Wo der Bogner steht und wohin er schaut (Work.Stand, Work.Aim).
const center = (prefix) => {
  const pts = shopTris.filter((t) => t.object.startsWith(prefix)).flatMap((t) => t.points);
  return pts.reduce((s, p) => s.map((v, i) => v + p[i] / pts.length), [0, 0, 0]);
};
const stand = center('Work.Stand');
const aim = center('Work.Aim');
const yaw = Math.atan2(aim[0] - stand[0], aim[2] - stand[2]);

// Skelett: Knoten je Knochen, Ruhelage = Drehpunkt relativ zum Elternknochen.
const boneNodes = BONES.map(([name, parent, pivot]) => {
  const parentPivot = parent ? BONES[boneIndex.get(parent)][2] : [0, 0, 0];
  return addNode({ name, translation: sub(pivot, parentPivot) });
});
BONES.forEach(([, parent], i) => {
  if (!parent) return;
  const p = nodes[boneNodes[boneIndex.get(parent)]];
  (p.children ??= []).push(boneNodes[i]);
});

// Figur: jeder Eckpunkt an seinem Knochen. Der Rumpf gehört über der Hüfte
// zum Oberkörper, darunter zum Unterkörper (wie im Shader je Eckpunkt).
const figureVisible = figureTris.filter((t) => partOf(t.object) !== null);
const weights = (t, [x, y]) => {
  const part = partOf(t.object);
  if (part === 'torso') return [[boneIndex.get(y > hip ? 'upperBody' : 'lowerBody'), 1]];
  if (part === 'knife') {
    const w = Math.min(1, Math.max(0, (x + arm) / (2 * arm)));
    return [[boneIndex.get('forearm.R'), 1 - w], [boneIndex.get('forearm.L'), w]];
  }
  return [[boneIndex.get(part), 1]];
};
meshes.push(mesh(female ? 'Bognerin' : 'Bogner', figureVisible, figureColors, weights));
const inverseBind = new Float32Array(BONES.length * 16);
BONES.forEach(([, , pivot], i) => {
  inverseBind.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -pivot[0], -pivot[1], -pivot[2], 1], i * 16);
});
const skin = { name: 'Skelett', joints: boneNodes, skeleton: boneNodes[0], inverseBindMatrices: accessor(inverseBind, 'MAT4', FLOAT, BONES.length) };
const figureMeshNode = addNode({ name: female ? 'Bognerin' : 'Bogner', mesh: meshes.length - 1, skin: 0 });
const figureNode = addNode({
  name: female ? 'Bognerin.Platz' : 'Bogner.Platz',
  translation: [stand[0], 0, stand[2]],
  rotation: qAxis(Y, yaw),
  // Im Spiel ist die Figur 1.7 m groß (VILLAGER.size in src/world/catalog.ts).
  scale: [1.7 / H, 1.7 / H, 1.7 / H],
  // Körperhöhe des Skeletts in Metern (`height` in clips/humanoid.json) - damit
  // rechnet das Spiel die Verschiebung der Wurzel in Körperhöhen um.
  extras: { height: H },
  children: [boneNodes[0], figureMeshNode],
});

// --- Animationen: je Clip eine, als Schleife -------------------------------

// Je Clip: Bild i (30 je Sekunde) zeigt die Phase shift + i / (Bilder - 1) *
// period. Das letzte Bild ist die Phase des ersten eine Periode später - die
// Schleife schließt genau, auch wenn period / (Bilder - 1) nicht glatt ist.
const animations = [];
const sidecar = [];
for (const clip of CLIPS) {
  const frames = Math.round(clip.seconds * FPS) + 1;
  const duration = (frames - 1) / FPS;
  const times = new Float32Array(frames).map((_, i) => i / FPS);
  const timeInput = accessor(times, 'SCALAR', FLOAT, frames, { min: [0], max: [duration] });
  const samplers = [];
  const channels = [];
  const track = (node, path, values, type, interpolation = 'LINEAR', input = timeInput) => {
    samplers.push({ input, output: accessor(values, type, FLOAT, values.length / (type === 'VEC4' ? 4 : 3)), interpolation });
    channels.push({ sampler: samplers.length - 1, target: { node, path } });
  };
  const poses = [...times].map((_, i) => boneRotations(
    pose(clip.name, clip.shift + (i / (frames - 1)) * clip.period, { knee: kneeModel, stride: 1 }), H));
  track(boneNodes[0], 'translation', new Float32Array(poses.flatMap((p) => p.translation)), 'VEC3');
  for (const name of Object.keys(poses[0].rotations)) {
    track(boneNodes[boneIndex.get(name)], 'rotation', new Float32Array(poses.flatMap((p) => p.rotations[name])), 'VEC4');
  }
  if (clip.name === 'carve') {
    // Stufen des Bogens: je fünf Züge sichtbar (Skalierung 1), sonst 0.
    const stroke = duration / 15;
    const stageTimes = new Float32Array([0, stroke * 5, stroke * 10, duration]);
    const stageInput = accessor(stageTimes, 'SCALAR', FLOAT, 4, { min: [0], max: [duration] });
    stageNodes.forEach((node, s) => {
      const scale = [0, 1, 2, 3].flatMap((i) => (i === s || (i === 3 && s === 2) ? [1, 1, 1] : [0, 0, 0]));
      track(node, 'scale', new Float32Array(scale), 'VEC3', 'STEP', stageInput);
    });
  }
  animations.push({ name: clip.name, samplers, channels });
  sidecar.push({
    name: clip.name, pose: clip.pose, props: clip.props, phase_period: clip.period, phase_shift: clip.shift,
    kneel: Boolean(clip.kneel), strike: strikeTimes(clip, duration), frames, duration,
  });
}

// --- Schreiben -------------------------------------------------------------

const sceneRoot = addNode({ name: 'Bognerei.Szene', children: [shopNode, ...stageNodes, figureNode] });
const gltf = {
  asset: { version: '2.0', generator: 'procedurally-generated-map tools/export/bognerei.mjs' },
  scene: 0,
  scenes: [{ name: 'Bognerei', nodes: [sceneRoot] }],
  nodes,
  meshes,
  materials,
  skins: [skin],
  animations,
  accessors,
  bufferViews,
  buffers: [{ byteLength }],
};

const bin = new Uint8Array(byteLength + ((4 - (byteLength % 4)) % 4));
let offset = 0;
for (const c of chunks) {
  bin.set(c, offset);
  offset += c.byteLength;
}
const jsonBytes = new TextEncoder().encode(JSON.stringify(gltf));
const jsonPadded = new Uint8Array(jsonBytes.length + ((4 - (jsonBytes.length % 4)) % 4)).fill(0x20);
jsonPadded.set(jsonBytes);
const total = 12 + 8 + jsonPadded.length + 8 + bin.length;
const glb = new Uint8Array(total);
const view = new DataView(glb.buffer);
view.setUint32(0, 0x46546c67, true);
view.setUint32(4, 2, true);
view.setUint32(8, total, true);
view.setUint32(12, jsonPadded.length, true);
view.setUint32(16, 0x4e4f534a, true);
glb.set(jsonPadded, 20);
view.setUint32(20 + jsonPadded.length, bin.length, true);
view.setUint32(24 + jsonPadded.length, 0x004e4942, true);
glb.set(bin, 28 + jsonPadded.length);

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, glb);
writeFileSync(outFile.replace(/\.glb$/, '.clips.json'), JSON.stringify({ height: H, clips: sidecar }, null, 2) + '\n');
console.log(`${outFile} - ${(total / 1024).toFixed(0)} KB, Clips: ${sidecar.map((c) => `${c.name} ${c.frames}`).join(', ')}`);
