// Ist ein Vorkommen leer (villagers.ts, Aufgabe gather), geht der Sammler
// erst zurück an die alte Arbeitsstelle und sucht dort das nächste - auch
// nach dem Abliefern. Gibt es keins, bleibt er dort stehen, nicht am Lager.
// Früher ging er vom Lager direkt zum nächsten Baum oder blieb am Lager.

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { build, loadModules, makeWorld, run } from './worldFixture.mjs';

const { modules: [{ World }], close } = await loadModules('/src/world/world.ts');
after(close);

const near = (v, x, y) => Math.hypot(v.x - x - 0.5, v.y - y - 0.5);

/** Holzfäller am Baum 0,0, Lager bei 12,0; `trees` sind die Baum-Tiles. */
function lumberjack(trees) {
  const kind = (x, y) => (trees.some(([tx, ty]) => tx === x && ty === y) ? 'tree' : 'grass');
  const world = makeWorld(World, kind);
  // Cheat "speedy gonzales": jede Ladung sofort voll - sonst dauert ein Baum Minuten.
  world.speedy = true;
  build(world, 12, 0, 'town_center');
  world.spawnAround('villager', 2, 0, 1);
  const v = world.villagers[0];
  assert.equal(world.command(new Set([v.id]), 0, 0), null);
  assert.equal(v.task.kind, 'gather');
  return { world, v };
}

test('Baum leer, Holz abgeliefert: erst zurück zum alten Baum, dann zum nächsten', () => {
  const { world, v } = lumberjack([[0, 0], [0, -6]]);
  let switchedAt = null;
  run(world, 600, () => {
    if (!switchedAt && v.task.kind === 'gather' && v.task.y === -6) switchedAt = near(v, 0, 0);
  });
  assert.equal(world.remainingAt(0, 0).amount, 0, 'first tree is used up');
  assert.notEqual(switchedAt, null, 'went on to the next tree');
  assert.ok(switchedAt <= 1.5, `chose the next tree at the old one, ${switchedAt.toFixed(1)} tiles away`);
});

test('Baum leer, kein weiterer: nach dem Abliefern steht er am alten Baum', () => {
  const { world, v } = lumberjack([[0, 0]]);
  run(world, 600);
  assert.equal(world.remainingAt(0, 0).amount, 0, 'tree is used up');
  assert.equal(v.task.kind, 'idle');
  assert.equal(v.problem, 'Hier gibt es nichts mehr');
  assert.equal(v.carrying, 0, 'delivered everything');
  assert.ok(near(v, 0, 0) <= 1.5, `stands at the old tree, ${near(v, 0, 0).toFixed(1)} tiles away`);
});

test('Baum leer mit halber Ladung, kein weiterer: abliefern, zurück, dort stehen', () => {
  const { world, v } = lumberjack([[0, 0]]);
  // Nur noch 5 Holz: der Baum ist leer, bevor die Ladung voll ist.
  world.deposits.take(0, 0, 95, world.now);
  const wood = world.stock.wood;
  run(world, 120);
  assert.equal(world.stock.wood, wood + 5, 'delivered the half load');
  assert.equal(v.task.kind, 'idle');
  assert.ok(near(v, 0, 0) <= 1.5, `stands at the old tree, ${near(v, 0, 0).toFixed(1)} tiles away`);
});
