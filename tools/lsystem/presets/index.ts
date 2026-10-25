// Alle Beispiel-Rezepte, nach Gruppen.
import data from '../baumarten.json' with { type: 'json' };
import { interpret, parseRules, rewrite, rng, tokenize } from '../lsystem.ts';
import type { Preset } from './base.ts';
import { EXOTEN } from './exoten.ts';
import { GETREIDE } from './getreide.ts';
import { KLASSIKER } from './klassiker.ts';
import { LAUBBAEUME } from './laubbaeume.ts';
import { NADELBAEUME } from './nadelbaeume.ts';
import { OBST } from './obst.ts';

export { GROUPS, type Group, type Preset } from './base.ts';

const RECIPES = {
  ...LAUBBAEUME, ...NADELBAEUME, ...OBST, ...EXOTEN, ...GETREIDE, ...KLASSIKER,
} satisfies Record<string, Preset>;

export type PresetName = keyof typeof RECIPES;
const recipes: Readonly<Record<string, Preset>> = RECIPES;

/**
 * Je Beispiel aus baumarten.json in Metern: typische Höhe (Mitte der Spanne)
 * und Stamm-Halbmesser - typisch (Mitte) oder, wo nur die Höchstdicke bekannt
 * ist, höchstens diese. Ohne Angabe bleibt die Dicke des Rezepts; eine
 * Schätzung aus der Höhe passte nicht zu jeder Art (Affenbrotbaum: 55 cm).
 */
const SPECIES = new Map(data.arten.flatMap((art) => {
  const [low, high] = art.height_m.typical;
  const { typical, max } = art.trunk_diameter_cm;
  // exact: typische Dicke bekannt; sonst ist radius nur die Obergrenze.
  const radius = typical ? (typical[0] + typical[1]) / 400 : max ? max / 200 : Infinity;
  return art.presets.map((name) => [name, { height: (low + high) / 2, radius, exact: Boolean(typical) }] as const);
}));

/** Höhe und Halbmesser am Boden (dickster Stamm) eines Rezepts, wie es geschrieben ist. */
function measure(spec: Preset): { height: number; radius: number } {
  const rnd = rng(spec.seed);
  const { tokens } = rewrite(tokenize(spec.axiom), parseRules(spec.rules), spec.iterations, rnd);
  const { segments, radii } = interpret(tokens, { ...spec, scale: 1 }, rnd);
  let height = 0, radius = 0;
  segments.forEach((s, i) => {
    height = Math.max(height, s.b[1]);
    if (s.parent < 0 && Math.abs(s.a[1]) < 1e-6) radius = Math.max(radius, radii[i][0]);
  });
  return { height, radius };
}

/**
 * Jedes Beispiel so hoch und so dick wie seine Art. Höhe: `scale` streckt das
 * Gerüst. Dicke: Der Stamm trägt n Astspitzen (pipeRadii: r = tip · n^(1/pipe));
 * `pipe` wird so gewählt, dass r der Halbmesser der Art ist - die Spitzen
 * bleiben echte Zweige, statt mit dem Baum mitzuwachsen. Varianten
 * (eiche_jung, birke_herbst) nehmen die Werte ihrer Grundart (Name bis "_"), so
 * bleibt die junge Eiche kleiner und dünner. Ohne Eintrag (Getreide,
 * Klassiker) bleibt es, wie es ist. Zur Laufzeit statt fest eingetragen, damit
 * die Werte beim Ändern eines Rezepts stimmen.
 * VERIFIED: alle Beispiele zusammen ~0,2 s (M-Chip, 2026-10-25).
 */
function sized(): Record<PresetName, Preset> {
  const done = new Map<string, { scale: number; pipe: number } | null>();
  const size = (name: string): { scale: number; pipe: number } | null => {
    if (done.has(name)) return done.get(name)!;
    const art = SPECIES.get(name);
    const base = name.split('_')[0];
    let result = null;
    if (art) {
      const spec = recipes[name];
      const now = measure(spec);
      const tips = (now.radius / spec.tip) ** spec.pipe;
      const radius = art.exact ? art.radius : Math.min(now.radius, art.radius);
      // Ein Halm ohne Gabel (eine Spitze) oder eine Art dünner als die Spitze: pipe bleibt.
      const pipe = tips > 1 && radius > spec.tip ? Math.log(tips) / Math.log(radius / spec.tip) : spec.pipe;
      result = { scale: art.height / now.height, pipe };
    } else if (base !== name && recipes[base]) result = size(base);
    done.set(name, result);
    return result;
  };
  return Object.fromEntries(Object.entries(RECIPES).map(([name, spec]) => [name, { ...spec, ...size(name) }])) as Record<PresetName, Preset>;
}

export const PRESETS: Readonly<Record<PresetName, Preset>> = sized();

export const isPresetName = (name: string): name is PresetName => Object.hasOwn(PRESETS, name);
