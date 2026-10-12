// villagers.ts
// Was Dorfbewohner tun, Schritt für Schritt: Befehle annehmen (Rechtsklick),
// laufen (mit Wegsuche), sammeln, abliefern, Felder bestellen, jagen - und
// als kurzer Text beschreiben, was sie gerade tun. Was ein Dorfbewohner ist
// und hat, steht in unit/Villager.ts; die Welt ruft tick() je Dorfbewohner.

import { BUILDING_HEADING, CLIPS, POSE, modelEntry, modelWorkSpot } from '../gl/entityRenderer';
import type { Clip } from '../gl/clips';
import { RESOURCE_TYPE_LABEL } from '../map';
import { findPath, lineOfSight, type Blocked } from './pathfinding';
import { CROWDED_ARRIVAL, freeSpot, occupied, separate, steer, type Point } from './crowd';
import { ArcheryRange, FishTrap, Forester, furrowFood, type Building, type Farm } from './building';
import {
  COBBLER, CRAFTS, CROPS, FARM_RATE, FISH_KIND, FISHING, FORESTER, HUNT, MAX_GATHERERS, MEAT_KIND, PLOUGH_TIME, REPLOUGH_AFTER, RESEED_COST, RESOURCE_LABEL,
  SHOES, SOW_TIME, TREE_SPECIES, VILLAGER, WEAPONS, YIELD, LEATHER_SHOES, craftRecipe,
  type AnimalKind, type DepositType, type ResourceKind, type Shoes, type Weapon,
} from './catalog';
import { craftTaskRecipe } from './research';
import { describeArcher, sendToRange, tickArcher } from './archery';
import { describeBuilder, sendToSite, tickBuilder } from './construction';
import { practise, skillFactor } from './unit/skills';
import { depositKind } from './resources';
import { PastureWork, TAME } from './pasture';
import { farmSpot, furrowKey, furrowNeeds, type FarmPhase } from './farming';
import type { Animal, Task, Villager, WorkNeed } from './unit';
import { WORK_TEMPO, type StrikeKind, type World } from './world';

/** Abstand der Sammelplätze von der Feldmitte, in Tiles. */
const GATHER_SPREAD = 0.4;
/** So nah kommt er zurück an ein leer gewordenes Feld, bevor er weitersucht. */
const RETURN_REACH = 1;
/** Abstand zur Gebäudekante, ab dem er abliefern kann. */
const DELIVER_REACH = 0.6;
/** So nah kommt er bei einem Gang (Aufgabe move) an sein Ziel - auch für route. */
const MOVE_REACH = 0.05;
/** So lange (Sekunden) bleibt ein Dorfbewohner beim Abladen im Gebäude. */
const INSIDE_TIME = 1.2;
const WORKER_BUSY = 'Arbeitet in einer Werkstatt - dort erst entlassen';
/** Grund, wenn es zu Fuß keinen Weg zum Ziel gibt (walk). */
export const UNREACHABLE = 'Dort kommt er nicht hin';
/** Grund, wenn ein Bauer säen müsste und das Holz fehlt - er jätet derweil (tickFarmer). */
const NO_SEED_WOOD = 'Zu wenig Holz, um neu zu säen';
/**
 * Arbeitszeit, zu der die Hand im Clip throw den Wurf loslässt (seine
 * Takt-Marke): Clip-Zeit = (Arbeitszeit * WORK_TEMPO - Verschiebung) * Rate.
 */
// VERIFIED: Galerie 2026-10-10 - im Clip throw ist der Arm bei 0,5 s vorn (Loslassen).
// Vorwärts auf die nächste solche Stelle gerückt, nicht zurückgesetzt:
// sonst spielte das Bild zwischen zwei Ticks (prevWorkTime) den Clip rückwärts.
function throwRelease(workTime: number): number {
  // Erst beim Aufruf: world.ts (WORK_TEMPO) lädt dieses Modul selbst.
  const clip = CLIPS.find((c) => c.pose === POSE.throw);
  if (!clip) return workTime;
  const at = ((clip.strike[0] ?? 0) / clip.phaseRate + clip.phaseShift) / WORK_TEMPO;
  const loop = clip.duration / clip.phaseRate / WORK_TEMPO;
  return at + Math.ceil((workTime - at) / loop - 1e-6) * loop;
}

/**
 * Ist der Speer im Clip throw gerade geworfen (Phase der Pose wie im Bild:
 * Arbeitszeit * WORK_TEMPO)? Vom Loslassen bis kurz vor Ende der Schleife ist
 * die Hand leer.
 * ponytail: der Speer fliegt nicht sichtbar und ist zum nächsten Wurf wieder
 * in der Hand; einen fliegenden Speer zeichnen, wenn man den Wurf deutlicher sehen soll.
 */
export function spearThrown(phase: number): boolean {
  const clip = CLIPS.find((c) => c.pose === POSE.throw);
  if (!clip || clip.strike.length === 0) return false;
  const loop = clip.duration;
  const t = (((phase - clip.phaseShift) * clip.phaseRate) % loop + loop) % loop;
  return t >= clip.strike[0] && t < loop - 0.25;
}

const key = (x: number, y: number) => `${x},${y}`;

/** Wegpunkte zum Ziel: keine, wenn die Sichtlinie frei ist, sonst die Suche - null, wenn es keinen Weg gibt. */
function searchPath(fx: number, fy: number, tx: number, ty: number, reach: number, blocked: Blocked) {
  return lineOfSight(fx, fy, tx, ty, (x, y) => blocked(x, y) && !(x === Math.floor(tx) && y === Math.floor(ty)))
    ? []
    : findPath(fx, fy, tx, ty, reach, blocked);
}

/** Fester Winkel 0..2π je Tile - gleiche Welt, gleiche Werte. */
function tileAngle(x: number, y: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967296) * Math.PI * 2;
}

/** Der Clip, der eine Pose der Dorfbewohner spielt und Takt-Marken hat - oder keiner. */
function clipOfPose(pose: number): Clip | undefined {
  return CLIPS.find((c) => c.pose === pose && c.strike.length > 0);
}

/**
 * Wie viele Takt-Marken des Clips zwischen zwei Phasen (der Pose) liegen - im
 * halboffenen Bereich (von, bis], über das Ende der Schleife hinweg.
 */
export function strikesBetween(clip: Clip, fromPhase: number, toPhase: number): number {
  const loop = (clip.frames - 1) / clip.fps;
  const a = (fromPhase - clip.phaseShift) * clip.phaseRate;
  const b = (toPhase - clip.phaseShift) * clip.phaseRate;
  let count = 0;
  for (const t of clip.strike) count += Math.floor((b - t) / loop) - Math.floor((a - t) / loop);
  return count;
}

/** Die Werkstatt, in der er arbeitet (Bognerei, Fischerhütte, Försterhütte) - oder keine. */
export function workplace(task: Task): string | undefined {
  return task.kind === 'craft' || task.kind === 'fish' || task.kind === 'plant' ? task.building : undefined;
}

/** Schritte des Fischers, in denen das Boot auf dem Wasser ist bzw. gezogen wird. */
export const AFLOAT: ReadonlySet<string> = new Set(['row', 'empty', 'return']);
export const DRAGGING: ReadonlySet<string> = new Set(['launch', 'land']);

/** Sitzt er im Boot oder zieht es? Dann weicht er niemandem aus. */
const inBoat = (v: Villager) => v.task.kind === 'fish' && (AFLOAT.has(v.task.step) || DRAGGING.has(v.task.step));

/**
 * Das beste Paar Schuhe im Regal von `shop`, das schneller ist als seine
 * eigenen (B31) - null, wenn keins. So nimmt er lieber Lederschuhe und tauscht
 * Holzschuhe gegen Lederschuhe, aber nie gleich gegen gleich.
 */
export function betterPair(v: Villager, shop: Building): Shoes | null {
  const sorts = shop.goods.shoes;
  if (!sorts) return null;
  let best: Shoes | null = null;
  let speed = v.inventory.shoes ? SHOES[v.inventory.shoes].speed : 1;
  for (const s of Object.keys(SHOES) as Shoes[]) {
    if ((sorts[SHOES[s].kind] ?? 0) >= 1 && SHOES[s].speed > speed) {
      best = s;
      speed = SHOES[s].speed;
    }
  }
  return best;
}

export class VillagerWork {
  /**
   * Was ein Tile vom Gelände her versperrt, gemerkt: 0 frei, 1 Wasser,
   * 2 Baum/Fels (frei, sobald abgebaut oder gefällt). Gebäude kommen dazu
   * (siehe blockedAt).
   */
  private terrainBlock = new Map<string, number>();
  /** Wer im letzten Tick zu sehen war und Platz braucht - für steer() und separate(). */
  private present: Villager[] = [];
  /**
   * Bauern je Furche (furrowKey), einmal je Tick gebaut (beginTick) - sonst
   * ginge jeder Bauer in jedem Tick alle Dorfbewohner durch. Wechselt einer
   * die Furche, kommt er dazu; wer sie verlassen hat, steht noch drin und
   * wird beim Nachsehen übergangen (farmerOn).
   */
  private farmRows = new Map<string, Villager[]>();
  /**
   * Sorte der Ladung je Dorfbewohner, z. B. "Eiche" oder "Weizen" (wie
   * BuildingBase.goods) - beim Abliefern kommt sie so ins Lager. Mischt er in
   * einer Ladung Sorten (Baum leer, der nächste eine andere Art), zählt die erste.
   * ponytail: hier statt als Feld am Villager, weil unit/ gerade anderswo umgebaut
   * wird; nach Villager.carryKind ziehen, wenn unit/Villager.ts ohnehin angefasst wird.
   */
  private carryKinds = new WeakMap<Villager, string>();
  /**
   * Barfüßige auf dem Umweg zur Schusterei (B31, lookForShoes): Dorfbewohner →
   * Anker der Schusterei. Nicht gespeichert - nach dem Laden sucht er neu.
   */
  private shoeTrips = new WeakMap<Villager, string>();
  /** Schustereien mit mindestens einem Paar Schuhe - einmal je Tick gesucht (beginTick). */
  private shoeShops: Building[] = [];
  /** Hirten der Weiden (B27, pasture.ts) - mit den Schritten von hier (walk, deliverTo, ...). */
  private readonly pastures: PastureWork;

  constructor(private world: World) {
    this.pastures = new PastureWork(world, this);
  }

  /** Sorte seiner Ladung - undefined ohne Ladung. */
  carryKind(v: Villager): string | undefined {
    return v.carrying > 0 ? this.carryKinds.get(v) : undefined;
  }

  /** Setzt die Sorte seiner Ladung - beim Laden eines Spielstands. */
  setCarryKind(v: Villager, kind: string) {
    this.carryKinds.set(v, kind);
  }

  /**
   * Beginnt eine Ladung `resource` der Sorte `kind()`, wenn er nichts davon
   * trägt. Trägt er anderes, lässt er es fallen - wie in AoE2.
   */
  startLoad(v: Villager, resource: ResourceKind, kind: () => string) {
    if (v.carryType === resource && v.carrying > 0) return;
    v.carrying = 0;
    v.carryType = resource;
    this.carryKinds.set(v, kind());
  }

  /**
   * Befehl an ausgewählte Dorfbewohner für das Feld (x, y), wie ein Rechtsklick
   * in AoE2: Lager -> abliefern, Vorkommen -> sammeln, sonst hingehen - zum
   * genauen Punkt `point`, falls angegeben, sonst zur Mitte des Felds.
   */
  command(ids: ReadonlySet<number>, x: number, y: number, point?: Point): string | null {
    const selected = this.controllable(ids);
    if (selected.length === 0) return ids.size > 0 ? WORKER_BUSY : null;
    // Wer gerade im Gebäude ablädt, kommt für den neuen Befehl sofort heraus;
    // Lager ohne Weg (unreachable) prüft er neu.
    for (const v of selected) {
      v.inside = 0;
      v.unreachable.clear();
      this.shoeTrips.delete(v);
    }

    const target = this.world.at(x, y);
    // Baustelle (B26): bis zu vier bauen dort (construction.ts).
    if (target && !target.built) return sendToSite(this.world, this, selected, target);
    // Schießplatz (B24): bis zu sechs üben dort (archery.ts).
    if (target instanceof ArcheryRange) return sendToRange(this.world, selected, target);
    if (target?.isWorkshop()) {
      // Wie in Stronghold arbeitet in einer Werkstatt genau einer.
      const anchor = target.anchor;
      const taken = this.world.villagers.some((v) => !ids.has(v.id) && workplace(v.task) === anchor);
      if (taken) return `In der ${target.label} arbeitet schon jemand`;
      const [worker, ...rest] = selected;
      worker.assign(target.type === 'fisher_hut' ? { kind: 'fish', building: anchor, step: 'enter', progress: 0, fish: 0 }
        : target.type === 'forester' ? { kind: 'plant', building: anchor, step: 'enter', progress: 0 }
        : { kind: 'craft', building: anchor, step: 'enter', progress: 0 });
      return rest.length > 0 ? `In der ${target.label} arbeitet nur einer` : null;
    }
    // Weide (B27): sie hüten dort die Tiere (pasture.ts).
    if (target?.type === 'pasture') {
      this.pastures.assign(selected, target);
      return null;
    }
    if (target?.isFarm()) {
      // Je Furche ein Bauer, je Feldstück höchstens FARMERS_PER_FIELD - ist
      // es voll, geht es aufs nächste Feldstück mit Platz.
      for (const v of selected) v.task = { kind: 'idle' };
      const busy = new Set(this.world.villagers.flatMap((v) => (v.task.kind === 'farm' ? [`${v.task.building}#${v.task.row}`] : [])));
      for (const v of selected) {
        const spot = this.world.farming.freeFurrow(target, busy);
        if (!spot) {
          v.problem = 'Auf allen Feldern in der Nähe arbeitet schon jemand in jeder Furche';
          continue;
        }
        busy.add(`${spot.building}#${spot.row}`);
        v.task = { kind: 'farm', building: spot.building, row: spot.row, delivering: false };
        v.problem = null;
      }
      return null;
    }
    if (target) {
      const def = target.definition;
      if (def.storedResources.length === 0) return `${def.label} ist kein Lager`;
      const anchor = key(target.x, target.y);
      for (const v of selected) {
        v.task = { kind: 'deliver', building: anchor };
        v.problem = null;
      }
      return null;
    }

    const found = this.world.remainingAt(x, y);
    if (found.type && found.amount > 0) {
      // Die Ausgewählten zählen nicht mit - sie werden gerade neu verteilt.
      for (const v of selected) v.task = { kind: 'idle' };
      const occupancy = this.occupancy();
      const full = (k: string) => (occupancy.get(k) ?? 0) >= MAX_GATHERERS;
      for (const v of selected) {
        // Ist das Ziel voll, das nächste Vorkommen derselben Art mit Platz.
        const spot = !full(key(x, y)) ? { x, y } : this.nextDeposit(found.type, x, y, occupancy);
        if (!spot) {
          v.problem = 'Alle Vorkommen in der Nähe sind voll besetzt';
          continue;
        }
        v.task = { kind: 'gather', type: found.type, x: spot.x, y: spot.y, delivering: false };
        v.problem = null;
        const k = key(spot.x, spot.y);
        occupancy.set(k, (occupancy.get(k) ?? 0) + 1);
      }
      return null;
    }

    // So nah wie möglich an den Punkt, jeder auf einen eigenen Platz - auch
    // nicht dorthin, wo schon einer steht oder hingeht. Im Wasser: ans Ufer.
    // Der Nächste bekommt den Platz am Punkt, die anderen stellen sich darum.
    const at = point ?? { x: x + 0.5, y: y + 0.5 };
    const taken: Point[] = this.world.villagers
      .filter((v) => !ids.has(v.id) && v.isVisible)
      .map((v) => (v.task.kind === 'move' ? { x: v.task.x, y: v.task.y } : { x: v.x, y: v.y }));
    const blocked = (tx: number, ty: number) => this.blockedAt(tx, ty);
    let placed = 0;
    for (const v of [...selected].sort((a, b) => a.distanceTo(at.x, at.y) - b.distanceTo(at.x, at.y))) {
      const spot = freeSpot(at.x, at.y, taken, blocked);
      if (!spot) {
        v.task = { kind: 'idle' };
        v.problem = 'Dort ist kein Platz';
        continue;
      }
      taken.push(spot);
      v.task = { kind: 'move', x: spot.x, y: spot.y };
      v.problem = null;
      placed++;
    }
    if (placed > 0) return null;
    const tile = this.world.terrain.getTile(x, y);
    return tile.tileType === 'water' || tile.tileType === 'deep_water' ? 'Dorfbewohner können nicht schwimmen' : 'Dort ist kein Platz';
  }

  /** Vor den Ticks aller Dorfbewohner: wer auf welcher Furche arbeitet. */
  beginTick() {
    this.shoeShops = [];
    for (const b of this.world.allBuildings()) if (b.goods.shoes && b.stored('shoes') >= 1) this.shoeShops.push(b);
    this.farmRows.clear();
    for (const v of this.world.villagers) {
      if (v.task.kind === 'farm') this.addFarmer(v, `${v.task.building}#${v.task.row}`);
    }
  }

  private addFarmer(v: Villager, furrow: string) {
    const list = this.farmRows.get(furrow);
    if (list) list.push(v);
    else this.farmRows.set(furrow, [v]);
  }

  /** Arbeitet außer `self` jemand auf dieser Furche (furrowKey)? */
  private farmerOn(furrow: string, self: Villager): boolean {
    return this.farmRows.get(furrow)?.some((u) => u !== self && u.task.kind === 'farm'
      && `${u.task.building}#${u.task.row}` === furrow) ?? false;
  }

  /**
   * Nach den Ticks aller Dorfbewohner: wer sich zu nah ist, wird
   * auseinandergeschoben (crowd.ts) - wer arbeitet, bleibt stehen. Im
   * Gebäude und im Boot zählt keiner mit.
   */
  separate() {
    this.present = this.world.villagers.filter((v) => v.isVisible && !inBoat(v));
    const fixed = this.present.map((v) => v.pose !== POSE.stand && v.pose !== POSE.walk);
    if (separate(this.present, fixed, (x, y) => this.blockedAt(x, y))) this.world.markDirty();
  }


  /** Kann man Tile (x, y) nicht betreten? Wasser, Gebäude, stehende Bäume, Felsen. */
  blockedAt(x: number, y: number): boolean {
    const anchor = this.world.occupied.get(key(x, y));
    // Über Felder und Weiden geht man hinweg - Bauern und Hirten arbeiten ja darauf; ebenso über den Schießplatz (B24).
    if (anchor !== undefined) {
      const b = this.world.building(anchor);
      return !(b?.isOpenGround() || b instanceof ArcheryRange);
    }
    const t = this.terrainAt(x, y);
    if (t === 2) return !this.world.deposits.isExhausted(x, y) && !this.world.deposits.isFelled(x, y);
    return t === 1;
  }

  /** Wo das Boot nicht hinkommt: alles außer Wasser. Über Reusen fährt es hinweg. */
  private dryAt(x: number, y: number): boolean {
    return this.terrainAt(x, y) !== 1;
  }

  /** Gelände eines Tiles, gemerkt (terrainBlock): 0 frei, 1 Wasser, 2 Baum/Fels - auch gepflanzt. */
  private terrainAt(x: number, y: number): number {
    const k = key(x, y);
    let t = this.terrainBlock.get(k);
    if (t === undefined) {
      const tileType = this.world.terrain.resourceAt(x, y).tileType;
      const type = this.world.deposits.base(x, y).type;
      t = tileType === 'water' || tileType === 'deep_water' ? 1
        : type === 'wood' || type === 'stone' || type === 'gold' ? 2 : 0;
      if (this.terrainBlock.size > 200_000) this.terrainBlock.clear();
      this.terrainBlock.set(k, t);
    }
    return t;
  }

  /** Ein Baum wurde gepflanzt: das gemerkte Gelände des Tiles gilt nicht mehr. */
  forgetTile(x: number, y: number) {
    this.terrainBlock.delete(key(x, y));
  }

  /**
   * Der Weg, den ein Dorfbewohner von (fx, fy) zum Punkt (tx, ty) ginge -
   * dieselbe Suche wie beim Gehen (waypoint): Start, Wegpunkte, Ziel. Ohne
   * Weg nur der Start - dorthin geht er nicht (walk). Für die Linie zum Sammelpunkt.
   */
  route(fx: number, fy: number, tx: number, ty: number): Point[] {
    const path = searchPath(fx, fy, tx, ty, MOVE_REACH, (x, y) => this.blockedAt(x, y));
    return path ? [{ x: fx, y: fy }, ...path, { x: tx, y: ty }] : [{ x: fx, y: fy }];
  }

  /**
   * Nächster Punkt, den er ansteuert: der erste offene Wegpunkt zum Ziel -
   * gesucht, wenn das Ziel neu ist oder der Weg inzwischen versperrt ist.
   * Gibt es zu Fuß keinen Weg, null: geradeaus ginge er durchs Wasser.
   * VERIFIED: tests/water-path.test.mjs - mit dem alten Geradeaus-Weg stand ein
   * Holzfäller 75 Ticks im Fluss, jetzt keinen.
   * Das Boot fährt dann geradeaus (siehe shore).
   * ponytail: "kein Weg" gilt, bis sich das Ziel ändert; neu suchen (etwa
   * nach Zeit), wenn ein gefällter Baum oder abgerissenes Gebäude den Weg
   * öffnen soll, ohne dass der Spieler neu befiehlt.
   */
  private waypoint(v: Villager, tx: number, ty: number, reach: number, afloat: boolean): { x: number; y: number } | null {
    const blocked = afloat ? (x: number, y: number) => this.dryAt(x, y) : (x: number, y: number) => this.blockedAt(x, y);
    // Neu suchen: neues Ziel, oder die Strecke zum nächsten Wegpunkt ist
    // inzwischen versperrt (z. B. ein neues Gebäude).
    const stale = !v.pathTarget || Math.hypot(v.pathTarget.x - tx, v.pathTarget.y - ty) > 0.3
      || (v.path?.[0] && !lineOfSight(v.x, v.y, v.path[0].x, v.path[0].y,
          (x, y) => blocked(x, y) && !(x === Math.floor(v.x) && y === Math.floor(v.y))));
    if (stale) {
      v.pathTarget = { x: tx, y: ty };
      // Kein Weg: path bleibt null - so wird bis zum nächsten Ziel nicht neu gesucht.
      v.path = searchPath(v.x, v.y, tx, ty, reach, blocked) ?? (afloat ? [] : null);
    }
    if (!v.path) return null;
    while (v.path.length > 0 && Math.hypot(v.path[0].x - v.x, v.path[0].y - v.y) < 0.12) v.path.shift();
    return v.path.length > 0 ? v.path[0] : { x: tx, y: ty };
  }

  /** Schritt zum Ziel; `afloat`: im Boot, nur über Wasser - er steht dabei im Boot. Auch für archery.ts. */
  walk(v: Villager, tx: number, ty: number, reach: number, dt: number, afloat = false): boolean {
    const d = Math.hypot(tx - v.x, ty - v.y);
    // Mit etwas Spielraum - sonst bliebe nach dem letzten Schritt ein
    // Rundungsrest, und er käme nie an. Steht dort schon einer, ist er
    // nah genug - sonst schöben sich beide endlos hin und her.
    if (d <= reach + 1e-4 || (!afloat && d <= reach + CROWDED_ARRIVAL && occupied(v, tx, ty, this.present))) {
      v.path = null;
      v.pathTarget = null;
      return true;
    }
    // Um Hindernisse herum: zum nächsten Wegpunkt, zuletzt aufs Ziel zu.
    const next = this.waypoint(v, tx, ty, reach, afloat);
    if (!next) {
      v.problem = UNREACHABLE;
      return false;
    }
    if (v.problem === UNREACHABLE) v.problem = null;
    const final = next.x === tx && next.y === ty;
    const dx = next.x - v.x;
    const dy = next.y - v.y;
    const dn = Math.hypot(dx, dy) || 1e-6;
    const step = Math.min(v.speed * dt, final ? d - reach : dn);
    let [ux, uy] = [dx / dn, dy / dn];
    // Anderen ausweichen (crowd.ts) - aber nicht in einen Baum oder ins Wasser.
    if (!afloat) {
      const [sx, sy] = steer(v, ux, uy, this.present);
      if (!this.blockedAt(Math.floor(v.x + sx * step), Math.floor(v.y + sy * step))) [ux, uy] = [sx, sy];
    }
    v.x += ux * step;
    v.y += uy * step;
    v.heading = Math.atan2(uy, ux);
    v.stride += step;
    v.pose = afloat ? POSE.stand : POSE.walk;
    this.world.markDirty();
    // Angekommen ist er erst im nächsten Tick: sonst ginge ein kurzer Weg im
    // selben Tick in die Arbeitspose über, und er rutschte statt zu gehen.
    return false;
  }

  /**
   * Nächstes Lager, das `type` annimmt und seine Ladung noch fasst (eine volle
   * Waffenkammer nicht, siehe BuildingBase.room; VERIFIED: tests/storage-stock.test.mjs,
   * B14: die Kammern füllen sich eine nach der anderen) - nach Luftlinie, übersprungen, wohin
   * er schon keinen Weg fand (v.unreachable, siehe enter). Ist keins
   * erreichbar, das nächste: dort bleibt er stehen und sagt warum.
   * VERIFIED: tests/water-path.test.mjs - liegt das nächste Lager jenseits des
   * Flusses, bringt er das Holz ins weitere auf seiner Seite.
   */
  nearestDropSite(v: Villager, type: ResourceKind): Building | undefined {
    let best: Building | undefined;
    let bestDistance = Infinity;
    let any: Building | undefined;
    let anyDistance = Infinity;
    for (const b of this.world.allBuildings()) {
      if (!b.stores(type) || b.room(type) < v.carrying) continue;
      const d = Math.hypot(b.x + 0.5 - v.x, b.y + 0.5 - v.y);
      if (d < anyDistance) {
        anyDistance = d;
        any = b;
      }
      if (d < bestDistance && !v.unreachable.has(b.anchor)) {
        bestDistance = d;
        best = b;
      }
    }
    return best ?? any;
  }

  /** Läuft zum Lager; true, sobald die Ladung abgegeben ist. */
  deliverTo(v: Villager, building: Building, dt: number): boolean {
    return this.enter(v, building, dt, () => {
      if (v.carryType && v.carrying > 0) {
        // Es bleibt in diesem Lager (passt es nicht, im nächsten - World.addStock).
        this.world.addStock(v.carryType, v.carrying, this.carryKinds.get(v), building);
        this.world.onEvent?.({ kind: 'deliver', x: v.x, y: v.y });
      }
      v.carrying = 0;
      v.carryType = null;
      this.world.markDirty();
    });
  }

  /**
   * Läuft zum Gebäude und geht durch die Tür hinein; true, sobald er wieder
   * herauskommt. `arrive` läuft, wenn er an der Tür ankommt.
   */
  private enter(v: Villager, building: Building, dt: number, arrive?: () => void): boolean {
    // Im Gebäude: kurz warten, dann kommt er ohne Last wieder heraus.
    if (v.inside > 0) {
      v.inside -= dt;
      if (v.inside > 0) return false;
      v.inside = 0;
      return true;
    }
    // Zur Tür (im Modell markiert), sonst bis an die Kante des Modells bzw.
    // der belegten Felder - was größer ist.
    const def = building.definition;
    const entry = modelEntry(building.model,
        building.x, building.y, def.size, BUILDING_HEADING);
    const reach = entry ? 0.08 : Math.max(def.footprint, def.size) / 2 + DELIVER_REACH;
    const [tx, ty] = entry ? [entry.x, entry.y] : [building.x + 0.5, building.y + 0.5];
    if (!this.walk(v, tx, ty, reach, dt)) {
      // Kein Weg dorthin: beim nächsten Tick nimmt nearestDropSite ein anderes Lager.
      if (v.problem === UNREACHABLE) v.unreachable.add(building.anchor);
      return false;
    }
    arrive?.();
    // Durch die Tür hinein - einen Moment lang ist er weg.
    if (entry) {
      v.inside = INSIDE_TIME;
      v.heading = Math.atan2(building.y + 0.5 - v.y, building.x + 0.5 - v.x);
      return false;
    }
    return true;
  }

  /** Kleinster Platz am Vorkommen des Auftrags, den kein anderer Sammler hat. */
  private freeSlot(v: Villager, task: Extract<Task, { kind: 'gather' }>): number {
    const used = new Set<number>();
    for (const u of this.world.villagers) {
      const t = u.task;
      if (u !== v && t.kind === 'gather' && t.x === task.x && t.y === task.y && t.slot !== undefined) used.add(t.slot);
    }
    let slot = 0;
    while (used.has(slot)) slot++;
    return slot;
  }

  /** Wie viele Dorfbewohner je Feld sammeln - Schlüssel "x,y". */
  private occupancy(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const v of this.world.villagers) {
      if (v.task.kind !== 'gather') continue;
      const k = key(v.task.x, v.task.y);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return counts;
  }

  /**
   * Nächstes nicht leeres Feld derselben Art um (x, y), auf dem noch Platz
   * ist (höchstens MAX_GATHERERS).
   */
  nextDeposit(
      type: DepositType, x: number, y: number,
      occupancy: Map<string, number> = this.occupancy(),
  ): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestDistance = Infinity;
    const r = VILLAGER.searchRadius;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = dx * dx + dy * dy;
        if (d >= bestDistance || d > r * r) continue;
        if ((occupancy.get(key(x + dx, y + dy)) ?? 0) >= MAX_GATHERERS) continue;
        const found = this.world.remainingAt(x + dx, y + dy);
        if (found.type === type && found.amount > 0) {
          best = { x: x + dx, y: y + dy };
          bestDistance = d;
        }
      }
    }
    return best;
  }

  /**
   * Die nächste Furche auf dem Feldstück, in der es in dieser Phase Arbeit
   * gibt und kein anderer Bauer arbeitet - die dem Bauern nächste.
   */
  private nextFurrow(v: Villager, farm: Farm, phase: FarmPhase): { building: Farm; row: number; distance: number } | undefined {
    // Solange es wächst, hat keine Furche Arbeit (furrowNeeds).
    if (phase === 'grow' || phase === 'wood') return undefined;
    let best: { building: Farm; row: number; distance: number } | undefined;
    for (const { building, row, f } of this.world.farming.furrows(farm)) {
      if (!furrowNeeds(f, phase) || this.farmerOn(furrowKey(building, row), v)) continue;
      const spot = this.farmSpot(building, row, v);
      const distance = Math.hypot(spot.x - v.x, spot.y - v.y);
      if (!best || distance < best.distance) best = { building, row, distance };
    }
    return best;
  }

  /** Wo der Bauer in seiner Furche steht (farming.ts) - beim Jäten je Bauer versetzt. */
  private farmSpot(building: Farm, row: number, v: Villager, wander = false) {
    return farmSpot(building, row, Math.abs(((this.world.now / 40 + v.id * 0.37) % 2) - 1), wander);
  }

  /**
   * Arbeitstakt am Platz: Zeit weiterzählen und bei jedem Schlag bzw. Griff
   * ein Ereignis melden - im Takt der Animation (siehe Shader).
   */
  swing(v: Villager, dt: number, resource: StrikeKind, picking: boolean) {
    const before = v.workTime;
    v.workTime += dt;
    // Der Ton kommt im Takt des Clips, der die Pose spielt: zu seinen
    // Takt-Marken (Custom Property "strike" in Blender). Die Phase der Pose
    // ist Arbeitszeit * WORK_TEMPO, die Clip-Zeit (Phase - shift) * rate - wie
    // im Shader.
    const clip = clipOfPose(v.pose);
    if (clip) {
      if (strikesBetween(clip, before * WORK_TEMPO, v.workTime * WORK_TEMPO) > 0) {
        this.world.onEvent?.({ kind: 'strike', resource, x: v.x, y: v.y });
      }
      return;
    }
    // Ohne Clip die Formel: der Arm schlägt zu, wenn sin(Phase) sein Minimum
    // durchläuft. Pflücken ist im Shader langsamer (Phase * 0.6).
    const tempo = picking ? WORK_TEMPO * 0.6 : WORK_TEMPO;
    const strikes = (time: number) => Math.floor((time * tempo - Math.PI * 1.5) / (Math.PI * 2));
    if (strikes(v.workTime) > strikes(before)) {
      this.world.onEvent?.({ kind: 'strike', resource, x: v.x, y: v.y });
    }
  }

  /**
   * Bauer: arbeitet mit den anderen auf seinem Feldstück Phase für Phase -
   * erst alles pflügen, dann alles säen, jäten, bis alles reif ist, dann
   * ernten und abliefern; abgeerntet wird alles neu gesät, nach
   * REPLOUGH_AFTER Ernten vorher neu gepflügt. Er nimmt sich jeweils die
   * nächste freie Furche seines Stücks, in der es noch etwas zu tun gibt.
   */
  private tickFarmer(v: Villager, task: Extract<Task, { kind: 'farm' }>, dt: number) {
    const found = this.world.building(task.building);
    if (!found?.isFarm() || !found.furrows[task.row]) {
      v.task = { kind: 'idle' };
      return;
    }
    let building: Farm = found;
    if (task.delivering) {
      const site = this.nearestDropSite(v, 'food');
      if (!site) {
        v.problem = 'Kein Lager für Nahrung - baue eine Mühle';
        return;
      }
      v.problem = null;
      if (this.deliverTo(v, site, dt)) task.delivering = false;
      return;
    }

    let phase = this.world.farmPhase(building);
    // Die Ernte ist vorbei: wer noch etwas trägt, bringt es erst zum Lager.
    if (phase !== 'harvest' && v.carrying > 0 && v.carryType === 'food') {
      task.delivering = true;
      return;
    }
    if (phase === 'done') {
      // Alles abgeerntet: alles wird neu gesät - nach REPLOUGH_AFTER Ernten vorher neu gepflügt.
      const replough = ++building.harvests >= REPLOUGH_AFTER;
      if (replough) building.harvests = 0;
      for (const { row, f } of this.world.farming.furrows(building)) {
        Object.assign(f, { crop: building.plan, sown: 0, growth: 0, food: furrowFood(building.plan, building.tiles, row), paid: false });
        if (replough) f.plough = 0;
      }
      this.world.markDirty();
      phase = this.world.farmPhase(building);
    }
    // In der eigenen Furche nichts mehr zu tun: die nächste mit Arbeit. Beim
    // Ernten geht er immer zum nächsten reifen Getreide, auch in einer fremden
    // Furche - seine eigene behält er nur, solange sie kaum weiter weg ist.
    const ownNeeds = furrowNeeds(building.furrows[task.row], phase);
    if (!ownNeeds || phase === 'harvest') {
      const next = this.nextFurrow(v, building, phase);
      const own = this.farmSpot(building, task.row, v);
      const keep = ownNeeds && (!next || Math.hypot(own.x - v.x, own.y - v.y) <= next.distance + 0.3);
      if (keep) {
        // Er bleibt, wo er ist.
      } else if (next) {
        building = next.building;
        task.building = next.building.anchor;
        task.row = next.row;
        this.addFarmer(v, furrowKey(next.building, next.row));
      } else if (phase === 'harvest' && v.carrying > 0) {
        // Die Ernte ist verteilt - mit dem, was er hat, zum Lager.
        task.delivering = true;
        return;
      }
    }
    const f = building.furrows[task.row];
    let working = furrowNeeds(f, phase);
    // Ohne Holz zum Säen jätet er, statt stillzustehen - Reifes erntet er (Phase).
    let problem: string | null = phase === 'wood' ? NO_SEED_WOOD : null;
    if (working && phase === 'sow' && !f.paid) {
      if (this.world.canPay(RESEED_COST)) {
        this.world.pay(RESEED_COST);
        f.paid = true;
      } else {
        working = false;
        problem = NO_SEED_WOOD;
      }
    }
    v.problem = problem;
    const crop = CROPS[f.crop];
    // Ohne eigene Arbeit (es wächst, oder die übrigen Furchen haben andere)
    // geht er seine Furche ab und jätet.
    const spot = this.farmSpot(building, task.row, v, !working);
    if (!this.walk(v, spot.x, spot.y, 0.05, dt)) return;
    v.heading = Math.atan2(spot.aimY - v.y, spot.aimX - v.x);
    this.world.markDirty();
    if (working && this.world.speedy && phase !== 'harvest') {
      this.finishField(building, phase);
      return;
    }

    // Eine kürzere Furche (über weniger Tiles) ist schneller gepflügt und gesät.
    const length = building.furrowCells(task.row).length / 3;
    // Arbeit mit Übung (B24, skills.ts) - Jäten übt nicht.
    const work = working ? practise(v.skills, 'farming', dt) : 0;
    if (working && phase === 'plough') {
      // Pflügen: mit der Hacke, stehend - eigener Clip und dumpfer Schlag in die Erde.
      v.pose = POSE.hoe;
      this.swing(v, dt, 'soil', false);
      f.plough = Math.min(1, f.plough + work / (PLOUGH_TIME * length));
      return;
    }
    if (!working || phase === 'sow') {
      // Säen und jäten: kniend.
      v.pose = POSE.pick;
      this.swing(v, dt, 'berries', true);
      if (working) f.sown = Math.min(1, f.sown + work / (SOW_TIME * length));
      return;
    }
    // Ernten: Weizen mit der Sense, andere Früchte von Hand.
    v.pose = crop.scythe ? POSE.scythe : POSE.pick;
    this.swing(v, dt, 'berries', true);
    this.startLoad(v, 'food', () => crop.label);
    // Cheat "speedy gonzales": der Korb sofort voll.
    const take = Math.min(this.world.speedy ? Infinity : FARM_RATE * crop.rate * work, f.food, VILLAGER.capacity - v.carrying);
    f.food -= take;
    v.carrying += take;
    if (v.carrying >= VILLAGER.capacity - 1e-6) task.delivering = true;
  }

  /** Cheat "speedy gonzales": Pflügen oder Säen auf dem ganzen Feldstück auf einmal. */
  private finishField(building: Farm, phase: FarmPhase) {
    for (const { f } of this.world.farming.furrows(building)) {
      if (phase === 'plough') f.plough = 1;
      if (phase === 'sow' && f.sown < 1) {
        if (!f.paid && !this.world.canPay(RESEED_COST)) continue;
        if (!f.paid) this.world.pay(RESEED_COST);
        f.paid = true;
        f.sown = 1;
      }
    }
  }

  /**
   * Bogner, Speermacher und Schuster: holt Holz vom nächsten Lager, das Holz annimmt,
   * schnitzt daraus an der Werkbank ein Stück (Rezept der Werkstatt, CRAFTS)
   * und trägt es zur nächsten Waffenkammer - Schuhe in die eigene Werkstatt -,
   * immer wieder, solange Holz im Vorrat ist. Der Schuster macht nach der
   * Gerberei (research.ts) Lederschuhe, wenn genug Leder da ist - sonst
   * Holzschuhe; gewählt wird vor jedem Gang zum Lager (task.leather).
   * VERIFIED: tests/spear.test.mjs - 5 Holz werden ein Speer in der Waffenkammer;
   * tests/shoes.test.mjs - 3 Holz werden ein Paar Holzschuhe in der Schusterei;
   * tests/research.test.mjs - Lederschuhe erst nach der Forschung und nur mit Leder.
   */
  private tickCrafter(v: Villager, task: Extract<Task, { kind: 'craft' }>, dt: number) {
    v.need = null;
    const shop = this.world.building(task.building);
    // Vor dem Gang zum Lager: Leder oder Holz (Schuster, siehe oben).
    if (shop?.type === 'cobbler' && task.step === 'fetch' && v.inside <= 0) {
      task.leather = this.world.research.has('leather_shoes') && this.world.canPay({ leather: LEATHER_SHOES.amount });
    }
    const recipe = shop && craftTaskRecipe(shop.type, task);
    if (!shop?.isWorkshop() || !recipe) {
      // Die Werkstatt ist weg - ein fertiges Stück bringt er trotzdem zu einem Lager dafür.
      const product = Object.values(CRAFTS).some((r) => r.product === v.carryType);
      const armory = v.carryType && product ? this.nearestDropSite(v, v.carryType) : undefined;
      v.task = armory ? { kind: 'deliver', building: armory.anchor } : { kind: 'idle' };
      return;
    }
    if (task.leave && task.step !== 'deliver') {
      // Holz bzw. Leder auf der Werkbank kommt zurück in den Vorrat.
      if (task.step === 'carve' && v.carryType !== recipe.material) this.world.addStock(recipe.material, recipe.amount);
      task.step = 'fetch';
      if (this.deliverTo(v, shop, dt)) v.assign({ kind: 'idle' });
      return;
    }
    if (task.step === 'enter') {
      if (this.enter(v, shop, dt)) task.step = 'fetch';
      return;
    }
    if (task.step === 'deliver') {
      // Lagert die Werkstatt ihre Ware selbst (Schuhe), ins eigene Regal. Sonst
      // zur nächsten Waffenkammer, die noch Platz hat - so füllen sie sich eine
      // nach der anderen. Alle voll: er wartet mit dem Bogen, bis Platz ist.
      const armory = shop.stores(recipe.product) ? shop : this.nearestDropSite(v, recipe.product);
      if (!armory) {
        v.problem = this.world.weaponCapacity() > 0
          ? 'Alle Waffenkammern sind voll - baue noch eine'
          : `Keine Waffenkammer für ${recipe.product === 'bows' ? 'den Bogen' : 'den Speer'} - baue eine`;
        this.sitDown(v, shop, dt, 'armory');
        return;
      }
      v.problem = null;
      if (this.deliverTo(v, armory, dt)) task.step = 'fetch';
      return;
    }
    if (task.step === 'fetch') {
      const material = recipe.material;
      const store = this.nearestDropSite(v, material);
      if (!store) {
        v.problem = material === 'wood' ? 'Kein Lager für Holz - baue ein Holzlager' : `Kein Lager für ${RESOURCE_LABEL[material]} - baue ein Dorfzentrum`;
        this.sitDown(v, shop, dt, 'wood');
        return;
      }
      // Erst losgehen, wenn es genug gibt - sonst wartet er an der Werkbank.
      if (v.inside <= 0 && !this.world.canPay({ [material]: recipe.amount })) {
        v.problem = `Zu wenig ${RESOURCE_LABEL[material]} im Vorrat (${recipe.amount} je ${recipe.unit})`;
        this.sitDown(v, shop, dt, 'wood');
        return;
      }
      v.problem = null;
      // Am Lager: was er noch trug, liefert er ab, und nimmt Holz bzw. Leder mit.
      if (!this.deliverTo(v, store, dt)) return;
      if (!this.world.canPay({ [material]: recipe.amount })) return;
      this.world.pay({ [material]: recipe.amount }, 1, store);
      // ponytail: das Holz aus dem Lager kommt ohne Sorte; Sorte mitnehmen, wenn Waffen nach Holzart verschieden werden.
      v.pickUp(material, recipe.amount);
      this.carryKinds.set(v, RESOURCE_LABEL[material]);
      task.step = 'carve';
      return;
    }
    const def = shop.definition;
    const spot = modelWorkSpot(shop.model, shop.x, shop.y, def.size, BUILDING_HEADING)
      ?? { x: shop.x + 0.5, y: shop.y + 1.1, aimX: shop.x + 0.5, aimY: shop.y + 1.5 };
    if (!this.walk(v, spot.x, spot.y, 0.05, dt)) return;
    // Holz bzw. Leder kommt auf die Werkbank.
    if (v.carryType === recipe.material) v.unload();
    v.heading = Math.atan2(spot.aimY - v.y, spot.aimX - v.x);
    v.pose = POSE.carve;
    this.swing(v, dt, 'berries', true);
    task.progress += practise(v.skills, 'crafting', dt) / recipe.craftTime;
    if (task.progress >= 1) {
      task.progress = 0;
      v.pickUp(recipe.product, 1);
      this.carryKinds.set(v, recipe.kind ?? RESOURCE_LABEL[recipe.product]);
      task.step = 'deliver';
    }
    this.world.markDirty();
  }

  /**
   * Fischer: ist eine Reuse in Reichweite der Hütte voll, holt er das Boot,
   * zieht es ins Wasser, rudert hin, leert sie und bringt den Fang übers
   * Wasser und an Land zum Netz der Hütte. Sonst angelt er am Ufer.
   */
  private tickFisher(v: Villager, task: Extract<Task, { kind: 'fish' }>, dt: number) {
    const hut = this.world.building(task.building);
    if (!hut) {
      v.task = { kind: 'idle' };
      return;
    }
    const spot = modelWorkSpot(hut.model, hut.x, hut.y, hut.definition.size, BUILDING_HEADING)
      ?? { x: hut.x + 0.5, y: hut.y + 1.1, aimX: hut.x + 0.5, aimY: hut.y + 0.5, boat: undefined };
    const boat = spot.boat ?? { x: hut.x + 0.5, y: hut.y + 1.1 };
    const trap = task.trap ? this.world.building(task.trap) : undefined;
    const shore = task.shore;
    v.problem = null;
    v.need = null;
    if (task.leave && !AFLOAT.has(task.step) && !DRAGGING.has(task.step)) {
      // Den Fang legt er noch ins Netz.
      this.world.addStock('food', task.fish, FISH_KIND, hut);
      task.fish = 0;
      if (this.deliverTo(v, hut, dt)) v.assign({ kind: 'idle' });
      return;
    }
    if (task.step === 'enter') {
      if (this.enter(v, hut, dt)) task.step = 'choose';
      return;
    }
    if (task.step === 'choose' || !shore) {
      const full = this.fullTrap(hut, v);
      const place = this.shore(hut, full);
      if (!place) {
        v.problem = 'Kein Ufer in der Nähe der Fischerhütte';
        v.need = 'water';
        return;
      }
      Object.assign(task, { step: full ? 'boat' : 'shore', trap: full?.anchor, shore: place, progress: 0 });
      return;
    }
    switch (task.step) {
      case 'shore':
      case 'angle':
        // Ist inzwischen eine Reuse voll, lässt er die Angel und holt das Boot.
        if (this.fullTrap(hut, v)) {
          task.step = 'choose';
          return;
        }
        if (!this.walk(v, shore.x, shore.y, 0.05, dt)) return;
        task.step = 'angle';
        v.heading = Math.atan2(shore.wy - v.y, shore.wx - v.x);
        task.progress += dt / FISHING.rodTime;
        if (task.progress >= 1) Object.assign(task, { step: 'net', progress: 0, fish: FISHING.rodFood });
        this.world.markDirty();
        return;
      case 'boat':
        if (this.walk(v, boat.x, boat.y, 0.05, dt)) task.step = 'launch';
        return;
      case 'launch':
        // Er zieht das Boot hinter sich her bis ins Wasser (render.ts).
        if (this.walk(v, shore.wx, shore.wy, 0.05, dt)) task.step = 'row';
        return;
      case 'row':
        if (!trap) task.step = 'return';
        else if (this.walk(v, trap.x + 0.5, trap.y + 0.5, 0.35, dt, true)) task.step = 'empty';
        return;
      case 'empty':
        if (!(trap instanceof FishTrap)) {
          task.step = 'return';
          return;
        }
        v.heading = Math.atan2(trap.y + 0.5 - v.y, trap.x + 0.5 - v.x);
        task.progress += dt / FISHING.emptyTime;
        if (task.progress < 1) return;
        if (trap.isFull) {
          trap.fill = 0;
          task.fish = FISHING.trapFood;
        }
        Object.assign(task, { step: 'return', progress: 0 });
        this.world.markDirty();
        return;
      case 'return':
        if (this.walk(v, shore.wx, shore.wy, 0.05, dt, true)) task.step = 'land';
        return;
      case 'land':
        if (this.walk(v, boat.x, boat.y, 0.05, dt)) task.step = task.fish > 0 ? 'net' : 'choose';
        return;
      case 'net':
        // Den Fisch ins Netz an der Hütte - das ist die Nahrung.
        if (!this.walk(v, spot.x, spot.y, 0.05, dt)) return;
        v.heading = Math.atan2(spot.aimY - v.y, spot.aimX - v.x);
        this.world.addStock('food', task.fish, FISH_KIND, hut);
        this.world.onEvent?.({ kind: 'deliver', x: v.x, y: v.y });
        Object.assign(task, { step: 'choose', fish: 0, trap: undefined });
        this.world.markDirty();
        return;
    }
  }

  /** Die nächste volle Reuse in Reichweite der Hütte, die kein anderer Fischer leert. */
  private fullTrap(hut: Building, v: Villager): FishTrap | undefined {
    let best: FishTrap | undefined;
    let bestDistance: number = FISHING.range;
    for (const b of this.world.allBuildings()) {
      if (!(b instanceof FishTrap) || !b.isFull) continue;
      const d = Math.hypot(b.x - hut.x, b.y - hut.y);
      if (d > bestDistance) continue;
      if (this.world.villagers.some((u) => u !== v && u.task.kind === 'fish' && u.task.trap === b.anchor)) continue;
      best = b;
      bestDistance = d;
    }
    return best;
  }

  /**
   * Stelle am Ufer nahe der Hütte: ein begehbares Tile neben Wasser - an
   * Land (x, y) knapp vor der Kante, im Wasser (wx, wy) knapp dahinter. Mit
   * `toward` die, von der aus Hütte und Reuse zusammen am nächsten liegen.
   * ponytail: gleiches Gewässer wird nicht geprüft; liegt die Reuse in einem
   * anderen See, fährt das Boot geradeaus - Wasser-Zusammenhang prüfen, wenn
   * das auf echten Karten vorkommt.
   */
  private shore(hut: Building, toward?: Building): { x: number; y: number; wx: number; wy: number } | undefined {
    let best: { x: number; y: number; wx: number; wy: number } | undefined;
    let bestScore = Infinity;
    const R = FISHING.range;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const [x, y] = [hut.x + dx, hut.y + dy];
        if (this.terrainAt(x, y) !== 1) continue;
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          if (this.blockedAt(nx, ny)) continue;
          const score = Math.hypot(nx - hut.x, ny - hut.y) + (toward ? Math.hypot(x - toward.x, y - toward.y) : 0);
          if (score >= bestScore) continue;
          bestScore = score;
          const [ex, ey] = [x - nx, y - ny];
          best = { x: nx + 0.5 + ex * 0.4, y: ny + 0.5 + ey * 0.4, wx: nx + 0.5 + ex * 0.58, wy: ny + 0.5 + ey * 0.58 };
        }
      }
    }
    return best;
  }

  /**
   * Förster: holt in der Hütte einen Setzling, sucht im Umkreis
   * FORESTER.radius um den Pflanzplatz (sonst um die Hütte) ein freies Tile
   * (World.canPlant), geht hin, gräbt mit der Hacke und setzt ihn - dann
   * zurück in die Hütte. Ist alles bepflanzt, wartet er und sucht wieder.
   */
  private tickForester(v: Villager, task: Extract<Task, { kind: 'plant' }>, dt: number) {
    const hut = this.world.building(task.building);
    if (!(hut instanceof Forester)) {
      v.task = { kind: 'idle' };
      return;
    }
    if (task.leave) {
      if (this.enter(v, hut, dt)) v.assign({ kind: 'idle' });
      return;
    }
    switch (task.step) {
      case 'enter':
        if (this.enter(v, hut, dt)) Object.assign(task, { step: 'choose', progress: 0 });
        return;
      case 'choose': {
        v.problem = null;
        // Nach einem vollen Umkreis erst nach einer Weile wieder suchen - die Suche kostet.
        if (task.progress > 0) {
          task.progress -= dt;
          return;
        }
        const spot = this.plantSpot(v, hut);
        if (!spot) {
          task.progress = FORESTER.wait;
          return;
        }
        Object.assign(task, { step: 'walk', x: spot.x, y: spot.y, progress: 0 });
        return;
      }
      case 'walk': {
        const [x, y] = [task.x!, task.y!];
        // Der Pflanzplatz wurde versetzt: dort weitersuchen.
        const center = hut.plantCenter();
        if (Math.hypot(x - center.x, y - center.y) > FORESTER.radius) {
          Object.assign(task, { step: 'choose', progress: 0 });
          return;
        }
        // Neben das Tile, nicht darauf - dort steht gleich der Baum.
        if (!this.walk(v, x + 0.5, y + 0.5, 0.55, dt)) {
          if (v.problem === UNREACHABLE) {
            v.problem = null;
            v.unreachable.add(`plant:${x},${y}`);
            Object.assign(task, { step: 'choose', progress: 0 });
          }
          return;
        }
        // Inzwischen belegt (Gebäude, Feld): ein anderes suchen.
        Object.assign(task, this.world.canPlant(x, y) ? { step: 'dig', progress: 0 } : { step: 'choose', progress: 0 });
        return;
      }
      case 'dig': {
        const [x, y] = [task.x!, task.y!];
        v.heading = Math.atan2(y + 0.5 - v.y, x + 0.5 - v.x);
        v.pose = POSE.hoe;
        this.swing(v, dt, 'soil', false);
        task.progress += dt / FORESTER.plantTime;
        if (task.progress >= 1) {
          this.world.plant(x, y, hut.species);
          Object.assign(task, { step: 'enter', progress: 0, x: undefined, y: undefined });
        }
        this.world.markDirty();
        return;
      }
    }
  }

  /**
   * Freies Tile für den nächsten Baum im Umkreis FORESTER.radius um den
   * Pflanzplatz: von der Mitte nach außen, etwas gestreut - so wächst ein Wald
   * von innen. Übergangen wird, wohin er keinen Weg fand.
   */
  private plantSpot(v: Villager, hut: Forester): { x: number; y: number } | null {
    const center = hut.plantCenter();
    const r = FORESTER.radius;
    let best: { x: number; y: number } | null = null;
    let bestScore = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > r) continue;
        const [x, y] = [center.x + dx, center.y + dy];
        const score = d + Math.random() * 2;
        if (score >= bestScore || v.unreachable.has(`plant:${x},${y}`) || !this.world.canPlant(x, y)) continue;
        best = { x, y };
        bestScore = score;
      }
    }
    return best;
  }

  /** Keine Arbeit in der Werkstatt: er setzt sich auf den Hocker und wartet - auf `need`. */
  private sitDown(v: Villager, shop: Building, dt: number, need: WorkNeed) {
    v.need = need;
    const seat = modelWorkSpot(shop.model, shop.x, shop.y, shop.definition.size, BUILDING_HEADING, 'seat');
    if (!seat || !this.walk(v, seat.x, seat.y, 0.05, dt)) return;
    v.heading = Math.atan2(seat.aimY - v.y, seat.aimX - v.x);
    v.pose = POSE.sit;
  }

  /**
   * Rechtsklick auf ein Tier: die Ausgewählten jagen es bzw. zerlegen den
   * Kadaver - ein Weidetier schlachten sie, zähmbares Wild fangen sie für die
   * Weide (pasture.ts), außer mit `force` (Alt): dann wird gejagt.
   */
  hunt(ids: ReadonlySet<number>, animal: Animal, force = false): string | null {
    const chosen = this.controllable(ids);
    for (const v of chosen) this.shoeTrips.delete(v);
    if ((!force || animal.tamed) && this.pastures.command(chosen, animal)) return chosen.length === 0 && ids.size > 0 ? WORKER_BUSY : null;
    for (const v of chosen) v.assign({ kind: 'hunt', animal: animal.id, delivering: false, cooldown: 0 });
    return chosen.length === 0 && ids.size > 0 ? WORKER_BUSY : null;
  }

  /** Die Ausgewählten, die Befehle annehmen - wer einer Werkstatt zugeteilt ist, muss erst entlassen werden. */
  private controllable(ids: ReadonlySet<number>): Villager[] {
    return this.world.villagers.filter((v) => ids.has(v.id) && !workplace(v.task));
  }

  /**
   * Den Arbeiter der Werkstatt entlassen: Einen Bogen bringt er noch zur
   * Waffenkammer, das Boot noch an Land. Dann geht er noch einmal in die
   * Werkstatt, legt ab, was er trägt, und bleibt vor der Tür stehen, frei für
   * neue Befehle. War er noch auf dem Weg hinein, bleibt er gleich stehen.
   * Gibt ihn zurück.
   */
  dismiss(anchor: string): Villager | undefined {
    const worker = this.world.villagers.find((v) => workplace(v.task) === anchor);
    if (worker?.task.kind !== 'craft' && worker?.task.kind !== 'fish' && worker?.task.kind !== 'plant') return worker;
    if (worker.task.step === 'enter') worker.assign({ kind: 'idle' });
    else worker.task.leave = true;
    return worker;
  }

  /** Nächstes Tier bzw. Kadaver mit Fleisch in Reichweite der Suche - lieber erlegte. */
  private nearestPrey(v: Villager, kind: AnimalKind | null): Animal | undefined {
    let best: Animal | undefined;
    let bestScore: number = VILLAGER.searchRadius;
    for (const a of this.world.wildlife.animals) {
      if (a.state === 'dead' && a.food <= 1e-6) continue;
      // Weidetiere jagt keiner - geschlachtet wird nur auf Befehl (pasture.ts).
      if (a.tamed || (kind && a.kind !== kind)) continue;
      const score = Math.hypot(a.x - v.x, a.y - v.y) - (a.state === 'dead' ? 4 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = a;
      }
    }
    return best;
  }

  /**
   * Holt `weapon` aus der nächsten Waffenkammer, die eine hat, und behält sie
   * (Villager.inventory) - true, solange er damit beschäftigt ist. Der Jäger
   * holt so seinen Speer (B25), der Schütze am Schießplatz seinen Bogen (B24).
   * Hatte er eine andere Waffe, legt er sie dafür in die Kammer (ein Fach).
   * Hat keine eine: false und `task.armory` null - der Aufrufer entscheidet
   * (der Jäger jagt mit bloßen Händen, der Schütze wartet).
   * VERIFIED: tests/spear.test.mjs, tests/archery.test.mjs - er nimmt genau eine und behält sie.
   */
  fetchWeapon(v: Villager, task: { armory?: string | null }, weapon: Weapon, dt: number): boolean {
    const has = v.inventory.weapon === weapon;
    if (task.armory === null || (has && v.inside <= 0)) return false;
    const resource = WEAPONS[weapon].resource;
    let armory = task.armory ? this.world.building(task.armory) : undefined;
    // Noch keine gewählt, inzwischen leer oder ohne Weg: die nächste mit dieser Waffe.
    if (!has && (!armory || v.unreachable.has(armory.anchor) || (armory.stored(resource) < 1 && v.inside <= 0))) {
      armory = this.nearestWithWeapon(v, resource);
      task.armory = armory?.anchor ?? null;
    }
    if (!armory) {
      v.inside = 0;
      return false;
    }
    const target = armory;
    if (!this.enter(v, target, dt, () => {
      if (target.takeGoods(resource, 1) < 1) return;
      const old = v.inventory.weapon;
      // Gerade ist ein Platz frei geworden - die alte Waffe passt hinein.
      if (old) target.addGoods(WEAPONS[old].resource, RESOURCE_LABEL[WEAPONS[old].resource], 1);
      v.inventory.weapon = weapon;
      this.world.markDirty();
    })) return true;
    // Wieder draußen: mit der Waffe geht es los; war die Kammer inzwischen leer, sucht er weiter.
    return v.inventory.weapon !== weapon;
  }

  /** Nächste Waffenkammer mit mindestens einer Waffe dieser Art, zu der er einen Weg hat. */
  private nearestWithWeapon(v: Villager, resource: ResourceKind): Building | undefined {
    let best: Building | undefined;
    let bestDistance = Infinity;
    for (const b of this.world.allBuildings()) {
      if (b.stored(resource) < 1 || v.unreachable.has(b.anchor)) continue;
      const d = Math.hypot(b.x + 0.5 - v.x, b.y + 0.5 - v.y);
      if (d < bestDistance) {
        bestDistance = d;
        best = b;
      }
    }
    return best;
  }

  /**
   * Ohne Speer: hoffnungslos, wenn er das Tier nicht binnen HUNT.chaseLimit
   * Sekunden Jagd einholen kann - schon gelaufene Zeit (task.chase) plus
   * Abstand durch das, was er je Sekunde aufholt (eigenes Tempo minus das des
   * Tiers: auf der Flucht `flee`, sonst `walk`, äsend 0). Ist es so schnell wie
   * er oder schneller, sofort. So läuft er nie endlos hinterher.
   * VERIFIED: tests/spear.test.mjs - den Hasen (flee 0.79) gibt er auf, das Schaf holt er ein.
   */
  hopeless(v: Villager, task: { chase?: number }, a: Animal, gap: number): boolean {
    const def = a.definition;
    const speed = a.state === 'flee' ? def.flee : a.state === 'walk' ? def.walk : 0;
    const closing = v.speed - speed;
    return closing <= 1e-6 || (task.chase ?? 0) + gap / closing > HUNT.chaseLimit;
  }

  /**
   * Jäger: holt sich erst einen Speer (fetchWeapon), dann hinterher, bis er in
   * Wurfweite ist, und Speer um Speer, bis das Tier fällt - ohne Speer muss er
   * bis auf HUNT.reach heran und gibt auf, wenn es hoffnungslos ist (hopeless).
   * Wer einen Bogen hat (Schießplatz, B24), jagt damit aus HUNT.bowRange.
   * Übung (Jagen bzw. Bogen, skills.ts) lässt ihn schneller nachladen.
   * Am Kadaver zieht er erst die Haut ab (Leder, so viel wie beim Schlachten
   * auf der Weide, TAME) und bringt sie ins Dorfzentrum - ohne eins bleibt die
   * Haut liegen -, dann zerlegt er das Fleisch und bringt es zum Lager. Ist es
   * leer, macht er beim nächsten Tier derselben Art weiter.
   * VERIFIED: tests/research.test.mjs - ein erlegtes Reh gibt Leder und Fleisch.
   */
  private tickHunter(v: Villager, task: Extract<Task, { kind: 'hunt' }>, dt: number) {
    if (task.delivering) {
      const site = this.nearestDropSite(v, v.carryType ?? 'food');
      if (!site) {
        v.problem = v.carryType === 'leather' ? 'Kein Lager für Leder - baue ein Dorfzentrum' : 'Kein Lager für Nahrung - baue eine Mühle';
        return;
      }
      v.problem = null;
      if (this.deliverTo(v, site, dt)) task.delivering = false;
      return;
    }
    let a = this.world.wildlife.byId(task.animal);
    // Inzwischen gefangen oder auf der Weide (pasture.ts): ein anderes Tier.
    if (!a || (a.state === 'dead' && a.food <= 1e-6) || a.tamed || a.leash > 0) {
      const next = this.nearestPrey(v, a?.kind ?? null);
      if (next) {
        task.animal = next.id;
        task.chase = 0;
        a = next;
      } else if (v.carrying > 0 && v.carryType === 'food') {
        task.delivering = true;
        return;
      } else {
        v.task = { kind: 'idle' };
        v.problem = 'Hier gibt es nichts mehr zu jagen';
        return;
      }
    }
    v.problem = null;
    if (a.state !== 'dead') {
      const bow = v.inventory.weapon === 'bow';
      if (!bow && this.fetchWeapon(v, task, 'spear', dt)) return;
      // In Wurfweite heran - und dann werfen, auch wenn es wegläuft. Ohne Speer ganz heran.
      // VERIFIED: tests/archery.test.mjs - mit dem Bogen trifft er aus mehr als HUNT.range.
      const armed = v.inventory.weapon !== null;
      const range = bow ? HUNT.bowRange : armed ? HUNT.range : HUNT.reach;
      const d = Math.hypot(a.x - v.x, a.y - v.y);
      task.cooldown = Math.max(0, task.cooldown - dt);
      if (d > range) {
        if (!armed && this.hopeless(v, task, a, d - range)) {
          v.assign({ kind: 'idle' });
          v.problem = `Ohne Speer zu langsam - ${a.label} entkommt`;
          return;
        }
        if (!armed) task.chase = (task.chase ?? 0) + dt;
        this.walk(v, a.x, a.y, range * 0.8, dt);
        return;
      }
      v.heading = Math.atan2(a.y - v.y, a.x - v.x);
      // Werfen bzw. zustoßen ohne Beil: der Clip throw dauert eine Nachladezeit (HUNT.reload),
      // seine Clip-Zeit ist die Arbeitszeit - mit Übung läuft beides schneller.
      // Mit dem Bogen zielt er wie am Schießplatz (Clip carry, angehalten).
      const skill = bow ? 'archery' : 'hunting';
      v.pose = bow ? POSE.carry : POSE.throw;
      v.workTime += practise(v.skills, skill, dt);
      if (task.cooldown > 0) return;
      task.cooldown = HUNT.reload / skillFactor(v.skills, skill);
      // Beim Treffer steht der Arm im Clip gerade beim Loslassen.
      if (!bow) v.workTime = throwRelease(v.workTime);
      // Cheat "speedy gonzales": ein Treffer erlegt es.
      a.hp -= this.world.speedy ? a.hp : 1;
      this.world.onEvent?.({ kind: 'strike', resource: 'throw', x: v.x, y: v.y });
      if (a.hp <= 0) {
        a.state = 'dead';
        a.target = null;
        a.produce = (TAME[a.kind]?.leather ?? 0) * (a.grown ? 1 : 0.5);
      }
      this.world.markDirty();
      return;
    }
    // Am Kadaver: kniend zerlegen.
    if (!this.walk(v, a.x, a.y, 0.35, dt)) return;
    v.heading = Math.atan2(a.y - v.y, a.x - v.x);
    v.pose = POSE.pick;
    this.swing(v, dt, 'berries', true);
    const hide = a.produce > 1e-6 && this.nearestDropSite(v, 'leather') !== undefined;
    // Haut und Fleisch sind zwei Ladungen - was er von der anderen trägt, bringt er erst weg.
    if (v.carrying > 0 && (v.carryType === 'leather' || v.carryType === 'food') && v.carryType !== (hide ? 'leather' : 'food')) {
      task.delivering = true;
      return;
    }
    this.startLoad(v, hide ? 'leather' : 'food', () => (hide ? RESOURCE_LABEL.leather : MEAT_KIND));
    // Cheat "speedy gonzales": sofort voll beladen.
    const left = hide ? a.produce : a.food;
    const take = Math.min(this.world.speedy ? Infinity : HUNT.butcherRate * dt, left, VILLAGER.capacity - v.carrying);
    if (hide) a.produce -= take;
    else a.food -= take;
    v.carrying += take;
    this.world.markDirty();
    if (v.carrying >= VILLAGER.capacity - 1e-6 || left - take <= 1e-6) task.delivering = true;
  }

  /**
   * Ein Tick für einen Dorfbewohner: seinen Auftrag ein Stück weiter ausführen -
   * es sei denn, er holt sich gerade Schuhe (B31, fetchShoes); danach sieht er,
   * ob er sich welche holt (lookForShoes).
   */
  tick(v: Villager, dt: number) {
    if (this.fetchShoes(v, dt)) return;
    this.tickTask(v, dt);
    this.lookForShoes(v);
  }

  /**
   * Barfuß (B31): ist er untätig, geht er zur nächsten Schusterei mit Schuhen;
   * geht er gerade (Pose walk, egal wohin) näher als COBBLER.detour Tiles an
   * einer vorbei, macht er den Umweg. Danach weiter mit seinem Auftrag
   * (fetchShoes). Nicht im Boot, nicht im Gebäude und nicht dorthin, wo er
   * schon keinen Weg fand (v.unreachable). Mit Holzschuhen genauso, sobald
   * eine Schusterei Lederschuhe hat (betterPair).
   * ponytail: "auf dem Weg" ist der Abstand von seiner Stelle zur Schusterei, nicht
   * der ganze Weg; den Weg (v.path) prüfen, wenn Umwege über Hindernisse stören.
   * VERIFIED: tests/shoes.test.mjs - untätig holt er sie, im Vorbeigehen auch, weiter weg nicht.
   */
  private lookForShoes(v: Villager) {
    if (v.inventory.shoes === 'leather' || this.shoeShops.length === 0 || v.inside > 0 || inBoat(v)) return;
    const idle = v.task.kind === 'idle';
    if (!idle && v.pose !== POSE.walk) return;
    let best: Building | undefined;
    let bestDistance: number = idle ? Infinity : COBBLER.detour;
    for (const b of this.shoeShops) {
      if (!betterPair(v, b) || v.unreachable.has(b.anchor)) continue;
      const d = Math.hypot(b.x + 0.5 - v.x, b.y + 0.5 - v.y);
      if (d < bestDistance) {
        bestDistance = d;
        best = b;
      }
    }
    if (best) this.shoeTrips.set(v, best.anchor);
  }

  /**
   * Auf dem Umweg zur Schusterei (lookForShoes): hingehen, hinein, ein Paar
   * anziehen, wieder heraus - true, solange er damit beschäftigt ist. Ist sie
   * inzwischen leer oder weg oder gibt es keinen Weg, lässt er es. Er nimmt
   * das beste Paar (betterPair); seine Holzschuhe stellt er dafür ins Regal.
   * VERIFIED: tests/shoes.test.mjs - er nimmt genau ein Paar;
   * tests/research.test.mjs - lieber Leder, Holzschuhe tauscht er gegen Leder.
   */
  private fetchShoes(v: Villager, dt: number): boolean {
    const anchor = this.shoeTrips.get(v);
    if (anchor === undefined) return false;
    const shop = this.world.building(anchor);
    if (!shop || (v.inside <= 0 && !betterPair(v, shop))) {
      this.shoeTrips.delete(v);
      return false;
    }
    // Ein alter Grund aus seinem Auftrag zählt hier nicht.
    if (v.problem === UNREACHABLE) v.problem = null;
    const done = this.enter(v, shop, dt, () => {
      const pair = betterPair(v, shop);
      if (!pair || shop.takeGoods('shoes', 1, SHOES[pair].kind) < 1) return;
      if (v.inventory.shoes) this.world.addStock('shoes', 1, SHOES[v.inventory.shoes].kind, shop);
      v.inventory.shoes = pair;
      this.world.markDirty();
    });
    if (v.problem === UNREACHABLE) {
      // Kein Weg dorthin - enter hat sie in v.unreachable gemerkt.
      v.problem = null;
      this.shoeTrips.delete(v);
      return false;
    }
    if (done) this.shoeTrips.delete(v);
    return true;
  }

  /** Der Auftrag, ein Stück weiter. */
  private tickTask(v: Villager, dt: number) {
    const task = v.task;
    switch (task.kind) {
      case 'idle':
        return;

      case 'move':
        // Angekommen - oder es gibt keinen Weg: dann bleibt er mit dem Grund stehen.
        if (this.walk(v, task.x, task.y, MOVE_REACH, dt) || v.problem === UNREACHABLE) v.task = { kind: 'idle' };
        return;

      case 'farm':
        this.tickFarmer(v, task, dt);
        return;

      case 'hunt':
        this.tickHunter(v, task, dt);
        return;

      case 'craft':
        this.tickCrafter(v, task, dt);
        return;

      case 'fish':
        this.tickFisher(v, task, dt);
        return;

      case 'plant':
        this.tickForester(v, task, dt);
        return;

      case 'archery':
        tickArcher(this, this.world, v, task, dt);
        return;
      case 'tend':
        this.pastures.tick(v, task, dt);
        return;
      case 'build':
        tickBuilder(this, this.world, v, task, dt);
        return;

      case 'deliver': {
        const building = this.world.building(task.building);
        if (!building) {
          v.task = { kind: 'idle' };
          return;
        }
        if (this.deliverTo(v, building, dt)) v.task = { kind: 'idle' };
        return;
      }

      case 'gather': {
        if (task.delivering) {
          const site = this.nearestDropSite(v, YIELD[task.type]);
          if (!site) {
            v.problem = 'Kein Lager für diese Ressource';
            return;
          }
          v.problem = null;
          if (this.deliverTo(v, site, dt)) task.delivering = false;
          return;
        }

        const found = this.world.remainingAt(task.x, task.y);
        if (found.type !== task.type || found.amount <= 0) {
          // Feld leer: erst zurück an die alte Arbeitsstelle (etwa nach dem
          // Abliefern), dort im Umkreis weitermachen, sonst Rest abliefern,
          // wiederkommen und dort aufhören. Er selbst zählt am leeren Feld
          // nicht mehr mit. VERIFIED: tests/return-to-work.test.mjs.
          if (!this.walk(v, task.x + 0.5, task.y + 0.5, RETURN_REACH, dt)) return;
          const occupancy = this.occupancy();
          const own = key(task.x, task.y);
          occupancy.set(own, (occupancy.get(own) ?? 1) - 1);
          const next = this.nextDeposit(task.type, task.x, task.y, occupancy);
          if (next) {
            task.x = next.x;
            task.y = next.y;
            task.slot = undefined;
          } else if (v.carrying > 0) {
            task.delivering = true;
          } else {
            v.task = { kind: 'idle' };
            v.problem = 'Hier gibt es nichts mehr';
          }
          return;
        }

        // Jeder hat seinen eigenen Platz am Feld (`slot`, frei vergeben) -
        // sonst stehen Sammler auf demselben Punkt und sehen aus wie einer.
        // Die Plätze liegen gleichmäßig im Kreis; der Winkel je Feld sorgt
        // dafür, dass nicht an jedem Baum der erste Platz auf derselben
        // Seite liegt - sonst fielen alle Bäume gleich.
        task.slot ??= this.freeSlot(v, task);
        const angle = task.slot * ((Math.PI * 2) / MAX_GATHERERS) + tileAngle(task.x, task.y);
        let spotX = task.x + 0.5 + Math.cos(angle) * GATHER_SPREAD;
        let spotY = task.y + 0.5 + Math.sin(angle) * GATHER_SPREAD;
        // Wohin er schlägt: die Mitte des Felds - oder beim gefällten Baum der
        // liegende Stamm, dort, wo gerade abgesägt wird (die Spitze, die mit
        // dem Holz näher zum Stumpf wandert). Er steht seitlich daneben.
        let aimX = task.x + 0.5;
        let aimY = task.y + 0.5;
        const fellDir = task.type === 'wood' ? this.world.deposits.fellDirection(task.x, task.y) : undefined;
        const length = fellDir !== undefined ? this.world.treeLength?.(task.x, task.y) : undefined;
        if (fellDir !== undefined && length) {
          const total = this.world.deposits.base(task.x, task.y).amount;
          const share = Math.max(0, Math.min(1, found.amount / total));
          // In Sprüngen von STEP Tiles: so geht er ab und zu ein paar Schritte
          // weiter, statt dem kürzer werdenden Stamm hinterherzurutschen.
          const STEP = 0.8;
          const along = Math.max(0.35, Math.floor((length * share * 0.8) / STEP) * STEP);
          const [dx, dy] = [Math.cos(fellDir), Math.sin(fellDir)];
          aimX += dx * along;
          aimY += dy * along;
          // Links oder rechts vom Stamm, je Platz ein Stück weiter weg und
          // zurück - jeder der MAX_GATHERERS Plätze liegt woanders.
          const row = task.slot >> 1;
          const side = (task.slot % 2 ? 1 : -1) * (0.3 + row * 0.1);
          spotX = aimX - dy * side - dx * row * 0.2;
          spotY = aimY + dx * side - dy * row * 0.2;
        }
        if (!this.walk(v, spotX, spotY, 0.05, dt)) return;
        // Am Platz: zum Vorkommen drehen und arbeiten - Beeren kniend pflücken.
        v.heading = Math.atan2(aimY - v.y, aimX - v.x);
        v.pose = task.type === 'berries' ? POSE.pick : POSE.work;
        this.swing(v, dt, task.type, task.type === 'berries');

        // Wechselt er die Ressource, lässt er die alte Ladung fallen - wie in AoE2.
        // Die Sorte: Baum- oder Beerenart, bei Fels und Gold der Rohstoff.
        this.startLoad(v, YIELD[task.type], () => depositKind(this.world.deposits, task.x, task.y) ?? RESOURCE_LABEL[YIELD[task.type]]);
        // Der erste Hieb fällt den Baum - grob weg vom Holzfäller, aber nie
        // ganz genau: bis zu 35° daneben.
        if (task.type === 'wood') {
          const away = Math.atan2(task.y + 0.5 - v.y, task.x + 0.5 - v.x);
          const jitter = (tileAngle(task.x + 17, task.y - 31) / Math.PI - 1) * 0.6;
          if (this.world.deposits.fell(task.x, task.y, away + jitter, this.world.now)) {
            this.world.onEvent?.({ kind: 'treeFall', x: task.x + 0.5, y: task.y + 0.5 });
          }
        }
        // Cheat "speedy gonzales": Holz und Beeren sofort voll beladen.
        const fast = this.world.speedy && (task.type === 'wood' || task.type === 'berries');
        // Übung macht schneller (B24, skills.ts) - eine Fähigkeit für alles Sammeln.
        const wanted = Math.min(fast ? Infinity : VILLAGER.gatherRate[task.type] * practise(v.skills, 'gathering', dt), VILLAGER.capacity - v.carrying);
        v.carrying += this.world.deposits.take(task.x, task.y, wanted, this.world.now);
        this.world.markDirty();

        if (v.carrying >= VILLAGER.capacity - 1e-6) task.delivering = true;
        return;
      }
    }
  }

  /** Kurzbeschreibung für die Anzeige. */
  describe(v: Villager): string {
    if (v.problem) return v.problem;
    const load = v.carrying > 0 && v.carryType ? ` (${Math.floor(v.carrying)})` : '';
    if (this.shoeTrips.has(v)) {
      const shop = this.world.building(this.shoeTrips.get(v)!);
      return `holt sich ${shop ? SHOES[betterPair(v, shop) ?? 'wood'].label : 'Schuhe'}` + load;
    }
    switch (v.task.kind) {
      case 'idle': return 'untätig' + load;
      case 'move': return 'unterwegs' + load;
      case 'deliver': return 'liefert ab' + load;
      case 'gather':
        return (v.task.delivering ? 'bringt ' : 'sammelt ') + RESOURCE_TYPE_LABEL[v.task.type] + load;
      case 'hunt': {
        if (v.task.delivering) return (v.carryType === 'leather' ? 'bringt Leder' : 'bringt Fleisch') + load;
        const hunt = v.task;
        const a = this.world.wildlife.byId(hunt.animal);
        if (!a) return 'jagt' + load;
        return (a.isDead ? `zerlegt ${a.label}` : `jagt ${a.label}`) + load;
      }
      case 'craft': {
        const shop = this.world.building(v.task.building);
        const label = shop?.label ?? 'Werkstatt';
        const recipe = craftTaskRecipe(shop?.type ?? '', v.task);
        const item = recipe?.item ?? 'etwas';
        if (v.task.leave && v.task.step !== 'deliver') return `entlassen, geht aus der ${label}`;
        switch (v.task.step) {
          case 'enter': return `geht in die ${label}`;
          case 'fetch': return `holt ${RESOURCE_LABEL[recipe?.material ?? 'wood']} für die ${label}` + load;
          case 'deliver': return shop?.stores(craftRecipe(shop.type)?.product ?? 'bows')
            ? `bringt ${item} ins Regal`
            : `bringt ${item} zur Waffenkammer`;
          case 'carve': return v.carryType === (recipe?.material ?? 'wood')
            ? `bringt ${RESOURCE_LABEL[recipe?.material ?? 'wood']} zur Werkbank` + load
            : `${recipe?.material === 'leather' ? 'näht' : 'schnitzt'} ${item} (${Math.floor(v.task.progress * 100)} %)`;
        }
      }
      case 'fish':
        if (v.task.leave && !AFLOAT.has(v.task.step) && !DRAGGING.has(v.task.step)) return 'entlassen, geht aus der Fischerhütte';
        switch (v.task.step) {
          case 'enter': return 'geht in die Fischerhütte';
          case 'choose': return 'fischt';
          case 'shore': return 'geht zum Ufer angeln';
          case 'angle': return `angelt (${Math.floor(v.task.progress * 100)} %)`;
          case 'boat': return 'holt das Boot';
          case 'launch': return 'zieht das Boot ins Wasser';
          case 'row': return 'rudert zur Reuse';
          case 'empty': return 'leert die Reuse';
          case 'return': return v.task.fish > 0 ? 'rudert mit dem Fang zurück' : 'rudert zurück';
          case 'land': return 'zieht das Boot an Land';
          case 'net': return 'bringt den Fisch ins Netz';
        }
      case 'archery':
        return describeArcher(v, v.task);
      case 'plant': {
        if (v.task.leave) return 'entlassen, geht in die Försterhütte';
        const shop = this.world.building(v.task.building);
        const species = shop instanceof Forester ? TREE_SPECIES[shop.species].label : 'Baum';
        switch (v.task.step) {
          case 'enter': return 'geht in die Försterhütte';
          case 'choose': return v.task.progress > 0 ? 'wartet - kein freier Platz zum Pflanzen' : 'sucht einen Platz';
          case 'walk': return `bringt einen Setzling (${species}) zum Pflanzplatz`;
          case 'dig': return `pflanzt ${species} (${Math.floor(v.task.progress * 100)} %)`;
        }
      }
      case 'tend':
        return this.pastures.describe(v, v.task);
      case 'build':
        return describeBuilder(this.world, v.task);
      case 'farm': {
        const building = this.world.building(v.task.building);
        const f = building?.isFarm() ? building.furrows[v.task.row] : undefined;
        if (!building || !f) return 'untätig' + load;
        const crop = CROPS[f.crop].label;
        if (v.task.delivering) return `bringt ${crop}${load}`;
        switch (this.world.farmPhase(building)) {
          case 'plough': return 'pflügt' + load;
          case 'sow': return `sät ${crop}` + load;
          case 'wood': return 'jätet (kein Holz zum Säen)' + load;
          case 'grow': return `jätet (${crop} wächst)` + load;
          case 'harvest': return `erntet ${crop}` + load;
          case 'done': return 'sät neu' + load;
        }
      }
    }
  }
}
