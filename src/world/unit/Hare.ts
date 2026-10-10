// Hare.ts
// Hase: allein oder zu zweit, sprintet kurz und muss dann verschnaufen.

import { SHAPE } from '../../gl/entityRenderer';
import { AnimalBase } from './AnimalBase';
import type { AnimalDefinition } from './definition';

// ponytail: im Sprint hüpft er ~2.5-mal je Sekunde Spielzeit (hop_flee trägt
// ihn 0.32 Tiles weit) - bei Spieltempo 2.5 flimmern die Beine; einen
// Clip mit weiteren Sprüngen bauen, wenn das beim Jagen stört.
export class Hare extends AnimalBase {
  static readonly definition: AnimalDefinition<'hare'> = {
    type: 'hare', label: 'Hase',
    info: 'Hasen fressen Kräuter und verbreiten deren Samen. Für Fuchs, Greifvögel und Eule sind sie eine wichtige Beute.',
    shape: SHAPE.hare, height: 0.11, hp: 1, food: 40, walk: 0.09, flee: 0.79,
    sprint: { time: 1.4, rest: 2.2, slow: 0.21 }, fear: 3, herd: [1, 2], stride: 0.18,
  };
}
