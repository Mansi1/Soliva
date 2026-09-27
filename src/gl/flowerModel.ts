// flowerModel.ts
// Die Blumenarten. Das Modell steht in src/models/flowers/flower.glb: ein
// weicher Schatten und drei Blätter am Boden, ein Stiel mit einem Kelch und
// darauf die Blüte als Karte (BlossomCard) mit der Textur der Art
// (Streifen aus flower-index.json, siehe flowerStrip). So hat die Blüte alle Einzelheiten bei nur zwei
// Dreiecken. Weit draußen malt das Gelände die Blumen (flower() in
// terrainShader.ts).
//
// Maße in Modell-Einheiten: die Blätter spannen die Breite 1 auf - so ist die
// Instanzgröße direkt die Breite in Tiles. Die Blüte sitzt auf Höhe 0.62.


export const BASE_FLOWER_TEXTURE_URL = new URL('../models/flowers/textures/', import.meta.url);
export const BASE_FLOWER_PHOTO_URL = new URL('../models/flowers/photos/', import.meta.url);



export type FlowerType = 'daisy' | 'buttercup' | 'poppy' | 'cornflower' | 'clover';

/**
 * URL eines Blüten-Streifens aus flower-index.json (gemalt von tools/models/create-flower-blossoms.ts).
 * In dieser Form mit `${file}` im Pfad erkennt Vite die Bilder und bündelt sie -
 * eine URL aus BASE_FLOWER_TEXTURE_URL zur Laufzeit fände der Build nicht.
 */
export const flowerStrip = (file: string) => new URL(`../models/flowers/textures/${file}`, import.meta.url).href;

/** Foto der Art fürs Auswahl-Panel (aus Wikipedia, tools/models/download-flower-photos.ts) - dieselbe Form wie flowerStrip. */
export const flowerPhoto = (type: FlowerType) => new URL(`../models/flowers/photos/${type}.webp`, import.meta.url).href;

export interface FlowerKind {
  type: FlowerType;
  name: string;
  /** Wissenschaftlicher Name und ein paar Sätze fürs Auswahl-Panel. */
  latin: string;
  info: string;
  /** Artikel in der deutschen Wikipedia - ein Foto daraus lädt tools/models/download-flower-photos.ts. */
  wiki: string;
}

/** Gänseblümchen, Butterblume, Mohn, Kornblume, Klee - Reihenfolge wie im Gelände-Shader. */
export const FLOWER_KINDS: readonly FlowerKind[] = [
  { type: 'daisy', name: 'Gänseblümchen', wiki: 'https://de.wikipedia.org/wiki/G%C3%A4nsebl%C3%BCmchen',
    latin: 'Bellis perennis', info: 'Blüht fast das ganze Jahr und schließt sich nachts und bei Regen. Die Blüte ist eigentlich ein Körbchen aus Hunderten winziger Einzelblüten.' },
  { type: 'buttercup', name: 'Butterblume', wiki: 'https://de.wikipedia.org/wiki/Scharfer_Hahnenfu%C3%9F',
    latin: 'Ranunculus acris', info: 'Der Scharfe Hahnenfuß glänzt, als wäre er lackiert. Frisch ist er giftig, darum lässt das Vieh ihn stehen - im Heu wird er harmlos.' },
  { type: 'poppy', name: 'Mohn', wiki: 'https://de.wikipedia.org/wiki/Klatschmohn',
    latin: 'Papaver rhoeas', info: 'Klatschmohn wächst gern am Acker. Eine Blüte hält nur ein, zwei Tage, doch seine Samen bleiben Jahrzehnte im Boden keimfähig.' },
  { type: 'cornflower', name: 'Kornblume', wiki: 'https://de.wikipedia.org/wiki/Kornblume',
    latin: 'Centaurea cyanus', info: 'Kam mit dem Getreide und blüht zwischen den Halmen. Ihr Blau ist unter den Wiesenblumen selten - Bienen und Hummeln fliegen darauf.' },
  { type: 'clover', name: 'Klee', wiki: 'https://de.wikipedia.org/wiki/Wiesenklee',
    latin: 'Trifolium pratense', info: 'Rotklee holt Stickstoff aus der Luft in den Boden und macht ihn fruchtbar. Gutes Futter fürs Vieh, und Hummeln lieben den Nektar.' },
];

