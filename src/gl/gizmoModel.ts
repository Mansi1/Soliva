// gizmoModel.ts
// Dreh-Gizmo der Galerie als 3D-Modell: je Achse ein Ring (Torus), gebaut wie
// eine OBJ/MTL-Datei (Text). Material "Paint" - die Farbe
// kommt aus der Instanz, so leuchtet der Ring beim Überfahren heller.
//
// Datei-Koordinaten: x links, y oben, z vorn; im Spiel ist Modell-x = Datei-z,
// Modell-y = Datei-x, Modell-z = Datei-y. Alle drei Ringe haben dieselbe
// Hülle (Breite = Höhe = 2 * (R + T)) - so liegt ihre Mitte gleich, und die
// Drehung um die halbe Modellhöhe (uModelRot) dreht sie um denselben Punkt.
// Die Hülle ist ein Würfel: Breite = Tiefe = Höhe.

/** Radius des Rings und Dicke seines Querschnitts (Radius), Modell-Einheiten. */
const R = 1;
const T = 0.05;
/** Radius des Rings als Anteil der Instanzgröße (Breite der Hülle). */
export const GIZMO_RING_FRACTION = R / (2 * (R + T));

/**
 * Ring um die Weltachse `axis` (0 x, 1 y, 2 z oben) - oder mit `disc` die
 * Fläche in ihm (halbdurchsichtig gezeichnet, siehe gallery.ts).
 */
export function gizmoModel(axis: number, disc = false): { obj: string; mtl: string } {
  const lines: string[] = [disc ? 'o Disc' : 'o Ring', 'usemtl Paint'];
  const mid = R + T;
  // Achse in Datei-Koordinaten: Welt-x = Datei-z, Welt-y = Datei-x, Welt-z = Datei-y.
  const fileAxis = [2, 0, 1][axis];
  const [i, j] = [(fileAxis + 1) % 3, (fileAxis + 2) % 3];
  const around = 48, tube = 8;
  const at = (a: number, b: number) => {
    // Punkt auf dem Torus: Kreis in der Ebene (i, j), Querschnitt entlang Radius und Achse.
    const p = [0, 0, 0];
    const r = R + T * Math.cos(b);
    p[i] = r * Math.cos(a);
    p[j] = r * Math.sin(a);
    p[fileAxis] = T * Math.sin(b);
    p[1] += mid;
    return p;
  };
  let n = 0;
  if (disc) {
    // Fläche bis an die Innenseite des Rings: Mitte und Rand als Fächer.
    const center = [0, 0, 0];
    center[1] = mid;
    lines.push(`v ${center.join(' ')}`);
    for (let k = 0; k < around; k++) {
      const p = [0, 0, 0];
      p[i] = (R - T) * Math.cos((k / around) * Math.PI * 2);
      p[j] = (R - T) * Math.sin((k / around) * Math.PI * 2);
      p[1] += mid;
      lines.push(`v ${p.map((x) => x.toFixed(4)).join(' ')}`);
    }
    for (let k = 0; k < around; k++) lines.push(`f 1 ${k + 2} ${((k + 1) % around) + 2}`);
    n = around + 1;
  } else {
    for (let k = 0; k < around; k++) {
      for (let l = 0; l < tube; l++) {
        const a = (k / around) * Math.PI * 2, b = (l / tube) * Math.PI * 2;
        lines.push(`v ${at(a, b).map((x) => x.toFixed(4)).join(' ')}`);
      }
    }
    const index = (k: number, l: number) => (k % around) * tube + (l % tube) + 1;
    for (let k = 0; k < around; k++) {
      for (let l = 0; l < tube; l++) {
        lines.push(`f ${index(k, l)} ${index(k + 1, l)} ${index(k + 1, l + 1)} ${index(k, l + 1)}`);
      }
    }
    n = around * tube;
  }
  // Winzige Marken an allen sechs Seiten der Hülle: sonst wäre ein stehender
  // Ring nur so breit wie sein Querschnitt (loadModel misst die Breite) und
  // der liegende flacher - Größe und Mitte wären je Ring anders.
  lines.push('o Marker');
  for (const [x, y, z] of [[-mid, mid, 0], [mid, mid, 0], [0, mid, -mid], [0, mid, mid], [0, 0, 0], [0, 2 * mid, 0]]) {
    lines.push(`v ${x} ${y} ${z}`, `v ${x + 0.001} ${y} ${z}`, `v ${x} ${y + 0.001} ${z}`, `f ${n + 1} ${n + 2} ${n + 3}`);
    n += 3;
  }
  return { obj: lines.join('\n'), mtl: 'newmtl Paint\nKd 1 1 1' };
}
