// crowd.ts
// Dorfbewohner stehen nicht aufeinander und gehen nicht durcheinander
// hindurch: freie Plätze am Ziel (freeSpot), Ausweichen beim Laufen (steer)
// und Auseinanderschieben nach jedem Tick (separate). Ohne Welt, nur Lagen
// und versperrte Tiles - geprüft in tests/crowd.test.mjs.

import type { Blocked } from './pathfinding';

/**
 * Mindestabstand zweier Figuren, Mitte zu Mitte, in Tiles. Eine Figur ist
 * mit den Armen ~0.14 Tiles breit (0.34 hoch, VILLAGER.size); 0.18 Tiles
 * sind ~0.9 m - so passen auch zwei nebeneinander durch eine Lücke von einem Tile.
 */
export const PERSONAL_SPACE = 0.18;
/** Abstand der Plätze, wenn eine Gruppe sich um einen Punkt aufstellt. */
export const FORMATION_GAP = 0.3;
/** Abstand zu versperrten Tiles, damit ein Platz nicht halb im Baum liegt. */
const WALL_MARGIN = 0.12;
/** So weit voraus (Tiles) sieht ein Laufender, wem er ausweichen muss. */
const LOOK_AHEAD = 0.6;
/** Ist sein Ziel besetzt, ist er bis auf so viel (Tiles) angekommen. */
export const CROWDED_ARRIVAL = 0.4;
/** So weit um den Klickpunkt sucht freeSpot einen Platz. */
const SEARCH_RADIUS = 4;

export interface Point {
  x: number;
  y: number;
}

/** Kann eine Figur bei (x, y) stehen, mit etwas Abstand zu versperrten Tiles? */
export function standable(x: number, y: number, blocked: Blocked): boolean {
  for (const [dx, dy] of [[0, 0], [WALL_MARGIN, 0], [-WALL_MARGIN, 0], [0, WALL_MARGIN], [0, -WALL_MARGIN]]) {
    if (blocked(Math.floor(x + dx), Math.floor(y + dy))) return false;
  }
  return true;
}

/**
 * Der Punkt, der (x, y) am nächsten liegt, an dem man stehen kann und der
 * mindestens `gap` von allen `taken` entfernt ist - (x, y) selbst, wenn er
 * frei ist. Gesucht wird Ring um Ring nach außen; null, wenn bis
 * SEARCH_RADIUS nichts frei ist (etwa mitten im See).
 *
 * ponytail: Luftlinie, nicht erreichbar geprüft - am Fluss kann der Platz am
 * anderen Ufer liegen; per findPath prüfen, wenn das im Spiel stört.
 */
export function freeSpot(x: number, y: number, taken: readonly Point[], blocked: Blocked, gap = FORMATION_GAP): Point | null {
  const free = (px: number, py: number) =>
    standable(px, py, blocked) && taken.every((t) => Math.hypot(t.x - px, t.y - py) >= gap - 1e-9);
  if (free(x, y)) return { x, y };
  const step = PERSONAL_SPACE;
  for (let r = step; r <= SEARCH_RADIUS; r += step) {
    const n = Math.max(6, Math.ceil((Math.PI * 2 * r) / step));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (free(px, py)) return { x: px, y: py };
    }
  }
  return null;
}

/**
 * Ist schon ein anderer als `self` auf dem Punkt (x, y)? Auch einer, der
 * läuft: wollen zwei auf denselben Punkt, gelten mit CROWDED_ARRIVAL beide
 * als angekommen, statt sich endlos zu schieben.
 */
export function occupied(self: Point, x: number, y: number, others: Iterable<Point>): boolean {
  for (const o of others) if (o !== self && Math.hypot(o.x - x, o.y - y) < PERSONAL_SPACE) return true;
  return false;
}

/**
 * Laufrichtung (dx, dy, Länge 1) mit Ausweichen: steht oder geht jemand
 * voraus in der eigenen Spur, biegt er seitlich ab - umso stärker, je näher
 * der andere ist. Bei Gegenverkehr weichen beide nach derselben Hand aus
 * (wie auf der Straße), so kommen sie aneinander vorbei statt Nase an Nase
 * stehen zu bleiben.
 *
 * ponytail: weicht nur dem nächsten voraus aus; auf Geschwindigkeits-
 * Hindernisse (ORCA) umstellen, wenn sich im Spiel Gruppen in engen
 * Durchgängen stauen.
 */
export function steer(self: Point, dx: number, dy: number, others: Iterable<Point>): [number, number] {
  let nearest = Infinity;
  let lateral = 0;
  for (const o of others) {
    if (o === self) continue;
    const rx = o.x - self.x, ry = o.y - self.y;
    const ahead = rx * dx + ry * dy;
    if (ahead <= 0 || ahead > LOOK_AHEAD || ahead >= nearest) continue;
    // Seitlicher Abstand, positiv links der Laufrichtung (Normale (-dy, dx)).
    const side = -rx * dy + ry * dx;
    if (Math.abs(side) >= PERSONAL_SPACE) continue;
    nearest = ahead;
    lateral = side;
  }
  if (nearest === Infinity) return [dx, dy];
  // Weg vom anderen; steht er genau voraus, immer nach rechts.
  const away = lateral > 0.02 ? -1 : lateral < -0.02 ? 1 : -1;
  const w = 1.5 * (1 - nearest / LOOK_AHEAD) + 0.5;
  const sx = dx - dy * away * w, sy = dy + dx * away * w;
  const len = Math.hypot(sx, sy);
  return [sx / len, sy / len];
}

/**
 * Schiebt Figuren auseinander, die sich näher als PERSONAL_SPACE sind -
 * beide je zur Hälfte; eine feste (`fixed[i]`, arbeitet gerade) gar nicht,
 * dann die andere ganz. Nie in ein versperrtes Tile (innerhalb des eigenen
 * bleibt erlaubt: Sammler stehen am Baum auf dessen Tile). Ändert x und y
 * der Figuren; true, wenn eine sich bewegt hat.
 *
 * ponytail: prüft jedes Paar (42 Figuren der Demo: simVillagersMs wie
 * vorher, ~0,2 ms auf M3 Pro); nach Lage in ein Raster sortieren, wenn
 * simVillagersMs mit vielen Figuren spürbar steigt.
 */
export function separate(bodies: readonly Point[], fixed: readonly boolean[], blocked: Blocked): boolean {
  let moved = false;
  const move = (b: Point, x: number, y: number) => {
    const same = Math.floor(x) === Math.floor(b.x) && Math.floor(y) === Math.floor(b.y);
    if (!same && blocked(Math.floor(x), Math.floor(y))) return;
    b.x = x;
    b.y = y;
    moved = true;
  };
  // Zwei Durchgänge: ein Schub kann neue Überlappungen machen.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i], b = bodies[j];
        if (fixed[i] && fixed[j]) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= PERSONAL_SPACE) continue;
        // Genau aufeinander: eine feste, aber je Paar andere Richtung.
        const angle = (i * 7 + j) * 2.39996;
        const [ux, uy] = d > 1e-6 ? [dx / d, dy / d] : [Math.cos(angle), Math.sin(angle)];
        const push = PERSONAL_SPACE - d;
        const shareA = fixed[i] ? 0 : fixed[j] ? 1 : 0.5;
        const shareB = 1 - shareA;
        if (shareA > 0) move(a, a.x - ux * push * shareA, a.y - uy * push * shareA);
        if (shareB > 0) move(b, b.x + ux * push * shareB, b.y + uy * push * shareB);
      }
    }
  }
  return moved;
}
