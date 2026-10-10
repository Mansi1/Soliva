// TownCenter.ts
// Dorfzentrum: bildet Dorfbewohner aus, nimmt alle Rohstoffe an und schafft
// Wohnraum für zehn - wie in AoE2 reicht es am Anfang allein.

import { Color } from '../../functions/Color';
import { SHAPE } from '../../gl/entityRenderer';
import { VILLAGER } from '../catalog';
import { GATHERED_KINDS } from './common';
import { defineBuilding } from './definition';
import { UnitProducer, type TrainableUnit } from './UnitProducer';

export class TownCenter extends UnitProducer {
  static readonly definition = defineBuilding({
    type: 'town_center',
    label: 'Dorfzentrum',
    key: '1',
    // Spielerfarbe - wie der Kittel der Dorfbewohner. Sie steht auf Fahne und
    // Bannern des Modells (Material Paint).
    color: Color.rgb(70, 110, 190),
    model: SHAPE.townCenter,
    size: 2,
    footprint: 3,
    cost: { wood: 200, stone: 100 },
    housing: 10,
    storedResources: GATHERED_KINDS,
    hp: 2400,
  });

  get unit(): TrainableUnit {
    return VILLAGER;
  }
}
