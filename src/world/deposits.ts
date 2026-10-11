// deposits.ts
// Die Vorkommen auf der Karte - Bäume, Felsen, Beerensträucher: was schon
// entnommen ist, was leer ist, welche Bäume liegen, welche Sträucher
// nachwachsen und welche Bäume der Förster gepflanzt hat. Wie viel ein
// Vorkommen anfangs hat, sagt das Gelände (Terrain) - oder die Pflanzung;
// hier steht nur, was sich seitdem geändert hat - so bleibt der Spielstand
// klein und übersteht eine Änderung am Generator.

import { FALL_LYING } from '../gl/entityRenderer';
import type { Terrain } from '../map';
import { FORESTER, TREE_SPECIES, type DepositType, type TreeSpecies } from './catalog';

/**
 * Beerensträucher: nach dem letzten Pflücken BERRY_REST Sekunden Pause, dann
 * wachsen sie in BERRY_REGROW_TIME Sekunden von leer auf voll nach.
 */
const BERRY_REST = 90 * 60;
const BERRY_REGROW_TIME = 5 * 60;

/** Ablauf des Umfallens: beschleunigen, einmal nachfedern, liegen. */
const FALL_SECONDS = 1.1;
const BOUNCE_SECONDS = 0.35;

const key = (x: number, y: number) => `${x},${y}`;

/** Ein Vorkommen für die Anzeige. */
export interface DepositInfo {
  type: DepositType;
  remaining: number;
  total: number;
  /** Beerenstrauch: Sekunden, bis er wieder voll ist; gepflanzter Baum: bis er gefällt werden kann. */
  regrowIn?: number;
  /** Ein gepflanzter Baum, der noch wächst - fällen kann man ihn erst danach. */
  sapling?: boolean;
}

/** Ein gepflanzter Baum: Art und wann gepflanzt (Weltzeit). */
export interface Planting {
  species: TreeSpecies;
  at: number;
}

/** Gepflanzte Bäume im Spielstand: "x,y" -> [Art, Sekunden schon gewachsen]. */
export type PlantedSave = Record<string, [TreeSpecies, number]>;

export class Deposits {
  /** "x,y" -> bereits entnommene Menge. */
  readonly harvested = new Map<string, number>();
  /** Leer - dort liegt nichts mehr (Beerensträucher, bis sie nachwachsen). */
  private exhausted = new Set<string>();
  /** Angepflückte Beerensträucher: volle Menge und wann zuletzt gepflückt (Weltzeit). */
  private berryBushes = new Map<string, { total: number; picked: number }>();
  /** Gefällte Bäume: wann (Weltzeit) und wohin sie fielen. */
  private felled = new Map<string, { at: number; dir: number }>();
  /**
   * Vom Förster gepflanzte Bäume - sie ersetzen, was das Gelände dort hat
   * (nichts oder einen abgeholzten Stumpf). Ausgewachsen sind es gewöhnliche Bäume.
   */
  private planted = new Map<string, Planting>();
  /** Die davon, die noch wachsen - kein Vorkommen, bis sie ausgewachsen sind (regrow). */
  private growing = new Set<string>();
  /**
   * Zählt hoch, sobald ein Tile angefasst wird (angebaut, gefällt) oder wieder
   * ganz frei ist - die Anzeige baut dann ihre festen Puffer neu (resources.ts).
   */
  revision = 0;

  constructor(readonly terrain: Terrain) {}

  /**
   * Was auf dem Tile steht, bevor etwas entnommen wurde: der gepflanzte Baum,
   * sonst was das Gelände dort hat - Art null, wenn nichts.
   */
  base(x: number, y: number): { type: DepositType | null; amount: number } {
    if (this.planted.has(key(x, y))) return { type: 'wood', amount: FORESTER.wood };
    const found = this.terrain.resourceAt(x, y);
    return found.type === 'none' || found.amount <= 0 ? { type: null, amount: 0 } : { type: found.type, amount: found.amount };
  }

  /** Was an einem Tile noch liegt - Art null, wenn nichts (mehr) oder ein gepflanzter Baum noch wächst. */
  remainingAt(x: number, y: number): { type: DepositType | null; amount: number } {
    const k = key(x, y);
    if (this.exhausted.has(k) || this.growing.has(k)) return { type: null, amount: 0 };
    const found = this.base(x, y);
    if (!found.type) return found;
    return { type: found.type, amount: found.amount - (this.harvested.get(k) ?? 0) };
  }

  /** Der gepflanzte Baum auf dem Tile - undefined, wenn dort keiner gepflanzt ist. */
  plantedAt(x: number, y: number): Planting | undefined {
    return this.planted.get(key(x, y));
  }

  /** Alle Tiles ("x,y") mit gepflanztem Baum. */
  plantedKeys(): Iterable<string> {
    return this.planted.keys();
  }

  /** Wie weit der Baum gewachsen ist, 0..1 - 1 für jeden, der nicht gepflanzt ist oder ausgewachsen. */
  growth(x: number, y: number, now: number): number {
    const k = key(x, y);
    if (!this.growing.has(k)) return 1;
    return Math.max(0, Math.min(1, (now - this.planted.get(k)!.at) / FORESTER.growTime));
  }

  /**
   * Pflanzt einen Baum der Art `species` - ob das Tile frei ist, prüft die
   * Welt (World.canPlant). Ein abgeholzter Stumpf an der Stelle ist dann weg.
   * VERIFIED: tests/forester.test.mjs - wächst, ist danach ein gewöhnlicher Baum.
   */
  plant(x: number, y: number, species: TreeSpecies, now: number) {
    const k = key(x, y);
    this.harvested.delete(k);
    this.exhausted.delete(k);
    this.felled.delete(k);
    this.berryBushes.delete(k);
    this.planted.set(k, { species, at: now });
    this.growing.add(k);
    this.revision++;
  }

  /** Anteil, der noch übrig ist (0..1) - `total` kennt der Aufrufer schon, das Gelände bleibt unberechnet. */
  remainingShare(x: number, y: number, total: number): number {
    const k = key(x, y);
    if (this.exhausted.has(k)) return 0;
    const taken = this.harvested.get(k);
    return taken === undefined ? 1 : Math.max(0, 1 - taken / total);
  }

  isExhausted(x: number, y: number): boolean {
    return this.exhausted.has(key(x, y));
  }

  isFelled(x: number, y: number): boolean {
    return this.felled.has(key(x, y));
  }

  /** In welche Richtung (Radiant) ein gefällter Baum liegt - undefined, wenn er steht. */
  fellDirection(x: number, y: number): number | undefined {
    return this.felled.get(key(x, y))?.dir;
  }

  /** Alles für die Anzeige - null, wenn dort nichts ist. Leere Beerensträucher bleiben, sie wachsen nach. */
  info(x: number, y: number, now: number): DepositInfo | null {
    const k = key(x, y);
    if (this.growing.has(k)) {
      return {
        type: 'wood', remaining: FORESTER.wood, total: FORESTER.wood, sapling: true,
        regrowIn: Math.max(0, this.planted.get(k)!.at + FORESTER.growTime - now),
      };
    }
    const bush = this.berryBushes.get(k);
    const found = this.remainingAt(x, y);
    if (!bush && (!found.type || found.amount <= 0)) return null;
    if (!bush) return { type: found.type!, remaining: found.amount, total: this.base(x, y).amount };
    const remaining = Math.max(0, bush.total - (this.harvested.get(k) ?? 0));
    return {
      type: 'berries',
      remaining,
      total: bush.total,
      // Rest der Pause plus Nachwachsen.
      regrowIn: Math.max(0, BERRY_REST - (now - bush.picked)) + (bush.total - remaining) / (bush.total / BERRY_REGROW_TIME),
    };
  }

  /**
   * Wie weit ein Baum umgefallen ist: Winkel (Radiant, 0 = steht) und
   * Richtung - null, wenn er steht. Der Fall beschleunigt wie unter
   * Schwerkraft, federt beim Aufschlag einmal nach und bleibt dann liegen.
   */
  fall(x: number, y: number, now: number): { angle: number; dir: number } | null {
    const f = this.felled.get(key(x, y));
    if (!f) return null;
    const t = now - f.at;
    const angle = t < FALL_SECONDS ? FALL_LYING * (t / FALL_SECONDS) ** 2
      : t < FALL_SECONDS + BOUNCE_SECONDS ? FALL_LYING - 0.14 * Math.sin((Math.PI * (t - FALL_SECONDS)) / BOUNCE_SECONDS)
      : FALL_LYING;
    return { angle, dir: f.dir };
  }

  /** Fällt den Baum auf (x, y) in Richtung `dir`. false, wenn er schon liegt. */
  fell(x: number, y: number, dir: number, now: number): boolean {
    const k = key(x, y);
    if (this.felled.has(k)) return false;
    this.felled.set(k, { at: now, dir });
    this.revision++;
    return true;
  }

  /** Alle angefassten Tiles: angebaut, gepflückt, gefällt oder gepflanzt und noch nicht ausgewachsen. */
  *touched(): Iterable<string> {
    yield* this.harvested.keys();
    for (const k of this.felled.keys()) if (!this.harvested.has(k)) yield k;
    for (const k of this.growing) if (!this.harvested.has(k) && !this.felled.has(k)) yield k;
  }

  /**
   * Entnimmt `amount` (höchstens, was noch da ist) und gibt zurück, wie viel
   * es war. Beerensträucher merken sich, wann gepflückt wurde - danach wachsen sie nach.
   */
  take(x: number, y: number, amount: number, now: number): number {
    const found = this.remainingAt(x, y);
    if (!found.type) return 0;
    const take = Math.min(amount, found.amount);
    const k = key(x, y);
    const before = this.harvested.get(k);
    if (before === undefined) this.revision++;
    const taken = (before ?? 0) + take;
    this.harvested.set(k, taken);
    if (found.type === 'berries') {
      const total = this.berryBushes.get(k)?.total ?? found.amount + taken - take;
      this.berryBushes.set(k, { total, picked: now });
    }
    if (found.amount - take <= 1e-6) this.exhausted.add(k);
    return take;
  }

  /**
   * Beerensträucher wachsen nach: erst BERRY_REST Sekunden nach dem letzten
   * Pflücken, dann in BERRY_REGROW_TIME Sekunden von leer auf voll. Sobald
   * wieder etwas daran hängt, kann man sie erneut abernten. true, wenn etwas nachwuchs.
   */
  regrow(dt: number, now: number): boolean {
    let grew = false;
    // Gepflanzte Bäume: ausgewachsen sind sie ein Vorkommen wie jeder andere.
    for (const k of this.growing) {
      if (now - this.planted.get(k)!.at < FORESTER.growTime) continue;
      this.growing.delete(k);
      this.revision++;
      grew = true;
    }
    for (const [k, { total, picked }] of this.berryBushes) {
      if (now - picked < BERRY_REST) continue;
      const taken = (this.harvested.get(k) ?? 0) - (total / BERRY_REGROW_TIME) * dt;
      if (taken <= 0) {
        this.harvested.delete(k);
        this.berryBushes.delete(k);
        this.exhausted.delete(k);
        this.revision++;
      } else {
        this.harvested.set(k, taken);
        if (taken < total - 1) this.exhausted.delete(k);
      }
      grew = true;
    }
    return grew;
  }

  /** Gepflanzte Bäume für den Speicherstand: Art und wie lange sie schon wachsen (höchstens growTime). */
  plantedSave(now: number): PlantedSave {
    const out: PlantedSave = {};
    for (const [k, p] of this.planted) out[k] = [p.species, Math.min(FORESTER.growTime, now - p.at)];
    return out;
  }

  /**
   * Aus dem Speicherstand: gepflanzte Bäume (fehlen in älteren Ständen) und
   * entnommene Mengen. Wann zuletzt gepflückt wurde, steht nicht darin - die
   * Pause beginnt von vorn. Angefangene Bäume liegen schon, ohne noch einmal
   * umzufallen; die Richtung ergibt sich aus der Lage. `now`: Weltzeit beim Laden.
   * VERIFIED: tests/forester.test.mjs - Speichern und Laden behält Bäume und Wuchs.
   */
  restore(harvested: Record<string, number>, planted: PlantedSave = {}, now = 0) {
    this.revision++;
    for (const [k, [species, grown]] of Object.entries(planted)) {
      if (!TREE_SPECIES[species] || !Number.isFinite(grown)) continue;
      this.planted.set(k, { species, at: now - grown });
      if (grown < FORESTER.growTime) this.growing.add(k);
    }
    for (const [k, amount] of Object.entries(harvested)) {
      this.harvested.set(k, amount);
      const comma = k.indexOf(',');
      const [x, y] = [Number(k.slice(0, comma)), Number(k.slice(comma + 1))];
      const found = this.base(x, y);
      if (amount >= found.amount) this.exhausted.add(k);
      if (found.type === 'berries') this.berryBushes.set(k, { total: found.amount, picked: 0 });
      if (found.type === 'wood') this.felled.set(k, { at: -Infinity, dir: ((x * 7 + y * 13) % 8) * (Math.PI / 4) });
    }
  }

  clear() {
    this.planted.clear();
    this.growing.clear();
    this.harvested.clear();
    this.exhausted.clear();
    this.berryBushes.clear();
    this.felled.clear();
  }
}
