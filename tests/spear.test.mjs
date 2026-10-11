// Speere (B25) - Vorgaben des Spielers vom 2026-10-11:
// - Eigene Werkstatt "Speermacherei" wie die Bognerei; ein Speer kostet 5 Holz
//   und kommt in die Waffenkammer.
// - Der Jäger holt sich vor der Jagd einen Speer aus einer Waffenkammer. Der
//   Speer gehört ihm: er bricht nicht, geht nie zurück und bleibt bei ihm,
//   auch bei einem anderen Auftrag. Im Spielstand steht, was er hat.
// - Ohne Speer jagt er mit bloßen Händen: er muss ganz ans Tier heran und
//   gibt bei Tieren auf, die er nicht einholen kann.
// Echte Module über Vite (worldFixture.mjs).

import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { build, loadModules, makeWorld, run, terrain } from './worldFixture.mjs';

const { modules: [{ World }, { HUNT, SPEAR_MAKER }], close } = await loadModules('/src/world/world.ts', '/src/world/catalog.ts');
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
  let seed = 4242;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
});

test('Speermacherei: aus 5 Holz wird ein Speer in der Waffenkammer', () => {
  const world = makeWorld(World, () => 'grass');
  build(world, 0, 0, 'town_center');
  const shop = build(world, 5, 0, 'spear_maker');
  const armory = build(world, 8, 0, 'armory');
  world.spawnAround('villager', 3, 3, 1);
  const v = world.villagers[0];
  assert.equal(world.command(new Set([v.id]), shop.x, shop.y), null);
  const wood = world.stock.wood;
  for (let t = 0; t < 120 && armory.stored('spears') < 1; t += 0.1) world.tick(0.1);
  assert.equal(armory.stored('spears'), 1);
  assert.deepEqual(Object.keys(armory.goods.spears), ['Speere']);
  // Holz für den gelieferten Speer und vielleicht schon den nächsten.
  const spent = wood - world.stock.wood;
  assert.ok(spent === SPEAR_MAKER.wood || spent === 2 * SPEAR_MAKER.wood, `wood spent: ${spent}`);
  assert.equal(world.gatherers().counts.spears, 1);
});

test('Bögen und Speere teilen sich den Platz der Waffenkammer', () => {
  const world = makeWorld(World, () => 'grass');
  build(world, 0, 0, 'town_center');
  const armory = build(world, 8, 0, 'armory');
  world.addStock('bows', 60, undefined, armory);
  world.addStock('spears', 40, undefined, armory);
  assert.equal(armory.room('spears'), 0);
  assert.equal(armory.room('bows'), 0);
  assert.equal(world.armoryStock().get(armory.anchor), 100);
});

/** Dorfzentrum, Waffenkammer mit `spears` Speeren, ein Dorfbewohner, ein Schaf weiter weg. */
function huntWorld(spears) {
  const world = makeWorld(World, () => 'grass');
  build(world, 0, 0, 'town_center');
  const armory = build(world, 6, 0, 'armory');
  if (spears > 0) world.addStock('spears', spears, undefined, armory);
  world.spawnAround('villager', 3, 3, 1);
  const v = world.villagers[0];
  const sheep = world.wildlife.add('sheep', 3, 12, { female: true });
  return { world, armory, v, sheep };
}

test('Jäger holt einen Speer vor der Jagd und behält ihn beim nächsten Auftrag', () => {
  const { world, armory, v, sheep } = huntWorld(3);
  world.hunt(new Set([v.id]), sheep);
  // Zuerst zur Waffenkammer, nicht zum Schaf.
  for (let t = 0; t < 30 && !v.inventory.weapon; t += 0.1) {
    world.tick(0.1);
    assert.equal(sheep.hp, sheep.definition.hp, 'no throw before he has a spear');
  }
  assert.equal(v.inventory.weapon, 'spear');
  assert.equal(armory.stored('spears'), 2, 'took exactly one');
  run(world, 20);
  assert.ok(sheep.hp < sheep.definition.hp, 'hunts with the spear');
  // Anderer Auftrag: der Speer bleibt bei ihm und geht nicht zurück.
  world.command(new Set([v.id]), 1, 6);
  run(world, 20);
  assert.equal(v.inventory.weapon, 'spear');
  assert.equal(armory.stored('spears'), 2);
  // Wieder jagen: er hat schon einen und nimmt keinen weiteren.
  const goat = world.wildlife.add('goat', 2, 14, { female: true });
  world.hunt(new Set([v.id]), goat);
  run(world, 20);
  assert.equal(armory.stored('spears'), 2);
});

test('Spielstand: die Habe bleibt, ältere Stände laden ohne', () => {
  // Eigene Welt (Seed "habe") - makeWorld läse sonst diesen Stand in den anderen Tests.
  const world = new World(terrain(() => 'grass'), 'habe');
  world.spawnAround('villager', 3, 3, 1);
  world.villagers[0].inventory.weapon = 'spear';
  world.save();
  const loaded = new World(terrain(() => 'grass'), 'habe');
  assert.deepEqual(loaded.villagers.map((x) => x.inventory), [{ weapon: 'spear', shoes: null }]);
  storage.set('pgm.world.alt-habe', JSON.stringify({
    version: 3,
    stock: { food: 0, wood: 0, stone: 0, gold: 0, bows: 0 },
    buildings: [],
    villagers: [{ x: 3, y: 3, c: 0, ct: null, task: { kind: 'hunt', animal: 99, delivering: false, cooldown: 0 } }, { x: 4, y: 3, c: 0, ct: null, task: { kind: 'idle' }, inv: { weapon: 'keule' } }],
    harvested: {},
  }));
  const old = new World(terrain(() => 'grass'), 'alt-habe');
  assert.deepEqual(old.villagers.map((x) => x.inventory), [{ weapon: null, shoes: null }, { weapon: null, shoes: null }]);
  assert.equal(old.stock.spears, 0);
});

test('Ohne Speer: er muss ans Tier heran und erlegt das Schaf', () => {
  const { world, v, sheep } = huntWorld(0);
  world.hunt(new Set([v.id]), sheep);
  let hp = sheep.hp;
  let hits = 0;
  for (let t = 0; t < 90 && !sheep.isDead; t += 0.1) {
    world.tick(0.1);
    if (sheep.hp < hp) {
      hits++;
      const d = Math.hypot(sheep.x - v.x, sheep.y - v.y);
      assert.ok(d <= HUNT.reach + 0.05, `hit from ${d.toFixed(2)} tiles`);
      hp = sheep.hp;
    }
  }
  assert.ok(sheep.isDead, `sheep hp ${sheep.hp}, villager: ${world.describe(v)}`);
  assert.equal(hits, sheep.definition.hp);
  assert.equal(v.inventory.weapon, null);
});

test('Ohne Speer: den schnellen Hasen gibt er auf, statt ewig hinterherzulaufen', () => {
  const { world, v } = huntWorld(0);
  const hare = world.wildlife.add('hare', 3, 9, { female: true });
  world.hunt(new Set([v.id]), hare);
  for (let t = 0; t < HUNT.chaseLimit + 5 && v.task.kind === 'hunt'; t += 0.1) world.tick(0.1);
  assert.equal(v.task.kind, 'idle');
  assert.match(v.problem, /Ohne Speer zu langsam/);
  assert.equal(hare.hp, hare.definition.hp);
});
