// grassRenderer.ts
// Echte Grashalme in der Wiese, nur herangezoomt: Büschel aus hohen, spitzen
// Halmen (je Halm ein Dreieck), die still stehen, dazu hier und da ein Busch
// aus vielen Halmen, der als Ganzes im Wind wiegt. Kein Vertex-Puffer, kein
// Alpha. Die Büschel liegen auf einem festen Weltraster um die Kamera - der
// Zufall hängt an der Weltzelle, so springt beim Verschieben nichts.
//
// Je Art (Gras, Büsche) zwei Draw-Calls:
//   1. Daten: je Rasterzelle ein Texel - Höhe (16 Bit über R, G) und wie viel
//      Wiese dort ist (B), aus derselben Geländefunktion wie das Bild
//      (TERRAIN_COMMON, BIOME_GLSL). So wächst Gras nur, wo das Gelände Wiese
//      malt, und die teure Rechnung läuft einmal je Büschel, nicht je Eckpunkt.
//   2. Halme: gl_InstanceID = Rasterzelle, ein texelFetch, der Rest aus dem Zufall.

import { BIOME_GLSL, TERRAIN_COMMON } from './terrainShader';
import { PROJECT_GLSL, bindScreen, setCameraUniforms, viewGroundV, type GpuCamera } from './iso';
import { LIGHT_GLSL, setLightUniforms, type Light } from './light';
import { FIELD_WINDOW, link, uploadTerrainParams } from './terrainRenderer';
import { FLATTEN_GLSL } from '../world/flatten';
import { addRenderStats } from '../renderStats';

/** Halme je Büschel bzw. Busch - je Halm ein Dreieck. */
const BLADES = 4;
const BUSH_BLADES = 12;
/**
 * Büschel je Tile-Kante nach CSS-Pixeln je Tile: Zoom 5 (128) dicht, Zoom 4
 * (64) halb so dicht - dort ist viermal so viel Wiese im Bild und die Halme
 * sind halb so groß. Darunter (ab Zoom 3) sofort keins, die Bodentextur
 * reicht und es bliebe zu teuer.
 */
const DENSITY: [number, number][] = [[96, 6], [48, 3]];
/** Büsche: ein Rasterplatz je so viele Tiles, davon ein Teil besetzt (im Shader). */
const BUSH_SPACING = 1.2;
/** Höhen bis hierhin (Tiles) passen in die 16 Bit der Daten-Textur. */
const MAX_Z = 64;
/** Texture-Unit der Daten-Textur beim Zeichnen (0: Rauschtabelle, 2: Äcker). */
const MAP_UNIT = 9;

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

/** Durchgang 1: je Rasterzelle Höhe und Wiesenanteil. */
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
  // Tönung wie die Flecken der Bodentextur (grassTexture): trocken > 0.5, satt < 0.5.
  float dry = smoothstep(0.2, 0.9, snoise(L_MICRO, pos * 0.05 + vec2(-40.0, 12.0)) - moisture * 0.8);
  float lush = smoothstep(0.35, 0.8, snoise(L_MICRO, pos * 0.35 + vec2(70.0, -12.0)));
  fragColor = vec4(floor(z / 256.0) / 255.0, mod(floor(z), 256.0) / 255.0, meadow, 0.5 + dry * 0.5 - lush * 0.4);
}
`;

/** Durchgang 2: die Halme. */
const VERTEX = `#version 300 es
precision highp float;
precision highp int;

${PROJECT_GLSL}
${LIGHT_GLSL}
${CELL_GLSL}

uniform int   uColumns;      // Rasterzellen je Zeile
uniform sampler2D uMap;      // Durchgang 1
uniform float uTime;
uniform int   uBush;         // 1: Büsche statt Gras
uniform vec3  uGrassLo;
uniform vec3  uGrassHi;

out vec3 vColor;

void main() {
  ivec2 local = ivec2(gl_InstanceID % uColumns, gl_InstanceID / uColumns);
  vec4 data = texelFetch(uMap, local, 0);
  ivec2 cell = uOriginCell + local;
  uint seed = cellSeed(cell);
  vec2 pos = cellPos(cell, seed);
  bool bush = uBush == 1;
  // Büsche nur an wenigen Rasterplätzen, Gras fast überall in der Wiese.
  if (rnd(seed + 2u) >= data.b * (bush ? 0.45 : 0.95)) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);  // hinter der fernen Clip-Ebene: nichts
    return;
  }
  float z = (data.r * 65280.0 + data.g * 255.0) / 65535.0 * ${MAX_Z.toFixed(1)} - 0.003;

  // Ein Halm: schmal und spitz, zufällig gedreht, im Büschel verstreut. Gras
  // steht still; ein Busch fächert seine Halme nach außen und wiegt als
  // Ganzes im Wind.
  int corner = gl_VertexID % 3;
  uint b = hash(seed + 7u * uint(gl_VertexID / 3 + 1));
  float turn = rnd(b) * 6.2832;
  vec2 across = vec2(cos(turn), sin(turn));
  vec2 spread = (vec2(rnd(b + 1u), rnd(b + 2u)) - 0.5) * (bush ? 0.1 : 0.07);
  vec2 foot = pos + spread;
  // Gras 0.5 bis 1 m hoch (1 Tile = 5 m), ein Busch 0.8 bis 1.4 m; wenige cm breit.
  float tall = bush ? 0.16 + 0.12 * rnd(b + 3u) : 0.1 + 0.1 * rnd(b + 3u);
  float wide = bush ? 0.012 + 0.008 * rnd(b + 4u) : 0.004 + 0.004 * rnd(b + 4u);
  vec3 p = vec3(foot + across * (corner == 0 ? -wide : wide), z);
  if (corner == 2) {
    vec2 lean = (vec2(rnd(b + 6u), rnd(b + 7u)) - 0.5) * 0.35;
    if (bush) {
      // Nach außen gefächert, und der ganze Busch wiegt im selben Takt.
      lean = spread * 6.0 + lean * 0.4;
      float wind = sin(uTime * 1.3 + pos.x * 0.37 + pos.y * 0.23) * 0.6 + sin(uTime * 2.1 + pos.x) * 0.25;
      lean += vec2(0.6, 0.3) * wind * 0.3;
    }
    p = vec3(foot + lean * tall, z + tall);
  }
  gl_Position = project(p.xy, p.z);

  // Farbe wie die Wiese: am Fuß dunkel, zur Spitze hell - so hebt sich der
  // Halm vom Boden ab. Büsche dunkler und satter. Licht wie die Modelle: die
  // Fläche des Halms zur Sonne, doppelseitig.
  vec3 green = mix(uGrassLo, uGrassHi, rnd(seed + 3u) * 0.7 + rnd(b + 8u) * 0.3);
  // Wie der Boden darunter: trockene Flecken gelblich, satte dunkler (data.a,
  // 0.5 = gewöhnlich), dazu je Büschel eine leichte eigene Tönung.
  green = mix(green, vec3(0.66, 0.64, 0.34), clamp(data.a * 2.0 - 1.0, 0.0, 1.0) * 0.6);
  green *= mix(vec3(1.0), vec3(0.78, 0.9, 0.7), clamp(1.0 - data.a * 2.0, 0.0, 1.0));
  green *= vec3(1.0 + (rnd(seed + 4u) - 0.5) * 0.18, 1.0, 1.0 - (rnd(seed + 5u) - 0.5) * 0.14);
  if (bush) green *= vec3(0.72, 0.85, 0.62);
  green *= corner == 2 ? 1.3 : 0.55;
  vec3 facing = normalize(vec3(-across.y, across.x, 0.5));
  float sun = 0.45 + 0.75 * (0.35 + 0.65 * abs(dot(facing, uSunDir)));
  vColor = green * mix(0.95, sun, uLight.y) * uLight.x * uSunColor;
}
`;

const FRAGMENT = `#version 300 es
precision mediump float;
in vec3 vColor;
out vec4 fragColor;
void main() {
  fragColor = vec4(vColor, 1.0);
}
`;

type RGB = [number, number, number];

/** Daten-Textur einer Art mit ihrem Framebuffer. */
interface GrassMap {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  size: number;
}

export class GrassRenderer {
  private readonly mapProgram: WebGLProgram;
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly locations = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
  private readonly maps: GrassMap[];

  /** @param lo, hi Wiesenfarbe (0..255) - dieselbe Palette wie das Gelände. */
  constructor(private readonly gl: WebGL2RenderingContext, lo: RGB, hi: RGB) {
    this.mapProgram = link(gl, FULLSCREEN, MAP);
    this.program = link(gl, VERTEX, FRAGMENT);
    this.vao = gl.createVertexArray()!;
    this.maps = [0, 1].map(() => ({ texture: gl.createTexture()!, framebuffer: gl.createFramebuffer()!, size: 0 }));
    gl.useProgram(this.mapProgram);
    uploadTerrainParams(gl, (name) => this.location(this.mapProgram, name));
    gl.uniform1i(this.location(this.mapProgram, 'uFields'), 2);
    gl.useProgram(this.program);
    gl.uniform3f(this.location(this.program, 'uGrassLo'), lo[0] / 255, lo[1] / 255, lo[2] / 255);
    gl.uniform3f(this.location(this.program, 'uGrassHi'), hi[0] / 255, hi[1] / 255, hi[2] / 255);
    gl.uniform1i(this.location(this.program, 'uMap'), MAP_UNIT);
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
    let vertices = 0;

    // Erst das stille Gras, dann die Büsche - je auf ihrem eigenen Raster.
    const kinds: [number, number, number][] = [[0, 1 / perTile, BLADES], [1, BUSH_SPACING, BUSH_BLADES]];
    for (const [bush, spacing, blades] of kinds) {
      const columns = Math.ceil(side / spacing);
      const originX = Math.floor((camera.centerX - side / 2) / spacing);
      const originY = Math.floor((camera.centerY - side / 2) / spacing);
      const map = this.maps[bush];

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

      // 2. Die Halme, in den Tiefenpuffer der Szene.
      gl.useProgram(this.program);
      const u = (name: string) => this.location(this.program, name);
      setCameraUniforms(gl, u, camera);
      setLightUniforms(gl, u, o.light);
      gl.uniform2i(u('uOriginCell'), originX, originY);
      gl.uniform1f(u('uSpacing'), spacing);
      gl.uniform1i(u('uColumns'), columns);
      gl.uniform1f(u('uTime'), o.time);
      gl.uniform1i(u('uBush'), bush);
      gl.activeTexture(gl.TEXTURE0 + MAP_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, map.texture);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, blades * 3, columns * columns);
      vertices += columns * columns * blades * 3;
      if (bush === 0) addRenderStats('grassTufts', columns * columns);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
    addRenderStats('drawCalls', 4);
    addRenderStats('vertices', vertices);
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
