// Weide (B27) - Vorgaben des Spielers vom 2026-10-12:
// - Die Weide ist eine abgesteckte Fläche wie ein Feld, mit Holzzaun und Gatter.
// - Fangen: hin zum Tier, Strick darum, langsam zur Weide führen; fliehende
//   Tiere nur, wenn er schneller ist (Regel der Jagd ohne Speer).
// - Gezähmte Tiere geben beim Schlachten Fleisch und Leder, Junge, Milch (Kuh,
//   Ziege) und Wolle (Schaf).
// - Jeder Dorfbewohner per Rechtsklick aufs Tier: fängt es, bringt es zur
//   nächsten Weide und hütet dort.
// Echte Module über Vite (worldFixture.mjs).

import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { build, loadModules, makeWorld, run, terrain } from './worldFixture.mjs';

const { modules: [{ World }, { TAME, pastureGroups }], close } = await loadModules('/src/world/world.ts', '/src/world/pasture.ts');
after(close);

// Node hat ohne Schalter kein localStorage - so läuft Speichern und Laden über den echten Weg.
const storage = new Map();
globalThis.localStorage ??= {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)),
};

// Die Tiere würfeln (Wege, Flucht im Zickzack) - fest gesät, damit jeder Lauf gleich ist.
const random = Math.random;
after(() => { Math.random = random; });
beforeEach(() => {
  let seed = 2727;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
});

/** Dorfzentrum bei 0,0, eine 3x3-Weide bei 6..8, 0..2, ein Dorfbewohner. */
function pastureWorld(world = makeWorld(World, (x) => (x < -20 ? 'water' : 'grass'))) {
  build(world, 0, 0, 'town_center');
  for (let y = 0; y <= 2; y++) for (let x = 6; x <= 8; x++) build(world, x, y, 'pasture');
  world.spawnAround('villager', 3, 4, 1);
  return { world, v: world.villagers.at(-1) };
}

const onPasture = (world, a) => world.at(Math.floor(a.x), Math.floor(a.y))?.type === 'pasture';

test('Weide: Tile für Tile wie ein Feld, zusammen eine Weide mit einem Gatter', () => {
  const world = makeWorld(World, (x, y) => (x === 4 && y === 8 ? 'water' : x === 5 && y === 8 ? 'tree' : 'grass'));
  build(world, 0, 0, 'town_center');
  const wood = world.stock.wood;
  for (let y = 0; y <= 2; y++) for (let x = 6; x <= 8; x++) build(world, x, y, 'pasture');
  assert.equal(wood - world.stock.wood, 9 * 5, 'five wood per tile');
  // Nicht auf Wasser, nicht auf einen Baum, nicht doppelt.
  assert.match(world.canPlace(4, 8, 'pasture'), /Wiese/);
  assert.match(world.canPlace(5, 8, 'pasture'), /Wiese/);
  assert.match(world.canPlace(6, 0, 'pasture'), /Wiese|steht/);
  const groups = new Set(pastureGroups(world).values());
  assert.equal(groups.size, 1);
  const [group] = groups;
  assert.equal(group.tiles.size, 9);
  // Das Gatter am Tile zur Kamera hin (größtes x + y), nach außen.
  assert.deepEqual(group.gate, { x: 8, y: 2, dx: 0, dy: 1 });
  // Ein Tile abseits ist eine zweite Weide.
  build(world, 12, 0, 'pasture');
  assert.equal(new Set(pastureGroups(world).values()).size, 2);
});

test('Fangen: er holt das Schaf, führt es durchs Gatter und hütet dann', () => {
  const { world, v } = pastureWorld();
  const sheep = world.wildlife.add('sheep', 2, 12, { female: true }, null);
  assert.equal(world.hunt(new Set([v.id]), sheep), null);
  assert.equal(v.task.kind, 'tend');
  assert.equal(v.task.step, 'catch');
  let led = false;
  let slow = 0;
  for (let t = 0; t < 120 && !sheep.tamed; t += 0.1) {
    const [x, y] = [v.x, v.y];
    world.tick(0.1);
    if (v.task.step === 'lead') {
      led = true;
      slow = Math.max(slow, Math.hypot(v.x - x, v.y - y) / 0.1);
    }
  }
  assert.ok(led, 'led on the rope');
  assert.ok(slow <= 0.8 * 0.5 + 1e-6, `leads slowly: ${slow.toFixed(2)} tiles/s`);
  assert.ok(sheep.tamed, `tamed - villager: ${world.describe(v)}`);
  assert.ok(onPasture(world, sheep), `inside: ${sheep.x.toFixed(2)},${sheep.y.toFixed(2)}`);
  assert.equal(v.task.kind, 'tend');
  assert.equal(v.task.step, 'tend');
});

test('Fangen: das ferne Reh flieht - zu Fuß holt er es nicht ein und gibt auf', () => {
  const { world, v } = pastureWorld();
  const deer = world.wildlife.add('deer', 3, 19, { female: true }, null);
  world.hunt(new Set([v.id]), deer);
  for (let t = 0; t < 60 && v.task.kind === 'tend'; t += 0.1) world.tick(0.1);
  assert.equal(v.task.kind, 'idle');
  assert.match(v.problem, /entkommt/);
  assert.equal(deer.tamed, false);
  assert.equal(deer.leash, 0);
});

test('Weidetiere bleiben im Zaun, fliehen nicht und bekommen Junge', () => {
  const { world, v } = pastureWorld();
  const cow = world.wildlife.add('cow', 7.5, 1.5, { female: true, tamed: true, breed: 10 * 60 - 5 }, null);
  const bull = world.wildlife.add('cow', 7, 1, { female: false, tamed: true }, cow.herd);
  // Ein Dorfbewohner mitten auf der Weide macht ihnen keine Angst.
  world.command(new Set([v.id]), 7, 1, { x: 7.5, y: 1 });
  run(world, 300, () => {
    for (const a of world.wildlife.animals) {
      assert.ok(onPasture(world, a), `${a.label} left the pasture: ${a.x.toFixed(2)},${a.y.toFixed(2)}`);
      assert.notEqual(a.state, 'flee');
    }
  });
  const calves = world.wildlife.animals.filter((a) => a !== cow && a !== bull);
  assert.equal(calves.length, 1, 'one calf');
  assert.ok(calves[0].tamed);
});

test('Hüten: Milch und Wolle kommen mit ihrer Sorte ins Dorfzentrum', () => {
  const { world, v } = pastureWorld();
  const tc = world.at(0, 0);
  world.wildlife.add('cow', 7.5, 1.5, { female: true, tamed: true }, null);
  world.wildlife.add('sheep', 6.5, 0.5, { female: false, tamed: true }, null);
  // Rechtsklick auf die Weide: er hütet dort.
  assert.equal(world.command(new Set([v.id]), 7, 1), null);
  assert.equal(v.task.kind, 'tend');
  // Nach dem Abliefern kommt er wieder aus dem Dorfzentrum heraus (war unsichtbar weitergelaufen).
  run(world, 400, () => assert.ok(v.task.step === 'deliver' || v.isVisible, 'visible while tending'));
  assert.ok(tc.stored('milk') >= 10, `milk ${tc.stored('milk')}`);
  assert.ok(tc.stored('wool') >= 5, `wool ${tc.stored('wool')}`);
  assert.deepEqual(Object.keys(tc.goods.milk), ['Milch']);
  assert.deepEqual(Object.keys(tc.goods.wool), ['Wolle']);
  // Der Bulle gibt keine Milch - nur Weibchen.
  const bull = world.wildlife.add('cow', 8.5, 1.5, { female: false, tamed: true }, null);
  run(world, 60);
  assert.equal(bull.produce, 0);
});

test('Schlachten nur auf Befehl: die Kuh gibt Leder und Fleisch', () => {
  const { world, v } = pastureWorld();
  const tc = world.at(0, 0);
  const cow = world.wildlife.add('cow', 7.5, 1.5, { female: true, tamed: true }, null);
  const meat = cow.food;
  const food = tc.stored('food');
  // Hüten schlachtet nicht.
  world.command(new Set([v.id]), 7, 1);
  run(world, 60);
  assert.ok(!cow.isDead);
  // Rechtsklick auf das Weidetier: schlachten - auch mit Alt (jagen gilt nur für Wild).
  world.hunt(new Set([v.id]), cow, true);
  assert.equal(v.task.step, 'slaughter');
  // Wie beim Jagen: je Ladung 10 Fleisch, also gut zwei Dutzend Gänge zum Dorfzentrum.
  for (let t = 0; t < 1500 && world.wildlife.animals.includes(cow); t += 0.1) world.tick(0.1);
  // Die letzte Ladung ist noch unterwegs.
  run(world, 30);
  assert.ok(!world.wildlife.animals.includes(cow), `carcass left: ${world.describe(v)}`);
  assert.ok(Math.abs(tc.stored('leather') - TAME.cow.leather) < 1e-6, `leather ${tc.stored('leather')}`);
  assert.deepEqual(Object.keys(tc.goods.leather), ['Leder']);
  assert.ok(Math.abs(tc.stored('food') - food - meat) < 1e-6, `meat ${tc.stored('food') - food}`);
  assert.ok(tc.goods.food.Fleisch >= meat - 1e-6);
});

test('Weidetiere jagt keiner: der Jäger nimmt danach kein Schaf von der Weide', () => {
  const { world, v } = pastureWorld();
  const penned = world.wildlife.add('sheep', 7.5, 1.5, { female: true, tamed: true }, null);
  const wild = world.wildlife.add('sheep', 3, 8, { female: true }, null);
  // Alt + Rechtsklick: jagen, auch wenn es eine Weide gibt.
  world.hunt(new Set([v.id]), wild, true);
  assert.equal(v.task.kind, 'hunt');
  for (let t = 0; t < 400 && v.task.kind === 'hunt'; t += 0.1) world.tick(0.1);
  assert.ok(wild.isDead || !world.wildlife.animals.includes(wild), 'wild sheep hunted');
  assert.equal(penned.hp, penned.definition.hp);
  assert.ok(!penned.isDead);
  assert.match(v.problem ?? '', /nichts mehr zu jagen/);
});

test('Spielstand: Weide und gezähmte Tiere bleiben, ältere Stände laden ohne', () => {
  const world = new World(terrain(() => 'grass'), 'weide');
  for (const r of ['wood', 'food']) world.addStock(r, 1000);
  pastureWorld(world);
  const cow = world.wildlife.add('cow', 7.5, 1.5, { female: true, tamed: true, produce: 3.5 }, null);
  world.wildlife.add('cow', 7, 1, { female: false, tamed: true }, cow.herd);
  world.wildlife.add('deer', 2, 12, { female: true }, null);
  world.markDirty();
  world.save();
  const loaded = new World(terrain(() => 'grass'), 'weide');
  assert.equal([...loaded.allBuildings()].filter((b) => b.type === 'pasture').length, 9);
  const cows = loaded.wildlife.animals.filter((a) => a.kind === 'cow');
  assert.deepEqual(cows.map((a) => a.tamed), [true, true]);
  assert.equal(cows[0].produce, 3.5);
  assert.equal(cows[0].herd, cows[1].herd, 'same herd');
  assert.equal(loaded.wildlife.animals.find((a) => a.kind === 'deer').tamed, false);
  // Älterer Stand: Tiere ohne `tm`, kein Vorrat an Milch, Wolle, Leder.
  storage.set('pgm.world.alt-weide', JSON.stringify({
    version: 3,
    stock: { food: 0, wood: 0, stone: 0, gold: 0, bows: 0, spears: 0 },
    buildings: [], villagers: [], harvested: {},
    animals: [{ k: 'cow', x: 3, y: 3, hp: 5, f: 250, s: 'f', h: 1 }],
  }));
  const old = new World(terrain(() => 'grass'), 'alt-weide');
  assert.equal(old.wildlife.animals[0].tamed, false);
  assert.equal(old.wildlife.animals[0].produce, 0);
  assert.equal(old.stock.milk, 0);
});
