// UnitProducer.ts
// Ein Gebäude, das Einheiten ausbildet (abstrakt - z. B. TownCenter):
// Warteschlange, Ausbildung der vordersten Einheit, Sammelpunkt für frisch
// Ausgebildete. Welche Einheit es ausbildet, sagt die Unterklasse (`unit`).

import { MAX_TRAINING_QUEUE, type Resources } from '../catalog';
import { BuildingBase, type BuildingSave } from './BuildingBase';

/** Was ein UnitProducer über die Einheit wissen muss, die er ausbildet. */
export interface TrainableUnit {
  label: string;
  cost: Partial<Resources>;
  /** Ausbildungszeit in Sekunden. */
  trainTime: number;
}

/** Etwa jede zweite Einheit ist eine Frau - entschieden beim Einreihen. */
export const randomFemale = () => Math.random() < 0.5;

/** Eine Einheit in der Warteschlange - Frau oder Mann steht schon fest, damit das Panel sie zeigen kann. */
export interface QueuedUnit {
  female: boolean;
}

export abstract class UnitProducer extends BuildingBase {
  /** Einheiten, die noch ausgebildet werden - die vorderste zuerst. */
  queue: QueuedUnit[] = [];
  /** Sekunden, die die vorderste Einheit schon ausgebildet wird. */
  trainingSeconds = 0;
  /** Die Einheit, die hier ausgebildet wird. */
  abstract get unit(): TrainableUnit;

  override isUnitProducer(): this is UnitProducer {
    return true;
  }

  /**
   * Sammelpunkt für frisch Ausgebildete: das Tile zählt wie ein Rechtsklick
   * dorthin - auf ein Vorkommen sammeln sie -, `point` ist die genaue Stelle
   * des Klicks, dort steht die Fahne, dorthin gehen sie.
   */
  override hasRallyPoint(): boolean {
    return true;
  }

  /** Wie viele in der Warteschlange stehen. */
  get queuedUnits(): number {
    return this.queue.length;
  }

  get isQueueFull(): boolean {
    return this.queuedUnits >= MAX_TRAINING_QUEUE;
  }

  /** Eine Einheit in die Warteschlange - false, wenn sie voll ist. */
  enqueueUnit(female = randomFemale()): boolean {
    if (this.isQueueFull) return false;
    this.queue.push({ female });
    return true;
  }

  /**
   * Nimmt die Einheit an Platz `index` (0 = die vorderste) aus der
   * Warteschlange - null, wenn es den Platz nicht gibt. Fortschritt gibt es
   * nur für die vorderste: fällt sie weg, beginnt die nächste von vorn.
   * VERIFIED: tests/training-queue.test.mjs (wartende und vorderste Einheit).
   */
  cancelUnit(index: number): QueuedUnit | null {
    if (!Number.isInteger(index) || index < 0 || index >= this.queue.length) return null;
    if (index === 0) this.trainingSeconds = 0;
    return this.queue.splice(index, 1)[0];
  }

  /** Fortschritt der vordersten Einheit, 0..1. */
  trainingProgress(): number {
    return this.queuedUnits > 0 ? Math.min(1, this.trainingSeconds / this.unit.trainTime) : 0;
  }

  /**
   * Bildet `dt` Sekunden weiter aus. Die Einheit, wenn dabei eine fertig
   * wurde - sie verlässt die Warteschlange, die nächste beginnt von vorn.
   */
  train(dt: number): QueuedUnit | null {
    if (this.queue.length === 0) return null;
    this.trainingSeconds += dt;
    if (this.trainingSeconds < this.unit.trainTime) return null;
    this.trainingSeconds = 0;
    return this.queue.shift()!;
  }

  override toSave(): BuildingSave {
    return {
      ...super.toSave(),
      q: this.queue.map((u) => (u.female ? 1 : 0)),
    };
  }

  override restore(save: BuildingSave, scale: number) {
    super.restore(save, scale);
    // Ältere Stände kennen nur die Anzahl - dann Frau oder Mann wie beim Einreihen.
    const q = save.q ?? [];
    this.queue = typeof q === 'number'
      ? Array.from({ length: q }, () => ({ female: randomFemale() }))
      : q.map((f) => ({ female: f === 1 }));
  }
}
