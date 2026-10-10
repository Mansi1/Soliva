// AnimalBase.ts
// Ein Tier (abstrakt - Deer, Hare, Cow, Sheep, Goat, Boar): äst, zieht mit
// seinem Rudel (Herd.ts) umher und flieht mit ihm vor Dorfbewohnern; erlegt
// bleibt der Kadaver liegen, bis sein Fleisch abgetragen ist. Männchen und
// Weibchen sehen je Art verschieden aus, Junge sind klein und wachsen
// (B11). Was es sieht und wohin es darf, sagt ihm die Welt
// (AnimalSurroundings) - so kennt das Tier die Welt nicht.

import type { AnimalSave } from '../save';
import type { AnimalDefinition, AnimalLook } from './definition';
import { Herd, passable } from './Herd';
import type { AnimalKind } from './index';
import { UnitBase } from './UnitBase';

export type AnimalState = 'graze' | 'walk' | 'flee' | 'dead';

/** Sekunden Spielzeit, bis ein Junges ausgewachsen ist (B11: 15 Minuten). */
export const GROWN = 15 * 60;
/** So groß ist ein Junges bei der Geburt (Anteil der Höhe), es wächst gleichmäßig. */
export const YOUNG_SIZE = 0.5;
/** Sekunden Spielzeit mit einem Männchen in der Nähe, bis ein Junges kommt (B11: 10 Minuten). */
export const BIRTH_TIME = 10 * 60;
/** So nah (Tiles) muss das Männchen dafür sein. */
export const MATE_RANGE = 3;
/** Ab so weit (Tiles) von seinem Platz im Rudel geht ein Tier ihm nach. */
const FOLLOW = 0.6;
/** So schnell dreht ein gehendes Tier (Radiant je Sekunde) - es geht Bögen statt Ecken. */
const TURN = 2;

/** Was ein Tier von seiner Umgebung wissen muss. */
export interface AnimalSurroundings {
  /** Darf es dieses Tile betreten? */
  isBlocked(tileX: number, tileY: number): boolean;
  /**
   * Ist dort Wasser, wie man es sieht? Das Ufer verläuft quer durch die
   * Tiles - ein Tile am Ufer ist oft zum Teil Wasser, und dort stand ein Tier
   * auf dem Wasser.
   */
  isWater(x: number, y: number): boolean;
  /** Geländehöhe in Tiles - steile Hänge meiden die Tiere. */
  heightAt(x: number, y: number): number;
  /** Der nächste Dorfbewohner (Lage und Abstand), oder undefined. */
  nearestThreat(x: number, y: number): { x: number; y: number; distance: number } | undefined;
}

/** Was beim Anlegen mitgegeben werden kann - aus dem Speicherstand oder bei der Geburt. */
export interface AnimalOptions {
  hp?: number;
  food?: number;
  dead?: boolean;
  /** Weibchen? Ohne: fest nach der Kennung. */
  female?: boolean;
  /** Alter in Sekunden Spielzeit - ohne: ausgewachsen. */
  age?: number;
  /** Sekunden bis zum nächsten Jungen schon vergangen (BIRTH_TIME). */
  breed?: number;
}

interface AnimalClass {
  readonly definition: AnimalDefinition;
}

export abstract class AnimalBase extends UnitBase {
  /** Nahrung am Kadaver - zählt erst, wenn es erlegt ist. */
  food: number;
  state: AnimalState;
  /** Sein Rudel - allein ein Rudel aus einem Tier. */
  herd: Herd;
  /**
   * Früher das Ziel beim Umherziehen; heute geht es zu `spot`.
   * ponytail: nur noch da, weil villagers.ts es beim Erlegen leert; streichen, wenn villagers.ts das nicht mehr tut.
   */
  target: { x: number; y: number } | null = null;
  /** Sein Platz im Rudel, gegen dessen Mitte (Tiles). */
  spot = { x: 0, y: 0 };
  /** Sekunden bis es sich einen neuen Platz im Rudel sucht. */
  timer = 5 + Math.random() * 20;
  /** Rest des Sprints bzw. des Verschnaufens (Sekunden) - nur Tiere mit `sprint`. */
  sprintSeconds: number;
  restSeconds = 0;
  readonly female: boolean;
  /** Alter in Sekunden Spielzeit; ab GROWN ausgewachsen und zählt nicht weiter. */
  age: number;
  /** Weibchen: Sekunden mit einem Männchen in der Nähe, bei BIRTH_TIME kommt ein Junges (wildlife.ts). */
  breed: number;

  constructor(id: number, x: number, y: number, options: AnimalOptions = {}) {
    super(id, x, y, Math.random() * Math.PI * 2, 0);
    const definition = this.definition;
    this.female = options.female ?? (Math.imul(id, 2654435761) >>> 0) % 2 === 1;
    this.age = Math.min(GROWN, options.age ?? GROWN);
    this.breed = options.breed ?? 0;
    this.hp = options.hp ?? definition.hp;
    this.food = options.food ?? this.maxFood;
    this.state = options.dead ? 'dead' : 'graze';
    this.sprintSeconds = definition.sprint?.time ?? 0;
    this.herd = new Herd(id, x, y);
    this.herd.members.push(this);
  }

  /** Was für alle Tiere dieser Art gilt. */
  get definition(): AnimalDefinition {
    return (this.constructor as unknown as AnimalClass).definition;
  }

  get kind(): AnimalKind {
    return this.definition.type as AnimalKind;
  }

  get label(): string {
    return this.definition.label;
  }

  get isDead(): boolean {
    return this.state === 'dead';
  }

  /** Kadaver ohne Fleisch - verschwindet. */
  get isEmptyCarcass(): boolean {
    return this.isDead && this.food <= 1e-6;
  }

  get grown(): boolean {
    return this.age >= GROWN;
  }

  /** Modell, Höhe und Schrittlänge seines Geschlechts, ausgewachsen. */
  get look(): AnimalLook {
    const d = this.definition;
    return (this.female ? d.female : d.male) ?? d;
  }

  /** Anteil der ausgewachsenen Größe: YOUNG_SIZE bei der Geburt, 1 ausgewachsen. */
  get growth(): number {
    return YOUNG_SIZE + (1 - YOUNG_SIZE) * Math.min(1, this.age / GROWN);
  }

  /** Höhe in Tiles, wie gezeichnet (Instanzgröße). */
  get size(): number {
    return this.look.height * this.growth;
  }

  /** Tiles je Durchlauf des Geh-Clips - ein Junges macht kleinere Schritte, die Hufe rutschen nicht. */
  get strideLength(): number {
    return this.look.stride * this.growth;
  }

  /** Nahrung, die der Kadaver hergibt: ein Junges die Hälfte (B11). */
  get maxFood(): number {
    return this.grown ? this.definition.food : this.definition.food / 2;
  }

  /** Geht in ein anderes Rudel; sein Platz dort ist, wo es jetzt steht. */
  joinHerd(herd: Herd) {
    const old = this.herd.members;
    old.splice(old.indexOf(this), 1);
    this.herd = herd;
    herd.members.push(this);
    this.spot = { x: this.x - herd.x, y: this.y - herd.y };
  }

  /** Für den Spielstand (save.ts). `herd`: Nummer seines Rudels im Stand. */
  toSave(herd: number): AnimalSave {
    return {
      k: this.kind, x: +this.x.toFixed(2), y: +this.y.toFixed(2), hp: this.hp, f: +this.food.toFixed(1),
      ...(this.isDead ? { d: true } : {}),
      s: this.female ? 'f' : 'm', h: herd,
      ...(this.grown ? {} : { a: Math.round(this.age) }),
      ...(this.breed > 0 ? { b: Math.round(this.breed) } : {}),
    };
  }

  /**
   * Ein Tick: wachsen, äsen, dem Rudel folgen, mit ihm fliehen - Tiere mit
   * `sprint` in kurzen Sprints. true, wenn sich etwas geändert hat, das
   * gespeichert werden soll.
   */
  tick(dt: number, surroundings: AnimalSurroundings): boolean {
    this.rememberPosition();
    if (this.isDead) return false;
    const definition = this.definition;
    const herd = this.herd;
    let changed = false;
    if (!this.grown) {
      this.age = Math.min(GROWN, this.age + dt);
      // Ausgewachsen: nun das volle Fleisch.
      if (this.grown) this.food = this.maxFood;
      changed = true;
    }
    const threat = surroundings.nearestThreat(this.x, this.y);
    // Angeschossen flieht es weiter, auch wenn der Jäger zurückbleibt.
    const wounded = this.hp < definition.hp;
    const fear = this.state === 'flee' || wounded ? definition.fear * 2 : definition.fear;
    if (threat && threat.distance < fear) herd.alert(threat);
    // Sieht eines den Dorfbewohner, flieht das ganze Rudel.
    if (herd.alarm > 0 && herd.threat) {
      this.flee(herd.threat, dt, surroundings);
      return true;
    }
    if (this.state === 'flee') {
      // Entkommen: zurück an seinen Platz im Rudel, das sich nun sammelt (Herd.gather).
      this.state = 'walk';
      this.newSpot();
    }
    this.timer -= dt;
    if (this.state === 'graze' && this.timer <= 0) {
      // Ab und zu ein paar Schritte weiter zum nächsten Büschel.
      this.newSpot();
      this.state = 'walk';
    }
    const [tx, ty] = [herd.x + this.spot.x, herd.y + this.spot.y];
    const off = this.distanceTo(tx, ty);
    if (this.state === 'graze' && off > FOLLOW) this.state = 'walk';
    if (this.state === 'walk') {
      const want = Math.atan2(ty - this.y, tx - this.x);
      const diff = Math.atan2(Math.sin(want - this.heading), Math.cos(want - this.heading));
      // Nah am Platz direkt hin, sonst im Bogen.
      const heading = off < 0.3 ? want : this.heading + Math.max(-TURN * dt, Math.min(TURN * dt, diff));
      const stuck = off >= 0.1 && !this.step(heading, definition.walk, dt, surroundings);
      if (off < 0.1 || stuck) {
        // Kommt es nicht weiter, ist hier vorerst sein Platz.
        if (stuck) this.spot = { x: this.x - herd.x, y: this.y - herd.y };
        this.state = 'graze';
        this.timer = 15 + Math.random() * 30;
      }
      return true;
    }
    return changed;
  }

  /** Ein neuer Platz im Rudel, nicht weiter als `spread` von dessen Mitte. */
  private newSpot() {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * this.herd.spread * 0.8;
    this.spot = { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
  }

  /**
   * Weg vom Dorfbewohner - etwas im Zickzack; mit `sprint` im Wechsel schnell
   * und langsam. Wer weiter als `spread` von der Mitte des Rudels ist, hält
   * zu ihm hin - so fliehen sie zusammen.
   */
  private flee(threat: { x: number; y: number }, dt: number, surroundings: AnimalSurroundings) {
    const definition = this.definition;
    this.state = 'flee';
    let speed = definition.flee;
    if (definition.sprint) {
      if (this.sprintSeconds > 0) {
        this.sprintSeconds -= dt;
        if (this.sprintSeconds <= 0) this.restSeconds = definition.sprint.rest;
      } else {
        speed = definition.sprint.slow;
        this.restSeconds -= dt;
        if (this.restSeconds <= 0) this.sprintSeconds = definition.sprint.time;
      }
    }
    let away = Math.atan2(this.y - threat.y, this.x - threat.x) + Math.sin(this.id * 1.7 + this.stride * 0.6) * 0.35;
    const herd = this.herd;
    if (this.distanceTo(herd.cx, herd.cy) > herd.spread) {
      const toHerd = Math.atan2(herd.cy - this.y, herd.cx - this.x);
      const diff = Math.atan2(Math.sin(toHerd - away), Math.cos(toHerd - away));
      // Höchstens 0.8 rad (~45°) zur Seite - nie zurück zum Dorfbewohner.
      away += Math.max(-0.8, Math.min(0.8, diff));
    }
    this.step(away, speed, dt, surroundings);
  }

  /** Ein Schritt: `speed` in Richtung `heading`, um Hindernisse herum. false, wenn es nicht weiterkommt. */
  private step(heading: number, speed: number, dt: number, surroundings: AnimalSurroundings): boolean {
    const distance = speed * dt;
    // Schon im Wasser (so entstanden): darf heraus, sonst säße es fest.
    // VERIFIED: tests/animal-ground.test.mjs - ein fliehendes Reh läuft nicht ins sichtbare Wasser.
    const wet = surroundings.isWater(this.x, this.y);
    for (const turn of [0, 0.5, -0.5, 1.1, -1.1, 1.7, -1.7]) {
      const h = heading + turn;
      const nx = this.x + Math.cos(h) * distance;
      const ny = this.y + Math.sin(h) * distance;
      if (!passable(surroundings, this.x, this.y, nx, ny, wet)) continue;
      this.x = nx;
      this.y = ny;
      this.heading = h;
      this.stride += distance;
      return true;
    }
    return false;
  }
}
