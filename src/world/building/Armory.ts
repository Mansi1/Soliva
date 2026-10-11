// Armory.ts
// Waffenkammer - wie in Stronghold: hier kommen die Waffen hin. Der Bogner
// trägt jeden fertigen Bogen zur nächsten Waffenkammer, die noch Platz hat -
// so füllen sie sich eine nach der anderen; ohne eine, oder wenn
// alle voll sind, wartet er mit dem Bogen in der Hand. Es passen 100 hinein,
// und alle sind zu sehen: fünf Gestelle mit je 20 stehenden Bögen im
// Modell (Stock.0 bis 99).

import { Color } from '../../functions/Color';
import { SHAPE } from '../../gl/entityRenderer';
import { defineBuilding } from './definition';
import { StorageBuilding } from './StorageBuilding';

export class Armory extends StorageBuilding {
  static readonly definition = defineBuilding({
    type: 'armory',
    label: 'Waffenkammer',
    key: '8',
    color: Color.rgb(140, 70, 60),
    model: SHAPE.armory,
    size: 1,
    cost: { wood: 50, stone: 50 },
    storedResources: ['bows'],
    weaponCapacity: 100,
    hp: 1000,
  });
}
