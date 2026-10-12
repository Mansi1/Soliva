// Mauern (B34) - Vorgaben des Spielers vom 2026-10-12:
// - Mauern werden als Linie gelegt: Klick, ziehen, loslassen.
// - Erst aus Holz (Palisade, immer), Steinmauern nach der Forschung im Dorfzentrum.
// - Tore öffnen sich für eigene Dorfbewohner, Tiere kommen nicht durch;
//   abgeschlossen ist das Tor für alle zu.
// Entschieden hier (walls.ts): je Tile ein Stück, die Linie geht nur
// waagerecht/senkrecht weiter; jedes Stück ist eine Baustelle (B26).
// Echte Module über Vite (worldFixture.mjs).

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readModel } from '../tools/models/glb.mjs';
import { build, loadModules, makeWorld, run, terrain } from './worldFixture.mjs';

const { modules: [{ World }, { WALL_LOOK, wallLine }, { BUILD_TIME }], close } = await loadModules(
  '/src/world/world.ts', '/src/world/walls.ts', '/src/world/construction.ts');
after(close);

// Node hat ohne Schalter kein localStorage - so läuft Speichern und Laden über den echten Weg.
const storage = new Map();
globalThis.localStorage ??= {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)),
};

const ids = (list) => new Set(list.map((v) => v.id));

/** Wiese mit Dorfzentrum bei 0,0 - `world` auch eine eigene (Speichern). */
function wallWorld(world = makeWorld(World, () => 'grass')) {
  build(world, 0, 0, 'town_center');
  return world;
}

/** Steckt die Linie ab, meldet einen Grund als Fehler und baut alle Stücke fertig. */
function wall(world, type, x0, y0, x1, y1) {
  const { placed, reason } = world.placeWall(type, x0, y0, x1, y1);
  assert.equal(reason, null, `${type} ${x0},${y0} -> ${x1},${y1}`);
  for (const { x, y } of wallLine(x0, y0, x1, y1)) {
    const piece = world.at(x, y);
    if (!piece.built) world.finishConstruction(piece);
  }
  return placed;
}

/** Ein Ring aus Palisade um das Quadrat 10..16 x 10..16 (innen 11..15). */
function ring(world) {
  wall(world, 'palisade', 10, 10, 16, 10);
  wall(world, 'palisade', 16, 11, 16, 16);
  wall(world, 'palisade', 15, 16, 10, 16);
  wall(world, 'palisade', 10, 15, 10, 11);
}

/** Breite eines Modells in Metern (x in der Datei - daran bringt das Spiel es auf seine Größe). */
function widthOf(model) {
  const xs = [...readModel(model).obj.matchAll(/^v (\S+)/gm)].map((m) => Number(m[1]));
  return Math.max(...xs) - Math.min(...xs);
}

test('Die Modelle haben die Maße, mit denen walls.ts sie zusammensetzt', () => {
  const near = (model, meters) => assert.ok(Math.abs(widthOf(model) - meters) < 0.01, `${model}: ${widthOf(model).toFixed(3)} m, expected ${meters}`);
  for (const m of ['props/wall_palisade', 'props/wall_stone']) near(m, 2.5);
  for (const m of ['props/wall_gate', 'props/wall_gate_open', 'props/wall_gate_locked']) near(m, 5);
  near('props/wall_palisade_post', WALL_LOOK.palisade.postMeters);
  near('props/wall_stone_post', WALL_LOOK.stone_wall.postMeters);
});

test('Linie: je Tile ein Stück, schräg als Treppe ohne Eckberührung', () => {
  assert.deepEqual(wallLine(2, 3, 6, 3), [[2, 3], [3, 3], [4, 3], [5, 3], [6, 3]].map(([x, y]) => ({ x, y })));
  assert.deepEqual(wallLine(4, 7, 4, 5).map((t) => t.y), [7, 6, 5]);
  for (const [x1, y1] of [[5, 3], [-4, 7], [3, -3], [1, 6]]) {
    const line = wallLine(0, 0, x1, y1);
    assert.equal(line.length, Math.abs(x1) + Math.abs(y1) + 1);
    assert.deepEqual(line.at(-1), { x: x1, y: y1 });
    for (let i = 1; i < line.length; i++) {
      const step = Math.abs(line[i].x - line[i - 1].x) + Math.abs(line[i].y - line[i - 1].y);
      assert.equal(step, 1, `${x1},${y1}: tiles ${i - 1}..${i} share an edge`);
    }
  }
});

test('Ziehen steckt je Tile ein Stück ab und zahlt je Stück; was schon steht, bleibt', () => {
  const world = wallWorld();
  const wood = world.stock.wood;
  const { placed, reason } = world.placeWall('palisade', 5, 4, 9, 4);
  assert.equal(reason, null);
  assert.equal(placed, 5);
  assert.equal(wood - world.stock.wood, 5 * 3, 'three wood per piece');
  for (let x = 5; x <= 9; x++) {
    const piece = world.at(x, 4);
    assert.equal(piece.type, 'palisade');
    assert.equal(piece.built, false, 'a construction site (B26)');
  }
  assert.equal(BUILD_TIME.palisade, 5);
  assert.equal(BUILD_TIME.stone_wall, 10);
  // Über die bestehende Mauer weiter gezogen: nur die neuen Stücke kosten.
  const before = world.stock.wood;
  assert.equal(world.placeWall('palisade', 7, 4, 7, 6).placed, 2);
  assert.equal(before - world.stock.wood, 2 * 3);
  // Ein Haus im Weg: dort eine Lücke, der Rest wird gebaut.
  build(world, 12, 8, 'house');
  const gap = world.placeWall('palisade', 11, 8, 13, 8);
  assert.equal(gap.placed, 2);
  assert.match(gap.reason, /steht schon/);
  // Reicht das Holz nicht, hört die Linie auf.
  world.pay({ wood: world.stock.wood - 7 });
  const short = world.placeWall('palisade', 5, 20, 9, 20);
  assert.equal(short.placed, 2);
  assert.match(short.reason, /Zu wenig/);
});

test('Steinmauer erst nach der Forschung im Dorfzentrum', () => {
  const world = wallWorld();
  assert.match(world.buildLock('stone_wall'), /Steinmauer erforschen/);
  assert.equal(world.buildLock('palisade'), null);
  const refused = world.placeWall('stone_wall', 5, 4, 7, 4);
  assert.equal(refused.placed, 0);
  assert.match(refused.reason, /erforschen/);
  world.research.done.add('stone_walls');
  const stone = world.stock.stone;
  assert.equal(world.placeWall('stone_wall', 5, 4, 7, 4).placed, 3);
  assert.equal(stone - world.stock.stone, 3 * 8, 'eight stone per piece');
});

test('Mauern sperren Dorfbewohner und Tiere; das Tor lässt Dorfbewohner durch, keine Tiere; abgeschlossen niemanden', () => {
  const world = wallWorld();
  ring(world);
  world.spawnAround('villager', 13, 13, 1);
  const v = world.villagers.at(-1);
  const outside = { x: 13, y: 22 };
  // Ohne Tor: kein Weg hinaus.
  assert.equal(world.route(v.x, v.y, outside.x + 0.5, outside.y + 0.5).length, 1, 'no route through the wall');
  assert.equal(world.animalBlocked(13, 16), true);

  const gate = world.at(13, 16);
  assert.equal(world.setGate(gate, true), null);
  assert.equal(gate.label, 'Tor (Palisade)');
  assert.equal(world.animalBlocked(13, 16), true, 'animals never pass a gate');
  world.command(ids([v]), outside.x, outside.y);
  let through = false;
  run(world, 20, () => { through ||= Math.floor(v.x) === 13 && Math.floor(v.y) === 16; });
  assert.ok(through, 'walked through the gate tile');
  assert.ok(v.y > 17, `outside the ring (y ${v.y.toFixed(2)})`);

  // Abgeschlossen: auch er kommt nicht mehr hinein.
  assert.equal(world.setLocked(gate, true), null);
  assert.equal(world.route(v.x, v.y, 13.5, 13.5).length, 1, 'no route through a locked gate');
  world.command(ids([v]), 13, 13);
  run(world, 10);
  assert.ok(v.y > 16.5, 'stays outside');

  // Kühe im Ring bleiben drin, auch neben dem offenen Tor.
  world.setLocked(gate, false);
  const before = world.wildlife.animals.length;
  assert.equal(world.spawnAround('cow', 13, 15, 3), 3);
  const cows = world.wildlife.animals.slice(before);
  run(world, 60, () => {
    for (const c of cows) assert.ok(c.x > 11 && c.x < 16 && c.y > 11 && c.y < 16, `cow inside (${c.x.toFixed(2)}, ${c.y.toFixed(2)})`);
  });
});

test('An einer Mauer verteilen sich die Bauenden auf die Stücke und bauen sie nacheinander', () => {
  const world = wallWorld();
  world.placeWall('palisade', 6, 8, 10, 8);
  world.spawnAround('villager', 8, 10, 4);
  const crew = world.villagers.slice(-4);
  assert.equal(world.command(ids(crew), 8, 8), null, 'nobody refused');
  const sites = new Set(crew.map((v) => v.task.building));
  assert.ok(sites.size >= 2, `spread over ${sites.size} pieces`);
  run(world, 40);
  for (let x = 6; x <= 10; x++) assert.ok(world.at(x, 8).built, `piece ${x} built`);
});

test('Speichern und Laden behält Stücke, Tor und Schloss; ältere Stände ohne Tor', () => {
  const world = wallWorld(new World(terrain(() => 'grass'), 'mauer'));
  for (const r of ['wood', 'stone']) world.addStock(r, 1000);
  world.research.done.add('stone_walls');
  wall(world, 'palisade', 4, 6, 8, 6);
  wall(world, 'stone_wall', 4, 9, 6, 9);
  world.setGate(world.at(6, 6), true);
  world.setGate(world.at(5, 9), true);
  world.setLocked(world.at(5, 9), true);
  const site = world.placeWall('palisade', 4, 12, 4, 12);
  assert.equal(site.placed, 1);
  world.save();

  const loaded = new World(terrain(() => 'grass'), 'mauer');
  const at = (x, y) => loaded.at(x, y);
  for (let x = 4; x <= 8; x++) assert.equal(at(x, 6).type, 'palisade');
  assert.equal(at(6, 6).gate, true);
  assert.equal(at(6, 6).locked, false);
  assert.equal(at(5, 6).gate, false);
  assert.equal(at(5, 9).type, 'stone_wall');
  assert.equal(at(5, 9).locked, true);
  assert.equal(at(4, 12).built, false, 'site stays a site');

  // Ein Stand aus der Zeit vor den Toren (ohne gt/lk): Mauer.
  const raw = JSON.parse(storage.get('pgm.world.mauer'));
  for (const b of raw.buildings) {
    delete b.gt;
    delete b.lk;
  }
  storage.set('pgm.world.mauer-alt', JSON.stringify(raw));
  const old = new World(terrain(() => 'grass'), 'mauer-alt');
  assert.equal(old.at(6, 6).gate, false);
  assert.equal(old.at(5, 9).locked, false);
});
