// FisherHut.ts
// Fischerhütte: steht am Wasser, ein Dorfbewohner arbeitet hier als Fischer
// (villagers.ts, Auftrag 'fish'). Er leert die Reusen (FishTrap) mit dem Boot
// oder angelt am Ufer und legt den Fang ins Netz an der Hütte. Nimmt auch
// sonst Nahrung an, wie die Mühle.

import { Color } from '../../functions/Color';
import { SHAPE } from '../../gl/entityRenderer';
import { defineBuilding } from './definition';
import { StorageBuilding } from './StorageBuilding';

export class FisherHut extends StorageBuilding {
  static readonly definition = defineBuilding({
    type: 'fisher_hut',
    label: 'Fischerhütte',
    key: '9',
    color: Color.rgb(70, 120, 160),
    model: SHAPE.fisherHut,
    size: 1,
    cost: { wood: 60 },
    storedResources: ['food'],
    hp: 600,
  });

  override isWorkshop(): boolean {
    return true;
  }
}
