// particles.ts
// Partikel aus der Landschaft: Gold glitzert direkt auf der Ader, Stein blitzt
// ab und zu weiß auf, über der Wiese fliegen Bienen und Schmetterlinge, am
// Strand huschen Krabben, im Wasser springen kleine Fische. Je
// Stück einmal gesucht und gemerkt (fillChunks, wie resources.ts) - je Bild
// nur angemeldet, was im Bild ist (Vorkommen: nur solange nicht abgebaut).
// Die Partikel der Arbeit (Späne, Dreck, Blätter, Wasser) und die Bienen über
// den Feldern meldet render.ts an.

import type { Terrain } from '../map';
import { reliefZ } from '../noise';
import { DETAIL_TILE_SIZE, PARTICLE, type ParticleSources } from '../particles';
import { CHUNK, fillChunks, hash } from './resources';
import type { ViewRect, World } from './world';

/** Ab so vielen CSS-Pixeln je Tile glitzert es - weiter draußen wären es Pixel-Krümel. */
const FROM_TILE_SIZE = 32;
/** Fische nur so viele Tiles vom Ufer entfernt (openWater). */
const OPEN_WATER = 1;
/** So viele Stücke bleiben gemerkt. */
const MAX_CHUNKS = 2400;

/** Ein Vorkommen, über dem es glitzert, oder Insekten über der Wiese - x, y Tile, z Bodenhöhe ohne Relief-Stärke. */
interface Spot {
  kind: number; x: number; y: number; z: number; seed: number;
  /** Stärke des Glitzerns - Wasser schwächer als Stein (particleRenderer.ts). */
  intensity?: number;
  /** Bodenhöhe, wie man sie sieht (world.groundAt) - beim ersten Anmelden gemerkt. */
  ground?: number;
}

export class LandscapeParticles {
  private chunks = new Map<string, Spot[]>();

  constructor(private terrain: Terrain) {}

  update(view: ViewRect, centerX: number, centerY: number, budgetMs = 2) {
    if (view.width <= 0) return;
    fillChunks(this.chunks, view, centerX, centerY, budgetMs, MAX_CHUNKS, (cx, cy) => this.generate(cx, cy));
  }

  /** Meldet an, was im Rechteck glitzert und fliegt - Insekten erst nah heran. */
  collect(view: ViewRect, world: World, out: ParticleSources) {
    if (out.tileSize < FROM_TILE_SIZE) return;
    const insects = out.tileSize >= DETAIL_TILE_SIZE;
    const x1 = view.x + view.width;
    const y1 = view.y + view.height;
    for (let cy = Math.floor(view.y / CHUNK); cy <= Math.floor(y1 / CHUNK); cy++) {
      for (let cx = Math.floor(view.x / CHUNK); cx <= Math.floor(x1 / CHUNK); cx++) {
        for (const d of this.chunks.get(`${cx},${cy}`) ?? []) {
          if (d.x < view.x || d.x > x1 || d.y < view.y || d.y > y1) continue;
          // resourceAt kennt nur die grobe Höhe - im Gebirge Tiles unter dem Relief, das man sieht.
          d.ground ??= world.groundAt?.(d.x + 0.5, d.y + 0.5) ?? d.z;
          const flying = d.kind === PARTICLE.bee || d.kind === PARTICLE.butterfly;
          if (d.kind === PARTICLE.crab || d.kind === PARTICLE.fish) {
            if (!insects || world.at(d.x, d.y)) continue;
            // Ein Schwarm aus 2 bis 4 Fischen, Krabben einzeln.
            const count = d.kind === PARTICLE.fish ? 2 + (d.seed % 3) : 1;
            if (!out.push(d.kind, d.x + 0.5, d.y + 0.5, d.ground, d.kind === PARTICLE.fish ? 0.7 : 0.4, 0, 0, 0, 1, d.seed, 0, count)) return;
            continue;
          }
          if (flying) {
            // Nicht über Gebäuden und Feldern (dort melden render.ts die Bienen der Felder).
            if (!insects || world.at(d.x, d.y)) continue;
            if (!out.push(d.kind, d.x + 0.5, d.y + 0.5, d.ground, 1.2, 0, 0, 0, 1, d.seed, 0, 1 + (d.seed & 1))) return;
            continue;
          }
          if (d.intensity === undefined && world.remainingAt(d.x, d.y).amount <= 0) continue;
          // Direkt auf dem Fels: kleiner Radius um die Mitte des Tiles.
          // Glitzern auf dem Wasser: ein einzelner, schwacher Blitz irgendwo im Tile.
          if (d.intensity !== undefined) {
            if (!out.push(d.kind, d.x + 0.5, d.y + 0.5, 0, 0.5, 0, 0, 0, d.intensity, d.seed, 0, 1)) return;
            continue;
          }
          if (!out.push(d.kind, d.x + 0.5, d.y + 0.5, d.ground, 0.15, 0, 0, 0, 1, d.seed, 0, 3)) return;
        }
      }
    }
  }

  /** In OPEN_WATER Tiles Umkreis nur Wasser - so schwimmen die Fische nicht über den Strand. */
  private openWater(x: number, y: number): boolean {
    for (let dy = -OPEN_WATER; dy <= OPEN_WATER; dy++) {
      for (let dx = -OPEN_WATER; dx <= OPEN_WATER; dx++) {
        const t = this.terrain.resourceAt(x + dx, y + dy).tileType;
        if (t !== 'water' && t !== 'deep_water') return false;
      }
    }
    return true;
  }

  private generate(cx: number, cy: number): Spot[] {
    const out: Spot[] = [];
    for (let y = cy * CHUNK; y < (cy + 1) * CHUNK; y++) {
      for (let x = cx * CHUNK; x < (cx + 1) * CHUNK; x++) {
        const t = this.terrain.resourceAt(x, y);
        // Über gut einem Prozent der freien Wiese fliegt etwas: meist Bienen, sonst Schmetterlinge.
        const meadow = t.tileType === 'grass' && t.type === 'none' && hash(x, y, 65) < 0.012;
        const water = t.tileType === 'water' || t.tileType === 'deep_water';
        const beach = t.tileType === 'beach' && t.type === 'none';
        // Wasser glitzert nur hier und da, schwach.
        if (water && hash(x, y, 69) < 0.03) {
          out.push({ kind: PARTICLE.sparkle, x, y, z: 0, seed: Math.floor(hash(x, y, 70) * 16777216), intensity: 0.6 });
        }
        const kind = t.type === 'gold' ? PARTICLE.gold
          : beach && hash(x, y, 67) < 0.02 ? PARTICLE.crab
          : water && hash(x, y, 68) < 0.06 && this.openWater(x, y) ? PARTICLE.fish
          : t.type === 'stone' ? PARTICLE.sparkle
          : meadow ? (hash(x, y, 66) < 0.6 ? PARTICLE.bee : PARTICLE.butterfly) : -1;
        if (kind < 0) continue;
        out.push({ kind, x, y, z: reliefZ(t.height), seed: Math.floor(hash(x, y, 63) * 16777216) });
      }
    }
    return out;
  }
}
