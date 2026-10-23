// Baustellen (B26) - Vorgaben des Spielers vom 2026-10-12:
// - Jedes Gebäude bauen Dorfbewohner; beim Setzen steht eine Baustelle, bezahlt wird sofort.
// - Von selbst geht keiner hin: man schickt sie mit Rechtsklick (World.command).
// - Mit einem Bauenden: Haus 30 s, Werkstatt/Lager 45 s, Waffenkammer 60 s,
//   Dorfzentrum 120 s; jeder weitere macht es schneller, höchstens vier, mit
//   abnehmendem Gewinn.
// - Abriss einer Baustelle erstattet alles.
// - Danach: am Lager sammeln sie, eine Werkstatt übernimmt einer, am Haus
//   bleiben sie stehen - oder bauen an der nächsten Baustelle in der Nähe.
// - Alte Spielstände laden fertig.
// Echte Module über Vite (worldFixture.mjs).

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { build, loadModules, makeWorld, run, stake, terrain } from './worldFixture.mjs';

const { modules: [{ World }, { BUILD_TIME, BUILDER_SPEED, MAX_BUILDERS, builderSpot }, { writeSave }], close } = await loadModules(
  '/src/world/world.ts', '/src/world/construction.ts', '/src/world/save.ts');
after(close);

// Node hat ohne Schalter kein localStorage - so läuft Speichern und Laden über den echten Weg.
const storage = new Map();
globalThis.localStorage ??= {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)),
};

const ids = (list) => new Set(list.map((v) => v.id));

/** Wiese mit Dorfzentrum bei 0,0; `trees(x, y)`: dort Wald. */
function siteWorld(trees = () => false) {
  const world = makeWorld(World, (x, y) => (trees(x, y) ? 'tree' : 'grass'));
  const tc = build(world, 0, 0, 'town_center');
  return { world, tc };
}

/** `count` Dorfbewohner direkt neben dem Platz `slot` der Baustelle. */
function villagersAt(world, site, count, slot = 0) {
  const spot = builderSpot(site, slot);
  const before = world.villagers.length;
  world.spawnAround('villager', Math.floor(spot.x), Math.floor(spot.y), count);
  return world.villagers.slice(before);
}

/** Lässt die Welt laufen, bis die Baustelle fertig ist - gibt die Sekunden zurück. */
function timeToFinish(world, site, limit = 300) {
  let t = 0;
  while (!site.built && t < limit) {
    world.tick(0.1);
    t += 0.1;
  }
  assert.ok(site.built, `${site.type} finished within ${limit} s`);
  return t;
}

test('Setzen zahlt sofort und steckt eine Baustelle ab - sie lagert, wohnt und bildet nicht', () => {
  const { world, tc } = siteWorld();
  const wood = world.stock.wood;
  const cap = world.population().cap;
  const house = stake(world, 6, 0, 'house');
  assert.equal(world.stock.wood, wood - 30, 'paid on placement');
  assert.equal(house.built, false);
  assert.equal(house.progress, 0);
  assert.equal(world.population().cap, cap, 'a house site gives no housing');

  const camp = stake(world, 6, 4, 'lumber_camp');
  assert.equal(camp.stores('wood'), false, 'a storehouse site takes nothing');
  const tcWood = tc.stored('wood');
  world.addStock('wood', 10, 'Eiche', camp);
  assert.equal(camp.stored('wood'), 0);
  assert.equal(tc.stored('wood'), tcWood + 10, 'goes to the next real storehouse');

  // Werkstatt: wer hingeschickt wird, baut - er arbeitet nicht darin.
  const bowyer = stake(world, 6, -4, 'bowyer');
  const [v] = villagersAt(world, bowyer, 1);
  assert.equal(world.command(ids([v]), bowyer.x, bowyer.y), null);
  assert.equal(v.task.kind, 'build');
  assert.equal(world.describe(v), 'geht zur Baustelle (Bognerei)');

  // Ein zweites Dorfzentrum ist eine Baustelle und bildet nicht aus; das erste stand sofort.
  assert.equal(tc.built, true);
  const tc2 = stake(world, -8, 0, 'town_center');
  assert.equal(tc2.built, false);
  assert.equal(tc2.isUnitProducer(), false);
  assert.match(world.train(tc2), /nicht fertig/);
  // ... und forscht auch nicht (Forschung im Dorfzentrum, PR #68).
  assert.match(world.startResearch(tc2, 'leather_shoes'), /noch im Bau/);

  // Felder stehen sofort (wie bisher).
  assert.equal(stake(world, 0, 6, 'farm').built, true);
});

test('Ein Bauender baut ein Haus in 30 s, die Bauzeiten der Arten', () => {
  assert.deepEqual(
    [BUILD_TIME.house, BUILD_TIME.lumber_camp, BUILD_TIME.bowyer, BUILD_TIME.armory, BUILD_TIME.town_center, BUILD_TIME.farm],
    [30, 45, 45, 60, 120, 0]);
  const { world } = siteWorld();
  const cap = world.population().cap;
  const house = stake(world, 6, 0, 'house');
  const [v] = villagersAt(world, house, 1);
  world.command(ids([v]), house.x, house.y);
  const t = timeToFinish(world, house);
  // Hingehen (unter einem Tile) und ein Tick zum Ankommen kommen dazu; Übung
  // macht ihn in den 30 s um bis zu 2,5 % schneller (skills.ts).
  assert.ok(t > 29 && t < 31.5, `house in ${t.toFixed(1)} s`);
  assert.equal(world.population().cap, cap + 5, 'now it gives housing');
  assert.ok(v.skills.building > 25, 'building is practised');
});

test('Zwei bis vier bauen schneller, jeder weitere bringt weniger - ein fünfter wird abgewiesen', () => {
  // Tempo, sobald alle am Platz sind: Fortschritt je Sekunde mal Bauzeit.
  const rates = [];
  for (let n = 1; n <= MAX_BUILDERS; n++) {
    const { world } = siteWorld();
    const house = stake(world, 6, 0, 'house');
    const crew = [];
    for (let slot = 0; slot < n; slot++) crew.push(...villagersAt(world, house, 1, slot));
    world.command(ids(crew), house.x, house.y);
    for (let i = 0; i < 100 && crew.some((v) => v.task.step !== 'work'); i++) world.tick(0.1);
    world.tick(0.1);
    const before = house.progress;
    run(world, 1);
    rates.push((house.progress - before) * BUILD_TIME.house);
  }
  const sums = [1, 1.7, 2.2, 2.55];
  assert.deepEqual([...BUILDER_SPEED], [1, 0.7, 0.5, 0.35]);
  rates.forEach((rate, i) => assert.ok(Math.abs(rate / rates[0] - sums[i]) < 0.03, `${i + 1} builders: ${(rate / rates[0]).toFixed(2)}x`));
  for (let i = 2; i < rates.length; i++) assert.ok(rates[i] - rates[i - 1] < rates[i - 1] - rates[i - 2], 'diminishing returns');

  const { world } = siteWorld();
  const house = stake(world, 6, 0, 'house');
  const five = villagersAt(world, house, 5);
  assert.match(world.command(ids(five), house.x, house.y), /höchstens 4/);
  const building = five.filter((v) => v.task.kind === 'build');
  assert.equal(building.length, MAX_BUILDERS);
  assert.deepEqual(building.map((v) => v.task.slot).sort(), [0, 1, 2, 3]);
  assert.equal(five.find((v) => v.task.kind !== 'build').problem, 'An der Baustelle ist kein Platz mehr');
  // Zu viert in gut einem Drittel der Zeit (30 / 2,55 ≈ 11,8 s, dazu die Wege).
  assert.ok(timeToFinish(world, house) < 15);
});

test('Abriss einer Baustelle erstattet alles, auch halb gebaut', () => {
  const { world } = siteWorld();
  const wood = world.stock.wood;
  const house = stake(world, 6, 0, 'house');
  const [v] = villagersAt(world, house, 1);
  world.command(ids([v]), house.x, house.y);
  run(world, 10);
  assert.ok(house.progress > 0.2 && !house.built);
  world.remove(house);
  assert.equal(world.stock.wood, wood);
  assert.equal(v.task.kind, 'idle', 'the builder stops');
});

test('Danach: am Holzlager sammeln sie Holz, eine Werkstatt übernimmt einer, am Haus bleiben sie stehen', () => {
  // Wald ab x = 10.
  const { world } = siteWorld((x) => x >= 10);
  const camp = stake(world, 7, 0, 'lumber_camp');
  const crew = villagersAt(world, camp, 2);
  world.command(ids(crew), camp.x, camp.y);
  timeToFinish(world, camp);
  for (const v of crew) assert.deepEqual([v.task.kind, v.task.type], ['gather', 'wood']);

  const bowyer = stake(world, 3, 6, 'bowyer');
  const makers = villagersAt(world, bowyer, 2);
  world.command(ids(makers), bowyer.x, bowyer.y);
  timeToFinish(world, bowyer);
  assert.deepEqual(makers.map((v) => v.task.kind).sort(), ['craft', 'idle']);

  const house = stake(world, -4, 6, 'house');
  const [builder] = villagersAt(world, house, 1);
  world.command(ids([builder]), house.x, house.y);
  timeToFinish(world, house);
  assert.equal(builder.task.kind, 'idle');
});

test('Danach: gibt es eine Baustelle in der Nähe, bauen sie dort weiter', () => {
  const { world } = siteWorld();
  const first = stake(world, 6, 0, 'house');
  const next = stake(world, 6, 4, 'house');
  const crew = villagersAt(world, first, 2);
  world.command(ids(crew), first.x, first.y);
  timeToFinish(world, first);
  for (const v of crew) assert.deepEqual([v.task.kind, v.task.building], ['build', next.anchor]);
  assert.equal(world.describe(crew[0]), 'geht zur Baustelle (Haus)');
  timeToFinish(world, next);
});

test('Spielstand: Fortschritt und Bauende bleiben, ältere Stände laden fertig', () => {
  const seed = 'construction-save';
  const ground = terrain(() => 'grass');
  const world = new World(ground, seed);
  build(world, 0, 0, 'town_center');
  const house = stake(world, 6, 0, 'house');
  const [v] = villagersAt(world, house, 1);
  world.command(ids([v]), house.x, house.y);
  run(world, 15);
  const progress = house.progress;
  assert.ok(progress > 0.3 && progress < 0.6);
  world.save();

  const loaded = new World(ground, seed);
  const again = loaded.at(6, 0);
  assert.equal(again.built, false);
  assert.ok(Math.abs(again.progress - progress) < 1e-9);
  assert.equal(loaded.villagers[0].task.kind, 'build');
  run(loaded, 20);
  assert.equal(again.built, true, 'the loaded builder finishes it');

  // Älterer Stand: Gebäude ohne `bp` - fertig.
  const data = world.toSave();
  for (const b of data.buildings) delete b.bp;
  writeSave(seed, data);
  assert.equal(new World(ground, seed).at(6, 0).built, true);
});

// B35 (2026-10-12): ein freier, aber eingeschlossener Platz - früher stand der Bauende dort für immer.
test('B35: Platz an der Baustelle ohne Weg - er nimmt einen anderen freien Platz', () => {
  // Wald um das Haus bei 8,0: frei sind nur die Tasche bei 9,0 (Platz 0, +x) und ein Gang von Süden zu 8,1 (Platz 1).
  const open = (x, y) => (y === 0 && (x === 8 || x === 9)) || (x === 8 && y >= 1);
  const { world } = siteWorld((x, y) => x >= 4 && x <= 12 && Math.abs(y) <= 4 && !open(x, y));
  const house = stake(world, 8, 0, 'house');
  // Der Bau hat begonnen - die Baustelle versperrt ihr Feld, die Tasche ist zu (B39).
  house.progress = 0.1;
  world.spawnAround('villager', 8, 7, 1);
  const v = world.villagers.at(-1);
  assert.equal(world.command(ids([v]), 8, 0), null);
  assert.equal(v.task.slot, 0, 'smallest free slot first');
  run(world, 30);
  assert.equal(v.task.kind, 'build');
  assert.equal(v.task.slot, 1);
  assert.equal(v.problem, null);
  assert.ok(house.progress > 0.1, `builds, progress=${house.progress}`);
});

// B39 (Vorgabe des Spielers, 2026-10-12): wurde mit dem Bauen nicht begonnen, kann man über die Baustelle gehen.
test('B39: über eine Baustelle bei 0 % geht man hindurch, nach Baubeginn nicht mehr', () => {
  // Ein Waldstreifen ohne Ende mit einem Gang bei y = 0, das Haus mitten im Gang.
  const { world } = siteWorld((x, y) => x >= 4 && x <= 12 && y !== 0);
  const house = stake(world, 8, 0, 'house');
  world.spawnAround('villager', 2, 0, 1);
  const v = world.villagers.at(-1);
  world.command(ids([v]), 15, 0);
  run(world, 20);
  assert.equal(v.problem, null);
  assert.ok(Math.hypot(v.x - 15.5, v.y - 0.5) < 0.3, `went through the site, at ${v.x},${v.y}`);
  house.progress = 0.1;
  world.command(ids([v]), 1, 0);
  run(world, 5);
  assert.equal(v.problem, 'Dort kommt er nicht hin');
});

test('B39: wer auf der Baustelle steht, wenn der Bau beginnt, geht normal hinaus', () => {
  const { world } = siteWorld();
  const house = stake(world, 8, 0, 'house');
  world.spawnAround('villager', 8, 0, 1);
  const v = world.villagers.at(-1);
  v.x = 8.5;
  v.y = 0.5;
  house.progress = 0.1;
  world.command(ids([v]), 14, 0);
  run(world, 15);
  assert.equal(v.problem, null);
  assert.ok(Math.hypot(v.x - 14.5, v.y - 0.5) < 0.3, `left the site, at ${v.x},${v.y}`);
});
