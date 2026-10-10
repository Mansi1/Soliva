// Deer.ts
// Reh: lebt in kleinen Rudeln, flieht gleichmäßig - etwas langsamer als ein
// Dorfbewohner, so holt der Jäger es ein.

import { SHAPE } from '../../gl/entityRenderer';
import { AnimalBase } from './AnimalBase';
import type { AnimalDefinition } from './definition';

export class Deer extends AnimalBase {
  static readonly definition: AnimalDefinition<'deer'> = {
    type: 'deer', label: 'Reh',
    info: 'Rehe fressen Knospen und junge Triebe und halten so den Waldrand licht. Mit ihrem Kot verteilen sie Samen über weite Strecken.',
    shape: SHAPE.deer, height: 0.27, hp: 3, food: 140, walk: 0.13, flee: 0.51,
    fear: 4, herd: [2, 4], stride: 0.41,
  };
}
