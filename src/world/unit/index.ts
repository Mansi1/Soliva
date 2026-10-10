// index.ts
// Figuren auf der Karte als Klassen - die EINZIGE Liste der Tierarten:
// ANIMAL_CLASSES. Daraus folgen AnimalKind und ANIMALS (Definition je Art).
//
//   UnitBase (abstrakt)          Lage, Blickrichtung, Trefferpunkte, Schritte
//    ├─ Villager                 Auftrag, Ladung, Name
//    └─ AnimalBase (abstrakt)    äsen, umherziehen, fliehen, Kadaver
//        ├─ Deer
//        ├─ Hare
//        ├─ Cow
//        ├─ Sheep
//        ├─ Goat
//        └─ Boar

import { AnimalBase, type AnimalOptions, type AnimalState, type AnimalSurroundings } from './AnimalBase';
import type { AnimalDefinition } from './definition';
import { Boar } from './Boar';
import { Cow } from './Cow';
import { Deer } from './Deer';
import { Goat } from './Goat';
import { Hare } from './Hare';
import { Sheep } from './Sheep';
import { UnitBase } from './UnitBase';
import { Villager, type Task, type WorkNeed } from './Villager';

export { UnitBase, Villager, type Task, type WorkNeed, AnimalBase, Deer, Hare, Cow, Sheep, Goat, Boar, type AnimalDefinition, type AnimalOptions, type AnimalState, type AnimalSurroundings };

/** Alle Tierklassen. */
export const ANIMAL_CLASSES = [Deer, Hare, Cow, Sheep, Goat, Boar] as const;

/** Kennung einer Tierart, z. B. 'deer'. */
export type AnimalKind = (typeof ANIMAL_CLASSES)[number]['definition']['type'];

/** Ein Tier auf der Karte - welcher Art auch immer. */
export type Animal = AnimalBase;

type AnimalConstructor = { readonly definition: AnimalDefinition } &
  (new (id: number, x: number, y: number, options?: AnimalOptions) => Animal);

const CLASS_BY_KIND = Object.fromEntries(ANIMAL_CLASSES.map((c) => [c.definition.type, c])) as
  Record<AnimalKind, AnimalConstructor>;

/** Definition je Art. */
export const ANIMALS = Object.fromEntries(ANIMAL_CLASSES.map((c) => [c.definition.type, c.definition])) as
  Record<AnimalKind, AnimalDefinition>;

export function isAnimalKind(kind: string): kind is AnimalKind {
  return kind in CLASS_BY_KIND;
}

/** Neues Tier in der Klasse seiner Art. */
export function createAnimal(kind: AnimalKind, id: number, x: number, y: number, options?: AnimalOptions): Animal {
  return new CLASS_BY_KIND[kind](id, x, y, options);
}
