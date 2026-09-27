// StartScreen.tsx
// Hauptmenü beim Öffnen der Seite, wie bei einem Spiel: Logo und die Wahl
// zwischen Einzelspieler, Mehrspieler (noch nicht da), Einstellungen,
// Galerie und dem L-System-Werkzeug. Dahinter zieht langsam die Welt vorbei;
// das Spiel selbst steht, bis man unter Einzelspieler weiterspielt, einen
// Spielstand lädt oder neu beginnt - für ein neues Spiel fragt es nach der
// Welt (Seed).

import { createRef, render } from 'defuss';
import './StartScreen.css';
import woodBar from '../icons/wood-bar.png';
import { confirmDialog } from './ConfirmDialog';
import { DEFAULT_SEED, DEMO_SEED, hasProgress, installDemo, isDemo, listSaves, randomSeed, switchWorld, type SaveInfo } from '../worlds';

/** Was das Hauptmenü braucht - main.ts liefert es. */
export interface StartHooks {
  /** Gibt es einen Spielstand zum Weiterspielen? */
  hasSave(): boolean;
  /** Name der Welt (Seed) - steht unten auf der Tafel. */
  world: string;
  /** Mit dem Spielstand weiterspielen. */
  continueGame(): void;
  /** Neues Spiel in der Welt `seed` - ein vorhandener Spielstand dort geht verloren. */
  newGame(seed: string): void;
  /** Den Spielstand der Welt `seed` laden. */
  loadGame(seed: string): void;
  /** Den Spielstand der Welt `seed` löschen. */
  deleteGame(seed: string): void;
  /** Die jetzige Welt speichern - damit die Liste der Spielstände stimmt. */
  save(): void;
  /** Das Einstellungsmenü öffnen. */
  openSettings(): void;
}

type Page = 'main' | 'single' | 'new' | 'load';

function StartButton({ label, hint, onClick, disabled, submit }: {
  label: string; hint?: string; onClick?: () => void; disabled?: boolean; submit?: boolean;
}) {
  return (
    <button type={submit ? 'submit' : 'button'} class="wood-btn start-btn" disabled={disabled} onClick={onClick}>
      {label}
      {hint ? <small>{hint}</small> : null}
    </button>
  );
}

/** "vor 5 Min." - wie lange es her ist, dass gespeichert wurde. */
function ago(ms: number): string {
  const min = Math.floor((Date.now() - ms) / 60_000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.floor(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'gestern' : `vor ${d} Tagen`;
}

/** Ein Spielstand: Welt, was gebaut ist, wann gespeichert - Klick lädt, ✕ löscht. */
function SaveRow({ info, current, onLoad, onDelete }: {
  info: SaveInfo; current: boolean; onLoad: () => void; onDelete: () => void;
}) {
  const details = [
    `${info.buildings} Gebäude`,
    `${info.villagers} Dorfbewohner`,
    info.savedAt !== undefined ? ago(info.savedAt) : null,
  ].filter(Boolean).join(' · ');
  return (
    <div class="start-save">
      <button type="button" class="start-save-load" onClick={onLoad}>
        <span class="start-save-name">{info.seed}{current ? <small> aktuell</small> : null}</span>
        <span class="start-save-info">{details}</span>
      </button>
      <button type="button" class="start-save-delete" title="Spielstand löschen" onClick={onDelete}>✕</button>
    </div>
  );
}

export class StartScreen {
  private root: HTMLDivElement;
  private opened = false;
  private qr: HTMLDivElement;
  private seedInput = createRef<HTMLInputElement>();
  /** Wohin "Zurück" auf der Seite "Neues Spiel" führt - ins Spiel-Menü geöffnet: zum Hauptmenü. */
  private back: Page = 'single';

  constructor(private hooks: StartHooks) {
    this.root = document.createElement('div');
    this.root.id = 'start';
    this.root.hidden = true;
    document.body.appendChild(this.root);
    // Unten rechts: QR-Code zur Webseite - bleibt stehen, die Tafel wechselt.
    this.qr = document.createElement('div');
    document.body.appendChild(this.qr);
    render(
      <a class="start-qr" href="https://mannseicher.com" target="_blank" rel="noopener" title="mannseicher.com">
        <img src="/qr-mannseicher.svg" width="160" height="160" alt="QR-Code zu mannseicher.com" />
        <span>mannseicher.com</span>
      </a>,
      this.qr,
    );
    this.qr.hidden = true;
  }

  private show(page: Page) {
    const h = this.hooks;
    const save = h.hasSave();
    h.save();
    const saves = listSaves();
    // Neu aufbauen statt abgleichen: sonst erbte "Zurück" an zweiter Stelle
    // das disabled von "Mehrspieler".
    this.root.replaceChildren();
    if (page !== 'new') this.back = page;
    render(
      <div class="start-board" style={`background-image:url(${woodBar})`}>
        <img class="start-logo" src="/logo.svg" alt="Soliva" />
        {page === 'main' ? (
          <nav class="start-list">
            <StartButton label="Einzelspieler" onClick={() => this.show('single')} />
            <StartButton label="Mehrspieler" hint="bald" disabled />
            <StartButton label="Einstellungen" onClick={() => h.openSettings()} />
            <StartButton label="Galerie" hint="alle Modelle" onClick={() => window.location.assign('/galerie')} />
            <StartButton label="L-System" hint={'Bäume & Pflanzen'} onClick={() => window.location.assign('/tools/lsystem/')} />
          </nav>
        ) : page === 'single' ? (
          <nav class="start-list">
            <div class="start-title">Einzelspieler</div>
            {save ? <StartButton label="Weiterspielen" onClick={() => this.play(() => h.continueGame())} /> : null}
            <StartButton label="Spiel laden" hint={saves.length > 0 ? String(saves.length) : 'keine'}
              disabled={saves.length === 0} onClick={() => this.show('load')} />
            <StartButton label="Neues Spiel" onClick={() => this.show('new')} />
            <StartButton label="Zurück" onClick={() => this.show('main')} />
          </nav>
        ) : page === 'load' ? (
          <nav class="start-list">
            <div class="start-title">Spiel laden</div>
            <div class="start-saves">
              {saves.map((info) => (
                <SaveRow info={info} current={info.seed === h.world}
                  onLoad={() => this.play(() => h.loadGame(info.seed))}
                  onDelete={() => this.deleteGame(info.seed)} />
              ))}
            </div>
            <StartButton label="Zurück" onClick={() => this.show('single')} />
          </nav>
        ) : (
          <form class="start-list" onSubmit={(e: Event) => { e.preventDefault(); this.newGame(); }}>
            <div class="start-title">Neues Spiel</div>
            <label class="start-field">
              <span>Welt (Seed)</span>
              <span class="start-seed">
                <input ref={this.seedInput} type="text" value={h.world} maxLength={40} spellcheck={false}
                  autocomplete="off" placeholder={DEFAULT_SEED} />
                <button type="button" class="start-dice" title="Zufällige Welt"
                  onClick={() => { this.seedInput.current.value = randomSeed(); }}>🎲</button>
              </span>
              <small>Gleicher Name, gleiche Welt - teile ihn mit Freunden.</small>
            </label>
            <StartButton label="Los geht's" submit />
            <StartButton label="Zurück" onClick={() => this.show(this.back)} />
          </form>
        )}
        <div class="start-footer">Welt <b>{h.world}</b></div>
      </div>,
      this.root,
    );
    if (page === 'new') this.seedInput.current.select();
  }

  private async deleteGame(seed: string) {
    if (!await confirmDialog(`Spielstand der Welt "${seed}" löschen?`, { ok: 'Löschen', danger: true })) return;
    this.hooks.deleteGame(seed);
    // Keiner mehr übrig: zurück zu Einzelspieler.
    this.show(listSaves().length > 0 ? 'load' : 'single');
  }

  private async newGame() {
    const typed = this.seedInput.current.value.trim() || DEFAULT_SEED;
    const seed = isDemo(typed) ? DEMO_SEED : typed;
    if (hasProgress(seed) && !await confirmDialog(`Die Welt "${seed}" hat schon einen Spielstand. Neu beginnen? Er geht verloren.`,
      { ok: 'Neu beginnen', danger: true })) return;
    // Demo: den Spielstand aus der Datei holen und die Seite damit neu laden -
    // auch wenn "Demo" gerade läuft, sonst bliebe die alte Welt im Speicher.
    if (seed === DEMO_SEED && await installDemo()) {
      switchWorld(DEMO_SEED, 'continue');
      return;
    }
    this.play(() => this.hooks.newGame(seed));
  }

  private play(start: () => void) {
    this.close();
    start();
  }

  isOpen(): boolean {
    return this.opened;
  }

  /** @param page 'new' springt gleich zur Wahl der Welt (Neues Spiel aus dem Spiel-Menü). */
  open(page: Page = 'main') {
    this.opened = true;
    this.root.hidden = false;
    document.body.classList.add('title-screen');
    this.qr.hidden = false;
    if (page === 'new') this.back = 'main';
    this.show(page);
  }

  close() {
    this.opened = false;
    this.root.hidden = true;
    document.body.classList.remove('title-screen');
    this.qr.hidden = true;
  }
}
