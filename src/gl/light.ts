// light.ts
// Das Licht, das Gelände und Modelle gemeinsam bekommen: Richtung zur Sonne
// (Welt: x, y wie die Tiles, z oben), ihre Farbe, Helligkeit und Kontrast.
// Kontrast 1 ist die volle Sonne mit Licht- und Schattenseiten, 0 ein
// bedeckter Himmel, unter dem alle Seiten gleich hell sind. CLASSIC_LIGHT
// ist die feste Sonne von früher - mit ihr sieht alles aus wie vorher.

export type Vec3 = readonly [number, number, number];

export interface Light {
  /** Richtung zur Sonne, Länge 1. */
  dir: Vec3;
  color: Vec3;
  /** Gesamthelligkeit, 1 = volle Sonne. */
  level: number;
  /** Anteil des gerichteten Lichts 0..1. */
  contrast: number;
}

const SUN = [-0.45, 0.35, 0.82];
const length = Math.hypot(...SUN);

/** Die Sonne von links oben im Bild, wie in AoE2 - so war das Licht fest eingebaut. */
export const CLASSIC_LIGHT: Light = {
  dir: [SUN[0] / length, SUN[1] / length, SUN[2] / length],
  color: [1, 1, 1],
  level: 1,
  contrast: 1,
};

/** Die Uniforms zum Licht, für jeden Shader, der beleuchtet. */
export const LIGHT_GLSL = `
uniform vec3 uSunDir;    // Richtung zur Sonne in der Welt, Länge 1
uniform vec3 uSunColor;
uniform vec2 uLight;     // x Helligkeit, y Kontrast (Anteil des gerichteten Lichts)
`;

/** Setzt die Uniforms aus LIGHT_GLSL im gerade benutzten Programm. */
export function setLightUniforms(
    gl: WebGL2RenderingContext, location: (name: string) => WebGLUniformLocation | null, light: Light) {
  gl.uniform3f(location('uSunDir'), light.dir[0], light.dir[1], light.dir[2]);
  gl.uniform3f(location('uSunColor'), light.color[0], light.color[1], light.color[2]);
  gl.uniform2f(location('uLight'), light.level, light.contrast);
}
