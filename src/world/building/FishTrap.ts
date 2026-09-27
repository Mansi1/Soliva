// FishTrap.ts
// Reuse: liegt im Wasser nahe einer Fischerhütte und füllt sich in
// FISHING.trapFillTime Sekunden mit Fisch. Der Fischer der Hütte rudert hin,
// leert sie und bringt den Fang zum Netz (villagers.ts, Auftrag 'fish').
// Gebaut wird sie über die Fischerhütte, nicht aus dem Baumenü (ohne `key`).
//
// Achtung Kreis-Import: catalog.ts lädt die Gebäudeklassen. FISHING darum
// nur in Methoden benutzen, nie beim Laden der Klasse.

import { Color } from '../../functions/Color';
import { SHAPE } from '../../gl/entityRenderer';
import { FISHING } from '../catalog';
import { BuildingBase, type BuildingSave } from './BuildingBase';
import { defineBuilding } from './definition';

export class FishTrap extends BuildingBase {
  static readonly definition = defineBuilding({
    type: 'fish_trap',
    label: 'Reuse',
    key: '',
    color: Color.rgb(150, 120, 70),
    model: SHAPE.fishTrap,
    size: 0.5,
    terrain: ['water', 'deep_water'],
    cost: { wood: 10 },
    hp: 50,
  });

  /** Wie voll sie ist, 0..1 - bei 1 wartet sie auf den Fischer. */
  fill = 0;

  get isFull(): boolean {
    return this.fill >= 1;
  }

  /** Fische, die schon darin liegen - so viele zeigt auch das Modell. */
  get fish(): number {
    return Math.floor(this.fill * FISHING.trapFish);
  }

  override toSave(): BuildingSave {
    return { ...super.toSave(), fl: +this.fill.toFixed(3) };
  }

  override restore(save: BuildingSave, scale: number) {
    super.restore(save, scale);
    this.fill = save.fl ?? 0;
  }
}
