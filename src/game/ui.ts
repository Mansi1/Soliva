// ui.ts
// Die Oberfläche im Spiel: Rohstoffleiste, Baumenü mit Baumodus, Auswahl-
// Panel mit seinen Befehlen, Hinweise und der Mauszeiger über dem Spielfeld.
// Was die Knöpfe auslösen, liefert main.ts als UiHooks (meist PlayerActions).

import type { Sound } from '../audio';
import { BuildMenu } from '../components/BuildMenu';
import { mountMinimapMenu } from '../components/Hud';
import { ResourceBar } from '../components/ResourceBar';
import { renderSelection } from '../components/SelectionPanel';
import { GATHER_CURSOR, RALLY_CURSOR } from '../cursors';
import { CROP_ORDER, RESOURCE_LABEL, VILLAGER, type BuildingType, type CropType, type ResourceKind } from '../world/catalog';
import type { ResourceField } from '../world/resources';
import type { World } from '../world/world';
import type { Placement } from './Placement';
import type { Pointer } from './Pointer';
import type { Selection } from './Selection';
import { selectionView } from './selectionView';

type RGB = [number, number, number];

/** Reihenfolge in der Rohstoffleiste - wie in AoE2: Holz, Nahrung, Gold, Stein. */
const RESOURCE_BAR_ORDER: ResourceKind[] = ['wood', 'food', 'gold', 'stone'];
/** So lange (ms) steht ein Hinweis. */
const HINT_MS = 1800;

/** Was die Knöpfe der Oberfläche auslösen. */
export interface UiHooks {
  /** Zahnrad: Menü auf oder zu. */
  toggleMenu(): void;
  /** Diskette: speichern. */
  save(): void;
  /** Knopf "Untätige": alle oder einzeln reihum. */
  selectIdle(all: boolean): void;
  train(count: number): void;
  demolish(): void;
  setFieldCrop(crop: CropType): void;
}

export interface UiState {
  world: World;
  selection: Selection;
  placement: Placement;
  pointer: Pointer;
  resources: ResourceField;
  sound: Sound;
  /** Das Spielfeld - bekommt den Mauszeiger. */
  canvas: HTMLCanvasElement;
}

const byId = (id: string) => document.getElementById(id)!;

export class GameUi {
  private readonly buildMenu: BuildMenu;
  private readonly resourceBar: ResourceBar;
  private readonly buildEl = byId('build');
  private readonly actionsEl = byId('actions');
  private readonly selectionEl = byId('selection');
  private readonly hintEl = byId('hint');
  private hintTimer = 0;

  constructor(private state: UiState, hooks: UiHooks, playerColor: RGB) {
    const { placement } = state;
    this.buildMenu = new BuildMenu(this.buildEl, playerColor, {
      build: (type) => this.setPlacing(placement.placingType === type ? null : type),
      // Feld aus dem Untermenü: mit dieser Frucht abstecken.
      crop: (crop) => this.placeField(crop),
      back: () => this.closeFarms(),
    });
    this.resourceBar = new ResourceBar(byId('stock'), RESOURCE_BAR_ORDER, playerColor);
    mountMinimapMenu(() => hooks.save(), () => hooks.toggleMenu());

    // Die Knöpfe entstehen bei jeder Aktualisierung neu - darum Delegation, und
    // mousedown statt click: läuft eine Ausbildung, ersetzt die Anzeige das
    // Panel fünfmal je Sekunde, und ein click, dessen mousedown und mouseup
    // auf verschiedenen Knopf-Elementen landen, fiele weg.
    byId('stock').addEventListener('mousedown', (e) => {
      const button = (e.target as HTMLElement).closest('button');
      if (e.button !== 0 || button?.dataset.action !== 'idle') return;
      // Kein Fokus auf dem Knopf - sonst bleibt ein Fokusrahmen stehen.
      e.preventDefault();
      e.stopPropagation();
      hooks.selectIdle(!e.shiftKey);
    });
    this.actionsEl.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const button = (e.target as HTMLElement).closest('button');
      const action = button?.dataset.action;
      if (action === 'train') hooks.train(e.shiftKey ? 5 : 1);
      if (action === 'demolish') hooks.demolish();
      if (action === 'trap') this.setPlacing('fish_trap');
      if (action === 'crop' && button?.dataset.crop) hooks.setFieldCrop(button.dataset.crop as CropType);
    });
  }

  /** Ist das Untermenü der Felder offen? */
  get farmsOpen(): boolean {
    return this.buildMenu.farmsOpen;
  }

  openFarms() {
    this.buildMenu.showFarms(true);
  }

  /** Untermenü der Felder zu - und das Bauen von Feldern beenden. */
  closeFarms() {
    this.buildMenu.showFarms(false);
    if (this.state.placement.placingType === 'farm') this.setPlacing(null);
  }

  /** Feld mit dieser Frucht bauen. */
  placeField(crop: CropType) {
    this.state.world.nextFarmCrop = crop;
    this.setPlacing('farm');
  }

  /** Frucht Nummer `index` im Untermenü der Felder - wenn es sich leisten lässt. */
  chooseCrop(index: number) {
    const crop = CROP_ORDER[index];
    if (crop && this.state.world.affordable('farm')) this.placeField(crop);
  }

  /** Esc: Untermenü zu, sonst Baumodus aus, sonst Auswahl aufheben. */
  cancel() {
    if (this.farmsOpen) this.closeFarms();
    else if (this.state.placement.isActive) this.setPlacing(null);
    else this.clearSelection();
  }

  /** Baumodus für diese Art ein - oder mit null aus. */
  setPlacing(type: BuildingType | null) {
    const { placement, world } = this.state;
    placement.placingType = type;
    // Wer baut, wählt nicht gleichzeitig aus - sonst tut ein Klick zwei Dinge.
    if (type) this.clearSelection();
    // Kein Feld mehr: zurück vom Untermenü der Felder zum Baumenü.
    if (type !== 'farm') this.buildMenu.showFarms(false);
    this.buildMenu.setPressed(type, world.nextFarmCrop);
    this.updateCursor();
  }

  clearSelection() {
    this.state.selection.clear();
    this.refreshSelection();
  }

  /** Kurzer Hinweis, warum etwas nicht geht - mit Fehlerton. */
  hint(text: string) {
    this.state.sound.play('error', 0.6);
    this.hintEl.textContent = text;
    this.hintEl.classList.add('show');
    clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => this.hintEl.classList.remove('show'), HINT_MS);
  }

  setPlayerColor(color: RGB) {
    this.resourceBar.setPlayerColor(color);
    this.buildMenu.setPlayerColor(color);
  }

  /** Vorrat, Bauknöpfe und Auswahl - getaktet, nicht je Bild. */
  refreshResources() {
    const { world, placement } = this.state;
    const { counts, idle } = world.gatherers();
    // Im Symbol, wie viele Dorfbewohner gerade daran sammeln.
    this.resourceBar.update({
      order: RESOURCE_BAR_ORDER,
      stock: world.stock,
      labels: RESOURCE_LABEL,
      gatherers: counts,
      population: world.population(),
      idle,
      villagerLabel: VILLAGER.label,
    });
    this.buildMenu.setEnabled((type) => world.affordable(type) && (type === 'town_center' || world.hasTownCenter()));
    this.refreshSelection();
    // Der Vorrat wächst von allein: was eben noch zu teuer war, ist es jetzt
    // vielleicht nicht mehr - die gemerkte Bauplatz-Prüfung muss also mit.
    placement.invalidate();
  }

  /** Was ausgewählt ist und was man damit tun kann. */
  refreshSelection() {
    const { world, selection, resources } = this.state;
    selection.prune();
    // Hat die Auswahl Befehle (ein Gebäude), zeigt die Steintafel sie statt des Baumenüs.
    const hasCommands = renderSelection(this.selectionEl, this.actionsEl, selectionView(world, selection, resources));
    this.actionsEl.hidden = !hasCommands;
    this.buildEl.hidden = hasCommands;
    // Die Auswahl hat sich vielleicht geändert, oder das Feld unter dem
    // Zeiger ist inzwischen leer gesammelt.
    this.updateCursor();
  }

  /**
   * Mauszeiger je nach Lage: im Baumodus ein Feld-Zeiger, mit ausgewähltem
   * Hauptgebäude die Sammelpunkt-Fahne, mit ausgewählten Dorfbewohnern über
   * einem Vorkommen das Werkzeug - Axt für Holz, Spitzhacke für Stein und
   * Gold, Beeren für Beeren. Sonst das Fadenkreuz.
   */
  updateCursor() {
    const { world, selection, placement, pointer, canvas } = this.state;
    let cursor = 'crosshair';
    if (placement.isActive) {
      cursor = 'copy';
    } else if (selection.focused()?.isUnitProducer()) {
      cursor = RALLY_CURSOR;
    } else if (selection.villagers.size > 0 && pointer.tile) {
      // Zeigt der Zeiger auf ein Objekt (Baumkrone, Fels), gilt dessen Feld.
      const { x, y } = pointer.tile;
      const own = world.resourceInfo(x, y);
      const target = world.at(x, y) || (own && own.type !== 'wood') ? null : pointer.object;
      const [tx, ty] = target ? [target.x, target.y] : [x, y];
      const found = world.remainingAt(tx, ty);
      if (found.type && found.amount > 0 && !world.at(tx, ty)) cursor = GATHER_CURSOR[found.type];
    }
    if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
  }
}
