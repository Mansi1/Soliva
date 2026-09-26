// selectionView.ts
// Beschreibt, was ausgewählt ist, als reine Daten fürs Auswahl-Panel
// (components/SelectionPanel.tsx): Gebäude mit Feld oder Ausbildung, ein
// Vorkommen, Dorfbewohner mit ihren Tätigkeiten - oder nichts.

import type { FarmView, SelectionView, TrainView, WorkshopView } from '../components/SelectionPanel';
import { FLOWERS } from '../gl/entityRenderer';
import { FLOWER_KINDS } from '../gl/flowerModel';
import { RESOURCE_TYPE_LABEL } from '../map';
import { FishTrap, type Building, type UnitProducer } from '../world/building';
import {
  BUILDINGS, CROPS, FISHING, MAX_GATHERERS, MAX_TRAINING_QUEUE, RESOURCE_LABEL, VILLAGER, type ResourceKind,
} from '../world/catalog';
import type { ResourceField } from '../world/resources';
import type { AnimalState } from '../world/unit';
import type { World } from '../world/world';
import { workplace } from '../world/villagers';
import type { Selection } from './Selection';

/** Was auf einem Feld gerade dran ist - fürs Panel. */
const FARM_PHASE_TEXT = {
  plough: 'Alle pflügen um',
  sow: 'Alle säen',
  grow: 'Wächst - die Bauern jäten',
  harvest: 'Alle ernten',
  done: 'Abgeerntet - wird neu gesät',
} as const;

/**
 * Stand eines Felds fürs Panel - des ganzen zusammenhängenden Felds, auf dem
 * alle gemeinsam arbeiten: Phase, Furchen je Arbeitsschritt, Ernte, Bauern.
 */
function farmView(world: World, building: Building): FarmView {
  const group = world.farmGroup(building);
  // Nur die Furchen, die es gibt - ein Feldstück hat drei.
  const furrows = group.flatMap((b) => b.activeFurrows());
  const count = (test: (f: (typeof furrows)[number]) => boolean) => furrows.filter(test).length;
  const growing = furrows.filter((f) => f.sown >= 1 && f.growth < 1);
  return {
    phase: FARM_PHASE_TEXT[world.farmPhase(building)],
    tiles: group.length,
    crops: [...new Set(furrows.map((f) => CROPS[f.crop].label))].join(', '),
    food: furrows.reduce((sum, f) => sum + (f.sown >= 1 ? f.food : 0), 0),
    rows: furrows.length,
    ploughed: count((f) => f.plough >= 1),
    sown: count((f) => f.sown >= 1),
    ripe: count((f) => f.growth >= 1 && f.food > 1e-6),
    nextRipeIn: growing.length > 0 ? Math.min(...growing.map((f) => (1 - f.growth) * CROPS[f.crop].growTime)) : undefined,
    farmers: group.flatMap((b) => world.farmers(b)).map((v) => v.name),
  };
}

/** "10 Holz, 50 Nahrung". */
function costText(cost: Partial<Record<ResourceKind, number>>): string {
  return Object.entries(cost).map(([r, n]) => `${n} ${RESOURCE_LABEL[r as ResourceKind]}`).join(', ');
}

/** Was ein Tier gerade tut - fürs Panel. */
const ANIMAL_DOING: Record<AnimalState, string> = { graze: 'äst', walk: 'zieht umher', flee: 'flieht', dead: 'erlegt' };

/** Knopf zum Ausbilden: Kosten und ob man sie hat. */
function trainView(world: World): TrainView {
  return {
    label: VILLAGER.label,
    cost: costText(VILLAGER.cost),
    affordable: world.canAffordVillager(),
  };
}

/** Was das Auswahl-Panel zeigt - als reine Daten, gezeichnet von SelectionPanel. */
/**
 * Was das Auswahl-Panel zeigt - als reine Daten, gezeichnet von
 * SelectionPanel. Ist ein ausgewähltes Vorkommen inzwischen leer, fällt es
 * aus der Auswahl.
 */
export function selectionView(world: World, selection: Selection, resources: ResourceField): SelectionView {
  const building = selection.focused();
  const many = selection.chosenBuildings();

  if (many.length > 1) {
    // Mehrere Gebäude: Anzahl je Art, Trefferpunkte zusammen, Ausbildung und Abriss für alle.
    const kinds = new Map<string, number>();
    for (const b of many) kinds.set(b.label, (kinds.get(b.label) ?? 0) + 1);
    const trainers = many.filter((b): b is UnitProducer => b.isUnitProducer());
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
        ? { queued: trainers.reduce((sum, b) => sum + b.queuedUnits, 0), capacity: trainers.length * MAX_TRAINING_QUEUE, train: trainView(world) }
        : undefined,
      farms: many.every((b) => b.isFarm())
        ? {
            farmers: many.reduce((sum, b) => sum + world.farmers(b).length, 0),
            rows: many.reduce((sum, b) => sum + (b.isFarm() ? b.activeFurrows().length : 0), 0),
            plan: plan ?? null,
          }
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
      farm: building.isFarm() ? { ...farmView(world, building), plan: building.plan } : undefined,
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
            queue: building.queuedUnits,
            max: MAX_TRAINING_QUEUE,
            full: pop.used >= pop.cap,
            percent: Math.floor(building.trainingProgress() * 100),
            rally: building.rallyPoint !== null,
            train: trainView(world),
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
    const { name, latin, info } = FLOWER_KINDS[kind];
    return { kind: 'flower', name, latin, info, flower: kind, color: selection.flower.color };
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
        ? { name: single.name, role: single.female ? 'Dorfbewohnerin' : VILLAGER.label, doing: world.describe(single) }
        : undefined,
      count: chosen.length,
      label: VILLAGER.label,
      names: chosen.slice(0, 6).map((v) => v.name).join(', ') + (chosen.length > 6 ? ` +${chosen.length - 6}` : ''),
      hp: chosen.reduce((sum, v) => sum + v.hp, 0),
      maxHp: chosen.length * VILLAGER.hp,
      activities: [...counts],
    };
  }
  if (!world.hasTownCenter()) return { kind: 'start' };
  return { kind: 'overview', idle: world.villagers.filter((v) => v.task.kind === 'idle').length };
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
    percent: busy && 'progress' in task ? Math.floor(task.progress * 100) : undefined,
  };
}
