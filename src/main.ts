
import { MapGenerator } from './noise';
import {
  MAX_RELIEF,
  TILT_DEFAULT,
  TILT_MAX,
  TILT_MIN,
  centerFor,
  groundToWorld,
  setViewElevation,
  setViewRotation,
  type IsoView,
  viewElevation,
  viewRotation,
  viewZScreen,
  visibleWorldRect,
  worldToGround,
} from './gl/iso';
import {
  MapRenderer,
  MiniMap,
  Terrain,
} from './map';
import type { EntityInstance, StaticBatch } from './gl/entityRenderer';
import { setAnimationSpeed, setAnimationsPaused } from './gl/entityRenderer';
import {
  player,
  PLAYER_COLORS,
} from './world/catalog';
import { World } from './world/world';
import { worldInstances } from './world/render';
import { Selection } from './game/Selection';
import { Camera, MAX_ZOOM, ZOOM_LEVELS } from './game/Camera';
import { GameUi } from './game/ui';
import { steerCamera } from './game/cameraControl';
import { startPoint } from './game/startPoint';
import { FixedStep, Interval } from './game/timing';
import { Pointer } from './game/Pointer';
import { DevPanel } from './game/DevPanel';
import { Keyboard } from './game/keyboard';
import { MouseInput, type CanvasPoint } from './game/MouseInput';
import { PlayerActions } from './game/actions';
import { Placement } from './game/Placement';
import { Picker, RESOURCE_OBJECTS_MIN_ZOOM } from './game/Picker';
import { hoverDescription, type HoverTarget } from './game/hoverInfo';
import { Compass, directionAt, isDirection, northAngle, rotateToFace } from './game/Compass';
import { TurnAnimation } from './game/TurnAnimation';
import { Ground } from './game/Ground';
import { Lighting } from './game/Lighting';
import { LandscapeParticles } from './world/particles';
import { worldSounds } from './game/worldSounds';
import { minimapDots, placementOverlay, selectionOverlay } from './game/overlay';
import { mountGame } from './components/Hud';
import { copyLink, SettingsMenu } from './components/SettingsMenu';
import { StartScreen } from './components/StartScreen';
import { showTrack } from './components/TrackCard';
import { ANIMALS_BELOW_DEFAULT, loadSettings, saveSettings } from './settings';
import { ResourceField, type OnScreen } from './world/resources';
import { FlowerField } from './world/flowers';
import { Sound } from './audio';
import { addRenderStats, renderStatsFrame, setRenderInfo, startRenderStats, withoutRenderStats } from './renderStats';
import { movePass, type Pass } from './layers';
import { collectGpuTimes, initGpuTimer } from './gpuTimer';
import { Music } from './music';
import { currentSeed, deleteSave, gameUrl, shareUrl, switchWorld, takeStartRequest } from './worlds';
import { initMouseLock } from './mouseLock';

// Erst Spielfeld-Canvas und Oberfläche (components/Hud.tsx) - danach werden
// ihre Teile hier über ihre IDs gefunden.
mountGame(document.getElementById('app')!);
// Im Vollbild die Maus einsperren, sonst kommt oben die Menüleiste von macOS.
initMouseLock();

const canvas = document.getElementById('game') as HTMLCanvasElement;
const minimapCanvas = document.getElementById('minimap') as HTMLCanvasElement;
const boxEl = document.getElementById('select-box')!;
/** Entwickler-Infos oben links (game/DevPanel.ts). */
const devPanel = new DevPanel();
/** Wo der Mauszeiger auf dem Spielfeld steht (game/Pointer.ts). */
const pointer = new Pointer();

/** Zoom beim Start: CSS-Pixel je Tile. */
const DEFAULT_ZOOM = 32;
/** Kamera: Bildmitte, Zoomstufe, Sichtfläche (game/Camera.ts). */
const camera = new Camera(ZOOM_LEVELS[(gameUrl?.zoom ?? 0) - 1] ?? DEFAULT_ZOOM);

function applyCanvasSize() {
  camera.fitWindow();

  // Gezeichnet wird in echten Bildschirmpixeln, angezeigt in CSS-Pixeln.
  // Sonst rendert der Browser das Canvas klein und skaliert es hoch.
  canvas.width = Math.round(camera.width * camera.pixelRatio);
  canvas.height = Math.round(camera.height * camera.pixelRatio);
  canvas.style.width = `${camera.width}px`;
  canvas.style.height = `${camera.height}px`;
}

function resize() {
  // Die Kamera beschreibt die Bildmitte - die bleibt beim Größenwechsel stehen.
  applyCanvasSize();

  renderer.pixelRatio = camera.pixelRatio;
  minimap.setPixelRatio(camera.pixelRatio);
}

applyCanvasSize();

// Schalter zum Prüfen (?festesLicht, ?regen, ?ohneEffekte) - gelesen, bevor die Adresse aufgeräumt wird.
const startParams = new URLSearchParams(window.location.search);
const seed = currentSeed();
const mapGen = new MapGenerator(seed);
const terrain = new Terrain(mapGen, seed);
const world = new World(terrain, seed);

const { x: startX, y: startY } = gameUrl?.at ?? startPoint(world, terrain, seed);
// Holzfäller arbeiten am liegenden Stamm - wie lang der ist, weiß die Darstellung.
world.treeLength = (x, y) => resources.treeLengthAt(x, y);
const resources = new ResourceField(terrain, mapGen);
/** Blumen als 3D-Objekte, nah heran (world/flowers.ts). */
const flowers = new FlowerField(terrain, mapGen);
/** Glitzern über Gold und Stein, Insekten über der Wiese (world/particles.ts). */
const landscape = new LandscapeParticles(terrain);
const sound = new Sound();
/** Hintergrundmusik aus assets/music/ - der Ton-Schalter (M) gilt auch für sie. */
const music = new Music();
music.mute = !sound.enabled;
// Im Hauptmenü beginnt sie mit Stück 1 (start ist weiter unten angelegt).
music.inMenu = () => start.isOpen();
// Beginnt ein Stück, kurz Cover und Titel einblenden.
music.onStart = showTrack;
// Tags gelesen: das Menü zeigt Cover und Infos des laufenden Stücks.
music.onInfo = () => menu.refresh();


/** Aktuell zum Bauen ausgewählter Typ, oder null im Ansichtsmodus. */
/** Baumodus: welche Art gebaut wird, Felder säen, Bauplatz-Prüfung (game/Placement.ts). */
const placement = new Placement(world);

// --- Auswahl ---------------------------------------------------------------

/** Was ausgewählt ist: Dorfbewohner, Gebäude oder ein Vorkommen (game/Selection.ts). */
const selection = new Selection(world);

/** Die Oberfläche im Spiel: Leisten, Baumenü, Auswahl-Panel, Hinweise, Mauszeiger (game/ui.ts). */
const ui = new GameUi({ world, selection, placement, pointer, resources, sound, canvas }, {
  toggleMenu: () => menu.toggle(),
  save: () => world.save(),
  selectIdle: (which) => actions.selectIdle(which),
  train: (count) => actions.trainVillagers(count),
  cancelTraining: (index) => actions.cancelTraining(index),
  demolish: () => actions.demolishSelected(),
  dismiss: () => actions.dismissWorker(),
  setFieldCrop: (crop) => actions.setFieldCrop(crop),
  focusSelection: () => actions.focusSelection(),
}, player.color.toRGB());

// --- Einstellungen und Menü ------------------------------------------------

const settings = loadSettings();
// Blickwinkel wie beim letzten Mal - vor dem ersten Bild.
setViewElevation(clampTilt(((gameUrl?.tilt ?? settings.tilt) * Math.PI) / 180));
/** Angehalten (F3 oder Menü): die Welt steht, Kamera und Auswahl gehen weiter. */
let paused = false;
const pausedEl = document.getElementById('paused')!;

function applySettings() {
  sound.volume = settings.volume;
  music.volume = settings.music;
  player.color = (PLAYER_COLORS[settings.playerColor] ?? PLAYER_COLORS.green).color;
  ui.setPlayerColor(player.color.toRGB());
  // Mühlenflügel und Fahnen laufen mit der Spielgeschwindigkeit.
  setAnimationSpeed(settings.speed);
  document.getElementById('ui')!.hidden = !settings.showHelp;
  document.getElementById('debug')!.hidden = !settings.showDebug;
}

// × an Tastenhilfe und Entwickler-Infos sowie die Tasten I und P: ein- und
// ausblenden wie im Menü - und so gespeichert.
function setPanels(patch: Partial<typeof settings>) {
  Object.assign(settings, patch);
  saveSettings(settings);
  applySettings();
  menu.refresh();
}
document.getElementById('help-close')!.addEventListener('click', () => setPanels({ showHelp: false }));
document.getElementById('debug-close')!.addEventListener('click', () => setPanels({ showDebug: false }));

function togglePause() {
  paused = !paused;
  pausedEl.hidden = !paused;
  // Beim Neuladen wieder angehalten, wenn es jetzt angehalten ist.
  settings.paused = paused;
  saveSettings(settings);
  // Auch Mühlenflügel und Fahnen halten an.
  setAnimationsPaused(paused);
  menu.refresh();
}

const menu = new SettingsMenu(settings, {
  apply: applySettings,
  soundEnabled: () => sound.enabled,
  toggleSound: () => toggleSound(),
  paused: () => paused,
  togglePause,
  musicInfo: () => music.info,
  musicProgress: () => music.progress,
  seekMusic: (time) => music.seek(time),
  musicPaused: () => music.paused,
  toggleMusic: () => music.togglePause(),
  previousTrack: () => music.previous(),
  nextTrack: () => music.next(),
  // Vorher speichern - im Hauptmenü steht der Stand dann unter Weiterspielen.
  mainMenu: () => {
    world.save();
    start.open();
  },
  save: () => world.save(),
  share: () => stateLink(),
});

/** Link auf Welt, Ansicht und Spielstand (worlds.ts shareUrl) - Menü und Entwickler-Infos. */
function stateLink() {
  return shareUrl(seed, {
    x: camera.x, y: camera.y, zoom: camera.zoomNumber, rotation: viewRotation(), tilt: (viewElevation() * 180) / Math.PI,
  }, world.toSave());
}
const shareButton = document.getElementById('share-link') as HTMLButtonElement;
shareButton.addEventListener('click', () => copyLink(shareButton, stateLink()));
// Drahtgitter des Geländes, Stufen wie in der Galerie (GalleryOverlay.tsx).
const WIRE_LABELS = ['Gitter', 'Gitter + Gelände', 'Nur Gitter'];
let terrainWire = 0;
const wireButton = document.getElementById('terrain-wire') as HTMLButtonElement;
wireButton.addEventListener('click', () => {
  terrainWire = (terrainWire + 1) % WIRE_LABELS.length;
  renderer.terrainWire = terrainWire;
  wireButton.textContent = WIRE_LABELS[terrainWire];
});
function startNewGame() {
  world.reset();
  ui.clearSelection();
  if (paused) togglePause();
  ui.refreshResources();
  goToStart();
}

/** Kamera zurück an den Start - im Hauptmenü ist sie weitergezogen. */
function goToStart() {
  const home = startPoint(world, terrain, seed);
  camera.moveTo(home.x, home.y);
}

/** Hauptmenü beim Öffnen der Seite; bis man spielt, steht die Welt. */
const start = new StartScreen({
  hasSave: () => world.hasTownCenter() || world.villagers.length > 0,
  world: seed,
  continueGame: goToStart,
  // Dieselbe Welt beginnt hier von vorn, eine andere nach dem Neuladen.
  newGame: (s) => (s === seed ? startNewGame() : switchWorld(s, 'new')),
  loadGame: (s) => (s === seed ? goToStart() : switchWorld(s, 'continue')),
  // Die jetzige Welt steht im Speicher und würde sich neu speichern - also leeren.
  deleteGame: (s) => (s === seed ? startNewGame() : deleteSave(s)),
  save: () => world.save(),
  openSettings: () => menu.open(true),
});

// --- Ton -------------------------------------------------------------------

const soundButton = document.getElementById('sound')!;

function updateSoundButton() {
  soundButton.classList.toggle('muted', !sound.enabled);
  soundButton.title = sound.enabled ? 'Ton aus (M)' : 'Ton an (M)';
}

function toggleSound() {
  sound.toggle();
  music.mute = !sound.enabled;
  updateSoundButton();
  menu.refresh();
}

soundButton.addEventListener('click', toggleSound);
updateSoundButton();
applySettings();

// Geräusche aus der Welt - nur, was man sieht (game/worldSounds.ts).
world.onEvent = worldSounds(sound, camera, (x, y) => ground.heightAt(x, y));

// --- Flaches Gelände ----------------------------------------------------------

/** Flachgelegt per Leertaste oder Knopf am Reif - bleibt, bis man eins davon erneut drückt. */
let flatOn = false;
const flatButton = document.getElementById('flat')!;

function toggleFlat() {
  flatOn = !flatOn;
  flatButton.classList.toggle('on', flatOn);
  flatButton.setAttribute('aria-pressed', String(flatOn));
}

flatButton.addEventListener('click', toggleFlat);

// --- Kompass ---------------------------------------------------------------

/** Windrose um die Minimap (game/Compass.ts) - die Buchstaben außen vor den Spitzen (Hud.tsx). */
const compass = new Compass(document.getElementById('compass')!, 155, (dir) => faceDirection(dir));
// Die Pfeile unter der Minimap drehen um eine Vierteldrehung: was rechts bzw. links liegt, kommt nach oben.
document.getElementById('turn-left')!.addEventListener('click', () => faceDirection(directionAt(1)));
document.getElementById('turn-right')!.addEventListener('click', () => faceDirection(directionAt(-1)));

/** Übergang beim Drehen (game/TurnAnimation.ts). */
const turnAnimation = new TurnAnimation(
  canvas,
  document.getElementById('turn-snapshot') as HTMLCanvasElement,
  document.querySelector<HTMLElement>('#minimap-frame .minimap-spin')!,
  document.getElementById('compass')!,
);
/**
 * Gewünschte Blickrichtung - gedreht wird erst in loop(), direkt nach dem
 * Zeichnen: dann steht das alte Bild noch im Puffer und lässt sich für den
 * Übergang festhalten.
 */
let pendingFacing: string | null = null;

function faceDirection(dir: string) {
  pendingFacing = dir;
}

/** Dreht die Ansicht so, dass die Richtung `dir` nach oben zeigt. */
function applyFacing(dir: string) {
  // Gedreht wird um die Stelle, die man in der Bildmitte sieht - mit ihrer
  // Geländehöhe. Um den Punkt auf Meereshöhe gedreht, wanderte ein Dorf auf
  // einem Hügel beim Drehen aus dem Bild.
  const pivot = focusPoint();
  rotateToFace(dir);
  keepFocus(pivot);
  compass.update();
  // Die Blickrichtung bleibt beim Neuladen.
  settings.facing = dir;
  saveSettings(settings);
  // Unter dem Zeiger liegt jetzt eine andere Stelle.
  pointer.tile = null;
  refreshPointer();
  placement.invalidate();
}



// Der Speicherstand liegt im localStorage, je Welt einer.
window.addEventListener('beforeunload', () => world.save());

const renderer = new MapRenderer(canvas, seed, camera.tileSize, camera.pixelRatio);
// Zellgröße des Geländegitters: der Schieber steht für 2^n Tiles - der
// Renderer rundet die Zelle ohnehin auf eine Zweierpotenz (cellSize).
const cellSlider = document.getElementById('terrain-cell') as HTMLInputElement;
const cellLabel = document.getElementById('terrain-cell-size') as HTMLElement;
const showCell = () => {
  const tiles = renderer.terrainCellTiles;
  cellLabel.textContent = tiles < 1 ? `1/${1 / tiles} Tile` : `${tiles} Tile${tiles > 1 ? 's' : ''}`;
};
cellSlider.value = String(Math.log2(renderer.terrainCellTiles));
showCell();
cellSlider.addEventListener('input', () => {
  renderer.terrainCellTiles = 2 ** Number(cellSlider.value);
  showCell();
});
// Abschalter (MapRenderer.off): im Entwickler-Panel die Ebenen und im Menü
// unter Grafik "Teile zeichnen" (data-on, Haken = wird gezeichnet). Alle
// zeigen denselben Stand.
const offBoxes = document.querySelectorAll<HTMLInputElement>('input[data-on]');
const offKey = (box: HTMLInputElement) => box.dataset.on as keyof typeof renderer.off;
const showOff = (box: HTMLInputElement) => {
  box.checked = !renderer.off[offKey(box)];
};
for (const box of offBoxes) {
  showOff(box);
  box.addEventListener('change', () => {
    renderer.off[offKey(box)] = !box.checked;
    offBoxes.forEach(showOff);
  });
}
// Reihenfolge der Durchgänge (MapRenderer.order): die Pfeile im Entwickler-Panel
// tauschen mit dem Nachbarn, die Liste folgt.
const layerList = document.getElementById('dev-layers') as HTMLOListElement;
layerList.addEventListener('click', (e) => {
  const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-move]');
  const item = button?.closest<HTMLLIElement>('li[data-pass]');
  if (!button || !item) return;
  if (!movePass(renderer.order, item.dataset.pass as Pass, Number(button.dataset.move) as -1 | 1)) return;
  for (const pass of renderer.order) layerList.append(layerList.querySelector(`li[data-pass=${pass}]`)!);
});
const minimap = new MiniMap(minimapCanvas, seed, camera.pixelRatio);
/**
 * Sonne und Wetter (game/Lighting.ts). Mit ?festesLicht in der Adresse steht
 * die Sonne wie früher - zum Vergleichen von Screenshots; mit ?regen regnet
 * es ohne Pause - zum Ansehen des Regens.
 */
const lighting = startParams.has('festesLicht') ? null : new Lighting(seed);
const alwaysRain = startParams.has('regen');
renderer.postEnabled = !startParams.has('ohneEffekte');

camera.moveTo(startX, startY);


/** Gelände, wie man es sieht, und sein Abgleich mit dem Shader (game/Ground.ts). */
const ground = new Ground(mapGen, world, renderer, camera);
world.groundAt = (x, y, step) => ground.groundAt(x, y, step);
renderer.groundHeight = (x, y) => ground.coarseGroundAt(x, y);

/** Was unter dem Zeiger liegt: Welt-Punkt, Tile, Dorfbewohner, Vorkommen (game/Picker.ts). */
/** Tierarten weit draußen ausgeblendet (Einstellung animalsBelow). */
const hideAnimal = (kind: string) => camera.tileSize < (settings.animalsBelow[kind] ?? ANIMALS_BELOW_DEFAULT);
const picker = new Picker(world, resources, camera, ground, () => simulation.blend, flowers,
  { animal: (kind) => !hideAnimal(kind), flowers: () => renderer.flowerObjects });

/** Was der Spieler tut: auswählen, Befehle, bauen, ausbilden, abreißen (game/actions.ts). */
const actions = new PlayerActions({ world, camera, selection, placement, picker, sound }, {
  hint: (text) => ui.hint(text),
  refreshSelection: () => ui.refreshSelection(),
  refreshResources: () => ui.refreshResources(),
  refreshPointer,
  setPlacing: (type) => ui.setPlacing(type),
  get rallyPicking() {
    return ui.rallyPicking;
  },
  setRallyPicking: (on) => ui.setRallyPicking(on),
  lookAt,
  flyTo,
});

/** Die Maus über dem Spielfeld (game/MouseInput.ts) - hier, was sie im Spiel bedeutet. */
const mouse = new MouseInput(canvas, boxEl, {
  // Im Baumodus setzt ein Klick das Gebäude; Felder weiter beim Ziehen (move).
  press: (p) => {
    // Sammelpunkt-Schalter an: der Klick setzt den Punkt, statt auszuwählen.
    if (ui.rallyPicking) {
      actions.setRallyAt(p);
      return true;
    }
    if (!placement.isActive) return false;
    const { x, y } = picker.tile(p.x, p.y);
    placement.sowing = placement.placingType === 'farm';
    actions.placeAt(x, y);
    return true;
  },
  release: () => {
    placement.sowing = false;
  },
  click: (p, add, double) => actions.clickSelect(p.x, p.y, add, double),
  box: (a, b, add) => actions.boxSelect(a.x, a.y, b.x, b.y, add),
  rightClick: (p) => actions.rightClick(p),
  pan: (dx, dy) => camera.panPixels(dx, dy),
  panEnd: () => ui.updateCursor(),
  zoom: (steps, p) => zoomBy(steps, p.x, p.y),
  tilt: (dy) => tiltBy(dy * TILT_PER_PIXEL),
  turn: (direction) => faceDirection(directionAt(direction === 1 ? -1 : 1)),
  move: (p, buttons) => {
    const tileChanged = updateHoveredTile(p.x, p.y);
    // Felder markieren: jedes überstrichene Tile, auf dem gesät werden kann.
    const tile = pointer.tile;
    if (tileChanged && tile && placement.sowing && placement.placingType === 'farm' && (buttons & 1) && world.sowable(tile.x, tile.y)) {
      actions.placeAt(tile.x, tile.y, true);
    }
  },
  leave: () => {
    pointer.clear();
    devPanel.showTile();
    updateHoverInfo();
  },
});

window.addEventListener('resize', resize);



// --- Neigung ---------------------------------------------------------------

/**
 * Der Punkt, auf den man schaut (Welt, mit Geländehöhe bei vollem Relief):
 * beim Neigen, Drehen und Flachlegen bleibt er genau in der Bildmitte.
 * Bestimmt wird er einmal und gilt, bis die Kamera anders bewegt wird
 * (Verschieben, Zoomen, Minimap). Je Bild neu gepickt, wanderte er mit jedem
 * kleinen Rechenfehler weiter - und flacher geneigt verdeckt ein Berg im
 * Vordergrund die Stelle, dann spränge er auf dessen Hang.
 */
let focus: { x: number; y: number; height: number; cameraX: number; cameraY: number } | null = null;

/** Der festgehaltene Punkt, wenn die Kamera seitdem nicht anders bewegt wurde - sonst null. */
function heldFocus() {
  return focus && focus.cameraX === camera.x && focus.cameraY === camera.y ? focus : null;
}

function focusPoint() {
  if (!heldFocus()) {
    const p = picker.point(camera.centerX, camera.centerY);
    focus = { x: p.x, y: p.y, height: ground.groundAt(p.x, p.y), cameraX: camera.x, cameraY: camera.y };
  }
  return focus!;
}

/** Legt den Punkt wieder genau in die Bildmitte (bei der jetzigen Reliefstärke) - und merkt sich, dass die Kamera nun so steht. */
function keepFocus(f: NonNullable<typeof focus>) {
  camera.centerOn(f.x, f.y, f.height * renderer.relief);
  f.cameraX = camera.x;
  f.cameraY = camera.y;
}

// --- Gelände im Weg --------------------------------------------------------

/**
 * Gelände automatisch flachlegen, wie mit gehaltener Leertaste, wenn man in
 * einen Berg schaut: der Sichtstrahl durch die Bildmitte trifft bei vollem
 * Relief einen Hang, tritt dahinter wieder aus und trifft weiter hinten
 * erneut Gelände - was eigentlich in der Mitte läge, verdeckt der Berg davor,
 * im Bild nur noch seine steile Flanke. Geprüft bei jeder Änderung der
 * Ansicht: Verschieben, Zoomen, Neigen, Drehen, Sprünge. Flachgelegt wird
 * sofort, aufgerichtet erst, wenn die Sicht eine Weile frei ist - sonst
 * flackerte es beim Verschieben durchs Gebirge. Nur mit dem Häkchen im Menü
 * (settings.autoFlatten), von Haus aus aus. VERIFIED: Testseed x -150, y -130,
 * Neigung 20° - verdeckt, flachgelegt nur mit Häkchen, ausgeschaltet sofort aufgerichtet.
 */
let autoFlat = false;
/** Ab so viel Abstand (Tiles) zwischen Hang vorn und Gelände dahinter gilt die Mitte als verdeckt - kleine Buckel zählen nicht. */
const HIDDEN_TILES = 3;
/** So lange (ms) muss die Sicht frei sein, bevor sich das Gelände wieder aufrichtet. */
const CLEAR_MS = 400;
/** Schrittweite (Tiles Höhe) beim Abtasten des Sichtstrahls. */
const RAY_STEP = 1;
/**
 * Höchstens so oft (ms) prüfen - der Sichtstrahl fragt Dutzende Geländehöhen
 * ab; je Bild geprüft, kostete das beim Neigen und Verschieben gemessen
 * spürbar Bildrate.
 */
const CHECK_MS = 120;
/** Kamera-Stand, für den zuletzt geprüft wurde, wann, und seit wann die Sicht frei ist. */
let autoFlatView = '';
let lastCheck = 0;
let clearSince = 0;

/**
 * Springt auf die Stelle (x, y): mit ihrer Geländehöhe in die Bildmitte, als
 * festgehaltener Blickpunkt (focus) - das Haupthaus, ein Untätiger, eine
 * Stelle auf der Minimap. Liegt ein Berg davor, legt die Prüfung in loop()
 * das Gelände flach, wenn das automatische Flachlegen eingeschaltet ist.
 */
function lookAt(x: number, y: number) {
  focus = { x, y, height: ground.groundAt(x, y), cameraX: 0, cameraY: 0 };
  keepFocus(focus);
}

/**
 * Kameraflug zur Stelle (x, y) statt eines Sprungs: sanft anfahren, gleiten,
 * sanft abbremsen - je weiter, desto länger, höchstens FLIGHT_MAX_S. Jeder
 * Schritt ist ein lookAt; bewegt der Spieler die Kamera selbst, endet der Flug.
 */
let flight: { from: { x: number; y: number }; to: { x: number; y: number }; start: number; duration: number } | null = null;
const FLIGHT_MIN_S = 0.35;
const FLIGHT_MAX_S = 1.2;

function flyTo(x: number, y: number) {
  const from = focusPoint();
  const distance = Math.hypot(x - from.x, y - from.y);
  const duration = Math.min(FLIGHT_MAX_S, FLIGHT_MIN_S + distance * 0.02) * 1000;
  flight = { from: { x: from.x, y: from.y }, to: { x, y }, start: performance.now(), duration };
}

/** Ein Schritt des Flugs; false, wenn keiner (mehr) läuft. */
function stepFlight(now: number): boolean {
  if (!flight) return false;
  // Seit dem letzten Schritt anders bewegt (Tasten, Ziehen, Minimap): abbrechen.
  if (now > flight.start && !heldFocus()) {
    flight = null;
    return false;
  }
  const t = Math.min(1, Math.max(0, (now - flight.start) / flight.duration));
  // Ease-in-out (kubisch).
  const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  lookAt(flight.from.x + (flight.to.x - flight.from.x) * e, flight.from.y + (flight.to.y - flight.from.y) * e);
  if (t >= 1) flight = null;
  return true;
}

/**
 * Schaut man in einen Berg? Der Sichtstrahl durch die Bildmitte, von vorn
 * (hoch) nach hinten (tief) abgetastet, bei vollem Relief: tritt er nach dem
 * ersten Treffer wieder aus dem Gelände und trifft weiter hinten erneut
 * welches, verdeckt der Hang davor die Gegend dahinter. Die Ansicht ist die
 * bei vollem Relief - mit festgehaltenem Blickpunkt steht der dann in der
 * Mitte, sonst bleibt die Kamera, wie sie ist.
 */
function lookingIntoMountain(): boolean {
  let view = camera.view();
  const f = heldFocus();
  if (f) {
    const c = centerFor(view, f.x, f.y, f.height, camera.centerX, camera.centerY);
    view = { ...view, centerX: c.x, centerY: c.y };
  }
  const zs = viewZScreen();
  let first: { x: number; y: number } | null = null;
  let inside = false;
  for (let z = MAX_RELIEF; z >= -RAY_STEP; z -= RAY_STEP) {
    // Punkt des Strahls in Höhe z - wie pickWorld für die Bildmitte.
    const d = groundToWorld(0, zs * z);
    const x = view.centerX + d.x;
    const y = view.centerY + d.y;
    const below = ground.coarseGroundAt(x, y) >= z;
    if (below && !inside) {
      if (!first) first = { x, y };
      else if (Math.hypot(x - first.x, y - first.y) > HIDDEN_TILES) return true;
    }
    inside = below;
  }
  return false;
}

/** Neigen mit Alt und rechter Maustaste: Radiant je Pixel (wie in der Galerie). */
const TILT_PER_PIXEL = 0.006;
/** Neigen mit Alt und Pfeil hoch/runter: ein Schritt (7,5°). */
const TILT_STEP = Math.PI / 24;
/** Wie schnell der Blickwinkel seinem Ziel folgt (je Sekunde) - wie beim Zoom. */
const TILT_RATE = 18;
/** So lange nach der letzten Eingabe (ms) gilt noch als "wird geneigt". */
const TILT_SETTLE = 200;

function clampTilt(rad: number): number {
  return Math.min(TILT_MAX, Math.max(TILT_MIN, Number.isFinite(rad) ? rad : TILT_DEFAULT));
}

/** Wohin der Blickwinkel gleitet (Radiant) - geneigt wird weich in updateTilt(). */
let tiltTarget = viewElevation();
let lastTiltInput = 0;

/** Zielwinkel verschieben (positiv: steiler, mehr von oben). */
function tiltBy(rad: number) {
  tiltTarget = clampTilt(tiltTarget + rad);
  lastTiltInput = performance.now();
}

/**
 * Ein Bild Neigung: der Blickwinkel folgt dem Ziel weich (Lerp). Gekippt
 * wird um die Stelle in der Bildmitte mit ihrer Geländehöhe - wie beim
 * Drehen, sonst wanderte ein Dorf auf einem Hügel aus dem Bild.
 * true, wenn sich die Ansicht geändert hat.
 */
function updateTilt(dt: number, now: number): boolean {
  // Solange noch gezogen wird, bleibt der Gelände-Cache gestreckt stehen.
  const current = viewElevation();
  renderer.tilting = current !== tiltTarget || now - lastTiltInput < TILT_SETTLE;
  if (current === tiltTarget) return false;
  let next = current + (tiltTarget - current) * (1 - Math.exp(-TILT_RATE * dt));
  if (Math.abs(tiltTarget - next) < 0.0005) next = tiltTarget;
  const pivot = focusPoint();
  setViewElevation(next);
  keepFocus(pivot);
  if (next === tiltTarget) {
    // Der Blickwinkel bleibt beim Neuladen - wie die Blickrichtung.
    settings.tilt = Math.round((next * 180) / Math.PI * 10) / 10;
    saveSettings(settings);
  }
  return true;
}

/** Bildschirmstelle, um die gezoomt wird - bleibt bis zur nächsten Zoom-Eingabe. */
let zoomAnchor: CanvasPoint | null = null;

/**
 * Zoomziel verschieben (game/Camera.ts); gezoomt wird weich in updateZoom().
 * Anker ist der Mauszeiger, solange er über der Karte ist, sonst die Bildmitte.
 */
function zoomBy(steps: number, anchorX?: number, anchorY?: number) {
  zoomAnchor = {
    x: anchorX ?? pointer.pixel?.x ?? camera.centerX,
    y: anchorY ?? pointer.pixel?.y ?? camera.centerY,
  };
  camera.zoomBy(steps);
}

/**
 * Ein Bild Zoom: so, dass das Welt-Tile unter dem Anker dort stehen bleibt.
 * true, wenn sich die Ansicht geändert hat.
 */
function updateZoom(dt: number, now: number): boolean {
  const ax = zoomAnchor?.x ?? camera.centerX;
  const ay = zoomAnchor?.y ?? camera.centerY;
  // Das Ziel kennt der Renderer schon, bevor der Zoom dort ist - er bereitet
  // den Gelände-Cache der Zielstufe im Hintergrund vor.
  renderer.targetTileSize = camera.targetTileSize;
  // Ohne Zoom kein Anker - der Sichtstrahl kostet sonst jedes Bild umsonst.
  if (!camera.zooming) return false;
  // Welt-Punkt unter dem Anker vor dem Zoom ...
  const anchor = picker.point(ax, ay);
  if (!camera.stepZoom(dt, now)) return false;
  renderer.tileSize = camera.tileSize;
  // ... und danach wieder genau unter den Anker legen.
  camera.centerOn(anchor.x, anchor.y, anchor.z, ax, ay);
  showZoom();
  return true;
}

/** Zoomstufe unter der Minimap ("Zoom 1" bis "Zoom 5") und in den Entwickler-Infos. */
function showZoom() {
  document.getElementById('zoom-level')!.textContent = `Zoom ${camera.zoomNumber}`;
  devPanel.showZoom(camera);
}

/**
 * Cheats wie in AoE2 - Leerzeichen und Groß-/Kleinschreibung zählen nicht.
 * Jeder gibt die Meldung zurück, wenn er gewirkt hat, sonst nichts.
 */
const CHEATS: Record<string, () => string | undefined> = {
  imtheking: () => {
    for (const kind of ['food', 'wood', 'stone', 'gold'] as const) world.addStock(kind, 30000);
    world.bonusHousing += 100;
    return '+30.000 Nahrung, Holz, Stein und Gold, +100 Bevölkerung';
  },
  // Am Mauszeiger; wo keiner stehen kann (Wasser, Wald, Gebäude), passiert nichts.
  ineedhelp: () => {
    const count = pointer.tile ? world.spawnAround('villager', pointer.tile.x, pointer.tile.y, 20) : 0;
    return count > 0 ? `${count} Dorfbewohner zur Hilfe` : undefined;
  },
  // Noch einmal eingegeben schaltet es wieder ab.
  speedygonzales: () => {
    world.speedy = !world.speedy;
    return `Ausbildung, Felder, Wachsen, Jagd, Holz und Nahrung sofort ${world.speedy ? 'an' : 'aus'}`;
  },
};

/** Der Cheat zur Eingabe (klein, ohne Leerzeichen). "muh", "muh muh", ...: so viele Kühe am Mauszeiger. */
function findCheat(code: string): (() => string | undefined) | undefined {
  if (!/^(muh)+$/.test(code)) return CHEATS[code];
  return () => {
    const count = pointer.tile ? world.spawnAround('cow', pointer.tile.x, pointer.tile.y, code.length / 3) : 0;
    return count > 1 ? `${count} Kühe - Muh!` : count === 1 ? 'Muh!' : undefined;
  };
}

const cheatInput = document.getElementById('cheat') as HTMLInputElement;
cheatInput.addEventListener('keydown', (e) => {
  // Getippt wird hier, nicht im Spiel: die Spieltasten (keyboard.ts) bekommen nichts ab.
  e.stopPropagation();
  if (e.key !== 'Enter' && e.key !== 'Escape') return;
  const message = e.key === 'Enter' ? findCheat(cheatInput.value.toLowerCase().replace(/\s+/g, ''))?.() : undefined;
  if (message) ui.hint(`Cheat: ${message}`, true);
  ui.refreshResources();
  cheatInput.value = '';
  cheatInput.blur();
});
// Klick daneben schließt die Eingabe.
cheatInput.addEventListener('blur', () => (cheatInput.hidden = true));

/** Tastatur: gehaltene Tasten und die Belegung (game/keyboard.ts) - hier, was sie im Spiel tut. */
const keyboard = new Keyboard({
  isMenuOpen: () => menu.isOpen(),
  isTitleOpen: () => start.isOpen(),
  // Im Hauptmenü ohne die Knöpfe, die nur im Spiel Sinn haben.
  toggleMenu: () => (menu.isOpen() ? menu.close() : menu.open(start.isOpen())),
  closeMenu: () => menu.close(),
  togglePause,
  toggleSound,
  toggleFlat,
  zoom: (step) => zoomBy(step),
  tiltStep: (step) => tiltBy(step * TILT_STEP),
  // Wie die Pfeile unter der Minimap: rechts = was rechts liegt, kommt nach oben.
  turn: (direction) => faceDirection(directionAt(direction === 1 ? -1 : 1)),
  resetView: () => {
    faceDirection('N');
    tiltBy(TILT_DEFAULT - tiltTarget);
  },
  // Esc: erst abbrechen, was läuft; ist nichts mehr da, das Menü.
  cancel: () => ui.cancel() || menu.open(),
  demolish: () => actions.demolishSelected(),
  home: () => actions.cycleTownCenter(),
  toggleHelp: () => setPanels({ showHelp: !settings.showHelp }),
  toggleDebug: () => setPanels({ showDebug: !settings.showDebug }),
  selectIdle: (which) => actions.selectIdle(which),
  train: (count) => actions.trainVillagers(count),
  farmsOpen: () => ui.farmsOpen,
  chooseCrop: (index) => ui.chooseCrop(index),
  // Das Feld öffnet das Untermenü (Weizen, Mais, Tomaten, Kartoffeln, Hopfen); sonst Baumodus an oder aus.
  build: (type) => {
    if (type === 'farm') ui.openFarms();
    else ui.setPlacing(placement.placingType === type ? null : type);
  },
  openCheat: () => {
    cheatInput.hidden = false;
    cheatInput.focus();
  },
});



/**
 * Die Ansicht, um die sich die Minimap legt: mittig auf der Stelle, die man in
 * der Bildmitte wirklich sieht - mit ihrer Geländehöhe. camera.x/y ist der
 * Punkt auf Meereshöhe; auf einem Gebirge liegt der weit hinter dem, was im
 * Bild ist, und die flache Minimap zeigte dann die falsche Gegend.
 */
function minimapView(): IsoView {
  const seen = picker.point(camera.centerX, camera.centerY);
  return { ...camera.view(), centerX: seen.x, centerY: seen.y };
}

minimapCanvas.addEventListener('click', (e) => {
  const rect = minimapCanvas.getBoundingClientRect();
  // Nur die Scheibe ist Karte - die Ecken des Canvas gehören zum Rahmen.
  if (!minimap.inside(e.clientX - rect.left, e.clientY - rect.top)) return;
  const target = minimap.toWorld(e.clientX - rect.left, e.clientY - rect.top, minimapView());
  // Die angeklickte Stelle mit ihrer Höhe in die Bildmitte - nicht den Punkt auf Meereshöhe.
  lookAt(target.x, target.y);
  refreshPointer();
});

minimapCanvas.addEventListener('mousemove', (e) => {
  const rect = minimapCanvas.getBoundingClientRect();
  devPanel.showMinimapPointer(minimap.toWorld(e.clientX - rect.left, e.clientY - rect.top, minimapView()));
});
minimapCanvas.addEventListener('mouseleave', () => devPanel.showMinimapPointer());

/**
 * Zeiger auf die Canvas-Stelle (mouseX, mouseY) setzen: Objekt und Tile
 * darunter, Mauszeiger und Entwickler-Infos. true, wenn das Tile wechselte.
 */
/**
 * @param objects auch das Objekt unter dem Zeiger suchen - während sich die
 * Kamera bewegt nicht: weit draußen prüft das Tausende Vorkommen und kostete
 * beim schnellen Zoomen bis 150 ms je Bild (M4). Danach einmal mit (loop).
 */
function updateHoveredTile(mouseX: number, mouseY: number, objects = true): boolean {
  pointer.pixel = { x: mouseX, y: mouseY };
  // Nur mit ausgewählten Dorfbewohnern zählt, worauf der Zeiger zeigt.
  const target = objects ? picker.target(mouseX, mouseY) : undefined;
  pointer.setObject(selection.villagers.size > 0 ? target : undefined);
  const tile = picker.tile(mouseX, mouseY);
  const tileChanged = pointer.setTile(tile);
  if (objects) updateSelectable(target);
  if (!tileChanged) return false;
  devPanel.showTile({ ...terrain.getTile(tile.x, tile.y), x: tile.x, y: tile.y });
  updateHoverInfo();
  return true;
}

/**
 * Wählt ein Linksklick hier etwas aus? Dieselbe Reihenfolge wie
 * PlayerActions.clickSelect: Dorfbewohner, Tier, Gebäude, Vorkommen, Blume.
 */
function updateSelectable(object = pointer.pixel && picker.target(pointer.pixel.x, pointer.pixel.y)) {
  const { pixel } = pointer;
  pointer.selectable = !!pixel && !!object && !!(picker.villager(pixel.x, pixel.y) || picker.animal(pixel.x, pixel.y)
    || (!object.bareGround && (world.at(object.x, object.y) || world.resourceInfo(object.x, object.y)))
    || picker.flower(pixel.x, pixel.y));
  ui.updateCursor();
}

/** Die Kamera hat sich bewegt: unter dem stehenden Zeiger liegt jetzt anderes. */
function refreshPointer(objects = true) {
  if (pointer.pixel) updateHoveredTile(pointer.pixel.x, pointer.pixel.y, objects);
}
/** Stand das Hauptmenü offen (oder lädt die Seite gerade)? Beim Wechsel ins Spiel: Zoom 5, Ladeschild. */
let menuWasOpen = true;
let loading = false;
let loadingSince = 0;
const LOADING_MAX_MS = 6000;
let bakeBuildingsAt = 0;
const loadingEl = document.getElementById('loading')!;
/** Bewegte sich die Kamera im letzten Bild? Kommt sie zur Ruhe, sucht der Zeiger wieder Objekte. */
let cameraMoving = false;

/**
 * Was unter dem Zeiger steht, in den Entwickler-Infos (game/hoverInfo.ts).
 * Läuft auch getaktet mit, weil sich Figuren bewegen und Sammler leeren,
 * während der Zeiger stillsteht.
 */
function updateHoverInfo() {
  const { pixel, tile } = pointer;
  let target: HoverTarget = {};
  if (pixel && tile) {
    const villager = picker.villager(pixel.x, pixel.y);
    const at = picker.point(pixel.x, pixel.y);
    target = villager ? { villager } : { animal: world.animalNear(at.x, at.y, 0.6), tile };
  }
  const { label, text } = hoverDescription(world, resources, target);
  devPanel.showObject(label, text);
}

let lastTime = performance.now();

/**
 * Steht die Kamera (verschieben, zoomen, drehen) so lange still, zeichnet das
 * Spiel nur noch IDLE_FPS Bilder je Sekunde - schont Akku und Lüfter. Die
 * Welt läuft gleich schnell weiter, nur seltener gezeichnet.
 */
const IDLE_AFTER_MS = 1000;
const IDLE_FPS = 30;
/**
 * In der Pause steht das Bild still - ohne Eingabe nur noch so oft, damit
 * Nachgeladenes (Texturen, Gelände-Cache, Baumbilder) noch ins Bild kommt.
 * ponytail: feste 2 fps statt gar keinem Bild; auf 0 gehen, wenn jede
 * Quelle von Änderungen (Laden, Cache, UI) ein Neuzeichnen anstoßen kann.
 */
const PAUSED_FPS = 2;
let lastMove = performance.now();
let lastFrame = 0;
/** Letzte Eingabe (Zeiger, Rad, Tasten) - sie zeichnet auch in der Pause sofort wieder. */
let lastInput = performance.now();
for (const type of ['pointermove', 'pointerdown', 'pointerup', 'wheel', 'keydown', 'keyup'] as const) {
  window.addEventListener(type, () => { lastInput = performance.now(); }, { capture: true, passive: true });
}
/** So oft je Sekunde wird die Minimap gezeichnet - sie bewegt sich langsam (Einstellung minimapFps). */
const MINIMAP_FPS = 10;
let lastMinimap = 0;
let lastView = '';
/** Die Simulation läuft in festen Schritten von 0.1 s (game/timing.ts). */
const simulation = new FixedStep(0.1);
/** Vorrat, Auswahl und Hover fünfmal je Sekunde - je Bild wäre es nur unruhig und teuer. */
const uiRefresh = new Interval(200);
/** Neue Stücke mit Wild nahe der Kamera nur ab und zu prüfen. */
const animalCheck = new Interval(500);
/**
 * Einmal je Minute speichern - der Spielstand wird mit der Welt immer
 * größer, ihn alle paar Sekunden zu schreiben kostet unnötig. Beim Verlassen
 * der Seite wird zusätzlich gespeichert (beforeunload).
 */
const autosave = new Interval(60_000);

/** Wird je Frame neu befüllt statt neu angelegt. */
const overlay: EntityInstance[] = [];
/** Feste Puffer der Vorkommen, an denen niemand arbeitet (world/resources.ts). */
const staticBatches: StaticBatch[] = [];
const minimapOverlay: EntityInstance[] = [];

/**
 * canPlace() sucht den ganzen Umkreis nach Vorkommen ab - bei Radius 4 sind
 * das 81 Geländeabfragen. Für die Vorschau wird das Ergebnis gemerkt, solange
 * Feld und Gebäudetyp gleich bleiben; sonst liefe die Suche je Bild neu.
 */

/**
 * Feste Puffer für die Vorkommen (Regionen von 64x64 Tiles) nur weit draußen,
 * unter so vielen CSS-Pixeln je Tile (Zoom 1, die Bäume als Bild): dort
 * stehen Tausende Bäume im Bild, und die Puffer sparen das Einsammeln. Näher
 * heran werden die Vorkommen einzeln eingesammelt, nur was im Bild steht
 * (onScreenTest) - ganze Regionen zu zeichnen hieß gemessen 18-28 Mio.
 * Eckpunkte je Bild, auch für nur 31 sichtbare Tiles; einzeln sind es bei
 * Zoom 2 bis 5 noch 6,3 / 4,2 / 2,1 / 1,0 Mio., bei gleichen Bildzeiten.
 */
const STATIC_BATCHES_BELOW = 16;

/**
 * Steht ein Objekt im Bild (OnScreen in world/resources.ts)? In
 * Bodenkoordinaten gegen den Bildausschnitt: im Bild rückt es um seine
 * Geländehöhe und seine eigene Höhe nach oben. visibleWorldRect ist das
 * achsenparallele Rechteck um die Bildraute - fast doppelt so groß, dazu der
 * Rand für die höchsten Gipfel. Ein Tile Rand, und seitlich eine Objekthöhe
 * (ein fallender Baum kippt zur Seite).
 */
function onScreenTest(): OnScreen {
  const c = worldToGround(camera.x, camera.y);
  const zs = viewZScreen();
  const relief = renderer.relief;
  const halfU = camera.width / 2 / camera.tileSize + 1;
  const halfV = camera.height / 2 / camera.tileSize + 1;
  return (x, y, ground, height) => {
    const g = worldToGround(x, y);
    if (Math.abs(g.u - c.u) > halfU + height) return false;
    const foot = g.v - c.v - zs * ground * relief;
    return foot > -halfV && foot - zs * height < halfV;
  };
}

/** Alles, was über dem Gelände gezeichnet wird: Vorkommen, Welt, Auswahl und - im Baumodus - die Vorschau. */
function collectOverlay(blend: number) {
  overlay.length = 0;
  staticBatches.length = 0;
  const visible = visibleWorldRect(camera.view());
  if (camera.tileSize >= RESOURCE_OBJECTS_MIN_ZOOM) {
    resources.update(visible, camera.x, camera.y);
    if (camera.tileSize < STATIC_BATCHES_BELOW) {
      resources.instances(visible, world, overlay, selection.resource, blend, { batcher: renderer, out: staticBatches });
    } else if (camera.tileSize < settings.billboards) {
      // Bäume als Bild gibt es nur aus den festen Puffern - nah dort nur sie, der Rest einzeln.
      resources.instances(visible, world, overlay, selection.resource, blend, { batcher: renderer, out: staticBatches }, onScreenTest());
    } else {
      resources.instances(visible, world, overlay, selection.resource, blend, undefined, onScreenTest());
    }
  }
  if (renderer.flowerObjects) {
    flowers.update(visible, camera.x, camera.y);
    // Blumen als Bild gibt es nur aus festen Puffern (wie die Bäume).
    flowers.instances(visible, world, overlay, camera.tileSize < settings.billboards ? { batcher: renderer, out: staticBatches } : undefined);
  }
  // Partikel: erst Wichtiges (Einsturz in worldInstances), zuletzt Schmuck.
  const particles = renderer.particles;
  particles.clear();
  particles.tileSize = camera.tileSize;
  const hovered = pointer.tile ? world.at(pointer.tile.x, pointer.tile.y)?.anchor : undefined;
  worldInstances(world, visible, overlay, blend, selection, hovered, hideAnimal, particles);
  landscape.update(visible, camera.x, camera.y);
  landscape.collect(visible, world, particles);
  selectionOverlay(world, selection, blend, overlay, hideAnimal);
  const tile = pointer.tile;
  if (placement.placingType !== null && tile) {
    const blocked = placement.check(tile.x, tile.y, placement.placingType) !== null;
    placementOverlay(world, placement.placingType, tile.x, tile.y, blocked, overlay);
  }
}

function loop(now: number) {
  // Stufenloser Zoom und Neigung zählen mit - beides bewegt die Ansicht.
  // Auch das Relief (Flachlegen): es verschiebt, was man in der Bildmitte sieht.
  const view = `${camera.x},${camera.y},${camera.zoom},${viewRotation()},${viewElevation()},${renderer.relief}`;
  if (view !== lastView) {
    lastView = view;
    lastMove = now;
    renderer.seenCenter = picker.point(camera.centerX, camera.centerY);
  }
  // Etwas Spiel, damit bei 60 Hz jedes zweite Bild kommt und nicht jedes dritte.
  const idleFps = paused && now - lastInput > IDLE_AFTER_MS ? PAUSED_FPS : IDLE_FPS;
  if (settings.idleFps && now - lastMove > IDLE_AFTER_MS && now - lastFrame < 1000 / idleFps - 4) {
    requestAnimationFrame(loop);
    return;
  }
  lastFrame = now;
  const workStart = performance.now();
  // Gedrosselt, weil die Kamera steht - dann sind 30 Bilder je Sekunde gewollt.
  if (settings.idleFps && now - lastMove > IDLE_AFTER_MS) addRenderStats('idle', 1);

  // Begrenzt, damit die Kamera nach einem Tab-Wechsel nicht quer über die Karte
  // springt (dt wäre dann die gesamte Zeit im Hintergrund).
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;


  // WASD, Leertaste, hinter dem Hauptmenü langsam vorbeiziehen (game/cameraControl.ts).
  const flying = stepFlight(now);
  const zoomed = updateZoom(dt, now);
  const tilted = updateTilt(dt, now);
  // Beim Flachlegen und Aufrichten bleibt der angeschaute Punkt in der Mitte,
  // solange die Kamera nicht anders bewegt wurde.
  const held = heldFocus();
  const reliefBefore = renderer.relief;
  const [cameraX, cameraY] = [camera.x, camera.y];
  const steered = steerCamera(camera, renderer, keyboard, mouse.edge, settings.edgeScroll ? settings.edgeSpeed : 0, dt, settings.scroll, start.isOpen(), autoFlat || flatOn);
  if (held && renderer.relief !== reliefBefore && camera.x === cameraX && camera.y === cameraY) keepFocus(held);
  const moving = steered || zoomed || tilted || flying;
  if (moving || cameraMoving) refreshPointer(!moving);
  cameraMoving = moving;
  // Schaut man in einen Berg? Geprüft, wenn sich die Ansicht ändert - und
  // solange flachgelegt ist, bis die Sicht eine Weile frei ist.
  // Ins Spiel (aus dem Hauptmenü oder beim Laden): auf Zoom 5, außer die
  // Adresse nennt eine Stufe - und das Ladeschild, bis das Gelände im Bild
  // fertig ist. Zoom 5 ist der kleinste Ausschnitt, am schnellsten berechnet.
  if (!start.isOpen() && menuWasOpen) {
    menuWasOpen = false;
    if (!gameUrl?.zoom) {
      camera.jumpToZoom(MAX_ZOOM);
      renderer.tileSize = camera.tileSize;
      showZoom();
    }
    loading = true;
    // Nicht der Zeitstempel des Bildes: nach der langen Startphase liegt er weit zurück.
    loadingSince = performance.now();
  }
  if (start.isOpen()) menuWasOpen = true;
  renderer.loading = loading;
  // Bis auch Vorrat und Nachbarstufen gefüllt sind, nicht nur das Bild - das
  // erste Scrollen und Zoomen ruckelt nicht nach. Kommt alles aus dem
  // Speicher, geht das schnell. Höchstens LOADING_MAX_MS, falls ein Gerät es nicht schafft.
  const waited = performance.now() - loadingSince;
  if (loading && renderer.terrainComplete && (renderer.terrainSettled || waited >= LOADING_MAX_MS)) loading = false;
  // Gebäude für das Vorausrechnen des Bodens, in Gruppen (16 Tiles) - einmal je Sekunde.
  if (now - bakeBuildingsAt > 1000) {
    bakeBuildingsAt = now;
    const groups = new Map<string, { x: number; y: number }>();
    for (const b of world.allBuildings()) groups.set(`${Math.floor(b.x / 16)},${Math.floor(b.y / 16)}`, { x: b.x, y: b.y });
    renderer.bakeBuildings = [...groups.values()];
  }
  if (loadingEl.hidden === loading) loadingEl.hidden = !loading;
  if (!settings.autoFlatten) {
    // Ausgeschaltet: sofort wieder aufrichten; beim Einschalten neu prüfen.
    autoFlat = false;
    clearSince = 0;
    autoFlatView = '';
  } else if (!start.isOpen()) {
    const seen = `${camera.x},${camera.y},${camera.zoom},${viewRotation()},${viewElevation()}`;
    if ((seen !== autoFlatView || (autoFlat && clearSince > 0)) && now - lastCheck >= CHECK_MS) {
      autoFlatView = seen;
      lastCheck = now;
      if (lookingIntoMountain()) {
        autoFlat = true;
        clearSince = 0;
      } else if (autoFlat) {
        clearSince ||= now;
        if (now - clearSince > CLEAR_MS) {
          autoFlat = false;
          clearSince = 0;
        }
      }
    }
  }

  // Wohin die Zeit eines Bildes geht (renderStats.ts, getRenderStats()).
  let mark = performance.now();
  const lap = (key: string) => {
    const t = performance.now();
    addRenderStats(key, t - mark);
    mark = t;
  };
  simulation.advance(paused || start.isOpen() ? 0 : dt * settings.speed, (step) => world.tick(step));
  if (lighting) {
    lighting.update(paused || start.isOpen() ? 0 : dt * settings.speed);
    renderer.light = lighting.frame();
    renderer.rain = lighting.rain;
  }
  if (alwaysRain) renderer.rain = 1;
  renderer.setEffects(settings.fxaa, settings.colorGrading, settings.bloom);
  lap('simMs');

  ground.update(now);
  // Wild rund um die Kamera - neue Stücke nur ab und zu prüfen.
  if (animalCheck.due(now)) world.ensureAnimals(camera.x, camera.y);
  collectOverlay(simulation.blend);
  lap('collectMs');
  renderer.setPlayerColor(player.color.toRGB());
  renderer.billboardBelow = settings.billboards;
  const drawn = renderer.render(camera.x, camera.y, pointer.tile?.x, pointer.tile?.y, overlay, staticBatches);
  lap('renderMs');
  addRenderStats('tileSize', camera.tileSize);
  addRenderStats('relief', renderer.relief);
  // Geräte-Pixel in Millionen - Retina ist viermal so viel Arbeit.
  addRenderStats('mpx', (canvas.width * canvas.height) / 1e6);
  // Das Bild für den Dreh-Übergang nur, wenn gerade gezeichnet wurde - sonst
  // ist der WebGL-Puffer leer und der Übergang begänne schwarz.
  if (pendingFacing && drawn) {
    turnAnimation.capture();
    const before = northAngle();
    applyFacing(pendingFacing);
    pendingFacing = null;
    // Auf den kürzeren Weg: -180..180, eine halbe Drehung im Uhrzeigersinn.
    const turned = ((northAngle() - before + 540) % 360) - 180;
    turnAnimation.play(turned === -180 ? 180 : -turned);
  }

  if (!settings.minimapFps || now - lastMinimap >= 1000 / MINIMAP_FPS - 4) {
    lastMinimap = now;
    const seen = minimapView();
    minimapDots(world, minimap, seen, minimapOverlay);
    // Ihre Kosten zählen nur als minimapMs - Draw-Calls usw. sind die der Hauptansicht.
    withoutRenderStats(() => minimap.render(seen, minimapOverlay));
    devPanel.minimapFrame();
    lap('minimapMs');
  }

  collectGpuTimes();
  devPanel.frame(now, camera, renderer.billboardsActive);
  devPanel.showCosts(selection.villagers.size > 0 ? { key: 'simVillagersMs', count: world.villagers.length }
    : selection.animal !== null ? { key: 'simWildlifeMs', count: world.wildlife.animals.length } : undefined);

  if (uiRefresh.due(now)) {
    ui.refreshResources();
    updateHoverInfo();
    // Figuren laufen unter dem stehenden Zeiger durch.
    updateSelectable();
  }
  if (autosave.due(now)) world.save();
  renderStatsFrame(now, performance.now() - workStart);

  requestAnimationFrame(loop);
}

showZoom();
// Blickrichtung und Pause wie beim letzten Mal. Die Kamera bleibt auf dem
// Feld aus der Adresse - gedreht wird nur die Ansicht.
// Aus einem geteilten Link die Drehung von dort.
if (gameUrl?.rotation != null) setViewRotation(gameUrl.rotation);
else if (isDirection(settings.facing)) rotateToFace(settings.facing);
if (settings.paused && !paused) togglePause();
compass.update();
ui.refreshResources();
// Wer die Seite aufmacht, landet im Hauptmenü - wie bei einem Spiel. Nach
// der Wahl einer anderen Welt geht es dort gleich los - neu oder geladen.
const request = takeStartRequest();
// Die Adresse setzt das Hauptmenü: "/" offen, /game/<seed> im Spiel. Die
// Abfrage (Ansicht, Spielstand, Schalter) ist gelesen und fällt dabei weg.
if (request) start.close();
else start.open();
if (request === 'new') startNewGame();
startRenderStats();
initGpuTimer(canvas.getContext('webgl2')!);
// Umstände der Messung für getRenderInfo() - ohne sie sind Läufe nicht vergleichbar.
setRenderInfo(() => {
  const gl = canvas.getContext('webgl2');
  const debug = gl?.getExtension('WEBGL_debug_renderer_info');
  return {
    gpu: gl && debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER),
    pixelRatio: camera.pixelRatio,
    width: camera.width,
    height: camera.height,
    seed,
    idleFps: settings.idleFps,
    minimapFps: settings.minimapFps,
    // Im Entwickler-Panel abgeschaltet - dann misst der Lauf nicht das ganze Bild.
    off: Object.keys(renderer.off).filter((k) => renderer.off[k as keyof typeof renderer.off]),
    order: renderer.order.join(','),
    billboards: settings.billboards,
    fxaa: settings.fxaa,
    colorGrading: settings.colorGrading,
    bloom: settings.bloom,
    tilt: settings.tilt,
    facing: settings.facing,
  };
});
requestAnimationFrame(loop);
// Nach dem ersten Bild, wenn der Browser Luft hat (audio.ts).
sound.prepare();
document.title = `Soliva - ${seed}`;