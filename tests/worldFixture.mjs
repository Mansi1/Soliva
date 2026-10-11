// Echte Welt für Tests (src/world/world.ts) auf einer kleinen, von Hand
// gezeichneten Karte. Die Welt-Module importieren Modelle über Vites
// `?model`/`?clips` - darum lädt Vite sie mit der Konfiguration des Spiels
// (ssrLoadModule), ohne Browser und ohne Attrappen. Kostet je Testdatei ~3 s.

import { createServer } from 'vite';

const root = new URL('../', import.meta.url).pathname;

/**
 * Lädt Module aus src/ (z. B. '/src/world/world.ts') und gibt sie zurück;
 * `close()` beendet den Vite-Server danach.
 */
export async function loadModules(...paths) {
  const server = await createServer({
    root, configFile: `${root}vite.config.ts`, appType: 'custom', logLevel: 'error',
    server: { middlewareMode: true, hmr: false, ws: false },
  });
  const modules = [];
  for (const p of paths) modules.push(await server.ssrLoadModule(p));
  return { modules, close: () => server.close() };
}

/**
 * Flaches Gelände ohne Vorkommen außer Bäumen: `kind(x, y)` gibt 'water',
 * 'tree' (Wald mit 100 Holz) oder 'grass'.
 */
export function terrain(kind) {
  const tileType = (k) => (k === 'water' ? 'water' : k === 'tree' ? 'forest' : 'grass');
  return {
    getTile: (x, y) => {
      const k = kind(x, y);
      return { x, y, height: 0.5, moisture: 0.5, temperature: 0.5, tileType: tileType(k), resource: k === 'tree' ? 'wood' : 'none', resourceAmount: k === 'tree' ? 100 : 0 };
    },
    resourceAt: (x, y) => {
      const k = kind(x, y);
      return { height: 0.5, type: k === 'tree' ? 'wood' : 'none', amount: k === 'tree' ? 100 : 0, tileType: tileType(k) };
    },
  };
}

/** Eine Welt auf diesem Gelände mit reichlich Vorrat zum Bauen. */
export function makeWorld(World, kind) {
  const world = new World(terrain(kind), 'test');
  // Ohne Lager liegt er ohne Lager und kommt ins erste Dorfzentrum (World.absorbReserve).
  for (const r of ['wood', 'food', 'stone', 'gold']) world.addStock(r, 10000 - world.stock[r]);
  return world;
}

/** Baut und meldet, wenn es nicht geht - sonst rätselt der Test später. */
export function build(world, x, y, type) {
  const reason = world.place(x, y, type);
  if (reason) throw new Error(`${type} at ${x},${y} not placed: ${reason}`);
  return world.at(x, y);
}

/** Lässt die Welt `seconds` Sekunden in Ticks von 0,1 s laufen; `each` nach jedem Tick. */
export function run(world, seconds, each = () => {}) {
  for (let t = 0; t < seconds; t += 0.1) {
    world.tick(0.1);
    each();
  }
}
