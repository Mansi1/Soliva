// Herd.ts
// Ein Rudel (B12): Tiere einer Art, die zusammen äsen, ziehen und fliehen.
// Das Rudel hat eine Mitte, um die seine Tiere äsen. Nach langer Rast zieht
// die Mitte ruhig in Bögen weiter - nicht ins Wasser, nicht steil hinauf
// oder hinab - und die Tiere folgen ihr. Sieht eines einen Dorfbewohner,
// flieht das ganze Rudel; danach sammelt es sich wieder.

import type { AnimalBase, AnimalSurroundings } from './AnimalBase';

/** So viele Tiere hat ein Rudel höchstens - mehr Junge kommen nicht (B11). */
export const HERD_MAX = 8;
/** Sekunden, die das Rudel nach dem letzten Blick auf den Dorfbewohner noch flieht. */
const ALARM = 4;
/** Rast zwischen zwei Wanderungen (Sekunden Spielzeit, von, bis). */
const REST: [number, number] = [40, 100];
/** So weit (Tiles) zieht es je Wanderung. */
const TRAVEL: [number, number] = [4, 9];
/**
 * Die Mitte zieht langsamer als ein Tier geht (Anteil von `walk`) - so
 * holen die Tiere sie ein, das Rudel bleibt beisammen.
 */
const DRIFT = 0.75;
/** So schnell dreht die Mitte (Radiant je Sekunde) - sie zieht in Bögen. */
const TURN = 0.25;
/** So steil (Tiles je Tile, ~31°, wie MAX_PITCH in render.ts) darf das Gelände unter einem Tier höchstens sein. */
export const MAX_SLOPE = 0.6;
/** Über diese Strecke (Tiles) misst ein Tier das Gefälle. */
const SLOPE_STEP = 0.25;

/** Steigung des Geländes (Tiles je Tile, in der steilsten Richtung) bei (x, y). */
function steepness(s: AnimalSurroundings, x: number, y: number): number {
  const h = s.heightAt(x, y);
  return Math.hypot(s.heightAt(x + SLOPE_STEP, y) - h, s.heightAt(x, y + SLOPE_STEP) - h) / SLOPE_STEP;
}

/**
 * Darf ein Tier von (x, y) nach (nx, ny)? Nicht in ein gesperrtes Tile, nicht
 * ins Wasser, wie man es sieht, und nicht auf Gelände steiler als MAX_SLOPE -
 * auch nicht schräg am Hang entlang. `wet`: es steht schon im Wasser und
 * darf heraus; steht es schon am steilen Hang, darf es hin, wo es flacher ist.
 */
export function passable(s: AnimalSurroundings, x: number, y: number, nx: number, ny: number, wet = false): boolean {
  if (s.isBlocked(Math.floor(nx), Math.floor(ny)) || (!wet && s.isWater(nx, ny))) return false;
  const steep = steepness(s, nx, ny);
  return steep <= MAX_SLOPE || steep < steepness(s, x, y);
}

export class Herd {
  members: AnimalBase[] = [];
  /** Mitte, um die das Rudel äst. */
  x: number;
  y: number;
  /** Mitte der lebenden Tiere, je Tick neu (Herd.tick). */
  cx: number;
  cy: number;
  heading = Math.random() * Math.PI * 2;
  /** Sekunden Rast, bis es weiterzieht. */
  rest = REST[0] * Math.random();
  /** Ziel der Wanderung - null: es rastet. */
  goal: { x: number; y: number } | null = null;
  /** Wovor es flieht und wie lange noch (Sekunden). */
  threat: { x: number; y: number } | null = null;
  alarm = 0;
  private clock = Math.random() * 100;

  constructor(readonly id: number, x: number, y: number) {
    this.x = this.cx = x;
    this.y = this.cy = y;
  }

  /** Lebende Tiere. */
  get size(): number {
    let n = 0;
    for (const a of this.members) if (!a.isDead) n++;
    return n;
  }

  /** So weit (Tiles) verteilt es sich um die Mitte - größere Tiere und Rudel weiter. */
  get spread(): number {
    const a = this.members[0];
    return a ? a.definition.height * (2 + 1.5 * Math.sqrt(this.size)) : 1;
  }

  /** Ein Tier hat einen Dorfbewohner gesehen: alle fliehen. */
  alert(threat: { x: number; y: number }) {
    this.threat = { x: threat.x, y: threat.y };
    this.alarm = ALARM;
    this.goal = null;
  }

  /** Vor den Tieren: Mitte der lebenden messen, nach der Flucht sammeln, sonst rasten oder weiterziehen. */
  tick(dt: number, s: AnimalSurroundings) {
    this.clock += dt;
    let n = 0;
    let [sx, sy] = [0, 0];
    for (const a of this.members) {
      if (a.isDead) continue;
      sx += a.x;
      sy += a.y;
      n++;
    }
    if (n === 0) return;
    [this.cx, this.cy] = [sx / n, sy / n];
    if (this.alarm > 0) {
      this.alarm -= dt;
      if (this.alarm <= 0) this.gather();
      return;
    }
    if (!this.goal) {
      this.rest -= dt;
      if (this.rest <= 0) this.pickGoal(s);
      return;
    }
    // Warten, bis alle nachgekommen sind.
    const spread = this.spread;
    for (const a of this.members) if (!a.isDead && a.distanceTo(this.x, this.y) > spread + 0.5) return;
    if (Math.hypot(this.goal.x - this.x, this.goal.y - this.y) < 0.5) return this.stop();
    // Zum Ziel, mit einem langsamen Schlenker - so ziehen sie in Bögen.
    const want = Math.atan2(this.goal.y - this.y, this.goal.x - this.x) + 0.5 * Math.sin(this.clock * 0.13 + this.id);
    const diff = Math.atan2(Math.sin(want - this.heading), Math.cos(want - this.heading));
    this.heading += Math.max(-TURN * dt, Math.min(TURN * dt, diff));
    const step = this.members[0].definition.walk * DRIFT * dt;
    for (const turn of [0, 0.5, -0.5, 1, -1]) {
      const h = this.heading + turn;
      // Ein Tile voraus prüfen: dort stehen gleich die Tiere am Rand des Rudels.
      if (!passable(s, this.x, this.y, this.x + Math.cos(h), this.y + Math.sin(h))) continue;
      this.heading = h;
      this.x += Math.cos(h) * step;
      this.y += Math.sin(h) * step;
      return;
    }
    this.stop();
  }

  /** Nach der Flucht: hier ist jetzt die Mitte, alle kommen zusammen. */
  private gather() {
    this.threat = null;
    this.x = this.cx;
    this.y = this.cy;
    this.stop();
  }

  private stop() {
    this.goal = null;
    this.rest = REST[0] + Math.random() * (REST[1] - REST[0]);
  }

  /** Ein Ziel, das sich in gerader Linie erreichen lässt - sonst weiter rasten. */
  private pickGoal(s: AnimalSurroundings) {
    for (let tries = 0; tries < 8; tries++) {
      const h = this.heading + (Math.random() - 0.5) * (tries < 4 ? 2.4 : 6.3);
      const d = TRAVEL[0] + Math.random() * (TRAVEL[1] - TRAVEL[0]);
      let ok = true;
      for (let t = 0.5; t <= d + 1 && ok; t += 0.5) {
        ok = passable(s, this.x + Math.cos(h) * (t - 0.5), this.y + Math.sin(h) * (t - 0.5), this.x + Math.cos(h) * t, this.y + Math.sin(h) * t);
      }
      if (!ok) continue;
      this.goal = { x: this.x + Math.cos(h) * d, y: this.y + Math.sin(h) * d };
      return;
    }
    this.stop();
  }
}
