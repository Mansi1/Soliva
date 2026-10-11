// Schuhe (B31) - Vorgaben des Spielers vom 2026-10-12:
// - Zu Beginn sind alle Dorfbewohner barfuß, auch in älteren Spielständen.
// - Ein Schuster (eigene Werkstatt "Schusterei", ein Arbeiter wie die Bognerei)
//   macht Holzschuhe aus Holz.
// - Barfuß geht er wie bisher (VILLAGER.speed), mit Holzschuhen 10 % schneller.
// - Barfüßige holen sich ihre Schuhe selbst beim Schuster: wenn sie untätig
//   sind oder die Schusterei auf ihrem Weg liegt.
// Gewählt (B31): die fertigen Paare bleiben in der Schusterei; "auf dem Weg"
// heißt näher als COBBLER.detour Tiles an ihr vorbei. Echte Module über Vite.

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

/** Dorfzentrum und Schusterei mit `pairs` fertigen Paaren. */
function shopWorld(pairs) {
  const world = makeWorld(World, () => 'grass');
  build(world, 0, 0, 'town_center');
  const shop = build(world, 6, 0, 'cobbler');
  if (pairs > 0) world.addStock('shoes', pairs, SHOES.wood.kind, shop);
  return { world, shop };
}

test('Schuster: aus 3 Holz wird ein Paar Holzschuhe in der Schusterei', () => {
  const { world, shop } = shopWorld(0);
  world.spawnAround('villager', 3, 3, 1);
  const v = world.villagers[0];
  assert.equal(v.inventory.shoes, null, 'starts barefoot');
  assert.equal(world.command(new Set([v.id]), shop.x, shop.y), null);
  const wood = world.stock.wood;
  for (let t = 0; t < 120 && shop.stored('shoes') < 1; t += 0.1) world.tick(0.1);
  assert.equal(shop.stored('shoes'), 1);
  assert.deepEqual(Object.keys(shop.goods.shoes), [SHOES.wood.kind]);
  const spent = wood - world.stock.wood;
  assert.ok(spent === COBBLER.wood || spent === 2 * COBBLER.wood, `wood spent: ${spent}`);
  // Auf dem nächsten Gang zum Holz kommt er an seiner Schusterei vorbei und zieht das Paar selbst an.
  for (let t = 0; t < 40 && !v.inventory.shoes; t += 0.1) world.tick(0.1);
  assert.equal(v.inventory.shoes, 'wood', 'the cobbler wears a pair himself');
  assert.equal(world.gatherers().counts.shoes, 1);
});

test('Barfuß und untätig: er holt sich ein Paar und geht dann 10 % schneller', () => {
  const { world, shop } = shopWorld(2);
  world.spawnAround('villager', 2, 6, 1);
  const v = world.villagers[0];
  // Untätig: zur Schusterei, genau ein Paar.
  for (let t = 0; t < 30 && !v.inventory.shoes; t += 0.1) world.tick(0.1);
  assert.equal(v.inventory.shoes, 'wood');
  run(world, 3);
  assert.equal(shop.stored('shoes'), 1, 'took exactly one pair');
  // Gleiche Strecke wie ein Barfüßiger (ohne Schusterei): in derselben Zeit 10 % weiter.
  assert.ok(Math.abs(v.speed - VILLAGER.speed * 1.1) < 1e-9, `speed ${v.speed}`);
  const other = shopWorld(0).world;
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

test('Wer schon Schuhe hat, nimmt keine weiteren', () => {
  const { world, shop } = shopWorld(3);
  world.spawnAround('villager', 2, 6, 1);
  const v = world.villagers[0];
  v.inventory.shoes = 'wood';
  // Untätig und auch im Vorbeigehen.
  run(world, 10);
  world.command(new Set([v.id]), 8, 4);
  run(world, 15);
  assert.equal(shop.stored('shoes'), 3);
});

test('Auf dem Weg: nah an der Schusterei vorbei macht er den Umweg, weiter weg nicht', () => {
  const { world, shop } = shopWorld(2);
  world.spawnAround('villager', 2, 2, 2);
  const [near, far] = world.villagers;
  far.x = 2.5;
  far.y = 14.5;
  // near geht dicht an der Schusterei (6,0) vorbei nach (12, 2), far weit unten nach (12, 14).
  world.command(new Set([near.id]), 12, 2);
  world.command(new Set([far.id]), 12, 14);
  // Bis far angekommen ist: er ist nicht abgebogen.
  for (let t = 0; t < 30 && far.task.kind !== 'idle'; t += 0.1) world.tick(0.1);
  assert.equal(far.inventory.shoes, null);
  assert.ok(Math.hypot(far.x - 12.5, far.y - 14.5) < 0.5, `far at ${far.x.toFixed(2)},${far.y.toFixed(2)}`);
  run(world, 5);
  assert.equal(near.inventory.shoes, 'wood', world.describe(near));
  assert.equal(near.task.kind, 'idle');
  assert.ok(Math.hypot(near.x - 12.5, near.y - 2.5) < 0.5, 'and still arrives where he was sent');
  assert.equal(shop.stored('shoes'), 1);
  // Untätig holt sich far das letzte Paar.
  run(world, 30);
  assert.equal(far.inventory.shoes, 'wood');
  assert.equal(shop.stored('shoes'), 0);
});

test('Spielstand: Schuhe bleiben, ältere Stände laden barfuß', () => {
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
});

test('Panel: "Hat: Speer · Holzschuhe" oder barfuß', () => {
  assert.deepEqual(inventoryView({ weapon: 'spear', shoes: 'wood' }), { inventory: 'Speer · Holzschuhe', barefoot: false });
  assert.deepEqual(inventoryView({ weapon: 'spear', shoes: null }), { inventory: 'Speer', barefoot: true });
  assert.deepEqual(inventoryView({ weapon: null, shoes: null }), { inventory: undefined, barefoot: true });
});
