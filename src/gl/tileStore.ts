// tileStore.ts
// Fertig berechnete Kacheln des Gelände-Caches (TerrainRenderer) in IndexedDB:
// je Kachel TILE x TILE Texel Farbe (RGBA8) und Normale (RG8). Beim nächsten
// Besuch derselben Stelle - gleicher Seed, gleiche Stufe, Neigung, Drehung -
// werden sie gelesen und hochgeladen statt neu gerechnet. Gemessen (M4, kalt,
// nach Neustart des Browsers): Lesen und Hochladen ~300.000 Texel je ms, die
// GPU rechnet ~30.000.
//
// Ändert sich, was der Befüll-Shader rechnet (`version`: Shader-Code,
// Palette, Schwellen), wird alles gelöscht - alte Kacheln passten nicht mehr.
// Ohne IndexedDB (privates Fenster in manchen Browsern) gibt es keinen Speicher,
// dann rechnet die GPU wie bisher. Lesen und Schreiben laufen in einem Worker
// (tileStore.worker.ts); hier bleibt nur der Index der Schlüssel.
// ponytail: kein Aufräumen nach Alter oder Größe; eine LRU-Grenze einbauen,
// wenn der Speicher im Browser merklich wächst (Kacheln ~384 KB).

export const TILE = 256;

export interface StoredTile {
  /** TILE * TILE * 4 Byte, Zeile für Zeile von unten (wie die Textur). */
  color: Uint8Array<ArrayBuffer>;
  /** TILE * TILE * 2 Byte. */
  normal: Uint8Array<ArrayBuffer>;
}

export class TileStore {
  /** IndexedDB läuft in einem eigenen Thread (tileStore.worker.ts) - null ohne Worker. */
  private readonly worker: Worker | null = null;
  /** Alle gespeicherten (oder gerade gespeichert werdenden) Schlüssel - beim Öffnen einmal gelesen. */
  private readonly known = new Set<string>();
  /** Steht der Index (known)? Vorher weiß nur IndexedDB selbst, was fehlt. */
  loaded = false;
  private nextId = 0;
  private readonly waiting = new Map<number, (tiles: (StoredTile | undefined)[]) => void>();

  constructor(version: string) {
    if (typeof Worker === 'undefined' || typeof indexedDB === 'undefined') return;
    try {
      this.worker = new Worker(new URL('./tileStore.worker.ts', import.meta.url), { type: 'module' });
    } catch (error) {
      console.warn('Gelände-Kacheln: kein Worker - es wird jedes Mal gerechnet', error);
      return;
    }
    this.worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'opened') {
        if (!msg.keys) {
          console.warn('Gelände-Kacheln: kein IndexedDB - es wird jedes Mal gerechnet', msg.error);
          return;
        }
        for (const k of msg.keys as string[]) this.known.add(k);
        this.loaded = true;
      } else if (msg.type === 'got') {
        this.waiting.get(msg.id)?.(msg.tiles);
        this.waiting.delete(msg.id);
      }
    };
    this.worker.postMessage({ type: 'open', version });
  }

  /** Gespeichert oder vorgemerkt? Erst verlässlich, wenn `loaded`. */
  has(key: string): boolean {
    return this.known.has(key);
  }

  /** Wird gerade gerechnet und gespeichert - nicht noch einmal anfangen. */
  reserve(key: string) {
    this.known.add(key);
  }

  get size(): number {
    return this.known.size;
  }

  /** Die Kacheln zu `keys`, fehlende als undefined. */
  get(keys: string[]): Promise<(StoredTile | undefined)[]> {
    if (!this.worker || !this.loaded) return Promise.resolve(keys.map(() => undefined));
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.waiting.set(id, resolve);
      this.worker!.postMessage({ type: 'get', id, keys });
    });
  }

  /** Speichern - die Puffer der Kachel gehen an den Worker über (danach hier leer). */
  put(key: string, tile: StoredTile) {
    this.known.add(key);
    this.worker?.postMessage({ type: 'put', key, tile }, [tile.color.buffer, tile.normal.buffer]);
  }
}

/** Kurze Kennung eines Texts (FNV-1a) - für `version`. */
export function hashText(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
