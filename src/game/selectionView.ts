// selectionView.ts
// Beschreibt, was ausgewählt ist, als reine Daten fürs Auswahl-Panel
// (components/SelectionPanel.tsx): Gebäude mit Feld oder Ausbildung, ein
// Vorkommen, Dorfbewohner mit ihren Tätigkeiten - oder nichts.

import type { FarmView, SelectionView, TrainView, WorkshopView } from '../components/SelectionPanel';
import { FLOWERS } from '../gl/entityRenderer';
import { FLOWER_KINDS, flowerPhoto } from '../gl/flowerModel';
import { RESOURCE_TYPE_LABEL } from '../map';
import { FishTrap, type Building, type Farm, type UnitProducer } from '../world/building';
import {
  BUILDINGS, CROPS, FARMERS_PER_FIELD, FISHING, MAX_GATHERERS, MAX_TRAINING_QUEUE, RESOURCE_LABEL, VILLAGER, type ResourceKind,
} from '../world/catalog';
import type { ResourceField } from '../world/resources';
import type { AnimalState } from '../world/unit';
import type { FarmPhase, World } from '../world/world';
import { workplace } from '../world/villagers';
import type { Selection } from './Selection';

/** Was auf einem Feldstück gerade dran ist - fürs Panel. */
const FARM_PHASE_TEXT: Record<FarmPhase, string> = {
  plough: 'Wird umgepflügt',
  sow: 'Wird gesät',
  wood: 'Zu wenig Holz zum Säen - die Bauern jäten',
  grow: 'Wächst - die Bauern jäten',
  harvest: 'Wird geerntet',
  done: 'Abgeerntet - wird neu gesät',
};

/**
 * Stand der markierten Feldstücke fürs Panel, zusammengezählt - jedes
 * arbeitet für sich (farming.ts): Phasen, Furchen je Arbeitsschritt, Ernte, Bauern.
 * VERIFIED: tests/fields.test.mjs - eins allein zeigt nur sich, mehrere zählen zusammen.
 */
function farmView(world: World, farms: Farm[]): FarmView {
  // Nur die Furchen, die es gibt - ein Feldstück hat drei.
  const furrows = farms.flatMap((b) => b.activeFurrows());
  const count = (test: (f: (typeof furrows)[number]) => boolean) => furrows.filter(test).length;
  const growing = furrows.filter((f) => f.sown >= 1 && f.growth < 1);
  return {
    phase: [...new Set(farms.map((b) => FARM_PHASE_TEXT[world.farmPhase(b)]))].join(' · '),
    tiles: farms.reduce((sum, b) => sum + b.footprintTiles().length, 0),
    crops: [...new Set(furrows.map((f) => CROPS[f.crop].label))].join(', '),
    food: furrows.reduce((sum, f) => sum + (f.sown >= 1 ? f.food : 0), 0),
    rows: furrows.length,
    ploughed: count((f) => f.plough >= 1),
    sown: count((f) => f.sown >= 1),
    ripe: count((f) => f.growth >= 1 && f.food > 1e-6),
    nextRipeIn: growing.length > 0 ? Math.min(...growing.map((f) => (1 - f.growth) * CROPS[f.crop].growTime)) : undefined,
    farmers: farms.flatMap((b) => world.farmers(b)).map((v) => v.name),
    maxFarmers: farms.reduce((sum, b) => sum + Math.min(FARMERS_PER_FIELD, b.activeFurrows().length), 0),
  };
}

/** "10 Holz, 50 Nahrung". */
function costText(cost: Partial<Record<ResourceKind, number>>): string {
  return Object.entries(cost).map(([r, n]) => `${n} ${RESOURCE_LABEL[r as ResourceKind]}`).join(', ');
}

/** Was ein Tier gerade tut - fürs Panel. */
const ANIMAL_DOING: Record<AnimalState, string> = { graze: 'äst', walk: 'zieht umher', flee: 'flieht', dead: 'erlegt' };

/** Knöpfe zum Ausbilden: Kosten und ob man sie hat; ob der Sammelpunkt-Schalter an ist; wie viele ein Klick ausbildet. */
function trainView(world: World, rallyPicking: boolean, batch: number): TrainView {
  return {
    label: VILLAGER.label,
    cost: costText(VILLAGER.cost),
    affordable: world.canAffordVillager(),
    rallyPicking,
    batch,
  };
}

/** Was das Auswahl-Panel zeigt - als reine Daten, gezeichnet von SelectionPanel. */
/**
 * Was das Auswahl-Panel zeigt - als reine Daten, gezeichnet von
 * SelectionPanel. Ist ein ausgewähltes Vorkommen inzwischen leer, fällt es
 * aus der Auswahl.
 */
export function selectionView(world: World, selection: Selection, resources: ResourceField, rallyPicking = false, trainBatch = 1): SelectionView {
  const building = selection.focused();
  const many = selection.chosenBuildings();

  if (many.length > 1) {
    // Mehrere Gebäude: Anzahl je Art, Trefferpunkte zusammen, Ausbildung und Abriss für alle.
    const kinds = new Map<string, number>();
    for (const b of many) kinds.set(b.label, (kinds.get(b.label) ?? 0) + 1);
    const trainers = many.filter((b): b is UnitProducer => b.isUnitProducer());
    const farms = many.filter((b): b is Farm => b.isFarm());
    const plans = new Set(many.map((b) => (b.isFarm() ? b.plan : undefined)));
    const plan = plans.size === 1 ? [...plans][0] : undefined;
    // Fürs Porträt die häufigste Art.
    const common = [...kinds].sort((a, b) => b[1] - a[1])[0][0];
    return {
      kind: 'buildings',
      type: many.find((b) => b.label === common)!.type,
      title: kinds.size === 1 ? `${many.length} × ${[...kinds.keys()][0]}` : `${many.length} Gebäude`,
      kinds: kinds.size > 1 ? [...kinds].map(([l, n]) => `${n}× ${l}`).join(', ') : undefined,
      hp: many.reduce((sum, b) => sum + b.hp, 0),
      maxHp: many.reduce((sum, b) => sum + b.maxHp, 0),
      training: trainers.length > 0
        ? { queued: trainers.reduce((sum, b) => sum + b.queuedUnits, 0), capacity: trainers.length * MAX_TRAINING_QUEUE, train: trainView(world, rallyPicking, trainBatch) }
        : undefined,
      farms: farms.length === many.length
        ? { ...farmView(world, farms), plan: plan ?? null }
        : undefined,
    };
  }
  if (building) {
    const def = building.definition;
    const pop = world.population();
    return {
      kind: 'building',
      type: building.type,
      label: def.label,
      hp: building.hp,
      maxHp: def.hp,
      storedResources: def.storedResources.length > 0 ? def.storedResources.map((r) => RESOURCE_LABEL[r]).join(', ') : undefined,
      housing: def.housing > 0 ? def.housing : undefined,
      farm: building.isFarm() ? { ...farmView(world, [building]), plan: building.plan } : undefined,
      workshop: building.isWorkshop() ? workshopView(world, building) : undefined,
      weapons: def.weaponCapacity > 0
        ? { bows: world.armoryStock().get(building.anchor) ?? 0, capacity: def.weaponCapacity }
        : undefined,
      trapCost: building.type === 'fisher_hut'
        ? { cost: costText(BUILDINGS.fish_trap.cost), affordable: world.affordable('fish_trap') }
        : undefined,
      trap: building instanceof FishTrap
        ? { fish: building.fish, max: FISHING.trapFish, fullIn: (1 - building.fill) * FISHING.trapFillTime }
        : undefined,
      trainer: building.isUnitProducer()
        ? {
            units: building.queue.map((u) => u.female),
            max: MAX_TRAINING_QUEUE,
            full: pop.used >= pop.cap,
            percent: Math.floor(building.trainingProgress() * 100),
            rally: building.rallyPoint !== null,
            train: trainView(world, rallyPicking, trainBatch),
          }
        : undefined,
    };
  }
  if (selection.resource) {
    const info = world.resourceInfo(selection.resource.x, selection.resource.y);
    if (!info) {
      // Leer gesammelt, während es ausgewählt war.
      selection.resource = null;
      return { kind: 'empty' };
    }
    const left = Math.ceil(info.remaining);
    const kind = resources.kindAt(selection.resource.x, selection.resource.y);
    return {
      kind: 'resource',
      type: info.type,
      shape: resources.modelAt(selection.resource.x, selection.resource.y),
      title: kind ?? RESOURCE_TYPE_LABEL[info.type],
      subtitle: kind ? RESOURCE_TYPE_LABEL[info.type] : undefined,
      left,
      total: info.total,
      percent: Math.round((info.remaining / info.total) * 100),
      // Beerensträucher wachsen nach - wie lange noch, bis er wieder voll ist.
      regrow: info.regrowIn !== undefined && info.regrowIn > 1 ? { empty: left === 0, seconds: info.regrowIn } : undefined,
      gatherers: info.gatherers,
      max: MAX_GATHERERS,
    };
  }
  if (selection.animal !== null) {
    const animal = world.wildlife.byId(selection.animal);
    if (!animal) {
      // Kadaver leer zerlegt, während es ausgewählt war.
      selection.animal = null;
      return { kind: 'empty' };
    }
    const def = animal.definition;
    return {
      kind: 'animal', type: animal.kind, label: def.label, info: def.info, dead: animal.isDead, doing: ANIMAL_DOING[animal.state],
      hp: animal.hp, maxHp: def.hp, food: animal.food, maxFood: def.food,
    };
  }
  if (selection.flower) {
    const kind = FLOWERS.indexOf(selection.flower.shape);
    const { type, name, latin, info, wiki } = FLOWER_KINDS[kind];
    return { kind: 'flower', name, latin, info, wiki, photo: flowerPhoto(type), flower: kind };
  }
  if (selection.villagers.size > 0) {
    const chosen = selection.chosenVillagers();
    // Gleiche Tätigkeiten zusammenfassen: "3x sammelt Holz, 1x untätig".
    const counts = new Map<string, number>();
    for (const v of chosen) {
      const text = world.describe(v).replace(/ \(\d+\)$/, '');
      counts.set(text, (counts.get(text) ?? 0) + 1);
    }
    // Einer: sein Name als Titel. Mehrere: Anzahl und darunter die Namen.
    const single = chosen.length === 1 ? chosen[0] : undefined;
    return {
      kind: 'villagers',
      female: chosen[0].female,
      single: single
        ? { name: single.name, role: single.female ? 'Dorfbewohnerin' : VILLAGER.label, doing: world.describe(single), worker: !!workplace(single.task) }
        : undefined,
      count: chosen.length,
      label: VILLAGER.label,
      names: chosen.slice(0, 6).map((v) => v.name).join(', ') + (chosen.length > 6 ? ` +${chosen.length - 6}` : ''),
      hp: chosen.reduce((sum, v) => sum + v.hp, 0),
      maxHp: chosen.length * VILLAGER.hp,
      activities: [...counts],
    };
  }
  return { kind: 'none' };
}

/** Werkstatt: wer dort arbeitet, was er tut, wie weit der Bogen ist. */
function workshopView(world: World, building: Building): WorkshopView {
  const role = building.type === 'fisher_hut' ? 'Fischer' : 'Bogner';
  const worker = world.villagers.find((v) => workplace(v.task) === building.anchor);
  if (!worker) return { role };
  const task = worker.task;
  const busy = (task.kind === 'craft' && task.step === 'carve' && worker.carryType !== 'wood')
    || (task.kind === 'fish' && (task.step === 'angle' || task.step === 'empty'));
  return {
    role,
    worker: worker.name,
    doing: world.describe(worker),
    leaving: 'leave' in task && task.leave,
    percent: busy && 'progress' in task ? Math.floor(task.progress * 100) : undefined,
  };
}
