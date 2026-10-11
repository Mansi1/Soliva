// Armory.ts
// Waffenkammer - wie in Stronghold: hier kommen die Waffen hin, Bögen und
// Speere (B25), die sich den Platz teilen. Der Bogner
// trägt jeden fertigen Bogen zur nächsten Waffenkammer, die noch Platz hat -
// so füllen sie sich eine nach der anderen; ohne eine, oder wenn
// alle voll sind, wartet er mit dem Bogen in der Hand. Es passen 100 hinein,
// und alle sind zu sehen: fünf Gestelle mit je 20 stehenden Bögen im
// Modell (Stock.0 bis 99).
// ponytail: die Gestelle zeigen alle Waffen als Bögen (World.armoryStock zählt
// Bögen und Speere zusammen); eigene Speer-Gestelle ins Modell, wenn man Speere
// in der Kammer von Bögen unterscheiden soll.

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
    storedResources: ['bows', 'spears'],
    weaponCapacity: 100,
    hp: 1000,
  });
}
