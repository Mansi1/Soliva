// villagers.ts
// Was Dorfbewohner tun, Schritt für Schritt: Befehle annehmen (Rechtsklick),
// laufen (mit Wegsuche), sammeln, abliefern, Felder bestellen, jagen - und
// als kurzer Text beschreiben, was sie gerade tun. Was ein Dorfbewohner ist
// und hat, steht in unit/Villager.ts; die Welt ruft tick() je Dorfbewohner.

import { BUILDING_HEADING, CLIPS, POSE, modelEntry, modelWorkSpot } from '../gl/entityRenderer';
import type { Clip } from '../gl/clips';
import { RESOURCE_TYPE_LABEL } from '../map';
import { findPath, lineOfSight } from './pathfinding';
import { CROWDED_ARRIVAL, freeSpot, occupied, separate, steer, type Point } from './crowd';
import { FishTrap, furrowFood, type Building, type Farm } from './building';
import {
  BOWYER, CROPS, FARM_RATE, FISHING, HUNT, MAX_GATHERERS, PLOUGH_TIME, RESEED_COST, SOW_TIME, VILLAGER, YIELD, type AnimalKind, type DepositType, type ResourceKind,
} from './catalog';
import { farmSpot, furrowKey, furrowNeeds, type FarmPhase } from './farming';
import type { Animal, Task, Villager } from './unit';
import { WORK_TEMPO, type World } from './world';

/** Abstand der Sammelplätze von der Feldmitte, in Tiles. */
const GATHER_SPREAD = 0.4;
/** Abstand zur Gebäudekante, ab dem er abliefern kann. */
const DELIVER_REACH = 0.6;
/** So lange (Sekunden) bleibt ein Dorfbewohner beim Abladen im Gebäude. */
const INSIDE_TIME = 1.2;
const WORKER_BUSY = 'Arbeitet in einer Werkstatt - dort erst entlassen';

const key = (x: number, y: number) => `${x},${y}`;

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

/** Die Werkstatt, in der er arbeitet (Bognerei, Fischerhütte) - oder keine. */
export function workplace(task: Task): string | undefined {
  return task.kind === 'craft' || task.kind === 'fish' ? task.building : undefined;
}

/** Schritte des Fischers, in denen das Boot auf dem Wasser ist bzw. gezogen wird. */
export const AFLOAT: ReadonlySet<string> = new Set(['row', 'empty', 'return']);
export const DRAGGING: ReadonlySet<string> = new Set(['launch', 'land']);

/** Sitzt er im Boot oder zieht es? Dann weicht er niemandem aus. */
const inBoat = (v: Villager) => v.task.kind === 'fish' && (AFLOAT.has(v.task.step) || DRAGGING.has(v.task.step));

export class VillagerWork {
  /**
   * Was ein Tile vom Gelände her versperrt, gemerkt: 0 frei, 1 Wasser,
   * 2 Baum/Fels (frei, sobald abgebaut oder gefällt). Gebäude kommen dazu
   * (siehe blockedAt).
   */
  private terrainBlock = new Map<string, number>();
  /** Wer im letzten Tick zu sehen war und Platz braucht - für steer() und separate(). */
  private present: Villager[] = [];

  constructor(private world: World) {}

  /**
   * Befehl an ausgewählte Dorfbewohner für das Feld (x, y), wie ein Rechtsklick
   * in AoE2: Lager -> abliefern, Vorkommen -> sammeln, sonst hingehen - zum
   * genauen Punkt `point`, falls angegeben, sonst zur Mitte des Felds.
   */
  command(ids: ReadonlySet<number>, x: number, y: number, point?: Point): string | null {
    const selected = this.controllable(ids);
    if (selected.length === 0) return ids.size > 0 ? WORKER_BUSY : null;
    // Wer gerade im Gebäude ablädt, kommt für den neuen Befehl sofort heraus.
    for (const v of selected) v.inside = 0;

    const target = this.world.at(x, y);
    if (target?.isWorkshop()) {
      // Wie in Stronghold arbeitet in einer Werkstatt genau einer.
      const anchor = target.anchor;
      const taken = this.world.villagers.some((v) => !ids.has(v.id) && workplace(v.task) === anchor);
      if (taken) return `In der ${target.label} arbeitet schon jemand`;
      const [worker, ...rest] = selected;
      worker.assign(target.type === 'fisher_hut'
        ? { kind: 'fish', building: anchor, step: 'enter', progress: 0, fish: 0 }
        : { kind: 'craft', building: anchor, step: 'enter', progress: 0 });
      return rest.length > 0 ? `In der ${target.label} arbeitet nur einer` : null;
    }
    if (target?.isFarm()) {
      // Je Furche ein Bauer - sind alle besetzt, geht es aufs nächste Feld
      // mit einer freien Furche.
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
    // Über Felder geht man hinweg - Bauern arbeiten ja darauf.
    if (anchor !== undefined) return !this.world.building(anchor)?.isFarm();
    const t = this.terrainAt(x, y);
    if (t === 2) return !this.world.deposits.isExhausted(x, y) && !this.world.deposits.isFelled(x, y);
    return t === 1;
  }

  /** Wo das Boot nicht hinkommt: alles außer Wasser. Über Reusen fährt es hinweg. */
  private dryAt(x: number, y: number): boolean {
    return this.terrainAt(x, y) !== 1;
  }

  /** Gelände eines Tiles, gemerkt (terrainBlock): 0 frei, 1 Wasser, 2 Baum/Fels. */
  private terrainAt(x: number, y: number): number {
    const k = key(x, y);
    let t = this.terrainBlock.get(k);
    if (t === undefined) {
      const found = this.world.terrain.resourceAt(x, y);
      t = found.tileType === 'water' || found.tileType === 'deep_water' ? 1
        : found.type === 'wood' || found.type === 'stone' || found.type === 'gold' ? 2 : 0;
      if (this.terrainBlock.size > 200_000) this.terrainBlock.clear();
      this.terrainBlock.set(k, t);
    }
    return t;
  }

  /**
   * Nächster Punkt, den er ansteuert: der erste offene Wegpunkt zum Ziel -
   * gesucht, wenn das Ziel neu ist oder der Weg inzwischen versperrt ist.
   * Gibt es keinen Weg, geht er geradeaus (wie früher), statt stehen zu bleiben.
   */
  private waypoint(v: Villager, tx: number, ty: number, reach: number, afloat: boolean): { x: number; y: number } {
    const blocked = afloat ? (x: number, y: number) => this.dryAt(x, y) : (x: number, y: number) => this.blockedAt(x, y);
    // Neu suchen: neues Ziel, oder die Strecke zum nächsten Wegpunkt ist
    // inzwischen versperrt (z. B. ein neues Gebäude).
    const stale = !v.pathTarget || Math.hypot(v.pathTarget.x - tx, v.pathTarget.y - ty) > 0.3
      || (v.path?.[0] && !lineOfSight(v.x, v.y, v.path[0].x, v.path[0].y,
          (x, y) => blocked(x, y) && !(x === Math.floor(v.x) && y === Math.floor(v.y))));
    if (stale) {
      v.pathTarget = { x: tx, y: ty };
      v.path = lineOfSight(v.x, v.y, tx, ty, (x, y) => blocked(x, y) && !(x === Math.floor(tx) && y === Math.floor(ty)))
        ? []
        : findPath(v.x, v.y, tx, ty, reach, blocked) ?? [];
    }
    while (v.path && v.path.length > 0 && Math.hypot(v.path[0].x - v.x, v.path[0].y - v.y) < 0.12) v.path.shift();
    return v.path && v.path.length > 0 ? v.path[0] : { x: tx, y: ty };
  }

  /** Schritt zum Ziel; `afloat`: im Boot, nur über Wasser - er steht dabei im Boot. */
  private walk(v: Villager, tx: number, ty: number, reach: number, dt: number, afloat = false): boolean {
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
    const final = next.x === tx && next.y === ty;
    const dx = next.x - v.x;
    const dy = next.y - v.y;
    const dn = Math.hypot(dx, dy) || 1e-6;
    const step = Math.min(VILLAGER.speed * dt, final ? d - reach : dn);
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

  /** Nächstes Lager, das `type` annimmt. */
  private nearestDropSite(v: Villager, type: ResourceKind): Building | undefined {
    let best: Building | undefined;
    let bestDistance = Infinity;
    for (const b of this.world.allBuildings()) {
      if (!b.definition.storedResources.includes(type)) continue;
      const d = Math.hypot(b.x + 0.5 - v.x, b.y + 0.5 - v.y);
      if (d < bestDistance) {
        bestDistance = d;
        best = b;
      }
    }
    return best;
  }

  /** Läuft zum Lager; true, sobald die Ladung abgegeben ist. */
  private deliverTo(v: Villager, building: Building, dt: number): boolean {
    return this.enter(v, building, dt, () => {
      if (v.carryType && v.carrying > 0) {
        this.world.stock[v.carryType] += v.carrying;
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
    if (!this.walk(v, tx, ty, reach, dt)) return false;
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
  private nextDeposit(
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
   * Die nächste Furche auf dem Feld, in der es in dieser Phase Arbeit gibt
   * und kein anderer Bauer arbeitet - die dem Bauern nächste.
   */
  private nextFurrow(v: Villager, group: Farm[], phase: FarmPhase): { building: Farm; row: number; distance: number } | undefined {
    const busy = new Set(this.world.villagers.flatMap((u) => (u !== v && u.task.kind === 'farm' ? [`${u.task.building}#${u.task.row}`] : [])));
    let best: { building: Farm; row: number; distance: number } | undefined;
    for (const { building, row, f } of this.world.farming.furrows(group)) {
      if (!furrowNeeds(f, phase) || busy.has(furrowKey(building, row))) continue;
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
  private swing(v: Villager, dt: number, resource: DepositType, picking: boolean) {
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
   * Bauer: arbeitet mit den anderen auf seinem Feld Phase für Phase - erst
   * alles pflügen, dann alles säen, jäten, bis alles reif ist, dann ernten
   * und abliefern; abgeerntet wird alles neu gesät. Er nimmt sich jeweils die
   * nächste freie Furche, in der es noch etwas zu tun gibt.
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

    const group = this.world.farmGroup(building);
    let phase = this.world.farmPhase(building);
    // Die Ernte ist vorbei: wer noch etwas trägt, bringt es erst zum Lager.
    if (phase !== 'harvest' && v.carrying > 0 && v.carryType === 'food') {
      task.delivering = true;
      return;
    }
    if (phase === 'done') {
      // Alles abgeerntet: alles wird neu gesät.
      for (const { building: b, row, f } of this.world.farming.furrows(group)) {
        Object.assign(f, { crop: b.plan, sown: 0, growth: 0, food: furrowFood(b.plan, b.tiles, row), paid: false });
      }
      this.world.markDirty();
      phase = 'sow';
    }
    // In der eigenen Furche nichts mehr zu tun: die nächste mit Arbeit. Beim
    // Ernten geht er immer zum nächsten reifen Getreide, auch in einer fremden
    // Furche - seine eigene behält er nur, solange sie kaum weiter weg ist.
    const ownNeeds = furrowNeeds(building.furrows[task.row], phase);
    if (!ownNeeds || phase === 'harvest') {
      const next = this.nextFurrow(v, group, phase);
      const own = this.farmSpot(building, task.row, v);
      const keep = ownNeeds && (!next || Math.hypot(own.x - v.x, own.y - v.y) <= next.distance + 0.3);
      if (keep) {
        // Er bleibt, wo er ist.
      } else if (next) {
        building = next.building;
        task.building = next.building.anchor;
        task.row = next.row;
      } else if (phase === 'harvest' && v.carrying > 0) {
        // Die Ernte ist verteilt - mit dem, was er hat, zum Lager.
        task.delivering = true;
        return;
      }
    }
    const f = building.furrows[task.row];
    const working = furrowNeeds(f, phase);
    if (working && phase === 'sow' && !f.paid) {
      if (!this.world.canPay(RESEED_COST)) {
        v.problem = 'Zu wenig Holz, um neu zu säen';
        return;
      }
      this.world.pay(RESEED_COST);
      f.paid = true;
    }
    v.problem = null;
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
    if (working && phase === 'plough') {
      // Pflügen: mit der Hacke, stehend.
      v.pose = POSE.work;
      this.swing(v, dt, 'wood', false);
      f.plough = Math.min(1, f.plough + dt / (PLOUGH_TIME * length));
      return;
    }
    if (!working || phase === 'sow') {
      // Säen und jäten: kniend.
      v.pose = POSE.pick;
      this.swing(v, dt, 'berries', true);
      if (working) f.sown = Math.min(1, f.sown + dt / (SOW_TIME * length));
      return;
    }
    // Ernten: Weizen mit der Sense, andere Früchte von Hand.
    v.pose = crop.scythe ? POSE.scythe : POSE.pick;
    this.swing(v, dt, 'berries', true);
    if (v.carryType !== 'food') {
      v.carrying = 0;
      v.carryType = 'food';
    }
    // Cheat "speedy gonzales": der Korb sofort voll.
    const take = Math.min(this.world.speedy ? Infinity : FARM_RATE * crop.rate * dt, f.food, VILLAGER.capacity - v.carrying);
    f.food -= take;
    v.carrying += take;
    if (v.carrying >= VILLAGER.capacity - 1e-6) task.delivering = true;
  }

  /** Cheat "speedy gonzales": Pflügen oder Säen auf dem ganzen Feld auf einmal. */
  private finishField(building: Farm, phase: FarmPhase) {
    for (const { f } of this.world.farming.furrows(this.world.farmGroup(building))) {
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
   * Bogner: holt Holz vom nächsten Lager, das Holz annimmt, schnitzt daraus
   * an der Werkbank einen Bogen und trägt ihn zur nächsten Waffenkammer -
   * immer wieder, solange Holz im Vorrat ist.
   */
  private tickCrafter(v: Villager, task: Extract<Task, { kind: 'craft' }>, dt: number) {
    const shop = this.world.building(task.building);
    if (!shop?.isWorkshop()) {
      // Die Werkstatt ist weg - einen Bogen bringt er trotzdem zur Waffenkammer.
      const armory = v.carryType === 'bows' ? this.nearestDropSite(v, 'bows') : undefined;
      v.task = armory ? { kind: 'deliver', building: armory.anchor } : { kind: 'idle' };
      return;
    }
    if (task.leave && task.step !== 'deliver') {
      // Das Holz auf der Werkbank kommt zurück in den Vorrat.
      if (task.step === 'carve' && v.carryType !== 'wood') this.world.stock.wood += BOWYER.wood;
      task.step = 'fetch';
      if (this.deliverTo(v, shop, dt)) v.assign({ kind: 'idle' });
      return;
    }
    if (task.step === 'enter') {
      if (this.enter(v, shop, dt)) task.step = 'fetch';
      return;
    }
    if (task.step === 'deliver') {
      const armory = this.nearestDropSite(v, 'bows');
      if (!armory) {
        v.problem = 'Keine Waffenkammer für den Bogen - baue eine';
        this.sitDown(v, shop, dt);
        return;
      }
      // Alle voll: er wartet mit dem Bogen, bis Platz ist - erst dann geht er los.
      if (v.inside <= 0 && this.world.stock.bows >= this.world.weaponCapacity()) {
        v.problem = 'Alle Waffenkammern sind voll - baue noch eine';
        this.sitDown(v, shop, dt);
        return;
      }
      v.problem = null;
      if (this.deliverTo(v, armory, dt)) task.step = 'fetch';
      return;
    }
    if (task.step === 'fetch') {
      const store = this.nearestDropSite(v, 'wood');
      if (!store) {
        v.problem = 'Kein Lager für Holz - baue ein Holzlager';
        this.sitDown(v, shop, dt);
        return;
      }
      // Erst losgehen, wenn es genug gibt - sonst wartet er an der Werkbank.
      if (v.inside <= 0 && !this.world.canPay({ wood: BOWYER.wood })) {
        v.problem = `Zu wenig Holz im Vorrat (${BOWYER.wood} je Bogen)`;
        this.sitDown(v, shop, dt);
        return;
      }
      v.problem = null;
      // Am Lager: was er noch trug, liefert er ab, und nimmt das Holz mit.
      if (!this.deliverTo(v, store, dt)) return;
      if (!this.world.canPay({ wood: BOWYER.wood })) return;
      this.world.pay({ wood: BOWYER.wood });
      v.pickUp('wood', BOWYER.wood);
      task.step = 'carve';
      return;
    }
    const def = shop.definition;
    const spot = modelWorkSpot(shop.model, shop.x, shop.y, def.size, BUILDING_HEADING)
      ?? { x: shop.x + 0.5, y: shop.y + 1.1, aimX: shop.x + 0.5, aimY: shop.y + 1.5 };
    if (!this.walk(v, spot.x, spot.y, 0.05, dt)) return;
    // Das Holz kommt auf die Werkbank.
    if (v.carryType === 'wood') v.unload();
    v.heading = Math.atan2(spot.aimY - v.y, spot.aimX - v.x);
    v.pose = POSE.carve;
    this.swing(v, dt, 'berries', true);
    task.progress += dt / BOWYER.craftTime;
    if (task.progress >= 1) {
      task.progress = 0;
      v.pickUp('bows', 1);
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
    if (task.leave && !AFLOAT.has(task.step) && !DRAGGING.has(task.step)) {
      // Den Fang legt er noch ins Netz.
      this.world.stock.food += task.fish;
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
        this.world.stock.food += task.fish;
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

  /** Keine Arbeit in der Werkstatt: er setzt sich auf den Hocker und wartet. */
  private sitDown(v: Villager, shop: Building, dt: number) {
    const seat = modelWorkSpot(shop.model, shop.x, shop.y, shop.definition.size, BUILDING_HEADING, 'seat');
    if (!seat || !this.walk(v, seat.x, seat.y, 0.05, dt)) return;
    v.heading = Math.atan2(seat.aimY - v.y, seat.aimX - v.x);
    v.pose = POSE.sit;
  }

  /** Rechtsklick auf ein Tier: die Ausgewählten jagen es bzw. zerlegen den Kadaver. */
  hunt(ids: ReadonlySet<number>, animal: Animal): string | null {
    const chosen = this.controllable(ids);
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
    if (worker?.task.kind !== 'craft' && worker?.task.kind !== 'fish') return worker;
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
      if (kind && a.kind !== kind) continue;
      const score = Math.hypot(a.x - v.x, a.y - v.y) - (a.state === 'dead' ? 4 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = a;
      }
    }
    return best;
  }

  /**
   * Jäger: hinterher, bis er in Wurfweite ist, dann Speer um Speer, bis das
   * Tier fällt; am Kadaver zerlegt er das Fleisch und bringt es zum Lager.
   * Ist es leer, macht er beim nächsten Tier derselben Art weiter.
   */
  private tickHunter(v: Villager, task: Extract<Task, { kind: 'hunt' }>, dt: number) {
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
    let a = this.world.wildlife.byId(task.animal);
    if (!a || (a.state === 'dead' && a.food <= 1e-6)) {
      const next = this.nearestPrey(v, a?.kind ?? null);
      if (next) {
        task.animal = next.id;
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
      // In Wurfweite heran - und dann werfen, auch wenn es wegläuft.
      const d = Math.hypot(a.x - v.x, a.y - v.y);
      task.cooldown = Math.max(0, task.cooldown - dt);
      if (d > HUNT.range) {
        this.walk(v, a.x, a.y, HUNT.range * 0.8, dt);
        return;
      }
      v.heading = Math.atan2(a.y - v.y, a.x - v.x);
      v.pose = POSE.work;
      v.workTime += dt;
      if (task.cooldown > 0) return;
      task.cooldown = HUNT.reload;
      // Cheat "speedy gonzales": ein Treffer erlegt es.
      a.hp -= this.world.speedy ? a.hp : 1;
      this.world.onEvent?.({ kind: 'strike', resource: 'wood', x: v.x, y: v.y });
      if (a.hp <= 0) {
        a.state = 'dead';
        a.target = null;
      }
      this.world.markDirty();
      return;
    }
    // Am Kadaver: kniend zerlegen.
    if (!this.walk(v, a.x, a.y, 0.35, dt)) return;
    v.heading = Math.atan2(a.y - v.y, a.x - v.x);
    v.pose = POSE.pick;
    this.swing(v, dt, 'berries', true);
    if (v.carryType !== 'food') {
      v.carrying = 0;
      v.carryType = 'food';
    }
    // Cheat "speedy gonzales": sofort voll beladen.
    const take = Math.min(this.world.speedy ? Infinity : HUNT.butcherRate * dt, a.food, VILLAGER.capacity - v.carrying);
    a.food -= take;
    v.carrying += take;
    this.world.markDirty();
    if (v.carrying >= VILLAGER.capacity - 1e-6 || a.food <= 1e-6) task.delivering = true;
  }

  /** Ein Tick für einen Dorfbewohner: seinen Auftrag ein Stück weiter ausführen. */
  tick(v: Villager, dt: number) {
    const task = v.task;
    switch (task.kind) {
      case 'idle':
        return;

      case 'move':
        if (this.walk(v, task.x, task.y, 0.05, dt)) v.task = { kind: 'idle' };
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
          // Feld leer: im Umkreis weitermachen, sonst Rest abliefern und aufhören.
          // Er selbst zählt am leeren Feld nicht mehr mit.
          const occupancy = this.occupancy();
          const own = key(task.x, task.y);
          occupancy.set(own, (occupancy.get(own) ?? 1) - 1);
          const next = this.nextDeposit(task.type, task.x, task.y, occupancy);
          if (next) {
            task.x = next.x;
            task.y = next.y;
            task.slot = undefined;
          } else if (v.carrying > 0) {
            const site = this.nearestDropSite(v, YIELD[task.type]);
            v.task = site ? { kind: 'deliver', building: key(site.x, site.y) } : { kind: 'idle' };
            v.problem = site ? null : 'Kein Lager für diese Ressource';
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
          const total = this.world.terrain.getTile(task.x, task.y).resourceAmount;
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
        if (v.carryType !== YIELD[task.type]) {
          v.carrying = 0;
          v.carryType = YIELD[task.type];
        }
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
        const wanted = Math.min(fast ? Infinity : VILLAGER.gatherRate[task.type] * dt, VILLAGER.capacity - v.carrying);
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
    switch (v.task.kind) {
      case 'idle': return 'untätig' + load;
      case 'move': return 'unterwegs' + load;
      case 'deliver': return 'liefert ab' + load;
      case 'gather':
        return (v.task.delivering ? 'bringt ' : 'sammelt ') + RESOURCE_TYPE_LABEL[v.task.type] + load;
      case 'hunt': {
        if (v.task.delivering) return 'bringt Fleisch' + load;
        const hunt = v.task;
        const a = this.world.wildlife.byId(hunt.animal);
        if (!a) return 'jagt' + load;
        return (a.isDead ? `zerlegt ${a.label}` : `jagt ${a.label}`) + load;
      }
      case 'craft':
        if (v.task.leave && v.task.step !== 'deliver') return 'entlassen, geht aus der Bognerei';
        switch (v.task.step) {
          case 'enter': return 'geht in die Bognerei';
          case 'fetch': return 'holt Holz für die Bognerei' + load;
          case 'deliver': return 'bringt einen Bogen zur Waffenkammer';
          case 'carve': return v.carryType === 'wood'
            ? 'bringt Holz zur Werkbank' + load
            : `schnitzt einen Bogen (${Math.floor(v.task.progress * 100)} %)`;
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
      case 'farm': {
        const building = this.world.building(v.task.building);
        const f = building?.isFarm() ? building.furrows[v.task.row] : undefined;
        if (!building || !f) return 'untätig' + load;
        const crop = CROPS[f.crop].label;
        if (v.task.delivering) return `bringt ${crop}${load}`;
        switch (this.world.farmPhase(building)) {
          case 'plough': return 'pflügt' + load;
          case 'sow': return `sät ${crop}` + load;
          case 'grow': return `jätet (${crop} wächst)` + load;
          case 'harvest': return `erntet ${crop}` + load;
          case 'done': return 'sät neu' + load;
        }
      }
    }
  }
}
