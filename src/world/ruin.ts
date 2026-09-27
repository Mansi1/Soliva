// ruin.ts
// Ein abgerissenes Gebäude, das noch einstürzt: nur fürs Bild - es belegt
// keine Tiles mehr und verschwindet nach RUIN_DURATION Sekunden. Die Welt
// legt es an (World.remove), render.ts zeichnet den Einsturz.

import type { BuildingType } from './catalog';

export interface Ruin {
  type: BuildingType;
  /** Modell beim Abriss - bei Feldern hängt es an der Frucht. */
  shape: number;
  x: number;
  y: number;
  /** Weltzeit beim Abriss (Sekunden). */
  at: number;
  /** Stand der Animations-Uhr (animationTime, wie uTime) beim Abriss - dort bleiben die Mühlenflügel stehen. */
  clock: number;
}

/** Ein eben gesetztes Gebäude: so lange (Sekunden) spritzt dort Dreck - es gibt keine Bauphase. */
export const DIG_DURATION = 2.5;

/** Ablauf des Einsturzes in Sekunden. */
export const RUIN_SHAKE = 0.3;
export const RUIN_COLLAPSE_START = 0.25;
export const RUIN_COLLAPSE = 1.0;
export const RUIN_FLIGHT = 0.8;
export const RUIN_FADE_START = 2.4;
export const RUIN_DURATION = 3.0;
