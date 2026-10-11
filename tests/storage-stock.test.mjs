// Vorrat je Lager (B7) und Waffenkammern, die sich eine nach der anderen
// füllen (B14) - Vorgaben des Spielers vom 2026-10-10:
// - Was abgeliefert wird, bleibt in diesem Lager, mit seiner Sorte (Baumart,
//   Frucht, Fisch, Fleisch); das Panel zeigt "Eiche 40, Weizen 120".
// - Bauen und Ausbilden zahlen aus allen Lagern zusammen.
// - Wird ein Lager abgerissen, ist sein Vorrat weg.
// - Ältere Spielstände hatten nur einen Vorrat: er kommt in ihre Lager.
// - Der Bogner bringt jeden Bogen zur nächsten Waffenkammer mit Platz.
// Echte Module über Vite (worldFixture.mjs).

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { build, loadModules, makeWorld, run, terrain } from './worldFixture.mjs';

const {
  modules: [{ World }, { selectionView }, { Selection }, { depositKind }],
  close,
} = await loadModules('/src/world/world.ts', '/src/game/selectionView.ts', '/src/game/Selection.ts', '/src/world/resources.ts');
after(close);

// Node hat ohne Schalter kein localStorage - der Spielstand (save.ts) braucht
// nur getItem/setItem; so läuft Speichern und Laden über den echten Weg.
const storage = new Map();
globalThis.localStorage ??= {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)),
};

const tree = (x, y) => (x === 0 && y === 0 ? 'tree' : 'grass');

/** Holzfäller am Baum 0,0, Holzlager daneben (3,0), Dorfzentrum weiter weg (12,0). */
function lumberWorld(seed) {
  const world = seed ? new World(terrain(tree), seed) : makeWorld(World, tree);
  world.speedy = true;
  const tc = build(world, 12, 0, 'town_center');
  const camp = build(world, 3, 0, 'lumber_camp');
  world.spawnAround('villager', 2, 2, 1);
  const v = world.villagers[0];
  assert.equal(world.command(new Set([v.id]), 0, 0), null);
  return { world, tc, camp, v };
}

const panel = (world, building) => {
  const selection = new Selection(world);
  selection.selectBuildings([building.anchor], building.anchor);
  return selectionView(world, selection, null);
};

test('Abgeliefertes bleibt im Lager, in das es kam - mit der Baumart; die Ladung kennt sie unterwegs', () => {
  const { world, tc, camp, v } = lumberWorld();
  const kind = depositKind(world.terrain, 0, 0);
  assert.ok(kind && kind !== 'Holz', `tree kind ${kind}`);
  const tcWood = tc.stored('wood');
  const total = world.stock.wood;
  let carried;
  run(world, 30, () => { carried ??= v.carrying > 0 ? world.carryKind(v) : undefined; });
  assert.equal(carried, kind, 'the load knows its kind');
  assert.ok(camp.goods.wood?.[kind] > 0, `camp holds ${JSON.stringify(camp.goods)}`);
  assert.deepEqual(Object.keys(camp.goods.wood), [kind]);
  assert.equal(tc.stored('wood'), tcWood, 'nothing went to the town center');
  assert.equal(world.stock.wood, total + camp.stored('wood'), 'total = all storehouses');
  // Das Panel nennt die Sorten mit Menge; Startvorrat ohne Sorte heißt wie der Rohstoff.
  assert.equal(panel(world, camp).goods, `${kind} ${Math.floor(camp.goods.wood[kind])}`);
  assert.match(panel(world, tc).goods, /^Nahrung 10000, Holz \d+, Stein \d+, Gold 10000$/);
});

test('Bauen zahlt aus allen Lagern zusammen - erst das Dorfzentrum, dann die übrigen nach Baujahr', () => {
  const world = makeWorld(World, () => 'grass');
  const tc = build(world, 0, 0, 'town_center');
  const camp = build(world, 5, 0, 'lumber_camp');
  world.pay({ wood: world.stock.wood });
  assert.equal(world.stock.wood, 0);
  world.addStock('wood', 20, 'Eiche', tc);
  world.addStock('wood', 15, 'Birke', camp);
  // Ein Haus kostet 30 Holz: keins der Lager hat so viel, beide zusammen schon.
  assert.equal(world.place(0, 5, 'house'), null);
  assert.equal(tc.stored('wood'), 0);
  assert.deepEqual(camp.goods.wood, { Birke: 5 });
  assert.equal(world.stock.wood, 5);
  assert.equal(world.affordable('house'), false);
});

test('Abriss: der Vorrat des Lagers ist weg, die halben Kosten kommen ins Dorfzentrum', () => {
  const world = makeWorld(World, () => 'grass');
  const tc = build(world, 0, 0, 'town_center');
  const camp = build(world, 5, 0, 'lumber_camp');
  world.addStock('wood', 40, 'Eiche', camp);
  const tcWood = tc.stored('wood');
  const total = world.stock.wood;
  world.remove(camp);
  assert.equal(world.stock.wood, total - 40 + 25);
  assert.equal(tc.stored('wood'), tcWood + 25);
});

test('Spielstand: Vorrat je Lager samt Sorten und Sorte der Ladung bleiben erhalten', () => {
  const { world, camp, v } = lumberWorld('speichern');
  const kind = depositKind(world.terrain, 0, 0);
  // Eine Ladung abgeliefert, die nächste unterwegs.
  for (let t = 0; t < 60 && !(camp.stored('wood') > 0 && v.carrying > 0); t += 0.1) world.tick(0.1);
  assert.ok(camp.stored('wood') > 0 && v.carrying > 0, 'delivered once and carries again');
  world.save();
  const loaded = new World(terrain(tree), 'speichern');
  assert.deepEqual(loaded.building(camp.anchor).goods, camp.goods);
  assert.deepEqual(Object.keys(loaded.building(camp.anchor).goods.wood), [kind]);
  assert.equal(loaded.carryKind(loaded.villagers[0]), kind);
  assert.deepEqual(loaded.stock, world.stock);
});

test('Alter Spielstand mit einem Vorrat: er kommt unbenannt ins Dorfzentrum, Bögen in die Waffenkammern', () => {
  storage.set('pgm.world.alt', JSON.stringify({
    version: 3,
    stock: { food: 77, wood: 100, stone: 3, gold: 0, bows: 150 },
    buildings: [{ t: 'armory', x: 5, y: 0 }, { t: 'town_center', x: 0, y: 0 }, { t: 'armory', x: 8, y: 0 }],
    villagers: [{ x: 3, y: 3, c: 2, ct: 'wood', task: { kind: 'idle' } }],
    harvested: {},
  }));
  const world = new World(terrain(() => 'grass'), 'alt');
  assert.deepEqual(world.building('0,0').goods, { food: { Nahrung: 77 }, wood: { Holz: 100 }, stone: { Stein: 3 } });
  assert.deepEqual(world.armoryStock(), new Map([['5,0', 100], ['8,0', 50]]));
  assert.equal(world.carryKind(world.villagers[0]), undefined);
  assert.deepEqual(world.toSave().stock, { food: 0, wood: 0, stone: 0, gold: 0, bows: 0 });
  assert.equal(panel(world, world.building('0,0')).goods, 'Nahrung 77, Holz 100, Stein 3');
});

test('Bögen ohne Lager im Spielstand überspringen eine volle Waffenkammer', () => {
  storage.set('pgm.world.voll', JSON.stringify({
    version: 3,
    stock: { food: 0, wood: 0, stone: 0, gold: 0, bows: 30 },
    buildings: [{ t: 'armory', x: 5, y: 0, g: { bows: { Bögen: 100 } } }, { t: 'armory', x: 8, y: 0 }],
    villagers: [],
    harvested: {},
  }));
  const world = new World(terrain(() => 'grass'), 'voll');
  assert.deepEqual(world.armoryStock(), new Map([['5,0', 100], ['8,0', 30]]));
});

/** Dorfzentrum, Bognerei bei 5,0, Waffenkammern bei 8,0 (näher) und 14,0, ein Bogner bei der Arbeit. */
function bowyerWorld() {
  const world = makeWorld(World, () => 'grass');
  build(world, 0, 0, 'town_center');
  const shop = build(world, 5, 0, 'bowyer');
  const near = build(world, 8, 0, 'armory');
  const far = build(world, 14, 0, 'armory');
  world.spawnAround('villager', 3, 3, 1);
  const v = world.villagers[0];
  assert.equal(world.command(new Set([v.id]), shop.x, shop.y), null);
  return { world, near, far, v };
}

test('Bogner: der Bogen kommt in die nächste Waffenkammer', () => {
  const { world, near, far } = bowyerWorld();
  run(world, 60);
  assert.ok(near.stored('bows') >= 1, `near armory: ${near.stored('bows')}`);
  assert.equal(far.stored('bows'), 0);
  assert.deepEqual(Object.keys(near.goods.bows), ['Bögen']);
});

test('Bogner: ist die nächste Waffenkammer voll, kommt der Bogen in die nächste mit Platz', () => {
  const { world, near, far, v } = bowyerWorld();
  world.addStock('bows', 100, undefined, near);
  assert.equal(near.room('bows'), 0);
  run(world, 60);
  assert.equal(near.stored('bows'), 100);
  assert.ok(far.stored('bows') >= 1, `far armory: ${far.stored('bows')}`);
  // Beide voll: er wartet mit dem Bogen.
  world.addStock('bows', far.room('bows'), undefined, far);
  run(world, 60);
  assert.equal(v.problem, 'Alle Waffenkammern sind voll - baue noch eine');
  assert.equal(v.carryType, 'bows');
  assert.equal(world.stock.bows, 200);
});
