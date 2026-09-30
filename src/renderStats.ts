// renderStats.ts
// Kennzahlen des Zeichnens für die Diagnose: je Sekunde ein kleines Objekt,
// die letzten 30 in einem Ringpuffer. Im Browser (etwa über Playwright) mit
// `getRenderStats()` abzurufen - so lässt sich vor und nach einer Änderung
// vergleichen, woran es liegt, wenn die Bildrate sinkt.
//
// Fest dabei: t (Sekunde seit dem Start), fps (gezeichnete Bilder), frameMs
// und frameMsMax (Abstand der Bilder, Mittel und längster), cpuMs und
// cpuMsMax (Arbeit der Spielschleife je Bild), longTasks und longTaskMs
// (Aufgaben über 50 ms in dieser Sekunde, auch aus Maus-Events - die zählt
// cpuMs nicht mit). Alles aus addRenderStats wird
// über die Sekunde aufsummiert und durch die Zahl der Bilder geteilt - also
// "je Bild". Mehrere Aufrufe im selben Bild zählen zusammen (Draw-Calls).
//
// Derzeit gezählt (nur Hauptansicht, ohne Minimap):
//   simMs, collectMs, renderMs, minimapMs - Anteile von cpuMs (main.ts)
//   pickMs - Sichtstrahl unter Zeiger/Bildmitte (game/Picker.ts), auch aus Events
//   drawCalls - GPU-Aufträge (gl/entityRenderer.ts, gl/terrainRenderer.ts)
//   vertices, terrainVertices - Eckpunkte der Modelle / des Geländegitters
//   mpx - Geräte-Pixel in Millionen (Retina: viermal so viele)
//   frozen - Anteil der Bilder ohne Gelände, weil sein Cache noch fehlt
//   stretched - Anteil der Bilder mit der vorigen Zoomstufe gestreckt, weil die neue noch fehlt
//   holes - Anteil der Bilder, in denen sichtbarer Boden fehlt (Cache nicht fertig, keine vorige Stufe)
//   bakedTiles - vorausgerechnete Gelände-Kacheln; tileReads, tileReadMs - von der GPU
//   zurückgelesene Kacheln und ihre Kosten im Hauptthread (gl/terrainRenderer.ts, tileStore.ts)
//   tileUploads, tileUploadMs - aus dem Speicher gelesene Kacheln, hochgeladen, und ihre Kosten
//   instances, batched - Objekte einzeln je Bild gepackt / aus festen Puffern
//   billboards - Anteil der Bilder mit Bäumen als Bild (0..1)
//   billboardBakes - gebackene Baum- bzw. Blumenarten (je Art alle Blickwinkel, teuer)
//   terrainTexels - neu erzeugtes Gelände; hoch = Cache wird befüllt
//   tileSize, relief - Zoom (CSS-Pixel je Tile) und Reliefstärke
//   idle - Anteil der Bilder, die gedrosselt kamen (Kamera steht, 30 fps gewollt)
//   simVillagersMs, simWildlifeMs - Anteile von simMs (world/world.ts)
//   resourceChunkMs, flowerChunkMs, particleChunkMs, regionMs - Erzeugen der Stücke
//   (fillChunks) und Bauen der Regions-Puffer, Anteile von collectMs (world/)
//   gpuMs - GPU-Zeit der Hauptansicht (gpuTimer.ts, nur mit EXT_disjoint_timer_query_webgl2)
//   selectedInstances, selectedDrawCalls, selectedVertices - die Modellarten
//   des Ausgewählten, alle ihre Objekte im Bild (gl/entityRenderer.ts)
// Steigt frameMs, aber nicht cpuMs, wartet das Bild auf die Grafikkarte.

/** So viele Sekunden bleiben im Puffer. */
const SECONDS = 30;

export type RenderStat = Record<string, number>;

const buffer: RenderStat[] = [];
/** Summen der laufenden Sekunde - null, solange nicht gestartet (etwa in der Galerie). */
let sums: Record<string, number> | null = null;
let started = 0;
let frames = 0;
/** Abstände zwischen Bildern - der erste der Sekunde reicht über ihre Grenze zurück. */
let intervals = 0;
let lastFrame = 0;
let frameMsSum = 0;
let frameMsMax = 0;
let cpuMsSum = 0;
let cpuMsMax = 0;
/** Aufgaben über 50 ms (PerformanceObserver) - auch außerhalb der Schleife, etwa Maus-Events. */
let longTasks = 0;
let longTaskMs = 0;

/** Solange true, zählt addRenderStats nicht - etwa beim Zeichnen der Minimap. */
let muted = false;

/** Wert für `key` zur laufenden Sekunde dazuzählen. */
export function addRenderStats(key: string, value: number) {
  if (sums && !muted) sums[key] = (sums[key] ?? 0) + value;
}

/**
 * `draw` ausführen, ohne dass dessen Draw-Calls, Instanzen usw. mitzählen -
 * die Minimap läuft über dieselben Renderer, gemeint ist aber die Hauptansicht.
 */
export function withoutRenderStats(draw: () => void) {
  muted = true;
  try {
    draw();
  } finally {
    muted = false;
  }
}

/** Ein Bild wurde gezeichnet: `now` wie in requestAnimationFrame, `cpuMs` die Arbeit dafür. */
export function renderStatsFrame(now: number, cpuMs: number) {
  if (!sums) return;
  if (lastFrame > 0) {
    const ms = now - lastFrame;
    frameMsSum += ms;
    intervals++;
    frameMsMax = Math.max(frameMsMax, ms);
  }
  lastFrame = now;
  frames++;
  cpuMsSum += cpuMs;
  cpuMsMax = Math.max(cpuMsMax, cpuMs);
}

/** Liefert die Umstände der Messung (main.ts) - erst beim Abruf, das Fenster kann sich ändern. */
let info: () => Record<string, unknown> = () => ({});

/**
 * Die Umstände, ohne die Messungen nicht vergleichbar sind: GPU,
 * Pixel-Verhältnis, Fenstergröße, Welt, Einstellungen mit Einfluss auf die
 * Bildrate. Einmal je Lauf zu `getRenderStats()` dazulegen.
 */
export function getRenderInfo(): Record<string, unknown> {
  return info();
}

export function setRenderInfo(source: () => Record<string, unknown>) {
  info = source;
}

/** Die letzten bis zu 30 Sekunden, die älteste zuerst - als JSON serialisierbar. */
export function getRenderStats(): RenderStat[] {
  return buffer.map((s) => ({ ...s }));
}

/** Die zuletzt abgeschlossene Sekunde - für das Entwickler-Panel. */
export function latestRenderStat(): RenderStat | undefined {
  return buffer[buffer.length - 1];
}

/** Große Werte ganz, mittlere mit einer Nachkommastelle, unter 1 mit zwei gültigen Ziffern (Simulationszeiten). */
const round = (v: number) => (Math.abs(v) >= 100 ? Math.round(v) : Math.abs(v) >= 1 ? Math.round(v * 10) / 10 : Number(v.toPrecision(2)));

/** Die laufende Sekunde abschließen und in den Puffer legen. */
function close() {
  if (!sums) return;
  const stat: RenderStat = {
    t: Math.round((performance.now() - started) / 1000),
    fps: frames,
    frameMs: round(intervals > 0 ? frameMsSum / intervals : 0),
    frameMsMax: round(frameMsMax),
    cpuMs: round(frames > 0 ? cpuMsSum / frames : 0),
    cpuMsMax: round(cpuMsMax),
    longTasks,
    longTaskMs: round(longTaskMs),
  };
  for (const [key, sum] of Object.entries(sums)) stat[key] = round(frames > 0 ? sum / frames : sum);
  buffer.push(stat);
  if (buffer.length > SECONDS) buffer.shift();
  sums = {};
  frames = 0;
  intervals = 0;
  frameMsSum = 0;
  frameMsMax = 0;
  cpuMsSum = 0;
  cpuMsMax = 0;
  longTasks = 0;
  longTaskMs = 0;
}

/**
 * Sammeln starten: jede Sekunde (setInterval, unabhängig vom Zeichnen) wird
 * abgeschlossen; `getRenderStats` liegt dann auch global auf window.
 */
export function startRenderStats() {
  if (sums) return;
  sums = {};
  started = performance.now();
  setInterval(close, 1000);
  // Nicht in jedem Browser (Safari, Firefox) - dann fehlen die Long Tasks eben.
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        longTasks++;
        longTaskMs += e.duration;
      }
    }).observe({ type: 'longtask' });
  } catch {
    // kein longtask-Eintrag
  }
  Object.assign(globalThis, { getRenderStats, getRenderInfo });
}
