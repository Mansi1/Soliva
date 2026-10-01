// Rauchtest im Browser: spielt die wichtigsten Wege einmal durch - Hauptmenü,
// neues Spiel, bauen, ausbilden, Feld über das Untermenü, speichern und neu
// laden, Demo, alter Spielstand, Galerie, Clips aus Blender. Bricht mit Exit-Code 1 ab, wenn
// etwas fehlt oder die Seite einen Fehler wirft.
//
// Aufruf: erst `npm run dev`, dann `npm run smoke` bzw.
// `node tools/ui/smoke.mjs [Adresse]` (Standard http://localhost:5173).
import { launch } from './browser.mjs';

const BASE = (process.argv[2] ?? 'http://localhost:5173').replace(/\/+$/, '');
const SEED = 'Rauchtest';

const browser = await launch();
// Eigener Kontext: leerer localStorage, als käme man zum ersten Mal.
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

let failed = 0;
function check(what, ok, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? ` - ${detail}` : ''}`);
  if (!ok) failed++;
}

const wait = (ms) => page.waitForTimeout(ms);
/** Vorrat einer Rohstoffart laut Rohstoffleiste. */
const stock = async (kind) => Number(await page.$eval(`#stock [data-key=${kind}] .rb-amount`, (e) => e.textContent));
/** Speichern-Knopf drücken und den Spielstand der Welt lesen. */
async function saved(seed = SEED) {
  await page.click('#minimap-frame .rb-save');
  await wait(100);
  return JSON.parse(await page.evaluate((key) => localStorage.getItem(key), `pgm.world.${seed}`));
}
const count = (data, type) => data.buildings.filter((b) => b.t === type).length;

/**
 * Im Baumodus Punkte rund um die Bildmitte anklicken, bis eines steht - Wasser
 * oder Hang lassen manche Stellen nicht zu.
 */
async function placeNearCenter(type) {
  const before = count(await saved(), type);
  for (let r = 0; r < 6; r++) {
    for (let a = 0; a < 8; a++) {
      const angle = (a / 8) * Math.PI * 2;
      await page.mouse.click(640 + Math.cos(angle) * r * 60, 400 + Math.sin(angle) * r * 45);
      await wait(60);
      if (count(await saved(), type) > before) return true;
    }
  }
  return false;
}

async function newGame(seed) {
  await page.click('#start >> text=Einzelspieler');
  await page.click('#start >> text=Neues Spiel');
  await page.fill('#start .start-list input', seed);
  await page.click("#start >> text=Los geht's");
  await page.waitForLoadState('load');
  await wait(2500);
}

// Hauptmenü
await page.goto(BASE + '/');
await wait(2500);
check('Hauptmenü beim Öffnen', await page.$eval('#start', (e) => !e.hidden));
check('Hauptmenü hat Einzelspieler', !!(await page.$('#start >> text=Einzelspieler')));
check('erster Besuch wählt keine Welt', (await page.evaluate(() => localStorage.getItem('pgm.seed'))) === null);

// Neues Spiel
await newGame(SEED);
check('neues Spiel startet', (await page.title()).endsWith(SEED) && await page.$eval('#start', (e) => e.hidden), await page.title());

// Bauen: Hauptgebäude (1), dann ein Haus (2)
await page.keyboard.press('1');
check('Hauptgebäude gebaut', await placeNearCenter('town_center'));
await page.keyboard.press('Escape');
await page.keyboard.press('2');
check('Haus gebaut', await placeNearCenter('house'));
await page.keyboard.press('Escape');

// Ausbilden: Hauptgebäude wählen (H), Dorfbewohner einreihen (V)
await page.keyboard.press('h');
await wait(200);
const foodBefore = await stock('food');
await page.keyboard.press('v');
await wait(300);
check('Dorfbewohner in Ausbildung', (await stock('food')) < foodBefore, `Nahrung ${foodBefore} → ${await stock('food')}`);
await page.keyboard.press('Escape');

// Feld: 6 öffnet das Untermenü, 2 wählt die zweite Frucht, Ziehen steckt ab
await page.keyboard.press('6');
await wait(100);
check('Untermenü der Felder offen', await page.$eval('#build .cmd-page:nth-child(2)', (e) => !e.hidden));
await page.keyboard.press('2');
const farmsBefore = count(await saved(), 'farm');
// Das Spiel beginnt auf Zoom 5 (128 px je Tile) - das Rechteck deckt so ein paar Tiles.
await page.mouse.move(460, 460);
await page.mouse.down();
await page.mouse.move(760, 700, { steps: 10 });
await page.mouse.up();
await wait(200);
const farmsAfter = count(await saved(), 'farm');
check('Feld abgesteckt', farmsAfter > farmsBefore, `${farmsBefore} → ${farmsAfter} Feldstücke`);
await page.keyboard.press('Escape');

// Speichern und neu laden
const before = await saved();
check('Adresse im Spiel', page.url() === `${BASE}/game/${SEED}`, page.url());
await page.reload();
await wait(2500);
check('neu laden bleibt im Spiel', await page.$eval('#start', (e) => e.hidden));
const after = await saved();
check('Spielstand nach Neuladen gleich', after.buildings.length === before.buildings.length,
  `${before.buildings.length} → ${after.buildings.length} Gebäude`);

// Demo: neue Welt "Demo" lädt public/savegame/demo.json
await page.keyboard.press('F10');
await page.click('#menu >> text=Hauptmenü');
await page.click('.confirm .confirm-ok');
await newGame('demo');
const demo = await saved('Demo');
check('Demo geladen', (await page.title()).endsWith('Demo') && demo.villagers.length > 0,
  `${demo.buildings.length} Gebäude, ${demo.villagers.length} Dorfbewohner`);

// Alter Spielstand (Version 2): Tiles halb so groß, Nahrung hieß "berries",
// das Holzfällerlager "lumberjack" - world/save.ts schreibt das beim Laden um.
await page.evaluate(() => {
  localStorage.setItem('pgm.world.Altstand', JSON.stringify({
    version: 2,
    stock: { wood: 100, stone: 0, gold: 0, berries: 77 },
    buildings: [{ t: 'town_center', x: 20, y: 20 }, { t: 'lumberjack', x: 30, y: 20 }],
    villagers: [{ x: 21, y: 22, c: 3, ct: 'berries', task: { kind: 'idle' } }],
    harvested: {},
  }));
  localStorage.setItem('pgm.seed', 'Altstand');
  sessionStorage.setItem('pgm.start', 'continue');
});
await page.goto(BASE + '/');
await wait(2500);
const old = await saved('Altstand');
const camp = old.buildings.find((b) => b.t === 'lumber_camp');
check('alter Stand: berries → food', old.stock.food === 77 && !('berries' in old.stock) && old.villagers[0]?.ct === 'food',
  `Nahrung ${old.stock.food}, Ladung ${old.villagers[0]?.ct}`);
check('alter Stand: lumberjack → lumber_camp, Koordinaten verdoppelt', camp?.x === 60 && camp?.y === 40,
  camp ? `bei ${camp.x}, ${camp.y}` : old.buildings.map((b) => b.t).join(', '));

// Galerie
await page.goto(BASE + '/galerie');
await wait(3000);
check('Galerie zeigt Modelle', (await page.$$('.gal-item')).length > 0, `${(await page.$$('.gal-item')).length} Modelle`);
check('Galerie zeigt Animationen', (await page.$$('.gal-chip')).length > 0);
// Bewegt wird alles von Clips aus Blender - eine leere Bibliothek hieße: diese
// Figuren stehen still (window.__clipLibraries, entityRenderer.ts).
const clipLibraries = await page.evaluate(() => window.__clipLibraries ?? {});
const emptyLibraries = ['humanoid', 'humanoid_sit', 'quadruped', 'mill', 'flag'].filter((n) => !(clipLibraries[n] > 0));
check('Clips aus Blender geladen', emptyLibraries.length === 0,
  emptyLibraries.length ? `leer: ${emptyLibraries.join(', ')}` : Object.entries(clipLibraries).map(([n, c]) => `${n} ${c}`).join(', '));

check('keine Fehler auf der Seite', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
console.log(failed ? `${failed} fehlgeschlagen` : 'alles in Ordnung');
process.exit(failed ? 1 : 0);
