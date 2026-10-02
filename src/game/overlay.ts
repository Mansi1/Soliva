// overlay.ts
// Was zusätzlich zur Welt gezeichnet wird: die Markierung der Auswahl
// (Ring, Fläche, Sammelpunkt), im Baumodus die Vorschau am Zeiger - und die
// Punkte auf der Minimap.

import { SHAPE, animalCenter, type EntityInstance } from '../gl/entityRenderer';
import type { IsoView } from '../gl/iso';
import type { MiniMap } from '../map';
import type { UnitProducer } from '../world/building';
import { BUILDINGS, CROPS, FIELD_ROWS, VILLAGER, player, type BuildingType } from '../world/catalog';
import { workplace } from '../world/villagers';
import type { World } from '../world/world';
import type { Selection } from './Selection';

/** Farbe der Auswahl und freier Bauplätze. */
const SELECTED: [number, number, number] = [110, 231, 160];
/** Breite des Streifens, auf den der Shader die Punkte zum Sammelpunkt malt (Tiles) - etwas mehr als ein Punkt. */
const RALLY_LINE_WIDTH = 0.1;
/** So lange gilt ein gesuchter Weg zum Sammelpunkt (ms) - dann neu: ein Baum fällt, ein Haus entsteht. */
const ROUTE_REFRESH_MS = 1000;

/** Gesuchte Wege zum Sammelpunkt je Gebäude und Fahne - nicht in jedem Bild neu suchen. */
const routes = new Map<string, { at: number; points: { x: number; y: number }[] }>();

/** Der Weg von der Tür eines ausbildenden Gebäudes zur Fahne (World.route), höchstens einmal je ROUTE_REFRESH_MS gesucht. */
function rallyRoute(world: World, building: UnitProducer, flag: { x: number; y: number }) {
  const key = `${building.anchor}|${flag.x},${flag.y}`;
  const now = performance.now();
  let hit = routes.get(key);
  if (!hit || now - hit.at > ROUTE_REFRESH_MS) {
    const door = building.spawnPoint();
    hit = { at: now, points: world.route(door.x, door.y, flag.x, flag.y) };
    // Alte Fahnen vergessen - es sind nur die gerade ausgewählten Gebäude.
    if (routes.size > 16) routes.clear();
    routes.set(key, hit);
  }
  return hit.points;
}

/**
 * Auswahl: grüner Ring unter jedem Dorfbewohner (nicht unter Werkstatt-
 * Arbeitern - sie gehorchen nicht), Tier und der Blume, Fläche
 * unter dem Gebäude, Sammelpunkt, Vorkommen. Ein ausgeblendetes Tier
 * (`hideAnimal`, weit draußen) bekommt keinen Ring.
 */
export function selectionOverlay(
    world: World, selection: Selection, blend: number, out: EntityInstance[], hideAnimal: (kind: string) => boolean,
) {
  for (const v of world.villagers) {
    if (!selection.villagers.has(v.id) || workplace(v.task)) continue;
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
      const rally = building.rallyPoint;
      // Fuß der Fahne: genau, wo geklickt wurde. Ältere Stände kennen nur das
      // Tile - dann etwas zur Kamera hin, vor einem Baum oder Fels statt dahinter.
      // Instanzen stehen mit ihrer Mitte bei (x + 0.5, y + 0.5).
      const flag = rally.point ?? { x: rally.x + 0.8, y: rally.y + 0.8 };
      const color = player.color.toRGB();
      out.push({ x: flag.x - 0.5, y: flag.y - 0.5, size: 0.54, color, shape: SHAPE.rallyFlag, alpha: 1 });
      // Der Weg, den die Neuen gehen: von der Tür (spawnPoint) um das Gebäude
      // herum bis an den Fuß der Fahne. Der Shader malt wandernde Punkte in
      // Spielerfarbe darauf (SHAPE.rallyLine) - je Stück eine Instanz,
      // motion[2] = Strecke davor, damit die Punkte an Ecken weiterlaufen.
      const route = rallyRoute(world, building, flag);
      let before = 0;
      for (let i = 1; i < route.length; i++) {
        const a = route[i - 1];
        const dx = route[i].x - a.x;
        const dy = route[i].y - a.y;
        const length = Math.hypot(dx, dy);
        if (length < 1e-3) continue;
        out.push({
          x: a.x - 0.5, y: a.y - 0.5, size: RALLY_LINE_WIDTH, color, shape: SHAPE.rallyLine, alpha: 1,
          motion: [dx, dy, before, 0],
        });
        before += length;
      }
      // Am Fuß: Ringe in Spielerfarbe, die immer wieder zum Fuß hin schrumpfen.
      // Die grüne Markierung bleibt den Einheiten vorbehalten.
      out.push({
        x: flag.x - 0.5, y: flag.y - 0.5, size: 0.45, color, shape: SHAPE.rallyPulse, alpha: 1,
        ground: world.groundAt!(flag.x, flag.y),
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
