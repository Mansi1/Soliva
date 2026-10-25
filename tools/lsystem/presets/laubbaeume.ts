// Laubbäume Mitteleuropas. Die Unterschiede stecken vor allem in Verzweigung
// (wechsel- oder gegenständig, Gabeln), Winkel, Tropismus und Stammlänge.
import { autumn, preset, variant, winter, type Preset } from './base.ts';

const group = 'Laubbäume';

const laubbaum = preset({
  group, label: 'Laubbaum (allgemein)', axiom: 'FFFA', iterations: 7, angle: 30, length: 1.6, lengthFactor: 0.82,
  jitter: 0.25, tropism: 0.08,
  rules: `# Zwei oder drei Äste, gegeneinander um den goldenen Winkel verdreht
A 0.5 -> "[&FA]/(137.5)[&FA]/(137.5)[&FA]
A 0.35 -> "[&FA]/(137.5)[&(15)FA]
A 0.15 -> "F/(90)A`,
  leaves: 'A', leafSize: 0.9, tip: 0.035,
  leaf: 'linde',
});

const ahorn = preset({
  group, label: 'Ahorn', axiom: 'FFA', iterations: 8, angle: 32, length: 1.15, lengthFactor: 0.87,
  jitter: 0.2, tropism: 0.03,
  rules: `# Gegenständig: je Knoten zwei Äste gegenüber (/(180)), der nächste Knoten um 90°
# dazu gedreht. Oft endet der Leittrieb in einer Gabel - die Krone wird breit und rund.
A 0.65 -> "/(90)F[&A]/(180)[&A]
A 0.35 -> "/(90)F[&(28)A]/(180)[&(28)A]^(5)A`,
  leaves: 'A', leafSize: 0.7, tip: 0.028,
  leaf: 'ahorn',
});

const eiche = preset({
  roots: { count: 6, spread: 3.4, rise: 2.2 },
  group, label: 'Eiche', axiom: 'FFFA', iterations: 7, angle: 48, length: 1.25, lengthFactor: 0.84,
  jitter: 0.4, tropism: 0.1, wander: 6,
  rules: `# Knorrig: weite Winkel, starke Streuung, schwere Äste neigen sich waagrecht.
# Der Leittrieb knickt immer wieder ab (+(25)).
A 0.45 -> "[&FFA]/(137.5)[&FA]/(137.5)[&(62)FA]
A 0.35 -> "F[&(55)FA]/(180)[&(30)FA]
A 0.2 -> "F+(25)/(70)A`,
  leaves: 'A', leafSize: 0.85, leafMaterials: ['Leaf', 'IvyDark'], stemMaterial: 'BarkDark', tip: 0.035, pipe: 2,
  leaf: 'eiche',
});

const buche = preset({
  roots: { count: 6, spread: 3.2, rise: 2.6 },
  group, label: 'Buche', axiom: 'FFFFA', iterations: 8, angle: 28, length: 1.25, lengthFactor: 0.85,
  jitter: 0.2, tropism: 0.02,
  rules: `# Glatte graue Rinde, langer Stamm, dichte ovale Krone mit steilen Ästen
A 0.6 -> "[&FA]/(137.5)[&FA]/(137.5)[&(18)FA]
A 0.4 -> "F[&FA]/(180)[&FA]`,
  leaves: 'A', leafSize: 0.55, leafMaterials: ['LeafLight', 'Leaf'], stemMaterial: 'BarkGrey', tip: 0.022,
  leaf: 'buche',
});

const linde = preset({
  group, label: 'Linde', axiom: 'FFFA', iterations: 8, angle: 38, length: 1.1, lengthFactor: 0.88,
  jitter: 0.2, tropism: 0.05,
  rules: `# Viele feine Äste, dichte, hoch gewölbte Krone (herzförmig)
A 0.55 -> "[&FA]/(137.5)[&FA]/(137.5)[&(22)FA]
A 0.45 -> "[&(25)FA]/(137.5)[&FA]`,
  leaves: 'A', leafSize: 0.6, leafMaterials: ['Leaf', 'LeafLight'], tip: 0.022,
  leaf: 'linde',
});

const kastanie = preset({
  group, label: 'Rosskastanie', axiom: 'FFFA', iterations: 7, angle: 42, length: 1.3, lengthFactor: 0.85,
  jitter: 0.2, tropism: 0.08,
  rules: `# Breite Kuppel, große Blätter. K sind die Blütenkerzen: an der Spitze, aus dem Laub
# heraus nach oben (^ und f) - nur in der Blüte-Variante als Organ gezeichnet.
A 0.6 -> "/(90)F[&A[^(60)f(0.6)K]]/(180)[&A[^(60)f(0.6)K]]
A 0.4 -> "/(90)F[&A[^(60)f(0.6)K]]/(180)[&A]^(10)A`,
  leaves: 'A', leafSize: 1.0, leafMaterials: ['IvyDark', 'Leaf'], stemMaterial: 'BarkDark', tip: 0.03,
  leaf: 'kastanie',
});

const esche = preset({
  group, label: 'Esche', axiom: 'FFFFA', iterations: 7, angle: 30, length: 1.5, lengthFactor: 0.86,
  jitter: 0.3, tropism: 0.04,
  rules: `# Hoch und licht: gegenständig, steile Äste, wenig, fein gefiedertes Laub
A 0.7 -> "/(90)F[&A]/(180)[&A]A
A 0.3 -> "/(90)F[&(20)A]A`,
  leaves: 'A', leafSize: 0.5, leafMaterials: ['LeafLight', 'Leaf'], stemMaterial: 'BarkGrey', tip: 0.022,
  leaf: 'esche',
});

const ulme = preset({
  group, label: 'Ulme', axiom: 'FFFA', iterations: 8, angle: 20, length: 1.5, lengthFactor: 0.86,
  jitter: 0.2, tropism: 0.14,
  rules: `# Vasenform: gabelt früh und steil, der Tropismus biegt die äußeren Äste auswärts
A -> "[&FFA]/(180)[&FA]/(90)`,
  leaves: 'A', leafSize: 0.55, tip: 0.025,
  leaf: 'ulme',
});

const platane = preset({
  roots: { count: 6, spread: 3.2, rise: 2.4 },
  group, label: 'Platane', axiom: 'FFFFA', iterations: 7, angle: 42, length: 1.5, lengthFactor: 0.84,
  jitter: 0.3, tropism: 0.07,
  rules: `# Mächtig und breit, fleckig helle Rinde
A 0.5 -> "[&FA]/(137.5)[&FFA]/(137.5)[&FA]
A 0.5 -> "F[&FA]/(160)[&(30)FA]`,
  leaves: 'A', leafSize: 0.9, leafMaterials: ['LeafLight', 'Leaf'], stemMaterial: 'BarkPale', tip: 0.03,
  leaf: 'platane',
});

const hainbuche = preset({
  group, label: 'Hainbuche', axiom: 'FFA', iterations: 7, angle: 35, length: 1.0, lengthFactor: 0.82,
  jitter: 0.25, tropism: 0.02,
  rules: `# Klein und dicht, eiförmige Krone
A 0.6 -> "[&FA]/(137.5)[&FA]/(137.5)[&FA]
A 0.4 -> "F[&FA]/(137.5)[&(20)FA]`,
  leaves: 'A', leafSize: 0.5, leafMaterials: ['Leaf', 'LeafLight'], stemMaterial: 'BarkGrey', tip: 0.02,
  // Kein freigestelltes Hainbuchenblatt gefunden - das Ulmenblatt ist ähnlich (gesägt, eiförmig).
  leaf: 'ulme',
});

const erle = preset({
  group, label: 'Erle', axiom: 'FFA', iterations: 14, angle: 30, length: 0.8, lengthFactor: 0.9,
  jitter: 0.25, tropism: 0.02,
  rules: `# Durchgehender Stamm (monopodial), die unteren Äste sind die ältesten: kegelförmig
A -> F[&(55)"B]/(137.5)A
B -> "FL[+C][-C]B
C -> "FL`,
  leaves: 'ABC', leafSize: 0.6, leafMaterials: ['IvyDark', 'Leaf'], stemMaterial: 'BarkDark', tip: 0.018,
  leaf: 'erle',
});

const walnuss = preset({
  group, label: 'Walnuss', axiom: 'FFA', iterations: 7, angle: 42, length: 1.45, lengthFactor: 0.84,
  jitter: 0.25, tropism: 0.06,
  rules: `# Kurzer Stamm, dicke Äste, breite runde Krone
A 0.6 -> "[&FA]/(137.5)[&FA]/(137.5)[&FA]
A 0.4 -> "[&(30)FFA]/(180)[&FA]`,
  leaves: 'A', leafSize: 0.85, leafMaterials: ['Leaf', 'LeafLight'], stemMaterial: 'BarkGrey', tip: 0.03, pipe: 2,
  leaf: 'walnuss',
});

const birke = preset({
  roots: { count: 4, spread: 2.6, rise: 1.6 },
  group, label: 'Birke', axiom: 'FFFFA', iterations: 8, angle: 25, length: 1.2, lengthFactor: 0.84,
  jitter: 0.25, tropism: 0.2,
  rules: `# Weiße Rinde, schlank, die Zweigspitzen hängen (Tropismus)
A 0.6 -> "[&FA]/(137.5)[&FA]A
A 0.4 -> "[&(35)FA]/(137.5)F[&FA]`,
  leaves: 'A', leafSize: 0.35, leafMaterials: ['LeafLight', 'Leaf'], stemMaterial: 'BarkWhite', tip: 0.018,
  leaf: 'birke',
});

const haengebirke = preset({
  roots: { count: 4, spread: 2.6, rise: 1.6 },
  group, label: 'Hängebirke', axiom: 'FFFFFA', iterations: 7, angle: 34, length: 1.4, lengthFactor: 0.85,
  jitter: 0.2, tropism: 0.45,
  rules: `A 0.6 -> "[&FFA]/(120)[&FFA]/(120)[&FA]
A 0.4 -> "[&(20)FFA]/(180)[&FA]`,
  leaves: 'A', leafSize: 0.45, leafMaterials: ['Leaf', 'Ivy'], stemMaterial: 'BarkWhite', tip: 0.02, pipe: 3,
  leaf: 'birke',
});

const trauerweide = preset({
  group, label: 'Trauerweide', axiom: 'FFFA', iterations: 9, angle: 38, length: 1.2, lengthFactor: 0.9,
  jitter: 0.25, tropism: 0,
  rules: `# Wenige Hauptäste steil nach oben, daran lange Ruten, die fast senkrecht hängen:
# eigener, starker Tropismus nur für die Ruten (~).
A 0.5 -> "[&(30)FFA]/(120)[&(40)FA]/(120)[&(50)~(0.55)W]
A 0.5 -> "[&(45)~(0.55)W]/(180)[&(25)FA]/(90)[&(60)~(0.55)W]
W -> "(0.95)FL[+(25)~(0.55)V]W
V -> FLV`,
  leaves: 'AWV', leafShape: 'needle', leafSize: 0.28, leafMaterials: ['LeafLight', 'Leaf'], stemMaterial: 'BarkGrey', tip: 0.012,
  leaf: 'weide',
});

const kopfweide = preset({
  group, label: 'Kopfweide', axiom: 'F(1)F(1)F(0.7)K', iterations: 7, angle: 20, length: 0.55, lengthFactor: 1,
  jitter: 0.3, tropism: -0.02,
  rules: `# Dicker, kurzer Stamm - immer wieder geschnitten -, oben ein Schopf gerader Ruten
K -> [&(10)R]/(40)[&(25)R]/(40)[&(18)R]/(40)[&(30)R]/(40)[&(12)R]/(40)[&(28)R]/(40)[&(20)R]/(40)[&(35)R]/(40)[&(15)R]
R -> FLR`,
  leaves: 'LR', leafShape: 'needle', leafSize: 0.3, leafMaterials: ['LeafSilver', 'LeafLight'], stemMaterial: 'BarkGrey',
  tip: 0.028, pipe: 1.2,
  leaf: 'weide',
});

const ginkgo = preset({
  group, label: 'Ginkgo', axiom: 'FFA', iterations: 12, angle: 42, length: 0.9, lengthFactor: 0.88,
  jitter: 0.45, tropism: -0.03,
  rules: `# Unregelmäßig und licht, die Äste schräg aufwärts; im Herbst leuchtend gelb
A 0.8 -> F[&(50)"B]/(150)A
A 0.2 -> F/(150)A
B -> "FL[+(35)C]B
C -> "FL`,
  leaves: 'ABC', leafSize: 0.55, leafMaterials: ['LeafLight', 'Leaf'], stemMaterial: 'BarkGrey', tip: 0.02,
  leaf: 'ginkgo',
});

const magnolie = preset({
  group, label: 'Magnolie – Blüte', axiom: '[&(15)FA]/(120)[&(25)FA]/(120)[&(10)FFA]', iterations: 6, angle: 35,
  length: 0.9, lengthFactor: 0.85, jitter: 0.3, tropism: -0.02,
  rules: `# Mehrstämmig und niedrig; im Frühjahr blüht sie vor dem Laub - nur Blüten
A 0.6 -> "[&FA]/(137.5)[&FA]
A 0.4 -> "[&FA]/(137.5)[&FA]/(137.5)[&FA]`,
  leaves: 'A', leafSize: 0.28, leafMaterials: ['BlossomPink', 'BlossomWhite', 'BlossomPink'], stemMaterial: 'BarkGrey', tip: 0.015,
  leaf: 'bluete_magnolie',
});

export const LAUBBAEUME = {
  laubbaum,
  ahorn, ahorn_herbst: autumn(ahorn, ['AutumnRed', 'AutumnOrange', 'AutumnYellow']), ahorn_winter: winter(ahorn),
  eiche, eiche_herbst: autumn(eiche, ['AutumnBrown', 'AutumnOrange']), eiche_winter: winter(eiche),
  eiche_jung: variant(eiche, 'jung', { iterations: 5, length: 0.9, jitter: 0.3 }),
  buche, buche_herbst: autumn(buche, ['AutumnOrange', 'AutumnBrown', 'AutumnYellow']), buche_winter: winter(buche),
  blutbuche: variant(buche, 'Blutbuche', { leaf: 'blutbuche', leafMaterials: ['AutumnBrown'] }),
  linde, linde_herbst: autumn(linde, ['AutumnYellow', 'LeafLight']),
  kastanie, kastanie_bluete: variant(kastanie, 'Blüte', {
    organs: { K: { shape: 'spindle', size: 0.45, width: 0.35, materials: ['BlossomWhite'], chance: 0.7 } },
  }),
  kastanie_herbst: autumn(kastanie, ['AutumnBrown', 'AutumnYellow']),
  esche, ulme, platane, hainbuche, erle, walnuss,
  birke, birke_herbst: autumn(birke, ['AutumnYellow']), birke_winter: winter(birke),
  haengebirke, trauerweide, kopfweide,
  ginkgo, ginkgo_herbst: autumn(ginkgo, ['AutumnYellow']),
  magnolie,
} satisfies Record<string, Preset>;
