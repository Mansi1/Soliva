// world.ts
// Der veränderliche Teil der Welt. Das Gelände ist eine reine Funktion aus
// Seed und Koordinate - alles hier drin ist es nicht: Gebäude, Dorfbewohner,
// bereits abgebaute Vorkommen, Vorrat. Genau deshalb muss es gespeichert
// werden, während das Gelände jederzeit neu berechnet werden kann.

import { uniqueName } from './names';
import { POSE, animationTime } from '../gl/entityRenderer';
import type { Terrain } from '../map';
import { NEAR_STEP, reliefZ } from '../noise';
import { BUILDINGS, FIELD_ROWS, FISHING, RESOURCE_KINDS, YIELD, MAX_BUILD_SLOPE, VILLAGER, initialResources } from './catalog';
import type { BuildingType, CropType, DepositType, ResourceKind, Resources } from './catalog';
import {
  buildingFromSave, createBuilding, furrowPosition, maskCovers, randomFemale, CENTER_TILE, FishTrap,
  type Building, type Farm, type UnitProducer,
} from './building';
import { readSave, writeSave, type LoadedSave, type SaveData } from './save';
import { isAnimalKind, Villager, type Animal, type AnimalSurroundings, type Task } from './unit';
import { Wildlife } from './wildlife';
import { Deposits } from './deposits';
import { VillagerWork } from './villagers';
import { Farming, FIELD_INNER, METERS_PER_TILE, type FarmPhase } from './farming';
import { DIG_DURATION, RUIN_DURATION, type Ruin } from './ruin';
import { addRenderStats } from '../renderStats';

// Gebäude sind Klassen (building/) - hier weiter unter diesen Namen erreichbar.
export type { Building, FarmPhase, Task };
export { Villager };

/**
 * Eine Schrittfolge (links + rechts) in Tiles. Sie wächst mit der Figur, sonst
 * rutschen die Füße - aber nicht unter 0.6 Tiles: so kleine Figuren laufen
 * sonst so schnell, dass die Beine nur noch flimmern.
 */
export const STRIDE_LENGTH = Math.max(VILLAGER.size * 1.1, 0.6);
/** Arbeitsschläge je Sekunde, in Radiant. */
export const WORK_TEMPO = 6;

/**
 * Was in der Welt passiert und man hören (oder sonst mitbekommen) soll. Die
 * Welt kennt keinen Ton - main.ts hängt sich an `onEvent` und entscheidet,
 * was davon zu hören ist.
 */
export type WorldEvent =
  /** Ein Arbeitsschlag - zeitgleich mit dem Arm in der Animation. */
  | { kind: 'strike'; resource: DepositType; x: number; y: number }
  | { kind: 'treeFall'; x: number; y: number }
  | { kind: 'deliver'; x: number; y: number }
  | { kind: 'collapse'; x: number; y: number }
  | { kind: 'trained'; x: number; y: number };

export interface ViewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const key = (x: number, y: number) => `${x},${y}`;


export class World {
  private buildings = new Map<string, Building>();
  /** Jedes belegte Feld zeigt auf den Ankerpunkt seines Gebäudes. */
  readonly occupied = new Map<string, string>();
  /** Vorkommen: entnommen, leer, gefällt, nachwachsend (deposits.ts). */
  readonly deposits: Deposits;
  /** Für sowable(): 0 nein, 1 ja, 2 erst wenn das Vorkommen abgebaut ist. */
  private sowableTiles = new Map<string, number>();
  /** Zusammenhängende Felder je Feldstück (farmGroup) - leer, sobald sich Gebäude ändern. */
  /** Felder: Gruppen, Phase, freie Furchen, Wachsen (farming.ts). */
  readonly farming: Farming;
  /** Was Dorfbewohner tun: Befehle, laufen, sammeln, abliefern, Felder, Jagd (villagers.ts). */
  private readonly work: VillagerWork;
  /** Umriss und Geländehöhen je Feldstück fürs Zeichnen (fieldLook) - ebenso. */
  private fieldLooks = new Map<string, { outline: { mask: number; others: number }; ground: Float32Array | null }>();
  /** Abgerissene Gebäude, die noch einstürzen (ruin.ts) - nur fürs Bild. */
  ruins: Ruin[] = [];
  /** Eben gesetzte Gebäude (ohne Felder und Reusen) - dort spritzt noch Dreck (render.ts). Nur fürs Bild. */
  digs: { x: number; y: number; size: number; at: number }[] = [];
  /** Weltzeit in Sekunden, läuft mit den Ticks. */
  private time = 0;
  private lastDt = 0;
  private dirty = false;
  private nextId = 1;
  /** Zählt, wenn Gebäude hinzukommen oder wegfallen - wer daraus etwas baut (Blumen-Puffer), baut dann neu. */
  buildingsRevision = 0;

  stock: Resources = initialResources();
  /**
   * Cheat "speedy gonzales": Dorfbewohner ohne Ausbildungszeit, ein ganzes Feld
   * auf einmal gepflügt oder gesät und gleich reif, Tiere mit einem Treffer erlegt; beim Ernten, Holzfällen,
   * Pflücken und Zerlegen ist die Ladung sofort voll (villagers.ts). Nicht im Spielstand.
   */
  speedy = false;
  /** Cheat "im the king": so viel mehr Platz als die Häuser geben. Nicht im Spielstand. */
  bonusHousing = 0;
  villagers: Villager[] = [];
  /** Wild - lebend und erlegt. */
  /** Das Wild: Tiere und wo schon welche entstanden sind (wildlife.ts). */
  readonly wildlife: Wildlife;
  /** Stücke (ANIMAL_CHUNK), in denen schon Tiere entstanden sind - erlegte kommen nicht wieder. */
  /** Was auf neu angelegten Feldern gesät wird - die zuletzt gewählte Frucht. */
  nextFarmCrop: CropType = 'wheat';
  onEvent: ((event: WorldEvent) => void) | null = null;
  /**
   * Länge des Baums auf Tile (x, y) in Tiles - kennt nur die Darstellung der
   * Vorkommen (main.ts setzt es). Damit arbeiten Holzfäller am liegenden Stamm.
   */
  treeLength: ((x: number, y: number) => number | undefined) | null = null;
  /**
   * Bodenhöhe (Tiles, ohne Relief-Skalierung) an einem Punkt - main.ts setzt
   * es. Dorfbewohner bekommen sie mit, wie die Bäume: auf der Grafikkarte
   * gerechnet standen sie an manchen Hängen deutlich unter dem Gelände.
   */
  groundAt: ((x: number, y: number, step?: number) => number) | null = null;

  constructor(readonly terrain: Terrain, private seed: string) {
    this.deposits = new Deposits(terrain);
    this.work = new VillagerWork(this);
    this.farming = new Farming(this);
    this.wildlife = new Wildlife({
      terrain,
      isOccupied: (x, y) => this.occupied.has(key(x, y)),
      nextId: () => this.nextId++,
      seedHash: this.seedHash,
    });
    const saved = readSave(seed);
    if (saved) this.applySave(saved);
  }

  /** Seed als Zahl - damit die Tiere in jeder Welt woanders stehen. */
  private get seedHash(): number {
    let h = 0;
    for (let i = 0; i < this.seed.length; i++) h = Math.imul(h ^ this.seed.charCodeAt(i), 2654435761);
    return (h >>> 0) % 100000;
  }


  // --- Abfragen ------------------------------------------------------------

  at(x: number, y: number): Building | undefined {
    const anchor = this.occupied.get(key(x, y));
    return anchor ? this.buildings.get(anchor) : undefined;
  }

  building(anchor: string): Building | undefined {
    return this.buildings.get(anchor);
  }

  /** Alle Gebäude - für das Auswählen mehrerer gleichartiger. */
  allBuildings(): IterableIterator<Building> {
    return this.buildings.values();
  }

  anchorOf(building: Building): string {
    return building.anchor;
  }

  /** Alle Hauptgebäude, in der Reihenfolge, in der sie gebaut wurden. */
  townCenters(): Building[] {
    return [...this.buildings.values()].filter((b) => b.type === 'town_center');
  }

  hasTownCenter(): boolean {
    for (const b of this.buildings.values()) if (b.type === 'town_center') return true;
    return false;
  }

  /** Das Hauptgebäude, das einem Welt-Punkt am nächsten liegt. */
  nearestTownCenter(x: number, y: number): UnitProducer | undefined {
    let best: UnitProducer | undefined;
    let bestDistance = Infinity;
    for (const b of this.buildings.values()) {
      if (b.type !== 'town_center' || !b.isUnitProducer()) continue;
      const d = Math.hypot(b.x + 0.5 - x, b.y + 0.5 - y);
      if (d < bestDistance) {
        bestDistance = d;
        best = b;
      }
    }
    return best;
  }

  /** Lebende Dorfbewohner und Bevölkerungsgrenze aus Hauptgebäuden und Häusern. */
  population(): { used: number; cap: number; training: number } {
    let cap = this.bonusHousing;
    let training = 0;
    for (const b of this.buildings.values()) {
      cap += b.definition.housing;
      if (b.isUnitProducer()) training += b.queuedUnits;
    }
    return { used: this.villagers.length, cap, training };
  }

  /**
   * Wie viele Bögen in jeder Waffenkammer liegen: der Vorrat, gleich verteilt -
   * die ersten bekommen den Rest. Schlüssel: Ankerpunkt.
   */
  armoryStock(): Map<string, number> {
    const anchors: string[] = [];
    for (const b of this.allBuildings()) if (b.definition.weaponCapacity > 0) anchors.push(b.anchor);
    const bows = Math.floor(this.stock.bows);
    const each = Math.floor(bows / Math.max(1, anchors.length));
    const rest = bows - each * anchors.length;
    return new Map(anchors.map((a, i) => [a, each + (i < rest ? 1 : 0)]));
  }

  /** So viele Waffen passen in alle Waffenkammern zusammen. */
  weaponCapacity(): number {
    let total = 0;
    for (const b of this.allBuildings()) total += b.definition.weaponCapacity;
    return total;
  }

  /**
   * Dorfbewohner je Ressource - alle mit dem Auftrag, sie zu sammeln, auch
   * wenn sie gerade eine Ladung zum Lager tragen.
   */
  gatherers(): { counts: Record<ResourceKind, number>; idle: number } {
    const counts = Object.fromEntries(RESOURCE_KINDS.map((r) => [r, 0])) as Record<ResourceKind, number>;
    let idle = 0;
    for (const v of this.villagers) {
      if (v.task.kind === 'gather') counts[YIELD[v.task.type]]++;
      else if (v.task.kind === 'farm' || v.task.kind === 'hunt' || v.task.kind === 'fish') counts.food++;
      else if (v.task.kind === 'craft') counts.bows++;
      else if (v.task.kind === 'idle') idle++;
    }
    return { counts, idle };
  }

  /**
   * Wie weit ein Baum umgefallen ist: Winkel (Radiant, 0 = steht) und
   * Richtung, oder null, wenn er noch steht. Der Fall beschleunigt wie unter
   * Schwerkraft, federt beim Aufschlag einmal nach und bleibt dann liegen.
   * @param blend Anteil des laufenden Ticks, damit die Bewegung flüssig ist
   */
  fall(x: number, y: number, blend: number): { angle: number; dir: number } | null {
    return this.deposits.fall(x, y, this.timeAt(blend));
  }

  /**
   * Alles über ein Vorkommen für die Anzeige: Art, Rest, Anfangsmenge und wie
   * viele Dorfbewohner gerade daran sammeln. null, wenn dort nichts (mehr) ist.
   */
  resourceInfo(x: number, y: number):
      { type: DepositType; remaining: number; total: number; gatherers: number; regrowIn?: number } | null {
    const info = this.deposits.info(x, y, this.time);
    if (!info) return null;
    let gatherers = 0;
    for (const v of this.villagers) {
      if (v.task.kind === 'gather' && v.task.x === x && v.task.y === y) gatherers++;
    }
    return { ...info, gatherers };
  }

  /**
   * Anteil, der an einem Feld noch übrig ist (0..1), ohne das Gelände neu zu
   * berechnen - `total` kennt der Aufrufer schon.
   */
  remainingShare(x: number, y: number, total: number): number {
    return this.deposits.remainingShare(x, y, total);
  }

  /** Was an einem Feld noch im Boden liegt. */
  remainingAt(x: number, y: number): { type: DepositType | null; amount: number } {
    return this.deposits.remainingAt(x, y);
  }

  canPay(cost: Partial<Resources>): boolean {
    return (Object.keys(cost) as ResourceKind[]).every(
        (r) => this.stock[r] >= (cost[r] ?? 0));
  }

  /** Zieht `cost` vom Vorrat ab (`factor` < 0 erstattet). */
  pay(cost: Partial<Resources>, factor = 1) {
    for (const [r, amount] of Object.entries(cost) as [ResourceKind, number][]) {
      this.stock[r] -= Math.floor(amount * factor);
    }
  }

  affordable(type: BuildingType): boolean {
    return this.canPay(BUILDINGS[type].cost);
  }

  canAffordVillager(): boolean {
    return this.canPay(VILLAGER.cost);
  }

  /** Die Felder, die ein Gebäude an (x, y) belegen würde - ein Feld nur seine Tiles. */
  private footprintTiles(x: number, y: number, type: BuildingType, farmTiles = CENTER_TILE): [number, number][] {
    // Felder: die Tiles ihrer Maske in den 3x3 (ältere Spielstände haben
    // noch ganze 3x3-Felder).
    const r = type === 'farm' ? 1 : (BUILDINGS[type].footprint - 1) / 2;
    const tiles: [number, number][] = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (type === 'farm' && !maskCovers(farmTiles, dx, dy)) continue;
        tiles.push([x + dx, y + dy]);
      }
    }
    return tiles;
  }

  /**
   * Tiles eines Felds für den Shader: die eigenen (Bit 0..8) und ringsum die,
   * auf denen ein anderes Feld liegt (Bit 9 + Seite * 3 + Lage, Seite 0/1 vor
   * bzw. hinter dem Feld entlang x, 2/3 entlang y), dazu die Tiles der 3x3,
   * die zu einem anderen Feld gehören (`others`, Bit je Tile). Dort fällt die Schnur
   * weg - aneinanderliegende Felder gehen ineinander über.
   */
  fieldOutline(x: number, y: number, tiles: number, self?: Building): { mask: number; others: number } {
    let mask = tiles;
    let others = 0;
    const other = (tx: number, ty: number) => {
      const b = this.at(tx, ty);
      return b !== undefined && b.isFarm() && b !== self;
    };
    // Tiles der 3x3, die nicht zu diesem Feld gehören, aber zu einem anderen.
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (!((tiles >> (i * 3 + j)) & 1) && other(x - 1 + i, y - 1 + j)) others |= 1 << (i * 3 + j);
      }
    }
    for (let k = 0; k < 3; k++) {
      if (other(x - 2, y - 1 + k)) mask |= 1 << (9 + k);
      if (other(x + 2, y - 1 + k)) mask |= 1 << (12 + k);
      if (other(x - 1 + k, y - 2)) mask |= 1 << (15 + k);
      if (other(x - 1 + k, y + 2)) mask |= 1 << (18 + k);
    }
    return { mask, others };
  }

  /**
   * Umgepflügte Äcker für den Gelände-Shader: je Tile im Quadrat ab (x0, y0)
   * mit Kantenlänge `size` vier Bytes - wie weit die drei Furchen des Tiles
   * entlang y gepflügt sind (0..255) und 255, wenn dort ein Feld liegt.
   * Gibt null zurück, wenn im Ausschnitt kein Feld liegt.
   */
  fieldSoil(x0: number, y0: number, size: number, out: Uint8Array): Uint8Array | null {
    out.fill(0);
    let any = false;
    for (const b of this.buildings.values()) {
      if (!b.isFarm() || b.x < x0 - 1 || b.y < y0 - 1 || b.x > x0 + size || b.y > y0 + size) continue;
      const farm = b;
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          if (!((farm.tiles >> (i * 3 + j)) & 1)) continue;
          const [tx, ty] = [b.x - 1 + i - x0, b.y - 1 + j - y0];
          if (tx < 0 || ty < 0 || tx >= size || ty >= size) continue;
          const o = (ty * size + tx) * 4;
          for (let k = 0; k < 3; k++) {
            const row = i * 3 + k;
            const f = farm.furrows[row];
            const q = f.plough >= 1 ? 1 : furrowPosition(farm.tiles, row, f.plough);
            out[o + k] = Math.round(Math.max(0, Math.min(1, q * 3 - j)) * 255);
          }
          out[o + 3] = 255;
          any = true;
        }
      }
    }
    return any ? out : null;
  }

  /**
   * Was ein Feldstück zum Zeichnen braucht und sich nur ändert, wenn Gebäude
   * dazukommen oder wegfallen: der Umriss (fieldOutline) und je Furche an
   * Anfang, Mitte und Ende die Geländehöhe (Tiles, ohne Relief-Skalierung;
   * ab Index 0) und das Gefälle quer zur Furche (ab Index 27).
   */
  fieldLook(building: Farm) {
    const anchor = building.anchor;
    let look = this.fieldLooks.get(anchor);
    if (!look) {
      let ground: Float32Array | null = null;
      if (this.groundAt) {
        ground = new Float32Array(FIELD_ROWS * 6);
        const gap = (2 * FIELD_INNER) / FIELD_ROWS;
        const half = gap / 2 / METERS_PER_TILE;
        for (let row = 0; row < FIELD_ROWS; row++) {
          const x = building.x + 0.5 + (-FIELD_INNER + (row + 0.5) * gap) / METERS_PER_TILE;
          for (let i = 0; i < 3; i++) {
            const y = building.y + 0.5 - 1.5 + i * 1.5;
            ground[row * 3 + i] = this.groundAt(x, y, NEAR_STEP);
            ground[27 + row * 3 + i] = (this.groundAt(x + half, y, NEAR_STEP) - this.groundAt(x - half, y, NEAR_STEP)) / (2 * half);
          }
        }
      }
      look = { outline: this.fieldOutline(building.x, building.y, building.tiles, building), ground };
      this.fieldLooks.set(anchor, look);
    }
    return look;
  }

  /**
   * Die Tiles, die ein Feld an (x, y) bekäme (siehe Farm.tiles): das
   * Tile selbst, wenn dort gesät werden kann, sonst keins.
   */
  farmTiles(x: number, y: number): number {
    return this.sowable(x, y) ? CENTER_TILE : 0;
  }

  /**
   * Prüft den Bauplatz. Gibt den Grund zurück, warum es nicht geht, oder null.
   * Die Meldung geht so in die Oberfläche - deshalb sind es ganze Sätze.
   */
  canPlace(x: number, y: number, type: BuildingType): string | null {
    const def = BUILDINGS[type];

    // Wie in AoE2 fängt alles beim Hauptgebäude an: dort entstehen die
    // Dorfbewohner, und die erste Ernte wird dort abgeliefert.
    if (type !== 'town_center' && !this.hasTownCenter()) {
      return 'Baue zuerst ein Hauptgebäude';
    }

    // Felder: ein Tile, auf dem gesät werden kann.
    if (type === 'farm') {
      // Der Mittelpunkt ist der Schlüssel des Felds - zwei dürfen ihn nicht teilen.
      if (this.buildings.has(key(x, y))) return 'Hier steht schon etwas';
      if (this.farmTiles(x, y) === 0) return 'Hier kann nichts gesät werden - Felder brauchen freie Wiese oder Waldboden';
      return this.affordable(type) ? null : 'Zu wenig Rohstoffe';
    }

    for (const [tx, ty] of this.footprintTiles(x, y, type)) {
      if (this.occupied.has(key(tx, ty))) return 'Hier steht schon etwas';
      const tile = this.terrain.getTile(tx, ty);
      if (!def.terrain.includes(tile.tileType)) return `${def.label} braucht ${def.terrain.includes('water') ? 'Wasser' : 'festen Boden'}`;
    }

    // Fischerei: die Hütte ans Wasser, Reusen in ihre Nähe (FISHING.range).
    if (type === 'fisher_hut' && !this.waterNear(x, y)) return 'Die Fischerhütte gehört ans Wasser';
    if (type === 'fish_trap' && ![...this.buildings.values()].some((b) => b.type === 'fisher_hut'
        && Math.hypot(b.x - x, b.y - y) <= FISHING.range)) {
      return 'Eine Reuse gehört in die Nähe einer Fischerhütte';
    }

    // Felder (oben) folgen dem Gelände - nur Gebäude brauchen ebenen Boden.
    if (this.slopeUnder(x, y, type) > MAX_BUILD_SLOPE * def.footprint) {
      return 'Der Boden ist hier zu steil';
    }

    if (!this.affordable(type)) return 'Zu wenig Rohstoffe';
    return null;
  }

  /** Liegt Wasser höchstens FISHING.range / 2 Tiles von (x, y)? */
  private waterNear(x: number, y: number): boolean {
    const r = FISHING.range / 2;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const t = this.terrain.getTile(x + dx, y + dy).tileType;
        if (t === 'water' || t === 'deep_water') return true;
      }
    }
    return false;
  }

  /**
   * Kann auf Tile (x, y) ein Feld liegen? Wiese oder Waldboden, frei, und
   * nichts darauf, was erst weg müsste - für die Anzeige beim Bauen.
   */
  sowable(x: number, y: number): boolean {
    const k = key(x, y);
    if (this.occupied.has(k)) return false;
    let soil = this.sowableTiles.get(k);
    if (soil === undefined) {
      const tile = this.terrain.getTile(x, y);
      soil = !BUILDINGS.farm.terrain.includes(tile.tileType) ? 0 : tile.resource === 'none' ? 1 : tile.resource === 'berries' ? 0 : 2;
      if (this.sowableTiles.size > 50_000) this.sowableTiles.clear();
      this.sowableTiles.set(k, soil);
    }
    // 2: Baum oder Fels - frei, sobald abgebaut.
    return soil === 1 || (soil === 2 && this.deposits.isExhausted(x, y));
  }

  /**
   * Höhenunterschied in Tiles zwischen höchster und tiefster Ecke der Felder,
   * die ein Gebäude belegen würde - gemessen am Relief, das man sieht.
   */
  private slopeUnder(x: number, y: number, type: BuildingType): number {
    const r = (BUILDINGS[type].footprint - 1) / 2;
    let lo = Infinity;
    let hi = -Infinity;
    for (let cy = y - r; cy <= y + r + 1; cy++) {
      for (let cx = x - r; cx <= x + r + 1; cx++) {
        const z = reliefZ(this.terrain.getTile(cx, cy).height);
        lo = Math.min(lo, z);
        hi = Math.max(hi, z);
      }
    }
    return hi - lo;
  }

  // --- Verändern -----------------------------------------------------------

  place(x: number, y: number, type: BuildingType): string | null {
    const reason = this.canPlace(x, y, type);
    if (reason) return reason;

    this.pay(BUILDINGS[type].cost);
    // Ein Feld bekommt die Frucht fürs nächste Feld und die Tiles, die hier frei sind.
    const building = createBuilding(type, x, y, type === 'farm' ? { crop: this.nextFarmCrop, tiles: this.farmTiles(x, y) } : {});
    this.buildings.set(building.anchor, building);
    this.buildingsRevision++;
    for (const [tx, ty] of building.footprintTiles()) this.occupied.set(key(tx, ty), building.anchor);
    if (type !== 'farm' && type !== 'fish_trap') {
      this.digs.push({ x: x + 0.5, y: y + 0.5, size: Math.max(building.definition.footprint, building.definition.size), at: this.time });
    }
    this.farming.invalidate();
    this.fieldLooks.clear();
    this.dirty = true;
    return null;
  }

  /** Abriss. Die Hälfte der Kosten kommt zurück - sonst bestraft ein Fehlklick zu hart. */
  remove(building: Building) {
    const def = building.definition;
    this.pay(def.cost, -0.5);
    // Eine Waffenkammer nimmt ihre Waffen mit: ihr Anteil am Vorrat ist weg.
    if (def.weaponCapacity > 0) {
      this.stock.bows = Math.max(0, this.stock.bows - (this.armoryStock().get(building.anchor) ?? 0));
    }
    // Wer noch in Ausbildung war, wird voll erstattet - er hat ja nie gearbeitet.
    if (building.isUnitProducer()) this.pay(VILLAGER.cost, -building.queuedUnits);
    for (const [tx, ty] of building.footprintTiles()) this.occupied.delete(key(tx, ty));
    const anchor = building.anchor;
    this.buildings.delete(anchor);
    this.buildingsRevision++;
    this.farming.invalidate();
    this.fieldLooks.clear();
    this.addRuin(building);
    // Wer gerade genau hierhin liefern wollte, sucht sich beim nächsten Tick
    // ein anderes Lager oder bleibt mit seiner Ladung stehen.
    for (const v of this.villagers) {
      const t = v.task;
      if ((t.kind === 'deliver' || t.kind === 'farm' || t.kind === 'craft' || t.kind === 'fish') && t.building === anchor) v.task = { kind: 'idle' };
    }
    this.dirty = true;
  }

  /** Legt den Einsturz an - Staub und Schutt zeichnet render.ts (der Schutt als Partikel). */
  private addRuin(building: Building) {
    this.ruins.push({
      type: building.type, shape: building.model, x: building.x, y: building.y, at: this.time,
      clock: animationTime(),
    });
    this.onEvent?.({ kind: 'collapse', x: building.x + 0.5, y: building.y + 0.5 });
  }

  /**
   * Sammelpunkt setzen: wer hier fertig ausgebildet wird, bekommt denselben
   * Befehl, als hätte man ihn mit Rechtsklick auf dieses Feld geschickt -
   * auf ein Vorkommen sammelt er, sonst geht er hin - zur genauen Stelle
   * `point`, wenn angegeben (dort steht auch die Fahne). Ein Klick auf das
   * Gebäude selbst hebt den Sammelpunkt auf.
   */
  setRally(building: Building, x: number, y: number, point?: { x: number; y: number }): string | null {
    if (!building.isUnitProducer()) return 'Nur ausbildende Gebäude haben einen Sammelpunkt';
    if (this.at(x, y) === building) {
      building.setRallyPoint(null);
      this.dirty = true;
      return null;
    }
    const tile = this.terrain.getTile(x, y);
    if (tile.tileType === 'water' || tile.tileType === 'deep_water') return 'Dorfbewohner können nicht schwimmen';
    building.setRallyPoint({ x, y, point });
    this.dirty = true;
    return null;
  }

  /** Der Weg, den ein Dorfbewohner von (fx, fy) nach (tx, ty) ginge: Start, Wegpunkte, Ziel (VillagerWork.route). */
  route(fx: number, fy: number, tx: number, ty: number): { x: number; y: number }[] {
    return this.work.route(fx, fy, tx, ty);
  }

  /** Stellt einen Dorfbewohner in die Warteschlange. Kosten werden sofort fällig. */
  train(building: Building): string | null {
    if (!building.isUnitProducer()) return 'Nur das Hauptgebäude bildet Dorfbewohner aus';
    if (building.isQueueFull) return 'Die Warteschlange ist voll';
    if (!this.canAffordVillager()) return 'Zu wenig Nahrung';
    this.pay(building.unit.cost);
    building.enqueueUnit();
    this.dirty = true;
    return null;
  }

  /**
   * Befehl an ausgewählte Dorfbewohner für das Tile (x, y), wie ein Rechtsklick
   * in AoE2 (villagers.ts) - hingehen zum genauen Punkt `point`, falls
   * angegeben. Gibt einen Grund zurück, wenn es nicht geht.
   */
  command(ids: ReadonlySet<number>, x: number, y: number, point?: { x: number; y: number }): string | null {
    return this.work.command(ids, x, y, point);
  }

  /** Entlässt den Arbeiter dieser Werkstatt (VillagerWork.dismiss) - gibt ihn zurück. */
  dismiss(anchor: string): Villager | undefined {
    this.dirty = true;
    return this.work.dismiss(anchor);
  }

  /** Rechtsklick auf ein Tier: die Ausgewählten jagen es bzw. zerlegen den Kadaver. */
  hunt(ids: ReadonlySet<number>, animal: Animal): string | null {
    return this.work.hunt(ids, animal);
  }

  /** Was ein Dorfbewohner gerade tut, als kurzer Text. */
  describe(v: Villager): string {
    return this.work.describe(v);
  }

  // --- Simulation ----------------------------------------------------------

  /**
   * Ein fester Zeitschritt aus main.ts, damit die Ausbeute nicht von der
   * Bildrate abhängt.
   */
  tick(dt: number) {
    this.time += dt;
    this.lastDt = dt;
    if (this.ruins.length > 0) this.ruins = this.ruins.filter((r) => this.time - r.at < RUIN_DURATION);
    if (this.digs.length > 0) this.digs = this.digs.filter((d) => this.time - d.at < DIG_DURATION);
    for (const b of this.buildings.values()) {
      if (b.isUnitProducer()) this.tickTraining(b, dt);
      // Reusen füllen sich von allein; voll gespeichert wird sie sofort.
      if (b instanceof FishTrap && !b.isFull) {
        b.fill = Math.min(1, b.fill + dt / FISHING.trapFillTime);
        if (b.isFull) this.dirty = true;
      }
    }
    if (this.deposits.regrow(dt, this.time)) this.dirty = true;
    if (this.farming.grow(this.speedy ? Infinity : dt)) this.dirty = true;
    const t0 = performance.now();
    if (this.wildlife.tick(dt, this.animalSurroundings)) this.dirty = true;
    const t1 = performance.now();
    for (const v of this.villagers) {
      v.rememberPosition();
      v.pose = POSE.stand;
      this.work.tick(v, dt);
    }
    this.work.separate();
    // Für die Kosten je Tier und Dorfbewohner im Entwickler-Panel.
    addRenderStats('simWildlifeMs', t1 - t0);
    addRenderStats('simVillagersMs', performance.now() - t1);
  }

  private tickTraining(building: UnitProducer, dt: number) {
    if (building.queuedUnits === 0) return;
    const pop = this.population();
    // Bevölkerungsgrenze erreicht: die Ausbildung wartet, bis ein Haus steht.
    if (pop.used >= pop.cap) return;
    const done = building.train(this.speedy ? Infinity : dt);
    if (!done) return;

    // Er kommt durch die Tür heraus (spawnPoint), vom Gebäude weg gewandt.
    const door = building.spawnPoint();
    const villager = this.addVillager(door.x, door.y, done.female);
    villager.heading = Math.atan2(door.y - (building.y + 0.5), door.x - (building.x + 0.5));
    this.onEvent?.({ kind: 'trained', x: villager.x, y: villager.y });
    const rally = building.rallyPoint;
    if (rally) {
      this.work.command(new Set([villager.id]), rally.x, rally.y, rally.point);
    } else {
      // Ohne Sammelpunkt ein paar Schritte vor das Gebäude, etwas zur Seite
      // gestreut - nicht in der Tür stehen bleiben.
      const front = building.frontPoint();
      const spread = (villager.id % 5) * 0.4 - 0.8;
      villager.task = { kind: 'move', x: front.x + spread * 0.5, y: front.y - spread * 0.5 };
    }
    this.dirty = true;
  }

  private addVillager(x: number, y: number, female = randomFemale()): Villager {
    const villager = new Villager(this.nextId++, x, y, this.freeName(female), female);
    this.villagers.push(villager);
    return villager;
  }

  /**
   * Cheat: `count` Dorfbewohner (ohne Kosten und Bevölkerungsgrenze) oder Kühe
   * auf freien Tiles rund um (x, y). Ist (x, y) selbst nicht frei, keiner. Gibt die Zahl zurück.
   */
  spawnAround(what: 'villager' | 'cow', x: number, y: number, count: number): number {
    const blocked = (tx: number, ty: number) => (what === 'cow' ? this.animalBlocked(tx, ty) : this.work.blockedAt(tx, ty));
    if (blocked(x, y)) return 0;
    let placed = 0;
    // Ring um Ring nach außen; ponytail: Luftlinie, nicht erreichbar geprüft - ein Tile hinter einem Fluss zählt mit.
    for (let r = 0; r <= 4 && placed < count; r++) {
      for (let dy = -r; dy <= r && placed < count; dy++) {
        for (let dx = -r; dx <= r && placed < count; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || blocked(x + dx, y + dy)) continue;
          if (what === 'cow') this.wildlife.add('cow', x + dx + 0.5, y + dy + 0.5);
          else this.addVillager(x + dx + 0.5, y + dy + 0.5);
          placed++;
        }
      }
    }
    if (placed > 0) this.dirty = true;
    return placed;
  }

  /** Schritt Richtung Ziel. true, sobald er bis auf `reach` heran ist. */
  /** Nächstes nicht leeres Feld derselben Art um (x, y) - wenn eins leer ist, macht er dort weiter. */
  /**
   * Die Feldstücke, die mit `building` ein zusammenhängendes Feld bilden
   * (über Tile-Kanten benachbart), es selbst eingeschlossen. Gemerkt, bis
   * sich an den Gebäuden etwas ändert.
   */
  /** Das zusammenhängende Feld, zu dem `building` gehört (farming.ts). */
  farmGroup(building: Building): Farm[] {
    return this.farming.group(building);
  }

  /** Was auf dem Feld, zu dem `building` gehört, gerade dran ist. */
  farmPhase(building: Building): FarmPhase {
    return this.farming.phase(building);
  }

  /** Wer auf diesem Feld arbeitet, nach Furche. */
  farmers(building: Building): Villager[] {
    const anchor = building.anchor;
    return this.villagers.filter((v) => v.task.kind === 'farm' && v.task.building === anchor);
  }

  /**
   * Frucht wählen: gilt für jede Aussaat von jetzt an - Furchen, die noch
   * nicht eingesät sind, bekommen sie gleich. Neue Felder bekommen sie auch.
   */
  setCrop(building: Building, crop: CropType) {
    if (!building.isFarm()) return;
    building.setPlan(crop);
    this.nextFarmCrop = crop;
    this.dirty = true;
  }

  // --- Wild ------------------------------------------------------------------

  /** Darf ein Tier dieses Tile betreten? Nicht ins Wasser, nicht in Gebäude - zwischen Bäumen hindurch schon. */
  animalBlocked(x: number, y: number): boolean {
    const k = key(x, y);
    const anchor = this.occupied.get(k);
    if (anchor !== undefined && !this.buildings.get(anchor)?.isFarm()) return true;
    const tile = this.terrain.getTile(x, y);
    return tile.tileType === 'water' || tile.tileType === 'deep_water' || tile.tileType === 'mountain' || tile.tileType === 'snow';
  }

  /** Tiere in den Stücken nahe der Kamera entstehen lassen, die noch keine hatten (wildlife.ts). */
  ensureAnimals(centerX: number, centerY: number) {
    if (this.wildlife.spawnAround(centerX, centerY)) this.dirty = true;
  }

  /** Das Tier, das einem Welt-Punkt am nächsten liegt - höchstens `radius` Tiles entfernt. */
  animalNear(x: number, y: number, radius: number): Animal | undefined {
    return this.wildlife.near(x, y, radius);
  }

  /** Was Tiere von der Welt wissen: wohin sie dürfen, wo der nächste Dorfbewohner ist. */
  private readonly animalSurroundings: AnimalSurroundings = {
    isBlocked: (x, y) => this.animalBlocked(x, y),
    nearestThreat: (x, y) => {
      let nearest: { x: number; y: number; distance: number } | undefined;
      for (const v of this.villagers) {
        if (v.inside > 0) continue;
        const distance = Math.hypot(v.x - x, v.y - y);
        if (!nearest || distance < nearest.distance) nearest = { x: v.x, y: v.y, distance };
      }
      return nearest;
    },
  };

  /** Weltzeit in Sekunden. */
  get now(): number {
    return this.time;
  }

  /** Etwas hat sich geändert - beim nächsten Speichern mitschreiben. */
  markDirty() {
    this.dirty = true;
  }

  /** Weltzeit (Sekunden) im laufenden Tick - `blend` 0..1 zwischen letztem und nächstem. */
  timeAt(blend: number): number {
    return this.time + blend * this.lastDt;
  }


  // --- Speichern -----------------------------------------------------------

  /** Schreibt nur, wenn sich etwas geändert hat. */
  /** Speichert den Stand dieser Welt - nur, wenn sich seit dem letzten Mal etwas geändert hat. */
  save() {
    if (!this.dirty) return;
    // Ohne Speicher (privater Modus, voll) läuft das Spiel weiter, nur ohne Spielstand.
    if (writeSave(this.seed, this.toSave())) this.dirty = false;
  }

  /** Der Stand als Speicherstand (siehe save.ts). */
  toSave(): SaveData {
    return {
      version: 3,
      savedAt: Date.now(),
      stock: this.stock,
      buildings: [...this.buildings.values()].map((b) => b.toSave()),
      villagers: this.villagers.map((v) => ({
        x: v.x, y: v.y, c: v.carrying, ct: v.carryType, task: v.task, hp: v.hp, n: v.name, f: v.female,
      })),
      harvested: Object.fromEntries(this.deposits.harvested),
      animals: this.wildlife.animals.map((a) => ({
        k: a.kind, x: +a.x.toFixed(2), y: +a.y.toFixed(2), hp: a.hp, f: +a.food.toFixed(1),
        ...(a.state === 'dead' ? { d: true } : {}),
      })),
      spawned: [...this.wildlife.spawnedChunks],
    };
  }

  /** Übernimmt einen geladenen Stand - schon auf das heutige Format gebracht (save.ts). */
  private applySave({ data, scale }: LoadedSave) {
    this.stock = data.stock;
    this.deposits.restore(data.harvested);

    for (const saved of data.buildings) {
      // Unbekannte Arten fallen weg; umbenannte schreibt buildingFromSave um.
      const building = buildingFromSave(saved, scale);
      if (!building) continue;
      this.buildings.set(building.anchor, building);
      for (const [tx, ty] of building.footprintTiles()) this.occupied.set(key(tx, ty), building.anchor);
    }
    this.buildingsRevision++;

    for (const k of data.spawned ?? []) this.wildlife.spawnedChunks.add(k);
    for (const a of data.animals ?? []) {
      if (isAnimalKind(a.k)) this.wildlife.add(a.k, a.x, a.y, { hp: a.hp, food: a.f, dead: a.d });
    }

    for (const s of data.villagers) {
      // Ältere Speicherstände kennen weder Namen noch Geschlecht.
      const female = s.f ?? this.nextId % 2 === 1;
      const v = new Villager(this.nextId++, s.x * scale, s.y * scale, s.n ?? this.freeName(female), female);
      v.carrying = s.c;
      v.carryType = s.ct;
      v.task = s.task;
      v.hp = Math.min(s.hp ?? VILLAGER.hp, VILLAGER.hp);
      this.villagers.push(v);
    }
  }

  /** Ein Vorname, den gerade kein lebender Dorfbewohner trägt. */
  private freeName(female: boolean): string {
    return uniqueName(female, new Set(this.villagers.map((v) => v.name)));
  }

  /** Alles zurücksetzen - für den Neustart-Knopf. */
  reset() {
    this.buildings.clear();
    this.buildingsRevision++;
    this.farming.invalidate();
    this.fieldLooks.clear();
    this.occupied.clear();
    this.deposits.clear();
    this.villagers = [];
    this.wildlife.clear();
    this.stock = initialResources();
    this.dirty = true;
    this.save();
  }
}



