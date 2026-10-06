// atlasLayout.ts
// Die "Tischdecke" des Geländes: Jedes Welt-Tile bekommt im Atlas einen Block,
// so groß wie das Tile im Bild ist - ein steiler Hang, der zur Kamera zeigt,
// mehr Texel als die flache Wiese. Hier nur Rechnung und Platzverwaltung,
// ohne GL (terrainRenderer.ts zeichnet).

/** Ein Rechteck im Atlas, in Texeln. */
export interface Block {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Seitenlängen des Blocks für ein Tile, in Texeln: so lang, wie seine Kanten
 * in x und in y im Bild sind (jeweils die längere der beiden). `project`
 * bildet einen Welt-Vektor (dx, dy, dz) auf Bildpixel ab. z sind die Höhen
 * der Ecken (0,0), (1,0), (0,1), (1,1) in Tiles.
 */
export function blockSize(
  z: [number, number, number, number],
  project: (dx: number, dy: number, dz: number) => [number, number],
  max: number,
): { w: number; h: number } {
  const length = (dx: number, dy: number, dz: number) => Math.hypot(...project(dx, dy, dz));
  const [z00, z10, z01, z11] = z;
  const alongX = Math.max(length(1, 0, z10 - z00), length(1, 0, z11 - z01));
  const alongY = Math.max(length(0, 1, z01 - z00), length(0, 1, z11 - z10));
  const side = (l: number) => Math.min(max, Math.max(2, Math.ceil(l)));
  return { w: side(alongX), h: side(alongY) };
}

/**
 * Platz im Atlas: Regale (Zeilen) je Höhenklasse, darin freie Abschnitte.
 * Höhen werden auf Klassen in Schritten von √2 aufgerundet, damit Blöcke
 * ähnlicher Höhe sich ein Regal teilen.
 */
export class ShelfAtlas {
  private shelves: { y: number; h: number; free: [number, number][] }[] = [];
  private top = 0;

  readonly size: number;

  constructor(size: number) {
    this.size = size;
  }

  /** Freier Block mit mindestens w x h, oder null, wenn der Atlas voll ist. */
  alloc(w: number, h: number): Block | null {
    if (w > this.size || h > this.size) return null;
    const shelfH = Math.min(this.size, Math.ceil(2 ** (Math.ceil(2 * Math.log2(h)) / 2)));
    for (const shelf of this.shelves) {
      if (shelf.h !== shelfH) continue;
      const i = shelf.free.findIndex(([, len]) => len >= w);
      if (i < 0) continue;
      const [x, len] = shelf.free[i];
      if (len === w) shelf.free.splice(i, 1);
      else shelf.free[i] = [x + w, len - w];
      return { x, y: shelf.y, w, h };
    }
    if (this.top + shelfH > this.size) return null;
    const shelf = { y: this.top, h: shelfH, free: [[w, this.size - w]] as [number, number][] };
    if (w === this.size) shelf.free = [];
    this.shelves.push(shelf);
    this.top += shelfH;
    return { x: 0, y: shelf.y, w, h };
  }

  /** Gibt einen Block zurück; benachbarte freie Abschnitte verschmelzen. */
  free(block: Block) {
    const shelf = this.shelves.find((s) => s.y === block.y);
    if (!shelf) throw new Error(`Atlas: kein Regal bei y=${block.y}`);
    shelf.free.push([block.x, block.w]);
    shelf.free.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i + 1 < shelf.free.length;) {
      const [x, len] = shelf.free[i];
      const [nx, nlen] = shelf.free[i + 1];
      if (x + len === nx) shelf.free.splice(i, 2, [x, len + nlen]);
      else i++;
    }
  }

  /** Alles frei - beim Wechsel von Maßstab, Neigung oder Drehung. */
  clear() {
    this.shelves = [];
    this.top = 0;
  }
}
