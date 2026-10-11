// Cobbler.ts
// Schusterei (B31) - wie die Bognerei: ein Dorfbewohner arbeitet hier als
// Schuster, holt Holz aus dem Vorrat (CRAFTS.cobbler) und schnitzt an der
// Werkbank Holzschuhe. Die fertigen Paare bleiben hier im Regal (goods);
// barfüßige Dorfbewohner holen sich selbst ein Paar ab (villagers.ts,
// fetchShoes). Was der Schuster Schritt für Schritt tut, steht bei den
// Dorfbewohnern (Auftrag 'craft').
// ponytail: das Regal im Modell zeigt immer dieselben Paare, nicht den Vorrat;
// eigene Stock-Teile wie in der Waffenkammer, wenn man den Vorrat am Haus sehen soll
// (motion[1] ist schon mit dem Werkstück belegt).

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
    // Die fertigen Schuhe liegen hier - abliefern tut sie nur der Schuster.
    storedResources: ['shoes'],
    hp: 600,
  });

  override isWorkshop(): boolean {
    return true;
  }
}
