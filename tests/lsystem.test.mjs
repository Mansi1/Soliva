// Geometrie des L-System-Werkzeugs (tools/lsystem): der Regler "Ecken am
// Stamm" (TreeSpec.sides), die Verjüngung der Äste und endliche Punkte.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { grow, interpret, parseRules, rewrite, rng, sides, tokenize } from '../tools/lsystem/lsystem.ts';
import { PRESETS } from '../tools/lsystem/presets/index.ts';

/** Alle Eckpunkte der Wurzeln (Objekte "Root") eines Baums. */
const rootPoints = (spec) => {
  const points = [];
  let root = false;
  for (const l of grow(spec).model.out) {
    if (l.startsWith('o ')) root = l === 'o Root';
    else if (root && l.startsWith('v ')) points.push(l.split(' ').slice(1).map(Number));
  }
  return points;
};

const triangles = (tree) => tree.model.out
  .filter((l) => l.startsWith('f '))
  .reduce((sum, l) => sum + l.split(' ').length - 3, 0);

test('Ecken folgen dem Regler, mindestens 3', () => {
  assert.deepEqual([0.3, 0.2, 0.1, 0.02].map((r) => sides(r, 8)), [8, 6, 4, 3]);
  assert.deepEqual([0.3, 0.2, 0.1, 0.02].map((r) => sides(r, 3)), [3, 3, 3, 3]);
  assert.equal(sides(0.3, 16), 16);
});

test('Kragen und Gehrung erzeugen nur endliche Punkte', () => {
  // Gehrung teilt durch den Kosinus des halben Knickwinkels, der Kragen setzt
  // neue Punkte in den Elternast - beides darf kein NaN oder Unendlich liefern.
  for (const [name, spec] of Object.entries(PRESETS)) {
    const bad = grow({ ...spec, iterations: Math.min(spec.iterations, 5) }).model.out
      .filter((l) => l.startsWith('v ') && l.split(' ').slice(1).some((v) => !Number.isFinite(Number(v))));
    assert.deepEqual(bad, [], name);
  }
});

test('Wurzeln reichen nicht unter den Boden', () => {
  // Das Spiel stellt ein Modell mit seinem tiefsten Punkt auf den Boden
  // (entityRenderer, minY) - eine Wurzel unter y = 0 höbe den ganzen Baum.
  for (const [name, spec] of Object.entries(PRESETS)) {
    for (const seed of [1, 2, 3]) {
      const low = Math.min(...rootPoints({ ...spec, seed, iterations: Math.min(spec.iterations, 5) }).map((p) => p[1]));
      assert.ok(low >= 0, `${name}, Seed ${seed}: tiefster Punkt einer Wurzel ${low}`);
    }
  }
});

test('Stammfuß nach Baumart und Seed', () => {
  const foot = (spec) => grow(spec).model.out.filter((l) => l === 'o Root').length;
  assert.equal(foot({ ...PRESETS.haengebirke, iterations: 4 }), 1);
  assert.equal(foot({ ...PRESETS.palme, iterations: 4 }), 0);
  // Seed: dieselbe Art, anderer Seed - anderer Fuß.
  const a = JSON.stringify(rootPoints({ ...PRESETS.haengebirke, seed: 1, iterations: 4 }));
  const b = JSON.stringify(rootPoints({ ...PRESETS.haengebirke, seed: 2, iterations: 4 }));
  assert.notEqual(a, b);
});

test('Stammfuß und Stumpf ohne Naht', () => {
  // Jeder Punkt des obersten Rings des Fußes liegt auf dem Rand des Stumpfs:
  // auf einer seiner Ecken oder einer Kante dazwischen.
  const out = grow({ ...PRESETS.haengebirke, iterations: 4 }).model.out;
  const objects = [];
  for (const l of out) {
    if (l.startsWith('o ')) objects.push({ name: l.slice(2), points: [] });
    else if (l.startsWith('v ')) objects.at(-1).points.push(l.split(' ').slice(1).map(Number));
  }
  const foot = objects.find((o) => o.name === 'Root').points;
  const stump = objects.find((o) => o.name === 'Trunk.Stump').points;
  const top = Math.max(...foot.map((p) => p[1]));
  const ring = stump.filter((p) => Math.abs(p[1] - top) < 2e-3);
  assert.ok(ring.length >= 3, 'Stumpf beginnt nicht auf dem Fuß');
  const onEdge = (p) => ring.some((q) => ring.some((w) => {
    const d = [w[0] - q[0], w[2] - q[2]], e = [p[0] - q[0], p[2] - q[2]];
    const len = Math.hypot(...d);
    if (len < 1e-9) return Math.hypot(...e) < 2e-3;
    const along = (e[0] * d[0] + e[1] * d[1]) / len;
    return along > -2e-3 && along < len + 2e-3 && Math.abs(e[0] * d[1] - e[1] * d[0]) / len < 2e-3;
  }));
  for (const p of foot.filter((q) => Math.abs(q[1] - top) < 1e-6)) assert.ok(onEdge(p), `Naht bei ${p}`);
});

test('weniger Ecken am Stamm, weniger Dreiecke', () => {
  const spec = { ...PRESETS.haengebirke, iterations: 5 };
  const few = triangles(grow({ ...spec, sides: 3 }));
  const many = triangles(grow({ ...spec, sides: 16 }));
  assert.ok(few < many, `${few} Dreiecke mit 3 Ecken, ${many} mit 16`);
});

test('ohne Gabel verjüngt sich ein Ast gleichmäßig, ohne Sprung', () => {
  // Sonst bliebe der Stamm ein Zylinder bis zur Gabel und würde erst dort dünn.
  const spec = PRESETS.haengebirke;
  const rnd = rng(spec.seed);
  const { tokens } = rewrite(tokenize(spec.axiom), parseRules(spec.rules), 5, rnd);
  const { segments, radii } = interpret(tokens, spec, rnd);
  const children = segments.map(() => []);
  segments.forEach((s, i) => { if (s.parent >= 0) children[s.parent].push(i); });
  let runs = 0;
  segments.forEach((_, i) => {
    if (children[i].length !== 1) return;
    const next = children[i][0];
    assert.ok(Math.abs(radii[i][1] - radii[next][0]) < 1e-9, `Sprung zwischen ${i} und ${next}`);
    assert.ok(radii[i][1] < radii[i][0], `Stück ${i} ohne Gabel verjüngt sich nicht`);
    runs++;
  });
  assert.ok(runs > 0, 'Rezept ohne Stücke ohne Gabel prüft nichts');
});
