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
import { RESOURCE_KINDS } from './building/common';
import type { ResourceType } from '../map';

/**
 * Was im Vorrat liegt. Nahrung kommt aus Beeren, Feldern und der Jagd - im
 * Vorrat ist sie eins. Bögen sammelt man nicht, sie entstehen in der Bognerei
 * und liegen in der Waffenkammer.
 */
export type ResourceKind = 'food' | 'wood' | 'stone' | 'gold' | 'bows';
/** Eine Menge Rohstoffe: der Vorrat, Kosten, eine Ladung. */
export type Resources = Record<ResourceKind, number>;
export { RESOURCE_KINDS };

/** Namen der Rohstoffe für die Oberfläche. */
export const RESOURCE_LABEL: Record<ResourceKind, string> = {
  food: 'Nahrung', wood: 'Holz', stone: 'Stein', gold: 'Gold', bows: 'Bögen',
};

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
 * Drei je Tile-Reihe; in jeder arbeitet höchstens ein Bauer - ein ganzes Feld
 * beschäftigt bis zu neun.
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

/**
 * Startvorrat. Reicht für ein Hauptgebäude, eine Handvoll Dorfbewohner und
 * das erste Lager - ohne ihn stünde das Spiel still: Dorfbewohner kosten
 * Nahrung, und Nahrung sammeln nur Dorfbewohner.
 */
export function initialResources(): Resources {
  return { food: 200, wood: 350, stone: 120, gold: 0, bows: 0 };
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

/** Der Dorfbewohner: wird im Hauptgebäude ausgebildet und sammelt Rohstoffe. */
export const VILLAGER = {
  label: 'Dorfbewohner',
  key: 'v',
  cost: { food: 50 } as Partial<Resources>,
  /** Ausbildungszeit in Sekunden. */
  trainTime: 6,
  /** Trefferpunkte, wenn er unverletzt ist - wie in AoE2. */
  hp: 25,
  /** Tiles je Sekunde. */
  speed: 3.2,
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

/** Jagen: Wurfweite des Speers (Tiles), Sekunden zwischen zwei Würfen, Zerlegen (Nahrung je Sekunde). */
export const HUNT = { range: 2.2, reload: 1.4, butcherRate: 1.0 };

/**
 * Bognerei, wie der Fletcher in Stronghold: ein Bogner holt so viel Holz aus
 * dem Vorrat (am nächsten Lager für Holz), schnitzt daraus an der Werkbank
 * in `craftTime` Sekunden einen Bogen und trägt ihn zur nächsten Waffenkammer.
 */
export const BOWYER = { wood: 10, craftTime: 20 };

/**
 * Fischerei: Reusen füllen sich in `trapFillTime` Sekunden, geleert bringen
 * sie `trapFood` Nahrung. Ohne volle Reuse angelt der Fischer am Ufer: alle
 * `rodTime` Sekunden ein Fisch, `rodFood` Nahrung. `trapFish`: so viele Fische
 * liegen in einer vollen Reuse (Stock.<n> im Modell). `range`: so weit (Tiles)
 * von der Hütte dürfen Reusen und das Ufer liegen. `emptyTime`: Sekunden an
 * der Reuse.
 */
export const FISHING = { trapFillTime: 180, trapFood: 5, trapFish: 5, rodTime: 60, rodFood: 1, range: 8, emptyTime: 2 };

/** Höchstens so viele Dorfbewohner stehen gleichzeitig in der Warteschlange eines Hauptgebäudes. */
export const MAX_TRAINING_QUEUE = 25;
