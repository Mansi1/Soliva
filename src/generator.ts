// generator.ts
// Route /generator: der Kartengenerator zum Ausprobieren. Die Karte kommt aus
// demselben Gelände-Shader wie im Spiel (TerrainRenderer), von oben oder schräg;
// rechts stellt man Seed und jeden Wert aus TERRAIN_PARAMS ein
// (components/GeneratorPanel.tsx) und sieht die Welt sofort neu entstehen.
// Ab RESOURCE_OBJECTS_MIN_ZOOM stehen Bäume, Felsen und Beerensträucher darauf -
// aus demselben ResourceField wie im Spiel, mit einem MapGenerator auf denselben
// Reglern, damit der Wald zum Bild passt. Ziehen verschiebt, das Mausrad zoomt in
// Zweierschritten. Das Spiel selbst rechnet weiter mit TERRAIN_PARAMS
// (VERIFIED: nur generator.ts ruft regenerate).

import { TerrainRenderer } from './gl/terrainRenderer';
import { EntityRenderer, type EntityInstance, type StaticBatch } from './gl/entityRenderer';
import { TERRAIN_PALETTE, Terrain } from './map';
import { MapGenerator, type TerrainParams } from './noise';
import { screenToGround, setViewElevation, snapCamera, visibleWorldRect, type IsoView } from './gl/iso';
import { Deposits } from './world/deposits';
import { ResourceField } from './world/resources';
import { RESOURCE_OBJECTS_MIN_ZOOM } from './game/Picker';
import { fromQuery, toQuery } from './generatorParams';
import { DEFAULT_SEED } from './worlds';
import { mountGenerator } from './components/GeneratorPanel';

/** CSS-Pixel je Tile: 1/64 zeigt ganze Kontinente, 32 einzelne Tiles. */
const MIN_ZOOM = 1 / 64;
const MAX_ZOOM = 32;
/** Blickwinkel: senkrecht von oben bzw. schräg wie im Spiel. */
const TOP_DOWN = Math.PI / 2;
const TILTED = Math.PI / 4;
/** So oft (ms) werden die Bilder je Sekunde neu gezählt - wie im Entwickler-Panel. */
const FPS_INTERVAL = 500;

const start = fromQuery(new URLSearchParams(window.location.search), DEFAULT_SEED);
let tilted = false;

const root = document.getElementById('app')!;
const { canvas, fps } = mountGenerator(root, start.seed, start.params, {
  change(seed, params) {
    terrain.regenerate(seed, params);
    entities.setTerrainParams(params);
    // So hoch ragen Berge höchstens unter dem Bildrand ins Bild (schräg).
    terrain.reachZ = params.reliefHeight;
    resources.dispose();
    resources = resourcesFor(seed, params);
    const url = new URL(window.location.href);
    url.search = toQuery(seed, params).toString();
    window.history.replaceState(null, '', url);
  },
  tilt() {
    tilted = !tilted;
    setViewElevation(tilted ? TILTED : TOP_DOWN);
    return tilted;
  },
  billboards(on) {
    entities.billboardBelow = on ? Infinity : 0;
  },
});

const terrain = new TerrainRenderer(canvas, start.seed, TERRAIN_PALETTE);
terrain.regenerate(start.seed, start.params);
terrain.reachZ = start.params.reliefHeight;
const entities = new EntityRenderer(terrain.context);
entities.setTerrainParams(start.params);
// Bäume als Bild wie die Vorgabe des Spiels (settings.ts); im Panel abschaltbar.
// VERIFIED: als Modell ~10 000 Bäume und ~20 Mio. Ecken je Bild bei 4 px je Tile,
// 15 statt 60 Bilder/s auf M1.
entities.billboardBelow = Infinity;
setViewElevation(TOP_DOWN);

/** Die Vorkommen dieser Welt - ohne Spielwelt, also alle unberührt. */
function resourcesFor(seed: string, params: TerrainParams): ResourceField {
  const mapGen = new MapGenerator(seed, params);
  const ground = new Terrain(mapGen, seed);
  return new ResourceField(ground, mapGen, new Deposits(ground));
}
let resources = resourcesFor(start.seed, start.params);
const overlay: EntityInstance[] = [];
const batches: StaticBatch[] = [];

let camX = 0;
let camY = 0;
let zoom = 1 / 4;

let pixelRatio = 1;
function resize() {
  pixelRatio = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * pixelRatio);
  canvas.height = Math.round(window.innerHeight * pixelRatio);
  terrain.pixelRatio = pixelRatio;
}
window.addEventListener('resize', resize);
resize();

const view = (): IsoView => ({ centerX: camX, centerY: camY, tileSize: zoom, width: window.innerWidth, height: window.innerHeight });

// Ziehen: die Weltstelle unter dem Zeiger bleibt unter dem Zeiger.
let grab: { x: number; y: number } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  grab = screenToGround(view(), e.clientX, e.clientY);
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!grab) return;
  const here = screenToGround(view(), e.clientX, e.clientY);
  camX += grab.x - here.x;
  camY += grab.y - here.y;
});
const release = () => { grab = null; };
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.deltaY === 0) return;
  // In Zweierschritten: jeder Maßstab ist ein eigener Gelände-Cache.
  const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * (e.deltaY < 0 ? 2 : 0.5)));
  if (next === zoom) return;
  // Die Stelle unter dem Zeiger bleibt stehen.
  const before = screenToGround(view(), e.clientX, e.clientY);
  zoom = next;
  const after = screenToGround(view(), e.clientX, e.clientY);
  camX += before.x - after.x;
  camY += before.y - after.y;
}, { passive: false });

// Jedes Bild wird gezeichnet - sonst sagte die Anzeige der Bilder je Sekunde nichts.
let frames = 0;
let counted = performance.now();
function frame(now: number) {
  // Eckpunkte des Gitters: schräg wie die kleinste Zoomstufe im Spiel (8 px je Zelle) -
  // VERIFIED: ein Eckpunkt je Tile (cellPixels 0) gab bei 1/4 px je Tile und Retina 5 statt 61 Bilder/s.
  terrain.cellPixels = tilted ? 8 : 64;
  const camera = snapCamera({
    centerX: camX, centerY: camY, pixelsPerTile: zoom * pixelRatio, reliefScale: tilted ? 1 : 0,
  }, canvas.width, canvas.height);
  // Nichts gezeichnet: das letzte Bild bleibt stehen - ohne Bäume darüber.
  if (terrain.render(camera) && zoom >= RESOURCE_OBJECTS_MIN_ZOOM) {
    overlay.length = 0;
    batches.length = 0;
    const visible = visibleWorldRect(view());
    resources.update(visible, camX, camY);
    resources.instances(visible, null, overlay, null, 1, { batcher: entities, out: batches });
    entities.render(overlay, camera, 8 / camera.pixelsPerTile, pixelRatio, false, batches);
  }
  frames++;
  if (now - counted >= FPS_INTERVAL) {
    fps.textContent = `${Math.round((frames * 1000) / (now - counted))} Bilder/s`;
    frames = 0;
    counted = now;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
