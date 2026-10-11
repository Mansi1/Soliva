// Forschung im Dorfzentrum und Lederschuhe - Vorgaben des Spielers (Fehlerliste, 2026-10-10):
// - Forschung ist neu im Dorfzentrum: sie kostet Rohstoffe und Zeit. Sie ist
//   die Grundlage für Lederschuhe (B31) und Steinmauern (B34).
// - Lederschuhe schaltet eine Forschung im Dorfzentrum frei; Leder kommt vom
//   Schlachten (Jagd, Weide). Barfuß VILLAGER.speed, Holzschuhe +10 %,
//   Lederschuhe +20 %.
// Gewählt (research.ts, villagers.ts): ein Platz je Dorfzentrum, bezahlt beim
// Start, Abbruch erstattet alles; der Schuster macht Lederschuhe, sobald
// erforscht und Leder da ist, sonst Holzschuhe; Dorfbewohner nehmen das beste
// Paar und tauschen Holz- gegen Lederschuhe wie Barfüßige (untätig oder im
// Vorbeigehen). Echte Module über Vite (worldFixture.mjs).

import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { build, loadModules, makeWorld, run, terrain } from './worldFixture.mjs';

const { modules: [{ World }, { RESEARCH }, { SHOES, VILLAGER, LEATHER_SHOES }, { researchView }, { TAME }], close } = await loadModules(
  '/src/world/world.ts', '/src/world/research.ts', '/src/world/catalog.ts', '/src/game/selectionView.ts', '/src/world/pasture.ts');
after(close);

// Node hat ohne Schalter kein localStorage - so läuft Speichern und Laden über den echten Weg.
const storage = new Map();
globalThis.localStorage ??= {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)),
};

// Die Tiere würfeln (Flucht im Zickzack) - fest gesät, damit jeder Lauf gleich ist.
const random = Math.random;
after(() => { Math.random = random; });
beforeEach(() => {
  let seed = 3131;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
});

const GERBEREI = RESEARCH.leather_shoes;

/** Dorfzentrum bei 0,0 mit `leather` Leder (Holz und Stein reichlich, makeWorld). */
function centerWorld(leather = GERBEREI.cost.leather, world = makeWorld(World, () => 'grass')) {
  const center = build(world, 0, 0, 'town_center');
  world.addStock('leather', leather - world.stock.leather);
  return { world, center };
}

test('Forschung: bezahlt beim Start, läuft ihre Zeit und schaltet dann frei', () => {
  const { world, center } = centerWorld();
  const wood = world.stock.wood;
  assert.equal(world.research.has('leather_shoes'), false);
  assert.equal(world.startResearch(center, 'leather_shoes'), null);
  assert.equal(wood - world.stock.wood, GERBEREI.cost.wood);
  assert.equal(world.stock.leather, 0);
  run(world, GERBEREI.time / 2);
  assert.ok(Math.abs(world.research.progress(center.anchor) - 0.5) < 0.01, `progress ${world.research.progress(center.anchor)}`);
  assert.equal(world.research.has('leather_shoes'), false);
  run(world, GERBEREI.time / 2 + 0.2);
  assert.equal(world.research.has('leather_shoes'), true);
  assert.equal(world.research.running.size, 0);
  assert.equal(world.startResearch(center, 'leather_shoes'), 'Schon erforscht');
});

test('Forschung: Abbruch gibt alles zurück; nicht ohne Rohstoffe, nicht doppelt, nur im Dorfzentrum', () => {
  const { world, center } = centerWorld(0);
  const before = { ...world.stock };
  assert.equal(world.startResearch(center, 'leather_shoes'), 'Zu wenig Rohstoffe');
  assert.deepEqual({ ...world.stock }, before, 'nothing paid');
  assert.equal(world.startResearch(center, 'stone_walls'), null);
  assert.equal(world.startResearch(center, 'leather_shoes'), 'Hier wird schon geforscht');
  const other = build(world, 10, 0, 'town_center');
  world.addStock('stone', 1000);
  assert.equal(world.startResearch(other, 'stone_walls'), 'Wird schon in einem anderen Dorfzentrum erforscht');
  assert.equal(world.startResearch(build(world, 0, 8, 'house'), 'stone_walls'), 'Nur im Dorfzentrum wird geforscht');
  const paid = { ...world.stock };
  run(world, 10);
  assert.equal(world.cancelResearch(center), null);
  assert.equal(world.stock.stone - paid.stone, RESEARCH.stone_walls.cost.stone);
  assert.equal(world.stock.wood - paid.wood, RESEARCH.stone_walls.cost.wood);
  assert.equal(world.cancelResearch(center), 'Hier wird nicht geforscht');
  assert.equal(world.research.has('stone_walls'), false);
});

test('Forschung: mit dem Dorfzentrum abgerissen ist sie verloren', () => {
  const { world, center } = centerWorld();
  world.startResearch(center, 'leather_shoes');
  world.remove(center);
  run(world, GERBEREI.time + 1);
  assert.equal(world.research.running.size, 0);
  assert.equal(world.research.has('leather_shoes'), false);
});

test('Spielstand: Fortschritt und Erforschtes bleiben, ältere Stände haben nichts erforscht', () => {
  // Eigene Welt (Seed "forschung") - makeWorld läse sonst diesen Stand in den anderen Tests.
  const world = new World(terrain(() => 'grass'), 'forschung');
  const { center } = centerWorld(GERBEREI.cost.leather, world);
  world.addStock('stone', 1000);
  world.startResearch(center, 'stone_walls');
  run(world, RESEARCH.stone_walls.time + 0.2);
  world.startResearch(center, 'leather_shoes');
  run(world, 10);
  world.save();
  const loaded = new World(terrain(() => 'grass'), 'forschung');
  assert.deepEqual([...loaded.research.done], ['stone_walls']);
  const running = loaded.research.running.get(center.anchor);
  assert.equal(running?.id, 'leather_shoes');
  assert.ok(Math.abs(running.seconds - 10) < 0.2, `seconds ${running?.seconds}`);
  run(loaded, GERBEREI.time - 10 + 0.2);
  assert.equal(loaded.research.has('leather_shoes'), true, 'continues where it was saved');

  storage.set('pgm.world.alt-forschung', JSON.stringify({
    version: 3,
    stock: { food: 0, wood: 0, stone: 0, gold: 0 },
    buildings: [],
    villagers: [],
    harvested: {},
  }));
  const old = new World(terrain(() => 'grass'), 'alt-forschung');
  assert.equal(old.research.done.size, 0);
  assert.equal(old.research.running.size, 0);
  assert.equal(old.toSave().research, undefined, 'nothing researched - nothing saved');
});

test('Panel: Knöpfe mit Kosten und Grund, die laufende mit Fortschritt, erforscht', () => {
  const { world, center } = centerWorld(0);
  let view = researchView(world, center);
  assert.deepEqual(view.options.map((o) => [o.id, o.reason]), [['leather_shoes', 'Zu wenig Rohstoffe'], ['stone_walls', undefined]]);
  assert.equal(view.options[0].cost, '100 Holz, 10 Leder');
  world.startResearch(center, 'stone_walls');
  run(world, RESEARCH.stone_walls.time / 4);
  view = researchView(world, center);
  assert.deepEqual(view.running, { label: 'Steinmauer', percent: 25, cost: '50 Holz, 150 Stein' });
  assert.equal(view.options[1].reason, 'Wird gerade erforscht');
  run(world, RESEARCH.stone_walls.time);
  view = researchView(world, center);
  assert.deepEqual(view.done, ['Steinmauer']);
  assert.deepEqual(view.options.map((o) => o.id), ['leather_shoes']);
  assert.equal(view.running, undefined);
});

/** Dorfzentrum mit `leather` Leder, Schusterei bei 6,0, ein Schuster bei der Arbeit. */
function cobblerWorld(leather, researched) {
  const { world } = centerWorld(leather);
  if (researched) world.research.done.add('leather_shoes');
  const shop = build(world, 6, 0, 'cobbler');
  world.spawnAround('villager', 3, 3, 1);
  const v = world.villagers[0];
  world.command(new Set([v.id]), shop.x, shop.y);
  for (let t = 0; t < 120 && shop.stored('shoes') < 1; t += 0.1) world.tick(0.1);
  return { world, shop, v };
}

test('Schuster: Lederschuhe erst nach der Gerberei und nur mit Leder - sonst Holzschuhe', () => {
  const before = cobblerWorld(10, false);
  assert.deepEqual(Object.keys(before.shop.goods.shoes), [SHOES.wood.kind], 'not researched: wood');
  assert.equal(before.world.stock.leather, 10);
  const without = cobblerWorld(0, true);
  assert.deepEqual(Object.keys(without.shop.goods.shoes), [SHOES.wood.kind], 'no leather: wood');
  const leather = cobblerWorld(10, true);
  assert.deepEqual(Object.keys(leather.shop.goods.shoes), [SHOES.leather.kind]);
  assert.equal(leather.world.stock.leather, 10 - LEATHER_SHOES.amount);
});

test('Lederschuhe: 20 % schneller als barfuß', () => {
  const world = makeWorld(World, () => 'grass');
  world.spawnAround('villager', 2, 2, 2);
  const [shod, bare] = world.villagers;
  shod.inventory.shoes = 'leather';
  bare.x = shod.x + 3;
  bare.y = shod.y;
  assert.ok(Math.abs(shod.speed - VILLAGER.speed * 1.2) < 1e-9, `speed ${shod.speed}`);
  const [sx, bx] = [shod.x, bare.x];
  world.command(new Set([shod.id]), Math.floor(shod.x), Math.floor(shod.y) + 12);
  world.command(new Set([bare.id]), Math.floor(bare.x), Math.floor(bare.y) + 12);
  const [sy, by] = [shod.y, bare.y];
  run(world, 3);
  const ratio = Math.hypot(shod.x - sx, shod.y - sy) / Math.hypot(bare.x - bx, bare.y - by);
  assert.ok(Math.abs(ratio - 1.2) < 0.01, `ratio ${ratio.toFixed(3)}`);
});

/** Schusterei mit je einem Paar Holz- und Lederschuhe, ein Dorfbewohner mit `shoes`. */
function shelfWorld(shoes) {
  const world = makeWorld(World, () => 'grass');
  build(world, 0, 0, 'town_center');
  const shop = build(world, 6, 0, 'cobbler');
  world.addStock('shoes', 1, SHOES.wood.kind, shop);
  world.addStock('shoes', 1, SHOES.leather.kind, shop);
  world.spawnAround('villager', 2, 6, 1);
  const v = world.villagers[0];
  v.inventory.shoes = shoes;
  return { world, shop, v };
}

test('Barfuß: er nimmt lieber die Lederschuhe', () => {
  const { world, shop, v } = shelfWorld(null);
  for (let t = 0; t < 30 && !v.inventory.shoes; t += 0.1) world.tick(0.1);
  assert.equal(v.inventory.shoes, 'leather');
  run(world, 5);
  assert.deepEqual(shop.goods.shoes, { [SHOES.wood.kind]: 1 });
});

test('Mit Holzschuhen: untätig tauscht er sie gegen Lederschuhe, die Holzschuhe bleiben im Regal', () => {
  const { world, shop, v } = shelfWorld('wood');
  for (let t = 0; t < 30 && v.inventory.shoes !== 'leather'; t += 0.1) world.tick(0.1);
  assert.equal(v.inventory.shoes, 'leather');
  run(world, 5);
  assert.deepEqual(shop.goods.shoes, { [SHOES.wood.kind]: 2 });
  // Mit Lederschuhen nimmt er nichts mehr.
  run(world, 10);
  assert.deepEqual(shop.goods.shoes, { [SHOES.wood.kind]: 2 });
});

test('Jagd: ein erlegtes Schaf gibt Leder (wie beim Schlachten) und Fleisch', () => {
  const { world } = centerWorld(0);
  world.spawnAround('villager', 3, 3, 1);
  const v = world.villagers[0];
  v.inventory.weapon = 'spear';
  const sheep = world.wildlife.add('sheep', 3, 10, { female: true });
  const food = world.stock.food;
  world.hunt(new Set([v.id]), sheep);
  for (let t = 0; t < 400 && world.wildlife.animals.includes(sheep); t += 0.1) world.tick(0.1);
  run(world, 30);
  assert.ok(Math.abs(world.stock.leather - TAME.sheep.leather) < 1e-6, `leather ${world.stock.leather} - ${world.describe(v)}`);
  assert.ok(world.stock.food > food, 'and the meat');
});
