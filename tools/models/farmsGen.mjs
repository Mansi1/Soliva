// Field models - 3x3 tiles (15 m square) like the AoE2 farm: the staked-out
// outline and the crop in rows. The parts are in src/models/fields/*.glb:
// stake and cord from Blender (docs/BLENDER.md), the crops as image cards in
// three growth stages (tools/models/crop-cards.mjs). Here only the placing is
// decided - where each stands, how tall, how it leans and turns - and the
// game builds the field from it at start-up (src/gl/entityRenderer.ts).
//
// Every plant is one object "Crop.<row>.<c>.<cols>": the game shows per
// furrow what is sown and not yet harvested, and lets the plants grow out of
// the ground. The ploughed soil is painted by the terrain shader.
// No Node APIs here - tools/models/farms.mjs writes the OBJ files for a look.
import { model } from './primitives.mjs';

/** The parts a field is made of (src/models/fields/<name>.glb). */
export const FIELD_PARTS = [
  'stake', 'cord',
  // Je Feldart die Karte und die Bilder ihrer weiteren Wachstumsstufen
  // (tools/models/crop-cards.mjs) - in dieser Reihenfolge, das Spiel legt die
  // drei Bilder hintereinander in seine Textur.
  ...['wheat', 'corn', 'tomato', 'potato', 'hop'].flatMap((c) => [`${c}_card`, `${c}_card_1`, `${c}_card_2`]),
];

/**
 * A part read from its OBJ, per material: vertices (file coords), faces
 * (0-based into them) and, for an image card, the texture coordinates.
 */
function readPart(obj) {
  const pos = [];
  const uv = [];
  const groups = new Map();
  let mtl = '';
  for (const raw of obj.split('\n')) {
    const p = raw.trim().split(/\s+/);
    if (p[0] === 'v') pos.push(p.slice(1, 4).map(Number));
    else if (p[0] === 'vt') uv.push(p.slice(1, 3).map(Number));
    else if (p[0] === 'usemtl') mtl = p.slice(1).join(' ');
    else if (p[0] === 'f') {
      if (!groups.has(mtl)) groups.set(mtl, { mtl, map: new Map(), verts: [], faces: [], uvs: undefined });
      const g = groups.get(mtl);
      g.faces.push(p.slice(1).map((a) => {
        const [i, t] = a.split('/').map((n) => Number(n) - 1);
        const key = `${i}/${t}`;
        if (!g.map.has(key)) {
          g.map.set(key, g.verts.length);
          g.verts.push(pos[i]);
          if (t >= 0) (g.uvs ??= []).push(uv[t]);
        }
        return g.map.get(key);
      }));
    }
  }
  return [...groups.values()];
}

/** Material colours (Kd) and images (map_Kd) of the parts' MTL files. */
function readMaterials(mtls) {
  const colors = {};
  const images = {};
  for (const text of mtls) {
    let cur = null;
    for (const raw of text.split('\n')) {
      const p = raw.trim().split(/\s+/);
      if (p[0] === 'newmtl') cur = p.slice(1).join(' ');
      if (p[0] === 'Kd' && cur) colors[cur] = p.slice(1, 4).join(' ');
      if (p[0] === 'map_Kd' && cur) images[cur] = p.slice(1).join(' ');
    }
  }
  return { colors, images };
}

const sub = (a, b) => a.map((v, i) => v - b[i]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => {
  const l = Math.hypot(...a);
  return a.map((v) => v / l);
};
/** Cross-section axes of a beam along `dn` - the same rule as beam() in primitives.mjs. */
function frame(dn) {
  const up = Math.abs(dn[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const s1 = norm(cross(dn, up));
  return [s1, cross(s1, dn)];
}

/**
 * Places a part that lies along `axis` from 0 to 1 (a stalk, a leaf, a
 * cord) so that it runs from p0 to p1: along the axis stretched, across it
 * turned like beam() would build it - the part keeps its thickness.
 */
function stretch(axis, p0, p1) {
  const [a1, a2] = frame(axis);
  const [t1, t2] = frame(norm(sub(p1, p0)));
  const d = sub(p1, p0);
  return (v) => {
    const u = dot(v, axis), c1 = dot(v, a1), c2 = dot(v, a2);
    return [0, 1, 2].map((i) => p0[i] + u * d[i] + c1 * t1[i] + c2 * t2[i]);
  };
}

/** Turned by `turn` about the vertical, then moved to (x, y, z). */
function stand(x, y, z, turn = 0) {
  const c = Math.cos(turn), s = Math.sin(turn);
  return ([vx, vy, vz]) => [x + vx * c - vz * s, y + vy, z + vx * s + vz * c];
}


/** Half the field edge and half the planted area, metres. */
const HALF = 7.5;
// Planted right up to the edge, half a furrow's spacing from it: two fields
// side by side then continue each other's rows without a gap.
const INNER = HALF;

/** Deterministic random numbers, one stream per field. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
    s = Math.imul(s ^ (s >>> 13), 3266489917) >>> 0;
    return ((s ^ (s >>> 16)) >>> 0) / 4294967296;
  };
}

/** Where the plants stand, metres above the ground. */
const SOIL = 0.02;
/**
 * Furrows per field - the same for every crop (FIELD_ROWS in buildings.ts),
 * three per tile: a field may cover only some of its nine tiles, and the game
 * hides what lies on the missing ones. Plants per furrow are multiples of 3.
 */
const ROWS = 9;

/**
 * Round the plants: the staked-out outline. The ploughed soil itself is no
 * geometry - the terrain shader paints it (World.fieldSoil), so it lies
 * exactly on the ground.
 */
function ground(m, put) {
  // Staked out: pegs with a cord along every edge of every tile,
  // "Edge.<tile>.<side>" - the game shows only the edges on the outline of
  // the tiles the field has, so it is visible before anything is ploughed.
  const inset = 0.15;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const z0 = -HALF + 5 * i + inset, z1 = -HALF + 5 * (i + 1) - inset;
      const x0 = -HALF + 5 * j + inset, x1 = -HALF + 5 * (j + 1) - inset;
      // Sides: 0 = -z, 1 = +z, 2 = -x, 3 = +x (tile i along z, j along x).
      const sides = [[[x0, z0], [x1, z0]], [[x0, z1], [x1, z1]], [[x0, z0], [x0, z1]], [[x1, z0], [x1, z1]]];
      sides.forEach(([[ax, az], [bx, bz]], side) => {
        const name = `Edge.${i * 3 + j}.${side}`;
        for (const t of [0, 0.5, 1]) put(name, 'stake', stand(ax + (bx - ax) * t, 0, az + (bz - az) * t));
        // In pieces - the game lays the field on the terrain vertex by vertex,
        // a single 5 m cord would cut into a hill.
        for (let k = 0; k < 6; k++) {
          const [t0, t1] = [k / 6, (k + 1) / 6];
          put(name, 'cord', stretch([1, 0, 0], [ax + (bx - ax) * t0, 0.4, az + (bz - az) * t0], [ax + (bx - ax) * t1, 0.4, az + (bz - az) * t1]));
        }
      });
    }
  }
  // Tiny markers at both edges give the model its width (15 m).
  m.box('Peg', 'Wood', [-HALF, -HALF + 0.001], [0, 0.001], [0, 0.001]);
  m.box('Peg', 'Wood', [HALF - 0.001, HALF], [0, 0.001], [0, 0.001]);
}

/**
 * Calls plant(name, x, z) for every plant: rows (furrows) along x, row r at
 * z. The name "Crop.<r>.<c>.<cols>" tells the game the furrow and the place
 * in it - each furrow has its own farmer, who sows from c = 0 on and
 * harvests from the far end back.
 */
function planted(rows, cols, plant) {
  const gapZ = (2 * INNER) / rows;
  const gapX = (2 * INNER) / cols;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      plant(`Crop.${r}.${c}.${cols}`, -INNER + (c + 0.5) * gapX, -INNER + (r + 0.5) * gapZ);
    }
  }
}

/**
 * A crop as image cards (fields/<crop>_card.glb, a square as wide as the grown
 * plant is tall): per plant two crossed cards, in the full version one such
 * cross at each of `spots` places across the furrow - so the ground does not
 * show between the rows. The shader lets the plant grow on the card through
 * its three stages. A card is 4 vertices where 3D plants were thousands.
 */
function cards(part, seed, cols, spots, widen = 1) {
  return (m, put, detail = 1) => {
    const rnd = rng(seed);
    ground(m, put);
    const gapZ = (2 * INNER) / ROWS;
    const gapX = (2 * INNER) / cols;
    planted(ROWS, cols, (name, x, z) => {
      for (const [dx, dz] of detail >= 1 ? spots : [[0, 0]]) {
        const px = x + dx * gapX + (rnd() - 0.5) * 0.3;
        const pz = z + dz * gapZ + (rnd() - 0.5) * 0.2;
        const k = 0.85 + rnd() * 0.3;
        // Die einfacheren Fassungen (ein Kreuz) breiter, sonst sähe man die Erde.
        const wide = k * widen * (detail >= 1 ? 1 : 1.5);
        const turn = rnd() * Math.PI;
        for (const t of [turn, turn + Math.PI / 2]) {
          // Jede Karte oben bis etwa 10° zur Seite und nach vorn oder hinten geneigt.
          const [side, back] = [(rnd() - 0.5) * 0.35, (rnd() - 0.5) * 0.35];
          const at = stand(px, SOIL * 0.5, pz, t);
          put(name, part, ([vx, vy, vz]) => at([vx * wide + side * vy * k, vy * k, vz + back * vy * k]));
        }
      }
    });
  };
}

/** The fields, in the order of the SHAPE numbers (farmWheat, farmCorn, farmTomato, farmPotato, farmHop). */
export const FARM_KINDS = ['wheat', 'corn', 'tomato', 'potato', 'hop'];
/** Weizen dicht an dicht (15 Plätze je Furche, drei Kreuze quer), die übrigen auf 9 Plätzen in zwei Reihen. */
const TWO_ROWS = [[0, -0.25], [0, 0.25]];
const MAKE = {
  wheat: cards('wheat_card', 11, 15, [[0, -1 / 3], [0, 0], [0, 1 / 3]], 1.3),
  corn: cards('corn_card', 23, 9, TWO_ROWS),
  tomato: cards('tomato_card', 31, 9, TWO_ROWS),
  potato: cards('potato_card', 37, 9, [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]], 1.4),
  hop: cards('hop_card', 41, 9, TWO_ROWS, 0.8),
};

/**
 * OBJ and MTL text of one field, from its parts (`parts[name] = { obj, mtl }`,
 * src/models/fields/<name>.glb, read as OBJ/MTL text). `detail` < 1 gives the simpler
 * versions for zooming out: fewer stalks of wheat, fewer maize plants (0.3
 * and 0.1).
 */
export function farmModel(kind, detail, parts) {
  const m = model();
  const read = Object.fromEntries(Object.entries(parts).map(([n, p]) => [n, readPart(p.obj)]));
  const put = (name, part, at) => {
    for (const g of read[part]) m.mesh(name, g.mtl, g.verts.map(at), g.faces, g.uvs);
  };
  MAKE[kind](m, put, detail);
  const { colors, images } = readMaterials(Object.values(parts).map((p) => p.mtl));
  const obj = `# farm_${kind}.obj (tools/models/farmsGen.mjs)\nmtllib farm_${kind}.mtl\n${m.out.join('\n')}\n`;
  let mtl = `# farm_${kind}.mtl\n`;
  for (const n of [...m.used].sort()) {
    mtl += `\nnewmtl ${n}\nKd ${colors[n] ?? '0.6 0.6 0.6'}\nKa 0 0 0\nKs 0 0 0\nd 1\nillum 1\n${images[n] ? `map_Kd ${images[n]}\n` : ''}`;
  }
  return { obj, mtl };
}
