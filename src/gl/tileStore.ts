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
// dann rechnet die GPU wie bisher.
// ponytail: kein Aufräumen nach Alter oder Größe; eine LRU-Grenze einbauen,
// wenn der Speicher im Browser merklich wächst (Kacheln ~384 KB).

export const TILE = 256;

export interface StoredTile {
  /** TILE * TILE * 4 Byte, Zeile für Zeile von unten (wie die Textur). */
  color: Uint8Array;
  /** TILE * TILE * 2 Byte. */
  normal: Uint8Array;
}

const DB = 'soliva-terrain';
const TILES = 'tiles';
const META = 'meta';

const done = <T>(req: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

async function open(version: string): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(TILES);
      req.result.createObjectStore(META);
    };
    const db = await done(req);
    const stored = await done(db.transaction(META, 'readonly').objectStore(META).get('version'));
    if (stored !== version) {
      const tx = db.transaction([TILES, META], 'readwrite');
      tx.objectStore(TILES).clear();
      tx.objectStore(META).put(version, 'version');
      await new Promise((resolve) => { tx.oncomplete = resolve; tx.onerror = resolve; });
    }
    return db;
  } catch (error) {
    console.warn('Gelände-Kacheln: kein IndexedDB - es wird jedes Mal gerechnet', error);
    return null;
  }
}

export class TileStore {
  private readonly db: Promise<IDBDatabase | null>;

  constructor(version: string) {
    this.db = open(version);
  }

  /** Die Kacheln zu `keys`, fehlende als undefined - in einer Transaktion. */
  async get(keys: string[]): Promise<(StoredTile | undefined)[]> {
    const db = await this.db;
    if (!db) return keys.map(() => undefined);
    try {
      const store = db.transaction(TILES, 'readonly').objectStore(TILES);
      return await Promise.all(keys.map((k) => done(store.get(k) as IDBRequest<StoredTile | undefined>)));
    } catch {
      return keys.map(() => undefined);
    }
  }

  put(key: string, tile: StoredTile) {
    void this.db.then((db) => {
      if (!db) return;
      try {
        db.transaction(TILES, 'readwrite').objectStore(TILES).put(tile, key);
      } catch {
        // Voll oder geschlossen - dann eben nicht gespeichert.
      }
    });
  }
}

/** Kurze Kennung eines Texts (FNV-1a) - für `version`. */
export function hashText(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
