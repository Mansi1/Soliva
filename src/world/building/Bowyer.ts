// Bowyer.ts
// Bognerei - wie der Fletcher in Stronghold: ein Dorfbewohner arbeitet hier
// als Bogner, holt Holz aus dem Vorrat, schnitzt an der Werkbank Bögen und
// trägt sie zur Waffenkammer (Armory). Was er Schritt für Schritt tut, steht
// bei den Dorfbewohnern (villagers.ts, Auftrag 'craft').

import { Color } from '../../functions/Color';
import { SHAPE } from '../../gl/entityRenderer';
import { BuildingBase } from './BuildingBase';
import { defineBuilding } from './definition';

export class Bowyer extends BuildingBase {
  static readonly definition = defineBuilding({
    type: 'bowyer',
    label: 'Bognerei',
    key: '7',
    color: Color.rgb(168, 118, 64),
    model: SHAPE.bowyer,
    size: 1,
    cost: { wood: 100 },
    hp: 600,
  });

  override isWorkshop(): boolean {
    return true;
  }
}
