// Boar.ts
// Wildschwein: allein oder zu wenigen, schwer und zäh - hält viele Speerwürfe
// aus, gibt dafür viel Nahrung.

import { SHAPE } from '../../gl/entityRenderer';
import { AnimalBase } from './AnimalBase';
import type { AnimalDefinition } from './definition';

export class Boar extends AnimalBase {
  static readonly definition: AnimalDefinition<'boar'> = {
    type: 'boar', label: 'Wildschwein',
    info: 'Wildschweine wühlen den Boden nach Wurzeln und Larven um. So lockern sie die Erde, und Samen finden offenen Boden zum Keimen.',
    shape: SHAPE.boar, height: 0.185, hp: 6, food: 220, walk: 0.08, flee: 0.38,
    fear: 3.5, herd: [1, 3], stride: 0.32,
    // Das Modell ist der Keiler; die Bache ohne Hauer.
    female: { shape: SHAPE.boarFemale, height: 0.185, stride: 0.32 },
  };
}
