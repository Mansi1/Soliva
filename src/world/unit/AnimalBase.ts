// AnimalBase.ts
// Ein Tier (abstrakt - Deer, Hare, Cow, Sheep, Goat, Boar): äst, zieht um seinen Platz herum und
// flieht vor Dorfbewohnern; erlegt bleibt der Kadaver liegen, bis sein
// Fleisch abgetragen ist. Was es sieht und wohin es darf, sagt ihm die Welt
// (AnimalSurroundings) - so kennt das Tier die Welt nicht.

import type { AnimalDefinition } from './definition';
import type { AnimalKind } from './index';
import { UnitBase } from './UnitBase';

export type AnimalState = 'graze' | 'walk' | 'flee' | 'dead';

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
  /** Der nächste Dorfbewohner (Lage und Abstand), oder undefined. */
  nearestThreat(x: number, y: number): { x: number; y: number; distance: number } | undefined;
}

/** Was beim Anlegen mitgegeben werden kann - aus dem Speicherstand. */
export interface AnimalOptions {
  hp?: number;
  food?: number;
  dead?: boolean;
}

interface AnimalClass {
  readonly definition: AnimalDefinition;
}

export abstract class AnimalBase extends UnitBase {
  /** Nahrung am Kadaver - zählt erst, wenn es erlegt ist. */
  food: number;
  /** Wo das Rudel steht - dort zieht es umher. */
  home: { x: number; y: number };
  state: AnimalState;
  target: { x: number; y: number } | null = null;
  /** Sekunden bis zum nächsten Umherziehen. */
  timer = 2 + Math.random() * 6;
  /** Rest des Sprints bzw. des Verschnaufens (Sekunden) - nur Tiere mit `sprint`. */
  sprintSeconds: number;
  restSeconds = 0;

  constructor(id: number, x: number, y: number, options: AnimalOptions = {}) {
    super(id, x, y, Math.random() * Math.PI * 2, 0);
    const definition = this.definition;
    this.hp = options.hp ?? definition.hp;
    this.food = options.food ?? definition.food;
    this.home = { x, y };
    this.state = options.dead ? 'dead' : 'graze';
    this.sprintSeconds = definition.sprint?.time ?? 0;
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

  /**
   * Ein Tick: äsen, umherziehen, fliehen - Tiere mit `sprint` in kurzen
   * Sprints. true, wenn sich etwas geändert hat, das gespeichert werden soll.
   */
  tick(dt: number, surroundings: AnimalSurroundings): boolean {
    this.rememberPosition();
    if (this.isDead) return false;
    const definition = this.definition;
    const threat = surroundings.nearestThreat(this.x, this.y);
    // Angeschossen flieht es weiter, auch wenn der Jäger zurückbleibt.
    const wounded = this.hp < definition.hp;
    const fear = this.state === 'flee' || wounded ? definition.fear * 2 : definition.fear;
    if (threat && threat.distance < fear) {
      this.flee(threat, dt, surroundings);
      return true;
    }
    if (this.state === 'flee') {
      // Entkommen: hier ist jetzt sein Platz.
      this.state = 'graze';
      this.home = { x: this.x, y: this.y };
      this.timer = 3 + Math.random() * 5;
    }
    if (this.state === 'graze') {
      this.timer -= dt;
      if (this.timer > 0) return false;
      const angle = Math.random() * Math.PI * 2;
      const r = 0.5 + Math.random() * 2.5;
      this.target = { x: this.home.x + Math.cos(angle) * r, y: this.home.y + Math.sin(angle) * r };
      this.state = 'walk';
    }
    if (this.state === 'walk' && this.target) {
      const arrived = this.distanceTo(this.target.x, this.target.y) < 0.1;
      const heading = Math.atan2(this.target.y - this.y, this.target.x - this.x);
      if (arrived || !this.step(heading, definition.walk, dt, surroundings)) {
        this.state = 'graze';
        this.target = null;
        this.timer = 4 + Math.random() * 8;
      }
      return true;
    }
    return false;
  }

  /** Weg vom Dorfbewohner - etwas im Zickzack; mit `sprint` im Wechsel schnell und langsam. */
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
    const away = Math.atan2(this.y - threat.y, this.x - threat.x) + Math.sin(this.id * 1.7 + this.stride * 0.6) * 0.35;
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
      if (surroundings.isBlocked(Math.floor(nx), Math.floor(ny)) || (!wet && surroundings.isWater(nx, ny))) continue;
      this.x = nx;
      this.y = ny;
      this.heading = h;
      this.stride += distance;
      return true;
    }
    return false;
  }
}
