// Picker.ts
// Was unter einer Stelle des Bildschirms (CSS-Pixel) liegt: der Welt-Punkt
// mit Geländehöhe, das Tile, der nächste Dorfbewohner, ein Tier, eine Blume,
// ein Vorkommen am Objekt (Baumkrone, Fels) - und worauf ein Klick damit zielt.

import { animalCenter, modelSize, TREES, type EntityInstance } from '../gl/entityRenderer';
import { pickWorld, visibleWorldRect, worldToScreen } from '../gl/iso';
import { addRenderStats } from '../renderStats';
import { VILLAGER } from '../world/catalog';
import type { FlowerField } from '../world/flowers';
import type { ResourceField } from '../world/resources';
import type { Animal } from '../world/unit';
import type { Villager, World } from '../world/world';
import type { Camera } from './Camera';
import type { Ground } from './Ground';

/**
 * Ab dieser Zoomstufe (CSS-Pixel je Tile) stehen Bäume, Felsen und Sträucher
 * als Objekte in der Landschaft. Weiter draußen wären sie ein, zwei Pixel
 * groß - dort zeigt die Einfärbung des Geländes die Vorkommen.
 */
export const RESOURCE_OBJECTS_MIN_ZOOM = 4;

export class Picker {
  /** @param blend wie weit der laufende Tick ist (0..1) - Figuren stehen dazwischen */
  constructor(
      private world: World,
      private resources: ResourceField,
      private camera: Camera,
      private ground: Ground,
      private blend: () => number,
      private flowers: FlowerField,
      /** Was gerade zu sehen ist - Unsichtbares trifft man nicht. */
      private shown: { animal: (kind: string) => boolean; flowers: () => boolean },
  ) {}

  /** Wird je Klick neu befüllt statt neu angelegt. */
  private nearFlowers: EntityInstance[] = [];

  /** Welt-Punkt unter der Stelle, mit Relief. */
  point(px: number, py: number) {
    // Der Sichtstrahl fragt bis zu 200 Geländehöhen ab - läuft je Bild und je Mausbewegung.
    const start = performance.now();
    const hit = pickWorld(this.camera.view(), px, py, (x, y) => this.ground.heightAt(x, y));
    addRenderStats('pickMs', performance.now() - start);
    return hit;
  }

  /** Tile unter der Stelle. */
  tile(px: number, py: number) {
    const p = this.point(px, py);
    return { x: Math.floor(p.x), y: Math.floor(p.y) };
  }

  /** Bildschirmposition (CSS-Pixel) der Figurmitte - die Stelle, auf die man klickt. */
  villagerScreen(v: Villager) {
    const p = v.positionAt(this.blend());
    return worldToScreen(this.camera.view(), p.x, p.y, this.ground.heightAt(p.x, p.y) + VILLAGER.size * 0.8);
  }

  /** Dorfbewohner unter dem Zeiger - der nächste innerhalb eines Klick-Radius. */
  villager(px: number, py: number): Villager | undefined {
    // Mindestens ein paar Pixel, damit man die Figur auch herausgezoomt trifft.
    const radius = Math.max(10, VILLAGER.size * this.camera.tileSize * 1.2);
    let best: Villager | undefined;
    let bestDistance = radius;
    for (const v of this.world.villagers) {
      if (v.inside > 0) continue;
      const s = this.villagerScreen(v);
      const d = Math.hypot(s.x - px, s.y - py);
      if (d < bestDistance) {
        bestDistance = d;
        best = v;
      }
    }
    return best;
  }

  /** Tier unter dem Zeiger - wie beim Dorfbewohner der nächste innerhalb eines Klick-Radius um die Körpermitte. */
  animal(px: number, py: number): Animal | undefined {
    const v = this.camera.view();
    let best: Animal | undefined;
    let bestDistance = Infinity;
    for (const a of this.world.wildlife.animals) {
      if (!this.shown.animal(a.kind)) continue;
      const at = a.positionAt(this.blend());
      const p = animalCenter(a.definition.shape, at.x - 0.5, at.y - 0.5, a.definition.height, a.heading, a.isDead);
      const height = a.isDead ? 0.2 * a.definition.height : 0.5 * a.definition.height;
      const s = worldToScreen(v, p.x, p.y, this.ground.heightAt(p.x, p.y) + height);
      const d = Math.hypot(s.x - px, s.y - py);
      if (d < Math.max(10, a.definition.height * this.camera.tileSize * 0.6) && d < bestDistance) {
        bestDistance = d;
        best = a;
      }
    }
    return best;
  }

  /** Blume unter dem Zeiger (nur nah heran, als 3D-Objekt) - die Blüte zählt, nicht der Fuß. */
  flower(px: number, py: number): EntityInstance | undefined {
    if (!this.shown.flowers()) return undefined;
    const v = this.camera.view();
    const at = this.point(px, py);
    this.nearFlowers.length = 0;
    this.flowers.instances({ x: at.x - 1, y: at.y - 1, width: 2, height: 2 }, this.world, this.nearFlowers);
    let best: EntityInstance | undefined;
    let bestDistance = Infinity;
    for (const f of this.nearFlowers) {
      const x = f.x + 0.5;
      const y = f.y + 0.5;
      // Die Blüte sitzt auf 0.62 der Breite (models/flowers/flower.glb).
      const s = worldToScreen(v, x, y, this.ground.heightAt(x, y) + 0.62 * f.size);
      const d = Math.hypot(s.x - px, s.y - py);
      if (d < Math.max(6, f.size * this.camera.tileSize * 0.6) && d < bestDistance) {
        bestDistance = d;
        best = f;
      }
    }
    return best;
  }

  /**
   * Vorkommen, dessen Objekt (Baum, Fels, Strauch) unter dem Zeiger steht -
   * auch an der Krone, nicht nur am Fuß. Jedes Objekt gilt als aufrechter
   * Streifen vom Fuß bis zur Spitze; der vorderste Treffer gewinnt.
   */
  resourceObject(px: number, py: number): { x: number; y: number } | undefined {
    if (this.camera.tileSize < RESOURCE_OBJECTS_MIN_ZOOM) return undefined;
    const v = this.camera.view();
    // Etwas Rand: hohe Bäume unterhalb des Bildes ragen mit der Krone herein.
    const rect = visibleWorldRect(v);
    const margin = 4;
    const area = { x: rect.x - margin, y: rect.y - margin, width: rect.width + 2 * margin, height: rect.height + 2 * margin };
    return this.resources.pick(area, (inst, x, y) => {
      const dims = modelSize(inst.shape);
      if (!dims) return undefined;
      // Leer abgebaut und nicht mehr zu sehen (Bäume, Felsen) - nicht treffen.
      if (!this.world.resourceInfo(x, y)) return undefined;
      const cx = inst.x + 0.5;
      const cy = inst.y + 0.5;
      const z = this.ground.heightAt(cx, cy);
      // Ein gefällter Baum liegt flach.
      const fallen = inst.motion && inst.motion[1] > 0.5;
      const height = fallen ? 0.3 * inst.size : dims.height * inst.size;
      const base = worldToScreen(v, cx, cy, z);
      const top = worldToScreen(v, cx, cy, z + height);
      // Halbe Breite in Pixeln: ein Stück quer zur Blickrichtung am Boden.
      const w = dims.width * inst.size * 0.4;
      const side = worldToScreen(v, cx + w, cy - w, z);
      const half = Math.max(6, Math.hypot(side.x - base.x, side.y - base.y));
      // Abstand des Zeigers zum Streifen von base nach top. Bäume laufen nach
      // oben spitz zu - ihr Treffer auch, sonst verdeckte eine hohe Spitze den
      // Strauch dahinter.
      const sx = top.x - base.x;
      const sy = top.y - base.y;
      const len2 = sx * sx + sy * sy || 1;
      const t = Math.max(0, Math.min(1, ((px - base.x) * sx + (py - base.y) * sy) / len2));
      const d = Math.hypot(px - (base.x + sx * t), py - (base.y + sy * t));
      const taper = TREES.includes(inst.shape) && !fallen ? 1 - 0.75 * t : 1;
      return d <= Math.max(4, half * taper) ? base.y : undefined;
    });
  }

  /**
   * Tile, auf das ein Klick zielt: ein Vorkommen am Objekt getroffen, sonst der
   * Boden. Liegt direkt auf dem angeklickten Feld ein Strauch, Stein oder Gold,
   * gewinnt der - auch wenn eine Baumspitze davor ins Bild ragt.
   */
  target(px: number, py: number): { x: number; y: number } {
    const tile = this.tile(px, py);
    if (this.world.at(tile.x, tile.y)) return tile;
    const own = this.world.resourceInfo(tile.x, tile.y);
    if (own && own.type !== 'wood') return tile;
    return this.resourceObject(px, py) ?? tile;
  }
}
