// Clips beim Bauen gelesen (vite.config.ts, glbClips): gepackt und im Spiel
// ausgepackt (packClips, unpackClips) ergibt genau das, was loadClips im
// Browser gelesen hätte - Zahl für Zahl.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { FLAG, HUMANOID, MILL, QUADRUPED, loadClips, packClips, unpackClips } from '../src/gl/clips.ts';

const LIBRARIES = { humanoid: HUMANOID, humanoid_sit: HUMANOID, humanoid_tools: HUMANOID, quadruped: QUADRUPED, mill: MILL, flag: FLAG };

test('gepackte Clips sind dieselben wie direkt gelesene', () => {
  for (const [name, rig] of Object.entries(LIBRARIES)) {
    const dir = new URL('../src/models/clips/', import.meta.url);
    const url = `data:model/gltf-binary;base64,${readFileSync(new URL(`${name}.glb`, dir)).toString('base64')}`;
    const direct = loadClips(url, JSON.parse(readFileSync(new URL(`${name}.json`, dir), 'utf8')), rig);
    assert.ok(direct.length > 0, `${name}: keine Clips`);
    assert.deepEqual(unpackClips(JSON.parse(packClips(direct))), direct, name);
  }
});
