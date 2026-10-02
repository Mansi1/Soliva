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
  /**
   * Sammelpunkt für frisch Ausgebildete, oder null: das Tile (es zählt wie ein
   * Rechtsklick dorthin - auf ein Vorkommen sammeln sie) und `point`, die
   * genaue Stelle des Klicks - dort steht die Fahne, dorthin gehen sie.
   * Ältere Stände haben nur das Tile.
   */
  rallyPoint: { x: number; y: number; point?: { x: number; y: number } } | null = null;

  /** Die Einheit, die hier ausgebildet wird. */
  abstract get unit(): TrainableUnit;

  override isUnitProducer(): this is UnitProducer {
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

  /** Wo Ausgebildete heraustreten (Mitte, Tiles): an der Vorderkante des Gebäudes, zur Kamera hin. */
  spawnPoint(): { x: number; y: number } {
    const r = this.definition.footprint / 2 + 0.4;
    return { x: this.x + 0.5 + r, y: this.y + 0.5 + r };
  }

  /** Sammelpunkt setzen, oder mit null aufheben. */
  setRallyPoint(rally: UnitProducer['rallyPoint']) {
    this.rallyPoint = rally;
  }

  override toSave(): BuildingSave {
    return {
      ...super.toSave(),
      q: this.queue.map((u) => (u.female ? 1 : 0)),
      ...(this.rallyPoint ? { r: rallySave(this.rallyPoint) } : {}),
    };
  }

  override restore(save: BuildingSave, scale: number) {
    super.restore(save, scale);
    // Ältere Stände kennen nur die Anzahl - dann Frau oder Mann wie beim Einreihen.
    const q = save.q ?? [];
    this.queue = typeof q === 'number'
      ? Array.from({ length: q }, () => ({ female: randomFemale() }))
      : q.map((f) => ({ female: f === 1 }));
    const r = save.r;
    this.rallyPoint = r
      ? { x: r[0] * scale, y: r[1] * scale, point: r.length === 4 ? { x: r[2] * scale, y: r[3] * scale } : undefined }
      : null;
  }
}

/** Sammelpunkt im Spielstand: [Tile x, y] und, wenn bekannt, die genaue Stelle dazu. */
function rallySave(rally: NonNullable<UnitProducer['rallyPoint']>): NonNullable<BuildingSave['r']> {
  return rally.point ? [rally.x, rally.y, rally.point.x, rally.point.y] : [rally.x, rally.y];
}
