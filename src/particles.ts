// particles.ts
// Partikel als Quellen, nicht als einzelne Teilchen: eine Quelle (Feld,
// Goldader, Holzfäller, Einsturz ...) ist ein Datensatz, aus dem der Shader
// bis zu MAX_PER_SOURCE Partikel rechnet - Lage aus Quelle, Partikelnummer
// und Zeit, ohne Zustand (gl/particleRenderer.ts). Welt und Renderer teilen
// sich nur diese Typen - darum liegt die Datei in src/ und importiert nichts.

/** Was eine Quelle ausstößt - die Zahlen stehen so auch im Shader. */
export const PARTICLE = {
  /** Bienen, Wespen, Hummeln über Feldern und Wiesen - die Sorte kommt aus dem Zufall je Tier. */
  bee: 0,
  /** Goldglitzer direkt auf einer Goldader: lange nichts, dann ein kurzer Blitz. */
  gold: 1,
  /** Schutt eines einstürzenden Gebäudes - einmal im Bogen hinaus, dann liegt er. */
  debris: 2,
  /** Glitzern auf einem Steinvorkommen - wie Gold, nur weiß. */
  sparkle: 3,
  /** Späne, die beim Holzhacken wegfliegen. */
  chips: 4,
  /** Dreck, der beim Pflügen hochspritzt. */
  dirt: 5,
  /** Blätter, die beim Beerenpflücken vom Strauch fallen. */
  leaf: 6,
  /** Wasser spritzt ringförmig um die Stelle, wo die Angelschnur eintaucht. */
  splash: 7,
  /** Weiße Gischt um das Boot, solange der Fischer rudert. */
  foam: 8,
  /** Schmetterling über der Wiese: blau, rot, gelb oder weiß, mit flatternden Flügeln. */
  butterfly: 9,
  /** Kleine Krabbe am Strand in einer von fünf Farben: huscht seitwärts ein Stück, hält inne, huscht zurück. */
  crab: 10,
  /** Kleine Fische: schwimmen dicht unter der Oberfläche umher, ab und zu springt einer. */
  fish: 11,
} as const;

/**
 * Ab so vielen CSS-Pixeln je Tile lohnen sich die kleinen Effekte der
 * Arbeit und die Bienen - weiter draußen wären sie Pixel-Krümel.
 */
export const DETAIL_TILE_SIZE = 64;

/** Höchstens so viele Partikel je Quelle (Eckpunkte je Instanz). */
export const MAX_PER_SOURCE = 16;
/** Höchstens so viele Quellen je Bild - darüber fallen die zuletzt angemeldeten weg. */
export const MAX_SOURCES = 1024;
/** Floats je Quelle: Ursprung (x, y, z, Radius), Richtung (dx, dy, dz, Stärke), (Art, Zufall, Start, Anzahl). */
export const SOURCE_FLOATS = 12;

/**
 * Die Quellen eines Bildes in einem festen Float32Array - ohne Objekte je
 * Quelle oder Partikel. Wer zuerst anmeldet, hat Vorrang: erst Wichtiges
 * (Einsturz), zuletzt Schmuck (Glitzern).
 */
export class ParticleSources {
  readonly data = new Float32Array(MAX_SOURCES * SOURCE_FLOATS);
  count = 0;
  /** CSS-Pixel je Tile in diesem Bild - wer Quellen anmeldet, lässt Kleines weit draußen weg. */
  tileSize = 0;
  /** Partikel in diesem Bild, für die Render-Stats. */
  particles = 0;

  clear() {
    this.count = 0;
    this.particles = 0;
  }

  /**
   * Eine Quelle. Lage in Welt-Tiles (x, y; z Bodenhöhe ohne Relief-Stärke),
   * `start` in Sekunden der Animations-Uhr (0 für dauernde Quellen).
   * false, wenn kein Platz mehr ist.
   */
  push(kind: number, x: number, y: number, z: number, radius: number,
       dx: number, dy: number, dz: number, intensity: number,
       seed: number, start: number, count: number): boolean {
    if (this.count >= MAX_SOURCES) return false;
    const n = Math.min(MAX_PER_SOURCE, Math.max(0, Math.round(count)));
    const o = this.count++ * SOURCE_FLOATS;
    const d = this.data;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = radius;
    d[o + 4] = dx; d[o + 5] = dy; d[o + 6] = dz; d[o + 7] = intensity;
    d[o + 8] = kind; d[o + 9] = seed; d[o + 10] = start; d[o + 11] = n;
    this.particles += n;
    return true;
  }
}
