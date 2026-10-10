// Dorfbewohner laufen nie durchs Wasser (villagers.ts walk/waypoint): Gibt
// es keinen Weg, bleibt er stehen und sagt warum - früher ging er dann
// geradeaus über den Fluss. Und die Wegsuche (pathfinding.ts) reicht für
// Umwege in der Größe des Suchradius.

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { build, loadModules, makeWorld, run } from './worldFixture.mjs';

const { modules: [{ World }, { findPath }, { VILLAGER }], close } = await loadModules(
  '/src/world/world.ts', '/src/world/pathfinding.ts', '/src/world/catalog.ts');
after(close);

/** Zählt die Ticks, in denen ein Dorfbewohner auf einem Wasser-Tile steht. */
function wetTicks(world, kind, seconds) {
  let wet = 0;
  run(world, seconds, () => {
    for (const v of world.villagers) if (kind(Math.floor(v.x), Math.floor(v.y)) === 'water') wet++;
  });
  return wet;
}

// Ein Fluss ohne Ende bei x 5..7.
const river = (x) => (x >= 5 && x <= 7 ? 'water' : 'grass');

test('Gang über einen Fluss ohne Brücke: er bleibt am Ufer und sagt warum', () => {
  const world = makeWorld(World, river);
  world.spawnAround('villager', 1, 0, 1);
  const v = world.villagers[0];
  assert.equal(world.command(new Set([v.id]), 12, 0), null);
  assert.equal(wetTicks(world, river, 30), 0);
  assert.ok(v.x < 5, `stands west of the river, x=${v.x}`);
  assert.equal(v.task.kind, 'idle');
  assert.equal(v.problem, 'Dort kommt er nicht hin');
});

test('Holzfäller, das einzige Lager jenseits des Flusses: er trägt das Holz nicht durchs Wasser', () => {
  const kind = (x, y) => (x === 0 && y === 0 ? 'tree' : river(x));
  const world = makeWorld(World, kind);
  build(world, 12, 0, 'town_center');
  world.spawnAround('villager', 2, 0, 1);
  const v = world.villagers[0];
  world.command(new Set([v.id]), 0, 0);
  assert.equal(v.task.kind, 'gather');
  assert.equal(wetTicks(world, kind, 60), 0);
  assert.ok(v.carrying > 0 && v.task.delivering, 'full load, wants to deliver');
  assert.equal(v.problem, 'Dort kommt er nicht hin');
});

test('Nächstes Lager jenseits des Flusses, ein weiteres diesseits: er bringt das Holz zum erreichbaren', () => {
  const kind = (x, y) => (x === 0 && y === 0 ? 'tree' : river(x));
  const world = makeWorld(World, kind);
  build(world, 10, 0, 'town_center');
  const camp = build(world, -2, 10, 'lumber_camp');
  world.spawnAround('villager', 2, 0, 1);
  const v = world.villagers[0];
  world.command(new Set([v.id]), 0, 0);
  const wood = world.stock.wood;
  let atCamp = false;
  assert.equal(wetTicks(world, kind, 120), 0);
  run(world, 60, () => { atCamp ||= Math.hypot(v.x - camp.x - 0.5, v.y - camp.y - 0.5) < 1.5; });
  assert.ok(world.stock.wood > wood, 'delivered wood');
  assert.ok(atCamp, 'went to the lumber camp on his side');
  assert.equal(v.problem, null);
});

test('See zwischen Baum und Lager: er geht außen herum und liefert ab', () => {
  const kind = (x, y) => (x === 0 && y === 0 ? 'tree' : x >= 5 && x <= 7 && Math.abs(y) <= 10 ? 'water' : 'grass');
  const world = makeWorld(World, kind);
  build(world, 12, 0, 'town_center');
  world.spawnAround('villager', 2, 0, 1);
  const v = world.villagers[0];
  world.command(new Set([v.id]), 0, 0);
  const wood = world.stock.wood;
  assert.equal(wetTicks(world, kind, 120), 0);
  assert.ok(world.stock.wood > wood, 'delivered wood around the lake');
  assert.equal(v.problem, null);
});

test('Umweg aus einer Bucht von der Größe des Suchradius wird gefunden', () => {
  // Wasser vor ihm (x 5..7) und zu beiden Seiten (|y| = R..R+2) bis R Tiles hinter ihm.
  const R = VILLAGER.searchRadius;
  const bay = (x, y) => (x >= 5 && x <= 7 && Math.abs(y) <= R + 2) || (x >= -R && x <= 7 && Math.abs(y) >= R && Math.abs(y) <= R + 2);
  assert.ok(findPath(1.5, 0.5, 12.5, 0.5, 0.05, bay), 'maxNodes too small for a detour of searchRadius size');
});
