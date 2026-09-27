// Lighting.ts
// Sonne und Wetter: Die Sonne zieht in DAY Sekunden Spielzeit einmal im
// Kreis um die Welt, in gleicher Höhe wie die feste Sonne von früher. Wolken
// kommen und gehen langsam - aus einem Rauschen über die Zeit, das je Welt
// fest ist: Unter Wolken wird es etwas dunkler, kühler und flacher (kein
// gerichtetes Licht). Nichts davon rechnet das Gelände neu, der Shader nimmt
// nur die Werte (gl/light.ts). Wird es ganz dunkel, regnet es - je dunkler
// Phase ein Schauer, höchstens RAIN_MAX Sekunden (gl/postRenderer.ts zeichnet
// ihn vor die Kamera).

import { CLASSIC_LIGHT, type Light } from '../gl/light.ts';

/** Sekunden Spielzeit für einen Umlauf der Sonne. */
const DAY = 240;
/** Sekunden je Wetterabschnitt: große Wetterlagen, darüber kleine Schwankungen. */
const WEATHER = 50;
const GUST = 17;
/** Bedeckt: so hell, so viel gerichtetes Licht, diese Farbe. */
const OVERCAST = { level: 0.82, contrast: 0.25, color: [0.92, 0.95, 1] as const };
/**
 * Wetterwert 0..1 (weather()): darüber scheint die Sonne, darunter wird es
 * bedeckt - über SUN_FROM..SUN_FULL weich. So scheint etwa 80 % der Zeit
 * die Sonne (gemessen über viele Welten, Mitte 0.29 knapp unter dem 20 %-Quantil).
 */
const SUN_FROM = 0.19;
const SUN_FULL = 0.39;
/**
 * Unter diesem Wetterwert regnet es - der dunkelste Teil (etwa 5 % der Zeit,
 * höchstens RAIN_MAX je Schauer). Mit Abstand zu SUN_FROM: ein ausklingender
 * Schauer fällt noch in bedecktes Licht.
 */
const RAIN_BELOW = 0.16;
/**
 * Höchstens so lange (s) je Schauer, samt Ein- und Ausklingen. Die Stärke
 * läuft immer in RAIN_FADE Sekunden von 0 auf 1 oder zurück - auch wenn es
 * vorzeitig aufklart, hört der Regen nie schlagartig auf.
 */
const RAIN_MAX = 30;
const RAIN_FADE = 8;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class Lighting {
  private time = 0;
  private readonly seed: number;
  /** Seit wann es in dieser dunklen Phase regnet - null: noch nicht, oder sie ist vorbei. */
  private rainStart: number | null = null;
  /** In dieser dunklen Phase hat es schon geregnet: kein zweiter Schauer. */
  private rained = false;
  /** Wie stark es regnet, 0..1 - folgt dem Ziel langsam (RAIN_FADE). */
  private rainAmount = 0;

  constructor(seed: string) {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
    this.seed = h >>> 0;
  }

  /** Spielzeit weiter - 0, solange das Spiel steht. */
  update(dt: number) {
    this.time += dt;
    const dark = this.weather() < RAIN_BELOW;
    if (!dark) {
      this.rained = false;
      this.rainStart = null;
    } else if (!this.rained) {
      this.rained = true;
      this.rainStart = this.time;
    }
    // Regnen, solange die Phase dunkel ist - und nur so lange, dass das
    // Ausklingen noch in RAIN_MAX passt.
    const pouring = this.rainStart !== null && this.time - this.rainStart + dt < RAIN_MAX - RAIN_FADE;
    const step = dt / RAIN_FADE;
    this.rainAmount = pouring ? Math.min(1, this.rainAmount + step) : Math.max(0, this.rainAmount - step);
  }

  /** Wie stark es gerade regnet, 0..1. */
  get rain(): number {
    // Weich ein- und ausklingend statt linear.
    const a = this.rainAmount;
    return a * a * (3 - 2 * a);
  }

  /** Wetter 0..1: große Lagen und kleine Schwankungen - unter SUN_FULL zieht es zu. */
  private weather(): number {
    return this.noise(this.time / WEATHER) * 0.8 + this.noise(this.time / GUST + 100) * 0.2;
  }

  /** Das Licht in diesem Augenblick. */
  frame(): Light {
    const [cx, cy, cz] = CLASSIC_LIGHT.dir;
    const angle = Math.atan2(cy, cx) + (this.time / DAY) * Math.PI * 2;
    const radius = Math.hypot(cx, cy);
    // 0 bedeckt, 1 volle Sonne - dazwischen ein weicher Übergang.
    const shine = smoothstep(SUN_FROM, SUN_FULL, this.weather());
    return {
      dir: [Math.cos(angle) * radius, Math.sin(angle) * radius, cz],
      color: [lerp(OVERCAST.color[0], 1, shine), lerp(OVERCAST.color[1], 1, shine), lerp(OVERCAST.color[2], 1, shine)],
      level: lerp(OVERCAST.level, 1, shine),
      contrast: lerp(OVERCAST.contrast, 1, shine),
    };
  }

  /** Wertrauschen 0..1 über x: je ganzer Zahl ein fester Zufall, dazwischen weich. */
  private noise(x: number): number {
    const i = Math.floor(x);
    const f = x - i;
    const t = f * f * (3 - 2 * f);
    return lerp(this.random(i), this.random(i + 1), t);
  }

  private random(i: number): number {
    let h = Math.imul(this.seed ^ Math.imul(i, 0x9e3779b1), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
}
