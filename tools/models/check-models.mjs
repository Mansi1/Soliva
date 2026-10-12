// Prüft die Namen mit Bedeutung in den Modellen des Spiels (docs/BLENDER.md):
// was das Spiel in einem Modell an seinem Namen erkennt, muss da sein - sonst
// findet es z. B. keinen Eingang, keine Flügel, keine Bögen im Gestell. Läuft
// mit `npm test`, auch einzeln: `npm run check:models`.
//
// Geprüft werden die Modelle in src/models/<ordner>/*.glb mit den Namen, wie das Spiel
// sie liest (tools/models/glb.mjs: bis zum "#", Kopien ohne ".001").

import { modelNames, readModel } from './glb.mjs';

const modelsDir = new URL('../../src/models/', import.meta.url).pathname;

/**
 * Regeln je Modell (nach dem Dateinamen): `needs` - Namensanfänge, die
 * mindestens ein Objekt haben muss; `numbered` - Name und wie viele: die
 * Nummern müssen lückenlos von 0 laufen (Stock.0 ... Stock.99); `forbids` -
 * Namensanfänge, die nicht vorkommen dürfen; `only` - jedes Objekt beginnt mit einem davon.
 */
const RULES = [
  { match: /^buildings\//, needs: ['Entry'], why: 'Eingang, zu dem Dorfbewohner gehen' },
  { match: /^buildings\/mill/, needs: ['Sails'], why: 'Flügel, die sich drehen' },
  { match: /^(buildings\/town_center|props\/rally_flag)$/, needs: ['Cloth'], why: 'Tuch, das weht' },
  { match: /^buildings\/(bowyer|spear_maker|cobbler)$/, needs: ['Work.Stand', 'Work.Aim', 'Work.Seat', 'Work.Face'], numbered: [['Craft', 3]], why: 'Werkbank, Hocker und Stufen des Werkstücks' },
  { match: /^buildings\/archery_range$/, needs: ['Work.Stand', 'Work.Aim'], why: 'Schießlinie und Scheibe der mittleren Bahn (archery.ts, rangeSpot)' },
  { match: /^buildings\/armory$/, needs: ['Cut.Roof', 'Cut.Wall'], numbered: [['Stock', 100]], why: 'aufdeckbares Dach und 100 Bögen im Gestell' },
  { match: /^resources\/berry_bush/, needs: ['Berry'], why: 'Beeren, die beim Pflücken verschwinden (die Nummer wählt nur den Zufall je Beere)' },
  { match: /^trees\//, needs: ['Trunk', 'Trunk.Stump'], why: 'Stamm und Stumpf zum Absägen' },
  { match: /^animals\//, needs: ['Leg.FL', 'Leg.FR', 'Leg.BL', 'Leg.BR', 'Head'], why: 'Beine und Kopf für die Knochen' },
  {
    match: /^villagers\//,
    // Load: nur noch Marker - Anker der Lasten am Rücken (load_*.glb), wird nicht gezeichnet.
    needs: ['Head', 'Load'],
    // Starr in Teilen (Knochen aus dem Namen) oder eine Hülle mit Knochen aus Blender (Armature).
    parts: ['Leg.L', 'Leg.L.Lower', 'Leg.R', 'Leg.R.Lower', 'Arm.L', 'Arm.L.Lower', 'Arm.R', 'Arm.R.Lower', 'Arm.R.Lower.Hand'],
    bones: ['thigh.L', 'shin.L', 'thigh.R', 'shin.R', 'upperArm.L', 'forearm.L', 'upperArm.R', 'forearm.R', 'hand.R', 'head'],
    forbids: ['Arm.R.Lower.Tool', 'Arm.R.Lower.Scythe', 'Knife'],
    why: 'Körperteile oder Knochen, Hand für die Werkzeuge; Werkzeuge sind eigene Modelle',
  },
  { match: /^props\/axe$/, needs: ['Arm.R.Lower.Tool'], why: 'Beil an der Hand' },
  { match: /^props\/hoe$/, needs: ['Arm.R.Lower.Tool'], why: 'Hacke an der Hand (Pflügen)' },
  { match: /^props\/spear$/, needs: ['Arm.R.Lower.Tool'], why: 'Speer an der Hand (Jagd)' },
  // Die Schuhe hängen an den Unterschenkeln (B31) - andere Namen hingen an der Hand.
  { match: /^props\/clogs$/, needs: ['Leg.L.Lower', 'Leg.R.Lower'], only: ['Leg.L.Lower', 'Leg.R.Lower'], why: 'Holzschuhe an beiden Füßen' },
  { match: /^props\/prop_bow$/, only: ['Arm.R.Lower.Tool'], why: 'Bogen an der Hand (Schießplatz, B24)' },
  { match: /^props\/scythe_/, needs: ['Arm.R.Lower.Scythe'], why: 'Sense an der Hand' },
  { match: /^props\/knife$/, needs: ['Knife'], why: 'Zugmesser in beiden Händen' },
  // Andere Namen hingen an der Hand statt am Rücken, "Load" wäre ein unsichtbarer Marker.
  // Baustelle (B26, world/construction.ts): ein Stück Absteckung je Tile-Kante, Gerüst.
  { match: /^props\/site_edge$/, needs: ['Site.Post', 'Site.Cord'], why: 'Pflock und Schnur der Baustelle' },
  { match: /^props\/scaffold$/, only: ['Scaffold'], why: 'Gerüst der Baustelle' },
  { match: /^props\/load_/, only: ['Goods', 'Carry'], why: 'Last am Oberkörper: Ware (Goods) wächst, Behälter (Carry) bleibt' },
];

/** Objektnamen, Knochen (j) und ob jede Fläche ein Material hat. */
function read(dir, model) {
  const names = [];
  const bones = [];
  let material = false;
  let bare = 0;
  for (const raw of readModel(model, dir).obj.split('\n')) {
    if (raw.startsWith('j ')) bones.push(raw.split(' ')[1]);
    else if (raw.startsWith('o ')) {
      names.push(raw.slice(2).trim());
      material = false;
    } else if (raw.startsWith('usemtl ')) material = true;
    else if (raw.startsWith('f ') && !material) bare++;
  }
  return { names, bones, bare };
}

const has = (names, prefix) => names.some((n) => n === prefix || n.startsWith(`${prefix}.`));

export function checkModels(dir = modelsDir) {
  const problems = [];
  for (const model of modelNames(dir)) {
    const { names, bones, bare } = read(dir, model);
    const say = (text) => problems.push(`${model}: ${text}`);
    if (bare) say(`${bare} Flächen ohne Material`);
    // Blender hat einen Namen durchnummeriert, den es sonst im Modell nicht gibt.
    const numberedByBlender = names.filter((n) => /\.\d{3}$/.test(n) && !/^(Stock|Craft|Berry|Crop|Soil|Edge)\./.test(n));
    if (numberedByBlender.length) say(`Namen mit ".001" von Blender: ${[...new Set(numberedByBlender)].slice(0, 5).join(', ')}`);
    for (const rule of RULES.filter((r) => r.match.test(model))) {
      const missing = (rule.needs ?? []).filter((p) => !has(names, p));
      if (missing.length) say(`fehlt ${missing.join(', ')} (${rule.why})`);
      if (rule.bones && bones.length) {
        const gone = rule.bones.filter((b) => !bones.includes(b));
        if (gone.length) say(`fehlt Knochen ${gone.join(', ')} (${rule.why})`);
      } else if (rule.parts) {
        const gone = rule.parts.filter((p) => !has(names, p));
        if (gone.length) say(`fehlt ${gone.join(', ')} (${rule.why})`);
      }
      const stray = rule.only ? names.filter((n) => !rule.only.some((p) => has([n], p))) : [];
      if (stray.length) say(`nur ${rule.only.join(' oder ')}: ${[...new Set(stray)].slice(0, 5).join(', ')} (${rule.why})`);
      const extra = (rule.forbids ?? []).filter((p) => has(names, p));
      if (extra.length) say(`darf nicht enthalten ${extra.join(', ')} (${rule.why})`);
      for (const [prefix, count] of rule.numbered ?? []) {
        const numbers = new Set(names.map((n) => new RegExp(`^${prefix}\\.(\\d+)`).exec(n)).filter(Boolean).map((m) => Number(m[1])));
        const max = numbers.size ? Math.max(...numbers) : -1;
        const gaps = Array.from({ length: max + 1 }, (_, i) => i).filter((i) => !numbers.has(i));
        if (numbers.size === 0) say(`kein ${prefix}.<n> (${rule.why})`);
        else if (gaps.length) say(`${prefix}.<n> mit Lücken: ${gaps.slice(0, 8).join(', ')} fehlen (${rule.why})`);
        if (count !== null && numbers.size && max + 1 !== count) say(`${prefix}.<n>: ${max + 1} statt ${count} (${rule.why})`);
      }
    }
  }
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const problems = checkModels();
  if (problems.length) {
    console.log(`Namen in den Modellen - ${problems.length} Probleme:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log('Namen in den Modellen: alles da');
}
