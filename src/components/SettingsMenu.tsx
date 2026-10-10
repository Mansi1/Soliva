// SettingsMenu.tsx
// Menü als Holztafel in der Bildmitte (Zahnrad an der Rohstoffleiste oder
// F10, wie in AoE2): Spielerfarbe, Pause, Tempo, Ton und Musik, Kamera-Tempo,
// Anzeigen, Grafik, Speichern, Link teilen, zurück ins Hauptmenü. Einmal gerendert; refresh()
// setzt über Refs, was sich auch von außen ändert (Pause, Ton, laufendes
// Musikstück).

import { createRef, render, type Ref } from 'defuss';
import './SettingsMenu.css';
import woodBar from '../icons/wood-bar.png';
import { PLAYER_COLORS } from '../world/catalog';
import { ANIMALS_BELOW_DEFAULT, resetSettings, saveSettings, type Settings } from '../settings';
import { ANIMAL_CLASSES } from '../world/unit';
import { ZOOM_LEVELS } from '../game/Camera';
import { ShortcutList } from './Shortcuts';
import { confirmDialog } from './ConfirmDialog';
import { DEV_OFF } from './Hud';
import type { TrackTags } from '../trackTags';

/** Sekunden als m:ss (Fortschritt des Musikstücks). */
function clock(seconds: number): string {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Was das Menü außer den Einstellungen braucht - main.ts liefert es. */
export interface MenuHooks {
  /** Nach jeder Änderung: Einstellungen anwenden. */
  apply(s: Settings): void;
  soundEnabled(): boolean;
  toggleSound(): void;
  paused(): boolean;
  togglePause(): void;
  /** Das laufende Musikstück: Titel, Interpret, Album, Cover - oder null vor dem ersten Klick. */
  musicInfo(): TrackTags | null;
  /** Stelle und Länge des laufenden Stücks in Sekunden (Länge 0: unbekannt). */
  musicProgress(): { time: number; duration: number };
  seekMusic(time: number): void;
  musicPaused(): boolean;
  toggleMusic(): void;
  previousTrack(): void;
  nextTrack(): void;
  /** Zurück ins Hauptmenü - dort geht es weiter, neu oder mit einem anderen Spielstand. */
  mainMenu(): void;
  /** Den Spielstand jetzt speichern. */
  save(): void;
  /** Link auf Welt, Ansicht und Spielstand. */
  share(): string;
}

/** Spieltempo: langsam (1×) bis extrem schnell, Vorgabe 2.5× - so viel schneller laufen Simulation und Animationen. */
const MAX_SPEED = 10;
/**
 * Wahl "bis Zoom N": Aus oder eine der Zoomstufen (Zoom 1 = weit draußen).
 * Gespeichert wird die Grenze in CSS-Pixeln je Tile, unter der es gilt - die
 * doppelte Pixelzahl der gewählten Stufe (Zoom 1 = 8 px → 16).
 */
function zoomChoices(off: string, upTo: (zoom: string) => string): [number, string, string][] {
  return [
    [0, 'Aus', off],
    ...ZOOM_LEVELS.map((px, i): [number, string, string] => [px * 2, String(i + 1), upTo(i === 0 ? 'Zoom 1' : `Zoom 1 bis ${i + 1}`)]),
  ];
}
/** Bäume als Bild bis zu dieser Zoomstufe - weit draußen sind Bäume nur noch wenige Pixel groß. */
const BILLBOARDS = zoomChoices('Bäume immer als 3D-Modell', (z) => `Bäume als Bild bei ${z}`);
/** Eine Tierart ausblenden bis zu dieser Zoomstufe. */
const HIDE_ANIMALS = zoomChoices('Immer zeigen', (z) => `Ausblenden bei ${z}`);
/** Die Tierarten in der Reihenfolge der Klassen: Kennung und Name. */
const ANIMAL_KINDS = ANIMAL_CLASSES.map((c) => [c.definition.type, c.definition.label] as const);

/** Regler 0..100 % mit der Zahl daneben. */
interface SliderRefs {
  input: Ref<HTMLInputElement>;
  output: Ref<HTMLOutputElement>;
}

const sliderRefs = (): SliderRefs => ({ input: createRef(), output: createRef() });

function Slider({ refs, min, max, step, onInput }: {
  refs: SliderRefs; min: number; max: number; step: number; onInput: (value: number) => void;
}) {
  return (
    <>
      <input type="range" min={String(min)} max={String(max)} step={String(step)} ref={refs.input}
        onInput={(e: Event) => onInput(Number((e.target as HTMLInputElement).value) / 100)} />
      <output ref={refs.output} />
    </>
  );
}

/** Regler mit Stufen (zoomChoices): Aus, Zoom 1 bis 5 - die Wörter darunter stehen an den Stufen. */
function StopSlider({ input, choices, onPick }: {
  input: Ref<HTMLInputElement>; choices: [number, string, string][]; onPick: (value: number) => void;
}) {
  return (
    <span class="menu-stops">
      <input type="range" min="0" max={String(choices.length - 1)} step="1" ref={input}
        onInput={(e: Event) => onPick(choices[Number((e.target as HTMLInputElement).value)][0])} />
      <span class="menu-stop-labels">{choices.map(([, label, hint]) => <span title={hint}>{label}</span>)}</span>
    </span>
  );
}

/** Stellt einen Stufenregler auf `value`; ein Wert zwischen den Stufen zeigt die Stufe darunter. */
function setStop(input: HTMLInputElement, choices: [number, string, string][], value: number) {
  input.value = String(Math.max(0, choices.findLastIndex(([v]) => v <= value)));
}

/** Link in die Zwischenablage, der Knopf bestätigt es kurz; ohne Zwischenablage (kein HTTPS) zum Abschreiben. */
export async function copyLink(button: HTMLButtonElement, url: string) {
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    window.prompt('Link zum Teilen:', url);
    return;
  }
  const label = button.textContent;
  button.textContent = 'Link kopiert ✓';
  setTimeout(() => { button.textContent = label; }, 1500);
}

export class SettingsMenu {
  private root: HTMLDivElement;
  private opened = false;
  private pauseButton = createRef<HTMLButtonElement>();
  private soundButton = createRef<HTMLButtonElement>();
  private billboards = createRef<HTMLInputElement>();
  private animalSliders = new Map(ANIMAL_KINDS.map(([kind]) => [kind, createRef<HTMLInputElement>()]));
  private colorButtons = new Map(Object.keys(PLAYER_COLORS).map((key) => [key, createRef<HTMLButtonElement>()]));
  private volume = sliderRefs();
  private music = sliderRefs();
  private scroll = sliderRefs();
  private edgeSpeed = sliderRefs();
  private speed = sliderRefs();
  private track = createRef<HTMLDivElement>();
  private trackCover = createRef<HTMLImageElement>();
  private seek = createRef<HTMLInputElement>();
  private seekTime = createRef<HTMLSpanElement>();
  private seekDuration = createRef<HTMLSpanElement>();
  private playButton = createRef<HTMLButtonElement>();
  private spotify = createRef<HTMLAnchorElement>();
  /** Schiebt der Spieler gerade am Fortschrittsbalken? Dann setzt ihn die Uhr nicht zurück. */
  private seeking = false;
  /** Uhr für den Fortschrittsbalken, solange das Menü offen ist. */
  private progressTimer = 0;
  private trackTitle = createRef<HTMLDivElement>();
  private trackArtist = createRef<HTMLDivElement>();
  private trackAlbum = createRef<HTMLDivElement>();
  private showHelp = createRef<HTMLInputElement>();
  private showDebug = createRef<HTMLInputElement>();
  private edgeScroll = createRef<HTMLInputElement>();
  private idleFps = createRef<HTMLInputElement>();
  private autoFlatten = createRef<HTMLInputElement>();
  private minimapFps = createRef<HTMLInputElement>();
  private fxaa = createRef<HTMLInputElement>();
  private colorGrading = createRef<HTMLInputElement>();
  private bloom = createRef<HTMLInputElement>();
  /** Nur im Spiel: Hauptmenü, Pause, Speichern, Weiter spielen - aus dem Hauptmenü heraus stattdessen Zurück. */
  private pauseRow = createRef<HTMLDivElement>();
  private gameButtons = createRef<HTMLDivElement>();
  private mainMenuRow = createRef<HTMLDivElement>();
  private backButton = createRef<HTMLDivElement>();
  private title = createRef<HTMLDivElement>();
  private saveButton = createRef<HTMLButtonElement>();
  private savedTimer = 0;
  private shareButton = createRef<HTMLButtonElement>();

  constructor(private settings: Settings, private hooks: MenuHooks) {
    this.root = document.createElement('div');
    this.root.id = 'menu';
    this.root.hidden = true;
    document.body.appendChild(this.root);
    // Klick neben die Tafel schließt das Menü.
    this.root.addEventListener('mousedown', (e) => {
      if (e.target === this.root) this.close();
    });
    render(this.board(), this.root);
    this.refresh();
  }

  private board() {
    const act = (fn: () => void) => () => {
      fn();
      this.refresh();
    };
    return (
      <div class="menu-board" role="dialog" aria-label="Menü" style={`background-image:url(${woodBar})`}>
        <img class="menu-logo" src={`${import.meta.env.BASE_URL}logo.svg`} alt="Soliva" />
        <div class="menu-title" ref={this.title}>Menü</div>
        <div class="menu-top" ref={this.mainMenuRow}>
          <button type="button" class="wood-btn menu-btn" onClick={() => this.mainMenu()}>← Hauptmenü</button>
        </div>
        <section>
          <h3>Spieler</h3>
          <div class="menu-row">
            <span>Farbe</span>
            <span class="menu-colors">
              {Object.entries(PLAYER_COLORS).map(([key, c]) => (
                <button type="button" title={c.label} style={`background:${c.color.toRgbString()}`}
                  ref={this.colorButtons.get(key)!} onClick={() => this.change({ playerColor: key })} />
              ))}
            </span>
          </div>
        </section>
        <section>
          <h3>Spiel</h3>
          <div class="menu-row" ref={this.pauseRow}>
            <span>Pause <small>F3</small></span>
            <button type="button" class="wood-btn menu-btn" ref={this.pauseButton} onClick={act(() => this.hooks.togglePause())} />
          </div>
          <div class="menu-row">
            <span>Geschwindigkeit</span>
            <Slider refs={this.speed} min={100} max={MAX_SPEED * 100} step={50} onInput={(v) => this.change({ speed: v })} />
          </div>
        </section>
        <section>
          <h3>Ton</h3>
          <div class="menu-row">
            <span>Ton <small>M</small></span>
            <button type="button" class="wood-btn menu-btn" ref={this.soundButton} onClick={act(() => this.hooks.toggleSound())} />
          </div>
          <div class="menu-row">
            <span>Lautstärke</span>
            <Slider refs={this.volume} min={0} max={100} step={5} onInput={(v) => this.change({ volume: v })} />
          </div>
          <div class="menu-row">
            <span>Musik</span>
            <Slider refs={this.music} min={0} max={100} step={5} onInput={(v) => this.change({ music: v })} />
          </div>
          <div class="menu-player">
            <div class="menu-track" ref={this.track}>
              {/* Fester Rahmen: beim Wechsel springt die Zeile nicht, auch solange das Cover fehlt.
                  VERIFIED: im Browser nach "Weiter" 10-mal in 1 s geprüft - das Cover war nie verborgen. */}
              <div class="menu-track-art">
                <img class="menu-track-cover" ref={this.trackCover} alt="" hidden />
              </div>
              <div class="menu-track-text">
                <div class="menu-track-title" ref={this.trackTitle} />
                <div class="menu-track-meta" ref={this.trackArtist} />
                <div class="menu-track-meta" ref={this.trackAlbum} />
              </div>
            </div>
            <div class="menu-progress">
              <span ref={this.seekTime}>0:00</span>
              <input type="range" class="menu-seek" ref={this.seek} min="0" max="0" step="1" value="0" aria-label="Fortschritt"
                onInput={() => {
                  this.seeking = true;
                  this.seekTime.current.textContent = clock(Number(this.seek.current.value));
                }}
                onChange={() => {
                  this.seeking = false;
                  this.hooks.seekMusic(Number(this.seek.current.value));
                }} />
              <span ref={this.seekDuration}>0:00</span>
            </div>
            {/* Knöpfe wie bei einem Musikspieler: zurück, Wiedergabe/Pause, weiter */}
            <div class="menu-player-buttons">
              <button type="button" class="wood-btn menu-btn menu-icon" title="Voriges Stück" aria-label="Voriges Stück"
                onClick={act(() => this.hooks.previousTrack())}>
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <path fill="currentColor" d="M19 5.5v13a1 1 0 0 1-1.5.86l-10-6.5a1 1 0 0 1 0-1.72l10-6.5A1 1 0 0 1 19 5.5zM7 5H4.5v14H7z" />
                </svg>
              </button>
              <button type="button" class="wood-btn menu-btn menu-icon menu-play" ref={this.playButton}
                onClick={act(() => this.hooks.toggleMusic())}>
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <path class="play" fill="currentColor" d="M7 4.8v14.4a1 1 0 0 0 1.5.86l11-7.2a1 1 0 0 0 0-1.72l-11-7.2A1 1 0 0 0 7 4.8z" />
                  <path class="pause" fill="currentColor" d="M6 4h4v16H6zM14 4h4v16h-4z" />
                </svg>
              </button>
              <button type="button" class="wood-btn menu-btn menu-icon" title="Nächstes Stück" aria-label="Nächstes Stück"
                onClick={act(() => this.hooks.nextTrack())}>
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <path fill="currentColor" d="M5 5.5v13a1 1 0 0 0 1.5.86l10-6.5a1 1 0 0 0 0-1.72l-10-6.5A1 1 0 0 0 5 5.5zM17 5h2.5v14H17z" />
                </svg>
              </button>
              {/* Album bei Spotify - nur, wenn das Stück einen Link hat (WXXX "Spotify", trackTags.ts). */}
              <a class="wood-btn menu-btn menu-icon menu-spotify" ref={this.spotify} target="_blank" rel="noopener noreferrer"
                title="Album bei Spotify" hidden>
                Spotify
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                  <path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
                </svg>
              </a>
            </div>
          </div>
        </section>
        <section>
          <h3>Steuerung</h3>
          <div class="menu-row">
            <span>Kamera-Tempo</span>
            <Slider refs={this.scroll} min={50} max={200} step={10} onInput={(v) => this.change({ scroll: v })} />
          </div>
          <label class="menu-row">
            <span>Mit der Maus am Rand scrollen</span>
            <input type="checkbox" ref={this.edgeScroll}
              onInput={(e: Event) => this.change({ edgeScroll: (e.target as HTMLInputElement).checked })} />
          </label>
          <div class="menu-row">
            <span>Tempo am Rand</span>
            <Slider refs={this.edgeSpeed} min={25} max={300} step={25} onInput={(v) => this.change({ edgeSpeed: v })} />
          </div>
          <label class="menu-row" title="Verdeckt ein Berg die Bildmitte, legt sich das Gelände von selbst flach - wie mit gehaltener Leertaste.">
            <span>Gelände automatisch flachlegen</span>
            <input type="checkbox" ref={this.autoFlatten}
              onInput={(e: Event) => this.change({ autoFlatten: (e.target as HTMLInputElement).checked })} />
          </label>
          <details class="menu-keys-box">
            <summary>Tastenkürzel</summary>
            <ShortcutList />
          </details>
        </section>
        <section>
          <h3>Anzeige</h3>
          <label class="menu-row">
            <span>Tastenhilfe <small>I</small></span>
            <input type="checkbox" ref={this.showHelp}
              onInput={(e: Event) => this.change({ showHelp: (e.target as HTMLInputElement).checked })} />
          </label>
          <label class="menu-row">
            <span>Legende und Entwickler-Infos <small>P</small></span>
            <input type="checkbox" ref={this.showDebug}
              onInput={(e: Event) => this.change({ showDebug: (e.target as HTMLInputElement).checked })} />
          </label>
        </section>
        <section>
          <h3>Grafik</h3>
          <div class="menu-row">
            <span>Teile zeichnen</span>
          </div>
          {/* Dieselben Schalter wie im Entwickler-Panel, nur umgekehrt: Haken = wird gezeichnet (data-on, main.ts). */}
          <div class="menu-off">
            {DEV_OFF.map(([key, label, hint]) => (
              <label title={hint}><input type="checkbox" data-on={key} /> {label}</label>
            ))}
          </div>
          <p class="menu-hint">
            Zum Messen, was ein Teil kostet - die Entwickler-Infos (P) zeigen die Bildzeit und die Reihenfolge.
            Ohne Haken wird der Teil nicht gezeichnet; was er umfasst, zeigt der Hinweis unter dem Zeiger.
            Vorausrechnen: der Boden wird im Hintergrund für die Nachbarschaft und die nächste Zoomstufe
            berechnet. Gilt bis zum Neuladen, wie im Entwickler-Panel.
          </p>
          <div class="menu-row">
            <span title="Bäume als flaches Bild statt als 3D-Modell - man sieht kaum einen Unterschied, das Spiel läuft aber viel flüssiger.">Bäume als Bild bis Zoom</span>
            <StopSlider input={this.billboards} choices={BILLBOARDS} onPick={(billboards) => this.change({ billboards })} />
          </div>
          <p class="menu-hint">
            Bis zu dieser Zoomstufe (1 = weit draußen, 5 = ganz nah) werden Bäume als flaches Bild statt als
            3D-Modell gezeichnet - das Spiel läuft viel flüssiger, man sieht kaum einen Unterschied. Bäume, an
            denen gearbeitet wird, bleiben 3D-Modelle; als Bild wiegen sie nicht im Wind.
            {import.meta.env.DEV ? ' Entwicklermodus: die Bilder liegen in tools/export/out/billboards/.' : ''}
          </p>
          <details class="menu-keys-box">
            <summary title="Weit draußen sind Tiere kaum zu sehen - ausgeblendet läuft das Spiel flüssiger. Sie leben trotzdem weiter.">Tiere ausblenden bis Zoom</summary>
            {ANIMAL_KINDS.map(([kind, name]) => (
              <div class="menu-row">
                <span>{name}</span>
                <StopSlider input={this.animalSliders.get(kind)!} choices={HIDE_ANIMALS}
                  onPick={(value) => this.change({ animalsBelow: { ...this.settings.animalsBelow, [kind]: value } })} />
              </div>
            ))}
            <p class="menu-hint">
              Bis zu dieser Zoomstufe wird die Tierart nicht gezeichnet - die Tiere leben trotzdem weiter.
            </p>
          </details>
          <label class="menu-row">
            <span>Im Stillstand 30 FPS</span>
            <input type="checkbox" ref={this.idleFps}
              onInput={(e: Event) => this.change({ idleFps: (e.target as HTMLInputElement).checked })} />
          </label>
          <p class="menu-hint">
            Steht die Kamera eine Sekunde still, zeichnet das Spiel nur noch 30 Bilder je Sekunde - schont Akku
            und Lüfter. Beim Verschieben, Zoomen oder Drehen sofort wieder volle Bildrate.
          </p>
          <label class="menu-row">
            <span>Minimap mit 10 FPS</span>
            <input type="checkbox" ref={this.minimapFps}
              onInput={(e: Event) => this.change({ minimapFps: (e.target as HTMLInputElement).checked })} />
          </label>
          <p class="menu-hint">
            Die Minimap wird nur 10-mal je Sekunde gezeichnet - sie bewegt sich langsam, man sieht es kaum.
            Aus: so oft wie das Spiel.
          </p>
          <label class="menu-row">
            <span>Kantenglättung (FXAA)</span>
            <input type="checkbox" ref={this.fxaa}
              onInput={(e: Event) => this.change({ fxaa: (e.target as HTMLInputElement).checked })} />
          </label>
          <label class="menu-row">
            <span>Farbgebung</span>
            <input type="checkbox" ref={this.colorGrading}
              onInput={(e: Event) => this.change({ colorGrading: (e.target as HTMLInputElement).checked })} />
          </label>
          <label class="menu-row">
            <span>Glühen (Bloom)</span>
            <input type="checkbox" ref={this.bloom}
              onInput={(e: Event) => this.change({ bloom: (e.target as HTMLInputElement).checked })} />
          </label>
          <p class="menu-hint">
            Effekte über dem fertigen Bild: Kantenglättung gegen Treppenstufen, Farbgebung mit etwas mehr Kontrast,
            leicht warm und zum Rand dunkler, Glühen um helle Stellen. Alle aus: das Bild geht ohne Umweg auf
            den Schirm - Regen läuft trotzdem.
          </p>
        </section>
        <section>
          <div class="menu-row">
            <span>Alle Einstellungen</span>
            <button type="button" class="wood-btn menu-btn" onClick={() => this.reset()}>Zurücksetzen</button>
          </div>
        </section>
        <div class="menu-footer" ref={this.gameButtons}>
          <button type="button" class="wood-btn menu-btn" ref={this.saveButton} onClick={() => this.save()}>Speichern</button>
          <button type="button" class="wood-btn menu-btn" ref={this.shareButton} onClick={() => copyLink(this.shareButton.current, this.hooks.share())}>Link teilen</button>
          <button type="button" class="wood-btn menu-btn" onClick={() => this.close()}>Weiter spielen <small>Esc</small></button>
        </div>
        <div class="menu-footer menu-footer-end" ref={this.backButton} hidden>
          <button type="button" class="wood-btn menu-btn" onClick={() => this.close()}>Zurück <small>Esc</small></button>
        </div>
      </div>
    );
  }

  /** Speichern - der Knopf bestätigt es kurz. */
  private save() {
    this.hooks.save();
    const button = this.saveButton.current;
    button.textContent = 'Gespeichert ✓';
    clearTimeout(this.savedTimer);
    this.savedTimer = window.setTimeout(() => { button.textContent = 'Speichern'; }, 1500);
  }

  /** Zurück ins Hauptmenü - nach Rückfrage; der Stand wird vorher gespeichert (main.ts). */
  private async mainMenu() {
    if (!await confirmDialog('Zurück zum Hauptmenü? Das Spiel wird gespeichert.', { ok: 'Zum Hauptmenü' })) return;
    this.close();
    this.hooks.mainMenu();
  }

  isOpen(): boolean {
    return this.opened;
  }

  /** @param fromTitle aus dem Hauptmenü: ohne Hauptmenü, Pause, Speichern und Weiter spielen - nur Zurück. */
  open(fromTitle = false) {
    this.opened = true;
    this.root.hidden = false;
    this.pauseRow.current.hidden = fromTitle;
    this.gameButtons.current.hidden = fromTitle;
    this.mainMenuRow.current.hidden = fromTitle;
    this.backButton.current.hidden = !fromTitle;
    this.title.current.textContent = fromTitle ? 'Einstellungen' : 'Menü';
    this.refresh();
    clearInterval(this.progressTimer);
    this.progressTimer = window.setInterval(() => this.updateProgress(), 250);
  }

  close() {
    this.opened = false;
    this.root.hidden = true;
    clearInterval(this.progressTimer);
  }

  /** Fortschrittsbalken nachführen - außer während der Spieler daran schiebt. */
  private updateProgress() {
    if (this.seeking) return;
    const { time, duration } = this.hooks.musicProgress();
    const seek = this.seek.current;
    seek.max = String(Math.floor(duration));
    seek.value = String(Math.floor(time));
    seek.disabled = duration === 0;
    this.seekTime.current.textContent = clock(time);
    this.seekDuration.current.textContent = clock(duration);
  }

  toggle() {
    if (this.opened) this.close();
    else this.open();
  }

  /** Zustände neu anzeigen, die sich auch von außen ändern (Pause, Ton, Musik). */
  refresh() {
    const s = this.settings;
    this.pauseButton.current.textContent = this.hooks.paused() ? 'Fortsetzen' : 'Anhalten';
    this.soundButton.current.textContent = this.hooks.soundEnabled() ? 'An' : 'Aus';
    setStop(this.billboards.current, BILLBOARDS, s.billboards);
    for (const [kind, ref] of this.animalSliders) setStop(ref.current, HIDE_ANIMALS, s.animalsBelow[kind] ?? ANIMALS_BELOW_DEFAULT);
    for (const [key, ref] of this.colorButtons) ref.current.classList.toggle('active', key === s.playerColor);
    const slider = (refs: SliderRefs, v: number) => {
      refs.input.current.value = String(Math.round(v * 100));
      refs.output.current.textContent = `${Math.round(v * 100)} %`;
    };
    slider(this.volume, s.volume);
    slider(this.music, s.music);
    slider(this.scroll, s.scroll);
    slider(this.edgeSpeed, s.edgeSpeed);
    this.speed.input.current.value = String(Math.round(s.speed * 100));
    this.speed.output.current.textContent = s.speed <= 1 ? 'Langsam' : s.speed >= MAX_SPEED ? 'Extrem schnell' : `${s.speed}×`;
    const track = this.hooks.musicInfo();
    this.trackTitle.current.textContent = track ? track.title ?? 'Unbekanntes Stück' : 'Musik beginnt mit dem ersten Klick';
    this.trackArtist.current.textContent = track?.artist ?? '';
    this.trackAlbum.current.textContent = track?.album ?? '';
    this.spotify.current.hidden = !track?.link;
    if (track?.link) this.spotify.current.href = track.link;
    const cover = this.trackCover.current;
    cover.hidden = !track?.cover;
    if (track?.cover && cover.getAttribute('src') !== track.cover) cover.src = track.cover;
    const paused = this.hooks.musicPaused() || !track;
    this.playButton.current.classList.toggle('paused', paused);
    this.playButton.current.title = paused ? 'Abspielen' : 'Pause';
    this.playButton.current.setAttribute('aria-label', this.playButton.current.title);
    this.updateProgress();
    this.showHelp.current.checked = s.showHelp;
    this.showDebug.current.checked = s.showDebug;
    this.edgeScroll.current.checked = s.edgeScroll;
    this.idleFps.current.checked = s.idleFps;
    this.autoFlatten.current.checked = s.autoFlatten;
    this.minimapFps.current.checked = s.minimapFps;
    this.fxaa.current.checked = s.fxaa;
    this.colorGrading.current.checked = s.colorGrading;
    this.bloom.current.checked = s.bloom;
  }

  /** Alle Einstellungen auf ihre Vorgaben - nach Rückfrage. */
  private async reset() {
    if (!await confirmDialog('Alle Einstellungen zurücksetzen?', { ok: 'Zurücksetzen' })) return;
    resetSettings(this.settings);
    this.change({});
  }

  private change(patch: Partial<Settings>) {
    Object.assign(this.settings, patch);
    saveSettings(this.settings);
    this.hooks.apply(this.settings);
    this.refresh();
  }
}
