// Goat.ts
// Ziege: zu zweit bis viert, trittsicher und flink - flieht früher und
// schneller als Schaf und Kuh.

import { SHAPE } from '../../gl/entityRenderer';
import { AnimalBase } from './AnimalBase';
import type { AnimalDefinition } from './definition';

export class Goat extends AnimalBase {
  static readonly definition: AnimalDefinition<'goat'> = {
    type: 'goat', label: 'Ziege',
    info: 'Ziegen fressen Gebüsch, an das andere Tiere nicht herankommen. So verbuschen Hänge nicht, und seltene Pflanzen bekommen Licht.',
    shape: SHAPE.goat, height: 0.22, hp: 2, food: 90, walk: 0.08, flee: 0.41,
    fear: 3, herd: [2, 4], stride: 0.37,
    // Das Modell ist der Bock; die Geiß ohne Hörner.
    female: { shape: SHAPE.goatFemale, height: 0.196, stride: 0.37 },
  };
}
