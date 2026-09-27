// render.ts
// Was von der Welt zu sehen ist, als Zeichen-Instanzen für den EntityRenderer:
// Gebäude und Felder, Dorfbewohner, Tiere und einstürzende Gebäude mit Staub
// und Schutt. Die Welt selbst kennt keine Darstellung - hier wird sie nur
// gelesen.

import {
  ANIMAL_POSE, BUILDING_HEADING, POSE, SHAPE, buildingHeading, figureHolding, figureProps, frozenMillMotion, millMotion, modelSize, modelStockSlots,
  modelWorkSpot,
  type EntityInstance,
} from '../gl/entityRenderer';
import { RESOURCE_TYPE_COLORS } from '../map';
import { reliefZ } from '../noise';
import { FishTrap, furrowPosition } from './building';
import { BUILDINGS, CROPS, FISHING, VILLAGER, player, type DepositType, type ResourceKind } from './catalog';
import {
  RUIN_COLLAPSE, RUIN_COLLAPSE_START, RUIN_DURATION, RUIN_FADE_START, RUIN_FLIGHT, RUIN_SHAKE,
} from './ruin';
import { AFLOAT, DRAGGING, workplace } from './villagers';
import { STRIDE_LENGTH, WORK_TEMPO, type ViewRect, type World } from './world';

/** Farbe des Hinweispfeils über einem Gebäude ohne Arbeiter. */
const MARKER_COLOR: [number, number, number] = [255, 205, 40];
/** Höhe des Hinweispfeils in Tiles (1.5 m) und sein Abstand über dem Dach. */
const MARKER_SIZE = 0.3;
const MARKER_GAP = 0.12;

/**
 * Boot des Fischers (props/fisher_boat.glb): Breite und Länge in Tiles (1
 * Tile = 5 m), wie tief der tiefste Punkt unter der Wasserlinie liegt und wie
 * hoch der Boden darüber, auf dem der Fischer steht.
 */
const BOAT_SIZE = 1.73 / 5;
const BOAT_LENGTH = 3.7 / 5;
const BOAT_KEEL = -0.33 / 5;
const BOAT_FLOOR = 0.06 / 5;
/** Reuse (fields/fish_trap.glb): Anteil ihrer Breite unter der Wasserlinie. */
const TRAP_DRAFT = 1.05 / 4.12;

/** Farbe von Staub und Schutt beim Einsturz. */
const DUST_COLOR: [number, number, number] = [214, 200, 172];

/** Farbe der Ladung auf dem Rücken: wie das Vorkommen, aus dem sie meist stammt. */
const LOAD_LOOK: Record<ResourceKind, DepositType> = { food: 'berries', wood: 'wood', stone: 'stone', gold: 'gold', bows: 'wood' };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Sammelt alles Sichtbare als Zeichen-Instanzen. Der Rand ist großzügig,
 * damit große Gebäude am Bildrand nicht abgeschnitten aufpoppen.
 * @param blend 0..1 - wie weit der nächste Tick schon fortgeschritten ist,
 *   damit Dorfbewohner flüssig laufen statt zehnmal je Sekunde zu springen.
 * @param selection was ausgewählt ist - nur das bekommt einen Lebensbalken
 * @param hovered Gebäude unter dem Zeiger (Ankerpunkt) - eine Waffenkammer
 *   zeigt sich dann ohne Dach, wie in Stronghold (ausgewählt ebenso)
 * @param hideAnimal Tierarten, die nicht gezeichnet werden - weit draußen
 *   ausgeblendet (Menü → Grafik → Tiere ausblenden)
 */
export function worldInstances(
  world: World,
  view: ViewRect,
  out: EntityInstance[] = [],
  blend = 1,
  selection?: { villagers: ReadonlySet<number>; buildings: ReadonlySet<string>; animal?: number | null },
  hovered?: string,
  hideAnimal: (kind: string) => boolean = () => false,
): EntityInstance[] {
  const margin = 4;
  const x0 = view.x - margin;
  const y0 = view.y - margin;
  const x1 = view.x + view.width + margin;
  const y1 = view.y + view.height + margin;

  ruinInstances(world, x0, y0, x1, y1, out, blend);
  const armory = world.armoryStock();
  // Bognereien: wie weit der Bogen auf der Werkbank ist - nur solange der
  // Bogner daran arbeitet (sein Holz liegt auf der Bank), sonst ist sie leer.
  const crafting = new Map<string, number>();
  // Werkstätten mit Arbeiter - über den anderen steht ein Hinweispfeil.
  const staffed = new Set<string>();
  // Fischerhütten, deren Boot gerade unterwegs ist - sonst liegt es an der Hütte.
  const boatOut = new Set<string>();
  for (const v of world.villagers) {
    const at = workplace(v.task);
    if (at) staffed.add(at);
    if (v.task.kind === 'fish' && (AFLOAT.has(v.task.step) || DRAGGING.has(v.task.step))) boatOut.add(v.task.building);
    if (v.task.kind === 'craft' && v.task.step === 'carve' && v.carryType !== 'wood') crafting.set(v.task.building, v.task.progress);
  }
  const now = world.timeAt(blend);

  for (const building of world.allBuildings()) {
    if (building.x < x0 || building.x > x1 || building.y < y0 || building.y > y1) continue;
    const def = building.definition;
    if (building.isFarm()) {
      // Je Furche eine Instanz, jede mit ihrer Frucht und ihrem Stand.
      const farm = building;
      const { outline, ground } = world.fieldLook(building);
      // Die erste Furche immer - an ihr hängen Pflöcke und Schnur, auch wenn
      // das Feldstück selbst keine Pflanzen in ihr hat.
      farm.furrows.forEach((f, row) => (row === 0 || farm.furrowCells(row).length > 0) && out.push({
        x: building.x, y: building.y, size: def.size,
        // Gefälle quer zur Furche an Anfang, Mitte und Ende (Tiles je Tile), * 255 wie unten.
        color: ground ? [ground[27 + row * 3] * 255, ground[27 + row * 3 + 1] * 255, ground[27 + row * 3 + 2] * 255] : player.color.toRGB(),
        shape: CROPS[f.crop].shape + row, alpha: 1,
        motion: [row, farm.furrowStage(row), furrowPosition(farm.tiles, row, farm.furrowShare(row)), outline.mask],
        // Geländehöhe am Anfang und Ende der Furche (Mitte in `ground`), * 255:
        // der Renderer teilt die Akzentfarbe durch 255.
        accent: [outline.others, ground ? ground[row * 3] * 255 : 0, ground ? ground[row * 3 + 2] * 255 : 0],
        ground: ground ? ground[row * 3 + 1] : undefined,
        health: row === 0 && selection?.buildings.has(building.anchor) ? building.health : undefined,
      }));
      continue;
    }
    out.push({
      x: building.x,
      y: building.y,
      size: def.size,
      color: player.color.toRGB(),
      shape: building.model,
      alpha: 1,
      // Jede Mühle dreht in ihrem eigenen Takt; Felder zeigen Wuchs und Rest.
      motion: def.model === SHAPE.mill ? millMotion(building.x, building.y)
        : def.model === SHAPE.bowyer ? [BUILDING_HEADING, crafting.get(building.anchor) ?? -1, 0, 0]
        // Reuse: Fisch um Fisch, wie sie sich füllt (Stock.0-4 im Modell).
        : building instanceof FishTrap ? [BUILDING_HEADING, building.fish / FISHING.trapFish, 0, 0]
        : armory.has(building.anchor) && modelStockSlots(building.model) > 0
          ? armoryMotion(building.model, armory.get(building.anchor)!, def.weaponCapacity,
              building.anchor === hovered || !!selection?.buildings.has(building.anchor))
        : undefined,
      health: selection?.buildings.has(building.anchor) ? building.health : undefined,
      // Reusen liegen zum Teil unter Wasser.
      ground: building.type === 'fish_trap' ? -TRAP_DRAFT * def.size : undefined,
    });
    // Das Boot liegt an der Hütte, solange es nicht unterwegs ist - längs der Hütte.
    if (building.type === 'fisher_hut' && !boatOut.has(building.anchor)) {
      const at = modelWorkSpot(building.model, building.x, building.y, def.size, BUILDING_HEADING)?.boat;
      if (at) out.push(boatAt(at.x, at.y, BUILDING_HEADING + Math.PI / 2, world.groundAt?.(at.x, at.y)));
    }
    // Arbeiter fehlt: ein Pfeil nach unten über dem Dach, der sich langsam dreht.
    if (building.isWorkshop() && !staffed.has(building.anchor)) {
      const top = (modelSize(building.model)?.height ?? 1) * def.size;
      out.push({
        x: building.x, y: building.y, size: MARKER_SIZE, color: MARKER_COLOR, shape: SHAPE.markerArrow, alpha: 1,
        motion: [now * 1.5, top + MARKER_GAP, 0, 0],
      });
    }
  }

  for (const v of world.villagers) {
    if (!v.isVisible) continue;
    const { x, y } = v.positionAt(blend);
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    const phase = v.pose === POSE.walk
      ? lerp(v.prevStride, v.stride, blend) * (Math.PI * 2 / STRIDE_LENGTH)
      : v.pose === POSE.work || v.pose === POSE.pick || v.pose === POSE.scythe || v.pose === POSE.carve
        ? lerp(v.prevWorkTime, v.workTime, blend) * WORK_TEMPO
        // Stehen: Weltzeit in Sekunden, je Figur versetzt (Leerlauf-Animation).
        : world.timeAt(blend) + v.id * 7.3;
    // Die Last auf dem Rücken wächst mit der Ladung und trägt die Farbe
    // der Ressource - man sieht, wer was trägt und wie viel.
    const load = v.carryType ? Math.min(1, v.carrying / VILLAGER.capacity) : 0;
    const figure: EntityInstance = {
      // Instanzen werden um die Tile-Mitte gezeichnet, die Figur steht auf (x, y).
      x: x - 0.5,
      y: y - 0.5,
      size: VILLAGER.size,
      color: player.color.toRGB(),
      // Frau oder Mann - steht beim Dorfbewohner fest (siehe Villager.female).
      shape: v.female ? SHAPE.villagerFemale : SHAPE.villager,
      alpha: 1,
      motion: [v.heading, phase, v.pose, load],
      ground: world.groundAt?.(x, y),
      health: selection?.villagers.has(v.id) ? v.hp / VILLAGER.hp : undefined,
      accent: v.carryType ? RESOURCE_TYPE_COLORS[LOAD_LOOK[v.carryType]].toRGB() : undefined,
    };
    const fishing = v.task.kind === 'fish' ? v.task : undefined;
    if (!fishing) {
      // Dazu, was er in der Hand hat (Beil, Sense, Zugmesser - je nach Clip).
      out.push(figure, ...figureProps(figure));
      continue;
    }
    // Fischer: im Boot steht er auf dessen Boden; an Land zieht er es mit der
    // linken Hand hinter sich her. In der rechten die Angel oder der Fang.
    const h = v.heading;
    if (AFLOAT.has(fishing.step)) {
      figure.ground = BOAT_FLOOR;
      out.push(boatAt(x, y, h, BOAT_KEEL));
    } else if (DRAGGING.has(fishing.step)) {
      const [bx, by] = [x - Math.cos(h) * BOAT_LENGTH * 0.55 - Math.sin(h) * 0.05, y - Math.sin(h) * BOAT_LENGTH * 0.55 + Math.cos(h) * 0.05];
      out.push(boatAt(bx, by, h, world.groundAt?.(bx, by)));
    }
    const rod = fishing.step === 'shore' || fishing.step === 'angle';
    out.push(figure, ...figureHolding(figure, rod ? 'rod' : fishing.fish > 0 ? 'fish' : null));
  }
  for (const a of world.wildlife.animals) {
    if (hideAnimal(a.definition.type)) continue;
    const { x, y } = a.positionAt(blend);
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    const def = a.definition;
    const pose = a.state === 'dead' ? ANIMAL_POSE.dead
      : a.state === 'flee' ? ANIMAL_POSE.flee
      : a.state === 'walk' ? ANIMAL_POSE.walk : ANIMAL_POSE.graze;
    // Gehen und Fliehen: Beine nach der Strecke; äsen: nach der Uhr, je Tier versetzt.
    const phase = pose === ANIMAL_POSE.walk || pose === ANIMAL_POSE.flee
      ? lerp(a.prevStride, a.stride, blend) * (Math.PI * 2 / (def.stride * (pose === ANIMAL_POSE.flee ? 2 : 1)))
      : world.timeAt(blend) + a.id * 3.1;
    out.push({
      x: x - 0.5, y: y - 0.5, size: def.height, color: [255, 255, 255], shape: def.shape, alpha: 1,
      motion: [a.heading, phase, pose, 0],
      ground: world.groundAt?.(x, y),
      health: selection?.animal === a.id ? a.hp / def.hp : undefined,
      food: selection?.animal === a.id ? a.food / def.food : undefined,
    });
  }
  return out;
}

/** Das Boot des Fischers mit der Mitte auf (x, y), Bug in Richtung `heading`. */
function boatAt(x: number, y: number, heading: number, ground?: number): EntityInstance {
  return {
    x: x - 0.5, y: y - 0.5, size: BOAT_SIZE, color: player.color.toRGB(), shape: SHAPE.fisherBoat, alpha: 1,
    motion: [heading, 0, 0, 0], ground,
  };
}

/** Waffenkammer: Füllstand der Gestelle (Anteil der Plätze) und offen, wenn der Zeiger darauf steht oder sie ausgewählt ist. */
function armoryMotion(shape: number, bows: number, capacity: number, open: boolean): [number, number, number, number] {
  // Die Plätze im Modell zeigen den Füllstand anteilig - aufgerundet, damit
  // schon ein einzelner Bogen zu sehen ist.
  const slots = modelStockSlots(shape);
  const shown = Math.min(slots, Math.ceil((bows / capacity) * slots));
  return [BUILDING_HEADING, shown / slots, open ? 1 : 0, 0];
}

/** Einstürzende Gebäude: Wackeln, Zusammensacken, Staub, fliegender Schutt, Ausblenden. */
function ruinInstances(world: World, x0: number, y0: number, x1: number, y1: number, out: EntityInstance[], blend: number) {
  const now = world.timeAt(blend);
  const ease = (t: number) => t * t * (3 - 2 * t);
  for (const ruin of world.ruins) {
    if (ruin.x < x0 || ruin.x > x1 || ruin.y < y0 || ruin.y > y1) continue;
    const def = BUILDINGS[ruin.type];
    // Ein aufgegebenes Feld stürzt nicht ein - es ist einfach weg.
    if (ruin.type === 'farm') continue;
    const t = now - ruin.at;
    const fade = t < RUIN_FADE_START ? 1 : Math.max(0, 1 - (t - RUIN_FADE_START) / (RUIN_DURATION - RUIN_FADE_START));
    const collapse = ease(Math.min(1, Math.max(0, (t - RUIN_COLLAPSE_START) / RUIN_COLLAPSE)));
    // Wackeln, bevor es nachgibt.
    const shake = t < RUIN_SHAKE ? Math.sin(t * 70) * 0.04 * def.size : 0;
    // Eine eingestürzte Mühle dreht nicht weiter.
    const motion = def.model === SHAPE.mill
      ? frozenMillMotion(ruin.x, ruin.y, ruin.clock)
      : [buildingHeading(ruin.shape), 0, 0, 0] as [number, number, number, number];
    motion[3] = Math.max(0.001, collapse);
    out.push({
      x: ruin.x + shake,
      y: ruin.y - shake,
      size: def.size,
      color: player.color.toRGB(),
      shape: ruin.shape,
      // Knapp unter 1: bleibt so vorn in der Sortierung für Halbdurchsichtiges.
      alpha: Math.max(0.01, fade * 0.999),
      motion,
    });

    // Staub quillt in Wolken rund um das Gebäude auf, steigt und verzieht sich.
    const dustT = Math.min(1, t / 2.2);
    if (dustT < 1) {
      const spread = Math.max(def.footprint, def.size) * 0.5;
      for (let i = 0; i < 7; i++) {
        const angle = (i / 7) * Math.PI * 2 + ruin.x * 0.7;
        const reach = spread * (i === 0 ? 0 : 0.5 + 0.9 * ease(dustT));
        out.push({
          x: ruin.x + Math.cos(angle) * reach,
          y: ruin.y + Math.sin(angle) * reach,
          size: def.size * (0.7 + 0.9 * ease(dustT)) * (i === 0 ? 1.3 : 1),
          color: DUST_COLOR,
          shape: SHAPE.dust,
          alpha: 0.75 * (1 - dustT) ** 1.3 * Math.min(1, t * 6),
          motion: [def.size * (0.25 + 0.6 * dustT), 0, 0, 0],
        });
      }
    }

    // Schutt fliegt im Bogen hinaus und bleibt liegen.
    const ground = reliefZ(world.terrain.getTile(ruin.x, ruin.y).height);
    const tf = Math.min(t, RUIN_FLIGHT);
    for (const d of ruin.debris) {
      const along = tf / RUIN_FLIGHT;
      // Höhe: Wurfparabel, die genau nach RUIN_FLIGHT auf der Landestelle ankommt.
      const arc = d.vz * tf - 0.5 * (2 * d.vz / RUIN_FLIGHT) * tf * tf;
      const z = ground + (d.ground - ground) * along + Math.max(0, arc) * 0.6;
      out.push({
        x: ruin.x + d.dx * along,
        y: ruin.y + d.dy * along,
        size: d.size * fade,
        color: DUST_COLOR,
        shape: SHAPE.stoneRock,
        alpha: 1,
        motion: [d.heading + t * 6 * (1 - along), 0, 0, 0],
        ground: z,
      });
    }
  }
}
