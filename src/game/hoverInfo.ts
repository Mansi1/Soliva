// hoverInfo.ts
// Was unter dem Zeiger steht, als Zeile für die Entwickler-Infos - in dieser
// Reihenfolge: ein Dorfbewohner (Name, Leben, was er tut), ein Tier (Leben,
// erlegt: die Nahrung am Kadaver), ein Gebäude mit seinen Trefferpunkten,
// sonst ein Vorkommen - Art (Baum- oder Strauchart, z. B. "Heidelbeere") und
// wie viel Nahrung, Holz, Stein oder Gold noch da ist.

import { RESOURCE_LABEL, YIELD } from '../world/catalog';
import type { ResourceField } from '../world/resources';
import type { Animal } from '../world/unit';
import { animalName } from './selectionView';
import type { Villager, World } from '../world/world';

/** Was unter dem Zeiger gefunden wurde. */
export interface HoverTarget {
  villager?: Villager;
  animal?: Animal;
  /** Das Tile unter dem Zeiger - für Gebäude und Vorkommen. */
  tile?: { x: number; y: number };
}

/** Überschrift ("Einheit", "Tier", "Gebäude", "Ressource") und Text. */
export function hoverDescription(world: World, resources: ResourceField, target: HoverTarget): { label: string; text: string } {
  const { villager, animal, tile } = target;
  if (villager) {
    return {
      label: 'Einheit',
      text: `${villager.name} (${villager.role}) | Leben ${Math.ceil(villager.hp)}/${villager.maxHp} | ${world.describe(villager)}`,
    };
  }
  if (animal) {
    const { hp } = animal.definition;
    const label = animalName(animal);
    return {
      label: 'Tier',
      text: animal.isDead ? `${label} (erlegt) | Nahrung ${Math.ceil(animal.food)}/${animal.maxFood}` : `${label} | Leben ${Math.ceil(animal.hp)}/${hp}`,
    };
  }
  const building = tile ? world.at(tile.x, tile.y) : undefined;
  if (building) return { label: 'Gebäude', text: `${building.label} | Leben ${Math.ceil(building.hp)}/${building.maxHp}` };
  const found = tile ? world.resourceInfo(tile.x, tile.y) : null;
  if (!tile || !found) return { label: 'Ressource', text: '-' };
  // Was man davon bekommt: Beeren sind Nahrung, sonst Holz, Stein oder Gold.
  const amount = `${RESOURCE_LABEL[YIELD[found.type]]} ${Math.ceil(found.remaining)}/${found.total}`;
  // Baum- und Straucharten mit Namen davor; Stein und Gold heißen wie ihr Ertrag.
  const kind = resources.kindAt(tile.x, tile.y);
  return { label: 'Ressource', text: kind ? `${kind} | ${amount}` : amount };
}
