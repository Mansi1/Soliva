// startPoint.ts
// Wo die Kamera beim Start steht.

import type { Terrain } from '../map';
import type { World } from '../world/world';
import { DEFAULT_SEED } from '../worlds';

/** Wo es in der Standardwelt losgeht - dort liegt ein guter Platz fürs erste Dorf. */
const DEFAULT_START = { x: 88, y: -59 };

/**
 * Wo es losgeht: beim ersten Dorfzentrum, in der Standardwelt bei
 * DEFAULT_START, sonst auf der nächsten Wiese um den Ursprung, um die herum
 * fester Boden liegt - der Ursprung selbst kann mitten im Meer liegen.
 */
export function startPoint(world: World, terrain: Terrain, seed: string): { x: number; y: number } {
  const home = world.townCenters()[0];
  if (home) return { x: home.x, y: home.y };
  if (seed === DEFAULT_SEED) return DEFAULT_START;
  const solid = (x: number, y: number) => {
    const t = terrain.getTile(x, y).tileType;
    return t !== 'water' && t !== 'deep_water' && t !== 'mountain' && t !== 'snow';
  };
  for (let r = 0; r <= 600; r += 3) {
    const steps = Math.max(1, Math.round((2 * Math.PI * r) / 3));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const x = Math.round(Math.cos(a) * r);
      const y = Math.round(Math.sin(a) * r);
      if (terrain.getTile(x, y).tileType !== 'grass') continue;
      // Genug Platz für ein Dorf: ringsum im Abstand von 5 Tiles kein Wasser, kein Fels.
      if ([[5, 0], [-5, 0], [0, 5], [0, -5], [4, 4], [-4, 4], [4, -4], [-4, -4]].every(([dx, dy]) => solid(x + dx, y + dy))) {
        return { x, y };
      }
    }
  }
  return { x: 0, y: 0 };
}
