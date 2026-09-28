// Picker.ts
// Was unter einer Stelle des Bildschirms (CSS-Pixel) liegt: der Welt-Punkt
// mit Geländehöhe, das Tile, der nächste Dorfbewohner, ein Tier, eine Blume,
// ein Vorkommen am Objekt (Baumkrone, Fels) - und worauf ein Klick damit zielt.

import { animalCenter, buildingHeading, modelBounds, modelRayHit, type EntityInstance } from '../gl/entityRenderer';
import { groundToWorld, pickWorld, viewZScreen, visibleWorldRect, worldToScreen, type IsoView } from '../gl/iso';
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
   * auch an der Krone, nicht nur am Fuß, aber nicht daneben: geprüft wird
   * gegen die Dreiecke des Modells (modelHit). Ein gefällter Baum liegt und
   * gilt als Streifen vom Fuß zur Spitze. Der vorderste Treffer gewinnt.
   */
  resourceObject(px: number, py: number): { x: number; y: number } | undefined {
    if (this.camera.tileSize < RESOURCE_OBJECTS_MIN_ZOOM) return undefined;
    const v = this.camera.view();
    // Etwas Rand: hohe Bäume unterhalb des Bildes ragen mit der Krone herein.
    const rect = visibleWorldRect(v);
    const margin = 4;
    const area = { x: rect.x - margin, y: rect.y - margin, width: rect.width + 2 * margin, height: rect.height + 2 * margin };
    return this.resources.pick(area, (inst, x, y) => {
      const box = modelBounds(inst.shape);
      if (!box) return undefined;
      const cx = inst.x + 0.5;
      const cy = inst.y + 0.5;
      // Bildschirm-x hängt nicht von der Höhe ab - so fällt fast jedes Objekt
      // weg, bevor Geländehöhe und Vorrat gefragt werden (teuer). Weiter als
      // 2 · größte Ausdehnung reicht kein Modell zur Seite.
      const reach = 2 * Math.max(...box.lo.slice(0, 2).map(Math.abs), ...box.hi.slice(0, 2).map(Math.abs)) * inst.size * v.tileSize;
      const foot = worldToScreen(v, cx, cy, 0);
      if (Math.abs(px - foot.x) > Math.max(6, reach)) return undefined;
      // Leer abgebaut und nicht mehr zu sehen (Bäume, Felsen) - nicht treffen.
      if (!this.world.resourceInfo(x, y)) return undefined;
      // Wie im Shader: auf dem tiefsten Punkt seines Fußes (am Rand eingeebneter Flächen mit), sonst auf dem Gelände.
      const z = inst.ground !== undefined ? this.ground.flat(cx, cy, inst.ground) * this.ground.relief : this.ground.heightAt(cx, cy);
      const base = worldToScreen(v, cx, cy, z);
      const fallen = inst.motion && inst.motion[1] > 0.5;
      if (!fallen) {
        // Winzige Objekte (weit draußen) bleiben ein paar Pixel um ihre Achse treffbar.
        const top = worldToScreen(v, cx, cy, z + box.hi[2] * inst.size);
        const tiny = Math.abs(px - base.x) <= 4 && py <= base.y + 4 && py >= top.y - 4;
        return tiny || this.modelHit(v, px, py, inst.shape, cx, cy, z, inst.size, inst.motion?.[0] ?? 0) ? base.y : undefined;
      }
      // Liegender Baum: Abstand zum Streifen vom Fuß bis 0.3 · Größe hoch.
      const w = (box.hi[1] - box.lo[1]) * inst.size * 0.4;
      const side = worldToScreen(v, cx + w, cy - w, z);
      const half = Math.max(6, Math.hypot(side.x - base.x, side.y - base.y));
      const top = worldToScreen(v, cx, cy, z + 0.3 * inst.size);
      const sx = top.x - base.x;
      const sy = top.y - base.y;
      const len2 = sx * sx + sy * sy || 1;
      const t = Math.max(0, Math.min(1, ((px - base.x) * sx + (py - base.y) * sy) / len2));
      return Math.hypot(px - (base.x + sx * t), py - (base.y + sy * t)) <= half ? base.y : undefined;
    });
  }

  /**
   * Trifft der Sichtstrahl durch (px, py) das Modell `shape`, das mit dem Fuß
   * auf (cx, cy, ground) steht, um `heading` gedreht und `size` groß - wie
   * der Shader es zeichnet (Ruhelage: Wind und bewegte Teile zählen nicht)?
   * Erst gegen den Quader (billig), dann gegen die Dreiecke.
   */
  private modelHit(v: IsoView, px: number, py: number, shape: number,
      cx: number, cy: number, ground: number, size: number, heading: number): boolean {
    const box = modelBounds(shape);
    if (!box) return false;
    // Punkt des Strahls in Höhe z - wie pickWorld -, in Modell-Achsen
    // (vorn, links, oben) und Einheiten von modelBounds.
    const a = groundToWorld((px - v.width / 2) / v.tileSize, (py - v.height / 2) / v.tileSize);
    const d = groundToWorld(0, viewZScreen());
    const [c, sn] = [Math.cos(heading), Math.sin(heading)];
    const local = (z: number) => {
      const x = v.centerX + a.x + d.x * z - cx;
      const y = v.centerY + a.y + d.y * z - cy;
      return [(c * x + sn * y) / size, (-sn * x + c * y) / size, (z - ground) / size];
    };
    const p = local(ground + box.lo[2] * size);
    const q = local(ground + box.hi[2] * size);
    // Strecke p..q gegen das Rechteck lo..hi, je Achse ein Streifen.
    let t0 = 0, t1 = 1;
    for (let k = 0; k < 2 && t0 <= t1; k++) {
      const [lo, hi, dk] = [box.lo[k], box.hi[k], q[k] - p[k]];
      if (Math.abs(dk) < 1e-9) {
        if (p[k] < lo || p[k] > hi) return false;
        continue;
      }
      const [ta, tb] = [(lo - p[k]) / dk, (hi - p[k]) / dk];
      t0 = Math.max(t0, Math.min(ta, tb));
      t1 = Math.min(t1, Math.max(ta, tb));
    }
    return t0 <= t1 && modelRayHit(shape, p, q);
  }

  /**
   * Gebäude, dessen Modell unter dem Zeiger steht - auch an Dach und Wand,
   * nicht nur am Grundriss; der Hof daneben und die Luft darüber zählen nicht
   * (modelHit). Der vorderste gewinnt; `depth` wie bei resourceObject
   * (Bildschirm-y des Fußpunkts, größer = weiter vorn). Felder zählen hier
   * nicht - sie liegen flach, ihr Tile ist das Feld (siehe target).
   */
  private building(px: number, py: number): { x: number; y: number; depth: number } | undefined {
    const v = this.camera.view();
    // Mindestgröße wie beim Zeichnen: 8 Geräte-Pixel (map.ts, entities.render).
    const minSize = 8 / (this.camera.tileSize * this.camera.pixelRatio);
    let best: { x: number; y: number; depth: number } | undefined;
    for (const b of this.world.allBuildings()) {
      if (b.isFarm()) continue;
      const cx = b.x + 0.5;
      const cy = b.y + 0.5;
      const ground = this.ground.heightAt(cx, cy);
      const size = Math.max(b.definition.size, minSize);
      if (!this.modelHit(v, px, py, b.model, cx, cy, ground, size, buildingHeading(b.model))) continue;
      const depth = worldToScreen(v, cx, cy, ground).y;
      if (!best || depth > best.depth) best = { x: b.x, y: b.y, depth };
    }
    return best;
  }

  /**
   * Tile, auf das ein Klick zielt: das Gebäude oder Vorkommen, dessen Modell
   * getroffen ist (das vorderste), sonst der Boden. Felder liegen flach -
   * dort ist das Tile das Feld.
   * `bareGround`: kein Modell getroffen, nur der Boden unter einem Gebäude
   * oder Vorkommen - zum Auswählen zählt dort nur das Modell selbst; ein
   * Rechtsklick (sammeln, abliefern, hineingehen) geht dort trotzdem. Weit
   * draußen, wo Vorkommen nur Farbe im Gelände sind, zählt ihr Tile.
   */
  target(px: number, py: number): { x: number; y: number; bareGround?: boolean } {
    const tile = this.tile(px, py);
    const onTile = this.world.at(tile.x, tile.y);
    if (onTile?.isFarm()) return tile;
    const object = this.resourceObject(px, py);
    const house = this.building(px, py);
    if (house && (!object
        || house.depth >= worldToScreen(this.camera.view(), object.x + 0.5, object.y + 0.5, this.ground.heightAt(object.x + 0.5, object.y + 0.5)).y)) {
      return house;
    }
    if (object) return object;
    const bare = onTile || (this.camera.tileSize >= RESOURCE_OBJECTS_MIN_ZOOM && this.world.resourceInfo(tile.x, tile.y));
    return bare ? { ...tile, bareGround: true } : tile;
  }
}
