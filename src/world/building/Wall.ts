// Wall.ts
// Mauern (B34): Palisade aus Holz - immer - und Steinmauer, sobald im
// Dorfzentrum die Forschung "Steinmauer" fertig ist (World.buildLock). Gelegt
// wird eine Linie: Klick, ziehen, loslassen (world/walls.ts, wallLine) - je
// Tile ein Stück, jedes eine eigene Baustelle (B26), bezahlt Stück für Stück.
//
// Ein fertiges Stück wird im Panel zum Tor: eigene Dorfbewohner gehen hindurch,
// Tiere nie (World.animalBlocked kennt nur Felder als offen); abgeschlossen
// kommt auch kein Dorfbewohner mehr durch (passable).

import { Color } from '../../functions/Color';
import { SHAPE } from '../../gl/entityRenderer';
import { BuildingBase, type BuildingSave } from './BuildingBase';
import { defineBuilding } from './definition';

export abstract class Wall extends BuildingBase {
  /** Ein Tor statt Mauer? */
  gate = false;
  /** Tor abgeschlossen: dann für alle zu. */
  locked = false;

  override isWall(): this is Wall {
    return true;
  }

  /** Durch ein offenes Tor gehen Dorfbewohner (VillagerWork.blockedAt) - Mauer und verschlossenes Tor sperren. */
  override passable(): boolean {
    return this.gate && !this.locked;
  }

  override get label(): string {
    return this.gate ? `Tor (${this.definition.label})` : this.definition.label;
  }

  override toSave(): BuildingSave {
    return { ...super.toSave(), ...(this.gate ? { gt: 1 } : {}), ...(this.locked ? { lk: 1 } : {}) };
  }

  override restore(save: BuildingSave, scale: number) {
    super.restore(save, scale);
    // Ältere Stände kennen keine Mauern - fehlt es, ist es Mauer und offen.
    this.gate = save.gt === 1;
    this.locked = this.gate && save.lk === 1;
  }
}

export class Palisade extends Wall {
  static readonly definition = defineBuilding({
    type: 'palisade',
    label: 'Palisade',
    // Die Ziffern sind vergeben - L wie Linie.
    key: 'l',
    color: Color.rgb(140, 100, 60),
    // Ein halbes Stück Mauer - fürs Bild setzt walls.ts die Stücke je Nachbar zusammen.
    model: SHAPE.wallPalisade,
    size: 1,
    // Acht Pfähle je Tile: weniger als ein Tile Weide (5 Holz), es ist nur eine Reihe.
    cost: { wood: 3 },
    // Trefferpunkte wie in AoE2.
    hp: 250,
  });
}

export class StoneWall extends Wall {
  static readonly definition = defineBuilding({
    type: 'stone_wall',
    label: 'Steinmauer',
    // U wie Mauer - M hat der Ton.
    key: 'u',
    color: Color.rgb(150, 146, 140),
    model: SHAPE.wallStone,
    size: 1,
    cost: { stone: 8 },
    hp: 1800,
  });
}
