// Field models - 3x3 tiles (15 m square) like the AoE2 farm: the staked-out
// outline and the crop in rows. The parts are Blender models (docs/BLENDER.md,
// src/models/fields/*.glb): stake, cord, wheat leaf, wheat stalks with
// ears in three tones, maize plants with one or two cobs. Here only the
// placing is decided - where each stands, how tall, how it leans and turns -
// and the game builds the field from it at start-up (src/gl/entityRenderer.ts)
// rather than storing it: a wheat field is thousands of single stalks.
//
// Every plant is one object "Crop.<row>.<c>.<cols>": the game shows per
// furrow what is sown and not yet harvested, and lets the plants grow out of
// the ground. The ploughed soil is painted by the terrain shader.
// No Node APIs here - tools/models/farms.mjs writes the OBJ files for a look.
import { model } from './primitives.mjs';

/** The parts a field is made of (src/models/fields/<name>.glb). */
export const FIELD_PARTS = [
  'stake', 'cord', 'wheat_leaf', 'wheat_stalk_light', 'wheat_stalk', 'wheat_stalk_dark', 'corn_1', 'corn_2',
  'tomato', 'potato', 'hop',
];

/**
 * A part read from its OBJ, per material: vertices (file coords) and faces
 * (0-based into them).
 */
function readPart(obj) {
  const pos = [];
  const groups = new Map();
  let mtl = '';
  for (const raw of obj.split('\n')) {
    const p = raw.trim().split(/\s+/);
    if (p[0] === 'v') pos.push(p.slice(1, 4).map(Number));
    else if (p[0] === 'usemtl') mtl = p.slice(1).join(' ');
    else if (p[0] === 'f') {
      if (!groups.has(mtl)) groups.set(mtl, { mtl, map: new Map(), verts: [], faces: [] });
      const g = groups.get(mtl);
      g.faces.push(p.slice(1).map((a) => {
        const i = Number(a.split('/')[0]) - 1;
        if (!g.map.has(i)) {
          g.map.set(i, g.verts.length);
          g.verts.push(pos[i]);
        }
        return g.map.get(i);
      }));
    }
  }
  return [...groups.values()];
}

/** Material colours (Kd) of the parts' MTL files. */
function readColors(mtls) {
  const colors = {};
  for (const text of mtls) {
    let cur = null;
    for (const raw of text.split('\n')) {
      const p = raw.trim().split(/\s+/);
      if (p[0] === 'newmtl') cur = p.slice(1).join(' ');
      if (p[0] === 'Kd' && cur) colors[cur] = p.slice(1, 4).join(' ');
    }
  }
  return colors;
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

/**
 * Turned by `turn` about the vertical, then moved to (x, y, z). With `grow`
 * everything above `above` metres moves up by `grow` (the top of a maize
 * stalk and its tassel) - leaves and cobs below keep their height.
 */
function stand(x, y, z, turn = 0, grow = 0, above = Infinity) {
  const c = Math.cos(turn), s = Math.sin(turn);
  return ([vx, vy, vz]) => [x + vx * c - vz * s, y + vy + (vy > above ? grow : 0), z + vx * s + vz * c];
}

/** Height of the maize plants in Blender (fields/corn_*.glb) and from where up they grow with the plant. */
const CORN_HEIGHT = 2.2;
const CORN_GROWS_ABOVE = 2.0;

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

/** Where the plants start, metres - they grow from here (FIELD_SOIL_METERS in the shader). */
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
 * Wheat like a real field: many single stalks, each with its ear, standing
 * close together and leaning a little this way and that.
 */
function wheat(m, put, detail = 1) {
  const rnd = rng(11);
  const rows = ROWS, cols = 15;
  ground(m, put);
  const gapZ = (2 * INNER) / rows, gapX = (2 * INNER) / cols;
  planted(rows, cols, (name, x, z) => {
    // Unten dicht an dicht Blätter, die schräg aus dem Boden stehen - so
    // sieht man zwischen den Halmen nicht bis auf die Erde.
    for (let i = 0; i < Math.round(24 * detail); i++) {
      const px = x + (rnd() - 0.5) * gapX;
      const pz = z + (rnd() - 0.5) * gapZ * 0.95;
      const a = rnd() * Math.PI * 2;
      const len = 0.35 + rnd() * 0.25;
      const tip = [px + Math.cos(a) * len * 0.45, SOIL + len, pz + Math.sin(a) * len * 0.45];
      put(name, 'wheat_leaf', stretch([0, 1, 0], [px, SOIL * 0.5, pz], tip));
    }
    for (let i = 0; i < Math.max(4, Math.round(60 * detail)); i++) {
      const px = x + (rnd() - 0.5) * gapX;
      const pz = z + (rnd() - 0.5) * gapZ * 0.95;
      const h = 0.8 + rnd() * 0.25;
      const lean = [(rnd() - 0.5) * 0.14, (rnd() - 0.5) * 0.14];
      rnd(); // (früher die Länge der Ähre - sie steht jetzt im Modell)
      const tone = rnd();
      // Der Halm von der Erde bis oben, die Ähre setzt ihn fort.
      put(name, tone < 0.55 ? 'wheat_stalk_light' : tone < 0.85 ? 'wheat_stalk' : 'wheat_stalk_dark',
        stretch([0, 1, 0], [px, SOIL * 0.5, pz], [px + lean[0], h, pz + lean[1]]));
    }
  });
}

/**
 * Maize: dense stands of tall stalks - two rows of plants per furrow - with
 * long hanging leaves, a tassel on top and yellow cobs that stick out of
 * their husks. Each plant is one of the two Blender plants (one or two
 * cobs), turned and stretched to its height.
 */
function corn(m, put, detail = 1) {
  const rnd = rng(23);
  const rows = ROWS, cols = 9;
  ground(m, put);
  const gapZ = (2 * INNER) / rows, gapX = (2 * INNER) / cols;
  planted(rows, cols, (name, x, z) => {
    // Fewer plants in the simpler versions (every second or fourth).
    const stride = detail >= 1 ? 1 : detail >= 0.3 ? 2 : 4;
    for (let k = 0; k < 8; k += stride) {
      const px = x + ((k % 4) + 0.5 - 2) * (gapX / 4) + (rnd() - 0.5) * 0.12;
      const pz = z + (k < 4 ? -0.22 : 0.22) * gapZ + (rnd() - 0.5) * 0.1;
      const h = 2.0 + rnd() * 0.45;
      const turn = rnd() * Math.PI;
      // Ein oder zwei Kolben - gezogen wie früher: die Bedingung würfelt bei
      // jeder Prüfung neu, dazu je Kolben seine (jetzt im Modell feste) Höhe.
      // So stehen alle Pflanzen danach genau wie früher.
      let cobs = 0;
      while (cobs < 1 + Math.floor(rnd() * 2)) {
        rnd();
        cobs++;
      }
      // Die Modelle sind 2,2 m hoch und drehen sich um die Hochachse. Was über
      // 2 m liegt (Spitze des Stängels, Rispe), wächst mit der Höhe der Pflanze.
      put(name, cobs === 1 ? 'corn_1' : 'corn_2',
        stand(px, SOIL * 0.5, pz, turn, h - CORN_HEIGHT, CORN_GROWS_ABOVE));
    }
  });
}

/**
 * Bushes in two rows per furrow (tomatoes, potatoes, hops): `per` plants per spot,
 * each turned and a little off its place. Fewer in the simpler versions.
 */
function bushes(part, seed, per) {
  return (m, put, detail = 1) => {
    const rnd = rng(seed);
    const rows = ROWS, cols = 9;
    ground(m, put);
    const gapZ = (2 * INNER) / rows, gapX = (2 * INNER) / cols;
    planted(rows, cols, (name, x, z) => {
      const stride = detail >= 1 ? 1 : detail >= 0.3 ? 2 : 4;
      for (let k = 0; k < per; k += stride) {
        const half = Math.ceil(per / 2);
        const px = x + ((k % half) + 0.5 - half / 2) * (gapX / half) + (rnd() - 0.5) * 0.12;
        const pz = z + (k < half ? -0.22 : 0.22) * gapZ + (rnd() - 0.5) * 0.1;
        put(name, part, stand(px, SOIL * 0.5, pz, rnd() * Math.PI * 2));
      }
    });
  };
}

/** The fields, in the order of the SHAPE numbers (farmWheat, farmCorn, farmTomato, farmPotato, farmHop). */
export const FARM_KINDS = ['wheat', 'corn', 'tomato', 'potato', 'hop'];
const MAKE = { wheat, corn, tomato: bushes('tomato', 31, 4), potato: bushes('potato', 37, 6), hop: bushes('hop', 41, 2) };

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
    for (const g of read[part]) m.mesh(name, g.mtl, g.verts.map(at), g.faces);
  };
  MAKE[kind](m, put, detail);
  const colors = readColors(Object.values(parts).map((p) => p.mtl));
  const obj = `# farm_${kind}.obj (tools/models/farmsGen.mjs)\nmtllib farm_${kind}.mtl\n${m.out.join('\n')}\n`;
  let mtl = `# farm_${kind}.mtl\n`;
  for (const n of [...m.used].sort()) {
    mtl += `\nnewmtl ${n}\nKd ${colors[n] ?? '0.6 0.6 0.6'}\nKa 0 0 0\nKs 0 0 0\nd 1\nillum 1\n`;
  }
  return { obj, mtl };
}
