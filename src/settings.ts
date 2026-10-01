// settings.ts
// Die Einstellungen: welche es gibt, ihre Vorgaben, Laden und Speichern. Die
// Werte merkt sich der Browser; ohne Speicher gelten die Vorgaben. Das Menü
// dazu ist components/SettingsMenu.tsx.

export interface Settings {
  /** Lautstärke 0..1 - an/aus steuert weiterhin Sound.enabled (Taste M). */
  volume: number;
  /** Lautstärke der Hintergrundmusik 0..1 - der Ton-Schalter (M) gilt auch für sie. */
  music: number;
  /** Spielgeschwindigkeit: 1 = normal. */
  speed: number;
  /** Kamera-Tempo mit WASD/Pfeiltasten: 1 = normal. */
  scroll: number;
  /** Tastenhilfe oben rechts. */
  showHelp: boolean;
  /** Legende und Tile-, Kamera- und FPS-Anzeige oben links. */
  showDebug: boolean;
  /** Himmelsrichtung, die oben im Bild liegt (Kompass) - bleibt beim Neuladen. */
  facing: string;
  /** Blickwinkel über dem Horizont in Grad (Alt + rechte Maustaste) - bleibt beim Neuladen. */
  tilt: number;
  /** Angehalten (F3) - bleibt beim Neuladen. */
  paused: boolean;
  /** Spielerfarbe - Schlüssel in PLAYER_COLORS. */
  playerColor: string;
  /**
   * Bäume als Bild statt als Modell unter so vielen CSS-Pixeln je Tile (0:
   * nie; Vorgabe: auf allen Zoomstufen). Bäume, an denen gearbeitet wird,
   * bleiben Modelle. Im Wald gemessen (M4): 17,5 statt 2,4 ms je Bild als
   * Modell, auf Retina 34-67 ms (EntityRenderer.ensureBillboards).
   */
  billboards: number;
  /**
   * Je Tierart ("deer", "hare" ...): ausblenden unter so vielen CSS-Pixeln je
   * Tile (0: nie) - weit draußen sind Tiere kaum zu sehen und kosten
   * trotzdem. Fehlt eine Art, gilt ANIMALS_BELOW_DEFAULT.
   */
  animalsBelow: Record<string, number>;
  /** Steht die Kamera eine Sekunde still, nur 30 Bilder je Sekunde (main.ts, IDLE_FPS). */
  idleFps: boolean;
  /** Die Minimap nur 10-mal je Sekunde zeichnen (main.ts, MINIMAP_FPS). */
  minimapFps: boolean;
  /** Post-Effekte (gl/postRenderer.ts): Kantenglättung, Farbgebung samt Vignette, Glühen. */
  fxaa: boolean;
  colorGrading: boolean;
  bloom: boolean;
}

/**
 * Vorgabe für animalsBelow: bei Zoom 1 und 2 (8 und 16 px je Tile) keine
 * Tiere - und keine Dorfbewohner ("villager", ohne eigene Einstellung).
 */
export const ANIMALS_BELOW_DEFAULT = 32;

/** billboards: auf allen Zoomstufen (Zoom 5 sind 128 px je Tile, das Menü bietet px * 2). */
const BILLBOARDS_ALL = 256;
/** Die frühere Vorgabe (nur Zoom 1) - gespeichert bei fast allen, die nie etwas geändert haben. */
const BILLBOARDS_OLD_DEFAULT = 16;

const DEFAULTS: Settings = {
  volume: 1, music: 0.5, speed: 2.5, scroll: 1, showHelp: false, showDebug: false, facing: '', tilt: 30, paused: false,
  playerColor: 'green', billboards: BILLBOARDS_ALL, animalsBelow: {}, idleFps: true, minimapFps: true,
  fxaa: true, colorGrading: true, bloom: true,
};
const STORAGE_KEY = 'pgm.settings';

/**
 * Was "Zurücksetzen" im Menü zurücksetzt: alles, was man dort einstellt -
 * Blickrichtung, Blickwinkel und Pause bleiben, sie gehören zum laufenden Spiel.
 */
export function resetSettings(s: Settings) {
  Object.assign(s, { ...DEFAULTS, animalsBelow: {}, facing: s.facing, tilt: s.tilt, paused: s.paused });
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
      if (typeof s.animalsBelow !== 'object' || s.animalsBelow === null) s.animalsBelow = {};
      // ponytail: die alte Vorgabe wird zur neuen - wer Zoom 1 bewusst gewählt
      // hatte, muss es neu wählen; eine Versionsnummer, wenn das öfter vorkommt.
      if (s.billboards === BILLBOARDS_OLD_DEFAULT) s.billboards = BILLBOARDS_ALL;
      return s;
    }
  } catch {
    // Kein Speicher oder kaputter Eintrag - dann die Vorgaben.
  }
  return { ...DEFAULTS, animalsBelow: {} };
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Ohne Speicher gelten die Einstellungen nur bis zum Neuladen.
  }
}
