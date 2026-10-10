// Ebenen der Hauptansicht (src/layers.ts): die Balken kommen nach den
// Post-Effekten (scharf, echte Farbe), jede gewünschte Ebene ist einzeln
// abschaltbar, und das Umsortieren im Entwickler-Panel lässt das Gelände vorn.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DRAW_ORDER, LAYER_KEYS, LAYERS, movePass } from '../src/layers.ts';

test('bars are drawn after the post effects, terrain first', () => {
  assert.equal(DRAW_ORDER[0], 'terrain');
  assert.ok(DRAW_ORDER.indexOf('bars') > DRAW_ORDER.indexOf('post'));
});

test('every requested layer has its own switch, keys are unique', () => {
  const labels = DRAW_ORDER.flatMap((pass) => LAYERS[pass].map((layer) => layer[1]));
  for (const name of ['Gelände', 'Wasser', 'Gras', 'Gebäude', 'Bäume', 'Felder', 'Blumen', 'Figuren', 'Tiere',
    'Überlagerungen', 'Balken', 'Partikel', 'Wetter', 'FXAA', 'Farbe', 'Glühen']) {
    assert.ok(labels.includes(name), `missing layer ${name}`);
  }
  assert.equal(new Set(LAYER_KEYS).size, LAYER_KEYS.length);
});

test('movePass swaps neighbours and keeps terrain in front', () => {
  const order = [...DRAW_ORDER];
  assert.equal(movePass(order, 'bars', -1), true);
  assert.deepEqual(order, ['terrain', 'grass', 'models', 'particles', 'bars', 'post']);
  assert.equal(movePass(order, 'grass', -1), false, 'nothing moves above terrain');
  assert.equal(movePass(order, 'terrain', 1), false, 'terrain is pinned');
  assert.equal(movePass(order, 'post', 1), false, 'last stays last');
  assert.deepEqual(order, ['terrain', 'grass', 'models', 'particles', 'bars', 'post']);
});
