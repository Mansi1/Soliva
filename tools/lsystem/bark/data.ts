// Die erzeugten Rinden-Daten (textures.json, von bark/fetch.ts) - überall nutzbar.
import json from './textures.json' with { type: 'json' };
import { BARK_SOURCES, MATERIAL_BARK, type BarkName } from './sources.ts';
import type { Material } from '../materials.ts';

export { MATERIAL_BARK, type BarkName } from './sources.ts';

export interface BarkData {
  /** Durchschnittsfarbe des Fotos, 0..1 - Kd zur Textur und Farbe der Deckel. */
  readonly average: readonly [number, number, number];
  readonly author: string;
}

export const BARKS = json as unknown as Readonly<Record<BarkName, BarkData>>;

export const barkFile = (name: BarkName) => `${name}.jpg`;

/** Kantenlänge einer Kachel in Metern. */
export const barkMeters = (name: BarkName) => BARK_SOURCES[name].meters;

/** Textur für ein Stamm-Material, mit Abweichung aus dem Rezept. */
export function barkFor(material: Material, override?: BarkName): BarkName | null {
  return override ?? MATERIAL_BARK[material] ?? null;
}
