// Rudel (B12) und Junge (B11), wie der Nutzer sie festgelegt hat: Rudel
// bleiben beisammen, ziehen nicht ins Wasser und keine steilen Hänge hinauf,
// fliehen zusammen und sammeln sich danach wieder. Sind ein Männchen und ein
// Weibchen nah beisammen, kommt alle 10 Minuten ein Junges, bis das Rudel 8
// Tiere hat; Junge sind klein, nach 15 Minuten ausgewachsen und geben bis
// dahin die halbe Nahrung. Geschlecht und Alter stehen im Spielstand.

import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { loadModules, makeWorld, run } from './worldFixture.mjs';

const { modules: [worldModule, unit], close } = await loadModules('/src/world/world.ts', '/src/world/unit/index.ts');
after(close);

// Die Tiere würfeln (Wege, Plätze im Rudel) - fest gesät, damit jeder Lauf gleich ist.
const random = Math.random;
after(() => { Math.random = random; });
beforeEach(() => {
  let seed = 12345;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
});

const MINUTE = 60;
const living = (world) => world.wildlife.animals.filter((a) => !a.isDead);
const centroid = (animals) => [animals.reduce((s, a) => s + a.x, 0) / animals.length, animals.reduce((s, a) => s + a.y, 0) / animals.length];
const farthest = (animals) => {
  const [cx, cy] = centroid(animals);
  return Math.max(...animals.map((a) => a.distanceTo(cx, cy)));
};

/** Ein Rudel der Art um (x, y): erst ein Männchen, dann Weibchen. */
function herd(world, kind, x, y, count, female = (i) => i > 0) {
  const animals = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    animals.push(world.wildlife.add(kind, x + Math.cos(a) * 0.6, y + Math.sin(a) * 0.6, { female: female(i) }));
  }
  assert.equal(new Set(animals.map((a) => a.herd)).size, 1, 'alle im selben Rudel');
  return animals;
}

test('ein Rudel zieht umher und bleibt dabei beisammen', () => {
  const world = makeWorld(worldModule.World, () => 'grass');
  // Nur Weibchen - so kommen keine Jungen dazu.
  const deer = herd(world, 'deer', 50, 50, 4, () => true);
  const start = centroid(deer);
  let moved = 0;
  run(world, 60 * MINUTE, () => {
    assert.ok(farthest(deer) < 3, `Rudel auseinander: ${farthest(deer).toFixed(2)} Tiles`);
    const [cx, cy] = centroid(deer);
    moved = Math.max(moved, Math.hypot(cx - start[0], cy - start[1]));
  });
  assert.ok(moved > 3, `das Rudel ist umhergezogen (${moved.toFixed(1)} Tiles)`);
});

test('nicht ins Wasser, keine Klippe hinauf - auch auf der Flucht', () => {
  // Wiese zwischen Wasser-Tiles; westlich von x = 10 sichtbar Wasser, ab y = 30 eine Klippe (Steigung 2).
  const world = makeWorld(worldModule.World, (x, y) => (x < 0 || x > 30 || y < 15 ? 'water' : 'grass'));
  world.groundAt = (x, y) => (x < 10 ? 0 : 0.1 + Math.max(0, y - 30) * 2);
  const cows = herd(world, 'cow', 20, 24, 5, () => true);
  const check = () => {
    for (const a of cows) {
      assert.ok(a.x >= 10, `Kuh im Wasser bei x ${a.x.toFixed(2)}`);
      assert.ok(a.y < 30.1, `Kuh die Klippe hinauf bei y ${a.y.toFixed(2)}`);
    }
  };
  run(world, 90 * MINUTE, check);
  // Ein Dorfbewohner treibt sie gegen Klippe und Ufer.
  assert.equal(world.spawnAround('villager', 22, 20, 1), 1);
  run(world, 2 * MINUTE, check);
});

test('sieht eines einen Dorfbewohner, flieht das ganze Rudel - danach sammelt es sich', () => {
  const world = makeWorld(worldModule.World, () => 'grass');
  const sheep = herd(world, 'sheep', 50, 50, 5, () => true);
  // Nur das nächste Schaf ist näher als `fear` (2.5 Tiles).
  assert.equal(world.spawnAround('villager', 52, 50, 1), 1);
  const villager = world.villagers[0];
  const near = sheep.filter((a) => a.distanceTo(villager.x, villager.y) < unit.ANIMALS.sheep.fear);
  assert.ok(near.length > 0 && near.length < sheep.length, `nur ein Teil sieht ihn (${near.length})`);
  const fled = new Set();
  run(world, 20, () => {
    for (const a of sheep) if (a.state === 'flee') fled.add(a);
  });
  assert.equal(fled.size, sheep.length, 'alle sind geflohen');
  // Der Dorfbewohner geht; das Rudel sammelt sich wieder.
  world.villagers.length = 0;
  run(world, 3 * MINUTE);
  assert.ok(sheep.every((a) => a.state !== 'flee'), 'keins flieht mehr');
  assert.ok(farthest(sheep) < 1.5, `wieder beisammen: ${farthest(sheep).toFixed(2)} Tiles`);
});

test('Männchen und Weibchen nah beisammen: alle 10 Minuten ein Junges, höchstens 8 je Rudel', () => {
  const world = makeWorld(worldModule.World, () => 'grass');
  const [male, female] = herd(world, 'deer', 50, 50, 2);
  assert.ok(!male.female && female.female);
  run(world, 10 * MINUTE - 5);
  assert.equal(living(world).length, 2, 'vor 10 Minuten noch keins');
  run(world, 10);
  assert.equal(living(world).length, 3, 'nach 10 Minuten eins');
  const young = living(world).find((a) => !a.grown);
  assert.equal(young.herd, male.herd, 'das Junge gehört zum Rudel');
  run(world, 10 * MINUTE);
  assert.equal(living(world).length, 4, 'nach 20 Minuten das zweite');
  let most = 0;
  run(world, 180 * MINUTE, () => { most = Math.max(most, living(world).length); });
  assert.equal(most, unit.HERD_MAX, `bis ${unit.HERD_MAX} Tiere, nicht mehr`);
  assert.equal(living(world).length, unit.HERD_MAX);
});

test('ohne Männchen kein Junges', () => {
  const world = makeWorld(worldModule.World, () => 'grass');
  herd(world, 'goat', 50, 50, 3, () => true);
  run(world, 25 * MINUTE);
  assert.equal(living(world).length, 3);
});

test('Junge sind klein, nach 15 Minuten ausgewachsen und geben bis dahin die halbe Nahrung', () => {
  const world = makeWorld(worldModule.World, () => 'grass');
  const def = unit.ANIMALS.cow;
  const calf = world.wildlife.add('cow', 50, 50, { age: 0, female: true }, null);
  assert.ok(!calf.grown);
  assert.equal(calf.food, def.food / 2, 'halbe Nahrung');
  assert.ok(calf.size < def.height * 0.6, `klein: ${calf.size.toFixed(3)}`);
  // Die Schritte passen zur Größe - die Hufe rutschen nicht.
  assert.ok(Math.abs(calf.strideLength / calf.size - def.stride / def.height) < 1e-9);
  run(world, 15 * MINUTE - 5);
  assert.ok(!calf.grown && calf.food === def.food / 2, 'kurz vor 15 Minuten noch jung');
  run(world, 10);
  assert.ok(calf.grown, 'nach 15 Minuten ausgewachsen');
  assert.equal(calf.food, def.food);
  assert.equal(calf.size, def.height);
});

test('Spielstand: Geschlecht, Alter und Rudel bleiben; alte Stände laden fest erwachsen mit Geschlecht', () => {
  const world = makeWorld(worldModule.World, () => 'grass');
  const ram = world.wildlife.add('sheep', 50, 50, { female: false });
  const lamb = world.wildlife.add('sheep', 50.5, 50, { female: true, age: 100 });
  world.wildlife.add('sheep', 80, 80, { female: true });
  const saved = JSON.parse(JSON.stringify(world.wildlife.toSave()));

  const loaded = makeWorld(worldModule.World, () => 'grass');
  loaded.wildlife.restore(saved);
  const [r, l, other] = loaded.wildlife.animals;
  assert.equal(r.female, false);
  assert.equal(l.female, true);
  assert.equal(Math.round(l.age), Math.round(lamb.age));
  assert.ok(r.grown && !l.grown);
  assert.equal(r.herd, l.herd, 'Widder und Lamm in einem Rudel');
  assert.notEqual(other.herd, r.herd, 'das ferne Schaf in einem eigenen');
  assert.equal(r.look.shape, ram.look.shape);

  // Ein Stand von vor B11: ohne s, a, h.
  const old = saved.map(({ k, x, y, hp, f, d }) => ({ k, x, y, hp, f, d }));
  const sexes = () => {
    const w = makeWorld(worldModule.World, () => 'grass');
    w.wildlife.restore(old);
    assert.ok(w.wildlife.animals.every((a) => a.grown), 'erwachsen');
    return w.wildlife.animals.map((a) => a.female);
  };
  assert.deepEqual(sexes(), sexes(), 'Geschlecht fest, nicht zufällig');
});
