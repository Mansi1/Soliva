// walls.ts
// Mauern (B34): die Linie, die man beim Bauen zieht, und wie die Stücke
// aussehen. Die Stücke selbst sind Gebäude (building/Wall.ts): sie belegen
// ihr Tile, werden als Baustelle gebaut, gespeichert und abgerissen wie jedes
// andere; was sie sperren, entscheidet Wall.passable an der einen Stelle
// VillagerWork.blockedAt (Tiere: World.animalBlocked).
//
// Die Linie geht von Tile zu Tile nur waagerecht oder senkrecht weiter, auch
// schräg gezogen (eine Treppe): Stücke, die sich nur an der Ecke berühren,
// ließen dazwischen Dorfbewohner und Tiere durch - sie prüfen beim Gehen nur
// das Tile, auf dem sie stehen.
//
// Aussehen: in der Mitte jedes Tiles ein Pfosten (Palisade) bzw. Pfeiler
// (Steinmauer), zu jedem Nachbarn mit Mauer ein halbes Stück Mauer. Ein Stück
// ohne Nachbarn quer dazu läuft ganz durch, so endet eine Mauer an der
// Tile-Kante. Ein Tor liegt längs der Mauer; bei der Steinmauer stehen
// Pfeiler an seinen Seiten.

import { SHAPE, type EntityInstance } from '../gl/entityRenderer';
import type { Building } from './building';
import { player, type BuildingType } from './catalog';
import type { World } from './world';

export type WallType = 'palisade' | 'stone_wall';

/** Ist das eine Mauer-Art? */
export function isWallType(type: BuildingType): type is WallType {
  return type === 'palisade' || type === 'stone_wall';
}

/**
 * Je Art: das halbe Stück, der Pfosten in der Mitte und seine Breite in
 * Metern - die Modelle werden auf ihre Breite gebracht (1 Tile = 5 m).
 * VERIFIED: tests/walls.test.mjs misst die Modelle nach (halbes Stück 2,5 m, Tor 5 m).
 */
export const WALL_LOOK: Record<WallType, { half: number; post: number; postMeters: number }> = {
  palisade: { half: SHAPE.wallPalisade, post: SHAPE.wallPalisadePost, postMeters: 0.51 },
  stone_wall: { half: SHAPE.wallStone, post: SHAPE.wallStonePost, postMeters: 1.46 },
};
/** Ein halbes Stück Mauer ist 2,5 m lang, ein Tor 5 m. */
const HALF = 0.5;
/** So nah (Tiles, zur Mitte des Tors) muss ein Dorfbewohner kommen, damit es aufgeht. */
const GATE_OPEN_DISTANCE = 1.1;

/** Die vier Seiten eines Tiles: +x, +y, -x, -y - Bit i einer Nachbar-Maske. */
const SIDES: readonly [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];

/**
 * Die Tiles der Linie von (x0, y0) bis (x1, y1), Anfang und Ende
 * eingeschlossen: in jedem Schritt waagerecht oder senkrecht, je nachdem,
 * welcher näher an der geraden Linie bleibt - |dx| + |dy| + 1 Tiles.
 * VERIFIED: tests/walls.test.mjs - gerade, schräg (Treppe ohne Eckberührung).
 */
export function wallLine(x0: number, y0: number, x1: number, y1: number): { x: number; y: number }[] {
  const [dx, dy] = [Math.abs(x1 - x0), Math.abs(y1 - y0)];
  const [sx, sy] = [Math.sign(x1 - x0), Math.sign(y1 - y0)];
  const tiles = [{ x: x0, y: y0 }];
  let [x, y, ix, iy] = [x0, y0, 0, 0];
  while (ix < dx || iy < dy) {
    // Anteil der Strecke nach dem nächsten Schritt in x bzw. y - der kleinere zuerst.
    if ((ix + 0.5) / dx < (iy + 0.5) / dy) {
      x += sx;
      ix++;
    } else {
      y += sy;
      iy++;
    }
    tiles.push({ x, y });
  }
  return tiles;
}

/** Die Nachbarn mit Mauer als Maske (Bit je SIDES) - auch für die Galerie. */
export function neighbourMask(x: number, y: number, isWall: (x: number, y: number) => boolean): number {
  let mask = 0;
  SIDES.forEach(([dx, dy], i) => {
    if (isWall(x + dx, y + dy)) mask |= 1 << i;
  });
  return mask;
}

/** Läuft die Mauer an diesem Tile entlang y (sonst x)? Nur Nachbarn in y-Richtung - oder keiner in x. */
function alongY(mask: number): boolean {
  return (mask & 0b0101) === 0 && (mask & 0b1010) !== 0;
}

/**
 * Blickrichtung eines Stücks, das entlang x bzw. y läuft: Die Modelle laufen
 * entlang Modell-y, ihre Vorderseite (Modell-x) zeigt zur Kamera (+x, +y).
 */
const headingAlong = (y: boolean) => (y ? 0 : Math.PI / 2);

export interface WallLook {
  type: WallType;
  /** Tor, und in welchem Zustand. */
  gate?: 'closed' | 'open' | 'locked';
  /** Baustelle: wie weit gebaut, 0..1 - fehlt, wenn fertig. */
  progress?: number;
  /** Lebensbalken, wenn ausgewählt. */
  health?: number;
}

/**
 * Ein Stück Mauer auf Tile (x, y) als Zeichen-Instanzen - `mask`: Nachbarn
 * mit Mauer (Bit je SIDES). Jedes halbe Stück steht auf seinem eigenen Boden,
 * so folgt die Mauer dem Hang wie der Zaun der Weide. Auch für Vorschau und Symbol.
 */
export function wallPieceInstances(x: number, y: number, mask: number, look: WallLook,
                                   ground: (x: number, y: number) => number | undefined,
                                   color: [number, number, number], alpha: number, out: EntityInstance[]) {
  const { half, post, postMeters } = WALL_LOOK[look.type];
  const postSize = postMeters / 5;
  const onY = alongY(mask);
  // Baustelle: von unten abgeschnitten (motion[3] < 0), wie Gebäude (construction.ts).
  const cut = look.progress === undefined ? 0 : -Math.max(0.001, look.progress);
  const push = (cx: number, cy: number, size: number, shape: number, heading: number, health?: number) => out.push({
    x: cx - 0.5, y: cy - 0.5, size, color, shape, alpha, motion: [heading, 0, 0, cut], ground: ground(cx, cy), health,
  });
  const [mx, my] = [x + 0.5, y + 0.5];
  if (look.gate) {
    const shape = look.gate === 'open' ? SHAPE.wallGateOpen : look.gate === 'locked' ? SHAPE.wallGateLocked : SHAPE.wallGate;
    push(mx, my, 1, shape, headingAlong(onY), look.health);
    // Steinmauer: Pfeiler an beiden Seiten des Tors, dort endet die Mauer.
    if (look.type === 'stone_wall') {
      for (const s of [-0.5, 0.5]) push(mx + (onY ? 0 : s), my + (onY ? s : 0), postSize, post, 0);
    }
    return;
  }
  // Halbe Stücke: zu jedem Nachbarn - ohne Nachbarn quer dazu ganz durch.
  const crossing = onY ? (mask & 0b0101) !== 0 : (mask & 0b1010) !== 0;
  SIDES.forEach(([dx, dy], i) => {
    const axisY = dy !== 0;
    const toward = (mask & (1 << i)) !== 0;
    if (!toward && (crossing || axisY !== onY)) return;
    push(mx + dx * HALF / 2, my + dy * HALF / 2, HALF, half, headingAlong(axisY));
  });
  push(mx, my, postSize, post, 0, look.health);
}

/** Ist dort ein Mauerstück oder Tor (auch eine Baustelle)? */
function wallAt(world: World, x: number, y: number): boolean {
  return world.at(x, y)?.isWall() ?? false;
}

/**
 * Ein Mauerstück der Welt: verbunden mit den Mauern ringsum; ein Tor offen,
 * solange ein Dorfbewohner davor oder darin steht und es nicht abgeschlossen
 * ist. Eine Baustelle wächst von unten, abgesteckt mit Pflock und Schnur an
 * den Seiten ohne Mauer daneben.
 * ponytail: das Tor fragt je Bild alle Dorfbewohner ab (Tore x Dorfbewohner);
 * die Nähe aus VillagerWork mitnehmen, wenn das in den Render-Stats auffällt.
 */
export function wallInstances(world: World, wall: Building, out: EntityInstance[], selected: boolean) {
  if (!wall.isWall()) return;
  const ground = (x: number, y: number) => world.groundAt?.(x, y);
  const color = player.color.toRGB();
  const mask = neighbourMask(wall.x, wall.y, (x, y) => wallAt(world, x, y));
  const [cx, cy] = [wall.x + 0.5, wall.y + 0.5];
  const gate = !wall.gate ? undefined : wall.locked ? 'locked'
    : world.villagers.some((v) => v.isVisible && Math.hypot(v.x - cx, v.y - cy) < GATE_OPEN_DISTANCE) ? 'open' : 'closed';
  wallPieceInstances(wall.x, wall.y, mask, {
    type: wall.type as WallType, gate, progress: wall.built ? undefined : wall.progress, health: selected ? wall.health : undefined,
  }, ground, color, 1, out);
  if (wall.built) return;
  SIDES.forEach(([dx, dy], i) => {
    if (mask & (1 << i)) return;
    const [ex, ey] = [cx + dx * 0.5, cy + dy * 0.5];
    out.push({ x: ex - 0.5, y: ey - 0.5, size: 1, color, shape: SHAPE.siteEdge, alpha: 1, motion: [Math.atan2(dy, dx), 0, 0, 0], ground: ground(ex, ey) });
  });
}

/**
 * Vorschau beim Ziehen: die Stücke der Linie, verbunden untereinander und mit
 * den Mauern daneben - `ok` je Tile, ob es dort geht (sonst rot).
 */
export function wallPreview(world: World, type: WallType, tiles: readonly { x: number; y: number; ok: boolean }[],
                            colors: { ok: [number, number, number]; blocked: [number, number, number] }, out: EntityInstance[]) {
  const inLine = new Set(tiles.map((t) => `${t.x},${t.y}`));
  const isWall = (x: number, y: number) => inLine.has(`${x},${y}`) || wallAt(world, x, y);
  for (const t of tiles) {
    const color = t.ok ? colors.ok : colors.blocked;
    out.push({ x: t.x, y: t.y, size: 1, color, shape: SHAPE.flat, alpha: 0.22 });
    wallPieceInstances(t.x, t.y, neighbourMask(t.x, t.y, isWall), { type }, (x, y) => world.groundAt?.(x, y), color, 0.7, out);
  }
}
