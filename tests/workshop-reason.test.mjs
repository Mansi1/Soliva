// Wartet der Arbeiter einer Werkstatt, steht fest, worauf (Villager.need,
// villagers.ts) - render.ts zeigt es durchgestrichen über dem Gebäude. Ein
// wartender Arbeiter bleibt dabei beschäftigt: er zählt nicht als untätig.

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { build, loadModules, makeWorld, run } from './worldFixture.mjs';

const { modules: [{ World }], close } = await loadModules('/src/world/world.ts');
after(close);

/** Dorfzentrum (nimmt Holz an), Bognerei daneben und ein Dorfbewohner, der darin arbeitet. */
function bowyerWorld() {
  const world = makeWorld(World, () => 'grass');
  build(world, 0, 0, 'town_center');
  const shop = build(world, 5, 0, 'bowyer');
  world.spawnAround('villager', 3, 3, 1);
  const v = world.villagers[0];
  assert.equal(world.command(new Set([v.id]), shop.x, shop.y), null);
  return { world, v };
}

test('Bognerei ohne Holz im Vorrat: Grund "wood", er zählt nicht als untätig', () => {
  const { world, v } = bowyerWorld();
  world.stock.wood = 0;
  run(world, 20);
  assert.equal(v.task.kind, 'craft');
  assert.equal(v.need, 'wood');
  assert.equal(world.gatherers().idle, 0);
  // Kommt Holz, arbeitet er weiter - der Grund ist weg.
  world.stock.wood = 100;
  run(world, 1);
  assert.equal(v.need, null);
});

test('Bogen fertig, aber keine Waffenkammer: Grund "armory"', () => {
  const { world, v } = bowyerWorld();
  run(world, 60);
  assert.equal(v.task.step, 'deliver');
  assert.equal(v.carryType, 'bows');
  assert.equal(v.need, 'armory');
  assert.equal(world.gatherers().idle, 0);
});
