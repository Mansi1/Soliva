// Bäume aus wärmeren Gegenden - teils mit ganz anderem Bauplan (Palme, Kaktus).
import { preset, type Preset } from './base.ts';

const group = 'Exoten';

const palme = preset({
  roots: { count: 0, spread: 0, rise: 0 },
  group, label: 'Kokospalme', axiom: '&(14)FFFFFFFFF^(3)FK', iterations: 8, angle: 30, length: 0.9,
  jitter: 0.1, tropism: -0.035,
  rules: `# Schlanker, gebogener Stamm ohne Äste (leichter Auftrieb), oben die Wedel.
# Die Wedel hängen durch ihren eigenen Tropismus (~), die Fiedern sind Blätter (b).
K -> [&(20)G]/(40)[&(50)G]/(40)[&(75)G]/(40)[&(35)G]/(40)[&(65)G]/(40)[&(45)G]/(40)[&(80)G]/(40)[&(30)G]/(40)[&(60)G]
G -> ~(0.25)F(0.4)[+(65)b]/(180)[+(65)b]/(180)G`,
  leafSize: 0, stemMaterial: 'BarkPale', barkTexture: 'palme', tip: 0.018, pipe: 1.1,
  organs: { b: { shape: 'blade', size: 0.75, width: 0.07, droop: 60, materials: ['Leaf', 'LeafLight'] } },
});

const baobab = preset({
  roots: { count: 6, spread: 2.4, rise: 1.4 },
  group, label: 'Affenbrotbaum', axiom: 'F(1.8)F(1.8)F(1.4)A', iterations: 4, angle: 55, length: 1.3,
  lengthFactor: 0.7, jitter: 0.3, tropism: -0.04,
  rules: `# Flaschenstamm: dick (kleiner pipe-Exponent) und kurz, oben wenige knorrige Äste mit wenig Laub
A -> "[&FA]/(100)[&(45)FA]/(110)[&(65)FA]/(90)[&(40)FA]`,
  leaves: 'A', leafSize: 0.5, leafMaterials: ['LeafLight', 'Leaf'], stemMaterial: 'BarkGrey', tip: 0.02, pipe: 1.4,
  leaf: 'baobab',
});

const akazie = preset({
  group, label: 'Schirmakazie', axiom: 'F(1.2)F(1.2)F(1)A', iterations: 6, angle: 32, length: 1.2,
  lengthFactor: 0.9, jitter: 0.25, tropism: 0.1,
  rules: `# Gabelt steil, die Äste legen sich außen flach - ein flacher Schirm aus Laub
A -> "[&FFA]/(180)[&FA]/(90)`,
  leaves: 'A', leafSize: 0.95, leafMaterials: ['LeafLight', 'LeafSilver'], stemMaterial: 'BarkDark', tip: 0.03,
  leaf: 'akazie',
});

const drachenbaum = preset({
  group, label: 'Drachenbaum', axiom: 'F(1)F(1)F(0.8)A', iterations: 5, angle: 32, length: 0.9,
  lengthFactor: 0.9, jitter: 0.2, tropism: -0.02,
  rules: `# Gabelt immer wieder, an jedem Ende ein Schopf steifer, schmaler Blätter (Rosette)
A -> "[&FFA]/(180)[&FFA]/(90)`,
  leafSize: 0, stemMaterial: 'BarkPale', barkTexture: 'palme', tip: 0.05, pipe: 1.6,
  organs: { A: { shape: 'blade', size: 0.7, width: 0.06, droop: 25, count: 16, spread: 55, materials: ['IvyDark', 'Leaf'] } },
});

const eukalyptus = preset({
  group, label: 'Eukalyptus', axiom: 'FFFFFA', iterations: 7, angle: 30, length: 1.6, lengthFactor: 0.84,
  jitter: 0.35, tropism: 0.12,
  rules: `# Hoch und licht, helle glatte Rinde, blaugrünes Laub hängt in Büscheln
A 0.6 -> "[&FA]/(137.5)[&FA]A
A 0.4 -> "F[&(40)FA]/(137.5)[&FA]`,
  leaves: 'A', leafShape: 'needle', leafSize: 0.5, leafMaterials: ['LeafBlue', 'LeafSilver'], stemMaterial: 'BarkPale', barkTexture: 'eukalyptus', tip: 0.022,
  leaf: 'eukalyptus',
});

const saguaro = preset({
  roots: { count: 0, spread: 0, rise: 0 },
  group, label: 'Saguaro-Kaktus', iterations: 0, angle: 90, length: 1, jitter: 0.1, rules: '',
  // Kein Wachstum nötig: das Axiom ist die ganze Pflanze. Die Arme gehen erst
  // waagrecht ab (&(90)) und biegen dann nach oben (^(90)); pipe 40 hält alles gleich dick.
  axiom: 'F(1.4)F(1.2)[&(90)F(1.1)^(90)F(1)F(1)F(0.4)]/(140)F(0.6)[&(90)F(1)^(90)F(0.9)F(0.6)]'
    + '/(120)F(0.8)[&(90)F(0.9)^(90)F(0.8)F(0.3)]F(1)F(1)F(0.6)',
  leafSize: 0, stemMaterial: 'Cactus', tip: 0.24, pipe: 40,
});

export const EXOTEN = {
  palme, baobab, akazie, drachenbaum, eukalyptus,
  saguaro,
} satisfies Record<string, Preset>;
