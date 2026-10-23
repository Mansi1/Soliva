// Schuhe (B31, B37) - Vorgaben des Spielers vom 2026-10-12:
// - Zu Beginn sind alle Dorfbewohner barfuß, auch in älteren Spielständen.
// - Ein Schuster (eigene Werkstatt "Schusterei", ein Arbeiter wie die Bognerei)
//   macht Holzschuhe aus Holz und bringt sie ins Dorfzentrum (B37).
// - Barfuß geht er wie bisher (VILLAGER.speed), mit Holzschuhen 10 % schneller.
// - Wer im Dorfzentrum Ware abgibt, nimmt dabei ein Paar mit (B37). Eigens
//   hin geht dafür keiner - auch nicht untätig oder im Vorbeigehen.
// Echte Module über Vite.

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { build, loadModules, makeWorld, run, terrain } from './worldFixture.mjs';

const { modules: [{ World }, { COBBLER, SHOES, VILLAGER }, { inventoryView }], close } = await loadModules(
  '/src/world/world.ts', '/src/world/catalog.ts', '/src/game/selectionView.ts');
after(close);

// Node hat ohne Schalter kein localStorage - so läuft Speichern und Laden über den echten Weg.
const storage = new Map();
globalThis.localStorage ??= {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)),
};

/** Dorfzentrum mit `pairs` fertigen Paaren, Schusterei bei 6,0, ein Baum bei 3,6 zum Holzholen. */
function shoeWorld(pairs) {
  const world = makeWorld(World, (x, y) => (x === 3 && y === 6 ? 'tree' : 'grass'));
  const center = build(world, 0, 0, 'town_center');
  const shop = build(world, 6, 0, 'cobbler');
  if (pairs > 0) world.addStock('shoes', pairs, SHOES.wood.kind, center);
  return { world, center, shop };
}

/** Ein Dorfbewohner bei 2,6, der Holz am Baum holt und im Dorfzentrum abgibt. */
function woodcutter(world) {
  world.spawnAround('villager', 2, 6, 1);
  const v = world.villagers.at(-1);
  assert.equal(world.command(new Set([v.id]), 3, 6), null);
  return v;
}

test('Schuster: aus 3 Holz wird ein Paar Holzschuhe - er bringt es ins Dorfzentrum und zieht es dort an', () => {
  const { world, center, shop } = shoeWorld(0);
  world.spawnAround('villager', 3, 3, 1);
  const v = world.villagers[0];
  assert.equal(v.inventory.shoes, null, 'starts barefoot');
  assert.equal(world.command(new Set([v.id]), shop.x, shop.y), null);
  const wood = world.stock.wood;
  // Das erste Paar gibt er im Dorfzentrum ab und nimmt es gleich selbst mit.
  for (let t = 0; t < 120 && !v.inventory.shoes; t += 0.1) world.tick(0.1);
  assert.equal(v.inventory.shoes, 'wood', 'the cobbler wears the first pair himself');
  assert.equal(shop.stored('shoes'), 0, 'nothing stays in the workshop');
  assert.ok(wood - world.stock.wood >= COBBLER.wood, `wood spent: ${wood - world.stock.wood}`);
  // Das zweite bleibt im Dorfzentrum, mit seiner Sorte.
  for (let t = 0; t < 120 && center.stored('shoes') < 1; t += 0.1) world.tick(0.1);
  assert.equal(center.stored('shoes'), 1);
  assert.deepEqual(Object.keys(center.goods.shoes), [SHOES.wood.kind]);
  assert.equal(world.gatherers().counts.shoes, 1);
});

test('Beim Abgeben von Holz im Dorfzentrum nimmt er ein Paar mit und geht dann 10 % schneller', () => {
  const { world, center } = shoeWorld(2);
  const v = woodcutter(world);
  for (let t = 0; t < 120 && !v.inventory.shoes; t += 0.1) world.tick(0.1);
  assert.equal(v.inventory.shoes, 'wood');
  assert.equal(center.stored('shoes'), 1, 'took exactly one pair');
  assert.ok(Math.abs(v.speed - VILLAGER.speed * 1.1) < 1e-9, `speed ${v.speed}`);
  // Gleiche Strecke wie ein Barfüßiger: in derselben Zeit 10 % weiter.
  const other = shoeWorld(0).world;
  other.spawnAround('villager', v.x, v.y, 1);
  const bare = other.villagers[0];
  [bare.x, bare.y] = [v.x, v.y];
  const shod = walked(world, v);
  const barefoot = walked(other, bare);
  assert.equal(bare.inventory.shoes, null);
  assert.ok(Math.abs(shod / barefoot - 1.1) < 0.01, `shod ${shod.toFixed(3)} vs barefoot ${barefoot.toFixed(3)}`);
});

/** Wie weit er in 3 s kommt, geschickt 12 Tiles nach unten. */
function walked(world, u) {
  const [x0, y0] = [u.x, u.y];
  world.command(new Set([u.id]), Math.floor(u.x), Math.floor(u.y) + 12);
  run(world, 3);
  return Math.hypot(u.x - x0, u.y - y0);
}

test('Untätig oder im Vorbeigehen holt sich keiner Schuhe', () => {
  const { world, center } = shoeWorld(2);
  world.spawnAround('villager', 2, 2, 2);
  const [idle, passer] = world.villagers;
  // passer geht dicht am Dorfzentrum (0,0) vorbei, idle bleibt stehen.
  world.command(new Set([passer.id]), -2, 2);
  run(world, 30);
  assert.equal(passer.task.kind, 'idle');
  assert.equal(idle.inventory.shoes, null);
  assert.equal(passer.inventory.shoes, null);
  assert.equal(center.stored('shoes'), 2);
});

test('Wer schon Schuhe hat, nimmt beim Abgeben keine weiteren', () => {
  const { world, center } = shoeWorld(3);
  const v = woodcutter(world);
  v.inventory.shoes = 'wood';
  const wood = world.stock.wood;
  for (let t = 0; t < 120 && world.stock.wood <= wood; t += 0.1) world.tick(0.1);
  assert.ok(world.stock.wood > wood, 'delivered wood');
  assert.equal(center.stored('shoes'), 3);
});

test('Spielstand: Schuhe bleiben, ältere Stände laden barfuß, Paare aus der Schusterei ziehen ins Dorfzentrum', () => {
  // Eigene Welt (Seed "schuhe") - makeWorld läse sonst diesen Stand in den anderen Tests.
  const world = new World(terrain(() => 'grass'), 'schuhe');
  world.spawnAround('villager', 3, 3, 2);
  world.villagers[0].inventory.shoes = 'wood';
  world.save();
  const loaded = new World(terrain(() => 'grass'), 'schuhe');
  assert.deepEqual(loaded.villagers.map((x) => x.inventory.shoes), ['wood', null]);
  storage.set('pgm.world.alt-schuhe', JSON.stringify({
    version: 3,
    stock: { food: 0, wood: 0, stone: 0, gold: 0, bows: 0, spears: 0 },
    buildings: [],
    villagers: [{ x: 3, y: 3, c: 0, ct: null, task: { kind: 'idle' }, inv: { weapon: 'spear' } }, { x: 4, y: 3, c: 0, ct: null, task: { kind: 'idle' }, inv: { shoes: 'gold' } }],
    harvested: {},
  }));
  const old = new World(terrain(() => 'grass'), 'alt-schuhe');
  assert.deepEqual(old.villagers.map((x) => x.inventory), [{ weapon: 'spear', shoes: null }, { weapon: null, shoes: null }]);
  assert.equal(old.stock.shoes, 0);
  // Vor B37 lagen die Paare in der Schusterei - geladen liegen sie im Dorfzentrum, Sorte für Sorte.
  const shelf = new World(terrain(() => 'grass'), 'regal');
  build(shelf, 0, 0, 'town_center');
  build(shelf, 6, 0, 'cobbler');
  shelf.save();
  const saved = JSON.parse(storage.get('pgm.world.regal'));
  saved.buildings.find((b) => b.t === 'cobbler').g = { shoes: { [SHOES.wood.kind]: 2, [SHOES.leather.kind]: 1 } };
  storage.set('pgm.world.regal', JSON.stringify(saved));
  const moved = new World(terrain(() => 'grass'), 'regal');
  assert.deepEqual(moved.at(0, 0).goods.shoes, { [SHOES.wood.kind]: 2, [SHOES.leather.kind]: 1 });
  assert.equal(moved.at(6, 0).goods.shoes, undefined);
  assert.equal(moved.stock.shoes, 3);
});

test('Panel: "Hat: Speer · Holzschuhe" oder barfuß', () => {
  assert.deepEqual(inventoryView({ weapon: 'spear', shoes: 'wood' }), { inventory: 'Speer · Holzschuhe', barefoot: false });
  assert.deepEqual(inventoryView({ weapon: 'spear', shoes: null }), { inventory: 'Speer', barefoot: true });
  assert.deepEqual(inventoryView({ weapon: null, shoes: null }), { inventory: undefined, barefoot: true });
});
