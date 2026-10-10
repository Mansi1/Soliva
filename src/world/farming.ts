// farming.ts
// Felder bestellen: Jedes Feldstück (Farm) arbeitet für sich - bis zu
// FARMERS_PER_FIELD Bauern bleiben darauf, erst wird alles gepflügt, dann alles
// gesät, gejätet, bis alles reif ist, dann geerntet; abgeerntet wird neu gesät,
// nach REPLOUGH_AFTER Ernten vorher neu gepflügt. Hier stehen die Phase eines
// Feldstücks, die Suche nach einer freien Furche, die angrenzenden Stücke mit
// derselben Frucht und wo der Bauer in seiner Furche steht. Was ein Bauer
// Schritt für Schritt tut, steht bei den Dorfbewohnern.

import { furrowPosition, type Building, type Farm, type Furrow } from './building';
import { CROPS, FARMERS_PER_FIELD, FIELD_ROWS, RESEED_COST, VILLAGER, type CropType, type Resources } from './catalog';

/**
 * Was auf einem Feldstück gerade dran ist. `wood`: es müsste gesät werden,
 * aber das Holz fehlt und nichts ist reif - die Bauern jäten.
 */
export type FarmPhase = 'plough' | 'sow' | 'wood' | 'grow' | 'harvest' | 'done';

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
  /** Reicht der Vorrat? - fürs Neusäen. */
  canPay(cost: Partial<Resources>): boolean;
}

/** Schlüssel einer Furche - "Ankerpunkt#Nummer". */
export const furrowKey = (building: Building, row: number) => `${building.anchor}#${row}`;

/** Hat diese Furche in dieser Phase etwas zu tun? Geerntet wird nur, was gesät und reif ist. */
export function furrowNeeds(f: Furrow, phase: FarmPhase): boolean {
  return phase === 'plough' ? f.plough < 1
    : phase === 'sow' ? f.sown < 1
    : phase === 'harvest' ? f.sown >= 1 && f.growth >= 1 && f.food > 1e-6
    : false;
}

/** Die Frucht, die auf einem Feldstück wächst - sonst die, die als Nächstes gesät wird. */
export function fieldCrop(farm: Farm): CropType {
  const active = farm.activeFurrows();
  return (active.find((f) => f.sown > 0) ?? active[0] ?? farm.furrows[0]).crop;
}

export class Farming {
  /** Die Furchen je Feldstück (furrows) - jeder Bauer fragt sie in jedem Tick ab. */
  private furrowLists = new Map<Farm, FurrowRef[]>();

  constructor(private world: FarmingWorld) {}

  /** Nach Bau, Abriss oder Laden: die gemerkten Furchen vergessen. */
  invalidate() {
    this.furrowLists.clear();
  }

  /**
   * Die angrenzenden Feldstücke, auf denen dieselbe Frucht wächst wie auf
   * `building`, samt ihm selbst (leer, wenn es kein Feld ist) - für den
   * Fruchtwechsel. Nicht gemerkt: die Frucht wechselt mit jeder Aussaat.
   */
  group(building: Building): Farm[] {
    if (!building.isFarm()) return [];
    const crop = fieldCrop(building);
    const group: Farm[] = [];
    const seen = new Set<Building>([building]);
    const queue: Farm[] = [building];
    while (queue.length > 0) {
      const farm = queue.pop()!;
      group.push(farm);
      for (const [tx, ty] of farm.footprintTiles()) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const neighbour = this.world.at(tx + dx, ty + dy);
          if (neighbour?.isFarm() && !seen.has(neighbour) && fieldCrop(neighbour) === crop) {
            seen.add(neighbour);
            queue.push(neighbour);
          }
        }
      }
    }
    return group;
  }

  /** Die Furchen eines Feldstücks, die es gibt (kleinere Feldstücke haben nicht alle neun). */
  furrows(building: Farm): readonly FurrowRef[] {
    let list = this.furrowLists.get(building);
    if (!list) {
      // Gilt bis zum nächsten invalidate: die Tiles eines Feldstücks ändern sich nur beim Anlegen und Laden.
      list = building.furrows
        .map((f, row) => ({ building, row, f }))
        .filter(({ row }) => building.furrowCells(row).length > 0);
      this.furrowLists.set(building, list);
    }
    return list;
  }

  /**
   * Was auf dem Feldstück gerade dran ist. Fehlt beim Säen das Holz, wird
   * geerntet, was schon reif ist, sonst gejätet (`wood`) - die Bauern stehen
   * nicht still.
   * VERIFIED: tests/fields.test.mjs - Phase je Feldstück; ohne Holz erst Reifes ernten, dann `wood`.
   */
  phase(building: Building): FarmPhase {
    if (!building.isFarm()) return 'done';
    let plough = false, sow = false, payable = false, ripe = true, food = false;
    for (const { f } of this.furrows(building)) {
      if (f.plough < 1) plough = true;
      else if (f.sown < 1) {
        sow = true;
        if (f.paid) payable = true;
      }
      if (f.sown < 1 || f.growth < 1) ripe = false;
      else if (f.food > 1e-6) food = true;
    }
    if (plough) return 'plough';
    if (sow) return payable || this.world.canPay(RESEED_COST) ? 'sow' : food ? 'harvest' : 'wood';
    return !ripe ? 'grow' : food ? 'harvest' : 'done';
  }

  /**
   * Eine freie Furche auf dem Feldstück `near` - lieber eine mit Arbeit in
   * der aktuellen Phase -, solange dort weniger als FARMERS_PER_FIELD
   * arbeiten; sonst auf dem nächsten anderen Feldstück.
   * @param busy Furchen, auf denen schon jemand arbeitet (furrowKey)
   */
  freeFurrow(near: Building, busy: ReadonlySet<string>): { building: string; row: number } | undefined {
    const free = (building: Farm) => {
      const rows = this.furrows(building);
      const open = rows.filter((r) => !busy.has(furrowKey(r.building, r.row)));
      if (rows.length - open.length >= FARMERS_PER_FIELD) return undefined;
      const phase = this.phase(building);
      const pick = open.find(({ f }) => furrowNeeds(f, phase)) ?? open[0];
      return pick && { building: pick.building.anchor, row: pick.row };
    };
    const own = near.isFarm() ? free(near) : undefined;
    if (own) return own;
    let best: { building: string; row: number } | undefined;
    let bestDistance: number = VILLAGER.searchRadius;
    for (const building of this.world.allBuildings()) {
      if (!building.isFarm() || building === near) continue;
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
