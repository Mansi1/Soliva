// Obstbäume: kurzer Stamm, offene, breite Krone - so werden sie geschnitten.
import { preset, variant, type Preset } from './base.ts';

const group = 'Obstbäume';

const apfel = preset({
  group, label: 'Apfelbaum', axiom: 'FFA', iterations: 6, angle: 45, length: 1.0, lengthFactor: 0.86,
  jitter: 0.4, tropism: 0.12,
  rules: `# Knorrig und breit, die Äste hängen unter der Last. O sind die Äpfel: sie hängen
# an der Spitze unter dem Laub (&(120) dreht nach unten, f rückt aus dem Büschel).
A 0.6 -> "[&FA[&(120)f(0.5)O]]/(137.5)[&FA]/(137.5)[&(25)FA[&(120)f(0.5)O]]
A 0.4 -> "F[&FA[&(120)f(0.5)O]]/(160)[&FA]`,
  leaves: 'A', leafSize: 0.6, leafMaterials: ['Leaf', 'LeafLight'], stemMaterial: 'BarkDark', tip: 0.025,
  organs: { O: { shape: 'clump', size: 0.13, materials: ['FruitRed'], chance: 0.8 } },
  leaf: 'apfel',
});

const kirsche = preset({
  group, label: 'Kirschbaum', axiom: 'FFFA', iterations: 7, angle: 38, length: 0.9, lengthFactor: 0.86,
  jitter: 0.3, tropism: 0.06,
  rules: `# Offene Krone mit steilen Leitästen
A 0.6 -> "[&FA]/(137.5)[&FA]/(137.5)[&FA]
A 0.4 -> "F[&FA]/(137.5)[&(20)FA]`,
  leaves: 'A', leafSize: 0.5, leafMaterials: ['Leaf', 'IvyDark'], stemMaterial: 'BarkRed', barkTexture: 'kirsche', tip: 0.02,
  leaf: 'kirsche',
});

const olive = preset({
  group, label: 'Olivenbaum', axiom: '[&(18)FFA]/(160)[&(12)FA]', iterations: 7, angle: 40, length: 0.9,
  lengthFactor: 0.86, jitter: 0.45, tropism: 0.08, wander: 7,
  rules: `# Uralt und verdreht: geteilter Stamm, niedrige, silbrige Krone
A 0.5 -> "[&FA]/(137.5)[&FA]/(137.5)[&FA]
A 0.3 -> "F+(20)[&FA]/(137.5)[&FA]
A 0.2 -> "F-(25)/(90)A`,
  leaves: 'A', leafSize: 0.55, leafMaterials: ['LeafSilver', 'LeafBlue'], stemMaterial: 'BarkGrey', tip: 0.025, pipe: 1.9,
  leaf: 'olive',
});

const bluete = ['BlossomWhite', 'BlossomPink'] as const;
// Blütenfoto: Apfelblüte - auch für die Kirsche (kein freigestelltes Kirschblütenbild gefunden).
const blossom = { leaf: 'bluete_apfel', leafCount: 4 } as const;

export const OBST = {
  apfel, apfel_bluete: variant(apfel, 'Blüte', { ...blossom, leafMaterials: bluete, leafSize: 0.45, organs: {} }),
  kirsche, kirsche_bluete: variant(kirsche, 'Blüte', { ...blossom, leafMaterials: ['BlossomWhite'], leafSize: 0.42 }),
  kirsche_japanisch: variant(kirsche, 'Japanische Blüte', { ...blossom, leafMaterials: ['BlossomPink'], leafSize: 0.45, tropism: 0.18 }),
  olive,
} satisfies Record<string, Preset>;
