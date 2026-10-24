// Rauchtest im Browser: spielt die wichtigsten Wege einmal durch - Hauptmenü,
// neues Spiel, bauen, ausbilden, Feld über das Untermenü, Weide, speichern und neu
// laden, Demo, alter Spielstand, Galerie, Baustellen (B26), Clips aus Blender, Kartengenerator (VERIFIED: läuft in make e2e). Bricht mit Exit-Code 1 ab, wenn
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
/** Cheat eingeben wie ein Spieler: Enter, Text, Enter (main.ts, CHEATS). */
async function cheat(code) {
  await page.keyboard.press('Enter');
  await page.keyboard.type(code);
  await page.keyboard.press('Enter');
  await wait(150);
}
/** Ist die Baustelle dieser Art fertig gebaut (B26: im Spielstand ohne `bp`)? */
const finished = async (type) => (await saved()).buildings.some((b) => b.t === type && b.bp === undefined);

/**
 * Im Baumodus Punkte rund um die Bildmitte anklicken, bis eines steht - Wasser
 * oder Hang lassen manche Stellen nicht zu. Liefert die Stelle im Bild, an der
 * es steht, oder null.
 */
async function placeNearCenter(type, seed) {
  const before = count(await saved(seed), type);
  for (let r = 0; r < 6; r++) {
    for (let a = 0; a < 8; a++) {
      const angle = (a / 8) * Math.PI * 2;
      const at = { x: 640 + Math.cos(angle) * r * 60, y: 400 + Math.sin(angle) * r * 45 };
      await page.mouse.click(at.x, at.y);
      await wait(60);
      if (count(await saved(seed), type) > before) return at;
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
check('Hauptmenü: Pagegeist läuft', !!(await page.$('.pagegeist')));
check('erster Besuch wählt keine Welt', (await page.evaluate(() => localStorage.getItem('pgm.seed'))) === null);

// Neues Spiel
await newGame(SEED);
check('neues Spiel startet', (await page.title()).endsWith(SEED) && await page.$eval('#start', (e) => e.hidden), await page.title());
check('im Spiel kein Pagegeist', !(await page.$('.pagegeist')));
// Ohne GPU (SwiftShader) dauert ein Bild Sekunden und Klicks laufen in Zeitüberschreitungen.
console.log(`  GPU: ${await page.evaluate(() => window.getRenderInfo?.().gpu)}`);

// Bauen: Dorfzentrum (1), dann ein Haus (2)
await page.keyboard.press('1');
const tcPoint = await placeNearCenter('town_center');
check('Dorfzentrum gebaut', !!tcPoint);
await cancel();
await page.keyboard.press('2');
const housePoint = await placeNearCenter('house');
// B26: gesetzt wird eine Baustelle - bezahlt, aber erst Dorfbewohner bauen sie.
const houseSite = (await saved()).buildings.find((b) => b.t === 'house');
check('Haus abgesteckt (Baustelle)', !!housePoint && houseSite?.bp === 0, `bp=${houseSite?.bp}`);
await cancel();
const sitePanel = housePoint && await findNear('Baustelle: Haus', housePoint)
  ? await page.$eval('#selection', (e) => e.textContent) : '';
check('Panel der Baustelle', sitePanel.includes('0 % · Bauende 0/4'), sitePanel.slice(0, 80) || 'nicht gefunden');
await cancel();
// Försterhütte (0): Baumart im Panel wählen wie die Frucht beim Feld, Pflanzplatz-Knopf wie der Sammelpunkt (B9).
await page.keyboard.press('0');
const foresterPoint = await placeNearCenter('forester');
check('Försterhütte abgesteckt', !!foresterPoint);
await cancel();
// Bauen (B26): 20 Helfer per Cheat neben der Hütte, per Rahmen wählen (nicht bis an den Bildrand -
// dort scrollt die Kamera), Rechtsklick auf die Baustelle.
// Mit "speedy gonzales" steht sie, sobald einer dort arbeitet; danach bauen sie das Haus nebenan.
await cheat('speedygonzales');
let helpers = null;
for (const [dx, dy] of [[0, 140], [0, -140], [180, 0], [-180, 0], [180, 140], [-180, -140]]) {
  if (!foresterPoint) break;
  const at = { x: foresterPoint.x + dx, y: foresterPoint.y + dy };
  const before = (await saved()).villagers.length;
  await page.mouse.move(at.x, at.y);
  await cheat('ineedhelp');
  if ((await saved()).villagers.length > before) {
    helpers = at;
    break;
  }
}
if (helpers) {
  await page.mouse.move(Math.max(345, helpers.x - 200), Math.max(70, helpers.y - 150));
  await page.mouse.down();
  await page.mouse.move(Math.min(940, helpers.x + 200), Math.min(760, helpers.y + 150), { steps: 8 });
  await page.mouse.up();
  await page.mouse.click(foresterPoint.x, foresterPoint.y, { button: 'right' });
}
for (let i = 0; i < 40 && !(await finished('forester') && await finished('house')); i++) await wait(500);
check('Dorfbewohner bauen Försterhütte und Haus', await finished('forester') && await finished('house'),
  helpers ? JSON.stringify((await saved()).buildings.map((b) => [b.t, b.bp ?? 1])) : 'keine Helfer erschienen');
await cheat('speedygonzales');
await cancel();
if (foresterPoint && await findNear('Försterhütte', foresterPoint)) {
  await page.click('#actions .cmd-btn[data-action=species][data-species=birch]');
  const forester = (await saved()).buildings.find((b) => b.t === 'forester');
  const spotButton = !!(await page.$('#actions .cmd-btn[data-action=rally]'));
  check('Försterhütte: Baumart gewählt, Knopf für den Pflanzplatz', forester?.ts === 'birch' && spotButton,
    `ts=${forester?.ts}, Pflanzplatz-Knopf ${spotButton}`);
} else check('Försterhütte: Baumart gewählt, Knopf für den Pflanzplatz', false, 'Hütte nicht gefunden');
await cancel();

// Sammelpunkt: Ein Rechtsklick setzt ihn nur, wenn genau ein ausbildendes
// Gebäude ausgewählt ist. Hier sind es zwei (Dorfzentrum und Haus, nahe der
// Stelle, an der sie gebaut wurden - die Kamera steht noch), also ändert er nichts.
const rallyAt = async () => (await saved()).buildings.find((b) => b.t === 'town_center')?.r;
const house = housePoint && await findNear('Haus', housePoint);
if (tcPoint) await findNear('Dorfzentrum', tcPoint);
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

// Ausbilden: Dorfzentrum wählen (H), Dorfbewohner einreihen (V)
await page.keyboard.press('h');
await wait(200);
const foodBefore = await stock('food');
await page.keyboard.press('v');
await wait(300);
check('Dorfbewohner in Ausbildung', (await stock('food')) < foodBefore, `Nahrung ${foodBefore} → ${await stock('food')}`);
// Jedes Lager zeigt, was darin liegt (B7) - der Startvorrat liegt im Dorfzentrum, ohne Sorte.
const tcGoods = await page.$eval('#selection .sel-goods', (e) => e.textContent).catch(() => '');
check('Dorfzentrum zeigt seinen Vorrat', /^Vorrat: Nahrung \d+, Holz \d+/.test(tcGoods), tcGoods);
// Forschung (world/research.ts): je Forschung ein Knopf mit Bild - ohne Leder gesperrt, mit dem Grund im Tooltip.
// Das Bild der Gerberei sind die Holzschuhe (SHAPE.clogs) - es blieb leer, solange ihre Teile wie Beine bewegt wurden.
const research = await page.$$eval('#actions .cmd-btn[data-action=research]',
  (bs) => bs.map((b) => [b.dataset.research, b.disabled, b.title, (b.querySelector('img')?.getAttribute('src') ?? '').length > 0]));
check('Dorfzentrum zeigt die Forschung', research.length === 2 && research[0][0] === 'leather_shoes' && research[0][1]
  && research[0][2].startsWith('Gerberei erforschen') && research[0][2].includes('Zu wenig Rohstoffe') && research.every((r) => r[3]),
  JSON.stringify(research));
// Die Warteschlange zeigt jeden Eingereihten als Frau oder Mann - gespeichert wird das mit (q: 1 = Frau).
const queueIcons = await page.$$eval('#selection .sel-queue-unit img', (imgs) => imgs.filter((i) => i.src).length);
const queued = (await saved()).buildings.find((b) => b.t === 'town_center')?.q;
check('Warteschlange zeigt Frau oder Mann', queueIcons === 1 && Array.isArray(queued) && queued.length === 1,
  `${queueIcons} im Panel, gespeichert q=${JSON.stringify(queued)}`);
// Der Ausbilden-Knopf zeigt, wie viele ein Klick einreiht: 1, mit gehaltener Umschalttaste 5.
const trainCount = () => page.$eval('#actions .cmd-btn[data-action=train] .cmd-count', (e) => e.textContent);
const countPlain = await trainCount();
await page.keyboard.down('Shift');
await wait(100);
const countShift = await trainCount();
await page.keyboard.up('Shift');
await wait(100);
const countAfter = await trainCount();
check('Ausbilden-Knopf zeigt 1, mit Umschalt 5', countPlain === '1' && countShift === '5' && countAfter === '1',
  `${countPlain} → ${countShift} → ${countAfter}`);
// Klick auf eine Einheit der Warteschlange bricht genau sie ab - Kosten voll zurück.
// Zwei dazu (3 in der Schlange), dann die oberste Wartende und die in Ausbildung abbrechen: eine bleibt.
await page.keyboard.press('v');
await page.keyboard.press('v');
await wait(200);
const foodQueued = await stock('food');
await page.click('#selection .sel-queue [data-action=cancel-train][data-index="2"]');
await page.click('#selection .sel-training [data-action=cancel-train][data-index="0"]');
await wait(200);
const foodCancelled = await stock('food');
const queueLeft = (await saved()).buildings.find((b) => b.t === 'town_center')?.q;
check('Klick in die Warteschlange bricht ab und erstattet', foodCancelled === foodQueued + 100 && queueLeft?.length === 1,
  `Nahrung ${foodQueued} → ${foodCancelled}, gespeichert q=${JSON.stringify(queueLeft)}`);
// Sammelpunkt mit genau einem Dorfzentrum: Rechtsklick auf die Karte setzt
// ihn. Der Schalter mit der Fahne geht weiter: an, setzt der nächste Klick den Punkt.
const sameRally = (a, b) => JSON.stringify(a) === JSON.stringify(b);
await page.mouse.click(250, 250, { button: 'right' });
const rallyRight = await rallyAt();
check('Rechtsklick setzt Sammelpunkt eines einzelnen Dorfzentrums', Array.isArray(rallyRight), JSON.stringify(rallyRight));
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

// Weide (B27): G, dann wie beim Feld über die Wiese ziehen - je Tile ein Stück Weide.
await page.keyboard.press('g');
const pasturesBefore = count(await saved(), 'pasture');
// Quer übers Bild - unterwegs liegt sicher etwas Wiese, auch neben den Feldern eben.
await page.mouse.move(300, 250);
await page.mouse.down();
await page.mouse.move(1000, 650, { steps: 30 });
await page.mouse.up();
await wait(200);
const pasturesAfter = count(await saved(), 'pasture');
check('Weide abgesteckt', pasturesAfter > pasturesBefore, `${pasturesBefore} → ${pasturesAfter} Weide-Tiles`);
await cancel();

// Mauern (B34): L, dann eine Linie ziehen - beim Loslassen je Tile ein Stück Palisade
// (mindestens zwei: ein Klick gäbe eins; Felder und Weiden von eben lassen Lücken).
// Die Steinmauer ist ohne Forschung gesperrt, der Grund steht im Tooltip.
const stoneButton = await page.$eval('#build .cmd-btn[title^="Steinmauer"]', (b) => ({ disabled: b.disabled, title: b.title }));
check('Steinmauer gesperrt bis zur Forschung', stoneButton.disabled && /erforschen/.test(stoneButton.title), stoneButton.title);
await page.keyboard.press('l');
const wallsBefore = count(await saved(), 'palisade');
await page.mouse.move(300, 300);
await page.mouse.down();
await page.mouse.move(900, 300, { steps: 20 });
await page.mouse.up();
await wait(200);
const wallsAfter = count(await saved(), 'palisade');
check('Palisade als Linie abgesteckt', wallsAfter >= wallsBefore + 2, `${wallsBefore} → ${wallsAfter} Stücke`);
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
// Speermacherei (J, B25): in der Demo reicht das Holz dafür; das Panel zeigt sie wie die Bognerei ohne Arbeiter.
await page.keyboard.press('j');
const spearPoint = await placeNearCenter('spear_maker', 'Demo');
await cancel();
// B26: eine Baustelle - ihr Panel sagt, wie weit und wer baut.
const spearPanel = spearPoint && await findNear('Baustelle: Speermacherei', spearPoint)
  ? await page.$eval('#selection', (e) => e.textContent) : '';
check('Speermacherei abgesteckt', !!spearPoint && spearPanel.includes('Bauende 0/4') && spearPanel.includes('Rechtsklick mit Dorfbewohnern'),
  spearPanel.slice(0, 80) || 'nicht gebaut/gefunden');
await cancel();
// Schusterei (K, B31): wie die Speermacherei, das Panel zeigt dazu ihr leeres Regal.
await page.keyboard.press('k');
const cobblerPoint = await placeNearCenter('cobbler', 'Demo');
await cancel();
const cobblerPanel = cobblerPoint && await findNear('Baustelle: Schusterei', cobblerPoint)
  ? await page.$eval('#selection', (e) => e.textContent) : '';
// Eine Baustelle lagert noch nichts - kein Regal im Panel.
check('Schusterei abgesteckt', !!cobblerPoint && cobblerPanel.includes('Bauende 0/4') && !cobblerPanel.includes('Vorrat'),
  cobblerPanel.slice(0, 80) || 'nicht gebaut/gefunden');
// Schießplatz (B, B24): drei mal drei Tiles; das Panel zählt die Schützen.
await page.keyboard.press('b');
const rangePoint = await placeNearCenter('archery_range', 'Demo');
await cancel();
const rangePanel = rangePoint && await findNear('Baustelle: Schießplatz', rangePoint)
  ? await page.$eval('#selection', (e) => e.textContent) : '';
check('Schießplatz abgesteckt', !!rangePoint && rangePanel.includes('Bauende 0/4') && !rangePanel.includes('Schützen'), rangePanel.slice(0, 80) || 'nicht gebaut/gefunden');
await cancel();

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
// Der eine Vorrat von damals kommt ins Dorfzentrum (World.absorbReserve), ohne Lager bleibt nichts.
const oldGoods = old.buildings.find((b) => b.t === 'town_center')?.g;
check('alter Stand: berries → food, Vorrat im Dorfzentrum', oldGoods?.food?.Nahrung === 77 && oldGoods?.wood?.Holz === 100
  && old.stock.food === 0 && !('berries' in old.stock) && old.villagers[0]?.ct === 'food',
  `Dorfzentrum ${JSON.stringify(oldGoods)}, ohne Lager ${JSON.stringify(old.stock)}, Ladung ${old.villagers[0]?.ct}`);
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
const emptyLibraries = ['humanoid', 'humanoid_sit', 'humanoid_tools', 'humanoid_carry', 'quadruped', 'mill', 'flag'].filter((n) => !(clipLibraries[n] > 0));
check('Clips aus Blender geladen', emptyLibraries.length === 0,
  emptyLibraries.length ? `leer: ${emptyLibraries.join(', ')}` : Object.entries(clipLibraries).map(([n, c]) => `${n} ${c}`).join(', '));

// Kartengenerator: ein Regler je Wert aus TERRAIN_PARAMS, ein geänderter steht in der Adresse.
await page.goto(BASE + '/generator?seed=Testseed');
await wait(2000);
const generatorSliders = await page.$$('.gen-slider input');
check('Generator zeigt Regler', generatorSliders.length > 20, `${generatorSliders.length} Regler`);
await page.locator('.gen-slider', { hasText: 'Meeresspiegel' }).locator('input')
  .evaluate((el) => { el.value = '-0.2'; el.dispatchEvent(new Event('input', { bubbles: true })); });
await wait(500);
check('Generator: geänderter Wert in der Adresse', new URL(page.url()).searchParams.get('seaLevel') === '-0.2', page.url());
await page.click('.gen-buttons >> text=Schräg');
await wait(1500);
check('Generator: schräg', (await page.textContent('.gen-buttons')).includes('Von oben'));
// Billboards von Anfang an, abschaltbar - Fehler beim Zeichnen der Modelle fängt pageErrors unten.
check('Generator: Billboards an', await page.isChecked('.gen-check input'));
await page.uncheck('.gen-check input');
await wait(1000);
const generatorFps = await page.textContent('.gen-fps');
check('Generator zeigt Bilder je Sekunde', /^\d+ Bilder\/s$/.test(generatorFps ?? ''), generatorFps);

check('keine Fehler auf der Seite', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const summary = failed ? `${failed} fehlgeschlagen` : 'alles in Ordnung';
console.log(summary);
mkdirSync(new URL('../../output/', import.meta.url), { recursive: true });
writeFileSync(new URL('../../output/smoke.txt', import.meta.url), `${new Date().toISOString()} ${BASE}\n${results.join('\n')}\n${summary}\n`);
process.exit(failed ? 1 : 0);
