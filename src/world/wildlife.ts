// wildlife.ts
// Das Wild der Welt: welche Tiere es gibt, wo neue entstehen und was aus
// Kadavern wird. Tiere entstehen stückweise nahe der Kamera - fest nach Seed
// und Lage: auf Wiese und Waldboden mal ein Rudel Rehe, mal ein, zwei Hasen,
// mal eine kleine Herde Kühe, Schafe oder Ziegen, mal Wildschweine. Ein
// Männchen und ein Weibchen im Rudel bekommen Junge, bis es HERD_MAX Tiere hat.
// Wie ein einzelnes Tier sich verhält, steht in unit/AnimalBase.ts, wie ein
// Rudel zieht in unit/Herd.ts.

import type { Terrain } from '../map';
import type { AnimalSave } from './save';
import {
  ANIMALS, BIRTH_TIME, HERD_MAX, MATE_RANGE, createAnimal, isAnimalKind,
  type Animal, type AnimalKind, type AnimalOptions, type AnimalSurroundings, type Herd,
} from './unit';

/** Kantenlänge (Tiles) der Stücke, in denen Tiere entstehen - je Stück höchstens ein Rudel. */
const CHUNK = 24;
/** Tiere entstehen nur so nah an der Kamera (Tiles) - herausgezoomt sonst Tausende. */
const SPAWN_RADIUS = 60;
/** Ein Tier ohne Rudel schließt sich einem der Art an, dessen Mitte so nah ist (Tiles). */
const JOIN_RANGE = 3;

/** Was das Wild von der Welt braucht. */
export interface WildlifeWorld {
  terrain: Terrain;
  /** Steht auf dem Tile ein Gebäude (auch ein Feld)? */
  isOccupied(tileX: number, tileY: number): boolean;
  /** Neue Kennung für eine Figur - Tiere und Dorfbewohner teilen sich den Zähler. */
  nextId(): number;
  /** Zahl aus dem Seed der Welt - damit die Tiere in jeder Welt woanders stehen. */
  seedHash: number;
}

export class Wildlife {
  animals: Animal[] = [];
  /** Stücke, in denen schon Tiere entstanden sind - "cx,cy". */
  spawnedChunks = new Set<string>();

  constructor(private world: WildlifeWorld) {}

  /**
   * Lässt in den Stücken um (x, y) Tiere entstehen, die noch keine hatten.
   * true, wenn dabei ein Stück dazukam.
   */
  spawnAround(x: number, y: number): boolean {
    let spawned = false;
    for (let cy = Math.floor((y - SPAWN_RADIUS) / CHUNK); cy <= Math.floor((y + SPAWN_RADIUS) / CHUNK); cy++) {
      for (let cx = Math.floor((x - SPAWN_RADIUS) / CHUNK); cx <= Math.floor((x + SPAWN_RADIUS) / CHUNK); cx++) {
        const k = `${cx},${cy}`;
        if (this.spawnedChunks.has(k)) continue;
        this.spawnedChunks.add(k);
        this.spawnChunk(cx, cy);
        spawned = true;
      }
    }
    return spawned;
  }

  /** Ein Rudel (oder keins) im Stück (cx, cy), an einem Platz auf Wiese oder Waldboden ohne Baum und Fels. */
  private spawnChunk(cx: number, cy: number) {
    const seed = this.world.seedHash;
    const roll = hash01(cx, cy, seed);
    const kind: AnimalKind | null = roll < 0.22 ? 'deer' : roll < 0.55 ? 'hare' : roll < 0.65 ? 'cow' : roll < 0.75 ? 'sheep' : roll < 0.83 ? 'goat' : roll < 0.9 ? 'boar' : null;
    if (!kind) return;
    const definition = ANIMALS[kind];
    for (let tries = 0; tries < 16; tries++) {
      const x = cx * CHUNK + Math.floor(hash01(cx, cy, seed + 10 + tries) * CHUNK);
      const y = cy * CHUNK + Math.floor(hash01(cx, cy, seed + 40 + tries) * CHUNK);
      const tile = this.world.terrain.getTile(x, y);
      if ((tile.tileType !== 'grass' && tile.tileType !== 'forest') || tile.resource !== 'none' || this.world.isOccupied(x, y)) continue;
      const [min, max] = definition.herd;
      const count = min + Math.floor(hash01(cx, cy, seed + 80) * (max - min + 1));
      let herd: Herd | null = null;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + hash01(cx, cy, seed + 90 + i) * 2;
        // Ein Männchen, ein Weibchen, die übrigen meist Weibchen.
        const female = i === 0 ? false : i === 1 ? true : hash01(cx, cy, seed + 120 + i) < 0.7;
        herd = this.add(kind, x + 0.5 + Math.cos(a) * (i ? 1 : 0), y + 0.5 + Math.sin(a) * (i ? 1 : 0), { female }, herd).herd;
      }
      return;
    }
  }

  /**
   * Ein neues Tier. `herd`: sein Rudel - ohne Angabe eins der Art in der
   * Nähe, das noch Platz hat; null: ein eigenes.
   */
  add(kind: AnimalKind, x: number, y: number, options?: AnimalOptions, herd: Herd | null = this.herdNear(kind, x, y)): Animal {
    const animal = createAnimal(kind, this.world.nextId(), x, y, options);
    if (herd) animal.joinHerd(herd);
    this.animals.push(animal);
    return animal;
  }

  /** Ein Rudel der Art mit Platz, dessen Mitte höchstens JOIN_RANGE entfernt ist. */
  private herdNear(kind: AnimalKind, x: number, y: number): Herd | null {
    for (const a of this.animals) {
      const herd = a.herd;
      if (a.kind === kind && herd.members[0] === a && Math.hypot(herd.x - x, herd.y - y) < JOIN_RANGE && herd.size < HERD_MAX) return herd;
    }
    return null;
  }

  /** Für den Spielstand: je Tier, mit der Nummer seines Rudels. */
  toSave(): AnimalSave[] {
    return this.animals.map((a) => a.toSave(a.herd.id));
  }

  /**
   * Tiere aus dem Spielstand. Ältere Stände kennen weder Geschlecht noch
   * Rudel: das Geschlecht fest nach Lage und Reihenfolge, ausgewachsen, das
   * Rudel nach der Nähe (herdNear).
   */
  restore(saved: AnimalSave[]) {
    const herds = new Map<number, Herd>();
    saved.forEach((s, i) => {
      if (!isAnimalKind(s.k)) return;
      const female = s.s ? s.s === 'f' : hash01(Math.round(s.x * 100), Math.round(s.y * 100), i) < 0.5;
      const options = { hp: s.hp, food: s.f, dead: s.d, female, age: s.a, breed: s.b };
      const herd = s.h === undefined ? this.herdNear(s.k, s.x, s.y) : herds.get(s.h) ?? null;
      const animal = this.add(s.k, s.x, s.y, options, herd);
      if (s.h !== undefined) herds.set(s.h, animal.herd);
    });
  }

  byId(id: number): Animal | undefined {
    return this.animals.find((a) => a.id === id);
  }

  /** Das Tier, das einem Welt-Punkt am nächsten liegt - höchstens `radius` Tiles entfernt. */
  near(x: number, y: number, radius: number): Animal | undefined {
    let best: Animal | undefined;
    let bestDistance = radius;
    for (const a of this.animals) {
      const d = a.distanceTo(x, y);
      if (d < bestDistance) {
        bestDistance = d;
        best = a;
      }
    }
    return best;
  }

  /** Ein Tick für alle Tiere; leer zerlegte Kadaver verschwinden. true, wenn sich etwas geändert hat. */
  tick(dt: number, surroundings: AnimalSurroundings): boolean {
    let changed = false;
    // Jedes Rudel einmal, vor seinen Tieren: beim ersten in seiner Liste.
    for (const a of this.animals) if (a.herd.members[0] === a) a.herd.tick(dt, surroundings);
    for (const a of this.animals) changed = a.tick(dt, surroundings) || changed;
    changed = this.births(dt) || changed;
    if (this.animals.some((a) => a.isEmptyCarcass)) {
      for (const a of this.animals) if (a.isEmptyCarcass) a.herd.members.splice(a.herd.members.indexOf(a), 1);
      this.animals = this.animals.filter((a) => !a.isEmptyCarcass);
      changed = true;
    }
    return changed;
  }

  /**
   * Junge (B11): Ist ein ausgewachsenes Männchen des Rudels nah bei einem
   * ausgewachsenen Weibchen, kommt nach BIRTH_TIME Spielzeit ein Junges - bis
   * das Rudel HERD_MAX Tiere hat. Ohne Männchen wartet die Zeit.
   */
  private births(dt: number): boolean {
    let born = false;
    for (let i = 0, n = this.animals.length; i < n; i++) {
      const mother = this.animals[i];
      if (!mother.female || !mother.grown || mother.isDead || mother.herd.size >= HERD_MAX) continue;
      const mate = mother.herd.members.some((m) => !m.female && m.grown && !m.isDead && m.distanceTo(mother.x, mother.y) < MATE_RANGE);
      if (!mate) continue;
      mother.breed += dt;
      if (mother.breed < BIRTH_TIME) continue;
      mother.breed -= BIRTH_TIME;
      // Hinter der Mutter, neu im Rudel.
      const back = mother.size * 0.8;
      this.add(mother.kind, mother.x - Math.cos(mother.heading) * back, mother.y - Math.sin(mother.heading) * back, { age: 0 }, mother.herd);
      born = true;
    }
    return born;
  }

  clear() {
    this.animals = [];
    this.spawnedChunks.clear();
  }
}

/** Zahl 0..1, fest je Stück und Kanal. */
export function hash01(x: number, y: number, channel: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(channel, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
