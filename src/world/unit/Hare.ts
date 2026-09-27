// Hare.ts
// Hase: allein oder zu zweit, sprintet kurz und muss dann verschnaufen.

import { SHAPE } from '../../gl/entityRenderer';
import { AnimalBase } from './AnimalBase';
import type { AnimalDefinition } from './definition';

export class Hare extends AnimalBase {
  static readonly definition: AnimalDefinition<'hare'> = {
    type: 'hare', label: 'Hase',
    info: 'Hasen fressen Kräuter und verbreiten deren Samen. Für Fuchs, Greifvögel und Eule sind sie eine wichtige Beute.',
    shape: SHAPE.hare, height: 0.13, hp: 1, food: 40, walk: 0.09, flee: 0.79,
    sprint: { time: 1.4, rest: 2.2, slow: 0.21 }, fear: 3, herd: [1, 2], stride: 0.35,
  };
}
