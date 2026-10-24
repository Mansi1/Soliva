// Generator-Seite (/generator, src/generatorParams.ts): je Wert aus
// TERRAIN_PARAMS ein Regler, und die Adresse trägt Seed und geänderte Werte.
// Der CPU-Generator folgt denselben Reglern - sonst stünden die Bäume der
// Seite nicht im Wald, den der Shader malt. Echte Module über Vite.

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { loadModules } from './worldFixture.mjs';

const { modules: [{ SLIDERS, fromQuery, toQuery }, { TERRAIN_PARAMS, MapGenerator, reliefZ }], close } = await loadModules(
  '/src/generatorParams.ts', '/src/noise.ts');
after(close);

test('MapGenerator: ohne Regler wie bisher, mit Reglern danach', () => {
  const points = [[0, 0], [123, -456], [-2000, 777], [5000, 5000]];
  const plain = new MapGenerator('Testseed');
  const same = new MapGenerator('Testseed', { ...TERRAIN_PARAMS });
  for (const [x, y] of points) assert.deepEqual(same.terrainAt(x, y), plain.terrainAt(x, y));
  // Meer bis ganz oben: überall Wasser.
  const flooded = new MapGenerator('Testseed', { ...TERRAIN_PARAMS, deepWaterLevel: -1, seaLevel: 1, shoreLevel: 1 });
  for (const [x, y] of points) assert.equal(flooded.terrainAt(x, y).tileType, 'water');
  // Relief: höhere Gipfel heben dieselbe Höhe höher.
  assert.ok(reliefZ(0.95, { ...TERRAIN_PARAMS, reliefHeight: 80 }) > reliefZ(0.95));
});

test('jeder Wert aus TERRAIN_PARAMS hat genau einen Regler, die Vorgabe liegt in seinem Bereich', () => {
  assert.deepEqual(SLIDERS.map((s) => s.key).sort(), Object.keys(TERRAIN_PARAMS).sort());
  for (const s of SLIDERS) {
    const value = TERRAIN_PARAMS[s.key];
    assert.ok(s.min <= value && value <= s.max, `${s.key}: ${value} nicht in ${s.min}..${s.max}`);
  }
});

test('Adresse: nur geänderte Werte, und zurückgelesen derselbe Stand', () => {
  assert.equal(toQuery('abc', { ...TERRAIN_PARAMS }).toString(), 'seed=abc');
  const params = { ...TERRAIN_PARAMS, seaLevel: -0.2, microOctaves: 3 };
  const query = toQuery('Insel', params);
  assert.equal(query.toString(), 'seed=Insel&seaLevel=-0.2&microOctaves=3');
  assert.deepEqual(fromQuery(query, 'x'), { seed: 'Insel', params });
});

test('Adresse von Hand: Unlesbares fällt weg, zu große Werte werden begrenzt, ohne Seed die Vorgabe', () => {
  const { seed, params } = fromQuery(new URLSearchParams('seaLevel=abc&hillLevel=&peakLevel=9&unbekannt=1'), 'Soliva');
  assert.equal(seed, 'Soliva');
  assert.equal(params.seaLevel, TERRAIN_PARAMS.seaLevel);
  assert.equal(params.hillLevel, TERRAIN_PARAMS.hillLevel);
  assert.equal(params.peakLevel, 1);
  assert.ok(!('unbekannt' in params));
});
