// research.ts
// Forschung im Dorfzentrum (Vorgabe des Spielers, 2026-10-10): kostet
// Rohstoffe und Zeit und schaltet etwas frei - Lederschuhe beim Schuster
// (B31) und Steinmauern (B34, hier nur der Schalter).
//
// Gewählt: ein Platz je Dorfzentrum statt einer Warteschlange wie beim
// Ausbilden - es gibt nur zwei Forschungen, eine Schlange wäre mehr Oberfläche
// als Nutzen. Bezahlt wird beim Start, ein Abbruch gibt alles zurück. Was
// erforscht ist, gilt für das ganze Dorf. Gespeichert wird beides im
// Spielstand unter `research` (save.ts); ältere Stände haben nichts erforscht.

import { LEATHER_SHOES, craftRecipe, type CraftRecipe, type Resources } from './catalog';

export type ResearchId = 'leather_shoes' | 'stone_walls';

export interface ResearchDef {
  label: string;
  /** Was sie freischaltet - für den Tooltip. */
  info: string;
  cost: Partial<Resources>;
  /** Sekunden. */
  time: number;
}

/**
 * Die Forschungen. Gerberei kostet Leder - wer Lederschuhe will, braucht
 * ohnehin Jagd oder Weide. Die Steinmauer kostet vor allem Stein, wie die
 * Mauern später selbst.
 */
export const RESEARCH: Record<ResearchId, ResearchDef> = {
  leather_shoes: { label: 'Gerberei', info: 'Der Schuster macht Lederschuhe aus Leder - 20 % schneller als barfuß', cost: { wood: 100, leather: 10 }, time: 45 },
  stone_walls: { label: 'Steinmauer', info: 'Mauern aus Stein bauen', cost: { wood: 50, stone: 150 }, time: 60 },
};

export const RESEARCH_ORDER: ResearchId[] = ['leather_shoes', 'stone_walls'];

/** Im Spielstand: erforscht, und was je Dorfzentrum (Anker) gerade läuft - Sekunden schon geforscht. */
export interface ResearchSave {
  done?: ResearchId[];
  running?: Record<string, { id: ResearchId; s: number }>;
}

/** Was Research von der Welt braucht: bezahlen und erstatten. */
interface Payer {
  canPay(cost: Partial<Resources>): boolean;
  pay(cost: Partial<Resources>, factor?: number): void;
}

const isResearch = (id: unknown): id is ResearchId => typeof id === 'string' && id in RESEARCH;

export class Research {
  /** Erforscht - fürs ganze Dorf. */
  readonly done = new Set<ResearchId>();
  /** Je Dorfzentrum (Anker) die laufende Forschung. */
  readonly running = new Map<string, { id: ResearchId; seconds: number }>();

  has(id: ResearchId): boolean {
    return this.done.has(id);
  }

  /** Läuft `id` schon irgendwo? */
  private isRunning(id: ResearchId): boolean {
    for (const r of this.running.values()) if (r.id === id) return true;
    return false;
  }

  /** Fortschritt der Forschung in diesem Dorfzentrum, 0..1 (0 ohne). */
  progress(anchor: string): number {
    const r = this.running.get(anchor);
    return r ? Math.min(1, r.seconds / RESEARCH[r.id].time) : 0;
  }

  /** Warum `id` hier nicht beginnen kann - null, wenn es geht. */
  blocker(world: Payer, anchor: string, id: ResearchId): string | null {
    if (this.done.has(id)) return 'Schon erforscht';
    if (this.running.has(anchor)) return 'Hier wird schon geforscht';
    if (this.isRunning(id)) return 'Wird schon in einem anderen Dorfzentrum erforscht';
    if (!world.canPay(RESEARCH[id].cost)) return 'Zu wenig Rohstoffe';
    return null;
  }

  /**
   * Beginnt `id` im Dorfzentrum `anchor` und bezahlt sie - sonst der Grund.
   * VERIFIED: tests/research.test.mjs - bezahlt, wird fertig, nicht doppelt, nicht ohne Rohstoffe.
   */
  start(world: Payer, anchor: string, id: ResearchId): string | null {
    const reason = this.blocker(world, anchor, id);
    if (reason) return reason;
    world.pay(RESEARCH[id].cost);
    this.running.set(anchor, { id, seconds: 0 });
    return null;
  }

  /**
   * Bricht die Forschung dieses Dorfzentrums ab - die Kosten kommen voll zurück.
   * VERIFIED: tests/research.test.mjs - Abbruch erstattet alles.
   */
  cancel(world: Payer, anchor: string): string | null {
    const r = this.running.get(anchor);
    if (!r) return 'Hier wird nicht geforscht';
    this.running.delete(anchor);
    world.pay(RESEARCH[r.id].cost, -1);
    return null;
  }

  /**
   * Forscht `dt` Sekunden weiter. `exists(anchor)`: steht das Dorfzentrum
   * noch? Ist es weg (abgerissen), ist seine Forschung verloren - wie die
   * Ausbildung darin. True, wenn sich etwas geändert hat (fertig oder verloren).
   */
  tick(dt: number, exists: (anchor: string) => boolean): boolean {
    let changed = false;
    for (const [anchor, r] of this.running) {
      if (!exists(anchor)) {
        this.running.delete(anchor);
        changed = true;
        continue;
      }
      r.seconds += dt;
      if (r.seconds < RESEARCH[r.id].time) continue;
      this.running.delete(anchor);
      this.done.add(r.id);
      changed = true;
    }
    return changed;
  }

  toSave(): ResearchSave | undefined {
    if (this.done.size === 0 && this.running.size === 0) return undefined;
    return {
      ...(this.done.size > 0 ? { done: [...this.done] } : {}),
      ...(this.running.size > 0
        ? { running: Object.fromEntries([...this.running].map(([a, r]) => [a, { id: r.id, s: +r.seconds.toFixed(2) }])) }
        : {}),
    };
  }

  /** Übernimmt einen Stand - Unbekanntes (andere Fassung) fällt weg, ältere Stände haben nichts. */
  restore(save: ResearchSave | undefined) {
    this.done.clear();
    this.running.clear();
    for (const id of save?.done ?? []) if (isResearch(id)) this.done.add(id);
    for (const [anchor, r] of Object.entries(save?.running ?? {})) {
      if (isResearch(r?.id) && !this.done.has(r.id) && Number.isFinite(r.s)) this.running.set(anchor, { id: r.id, seconds: Math.max(0, r.s) });
    }
  }
}

/**
 * Das Rezept, nach dem ein Arbeiter der Werkstatt `type` gerade arbeitet:
 * der Schuster mit `leather` (Auftrag 'craft') Lederschuhe, sonst das Rezept
 * der Werkstatt.
 */
export function craftTaskRecipe(type: string, task: { leather?: boolean }): CraftRecipe | undefined {
  return type === 'cobbler' && task.leather ? LEATHER_SHOES : craftRecipe(type);
}
