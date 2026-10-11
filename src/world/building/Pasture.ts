// Pasture.ts
// Weide (B27): wie ein Feld Tile für Tile abgesteckt (Ziehen beim Bauen);
// nebeneinander wachsen die Tiles zu einer Weide zusammen. Ringsum steht ein
// Holzzaun, je Weide ein Gatter (world/pasture.ts). Darin bleiben die
// gezähmten Tiere; ein Dorfbewohner hütet sie (Auftrag 'tend').

import { Color } from '../../functions/Color';
import { SHAPE } from '../../gl/entityRenderer';
import { BuildingBase } from './BuildingBase';
import { defineBuilding } from './definition';

export class Pasture extends BuildingBase {
  static readonly definition = defineBuilding({
    type: 'pasture',
    label: 'Weide',
    // G wie Gatter - die Ziffern sind vergeben, K hat die Schusterei.
    key: 'g',
    color: Color.rgb(132, 168, 74),
    // Das Gatter - im Baumenü und in der Vorschau; der Zaun kommt je Kante dazu.
    model: SHAPE.pasture,
    size: 1,
    // Gras wächst nur auf Wiese und Waldboden, wie beim Feld.
    terrain: ['grass', 'forest'],
    // Zaun für ein Tile: weniger als ein Feldstück (7 Holz), Latten statt Saat.
    cost: { wood: 5 },
    hp: 60,
  });

  override isOpenGround(): boolean {
    return true;
  }
}
