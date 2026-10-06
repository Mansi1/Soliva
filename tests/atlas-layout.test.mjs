// Tischdecke des Geländes (src/gl/atlasLayout.ts): Blöcke im Atlas überlappen
// sich nie, auch nicht nach Freigeben und Neubelegen, und ein Hang, der zur
// Kamera zeigt, bekommt mehr Texel als flacher Boden.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ShelfAtlas, blockSize } from '../src/gl/atlasLayout.ts';

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('Blöcke überlappen nicht und bleiben im Atlas', () => {
  const atlas = new ShelfAtlas(512);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const live = [];
  for (let i = 0; i < 2000; i++) {
    if (live.length > 0 && rnd() < 0.45) {
      atlas.free(live.splice(Math.floor(rnd() * live.length), 1)[0]);
      continue;
    }
    const b = atlas.alloc(4 + Math.floor(rnd() * 60), 4 + Math.floor(rnd() * 60));
    if (!b) continue;
    assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= 512 && b.y + b.h <= 512, `außerhalb: ${JSON.stringify(b)}`);
    for (const o of live) assert.ok(!overlaps(b, o), `${JSON.stringify(b)} überlappt ${JSON.stringify(o)}`);
    live.push(b);
  }
});

test('voller Atlas liefert null, nach clear wieder Platz', () => {
  const atlas = new ShelfAtlas(64);
  while (atlas.alloc(32, 32));
  assert.equal(atlas.alloc(32, 32), null);
  atlas.clear();
  assert.notEqual(atlas.alloc(32, 32), null);
});

test('Hang zur Kamera bekommt einen größeren Block als flacher Boden', () => {
  // Wie iso.ts bei 30°, Drehung 0, 64 Pixel je Tile: u = x - y, v = (x + y) / 2 - zScreen * z.
  const zScreen = Math.sqrt(6) / 2;
  const project = (dx, dy, dz) => [(dx - dy) * 64, ((dx + dy) * 0.5 - zScreen * dz) * 64];
  const flat = blockSize([0, 0, 0, 0], project, 4096);
  // Steigt zur Kamera hin ab (nach +x und +y tiefer): im Bild steil nach unten gezogen.
  const steep = blockSize([3, 0, 0, -3], project, 4096);
  assert.ok(steep.w > 2 * flat.w && steep.h > 2 * flat.h, `flach ${JSON.stringify(flat)}, steil ${JSON.stringify(steep)}`);
});
