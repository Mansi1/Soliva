// flatten.ts
// Gebäude stehen auf ebenem Boden, wie in AoE2: unter dem Grundriss wird das
// Gelände auf eine Höhe gebracht und läuft am Rand weich ins Umland aus. Die
// Rechnung gibt es zweimal - hier für Klicks und Figuren, im Shader
// (FLATTEN_GLSL) für das Geländenetz und die Gebäude - mit denselben Zahlen.

/** Eine eingeebnete Fläche: Mitte (Welt-Tiles), halbe Kantenlänge, Höhe (Tiles, ohne Relief-Skalierung). */
export interface FlatZone {
  x: number;
  y: number;
  half: number;
  z: number;
}

/** So breit (Tiles) ist der Rand, über den die Ebene ins Gelände ausläuft. */
export const FLAT_BLEND = 1.25;
/** Plätze im Shader-Feld uFlat: so viele Flächen minus einer - der letzte hält die Hülle (packZones). */
export const MAX_FLAT_ZONES = 48;

/** Höhe z an (x, y) nach dem Einebnen. */
export function flatten(x: number, y: number, z: number, zones: readonly FlatZone[]): number {
  for (const f of zones) {
    const d = Math.max(Math.abs(x - f.x) - f.half, Math.abs(y - f.y) - f.half, 0);
    if (d >= FLAT_BLEND) continue;
    const t = d / FLAT_BLEND;
    const w = 1 - t * t * (3 - 2 * t);
    z += (f.z - z) * w;
  }
  return z;
}

/**
 * Für den Shader: je Fläche (x, y, half, z), die der Bildmitte nächsten
 * MAX_FLAT_ZONES - 1. Im letzten Platz die Hülle aller samt Rand (x0, y0, x1,
 * y1): außerhalb wirkt keine, flattenZ spart sich dort die Schleife - sie
 * lief je Eckpunkt jedes Baums und kostete in der Demo-Stadt ~0,5 ms je Bild.
 */
export function packZones(zones: readonly FlatZone[]): Float32Array<ArrayBuffer> {
  const data = new Float32Array(MAX_FLAT_ZONES * 4);
  const used = zones.slice(0, MAX_FLAT_ZONES - 1);
  used.forEach((f, i) => data.set([f.x, f.y, f.half, f.z], i * 4));
  const r = (f: FlatZone) => f.half + FLAT_BLEND;
  data.set(used.length === 0 ? [0, 0, -1, -1] : [
    Math.min(...used.map((f) => f.x - r(f))), Math.min(...used.map((f) => f.y - r(f))),
    Math.max(...used.map((f) => f.x + r(f))), Math.max(...used.map((f) => f.y + r(f))),
  ], (MAX_FLAT_ZONES - 1) * 4);
  return data;
}

/** Gegenstück zu flatten() - z ist hier schon mit uReliefScale skaliert. */
export const FLATTEN_GLSL = `
uniform vec4 uFlat[${MAX_FLAT_ZONES}];
uniform int  uFlatCount;

float flattenZ(vec2 world, float z) {
  vec4 hull = uFlat[${MAX_FLAT_ZONES - 1}];
  if (any(lessThan(world, hull.xy)) || any(greaterThan(world, hull.zw))) return z;
  for (int i = 0; i < ${MAX_FLAT_ZONES - 1}; i++) {
    if (i >= uFlatCount) break;
    vec4 f = uFlat[i];
    vec2 d2 = abs(world - f.xy) - f.z;
    float d = max(max(d2.x, d2.y), 0.0);
    if (d >= ${FLAT_BLEND.toFixed(3)}) continue;
    float t = d / ${FLAT_BLEND.toFixed(3)};
    z = mix(z, f.w * uReliefScale, 1.0 - t * t * (3.0 - 2.0 * t));
  }
  return z;
}
`;
