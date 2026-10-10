import { MAX_FLAT_ZONES, packZones, type FlatZone } from './world/flatten';
import { Color, type RGB } from './functions/Color';
import { EntityRenderer, animationTime, type EntityInstance, type StaticBatch } from './gl/entityRenderer';
import { FLOWER_OBJECT_PIXELS, TerrainRenderer } from './gl/terrainRenderer';
import type { Light } from './gl/light';
import { PostRenderer } from './gl/postRenderer';
import { GrassRenderer } from './gl/grassRenderer';
import { ParticleRenderer } from './gl/particleRenderer';
import { MAX_SOURCES, ParticleSources } from './particles';
import { DRAW_ORDER, LAYER_KEYS, type LayerKey, type Pass } from './layers';
import { gpuFrameBegin, gpuFrameEnd } from './gpuTimer';
import {
  MAX_RELIEF,
  groundToWorld,
  screenToGround,
  setViewElevation,
  snapCamera,
  viewElevation,
  viewGroundV,
  viewRotation,
  viewZScreen,
  visibleWorldRect,
  worldToGround,
  type GpuCamera,
  type IsoView,
} from './gl/iso';
import {
  FractalNoise,
  MapGenerator,
  type MapTile,
  SimplexNoise,
  TERRAIN_LEVELS,
  type TileType,
} from './noise';

export type ResourceType = "none" | "wood" | "gold" | "stone" | "berries";

/**
 * Pro Biom ein Farbverlauf [tief/matt, hoch/hell]. Innerhalb eines Bioms wird
 * zwischen beiden interpoliert - nach Höhe und einem feinen Rauschen. Dadurch
 * wird aus einer einfarbigen Fläche eine Textur.
 */
export const TILE_TYPE_GRADIENT: Record<TileType, [Color, Color]> = {
  deep_water: [Color.rgb(10, 26, 62), Color.rgb(24, 56, 108)],
  water: [Color.rgb(30, 74, 134), Color.rgb(66, 134, 180)],
  beach: [Color.rgb(206, 188, 140), Color.rgb(238, 224, 182)],
  desert: [Color.rgb(186, 146, 82), Color.rgb(222, 190, 124)],
  grass: [Color.rgb(82, 122, 56), Color.rgb(138, 174, 86)],
  forest: [Color.rgb(30, 70, 42), Color.rgb(62, 108, 60)],
  mountain: [Color.rgb(84, 78, 74), Color.rgb(178, 172, 166)],
  snow: [Color.rgb(200, 214, 226), Color.rgb(250, 253, 255)],
};

/** Repräsentative Einzelfarbe pro Biom - für Legenden und Fallbacks. */
export const TILE_TYPE_COLOR: Record<TileType, Color> = Object.fromEntries(
  (Object.keys(TILE_TYPE_GRADIENT) as TileType[]).map((type) => {
    const [lo, hi] = TILE_TYPE_GRADIENT[type];
    const a = lo.toRGB();
    const b = hi.toRGB();
    return [type, Color.rgb((a[0] + b[0]) >> 1, (a[1] + b[1]) >> 1, (a[2] + b[2]) >> 1)];
  }),
) as Record<TileType, Color>;

export const TILE_TYPE_LABEL: Record<TileType, string> = {
  deep_water: "Tiefsee",
  water: "Wasser",
  beach: "Strand",
  desert: "Wüste",
  grass: "Wiese",
  forest: "Wald",
  mountain: "Gebirge",
  snow: "Schnee",
};

export const RESOURCE_TYPE_LABEL: Record<ResourceType, string> = {
  none: "-",
  wood: "Holz",
  gold: "Gold",
  stone: "Stein",
  berries: "Beeren",
};

export const RESOURCE_TYPE_COLORS: Record<ResourceType, Color> = {
  none: Color.rgb(0, 0, 0),
  wood: Color.rgb(72, 52, 28),
  gold: Color.rgb(198, 162, 48),
  stone: Color.rgb(124, 126, 134),
  berries: Color.rgb(168, 52, 62),
} as const;

/**
 * Eine Regel: auf `biome` entsteht `type`, sobald das Ressourcen-Rauschen über
 * `threshold` liegt und das feinere Häufchen-Rauschen über `cluster`. Das
 * erste legt grob fest, in welcher Gegend etwas vorkommt, das zweite teilt die
 * Gegend in kleine Vorkommen von einigen Tiles - wie in AoE2 ein paar
 * Beerensträucher oder ein Häufchen Stein statt einer ganzen Wiese voll.
 * `threshold: -Infinity` heißt: in jeder Gegend - jeder Wald trägt Holz, und
 * Beeren gibt es auf der ganzen Wiese. Die Menge ist (r + 1) * yield,
 * abgerundet, mindestens yield (r unter 0 zählt wie 0).
 *
 * Mit `clump` statt Häufchen-Rauschen: runde Gruppen dicht an dicht, je eine
 * in manchen Zellen eines Rasters (siehe ResourceClump) - Beerensträucher
 * stehen so zusammen wie in AoE2, statt als lange Streifen.
 *
 * Die Reihenfolge ist Teil der Regel - die erste passende gewinnt. Gold steht
 * deshalb vor Stein: beide liegen im Gebirge, Gold nur in der oberen Spitze
 * der Verteilung, der Rest wird Stein.
 *
 * Diese Tabelle ist die einzige Quelle für die Schwellen; resourceFromNoise()
 * liest sie.
 */
export interface ResourceRule {
  biome: TileType;
  type: Exclude<ResourceType, "none">;
  threshold: number;
  /**
   * Schwelle fürs Häufchen-Rauschen (-1..1); unter -1 zählt es nicht (Wälder).
   * Mit `clump` ist der Wert 1 in der Mitte einer Gruppe und 0 an ihrem Rand.
   */
  cluster: number;
  yield: number;
  clump?: ResourceClump;
}

/**
 * Gruppen statt Häufchen-Rauschen: Die Welt ist in Zellen von `cell` Tiles
 * geteilt; mit der Wahrscheinlichkeit `chance` liegt in einer Zelle eine
 * runde Gruppe mit Radius `radius` Tiles (bei 1,5 sind das 6-9 Tiles), ganz
 * innerhalb der Zelle - so bleiben zwischen den Gruppen Wege frei.
 */
export interface ResourceClump {
  cell: number;
  radius: number;
  chance: number;
}

export const RESOURCE_RULES: readonly ResourceRule[] = [
  { biome: "forest", type: "wood", threshold: -Infinity, cluster: -2, yield: 50 },
  { biome: "mountain", type: "gold", threshold: 0.4, cluster: 0.75, yield: 40 },
  { biome: "mountain", type: "stone", threshold: 0.1, cluster: 0.72, yield: 40 },
  {
    biome: "grass", type: "berries", threshold: -Infinity, cluster: 0, yield: 30,
    clump: { cell: 12, radius: 1.5, chance: 0.3 },
  },
];

/** Deterministischer Zufall 0..1 je Zelle, Kanal und Welt. */
function cellHash(x: number, y: number, channel: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(channel, 2246822519) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Wert der Gruppe am Tile (x, y): 1 in der Mitte, 0 am Rand, darunter außerhalb. */
export function clumpValue(x: number, y: number, clump: ResourceClump, seed: number): number {
  const cx = Math.floor(x / clump.cell);
  const cy = Math.floor(y / clump.cell);
  if (cellHash(cx, cy, 0, seed) >= clump.chance) return -1;
  // Mitte so, dass die ganze Gruppe in der Zelle liegt.
  const margin = clump.radius + 1;
  const span = clump.cell - 2 * margin;
  const mx = cx * clump.cell + margin + cellHash(cx, cy, 1, seed) * span;
  const my = cy * clump.cell + margin + cellHash(cx, cy, 2, seed) * span;
  return 1 - Math.hypot(x + 0.5 - mx, y + 0.5 - my) / clump.radius;
}

/** Zahl aus dem Namen der Welt - für clumpValue(). */
function seedNumber(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return h;
}

/**
 * Maßstab des Häufchen-Rauschens: ein Vorkommen misst einige Tiles. Jede
 * Regel liest es an einer eigenen Stelle (RESOURCE_CLUSTER_OFFSET * Index),
 * damit Stein und Gold nicht in denselben Häufchen liegen.
 */
const RESOURCE_CLUSTER_SCALE = 0.075;
const RESOURCE_CLUSTER_OFFSET = [40, 68] as const;

/**
 * Wertet RESOURCE_RULES aus - erste passende Regel gewinnt. `cluster(i)` ist
 * das Häufchen-Rauschen (bzw. der Wert der Gruppe) für Regel i an diesem Tile.
 */
export function resourceFromNoise(
  tileType: TileType,
  r: number,
  cluster: (rule: number) => number,
): { type: ResourceType; amount: number } {
  for (let i = 0; i < RESOURCE_RULES.length; i++) {
    const rule = RESOURCE_RULES[i];
    if (rule.biome === tileType && r > rule.threshold && (rule.cluster < -1 || cluster(i) > rule.cluster)) {
      return { type: rule.type, amount: Math.floor((Math.max(r, 0) + 1) * rule.yield) };
    }
  }
  return { type: "none", amount: 0 };
}

export interface RenderTile extends MapTile {
  resource: ResourceType;
  resourceAmount: number; // 0-100
  /** Einmal bei der Chunk-Erzeugung berechnet. */
  rgb: RGB;
}

/**
 * Wasser bekommt eine durchgehende Tiefenrampe statt zweier Farbflächen -
 * sonst zeichnet die Grenze deep_water/water sichtbare Tintenkleckse ins Meer.
 */
const WATER_RAMP: RGB[] = [
  [96, 166, 202], // Uferlinie
  [44, 104, 162],
  [22, 58, 112],
  [8, 22, 56], // tiefste Stelle
];
/** Farbe der Brandung direkt am Ufer. */
const SURF: RGB = [178, 216, 224];

/** Weltmaßstab der Ressourcen-Vorkommen (1/RESOURCE_SCALE Tiles pro Einheit). */
const RESOURCE_SCALE = 0.009;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const byte = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/** Höhen-Band, in dem ein Biom liegt - für die Interpolation innerhalb des Bioms. */
function heightBand(type: TileType): [number, number] {
  switch (type) {
    case "deep_water":
      return [-1, TERRAIN_LEVELS.deepWater];
    case "water":
      return [TERRAIN_LEVELS.deepWater, TERRAIN_LEVELS.sea];
    case "beach":
      return [TERRAIN_LEVELS.sea, TERRAIN_LEVELS.shore];
    case "mountain":
      return [TERRAIN_LEVELS.hill, 1];
    case "snow":
      return [TERRAIN_LEVELS.peak, 1];
    default:
      return [TERRAIN_LEVELS.shore, TERRAIN_LEVELS.hill];
  }
}

/**
 * Endfarbe eines Tiles. Wasser bekommt eine Tiefen-Rampe und kaum Schattierung,
 * Land bekommt Hillshading aus der Hangneigung - das ist der eigentliche Grund,
 * warum die Karte nach Gelände aussieht und nicht nach Farbflecken.
 */
export function getTileRGB(tile: MapTile & { resource?: ResourceType; resourceAmount?: number }): RGB {
  const isWater = tile.tileType === "deep_water" || tile.tileType === "water";
  let r: number;
  let g: number;
  let bl: number;

  if (isWater) {
    // 0 = Uferlinie, 1 = tiefste Stelle. Die Wurzel zieht die Farbänderung an
    // die Küste, wo man sie sieht, statt sie im tiefen Meer zu verschenken.
    // Leichtes Dithern über das Detail-Rauschen, sonst sind die Stützstellen
    // der Rampe als konzentrische Streifen sichtbar (Mach-Banding).
    const depth = clamp01(
      (TERRAIN_LEVELS.sea - tile.height) / (TERRAIN_LEVELS.sea + 1) +
        (tile.variation - 0.5) * 0.03,
    );
    const pos = Math.pow(depth, 0.7) * (WATER_RAMP.length - 1);
    const i = Math.min(WATER_RAMP.length - 2, Math.floor(pos));
    const raw = pos - i;
    const f = raw * raw * (3 - 2 * raw);
    r = lerp(WATER_RAMP[i][0], WATER_RAMP[i + 1][0], f);
    g = lerp(WATER_RAMP[i][1], WATER_RAMP[i + 1][1], f);
    bl = lerp(WATER_RAMP[i][2], WATER_RAMP[i + 1][2], f);

    // Brandungssaum im ganz flachen Wasser
    const surf = Math.pow(clamp01(1 - depth / 0.16), 2) * 0.42;
    if (surf > 0) {
      r = lerp(r, SURF[0], surf);
      g = lerp(g, SURF[1], surf);
      bl = lerp(bl, SURF[2], surf);
    }
  } else {
    const [lo, hi] = TILE_TYPE_GRADIENT[tile.tileType];
    const [bandLo, bandHi] = heightBand(tile.tileType);

    const rel = clamp01((tile.height - bandLo) / (bandHi - bandLo || 1));
    const t = clamp01(0.2 + rel * 0.62 + (tile.variation - 0.5) * 0.3);

    const a = lo.toRGB();
    const b = hi.toRGB();
    r = lerp(a[0], b[0], t);
    g = lerp(a[1], b[1], t);
    bl = lerp(a[2], b[2], t);
  }

  const light = 1 + tile.shade * (isWater ? 0.08 : 0.42);
  r *= light;
  g *= light;
  bl *= light;

  return [byte(r), byte(g), byte(bl)];
}

/**
 * Farben und Skalen, die der WebGL-Shader als Uniforms bekommt. Die Reihenfolge
 * der Biome muss zu den B_*-Konstanten im Shader passen - das ist genau die
 * Deklarationsreihenfolge von TILE_TYPE_GRADIENT.
 */
export const TERRAIN_PALETTE = {
  biomeLo: (Object.keys(TILE_TYPE_GRADIENT) as TileType[]).map((t) => TILE_TYPE_GRADIENT[t][0]),
  biomeHi: (Object.keys(TILE_TYPE_GRADIENT) as TileType[]).map((t) => TILE_TYPE_GRADIENT[t][1]),
  waterRamp: WATER_RAMP,
  surf: SURF,
};

/**
 * Das Gelände für die Spiel-Logik: je Tile Geländeart, Höhe, Feuchte und das
 * Vorkommen, das der Generator dort hinlegt. Das Bild kommt aus dem Shader;
 * hier wird ein Tile bei Bedarf berechnet - ein paar Mikrosekunden, ohne Cache.
 */
export class Terrain {
  private resourceNoise: FractalNoise;
  private clusterNoise: SimplexNoise;
  private clumpSeed: number;

  constructor(private mapGen: MapGenerator, seed: string) {
    // Wenige Oktaven + niedrige Frequenz: Ressourcen sollen zusammenhängende
    // Vorkommen bilden, kein Konfetti über die ganze Karte.
    this.resourceNoise = new FractalNoise(new SimplexNoise(seed + "_resources"), 2, 0.5, 2);
    this.clusterNoise = new SimplexNoise(seed + "_resource_clusters");
    this.clumpSeed = seedNumber(seed + "_resource_clumps");
  }

  /** Häufchen-Rauschen bzw. Wert der Gruppe für Regel `rule` an Tile (x, y). */
  private cluster(x: number, y: number) {
    return (rule: number) => {
      const clump = RESOURCE_RULES[rule].clump;
      if (clump) return clumpValue(x, y, clump, this.clumpSeed + rule);
      return this.clusterNoise.noise2D(
          x * RESOURCE_CLUSTER_SCALE + rule * RESOURCE_CLUSTER_OFFSET[0],
          y * RESOURCE_CLUSTER_SCALE + rule * RESOURCE_CLUSTER_OFFSET[1]);
    };
  }

  private generateResources(tile: MapTile): { type: ResourceType; amount: number } {
    // Ressourcen spawnen nur auf passendem Terrain. Die Schwellen in
    // RESOURCE_RULES passen zur Verteilung von noise2D (sd ~0.6, -1..1).
    const r = this.resourceNoise.noise2D(tile.x * RESOURCE_SCALE, tile.y * RESOURCE_SCALE);
    return resourceFromNoise(tile.tileType, r, this.cluster(tile.x, tile.y));
  }

  /** Nur das Vorkommen und die Höhe eines Tiles - billiger als getTile(). */
  resourceAt(x: number, y: number): { height: number; type: ResourceType; amount: number; tileType: TileType } {
    const terrain = this.mapGen.terrainAt(x, y);
    const r = this.resourceNoise.noise2D(x * RESOURCE_SCALE, y * RESOURCE_SCALE);
    const res = resourceFromNoise(terrain.tileType, r, this.cluster(x, y));
    return { height: terrain.height, type: res.type, amount: res.amount, tileType: terrain.tileType };
  }

  getTile(worldX: number, worldY: number): RenderTile {
    const tile = this.mapGen.getTile(Math.floor(worldX), Math.floor(worldY));
    const res = this.generateResources(tile);
    const render = { ...tile, resource: res.type, resourceAmount: res.amount } as RenderTile;
    render.rgb = getTileRGB(render);
    return render;
  }
}

/** Kleinste Zoomstufe in CSS-Pixeln je Tile (siehe game/Camera.ts) - kleiner wird nichts vorberechnet. */
const MIN_TILE_SIZE = 1;

/**
 * Hauptansicht in isometrischer 3D-Sicht. Das Gelände entsteht komplett auf der
 * GPU, die Gebäude kommen als zweiter, instanzierter Durchgang darüber.
 */
/** CSS-Pixel je Tile der Zoomstufen 1 bis 5 - für sie wird vorausgerechnet. */
const BAKE_TILE_SIZES = [8, 16, 32, 64, 128];

export class MapRenderer {
  private terrain: TerrainRenderer;
  private entities: EntityRenderer;
  /** Post-Effekte hinter der ganzen Szene (FXAA, Glühen, Farbe, Regen). */
  private post: PostRenderer;
  /** Grashalme in der Wiese, nur herangezoomt. */
  private grass: GrassRenderer;
  /** Partikel (Bienen, Glitzern, Gischt, Schutt ...) - main.ts füllt die Quellen je Bild. */
  private particleRenderer: ParticleRenderer;
  readonly particles = new ParticleSources();
  /** Ohne Post-Effekte zeichnet die Szene direkt ins Canvas (Prüfschalter ?ohneEffekte). */
  postEnabled = true;
  /**
   * Stärke des Reliefs, 1 = voll, gegen 0 flach. Zum Flachlegen, um hinter
   * Berge zu sehen. Nie ganz 0: das wäre für den Cache "kein Relief" und
   * würde ihn neu befüllen.
   */
  relief = 1;

  /** Sonne und Himmel für Gelände und Modelle (game/Lighting.ts) - die Übersichtskarte bleibt bei der festen Sonne. */
  set light(light: Light) {
    this.terrain.light = light;
    this.entities.light = light;
  }

  /**
   * CSS-Pixel je Tile, in denen der Gelände-Cache gerade berechnet ist. Beim
   * weichen Zoomen bleibt er stehen und wird nur gestreckt - neu berechnet
   * wird erst, wenn die Zoomstufe erreicht ist, oder beim Herauszoomen, sobald
   * der Cache das Bild nicht mehr abdeckt.
   */
  private cacheTileSize = 0;
  /**
   * CSS-Pixel je Tile am Zoomziel (siehe Camera.targetTileSize). Liegt es
   * über der Stufe des Caches, wird die Zielstufe schon vorberechnet, während
   * der Zoom noch hingleitet.
   */
  targetTileSize = 0;
  /**
   * Wird gerade geneigt? Dann bleibt der Gelände-Cache auf seiner
   * Bodenstauchung und wird nur gestreckt; neu berechnet wird, wenn der
   * Blickwinkel steht - oder wenn die Streckung zu groß wird.
   */
  tilting = false;
  /** Bodenstauchung, für die der Gelände-Cache gerade berechnet ist (0 = noch keine). */
  private cacheGroundV = 0;

  /**
   * Stehen die Blumen als 3D-Objekte in der Wiese? Hängt an der Stufe des
   * Gelände-Caches, nicht am Zoom: so malt er sie nie zugleich als Tupfen.
   */
  /**
   * Weltpunkt, den man in der Bildmitte sieht (mit Geländehöhe) - Gras und
   * Steine liegen um ihn. camera.x/y ist der Punkt auf Meereshöhe; im Gebirge
   * lägen sie sonst weit neben dem Bild. Setzt main.ts, wenn sich die Ansicht ändert.
   */
  seenCenter: { x: number; y: number } | null = null;

  /**
   * Texel des Gelände-Caches je CSS-Pixel: auf jeder Zoomstufe 1 Texel je
   * Bildpunkt - mehr sähe man nicht (der Cache hat keine Mipmaps), weniger
   * ist weicher. Früher 1,5 auf Retina (44 % weniger Texel), als Zoom und
   * Pannen noch alles live rechneten; heute kommt das meiste aus dem Speicher
   * (TileStore) und der vorausgerechneten nächsten Stufe.
   * ponytail: Deckel 2 für Geräte mit Pixel-Verhältnis 3; als Einstellung
   * anbieten, wenn ein schwächeres Gerät weniger braucht.
   */
  get cacheRatio(): number {
    return Math.min(this.pixelRatio, 2);
  }

  /**
   * Abschalter aus dem Entwickler-Panel: diese Ebenen (layers.ts) nicht
   * zeichnen bzw. den Boden nicht vorausrechnen (bake) - so misst man, was sie
   * kosten (Bildzeit ohne Deckel vorher und nachher), und sieht, was wozu
   * gehört. Die Kosten des flachen Geländes zeigt schon die Leertaste.
   */
  readonly off = Object.fromEntries([...LAYER_KEYS, 'bake'].map((key) => [key, false])) as Record<LayerKey | 'bake', boolean>;
  /** Reihenfolge der Durchgänge (layers.ts) - im Entwickler-Panel zum Testen umsortierbar (movePass). */
  readonly order: Pass[] = [...DRAW_ORDER];
  /** Post-Effekte laut Einstellungen und Regen laut Wetter - render nimmt davon, was nicht abgeschaltet ist. */
  private effects = { fxaa: true, grading: true, bloom: true, rain: 0 };

  /** Mitten der Gebäudegruppen des Spielers - um sie herum wird vorausgerechnet (TerrainRenderer.bake). */
  bakeBuildings: { x: number; y: number }[] = [];

  /** Bodenhöhe (Tiles, grob, ohne Relief-Stärke) für peakReach - setzt main.ts. */
  groundHeight: ((x: number, y: number) => number) | null = null;
  private reachKey = '';
  private reachZ: number = MAX_RELIEF;

  /**
   * Wie weit (Tiles Höhe) Gelände unter dem Bildrand ins Bild ragen kann (Plan
   * 5.2): grob abgetastet, bis zu der Tiefe, aus der der höchste mögliche Berg
   * noch hereinragte. Ein Punkt d v-Einheiten unter dem Rand ragt herein, wenn
   * zScreen * z > d - gebraucht wird bis zum tiefsten solchen Punkt. Vorher galt
   * pauschal der höchste Berg: im Flachland eine ganze Bildhöhe Cache und
   * Gitter umsonst. Neu gemessen, wenn sich die Ansicht um ein paar Tiles bewegt.
   */
  private peakReach(camera: GpuCamera, width: number, height: number): number {
    const height_ = this.groundHeight;
    if (!height_ || camera.reliefScale <= 0) return MAX_RELIEF;
    const ppt = camera.pixelsPerTile;
    const halfU = width / 2 / ppt;
    const halfV = height / 2 / ppt;
    const step = Math.max(1, (2 * halfU) / 24);
    const { u: cu, v: cv } = worldToGround(camera.centerX, camera.centerY);
    const key = `${Math.round(cu / step)},${Math.round(cv / step)},${halfU.toFixed(1)},${viewRotation()},${viewElevation()}`;
    if (key === this.reachKey) return this.reachZ;
    const zs = viewZScreen();
    const bottom = cv + halfV;
    let deepest = 0;
    for (let d = 0; d <= zs * MAX_RELIEF; d += step) {
      for (let u = cu - halfU - step; u <= cu + halfU + step; u += step) {
        const p = groundToWorld(u, bottom + d);
        if (zs * height_(p.x, p.y) > d) deepest = d;
      }
    }
    // Eine Stufe tiefer und zwei Tiles Höhe Luft: zwischen den Stichproben und
    // im Feindetail (grob nicht mitgerechnet) kann es höher sein.
    this.reachKey = key;
    this.reachZ = Math.min(MAX_RELIEF, (deepest + step) / zs + 2);
    return this.reachZ;
  }

  /** Drahtgitter des Geländes (Entwickler-Panel): 0 aus, 1 über dem Gelände, 2 nur Gitter. */
  set terrainWire(mode: number) {
    this.terrain.wire = mode;
  }

  /** Zellgröße des Geländegitters in Tiles (Entwickler-Panel, Ground.groundAt). */
  get terrainCellTiles(): number {
    return this.terrain.cellTiles;
  }
  set terrainCellTiles(tiles: number) {
    this.terrain.cellTiles = tiles;
  }

  /** Gelände im Bild vollständig (für das Ladeschild, main.ts). */
  get terrainComplete(): boolean {
    return this.terrain.complete;
  }

  /** Nichts mehr zu füllen: Bild, Vorrat und Nachbarstufen fertig. */
  get terrainSettled(): boolean {
    return this.terrain.settled;
  }

  /** Beim Laden mehr Gelände je Bild füllen - das Ladeschild verdeckt es ohnehin. */
  set loading(on: boolean) {
    // Neu beginnendes Laden: was bisher fertig war, gilt nicht mehr (andere Stufe).
    if (on && !this.terrain.boost) this.terrain.complete = false;
    this.terrain.boost = on;
  }

  get flowerObjects(): boolean {
    return this.cacheTileSize >= FLOWER_OBJECT_PIXELS;
  }

  constructor(
      canvas: HTMLCanvasElement,
      seed: string,
      public tileSize: number = 8,
      public pixelRatio: number = 1,
  ) {
    this.terrain = new TerrainRenderer(canvas, seed, TERRAIN_PALETTE);
    this.entities = new EntityRenderer(this.terrain.context);
    this.post = new PostRenderer(this.terrain.context, () => this.pixelRatio);
    this.particleRenderer = new ParticleRenderer(this.terrain.context, MAX_SOURCES);
    const grass = TILE_TYPE_GRADIENT.grass;
    this.grass = new GrassRenderer(this.terrain.context, grass[0].toRGB(), grass[1].toRGB());
    this.entities.off = this.off;
  }

  /** Regen vor der Kamera, 0..1 (game/Lighting.ts). */
  set rain(amount: number) {
    this.effects.rain = amount;
  }

  /** Welche Post-Effekte laufen (Einstellungen). */
  setEffects(fxaa: boolean, grading: boolean, bloom: boolean) {
    Object.assign(this.effects, { fxaa, grading, bloom });
  }

  /**
   * @param centerX Welt-Tile in der Bildmitte
   */
  /** Spielerfarbe für die Pfosten der Felder (0..255). */
  setPlayerColor(rgb: [number, number, number]) {
    this.entities.playerColor = rgb;
  }

  /** Feste Puffer für Instanzen, die sich nicht ändern (world/resources.ts). */
  createBatch(instances: readonly EntityInstance[]): StaticBatch {
    return this.entities.createBatch(instances);
  }

  deleteBatch(batch: StaticBatch) {
    this.entities.deleteBatch(batch);
  }

  /** Unter so vielen CSS-Pixeln je Tile zeichnen Bäume als Bild (0: nie) - Einstellung "Bäume als Bild". */
  set billboardBelow(cssPixelsPerTile: number) {
    this.entities.billboardBelow = cssPixelsPerTile;
  }

  /** Ob im letzten Bild Bäume als Bild gezeichnet wurden. */
  get billboardsActive(): boolean {
    return this.entities.billboardsActive;
  }

  /** Umgepflügte Äcker für den Gelände-Shader (siehe TerrainRenderer.setFields). */
  setFields(x: number, y: number, data: Uint8Array | null) {
    this.terrain.setFields(x, y, data);
  }

  /** Flächen, die unter Gebäuden eingeebnet werden - Gelände und Gebäude gleich. */
  setFlatZones(zones: readonly FlatZone[]) {
    const data = packZones(zones);
    const count = Math.min(zones.length, MAX_FLAT_ZONES - 1);
    this.terrain.flatZones = data;
    this.terrain.flatCount = count;
    this.entities.flatZones = data;
    this.entities.flatCount = count;
  }

  /** false, wenn in diesem Bild nichts gezeichnet wurde - dann steht noch das letzte. */
  render(
      centerX: number,
      centerY: number,
      mouseTileX?: number,
      mouseTileY?: number,
      overlay: EntityInstance[] = [],
      batches: readonly StaticBatch[] = [],
  ): boolean {
    const canvas = this.terrain.context.canvas;
    // Auf einer Zoomstufe (Zweierpotenz) genau so fein wie das Bild; dazwischen
    // die bisherige Stufe, höchstens aber die nächstkleinere - deren Cache
    // deckt das ganze Bild ab.
    const level = 2 ** Math.floor(Math.log2(this.tileSize) + 1e-9);
    this.cacheTileSize = level === this.tileSize ? level : Math.min(this.cacheTileSize || level, level);
    // Beim Neigen: flacher gesehen deckt der gestreckte Cache nur so weit ab,
    // wie seine Blase reicht (bis 1,25), steiler wird er unscharf (ab 1/1,6).
    const groundV = viewGroundV();
    const stretch = this.cacheGroundV / groundV;
    if (!this.tilting || !this.cacheGroundV || stretch > 1.25 || stretch < 1 / 1.6) this.cacheGroundV = groundV;
    // Die Stufe, auf der der Zoom zur Ruhe kommen wird.
    const goal = 2 ** Math.ceil(Math.log2(this.targetTileSize || this.tileSize) - 1e-9);
    const camera = snapCamera({
      centerX,
      centerY,
      pixelsPerTile: this.tileSize * this.pixelRatio,
      cachePixelsPerTile: this.cacheTileSize * this.cacheRatio,
      cacheGroundV: this.cacheGroundV,
      // Beim Hineinzoomen zuerst die Zielstufe, sonst immer die nächstfeinere -
      // auch beim Scrollen wandert sie mit (aus dem Speicher oder mit dem
      // übrigen Budget), und Hineinzoomen trifft sie fertig an. Die zwei
      // nächstgröberen liegen fürs Herauszoomen bereit; reicht der Pool
      // (MAX_CACHES) nicht, fällt die gröbste weg.
      prefetchPixelsPerTile: [goal > this.cacheTileSize ? goal : this.cacheTileSize * 2, this.cacheTileSize / 2, this.cacheTileSize / 4]
          .filter((t) => t >= MIN_TILE_SIZE && t <= BAKE_TILE_SIZES[BAKE_TILE_SIZES.length - 1])
          .map((t) => t * this.cacheRatio),
      reliefScale: this.relief,
    }, canvas.width, canvas.height);

    this.terrain.hoverTile =
      mouseTileX !== undefined && mouseTileY !== undefined
        ? { x: mouseTileX, y: mouseTileY }
        : null;

    // Nichts gezeichnet: das letzte Bild bleibt stehen - ohne Figuren darüber.
    // Alle Effekte aus und kein Regen: direkt ins Canvas, ohne Umweg.
    const off = this.off;
    this.post.fxaa = this.effects.fxaa && !off.fxaa;
    this.post.grading = this.effects.grading && !off.grading;
    this.post.bloom = this.effects.bloom && !off.bloom;
    this.post.rain = off.weather ? 0 : this.effects.rain;
    const post = this.postEnabled && this.post.active;
    if (post) this.post.begin();
    this.terrain.time = animationTime();
    this.terrain.pixelRatio = this.pixelRatio;
    this.terrain.reachZ = this.peakReach(camera, canvas.width, canvas.height);
    // Vorausrechnen auf allen Zoomstufen, zuerst um das, was man sieht.
    this.terrain.bakeScales = BAKE_TILE_SIZES.map((t) => t * this.cacheRatio);
    this.terrain.bakeFocus = [this.seenCenter ?? { x: centerX, y: centerY }, ...this.bakeBuildings];
    this.terrain.cacheRatio = this.cacheRatio;
    this.terrain.baking = !off.bake;
    this.terrain.hide = (off.terrain ? 1 : 0) | (off.water ? 2 : 0);
    gpuFrameBegin();
    if (!this.terrain.render(camera)) {
      gpuFrameEnd();
      this.post.cancel();
      return false;
    }
    this.entities.groundStep = this.terrain.gridCell;
    // Mindestens acht Geräte-Pixel: kleiner wird ein Gebäude auf der
    // herausgezoomten Karte zum Einzelpunkt und ist nicht mehr zu erkennen.
    const minSize = 8 / camera.pixelsPerTile;
    // Das Gelände steht immer vorn (es löscht Bild und Tiefe, movePass), danach
    // die übrigen Durchgänge in der Reihenfolge des Entwickler-Panels.
    for (const pass of this.order) {
      switch (pass) {
        case 'grass':
          // Gras in den Tiefenpuffer des Geländes, vor den Modellen - undurchsichtig, ohne Sortieren.
          if (!off.grass) this.grass.render(camera, this.tileSize, {
            light: this.terrain.light, time: this.terrain.time, gridCell: this.terrain.gridCell,
            flatZones: this.terrain.flatZones, flatCount: this.terrain.flatCount, fields: this.terrain.fieldWindow,
            center: this.seenCenter ?? { x: centerX, y: centerY },
          });
          break;
        // Die Modellarten filtert EntityRenderer selbst (off ist dasselbe Objekt).
        case 'models':
          this.entities.render(overlay, camera, minSize, this.pixelRatio, true, batches);
          break;
        case 'particles':
          if (!off.particles) this.particleRenderer.render(this.particles, camera, this.terrain.time, this.terrain.light);
          break;
        // ponytail: was hinter 'post' steht, zeichnet direkt ins Canvas, dessen
        // Tiefenpuffer das Gelände nicht kennt - Modelle dort verdeckt kein
        // Hügel. Für die Balken gewollt, für anderes nur ein Test; Tiefe
        // übernehmen (blitFramebuffer), wenn dort mehr dauerhaft hin soll.
        // VERIFIED: Rauchtest und Bildvergleich 2026-10-10 mit der Reihenfolge ab Werk.
        case 'post':
          if (post) this.post.end();
          break;
        case 'bars':
          if (!off.bars) this.entities.renderBars(overlay, camera, minSize, this.pixelRatio);
          break;
      }
    }
    gpuFrameEnd();
    return true;
  }
}

/**
 * Übersichtskarte wie in AoE4: ein Quadrat der Welt rund um die Stelle, die
 * man gerade sieht, von oben, oben liegt die Blickrichtung. Das Canvas ist
 * quadratisch, Hud.css schneidet daraus die runde Scheibe im Holzring; der Ausschnitt der Hauptansicht ist darauf ein Rechteck.
 */
export class MiniMap {
  private terrain: TerrainRenderer;
  private entities: EntityRenderer;
  /** Kantenlänge des Canvas in CSS-Pixeln - der Kreis reicht von Rand zu Rand (Hud.css). */
  private cssSize = 244;

  /**
   * Wie viel breiter als die Hauptansicht die Minimap zeigt - bei jeder
   * Zoomstufe gleich: das Sichtrechteck ist immer etwa ein Fünftel davon, man
   * sieht die Umgebung und erkennt darin noch Gebäude und Felder.
   */
  private static readonly OVERVIEW = 5;
  /** Grenzen (u-Einheiten): ganz nah noch die Nachbarschaft, ganz weit nicht der halbe Kontinent. */
  private static readonly MIN_COVERAGE = 160;
  private static readonly MAX_COVERAGE = 6000;
  /** Senkrecht von oben: ein Quadrat der Welt ist dann auch im Bild quadratisch. */
  private static readonly TOP_DOWN = Math.PI / 2;

  constructor(
      private canvas: HTMLCanvasElement,
      seed: string,
      pixelRatio: number = 1,
  ) {
    this.terrain = new TerrainRenderer(canvas, seed, TERRAIN_PALETTE);
    this.entities = new EntityRenderer(this.terrain.context);
    // Ohne Relief gibt es nichts zu unterteilen.
    this.terrain.cellPixels = 64;
    // Die Minimap verschiebt sich nur mit der Hauptansicht und viel langsamer.
    this.terrain.bubblePixels = 64;
    this.setPixelRatio(pixelRatio);
  }

  setPixelRatio(pixelRatio: number) {
    this.canvas.width = Math.round(this.cssSize * pixelRatio);
    this.canvas.height = Math.round(this.cssSize * pixelRatio);
    this.canvas.style.width = `${this.cssSize}px`;
    this.canvas.style.height = `${this.cssSize}px`;
  }

  /**
   * Führt `fn` mit dem Blick senkrecht von oben aus - der Blickwinkel gilt für
   * alle Umrechnungen und Shader, die Hauptansicht bekommt danach ihren zurück.
   * `stretch`: wie viel höher ein Stück Boden hier ist als in der Hauptansicht.
   */
  private topDown<T>(fn: (stretch: number) => T): T {
    const main = viewElevation();
    setViewElevation(MiniMap.TOP_DOWN);
    try {
      return fn(Math.sin(viewElevation()) / Math.sin(main));
    } finally {
      setViewElevation(main);
    }
  }

  /** u-Einheiten, die die Minimap waagerecht abdeckt. */
  private coverage(view: IsoView): number {
    // Auf die nächste Zoomstufe gerundet: beim weichen Zoomen würde sich der
    // Maßstab sonst je Bild ändern und die Minimap jedes Mal neu berechnet.
    const tileSize = 2 ** Math.round(Math.log2(view.tileSize));
    return Math.min(Math.max((view.width / tileSize) * MiniMap.OVERVIEW, MiniMap.MIN_COVERAGE), MiniMap.MAX_COVERAGE);
  }

  /** Dieselbe Mitte wie die Hauptansicht, in CSS-Pixeln der Minimap. */
  private miniView(view: IsoView): IsoView {
    return {
      centerX: view.centerX,
      centerY: view.centerY,
      tileSize: this.cssSize / this.coverage(view),
      width: this.cssSize,
      height: this.cssSize,
    };
  }

  render(view: IsoView, overlay: EntityInstance[] = []) {
    this.topDown((stretch) => {
      const mini = this.miniView(view);
      const scale = this.canvas.width / this.cssSize;
      const camera = snapCamera({
        centerX: view.centerX,
        centerY: view.centerY,
        pixelsPerTile: mini.tileSize * scale,
        reliefScale: 0,
      }, this.canvas.width, this.canvas.height);

      const w = (view.width / view.tileSize) * mini.tileSize * scale;
      const h = (view.height / view.tileSize) * mini.tileSize * scale * stretch;
      this.terrain.viewRect = {
        x: (this.canvas.width - w) / 2,
        y: (this.canvas.height - h) / 2,
        width: w,
        height: h,
      };
      // Nichts gezeichnet: das letzte Bild bleibt stehen - ohne Figuren darüber.
      if (!this.terrain.render(camera)) return;
      // Auf der Minimap zählt nur, dass überhaupt etwas dasteht - vier Pixel
      // reichen dafür, die Form ist auf dieser Größe ohnehin nicht zu erkennen.
      this.entities.render(overlay, camera, 4 / camera.pixelsPerTile);
    });
  }

  /** CSS-Pixel der Minimap je Welt-Tile bei dieser Hauptansicht. */
  pixelsPerTile(view: IsoView): number {
    return this.miniView(view).tileSize;
  }

  /** Welt-Ausschnitt, den die Minimap zeigt - für das Einsammeln der Instanzen. */
  viewRectOf(view: IsoView) {
    return this.topDown(() => visibleWorldRect(this.miniView(view)));
  }

  /** Liegt die Stelle (CSS-Pixel im Canvas) auf der Scheibe? Die Ecken daneben sind Rahmen. */
  inside(x: number, y: number): boolean {
    const half = this.cssSize / 2;
    return Math.hypot(x - half, y - half) <= half;
  }

  /** Rechnet einen Klick (in CSS-Pixeln) auf die Minimap in Welt-Tiles um. */
  toWorld(clickX: number, clickY: number, view: IsoView): { x: number; y: number } {
    return this.topDown(() => screenToGround(this.miniView(view), clickX, clickY));
  }
}
