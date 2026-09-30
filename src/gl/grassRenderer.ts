// grassRenderer.ts
// Gras in der Wiese, nur herangezoomt: je Rasterzelle ein Büschel als Bild
// (src/models/foliage/*.glb - auf der Wiese Gräser, Blumen und Zwergsträucher
// aus src/textures/grass/, am Ufer Schilf und Rohrkolben), eine Karte, die zur Kamera zeigt und oben im Wind
// wiegt. Kein Vertex-Puffer; Alpha als Maske (verworfen), mit Tiefe, ohne
// Sortieren. Die Büschel liegen auf einem festen Weltraster um die Kamera -
// der Zufall hängt an der Weltzelle, so springt beim Verschieben nichts.
//
// Zwei Draw-Calls:
//   1. Daten: je Rasterzelle ein Texel - Höhe (16 Bit über R, G), wie viel
//      Wiese dort ist (B) und welche Pflanze (A), aus derselben
//      Geländefunktion wie das Bild (TERRAIN_COMMON, BIOME_GLSL). So wächst
//      Gras nur, wo das Gelände Wiese malt, und die teure Rechnung läuft
//      einmal je Büschel, nicht je Eckpunkt.
//   2. Büschel: gl_InstanceID = Rasterzelle, ein texelFetch, der Rest aus dem Zufall.
//
// Vorher waren es einzelne Halme als Dreiecke (4 je Büschel, 12 je Busch).
// Gemessen (M4, Demo, ohne Bildraten-Deckel) kosteten sie 0,5-1,1 ms je Bild.

import { BIOME_GLSL, TERRAIN_COMMON } from './terrainShader';
import { PROJECT_GLSL, bindScreen, cameraDirection, setCameraUniforms, viewGroundV, type GpuCamera } from './iso';
import { LIGHT_GLSL, setLightUniforms, type Light } from './light';
import { CARDS_FROM, FIELD_WINDOW, link, uploadTerrainParams } from './terrainRenderer';
import { parseMtlImages } from './obj';
import { FLATTEN_GLSL } from '../world/flatten';
import { addRenderStats } from '../renderStats';
import reed from '../models/foliage/reed.glb?model';
import cattails from '../models/foliage/cattails.glb?model';

/** Die Steine (tools/models/crop-cards.mjs aus src/textures/stone/), je 1 m. */
const STONE_FILES = import.meta.glob('../models/foliage/stone_*.glb', { eager: true, query: '?model', import: 'default' }) as Record<string, { obj: string; mtl: string }>;
const STONES = Array.from({ length: Object.keys(STONE_FILES).length }, (_, i) => STONE_FILES[`../models/foliage/stone_${i + 1}.glb`]);
const MEADOW_FILES = import.meta.glob(['../models/foliage/meadow_*.glb', '../models/foliage/bush_*.glb'], { eager: true, query: '?model', import: 'default' }) as Record<string, { obj: string; mtl: string }>;
/**
 * Wiesenpflanzen (tools/models/crop-cards.mjs, Datei meadow_<name> bzw.
 * bush_<name>): wie oft sie wachsen und ob sie den Grünton des Bodens
 * annehmen. Gräser oft und getönt - sonst stünde ihr Fotogrün neben dem der
 * Wiese -, Blumen seltener, Zwergsträucher selten, alle übrigen in ihren
 * eigenen Farben. Büsche sind rund 3 % aller Büschel. Gezählt in Losen je Art.
 */
const GRASS = { lots: 14, tint: 0.6 };
const FLOWER = { lots: 4, tint: 0 };
const SHRUB = { lots: 1, tint: 0 };
const BUSH = { lots: 1, tint: 0 };
const MEADOW: (readonly [string, { lots: number; tint: number }])[] = [
  ...['deutsches-weidelgras', 'deutsches-weidelgras2', 'deutsches-weidelgras3', 'diamant-reitgras', 'diamant-reisgras2',
    'glatthafer', 'knaulgras', 'reitgras', 'wiesen-lieschengras1', 'wiesen-lieschengras2', 'wiesen-lieschengras3',
    'wiesen-rispengras1', 'wiesen-rispengras2', 'ziergras', 'wollgras', 'spitzwegerich'].map((n) => [`meadow_${n}`, GRASS] as const),
  ...['gaensebluemchen', 'hahnenfuss', 'kuckucks-lichtnelke', 'rotklee', 'weissklee', 'schafgabe', 'wiesen-flockenblume',
    'wiesen-glockenblume', 'wiesen-labkraut', 'wiesen-margerite', 'wiesen-schaumkraut', 'wiesensauerampfer'].map((n) => [`meadow_${n}`, FLOWER] as const),
  ...['besenginster', 'ginster', 'besenheide', 'heidekraut', 'schneeheide', 'preiselbeere'].map((n) => [`meadow_${n}`, SHRUB] as const),
  ...['gemeiner_schneeball_busch', 'ginsterbusch', 'haselnussbusch', 'roter_hartriegel_busch', 'roter_holunderbusch',
    'schlehenbusch', 'schwarzer_holunderbusch', 'wacholder-busch', 'weissdorn'].map((n) => [`bush_${n}`, BUSH] as const),
];

/**
 * Die Pflanzen und Steine, je eine Schicht in uFoliage - bei den Pflanzen ist
 * die Reihenfolge die Art im Alpha der Daten-Textur (MAP), die Steine folgen ab
 * STONE_FIRST. Die Karten (tools/models/billboard-card.mjs, crop-cards.mjs)
 * stehen unten mittig, ihr Bild ist 256 px hoch.
 */
/** Schilf, Rohrkolben, dann die Wiesenpflanzen (MEADOW_FIRST). */
const PLANTS = [reed, cattails, ...MEADOW.map(([file]) => MEADOW_FILES[`../models/foliage/${file}.glb`])];
const MEADOW_FIRST = 2;
/** Je Los eine Art (Index in PLANTS) - gezogen wird ein Los. */
const MEADOW_LOTS = MEADOW.flatMap(([, g], i) => Array<number>(g.lots).fill(MEADOW_FIRST + i));

const STONE_FIRST = PLANTS.length;
const KINDS = [...PLANTS, ...STONES];
/**
 * Abstand der Stein-Rasterzellen (Tiles) - je Zelle höchstens ein Stein. Wie
 * viele es sind und wie groß, entscheidet das Gelände (MAP mit uStones).
 */
const STONE_SPACING = 0.4;
/** Kantenlänge der Bilder in uFoliage - die Karten sind 256 px hoch. */
const FOLIAGE_SIZE = 256;
/** Welt-Tiles je Meter der Karten (1 Tile = 5 m). */
const TILES_PER_METER = 0.2;
/**
 * Büschel je Tile-Kante, ab CARDS_FROM (Zoom 3) auf jeder Stufe gleich - so
 * stehen beim Zoomen dieselben Büschel an derselben Stelle, nur kleiner.
 * Darunter (Zoom 2, 1) keins, die Bodentextur reicht. 3,46 statt 3: gut
 * ein Drittel mehr Gräser für eine wilde Wiese, Blumen etwa so häufig wie
 * mit 3 (Lose in MEADOW).
 */
const PER_TILE = 3.46;
/** Höhen bis hierhin (Tiles) passen in die 16 Bit der Daten-Textur. */
const MAX_Z = 64;
/** Texture-Units beim Zeichnen (0: Rauschtabelle, 2: Äcker). */
const MAP_UNIT = 9;
const FOLIAGE_UNIT = 11;

/** Rasterzelle → Zufall und Lage, gleich in beiden Durchgängen. */
const CELL_GLSL = `
uniform ivec2 uOriginCell;   // Rasterzelle der Ecke des Grasfelds
uniform float uSpacing;      // Tiles zwischen Rasterzellen
uint hash(uint x) {
  x ^= x >> 16; x *= 0x7feb352du;
  x ^= x >> 15; x *= 0x846ca68bu;
  x ^= x >> 16;
  return x;
}
float rnd(uint x) { return float(hash(x)) / 4294967295.0; }
uint cellSeed(ivec2 cell) { return hash(uint(cell.x) * 73856093u ^ uint(cell.y) * 19349663u); }
vec2 cellPos(ivec2 cell, uint seed) { return (vec2(cell) + vec2(rnd(seed), rnd(seed + 1u))) * uSpacing; }
`;

const FULLSCREEN = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

/**
 * Durchgang 1: je Rasterzelle Höhe, Wiesenanteil und Pflanze (PLANTS) - mit
 * uStones stattdessen Wahrscheinlichkeit und Größe eines Steins.
 */
const MAP = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2DArray;

${TERRAIN_COMMON}
${BIOME_GLSL}
${PROJECT_GLSL}
${FLATTEN_GLSL}
${CELL_GLSL}
${LIGHT_GLSL}

uniform float uGridCell;     // Abtastschritt wie das Geländegitter - die Halme stehen auf seiner Fläche
// Äcker (TerrainRenderer.fieldWindow): dort wächst kein Gras.
uniform sampler2D uFields;
uniform vec2  uFieldOrigin;
uniform float uFieldSize;
uniform float uFieldActive;
uniform int uStones;         // 1: Steine statt Pflanzen

out vec4 fragColor;

void main() {
  ivec2 cell = uOriginCell + ivec2(gl_FragCoord.xy);
  vec2 pos = cellPos(cell, cellSeed(cell));
  fragColor = vec4(0.0);

  // Wiese wie im Gelände-Shader (FILL_FRAGMENT_SOURCE): ohne Wald, Wüste, Strand, Fels, Schnee, Wasser.
  // Steine auch am Strand bis kurz vor dem Wasser.
  vec2 n = pos * uMapScale;
  float height = elevation(n, uGridCell);
  if (height < (uStones == 1 ? uSeaLevel + (uShoreLevel - uSeaLevel) * 0.3 : uShoreLevel)) return;
  float moisture, temperature;
  climate(n, height, moisture, temperature);
  // Schnee hat seine gemalten Felsen mit Haube - dort keine Pflanzen. Steine
  // schon: hohe Lagen gelten oft als Schnee, sehen aber nach Fels aus.
  if (uStones == 0 && classify(height, moisture, temperature) == B_SNOW) return;
  float jitter = snoise(L_FRINGE, pos * 0.5 + vec2(3.0, 8.0));
  float wood = smoothstep(0.02, 0.18, moisture + jitter * 0.05);
  float desert = min(smoothstep(0.15, 0.35, temperature), 1.0 - smoothstep(-0.2, 0.0, moisture + jitter * 0.05));
  float band = (uShoreLevel - uSeaLevel) * 0.6;
  float beach = 1.0 - smoothstep(uShoreLevel - band, uShoreLevel + band, height + jitter * band * 0.8);
  float rock = smoothstep(uHillLevel - 0.05, uHillLevel + 0.05, height + jitter * 0.025);
  float meadow = (1.0 - wood) * (1.0 - desert) * (1.0 - beach) * (1.0 - rock);
  // Pflanze: auf der Wiese eine der Wiesenpflanzen (MEADOW, nach Losen); nah
  // am Wasser und wo es feucht ist Schilf, am feuchtesten Ufer Rohrkolben - auch am Strand.
  uint seed = cellSeed(cell);
  const int LOTS[${MEADOW_LOTS.length}] = int[](${MEADOW_LOTS.join(', ')});
  float kind = float(LOTS[min(int(rnd(seed + 9u) * ${MEADOW_LOTS.length}.0), ${MEADOW_LOTS.length - 1})]);
  float shore = 1.0 - smoothstep(uShoreLevel + band, uShoreLevel + band * 3.0, height + jitter * band);
  float wet = shore * (1.0 - desert) * (1.0 - rock) * (1.0 - wood) * smoothstep(-0.25, -0.05, moisture);
  if (wet > 0.3) {
    kind = moisture > -0.12 && height < uShoreLevel + band * 1.5 ? 1.0 : 0.0;
    meadow = max(meadow, wet);
  }
  // Nicht auf Äckern und nicht unter Gebäuden (eingeebnete Flächen).
  bool onField = false;
  if (uFieldActive > 0.5) {
    vec2 ft = floor(pos - uFieldOrigin);
    onField = all(greaterThanEqual(ft, vec2(0.0))) && all(lessThan(ft, vec2(uFieldSize)))
        && texelFetch(uFields, ivec2(ft), 0).a > 0.5;
    if (onField) meadow = 0.0;
  }
  bool built = false;
  for (int i = 0; i < uFlatCount; i++) {
    vec2 d = abs(pos - uFlat[i].xy) - uFlat[i].z;
    if (max(d.x, d.y) < 0.2) built = true;
  }
  if (built) meadow = 0.0;
  float z = clamp(flattenZ(pos, reliefZ(height) * uReliefScale) / ${MAX_Z.toFixed(1)}, 0.0, 1.0) * 65535.0;
  if (uStones == 1) {
    // Steine: B wie wahrscheinlich, A die Größe (Meter / 2). Im Gebirge viele
    // und große, am Strand und in Ufernähe mittlere, auf Äckern kleine, in
    // Wiese und Wald wenige. Unter Gebäuden keine.
    float near = shore * (1.0 - rock);
    float chance = rock * 0.22 + beach * 0.04 + near * 0.02 + meadow * 0.004 + wood * (1.0 - rock) * 0.004;
    float size = rock * mix(0.3, 0.8, rnd(seed + 12u)) + (1.0 - rock) * mix(0.12, 0.2, max(beach, near));
    if (onField) { chance = 0.03; size = 0.06; }
    // Ob hier ein Stein liegt, schon hier - nur dann das Licht (zwei Höhen mehr).
    if (built || rnd(seed + 2u) >= chance) return;
    // Licht wie das Gelände darunter (FILL: Hillshading, DISPLAY: Sonne auf den
    // Hang) - sonst leuchtet ein Stein im Schatten eines Hangs.
    float step = 0.25;
    float hRight = elevation((pos + vec2(step, 0.0)) * uMapScale, uGridCell);
    float hDown = elevation((pos + vec2(0.0, step)) * uMapScale, uGridCell);
    float shade = tanh(((height - hRight) + (height - hDown)) * uShadeGain / step);
    float lowland = mix(uLowlandShade, 1.0, smoothstep(uMountainFoot - 0.15, uMountainFoot, height));
    float fill = 1.0 + shade * mix(0.42, 0.18, beach) * lowland;
    vec2 dz = vec2(reliefZ(height) - reliefZ(hRight), reliefZ(height) - reliefZ(hDown)) * uReliefScale / step;
    vec3 normal = normalize(vec3(dz, 1.0));
    float direct = clamp(mix(1.0, dot(normal, uSunDir) / max(uSunDir.z, 0.1), 0.85), 0.45, 1.3);
    float light = clamp((fill * mix(1.0, direct, uLight.y) - 0.3) / 1.5, 0.0, 1.0);
    // A: Größe und Licht je 4 Bit; B = 1: hier liegt ein Stein.
    float packed = (floor(clamp(size, 0.0, 1.0) * 15.0 + 0.5) * 16.0 + floor(light * 15.0 + 0.5)) / 255.0;
    fragColor = vec4(floor(z / 256.0) / 255.0, mod(floor(z), 256.0) / 255.0, 1.0, packed);
    return;
  }
  fragColor = vec4(floor(z / 256.0) / 255.0, mod(floor(z), 256.0) / 255.0, meadow, kind / ${PLANTS.length - 1}.0);
}
`;

/** Durchgang 2: die Büschel - je Zelle eine Karte (6 Eckpunkte), zur Kamera gedreht. */
const VERTEX = `#version 300 es
precision highp float;
precision highp int;

${PROJECT_GLSL}
${LIGHT_GLSL}
${CELL_GLSL}

uniform int   uColumns;      // Rasterzellen je Zeile
uniform sampler2D uMap;      // Durchgang 1
uniform float uTime;
uniform vec2  uToCamera;     // zur Kamera, waagerecht (cameraDirection)
uniform vec2  uSize[${PLANTS.length}];  // Breite, Höhe je Pflanze in Tiles
uniform vec3  uGrassLo;      // Wiesenfarbe des Geländes (Palette)
uniform vec3  uGrassHi;
uniform int   uStones;       // 1: Steine (MAP mit uStones)
uniform int   uPass;         // Steine: 3 = Fleck auf dem Boden darunter (render)

out vec3 vUv;                // u, v, Schicht in uFoliage
out vec3 vLight;
out vec4 vGrass;             // Farbton der Wiese und wie stark er gilt

void main() {
  ivec2 local = ivec2(gl_InstanceID % uColumns, gl_InstanceID / uColumns);
  vec4 data = texelFetch(uMap, local, 0);
  ivec2 cell = uOriginCell + local;
  uint seed = cellSeed(cell);
  if (uStones == 1 ? data.b < 0.5 : rnd(seed + 2u) >= data.b * 0.95) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);  // hinter der fernen Clip-Ebene: nichts
    return;
  }
  vec2 pos = cellPos(cell, seed);
  float z = (data.r * 65280.0 + data.g * 255.0) / 65535.0 * ${MAX_Z.toFixed(1)} - 0.003;

  // Zwei Dreiecke: Ecken (0,0) (1,0) (1,1) - (0,0) (1,1) (0,1).
  int v = gl_VertexID;
  vec2 corner = vec2(v == 1 || v == 2 || v == 4 ? 1.0 : 0.0, v >= 2 && v != 3 ? 1.0 : 0.0);
  vec2 view = normalize(uToCamera);
  if (uStones == 1) {
    // Ein Stein: zur Kamera, bis 20° gedreht, gespiegelt, in der Bildebene bis
    // 20° gekippt (weiter nicht - das Licht im Foto käme sonst von unten), oben
    // bis 10° geneigt, und ein Stück in den Boden gesunken.
    int kind = ${STONE_FIRST} + int(rnd(seed + 11u) * ${STONES.length}.0) % ${STONES.length};
    float turn = (rnd(seed + 3u) - 0.5) * 0.7;
    vec2 across = vec2(-view.y, view.x) * cos(turn) + view * sin(turn);
    // A: Größe (Meter / 2) und Licht je 4 Bit (MAP).
    float packed = floor(data.a * 255.0 + 0.5);
    float s = floor(packed / 16.0) / 15.0 * 2.0 * ${TILES_PER_METER} * (0.6 + 0.8 * rnd(seed + 4u));
    float ground = mod(packed, 16.0) / 15.0 * 1.5 + 0.3;
    float roll = (rnd(seed + 13u) - 0.5) * 0.7;
    vec2 local = vec2(corner.x - 0.5, corner.y) * s;
    local = vec2(local.x * cos(roll) - local.y * sin(roll), local.x * sin(roll) + local.y * cos(roll));
    vec2 lean = (vec2(rnd(seed + 9u), rnd(seed + 10u)) - 0.5) * 0.35 * local.y;
    gl_Position = project(pos + across * local.x + lean, z + local.y - 0.18 * s);
    if (uPass == 3) {
      // Fleck: ein flaches Oval auf dem Boden, etwas breiter als der Stein, knapp darüber.
      vec2 q = (corner - 0.5) * 2.0;
      gl_Position = project(pos + across * q.x * s * 0.62 + view * q.y * s * 0.42, z + 0.004);
      vUv = vec3(q, 0.0);
    }
    vUv = vec3(rnd(seed + 6u) < 0.5 ? corner.x : 1.0 - corner.x, corner.y, float(kind));
    vLight = vec3(ground * (0.9 + 0.15 * rnd(seed + 7u))) * uLight.x * uSunColor;
    vGrass = vec4(0.0);
    if (uPass == 3) vUv = vec3((corner - 0.5) * 2.0, 0.0);
    return;
  }
  int kind = int(data.a * ${PLANTS.length - 1}.0 + 0.5);
  // Quer zur Blickrichtung, je Büschel um bis zu 18° gedreht, bis 15 % kleiner
  // oder 20 % größer als die Grundgröße der Art und oben bis etwa 10° in eine
  // eigene Richtung geneigt.
  float turn = (rnd(seed + 3u) - 0.5) * 0.63;
  vec2 across = vec2(-view.y, view.x);
  across = across * cos(turn) + view * sin(turn);
  vec2 size = uSize[kind] * (0.85 + 0.35 * rnd(seed + 4u));
  vec2 foot = pos + across * (corner.x - 0.5) * size.x;
  // Oben wiegt es im Wind, jedes Büschel in seinem Takt.
  float wind = sin(uTime * 1.3 + pos.x * 0.37 + pos.y * 0.23 + rnd(seed + 5u) * 6.0) * 0.08 * size.y;
  vec2 lean = (vec2(rnd(seed + 9u), rnd(seed + 10u)) - 0.5) * 0.35 * size.y;
  foot += (vec2(0.6, 0.3) * wind + lean) * corner.y;
  gl_Position = project(foot, z + corner.y * size.y);

  vUv = vec3(rnd(seed + 6u) < 0.5 ? corner.x : 1.0 - corner.x, corner.y, float(kind));
  // Licht: die Karten sind ohne eigene Schattierung gemalt - nur Helligkeit
  // und Farbe der Sonne, dazu je Büschel eine leichte eigene Tönung.
  float tone = 0.9 + 0.2 * rnd(seed + 7u);
  vLight = vec3(tone) * mix(0.95, 1.0, uLight.y) * uLight.x * uSunColor;
  // Gräser im Farbton des Bodens darunter (sonst stünde ihr Fotogrün neben
  // dem der Wiese); Blumen, Sträucher, Schilf und Rohrkolben in ihren eigenen Farben.
  const float TINT[${PLANTS.length}] = float[](0.0, 0.0, ${MEADOW.map(([, g]) => g.tint.toFixed(2)).join(', ')});
  vGrass = vec4(mix(uGrassLo, uGrassHi, rnd(seed + 8u)), TINT[kind]);
}
`;

const FRAGMENT = `#version 300 es
precision mediump float;
precision mediump sampler2DArray;
uniform sampler2DArray uFoliage;
// 0: Pflanzen (Maske); Steine in zwei Durchgängen wie die Baumbilder:
// 1 die Kerne deckend mit Tiefe, 2 die weichen Kanten geblendet ohne Tiefe.
uniform highp int uPass;  // wie im Vertex-Shader, sonst lässt sich das Programm nicht linken
in vec3 vUv;
in vec3 vLight;
in vec4 vGrass;
out vec4 fragColor;
void main() {
  // Vormultipliziert hochgeladen - so filtert der Rand ohne dunklen Saum.
  if (uPass == 3) {
    // Grau-brauner, weicher Fleck unter dem Stein - so steht er nicht scharf abgesetzt im Gelände.
    float d = length(vUv.xy);
    float a = 0.45 * (1.0 - smoothstep(0.3, 1.0, d));
    if (a < 0.01) discard;
    fragColor = vec4(vec3(0.24, 0.21, 0.17) * vLight, a);
    return;
  }
  vec3 uv = vec3(vUv.x, 1.0 - vUv.y, vUv.z);
  vec4 t = texture(uFoliage, uv);
  if (uPass > 0) {
    // Weicher Rand (etwa 1,5 Bildschirmpixel) aus der Deckung der Nachbarn.
    vec2 dx = dFdx(uv.xy) * 1.5, dy = dFdy(uv.xy) * 1.5;
    float around = texture(uFoliage, uv + vec3(dx, 0.0)).a + texture(uFoliage, uv - vec3(dx, 0.0)).a
                 + texture(uFoliage, uv + vec3(dy, 0.0)).a + texture(uFoliage, uv - vec3(dy, 0.0)).a;
    float a = t.a * smoothstep(0.2, 1.0, around * 0.25);
    bool core = a >= 0.9;
    if (uPass == 1 ? !core : core || a < 0.02) discard;
    // Gedämpft und grauer als im Foto, wie die Steine im Gelände.
    vec3 c = t.rgb / max(t.a, 0.004);
    c = mix(vec3(dot(c, vec3(0.3, 0.59, 0.11))), c, 0.3) * 0.9;
    fragColor = vec4(c * vLight, uPass == 1 ? 1.0 : a);
    return;
  }
  // Niedrige Schwelle: die dünnen Halme der Gräser verlören sich sonst in den Mipmaps.
  if (t.a < 0.2) discard;
  vec3 c = t.rgb / t.a;
  // Helligkeit aus dem Bild (0.45 ist sein Mittel), Farbton aus der Palette.
  c = mix(c, vGrass.rgb * dot(c, vec3(0.3, 0.59, 0.11)) / 0.45, vGrass.a);
  fragColor = vec4(c * vLight, 1.0);
}
`;

type RGB = [number, number, number];

/** Daten-Textur mit ihrem Framebuffer. */
interface GrassMap {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  size: number;
}

/** Breite und Höhe einer Karte (Meter) aus ihrem OBJ-Text - sie steht unten mittig. */
function cardSize(obj: string): [number, number] {
  let x = 0, y = 0;
  for (const line of obj.split('\n')) {
    if (!line.startsWith('v ')) continue;
    const [, vx, vy] = line.split(/\s+/).map(Number);
    x = Math.max(x, Math.abs(vx));
    y = Math.max(y, vy);
  }
  return [x * 2, y];
}

export class GrassRenderer {
  private readonly mapProgram: WebGLProgram;
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly locations = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
  /** Daten-Texturen: Pflanzen, Steine. */
  private readonly maps: [GrassMap, GrassMap];
  private readonly foliage: WebGLTexture;

  /** @param lo, hi Wiesenfarbe (0..255) - dieselbe Palette wie das Gelände. */
  constructor(private readonly gl: WebGL2RenderingContext, lo: RGB, hi: RGB) {
    this.mapProgram = link(gl, FULLSCREEN, MAP);
    this.program = link(gl, VERTEX, FRAGMENT);
    this.vao = gl.createVertexArray()!;
    const map = () => ({ texture: gl.createTexture()!, framebuffer: gl.createFramebuffer()!, size: 0 });
    this.maps = [map(), map()];
    this.foliage = this.loadFoliage();
    gl.useProgram(this.mapProgram);
    uploadTerrainParams(gl, (name) => this.location(this.mapProgram, name));
    gl.uniform1i(this.location(this.mapProgram, 'uFields'), 2);
    gl.useProgram(this.program);
    gl.uniform1i(this.location(this.program, 'uMap'), MAP_UNIT);
    gl.uniform1i(this.location(this.program, 'uFoliage'), FOLIAGE_UNIT);
    gl.uniform3f(this.location(this.program, 'uGrassLo'), lo[0] / 255, lo[1] / 255, lo[2] / 255);
    gl.uniform3f(this.location(this.program, 'uGrassHi'), hi[0] / 255, hi[1] / 255, hi[2] / 255);
    gl.uniform2fv(this.location(this.program, 'uSize[0]'), PLANTS.flatMap((k) => cardSize(k.obj).map((m) => m * TILES_PER_METER)));
  }

  /**
   * Die Bilder der Pflanzen (KINDS) als Schichten einer Textur, vormultipliziert
   * mit Mipmaps. Bis sie geladen sind, ist alles durchsichtig - es fehlt nur Gras.
   */
  private loadFoliage(): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + FOLIAGE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, Math.log2(FOLIAGE_SIZE) + 1, gl.RGBA8, FOLIAGE_SIZE, FOLIAGE_SIZE, KINDS.length);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0);
    let loaded = 0;
    KINDS.forEach(async (kind, layer) => {
      const url = [...parseMtlImages(kind.mtl).values()][0];
      const image = new Image();
      image.src = url;
      await image.decode();
      const bitmap = await createImageBitmap(image, {
        resizeWidth: FOLIAGE_SIZE, resizeHeight: FOLIAGE_SIZE, resizeQuality: 'high', premultiplyAlpha: 'premultiply',
      });
      gl.activeTexture(gl.TEXTURE0 + FOLIAGE_UNIT);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, FOLIAGE_SIZE, FOLIAGE_SIZE, 1, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
      if (++loaded === KINDS.length) gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
      gl.activeTexture(gl.TEXTURE0);
      bitmap.close();
    });
    return texture;
  }

  /**
   * Zeichnet das Gras um die Kamera - in den Tiefenpuffer des Geländes,
   * vor den Modellen. Weit draußen nichts.
   */
  render(camera: GpuCamera, tileSize: number, o: {
    light: Light; time: number; gridCell: number;
    flatZones: Float32Array; flatCount: number;
    fields: { texture: WebGLTexture; origin: { x: number; y: number }; active: boolean };
    /** Weltpunkt in der Bildmitte - um ihn liegt das Quadrat (nicht der Kamerapunkt auf Meereshöhe). */
    center: { x: number; y: number };
  }) {
    if (tileSize < CARDS_FROM) return;
    const ppt = camera.pixelsPerTile;
    const gl = this.gl;
    const { width, height } = gl.canvas;
    // Ein Quadrat um die Kamera, groß genug für jede Blickrichtung und Neigung.
    const side = Math.ceil((width + height / viewGroundV()) / ppt) + 4;
    let cells = 0;
    // Erst die Pflanzen, dann die Steine - je auf ihrem eigenen Raster.
    for (const stones of [0, 1]) {
      const spacing = stones ? STONE_SPACING : 1 / PER_TILE;
      const columns = Math.ceil(side / spacing);
      const originX = Math.floor((o.center.x - side / 2) / spacing);
      const originY = Math.floor((o.center.y - side / 2) / spacing);
      const map = this.maps[stones];

      // 1. Daten je Rasterzelle.
      // Nur wachsen, mit Luft: beim stufenlosen Zoomen ändert sich die Zahl fast
      // jedes Bild, und neu anlegen (samt checkFramebufferStatus) wartet auf
      // die GPU - gemessen bis 200 ms je Sekunde (M4, Retina).
      if (map.size < columns) this.allocate(map, Math.ceil(columns * 1.25));
      gl.bindFramebuffer(gl.FRAMEBUFFER, map.framebuffer);
      gl.viewport(0, 0, columns, columns);
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(this.mapProgram);
      gl.bindVertexArray(this.vao);
      const m = (name: string) => this.location(this.mapProgram, name);
      gl.uniform2i(m('uOriginCell'), originX, originY);
      gl.uniform1f(m('uSpacing'), spacing);
      gl.uniform1i(m('uStones'), stones);
      gl.uniform1f(m('uReliefScale'), camera.reliefScale);
      gl.uniform1f(m('uGridCell'), o.gridCell);
      if (stones) setLightUniforms(gl, m, o.light);
      if (o.flatCount > 0) gl.uniform4fv(m('uFlat[0]'), o.flatZones);
      gl.uniform1i(m('uFlatCount'), o.flatCount);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, o.fields.texture);
      gl.uniform1f(m('uFieldActive'), o.fields.active ? 1 : 0);
      gl.uniform2f(m('uFieldOrigin'), o.fields.origin.x, o.fields.origin.y);
      gl.uniform1f(m('uFieldSize'), FIELD_WINDOW);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      bindScreen(gl);
      gl.viewport(0, 0, width, height);
      gl.enable(gl.DEPTH_TEST);

      // 2. Büschel bzw. Steine, in den Tiefenpuffer der Szene.
      gl.useProgram(this.program);
      const u = (name: string) => this.location(this.program, name);
      setCameraUniforms(gl, u, camera);
      setLightUniforms(gl, u, o.light);
      gl.uniform2i(u('uOriginCell'), originX, originY);
      gl.uniform1f(u('uSpacing'), spacing);
      gl.uniform1i(u('uColumns'), columns);
      gl.uniform1i(u('uStones'), stones);
      gl.uniform1f(u('uTime'), o.time);
      const [cx, cy] = cameraDirection();
      gl.uniform2f(u('uToCamera'), cx, cy);
      gl.activeTexture(gl.TEXTURE0 + MAP_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, map.texture);
      gl.activeTexture(gl.TEXTURE0 + FOLIAGE_UNIT);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.foliage);
      if (stones) {
        // Erst der Fleck auf dem Boden, geblendet und ohne Tiefe zu schreiben.
        gl.uniform1i(u('uPass'), 3);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, columns * columns);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
      }
      gl.uniform1i(u('uPass'), stones);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, columns * columns);
      if (stones) {
        // Die weichen Kanten der Steine über das, was schon dahinter steht.
        gl.uniform1i(u('uPass'), 2);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, columns * columns);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
      }
      cells += columns * columns;
      if (!stones) addRenderStats('grassTufts', columns * columns);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
    addRenderStats('drawCalls', 6);
    addRenderStats('vertices', cells * 6);
  }

  /** Daten-Textur in neuer Größe: RGBA8, nie gefiltert (texelFetch). */
  private allocate(map: GrassMap, size: number) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + MAP_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, map.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, map.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, map.texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('Gras: Framebuffer der Daten-Textur ist unvollständig');
    }
    map.size = size;
  }

  private location(program: WebGLProgram, name: string): WebGLUniformLocation | null {
    let map = this.locations.get(program);
    if (!map) this.locations.set(program, (map = new Map()));
    if (!map.has(name)) map.set(name, this.gl.getUniformLocation(program, name));
    return map.get(name)!;
  }
}
