// particleRenderer.ts
// Partikel als Punkte (GL_POINTS): je Quelle eine Instanz, je Partikel ein
// Eckpunkt (gl_VertexID). Der Vertex-Shader rechnet die Lage analytisch aus
// Quelle, Partikelnummer und Zeit - kein Zustand, keine Simulation, keine
// Objekte je Partikel. Der Fragment-Shader zeichnet die Form aus
// gl_PointCoord, ohne Textur. Ein Programm, ein VAO, ein Puffer, ein Draw-Call.
// Die Quellen sammelt die Welt (src/particles.ts, world/particles.ts).
//
// ponytail: Punkte bleiben unter ALIASED_POINT_SIZE_RANGE; für Effekte über
// ~32 px (Rauch, Staubwolken) auf instanzierte Quads umsteigen, wenn es sie
// gibt - darum bleibt der Staub beim Einsturz ein Modell (world/render.ts).

import { MAX_PER_SOURCE, PARTICLE, SOURCE_FLOATS, type ParticleSources } from '../particles';
import { PROJECT_GLSL, setCameraUniforms, type GpuCamera } from './iso';
import { LIGHT_GLSL, setLightUniforms, type Light } from './light';
import { link } from './terrainRenderer';
import { addRenderStats } from '../renderStats';

const kinds = Object.entries(PARTICLE).map(([name, n]) => `const int ${name.toUpperCase()} = ${n};`).join('\n');

const VERTEX = `#version 300 es
precision highp float;
precision highp int;

${PROJECT_GLSL}
${kinds}

layout(location = 0) in vec4 aOrigin;  // x, y, Bodenhöhe (Tiles, ohne Relief-Stärke), Radius
layout(location = 1) in vec4 aDir;     // Richtung (Strömung, Ufer, Hang), Stärke
layout(location = 2) in vec4 aMeta;    // Art, Zufall, Start (Animations-Uhr), Anzahl

uniform float uTime;        // Animations-Uhr in Sekunden, steht in der Pause
uniform float uMaxPoint;    // größte Punktgröße des Geräts

flat out int vKind;
out vec2  vDir;             // Bewegungsrichtung auf dem Bildschirm, Punkt-Koordinaten (y nach unten)
out float vAlpha;
out float vSeed;
out float vFlap;            // Schmetterling: wie weit die Flügel offen sind, 0..1

uint hash(uint x) {
  x ^= x >> 16; x *= 0x7feb352du;
  x ^= x >> 15; x *= 0x846ca68bu;
  x ^= x >> 16;
  return x;
}
float rnd(uint x) { return float(hash(x)) / 4294967295.0; }

void main() {
  int kind = int(aMeta.x + 0.5);
  vKind = kind;
  gl_PointSize = 0.0;
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);  // hinter der fernen Clip-Ebene: nichts
  if (float(gl_VertexID) >= aMeta.w) return;
  uint s = hash(uint(aMeta.y) * 747796405u + uint(gl_VertexID) * 2891336453u);
  float r0 = rnd(s), r1 = rnd(s + 1u), r2 = rnd(s + 2u), r3 = rnd(s + 3u);
  vSeed = r3;
  vFlap = 1.0;
  vec2 xy = aOrigin.xy;
  float ground = aOrigin.z;
  float R = aOrigin.w;
  vec3 dir = aDir.xyz;
  float t = uTime;
  float lift = 0.0;           // Höhe über dem Boden in Tiles
  vec3 move = vec3(1.0, 0.0, 0.0);
  float size = 0.05;          // Durchmesser in Tiles
  float alpha = 1.0;

  if (kind == BEE) {
    // Lange, ruhige Bahnen über dem Feld, dazu schnelles Zittern.
    float tt = t * (0.5 + 0.3 * r0) + r1 * 40.0;
    xy += vec2(sin(tt * 1.17 + r2 * 6.28), cos(tt * 0.83 + r3 * 6.28)) * R;
    xy += vec2(sin(t * 23.0 + r0 * 9.0), cos(t * 19.0 + r1 * 9.0)) * 0.006;
    // 1 bis 1.5 m hoch - über den Pflanzen, die sie sonst verdecken.
    lift = 0.25 + 0.05 * sin(tt * 1.71 + r0 * 6.28);
    move = vec3(cos(tt * 1.17 + r2 * 6.28) * 1.17, -sin(tt * 0.83 + r3 * 6.28) * 0.83, 0.0);
    // Hummeln (vSeed > 0.8) größer, Wespen (0.5..0.8) schlanker - siehe Fragment-Shader.
    size = r3 > 0.8 ? 0.08 : 0.06;
  } else if (kind == CRAB) {
    // Seitwärts ein Stück hin, Pause, zurück - flach am Boden.
    float period = 5.0 + 4.0 * r0;
    float ph = fract(t / period + r1);
    float go = smoothstep(0.1, 0.3, ph) - smoothstep(0.55, 0.75, ph);
    vec2 side = vec2(cos(r2 * 6.28), sin(r2 * 6.28));
    xy += (vec2(r3, r0) - 0.5) * R + side * go * 0.25;
    lift = 0.006;
    // Blickrichtung quer zum Weg - Krabben laufen seitwärts.
    move = vec3(-side.y, side.x, 0.0);
    vFlap = abs(go - 0.5) < 0.45 ? fract(t * 6.0) : 0.0;  // Beine zappeln nur beim Laufen
    size = 0.06;
  } else if (kind == FISH) {
    // Schwimmt in ruhigen Bögen dicht unter der Oberfläche (blass, vFlap 0).
    // Ab und zu springt er von dort, wo er gerade ist, im Bogen heraus (vFlap 1).
    float tt = t * (0.25 + 0.15 * r0) + r1 * 30.0;
    vec2 swim = vec2(sin(tt * 1.1 + r2 * 6.28), cos(tt * 0.8 + r3 * 6.28));
    xy += swim * R;
    move = vec3(cos(tt * 1.1 + r2 * 6.28) * 1.1, -sin(tt * 0.8 + r3 * 6.28) * 0.8, 0.0);
    lift = 0.002;
    alpha = 0.8;
    vFlap = 0.0;
    // Je Fisch eigene Größe: 0.7- bis 1.3-fach (r3 bestimmt auch die Farbe - r0 unabhängig davon).
    size = 0.08 * (0.7 + 0.6 * fract(r0 * 7.31));
    float period = 6.0 + 8.0 * r0;
    float a = fract(t / period + r2) * period / 0.6;
    if (a <= 1.0) {
      vec2 jump = normalize(move.xy + 1e-4);
      xy += jump * (a - 0.5) * 0.25;
      lift = 4.0 * 0.07 * a * (1.0 - a);
      // In Flugrichtung samt Bogen: erst hoch, dann Kopf voran hinunter.
      move = vec3(jump * 0.25, 0.28 * (1.0 - 2.0 * a));
      alpha = 1.0;
      vFlap = 1.0;
    }
  } else if (kind == BUTTERFLY) {
    // Taumelnd: langsame Bögen, dazu kleine Haken, auf und ab mit dem Flügelschlag.
    float tt = t * (0.3 + 0.15 * r0) + r1 * 50.0;
    vec2 wander = vec2(sin(tt * 1.3 + r2 * 6.28) + 0.4 * sin(tt * 3.1), cos(tt * 0.9 + r3 * 6.28) + 0.4 * cos(tt * 2.3));
    xy += wander * R * 0.7;
    float flap = sin(t * (9.0 + 3.0 * r0) + r1 * 20.0);
    vFlap = 0.25 + 0.75 * abs(flap);
    lift = 0.2 + 0.1 * sin(tt * 2.7 + r0 * 6.28) + 0.02 * flap;
    move = vec3(cos(tt * 1.3 + r2 * 6.28) * 1.3, -sin(tt * 0.9 + r3 * 6.28) * 0.9, 0.0);
    // Je Schmetterling eigene Größe: 0.7- bis 1.3-fach.
    size = 0.09 * (0.7 + 0.6 * fract(r0 * 7.31));
  } else if (kind == GOLD || kind == SPARKLE) {
    // Meist nichts, dann ein kurzer Blitz an einer anderen Stelle des Felsens.
    // Gold und Stein gleich - nur die Farbe unterscheidet sie (Fragment-Shader).
    // Stärke < 1 (Wasser): kleiner, seltener, blasser.
    float k = aDir.w;
    float cycle = t / ((2.0 + 2.5 * r0) / k) + r1;
    float age = fract(cycle);
    uint c = hash(s + uint(floor(cycle)) * 97u);
    alpha = smoothstep(0.8, 0.87, age) * (1.0 - smoothstep(0.87, 0.97, age)) * mix(0.6, 1.0, k);
    xy += (vec2(rnd(c), rnd(c + 1u)) - 0.5) * 2.0 * R;
    lift = 0.03 + 0.1 * rnd(c + 2u);
    size = (0.09 + 0.05 * r2) * k;
  } else if (kind == DEBRIS) {
    // Schutt: im Bogen hinaus, dann liegt er, am Ende blendet er aus.
    // dir = (Flugzeit, Beginn und Ende des Ausblendens), Stärke = Gebäudegröße.
    float age = t - aMeta.z;
    float angle = (float(gl_VertexID) + r0 * 0.6) / aMeta.w * 6.2832;
    float reach = R * (0.45 + 0.7 * r1);
    float flight = dir.x;
    float tf = min(age, flight);
    float vz = aDir.w * (1.2 + 1.6 * r2);
    move = vec3(cos(angle), sin(angle), 0.0);
    xy += move.xy * reach * tf / flight;
    lift = max(0.0, vz * tf - vz / flight * tf * tf) * 0.6;
    alpha = 1.0 - smoothstep(dir.y, dir.z, age);
    size = aDir.w * (0.12 + 0.14 * r3);
  } else if (kind == LEAF) {
    // Blätter lösen sich oben am Strauch und trudeln zu Boden.
    float life = 1.6 + 0.8 * r0;
    float age = fract(t / life + r1);
    float a = age * life;
    xy += (vec2(r2, r3) - 0.5) * 2.0 * R + vec2(sin(a * 5.0 + r0 * 9.0), cos(a * 4.0 + r1 * 9.0)) * 0.03;
    lift = max(0.0, (0.12 + 0.08 * r2) * (1.0 - age * 1.3));
    alpha = 1.0 - smoothstep(0.8, 1.0, age);
    move = vec3(cos(a * 5.0 + r0 * 9.0), sin(a * 4.0), 0.0);
    size = 0.03;
  } else if (kind == FOAM) {
    // Gischt längs des Bootsrumpfs (R = halbe Bootslänge): treibt nach
    // außen und hinten weg und zerfällt.
    float life = 0.9 + 0.5 * r0;
    float age = fract(t / life + r1);
    vec2 across = vec2(-dir.y, dir.x);
    float along = (r2 - 0.5) * 2.0 * R;
    float side = (r3 < 0.5 ? -1.0 : 1.0) * (0.07 * (1.0 - abs(along) / R) + 0.02 + 0.14 * age);
    xy += dir.xy * (along - 0.2 * age) + across * side;
    lift = 0.004 + 0.012 * sin(age * 3.1416);
    alpha = (1.0 - age) * 0.95;
    move = dir;
    size = 0.05 + 0.05 * age;
  } else {
    // Gespritzt: Späne (Holz), Dreck (Pflügen), Wasser (Angel). Aus einem
    // Punkt im Bogen hinaus, unter Schwerkraft zurück; liegen kurz, blenden aus.
    bool water = kind == SPLASH;
    float life = water ? 0.7 : kind == CHIPS ? 0.9 : 0.6;
    float period = water ? 1.8 + 0.8 * r0 : life * (1.0 + 0.5 * r0);
    float age = fract(t / period + r1) * period / life;
    if (age > 1.0) return;
    float a = age * life;
    // Wasser rundum, Späne und Dreck nach vorn und zur Seite.
    float angle = water ? float(gl_VertexID) / aMeta.w * 6.2832 + r2 : atan(dir.y, dir.x) + (r2 - 0.5) * 2.6;
    vec2 out2 = vec2(cos(angle), sin(angle));
    float speed = water ? 0.18 + 0.08 * r3 : kind == CHIPS ? 0.35 + 0.3 * r3 : 0.25 + 0.2 * r3;
    float up = water ? 0.5 : kind == CHIPS ? 0.6 : 0.45;
    float start = kind == CHIPS ? 0.2 : 0.01;
    xy += out2 * speed * a * max(aDir.w, 1.0);
    lift = max(0.0, start + up * (0.7 + 0.6 * r0) * a - 3.0 * a * a);
    alpha = 1.0 - smoothstep(0.7, 1.0, age);
    move = vec3(out2, 0.0);
    // Stärke > 1: kräftiger (Boot über Land, Hausbau) - größere Brocken, weiter.
    size = (water ? 0.025 : kind == CHIPS ? 0.03 : 0.022) * max(aDir.w, 1.0);
  }

  float z = ground * uReliefScale + lift;
  vec4 at = project(xy, z);
  vec4 ahead = project(xy + move.xy * 0.05, z + move.z * 0.05);
  vec2 screen = (ahead.xy / ahead.w - at.xy / at.w) * uResolution;
  vDir = length(screen) > 1e-4 ? normalize(vec2(screen.x, -screen.y)) : vec2(1.0, 0.0);
  float px = size * uPixelsPerTile;
  // Kleiner als ein Pixel: blasser statt flimmernd.
  vAlpha = alpha * min(1.0, px);
  gl_PointSize = clamp(px, 1.0, uMaxPoint);
  gl_Position = at;
}
`;

const FRAGMENT = `#version 300 es
precision highp float;
${kinds}
${LIGHT_GLSL}

flat in int vKind;
in vec2  vDir;
in float vAlpha;
in float vSeed;
in float vFlap;
out vec4 fragColor;

void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  // In Bewegungsrichtung gedreht: r.x entlang, r.y quer.
  vec2 r = vec2(dot(q, vDir), dot(q, vec2(-vDir.y, vDir.x)));
  float a = 0.0;
  vec3 c = vec3(1.0);
  bool lit = true;
  if (vKind == BEE) {
    // Gestreifter Leib, quer dazu helle Flügel. Honigbiene bernstein und
    // braun, Wespe knallgelb und schwarz und schlanker, Hummel dick, schwarz-gelb
    // mit heller Spitze - und jedes Tier ein wenig anders getönt.
    bool wasp = vSeed > 0.5 && vSeed <= 0.8;
    bool bumble = vSeed > 0.8;
    float body = 1.0 - smoothstep(0.75, 1.0, length(r * vec2(1.0, wasp ? 2.8 : bumble ? 1.6 : 2.2)));
    float wings = 1.0 - smoothstep(0.6, 0.9, length((r - vec2(0.05, 0.0)) * vec2(2.2, 1.1)));
    vec3 light = wasp ? vec3(1.0, 0.86, 0.08) : bumble ? vec3(0.95, 0.8, 0.25) : vec3(0.92, 0.62, 0.16);
    vec3 dark = wasp || bumble ? vec3(0.08, 0.07, 0.06) : vec3(0.3, 0.18, 0.08);
    light *= 0.9 + 0.2 * fract(vSeed * 13.7);
    c = fract(r.x * 2.2 + 0.2) < 0.4 ? dark : light;
    if (bumble && r.x < -0.55) c = vec3(0.95, 0.93, 0.88);
    c = mix(vec3(0.9, 0.95, 1.0), c, body);
    a = max(body, wings * 0.45);
  } else if (vKind == CRAB) {
    // Rundlicher roter Panzer, vorn zwei Scheren, an den Seiten zappelnde Beine.
    float body = 1.0 - smoothstep(0.42, 0.52, length(r * vec2(1.3, 1.0)));
    vec2 cl = vec2(abs(r.y) - 0.42, r.x - 0.5);
    float claws = 1.0 - smoothstep(0.12, 0.2, length(cl));
    float legs = (1.0 - smoothstep(0.04, 0.09, abs(fract((r.x + 0.4 + vFlap * 0.1) * 3.0) - 0.5) * 0.3))
        * step(0.45, abs(r.y)) * step(abs(r.y), 0.8) * step(abs(r.x), 0.4);
    a = max(max(body, claws), legs);
    // Fünf Sorten: rot, orange, sandgelb, blaugrau, violett.
    int pick = int(vSeed * 5.0);
    vec3 shell = pick == 0 ? vec3(0.85, 0.28, 0.18) : pick == 1 ? vec3(0.95, 0.55, 0.2)
               : pick == 2 ? vec3(0.9, 0.78, 0.45) : pick == 3 ? vec3(0.4, 0.52, 0.68) : vec3(0.58, 0.35, 0.62);
    c = shell * (body > 0.5 ? 1.0 : 0.8);
  } else if (vKind == FISH) {
    // Schlanker silbriger Leib, dunkler Rücken, gegabelte Schwanzflosse.
    float body = 1.0 - smoothstep(0.8, 1.0, length(r * vec2(1.3, 3.6)));
    float tail = step(r.x, -0.6) * step(-0.95, r.x) * (1.0 - smoothstep(0.0, 0.1, abs(r.y) - (-0.6 - r.x) * 0.9));
    a = max(body, tail);
    c = mix(vec3(0.55, 0.62, 0.68), vec3(0.88, 0.92, 0.95), smoothstep(-0.2, 0.2, -r.y));
    // Unter Wasser: je Fisch von dunkelblau bis hellblau, der Rücken dunkler.
    if (vFlap < 0.5) c = mix(vec3(0.04, 0.12, 0.32), vec3(0.4, 0.68, 0.9), vSeed) * mix(0.8, 1.1, smoothstep(-0.2, 0.2, -r.y));
  } else if (vKind == BUTTERFLY) {
    // Zwei Flügelpaare links und rechts des Leibs; beim Schlag klappen sie
    // zusammen (vFlap). Blau, rot, gelb oder weiß, dunkler Rand, dunkler Leib.
    vec2 w = vec2(r.x, abs(r.y) / max(vFlap, 0.2));
    float fore = 1.0 - smoothstep(0.35, 0.5, length(w - vec2(0.18, 0.42)));
    float hind = 1.0 - smoothstep(0.25, 0.38, length(w - vec2(-0.2, 0.38)));
    float wing = max(fore, hind);
    float body = 1.0 - smoothstep(0.06, 0.12, abs(r.y)) * 1.0;
    body *= 1.0 - smoothstep(0.45, 0.55, abs(r.x));
    int pick = int(vSeed * 4.0);
    vec3 col = pick == 0 ? vec3(0.25, 0.45, 0.95) : pick == 1 ? vec3(0.9, 0.22, 0.18)
             : pick == 2 ? vec3(1.0, 0.85, 0.2) : vec3(0.97, 0.97, 0.94);
    float rim = smoothstep(0.3, 0.46, length(w - vec2(0.18, 0.42)));
    c = mix(col * (1.0 - 0.45 * rim), vec3(0.12, 0.1, 0.08), body);
    a = max(wing, body);
  } else if (vKind == GOLD || vKind == SPARKLE) {
    // Vierzackiger Stern mit hellem Kern - leuchtet selbst; Gold warm, Stein weiß.
    float star = max(exp(-abs(q.x) * 14.0) * exp(-abs(q.y) * 2.6), exp(-abs(q.y) * 14.0) * exp(-abs(q.x) * 2.6));
    a = clamp(star + exp(-dot(q, q) * 10.0), 0.0, 1.0);
    c = vKind == GOLD ? vec3(1.0, 0.92, 0.6) : vec3(1.0);
    lit = false;
  } else if (vKind == DEBRIS) {
    // Unregelmäßiger Brocken, oben links heller.
    float edge = abs(r.x) + abs(r.y) * 1.25 + 0.15 * sin(atan(q.y, q.x) * 3.0 + vSeed * 20.0);
    a = 1.0 - smoothstep(0.8, 0.95, edge);
    c = mix(vec3(0.52, 0.47, 0.41), vec3(0.64, 0.6, 0.55), vSeed) * (0.85 + 0.3 * clamp(-q.x * 0.5 - q.y * 0.5, -0.5, 0.8));
  } else if (vKind == CHIPS) {
    // Heller Holzspan: ein schmales Stück, quer zur Flugrichtung.
    a = 1.0 - smoothstep(0.7, 0.95, max(abs(r.x) * 2.2, abs(r.y)));
    c = mix(vec3(0.86, 0.72, 0.48), vec3(0.72, 0.56, 0.34), vSeed);
  } else if (vKind == DIRT) {
    a = 1.0 - smoothstep(0.6, 1.0, length(q));
    c = mix(vec3(0.36, 0.26, 0.17), vec3(0.45, 0.34, 0.22), vSeed);
  } else if (vKind == LEAF) {
    // Kleines grünes Blatt, längs der Drehung.
    a = 1.0 - smoothstep(0.75, 1.0, length(r * vec2(1.0, 2.0)));
    c = mix(vec3(0.25, 0.5, 0.18), vec3(0.4, 0.6, 0.22), vSeed);
  } else if (vKind == SPLASH) {
    a = (1.0 - smoothstep(0.4, 1.0, length(q))) * 0.9;
    c = vec3(0.85, 0.93, 1.0);
  } else if (vKind == FOAM) {
    a = (1.0 - smoothstep(0.2, 1.0, length(q))) * 0.8;
    c = vec3(0.95, 0.97, 0.97);
  }
  a *= vAlpha;
  if (a < 0.02) discard;
  if (lit) c *= uLight.x * uSunColor;
  fragColor = vec4(c, a);
}
`;

export class ParticleRenderer {
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly buffer: WebGLBuffer;
  private readonly locations = new Map<string, WebGLUniformLocation | null>();
  private readonly maxPoint: number;

  constructor(private readonly gl: WebGL2RenderingContext, capacity: number) {
    this.program = link(gl, VERTEX, FRAGMENT);
    // Einmal abgefragt: Punkte dürfen je Gerät verschieden groß werden.
    this.maxPoint = (gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array)[1];
    this.vao = gl.createVertexArray()!;
    this.buffer = gl.createBuffer()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, capacity * SOURCE_FLOATS * 4, gl.DYNAMIC_DRAW);
    for (let i = 0; i < 3; i++) {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, 4, gl.FLOAT, false, SOURCE_FLOATS * 4, i * 16);
      gl.vertexAttribDivisor(i, 1);
    }
    gl.bindVertexArray(null);
  }

  /**
   * Zeichnet die Partikel über Gelände und Modelle: mit Tiefentest (hinter
   * Häusern und Bergen verdeckt), ohne Tiefe zu schreiben, halbdurchsichtig,
   * ohne Sortieren - bei so kleinen, spärlichen Punkten fällt das nicht auf.
   */
  render(sources: ParticleSources, camera: GpuCamera, time: number, light: Light) {
    if (sources.count === 0) return;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, sources.data, 0, sources.count * SOURCE_FLOATS);
    const u = (name: string) => this.location(name);
    setCameraUniforms(gl, u, camera);
    setLightUniforms(gl, u, light);
    gl.uniform1f(u('uTime'), time);
    gl.uniform1f(u('uMaxPoint'), this.maxPoint);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArraysInstanced(gl.POINTS, 0, MAX_PER_SOURCE, sources.count);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
    addRenderStats('drawCalls', 1);
    addRenderStats('particleSources', sources.count);
    addRenderStats('particles', sources.particles);
  }

  private location(name: string): WebGLUniformLocation | null {
    if (!this.locations.has(name)) this.locations.set(name, this.gl.getUniformLocation(this.program, name));
    return this.locations.get(name)!;
  }
}
