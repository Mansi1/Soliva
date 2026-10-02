// actions.ts
// Was der Spieler tut: auswählen (Klick, Doppelklick, Rahmen), Befehle
// (Rechtsklick), bauen, ausbilden, untätige Dorfbewohner und Hauptgebäude
// anspringen, abreißen, Frucht wählen. Die Aktionen kennen die Welt und den
// Spielzustand (Kamera, Auswahl, Baumodus); die Oberfläche erreichen sie nur
// über die Rückrufe in ActionUi.

import type { Sound } from '../audio';
import { CROPS, type BuildingType, type CropType } from '../world/catalog';
import type { UnitProducer } from '../world/building';
import { workplace } from '../world/villagers';
import type { World } from '../world/world';
import type { Camera } from './Camera';
import type { Picker } from './Picker';
import type { Placement } from './Placement';
import type { Selection } from './Selection';

/** Doppelklick: alle gleichartigen Gebäude in diesem Umkreis (Tiles). */
const SAME_TYPE_RADIUS = 15;

/** Was die Aktionen von der Oberfläche brauchen. */
export interface ActionUi {
  /** Kurzer Hinweis, warum etwas nicht geht - mit Fehlerton. */
  hint(text: string): void;
  /** Auswahl-Panel neu zeigen. */
  refreshSelection(): void;
  /** Vorrat, Baumenü und Auswahl neu zeigen. */
  refreshResources(): void;
  /** Die Kamera hat sich bewegt - was unter dem Zeiger liegt, neu bestimmen. */
  refreshPointer(): void;
  /**
   * Die Stelle (x, y) mit ihrer Geländehöhe in die Bildmitte - verdeckt sie
   * ein Berg, legt sich das Gelände flach (lookAt in main.ts).
   */
  lookAt(x: number, y: number): void;
  /** Wie lookAt, aber als sanfter Kameraflug. */
  flyTo(x: number, y: number): void;
  /** Baumodus für diese Art ein- (oder mit null aus-)schalten. */
  setPlacing(type: BuildingType | null): void;
  /** Ist der Sammelpunkt-Schalter an? Dann setzt der nächste Klick auf die Karte den Punkt. */
  readonly rallyPicking: boolean;
  setRallyPicking(on: boolean): void;
}

export interface GameState {
  world: World;
  camera: Camera;
  selection: Selection;
  placement: Placement;
  picker: Picker;
  sound: Sound;
}

export class PlayerActions {
  private world: World;
  private camera: Camera;
  private selection: Selection;
  private placement: Placement;
  private picker: Picker;
  private sound: Sound;

  constructor(state: GameState, private ui: ActionUi) {
    ({
      world: this.world, camera: this.camera, selection: this.selection, placement: this.placement,
      picker: this.picker, sound: this.sound,
    } = state);
  }



  /**
   * Linksklick ohne Ziehen: Dorfbewohner, sonst Tier, Gebäude, Vorkommen,
   * Blume, sonst nichts. Mit Umschalt (`add`) kommt es zur Auswahl dazu oder fällt heraus;
   * ein Doppelklick (`same`) auf ein Gebäude wählt alle gleichartigen in der Nähe.
   */
  clickSelect(px: number, py: number, add: boolean, same = false) {
    const villager = this.picker.villager(px, py);
    const animal = villager ? undefined : this.picker.animal(px, py);
    this.selection.clearSingle();
    if (animal) {
      this.selection.clearBuildings();
      this.selection.villagers.clear();
      this.selection.animal = animal.id;
    } else if (villager) {
      this.selection.clearBuildings();
      if (!add) this.selection.villagers.clear();
      if (add && this.selection.villagers.has(villager.id)) this.selection.villagers.delete(villager.id);
      else this.selection.villagers.add(villager.id);
    } else {
      // Nur der Boden unter Gebäude oder Vorkommen getroffen: nichts auswählen (Picker.target).
      const { x, y, bareGround } = this.picker.target(px, py);
      const building = bareGround ? undefined : this.world.at(x, y);
      this.selection.villagers.clear();
      if (building) {
        const anchor = this.world.anchorOf(building);
        if (same) {
          // Felder: das ganze zusammenhängende Feld, sonst gleichartige in der Nähe.
          const near = building.isFarm() ? this.world.farmGroup(building) : [...this.world.allBuildings()].filter((b) => b.type === building.type
            && Math.hypot(b.x - building.x, b.y - building.y) <= SAME_TYPE_RADIUS);
          this.selection.selectBuildings([...(add ? this.selection.buildings : []), ...near.map((b) => this.world.anchorOf(b))], anchor);
        } else if (add) {
          const set = new Set(this.selection.buildings);
          if (set.has(anchor)) set.delete(anchor);
          else set.add(anchor);
          this.selection.selectBuildings(set, set.has(anchor) ? anchor : this.selection.focusedBuilding);
        } else {
          this.selection.selectBuildings([anchor], anchor);
        }
      } else if (!add) {
        this.selection.clearBuildings();
        if (!bareGround && this.world.resourceInfo(x, y)) this.selection.resource = { x, y };
        else this.selection.flower = this.picker.flower(px, py) ?? null;
      }
    }
    this.ui.refreshSelection();
  }

  /**
   * Aufziehen eines Rechtecks: alle Dorfbewohner darin - ohne Werkstatt-Arbeiter,
   * sie gehorchen nicht. Trifft es nur solche, werden eben sie gewählt.
   */
  boxSelect(x0: number, y0: number, x1: number, y1: number, add: boolean) {
    const [left, right] = x0 < x1 ? [x0, x1] : [x1, x0];
    const [top, bottom] = y0 < y1 ? [y0, y1] : [y1, y0];
    if (!add) this.selection.villagers.clear();
    this.selection.clearBuildings();
    this.selection.clearSingle();
    const hits = this.world.villagers.filter((v) => {
      const s = this.picker.villagerScreen(v);
      return s.x >= left && s.x <= right && s.y >= top && s.y <= bottom;
    });
    const free = hits.filter((v) => !workplace(v.task));
    for (const v of free.length > 0 ? free : hits) this.selection.villagers.add(v.id);
    this.ui.refreshSelection();
  }


  /** Im Baumodus ein Gebäude bzw. Feldstück setzen; false, wenn es nicht ging. */
  placeAt(x: number, y: number, quiet = false): boolean {
    if (!this.placement.isActive) return false;
    const reason = this.placement.place(x, y);
    if (reason) {
      if (!quiet) this.ui.hint(reason);
      return false;
    }
    this.sound.play('place');
    this.ui.refreshResources();
    // Reicht der Vorrat nicht für ein weiteres, zurück in den Ansichtsmodus -
    // sonst klickt man ins Leere und bekommt nur Fehlermeldungen.
    if (!this.placement.canAffordAnother()) this.ui.setPlacing(null);
    return true;
  }


  /**
   * Sammelpunkt-Schalter an: setzt den Punkt der ausgewählten ausbildenden
   * Gebäude auf die Stelle p (bei mehreren für alle) - auf das Gebäude selbst
   * hebt ihn auf. Danach ist der Schalter wieder aus.
   */
  setRallyAt(p: { x: number; y: number }) {
    // Auf das Objekt gezielt (Baumkrone, Fels) zählt dessen Feld.
    const { x, y } = this.picker.target(p.x, p.y);
    let reason: string | null = null;
    for (const b of this.selection.chosenBuildings()) {
      if (b.isUnitProducer()) reason = this.world.setRally(b, x, y) ?? reason;
    }
    if (reason) this.ui.hint(reason);
    else this.sound.play('click');
    this.ui.setRallyPicking(false);
  }

  /** Rechtsklick: im Baumodus abbrechen, mit Dorfbewohnern ein Befehl. */
  rightClick(p: { x: number; y: number }) {
    if (this.ui.rallyPicking) {
      this.setRallyAt(p);
      return;
    }
    if (this.placement.placingType) {
      this.ui.setPlacing(null);
      return;
    }
    // Auf das Objekt gezielt (Baumkrone, Fels) zählt dessen Feld.
    const { x, y } = this.picker.target(p.x, p.y);

    if (this.selection.villagers.size === 0) return;
    // Auf ein Tier (lebend oder erlegt): jagen bzw. zerlegen.
    const at = this.picker.point(p.x, p.y);
    const prey = this.world.animalNear(at.x, at.y, 0.6);
    if (prey) {
      const busy = this.world.hunt(this.selection.villagers, prey);
      if (busy) this.ui.hint(busy);
      else this.sound.play('click', 0.7);
      this.ui.refreshSelection();
      return;
    }
    const reason = this.world.command(this.selection.villagers, x, y, at);
    if (reason) this.ui.hint(reason);
    else this.sound.play('click', 0.7);
    this.ui.refreshSelection();
  }

  /** Dorfbewohner einreihen - `count` auf einmal (Umschalt: 5, wie in AoE2). */
  trainVillagers(count = 1) {
    // Ausgewählte Hauptgebäude, sonst das nächstgelegene. Bei mehreren kommt
    // jeder Dorfbewohner in die kürzeste Warteschlange.
    const selectedTrainers = this.selection.chosenBuildings().filter((b): b is UnitProducer => b.isUnitProducer());
    const nearest = this.world.nearestTownCenter(this.camera.x, this.camera.y);
    const trainers = selectedTrainers.length > 0 ? selectedTrainers : nearest ? [nearest] : [];
    if (trainers.length === 0) {
      this.ui.hint('Baue zuerst ein Hauptgebäude');
      return;
    }
    let reason: string | null = null;
    let queued = 0;
    for (let i = 0; i < count; i++) {
      const open = trainers.filter((b) => !b.isQueueFull);
      const building = (open.length > 0 ? open : trainers).reduce((a, b) => (b.queuedUnits < a.queuedUnits ? b : a));
      reason = this.world.train(building);
      if (reason) break;
      queued++;
    }
    // Ein Teil ging: kein Fehler, nur wenn gar keiner in die Schlange kam.
    if (queued === 0 && reason) this.ui.hint(reason);
    else this.sound.play('click', 0.5);
    this.ui.refreshResources();
  }

  /**
   * Untätige Dorfbewohner auswählen und zu ihnen springen. Normal alle auf
   * einmal - dann genügt ein Rechtsklick, um sie an die Arbeit zu schicken.
   * Mit `all = false` nur einen, bei wiederholtem Aufruf reihum.
   */
  selectIdle(all = true) {
    const idle = this.world.villagers.filter((v) => v.task.kind === 'idle');
    if (idle.length === 0) {
      this.ui.hint('Kein Dorfbewohner ist untätig');
      return;
    }
    this.selection.clearBuildings();
    this.selection.clearSingle();
    let target: { x: number; y: number };
    if (all) {
      this.selection.villagers.clear();
      for (const v of idle) this.selection.villagers.add(v.id);
      // Zur Mitte der Gruppe - verteilt über die Karte zum ersten.
      const mx = idle.reduce((sum, v) => sum + v.x, 0) / idle.length;
      const my = idle.reduce((sum, v) => sum + v.y, 0) / idle.length;
      const spread = Math.max(...idle.map((v) => Math.hypot(v.x - mx, v.y - my)));
      target = spread < 40 ? { x: mx, y: my } : idle[0];
    } else {
      // Nach dem gerade ausgewählten weitermachen, damit wiederholtes Klicken
      // alle der Reihe nach durchgeht.
      const current = this.selection.villagers.size === 1 ? [...this.selection.villagers][0] : -1;
      const index = idle.findIndex((v) => v.id === current);
      const next = idle[(index + 1) % idle.length];
      target = next;
      this.selection.villagers.clear();
      this.selection.villagers.add(next.id);
    }
    this.ui.lookAt(target.x, target.y);
    this.ui.refreshPointer();
    this.ui.refreshSelection();
  }


  /**
   * Taste H: zum Hauptgebäude springen und es auswählen - bei mehreren reihum,
   * beginnend nach dem gerade ausgewählten.
   */
  cycleTownCenter() {
    const centers = this.world.townCenters();
    if (centers.length === 0) {
      this.ui.hint('Baue zuerst ein Hauptgebäude');
      return;
    }
    const current = centers.findIndex((b) => this.world.anchorOf(b) === this.selection.focusedBuilding);
    const next = centers[(current + 1) % centers.length];

    this.selection.villagers.clear();
    this.selection.clearSingle();
    this.selection.selectBuildings([this.world.anchorOf(next)], this.world.anchorOf(next));
    // Mitte des Gebäudes in die Bildmitte - mit seiner Geländehöhe, sonst
    // säße es auf einem Hügel ein gutes Stück über der Mitte.
    this.ui.lookAt(next.x + 0.5, next.y + 0.5);
    this.ui.refreshPointer();
    this.ui.refreshSelection();
  }

  /**
   * Klick aufs Bild im Auswahl-Panel: das Ausgewählte in die Bildmitte -
   * Tier, Blume, Vorkommen, das fokussierte Gebäude oder die Mitte der
   * Dorfbewohner.
   */
  focusSelection() {
    const s = this.selection;
    const animal = s.animal !== null ? this.world.wildlife.byId(s.animal) : undefined;
    const building = s.focused();
    const villagers = s.chosenVillagers();
    const target = animal ? { x: animal.x, y: animal.y }
      : s.flower ? { x: s.flower.x + 0.5, y: s.flower.y + 0.5 }
      : s.resource ? { x: s.resource.x + 0.5, y: s.resource.y + 0.5 }
      : building ? { x: building.x + 0.5, y: building.y + 0.5 }
      : villagers.length > 0
        ? { x: villagers.reduce((sum, v) => sum + v.x, 0) / villagers.length, y: villagers.reduce((sum, v) => sum + v.y, 0) / villagers.length }
        : undefined;
    if (target) this.ui.flyTo(target.x, target.y);
  }

  /** Die ausgewählten Gebäude abreißen. */
  demolishSelected() {
    const buildings = this.selection.chosenBuildings();
    if (buildings.length === 0) return;
    for (const b of buildings) this.world.remove(b);
    this.selection.clearBuildings();
    this.placement.invalidate();
    this.ui.refreshResources();
  }

  /** Den Arbeiter der ausgewählten Werkstatt entlassen - danach ist er ausgewählt. */
  dismissWorker() {
    const shop = this.selection.focused();
    const worker = shop && this.world.dismiss(shop.anchor);
    if (!worker) return;
    this.selection.clearBuildings();
    this.selection.villagers.clear();
    this.selection.villagers.add(worker.id);
    this.sound.play('click');
    this.ui.refreshSelection();
  }

  /** Frucht fürs ganze Feld der ausgewählten Feldstücke - darauf wird gemeinsam gesät. */
  setFieldCrop(crop: CropType) {
    if (!CROPS[crop]) return;
    const fields = new Set(this.selection.chosenBuildings().flatMap((b) => this.world.farmGroup(b)));
    for (const field of fields) this.world.setCrop(field, crop);
    this.sound.play('click');
    this.ui.refreshSelection();
  }
}
