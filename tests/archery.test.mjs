// Schießplatz und Fähigkeiten (B24) - Vorgaben des Spielers vom 2026-10-12:
// - Rechtsklick mit Dorfbewohnern auf den Schießplatz: er geht hin, holt sich
//   einen Bogen aus der Waffenkammer (wenn er keinen hat) und übt dort.
// - Sechs üben zugleich auf einem Platz.
// - Den Bogen behält er wie der Jäger den Speer. Mit dem Bogen jagt er aus
//   größerer Entfernung.
// - Jeder Dorfbewohner hat Fähigkeiten; sie steigen mit Übung und Arbeit und
//   machen ihn schneller.
// Echte Module über Vite (worldFixture.mjs).

import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { build, loadModules, makeWorld, run, terrain } from './worldFixture.mjs';

const { modules: [{ World }, { HUNT, VILLAGER }, { ARCHERY, rangeView }, skills], close } = await loadModules(
  '/src/world/world.ts', '/src/world/catalog.ts', '/src/world/archery.ts', '/src/world/unit/skills.ts');
after(close);

// Node hat ohne Schalter kein localStorage - so läuft Speichern und Laden über den echten Weg.
const storage = new Map();
globalThis.localStorage ??= {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)),
};

// Die Tiere würfeln - fest gesät, damit jeder Lauf gleich ist.
const random = Math.random;
after(() => { Math.random = random; });
beforeEach(() => {
  let seed = 2424;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
});

/** Dorfzentrum, Schießplatz, Waffenkammer mit `bows` Bögen, `count` Dorfbewohner. */
function rangeWorld(bows, count = 1) {
  const world = makeWorld(World, () => 'grass');
  build(world, 0, 0, 'town_center');
  const range = build(world, 0, 7, 'archery_range');
  const armory = build(world, 8, 0, 'armory');
  if (bows > 0) world.addStock('bows', bows, undefined, armory);
  world.spawnAround('villager', 4, 3, count);
  return { world, range, armory, villagers: world.villagers };
}

const ids = (list) => new Set(list.map((v) => v.id));

test('Schießplatz nimmt höchstens sechs auf', () => {
  const { world, range, villagers } = rangeWorld(10, 8);
  assert.equal(villagers.length, 8);
  const message = world.command(ids(villagers), range.x, range.y);
  assert.match(message, /höchstens 6/);
  const trainees = villagers.filter((v) => v.task.kind === 'archery');
  assert.equal(trainees.length, ARCHERY.trainees);
  assert.deepEqual(trainees.map((v) => v.task.slot).sort(), [0, 1, 2, 3, 4, 5]);
  for (const v of villagers.filter((u) => u.task.kind !== 'archery')) assert.equal(v.problem, 'Der Schießplatz ist voll');
  // Noch einer, während sechs üben: kein Platz.
  const late = villagers.find((v) => v.task.kind !== 'archery');
  world.command(new Set([late.id]), range.x, range.y);
  assert.equal(late.task.kind, 'idle');
  assert.equal(rangeView(world, range).trainees, 6);
});

test('Schütze geht erst zum Platz, holt genau einen Bogen, übt und behält ihn', () => {
  const { world, range, armory, villagers: [v] } = rangeWorld(3);
  world.command(new Set([v.id]), range.x, range.y);
  const steps = [];
  for (let t = 0; t < 60 && !(v.task.kind === 'archery' && v.task.step === 'practise'); t += 0.1) {
    world.tick(0.1);
    if (steps.at(-1) !== v.task.step) steps.push(v.task.step);
  }
  assert.deepEqual(steps, ['walk', 'fetch', 'practise']);
  assert.equal(v.inventory.weapon, 'bow');
  assert.equal(armory.stored('bows'), 2, 'took exactly one');
  // Er übt: die Fähigkeit steigt, und er bleibt dabei.
  run(world, 30);
  assert.equal(v.task.kind, 'archery');
  assert.ok(skills.skillLevel(v.skills, 'archery') > 0, 'archery rises');
  assert.match(world.describe(v), /übt Bogenschießen/);
  // Anderer Auftrag: der Bogen bleibt bei ihm und geht nicht zurück; zurück am Platz holt er keinen neuen.
  world.command(new Set([v.id]), 6, 4);
  run(world, 15);
  assert.equal(v.inventory.weapon, 'bow');
  world.command(new Set([v.id]), range.x, range.y);
  run(world, 20);
  assert.equal(armory.stored('bows'), 2);
});

test('Übung am Platz: je länger, desto höher die Fähigkeit - bis zum Meister', () => {
  const { world, range, villagers: [v] } = rangeWorld(1);
  world.command(new Set([v.id]), range.x, range.y);
  run(world, 40);
  const early = skills.skillLevel(v.skills, 'archery');
  run(world, 60);
  const later = skills.skillLevel(v.skills, 'archery');
  assert.ok(early > 0 && later > early, `${early} -> ${later}`);
  // Je Sekunde Übung eine Sekunde (skills.ts): nach 60 s mehr ~0,1 Stufen.
  assert.ok(Math.abs(later - early - 60 / skills.SKILL.mastery) < 0.01, `rose ${later - early}`);
});

test('Ohne Bogen in der Waffenkammer wartet er mit Grund, bis einer da ist', () => {
  const { world, range, armory, villagers: [v] } = rangeWorld(0);
  world.command(new Set([v.id]), range.x, range.y);
  run(world, 30);
  assert.equal(v.task.kind, 'archery');
  assert.equal(v.inventory.weapon, null);
  assert.match(v.problem, /Kein Bogen/);
  assert.deepEqual(rangeView(world, range).waiting, [v.problem]);
  world.addStock('bows', 1, undefined, armory);
  run(world, 40);
  assert.equal(v.inventory.weapon, 'bow');
  assert.equal(v.problem, null);
  assert.equal(armory.stored('bows'), 0);
});

test('Ein Meister sammelt schneller - höchstens SKILL.bonus mehr', () => {
  /** Holz nach `seconds` Sekunden am Baum, mit dieser Übung im Sammeln. */
  const chopped = (practice, seconds) => {
    const world = makeWorld(World, (x, y) => (x === 6 && y === 3 ? 'tree' : 'grass'));
    build(world, 0, 0, 'town_center');
    world.spawnAround('villager', 5, 3, 1);
    const v = world.villagers[0];
    v.skills = skills.skillsFromSave({ gathering: practice });
    world.command(new Set([v.id]), 6, 3);
    for (let t = 0; t < 30 && v.carrying <= 0; t += 0.1) world.tick(0.1);
    const start = v.carrying;
    run(world, seconds);
    return v.carrying - start;
  };
  const novice = chopped(0, 4);
  const master = chopped(skills.SKILL.mastery, 4);
  const beyond = chopped(1e9, 4);
  assert.ok(Math.abs(novice - VILLAGER.gatherRate.wood * 4) < 0.15, `novice ${novice}`);
  assert.ok(Math.abs(master / novice - (1 + skills.SKILL.bonus)) < 0.05, `master/novice ${master / novice}`);
  // Mehr Übung als ein Meister gibt es nicht: gedeckelt.
  assert.equal(beyond, master);
  const s = {};
  skills.practise(s, 'gathering', 1e6);
  assert.equal(s.gathering, skills.SKILL.mastery);
  assert.equal(skills.skillFactor(s, 'gathering'), 1 + skills.SKILL.bonus);
});

test('Mit dem Bogen jagt er aus größerer Entfernung als mit dem Speer', () => {
  const world = makeWorld(World, () => 'grass');
  build(world, 0, 0, 'town_center');
  world.spawnAround('villager', 3, 3, 1);
  const v = world.villagers[0];
  v.inventory.weapon = 'bow';
  const sheep = world.wildlife.add('sheep', 3, 14, { female: true });
  world.hunt(new Set([v.id]), sheep);
  let hit;
  for (let t = 0; t < 60 && hit === undefined; t += 0.1) {
    const hp = sheep.hp;
    world.tick(0.1);
    if (sheep.hp < hp) hit = Math.hypot(sheep.x - v.x, sheep.y - v.y);
  }
  assert.ok(hit !== undefined, `no hit: ${world.describe(v)}`);
  assert.ok(hit > HUNT.range && hit <= HUNT.bowRange + 0.05, `first hit from ${hit.toFixed(2)} tiles`);
  assert.equal(v.inventory.weapon, 'bow', 'keeps the bow, takes no spear');
  assert.ok(skills.skillLevel(v.skills, 'archery') > 0, 'hunting with the bow trains archery');
});

test('Spielstand: Fähigkeiten und Bogen bleiben, ältere Stände laden ohne Fähigkeiten', () => {
  // Eigene Welt (Seed "schuetze") - makeWorld läse sonst diesen Stand in den anderen Tests.
  const world = new World(terrain(() => 'grass'), 'schuetze');
  world.spawnAround('villager', 3, 3, 2);
  const [a] = world.villagers;
  a.inventory.weapon = 'bow';
  a.skills = { archery: 240.04, gathering: 30 };
  world.save();
  const loaded = new World(terrain(() => 'grass'), 'schuetze');
  assert.deepEqual(loaded.villagers.map((x) => x.inventory), [{ weapon: 'bow', shoes: null }, { weapon: null, shoes: null }]);
  assert.deepEqual(loaded.villagers.map((x) => x.skills), [{ archery: 240, gathering: 30 }, {}]);
  assert.equal(skills.skillsText(loaded.villagers[0].skills), 'Bogen 40 % · Sammeln 5 %');
  storage.set('pgm.world.alt-schuetze', JSON.stringify({
    version: 3,
    stock: { food: 0, wood: 0, stone: 0, gold: 0, bows: 0 },
    buildings: [],
    villagers: [{ x: 3, y: 3, c: 0, ct: null, task: { kind: 'idle' } }, { x: 4, y: 3, c: 0, ct: null, task: { kind: 'idle' }, sk: { archery: 'viel', zaubern: 5, farming: -3 } }],
    harvested: {},
  }));
  const old = new World(terrain(() => 'grass'), 'alt-schuetze');
  assert.deepEqual(old.villagers.map((x) => x.skills), [{}, {}]);
});
