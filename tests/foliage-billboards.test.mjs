// Bildkarten (tools/models/billboard-card.mjs): die Weizenkarte der Felder und
// die Pflanzen des Grases (gl/grassRenderer.ts) - je ein Rechteck, unten
// mittig am Ursprung, mit Texturkoordinaten und eingebettetem Bild. Das Gras
// liest davon nur Bild und Größe, der Weizen wird aus der Karte gebaut.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { glbToObj } from '../tools/models/glb.mjs';

const CARDS = ['fields/wheat_card', 'foliage/meadow_grass', 'foliage/wild_grass_seedheads', 'foliage/reed', 'foliage/cattails'];

test('jede Bildkarte ist ein Rechteck mit Bild, unten mittig', () => {
  for (const name of CARDS) {
    const { obj, mtl } = glbToObj(readFileSync(new URL(`../src/models/${name}.glb`, import.meta.url)));
    const lines = obj.split('\n');
    const v = lines.filter((l) => l.startsWith('v ')).map((l) => l.split(/\s+/).slice(1).map(Number));
    const faces = lines.filter((l) => l.startsWith('f '));
    assert.equal(v.length, 4, `${name}: 4 Eckpunkte`);
    assert.equal(faces.length, 2, `${name}: 2 Dreiecke`);
    assert.equal(lines.filter((l) => l.startsWith('vt ')).length, 4, `${name}: Texturkoordinaten`);
    assert.ok(faces.every((f) => f.split(/\s+/).slice(1).every((c) => c.includes('/'))), `${name}: Flächen mit Texturkoordinaten`);
    assert.match(mtl, /^map_Kd data:image\/png;base64,/m, `${name}: eingebettetes PNG`);
    const [xs, ys, zs] = [0, 1, 2].map((i) => v.map((p) => p[i]));
    assert.equal(Math.min(...ys), 0, `${name}: steht auf y = 0`);
    assert.ok(Math.max(...ys) > 0 && Math.max(...xs) > 0, `${name}: hat Breite und Höhe`);
    assert.ok(Math.abs(Math.min(...xs) + Math.max(...xs)) < 1e-3, `${name}: mittig in x`);
    assert.ok(zs.every((z) => z === 0), `${name}: flach in z`);
  }
});
