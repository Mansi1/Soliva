// Ground.ts
// Das Gelände, wie man es sieht: Höhe je Punkt (mit eingeebneten Flächen
// unter den Gebäuden und der Reliefstärke des Renderers), dazu der Abgleich
// mit dem Gelände-Shader - eingeebnete Flächen je Bild, Äcker in einem
// Ausschnitt um die Kamera ein paarmal je Sekunde.

import { FIELD_WINDOW } from '../gl/terrainRenderer';
import type { MapRenderer } from '../map';
import { reliefZ, type MapGenerator } from '../noise';
import { flatten, type FlatZone } from '../world/flatten';
import type { World } from '../world/world';
import type { Camera } from './Camera';

/** So oft (ms) werden die Äcker neu zusammengestellt - gepflügt wird langsam. */
const FIELD_REFRESH = 250;
/** Raster (Tiles), auf das der Äcker-Ausschnitt springt. */
const FIELD_SNAP = 32;

/** Abtastschritt (Tiles) für coarseGroundAt - die feinen Oktaven fallen dabei weg. */
const COARSE_STEP = 2;

export class Ground {
  /** Eingeebnete Flächen unter den Gebäuden (world/flatten.ts), je Bild neu. */
  private flatZones: FlatZone[] = [];
  /** Höhe je Gebäude - nur einmal gemessen. */
  private flatHeights = new Map<string, number>();
  private readonly fieldData = new Uint8Array(FIELD_WINDOW * FIELD_WINDOW * 4);
  private fieldOrigin = { x: NaN, y: NaN };
  private lastFieldUpdate = 0;

  constructor(
      private mapGen: MapGenerator,
      private world: World,
      private renderer: MapRenderer,
      private camera: Camera,
  ) {}

  /**
   * Geländehöhe (Tiles) ohne Reliefstärke - mit derselben Feinheit wie das
   * Geländegitter der jetzigen Zoomstufe und mit den eingeebneten Flächen.
   */
  groundAt(x: number, y: number): number {
    const step = 4 / (this.camera.tileSize * this.camera.pixelRatio);
    return flatten(x, y, reliefZ(this.mapGen.heightAt(x, y, step)), this.flatZones);
  }

  /**
   * Geländehöhe (Tiles) ohne Feindetail - für Fragen im Maßstab ganzer Berge
   * (steht einer im Weg?), deutlich billiger als groundAt.
   */
  coarseGroundAt(x: number, y: number): number {
    return reliefZ(this.mapGen.heightAt(x, y, COARSE_STEP));
  }

  /**
   * Höhe, wie man sie sieht - mit der Reliefstärke: flachgelegt (Leertaste)
   * trifft ein Klick sonst die Stelle, an der der Berg stünde.
   */
  heightAt(x: number, y: number): number {
    return this.groundAt(x, y) * this.renderer.relief;
  }

  /** Je Bild: eingeebnete Flächen und - ab und zu - die Äcker an den Shader geben. */
  update(now: number) {
    this.updateFlatZones();
    this.updateFields(now);
  }

  private updateFlatZones() {
    const zones: FlatZone[] = [];
    for (const b of this.world.allBuildings()) {
      // Felder bleiben, wie das Gelände ist - Pflanzen wachsen auch am Hang.
      // Reusen liegen im Wasser, der Boden darunter bleibt.
      if (b.isFarm() || b.type === 'fish_trap') continue;
      const footprint = b.definition.footprint;
      const k = `${b.type}:${b.x},${b.y}`;
      let z = this.flatHeights.get(k);
      if (z === undefined) {
        // Mittel über den Grundriss: so wird bergauf etwas abgetragen und
        // bergab etwas aufgeschüttet.
        let sum = 0, n = 0;
        for (let i = 0; i <= 2; i++) for (let j = 0; j <= 2; j++) {
          sum += reliefZ(this.mapGen.heightAt(b.x + 0.5 + (i - 1) * footprint / 2, b.y + 0.5 + (j - 1) * footprint / 2));
          n++;
        }
        z = sum / n;
        this.flatHeights.set(k, z);
      }
      zones.push({ x: b.x + 0.5, y: b.y + 0.5, half: footprint / 2 + 0.1, z });
    }
    // Der Shader nimmt nur die der Bildmitte nächsten.
    const { x, y } = this.camera;
    // Quadrate reichen zum Vergleichen - ohne Wurzel je Vergleich.
    zones.sort((a, b) => (a.x - x) ** 2 + (a.y - y) ** 2 - ((b.x - x) ** 2 + (b.y - y) ** 2));
    this.flatZones = zones;
    this.renderer.setFlatZones(zones);
  }

  /** Äcker im Ausschnitt um die Kamera - neu, wenn sie herausläuft oder FIELD_REFRESH vorbei ist. */
  private updateFields(now: number) {
    const x = Math.floor((this.camera.x - FIELD_WINDOW / 2) / FIELD_SNAP) * FIELD_SNAP;
    const y = Math.floor((this.camera.y - FIELD_WINDOW / 2) / FIELD_SNAP) * FIELD_SNAP;
    if (x === this.fieldOrigin.x && y === this.fieldOrigin.y && now - this.lastFieldUpdate < FIELD_REFRESH) return;
    this.fieldOrigin = { x, y };
    this.lastFieldUpdate = now;
    this.renderer.setFields(x, y, this.world.fieldSoil(x, y, FIELD_WINDOW, this.fieldData));
  }
}
