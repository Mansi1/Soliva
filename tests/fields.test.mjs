// Felder (src/world/farming.ts, Villagers.tickFarmer): jedes Feldstück
// arbeitet für sich - eigene Phase, bis zu 3 Bauern, die dort bleiben (B1).
// Ohne Holz zum Säen wird Reifes geerntet und sonst gejätet (B2). Das Panel
// zählt nur die markierten Feldstücke (B3), der Fruchtwechsel gilt für
// angrenzende Stücke mit derselben Frucht (B4), nach 3 Ernten wird neu
// gepflügt (B5). Echte Module über Vite (worldFixture.mjs).

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { build, loadModules, makeWorld, run } from './worldFixture.mjs';

const {
  modules: [{ World }, { selectionView }, { Selection }, { buildingFromSave }, { FARMERS_PER_FIELD }],
  close,
} = await loadModules('/src/world/world.ts', '/src/game/selectionView.ts', '/src/game/Selection.ts', '/src/world/building/index.ts', '/src/world/catalog.ts');
after(close);

/** Dorfzentrum (nimmt Nahrung an) und Feldstücke nebeneinander ab (0, 5). */
function fields(count) {
  const world = makeWorld(World, () => 'grass');
  build(world, 0, 0, 'town_center');
  const farms = Array.from({ length: count }, (_, i) => build(world, i, 5, 'farm'));
  return { world, farms };
}

/** Alle Furchen des Feldstücks gepflügt, gesät und reif - mit voller (oder `food`) Nahrung. */
function ripen(world, farm, food) {
  for (const { row, f } of world.farming.furrows(farm)) Object.assign(f, { plough: 1, sown: 1, growth: 1, paid: true, food: food ?? farm.fullFood(row) });
}

/** `n` Dorfbewohner aufs Feldstück schicken. */
function farmers(world, farm, n) {
  world.spawnAround('villager', 3, 3, n);
  const ids = new Set(world.villagers.slice(-n).map((v) => v.id));
  assert.equal(world.command(ids, farm.x, farm.y), null);
  return world.villagers.filter((v) => ids.has(v.id));
}

test('B1: je Feldstück höchstens 3 Bauern, eigene Phase, sie bleiben auf ihrem Stück', () => {
  const { world, farms: [a, b] } = fields(2);
  const all = farmers(world, a, 6);
  assert.equal(world.farmers(a).length, FARMERS_PER_FIELD);
  assert.equal(world.farmers(b).length, 6 - FARMERS_PER_FIELD);
  ripen(world, a);
  assert.equal(world.farmPhase(a), 'harvest');
  assert.equal(world.farmPhase(b), 'plough');
  const home = new Map(all.map((v) => [v.id, v.task.building]));
  run(world, 40, () => {
    for (const v of all) assert.equal(v.task.building, home.get(v.id), `${v.name} bleibt auf seinem Feldstück`);
  });
  // a ist abgeerntet und neu bestellt, b gepflügt - jedes für sich.
  assert.equal(a.harvests, 1);
  assert.ok(world.farming.furrows(b).some(({ f }) => f.plough > 0));
});

test('B2: ohne Holz zum Säen wird Reifes geerntet, sonst gejätet - kein Stillstand', () => {
  const { world, farms: [a] } = fields(1);
  const [first, ...rest] = world.farming.furrows(a);
  ripen(world, a);
  for (const { f } of rest) Object.assign(f, { sown: 0, growth: 0, paid: false });
  world.pay({ wood: world.stock.wood });
  assert.equal(world.farmPhase(a), 'harvest');
  const [v] = farmers(world, a, 1);
  run(world, 30);
  assert.ok(first.f.food < a.fullFood(first.row), 'die reife Furche wird geerntet');
  // Nichts Reifes mehr: er jätet und meldet das fehlende Holz.
  first.f.food = 0;
  assert.equal(world.farmPhase(a), 'wood');
  run(world, 20);
  assert.equal(v.task.kind, 'farm');
  assert.match(v.problem ?? '', /Holz/);
  world.addStock('wood', 100);
  assert.equal(world.farmPhase(a), 'sow');
});

test('B3: das Panel zählt nur die markierten Feldstücke - eins allein, mehrere zusammen', () => {
  const { world, farms: [a, b, c] } = fields(3);
  for (const farm of [a, b, c]) ripen(world, farm, 10);
  const selection = new Selection(world);
  selection.selectBuildings([a.anchor], a.anchor);
  assert.equal(selectionView(world, selection, null).farm.food, 3 * 10);
  selection.selectBuildings([a.anchor, b.anchor], a.anchor);
  const many = selectionView(world, selection, null).farms;
  assert.equal(many.food, 2 * 3 * 10);
  assert.equal(many.rows, 6);
  assert.equal(many.maxFarmers, 2 * FARMERS_PER_FIELD);
});

test('B4: Fruchtwechsel gilt für angrenzende Feldstücke mit derselben wachsenden Frucht', () => {
  const { world, farms: [a, b, c] } = fields(3);
  world.setCrop(c, 'corn');
  assert.deepEqual(world.farmGroup(a).map((f) => f.anchor).sort(), [a.anchor, b.anchor].sort());
  assert.deepEqual(world.farmGroup(c), [c]);
});

test('B5: nach 3 Ernten wird das Feldstück neu gepflügt, vorher nur neu gesät', () => {
  const { world, farms: [a] } = fields(1);
  ripen(world, a, 0);
  assert.equal(world.farmPhase(a), 'done');
  farmers(world, a, 1);
  world.tick(0.1);
  assert.equal(a.harvests, 1);
  assert.ok(world.farming.furrows(a).every(({ f }) => f.plough === 1 && f.sown === 0));

  ripen(world, a, 0);
  a.harvests = 2;
  world.tick(0.1);
  assert.equal(a.harvests, 0);
  assert.ok(world.farming.furrows(a).every(({ f }) => f.plough === 0));
  assert.equal(world.farmPhase(a), 'plough');
});

test('B5: Ernten werden gespeichert; ältere Spielstände ohne Zähler laden mit 0', () => {
  const { farms: [a] } = fields(1);
  a.harvests = 2;
  const save = a.toSave();
  assert.equal(buildingFromSave(save, 1).harvests, 2);
  delete save.f.h;
  assert.equal(buildingFromSave(save, 1).harvests, 0);
});
