// Aufräumen des Kachel-Speichers (gl/tileStore.worker.ts): welche Kacheln gehen.

import assert from 'node:assert/strict';
import { test } from 'node:test';

// Der Worker setzt beim Laden self.onmessage - hier genügt ein Stellvertreter.
globalThis.self ??= globalThis;
const { evictions } = await import('../src/gl/tileStore.worker.ts');

test('bis zur Grenze bleibt alles', () => {
  const times = new Map([['a', 1], ['b', 2], ['c', 3]]);
  assert.deepEqual(evictions(times, 3), []);
});

test('darüber gehen die am längsten ungenutzten, bis 80 % der Grenze übrig sind', () => {
  const times = new Map(Array.from({ length: 11 }, (_, i) => [`k${i}`, 100 - i]));
  const gone = evictions(times, 10);
  assert.equal(times.size - gone.length, 8);
  assert.deepEqual(gone, ['k10', 'k9', 'k8']);
});

test('Kacheln von vor dem Aufräumen (0) gehen zuerst', () => {
  const times = new Map([['neu', 5], ['alt', 0], ['mittel', 3]]);
  assert.deepEqual(evictions(times, 2), ['alt', 'mittel']);
});
