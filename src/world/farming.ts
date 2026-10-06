// farming.ts
// Felder bestellen: Nebeneinander liegende Feldstücke (Farm) bilden ein
// zusammenhängendes Feld, auf dem alle Bauern gemeinsam arbeiten - erst alles
// pflügen, dann alles säen, warten, bis alles reif ist, dann gemeinsam
// ernten; abgeerntet wird alles neu gesät. Hier stehen die Gruppen, die
// Phase, die Suche nach einer freien Furche und wo der Bauer in seiner Furche
// steht. Was ein Bauer Schritt für Schritt tut, steht bei den Dorfbewohnern.

import { furrowPosition, type Building, type Farm, type Furrow } from './building';
import { CROPS, FIELD_ROWS, VILLAGER } from './catalog';

/** Was auf einem zusammenhängenden Feld gerade dran ist. */
export type FarmPhase = 'plough' | 'sow' | 'grow' | 'harvest' | 'done';

/** Eine Furche mit ihrem Feldstück und ihrer Nummer. */
export interface FurrowRef {
  building: Farm;
  row: number;
  f: Furrow;
}

/**
 * Pflanzfläche eines Felds: halbe Kantenlänge in Metern wie im Modell
 * (INNER in tools/models/farmsGen.mjs), bei 5 m je Tile.
 */
export const FIELD_INNER = 7.5;
export const METERS_PER_TILE = 5;

/** Was die Felder von der Welt brauchen. */
export interface FarmingWorld {
  /** Das Gebäude auf einem Tile. */
  at(x: number, y: number): Building | undefined;
  allBuildings(): Iterable<Building>;
}

/** Schlüssel einer Furche - "Ankerpunkt#Nummer". */
export const furrowKey = (building: Building, row: number) => `${building.anchor}#${row}`;

/** Hat diese Furche in dieser Phase etwas zu tun? */
export function furrowNeeds(f: Furrow, phase: FarmPhase): boolean {
  return phase === 'plough' ? f.plough < 1
    : phase === 'sow' ? f.sown < 1
    : phase === 'harvest' ? f.food > 1e-6
    : false;
}

export class Farming {
  /** Zusammenhängende Felder je Feldstück - neu berechnet, wenn sich an den Gebäuden etwas ändert. */
  private groups = new Map<string, Farm[]>();
  /** Die Furchen je Feld (furrows) - gemerkt wie die Gruppen; jeder Bauer fragt sie in jedem Tick ab. */
  private furrowLists = new Map<Farm[], FurrowRef[]>();

  constructor(private world: FarmingWorld) {}

  /** Nach Bau oder Abriss: die Gruppen neu berechnen. */
  invalidate() {
    this.groups.clear();
    this.furrowLists.clear();
  }

  /** Das zusammenhängende Feld, zu dem `building` gehört (leer, wenn es kein Feld ist). */
  group(building: Building): Farm[] {
    if (!building.isFarm()) return [];
    const known = this.groups.get(building.anchor);
    if (known) return known;
    const group: Farm[] = [];
    const seen = new Set<Building>([building]);
    const queue: Farm[] = [building];
    while (queue.length > 0) {
      const farm = queue.pop()!;
      group.push(farm);
      for (const [tx, ty] of farm.footprintTiles()) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const neighbour = this.world.at(tx + dx, ty + dy);
          if (neighbour?.isFarm() && !seen.has(neighbour)) {
            seen.add(neighbour);
            queue.push(neighbour);
          }
        }
      }
    }
    for (const farm of group) this.groups.set(farm.anchor, group);
    return group;
  }

  /** Alle Furchen eines Felds, die es gibt (kleinere Feldstücke haben nicht alle neun). */
  furrows(group: Farm[]): readonly FurrowRef[] {
    let list = this.furrowLists.get(group);
    if (!list) {
      // Gilt, solange die Gruppe gilt: Tiles und Furchen eines Felds ändern sich nur beim Anlegen und Laden.
      list = group.flatMap((building) => building.furrows
        .map((f, row) => ({ building, row, f }))
        .filter(({ row }) => building.furrowCells(row).length > 0));
      this.furrowLists.set(group, list);
    }
    return list;
  }

  /** Was auf dem Feld, zu dem `building` gehört, gerade dran ist. */
  phase(building: Building): FarmPhase {
    let plough = false, sow = false, ripe = true, food = false;
    for (const { f } of this.furrows(this.group(building))) {
      if (f.plough < 1) plough = true;
      else if (f.sown < 1) sow = true;
      if (f.sown < 1 || f.growth < 1) ripe = false;
      if (f.food > 1e-6) food = true;
    }
    return plough ? 'plough' : sow ? 'sow' : !ripe ? 'grow' : food ? 'harvest' : 'done';
  }

  /**
   * Eine freie Furche auf dem Feld von `near` - lieber eine mit Arbeit in
   * der aktuellen Phase -, sonst auf dem nächsten anderen Feld.
   * @param busy Furchen, auf denen schon jemand arbeitet (furrowKey)
   */
  freeFurrow(near: Building, busy: ReadonlySet<string>): { building: string; row: number } | undefined {
    const free = (building: Building) => {
      const phase = this.phase(building);
      const rows = this.furrows(this.group(building)).filter((r) => !busy.has(furrowKey(r.building, r.row)));
      const pick = rows.find(({ f }) => furrowNeeds(f, phase)) ?? rows[0];
      return pick && { building: pick.building.anchor, row: pick.row };
    };
    const own = free(near);
    if (own) return own;
    const mine = new Set(this.group(near));
    let best: { building: string; row: number } | undefined;
    let bestDistance: number = VILLAGER.searchRadius;
    for (const building of this.world.allBuildings()) {
      if (!building.isFarm() || mine.has(building)) continue;
      const distance = Math.hypot(building.x - near.x, building.y - near.y);
      if (distance >= bestDistance) continue;
      const spot = free(building);
      if (spot) {
        bestDistance = distance;
        best = spot;
      }
    }
    return best;
  }

  /** Eingesäte Furchen wachsen bis zur Reife - auch ohne Bauer. true, wenn etwas gewachsen ist. */
  grow(dt: number): boolean {
    let grew = false;
    for (const building of this.world.allBuildings()) {
      if (!building.isFarm()) continue;
      for (const f of building.furrows) {
        if (f.sown < 1 || f.growth >= 1) continue;
        f.growth = Math.min(1, f.growth + dt / CROPS[f.crop].growTime);
        grew = true;
      }
    }
    return grew;
  }
}

/**
 * Wo der Bauer in seiner Furche steht und wohin er greift: beim Pflügen und
 * Säen dort, wo er gerade ist (von einem Ende zum anderen), beim Ernten an
 * der letzten Pflanze, die noch steht; solange es wächst - oder mit `wander`
 * -, geht er die Furche ab und jätet. Er steht neben der Furche, zur Kamera hin.
 * @param walkPhase 0..1 hin und her, je Bauer versetzt (aus Weltzeit und Kennung)
 */
export function farmSpot(building: Farm, row: number, walkPhase: number, wander = false): { x: number; y: number; aimX: number; aimY: number } {
  const f = building.furrows[row];
  const q = furrowPosition(building.tiles, row, wander ? walkPhase
    : f.plough < 1 ? f.plough
    : f.sown < 1 ? f.sown
    : f.growth < 1 ? walkPhase
    : building.furrowShare(row));
  const gap = (2 * FIELD_INNER) / FIELD_ROWS;
  // Modell: Furchen quer zur Blickrichtung (Welt-x), entlang Welt-y.
  const aimX = building.x + 0.5 + (-FIELD_INNER + (row + 0.5) * gap) / METERS_PER_TILE;
  // In Schritten: er geht ab und zu ein Stück weiter, statt zu rutschen.
  const STEP = 0.2;
  const along = Math.round((q * 2 * FIELD_INNER / METERS_PER_TILE) / STEP) * STEP;
  const aimY = building.y + 0.5 - FIELD_INNER / METERS_PER_TILE + along;
  return { x: aimX + (gap * 0.5) / METERS_PER_TILE, y: aimY, aimX, aimY };
}
