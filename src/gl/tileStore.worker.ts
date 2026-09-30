// tileStore.worker.ts
// IndexedDB für die Gelände-Kacheln (tileStore.ts) in einem eigenen Thread:
// Lesen und Schreiben kopieren die Daten (Structured Clone) - im Hauptthread
// waren das beim Vorausrechnen bis 750 ms lange Aufgaben in 10 s (M4). Die
// Kacheln kommen und gehen als übertragene ArrayBuffer, ohne Kopie.

interface StoredTile { color: Uint8Array<ArrayBuffer>; normal: Uint8Array<ArrayBuffer> }
type Request =
  | { type: 'open'; version: string }
  | { type: 'get'; id: number; keys: string[] }
  | { type: 'put'; key: string; tile: StoredTile };

const TILES = 'tiles';
const META = 'meta';
let db: IDBDatabase | null = null;

const done = <T>(req: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

async function open(version: string): Promise<string[]> {
  const req = indexedDB.open('soliva-terrain', 1);
  req.onupgradeneeded = () => {
    req.result.createObjectStore(TILES);
    req.result.createObjectStore(META);
  };
  db = await done(req);
  const stored = await done(db.transaction(META, 'readonly').objectStore(META).get('version'));
  if (stored !== version) {
    // Der Befüll-Shader rechnet anders - alte Kacheln passen nicht mehr.
    const tx = db.transaction([TILES, META], 'readwrite');
    tx.objectStore(TILES).clear();
    tx.objectStore(META).put(version, 'version');
    await new Promise((resolve) => { tx.oncomplete = resolve; tx.onerror = resolve; });
  }
  return (await done(db.transaction(TILES, 'readonly').objectStore(TILES).getAllKeys())).map(String);
}

self.onmessage = async (e: MessageEvent<Request>) => {
  const msg = e.data;
  if (msg.type === 'open') {
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
  } else if (msg.type === 'put') {
    try {
      db?.transaction(TILES, 'readwrite').objectStore(TILES).put(msg.tile, msg.key);
    } catch {
      // Voll oder geschlossen - dann eben nicht gespeichert.
    }
  }
};
