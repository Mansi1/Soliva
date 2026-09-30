// Leistungsmessung mit festen Szenen (docs/OPTIMIZATION_PLAN.md, Abschnitt 1):
// jede Szene gleich aufgebaut - Welt, Kamera, Zoom, Einstellungen -, die
// Anlaufsekunden verworfen, dann MEASURE_S Sekunden getRenderStats() und je
// Feld der Median. Einzelne Sekunden rauschen zu stark für einen Vergleich.
//
// Aufruf: erst `npm run dev`, dann
//   npm run bench -- --save   Ergebnis als Basis (tools/perf/baseline.json)
//   npm run bench             gegen die Basis vergleichen
// Optional die Adresse: `node tools/perf/bench.mjs [--save] [--uncapped] [Adresse]`.
//
// --uncapped: Chrome ohne vsync und Bildraten-Deckel. Dann zeigen fps (und
// frameMs) die echte Last der GPU - mit vsync stehen sie bei 60, und gpuMs
// misst auf ANGLE Metal das Warten aufs nächste Bild mit (M4, Demo: ~12 ms
// mit und ohne 4 Mio. Eckpunkte Weizen; ohne Deckel 76 gegen 120 fps). Nicht
// mit einer Basis ohne --uncapped vergleichen.
//
// Rauschen zwischen zwei Läufen (M4, gemessen): Zählwerte (drawCalls,
// vertices, terrainTexels) ±2 %, Zeiten um 1 ms (cpuMs, renderMs) bis ±40 % -
// kleine Zeitunterschiede sind kein Beleg. fps steht bei 60 an (vsync);
// Gewinne zeigen sich in cpuMs und den Zählwerten.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { launch } from '../ui/browser.mjs';

const args = process.argv.slice(2);
const SAVE = args.includes('--save');
const UNCAPPED = args.includes('--uncapped');
const BASE = (args.find((a) => !a.startsWith('--')) ?? 'http://localhost:5173').replace(/\/+$/, '');
const BASELINE = new URL('baseline.json', import.meta.url);

/** Sekunden, die gemessen werden - nach dem Anlauf. */
const MEASURE_S = 8;
/** Höchstens so lange (s) auf das Ende des Anlaufs warten: Gelände-Cache fertig, keine langen Aufgaben. */
const WARMUP_MAX_S = 10;

/**
 * Die Szenen. Welt "Demo" ist die Stadt aus public/savegame/demo.json, sonst
 * eine leere Welt; Kamera am Startpunkt der Welt. zoom: Mausrad-Rasten
 * (+ hinein, - heraus) ab Zoom 5, auf dem das Spiel beginnt - so dieselben
 * Stufen wie früher ab Zoom 3 (weit-leer 1, stadt 3, nah 5, zoom-wechsel ab 3).
 * during: was während der Messung passiert.
 */
const SCENES = [
  { name: 'weit-leer', seed: 'Bench', zoom: -6 },
  { name: 'stadt', seed: 'Demo', zoom: -2 },
  { name: 'nah', seed: 'Bench', zoom: 0 },
  { name: 'zoom-wechsel', seed: 'Bench', zoom: -2, during: 'zoom' },
];

/** Die Felder, die im Vergleich gezeigt werden - alle anderen stehen im JSON. */
const SHOWN = ['tileSize', 'fps', 'frameMs', 'frameMsMax', 'cpuMs', 'longTaskMs', 'pickMs', 'renderMs', 'collectMs', 'gpuMs', 'drawCalls', 'vertices', 'terrainVertices', 'terrainTexels'];

const git = (cmd) => execSync(`git ${cmd}`, { encoding: 'utf8' }).trim();
const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const browser = await launch(UNCAPPED ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : []);
// Feste Fenstergröße und Pixel-Verhältnis 1 - sonst misst jeder Lauf ein anderes Bild.
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => page.waitForTimeout(ms);

async function wheel(notches) {
  await page.mouse.move(640, 400);
  for (let i = 0; i < Math.abs(notches); i++) {
    await page.mouse.wheel(0, notches > 0 ? -400 : 400);
    await wait(300);
  }
}

async function runScene(scene) {
  // Welt und Einstellungen vor dem Laden: keine Drosselung (sonst 30 fps im Stillstand), Standard-Blick.
  // Erst warten, bis das Spiel läuft (entry.ts lädt main.ts nach) - sonst
  // verbraucht diese Seite den Start-Vermerk, und die nächste zeigt das Hauptmenü.
  const started = () => page.waitForFunction(() => typeof window.getRenderStats === 'function');
  await page.goto(BASE + '/');
  await started();
  await page.evaluate(async ({ seed }) => {
    localStorage.clear();
    localStorage.setItem('pgm.settings', JSON.stringify({ speed: 1, idleFps: false, facing: '', tilt: 30, paused: false }));
    localStorage.setItem('pgm.seed', seed);
    if (seed === 'Demo') localStorage.setItem('pgm.world.Demo', JSON.stringify(await (await fetch('/savegame/demo.json')).json()));
    sessionStorage.setItem('pgm.start', 'continue');
  }, scene);
  await page.goto(BASE + '/');
  await started();
  await wait(1500);
  if (!(await page.$eval('#start', (e) => e.hidden))) throw new Error(`${scene.name}: Hauptmenü offen statt Spiel`);
  // Das Ladeschild fängt Eingaben ab - erst danach zoomen.
  await page.waitForFunction(() => document.getElementById('loading')?.hidden, null, { timeout: 15000 });
  await wheel(scene.zoom);

  // Anlauf: bis eine Sekunde ohne Geländeerzeugung und ohne lange Aufgaben kommt.
  for (let i = 0; i < WARMUP_MAX_S; i++) {
    await wait(1000);
    const last = (await page.evaluate(() => window.getRenderStats())).at(-1);
    if (last && !last.terrainTexels && !last.longTasks) break;
  }

  const from = (await page.evaluate(() => window.getRenderStats())).at(-1)?.t ?? 0;
  if (scene.during === 'zoom') {
    // Hinaus und wieder hinein, die ganze Messung lang - belastet die Gelände-Caches.
    const end = Date.now() + MEASURE_S * 1000 + 500;
    for (let out = true; Date.now() < end; out = !out) await wheel(out ? -3 : 3);
  } else {
    await wait(MEASURE_S * 1000 + 500);
  }
  const seconds = (await page.evaluate(() => window.getRenderStats())).filter((s) => s.t > from).slice(0, MEASURE_S);
  const keys = new Set(seconds.flatMap(Object.keys));
  keys.delete('t');
  const result = { seconds: seconds.length };
  // Fehlt ein Feld in einer Sekunde, war es dort 0 (nichts dazugezählt).
  for (const k of keys) result[k] = Math.round(median(seconds.map((s) => s[k] ?? 0)) * 10) / 10;
  return result;
}

const run = {
  commit: git('rev-parse --short HEAD') + (git('status --porcelain') ? '+geändert' : ''),
  uncapped: UNCAPPED,
  date: new Date().toISOString(),
  scenes: {},
};
for (const scene of SCENES) {
  process.stdout.write(`${scene.name} ... `);
  run.scenes[scene.name] = await runScene(scene);
  console.log('fertig');
}
run.info = await page.evaluate(() => window.getRenderInfo());
await browser.close();

const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
console.log(`\n${run.commit} auf ${run.info.gpu}${base ? ` - Basis ${base.commit} (${base.date.slice(0, 10)})` : ''}`);
if (base && base.info.gpu !== run.info.gpu) console.log('Achtung: Basis auf anderer GPU gemessen - nicht vergleichbar.');
if (base && !!base.uncapped !== UNCAPPED) console.log('Achtung: Basis mit anderem Bildraten-Deckel (--uncapped) - nicht vergleichbar.');
for (const [name, now] of Object.entries(run.scenes)) {
  console.log(`\n${name}`);
  const before = base?.scenes[name];
  for (const k of SHOWN) {
    if (now[k] === undefined && before?.[k] === undefined) continue;
    const a = before?.[k] ?? 0;
    const b = now[k] ?? 0;
    const delta = before && a !== 0 ? `  ${b >= a ? '+' : ''}${Math.round(((b - a) / a) * 100)} %` : '';
    console.log(`  ${k.padEnd(16)}${before ? String(a).padStart(10) + ' →' : ''}${String(b).padStart(10)}${delta}`);
  }
}

if (SAVE) {
  writeFileSync(BASELINE, JSON.stringify(run, null, 2) + '\n');
  console.log('\nals Basis gespeichert: tools/perf/baseline.json');
}
if (errors.length) console.log('\nFehler auf der Seite:', errors.join(' | '));
