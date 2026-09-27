// postRenderer.ts
// Post-Effekte hinter der ganzen Hauptszene: Gelände und Modelle zeichnen in
// einen eigenen Framebuffer (begin), ein Bildschirm-Pass setzt daraus das
// Bild im Canvas zusammen (end):
//
//   Szene (RGBA8, volle Auflösung)
//     ├──────────────────────────────→ Zusammensetzen → Canvas
//     └→ ¼ Auflösung: helle Stellen → Kawase-Weichzeichner ×2 ↗
//
// Zusammensetzen: FXAA, Glühen (Bloom), etwas Kontrast und Sättigung, leicht
// warm, Vignette - und Regen vor der Kamera, wenn es regnet. Vier Draw-Calls
// je Bild, kein MSAA, keine HDR-Textur.
//
// Wer zwischendurch selbst einen Framebuffer bindet (Gelände-Cache,
// Baumbilder), kehrt mit bindScreen() (iso.ts) zurück.

import { animationTime } from './entityRenderer';
import { bindScreen, screens } from './iso';
import { link } from './terrainRenderer';
import { addRenderStats } from '../renderStats';

/** Die Regler - klein gehalten, der Stil soll bleiben, wie er ist. */
export const POST = {
  /** Ab dieser Helligkeit (0..1) glüht es, darüber weich über `bloomKnee`. */
  bloomThreshold: 0.78,
  bloomKnee: 0.15,
  bloomStrength: 0.08,
  // Farbgebung: dezent und freundlich - Mitteltöne etwas heller (Gamma < 1),
  // Farben etwas satter, sonnig warm, kaum Kontrast und Vignette (die machen es trüb).
  gamma: 0.96,
  contrast: 1.015,
  saturation: 1.07,
  warm: [1.015, 1.005, 0.985] as const,
  vignette: 0.02,
};

const VERTEX = `#version 300 es
// Ein Dreieck über den ganzen Bildschirm, ohne Puffer.
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

/** ¼ Auflösung: nur die hellen Stellen, aus vier Abtastungen je Texel (deckt 4×4 Pixel ab). */
const BRIGHT = `#version 300 es
precision mediump float;
uniform sampler2D uScene;
uniform vec2 uTexel;       // ein Pixel der Szene in UV
uniform vec2 uThreshold;   // Schwelle, Übergang
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy * 4.0 * uTexel;
  vec3 c = (texture(uScene, uv + uTexel * vec2(-1.0, -1.0)).rgb + texture(uScene, uv + uTexel * vec2(1.0, -1.0)).rgb
          + texture(uScene, uv + uTexel * vec2(-1.0, 1.0)).rgb + texture(uScene, uv + uTexel * vec2(1.0, 1.0)).rgb) * 0.25;
  float bright = max(c.r, max(c.g, c.b));
  fragColor = vec4(c * smoothstep(uThreshold.x, uThreshold.x + uThreshold.y, bright), 1.0);
}
`;

/** Kawase-Weichzeichner: vier Abtastungen im Abstand `uOffset` Texel. */
const BLUR = `#version 300 es
precision mediump float;
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform float uOffset;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy * uTexel;
  vec2 o = uTexel * uOffset;
  fragColor = vec4((texture(uSource, uv + vec2(-o.x, -o.y)).rgb + texture(uSource, uv + vec2(o.x, -o.y)).rgb
                  + texture(uSource, uv + vec2(-o.x, o.y)).rgb + texture(uSource, uv + vec2(o.x, o.y)).rgb) * 0.25, 1.0);
}
`;

const COMPOSITE = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2 uTexel;
uniform float uBloomStrength;  // 0: kein Glühen
uniform int uFxaa;             // 1: Kantenglättung
uniform vec4 uGrade;       // Kontrast, Sättigung, Vignette, Gamma
uniform vec3 uWarm;
uniform float uRain;       // 0 trocken .. 1 voller Regen
uniform float uTime;       // Sekunden, steht in der Pause
uniform float uPixelRatio;
out vec4 fragColor;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// FXAA, die knappe Fassung: Kante aus den vier Diagonalen, entlang ihrer
// Richtung gemittelt - neun Abtastungen.
vec3 fxaa(vec2 uv) {
  vec3 m = texture(uScene, uv).rgb;
  float lNW = luma(texture(uScene, uv + vec2(-1.0, -1.0) * uTexel).rgb);
  float lNE = luma(texture(uScene, uv + vec2(1.0, -1.0) * uTexel).rgb);
  float lSW = luma(texture(uScene, uv + vec2(-1.0, 1.0) * uTexel).rgb);
  float lSE = luma(texture(uScene, uv + vec2(1.0, 1.0) * uTexel).rgb);
  float lM = luma(m);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  // Kaum Unterschied: keine Kante, nichts zu tun.
  if (lMax - lMin < max(0.03, lMax * 0.125)) return m;
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
  dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + reduce), -8.0, 8.0) * uTexel;
  vec3 a = 0.5 * (texture(uScene, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture(uScene, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture(uScene, uv - dir * 0.5).rgb + texture(uScene, uv + dir * 0.5).rgb);
  float lB = luma(b);
  return lB < lMin || lB > lMax ? a : b;
}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Eine Schicht Regen: je Spalte ein schräger Strich, der nach unten zieht.
// size: Spaltenbreite in CSS-Pixeln, speed: CSS-Pixel je Sekunde.
float rainLayer(vec2 px, float size, float speed, float seed) {
  px.x += px.y * 0.18;
  // px.y wächst nach unten: die Zeit abziehen, dann fällt das Muster.
  px.y -= uTime * speed;
  vec2 cell = vec2(floor(px.x / size), floor(px.y / (size * 9.0)));
  vec2 f = vec2(fract(px.x / size), fract(px.y / (size * 9.0)));
  // Setzt der Regen ein, fallen erst wenige Tropfen, dann immer mehr.
  float r = hash(cell + seed);
  if (r > 0.55 * uRain) return 0.0;
  float x = abs(f.x - 0.2 - 0.6 * hash(cell + seed + 7.0));
  float line = 1.0 - smoothstep(0.0, 0.9 / size, x);
  return line * smoothstep(0.0, 0.25, f.y) * (1.0 - smoothstep(0.55, 0.8, f.y));
}

void main() {
  vec2 uv = gl_FragCoord.xy * uTexel;
  vec3 color = uFxaa == 1 ? fxaa(uv) : texture(uScene, uv).rgb;
  if (uBloomStrength > 0.0) color += texture(uBloom, uv).rgb * uBloomStrength;

  // Farbe: Mitteltöne aufhellen, etwas Kontrast und Sättigung, leicht warm.
  color = pow(max(color, 0.0), vec3(uGrade.w));
  color = (color - 0.5) * uGrade.x + 0.5;
  color = mix(vec3(luma(color)), color, uGrade.y) * uWarm;

  if (uRain > 0.0) {
    // Regen vor der Kamera: trüber, kühler, darüber Striche in drei Tiefen.
    color = mix(color, vec3(luma(color)) * vec3(0.85, 0.9, 1.0), 0.25 * uRain) * (1.0 - 0.12 * uRain);
    vec2 px = vec2(gl_FragCoord.x, -gl_FragCoord.y) / uPixelRatio;
    float streaks = rainLayer(px, 14.0, 900.0, 1.0) * 0.5
                  + rainLayer(px, 9.0, 650.0, 2.0) * 0.35
                  + rainLayer(px, 6.0, 420.0, 3.0) * 0.25;
    color = mix(color, vec3(0.78, 0.82, 0.9), clamp(streaks, 0.0, 1.0) * 0.45 * uRain);
  }

  vec2 p = uv * 2.0 - 1.0;
  color *= 1.0 - dot(p, p) * uGrade.z;
  fragColor = vec4(color, 1.0);
}
`;

interface Target {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
}

export class PostRenderer {
  private readonly bright: WebGLProgram;
  private readonly blur: WebGLProgram;
  private readonly composite: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly locations = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
  private scene: Target | null = null;
  private depth: WebGLRenderbuffer | null = null;
  private bloomTargets: [Target, Target] | null = null;
  private width = 0;
  private height = 0;
  /** Regen vor der Kamera, 0..1 (game/Lighting.ts). */
  rain = 0;
  /** Welche Effekte laufen (Einstellungen). Ohne Glühen entfallen seine drei Passes. */
  fxaa = true;
  grading = true;
  bloom = true;

  /** Gibt es überhaupt etwas zu tun? Sonst zeichnet die Szene direkt ins Canvas. */
  get active(): boolean {
    return this.fxaa || this.grading || this.bloom || this.rain > 0;
  }

  constructor(private readonly gl: WebGL2RenderingContext, private readonly pixelRatio: () => number) {
    this.bright = link(gl, VERTEX, BRIGHT);
    this.blur = link(gl, VERTEX, BLUR);
    this.composite = link(gl, VERTEX, COMPOSITE);
    // Ohne Attribute - aber ein eigener VAO, damit kein fremder Zustand mitspielt.
    this.vao = gl.createVertexArray()!;
  }

  /** Ab jetzt zeichnet der "Bildschirm" in die Szene - in Canvas-Größe. */
  begin() {
    const gl = this.gl;
    const { width, height } = gl.canvas;
    if (width !== this.width || height !== this.height) this.resize(width, height);
    screens.set(gl, this.scene!.framebuffer);
    bindScreen(gl);
  }

  /** Nichts gezeichnet: zurück zum Canvas, das letzte Bild bleibt stehen. */
  cancel() {
    screens.delete(this.gl);
    bindScreen(this.gl);
  }

  /** Die Szene mit allen Effekten ins Canvas. */
  end() {
    const gl = this.gl;
    const [a, b] = this.bloomTargets!;
    const bw = Math.max(1, this.width >> 2);
    const bh = Math.max(1, this.height >> 2);
    screens.delete(gl);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.depthMask(false);
    gl.bindVertexArray(this.vao);
    const texel = [1 / this.width, 1 / this.height] as const;

    // Helle Stellen auf ¼, dann zweimal weichzeichnen: a → b → a.
    if (this.bloom) {
      gl.viewport(0, 0, bw, bh);
      this.pass(this.bright, a.framebuffer, this.scene!.texture, (u) => {
        gl.uniform2f(u('uTexel'), ...texel);
        gl.uniform2f(u('uThreshold'), POST.bloomThreshold, POST.bloomKnee);
      });
      this.pass(this.blur, b.framebuffer, a.texture, (u) => {
        gl.uniform2f(u('uTexel'), 1 / bw, 1 / bh);
        gl.uniform1f(u('uOffset'), 1.5);
      });
      this.pass(this.blur, a.framebuffer, b.texture, (u) => {
        gl.uniform2f(u('uTexel'), 1 / bw, 1 / bh);
        gl.uniform1f(u('uOffset'), 2.5);
      });
    }

    // Zusammensetzen ins Canvas.
    gl.viewport(0, 0, this.width, this.height);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, a.texture);
    this.pass(this.composite, null, this.scene!.texture, (u) => {
      gl.uniform1i(u('uBloom'), 1);
      gl.uniform2f(u('uTexel'), ...texel);
      gl.uniform1i(u('uFxaa'), this.fxaa ? 1 : 0);
      gl.uniform1f(u('uBloomStrength'), this.bloom ? POST.bloomStrength : 0);
      // Ohne Farbgebung: Kontrast, Sättigung und Wärme 1, keine Vignette.
      if (this.grading) {
        gl.uniform4f(u('uGrade'), POST.contrast, POST.saturation, POST.vignette, POST.gamma);
        gl.uniform3f(u('uWarm'), ...POST.warm);
      } else {
        gl.uniform4f(u('uGrade'), 1, 1, 0, 1);
        gl.uniform3f(u('uWarm'), 1, 1, 1);
      }
      gl.uniform1f(u('uRain'), this.rain);
      gl.uniform1f(u('uTime'), animationTime());
      gl.uniform1f(u('uPixelRatio'), this.pixelRatio());
    });
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
    gl.depthMask(true);
    addRenderStats('drawCalls', this.bloom ? 4 : 1);
  }

  /** Ein Bildschirm-Dreieck mit `program` nach `target`, `source` auf Einheit 0. */
  private pass(program: WebGLProgram, target: WebGLFramebuffer | null, source: WebGLTexture,
               uniforms: (location: (name: string) => WebGLUniformLocation | null) => void) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    uniforms((name) => this.location(program, name));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private location(program: WebGLProgram, name: string): WebGLUniformLocation | null {
    let map = this.locations.get(program);
    if (!map) this.locations.set(program, (map = new Map()));
    if (!map.has(name)) map.set(name, this.gl.getUniformLocation(program, name));
    return map.get(name)!;
  }

  private resize(width: number, height: number) {
    const gl = this.gl;
    this.width = width;
    this.height = height;
    for (const t of [this.scene, ...(this.bloomTargets ?? [])]) {
      if (!t) continue;
      gl.deleteTexture(t.texture);
      gl.deleteFramebuffer(t.framebuffer);
    }
    if (this.depth) gl.deleteRenderbuffer(this.depth);
    this.scene = this.target(width, height);
    this.depth = gl.createRenderbuffer()!;
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.framebuffer);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depth);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('Post-Effekte: Framebuffer der Szene ist unvollständig');
    }
    this.bloomTargets = [this.target(Math.max(1, width >> 2), Math.max(1, height >> 2)),
                  this.target(Math.max(1, width >> 2), Math.max(1, height >> 2))];
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Eine RGBA8-Textur mit eigenem Framebuffer, linear gefiltert, am Rand festgehalten. */
  private target(width: number, height: number): Target {
    const gl = this.gl;
    const texture = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const framebuffer = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    return { texture, framebuffer };
  }
}
