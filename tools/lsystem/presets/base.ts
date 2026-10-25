// Gemeinsames für die Beispiel-Rezepte: Standardwerte, Gruppen und Varianten.
import type { TreeSpec } from '../lsystem.ts';
import type { Material } from '../materials.ts';

/** Reihenfolge der Gruppen in der Auswahl. */
export const GROUPS = ['Laubbäume', 'Nadelbäume', 'Obstbäume', 'Exoten', 'Getreide', 'Klassiker (ABOP)'] as const;
export type Group = (typeof GROUPS)[number];

export interface Preset extends TreeSpec {
  readonly group: Group;
}

const DEFAULTS = {
  seed: 1, lengthFactor: 0.9, jitter: 0, tropism: 0, leaves: '', leafShape: 'clump',
  leafMaterials: ['Leaf', 'Ivy', 'IvyDark'], stemMaterial: 'Bark', tip: 0.03, pipe: 2.2, sides: 8,
} as const satisfies Partial<TreeSpec>;

type Recipe = Omit<Preset, keyof typeof DEFAULTS> & Partial<Preset>;

export const preset = (recipe: Recipe): Preset => ({ ...DEFAULTS, ...recipe });

/** Abwandlung eines Rezepts, im Namen mit " – <name>" gekennzeichnet. */
export const variant = (base: Preset, name: string, change: Partial<Preset>): Preset =>
  ({ ...base, ...change, label: `${base.label} – ${name}` });

/** Herbstlaub in den angegebenen Farben. */
export const autumn = (base: Preset, leafMaterials: readonly Material[]): Preset =>
  variant(base, 'Herbst', { leafMaterials });

/** Kahl: kein Laub, nur Äste. */
export const winter = (base: Preset): Preset => variant(base, 'Winter', { leafSize: 0 });
