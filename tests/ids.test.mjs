// Keine ID geht verloren: jeder Name, an dem das Spiel ein Teil erkennt, und
// jeder Knoten, Clip und jede Pose der Clip-Bibliotheken steht noch in
// src/models - verglichen mit dem festgeschriebenen Stand
// (tests/ids.snapshot.json). Soll etwas wirklich weg: npm run test:update-ids.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { collectIds, lostIds, newIds, snapshotFile } from './ids.mjs';

const before = JSON.parse(readFileSync(snapshotFile, 'utf8'));
const now = collectIds();

test('kein Name in einem Modell geht verloren', () => {
  const lost = lostIds({ models: before.models, clips: {} }, { models: now.models, clips: {} });
  assert.deepEqual(lost, [], `IDs verloren - gewollt? Dann npm run test:update-ids\n  ${lost.join('\n  ')}`);
});

test('keine Knochen, Clips oder Posen der Clip-Bibliotheken gehen verloren', () => {
  const lost = lostIds({ models: {}, clips: before.clips }, { models: {}, clips: now.clips });
  assert.deepEqual(lost, [], `IDs verloren - gewollt? Dann npm run test:update-ids\n  ${lost.join('\n  ')}`);
});

test('der Vergleich erkennt Verluste', () => {
  // Gegenprobe: ein Name, ein Knochen, eine Pose weg - alles muss auffallen.
  const broken = structuredClone(now);
  broken.models['buildings/armory'] = broken.models['buildings/armory'].filter((n) => n !== 'Stock.42');
  broken.models['buildings/house'] = broken.models['buildings/house'].filter((n) => n !== 'Entry');
  broken.clips.humanoid.bones = broken.clips.humanoid.bones.filter((b) => b !== 'forearm.R');
  delete broken.clips.humanoid.clips.carve.pose;
  broken.clips.quadruped.clips.hop.species = [];
  const lost = lostIds(now, broken).join('\n');
  for (const text of ['buildings/armory: 1 Namen weg - Stock.42', 'buildings/house: 1 Namen weg - Entry', 'Knochen weg - forearm.R', 'Clip carve ersetzt Pose keine statt 5', 'Clip hop gilt nicht mehr für hare']) {
    assert.ok(lost.includes(text), `nicht erkannt: ${text}\n${lost}`);
  }
});

test('Neues ist kein Verlust', (t) => {
  const added = newIds(before, now);
  if (added.length) t.diagnostic(`neu seit dem festgeschriebenen Stand (npm run test:update-ids): ${added.join(', ')}`);
  const grown = structuredClone(now);
  grown.models['buildings/house'].push('Lantern.Neu');
  assert.deepEqual(lostIds(now, grown), []);
});
