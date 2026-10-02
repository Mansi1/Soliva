// SPA-Fallback der CloudFront Function (infra/spa-fallback.js): Routen bekommen die
// index.html, Dateien bleiben unverändert (fehlende geben 404, nicht HTML).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// CloudFront erwartet eine freie Funktion `handler` ohne export.
const handler = new Function(`${readFileSync(new URL('../infra/spa-fallback.js', import.meta.url), 'utf8')}\nreturn handler;`)();
const rewrite = (uri) => handler({ request: { uri } }).uri;

test('Routen der Seite liefern die index.html', () => {
  assert.equal(rewrite('/'), '/index.html');
  assert.equal(rewrite('/game/Testseed'), '/index.html');
  assert.equal(rewrite('/galerie'), '/index.html');
  assert.equal(rewrite('/tools/lsystem/'), '/tools/lsystem/index.html');
});

test('Dateien bleiben unverändert', () => {
  assert.equal(rewrite('/assets/world-CJsrIFPH.js'), '/assets/world-CJsrIFPH.js');
  assert.equal(rewrite('/savegame/demo.json'), '/savegame/demo.json');
  assert.equal(rewrite('/tools/lsystem/gallery.html'), '/tools/lsystem/gallery.html');
});

test('Previews unter /pr-<n>/ bekommen ihre eigene index.html', () => {
  assert.equal(rewrite('/pr-12'), '/pr-12/index.html');
  assert.equal(rewrite('/pr-12/'), '/pr-12/index.html');
  assert.equal(rewrite('/pr-12/game/Testseed'), '/pr-12/index.html');
  assert.equal(rewrite('/pr-12/assets/main-x.js'), '/pr-12/assets/main-x.js');
  assert.equal(rewrite('/pr-12x/game'), '/index.html');
});
