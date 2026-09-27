// Partikel-Quellen (src/particles.ts): so im Puffer, wie der Shader sie liest,
// höchstens MAX_PER_SOURCE Partikel je Quelle und MAX_SOURCES Quellen je Bild.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_PER_SOURCE, MAX_SOURCES, PARTICLE, ParticleSources, SOURCE_FLOATS } from '../src/particles.ts';

test('eine Quelle liegt so im Puffer, wie der Shader sie liest', () => {
  const s = new ParticleSources();
  assert.ok(s.push(PARTICLE.foam, 1, 2, 3, 0.5, 0.75, 0.25, 0, 1, 42, 7, 5));
  assert.deepEqual([...s.data.subarray(0, SOURCE_FLOATS)], [1, 2, 3, 0.5, 0.75, 0.25, 0, 1, PARTICLE.foam, 42, 7, 5]);
  assert.equal(s.count, 1);
  assert.equal(s.particles, 5);
});

test('Partikel je Quelle gedeckelt, Quellen je Bild begrenzt, leeren setzt zurück', () => {
  const s = new ParticleSources();
  s.push(PARTICLE.bee, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 99);
  assert.equal(s.data[11], MAX_PER_SOURCE);
  for (let i = 1; i < MAX_SOURCES; i++) assert.ok(s.push(PARTICLE.chips, i, 0, 0, 1, 0, 0, 0, 1, i, 0, 1));
  assert.equal(s.push(PARTICLE.chips, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1), false, 'voll: keine weitere Quelle');
  assert.equal(s.count, MAX_SOURCES);
  s.clear();
  assert.equal(s.count, 0);
  assert.equal(s.particles, 0);
});

test('jede Art hat eine eigene Nummer', () => {
  const numbers = Object.values(PARTICLE);
  assert.equal(new Set(numbers).size, numbers.length);
});
