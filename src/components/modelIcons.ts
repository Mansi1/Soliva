// modelIcons.ts
// Symbole, gezeichnet aus den Modellen des Spiels: für die Rohstoffleiste
// (Eiche, Beerenstrauch, Goldfels, Steinhaufen, Dorfbewohner) und für die
// Befehlsleiste (Gebäude, Tiere - Knöpfe und Porträts; Felder zeichnet cropIcons.ts). Ein eigener
// EntityRenderer auf einem Canvas außerhalb der Seite zeichnet jedes Motiv
// einmal; der Ausschnitt um das, was gezeichnet wurde, wird als Bild-URL
// zurückgegeben. Die Dorfbewohner tragen die Spielerfarbe.

import { ANIMAL_POSE, BUILDING_HEADING, EntityRenderer, POSE, SHAPE, figureProps, type EntityInstance } from '../gl/entityRenderer';
import { groundToWorld, snapCamera } from '../gl/iso';
import { ANIMALS, BUILDINGS, type AnimalKind, type BuildingType, type DepositType, type ResourceKind } from '../world/catalog';
import { cropIcon } from './cropIcons';

export type IconName = ResourceKind | 'population' | 'idle';

type RGB = [number, number, number];

/** Kantenlänge des Symbols in Pixeln - dreimal die angezeigten 34 px, für scharfe Kanten. */
const ICON_SIZE = 102;
/** Canvas, auf dem ein Motiv gezeichnet wird: Platz nach oben für hohe Modelle. */
const STAGE_W = 320;
const STAGE_H = 400;
/** Geräte-Pixel je Tile auf der Bühne - ragt ein Motiv über den Rand, halb so viele. */
const PIXELS_PER_TILE = 220;
/** Rand um das Motiv, Anteil der Kantenlänge. */
const PADDING = 0.04;

const WOOD: RGB = [72, 52, 28];

/** Dorfbewohner(in), stehend und leicht zur Seite gedreht; `u` verschiebt auf dem Bildschirm nach rechts. */
function villager(female: boolean, u: number, color: RGB): EntityInstance[] {
  const at = groundToWorld(u, 0);
  const origin = groundToWorld(0, 0);
  const figure: EntityInstance = {
    x: at.x - origin.x - 0.5, y: at.y - origin.y - 0.5, size: 0.24, color,
    shape: female ? SHAPE.villagerFemale : SHAPE.villager, alpha: 1,
    motion: [Math.PI * 0.2, 0, POSE.stand, 0], accent: WOOD,
  };
  // Mit dem Beil in der Hand, wie im Spiel.
  return [figure, ...figureProps(figure)];
}

/** Was je Symbol zu sehen ist - Farben und Größen wie auf der Karte. */
function scene(name: IconName, player: RGB): EntityInstance[] {
  const one = (shape: number, size: number, color: RGB, heading: number): EntityInstance[] =>
    [{ x: -0.5, y: -0.5, size, color, shape, alpha: 1, motion: [heading, 0, 0, 1] }];
  switch (name) {
    case 'wood': return one(SHAPE.treeOak, 0.6, [42, 97, 52], 0.4);
    // Nahrung als Beerenstrauch - wie im Vorrat: Beeren, Ernte und Wild in einem.
    case 'food': return one(SHAPE.berryBush, 0.45, [62, 115, 52], 0.7);
    case 'gold': return one(SHAPE.goldRock, 0.56, [242, 194, 51], 0.7);
    case 'stone': return one(SHAPE.stoneRock, 0.6, [158, 158, 164], 0.7);
    // Bogen mit Pfeil, von vorn wie ein Gebäude - so sieht man ihn gespannt.
    // Nicht über one(): motion[3] = 1 hieße bei ihm "eingestürzt".
    case 'bows': return [{ x: -0.5, y: -0.5, size: 0.5, color: [0, 0, 0], shape: SHAPE.bow, alpha: 1, motion: [BUILDING_HEADING, 0, 0, 0] }];
    // Frau und Mann nebeneinander.
    case 'population': return [...villager(true, -0.12, player), ...villager(false, 0.12, player)];
    case 'idle': return villager(false, 0, player);
  }
}

const NAMES: IconName[] = ['wood', 'food', 'gold', 'stone', 'population', 'idle'];

let stage: { canvas: HTMLCanvasElement; gl: WebGL2RenderingContext; renderer: EntityRenderer } | null = null;

/** Bühne beim ersten Aufruf anlegen - ein WebGL-Kontext für alle Symbole. */
function getStage() {
  if (stage) return stage;
  const canvas = document.createElement('canvas');
  canvas.width = STAGE_W;
  canvas.height = STAGE_H;
  const gl = canvas.getContext('webgl2', { antialias: true, depth: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
  if (!gl) return null;
  const renderer = new EntityRenderer(gl);
  // Kein Boden, in dem ein Sockel verschwinden könnte.
  renderer.skirts = false;
  stage = { canvas, gl, renderer };
  return stage;
}

/** Rechteck, in dem etwas gezeichnet wurde (Bildschirm-Pixel, y nach unten), oder null. */
function bounds(gl: WebGL2RenderingContext) {
  // readPixels zählt von unten.
  const pixels = new Uint8Array(STAGE_W * STAGE_H * 4);
  gl.readPixels(0, 0, STAGE_W, STAGE_H, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let x0 = STAGE_W, x1 = -1, y0 = STAGE_H, y1 = -1;
  for (let y = 0; y < STAGE_H; y++) {
    for (let x = 0; x < STAGE_W; x++) {
      if (pixels[(y * STAGE_W + x) * 4 + 3] < 8) continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      const top = STAGE_H - 1 - y;
      y0 = Math.min(y0, top); y1 = Math.max(y1, top);
    }
  }
  return x1 < 0 ? null : { x0, x1, y0, y1 };
}

/** Zeichnet ein Motiv und schneidet es quadratisch aus - als PNG-URL. */
function draw(instances: EntityInstance[]): string {
  const { canvas, gl, renderer } = getStage()!;
  let box: ReturnType<typeof bounds> = null;
  for (let zoom = PIXELS_PER_TILE; zoom >= PIXELS_PER_TILE / 8; zoom /= 2) {
    gl.viewport(0, 0, STAGE_W, STAGE_H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // Das Motiv steht auf (0, 0); die Kamera schaut etwas darüber, weil alles nach oben wächst.
    const camera = snapCamera({ centerX: -0.45, centerY: -0.45, pixelsPerTile: zoom, reliefScale: 0 }, STAGE_W, STAGE_H);
    renderer.render(instances, camera, 0);
    box = bounds(gl);
    // Berührt das Motiv den Rand, fehlt vielleicht etwas (die Krone eines Baums).
    if (!box || (box.x0 > 0 && box.y0 > 0 && box.x1 < STAGE_W - 1 && box.y1 < STAGE_H - 1)) break;
  }
  const out = document.createElement('canvas');
  out.width = out.height = ICON_SIZE;
  if (!box) return out.toDataURL();
  const { x0, x1, y0, y1 } = box;
  // Quadrat um das Motiv, das Motiv in der Mitte.
  const side = Math.max(x1 - x0 + 1, y1 - y0 + 1) / (1 - 2 * PADDING);
  const cx = (x0 + x1 + 1) / 2;
  const cy = (y0 + y1 + 1) / 2;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, cx - side / 2, cy - side / 2, side, side, 0, 0, ICON_SIZE, ICON_SIZE);
  return out.toDataURL();
}

/**
 * Alle Symbole als Bild-URLs; `player` färbt die Dorfbewohner. Ohne WebGL2
 * leere Bilder - die Leiste zeigt dann nur die Zahlen.
 */
export function renderIcons(player: RGB): Record<IconName, string> {
  const icons = {} as Record<IconName, string>;
  const ok = getStage() !== null;
  for (const name of NAMES) icons[name] = ok ? draw(scene(name, player)) : '';
  return icons;
}

/** Nur die Symbole mit Dorfbewohnern - nach einem Wechsel der Spielerfarbe. */
export function renderVillagerIcons(player: RGB): Pick<Record<IconName, string>, 'population' | 'idle'> {
  if (!getStage()) return { population: '', idle: '' };
  return { population: draw(scene('population', player)), idle: draw(scene('idle', player)) };
}

// --- Befehlsleiste --------------------------------------------------------

/** Schon gezeichnete Motive - jedes nur einmal je Spielerfarbe. */
const cache = new Map<string, string>();

/** Motiv als Bild-URL, zwischengespeichert unter `key`; ohne WebGL2 leer. */
function cached(key: string, player: RGB, instances: () => EntityInstance[]): string {
  const full = `${key}|${player.join(',')}`;
  const hit = cache.get(full);
  if (hit !== undefined) return hit;
  const st = getStage();
  if (!st) return '';
  st.renderer.playerColor = player;
  const url = draw(instances());
  cache.set(full, url);
  return url;
}

/** Gebäude in Spielerfarbe - das Feld als Weizengarbe (siehe cropIcons.ts). */
export function buildingIcon(type: BuildingType, player: RGB): string {
  if (type === 'farm') return cropIcon('wheat');
  return cached(`building:${type}`, player, () =>
    [{ x: -0.5, y: -0.5, size: BUILDINGS[type].size, color: player, shape: BUILDINGS[type].model, alpha: 1 }]);
}

/** Dorfbewohner(in) in Spielerfarbe. */
export function villagerIcon(female: boolean, player: RGB): string {
  return cached(`villager:${female}`, player, () => villager(female, 0, player));
}

/** Tier, äsend - erlegt liegend. */
export function animalIcon(kind: AnimalKind, dead = false): string {
  const def = ANIMALS[kind];
  return cached(`animal:${kind}:${dead}`, [0, 0, 0], () => [{
    x: -0.5, y: -0.5, size: def.height, color: [0, 0, 0], shape: def.shape, alpha: 1,
    motion: [-Math.PI / 4, 0, dead ? ANIMAL_POSE.dead : ANIMAL_POSE.graze, 0],
  }]);
}

/** Rohstoff im Vorrat als Symbol - z. B. Bogen mit Pfeil im Panel der Waffenkammer. */
export function stockIcon(kind: ResourceKind): string {
  return cached(`stock:${kind}`, [0, 0, 0], () => scene(kind, [0, 0, 0]));
}

/** Vorkommen: Eiche, Beerenstrauch, Gold- oder Steinfels. */
export function resourceIcon(type: DepositType): string {
  return cached(`resource:${type}`, [0, 0, 0], () => scene(type === 'berries' ? 'food' : type, [0, 0, 0]));
}
