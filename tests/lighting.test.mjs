// Sonne und Wetter (src/game/Lighting.ts): die Sonne startet, wo die feste
// Sonne von früher stand, bleibt ein Einheitsvektor über dem Horizont, und das
// Wetter hält sich in seinen Grenzen - je Welt gleich, ohne Sprünge.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Lighting } from '../src/game/Lighting.ts';
import { CLASSIC_LIGHT } from '../src/gl/light.ts';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('am Anfang steht die Sonne wie früher', () => {
  const dir = new Lighting('Welt').frame().dir;
  CLASSIC_LIGHT.dir.forEach((c, i) => assert.ok(close(dir[i], c), `dir[${i}] ${dir[i]} statt ${c}`));
});

test('Sonne und Wetter bleiben in ihren Grenzen, ohne Sprünge', () => {
  const light = new Lighting('Welt');
  let before = light.frame();
  for (let i = 0; i < 20000; i++) {
    light.update(1 / 30);
    const now = light.frame();
    assert.ok(close(Math.hypot(...now.dir), 1, 1e-6), 'Richtung hat Länge 1');
    assert.ok(now.dir[2] > 0, 'Sonne über dem Horizont');
    assert.ok(now.level >= 0.8 && now.level <= 1, `Helligkeit ${now.level}`);
    assert.ok(now.contrast >= 0.25 - 1e-9 && now.contrast <= 1, `Kontrast ${now.contrast}`);
    assert.ok(Math.abs(now.level - before.level) < 0.01, 'Wetter wechselt weich');
    before = now;
  }
});

test('Regen nur im Dunkeln und höchstens 30 s am Stück', () => {
  const light = new Lighting('Welt');
  let wet = 0;
  let longest = 0;
  let showers = 0;
  let lastRain = 0;
  for (let i = 0; i < 30 * 3600; i++) {
    light.update(1 / 30);
    const rain = light.rain;
    assert.ok(rain >= 0 && rain <= 1, `Regen ${rain}`);
    // Nie schlagartig: 8 s von 0 auf 1, weich - höchstens 1,5 × so steil wie linear.
    assert.ok(Math.abs(rain - lastRain) <= (1.5 / 8) / 30 + 1e-9, `Sprung ${lastRain} → ${rain}`);
    lastRain = rain;
    if (rain > 0) {
      assert.ok(light.frame().level < 0.9, 'es regnet nur, wenn es dunkel ist');
      if (wet === 0) showers++;
      wet += 1 / 30;
      longest = Math.max(longest, wet);
    } else wet = 0;
  }
  assert.ok(longest <= 30 + 1e-6, `längster Schauer ${longest} s`);
  assert.ok(showers > 0, 'in einer Stunde regnet es wenigstens einmal');
});

test('meist Sonne: mindestens 80 % Sonnenschein, höchstens 20 % Regen', () => {
  let sun = 0;
  let rain = 0;
  let n = 0;
  for (const seed of ['Welt', 'Demo', 'Bench', 'x1', 'x2', 'x3']) {
    const light = new Lighting(seed);
    for (let i = 0; i < 10 * 3600; i++) {
      light.update(1);
      // Sonnenschein: mehr gerichtetes als flaches Licht.
      if (light.frame().contrast >= 0.625) sun++;
      if (light.rain > 0) rain++;
      n++;
    }
  }
  assert.ok(sun / n >= 0.8, `Sonne ${((sun / n) * 100).toFixed(1)} %`);
  assert.ok(rain / n <= 0.2, `Regen ${((rain / n) * 100).toFixed(1)} %`);
});

test('gleiche Welt, gleiches Wetter', () => {
  const a = new Lighting('Welt');
  const b = new Lighting('Welt');
  a.update(123);
  b.update(123);
  assert.deepEqual(a.frame(), b.frame());
});
