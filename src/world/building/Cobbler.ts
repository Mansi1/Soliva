// Cobbler.ts
// Schusterei (B31) - wie die Bognerei: ein Dorfbewohner arbeitet hier als
// Schuster, holt Holz aus dem Vorrat (CRAFTS.cobbler) und schnitzt an der
// Werkbank Holzschuhe - nach der Gerberei im Dorfzentrum (research.ts) aus
// Leder Lederschuhe, solange Leder da ist. Die fertigen Paare bringt er ins
// Dorfzentrum (B37); wer dort Ware abgibt, nimmt ein Paar mit (villagers.ts,
// deliverTo; VERIFIED: tests/shoes.test.mjs). Was der Schuster Schritt für Schritt tut, steht bei den
// Dorfbewohnern (Auftrag 'craft').

import { Color } from '../../functions/Color';
import { SHAPE } from '../../gl/entityRenderer';
import { BuildingBase } from './BuildingBase';
import { defineBuilding } from './definition';

export class Cobbler extends BuildingBase {
  static readonly definition = defineBuilding({
    type: 'cobbler',
    label: 'Schusterei',
    // Die Ziffern sind vergeben - K wie Klompen.
    key: 'k',
    color: Color.rgb(196, 160, 104),
    model: SHAPE.cobbler,
    size: 1,
    cost: { wood: 80 },
    hp: 600,
  });

  override isWorkshop(): boolean {
    return true;
  }
}
