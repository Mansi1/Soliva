// Cow.ts
// Kuh: steht in kleinen Herden auf der Wiese, lässt Dorfbewohner nah heran
// und trottet nur gemächlich davon - leichte Beute, gibt viel Nahrung.

import { SHAPE } from '../../gl/entityRenderer';
import { AnimalBase } from './AnimalBase';
import type { AnimalDefinition } from './definition';

export class Cow extends AnimalBase {
  static readonly definition: AnimalDefinition<'cow'> = {
    type: 'cow', label: 'Kuh',
    info: 'Kühe halten Weiden offen, damit dort Blumen wachsen. In ihrem Dung leben Käfer - Futter für die Vögel.',
    shape: SHAPE.cow, height: 0.3, hp: 5, food: 250, walk: 0.07, flee: 0.21,
    fear: 1.5, herd: [2, 5], stride: 0.6,
  };
}
