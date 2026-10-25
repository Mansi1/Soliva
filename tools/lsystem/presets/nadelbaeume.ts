// Nadelbäume. Fast alle wachsen monopodial: ein Stamm, der je Jahr einen Quirl
// Äste ansetzt - die untersten sind die ältesten und längsten.
import { autumn, preset, variant, winter, type Preset } from './base.ts';

const group = 'Nadelbäume';

const fichte = preset({
  roots: { count: 6, spread: 3.8, rise: 1.2 },
  group, label: 'Fichte', axiom: 'FFT', iterations: 11, angle: 35, length: 1.2, jitter: 0.1, tropism: 0.05,
  wander: 2,
  rules: `# Der Stamm setzt je Schritt einen Quirl an; die Zweige hängen leicht
T -> F"[W]/(40)T
W -> [&(80)B]/(72)[&(80)B]/(72)[&(80)B]/(72)[&(80)B]/(72)[&(80)B]
B -> "FL[-(40)C][+(40)C]B
C -> "FLC`,
  leaves: 'BCT', leafShape: 'needle', leafSize: 0.35, leafMaterials: ['IvyDark', 'Ivy'], tip: 0.025, pipe: 2.4,
  leaf: 'fichte',
});

const tanne = preset({
  roots: { count: 5, spread: 3.4, rise: 1.3 },
  group, label: 'Tanne', axiom: 'FT', iterations: 13, angle: 50, length: 0.6, lengthFactor: 0.93, jitter: 0.06,
  wander: 2,
  tropism: -0.02,
  rules: `# Anders als die Fichte: Äste fast waagrecht und steif (leicht nach oben statt hängend),
# die Seitenzweige flach in einer Ebene - wie ein Fächer. Dadurch klare Etagen.
# Die Äste werden beim Wachsen schnell kürzer (0.8) - die Krone bleibt schlank.
T -> FF"[W]/(36)T
W -> [&(86)B]/(72)[&(86)B]/(72)[&(86)B]/(72)[&(86)B]/(72)[&(86)B]
B -> "(0.8)FL[+C][-C]B
C -> "(0.7)FLC`,
  leaves: 'BCT', leafShape: 'needle', leafSize: 0.3, leafMaterials: ['IvyDark'], tip: 0.022, pipe: 2.5,
  // Zweigbild: Fichte (kein freigestellter Tannenzweig auf Commons gefunden).
  leaf: 'fichte',
});

const douglasie = preset({
  roots: { count: 5, spread: 3.4, rise: 1.3 },
  group, label: 'Douglasie', axiom: 'FFT', iterations: 12, angle: 40, length: 1.1, lengthFactor: 0.92, jitter: 0.15,
  wander: 2,
  tropism: -0.04,
  rules: `# Wie die Fichte, aber lockerer und die Astspitzen schwingen nach oben
T -> F"[W]/(47)T
W -> [&(75)B]/(90)[&(75)B]/(90)[&(75)B]/(90)[&(75)B]
B -> "(0.85)FL[-C][+C]B
C -> "(0.8)FLC`,
  leaves: 'BCT', leafShape: 'needle', leafSize: 0.33, leafMaterials: ['Leaf', 'IvyDark'], stemMaterial: 'BarkDark',
  tip: 0.024, pipe: 2.4,
  // Zweigbild: Fichte (kein freigestellter Douglasienzweig gefunden).
  leaf: 'fichte',
});

const kiefer = preset({
  roots: { count: 4, spread: 2.2, rise: 1.4 },
  group, label: 'Waldkiefer', axiom: 'FFFFFFFT', iterations: 8, angle: 40, length: 1.1, lengthFactor: 0.92,
  jitter: 0.35, tropism: -0.06, wander: 7,
  rules: `# Langer kahler Stamm (die unteren Äste sterben ab), oben eine lichte, flache Krone.
# Nadelbüschel nur an den Zweigenden.
T -> F"[W]/(50)T
W -> [&(65)B]/(120)[&(70)B]/(120)[&(60)B]
B 0.6 -> "F[-(35)B][+(35)B]
B 0.4 -> "FB`,
  leaves: 'BT', leafSize: 0.7, leafMaterials: ['IvyDark', 'Ivy'], stemMaterial: 'BarkRed', tip: 0.03, pipe: 2.1,
  leaf: 'kiefer',
});

const schirmpinie = preset({
  group, label: 'Schirmpinie', axiom: 'F(1.2)F(1.2)F(1.2)F(1)A', iterations: 6, angle: 38, length: 1.3,
  lengthFactor: 0.84, jitter: 0.2, tropism: 0.02,
  rules: `# Gabelt oben immer wieder gleich lang - die Enden liegen auf einer flachen Kuppel
A -> "[&FA]/(120)[&FA]/(120)[&(20)FA]`,
  leaves: 'A', leafSize: 0.75, leafMaterials: ['IvyDark', 'Leaf'], stemMaterial: 'BarkRed', tip: 0.022, pipe: 2.6,
  // Zweigbild: Waldkiefer.
  leaf: 'kiefer',
});

const laerche = preset({
  group, label: 'Lärche', axiom: 'FFT', iterations: 12, angle: 35, length: 1.1, lengthFactor: 0.91, jitter: 0.2,
  tropism: 0.1,
  rules: `# Licht und luftig, die Zweige hängen; sie wirft als einziger Nadelbaum hier im Herbst ab
T -> F"[W]/(55)T
W -> [&(70)B]/(90)[&(75)B]/(90)[&(70)B]/(90)[&(75)B]
B -> "(0.88)FL[-(45)C]/(180)B
C -> "(0.8)FLC`,
  leaves: 'BCT', leafShape: 'needle', leafSize: 0.3, leafMaterials: ['NeedleLight', 'LeafLight'], stemMaterial: 'BarkRed',
  tip: 0.02, pipe: 2.4,
  leaf: 'laerche',
});

const zeder = preset({
  group, label: 'Zeder', axiom: 'FFFT', iterations: 9, angle: 45, length: 1.1, lengthFactor: 0.9, jitter: 0.15,
  tropism: -0.03,
  rules: `# Breite, waagrechte Etagen wie Tische, dazwischen Luft; blaugrüne Nadeln
T -> FF"[W]/(50)T
W -> [&(84)B]/(120)[&(88)B]/(120)[&(84)B]
B -> "(0.95)FL[+(45)C][-(45)C]B
C -> "(0.85)FL[+D][-D]C
D -> FL`,
  leaves: 'BCDT', leafShape: 'needle', leafSize: 0.34, leafMaterials: ['LeafBlue', 'IvyDark'], stemMaterial: 'BarkDark',
  tip: 0.022, pipe: 2.3,
  leaf: 'zeder',
});

const zypresse = preset({
  group, label: 'Säulenzypresse', axiom: 'FA', iterations: 18, angle: 20, length: 0.6, lengthFactor: 0.7,
  jitter: 0.2, tropism: -0.08,
  rules: `# Sehr schmal: kurze, steile Äste rund um den Stamm, nach oben gezogen
A -> F[&(18)"B]/(137.5)[&(22)"B]/(137.5)A
B -> "FLB`,
  leaves: 'ABL', leafSize: 0.32, leafMaterials: ['IvyDark', 'Ivy'], tip: 0.02, pipe: 2.4,
  // Zweigbild: Mammutbaum - ebenfalls Schuppenblätter.
  leaf: 'mammutbaum',
});

const eibe = preset({
  group, label: 'Eibe', axiom: '[&(8)FA]/(120)[&(15)FA]/(120)[&(10)FFA]', iterations: 7, angle: 35, length: 0.8,
  lengthFactor: 0.82, jitter: 0.3, tropism: 0.04,
  rules: `# Mehrstämmig, dicht und dunkel, rotbraune Rinde
A 0.6 -> "[&FA]/(137.5)[&FA]
A 0.4 -> "[&FA]/(137.5)[&FA]/(137.5)[&FA]`,
  leaves: 'A', leafSize: 0.45, leafMaterials: ['IvyDark'], stemMaterial: 'BarkRed', tip: 0.018,
  leaf: 'eibe',
});

const mammutbaum = preset({
  roots: { count: 7, spread: 3.4, rise: 2.4 },
  group, label: 'Mammutbaum', axiom: 'FFFFT', iterations: 16, angle: 30, length: 2.4, lengthFactor: 0.93,
  jitter: 0.15, tropism: 0.12, wander: 1,
  rules: `# Riesig, mit sehr dickem Stamm (kleiner pipe-Exponent) und kurzen, hängenden Ästen
T -> F"[W]/(65)T
W -> [&(75)B]/(120)[&(80)B]/(120)[&(75)B]
B -> "(0.7)FL[-(40)C]/(180)B
C -> FL`,
  leaves: 'BCT', leafSize: 0.7, leafMaterials: ['IvyDark', 'Leaf'], stemMaterial: 'BarkRed', barkTexture: 'zeder', tip: 0.03, pipe: 1.7,
  leaf: 'mammutbaum',
});

export const NADELBAEUME = {
  fichte, fichte_jung: variant(fichte, 'jung', { iterations: 6, length: 0.7 }),
  tanne, douglasie, kiefer, schirmpinie,
  laerche, laerche_herbst: autumn(laerche, ['AutumnYellow', 'AutumnOrange']), laerche_winter: winter(laerche),
  zeder, zypresse, eibe, mammutbaum,
} satisfies Record<string, Preset>;
