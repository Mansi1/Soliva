// DevPanel.ts
// Die Entwickler-Infos oben links (components/Hud.tsx): Position, Abtastung,
// Zoom, Bildschirm (Pixeldichte), das Tile und was unter dem Zeiger steht, Kamera, Minimap-Zeiger,
// Bilder je Sekunde (Spiel und Minimap) und ob Bäume als Bild (Billboard)
// gezeichnet werden. Texte werden nur gesetzt, wenn sie sich ändern - sonst
// rechnete der Browser je Bild das Layout neu.

import type { TileType } from '../noise';
import { TILE_TYPE_LABEL } from '../map';
import type { Camera } from './Camera';
import { latestRenderStat, type RenderStat } from '../renderStats';
import { gpuTimerAvailable } from '../gpuTimer';

/** So oft (ms) werden die Bilder je Sekunde neu gezählt. */
const FPS_INTERVAL = 500;

const byId = (id: string) => document.getElementById(id)!;

function setText(el: Element, text: string) {
  if (el.textContent !== text) el.textContent = text;
}

export class DevPanel {
  private pos = byId('pos');
  private sampling = byId('sampling');
  private screen = byId('screen');
  private zoom = byId('zoom');
  private tile = byId('tile-info');
  private objectLabel = byId('object-label');
  private objectInfo = byId('resource-info');
  private cursor = byId('cursor-coords');
  private camera = byId('cam-coords');
  private minimap = byId('hover-coords');
  private fps = byId('fps');
  private minimapFps = byId('minimap-fps');
  private minimapFrames = 0;
  private billboards = byId('billboards');
  private cpu = byId('cpu-ms');
  private gpu = byId('gpu-ms');
  private cpuSplit = byId('cpu-split');
  private selectionCost = byId('selection-cost');
  private selectionEach = byId('selection-each');
  /** Sekunde der Render-Stats, die zuletzt gezeigt wurde. */
  private shownStat: RenderStat | undefined;
  private frames = 0;
  private lastFps = performance.now();

  /**
   * Je Bild: Kamera-Position, Abtastung und ob Bäume als Bild gezeichnet
   * wurden; alle FPS_INTERVAL ms die Bilder je Sekunde.
   */
  frame(now: number, camera: Camera, billboards: boolean) {
    setText(this.billboards, billboards ? 'Bild' : '3D');
    const center = `${Math.round(camera.x)}, ${Math.round(camera.y)}`;
    setText(this.pos, center);
    setText(this.camera, center);
    setText(this.sampling, (1 / (camera.tileSize * camera.pixelRatio)).toFixed(4));
    const ratio = Math.round(camera.pixelRatio * 100) / 100;
    setText(this.screen, `${ratio >= 2 ? 'hochauflösend (Retina)' : ratio > 1 ? 'leicht hochauflösend' : 'normal'} ×${ratio} | ${Math.round(camera.tileSize * camera.pixelRatio)} Geräte-px je Tile`);
    this.frames++;
    if (now - this.lastFps >= FPS_INTERVAL) {
      setText(this.fps, String(Math.round((this.frames * 1000) / (now - this.lastFps))));
      setText(this.minimapFps, String(Math.round((this.minimapFrames * 1000) / (now - this.lastFps))));
      this.minimapFrames = 0;
      this.frames = 0;
      this.lastFps = now;
    }
  }

  /**
   * Zeit je Bild aus der letzten abgeschlossenen Sekunde der Render-Stats und
   * was das Ausgewählte kostet: je Objekt gemittelt über alle Objekte seiner
   * Modellart (Instanzen teilen sich die Draw-Calls). `sim` ist der
   * Simulations-Anteil seiner Art (Dorfbewohner, Tiere), geteilt durch ihre Zahl.
   */
  showCosts(sim?: { key: string; count: number }) {
    const s = latestRenderStat();
    if (!s || s === this.shownStat) return;
    this.shownStat = s;
    const ms = (v: number | undefined) => (v ?? 0).toFixed(2);
    setText(this.cpu, `${ms(s.cpuMs)} ms`);
    setText(this.gpu, gpuTimerAvailable() ? `${ms(s.gpuMs)} ms` : 'nicht messbar');
    setText(this.cpuSplit, `Sim ${ms(s.simMs)} · Sammeln ${ms(s.collectMs)} · Zeichnen ${ms(s.renderMs)} · Minimap ${ms(s.minimapMs)}`);
    const n = s.selectedInstances;
    if (!n) {
      setText(this.selectionCost, '-');
      setText(this.selectionEach, '-');
      return;
    }
    // Keine GPU-Zeit je Objekt: Messgrenzen mitten im Bild verfälschen sie (gpuTimer.ts).
    // Der Anteil an den Eckpunkten ist nur ein Anhalt für die Last, keine Zeit: mit
    // 1/5 der Eckpunkte und 1/4 der Pixel brauchte das Bild auf dem M4 noch 3/4 der GPU-Zeit.
    const share = s.vertices ? (100 * (s.selectedVertices ?? 0)) / s.vertices : 0;
    setText(this.selectionCost, `${Math.round(n)} der Art · ${Math.round(s.selectedDrawCalls ?? 0)} Draw-Calls · ${share.toFixed(1)} % der Eckpunkte`);
    const each = [`${Math.round((s.selectedVertices ?? 0) / n)} Eckpunkte`];
    if (sim && sim.count > 0) each.push(`Sim ${((s[sim.key] ?? 0) / sim.count).toFixed(4)} ms`);
    setText(this.selectionEach, each.join(' · '));
  }

  /** Die Minimap wurde gezeichnet - für ihre Bilder je Sekunde. */
  minimapFrame() {
    this.minimapFrames++;
  }

  showZoom(camera: Camera) {
    // Beim weichen Zoomen liegt die Größe zwischen den Stufen - gerundet.
    setText(this.zoom, `${camera.zoomNumber} (${Math.round(camera.tileSize * 10) / 10}px)`);
  }

  /** Tile unter dem Zeiger mit seinen Gelände-Werten - oder keins. */
  showTile(tile?: { x: number; y: number; tileType: TileType; height: number; moisture: number; temperature: number }) {
    setText(this.cursor, tile ? `${tile.x}, ${tile.y}` : '-, -');
    setText(this.tile, tile
      ? `${TILE_TYPE_LABEL[tile.tileType]} | h ${tile.height.toFixed(2)} | Feuchte ${tile.moisture.toFixed(2)} | Temp ${tile.temperature.toFixed(2)}`
      : '-');
  }

  /** Was unter dem Zeiger steht (game/hoverInfo.ts). */
  showObject(label: string, text: string) {
    setText(this.objectLabel, label);
    setText(this.objectInfo, text);
  }

  /** Welt-Tile unter dem Zeiger auf der Minimap - oder keins. */
  showMinimapPointer(tile?: { x: number; y: number }) {
    setText(this.minimap, tile ? `${Math.floor(tile.x)}, ${Math.floor(tile.y)}` : '-, -');
  }
}
