// SpearMaker.ts
// Speermacherei (B25) - wie die Bognerei: ein Dorfbewohner arbeitet hier als
// Speermacher, holt Holz aus dem Vorrat (CRAFTS.spear_maker), schnitzt an der
// Werkbank Speere und trägt sie zur Waffenkammer. Jäger holen sich dort einen
// Speer, bevor sie jagen. Was er Schritt für Schritt tut, steht bei den
// Dorfbewohnern (villagers.ts, Auftrag 'craft').

import { Color } from '../../functions/Color';
import { SHAPE } from '../../gl/entityRenderer';
import { BuildingBase } from './BuildingBase';
import { defineBuilding } from './definition';

export class SpearMaker extends BuildingBase {
  static readonly definition = defineBuilding({
    type: 'spear_maker',
    label: 'Speermacherei',
    // Die Ziffern sind vergeben - J wie Jagd.
    key: 'j',
    color: Color.rgb(150, 104, 60),
    model: SHAPE.spearMaker,
    size: 1,
    cost: { wood: 80 },
    hp: 600,
  });

  override isWorkshop(): boolean {
    return true;
  }
}
