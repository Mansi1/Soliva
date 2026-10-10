// Bauvorschau (src/game/overlay.ts: placementOverlay) und gebautes Gebäude
// (World.place -> BuildingBase) zeigen am selben Bauplatz dieselbe
// Modell-Variante - beide über siteVariant. Sonst zeigt die Vorschau ein
// anderes Haus, als dann entsteht. Echte Module über Vite (worldFixture.mjs).

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { build, loadModules, makeWorld } from './worldFixture.mjs';

let close, World, placementOverlay, BUILDINGS, createBuilding;

before(async () => {
  let modules;
  ({ modules, close } = await loadModules('/src/world/world.ts', '/src/game/overlay.ts', '/src/world/catalog.ts', '/src/world/building/index.ts'));
  [{ World }, { placementOverlay }, { BUILDINGS }, { createBuilding }] = modules;
});

after(() => close?.());

const SITES = [[0, 0], [3, 0], [0, 3], [12, -43], [-7, 79], [26, -44], [-28, -19], [123, 456], [-500, 3]];

/** Das Modell, das die Vorschau an (x, y) zeigt - die Instanz mit einer Hausform. */
function previewModel(world, x, y) {
  const out = [];
  placementOverlay(world, 'house', x, y, false, out);
  const models = BUILDINGS.house.models;
  const hit = out.filter((i) => models.includes(i.shape));
  assert.equal(hit.length, 1, `Vorschau bei ${x},${y}: genau ein Hausmodell`);
  return hit[0].shape;
}

test('Vorschau und gebautes Haus zeigen am selben Bauplatz dieselbe Variante', () => {
  for (const [x, y] of SITES) {
    const world = makeWorld(World, () => 'grass');
    // Häuser nur in der Nähe eines Dorfzentrums - eins daneben.
    build(world, x + 6, y, 'town_center');
    const shown = previewModel(world, x, y);
    assert.equal(build(world, x, y, 'house').model, shown, `Bauplatz ${x},${y}`);
  }
});

test('die Variante hängt vom Bauplatz ab, nicht immer die erste', () => {
  const world = makeWorld(World, () => 'grass');
  const shown = new Set(SITES.map(([x, y]) => previewModel(world, x, y)));
  assert.ok(shown.size > 1, `nur Modell(e) ${[...shown]}`);
});

test('eine gespeicherte Variante gilt vor dem Bauplatz', () => {
  const site = createBuilding('house', 12, -43);
  const saved = (site.variant + 1) % BUILDINGS.house.models.length;
  assert.equal(createBuilding('house', 12, -43, { variant: saved }).variant, saved);
});
