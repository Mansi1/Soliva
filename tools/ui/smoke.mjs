// Rauchtest im Browser: spielt die wichtigsten Wege einmal durch - Hauptmenü,
// neues Spiel, bauen, ausbilden, Feld über das Untermenü, speichern und neu
// laden, Demo, alter Spielstand, Galerie, Clips aus Blender. Bricht mit Exit-Code 1 ab, wenn
// etwas fehlt oder die Seite einen Fehler wirft.
//
// Aufruf: erst `npm run dev`, dann `npm run smoke` bzw.
// `node tools/ui/smoke.mjs [Adresse]` (Standard http://localhost:5173).
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch } from './browser.mjs';

const BASE = (process.argv[2] ?? 'http://localhost:5173').replace(/\/+$/, '');
const SEED = 'Rauchtest';

const browser = await launch();
// Eigener Kontext: leerer localStorage, als käme man zum ersten Mal.
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
// WebGL2-Kontexte merken - der Test unten lässt den der Symbole verloren gehen.
await page.addInitScript(() => {
  const getContext = HTMLCanvasElement.prototype.getContext;
  window.__webgl2 = [];
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const ctx = getContext.call(this, type, ...rest);
    if (type === 'webgl2' && ctx && !window.__webgl2.includes(ctx)) window.__webgl2.push(ctx);
    return ctx;
  };
});

let failed = 0;
/** Alle Prüfzeilen - landen am Ende als Bericht in output/smoke.txt (make e2e). VERIFIED: das defuss-vae-Gate verlangt nach e2e eine frische Datei in output/ (tests.e2e.evidence). */
const results = [];
function check(what, ok, detail = '') {
  const line = `${ok ? '✓' : '✗'} ${what}${detail ? ` - ${detail}` : ''}`;
  console.log(line);
  results.push(line);
  if (!ok) failed++;
}

const wait = (ms) => page.waitForTimeout(ms);
const menuOpen = () => page.$eval('#menu', (e) => !e.hidden);
/** Esc bricht ab, was läuft - ist nichts mehr da, öffnet es das Menü; das dann gleich wieder zu. */
async function cancel() {
  await page.keyboard.press('Escape');
  if (await menuOpen()) await page.keyboard.press('Escape');
}
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
 * oder Hang lassen manche Stellen nicht zu. Liefert die Stelle im Bild, an der
 * es steht, oder null.
 */
async function placeNearCenter(type) {
  const before = count(await saved(), type);
  for (let r = 0; r < 6; r++) {
    for (let a = 0; a < 8; a++) {
      const angle = (a / 8) * Math.PI * 2;
      const at = { x: 640 + Math.cos(angle) * r * 60, y: 400 + Math.sin(angle) * r * 45 };
      await page.mouse.click(at.x, at.y);
      await wait(60);
      if (count(await saved(), type) > before) return at;
    }
  }
  return null;
}

/**
 * Rund um `near` klicken, bis das Panel ein Gebäude mit diesem Namen zeigt - das
 * Modell steht nicht genau dort, wo beim Bauen geklickt wurde. Liefert die
 * Stelle oder null.
 */
async function findNear(label, near) {
  for (let r = 0; r < 5; r++) {
    for (let a = 0; a < (r === 0 ? 1 : 8); a++) {
      const angle = (a / 8) * Math.PI * 2;
      const at = { x: near.x + Math.cos(angle) * r * 40, y: near.y + Math.sin(angle) * r * 30 };
      await page.mouse.click(at.x, at.y);
      if ((await page.$eval('#selection', (e) => e.textContent)).startsWith(label)) return at;
    }
  }
  return null;
}

// Das Menü (#start, im Spiel versteckt) baut erst nachgeladenes JS auf: import() nach dem load-Ereignis,
// samt ~18 MB world-Chunk. Eine feste Pause allein reichte auf einem langsamen CI-Runner nicht.
const started = () => page.waitForSelector('#start', { state: 'attached', timeout: 30_000 });

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
await started();
await wait(2500);
check('Hauptmenü beim Öffnen', await page.$eval('#start', (e) => !e.hidden));
check('Hauptmenü hat Einzelspieler', !!(await page.$('#start >> text=Einzelspieler')));
check('erster Besuch wählt keine Welt', (await page.evaluate(() => localStorage.getItem('pgm.seed'))) === null);

// Neues Spiel
await newGame(SEED);
check('neues Spiel startet', (await page.title()).endsWith(SEED) && await page.$eval('#start', (e) => e.hidden), await page.title());
// Ohne GPU (SwiftShader) dauert ein Bild Sekunden und Klicks laufen in Zeitüberschreitungen.
console.log(`  GPU: ${await page.evaluate(() => window.getRenderInfo?.().gpu)}`);

// Bauen: Hauptgebäude (1), dann ein Haus (2)
await page.keyboard.press('1');
const tcPoint = await placeNearCenter('town_center');
check('Hauptgebäude gebaut', !!tcPoint);
await cancel();
await page.keyboard.press('2');
const housePoint = await placeNearCenter('house');
check('Haus gebaut', !!housePoint);
await cancel();

// Sammelpunkt: Ein Rechtsklick setzt ihn nur, wenn genau ein ausbildendes
// Gebäude ausgewählt ist. Hier sind es zwei (Hauptgebäude und Haus, nahe der
// Stelle, an der sie gebaut wurden - die Kamera steht noch), also ändert er nichts.
const rallyAt = async () => (await saved()).buildings.find((b) => b.t === 'town_center')?.r;
const house = housePoint && await findNear('Haus', housePoint);
if (tcPoint) await findNear('Hauptgebäude', tcPoint);
// Fehlt eine Stelle, geht der Klick ins Leere - dann fehlt „2 Gebäude“ und der Check schlägt fehl.
await page.keyboard.down('Shift');
await page.mouse.click(house?.x ?? 0, house?.y ?? 0);
await page.keyboard.up('Shift');
const many = await page.$eval('#selection', (e) => e.textContent);
await page.mouse.click(250, 250, { button: 'right' });
const rallyMany = await rallyAt();
check('Rechtsklick mit mehreren Gebäuden setzt keinen Sammelpunkt', many.includes('2 Gebäude') && rallyMany === undefined,
  `Auswahl: ${many.slice(0, 20)}, Sammelpunkt: ${JSON.stringify(rallyMany)}`);
await cancel();

// Ausbilden: Hauptgebäude wählen (H), Dorfbewohner einreihen (V)
await page.keyboard.press('h');
await wait(200);
const foodBefore = await stock('food');
await page.keyboard.press('v');
await wait(300);
check('Dorfbewohner in Ausbildung', (await stock('food')) < foodBefore, `Nahrung ${foodBefore} → ${await stock('food')}`);
// Die Warteschlange zeigt jeden Eingereihten als Frau oder Mann - gespeichert wird das mit (q: 1 = Frau).
const queueIcons = await page.$$eval('#selection .sel-queue-unit img', (imgs) => imgs.filter((i) => i.src).length);
const queued = (await saved()).buildings.find((b) => b.t === 'town_center')?.q;
check('Warteschlange zeigt Frau oder Mann', queueIcons === 1 && Array.isArray(queued) && queued.length === 1,
  `${queueIcons} im Panel, gespeichert q=${JSON.stringify(queued)}`);
// Sammelpunkt mit genau einem Hauptgebäude: Rechtsklick auf die Karte setzt
// ihn. Der Schalter mit der Fahne geht weiter: an, setzt der nächste Klick den Punkt.
const sameRally = (a, b) => JSON.stringify(a) === JSON.stringify(b);
await page.mouse.click(250, 250, { button: 'right' });
const rallyRight = await rallyAt();
check('Rechtsklick setzt Sammelpunkt eines einzelnen Hauptgebäudes', Array.isArray(rallyRight), JSON.stringify(rallyRight));
await page.click('#actions .cmd-btn[data-action=rally]');
await page.mouse.click(300, 270);
const rallySwitch = await rallyAt();
check('Sammelpunkt über den Schalter', Array.isArray(rallySwitch) && !sameRally(rallySwitch, rallyRight),
  `vorher: ${JSON.stringify(rallyRight)}, mit Schalter: ${JSON.stringify(rallySwitch)}`);
await cancel();

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
await cancel();

// Ist nichts mehr abzubrechen, öffnet Esc das Menü, ein weiteres Esc schließt es.
for (let i = 0; i < 4 && !(await menuOpen()); i++) await page.keyboard.press('Escape');
check('Esc öffnet zuletzt das Menü', await menuOpen());
// Musikspieler im Menü: Titel, Interpret und Spotify-Link kommen aus den ID3-Tags der MP3 (trackTags.ts).
const player = await page.waitForFunction(() => {
  const artist = document.querySelector('#menu .menu-track-meta')?.textContent;
  const link = document.querySelector('#menu .menu-spotify');
  return artist && link && !link.hidden ? { title: document.querySelector('#menu .menu-track-title').textContent, artist, link: link.href } : null;
}, null, { timeout: 10_000 }).then((h) => h.jsonValue(), () => null);
check('Musikspieler zeigt die Tags des Stücks', player?.artist === 'Aron Homberg' && player.link.startsWith('https://open.spotify.com/album/'),
  player ? `${player.title} - ${player.artist}` : 'keine Tags im Menü');
check('automatisch flachlegen ist aus', !(await page.isChecked('#menu label:has-text("Gelände automatisch flachlegen") input')));
await page.keyboard.press('Escape');
check('Esc schließt das Menü', !(await menuOpen()));

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

// Verliert die Symbol-Bühne (modelIcons.ts, 320×400, nicht auf der Seite) ihren
// WebGL-Kontext - GPU-Neustart, Ruhezustand -, müssen neue Symbole trotzdem
// erscheinen: eine andere Spielerfarbe zeichnet die Gebäude im Baumenü neu.
await page.evaluate(() => window.__webgl2.find((gl) => !gl.canvas.isConnected && gl.canvas.height === 400)
  .getExtension('WEBGL_lose_context').loseContext());
await page.keyboard.press('F10');
await page.click('#menu .menu-colors button >> nth=1');
await page.keyboard.press('F10');
await wait(300);
const iconPixels = await page.evaluate(async () => {
  const img = document.querySelector('#build .cmd-btn img');
  await img.decode().catch(() => {});
  const ctx = Object.assign(document.createElement('canvas'), { width: 34, height: 34 }).getContext('2d');
  ctx.drawImage(img, 0, 0, 34, 34);
  return ctx.getImageData(0, 0, 34, 34).data.filter((v, i) => i % 4 === 3 && v > 8).length;
});
check('Symbole nach verlorenem WebGL-Kontext', iconPixels > 0, `${iconPixels} deckende Pixel im ersten Gebäude`);

// Alter Spielstand (Version 2): Tiles halb so groß, Nahrung hieß "berries",
// das Holzfällerlager "lumberjack" - world/save.ts schreibt das beim Laden um.
await page.evaluate(() => {
  localStorage.setItem('pgm.world.Altstand', JSON.stringify({
    version: 2,
    stock: { wood: 100, stone: 0, gold: 0, berries: 77 },
    buildings: [{ t: 'town_center', x: 20, y: 20, q: 2 }, { t: 'lumberjack', x: 30, y: 20 }],
    villagers: [{ x: 21, y: 22, c: 3, ct: 'berries', task: { kind: 'idle' } }],
    harvested: {},
  }));
  localStorage.setItem('pgm.seed', 'Altstand');
  sessionStorage.setItem('pgm.start', 'continue');
});
await page.goto(BASE + '/');
await started();
await wait(2500);
const old = await saved('Altstand');
const camp = old.buildings.find((b) => b.t === 'lumber_camp');
check('alter Stand: berries → food', old.stock.food === 77 && !('berries' in old.stock) && old.villagers[0]?.ct === 'food',
  `Nahrung ${old.stock.food}, Ladung ${old.villagers[0]?.ct}`);
check('alter Stand: lumberjack → lumber_camp, Koordinaten verdoppelt', camp?.x === 60 && camp?.y === 40,
  camp ? `bei ${camp.x}, ${camp.y}` : old.buildings.map((b) => b.t).join(', '));
// Damals war die Warteschlange nur eine Anzahl (q: 2) - jetzt je Einheit Frau oder Mann. Wer
// schon fertig ist, steht als Dorfbewohner da: zusammen bleiben es 1 + 2.
const oldQueue = old.buildings.find((b) => b.t === 'town_center')?.q;
check('alter Stand: Warteschlange als Anzahl', Array.isArray(oldQueue) && oldQueue.length + old.villagers.length === 3,
  `q=${JSON.stringify(oldQueue)}, ${old.villagers.length} Dorfbewohner`);

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
const summary = failed ? `${failed} fehlgeschlagen` : 'alles in Ordnung';
console.log(summary);
mkdirSync(new URL('../../output/', import.meta.url), { recursive: true });
writeFileSync(new URL('../../output/smoke.txt', import.meta.url), `${new Date().toISOString()} ${BASE}\n${results.join('\n')}\n${summary}\n`);
process.exit(failed ? 1 : 0);
