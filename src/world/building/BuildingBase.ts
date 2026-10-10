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
  /** UnitProducer: Warteschlange, 1 = Frau, 0 = Mann - ältere Stände: nur die Anzahl. */
  q?: number | (0 | 1)[];
  /** UnitProducer: Sammelpunkt - Tile, dahinter die genaue Stelle (fehlt in älteren Ständen). */
  r?: [number, number] | [number, number, number, number];
  /** Farm: nächste Frucht, Tiles, Ernten seit dem Pflügen, je Furche [Frucht, gepflügt, gesät, Wuchs, Nahrung, bezahlt]. */
  f?: { p: CropType; t?: number; h?: number; r: [CropType, number, number, number, number, boolean][] };
  /** Reuse: wie voll sie ist, 0..1. */
  fl?: number;
  /** Lager: was darin liegt, je Rohstoff und Sorte (siehe BuildingBase.goods) - fehlt, wenn leer. */
  g?: Goods;
}

/**
 * Was in einem Lager liegt: je Rohstoff die Sorten mit Menge, z. B.
 * `{ wood: { Eiche: 40 }, food: { Weizen: 120 } }`. Die Sorte ist ihr Name in
 * der Oberfläche (Baum- und Beerenart, Frucht, "Fisch", "Fleisch"); ohne
 * bekannte Sorte der Name des Rohstoffs ("Holz", "Nahrung").
 */
export type Goods = Partial<Record<ResourceKind, Record<string, number>>>;

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

/** Alle Modelle einer Art - eines, oder die Varianten. */
export function modelsOf(definition: BuildingDefinition): number[] {
  return definition.models ?? [definition.model];
}

/**
 * Welche Variante ein Gebäude ohne gespeicherte Wahl am Bauplatz (Ankerpunkt
 * x, y) zeigt. Fest nach dem Bauplatz: nicht jedes Haus sieht gleich aus, jedes
 * bleibt aber, wie es ist - und die Bauvorschau zeigt dasselbe.
 * VERIFIED: tests/build-preview.test.mjs (echte Vorschau gegen World.place).
 */
export function siteVariant(definition: BuildingDefinition, x: number, y: number): number {
  const hash = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
  return hash % modelsOf(definition).length;
}

export abstract class BuildingBase {
  /** Verbleibende Trefferpunkte - höchstens maxHp. */
  hp: number;
  /** Welches der Modelle in `models` es zeigt. */
  variant: number;
  /**
   * Lager: was hier abgeliefert wurde und noch liegt. Es bleibt, wo es
   * abgeliefert wurde; bezahlt wird aus allen Lagern zusammen (World.pay).
   * VERIFIED: tests/storage-stock.test.mjs - Ablieferung mit Baumart, Speichern und Laden.
   */
  goods: Goods = {};

  /** @param x, y Ankerpunkt: die Mitte des Grundrisses */
  constructor(readonly x: number, readonly y: number, options: BuildingOptions = {}) {
    this.hp = this.definition.hp;
    const count = this.models.length;
    const { variant } = options;
    this.variant = variant !== undefined && variant >= 0 && variant < count ? variant : siteVariant(this.definition, x, y);
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
    return modelsOf(this.definition);
  }

  /** Das Modell, das es zeigt. */
  get model(): number {
    return this.models[this.variant];
  }

  /** Können Dorfbewohner hier diesen Rohstoff abliefern? */
  stores(resource: ResourceKind): boolean {
    return this.definition.storedResources.includes(resource);
  }

  /** So viel von `resource` liegt hier, alle Sorten zusammen. */
  stored(resource: ResourceKind): number {
    let sum = 0;
    for (const amount of Object.values(this.goods[resource] ?? {})) sum += amount;
    return sum;
  }

  /** So viel `resource` passt noch hinein: Bögen bis weaponCapacity, sonst unbegrenzt; 0, wenn es das nicht annimmt. */
  room(resource: ResourceKind): number {
    if (!this.stores(resource)) return 0;
    return resource === 'bows' ? Math.max(0, this.definition.weaponCapacity - this.stored('bows')) : Infinity;
  }

  /** Legt `amount` der Sorte `kind` hinein - ohne Prüfung, ob es passt (siehe room). */
  addGoods(resource: ResourceKind, kind: string, amount: number) {
    const sorts = (this.goods[resource] ??= {});
    sorts[kind] = (sorts[kind] ?? 0) + amount;
  }

  /** Nimmt bis zu `amount` von `resource` heraus, Sorte um Sorte - gibt zurück, wie viel. */
  takeGoods(resource: ResourceKind, amount: number): number {
    const sorts = this.goods[resource];
    if (!sorts) return 0;
    let taken = 0;
    for (const [kind, have] of Object.entries(sorts)) {
      const take = Math.min(have, amount - taken);
      taken += take;
      if (have - take <= 1e-9) delete sorts[kind];
      else sorts[kind] = have - take;
      if (taken >= amount) break;
    }
    if (Object.keys(sorts).length === 0) delete this.goods[resource];
    return taken;
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
      ...(Object.keys(this.goods).length > 0 ? { g: this.goods } : {}),
    };
  }

  /**
   * Übernimmt, was im Speicherstand steht - Unterklassen ergänzen ihres.
   * `scale` vergrößert Koordinaten älterer Stände (siehe buildingFromSave).
   */
  restore(save: BuildingSave, _scale: number) {
    // Ältere Speicherstände kennen keine Trefferpunkte - dann unbeschädigt.
    this.hp = Math.min(save.hp ?? this.maxHp, this.maxHp);
    // Ältere Speicherstände kennen keinen Vorrat je Lager - World.applySave verteilt ihren.
    if (save.g) this.goods = structuredClone(save.g);
  }
}
