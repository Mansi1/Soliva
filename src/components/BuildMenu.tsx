// BuildMenu.tsx
// Baumenü in der Steintafel der Befehlsleiste: je Gebäudetyp ein
// quadratischer Knopf mit dem Modell in Spielerfarbe und der Taste oben
// links; Name, Kosten und Nutzen im Tooltip. Das Feld öffnet ein Untermenü:
// Weizen-, Mais-, Tomaten-, Kartoffel-, Hopfenfeld, Zurück. Einmal gerendert; danach setzt die Klasse
// nur noch, welche Seite zu sehen ist, welcher Knopf gedrückt ist, welche
// man sich leisten kann und - nach einem Farbwechsel - die Bilder.

import { createRef, render, type Ref } from 'defuss';
import './buttons.css';
import { formatDuration } from '../format';
import {
  BUILDINGS, BUILDING_ORDER, CROP_ORDER, CROPS, type BuildingType, type CropType, type ResourceKind, RESOURCE_LABEL,
} from '../world/catalog';
import { buildingIcon } from './modelIcons';
import { cropIcon } from './cropIcons';

type RGB = [number, number, number];

const COST_ORDER: ResourceKind[] = ['wood', 'stone', 'gold', 'food'];

/** Kosten und Nutzen eines Gebäudes für den Tooltip. */
function describe(type: BuildingType): string {
  const def = BUILDINGS[type];
  const cost = COST_ORDER.filter((r) => def.cost[r])
    .map((r) => `${def.cost[r]} ${RESOURCE_LABEL[r]}`)
    .join(', ');
  const use = def.housing > 0
    ? `+${def.housing} Platz`
    : def.storedResources.length > 0
      ? `Lager: ${def.storedResources.map((r) => RESOURCE_LABEL[r]).join('/')}`
      : type === 'farm' ? 'Nahrung'
      : type === 'palisade' || type === 'stone_wall' ? 'je Tile - als Linie ziehen, im Panel ein Tor' : '';
  return [cost || 'kostenlos', use].filter(Boolean).join(' · ');
}

interface ButtonRefs {
  button: Ref<HTMLButtonElement>;
  icon: Ref<HTMLImageElement>;
}

function BuildButton({ type, refs, src, onClick }: { type: BuildingType; refs: ButtonRefs; src: string; onClick: () => void }) {
  const def = BUILDINGS[type];
  return (
    <button type="button" class="cmd-btn" aria-pressed="false" ref={refs.button} onClick={onClick}
      title={`${def.label} (${def.key})\n${describe(type)}`}>
      <img src={src} alt={def.label} draggable={false} ref={refs.icon} />
      <span class="cmd-key">{def.key}</span>
    </button>
  );
}

/** Feld mit einer Frucht im Untermenü - Taste 1, 2, ... */
function CropButton({ crop, index, refs, src, onClick }: {
  crop: CropType; index: number; refs: ButtonRefs; src: string; onClick: () => void;
}) {
  const def = CROPS[crop];
  return (
    <button type="button" class="cmd-btn" aria-pressed="false" ref={refs.button} onClick={onClick}
      title={`${def.label}feld (${index + 1})\n${describe('farm')} · ${def.food} Nahrung, reif in ${formatDuration(def.growTime)}`}>
      <img src={src} alt={`${def.label}feld`} draggable={false} ref={refs.icon} />
      <span class="cmd-key">{index + 1}</span>
    </button>
  );
}

/** Zurück zum Baumenü: Pfeil nach links. */
function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" class="cmd-btn" title="Zurück (Esc)" onClick={onClick}>
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <path d="M26 10 L12 22 L26 34 M13 22 H34" fill="none" stroke="#1a0f07" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M26 10 L12 22 L26 34 M13 22 H34" fill="none" stroke="#f2c45a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span class="cmd-key">Esc</span>
    </button>
  );
}

export interface BuildMenuHooks {
  /** Klick auf den Knopf eines Gebäudetyps - das Feld öffnet stattdessen das Untermenü. */
  build(type: BuildingType): void;
  /** Feld mit dieser Frucht bauen. */
  crop(crop: CropType): void;
  /** Aus dem Untermenü zurück. */
  back(): void;
}

export class BuildMenu {
  private buttons = new Map<BuildingType, ButtonRefs>();
  private crops = new Map<CropType, ButtonRefs>();
  private mainPage = createRef<HTMLDivElement>();
  private farmPage = createRef<HTMLDivElement>();
  private player: RGB;

  constructor(root: HTMLElement, player: RGB, hooks: BuildMenuHooks) {
    this.player = player;
    for (const type of BUILDING_ORDER) this.buttons.set(type, { button: createRef(), icon: createRef() });
    for (const crop of CROP_ORDER) this.crops.set(crop, { button: createRef(), icon: createRef() });
    render(
      <>
        <div class="cmd-page" ref={this.mainPage}>
          {BUILDING_ORDER.map((type) => (
            <BuildButton type={type} refs={this.buttons.get(type)!} src={buildingIcon(type, player)}
              onClick={() => (type === 'farm' ? this.showFarms(true) : hooks.build(type))} />
          ))}
        </div>
        <div class="cmd-page" ref={this.farmPage} hidden>
          {CROP_ORDER.map((crop, i) => (
            <CropButton crop={crop} index={i} refs={this.crops.get(crop)!} src={cropIcon(crop)}
              onClick={() => hooks.crop(crop)} />
          ))}
          <BackButton onClick={() => hooks.back()} />
        </div>
      </>,
      root,
    );
  }

  /** Ist das Untermenü der Felder offen? */
  get farmsOpen(): boolean {
    return !this.farmPage.current.hidden;
  }

  /** Untermenü der Felder zeigen oder zurück zum Baumenü. */
  showFarms(open: boolean) {
    this.farmPage.current.hidden = !open;
    this.mainPage.current.hidden = open;
  }

  /** Welcher Typ gerade gebaut wird (gedrückt), oder keiner - beim Feld auch die Frucht. */
  setPressed(type: BuildingType | null, crop?: CropType) {
    for (const [key, refs] of this.buttons) refs.button.current.setAttribute('aria-pressed', String(key === type));
    for (const [key, refs] of this.crops) {
      refs.button.current.setAttribute('aria-pressed', String(type === 'farm' && key === crop));
    }
  }

  /**
   * Welche Knöpfe gehen - die übrigen sind ausgegraut. `lock`: warum eine Art
   * noch gesperrt ist (Steinmauer vor der Forschung) - steht dann im Tooltip.
   */
  setEnabled(enabled: (type: BuildingType) => boolean, lock: (type: BuildingType) => string | null = () => null) {
    for (const [type, refs] of this.buttons) {
      const reason = lock(type);
      const button = refs.button.current;
      button.disabled = reason !== null || !enabled(type);
      const title = `${BUILDINGS[type].label} (${BUILDINGS[type].key})\n${describe(type)}${reason ? `\n${reason}` : ''}`;
      if (button.title !== title) button.title = title;
    }
    for (const refs of this.crops.values()) refs.button.current.disabled = !enabled('farm');
  }

  /** Neue Spielerfarbe: die Gebäude neu zeichnen. */
  setPlayerColor(player: RGB) {
    if (player.every((c, i) => c === this.player[i])) return;
    this.player = player;
    for (const [type, refs] of this.buttons) refs.icon.current.src = buildingIcon(type, player);
  }
}
