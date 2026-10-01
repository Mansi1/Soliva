// Der Spielzeiger im Vollbild (src/mouseLock.ts) liest die CSS-Zeiger der
// Werkzeuge (src/cursors.ts) - Bild und Klickpunkt müssen dabei erhalten bleiben.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cursorImage } from '../src/mouseLock.ts';

test('liest Bild und Klickpunkt aus einem CSS-Zeiger', () => {
  const url = 'data:image/svg+xml,%3Csvg%3E%3C%2Fsvg%3E';
  // So liefert getComputedStyle den Wert aus cursors.ts zurück.
  assert.deepEqual(cursorImage(`url("${url}") 7 29, pointer`), { url, x: 7, y: 29 });
  assert.deepEqual(cursorImage(`url("${url}"), auto`), { url, x: 0, y: 0 });
  assert.equal(cursorImage('crosshair'), null);
});
