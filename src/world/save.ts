// save.ts
// Der Spielstand im localStorage: wie er aussieht (SaveData), wo er liegt
// (je Welt ein Schlüssel) und wie ältere Stände auf den heutigen gebracht
// werden. Was gespeichert wird, liefert die Welt (World.toSave), was geladen
// wurde, übernimmt sie (World.applySave) - hier geht es nur um das Format.
//
// Versionen:
//   1  Gebäude und Vorrat, noch keine Dorfbewohner
//   2  mit Dorfbewohnern; ein Tile war doppelt so lang wie heute
//   3  heutige Tile-Größe, dazu Tiere und abgebaute Vorkommen
// Umbenennungen ohne neue Version: Vorrat und Ladung `berries` heißen `food`,
// Gebäude-Arten `lumberjack`/`mine`/`forager` heißen `lumber_camp`/
// `mining_camp`/`mill` (siehe building/index.ts).
// Vorrat je Lager ohne neue Version: Jedes Lager speichert, was darin liegt
// (BuildingSave.g), `stock` nur noch den Rest ohne Lager. Ältere Stände haben
// nur `stock` - die Welt legt ihn beim Laden ins erste Lager, das ihn annimmt
// (World.absorbReserve), unbenannt als "Holz", "Nahrung" usw.

import type { BuildingSave } from './building';
import { initialResources, RESOURCE_KINDS, type AnimalKind, type ResourceKind, type Resources } from './catalog';
import type { Task } from './world';

/** Ein Dorfbewohner im Speicherstand. */
export interface VillagerSave {
  x: number;
  y: number;
  /** Ladung und ihre Art */
  c: number;
  ct: ResourceKind | null;
  task: Task;
  /** Sorte der Ladung, z. B. "Eiche" (siehe BuildingBase.goods) - fehlt ohne Ladung und in älteren Ständen. */
  ck?: string;
  hp?: number;
  /** Name und Geschlecht - fehlen in älteren Speicherständen. */
  n?: string;
  f?: boolean;
}

/** Ein Tier im Speicherstand: Art, Lage, Trefferpunkte, Nahrung, erlegt. */
export interface AnimalSave {
  k: AnimalKind;
  x: number;
  y: number;
  hp: number;
  f: number;
  d?: boolean;
}

export interface SaveData {
  version: 3;
  /** Wann gespeichert wurde (ms seit 1970) - fürs Laden-Menü; fehlt in älteren Ständen. */
  savedAt?: number;
  /** Vorrat, der in keinem Lager liegt - in älteren Ständen der ganze Vorrat. */
  stock: Resources;
  buildings: BuildingSave[];
  villagers: VillagerSave[];
  /** "x,y" -> bereits entnommene Menge. */
  harvested: Record<string, number>;
  animals?: AnimalSave[];
  /** Stücke der Karte, in denen schon Tiere entstanden sind. */
  spawned?: string[];
}

/**
 * Ein geladener Stand, auf das heutige Format gebracht. `scale`: um so viel
 * sind die Koordinaten darin zu vergrößern (2 bei Version 1 und 2).
 */
export interface LoadedSave {
  data: SaveData;
  scale: number;
}

const PREFIX = 'pgm.world.';

/** Schlüssel des Spielstands einer Welt im localStorage. */
export function saveKey(seed: string): string {
  return PREFIX + seed;
}

/** Die Welt zu einem Schlüssel - oder null, wenn es kein Spielstand ist. */
export function seedOfKey(key: string): string | null {
  return key.startsWith(PREFIX) ? key.slice(PREFIX.length) : null;
}

/** Speichert. false, wenn der Browser nicht speichern lässt (privater Modus, voll). */
export function writeSave(seed: string, data: SaveData): boolean {
  try {
    localStorage.setItem(saveKey(seed), JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/** Liest den Spielstand einer Welt - auf das heutige Format gebracht - oder null. */
export function readSave(seed: string): LoadedSave | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(saveKey(seed));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    return migrate(JSON.parse(raw));
  } catch {
    return null;
  }
}

type AnySave = Omit<SaveData, 'version'> & { version: number; stock: Partial<Resources> & { berries?: number } };

/** Bringt einen Stand beliebiger Version auf das heutige Format - null, wenn unbekannt. */
function migrate(old: AnySave): LoadedSave | null {
  if (old.version !== 1 && old.version !== 2 && old.version !== 3) return null;
  // Bis Version 2 war ein Tile doppelt so lang: Koordinaten verdoppeln sich,
  // damit alles auf demselben Gelände steht. Was abgebaut war, lässt sich
  // nicht übertragen - aus einem Tile sind vier geworden -, und laufende
  // Aufträge zeigen auf alte Felder; beides beginnt von vorn.
  const scale = old.version < 3 ? 2 : 1;
  const { berries, ...stock } = old.stock ?? {};
  return {
    scale,
    data: {
      version: 3,
      savedAt: old.savedAt,
      stock: { ...initialResources(), ...stock, food: stock.food ?? berries ?? initialResources().food },
      buildings: old.buildings ?? [],
      // Version 1 kannte noch keine Dorfbewohner.
      villagers: old.version === 1 ? [] : (old.villagers ?? []).map((v) => ({
        ...v,
        // Früher trug er "berries" statt Nahrung.
        ct: migrateLoad(v.ct as string | null),
        task: scale === 1 ? v.task ?? { kind: 'idle' } : { kind: 'idle' },
      })),
      harvested: scale === 1 ? old.harvested ?? {} : {},
      animals: old.version === 3 ? old.animals ?? [] : [],
      spawned: old.version === 3 ? old.spawned ?? [] : [],
    },
  };
}

function migrateLoad(kind: string | null): ResourceKind | null {
  const renamed = kind === 'berries' ? 'food' : kind;
  return renamed && (RESOURCE_KINDS as readonly string[]).includes(renamed) ? renamed as ResourceKind : null;
}
