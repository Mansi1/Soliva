// ResourceBar.tsx
// Rohstoffleiste oben links wie in AoE2: ein Steinband, darauf je Rohstoff
// ein Symbol mit der Zahl der Sammler unten links und daneben der Vorrat,
// dann die Bevölkerung und ein runder Knopf für untätige Dorfbewohner.
// Speichern und Menü sitzen am Rahmen der Minimap (Hud.tsx).
// Die Symbole zeichnet modelIcons.ts aus den Modellen des Spiels.
// Eine defuss-Komponente: einmal gerendert, danach setzt update() über Refs
// nur Texte, Titel und Klassen - neu gerendert luden die Bilder neu, und die
// Leiste zuckte.

import { createRef, render, type Props, type Ref } from 'defuss';
import './ResourceBar.css';
import type { ResourceKind, Resources } from '../world/catalog';

import { renderIcons, renderVillagerIcons, type IconName } from './modelIcons';
import woodBar from '../icons/wood-bar.png';

export interface ResourceBarState {
  order: ResourceKind[];
  stock: Resources;
  labels: Record<ResourceKind, string>;
  /** Sammler je Rohstoff. */
  gatherers: Record<ResourceKind, number>;
  population: { used: number; cap: number; training: number };
  idle: number;
  villagerLabel: string;
}

/** Refs einer Zelle: die ganze Zelle (Titel), das Symbol, der Vorrat und die Zahl der Sammler. */
interface CellRefs {
  item: Ref<HTMLDivElement>;
  icon: Ref<HTMLImageElement>;
  amount: Ref<HTMLSpanElement>;
  count: Ref<HTMLSpanElement>;
}

const cellRefs = (): CellRefs => ({ item: createRef(), icon: createRef(), amount: createRef(), count: createRef() });

/** Symbol aus einem Modell des Spiels (siehe modelIcons.ts). */
function Icon({ src, iconRef }: { src: string; iconRef: Ref<HTMLImageElement> }) {
  return <img src={src} width="34" height="34" alt="" draggable={false} ref={iconRef} />;
}

interface CellProps extends Props {
  name: IconName;
  src: string;
  refs: CellRefs;
  pop?: boolean;
}

/** Eine Zelle: Symbol mit Sammlerzahl, daneben der Vorrat. */
function Cell({ name, src, refs, pop }: CellProps) {
  return (
    <div class="rb-item" data-key={name} ref={refs.item}>
      <span class="rb-icon">
        <Icon src={src} iconRef={refs.icon} />
        <span class="rb-count" ref={refs.count} />
      </span>
      <span class={pop ? 'rb-amount rb-pop' : 'rb-amount'} ref={refs.amount} />
    </div>
  );
}

export class ResourceBar {
  private cells = new Map<string, CellRefs>();
  private idleButton = createRef<HTMLButtonElement>();
  private idleIcon = createRef<HTMLImageElement>();
  private idleCount = createRef<HTMLSpanElement>();
  private playerColor: [number, number, number];

  /** @param playerColor färbt die Dorfbewohner in den Symbolen */
  constructor(root: HTMLElement, order: ResourceKind[], playerColor: [number, number, number]) {
    root.style.backgroundImage = `url(${woodBar})`;
    for (const key of [...order, 'population']) this.cells.set(key, cellRefs());
    this.playerColor = playerColor;
    const icons = renderIcons(playerColor);
    render(
      <>
        {order.map((r) => <Cell name={r} src={icons[r]} refs={this.cells.get(r)!} />)}
        <Cell name="population" src={icons.population} refs={this.cells.get('population')!} pop />
        {/* Ein Klick wählt einen zufälligen untätigen Dorfbewohner, ein Doppelklick alle (siehe game/ui.ts, data-action). */}
        <button type="button" class="rb-idle" data-action="idle" ref={this.idleButton}
          title="Einen Untätigen auswählen - Doppelklick: alle (Taste .)">
          <Icon src={icons.idle} iconRef={this.idleIcon} />
          <span class="rb-count" ref={this.idleCount} />
        </button>
      </>,
      root,
    );
  }

  /** Neue Spielerfarbe: die Symbole mit Dorfbewohnern neu zeichnen. */
  setPlayerColor(color: [number, number, number]) {
    if (color.every((c, i) => c === this.playerColor[i])) return;
    this.playerColor = color;
    const icons = renderVillagerIcons(color);
    this.cells.get('population')!.icon.current.src = icons.population;
    this.idleIcon.current.src = icons.idle;
  }

  update(s: ResourceBarState) {
    for (const r of s.order) {
      const cell = this.cells.get(r)!;
      setText(cell.amount.current, String(Math.floor(s.stock[r])));
      setText(cell.count.current, String(s.gatherers[r]));
      setTitle(cell.item.current, `${s.labels[r]} - ${s.gatherers[r]} ${s.villagerLabel} sammeln`);
    }
    const pop = s.population;
    const cell = this.cells.get('population')!;
    setText(cell.amount.current, `${pop.used}/${pop.cap}${pop.training > 0 ? ` +${pop.training}` : ''}`);
    cell.amount.current.classList.toggle('full', pop.cap > 0 && pop.used >= pop.cap);
    setText(cell.count.current, String(pop.used));
    setTitle(cell.item.current, `Bevölkerung${pop.training > 0 ? ` - ${pop.training} in Ausbildung` : ''}`);
    this.idleButton.current.classList.toggle('active', s.idle > 0);
    setText(this.idleCount.current, String(s.idle));
  }
}

function setText(el: Element, text: string) {
  if (el.textContent !== text) el.textContent = text;
}
function setTitle(el: HTMLElement, text: string) {
  if (el.title !== text) el.title = text;
}
