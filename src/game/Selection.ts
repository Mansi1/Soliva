// Selection.ts
// Was der Spieler ausgewählt hat: Dorfbewohner (Kennungen), Gebäude (Anker),
// ein Vorkommen (Tile), ein Tier oder eine Blume - immer nur eine Art. Bei mehreren
// Gebäuden zeigt das Panel die Einzelheiten des fokussierten (des zuletzt
// angeklickten).

import type { EntityInstance } from '../gl/entityRenderer';
import type { Building } from '../world/building';
import type { Villager, World } from '../world/world';

export class Selection {
  readonly villagers = new Set<number>();
  readonly buildings = new Set<string>();
  /** Anker des Gebäudes, dessen Einzelheiten das Panel zeigt. */
  focusedBuilding: string | null = null;
  /** Ausgewähltes Vorkommen (Tile). */
  resource: { x: number; y: number } | null = null;
  /** Kennung des ausgewählten Tiers. */
  animal: number | null = null;
  /** Ausgewählte Blume - ihre Instanz aus world/flowers.ts. */
  flower: EntityInstance | null = null;

  constructor(private world: World) {}

  get isEmpty(): boolean {
    return this.villagers.size === 0 && this.buildings.size === 0 && !this.resource && this.animal === null && !this.flower;
  }

  /** Nichts mehr ausgewählt. */
  clear() {
    this.villagers.clear();
    this.clearBuildings();
    this.clearSingle();
  }

  /** Vorkommen, Tier und Blume abwählen - es gibt je nur eins. */
  clearSingle() {
    this.resource = null;
    this.animal = null;
    this.flower = null;
  }

  clearBuildings() {
    this.buildings.clear();
    this.focusedBuilding = null;
  }

  /** Genau diese Gebäude auswählen, `focus` im Panel (sonst das erste). */
  selectBuildings(anchors: Iterable<string>, focus: string | null) {
    this.buildings.clear();
    for (const anchor of anchors) this.buildings.add(anchor);
    this.focusedBuilding = focus && this.buildings.has(focus) ? focus : ([...this.buildings][0] ?? null);
  }

  /** Die ausgewählten Gebäude, die es noch gibt. */
  chosenBuildings(): Building[] {
    return [...this.buildings].map((a) => this.world.building(a)).filter((b) => b !== undefined);
  }

  /** Das fokussierte Gebäude, falls es noch steht. */
  focused(): Building | undefined {
    return this.focusedBuilding ? this.world.building(this.focusedBuilding) : undefined;
  }

  /** Die ausgewählten Dorfbewohner, die noch leben. */
  chosenVillagers(): Villager[] {
    return this.world.villagers.filter((v) => this.villagers.has(v.id));
  }

  /** Wer inzwischen nicht mehr existiert, fällt aus der Auswahl. */
  prune() {
    for (const id of this.villagers) {
      if (!this.world.villagers.some((v) => v.id === id)) this.villagers.delete(id);
    }
    for (const anchor of [...this.buildings]) if (!this.world.building(anchor)) this.buildings.delete(anchor);
    if (this.focusedBuilding && !this.buildings.has(this.focusedBuilding)) {
      this.focusedBuilding = [...this.buildings][0] ?? null;
    }
  }
}
