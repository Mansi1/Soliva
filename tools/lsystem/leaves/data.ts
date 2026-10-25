// Die erzeugten Blattdaten (leaves.json, von fetch.ts) - überall nutzbar, auch im Browser.
import json from './leaves.json' with { type: 'json' };
import type { LeafName, Tone } from './sources.ts';

export type { LeafName, Tone } from './sources.ts';

/** Umriss und Ränder eines Bildes, in Höhen des Bildes; Stiel bei (0, 0), oben bei y = 1. */
export interface LeafShape {
  /** Gegen den Uhrzeigersinn. */
  readonly outline: readonly (readonly [number, number])[];
  /** Linker und rechter Rand der Textur, vom Stiel aus. */
  readonly x0: number;
  readonly x1: number;
}

export interface LeafData extends LeafShape {
  readonly tone: Tone;
  /** Durchschnittsfarbe des Fotos, 0..1. */
  readonly average: readonly [number, number, number];
  /** Blattebene: ein Zweig mit mehreren dieser Blätter (img/<name>-card.png); fehlt bei Nadelzweigen. */
  readonly card?: LeafShape;
}

export const LEAVES = json as unknown as Readonly<Record<LeafName, LeafData>>;
