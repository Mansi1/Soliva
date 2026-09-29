// grassRenderer.ts
// Gras in der Wiese, nur herangezoomt: je Rasterzelle ein Büschel als Bild
// (src/models/foliage/*.glb - Wiesengras, Gras mit Samenständen, am Ufer
// Schilf und Rohrkolben), eine Karte, die zur Kamera zeigt und oben im Wind
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
import { FIELD_WINDOW, link, uploadTerrainParams } from './terrainRenderer';
import { parseMtlImages } from './obj';
import { FLATTEN_GLSL } from '../world/flatten';
import { addRenderStats } from '../renderStats';
import meadowGrass from '../models/foliage/meadow_grass.glb?model';
import seedheads from '../models/foliage/wild_grass_seedheads.glb?model';
import reed from '../models/foliage/reed.glb?model';
import cattails from '../models/foliage/cattails.glb?model';

/**
 * Die Pflanzen, je eine Schicht in uFoliage - die Reihenfolge ist die Art im
 * Alpha der Daten-Textur (MAP). Die Karten (tools/models/billboard-card.mjs)
 * stehen unten mittig, ihr Bild ist 256 px hoch.
 */
const KINDS = [meadowGrass, seedheads, reed, cattails];
/** Kantenlänge der Bilder in uFoliage - die Karten sind 256 px hoch. */
const FOLIAGE_SIZE = 256;
/** Welt-Tiles je Meter der Karten (1 Tile = 5 m). */
const TILES_PER_METER = 0.2;
/**
 * Büschel je Tile-Kante nach CSS-Pixeln je Tile: Zoom 5 (128) dichter, Zoom 4
 * (64) weniger - dort ist viermal so viel Wiese im Bild und die Büschel sind
 * halb so groß. Darunter (ab Zoom 3) keins, die Bodentextur reicht.
 */
const DENSITY: [number, number][] = [[96, 3], [48, 2]];
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

/** Durchgang 1: je Rasterzelle Höhe, Wiesenanteil und Pflanze (KINDS). */
const MAP = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2DArray;

${TERRAIN_COMMON}
${BIOME_GLSL}
${PROJECT_GLSL}
${FLATTEN_GLSL}
${CELL_GLSL}

uniform float uGridCell;     // Abtastschritt wie das Geländegitter - die Halme stehen auf seiner Fläche
// Äcker (TerrainRenderer.fieldWindow): dort wächst kein Gras.
uniform sampler2D uFields;
uniform vec2  uFieldOrigin;
uniform float uFieldSize;
uniform float uFieldActive;

out vec4 fragColor;

void main() {
  ivec2 cell = uOriginCell + ivec2(gl_FragCoord.xy);
  vec2 pos = cellPos(cell, cellSeed(cell));
  fragColor = vec4(0.0);

  // Wiese wie im Gelände-Shader (FILL_FRAGMENT_SOURCE): ohne Wald, Wüste, Strand, Fels, Schnee, Wasser.
  vec2 n = pos * uMapScale;
  float height = elevation(n, uGridCell);
  if (height < uShoreLevel) return;
  float moisture, temperature;
  climate(n, height, moisture, temperature);
  if (classify(height, moisture, temperature) == B_SNOW) return;
  float jitter = snoise(L_FRINGE, pos * 0.5 + vec2(3.0, 8.0));
  float wood = smoothstep(0.02, 0.18, moisture + jitter * 0.05);
  float desert = min(smoothstep(0.15, 0.35, temperature), 1.0 - smoothstep(-0.2, 0.0, moisture + jitter * 0.05));
  float band = (uShoreLevel - uSeaLevel) * 0.6;
  float beach = 1.0 - smoothstep(uShoreLevel - band, uShoreLevel + band, height + jitter * band * 0.8);
  float rock = smoothstep(uHillLevel - 0.05, uHillLevel + 0.05, height + jitter * 0.025);
  float meadow = (1.0 - wood) * (1.0 - desert) * (1.0 - beach) * (1.0 - rock);
  // Pflanze: Wiesengras, hier und da mit Samenständen; nah am Wasser und wo
  // es feucht ist Schilf, am feuchtesten Ufer Rohrkolben - auch am Strand.
  uint seed = cellSeed(cell);
  float kind = rnd(seed + 9u) < 0.3 ? 1.0 : 0.0;
  float shore = 1.0 - smoothstep(uShoreLevel + band, uShoreLevel + band * 3.0, height + jitter * band);
  float wet = shore * (1.0 - desert) * (1.0 - rock) * (1.0 - wood) * smoothstep(-0.25, -0.05, moisture);
  if (wet > 0.3) {
    kind = moisture > -0.12 && height < uShoreLevel + band * 1.5 ? 3.0 : 2.0;
    meadow = max(meadow, wet);
  }
  // Nicht auf Äckern und nicht unter Gebäuden (eingeebnete Flächen).
  if (uFieldActive > 0.5) {
    vec2 ft = floor(pos - uFieldOrigin);
    if (all(greaterThanEqual(ft, vec2(0.0))) && all(lessThan(ft, vec2(uFieldSize)))
        && texelFetch(uFields, ivec2(ft), 0).a > 0.5) meadow = 0.0;
  }
  for (int i = 0; i < uFlatCount; i++) {
    vec2 d = abs(pos - uFlat[i].xy) - uFlat[i].z;
    if (max(d.x, d.y) < 0.2) meadow = 0.0;
  }
  float z = clamp(flattenZ(pos, reliefZ(height) * uReliefScale) / ${MAX_Z.toFixed(1)}, 0.0, 1.0) * 65535.0;
  fragColor = vec4(floor(z / 256.0) / 255.0, mod(floor(z), 256.0) / 255.0, meadow, kind / ${KINDS.length - 1}.0);
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
uniform vec2  uSize[${KINDS.length}];  // Breite, Höhe je Pflanze in Tiles
uniform vec3  uGrassLo;      // Wiesenfarbe des Geländes (Palette)
uniform vec3  uGrassHi;

out vec3 vUv;                // u, v, Schicht in uFoliage
out vec3 vLight;
out vec4 vGrass;             // Farbton der Wiese und wie stark er gilt

void main() {
  ivec2 local = ivec2(gl_InstanceID % uColumns, gl_InstanceID / uColumns);
  vec4 data = texelFetch(uMap, local, 0);
  ivec2 cell = uOriginCell + local;
  uint seed = cellSeed(cell);
  if (rnd(seed + 2u) >= data.b * 0.95) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);  // hinter der fernen Clip-Ebene: nichts
    return;
  }
  int kind = int(data.a * ${KINDS.length - 1}.0 + 0.5);
  vec2 pos = cellPos(cell, seed);
  float z = (data.r * 65280.0 + data.g * 255.0) / 65535.0 * ${MAX_Z.toFixed(1)} - 0.003;

  // Zwei Dreiecke: Ecken (0,0) (1,0) (1,1) - (0,0) (1,1) (0,1).
  int v = gl_VertexID;
  vec2 corner = vec2(v == 1 || v == 2 || v == 4 ? 1.0 : 0.0, v >= 2 && v != 3 ? 1.0 : 0.0);
  // Quer zur Blickrichtung, je Büschel um bis zu 18° gedreht, etwas größer
  // oder kleiner und oben bis etwa 10° in eine eigene Richtung geneigt.
  float turn = (rnd(seed + 3u) - 0.5) * 0.63;
  vec2 view = normalize(uToCamera);
  vec2 across = vec2(-view.y, view.x);
  across = across * cos(turn) + view * sin(turn);
  vec2 size = uSize[kind] * (0.8 + 0.4 * rnd(seed + 4u));
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
  // Gras im Farbton des Bodens darunter (sonst gelblich neben dem Grün der
  // Wiese); Schilf und Rohrkolben in ihren eigenen Farben.
  vGrass = vec4(mix(uGrassLo, uGrassHi, rnd(seed + 8u)), kind < 2 ? 0.7 : 0.0);
}
`;

const FRAGMENT = `#version 300 es
precision mediump float;
precision mediump sampler2DArray;
uniform sampler2DArray uFoliage;
in vec3 vUv;
in vec3 vLight;
in vec4 vGrass;
out vec4 fragColor;
void main() {
  // Vormultipliziert hochgeladen - so filtert der Rand ohne dunklen Saum.
  vec4 t = texture(uFoliage, vec3(vUv.x, 1.0 - vUv.y, vUv.z));
  if (t.a < 0.35) discard;
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
  private readonly map: GrassMap;
  private readonly foliage: WebGLTexture;

  /** @param lo, hi Wiesenfarbe (0..255) - dieselbe Palette wie das Gelände. */
  constructor(private readonly gl: WebGL2RenderingContext, lo: RGB, hi: RGB) {
    this.mapProgram = link(gl, FULLSCREEN, MAP);
    this.program = link(gl, VERTEX, FRAGMENT);
    this.vao = gl.createVertexArray()!;
    this.map = { texture: gl.createTexture()!, framebuffer: gl.createFramebuffer()!, size: 0 };
    this.foliage = this.loadFoliage();
    gl.useProgram(this.mapProgram);
    uploadTerrainParams(gl, (name) => this.location(this.mapProgram, name));
    gl.uniform1i(this.location(this.mapProgram, 'uFields'), 2);
    gl.useProgram(this.program);
    gl.uniform1i(this.location(this.program, 'uMap'), MAP_UNIT);
    gl.uniform1i(this.location(this.program, 'uFoliage'), FOLIAGE_UNIT);
    gl.uniform3f(this.location(this.program, 'uGrassLo'), lo[0] / 255, lo[1] / 255, lo[2] / 255);
    gl.uniform3f(this.location(this.program, 'uGrassHi'), hi[0] / 255, hi[1] / 255, hi[2] / 255);
    gl.uniform2fv(this.location(this.program, 'uSize[0]'), KINDS.flatMap((k) => cardSize(k.obj).map((m) => m * TILES_PER_METER)));
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
  }) {
    const perTile = DENSITY.find(([from]) => tileSize >= from)?.[1];
    if (!perTile) return;
    const ppt = camera.pixelsPerTile;
    const gl = this.gl;
    const { width, height } = gl.canvas;
    // Ein Quadrat um die Kamera, groß genug für jede Blickrichtung und Neigung.
    const side = Math.ceil((width + height / viewGroundV()) / ppt) + 4;
    const spacing = 1 / perTile;
    const columns = Math.ceil(side / spacing);
    const originX = Math.floor((camera.centerX - side / 2) / spacing);
    const originY = Math.floor((camera.centerY - side / 2) / spacing);
    const map = this.map;

    // 1. Daten je Rasterzelle.
    if (map.size !== columns) this.allocate(map, columns);
    gl.bindFramebuffer(gl.FRAMEBUFFER, map.framebuffer);
    gl.viewport(0, 0, columns, columns);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.mapProgram);
    gl.bindVertexArray(this.vao);
    const m = (name: string) => this.location(this.mapProgram, name);
    gl.uniform2i(m('uOriginCell'), originX, originY);
    gl.uniform1f(m('uSpacing'), spacing);
    gl.uniform1f(m('uReliefScale'), camera.reliefScale);
    gl.uniform1f(m('uGridCell'), o.gridCell);
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

    // 2. Die Büschel, in den Tiefenpuffer der Szene.
    gl.useProgram(this.program);
    const u = (name: string) => this.location(this.program, name);
    setCameraUniforms(gl, u, camera);
    setLightUniforms(gl, u, o.light);
    gl.uniform2i(u('uOriginCell'), originX, originY);
    gl.uniform1f(u('uSpacing'), spacing);
    gl.uniform1i(u('uColumns'), columns);
    gl.uniform1f(u('uTime'), o.time);
    const [cx, cy] = cameraDirection();
    gl.uniform2f(u('uToCamera'), cx, cy);
    gl.activeTexture(gl.TEXTURE0 + MAP_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, map.texture);
    gl.activeTexture(gl.TEXTURE0 + FOLIAGE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.foliage);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, columns * columns);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
    addRenderStats('grassTufts', columns * columns);
    addRenderStats('drawCalls', 2);
    addRenderStats('vertices', columns * columns * 6);
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
