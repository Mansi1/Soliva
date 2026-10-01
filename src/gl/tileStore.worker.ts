// tileStore.worker.ts
// IndexedDB für die Gelände-Kacheln (tileStore.ts) in einem eigenen Thread:
// Lesen und Schreiben kopieren die Daten (Structured Clone) - im Hauptthread
// waren das beim Vorausrechnen bis 750 ms lange Aufgaben in 10 s (M4). Die
// Kacheln kommen und gehen als übertragene ArrayBuffer, ohne Kopie.
//
// Aufräumen: je Kachel steht in USED, wann sie zuletzt gelesen oder
// gespeichert wurde (eigener Bereich - der Zeitstempel im Datensatz hieße bei
// jedem Lesen 384 KB neu schreiben). Über der Grenze, oder wenn der Browser
// keinen Platz mehr gibt, gehen die am längsten ungenutzten.

interface StoredTile { color: Uint8Array<ArrayBuffer>; normal: Uint8Array<ArrayBuffer> }
type Request =
  | { type: 'open'; version: string; limit: number }
  | { type: 'get'; id: number; keys: string[] }
  | { type: 'put'; key: string; tile: StoredTile };

const TILES = 'tiles';
const META = 'meta';
const USED = 'used';
/** Nach dem Aufräumen ist so viel der Grenze belegt - Luft, damit nicht jede neue Kachel eine alte kostet. */
const KEEP = 0.8;
let db: IDBDatabase | null = null;
let limit = Infinity;
/** Zuletzt gelesen oder gespeichert (ms seit 1970) je gespeicherter Kachel; 0: vor dem Aufräumen gespeichert. */
const used = new Map<string, number>();

const done = <T>(req: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
const finished = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error);
});

/**
 * Welche Kacheln gehen, wenn mehr als `max` gespeichert sind: die am längsten
 * ungenutzten, bis nur noch KEEP * max übrig sind. Leer, solange es passt.
 */
export function evictions(times: ReadonlyMap<string, number>, max: number): string[] {
  return times.size <= max ? [] : oldest(times, times.size - Math.floor(max * KEEP));
}

/** Die `count` am längsten ungenutzten Kacheln. */
function oldest(times: ReadonlyMap<string, number>, count: number): string[] {
  return [...times].sort((a, b) => a[1] - b[1]).slice(0, count).map(([key]) => key);
}

async function open(version: string): Promise<string[]> {
  // Version 2: USED dazu. Kacheln aus Version 1 bleiben und gelten als nie benutzt.
  const req = indexedDB.open('soliva-terrain', 2);
  req.onupgradeneeded = () => {
    for (const name of [TILES, META, USED]) {
      if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
    }
  };
  db = await done(req);
  const stored = await done(db.transaction(META, 'readonly').objectStore(META).get('version'));
  if (stored !== version) {
    // Der Befüll-Shader rechnet anders - alte Kacheln passen nicht mehr.
    const tx = db.transaction([TILES, META, USED], 'readwrite');
    tx.objectStore(TILES).clear();
    tx.objectStore(USED).clear();
    tx.objectStore(META).put(version, 'version');
    await finished(tx).catch(() => {});
  }
  const tx = db.transaction([TILES, USED], 'readonly');
  const [keys, usedKeys, times] = await Promise.all([
    done(tx.objectStore(TILES).getAllKeys()),
    done(tx.objectStore(USED).getAllKeys()),
    done(tx.objectStore(USED).getAll() as IDBRequest<number[]>),
  ]);
  const at = new Map(usedKeys.map((k, i) => [String(k), times[i]]));
  for (const k of keys.map(String)) used.set(k, at.get(k) ?? 0);
  await evict(evictions(used, limit));
  return [...used.keys()];
}

/** Löscht `keys` und meldet sie dem Hauptthread (TileStore.known). */
async function evict(keys: string[]) {
  if (keys.length === 0 || !db) return;
  for (const k of keys) used.delete(k);
  try {
    const tx = db.transaction([TILES, USED], 'readwrite');
    for (const k of keys) {
      tx.objectStore(TILES).delete(k);
      tx.objectStore(USED).delete(k);
    }
    await finished(tx);
  } catch {
    // Nicht gelöscht - beim nächsten Öffnen stehen sie wieder in der Liste.
  }
  self.postMessage({ type: 'dropped', keys });
}

/** Merkt vor, dass `keys` gerade gebraucht wurden. */
function touch(keys: string[]) {
  if (keys.length === 0 || !db) return;
  const now = Date.now();
  try {
    const store = db.transaction(USED, 'readwrite').objectStore(USED);
    for (const k of keys) {
      // Inzwischen gelöscht (evict) - nicht wieder aufnehmen.
      if (!used.has(k)) continue;
      used.set(k, now);
      store.put(now, k);
    }
  } catch {
    // Dann gilt die Kachel als älter, als sie ist - sie geht nur früher.
  }
}

async function put(key: string, tile: StoredTile) {
  if (!db) return;
  const now = Date.now();
  used.set(key, now);
  try {
    const tx = db.transaction([TILES, USED], 'readwrite');
    tx.objectStore(TILES).put(tile, key);
    tx.objectStore(USED).put(now, key);
    await finished(tx);
  } catch (error) {
    // Nicht gespeichert: der Hauptthread soll sie nicht für vorhanden halten.
    used.delete(key);
    self.postMessage({ type: 'dropped', keys: [key] });
    // Der Browser gibt keinen Platz mehr - dann ein Fünftel der ältesten weg.
    if ((error as DOMException | null)?.name === 'QuotaExceededError') {
      await evict(oldest(used, Math.ceil(used.size / 5)));
    }
    return;
  }
  await evict(evictions(used, limit));
}

self.onmessage = async (e: MessageEvent<Request>) => {
  const msg = e.data;
  if (msg.type === 'open') {
    limit = msg.limit;
    try {
      self.postMessage({ type: 'opened', keys: await open(msg.version) });
    } catch (error) {
      self.postMessage({ type: 'opened', keys: null, error: String(error) });
    }
  } else if (msg.type === 'get') {
    let tiles: (StoredTile | undefined)[] = msg.keys.map(() => undefined);
    try {
      if (db) {
        const store = db.transaction(TILES, 'readonly').objectStore(TILES);
        tiles = await Promise.all(msg.keys.map((k) => done(store.get(k) as IDBRequest<StoredTile | undefined>)));
      }
    } catch {
      // Nicht lesbar - dann rechnet die GPU.
    }
    const buffers = tiles.flatMap((t) => (t ? [t.color.buffer, t.normal.buffer] : []));
    (self as unknown as Worker).postMessage({ type: 'got', id: msg.id, tiles }, buffers);
    touch(msg.keys.filter((_, i) => tiles[i]));
  } else if (msg.type === 'put') {
    await put(msg.key, msg.tile);
  }
};
