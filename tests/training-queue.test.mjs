// Warteschlange beim Ausbilden (World.cancelTraining, UnitProducer.cancelUnit):
// Ein Klick auf eine Einheit bricht genau sie ab - wartend oder gerade in
// Ausbildung - und ihre Kosten kommen voll zurück. Echte Module über Vite
// (worldFixture.mjs), ohne Browser.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { loadModules } from './worldFixture.mjs';

let close, World, Terrain, MapGenerator, createBuilding, VILLAGER;

before(async () => {
  let modules;
  ({ modules, close } = await loadModules('/src/world/world.ts', '/src/map.ts', '/src/noise.ts', '/src/world/building/index.ts', '/src/world/catalog.ts'));
  [{ World }, { Terrain }, { MapGenerator }, { createBuilding }, { VILLAGER }] = modules;
});

after(() => close?.());

/** Welt mit einem Dorfzentrum und drei Eingereihten: Frau, Mann, Frau. */
function queued() {
  const world = new World(new Terrain(new MapGenerator('Testseed'), 'Testseed'), 'Testseed');
  world.stock.food = 1000;
  const tc = createBuilding('town_center', 0, 0);
  for (let i = 0; i < 3; i++) assert.equal(world.train(tc), null);
  tc.queue = [{ female: true }, { female: false }, { female: true }];
  return { world, tc, food: world.stock.food };
}

test('wartende Einheit abbrechen: genau sie fällt weg, volle Kosten zurück, Fortschritt der vordersten bleibt', () => {
  const { world, tc, food } = queued();
  tc.train(2);
  assert.equal(world.cancelTraining(tc, 1), null);
  assert.deepEqual(tc.queue, [{ female: true }, { female: true }]);
  assert.equal(world.stock.food, food + VILLAGER.cost.food);
  assert.equal(tc.trainingSeconds, 2);
});

test('Einheit in Ausbildung abbrechen: die nächste rückt vor und beginnt bei 0 %, volle Kosten zurück', () => {
  const { world, tc, food } = queued();
  tc.train(4);
  assert.equal(world.cancelTraining(tc, 0), null);
  assert.deepEqual(tc.queue, [{ female: false }, { female: true }]);
  assert.equal(tc.trainingProgress(), 0);
  assert.equal(world.stock.food, food + VILLAGER.cost.food);
});

test('Platz, den es nicht (mehr) gibt: nichts ändert sich, nichts wird erstattet', () => {
  const { world, tc, food } = queued();
  assert.ok(world.cancelTraining(tc, 3));
  assert.ok(world.cancelTraining(tc, -1));
  assert.equal(tc.queuedUnits, 3);
  assert.equal(world.stock.food, food);
});
