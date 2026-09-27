// Villager.ts
// Ein Dorfbewohner: Name und Geschlecht, sein Auftrag (Task), was er trägt,
// was er gerade tut (Pose, für die Animation) und sein Weg. Wie er einen
// Auftrag Schritt für Schritt ausführt, bestimmt die Welt - hier steht nur,
// was ein Dorfbewohner ist und hat.
//
// Achtung Kreis-Import: catalog.ts lädt unit/ (für ANIMALS). VILLAGER aus
// catalog.ts darum nur in Methoden benutzen, nie beim Laden der Klasse
// (keine statischen Felder, keine Vorgaben auf Klassenebene).

import { POSE } from '../../gl/entityRenderer';
import { VILLAGER, type DepositType, type ResourceKind } from '../catalog';
import { UnitBase } from './UnitBase';

/**
 * Was ein Dorfbewohner gerade tun soll. Der Zustand (hingehen, sammeln,
 * abliefern) ergibt sich daraus und aus dem, was er trägt.
 */
export type Task =
  | { kind: 'idle' }
  | { kind: 'move'; x: number; y: number }
  /** Sammelt am Feld (x, y), bringt volle Ladungen zum nächsten Lager. */
  | { kind: 'gather'; type: DepositType; x: number; y: number; delivering: boolean }
  /** Bringt die Ladung zu genau diesem Gebäude, danach untätig. */
  | { kind: 'deliver'; building: string }
  /**
   * Jagt dieses Tier (Speerwurf aus der Nähe), zerlegt den Kadaver und bringt
   * das Fleisch zum nächsten Lager für Nahrung. `cooldown`: Sekunden bis zum
   * nächsten Wurf.
   */
  | { kind: 'hunt'; animal: number; delivering: boolean; cooldown: number }
  /** Bestellt und erntet das Feld, bringt die Ernte zum nächsten Lager für Nahrung. */
  | { kind: 'farm'; building: string; row: number; delivering: boolean }
  /**
   * Arbeitet in der Werkstatt (Bognerei): geht erst durch ihre Tür hinein
   * (`enter`), holt dann Holz vom nächsten Lager
   * (`fetch`), schnitzt an der Werkbank (`carve`, Fortschritt 0..1) und trägt
   * den Bogen zur nächsten Waffenkammer (`deliver`) - dann von vorn.
   * `leave`: entlassen (siehe VillagerWork.dismiss).
   */
  | { kind: 'craft'; building: string; step: 'enter' | 'fetch' | 'carve' | 'deliver'; progress: number; leave?: boolean }
  /**
   * Fischer der Fischerhütte `building`. Geht erst durch ihre Tür hinein
   * (`enter`). Mit Boot zur vollen Reuse `trap`:
   * Boot holen (`boat`), ins Wasser ziehen (`launch`), hinrudern (`row`),
   * leeren (`empty`), zurückrudern (`return`), an Land ziehen (`land`). Ohne
   * volle Reuse zum Ufer (`shore`) und angeln (`angle`). Den Fang (`fish`
   * Nahrung) legt er ins Netz (`net`), dann sucht er neu (`choose`).
   * `shore`: Stelle am Ufer - an Land (x, y) und im Wasser (wx, wy).
   * `progress` 0..1: Angeln bzw. Leeren. `leave`: entlassen.
   */
  | {
      kind: 'fish'; building: string; step: FishStep; progress: number; fish: number;
      trap?: string; shore?: { x: number; y: number; wx: number; wy: number }; leave?: boolean;
    };

export type FishStep = 'enter' | 'choose' | 'boat' | 'launch' | 'row' | 'empty' | 'return' | 'land' | 'shore' | 'angle' | 'net';

export class Villager extends UnitBase {
  carrying = 0;
  carryType: ResourceKind | null = null;
  task: Task = { kind: 'idle' };
  /** Warum er untätig ist, falls es einen Grund gibt - für die Anzeige. */
  problem: string | null = null;
  /** Was er im letzten Tick getan hat - steuert die Animation (POSE). */
  pose: number = POSE.stand;
  /** Sekunden bei der Arbeit - Takt der Arm-Animation. */
  workTime = 0;
  prevWorkTime = 0;
  /**
   * Weg zum aktuellen Ziel: die noch offenen Wegpunkte und für welches Ziel
   * er berechnet ist. Nicht gespeichert - nach dem Laden neu gesucht.
   */
  path: { x: number; y: number }[] | null = null;
  pathTarget: { x: number; y: number } | null = null;
  /** Sekunden, die er noch im Gebäude ist (abladen) - solange unsichtbar. */
  inside = 0;

  /**
   * @param name Vorname - solange er lebt, trägt ihn kein anderer (siehe names.ts)
   * @param female Dorfbewohnerin (Kleid, Schürze) oder Dorfbewohner
   */
  constructor(id: number, x: number, y: number, readonly name: string, readonly female: boolean) {
    // Zur Kamera gewandt: die schaut entlang -(1, 1).
    super(id, x, y, Math.PI * 0.25, VILLAGER.hp);
  }

  get maxHp(): number {
    return VILLAGER.hp;
  }

  /** "Dorfbewohnerin" oder "Dorfbewohner". */
  get role(): string {
    return this.female ? 'Dorfbewohnerin' : VILLAGER.label;
  }

  /** Im Gebäude (beim Abladen) sieht man ihn nicht. */
  get isVisible(): boolean {
    return this.inside <= 0;
  }

  get isIdle(): boolean {
    return this.task.kind === 'idle';
  }

  get isFull(): boolean {
    return this.carrying >= VILLAGER.capacity - 1e-6;
  }

  override rememberPosition() {
    super.rememberPosition();
    this.prevWorkTime = this.workTime;
  }

  /** Neuer Auftrag - aus dem Gebäude heraus, ohne alten Grund zum Nichtstun. */
  assign(task: Task) {
    this.inside = 0;
    this.task = task;
    this.problem = null;
  }

  /** Nimmt `amount` dieser Art auf; eine andere Ladung lässt er fallen - wie in AoE2. */
  pickUp(kind: ResourceKind, amount: number) {
    if (this.carryType !== kind) {
      this.carrying = 0;
      this.carryType = kind;
    }
    this.carrying += amount;
  }

  /** Lädt alles ab und gibt zurück, was er trug. */
  unload(): { kind: ResourceKind; amount: number } | null {
    const load = this.carryType && this.carrying > 0 ? { kind: this.carryType, amount: this.carrying } : null;
    this.carrying = 0;
    this.carryType = null;
    return load;
  }
}
