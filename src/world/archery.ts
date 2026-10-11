// archery.ts
// Schießplatz (B24): Dorfbewohner üben dort mit dem Bogen. Rechtsklick mit
// Dorfbewohnern auf den Platz schickt bis zu ARCHERY.trainees hin; jeder hat
// seinen Platz an der Schießlinie (slot). Ablauf je Schütze (Auftrag
// 'archery'): hingehen -> ohne Bogen einen aus der nächsten Waffenkammer holen
// (VillagerWork.fetchWeapon, derselbe Weg wie der Speer des Jägers) -> an
// seinem Platz schießen, Schuss um Schuss. Jeder Schuss ist Übung: die
// Fähigkeit "Bogen" steigt (unit/skills.ts) und er schießt schneller. Den
// Bogen behält er, auch bei jedem anderen Auftrag - mit ihm jagt er aus
// größerer Entfernung (HUNT.bowRange).
//
// Hat keine Waffenkammer einen Bogen, wartet er an seinem Platz und sagt es
// (Panel des Schützen und des Platzes); sobald einer da ist, holt er ihn.
// ponytail: kein Pfeil fliegt sichtbar, der Schuss ist nur Ton und Haltung;
// Pfeile als Partikel zeichnen, wenn man Treffer auf den Scheiben sehen soll.

import { BUILDING_HEADING, POSE, modelWorkSpot } from '../gl/entityRenderer';
import { ArcheryRange, type Building } from './building';
import type { Task, Villager } from './unit';
import { SKILL_LABEL, practise, skillLevel } from './unit/skills';
import type { VillagerWork } from './villagers';
import type { World } from './world';

/**
 * `trainees`: so viele üben zugleich auf einem Platz (Vorgabe des Spielers).
 * `shotTime`: Sekunden je Schuss ohne Übung (als Meister ein Drittel weniger, SKILL.bonus).
 * `lowered`: Anteil eines Schusses, in dem der Bogen nach dem Schuss unten ist.
 * `spacing`: Abstand der Plätze an der Schießlinie in Tiles (2,25 m) - weiter
 * als crowd.ts schiebt (PERSONAL_SPACE), sonst drängten sie sich weg.
 */
export const ARCHERY = { trainees: 6, shotTime: 2, lowered: 0.2, spacing: 0.45 };

type ArcheryTask = Extract<Task, { kind: 'archery' }>;

/** Wer auf diesem Platz übt (oder dorthin unterwegs ist). */
export function trainees(world: World, range: Building): Villager[] {
  return world.villagers.filter((v) => v.task.kind === 'archery' && v.task.building === range.anchor);
}

/**
 * Platz `slot` an der Schießlinie und die Scheibe davor (Welt, Tiles): die
 * Mitte markiert das Modell (Work.Stand, Work.Aim), die Plätze liegen quer zur
 * Schussrichtung nebeneinander, ihre Scheiben ebenso. Auch für die Galerie.
 */
export function rangeSpot(range: Pick<Building, 'model' | 'x' | 'y' | 'definition'>, slot: number): { x: number; y: number; aimX: number; aimY: number } {
  const size = range.definition.size;
  const spot = modelWorkSpot(range.model, range.x, range.y, size, BUILDING_HEADING)
    // Ohne Marker: quer über den Platz, von links nach rechts im Modell.
    ?? { x: range.x + 0.5 + Math.sin(BUILDING_HEADING) * size * 0.4, y: range.y + 0.5 - Math.cos(BUILDING_HEADING) * size * 0.4,
         aimX: range.x + 0.5 - Math.sin(BUILDING_HEADING) * size * 0.4, aimY: range.y + 0.5 + Math.cos(BUILDING_HEADING) * size * 0.4 };
  const [dx, dy] = [spot.aimX - spot.x, spot.aimY - spot.y];
  const d = Math.hypot(dx, dy) || 1;
  const [lx, ly] = [-dy / d, dx / d];
  const s = (slot - (ARCHERY.trainees - 1) / 2) * ARCHERY.spacing;
  return { x: spot.x + lx * s, y: spot.y + ly * s, aimX: spot.aimX + lx * s, aimY: spot.aimY + ly * s };
}

/**
 * Rechtsklick auf den Schießplatz: jeder Ausgewählte bekommt den kleinsten
 * freien Platz. Ist keiner mehr frei, bleibt er stehen und sagt es.
 * VERIFIED: tests/archery.test.mjs - von acht kommen sechs auf den Platz.
 */
export function sendToRange(world: World, selected: readonly Villager[], range: ArcheryRange): string | null {
  const chosen = new Set(selected);
  const used = new Set(trainees(world, range).filter((v) => !chosen.has(v)).map((v) => (v.task as ArcheryTask).slot));
  let full = 0;
  for (const v of selected) {
    let slot = 0;
    while (used.has(slot)) slot++;
    if (slot >= ARCHERY.trainees) {
      v.assign({ kind: 'idle' });
      v.problem = 'Der Schießplatz ist voll';
      full++;
      continue;
    }
    used.add(slot);
    v.assign({ kind: 'archery', building: range.anchor, slot, step: 'walk', progress: 0 });
  }
  return full > 0 ? `Auf dem Schießplatz üben höchstens ${ARCHERY.trainees}` : null;
}

/** Ein Tick eines Schützen - siehe oben. */
export function tickArcher(work: VillagerWork, world: World, v: Villager, task: ArcheryTask, dt: number) {
  const range = world.building(task.building);
  if (!(range instanceof ArcheryRange)) {
    v.assign({ kind: 'idle' });
    return;
  }
  const spot = rangeSpot(range, task.slot);
  if (task.step === 'walk') {
    if (work.walk(v, spot.x, spot.y, 0.05, dt)) task.step = v.inventory.weapon === 'bow' ? 'practise' : 'fetch';
    return;
  }
  if (task.step === 'fetch') {
    if (work.fetchWeapon(v, task, 'bow', dt)) {
      v.problem = null;
      return;
    }
    if (v.inventory.weapon === 'bow') {
      v.problem = null;
      task.step = 'practise';
      return;
    }
    // Keine Waffenkammer hat einen Bogen (oder keine mit Bogen ist zu erreichen):
    // am Platz warten, im nächsten Tick neu suchen.
    v.problem = [...world.allBuildings()].some((b) => b.stored('bows') >= 1)
      ? 'Kommt an keinen Bogen - keine Waffenkammer mit Bogen erreichbar'
      : 'Kein Bogen in einer Waffenkammer - wartet am Schießplatz';
    task.armory = undefined;
    if (work.walk(v, spot.x, spot.y, 0.05, dt)) v.heading = Math.atan2(spot.aimY - v.y, spot.aimX - v.x);
    return;
  }
  if (!work.walk(v, spot.x, spot.y, 0.05, dt)) return;
  v.heading = Math.atan2(spot.aimY - v.y, spot.aimX - v.x);
  // Übung macht schneller: der nächste Schuss kommt früher (skills.ts).
  task.progress += practise(v.skills, 'archery', dt) / ARCHERY.shotTime;
  if (task.progress >= 1) {
    task.progress -= 1;
    world.onEvent?.({ kind: 'strike', resource: 'throw', x: v.x, y: v.y });
  }
  // Bogen vorn in beiden Händen (Clip carry, angehalten - render.ts), nach dem Schuss kurz unten.
  v.pose = task.progress < ARCHERY.lowered ? POSE.stand : POSE.carry;
  world.markDirty();
}

/** Kurzbeschreibung fürs Panel. */
export function describeArcher(v: Villager, task: ArcheryTask): string {
  switch (task.step) {
    case 'walk': return 'geht zum Schießplatz';
    case 'fetch': return 'holt einen Bogen aus der Waffenkammer';
    case 'practise': return `übt Bogenschießen (${SKILL_LABEL.archery} ${Math.floor(skillLevel(v.skills, 'archery') * 100)} %)`;
  }
}

/** Fürs Panel des Platzes: wie viele üben, von wie vielen, und worauf welche warten. */
export function rangeView(world: World, range: Building): { trainees: number; max: number; waiting: string[] } {
  const list = trainees(world, range);
  const waiting = [...new Set(list.flatMap((v) => (v.problem ? [v.problem] : [])))];
  return { trainees: list.length, max: ARCHERY.trainees, waiting };
}
