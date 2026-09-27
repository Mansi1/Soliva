// Pointer.ts
// Wo der Mauszeiger auf dem Spielfeld steht: die Stelle in CSS-Pixeln, das
// Tile darunter und - mit ausgewählten Dorfbewohnern - das Vorkommen, auf
// dessen Objekt (Baumkrone, Fels) er zeigt. Nichts davon, solange der Zeiger
// nicht über dem Spielfeld ist.

import type { CanvasPoint } from './MouseInput';

export interface Tile {
  x: number;
  y: number;
}

export class Pointer {
  /** Stelle auf dem Canvas (CSS-Pixel) - null, wenn der Zeiger nicht darüber ist. */
  pixel: CanvasPoint | null = null;
  /** Ein Linksklick hier wählt etwas aus (wie PlayerActions.clickSelect) - Hand als Mauszeiger. */
  selectable = false;
  /** Tile unter dem Zeiger. */
  tile: Tile | null = null;
  /** Vorkommen, auf dessen Objekt der Zeiger zeigt - für den Sammel-Mauszeiger. */
  object: Tile | null = null;

  /** Zeiger hat das Spielfeld verlassen. */
  clear() {
    this.pixel = null;
    this.tile = null;
    this.object = null;
    this.selectable = false;
  }

  /** Neue Stelle; true, wenn sich das Objekt darunter geändert hat. */
  setObject(object: Tile | undefined): boolean {
    const next = object ?? null;
    if (next?.x === this.object?.x && next?.y === this.object?.y) return false;
    this.object = next;
    return true;
  }

  /** Neues Tile; true, wenn es ein anderes ist. */
  setTile(tile: Tile): boolean {
    if (this.tile && tile.x === this.tile.x && tile.y === this.tile.y) return false;
    this.tile = tile;
    return true;
  }
}
