// gpuTimer.ts
// GPU-Zeit der Hauptansicht je Bild über EXT_disjoint_timer_query_webgl2 - in
// die Render-Stats (renderStats.ts) als `gpuMs`. Ohne die Erweiterung
// (Firefox, viele Mobilgeräte) fehlt der Wert.
//
// Eine Messung um das ganze Bild, nicht je Abschnitt: auf dem M4 (ANGLE Metal)
// kostete jede Messgrenze selbst GPU-Zeit (Summe der Abschnitte ~16 statt
// ~12 ms), und die Abschnittswerte sprangen zwischen Läufen bis 130 ms bei
// 60 fps. Die Messung um das ganze Bild stimmt mit der Wartezeit eines
// readPixels danach überein (12-16 ms).
// Die Ergebnisse kommen einige Bilder später an und zählen zu der Sekunde, in
// der sie ankommen.

import { addRenderStats } from './renderStats';

interface TimerExt {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}

let gl: WebGL2RenderingContext | null = null;
let ext: TimerExt | null = null;
const free: WebGLQuery[] = [];
/** Beendete Messungen, die älteste zuerst - GL liefert sie in dieser Reihenfolge. */
const pending: WebGLQuery[] = [];

/** Einmal mit dem Kontext der Hauptansicht. */
export function initGpuTimer(context: WebGL2RenderingContext) {
  gl = context;
  ext = context.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
}

/** Gibt es GPU-Zeiten? */
export function gpuTimerAvailable(): boolean {
  return ext !== null;
}

/** Das Bild der Hauptansicht beginnt - mit gpuFrameEnd abschließen. */
export function gpuFrameBegin() {
  if (!ext) return;
  const query = free.pop() ?? gl!.createQuery()!;
  gl!.beginQuery(ext.TIME_ELAPSED_EXT, query);
  pending.push(query);
}

export function gpuFrameEnd() {
  if (ext) gl!.endQuery(ext.TIME_ELAPSED_EXT);
}

/** Einmal je Bild, nach gpuFrameEnd: fertige Messungen einsammeln. */
export function collectGpuTimes() {
  if (!ext || !gl) return;
  // Ein Sprung der GPU-Uhr (Takt, Energiesparen) macht alle offenen Werte ungültig.
  const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT) as boolean;
  while (pending.length > 0) {
    const query = pending[0];
    if (!disjoint && !gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) break;
    if (!disjoint) addRenderStats('gpuMs', (gl.getQueryParameter(query, gl.QUERY_RESULT) as number) / 1e6);
    pending.shift();
    free.push(query);
  }
}
