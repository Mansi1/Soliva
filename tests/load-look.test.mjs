// Lasten zeigen die Ware (B8) - Vorgaben des Spielers vom 2026-10-11:
// - Holz in den Armen, Beeren, Kartoffeln, Hopfen und Mais in der Hotte,
//   Tomaten in der Kiste, Stein und Gold im Korb, Weizen als Garbe, Fisch in
//   der Hand; kein Rucksack mehr für alles.
// Die stärkste Annahme: jede Sorte, die das Spiel einer Ladung gibt
// (Villagers.carryKind), hat ihr eigenes Aussehen - keine fällt still auf
// die Hotte zurück. Echte Module über Vite (worldFixture.mjs).

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { loadModules } from './worldFixture.mjs';

const {
  modules: [{ loadLook }, { CRAFTS, CROPS, FISH_KIND, LEATHER_SHOES, MEAT_KIND, RESOURCE_LABEL }, { KIND_LABEL }, { SHAPE, POSE, LOAD_LOOKS, carryPose, figureProps }],
  close,
} = await loadModules('/src/world/render.ts', '/src/world/catalog.ts', '/src/world/resources.ts', '/src/gl/entityRenderer.ts');
after(close);

// Strauch- und Baumarten nach ihrer Form: Sträucher geben Nahrung, Bäume Holz.
const bushes = new Set(Object.entries(SHAPE).filter(([name]) => name.startsWith('berryBush')).map(([, shape]) => shape));
const labels = (pick) => Object.entries(KIND_LABEL).filter(([shape]) => pick(bushes.has(Number(shape)))).map(([, label]) => label);

/** Jede Ladung, die im Spiel vorkommt: Rohstoff und Sorte (villagers.ts, startLoad / carryKinds). */
const LOADS = [
  ...labels((bush) => !bush).map((kind) => ['wood', kind]),
  ['wood', RESOURCE_LABEL.wood],
  ...labels((bush) => bush).map((kind) => ['food', kind]),
  ...Object.values(CROPS).map((crop) => ['food', crop.label]),
  ['food', FISH_KIND],
  ['food', MEAT_KIND],
  ['stone', RESOURCE_LABEL.stone],
  ['gold', RESOURCE_LABEL.gold],
  ['bows', RESOURCE_LABEL.bows],
  ['spears', RESOURCE_LABEL.spears],
  ['shoes', CRAFTS.cobbler.kind],
  ['shoes', LEATHER_SHOES.kind],
  // Von der Weide (B27, pasture.ts): Milch, Wolle, Leder - die Sorte ist der Name des Rohstoffs.
  ['milk', RESOURCE_LABEL.milk],
  ['wool', RESOURCE_LABEL.wool],
  ['leather', RESOURCE_LABEL.leather],
];

test('jede Sorte einer Ladung hat ihre eigene Last', () => {
  const missing = LOADS.filter(([type, kind]) => !LOAD_LOOKS.includes(loadLook(type, kind)?.look));
  assert.deepEqual(missing, [], `ohne Last: ${missing.map((l) => l.join(' ')).join(', ')}`);
  assert.equal(loadLook('food', 'gibt es nicht'), undefined, 'unbekannte Sorte fällt nicht still auf eine Last');
});

test('die Vorgaben: was wie getragen wird', () => {
  const look = (type, kind) => loadLook(type, kind)?.look;
  assert.equal(look('wood', 'Eiche'), 'logs');
  for (const crop of ['potato', 'hop', 'corn']) assert.equal(look('food', CROPS[crop].label), 'hotte', crop);
  for (const kind of labels((bush) => bush)) assert.equal(look('food', kind), 'hotte', kind);
  assert.equal(look('food', CROPS.tomato.label), 'crate');
  assert.equal(look('food', CROPS.wheat.label), 'sheaf');
  assert.equal(look('stone'), 'basket');
  assert.equal(look('gold'), 'basket');
  assert.equal(look('food', FISH_KIND), 'fish');
});

test('jede Last ist ein Anhang an beiden Körpern', () => {
  for (const body of [SHAPE.villager, SHAPE.villagerFemale]) {
    for (const look of LOAD_LOOKS) {
      const pose = carryPose(POSE.walk, look);
      const figure = { x: 0, y: 0, size: 1, color: [0, 0, 0], shape: body, alpha: 1, motion: [0, 0, pose, 1] };
      const shapes = figureProps(figure, look).map((p) => p.shape);
      const without = figureProps(figure).map((p) => p.shape);
      const added = shapes.filter((s) => !without.includes(s));
      assert.equal(added.length, 1, `${look} an ${body}: ${shapes}`);
    }
  }
});

test('Holz in den Armen nur beim Tragen, nicht beim Hacken', () => {
  assert.equal(carryPose(POSE.walk, 'logs'), POSE.carry);
  assert.equal(carryPose(POSE.stand, 'logs'), POSE.carry);
  assert.equal(carryPose(POSE.work, 'logs'), POSE.work);
  assert.equal(carryPose(POSE.walk, 'hotte'), POSE.walk);
  const chopping = { x: 0, y: 0, size: 1, color: [0, 0, 0], shape: SHAPE.villager, alpha: 1, motion: [0, 0, POSE.work, 1] };
  assert.ok(!figureProps(chopping, 'logs').some((p) => p.shape === SHAPE.loadLogs));
});
