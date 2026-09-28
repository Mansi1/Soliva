// flowers.ts
// Blumen auf der Wiese als kleine 3D-Objekte (gl/flowerModel.ts) - erst nah
// genug heran (MapRenderer.flowerObjects), weiter draußen malt das Gelände
// sie als Tupfen. Verteilt wie dort (flower() in terrainShader.ts): in
// Horsten - je Feld von 2x2 Tiles vielleicht eine Gruppe, in der Mitte dicht,
// zum Rand hin lichter, meist aus einer Art -, dazwischen kaum eine. In
// blühenden Wiesen mehr Gruppen, zu Wald, Strand, Wüste und Fels hin keine
// (MapGenerator.bloomAt). Wie die Vorkommen
// in Stücken einmal ausgerechnet und gemerkt (fillChunks in resources.ts).

import { FLOWERS, type EntityInstance } from '../gl/entityRenderer';
import { FLOWER_KINDS } from '../gl/flowerModel';
import type { Terrain } from '../map';
import type { MapGenerator } from '../noise';
import { CHUNK, fillChunks, hash } from './resources';
import type { ViewRect, World } from './world';

/** Zellen je Tile-Kante: je Zelle höchstens eine Blume. */
const CELLS = 8;
/** Kante des Rasters der Gruppen, in Tiles: je Feld höchstens eine Gruppe. */
const CLUMP = 2;
/** Chance einer Zelle in der Mitte einer Gruppe - zum Rand hin fällt sie auf 0. */
const CLUMP_CHANCE = 0.8;
/** Chance einer Zelle für eine einzelne Blume außerhalb der Gruppen. */
const STRAY_CHANCE = 0.004;

/**
 * Breite einer Blume über die Blätter, in Tiles (dazu je Blume 0.8-1.25fach) -
 * die Blüte ist etwa ein Drittel davon: rund 9 cm Radius, 16 cm hoch, passend
 * zu den Tomaten. Wie r in flower() im Gelände-Shader - beim Wechsel zu 3D
 * springt die Größe nicht.
 */
export const FLOWER_SIZE = 0.052;

interface Clump { x: number; y: number; r: number; kind: number }
/** Nah heran ist der Bildschirm klein - so viele Stücke reichen weit darüber hinaus. */
const MAX_CHUNKS = 1200;

const smoothstep = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class FlowerField {
  /** Je Stück die Blumen. */
  private chunks = new Map<string, EntityInstance[]>();

  constructor(private terrain: Terrain, private mapGen: MapGenerator) {}

  update(view: ViewRect, centerX: number, centerY: number, budgetMs = 3) {
    fillChunks(this.chunks, view, centerX, centerY, budgetMs, MAX_CHUNKS, (cx, cy) => this.generate(cx, cy));
  }

  /** Die Blumen im Rechteck - nicht auf Gebäuden und Feldern. */
  instances(view: ViewRect, world: World, out: EntityInstance[]) {
    const x1 = view.x + view.width;
    const y1 = view.y + view.height;
    for (let cy = Math.floor(view.y / CHUNK); cy <= Math.floor(y1 / CHUNK); cy++) {
      for (let cx = Math.floor(view.x / CHUNK); cx <= Math.floor(x1 / CHUNK); cx++) {
        const list = this.chunks.get(`${cx},${cy}`);
        if (!list) continue;
        for (const plant of list) {
          // Instanzen liegen mit der linken oberen Ecke; die Blume steht in der Mitte.
          const x = plant.x + 0.5;
          const y = plant.y + 0.5;
          if (x < view.x || x > x1 || y < view.y || y > y1) continue;
          if (world.at(Math.floor(x), Math.floor(y))) continue;
          out.push(plant);
        }
      }
    }
  }

  /** Die Gruppe im Feld (kx, ky) des Gruppenrasters - oder keine. */
  private clump(kx: number, ky: number): Clump | null {
    // Mitte im inneren Teil des Felds, Radius kleiner als der Abstand zum Rand -
    // so reicht keine Gruppe ins Nachbarfeld.
    const x = (kx + 0.3 + 0.4 * hash(kx, ky, 30)) * CLUMP;
    const y = (ky + 0.3 + 0.4 * hash(kx, ky, 31)) * CLUMP;
    const meadow = smoothstep(0.1, 0.6, this.mapGen.detail(x * 0.04 + 70, y * 0.04 - 30));
    if (hash(kx, ky, 32) >= 0.08 + 0.4 * meadow) return null;
    return { x, y, r: 0.2 + 0.35 * hash(kx, ky, 33), kind: hash(kx, ky, 34) };
  }

  private generate(cx: number, cy: number): EntityInstance[] {
    const out: EntityInstance[] = [];
    const clumps = new Map<number, Clump | null>();
    for (let ty = cy * CHUNK; ty < (cy + 1) * CHUNK; ty++) {
      for (let tx = cx * CHUNK; tx < (cx + 1) * CHUNK; tx++) {
        const kx = Math.floor(tx / CLUMP), ky = Math.floor(ty / CLUMP);
        const key = kx * 65536 + ky;
        if (!clumps.has(key)) clumps.set(key, this.clump(kx, ky));
        const clump = clumps.get(key)!;
        // Blumendichte des Tiles - teuer, darum erst bei Bedarf und einmal je Tile.
        let bloom = -1;
        for (let j = 0; j < CELLS; j++) {
          for (let i = 0; i < CELLS; i++) {
            const gx = tx * CELLS + i;
            const gy = ty * CELLS + j;
            let chance = STRAY_CHANCE;
            if (clump) {
              const d = Math.hypot((gx + 0.5) / CELLS - clump.x, (gy + 0.5) / CELLS - clump.y) / clump.r;
              chance += CLUMP_CHANCE * Math.max(0, 1 - d * d);
            }
            const rnd = hash(gx, gy, 20);
            if (rnd >= chance) continue;
            // Kein Platz zwischen Bäumen, Felsen und Sträuchern.
            if (bloom < 0) bloom = this.terrain.resourceAt(tx, ty).type !== 'none' ? 0 : this.mapGen.bloomAt(tx + 0.5, ty + 0.5);
            if (rnd >= chance * bloom) continue;
            this.plant(out, gx, gy, clump?.kind ?? hash(gx, gy, 24));
          }
        }
      }
    }
    return out;
  }

  /**
   * Die Blume der Zelle (gx, gy) - der Schatten gehört zum Modell. Ohne
   * `ground`: der Shader stellt sie auf das Gelände, wie es gerade gezeichnet
   * ist (Feindetail der Zoomstufe, eingeebnete Flächen). Vorab mit
   * heightAt(x, y) gemessen fehlt das Feindetail - am Hang schwebte die Blume
   * bis zu einer Viertel-Tile über dem Boden oder steckte darin, und der Klick
   * (Picker.flower) ging daneben.
   */
  private plant(out: EntityInstance[], gx: number, gy: number, groupKind: number) {
    const x = (gx + 0.35 + 0.3 * hash(gx, gy, 21)) / CELLS;
    const y = (gy + 0.35 + 0.3 * hash(gx, gy, 22)) / CELLS;
    // Art: meist die der Gruppe, jede fünfte eine andere.
    const kindRnd = hash(gx, gy, 23) < 0.2 ? hash(gx, gy, 24) : groupKind;
    const kind = Math.min(FLOWER_KINDS.length - 1, Math.floor(kindRnd * FLOWER_KINDS.length));
    const size = FLOWER_SIZE * (0.8 + 0.45 * hash(gx, gy, 26));
    out.push({
      x: x - 0.5,
      y: y - 0.5,
      size,
      color: [0, 0, 0],
      shape: FLOWERS[kind],
      alpha: 1,
      motion: [hash(gx, gy, 27) * Math.PI * 2, 0, 0, 1],
    });
  }
}
