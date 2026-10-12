// keys.test.mjs
// Jede Taste hat höchstens eine Bedeutung: Gebäude (BUILDINGS[..].key), Ausbilden
// und die festen Befehle stehen zusammen in CONTROLS (src/game/controls.ts).
// Anlass: Weide und Schusterei hatten beide K (gefunden beim Zusammenführen von B27).

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { loadModules } from './worldFixture.mjs';

const { modules: [{ CONTROLS }], close } = await loadModules('/src/game/controls.ts');
after(close);

test('Keine Taste ist doppelt belegt', () => {
  const seen = new Map();
  for (const control of CONTROLS) {
    for (const key of control.keys ?? []) {
      if (!key) continue;
      const k = key.toLowerCase();
      assert.ok(!seen.has(k), `Taste "${k}": ${seen.get(k)} und ${control.what}`);
      seen.set(k, control.what);
    }
  }
  assert.ok(seen.size > 10, 'CONTROLS ohne Tasten?');
});
