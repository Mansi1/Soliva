// overlay.ts
// Was zusätzlich zur Welt gezeichnet wird: die Markierung der Auswahl
// (Ring, Fläche, Sammelpunkt), im Baumodus die Vorschau am Zeiger - und die
// Punkte auf der Minimap.

import { SHAPE, animalCenter, type EntityInstance } from '../gl/entityRenderer';
import type { IsoView } from '../gl/iso';
import type { MiniMap } from '../map';
import { BUILDINGS, CROPS, FIELD_ROWS, VILLAGER, player, type BuildingType } from '../world/catalog';
import type { World } from '../world/world';
import type { Selection } from './Selection';

/** Farbe der Auswahl und freier Bauplätze. */
const SELECTED: [number, number, number] = [110, 231, 160];

/**
 * Auswahl: grüner Ring unter jedem Dorfbewohner, Tier und der Blume, Fläche
 * unter dem Gebäude, Sammelpunkt, Vorkommen. Ein ausgeblendetes Tier
 * (`hideAnimal`, weit draußen) bekommt keinen Ring.
 */
export function selectionOverlay(
    world: World, selection: Selection, blend: number, out: EntityInstance[], hideAnimal: (kind: string) => boolean,
) {
  for (const v of world.villagers) {
    if (!selection.villagers.has(v.id)) continue;
    const p = v.positionAt(blend);
    out.push({
      x: p.x - 0.5, y: p.y - 0.5, size: VILLAGER.size * 2,
      color: SELECTED, shape: SHAPE.ring, alpha: 1,
      ground: world.groundAt!(p.x, p.y),
    });
  }
  for (const building of selection.chosenBuildings()) {
    if (building.isFarm()) {
      // Ein Feldstück belegt nur seine Tiles - je Tile eine Fläche, etwas
      // größer: unter dem Getreide sähe man sie sonst gar nicht, so bleibt
      // ringsum ein schmaler grüner Rand.
      for (const [x, y] of building.footprintTiles()) {
        out.push({ x, y, size: 1.3, color: SELECTED, shape: SHAPE.flat, alpha: 0.35 });
      }
    } else {
      out.push({
        x: building.x, y: building.y, size: building.definition.footprint + 0.4,
        color: SELECTED, shape: SHAPE.flat, alpha: 0.35,
      });
    }
    // Sammelpunkt: Fahne in der Spielerfarbe, nur solange das Gebäude
    // ausgewählt ist - sonst stünden überall Fahnen herum.
    if (building.isUnitProducer() && building.rallyPoint) {
      out.push({
        // Etwas zur Kamera hin versetzt: auf einem Vorkommen steht sie so vor
        // dem Baum oder Fels statt dahinter.
        x: building.rallyPoint.x + 0.3, y: building.rallyPoint.y + 0.3, size: 0.54,
        color: player.color.toRGB(), shape: SHAPE.rallyFlag, alpha: 1,
      });
      out.push({
        x: building.rallyPoint.x, y: building.rallyPoint.y, size: 0.5,
        color: SELECTED, shape: SHAPE.flat, alpha: 0.35,
      });
    }
  }
  if (selection.resource) {
    out.push({
      x: selection.resource.x, y: selection.resource.y, size: 1,
      color: SELECTED, shape: SHAPE.flat, alpha: 0.3,
    });
  }
  const animal = selection.animal !== null ? world.wildlife.byId(selection.animal) : undefined;
  if (animal && !hideAnimal(animal.kind)) {
    const at = animal.positionAt(blend);
    const def = animal.definition;
    // Erlegt: unter dem liegenden Körper, nicht unter dem Stehpunkt.
    const p = animalCenter(def.shape, at.x - 0.5, at.y - 0.5, def.height, animal.heading, animal.isDead);
    out.push({
      x: p.x - 0.5, y: p.y - 0.5, size: animal.definition.height * 2,
      color: SELECTED, shape: SHAPE.ring, alpha: 1, ground: world.groundAt!(p.x, p.y),
    });
  }
  const flower = selection.flower;
  if (flower) {
    out.push({
      x: flower.x, y: flower.y, size: flower.size * 3,
      color: SELECTED, shape: SHAPE.ring, alpha: 1, ground: world.groundAt!(flower.x + 0.5, flower.y + 0.5),
    });
  }

}

/**
 * Bauvorschau am Zeiger: die belegte Fläche (rot, wenn es hier nicht geht)
 * und das Modell. Felder zeigen rundum, wo gesät werden kann, und die Frucht
 * Furche für Furche auf den Tiles, die sie bekämen.
 */
export function placementOverlay(world: World, type: BuildingType, tileX: number, tileY: number, blocked: boolean, out: EntityInstance[]) {
  const def = BUILDINGS[type];

  // Felder: rund um den Zeiger zeigen, wo gesät werden kann.
  if (type === 'farm') {
    const R = 9;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > R * R) continue;
        const [x, y] = [tileX + dx, tileY + dy];
        if (!world.sowable(x, y)) continue;
        out.push({ x, y, size: 0.92, color: [150, 220, 90], shape: SHAPE.flat, alpha: 0.16 });
      }
    }
  }

  // Die belegte Fläche wird mit eingefärbt: bei einem 3x3-Gebäude sieht man
  // sonst nicht, welche Felder es tatsächlich beansprucht.
  out.push({
    x: tileX,
    y: tileY,
    size: def.footprint,
    color: blocked ? [220, 70, 80] : SELECTED,
    shape: SHAPE.flat,
    alpha: 0.22,
  });
  if (type === 'farm') {
    // Felder zeigen die Frucht, die gesät wird - Furche für Furche, nur auf
    // den Tiles, die sie bekämen.
    const outline = world.fieldOutline(tileX, tileY, world.farmTiles(tileX, tileY) || 16);
    for (let row = 0; row < FIELD_ROWS; row++) {
      out.push({
        x: tileX, y: tileY, size: def.size, color: player.color.toRGB(),
        shape: CROPS[world.nextFarmCrop].shape + row, alpha: 0.7, motion: [row, 3, 1, outline.mask],
        accent: [outline.others, 0, 0],
      });
    }
    return;
  }
  out.push({
    x: tileX,
    y: tileY,
    size: def.size,
    color: blocked ? [220, 70, 80] : player.color.toRGB(),
    shape: def.model,
    alpha: 0.7,
  });
}

/**
 * Minimap wie in AoE2: jedes Gebäude ein Quadrat, jede Einheit ein Punkt, in
 * der Spielerfarbe mit dunklem Rand - in fester Pixelgröße, damit man sie bei
 * jeder Zoomstufe sieht. Felder etwas blasser, sie sind groß und zahlreich.
 */
export function minimapDots(world: World, minimap: MiniMap, current: IsoView, out: EntityInstance[]) {
  out.length = 0;
  const rect = minimap.viewRectOf(current);
  const ppt = minimap.pixelsPerTile(current);
  const color = player.color.toRGB();
  const dark: [number, number, number] = [20, 20, 20];
  const inside = (x: number, y: number) => x >= rect.x - 3 && x <= rect.x + rect.width + 3 && y >= rect.y - 3 && y <= rect.y + rect.height + 3;
  const dot = (x: number, y: number, px: number, c: [number, number, number], alpha = 1) => {
    const size = px / ppt;
    const border = 2 / ppt;
    out.push({ x, y, size: size + border, color: dark, shape: SHAPE.flat, alpha: 0.8 * alpha });
    out.push({ x, y, size, color: c, shape: SHAPE.flat, alpha });
  };
  for (const b of world.allBuildings()) {
    if (!inside(b.x, b.y)) continue;
    const fp = b.definition.footprint;
    // Größer von beidem: echte Fläche oder Mindestgröße in Pixeln.
    dot(b.x, b.y, Math.max(fp * ppt, b.isFarm() ? 4 : 6), color, b.isFarm() ? 0.55 : 1);
  }
  for (const v of world.villagers) {
    if (v.inside > 0 || !inside(v.x, v.y)) continue;
    dot(v.x - 0.5, v.y - 0.5, 3, color);
  }
}
