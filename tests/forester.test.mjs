// Förster (B9) - Vorgaben des Spielers vom 2026-10-11:
// - Eigene Försterhütte, darin arbeitet genau ein Förster.
// - Er pflanzt im Umkreis, um die Hütte oder um den Pflanzplatz (wie ein
//   Sammelpunkt gesetzt), nur auf freiem, passendem Land.
// - Die Baumart wählt man in der Hütte.
// - Ein Baum wächst in 5 Minuten zu einem fällbaren Baum, Pflanzen kostet nichts.
// - Gepflanzte Bäume stehen im Spielstand; ältere Stände laden ohne sie.
// Echte Module über Vite (worldFixture.mjs).

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { build, loadModules, makeWorld, run, terrain } from './worldFixture.mjs';

const {
  modules: [{ World }, { FORESTER }, { depositKind }],
  close,
} = await loadModules('/src/world/world.ts', '/src/world/catalog.ts', '/src/world/resources.ts');
after(close);

// Node hat ohne Schalter kein localStorage - der Spielstand (save.ts) braucht nur getItem/setItem.
const storage = new Map();
globalThis.localStorage ??= {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)),
};

/** Wiese, ab x = 18 Wasser, ein Waldbaum bei 12,3. */
const land = (x, y) => (x >= 18 ? 'water' : x === 12 && y === 3 ? 'tree' : 'grass');

const planted = (world) => [...world.deposits.plantedKeys()].map((k) => k.split(',').map(Number));

/** Dorfzentrum, Försterhütte bei 12,0 und ein Förster darin. */
function forestWorld() {
  const world = makeWorld(World, land);
  build(world, 0, 0, 'town_center');
  const hut = build(world, 12, 0, 'forester');
  world.spawnAround('villager', 10, -3, 1);
  const v = world.villagers[0];
  assert.equal(world.command(new Set([v.id]), hut.x, hut.y), null);
  assert.equal(v.task.kind, 'plant');
  return { world, hut, v };
}

/** Jeder Baum im Umkreis um (cx, cy), auf Wiese, ohne Gebäude oder anderen gepflanzten Baum daneben. */
function assertValid(world, trees, cx, cy, radius = FORESTER.radius) {
  for (const [x, y] of trees) {
    assert.ok(Math.hypot(x - cx, y - cy) <= radius, `${x},${y} outside radius of ${cx},${cy}`);
    assert.equal(land(x, y), 'grass', `${x},${y} not on grass`);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        assert.equal(world.at(x + dx, y + dy), undefined, `${x},${y} next to a building`);
        if (dx || dy) assert.ok(!trees.some(([tx, ty]) => tx === x + dx && ty === y + dy), `${x},${y} next to a planted tree`);
      }
    }
  }
}

test('Der Förster pflanzt nur auf freie Wiese im Umkreis der Hütte, mit Abstand - dann um den Pflanzplatz', () => {
  const { world, hut, v } = forestWorld();
  const wood = world.stock.wood;
  run(world, 120);
  const first = planted(world);
  assert.ok(first.length >= 4, `planted ${first.length}`);
  assertValid(world, first, hut.x, hut.y);
  // Pflanzen kostet nichts.
  assert.equal(world.stock.wood, wood);

  // Pflanzplatz wie ein Sammelpunkt: nun pflanzt er dort - einen Baum, den er
  // gerade setzt, noch an der alten Stelle.
  assert.equal(world.setRally(hut, 6, -14), null);
  run(world, FORESTER.plantTime + 1);
  const before = planted(world);
  run(world, 150);
  const later = planted(world).filter(([x, y]) => !before.some(([fx, fy]) => fx === x && fy === y));
  assert.ok(later.length >= 3, `planted at the spot ${later.length}`);
  assertValid(world, later, 6, -14);
  assertValid(world, planted(world), 0, 0, Infinity);
  assert.equal(v.task.kind, 'plant');
});

test('Gewählte Baumart; der Baum wächst 5 Minuten, dann ist er ein gewöhnlicher Baum für Holzfäller', () => {
  const { world, hut } = forestWorld();
  world.setTreeSpecies(hut, 'birch');
  // Der Förster soll hier nicht dazwischenpflanzen.
  world.dismiss(hut.anchor);
  assert.ok(world.plant(4, 8, hut.species));
  assert.equal(world.remainingAt(4, 8).type, null, 'a sapling cannot be felled');
  assert.equal(world.resourceInfo(4, 8).sapling, true);
  assert.ok(!world.canPlant(4, 8) && !world.canPlant(5, 8), 'occupied, and no neighbour');
  assert.ok(!world.canPlant(12, 3) && world.canPlant(12, 4), 'not on a forest tree, but next to one');
  run(world, FORESTER.growTime - 1);
  assert.equal(world.remainingAt(4, 8).type, null);
  run(world, 2);
  assert.deepEqual(world.remainingAt(4, 8), { type: 'wood', amount: FORESTER.wood });
  assert.equal(depositKind(world.deposits, 4, 8), 'Birke');

  // Ein Holzfäller fällt ihn wie jeden Baum; die Ladung ist Birke.
  world.speedy = true;
  world.spawnAround('villager', 2, 8, 1);
  const lumberjack = world.villagers.at(-1);
  assert.equal(world.command(new Set([lumberjack.id]), 4, 8), null);
  let kind;
  run(world, 30, () => { kind ??= lumberjack.carrying > 0 ? world.carryKind(lumberjack) : undefined; });
  assert.equal(kind, 'Birke');
  assert.ok(world.deposits.isFelled(4, 8));
  // Ganz abgeholzt darf dort wieder gepflanzt werden.
  run(world, 200);
  assert.ok(world.deposits.isExhausted(4, 8));
  assert.ok(world.canPlant(4, 8));
});

test('Speichern und Laden behält gepflanzte Bäume, Art und Wuchs, Baumart und Pflanzplatz der Hütte', () => {
  const { world, hut } = forestWorld();
  world.dismiss(hut.anchor);
  world.setTreeSpecies(hut, 'pine');
  world.setRally(hut, 8, -6);
  assert.ok(world.plant(3, 6, 'maple'));
  run(world, 100);
  storage.set('pgm.world.forest-roundtrip', JSON.stringify(world.toSave()));

  const loaded = new World(terrain(land), 'forest-roundtrip');
  assert.deepEqual(loaded.deposits.plantedAt(3, 6).species, 'maple');
  const growth = loaded.deposits.growth(3, 6, loaded.now);
  assert.ok(Math.abs(growth - 100 / FORESTER.growTime) < 0.01, `growth ${growth}`);
  const hut2 = loaded.at(12, 0);
  assert.equal(hut2.species, 'pine');
  assert.deepEqual([hut2.rallyPoint.x, hut2.rallyPoint.y], [8, -6]);
  run(loaded, FORESTER.growTime - 99);
  assert.equal(loaded.remainingAt(3, 6).type, 'wood');
});

test('Ältere Spielstände ohne gepflanzte Bäume laden wie bisher', () => {
  storage.set('pgm.world.forest-old', JSON.stringify({
    version: 3,
    stock: { food: 0, wood: 500, stone: 0, gold: 0, bows: 0 },
    buildings: [{ t: 'town_center', x: 0, y: 0 }],
    villagers: [],
    harvested: { '12,3': 10 },
  }));
  const world = new World(terrain(land), 'forest-old');
  assert.equal([...world.deposits.plantedKeys()].length, 0);
  assert.equal(world.at(0, 0)?.type, 'town_center');
  assert.deepEqual(world.remainingAt(12, 3), { type: 'wood', amount: 90 });
});
