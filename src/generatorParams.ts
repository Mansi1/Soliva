// generatorParams.ts
// Die Regler der Generator-Seite (/generator): je Wert aus TERRAIN_PARAMS
// Beschriftung, Gruppe und Bereich, dazu die Adresse. In ihr stehen der Seed
// und nur die Werte, die von TERRAIN_PARAMS abweichen - so lässt sich ein
// Stand als Link weitergeben und nach dem Neuladen weiterschrauben
// (VERIFIED: tests/generator.test.mjs liest die Adresse zurück).

import { TERRAIN_PARAMS, type TerrainParams } from './noise';

export type ParamKey = keyof TerrainParams;

export interface Slider {
  key: ParamKey;
  label: string;
  group: string;
  min: number;
  max: number;
  step: number;
}

const s = (key: ParamKey, group: string, label: string, min: number, max: number, step: number): Slider =>
  ({ key, group, label, min, max, step });

/** Alle Werte aus TERRAIN_PARAMS, nach Gruppen - tests/generator.test.mjs prüft, dass keiner fehlt. */
export const SLIDERS: readonly Slider[] = [
  s('mapScale', 'Form', 'Maßstab (klein = große Kontinente)', 0.0002, 0.005, 0.00005),
  s('warpStrength', 'Form', 'Küsten verzerren', 0, 0.4, 0.005),
  s('detailFrequency', 'Form', 'Feinstruktur: Frequenz', 1, 40, 0.5),
  s('detailStrength', 'Form', 'Feinstruktur: Stärke', 0, 0.6, 0.01),
  s('ridgeStart', 'Form', 'Grate ab Höhe', -1, 1, 0.01),
  s('ridgeStrength', 'Form', 'Grate: Stärke', 0, 1, 0.01),
  s('deepWaterLevel', 'Höhen', 'Tiefsee bis', -1, 1, 0.01),
  s('seaLevel', 'Höhen', 'Meeresspiegel', -1, 1, 0.01),
  s('shoreLevel', 'Höhen', 'Strand bis', -1, 1, 0.01),
  s('hillLevel', 'Höhen', 'Gebirge ab', -1, 1, 0.01),
  s('peakLevel', 'Höhen', 'Gipfel ab', -1, 1, 0.01),
  s('lapseRate', 'Klima', 'Kälte je Höhe', 0, 3, 0.05),
  s('snowTemperature', 'Klima', 'Schnee auf Gipfeln unter', -2, 1, 0.01),
  s('tundraTemperature', 'Klima', 'Schneewüste unter', -2, 1, 0.01),
  s('fringeFrequency', 'Klima', 'Biom-Saum: Frequenz', 5, 200, 1),
  s('fringeStrength', 'Klima', 'Biom-Saum: Stärke', 0, 0.4, 0.01),
  s('shadeGain', 'Licht', 'Hangschatten', 0, 200, 1),
  s('lowlandShade', 'Licht', 'Hangschatten im Flachland', 0, 1, 0.01),
  s('microFrequency', 'Mikrodetail', 'Frequenz', 32, 1024, 8),
  s('microStrength', 'Mikrodetail', 'Stärke', 0, 0.05, 0.001),
  s('microOctaves', 'Mikrodetail', 'Oktaven', 0, 10, 1),
  s('microMinSamples', 'Mikrodetail', 'ab Abtastzellen', 1, 8, 0.5),
  s('microPersistence', 'Mikrodetail', 'Abnahme je Oktave', 0, 1, 0.01),
  s('reliefHeight', 'Relief (nur schräg)', 'Höchster Gipfel (Tiles)', 0, 100, 1),
  s('reliefExponent', 'Relief (nur schräg)', 'Steilheit der Gipfel', 0.5, 4, 0.05),
  s('lowlandRelief', 'Relief (nur schräg)', 'Anstieg im Flachland (Tiles)', 0, 10, 0.1),
  s('mountainFoot', 'Relief (nur schräg)', 'Gebirgsfuß ab Höhe', -1, 1, 0.01),
];

/**
 * Seed (sonst `fallbackSeed`) und Werte aus der Adresse. Unbekannte Namen und Unlesbares fallen weg,
 * Werte außerhalb des Reglers werden auf seinen Bereich begrenzt.
 */
export function fromQuery(query: URLSearchParams, fallbackSeed: string): { seed: string; params: TerrainParams } {
  const params: TerrainParams = { ...TERRAIN_PARAMS };
  for (const { key, min, max } of SLIDERS) {
    const raw = query.get(key);
    const value = raw === null || raw.trim() === '' ? NaN : Number(raw);
    if (Number.isFinite(value)) params[key] = Math.min(max, Math.max(min, value));
  }
  return { seed: query.get('seed') || fallbackSeed, params };
}

/** Die Adresse zu Seed und Werten - nur, was von TERRAIN_PARAMS abweicht. */
export function toQuery(seed: string, params: TerrainParams): URLSearchParams {
  const query = new URLSearchParams({ seed });
  for (const { key } of SLIDERS) {
    if (params[key] !== TERRAIN_PARAMS[key]) query.set(key, String(params[key]));
  }
  return query;
}
