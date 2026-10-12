// Placement.ts
// Der Baumodus: welche Art gerade gebaut wird, ob gerade Felder "gesät"
// werden (Maustaste gedrückt über die Wiese ziehen), die Linie einer Mauer
// (Klick, ziehen, loslassen - B34) und ob am Zeiger gebaut werden kann -
// gemerkt, bis sich der Zeiger oder die Welt ändert.

import type { BuildingType } from '../world/catalog';
import { wallLine } from '../world/walls';
import type { World } from '../world/world';

/** Ein Tile der Mauer-Linie in der Vorschau: geht es dort? */
export interface LineTile { x: number; y: number; ok: boolean }

export class Placement {
  /** Die Art, die gerade gebaut wird - oder null (kein Baumodus). */
  placingType: BuildingType | null = null;
  /** Maustaste gedrückt im Feld-Baumodus: jedes überstrichene Tile wird Feld. */
  sowing = false;
  /** Letzte Prüfung am Zeiger - canPlace ist zu teuer für jedes Bild. */
  private lastCheck = { x: NaN, y: NaN, type: '', result: null as string | null };
  /** Mauer: Tile, an dem die Maustaste gedrückt wurde, und das jetzige Ende - null, solange nicht gezogen wird. */
  line: { x0: number; y0: number; x1: number; y1: number } | null = null;
  /** Die geprüfte Linie, gemerkt, bis sich Ende oder Welt ändern (invalidate). */
  private lineCheck: { key: string; tiles: LineTile[] } | null = null;

  constructor(private world: World) {}

  get isActive(): boolean {
    return this.placingType !== null;
  }

  /**
   * Warum hier nicht gebaut werden kann - null, wenn es geht. Gemerkt je
   * Tile und Art; nach jedem Eingriff in die Welt invalidate().
   */
  check(x: number, y: number, type: BuildingType): string | null {
    const last = this.lastCheck;
    if (last.x !== x || last.y !== y || last.type !== type) {
      this.lastCheck = { x, y, type, result: this.world.canPlace(x, y, type) };
    }
    return this.lastCheck.result;
  }

  /** Vorrat, belegte Tiles oder Blickrichtung haben sich geändert. */
  invalidate() {
    this.lastCheck.x = NaN;
    this.lineCheck = null;
  }

  /**
   * Die Tiles der gezogenen Mauer-Linie mit Prüfung - rot, wo es nicht geht
   * und ab dem Stück, für das der Vorrat nicht mehr reicht.
   */
  lineTiles(): LineTile[] {
    const { line, placingType: type } = this;
    if (!line || !type) return [];
    const key = `${type}:${line.x0},${line.y0},${line.x1},${line.y1}`;
    if (this.lineCheck?.key !== key) {
      let budget = this.world.affordableCount(type);
      const tiles = wallLine(line.x0, line.y0, line.x1, line.y1).map(({ x, y }) => {
        // Schon Mauer: bleibt, kostet nichts.
        if (this.world.at(x, y)?.isWall()) return { x, y, ok: true };
        const ok = budget > 0 && this.world.canPlace(x, y, type) === null;
        if (ok) budget--;
        return { x, y, ok };
      });
      this.lineCheck = { key, tiles };
    }
    return this.lineCheck.tiles;
  }

  /** Baut die gewählte Art auf (x, y). null, wenn gebaut wurde - sonst der Grund. */
  place(x: number, y: number): string | null {
    if (!this.placingType) return 'Kein Baumodus';
    const reason = this.world.place(x, y, this.placingType);
    this.invalidate();
    return reason;
  }

  /** Reicht der Vorrat für ein weiteres Gebäude dieser Art? */
  canAffordAnother(): boolean {
    return this.placingType !== null && this.world.affordable(this.placingType);
  }
}
