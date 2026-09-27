// flowerModel.ts
// Die Blumenarten. Das Modell steht in src/models/flowers/flower.glb: ein
// weicher Schatten und drei Blätter am Boden, ein Stiel mit einem Kelch und
// darauf die Blüte als Karte (BlossomCard) - auf sie malt der Shader
// Blütenblätter mit Fugen und Wölbung, die gewölbte Mitte und einen
// Glanzpunkt, wie die gemalten Blumen im Gelände (flower() in
// terrainShader.ts), die weit draußen weiter gemalt werden. So hat die Blüte
// alle Einzelheiten bei nur zwei Dreiecken; die Arten unterscheidet der
// Shader an der Form.
//
// Maße in Modell-Einheiten: die Blätter spannen die Breite 1 auf - so ist die
// Instanzgröße direkt die Breite in Tiles. Die Blüte sitzt auf Höhe 0.62.

type RGB01 = [number, number, number];

export interface FlowerKind {
  name: string;
  /** Wissenschaftlicher Name und ein paar Sätze fürs Auswahl-Panel. */
  latin: string;
  info: string;
  /** Artikel in der deutschen Wikipedia - ein Foto daraus lädt tools/ui/flower-photos.mjs. */
  wiki: string;
  /** Zahl der Blütenblätter - 0: Klee, ein rundes Köpfchen. */
  petals: number;
  petal: RGB01;
  heart: RGB01;
  /** Radius der Mitte als Anteil der Blüte. */
  heartSize: number;
}

/** Gänseblümchen, Butterblume, Mohn, Kornblume, Klee - Reihenfolge und Farben wie im Gelände-Shader. */
export const FLOWER_KINDS: readonly FlowerKind[] = [
  { name: 'Gänseblümchen', wiki: 'https://de.wikipedia.org/wiki/G%C3%A4nsebl%C3%BCmchen',
    latin: 'Bellis perennis', info: 'Blüht fast das ganze Jahr und schließt sich nachts und bei Regen. Die Blüte ist eigentlich ein Körbchen aus Hunderten winziger Einzelblüten.', petals: 10, petal: [0.97, 0.97, 0.94], heart: [0.98, 0.78, 0.15], heartSize: 0.32 },
  { name: 'Butterblume', wiki: 'https://de.wikipedia.org/wiki/Scharfer_Hahnenfu%C3%9F',
    latin: 'Ranunculus acris', info: 'Der Scharfe Hahnenfuß glänzt, als wäre er lackiert. Frisch ist er giftig, darum lässt das Vieh ihn stehen - im Heu wird er harmlos.', petals: 5, petal: [1.0, 0.86, 0.12], heart: [0.85, 0.62, 0.08], heartSize: 0.22 },
  { name: 'Mohn', wiki: 'https://de.wikipedia.org/wiki/Klatschmohn',
    latin: 'Papaver rhoeas', info: 'Klatschmohn wächst gern am Acker. Eine Blüte hält nur ein, zwei Tage, doch seine Samen bleiben Jahrzehnte im Boden keimfähig.', petals: 4, petal: [0.9, 0.16, 0.12], heart: [0.12, 0.08, 0.08], heartSize: 0.26 },
  { name: 'Kornblume', wiki: 'https://de.wikipedia.org/wiki/Kornblume',
    latin: 'Centaurea cyanus', info: 'Kam mit dem Getreide und blüht zwischen den Halmen. Ihr Blau ist unter den Wiesenblumen selten - Bienen und Hummeln fliegen darauf.', petals: 8, petal: [0.3, 0.45, 0.95], heart: [0.2, 0.2, 0.55], heartSize: 0.2 },
  { name: 'Klee', wiki: 'https://de.wikipedia.org/wiki/Wiesenklee',
    latin: 'Trifolium pratense', info: 'Rotklee holt Stickstoff aus der Luft in den Boden und macht ihn fruchtbar. Gutes Futter fürs Vieh, und Hummeln lieben den Nektar.', petals: 0, petal: [0.92, 0.5, 0.72], heart: [0.8, 0.35, 0.58], heartSize: 0 },
];
