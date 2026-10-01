// Indizierte Meshes (gl/obj.ts, indexVertices): aus Eckpunkten und Index
// entsteht genau die Dreieckssuppe von vorher, und gleiche Eckpunkte gibt es
// nur einmal.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { indexVertices } from '../src/gl/obj.ts';

test('Index und Eckpunkte ergeben die Dreieckssuppe', () => {
  const n = 5;
  // Zwei Dreiecke eines Quadrats, die sich zwei Ecken teilen.
  const soup = new Float32Array([
    0, 0, 0, 1, 2, 1, 0, 0, 1, 2, 1, 1, 0, 1, 2,
    0, 0, 0, 1, 2, 1, 1, 0, 1, 2, 0, 1, 0, 1, 2,
  ]);
  const { vertices, indices } = indexVertices(soup, n);
  assert.equal(indices.length, soup.length / n);
  assert.equal(vertices.length / n, 4, 'geteilte Ecken einmal');
  const back = new Float32Array(soup.length);
  indices.forEach((u, i) => back.set(vertices.subarray(u * n, u * n + n), i * n));
  assert.deepEqual([...new Uint32Array(back.buffer)], [...new Uint32Array(soup.buffer)]);
});
