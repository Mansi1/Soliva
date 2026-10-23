// catalog.ts
// Die Daten des Spiels an einer Stelle: Rohstoffe, Dorfbewohner, Früchte,
// Tiere, Spielerfarben - was Welt-Logik und Oberfläche darüber wissen müssen.
// Gebäude stehen als Klassen in building/ (je Art ihre Definition); ihre
// Arten, Definitionen und Reihenfolge werden hier nur weitergereicht.
//
// Gefördert wird wie in AoE2 von Dorfbewohnern: Sie sammeln am Vorkommen und
// tragen die Ladung zum nächsten Lager, das diese Ressource annimmt.

import { Color } from '../functions/Color';
import { SHAPE } from '../gl/entityRenderer';
import { RESOURCE_KINDS, WEAPON_KINDS } from './building/common';
import type { ResourceType } from '../map';

/**
 * Was im Vorrat liegt. Nahrung kommt aus Beeren, Feldern und der Jagd - im
 * Vorrat ist sie eins. Bögen und Speere sammelt man nicht, sie entstehen in
 * Bognerei und Speermacherei und liegen in der Waffenkammer. Schuhe (B31)
 * macht der Schuster, sie bleiben in der Schusterei, bis einer sie holt.
 * Milch, Wolle und Leder kommen von den Tieren der Weide (B27, pasture.ts).
 */
export type ResourceKind = 'food' | 'wood' | 'stone' | 'gold' | 'bows' | 'spears' | 'shoes' | 'milk' | 'wool' | 'leather';
/** Eine Menge Rohstoffe: der Vorrat, Kosten, eine Ladung. */
export type Resources = Record<ResourceKind, number>;
export { RESOURCE_KINDS, WEAPON_KINDS };

/** Namen der Rohstoffe für die Oberfläche. */
export const RESOURCE_LABEL: Record<ResourceKind, string> = {
  food: 'Nahrung', wood: 'Holz', stone: 'Stein', gold: 'Gold', bows: 'Bögen', spears: 'Speere', shoes: 'Schuhe',
  milk: 'Milch', wool: 'Wolle', leather: 'Leder',
};

/**
 * Sorten im Lager (BuildingBase.goods), die nicht auf der Karte stehen: der
 * Fang der Fischer und das Fleisch aus der Jagd. Bäume und Beeren heißen nach
 * ihrer Art (resources.ts, depositKind), Feldfrüchte nach CROPS.
 */
export const FISH_KIND = 'Fisch';
export const MEAT_KIND = 'Fleisch';

/** Was auf der Karte liegt und gesammelt wird: Baum, Fels, Beerenstrauch. */
export type DepositType = Exclude<ResourceType, 'none'>;

/** Was ein Vorkommen im Vorrat ergibt. */
export const YIELD: Record<DepositType, ResourceKind> = {
  wood: 'wood', stone: 'stone', gold: 'gold', berries: 'food',
};

/**
 * Größter erlaubter Anstieg unter einem Gebäude, in Tiles Höhe je Tile Breite
 * (0.3 ~ 17°). Steiler würde das Modell mit einer Seite in der Luft hängen.
 */
export const MAX_BUILD_SLOPE = 0.3;

// Gebäude: Arten, Definitionen und Reihenfolge kommen aus den Klassen (building/).
export { BUILDINGS, BUILDING_ORDER, type BuildingType, type BuildingDefinition } from './building';

export type CropType = 'wheat' | 'corn' | 'tomato' | 'potato' | 'hop';

export interface CropDef {
  label: string;
  shape: number;
  /** Nahrung je Aussaat. */
  food: number;
  /** Sekunden von der Aussaat, bis geerntet werden kann. */
  growTime: number;
  /** Faktor auf FARM_RATE - Mais erntet sich langsamer. */
  rate: number;
  /** Mit der Sense gemäht statt von Hand geerntet. */
  scythe: boolean;
}

/**
 * Was auf einem Feld wachsen kann - Ertrag je ganzem Feld grob wie ein
 * AoE2-Feld (175 Nahrung), Wuchs ab der Aussaat einer Furche.
 */
export const CROPS: Record<CropType, CropDef> = {
  wheat: { label: 'Weizen', shape: SHAPE.farmWheat, food: 175, growTime: 40, rate: 1, scythe: true },
  // Maiskolben werden von Hand gebrochen - Weizen wird gemäht.
  corn: { label: 'Mais', shape: SHAPE.farmCorn, food: 250, growTime: 70, rate: 0.8, scythe: false },
  // Tomaten reifen schnell, tragen aber wenig; Kartoffeln werden ausgegraben.
  tomato: { label: 'Tomaten', shape: SHAPE.farmTomato, food: 150, growTime: 30, rate: 0.9, scythe: false },
  potato: { label: 'Kartoffel', shape: SHAPE.farmPotato, food: 300, growTime: 90, rate: 0.7, scythe: false },
  // Hopfen rankt am Draht hoch, die Dolden werden von Hand gezupft.
  hop: { label: 'Hopfen', shape: SHAPE.farmHop, food: 200, growTime: 80, rate: 0.8, scythe: false },
};

/**
 * Furchen je Feld, bei jeder Frucht gleich (ROWS in tools/models/farms.mjs).
 * Drei je Tile-Reihe; in jeder arbeitet höchstens ein Bauer, auf einem
 * Feldstück höchstens FARMERS_PER_FIELD.
 */
export const FIELD_ROWS = 9;
/** Sekunden, bis ein Bauer eine Furche über drei Tiles umgepflügt bzw. eingesät hat. */
export const PLOUGH_TIME = 12;
export const SOW_TIME = 8;

export const CROP_ORDER: CropType[] = ['wheat', 'corn', 'tomato', 'potato', 'hop'];

/** Nahrung je Sekunde, die ein Bauer erntet (mal CropDef.rate). */
export const FARM_RATE = 0.7;
/**
 * Neu säen kostet - wie in AoE2 - etwa so viel wie das Feld: je abgeernteter
 * Furche eines Tiles 2 Holz (drei Furchen je Tile). Die erste Aussaat ist im
 * Preis des Felds enthalten.
 */
export const RESEED_COST: Partial<Resources> = { wood: 2 };
/** Bauern je Feldstück - sie bleiben auf ihrem Stück (farming.ts). */
export const FARMERS_PER_FIELD = 3;
/** Nach so vielen Ernten ist der Boden fest - das Feldstück wird neu gepflügt. */
export const REPLOUGH_AFTER = 3;

/**
 * Startvorrat. Reicht für ein Dorfzentrum, eine Handvoll Dorfbewohner und
 * das erste Lager - ohne ihn stünde das Spiel still: Dorfbewohner kosten
 * Nahrung, und Nahrung sammeln nur Dorfbewohner.
 */
export function initialResources(): Resources {
  return { food: 200, wood: 350, stone: 120, gold: 0, bows: 0, spears: 0, shoes: 0, milk: 0, wool: 0, leather: 0 };
}

/** Spielerfarben zur Auswahl in den Einstellungen - wie in AoE2. */
export const PLAYER_COLORS: Record<string, { label: string; color: Color }> = {
  green: { label: 'Grün', color: Color.rgb(64, 160, 72) },
  blue: { label: 'Blau', color: Color.rgb(52, 92, 200) },
  red: { label: 'Rot', color: Color.rgb(200, 48, 48) },
  yellow: { label: 'Gelb', color: Color.rgb(226, 196, 40) },
  cyan: { label: 'Türkis', color: Color.rgb(40, 180, 190) },
  purple: { label: 'Lila', color: Color.rgb(140, 64, 180) },
  grey: { label: 'Grau', color: Color.rgb(140, 140, 140) },
  orange: { label: 'Orange', color: Color.rgb(230, 120, 30) },
};

/**
 * Farbe des Spielers: Kittel und Kleid der Dorfbewohner, Band, Wappen und
 * Fahnen der Gebäude, gestreifte Mühlenflügel, die Sammelpunkt-Fahne. Wird
 * bei jedem Bild gelesen - die Einstellungen können sie ändern.
 */
export const player = { color: PLAYER_COLORS.green.color };

/** Der Dorfbewohner: wird im Dorfzentrum ausgebildet und sammelt Rohstoffe. */
export const VILLAGER = {
  label: 'Dorfbewohner',
  key: 'v',
  cost: { food: 50 } as Partial<Resources>,
  /** Ausbildungszeit in Sekunden. */
  trainTime: 6,
  /** Trefferpunkte, wenn er unverletzt ist - wie in AoE2. */
  hp: 25,
  /** Tiles je Sekunde: 0.8 = 4 m/s, zügiges Gehen (1 Tile = 5 m, siehe `size`). */
  speed: 0.8,
  /** So viel trägt er, bevor er zum Lager geht. */
  capacity: 10,
  /**
   * Figurgröße in Tiles - nur fürs Bild; die Figur ist 1.7-mal so hoch. Die
   * Modelle rechnen mit 1 Tile = 5 m: 0.2 * 1.7 * 5 m = 1.7 m, so passt ein
   * Dorfbewohner durch die 2.1 m hohen Türen der Gebäude.
   */
  size: 0.2,
  /** Sammeltempo je Sekunde, solange er am Vorkommen steht. */
  gatherRate: { wood: 0.8, stone: 0.6, gold: 0.5, berries: 0.9 } as Record<DepositType, number>,
  /** Wie weit er nach einem leeren Feld nach dem nächsten derselben Art sucht. */
  searchRadius: 16,
} as const;

/**
 * Höchstens so viele Dorfbewohner arbeiten an einem Vorkommen. Wer
 * darüber hinaus hingeschickt wird, nimmt das nächste freie derselben Art.
 */
export const MAX_GATHERERS = 6;

// Tiere: Arten und Definitionen kommen aus den Klassen (unit/).
export { ANIMALS, type AnimalKind, type AnimalDefinition } from './unit';

/**
 * Jagen: Wurfweite des Speers (Tiles), Sekunden zwischen zwei Würfen, Zerlegen
 * (Nahrung je Sekunde). Ohne Speer (B25) muss er bis `reach` ans Tier heran
 * und gibt auf, wenn er es nicht binnen `chaseLimit` Sekunden Jagd erreichen
 * kann (villagers.ts, hopeless). Mit dem Bogen (B24) schießt er aus `bowRange`
 * (20 m statt 11 m mit dem Speer).
 */
export const HUNT = { range: 2.2, reload: 1.4, butcherRate: 1.0, reach: 0.35, chaseLimit: 20, bowRange: 4 };

/**
 * Bognerei, wie der Fletcher in Stronghold: ein Bogner holt so viel Holz aus
 * dem Vorrat (am nächsten Lager für Holz), schnitzt daraus an der Werkbank
 * in `craftTime` Sekunden einen Bogen und trägt ihn zur nächsten Waffenkammer
 * mit Platz.
 */
export const BOWYER = { wood: 10, craftTime: 20 };

/**
 * Speermacherei (B25), wie die Bognerei: ein Speer kostet halb so viel Holz
 * wie ein Bogen (Vorgabe des Spielers) und ist in halber Zeit fertig.
 */
export const SPEAR_MAKER = { wood: 5, craftTime: 10 };

/**
 * Schusterei (B31): ein Paar Holzschuhe (Klompen) aus einem Klotz Pappelholz -
 * weniger Holz als ein Speer (5), in derselben Zeit geschnitzt. Die Paare
 * liegen im Dorfzentrum; wer dort Ware abgibt, nimmt ein Paar mit (B37,
 * villagers.ts deliverTo). VERIFIED: tests/shoes.test.mjs.
 */
export const COBBLER = { wood: 3, craftTime: 10 };

/**
 * Was eine Werkstatt aus Holz macht (Auftrag 'craft', villagers.ts): Ware,
 * Stoff (Holz, Leder) und Zeit je Stück, wie das Stück und wer es macht in der Oberfläche heißt.
 * Ein Rezept je Werkstatt statt eigener Abläufe: Bognerei, Speermacherei und
 * Schusterei teilen denselben Weg (holen, schnitzen, abliefern). Abgeliefert
 * wird ins nächste Lager für die Ware: Waffen in die Waffenkammer, Schuhe ins
 * Dorfzentrum (B37).
 * VERIFIED: tests/spear.test.mjs - 5 Holz werden ein Speer in der Waffenkammer;
 * tests/shoes.test.mjs - 3 Holz werden ein Paar Holzschuhe im Dorfzentrum.
 */
export interface CraftRecipe {
  product: 'bows' | 'spears' | 'shoes';
  /** Woraus es gemacht wird und wie viel davon je Stück - Holz, für Lederschuhe Leder. */
  material: 'wood' | 'leather';
  amount: number;
  craftTime: number;
  /** "einen Bogen" - für "schnitzt einen Bogen". */
  item: string;
  /** "Bogen" - für "10 Holz je Bogen". */
  unit: string;
  worker: string;
  /** Sorte im Lager (BuildingBase.goods) - ohne Angabe RESOURCE_LABEL der Ware. */
  kind?: string;
}
export const CRAFTS: Record<'bowyer' | 'spear_maker' | 'cobbler', CraftRecipe> = {
  bowyer: { product: 'bows', material: 'wood', amount: BOWYER.wood, craftTime: BOWYER.craftTime, item: 'einen Bogen', unit: 'Bogen', worker: 'Bogner' },
  spear_maker: { product: 'spears', material: 'wood', amount: SPEAR_MAKER.wood, craftTime: SPEAR_MAKER.craftTime, item: 'einen Speer', unit: 'Speer', worker: 'Speermacher' },
  cobbler: { product: 'shoes', material: 'wood', amount: COBBLER.wood, craftTime: COBBLER.craftTime, item: 'ein Paar Holzschuhe', unit: 'Paar', worker: 'Schuster', kind: 'Holzschuhe' },
};

/**
 * Lederschuhe (B31) - das zweite Rezept der Schusterei, erst nach der
 * Forschung "Gerberei" im Dorfzentrum (research.ts). Ein Paar aus 2 Leder
 * (ein Reh gibt 5, eine Kuh 8), genäht dauert es länger als geschnitzt.
 */
export const LEATHER_SHOES: CraftRecipe = {
  product: 'shoes', material: 'leather', amount: 2, craftTime: 15, item: 'ein Paar Lederschuhe', unit: 'Paar', worker: 'Schuster', kind: 'Lederschuhe',
};

/** Das Rezept einer Werkstatt - undefined für Werkstätten ohne Waren (Fischer, Förster). */
export function craftRecipe(type: string): CraftRecipe | undefined {
  return CRAFTS[type as keyof typeof CRAFTS];
}

/**
 * Was ein Dorfbewohner als Waffe bei sich tragen kann (Villager.inventory) -
 * der Speer des Jägers (B25) und der Bogen des Schützen (B24, world/archery.ts).
 */
export type Weapon = 'spear' | 'bow';
/** Je Waffe: woraus sie in der Waffenkammer kommt und wie sie im Panel heißt. */
export const WEAPONS: Record<Weapon, { resource: ResourceKind; label: string }> = {
  spear: { resource: 'spears', label: 'Speer' },
  bow: { resource: 'bows', label: 'Bogen' },
};

/**
 * Schuhe an den Füßen (Villager.inventory, B31): zu Beginn ist jeder barfuß
 * (VILLAGER.speed), Holzschuhe aus der Schusterei machen ihn 10 % schneller,
 * Lederschuhe (Forschung "Gerberei", Leder) 20 %. Je Art eine eigene Sorte im
 * Lager (`kind`, BuildingBase.goods) - so sieht man, welches Paar wo liegt.
 */
export type Shoes = 'wood' | 'leather';
export const SHOES: Record<Shoes, { kind: string; label: string; speed: number }> = {
  wood: { kind: CRAFTS.cobbler.kind!, label: 'Holzschuhe', speed: 1.1 },
  leather: { kind: LEATHER_SHOES.kind!, label: 'Lederschuhe', speed: 1.2 },
};

/**
 * Fischerei: Reusen füllen sich in `trapFillTime` Sekunden, geleert bringen
 * sie `trapFood` Nahrung. Ohne volle Reuse angelt der Fischer am Ufer: alle
 * `rodTime` Sekunden ein Fisch, `rodFood` Nahrung. `trapFish`: so viele Fische
 * liegen in einer vollen Reuse (Stock.<n> im Modell). `range`: so weit (Tiles)
 * von der Hütte dürfen Reusen und das Ufer liegen. `emptyTime`: Sekunden an
 * der Reuse.
 */
export const FISHING = { trapFillTime: 180, trapFood: 5, trapFish: 5, rodTime: 60, rodFood: 1, range: 8, emptyTime: 2 };

/** Baumarten, die der Förster pflanzt - wählbar in seiner Hütte. */
export type TreeSpecies = 'oak' | 'spruce' | 'pine' | 'birch' | 'maple' | 'poplar';

/**
 * Name und Modell je Baumart. Der Name ist derselbe wie bei den Bäumen des
 * Geländes (resources.ts, KIND_LABEL) - so kommt gepflanzte Eiche als "Eiche" ins Lager.
 */
export const TREE_SPECIES: Record<TreeSpecies, { label: string; shape: number }> = {
  oak: { label: 'Eiche', shape: SHAPE.treeOak },
  spruce: { label: 'Fichte', shape: SHAPE.tree },
  pine: { label: 'Kiefer', shape: SHAPE.treePine },
  birch: { label: 'Birke', shape: SHAPE.treeBirch },
  maple: { label: 'Ahorn', shape: SHAPE.treeMaple },
  poplar: { label: 'Pappel', shape: SHAPE.treePoplar },
};

export const TREE_SPECIES_ORDER: TreeSpecies[] = ['oak', 'spruce', 'pine', 'birch', 'maple', 'poplar'];

/**
 * Förster: pflanzt im Umkreis `radius` (Tiles) um seine Hütte oder um den
 * Pflanzplatz einen Baum nach dem anderen - `plantTime` Sekunden Graben und
 * Setzen, Pflanzen kostet nichts. Ein Baum wächst in `growTime` Sekunden, erst
 * dann kann man ihn fällen; er trägt `wood` Holz (wie ein mittlerer Waldbaum,
 * dort 50-100). `wait`: Sekunden, bis er nach einem vollen Umkreis wieder sucht.
 */
export const FORESTER = { radius: 6, plantTime: 6, growTime: 5 * 60, wood: 75, wait: 5 };

/** Höchstens so viele Dorfbewohner stehen gleichzeitig in der Warteschlange eines Dorfzentrums. */
export const MAX_TRAINING_QUEUE = 25;
