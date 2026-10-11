// construction.ts
// Baustellen (B26): Wer ein Gebäude setzt, steckt eine Baustelle ab und zahlt
// sofort (World.place). Fertig wird sie erst, wenn Dorfbewohner sie bauen -
// von selbst geht keiner hin: Rechtsklick mit Dorfbewohnern auf die Baustelle
// schickt bis zu MAX_BUILDERS hin, jeder auf einen Platz an einer Seite.
// Solange sie steht (BuildingBase.progress < 1), lagert sie nichts, gibt
// keinen Wohnraum und bildet nicht aus (BuildingBase.stores, UnitProducer,
// World.population). Abgerissen kommen die Kosten ganz zurück (World.remove).
//
// Bauzeit mit einem Bauenden (Vorgabe des Spielers): Haus 30 s, Werkstatt und
// Lager 45 s, Waffenkammer 60 s, Dorfzentrum 120 s (BUILD_TIME). Jeder weitere
// baut mit, aber weniger (BUILDER_SPEED): 1 + 0,7 + 0,5 + 0,35 - zu viert
// 2,55-mal so schnell. Übung im Bauen macht schneller (unit/skills.ts).
// Felder, Weiden und Reusen stehen sofort (BUILD_TIME 0), ebenso das erste
// Dorfzentrum einer Welt - ohne es gibt es keine Dorfbewohner.
//
// Danach geht es weiter (followUp): am Lager sammeln sie, was es annimmt, in
// der Nähe; eine Werkstatt übernimmt einer von ihnen; sonst (Haus,
// Waffenkammer, Dorfzentrum ...) gehen sie zur nächsten Baustelle in der Nähe
// oder bleiben stehen.
//
// Aussehen (siteInstances): erst nur Pflöcke mit Schnur um den Grundriss, dann
// wächst das Gebäude von unten nach oben (der Shader schneidet es auf Höhe ab,
// wie den Baum beim Absägen) mit einem Gerüst, das ihm etwas vorauswächst.

import { BUILDING_HEADING, POSE, SHAPE, buildingHeading, frozenMillMotion, modelSize, type EntityInstance } from '../gl/entityRenderer';
import type { Building } from './building';
import { VILLAGER, YIELD, player, type BuildingType, type DepositType } from './catalog';
import type { Task, Villager } from './unit';
import { practise } from './unit/skills';
import type { VillagerWork } from './villagers';
import type { World } from './world';

/**
 * Sekunden Bauzeit mit einem ungeübten Bauenden; 0 = steht sofort. Arten
 * ohne Vorgabe des Spielers nach der nächsten Gruppe: Schießplatz, Försterhütte,
 * Fischerhütte, Bognerei, Speermacherei und Schusterei wie Werkstatt (45 s).
 * Ein Record über alle Arten: eine neue Art ohne Bauzeit baut nicht.
 */
export const BUILD_TIME: Record<BuildingType, number> = {
  town_center: 120,
  house: 30,
  lumber_camp: 45, mining_camp: 45, mill: 45,
  bowyer: 45, spear_maker: 45, cobbler: 45, fisher_hut: 45, forester: 45, archery_range: 45,
  armory: 60,
  farm: 0, pasture: 0, fish_trap: 0,
};

/**
 * Was der 1., 2., 3. und 4. Bauende beiträgt (Anteil seines Tempos) - je mehr,
 * desto weniger bringt jeder weitere. Mehr als vier passen nicht an eine Baustelle.
 * ponytail: feste Tabelle statt Formel; eine Formel nehmen, wenn mehr als vier bauen dürfen.
 */
export const BUILDER_SPEED = [1, 0.7, 0.5, 0.35] as const;
export const MAX_BUILDERS = BUILDER_SPEED.length;

/** Seiten der Baustelle - Platz `slot` steht an Seite `slot`: erst die beiden zur Kamera (+x, +y). */
const SIDES = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const;
/** So weit (Tiles) vor dem Grundriss steht ein Bauender. */
const SPOT_GAP = 0.3;
/** So viel (Tiles) wächst das Gerüst dem Gebäude voraus. */
const SCAFFOLD_LEAD = 0.12;
/** Das Gerüst ist etwas breiter als das Gebäude. */
const SCAFFOLD_WIDTH = 1.1;

type BuildTask = Extract<Task, { kind: 'build' }>;

/** Wird diese Art erst als Baustelle abgesteckt? */
export function needsBuilders(type: BuildingType): boolean {
  return BUILD_TIME[type] > 0;
}

/** Wer an dieser Baustelle baut oder dorthin unterwegs ist. */
export function builders(world: World, site: Building): Villager[] {
  return world.villagers.filter((v) => v.task.kind === 'build' && v.task.building === site.anchor);
}

/** Wo der Bauende auf Platz `slot` steht und wohin er schaut (Welt, Tiles). */
export function builderSpot(site: Pick<Building, 'x' | 'y' | 'definition'>, slot: number): { x: number; y: number; aimX: number; aimY: number } {
  const [dx, dy] = SIDES[slot];
  const [cx, cy] = [site.x + 0.5, site.y + 0.5];
  const r = site.definition.footprint / 2 + SPOT_GAP;
  return { x: cx + dx * r, y: cy + dy * r, aimX: cx, aimY: cy };
}

/** Kleinster freier Platz, dessen Stelle begehbar ist - oder -1. */
function freeSlot(work: VillagerWork, site: Building, used: ReadonlySet<number>): number {
  for (let slot = 0; slot < MAX_BUILDERS; slot++) {
    if (used.has(slot)) continue;
    const spot = builderSpot(site, slot);
    if (!work.blockedAt(Math.floor(spot.x), Math.floor(spot.y))) return slot;
  }
  return -1;
}

/**
 * Rechtsklick auf eine Baustelle: jeder Ausgewählte bekommt den kleinsten
 * freien Platz. Ist keiner mehr frei, bleibt er stehen und sagt es.
 * VERIFIED: tests/construction.test.mjs - von fünf bauen vier, der fünfte nicht.
 */
export function sendToSite(world: World, work: VillagerWork, selected: readonly Villager[], site: Building): string | null {
  const chosen = new Set(selected);
  const used = new Set(builders(world, site).filter((v) => !chosen.has(v)).map((v) => (v.task as BuildTask).slot));
  let refused = 0;
  for (const v of selected) {
    const slot = freeSlot(work, site, used);
    if (slot < 0) {
      v.assign({ kind: 'idle' });
      v.problem = 'An der Baustelle ist kein Platz mehr';
      refused++;
      continue;
    }
    used.add(slot);
    v.assign({ kind: 'build', building: site.anchor, slot, step: 'walk' });
  }
  return refused > 0 ? `An der Baustelle ist kein Platz mehr - höchstens ${MAX_BUILDERS} bauen` : null;
}

/**
 * Ein Tick eines Bauenden: hingehen, dann mit dem Beil zimmern (Clip work).
 * Sein Beitrag hängt davon ab, wie viele mit kleinerem Platz schon bauen
 * (BUILDER_SPEED) - zusammen ergibt das die Summe der Tabelle.
 * VERIFIED: tests/construction.test.mjs - allein ein Haus in 30 s, zu zweit bis viert schneller.
 */
export function tickBuilder(work: VillagerWork, world: World, v: Villager, task: BuildTask, dt: number) {
  const site = world.building(task.building);
  if (!site || site.built) {
    v.assign({ kind: 'idle' });
    return;
  }
  const spot = builderSpot(site, task.slot);
  if (!work.walk(v, spot.x, spot.y, 0.05, dt)) {
    // Weggeschoben (oder noch unterwegs): erst wieder hin.
    task.step = 'walk';
    return;
  }
  if (task.step === 'walk') {
    // Angekommen - gebaut wird ab dem nächsten Tick, wie beim Sammeln.
    task.step = 'work';
    return;
  }
  v.heading = Math.atan2(spot.aimY - v.y, spot.aimX - v.x);
  v.pose = POSE.work;
  work.swing(v, dt, 'wood', false);
  let rank = 0;
  for (const u of world.villagers) {
    const t = u.task;
    if (u !== v && t.kind === 'build' && t.building === task.building && t.step === 'work' && t.slot < task.slot) rank++;
  }
  // Cheat "speedy gonzales": steht sofort.
  const share = world.speedy ? 1 : BUILDER_SPEED[rank] * practise(v.skills, 'building', dt) / BUILD_TIME[site.type];
  site.progress = Math.min(1, site.progress + share);
  world.markDirty();
  if (site.built) finish(world, work, site);
}

/** Fertig: die Welt erfährt es (Lager, Wohnraum ...), die Bauenden machen weiter (followUp). */
function finish(world: World, work: VillagerWork, site: Building) {
  world.finishConstruction(site);
  const crew = builders(world, site).sort((a, b) => (a.task as BuildTask).slot - (b.task as BuildTask).slot);
  for (const v of crew) v.assign({ kind: 'idle' });
  followUp(world, work, crew, site);
}

/**
 * Nach dem Bauen: eine Werkstatt übernimmt der erste (kleinster Platz); an
 * einem Lager sammeln sie das nächste Vorkommen dessen, was es annimmt (Holz,
 * Stein oder Gold, Beeren); wer dann noch nichts hat, geht zur nächsten
 * Baustelle in der Nähe (VILLAGER.searchRadius) mit freiem Platz - sonst bleibt er stehen.
 * VERIFIED: tests/construction.test.mjs - alle drei Fälle und die nächste Baustelle.
 */
export function followUp(world: World, work: VillagerWork, crew: readonly Villager[], site: Building) {
  let rest = [...crew];
  if (site.isWorkshop() && rest.length > 0) {
    world.command(new Set([rest[0].id]), site.x, site.y);
    rest = rest.slice(1);
  } else if (site.isStorage()) {
    const types = (Object.keys(YIELD) as DepositType[]).filter((d) => site.stores(YIELD[d]));
    rest = rest.filter((v) => {
      const spot = nearestDeposit(work, types, site);
      if (!spot) return true;
      world.command(new Set([v.id]), spot.x, spot.y);
      return v.task.kind !== 'gather';
    });
  }
  for (const v of rest) {
    const next = nearestSite(world, work, site, v);
    if (next) sendToSite(world, work, [v], next);
  }
}

/** Das nächste Vorkommen einer der Arten um das Gebäude, mit Platz zum Sammeln. */
function nearestDeposit(work: VillagerWork, types: readonly DepositType[], site: Building): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestDistance = Infinity;
  for (const type of types) {
    const spot = work.nextDeposit(type, site.x, site.y);
    const d = spot ? Math.hypot(spot.x - site.x, spot.y - site.y) : Infinity;
    if (d < bestDistance) {
      bestDistance = d;
      best = spot;
    }
  }
  return best;
}

/** Die nächste andere Baustelle in der Nähe, an der für `v` noch ein Platz frei ist. */
function nearestSite(world: World, work: VillagerWork, from: Building, v: Villager): Building | undefined {
  let best: Building | undefined;
  let bestDistance: number = VILLAGER.searchRadius;
  for (const b of world.allBuildings()) {
    if (b.built || b === from) continue;
    const d = Math.hypot(b.x - from.x, b.y - from.y);
    if (d > bestDistance) continue;
    const used = new Set(builders(world, b).filter((u) => u !== v).map((u) => (u.task as BuildTask).slot));
    if (freeSlot(work, b, used) < 0) continue;
    best = b;
    bestDistance = d;
  }
  return best;
}

/** Kurzbeschreibung fürs Panel: "baut Haus". */
export function describeBuilder(world: World, task: BuildTask): string {
  const label = world.building(task.building)?.label ?? 'Gebäude';
  return task.step === 'walk' ? `geht zur Baustelle (${label})` : `baut ${label}`;
}

/** Titel fürs Panel der Baustelle: "Baustelle: Haus – 40 % · Bauende 2/4". */
export function siteTitle(world: World, site: Building): string {
  return `Baustelle: ${site.label} – ${Math.floor(site.progress * 100)} % · Bauende ${builders(world, site).length}/${MAX_BUILDERS}`;
}

/**
 * Die Baustelle als Zeichen-Instanzen: um den Grundriss je Tile-Kante ein
 * Stück Absteckung (Pflock und Schnur, props/site_edge.glb, nach außen
 * gewandt - so steht an jeder Ecke genau ein Pflock), dann das Gebäude bis
 * zur Höhe des Fortschritts (motion.w < 0, im Shader abgeschnitten) und
 * darum das Gerüst (props/scaffold.glb) etwas höher.
 */
export function siteInstances(site: Building, ground: (x: number, y: number) => number | undefined, out: EntityInstance[], selected = false) {
  const def = site.definition;
  const r = (def.footprint - 1) / 2;
  const color = player.color.toRGB();
  for (let ty = site.y - r; ty <= site.y + r; ty++) {
    for (let tx = site.x - r; tx <= site.x + r; tx++) {
      for (const [dx, dy] of SIDES) {
        if (Math.abs(tx + dx - site.x) <= r && Math.abs(ty + dy - site.y) <= r) continue;
        const [mx, my] = [tx + 0.5 + dx * 0.5, ty + 0.5 + dy * 0.5];
        out.push({
          x: mx - 0.5, y: my - 0.5, size: 1, color, shape: SHAPE.siteEdge, alpha: 1,
          motion: [Math.atan2(dy, dx), 0, 0, 0], ground: ground(mx, my),
        });
      }
    }
  }
  if (site.progress <= 0) return;
  const z = ground(site.x + 0.5, site.y + 0.5);
  const motion = def.model === SHAPE.mill ? frozenMillMotion(site.x, site.y, 0)
    : [buildingHeading(site.model), -1, 0, 0] as [number, number, number, number];
  // Negativ: so weit von unten steht es (Anteil seiner Höhe).
  motion[3] = -site.progress;
  out.push({
    x: site.x, y: site.y, size: def.size, color, shape: site.model, alpha: 1, motion, ground: z,
    health: selected ? site.health : undefined,
  });
  const height = (modelSize(site.model)?.height ?? 1) * def.size;
  const size = def.size * SCAFFOLD_WIDTH;
  const top = (modelSize(SHAPE.scaffold)?.height ?? 1) * size;
  const cut = Math.min(top, site.progress * height + SCAFFOLD_LEAD);
  out.push({
    x: site.x, y: site.y, size, color, shape: SHAPE.scaffold, alpha: 1,
    motion: [BUILDING_HEADING, 0, 0, -Math.max(0.001, cut / top)], ground: z,
  });
}
