// BuildingBase.ts
// Was jedes Gebäude kann - abstrakt, gebaut wird immer die Klasse seiner Art
// (siehe index.ts). Lage, Trefferpunkte, welche Modell-Variante es zeigt,
// belegte Tiles, Speichern. Was für alle Gebäude einer Art gilt, steht
// statisch an der Klasse: `static definition`.

import type { BuildingType, CropType, ResourceKind } from '../catalog';
import type { BuildingDefinition } from './definition';
import type { Farm } from './Farm';
import type { StorageBuilding } from './StorageBuilding';
import type { UnitProducer } from './UnitProducer';

/** Ein Gebäude im Speicherstand - kurze Schlüssel, damit die Datei klein bleibt. */
export interface BuildingSave {
  /** Art */
  t: BuildingType;
  x: number;
  y: number;
  /** Trefferpunkte */
  hp?: number;
  /** Modell-Variante - fehlt in älteren Ständen, dann wie beim Bauen gewählt. */
  v?: number;
  /** UnitProducer: Einheiten in der Warteschlange. */
  q?: number;
  /** UnitProducer: Sammelpunkt. */
  r?: [number, number];
  /** Farm: nächste Frucht, Tiles, je Furche [Frucht, gepflügt, gesät, Wuchs, Nahrung, bezahlt]. */
  f?: { p: CropType; t?: number; r: [CropType, number, number, number, number, boolean][] };
  /** Reuse: wie voll sie ist, 0..1. */
  fl?: number;
}

/** Was beim Bauen mitgegeben werden kann - jede Klasse nimmt, was sie braucht. */
export interface BuildingOptions {
  /** Modell-Variante - ohne fest nach dem Bauplatz gewählt. */
  variant?: number;
  /** Farm: Frucht und belegte Tiles. */
  crop?: CropType;
  tiles?: number;
}

/** Was jede Gebäudeklasse statisch mitbringt. */
export interface BuildingClass {
  readonly definition: BuildingDefinition;
}

export abstract class BuildingBase {
  /** Verbleibende Trefferpunkte - höchstens maxHp. */
  hp: number;
  /** Welches der Modelle in `models` es zeigt. */
  variant: number;

  /** @param x, y Ankerpunkt: die Mitte des Grundrisses */
  constructor(readonly x: number, readonly y: number, options: BuildingOptions = {}) {
    this.hp = this.definition.hp;
    // Fest nach dem Bauplatz: nicht jedes Haus sieht gleich aus, jedes bleibt aber, wie es ist.
    const count = this.models.length;
    const hash = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
    const { variant } = options;
    this.variant = variant !== undefined && variant >= 0 && variant < count ? variant : hash % count;
  }

  /** Was für alle Gebäude dieser Art gilt: Name, Kosten, Größe, ... */
  get definition(): BuildingDefinition {
    return (this.constructor as unknown as BuildingClass).definition;
  }

  /** Art des Gebäudes, z. B. 'house'. */
  get type(): BuildingType {
    return this.definition.type as BuildingType;
  }

  get label(): string {
    return this.definition.label;
  }

  get maxHp(): number {
    return this.definition.hp;
  }

  /** Trefferpunkte als Anteil 0..1 - für den Lebensbalken. */
  get health(): number {
    return this.hp / this.maxHp;
  }

  /** Schlüssel des Ankerpunkts ("x,y") - unter dem die Welt das Gebäude führt. */
  get anchor(): string {
    return `${this.x},${this.y}`;
  }

  /** Alle Modelle dieser Art - eines, oder die Varianten. */
  get models(): number[] {
    return this.definition.models ?? [this.definition.model];
  }

  /** Das Modell, das es zeigt. */
  get model(): number {
    return this.models[this.variant];
  }

  /** Können Dorfbewohner hier diesen Rohstoff abliefern? */
  stores(resource: ResourceKind): boolean {
    return this.definition.storedResources.includes(resource);
  }

  /** Belegte Tiles: das Quadrat des Grundrisses um den Ankerpunkt. */
  footprintTiles(): [number, number][] {
    const r = (this.definition.footprint - 1) / 2;
    const tiles: [number, number][] = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) tiles.push([this.x + dx, this.y + dy]);
    }
    return tiles;
  }

  isUnitProducer(): this is UnitProducer {
    return false;
  }

  isStorage(): this is StorageBuilding {
    return false;
  }

  isFarm(): this is Farm {
    return false;
  }

  /** Eine Werkstatt, in der genau ein Dorfbewohner arbeitet (Bognerei, Fischerhütte)? */
  isWorkshop(): boolean {
    return false;
  }

  /** Für den Speicherstand - Unterklassen ergänzen ihres. */
  toSave(): BuildingSave {
    return {
      t: this.type, x: this.x, y: this.y, hp: this.hp,
      ...(this.models.length > 1 ? { v: this.variant } : {}),
    };
  }

  /**
   * Übernimmt, was im Speicherstand steht - Unterklassen ergänzen ihres.
   * `scale` vergrößert Koordinaten älterer Stände (siehe buildingFromSave).
   */
  restore(save: BuildingSave, _scale: number) {
    // Ältere Speicherstände kennen keine Trefferpunkte - dann unbeschädigt.
    this.hp = Math.min(save.hp ?? this.maxHp, this.maxHp);
  }
}
