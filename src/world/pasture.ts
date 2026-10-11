// pasture.ts
// Weide und Hirte (B27): Tiere einfangen, am Strick durchs Gatter führen,
// hüten (Milch und Wolle holen), schlachten (Leder und Fleisch) - und was
// gezähmte Tiere von der Welt sehen. Eine Weide sind zusammenhängende
// Weide-Tiles (building/Pasture.ts); ringsum Zaun, ein Gatter je Weide.
//
// Gezähmte Tiere bekommen kein eigenes Verhalten: sie ziehen mit ihrem Rudel
// (unit/Herd.ts) wie Wild, nur sehen sie als begehbar allein die Weide und
// keinen Dorfbewohner, vor dem sie fliehen müssten (penSurroundings). Junge
// bekommen sie nach derselben Regel wie Wild (wildlife.ts, births).

import { POSE, SHAPE, type EntityInstance } from '../gl/entityRenderer';
import type { Building } from './building';
import { HUNT, MEAT_KIND, RESOURCE_LABEL, VILLAGER, player, type AnimalKind, type ResourceKind } from './catalog';
import { Herd, type Animal, type AnimalSurroundings, type Villager } from './unit';
import type { TendStep } from './unit/Villager';
import { UNREACHABLE, type VillagerWork } from './villagers';
import type { World } from './world';

type TendTask = { kind: 'tend'; pasture: string; step: TendStep; animal?: number; progress: number; chase?: number };

/**
 * Was ein gezähmtes Tier hergibt. Milch geben nur ausgewachsene Weibchen,
 * Wolle jedes ausgewachsene Schaf: `rate` je Sekunde Spielzeit, höchstens
 * `max` liegen bereit, bis der Hirte sie holt. Leder: so viel gibt die Haut
 * beim Schlachten (ein Junges die Hälfte). Der Hase ist nicht zu zähmen.
 * ponytail: Mengen geschätzt (eine Kuh ~3 Milch je Minute, eine Ladung sind 10);
 * nachstellen, wenn Milch, Wolle oder Leder etwas kosten oder ergeben (B31 Schuhe).
 */
export const TAME: Partial<Record<AnimalKind, { product?: 'milk' | 'wool'; rate: number; max: number; leather: number }>> = {
  cow: { product: 'milk', rate: 1 / 20, max: 6, leather: 8 },
  goat: { product: 'milk', rate: 1 / 40, max: 3, leather: 4 },
  sheep: { product: 'wool', rate: 1 / 45, max: 4, leather: 4 },
  deer: { rate: 0, max: 0, leather: 5 },
  boar: { rate: 0, max: 0, leather: 5 },
};

export const PASTURE = {
  /** Am Strick geht er so viel langsamer (Anteil von VILLAGER.speed). */
  leadPace: 0.5,
  /** Milch und Wolle je Sekunde, die er nimmt. */
  collectRate: 1,
  /** Sekunden, bis ein Tier geschlachtet ist. */
  slaughterTime: 3,
};

/** Ein Rand-Tile der Weide mit Gatter: Tile, Richtung nach draußen (dx, dy). */
export interface Gate { x: number; y: number; dx: number; dy: number }

/** Eine Weide: ihre Tiles ("x,y") und das Gatter. */
export interface PastureGroup { tiles: Set<string>; gate: Gate }

const key = (x: number, y: number) => `${x},${y}`;
/** Die vier Seiten eines Tiles, nach draußen: +x, +y, -x, -y. */
const SIDES: readonly [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];

function isPasture(world: World, x: number, y: number): boolean {
  return world.at(x, y)?.type === 'pasture';
}

/** Gemerkt je Welt, bis Gebäude dazukommen oder wegfallen (buildingsRevision). */
const groupCache = new WeakMap<World, { revision: number; byTile: Map<string, PastureGroup> }>();

/**
 * Die Weiden der Welt: je Weide-Tile ("x,y") seine Weide. Das Gatter liegt
 * am Tile, das der Kamera am nächsten ist (größtes x + y), auf seiner Seite
 * +y, sonst +x - eine davon ist immer Rand.
 * VERIFIED: tests/pasture.test.mjs - 3x3 Tiles sind eine Weide, das Gatter an (8, 2) nach +y.
 */
export function pastureGroups(world: World): Map<string, PastureGroup> {
  const cached = groupCache.get(world);
  if (cached && cached.revision === world.buildingsRevision) return cached.byTile;
  const byTile = new Map<string, PastureGroup>();
  for (const b of world.allBuildings()) {
    if (b.type !== 'pasture' || byTile.has(b.anchor)) continue;
    const tiles = new Set<string>([b.anchor]);
    const todo = [[b.x, b.y]];
    let best = [b.x, b.y];
    while (todo.length > 0) {
      const [x, y] = todo.pop()!;
      if (x + y > best[0] + best[1] || (x + y === best[0] + best[1] && x > best[0])) best = [x, y];
      for (const [dx, dy] of SIDES) {
        const k = key(x + dx, y + dy);
        if (tiles.has(k) || !isPasture(world, x + dx, y + dy)) continue;
        tiles.add(k);
        todo.push([x + dx, y + dy]);
      }
    }
    const [gx, gy] = best;
    const gate = isPasture(world, gx, gy + 1) ? { x: gx, y: gy, dx: 1, dy: 0 } : { x: gx, y: gy, dx: 0, dy: 1 };
    const group = { tiles, gate };
    for (const k of tiles) byTile.set(k, group);
  }
  groupCache.set(world, { revision: world.buildingsRevision, byTile });
  return byTile;
}

/** Die Weide, zu der das Tile (x, y) gehört. */
export function pastureAt(world: World, x: number, y: number): PastureGroup | undefined {
  return pastureGroups(world).get(key(Math.floor(x), Math.floor(y)));
}

/** Wege durchs Gatter: davor, darin, ein Stück in der Weide - dort lässt er das Tier los. */
function gateWay(gate: Gate): { x: number; y: number }[] {
  const [mx, my] = [gate.x + 0.5 + gate.dx * 0.5, gate.y + 0.5 + gate.dy * 0.5];
  return [0.45, -0.3, -0.75].map((d) => ({ x: mx + gate.dx * d, y: my + gate.dy * d }));
}

/**
 * Zaun und Gatter eines Weide-Tiles: an jeder Kante ohne Weide nebenan zwei
 * halbe Zaunstücke (jedes auf seinem Boden - so folgt der Zaun dem Hang),
 * an der Kante des Gatters das Gatter.
 * ponytail: Zaun und Gatter versperren nichts - Dorfbewohner gehen über
 * Weide-Tiles wie über Felder, auch durch den Zaun; nur die Tiere bleiben drin
 * (penSurroundings). Wege um den Zaun suchen, wenn das im Bild stört.
 */
export function pastureInstances(world: World, tile: Building, out: EntityInstance[]) {
  // Das Schild am Gatter in der Spielerfarbe (Paint).
  fenceInstances(tile.x, tile.y, (x, y) => isPasture(world, x, y), pastureAt(world, tile.x, tile.y)?.gate,
      (x, y) => world.groundAt?.(x, y), player.color.toRGB(), out);
}

/** Zaun und Gatter um Tile (x, y) - `pasture`: liegt dort Weide (auch für die Galerie). */
export function fenceInstances(x: number, y: number, pasture: (x: number, y: number) => boolean, gate: Gate | undefined,
                               ground: (x: number, y: number) => number | undefined, color: [number, number, number], out: EntityInstance[]) {
  for (const [dx, dy] of SIDES) {
    if (pasture(x + dx, y + dy)) continue;
    // Das Modell schaut nach vorn (Modell-x) - nach draußen; Zaun und Gatter laufen quer dazu.
    const heading = Math.atan2(dy, dx);
    const [mx, my] = [x + 0.5 + dx * 0.5, y + 0.5 + dy * 0.5];
    if (gate && gate.x === x && gate.y === y && gate.dx === dx && gate.dy === dy) {
      out.push({ x: mx - 0.5, y: my - 0.5, size: 1, color, shape: SHAPE.pasture, alpha: 1, motion: [heading, 0, 0, 0], ground: ground(mx, my) });
      continue;
    }
    for (const s of [-0.25, 0.25]) {
      const [cx, cy] = [mx - dy * s, my + dx * s];
      out.push({ x: cx - 0.5, y: cy - 0.5, size: 0.5, color, shape: SHAPE.pastureFence, alpha: 1, motion: [heading, 0, 0, 0], ground: ground(cx, cy) });
    }
  }
}

/**
 * Was ein gezähmtes Tier von der Welt sieht: begehbar ist nur die Weide (so
 * bleibt es im Zaun - Herd und AnimalBase prüfen jeden Schritt), und kein
 * Dorfbewohner macht ihm Angst. Sonst wie das Wild (`wild`).
 * VERIFIED: tests/pasture.test.mjs - Weidetiere bleiben auf ihren Tiles.
 */
export function penSurroundings(world: World, wild: AnimalSurroundings): AnimalSurroundings {
  return {
    isBlocked: (x, y) => !isPasture(world, x, y),
    isWater: wild.isWater,
    heightAt: wild.heightAt,
    nearestThreat: () => undefined,
  };
}

/** Was es lebend hergibt - oder nichts (Männchen und Junge bei Milch). */
function productOf(a: Animal): 'milk' | 'wool' | undefined {
  const tame = TAME[a.kind];
  if (!tame?.product || !a.grown || a.isDead) return undefined;
  return tame.product === 'milk' && !a.female ? undefined : tame.product;
}

/** Fürs Auswahl-Panel: "Auf der Weide (3 Tiere) · Milch 2/6" - gezähmt, lebend. */
export function pastureText(a: Animal): string {
  const product = productOf(a);
  const ready = product ? ` · ${RESOURCE_LABEL[product]} ${Math.floor(a.produce)}/${TAME[a.kind]!.max}` : '';
  return `Auf der Weide (${a.herd.size} Tiere)${ready}`;
}

/**
 * Je Tick für die gezähmten Tiere: Milch und Wolle wachsen nach. Ein Tier,
 * dessen Weide abgerissen wurde, ist wieder Wild. true, wenn sich etwas
 * geändert hat, das gespeichert werden soll.
 */
export function tickPastures(world: World, dt: number): boolean {
  let changed = false;
  for (const a of world.wildlife.animals) {
    if (!a.tamed || a.isDead) continue;
    if (!isPasture(world, Math.floor(a.x), Math.floor(a.y))) {
      a.tamed = false;
      a.joinHerd(new Herd(a.id, a.x, a.y));
      changed = true;
      continue;
    }
    const product = productOf(a);
    if (!product) continue;
    const tame = TAME[a.kind]!;
    const before = Math.floor(a.produce);
    a.produce = Math.min(tame.max, a.produce + tame.rate * dt);
    if (Math.floor(a.produce) > before) changed = true;
  }
  return changed;
}

/**
 * Was der Hirte tut (Auftrag 'tend'): mit den Schritten der Dorfbewohner aus
 * VillagerWork (gehen, abliefern, Ladung), nur die Abfolge steht hier.
 */
export class PastureWork {
  constructor(private world: World, private work: VillagerWork) {}

  /** Das Weide-Tile, das (x, y) am nächsten liegt - oder keins. */
  private nearestPasture(x: number, y: number): Building | undefined {
    let best: Building | undefined;
    let bestDistance = Infinity;
    for (const b of this.world.allBuildings()) {
      if (b.type !== 'pasture') continue;
      const d = Math.hypot(b.x + 0.5 - x, b.y + 0.5 - y);
      if (d < bestDistance) {
        bestDistance = d;
        best = b;
      }
    }
    return best;
  }

  /**
   * Rechtsklick auf ein Tier (VillagerWork.hunt): ein Weidetier wird
   * geschlachtet - das ist der einzige Weg dazu; zähmbares Wild wird
   * gefangen und zur nächsten Weide gebracht, wenn es eine gibt. false: nicht
   * die Sache der Weide - dann wird gejagt.
   */
  command(villagers: Villager[], a: Animal): boolean {
    if (a.tamed) {
      for (const v of villagers) v.assign({ kind: 'tend', pasture: key(Math.floor(a.x), Math.floor(a.y)), step: 'slaughter', animal: a.id, progress: 0 });
      return true;
    }
    if (a.isDead || !TAME[a.kind]) return false;
    const pasture = this.nearestPasture(a.x, a.y);
    if (!pasture) return false;
    for (const v of villagers) v.assign({ kind: 'tend', pasture: pasture.anchor, step: 'catch', animal: a.id, progress: 0, chase: 0 });
    return true;
  }

  /** Rechtsklick auf die Weide: die Ausgewählten hüten dort. */
  assign(villagers: Villager[], tile: Building) {
    for (const v of villagers) v.assign({ kind: 'tend', pasture: tile.anchor, step: 'tend', progress: 0 });
  }

  /** Ein Tick des Hirten. */
  tick(v: Villager, task: TendTask, dt: number) {
    let group = pastureGroups(this.world).get(task.pasture);
    if (!group) {
      // Sein Tile ist abgerissen: die nächste Weide, sonst ist er frei.
      const [x, y] = task.pasture.split(',').map(Number);
      const near = this.nearestPasture(x, y);
      if (!near) {
        v.assign({ kind: 'idle' });
        v.problem = 'Keine Weide mehr';
        return;
      }
      task.pasture = near.anchor;
      group = pastureGroups(this.world).get(near.anchor)!;
    }
    const a = task.animal !== undefined ? this.world.wildlife.byId(task.animal) : undefined;
    switch (task.step) {
      case 'catch': return this.catch(v, task, a, dt);
      case 'lead': return this.lead(v, task, a, group, dt);
      case 'tend': return this.tend(v, task, group, dt);
      case 'slaughter': return this.slaughter(v, task, a, dt);
      case 'deliver': return this.deliver(v, task, dt);
    }
  }

  /**
   * Hin zum Tier und den Strick darum - ohne Speer wie beim Jagen: bis auf
   * HUNT.reach heran, und aufgeben, wenn es schneller ist oder er es nicht
   * binnen HUNT.chaseLimit Sekunden einholt (VillagerWork.hopeless).
   * VERIFIED: tests/pasture.test.mjs - das Schaf fängt er, das ferne Reh entkommt.
   */
  private catch(v: Villager, task: TendTask, a: Animal | undefined, dt: number) {
    // Schon gefangen oder tot: er hütet.
    if (!a || a.isDead || a.tamed || a.leash > 0) {
      Object.assign(task, { step: 'tend', animal: undefined, chase: undefined });
      return;
    }
    const d = Math.hypot(a.x - v.x, a.y - v.y);
    if (d > HUNT.reach) {
      if (this.work.hopeless(v, task, a, d - HUNT.reach)) {
        v.assign({ kind: 'idle' });
        v.problem = `Zu langsam - ${a.label} entkommt`;
        return;
      }
      task.chase = (task.chase ?? 0) + dt;
      this.work.walk(v, a.x, a.y, HUNT.reach * 0.8, dt);
      return;
    }
    // Der Strick ist dran: es verlässt sein Rudel und geht mit ihm.
    a.leash = 2;
    a.joinHerd(new Herd(a.id, a.x, a.y));
    Object.assign(task, { step: 'lead', progress: 0, chase: undefined });
    this.world.markDirty();
  }

  /** Langsam zur Weide, durchs Gatter, das Tier hinter sich - drin lässt er es los. */
  private lead(v: Villager, task: TendTask, a: Animal | undefined, group: PastureGroup, dt: number) {
    if (!a || a.isDead) {
      Object.assign(task, { step: 'tend', animal: undefined });
      return;
    }
    a.leash = 2;
    const way = gateWay(group.gate);
    const at = way[Math.min(task.progress, way.length - 1)];
    const arrived = this.work.walk(v, at.x, at.y, 0.05, dt * PASTURE.leadPace);
    follow(a, v, dt * PASTURE.leadPace);
    if (!arrived) {
      if (v.problem === UNREACHABLE) {
        // Kein Weg zur Weide: er lässt es laufen.
        a.leash = 0;
        v.assign({ kind: 'idle' });
        v.problem = 'Kein Weg zur Weide';
      }
      return;
    }
    task.progress++;
    if (task.progress < way.length) return;
    this.release(a, group);
    Object.assign(task, { step: 'tend', animal: undefined, progress: 0 });
  }

  /** Auf der Weide los: gezähmt, im Rudel seiner Art auf dieser Weide - oder ein eigenes. */
  private release(a: Animal, group: PastureGroup) {
    a.tamed = true;
    a.leash = 0;
    a.state = 'graze';
    const mate = this.world.wildlife.animals.find((o) => o !== a && o.tamed && !o.isDead && o.kind === a.kind
      && group.tiles.has(key(Math.floor(o.x), Math.floor(o.y))));
    if (mate) a.joinHerd(mate.herd);
    else {
      a.herd.x = a.herd.cx = a.x;
      a.herd.y = a.herd.cy = a.y;
      a.herd.goal = null;
    }
    this.world.markDirty();
  }

  /**
   * Hüten: mit leeren Händen zum nächsten Tier seiner Weide, dessen Euter
   * oder Fell voll ist (TAME.max), kniend nehmen - das Tier hält still -, bis
   * es leer ist; dann von den übrigen, was er dazu tragen kann (je Tier ab
   * einer ganzen Kanne bzw. einem Bündel derselben Ware). Volle Ladung, oder
   * ist nichts mehr da, zum Lager; sonst wartet er am Gatter. Erst volle
   * Tiere: so läuft er nicht für jede Kanne Milch zum Lager.
   * VERIFIED: tests/pasture.test.mjs - Milch und Wolle kommen als "Milch"/"Wolle" ins Dorfzentrum, der Bulle gibt keine.
   */
  private tend(v: Villager, task: TendTask, group: PastureGroup, dt: number) {
    v.problem = null;
    if (v.carrying > 0 && v.carryType !== 'milk' && v.carryType !== 'wool') {
      task.step = 'deliver';
      return;
    }
    // Das Tier, an dem er gerade ist (task.animal), bis es leer ist.
    const current = task.animal !== undefined ? this.world.wildlife.byId(task.animal) : undefined;
    let best = current && current.tamed && productOf(current) && current.produce > 1e-3 ? current : undefined;
    let bestDistance = Infinity;
    for (const a of best ? [] : this.world.wildlife.animals) {
      const product = a.tamed ? productOf(a) : undefined;
      if (!product || (v.carrying > 0 && v.carryType !== product)) continue;
      // Leere Hände: nur volle Tiere; mit Ladung jedes ab einer ganzen Kanne bzw. einem Bündel.
      if (a.produce < (v.carrying <= 0 ? TAME[a.kind]!.max - 1e-6 : 1)) continue;
      if (!group.tiles.has(key(Math.floor(a.x), Math.floor(a.y)))) continue;
      const d = Math.hypot(a.x - v.x, a.y - v.y);
      if (d < bestDistance) {
        bestDistance = d;
        best = a;
      }
    }
    task.animal = best?.id;
    if (!best) {
      if (v.carrying > 0) {
        task.step = 'deliver';
        return;
      }
      const [, inside] = gateWay(group.gate);
      this.work.walk(v, inside.x, inside.y, 0.3, dt);
      return;
    }
    if (!this.work.walk(v, best.x, best.y, 0.15 + best.size * 0.6, dt)) return;
    const product = productOf(best)!;
    best.leash = 2;
    v.heading = Math.atan2(best.y - v.y, best.x - v.x);
    v.pose = POSE.pick;
    this.work.swing(v, dt, 'berries', true);
    this.work.startLoad(v, product, () => RESOURCE_LABEL[product]);
    const take = Math.min(this.world.speedy ? Infinity : PASTURE.collectRate * dt, best.produce, VILLAGER.capacity - v.carrying);
    best.produce -= take;
    v.carrying += take;
    this.world.markDirty();
    // Leer: das nächste - sonst bliebe er bei jedem Tropfen, der nachkommt.
    if (best.produce <= 1e-3) task.animal = undefined;
    if (v.isFull) task.step = 'deliver';
  }

  /**
   * Schlachten - nur auf Befehl (Rechtsklick aufs Weidetier): hin, mit dem
   * Beil, dann zerlegen: erst die Haut (Leder), dann das Fleisch, jede Ladung
   * für sich zum Lager. Danach hütet er.
   * VERIFIED: tests/pasture.test.mjs - eine Kuh gibt Leder und Fleisch.
   */
  private slaughter(v: Villager, task: TendTask, a: Animal | undefined, dt: number) {
    if (!a || (a.isDead && a.food <= 1e-6 && a.produce <= 1e-6)) {
      Object.assign(task, { step: v.carrying > 0 ? 'deliver' : 'tend', animal: undefined, progress: 0 });
      return;
    }
    if (!this.work.walk(v, a.x, a.y, 0.15 + a.size * 0.6, dt)) return;
    v.heading = Math.atan2(a.y - v.y, a.x - v.x);
    this.world.markDirty();
    if (!a.isDead) {
      a.leash = 2;
      v.pose = POSE.work;
      this.work.swing(v, dt, 'soil', false);
      task.progress += this.world.speedy ? 1 : dt / PASTURE.slaughterTime;
      if (task.progress < 1) return;
      a.hp = 0;
      a.state = 'dead';
      a.produce = (TAME[a.kind]?.leather ?? 0) * (a.grown ? 1 : 0.5);
      task.progress = 0;
      return;
    }
    const hide = a.produce > 1e-6;
    const type: ResourceKind = hide ? 'leather' : 'food';
    if (v.carrying > 0 && v.carryType !== type) {
      task.step = 'deliver';
      return;
    }
    v.pose = POSE.pick;
    this.work.swing(v, dt, 'berries', true);
    this.work.startLoad(v, type, () => (hide ? RESOURCE_LABEL.leather : MEAT_KIND));
    const left = hide ? a.produce : a.food;
    const take = Math.min(this.world.speedy ? Infinity : HUNT.butcherRate * dt, left, VILLAGER.capacity - v.carrying);
    if (hide) a.produce -= take;
    else a.food -= take;
    v.carrying += take;
    if (v.isFull || left - take <= 1e-6) task.step = 'deliver';
  }

  /** Zum nächsten Lager, das die Ladung annimmt - dann zurück zum Kadaver oder ans Hüten. */
  private deliver(v: Villager, task: TendTask, dt: number) {
    const type = v.carryType;
    const a = task.animal !== undefined ? this.world.wildlife.byId(task.animal) : undefined;
    const back: TendStep = a?.isDead ? 'slaughter' : 'tend';
    // Abgeladen und wieder draußen (deliverTo zählt die Zeit im Lager herunter).
    if ((!type || v.carrying <= 0) && v.inside <= 0) {
      task.step = back;
      return;
    }
    const site = this.work.nearestDropSite(v, type ?? 'food');
    if (!site) {
      v.problem = `Kein Lager für ${RESOURCE_LABEL[type ?? 'food']} - baue ein Dorfzentrum`;
      return;
    }
    v.problem = null;
    if (this.work.deliverTo(v, site, dt)) task.step = back;
  }

  /** Was er gerade tut, für die Anzeige. */
  describe(v: Villager, task: TendTask): string {
    const a = task.animal !== undefined ? this.world.wildlife.byId(task.animal) : undefined;
    const label = a?.label ?? 'Tier';
    const load = v.carrying > 0 && v.carryType ? ` (${Math.floor(v.carrying)})` : '';
    switch (task.step) {
      case 'catch': return `fängt ${label}`;
      case 'lead': return `führt ${label} zur Weide`;
      case 'slaughter': return (a?.isDead ? `zerlegt ${label}` : `schlachtet ${label}`) + load;
      case 'deliver': return v.carryType ? `bringt ${v.carryType === 'food' ? MEAT_KIND : RESOURCE_LABEL[v.carryType]}${load}` : 'liefert ab';
      case 'tend': return v.carrying > 0 && v.carryType ? `holt ${RESOURCE_LABEL[v.carryType]}${load}` : 'hütet die Tiere';
    }
  }
}

/** Am Strick: das Tier geht hinter dem Dorfbewohner her, einen kurzen Abstand dahinter. */
function follow(a: Animal, v: Villager, dt: number) {
  const keep = 0.2 + a.size;
  const d = Math.hypot(v.x - a.x, v.y - a.y);
  if (d <= keep) {
    a.state = 'graze';
    return;
  }
  const step = Math.min(d - keep, VILLAGER.speed * dt * 1.2);
  a.heading = Math.atan2(v.y - a.y, v.x - a.x);
  a.x += Math.cos(a.heading) * step;
  a.y += Math.sin(a.heading) * step;
  a.stride += step;
  a.state = 'walk';
}
