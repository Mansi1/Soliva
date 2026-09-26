// Die Prüfung der Namen mit Bedeutung (tools/models/check-models.mjs) schlägt
// an, wenn eine ID fehlt: je Regel ein kaputtes Modell.

import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkModels } from '../tools/models/check-models.mjs';
import { objToGlb, readModel } from '../tools/models/glb.mjs';
import { modelsDir } from './ids.mjs';

test('die echten Modelle bestehen die Prüfung', () => {
  assert.deepEqual(checkModels(modelsDir), []);
});

/** Kopie eines Modells, deren OBJ-Text `edit` ändert - nur dieses Modell wird geprüft. */
function broken(model, edit) {
  const dir = mkdtempSync(join(tmpdir(), 'check-'));
  const { obj, mtl } = readModel(model);
  writeFileSync(join(dir, `${model}.glb`), objToGlb(edit(obj), mtl));
  return checkModels(dir).join('\n');
}
const rename = (from, to) => (text) => text.replace(new RegExp(`^o ${from.replace(/\./g, '\\.')}(\\.|$)`, 'gm'), `o ${to}$1`);

const CASES = [
  ['Gebäude ohne Eingang', 'house', rename('Entry', 'Eingang'), 'fehlt Entry'],
  ['Mühle ohne Flügel', 'mill', rename('Sails', 'Blades'), 'fehlt Sails'],
  ['Fahne ohne Tuch', 'rally_flag', rename('Cloth', 'Tuch'), 'fehlt Cloth'],
  ['Hauptgebäude ohne Fahnentuch', 'town_center', rename('Cloth', 'Tuch'), 'fehlt Cloth'],
  ['Bognerei ohne Werkbank', 'bowyer', rename('Work.Stand', 'Stand'), 'fehlt Work.Stand'],
  ['Bognerei: Stufe des Bogens fehlt', 'bowyer', rename('Craft.1', 'Bogen.1'), 'Craft.<n> mit Lücken: 1'],
  ['Waffenkammer: Bogen im Gestell fehlt', 'armory', rename('Stock.42', 'Bogen.42'), 'Stock.<n> mit Lücken: 42'],
  ['Waffenkammer: zu wenige Bögen', 'armory', rename('Stock.99', 'Bogen.99'), 'Stock.<n>: 99 statt 100'],
  ['Waffenkammer ohne aufdeckbares Dach', 'armory', rename('Cut.Roof', 'Roof'), 'fehlt Cut.Roof'],
  ['Strauch ohne Beeren', 'berry_bush_1', (t) => t.replace(/^o Berry\./gm, 'o Beere.'), 'fehlt Berry'],
  ['Baum ohne Stumpf', 'tree_oak', rename('Trunk.Stump', 'Stumpf'), 'fehlt Trunk.Stump'],
  ['Tier ohne Bein', 'deer', rename('Leg.FL', 'Bein.VL'), 'fehlt Leg.FL'],
  ['Dorfbewohner ohne Hand', 'villager_female', rename('Arm.R.Lower.Hand', 'Hand'), 'fehlt Arm.R.Lower.Hand'],
  ['Dorfbewohner mit Knochen ohne Hand-Knochen', 'villager_male', (t) => t.replace(/^j hand\.R /m, 'j handR '), 'fehlt Knochen hand.R'],
  ['Werkzeug im Körper', 'villager_female', (t) => t.replace(/^o Head$/m, 'o Arm.R.Lower.Tool'), 'darf nicht enthalten Arm.R.Lower.Tool'],
  ['Beil ohne Namen fürs Spiel', 'prop_axe', (t) => t.replace(/^o Arm\.R\.Lower\.Tool.*$/gm, 'o Axt'), 'fehlt Arm.R.Lower.Tool'],
  ['Fläche ohne Material', 'house', (t) => t.replace(/^usemtl .*$/gm, ''), 'Flächen ohne Material'],
  ['Name von Blender durchnummeriert', 'house', (t) => t.replace(/^o Window\.Bar$/gm, 'o Window.Bar.001'), 'Window.Bar.001'],
];

for (const [what, model, edit, expect] of CASES) {
  test(`schlägt an: ${what}`, () => {
    const problems = broken(model, edit);
    assert.ok(problems.includes(expect), `erwartet "${expect}", gemeldet:\n${problems || '(nichts)'}`);
  });
}
