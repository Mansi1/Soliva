// music.ts
// Hintergrundmusik: die Stücke aus assets/music/ in gemischter Reihenfolge,
// jedes erst wieder, wenn alle einmal dran waren, mit sanftem Übergang
// zwischen zweien. Beginnt sie im Hauptmenü, kommt immer zuerst Stück 1. Gespielt wird mit <audio>-Elementen - die Dateien werden gestreamt,
// statt ganz in den Speicher dekodiert zu werden.
//
// Browser erlauben Ton erst nach einer Nutzeraktion - die Musik beginnt darum
// beim ersten Klick oder Tastendruck. Steht sie später (abgelehnt, oder die
// Seite kam per Zurück aus dem Browser-Cache und wurde dabei angehalten),
// läuft sie beim nächsten Klick oder Tastendruck weiter.

import { readTrackTags, type TrackTags } from './trackTags';

/** Die Stücke nach ihrer Nummer im Dateinamen (1_..., 2_... bis 19_...). */
const TRACKS: { url: string }[] = Object.entries(
  import.meta.glob('../assets/music/*.mp3', { eager: true, query: '?url', import: 'default' }) as Record<string, string>,
).map(([path, url]) => ({ number: parseInt(path.replace(/^.*\//, ''), 10) || 0, url }))
  .sort((a, b) => a.number - b.number);

/** Sekunden, über die ein Stück aus- und das nächste eingeblendet wird. */
const FADE = 4;

export class Music {
  /** Zwei Spieler: einer läuft, der andere blendet beim Wechsel ein. */
  private players = [new Audio(), new Audio()];
  private current = 0;
  private order: number[] = [];
  private index = -1;
  private started = false;
  /** Mit dem Pause-Knopf angehalten - dann setzt sie kein Klick fort, nur der Knopf. */
  private held = false;
  private level = 0.4;
  private muted = false;
  /** Beginnt die Musik gerade im Hauptmenü? Dann zuerst Stück 1 (main.ts setzt es). */
  inMenu: () => boolean = () => false;
  /** Beginnt ein Stück hörbar: Titel, Interpret, Album, Cover (main.ts zeigt sie an). */
  onStart: (info: TrackTags & { title: string }) => void = () => {};
  /** Die Tags des laufenden Stücks sind gelesen - das Menü zeigt sie dann an. */
  onInfo: () => void = () => {};
  /** Spieler, dessen Stück noch nicht gemeldet ist - beim ersten 'playing'. */
  private announce: HTMLAudioElement | null = null;
  /** ID3-Tags je Stück (Index in TRACKS), einmal gelesen. */
  private tags = new Map<number, Promise<TrackTags>>();
  /** Tags des Stücks, das zuletzt fertig gelesen wurde - für den synchronen Getter info. */
  private shown: TrackTags | null = null;
  /** Laufende Überblendung: Start (performance.now, ms), von welchem zu welchem Spieler. */
  private fade: { start: number; from: HTMLAudioElement; to: HTMLAudioElement } | null = null;

  constructor() {
    for (const p of this.players) {
      p.preload = 'auto';
      p.addEventListener('timeupdate', () => {
        // Kurz vor dem Ende schon das nächste Stück einblenden.
        if (p === this.players[this.current] && !this.fade && p.duration && p.duration - p.currentTime < FADE) this.next();
      });
      p.addEventListener('playing', () => {
        if (p !== this.announce) return;
        this.announce = null;
        // Stumm (Taste M oder Regler auf 0): nichts zu hören, keine Karte.
        const audible = this.target() > 0;
        const track = this.order[this.index];
        void this.read(track).then((info) => {
          // Inzwischen weitergeschaltet: die Tags gehören nicht mehr zum laufenden Stück.
          if (track !== this.order[this.index]) return;
          this.shown = info;
          this.onInfo();
          // Ohne Titel (Tags nicht lesbar) keine Karte.
          if (audible && info.title) this.onStart({ ...info, title: info.title });
        });
      });
      p.addEventListener('ended', () => {
        if (p === this.players[this.current] && !this.fade) this.next();
      });
    }
    // Jede Nutzeraktion - in der Capture-Phase, damit kein stopPropagation
    // sie verschluckt. Safari zählt pointerdown nicht immer als Aktion, click
    // und touchend schon.
    const resume = () => this.resume();
    for (const type of ['pointerdown', 'keydown', 'click', 'touchend']) {
      window.addEventListener(type, resume, { capture: true });
    }
    // Zurück aus dem Browser-Cache: gleich versuchen - ohne neue Nutzeraktion
    // lässt der Browser das oft schon zu, sonst beim nächsten Klick.
    window.addEventListener('pageshow', (e) => {
      if (e.persisted && this.started) this.resume();
    });
    const tick = () => {
      this.updateFade();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /** Beim ersten Mal beginnen, danach das laufende Stück fortsetzen, falls es steht. */
  private resume() {
    if (TRACKS.length === 0) return;
    if (!this.started) {
      this.started = true;
      this.next();
      return;
    }
    if (this.held) return;
    const player = this.players[this.current];
    if (player.paused && player.src) {
      void player.play().catch(() => {
        // Noch nicht erlaubt - beim nächsten Klick erneut.
      });
    }
  }

  /**
   * Tags des laufenden Stücks, oder null vor dem ersten. Wechselt erst, wenn die
   * Tags des neuen Stücks gelesen sind - bis dahin bleibt die alte Anzeige stehen.
   * VERIFIED: zweimal schnell "Weiter" im Browser - die Anzeige sprang direkt vom
   * alten aufs richtige neue Stück, ohne Zwischenstand.
   */
  get info(): TrackTags | null {
    return this.shown;
  }

  /** Tags eines Stücks, je Stück einmal gelesen. Scheitert das Lesen: keine Tags. */
  private read(i: number): Promise<TrackTags> {
    let tags = this.tags.get(i);
    if (!tags) {
      tags = readTrackTags(TRACKS[i].url).catch((e: unknown) => {
        console.warn(`Could not read tags of ${TRACKS[i].url}:`, e);
        return {};
      });
      this.tags.set(i, tags);
    }
    return tags;
  }

  /** Lautstärke 0..1 (Einstellungen). */
  set volume(v: number) {
    this.level = Math.min(1, Math.max(0, v));
    this.applyVolume();
  }

  /** Aus, wenn der Ton aus ist (Taste M) - dann läuft sie leise weiter. */
  set mute(on: boolean) {
    this.muted = on;
    this.applyVolume();
  }

  /** Angehalten (Pause-Knopf)? */
  get paused(): boolean {
    return this.held;
  }

  /** Pause-Knopf: anhalten oder weiterspielen. Vor dem ersten Stück beginnt die Musik. */
  togglePause() {
    if (!this.started) return this.resume();
    this.held = !this.held;
    if (this.held) {
      for (const p of this.players) p.pause();
    } else {
      void this.players[this.current].play().catch(() => {
        // Abgelehnt - resume() versucht es beim nächsten Klick.
      });
    }
  }

  /** Stelle im laufenden Stück und seine Länge in Sekunden (Fortschrittsbalken im Menü); Länge 0, solange unbekannt. */
  get progress(): { time: number; duration: number } {
    const p = this.players[this.current];
    return { time: p.currentTime, duration: Number.isFinite(p.duration) ? p.duration : 0 };
  }

  /** Im laufenden Stück springen (Sekunden). */
  seek(time: number) {
    const p = this.players[this.current];
    if (p.src) p.currentTime = time;
  }

  /** Zum vorigen Stück; beim ersten das laufende von vorn - mit Überblendung. */
  previous() {
    if (!this.started || TRACKS.length === 0) return;
    this.index = Math.max(0, this.index - 1);
    this.play();
  }

  /** Zum nächsten Stück - mit Überblendung. */
  next() {
    if (!this.started || TRACKS.length === 0) return;
    this.index++;
    if (this.index >= this.order.length) {
      // Neu mischen - aber nicht dasselbe Stück zweimal hintereinander.
      const last = this.order[this.order.length - 1];
      this.order = TRACKS.map((_, i) => i).sort(() => Math.random() - 0.5);
      if (this.order.length > 1 && this.order[0] === last) this.order.push(this.order.shift()!);
      // Das allererste Stück im Hauptmenü ist immer Nummer 1 (TRACKS[0]).
      if (last === undefined && this.inMenu()) this.order.unshift(...this.order.splice(this.order.indexOf(0), 1));
      this.index = 0;
    }
    this.play();
  }

  /** Spielt this.order[this.index] und blendet vom laufenden Stück über. */
  private play() {
    this.held = false;
    const from = this.players[this.current];
    this.current = 1 - this.current;
    const to = this.players[this.current];
    to.src = TRACKS[this.order[this.index]].url;
    to.currentTime = 0;
    to.volume = 0;
    this.announce = to;
    void to.play().catch(() => {
      // Abgelehnt (noch keine Nutzeraktion) - resume() versucht es beim nächsten Klick.
    });
    this.fade = { start: performance.now(), from, to };
  }

  private target(): number {
    return this.muted ? 0 : this.level * 0.6;
  }

  private applyVolume() {
    if (!this.fade) this.players[this.current].volume = this.target();
  }

  private updateFade() {
    if (!this.fade) return;
    const t = Math.min(1, (performance.now() - this.fade.start) / (FADE * 1000));
    const v = this.target();
    this.fade.to.volume = v * t;
    this.fade.from.volume = v * (1 - t);
    if (t >= 1) {
      this.fade.from.pause();
      this.fade = null;
    }
  }
}
