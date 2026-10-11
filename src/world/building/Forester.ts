// Forester.ts
// Försterhütte: ein Dorfbewohner arbeitet hier als Förster (villagers.ts,
// Auftrag 'plant'). Er pflanzt Baum um Baum der gewählten Art im Umkreis
// FORESTER.radius - um die Hütte oder um den Pflanzplatz, der wie ein
// Sammelpunkt gesetzt wird (rallyPoint). Die Bäume wachsen und sind dann
// gewöhnliche Bäume für die Holzfäller (deposits.ts, plant).

import { Color } from '../../functions/Color';
import { SHAPE } from '../../gl/entityRenderer';
import { TREE_SPECIES, type TreeSpecies } from '../catalog';
import { BuildingBase, type BuildingSave } from './BuildingBase';
import { defineBuilding } from './definition';

export class Forester extends BuildingBase {
  static readonly definition = defineBuilding({
    type: 'forester',
    label: 'Försterhütte',
    key: '0',
    color: Color.rgb(74, 128, 60),
    model: SHAPE.forester,
    size: 1,
    // Wie die Fischerhütte: eine kleine Hütte aus Holz.
    cost: { wood: 60 },
    hp: 600,
  });

  /** Die Baumart, die der Förster pflanzt. */
  species: TreeSpecies = 'oak';

  override isWorkshop(): boolean {
    return true;
  }

  /** Der Pflanzplatz: ohne ihn pflanzt er um die Hütte. */
  override hasRallyPoint(): boolean {
    return true;
  }

  /** Um diesen Punkt (Tile) pflanzt er: der Pflanzplatz, sonst die Hütte. */
  plantCenter(): { x: number; y: number } {
    return this.rallyPoint ? { x: this.rallyPoint.x, y: this.rallyPoint.y } : { x: this.x, y: this.y };
  }

  override toSave(): BuildingSave {
    return { ...super.toSave(), ts: this.species };
  }

  override restore(save: BuildingSave, scale: number) {
    super.restore(save, scale);
    if (save.ts && TREE_SPECIES[save.ts]) this.species = save.ts;
  }
}
