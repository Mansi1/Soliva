// GalleryOverlay.tsx
// Die Seite der Galerie (/galerie): das Canvas, links die Liste der Modelle
// (nach Gruppen), unten die Animationen des gewählten Modells und Knöpfe zum
// Knöpfe fürs Drahtgitter, den Boden und die Texturen samt Zahl der Eckpunkte - dazu für die Übersicht aller Modelle die Beschriftungen. Einmal
// gerendert; gallery.ts setzt über die zurückgegebenen Funktionen, was
// gewählt ist, und über die Elemente, wo die Beschriftungen stehen.

import { createRef, render, type Ref } from 'defuss';
import './GalleryOverlay.css';

/** Ein Eintrag der Liste: Gruppe, Name und seine Animationen (Namen). */
/** Die Achsen des Dreh-Gizmos und ihre Farben wie in Blender. */
const AXES = ['X', 'Y', 'Z'];
/** Beschriftung des Gitter-Knopfs je Stufe. */
const WIRE_LABELS = ['Gitter', 'Gitter + Modell', 'Nur Gitter'];

/** Länge der Zeitleiste in Sekunden - danach beginnt die Animation von vorn. */
export const TIMELINE_SECONDS = 30;

export const AXIS_COLORS = ['#e04848', '#5cc85c', '#4a78e8'];
/** Radius der Ringe im Gizmo, CSS-Pixel (das Feld ist 140 breit). */
export const GIZMO_RADIUS = 58;

export interface GalleryItem {
  group: string;
  label: string;
  animations: string[];
  /** Zusatz zur gewählten Animation, z. B. "Abriss" bei Gebäuden - ein- und ausschaltbar. */
  extras?: string[];
}

export interface GalleryHooks {
  /** Modell gewählt - Index in `items`, oder -1 für die Übersicht aller. */
  select(index: number): void;
  /** Animation des gewählten Modells gewählt. */
  animate(index: number): void;
  /** Zusatz (Abriss) ein- oder ausschalten. */
  extra(): void;
  /** Drahtgitter (weiß) weiterschalten: aus, über dem Modell, nur Gitter - liefert die neue Stufe 0..2. */
  wireframe(): number;
  /** Stück Boden unter den Modellen ein oder aus - liefert, ob es jetzt an ist. */
  ground(): boolean;
  /** Texturen aus oder an - liefert, ob sie jetzt aus sind. */
  plain(): boolean;
  /** Dreh-Gizmo: das Modell um Achse 0 (x), 1 (y) oder 2 (z, oben) um `radians` weiterdrehen. */
  turn(axis: number, radians: number): void;
  /** Zurück in den Ursprung: ungedreht, Kamera neu eingepasst. */
  reset(): void;
  /** Zoomen um diesen Faktor (> 1 hinein). */
  zoom(factor: number): void;
  /** Animation abspielen oder anhalten - liefert, ob sie jetzt läuft. */
  play(): boolean;
  /** Zu dieser Zeit der Animation springen (Sekunden). */
  seek(seconds: number): void;
  /** Um so viele Einzelbilder vor (> 0) oder zurück (< 0) - hält an. */
  step(frames: number): void;
  /** Ring unter dem Zeiger oder in der Hand (0 x, 1 y, 2 z), -1 = keiner - er leuchtet heller. */
  hover(axis: number): void;
}

export interface GalleryElements {
  canvas: HTMLCanvasElement;
  /** Übersicht: je Stück seine Beschriftung, in der Reihenfolge von `labels`. */
  labels: HTMLDivElement[];
  /** Übersicht: je Reihe ihr Titel, in der Reihenfolge von `titles`. */
  titles: HTMLDivElement[];
  /** Zeigt, was gewählt ist: Modell (-1 = Übersicht), Animation und ob der Zusatz läuft. */
  show(item: number, animation: number, extra: boolean): void;
  /** Die Dateien der gezeigten Modelle (src/models) unter dem Namen. */
  files(names: readonly string[]): void;
  /** Gezeichnete Eckpunkte des gezeigten Modells. */
  vertices(count: number): void;
  /** Stand der Animation für die Zeitleiste: Zeit (Sekunden) und ob sie läuft. */
  time(seconds: number, playing: boolean): void;
  /**
   * Dreh-Gizmo in der Ecke: je Achse der Ring als Punkte auf dem Bildschirm,
   * um (0, 0), Radius 1 = GIZMO_RADIUS Pixel - so, wie die Kamera gerade
   * schaut. Die Ringe selbst zeichnet gallery.ts als 3D-Modell in das
   * gelieferte Feld (CSS-Pixel); hier liegen nur die unsichtbaren Greifflächen.
   * null blendet ihn aus.
   */
  gizmo(rings: { x: number; y: number }[][] | null): DOMRect | null;
}

/**
 * Rendert die Galerie-Seite in `root`.
 * @param labels, titles Beschriftungen der Übersicht
 */
export function mountGallery(root: HTMLElement, items: GalleryItem[], labels: string[], titles: string[], hooks: GalleryHooks): GalleryElements {
  const canvas = createRef<HTMLCanvasElement>();
  const overview = createRef<HTMLDivElement>();
  const labelRefs: Ref<HTMLDivElement>[] = labels.map(() => createRef());
  const titleRefs: Ref<HTMLDivElement>[] = titles.map(() => createRef());
  const allRef = createRef<HTMLButtonElement>();
  const stage = createRef<HTMLDivElement>();
  const heading = createRef<HTMLDivElement>();
  const fileLine = createRef<HTMLDivElement>();
  const chips = createRef<HTMLDivElement>();
  const countLine = createRef<HTMLDivElement>();
  const playButton = createRef<HTMLButtonElement>();
  const timeline = createRef<HTMLInputElement>();
  const timeLabel = createRef<HTMLSpanElement>();
  /** Solange der Regler gezogen wird, setzt ihn nicht die Uhr. */
  let scrubbing = false;
  const wireButton = createRef<HTMLButtonElement>();
  const groundButton = createRef<HTMLButtonElement>();
  const plainButton = createRef<HTMLButtonElement>();
  const gizmoSvg = createRef<SVGSVGElement>();
  /** Stand des Gizmos aus gallery.ts - Mitte und Umlaufsinn der Ringe. */
  const gizmoPanel = createRef<HTMLDivElement>();
  let windings = [1, 1, 1];
  const gizmoCaption = createRef<HTMLDivElement>();
  /** Welcher Ring hervorgehoben ist: beim Überfahren und solange gezogen wird. */
  let dragging = false;
  const highlight = (axis: number) => {
    legend.forEach((l, i) => l.classList.toggle('hot', i === axis));
    hooks.hover(axis);
    gizmoCaption.current.textContent = axis < 0 ? 'Ring ziehen zum Drehen' : `Drehen um ${AXES[axis]}`;
  };

  // Ziehen an einem Ring: der Winkel des Zeigers um die Mitte, je nach
  // Umlaufsinn des Rings vorwärts oder rückwärts.
  const startTurn = (e: PointerEvent, axis: number) => {
    e.preventDefault();
    dragging = true;
    highlight(axis);
    const box = gizmoSvg.current.getBoundingClientRect();
    const [mx, my] = [box.left + box.width / 2, box.top + box.height / 2];
    const angle = (ev: PointerEvent) => Math.atan2(ev.clientY - my, ev.clientX - mx);
    let last = angle(e);
    const move = (ev: PointerEvent) => {
      const a = angle(ev);
      let d = a - last;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      last = a;
      hooks.turn(axis, d * windings[axis]);
    };
    const up = (ev: PointerEvent) => {
      dragging = false;
      // Zeiger noch über einem Ring? Dann bleibt der hervorgehoben.
      const over = (ev.target as Element | null)?.closest?.('.gal-axis-hit');
      highlight(over ? Number(over.getAttribute('data-axis')) : -1);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const groups = [...new Set(items.map((it) => it.group))];
  render(
    <>
      <canvas ref={canvas} class="gal-canvas" />
      {/* Übersicht: Beschriftungen, gesetzt je Bild von gallery.ts */}
      {/* Dreh-Gizmo in der Ecke: X rot, Y grün, Z blau - Ziehen an einem Ring dreht um seine Achse. */}
      <div class="gal-gizmo" ref={gizmoPanel}>
        {/* Die Ringe zeichnet gallery.ts als 3D-Modell darunter ins Canvas - hier nur, wo man sie greift. */}
        <svg ref={gizmoSvg} viewBox="-70 -70 140 140" width="140" height="140">
          {AXIS_COLORS.map((_, axis) => <polyline class="gal-axis-hit" data-axis={String(axis)} />)}
        </svg>
        <div class="gal-gizmo-legend">
          {AXIS_COLORS.map((color, axis) => <span style={`--axis:${color}`}>{AXES[axis]}</span>)}
        </div>
        <div class="gal-gizmo-caption" ref={gizmoCaption}>Ring ziehen zum Drehen</div>
        <div class="gal-gizmo-buttons">
          <button type="button" class="wood-btn" title="Hinein zoomen" onClick={() => hooks.zoom(1.25)}>+</button>
          <button type="button" class="wood-btn" title="Heraus zoomen" onClick={() => hooks.zoom(0.8)}>−</button>
          <button type="button" class="wood-btn" title="Zurück in den Ursprung: ungedreht, neu eingepasst" onClick={() => hooks.reset()}>Reset</button>
        </div>
      </div>
      <div class="gal-labels" ref={overview}>
        {labels.map((text, i) => <div ref={labelRefs[i]} class="gal-label">{text}</div>)}
        {titles.map((text, i) => <div ref={titleRefs[i]} class="gal-row-title">{text}</div>)}
      </div>

      <nav class="gal-list">
        <div class="gal-brand">
          <b>Soliva</b> · Galerie
          <a href={import.meta.env.BASE_URL}>zum Spiel</a>
        </div>
        <button type="button" class="gal-item gal-all" ref={allRef} onClick={() => hooks.select(-1)}>Alle auf einmal</button>
        {/* Flach, Gruppe für Gruppe - verschachtelte Fragmente rendert defuss nicht. */}
        {groups.flatMap((group) => [
          <div class="gal-group">{group}</div>,
          ...items.flatMap((it, i) => it.group === group
            ? [<button type="button" class="gal-item" data-index={String(i)} onClick={() => hooks.select(i)}>{it.label}</button>]
            : []),
        ])}
      </nav>

      {/* Unten: Name, Animationen, Ansicht - nur für ein einzelnes Modell. */}
      <div class="gal-stage" ref={stage}>
        <div class="gal-heading" ref={heading} />
        <div class="gal-file" ref={fileLine} />
        <div class="gal-file" ref={countLine} />
        <div class="gal-chips" ref={chips} />
        {/* Zeitleiste wie bei einem Video: abspielen, anhalten, spulen, Bild für Bild. */}
        <div class="gal-timeline">
          <button type="button" class="wood-btn" title="Ein Bild zurück" onClick={() => hooks.step(-1)}>|◀</button>
          <button type="button" class="wood-btn" ref={playButton} title="Abspielen / Anhalten (Leertaste)"
            onClick={() => { playButton.current.textContent = hooks.play() ? '❚❚' : '▶'; }}>❚❚</button>
          <button type="button" class="wood-btn" title="Ein Bild vor" onClick={() => hooks.step(1)}>▶|</button>
          <input type="range" min="0" max={String(TIMELINE_SECONDS)} step="0.01" value="0" ref={timeline}
            onPointerDown={() => { scrubbing = true; }}
            onPointerUp={() => { scrubbing = false; }}
            onInput={() => hooks.seek(Number(timeline.current.value))} />
          <span class="gal-time" ref={timeLabel}>0,00 s</span>
        </div>
        <div class="gal-rotate">
          <button type="button" class="wood-btn gal-chip" ref={wireButton} title="Weißes Drahtgitter: aus, über dem Modell, nur Gitter"
            onClick={() => {
              const mode = hooks.wireframe();
              wireButton.current.classList.toggle('active', mode > 0);
              wireButton.current.textContent = WIRE_LABELS[mode];
            }}>{WIRE_LABELS[0]}</button>
          <button type="button" class="wood-btn gal-chip" ref={groundButton} title="Stück Boden unter den Modellen ein/aus"
            onClick={() => groundButton.current.classList.toggle('active', hooks.ground())}>Boden</button>
          <button type="button" class="wood-btn gal-chip" ref={plainButton} title="Texturen aus/an - nur die Materialfarben"
            onClick={() => plainButton.current.classList.toggle('active', hooks.plain())}>Ohne Texturen</button>
        </div>
      </div>
      <div class="gal-help">Ziehen dreht in alle Richtungen · rechts ziehen verschiebt · Mausrad zoomt · Q/E drehen · W/S neigen · ↑/↓ Modell · ←/→ Animation</div>
    </>,
    root,
  );

  // Die Ringe des Gizmos - wie die Knöpfe der Liste nicht über Refs (siehe unten).
  const hits = [...root.querySelectorAll<SVGPolylineElement>('.gal-axis-hit')];
  const legend = [...root.querySelectorAll<HTMLSpanElement>('.gal-gizmo-legend span')];
  hits.forEach((hit, axis) => {
    hit.addEventListener('pointerdown', (e) => startTurn(e as PointerEvent, axis));
    hit.addEventListener('pointerenter', () => dragging || highlight(axis));
    hit.addEventListener('pointerleave', () => dragging || highlight(-1));
  });

  // Die Knöpfe der Liste - Refs in der verschachtelten Liste setzt defuss nicht.
  const itemButtons = [...root.querySelectorAll<HTMLButtonElement>('.gal-item[data-index]')];
  const show = (item: number, animation: number, extra: boolean) => {
    allRef.current.classList.toggle('active', item < 0);
    for (const b of itemButtons) b.classList.toggle('active', Number(b.dataset.index) === item);
    overview.current.hidden = item >= 0;
    stage.current.hidden = item < 0;
    if (item < 0) return;
    const it = items[item];
    heading.current.textContent = `${it.group} · ${it.label}`;
    chips.current.replaceChildren();
    render(
      <>
        {it.animations.map((name, i) => (
          <button type="button" class={i === animation ? 'wood-btn gal-chip active' : 'wood-btn gal-chip'} onClick={() => hooks.animate(i)}>{name}</button>
        ))}
        {/* Zusatz, abgesetzt: gilt für die gewählte Variante. */}
        {(it.extras ?? []).map((name) => (
          <button type="button" class={extra ? 'wood-btn danger gal-chip gal-extra active' : 'wood-btn danger gal-chip gal-extra'} onClick={() => hooks.extra()}
            title={`${name} der gewählten Variante ein/aus`}>{extra ? `■ ${name}` : `▶ ${name}`}</button>
        ))}
      </>,
      chips.current,
    );
    itemButtons.find((b) => Number(b.dataset.index) === item)?.scrollIntoView({ block: 'nearest' });
  };

  return {
    canvas: canvas.current,
    labels: labelRefs.map((r) => r.current),
    titles: titleRefs.map((r) => r.current),
    show,
    files: (names) => {
      const text = names.join(' · ');
      if (fileLine.current.textContent !== text) fileLine.current.textContent = text;
    },
    gizmo: (ringPoints) => {
      gizmoPanel.current.hidden = !ringPoints;
      if (!ringPoints) return null;
      ringPoints.forEach((pts, i) => {
        hits[i].setAttribute('points', pts.map((p) => `${(p.x * GIZMO_RADIUS).toFixed(1)},${(p.y * GIZMO_RADIUS).toFixed(1)}`).join(' '));
        // Umlaufsinn auf dem Bildschirm (y nach unten): > 0 im Uhrzeigersinn - daraus die Drehrichtung beim Ziehen.
        let area = 0;
        for (let k = 0; k + 1 < pts.length; k++) area += pts[k].x * pts[k + 1].y - pts[k + 1].x * pts[k].y;
        windings[i] = area >= 0 ? 1 : -1;
      });
      return gizmoSvg.current.getBoundingClientRect();
    },
    time: (seconds, playing) => {
      if (!scrubbing) timeline.current.value = seconds.toFixed(2);
      timeLabel.current.textContent = `${seconds.toFixed(2).replace('.', ',')} s`;
      const icon = playing ? '❚❚' : '▶';
      if (playButton.current.textContent !== icon) playButton.current.textContent = icon;
    },
    vertices: (count) => {
      const text = `${count.toLocaleString('de-DE')} Eckpunkte · ${Math.round(count / 3).toLocaleString('de-DE')} Dreiecke`;
      if (countLine.current.textContent !== text) countLine.current.textContent = text;
    },
  };
}
