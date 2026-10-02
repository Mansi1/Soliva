// index.ts
// Gebäude auf der Karte als Klassen - die EINZIGE Liste der Gebäudearten:
// BUILDING_CLASSES. Daraus folgen die Art-Kennung (BuildingType), die
// Definitionen nach Art (BUILDINGS) und die Reihenfolge im Baumenü.
//
//   BuildingBase (abstrakt)       Lage, Trefferpunkte, Variante, speichern
//    ├─ UnitProducer (abstrakt)   bildet Einheiten aus  ── TownCenter
//    ├─ StorageBuilding (abstr.)  nimmt Rohstoffe an   ── LumberCamp, MiningCamp, Mill, FisherHut, Armory
//    ├─ House                     Wohnraum
//    ├─ Bowyer                    Werkstatt: ein Bogner macht Bögen aus Holz
//    ├─ FishTrap                  Reuse im Wasser - gebaut über die Fischerhütte
//    └─ Farm                      Feld mit Furchen

import type { BuildingDefinition } from './definition';
import { BuildingBase, type BuildingClass, type BuildingOptions, type BuildingSave } from './BuildingBase';
import { UnitProducer, randomFemale, type TrainableUnit } from './UnitProducer';
import { StorageBuilding } from './StorageBuilding';
import { TownCenter } from './TownCenter';
import { House } from './House';
import { LumberCamp } from './LumberCamp';
import { MiningCamp } from './MiningCamp';
import { Mill } from './Mill';
import { FisherHut } from './FisherHut';
import { FishTrap } from './FishTrap';
import { Bowyer } from './Bowyer';
import { Armory } from './Armory';
import { Farm, furrowCells, furrowFood, furrowPosition, maskCovers, ALL_TILES, CENTER_TILE, type Furrow } from './Farm';

export {
  BuildingBase, UnitProducer, randomFemale, StorageBuilding, TownCenter, House, LumberCamp, MiningCamp, Mill, FisherHut, FishTrap, Farm, Bowyer, Armory,
  furrowCells, furrowFood, furrowPosition, maskCovers, ALL_TILES, CENTER_TILE,
  type BuildingClass, type BuildingDefinition, type BuildingOptions, type BuildingSave, type Furrow, type TrainableUnit,
};

/** Alle Gebäudeklassen - in der Reihenfolge des Baumenüs (ohne Taste: nicht darin). */
export const BUILDING_CLASSES = [TownCenter, House, LumberCamp, MiningCamp, Mill, Farm, Bowyer, Armory, FisherHut, FishTrap] as const;

/** Kennung einer Gebäudeart, z. B. 'lumber_camp'. */
export type BuildingType = (typeof BUILDING_CLASSES)[number]['definition']['type'];

/** Ein Gebäude auf der Karte - welcher Art auch immer. */
export type Building = BuildingBase;

type BuildingConstructor = BuildingClass & (new (x: number, y: number, options?: BuildingOptions) => Building);

const CLASS_BY_TYPE = Object.fromEntries(BUILDING_CLASSES.map((c) => [c.definition.type, c])) as
  Record<BuildingType, BuildingConstructor>;

/** Definition je Art. */
export const BUILDINGS = Object.fromEntries(BUILDING_CLASSES.map((c) => [c.definition.type, c.definition])) as
  Record<BuildingType, BuildingDefinition>;

/** Reihenfolge im Baumenü. */
export const BUILDING_ORDER: BuildingType[] = BUILDING_CLASSES.filter((c) => c.definition.key).map((c) => c.definition.type);

/** Ist das eine bekannte Art? Für Speicherstände. */
export function isBuildingType(type: string): type is BuildingType {
  return type in CLASS_BY_TYPE;
}

/** Neues Gebäude in der Klasse seiner Art. */
export function createBuilding(type: BuildingType, x: number, y: number, options?: BuildingOptions): Building {
  return new CLASS_BY_TYPE[type](x, y, options);
}

/** Frühere Kennungen der Arten - Speicherstände vor der Umbenennung. */
const RENAMED_TYPES: Record<string, BuildingType> = {
  lumberjack: 'lumber_camp',
  mine: 'mining_camp',
  forager: 'mill',
};

/**
 * Aus dem Speicherstand, in der Klasse seiner Art - oder undefined, wenn die
 * Art unbekannt ist. `scale` vergrößert die Koordinaten älterer Stände (bis
 * Version 2 war ein Tile doppelt so lang).
 */
export function buildingFromSave(save: BuildingSave, scale: number): Building | undefined {
  const type = RENAMED_TYPES[save.t] ?? save.t;
  if (!isBuildingType(type)) return undefined;
  const building = createBuilding(type, save.x * scale, save.y * scale, { variant: save.v });
  building.restore(save, scale);
  return building;
}
