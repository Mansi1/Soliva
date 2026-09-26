// Renders the resource bar icons (src/icons/*.png) from the game's own models:
// oak for wood, currant bush for food, gold rock, stone pile, and the two
// villagers for population and idle. Transparent background, 256 x 256.
// Usage: node tools/ui/icons.mjs [outDir] (default src/icons)
import { readFileSync } from 'node:fs';
import { launch } from './browser.mjs';
import { readModel } from '../models/glb.mjs';

const out = process.argv[2] ?? new URL('../../src/icons', import.meta.url).pathname;
const load = (name) => readModel(name);
const data = {
  wood: load('trees/oak'), berries: load('resources/berry_bush_1'), gold: load('resources/gold_1'), stone: load('resources/stone_1'),
  male: load('villagers/male'), female: load('villagers/female'),
};
const page = readFileSync(new URL('./icons.html', import.meta.url), 'utf8')
  .replace('<script src="icondata.js"></script>', `<script>const D=${JSON.stringify(data)};</script>`);

const b = await launch();
for (const k of ['wood', 'berries', 'gold', 'stone', 'population', 'idle']) {
  // Je Symbol eine frische Seite - setContent behielte die globalen Namen.
  const p = await b.newPage({ viewport: { width: 256, height: 256 } });
  p.on('pageerror', (e) => console.error('icons.html:', e.message));
  await p.setContent(page.replace("new URLSearchParams(location.search).get('k')", JSON.stringify(k)));
  await p.waitForTimeout(100);
  await p.screenshot({ path: `${out}/${k}.png`, omitBackground: true, clip: { x: 0, y: 0, width: 256, height: 256 } });
  await p.close();
}
await b.close();
