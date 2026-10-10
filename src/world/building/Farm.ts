// Farm.ts
// Feld: Tile für Tile angelegt; nebeneinander wachsen Felder zu einem großen
// zusammen. Ein Feld liegt in einem 3x3-Raster um seinen Ankerpunkt und
// belegt davon nur seine Tiles (`tiles`). Darauf laufen neun Furchen, jede
// wird gepflügt, gesät, wächst und wird geerntet. Das Modell zeigt die
// Frucht der ersten Furche.

import { Color } from '../../functions/Color';
import { SHAPE } from '../../gl/entityRenderer';
import { CROPS, FIELD_ROWS, type CropType } from '../catalog';
import { BuildingBase, type BuildingOptions, type BuildingSave } from './BuildingBase';
import { defineBuilding } from './definition';

/**
 * Eine Furche. Sie wird umgepflügt, eingesät, wächst, wird abgeerntet und
 * danach wieder eingesät - jede für sich, mit eigenem Bauer.
 */
export interface Furrow {
  /** Die Frucht, die darin steht bzw. als Nächstes gesät wird. */
  crop: CropType;
  /** 0..1 - wie weit umgepflügt. Nach REPLOUGH_AFTER Ernten wieder 0 (Farm.harvests). */
  plough: number;
  /** 0..1 - wie weit eingesät. */
  sown: number;
  /** 0..1 ab der vollständigen Aussaat - erst reif wird geerntet. */
  growth: number;
  /** Nahrung, die noch darin steht. */
  food: number;
  /** Aussaat schon bezahlt (die erste mit dem Feld, jede weitere einzeln). */
  paid: boolean;
}

/** Alle neun Tiles - Felder aus älteren Spielständen. */
export const ALL_TILES = 511;
/** Nur das mittlere Tile - ein neues Feld liegt auf dem Tile, wo es angelegt wurde. */
export const CENTER_TILE = 1 << 4;

/** Bit des Tiles (x + dx, y + dy) in der Maske, dx und dy -1..1. */
const tileBit = (dx: number, dy: number) => 1 << ((dx + 1) * 3 + dy + 1);

/** Liegt Tile (dx, dy) des 3x3-Rasters in der Maske? */
export function maskCovers(tiles: number, dx: number, dy: number): boolean {
  return (tiles & tileBit(dx, dy)) !== 0;
}

/**
 * Die Tiles (0..2 quer zur Furche), über die Furche `row` läuft - drei
 * Furchen je Tile-Reihe, jede läuft über die drei Tiles ihrer Reihe.
 */
export function furrowCells(tiles: number, row: number): number[] {
  const i = Math.floor(row / 3);
  return [0, 1, 2].filter((j) => (tiles >> (i * 3 + j)) & 1);
}

/** Nahrung in einer vollen Furche - weniger, wenn sie nur über einen Teil der Tiles läuft. */
export function furrowFood(crop: CropType, tiles: number, row: number): number {
  return (CROPS[crop].food / FIELD_ROWS) * (furrowCells(tiles, row).length / 3);
}

/**
 * Fortschritt t (0..1) entlang einer Furche als Lage im Modell (0..1): er
 * überspringt die Tiles, die nicht zum Feld gehören.
 */
export function furrowPosition(tiles: number, row: number, t: number): number {
  const cells = furrowCells(tiles, row);
  if (cells.length === 0) return 0;
  const k = Math.min(cells.length - 1, Math.floor(t * cells.length));
  return (cells[k] + (t * cells.length - k)) / 3;
}

/** Frische Furchen für diese Tiles: abgesteckt, noch nicht gepflügt. */
function newFurrows(crop: CropType, tiles: number): Furrow[] {
  return Array.from({ length: FIELD_ROWS }, (_, row) => ({
    crop, plough: 0, sown: 0, growth: 0, food: furrowFood(crop, tiles, row), paid: true,
  }));
}

export class Farm extends BuildingBase {
  static readonly definition = defineBuilding({
    type: 'farm',
    label: 'Feld',
    key: '6',
    color: Color.rgb(196, 168, 82),
    model: SHAPE.farmWheat,
    // Das Modell deckt die 3x3 Tiles ab und zeigt nur die eigenen.
    size: 3,
    // Auf Sand und Schnee wächst nichts.
    terrain: ['grass', 'forest'],
    // Ein Neuntel eines AoE2-Felds (60 Holz für 3x3).
    cost: { wood: 7 },
    hp: 60,
  });

  /** Die Frucht für neue Aussaaten. */
  plan: CropType;
  /** Welche der 3x3 Tiles zum Feld gehören: Bit (dx + 1) * 3 + dy + 1. */
  tiles: number;
  furrows: Furrow[];
  /**
   * Ernten seit dem letzten Pflügen - nach REPLOUGH_AFTER wird neu gepflügt.
   * VERIFIED: tests/fields.test.mjs - gespeichert; ältere Stände ohne Zähler laden mit 0.
   */
  harvests = 0;

  constructor(x: number, y: number, options: BuildingOptions = {}) {
    super(x, y, options);
    this.plan = options.crop ?? 'wheat';
    this.tiles = options.tiles ?? CENTER_TILE;
    this.furrows = newFurrows(this.plan, this.tiles);
  }

  override isFarm(): this is Farm {
    return true;
  }

  /** Die Frucht der ersten Furche. */
  override get model(): number {
    return CROPS[this.furrows[0].crop].shape;
  }

  /** Nur die Tiles der Maske. */
  override footprintTiles(): [number, number][] {
    const tiles: [number, number][] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) if (this.covers(dx, dy)) tiles.push([this.x + dx, this.y + dy]);
    }
    return tiles;
  }

  /** Gehört Tile (x + dx, y + dy) zum Feld? dx und dy -1..1. */
  covers(dx: number, dy: number): boolean {
    return maskCovers(this.tiles, dx, dy);
  }

  /** Die Tiles, über die Furche `row` läuft (0..2 quer zur Furche). */
  furrowCells(row: number): number[] {
    return furrowCells(this.tiles, row);
  }

  /** Die Furchen, die es auf diesem Feld gibt - ein Feldstück hat drei. */
  activeFurrows(): Furrow[] {
    return this.furrows.filter((_, row) => this.furrowCells(row).length > 0);
  }

  /** Nahrung in Furche `row`, wenn sie voll ist. */
  fullFood(row: number): number {
    return furrowFood(this.furrows[row].crop, this.tiles, row);
  }

  /** Stand einer Furche für den Shader: 0..1 gepflügt, 1..2 gesät, 2..3 gewachsen - als Lage im Modell. */
  furrowStage(row: number): number {
    const f = this.furrows[row];
    return f.plough < 1 ? furrowPosition(this.tiles, row, f.plough)
      : f.sown < 1 ? 1 + furrowPosition(this.tiles, row, f.sown)
      : 2 + f.growth;
  }

  /** Wie viel einer Furche noch steht (0..1). */
  furrowShare(row: number): number {
    const full = this.fullFood(row);
    // Reste unter der Schwelle, ab der geerntet wird, sind leer.
    return full > 0 && this.furrows[row].food > 1e-6 ? this.furrows[row].food / full : 0;
  }

  /** Neue Frucht: gilt ab der nächsten Aussaat; Furchen, die noch nicht gesät sind, wechseln gleich. */
  setPlan(crop: CropType) {
    this.plan = crop;
    this.furrows.forEach((f, row) => {
      if (f.sown > 0) return;
      f.crop = crop;
      f.food = furrowFood(crop, this.tiles, row);
    });
  }

  override toSave(): BuildingSave {
    return {
      ...super.toSave(),
      f: {
        p: this.plan,
        t: this.tiles,
        h: this.harvests,
        r: this.furrows.map((f) => [f.crop, f.plough, f.sown, f.growth, f.food, f.paid] as
          [CropType, number, number, number, number, boolean]),
      },
    };
  }

  override restore(save: BuildingSave, scale: number) {
    super.restore(save, scale);
    // Ältere Speicherstände haben noch ganze 3x3-Felder.
    this.plan = save.f && CROPS[save.f.p] ? save.f.p : 'wheat';
    this.tiles = save.f?.t ?? ALL_TILES;
    this.furrows = newFurrows(this.plan, this.tiles);
    // Ältere Spielstände zählen noch keine Ernten.
    this.harvests = save.f?.h ?? 0;
    (save.f?.r ?? []).slice(0, FIELD_ROWS).forEach(([crop, plough, sown, growth, food, paid], i) => {
      if (CROPS[crop]) this.furrows[i] = { crop, plough, sown, growth, food, paid };
    });
  }
}
