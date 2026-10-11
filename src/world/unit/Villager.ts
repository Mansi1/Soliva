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
import { SHOES, VILLAGER, type DepositType, type ResourceKind, type Shoes, type Weapon } from '../catalog';
import type { Skills } from './skills';
import { UnitBase } from './UnitBase';

/**
 * Was ein Dorfbewohner gerade tun soll. Der Zustand (hingehen, sammeln,
 * abliefern) ergibt sich daraus und aus dem, was er trägt.
 */
export type Task =
  | { kind: 'idle' }
  | { kind: 'move'; x: number; y: number }
  /**
   * Sammelt am Feld (x, y), bringt volle Ladungen zum nächsten Lager.
   * `slot`: sein Platz am Feld (0..MAX_GATHERERS-1), vergeben bei Ankunft.
   */
  | { kind: 'gather'; type: DepositType; x: number; y: number; delivering: boolean; slot?: number }
  /** Bringt die Ladung zu genau diesem Gebäude, danach untätig. */
  | { kind: 'deliver'; building: string }
  /**
   * Jagt dieses Tier (Speerwurf aus der Nähe), zerlegt den Kadaver und bringt
   * das Fleisch zum nächsten Lager für Nahrung. `cooldown`: Sekunden bis zum
   * nächsten Wurf. Ohne Speer holt er erst einen aus der Waffenkammer
   * `armory` (undefined: noch nicht gesucht, null: keine hat einen - er jagt
   * mit bloßen Händen, B25). `chase`: Sekunden, die er ohne Speer schon
   * hinterherläuft (VillagerWork.hopeless).
   */
  | { kind: 'hunt'; animal: number; delivering: boolean; cooldown: number; armory?: string | null; chase?: number }
  /** Bestellt und erntet das Feld, bringt die Ernte zum nächsten Lager für Nahrung. */
  | { kind: 'farm'; building: string; row: number; delivering: boolean }
  /**
   * Arbeitet in der Werkstatt (Bognerei): geht erst durch ihre Tür hinein
   * (`enter`), holt dann Holz vom nächsten Lager
   * (`fetch`), schnitzt an der Werkbank (`carve`, Fortschritt 0..1) und trägt
   * den Bogen zur nächsten Waffenkammer (`deliver`) - dann von vorn.
   * `leave`: entlassen (siehe VillagerWork.dismiss).
   */
  | { kind: 'craft'; building: string; step: 'enter' | 'fetch' | 'carve' | 'deliver'; progress: number; leave?: boolean; leather?: boolean }
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
    }
  /**
   * Förster der Försterhütte `building`: geht hinein (`enter`), sucht ein
   * freies Tile im Umkreis (`choose`; findet er keins, wartet er `progress`
   * Sekunden), geht hin (`walk`), gräbt und setzt den Baum (`dig`,
   * Fortschritt 0..1) und geht zurück in die Hütte. (x, y): das Tile.
   * `leave`: entlassen.
   */
  | { kind: 'plant'; building: string; step: 'enter' | 'choose' | 'walk' | 'dig'; progress: number; x?: number; y?: number; leave?: boolean }
  /**
   * Übt am Schießplatz `building` auf Platz `slot` (B24, world/archery.ts):
   * geht hin (`walk`), holt ohne Bogen einen aus der Waffenkammer `armory`
   * (`fetch`, wie der Jäger seinen Speer) und schießt (`practise`, `progress`
   * 0..1 je Schuss).
   */
  | { kind: 'archery'; building: string; slot: number; step: 'walk' | 'fetch' | 'practise'; progress: number; armory?: string | null }
  /**
   * Hirte der Weide, zu der das Tile `pasture` gehört (B27, world/pasture.ts):
   * fängt das Tier `animal` (`catch`, ohne Speer wie beim Jagen, `chase`
   * Sekunden), führt es am Strick durchs Gatter (`lead`, `progress` =
   * Wegstück), hütet (`tend`: Milch und Wolle holen), schlachtet (`slaughter`)
   * und bringt die Ladung zum Lager (`deliver`).
   */
  | { kind: 'tend'; pasture: string; step: TendStep; animal?: number; progress: number; chase?: number };

export type TendStep = 'catch' | 'lead' | 'tend' | 'slaughter' | 'deliver';

/**
 * Was einem Arbeiter in der Werkstatt fehlt, solange er wartet: Holz (kein
 * Lager oder zu wenig im Vorrat), eine Waffenkammer mit Platz, ein Ufer zum
 * Fischen. Über der Werkstatt steht es durchgestrichen (render.ts).
 */
export type WorkNeed = 'wood' | 'armory' | 'water';

export type FishStep = 'enter' | 'choose' | 'boat' | 'launch' | 'row' | 'empty' | 'return' | 'land' | 'shore' | 'angle' | 'net';

/**
 * Was ein Dorfbewohner bei sich hat außer der Ladung - es bleibt bei jedem
 * Auftrag und geht nie zurück ins Lager (B25: der Speer gehört dem, der ihn
 * genommen hat). Ein Fach für die Waffe (der Bogen, B24, kommt als Wert
 * dazu) und eins für die Schuhe (B31): null heißt barfuß.
 */
export interface Inventory {
  weapon: Weapon | null;
  shoes: Shoes | null;
}

export class Villager extends UnitBase {
  carrying = 0;
  /** Seine Habe (Inventory) - im Spielstand gespeichert. */
  inventory: Inventory = { weapon: null, shoes: null };
  /** Fähigkeiten: Sekunden Übung je Arbeit (B24, skills.ts) - im Spielstand `sk`. */
  skills: Skills = {};
  carryType: ResourceKind | null = null;
  task: Task = { kind: 'idle' };
  /** Warum er untätig ist, falls es einen Grund gibt - für die Anzeige. */
  problem: string | null = null;
  /**
   * Werkstatt-Arbeiter: worauf er gerade wartet - null, solange er arbeitet. Je Tick neu gesetzt.
   * VERIFIED: tests/workshop-reason.test.mjs - ohne Holz 'wood', ohne Waffenkammer 'armory'.
   */
  need: WorkNeed | null = null;
  /**
   * Gebäude, zu denen er zu Fuß keinen Weg fand - nearestDropSite übergeht
   * sie. Nicht gespeichert, beim neuen Auftrag geleert.
   * ponytail: ein Fehlschlag gilt bis zum nächsten Auftrag; zeitlich verfallen
   * lassen, wenn sich Wege oft erst später öffnen (gefällter Wald).
   */
  unreachable = new Set<string>();
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

  /**
   * Tiles je Sekunde: barfuß VILLAGER.speed, mit Schuhen schneller (SHOES).
   * VERIFIED: tests/shoes.test.mjs - mit Holzschuhen 10 % weiter in derselben Zeit.
   */
  get speed(): number {
    return VILLAGER.speed * (this.inventory.shoes ? SHOES[this.inventory.shoes].speed : 1);
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
    this.need = null;
    this.unreachable.clear();
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
