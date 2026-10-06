// Gedränge (src/world/crowd.ts): Dorfbewohner bekommen eigene Plätze, stehen
// nie in versperrten Tiles, schieben sich auseinander und kommen bei
// Gegenverkehr in einer Gasse von einem Tile aneinander vorbei.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CROWDED_ARRIVAL, FORMATION_GAP, PERSONAL_SPACE, freeSpot, occupied, separate, standable, steer } from '../src/world/crowd.ts';

const open = () => false;
const minDistance = (points) => {
  let min = Infinity;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) min = Math.min(min, Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y));
  }
  return min;
};

test('freier Punkt bleibt, wie er ist - auch mitten im Tile', () => {
  assert.deepEqual(freeSpot(3.27, -4.81, [], open), { x: 3.27, y: -4.81 });
});

test('30 Befehle auf denselben Punkt: jeder ein eigener Platz, nichts wird mehr geschoben', () => {
  const blocked = (x, y) => x === 5 && y === 5; // ein Baum daneben
  const taken = [];
  for (let i = 0; i < 30; i++) {
    const spot = freeSpot(4.9, 5.5, taken, blocked);
    assert.ok(spot, `Platz für Nummer ${i}`);
    assert.ok(standable(spot.x, spot.y, blocked), `Platz ${i} nicht im Baum`);
    taken.push(spot);
  }
  assert.ok(minDistance(taken) >= FORMATION_GAP - 1e-9, `kleinster Abstand ${minDistance(taken)}`);
  assert.ok(Math.hypot(taken[0].x - 4.9, taken[0].y - 5.5) < 0.2, 'der Erste steht nah am Punkt');
  assert.equal(separate(taken, taken.map(() => false), blocked), false, 'stehen sie, schiebt niemand');
});

test('Klick ins Wasser: ans Ufer, so nah wie möglich; mitten im See kein Platz', () => {
  const water = (x) => x >= 0; // Ufer bei x = 0
  const spot = freeSpot(0.5, 0.5, [], water);
  assert.ok(spot && spot.x < 0 && spot.x > -0.5, `Platz ${JSON.stringify(spot)}`);
  assert.equal(freeSpot(20.5, 0.5, [], water), null);
});

test('genau aufeinander: auseinander auf PERSONAL_SPACE, Arbeitende bleiben stehen', () => {
  const a = { x: 2.5, y: 2.5 }, b = { x: 2.5, y: 2.5 };
  separate([a, b], [false, false], open);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= PERSONAL_SPACE - 1e-9);

  const worker = { x: 1.5, y: 1.5 }, walker = { x: 1.55, y: 1.5 };
  separate([worker, walker], [true, false], open);
  assert.deepEqual(worker, { x: 1.5, y: 1.5 });
  assert.ok(Math.hypot(walker.x - worker.x, walker.y - worker.y) >= PERSONAL_SPACE - 1e-9);
});

test('Raster übersieht keine Überlappung, auch über Zellgrenzen und bei negativen Lagen', () => {
  // 300 Figuren dicht auf wenigen Tiles um den Ursprung (wie ein großes
  // Dorf): nach einigen Aufrufen sind die Überlappungen fast weg.
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const units = Array.from({ length: 300 }, () => ({ x: rand() * 6 - 3, y: rand() * 6 - 3 }));
  const overlap = () => {
    let sum = 0;
    for (let i = 0; i < units.length; i++) for (let j = i + 1; j < units.length; j++) {
      sum += Math.max(0, PERSONAL_SPACE - Math.hypot(units[i].x - units[j].x, units[i].y - units[j].y));
    }
    return sum;
  };
  const before = overlap();
  for (let k = 0; k < 20; k++) separate(units, units.map(() => false), open);
  assert.ok(overlap() < before * 0.05, `Überlappung ${before} → ${overlap()}`);

  // Zwei knapp beiderseits einer Zellgrenze, bei negativen Lagen.
  const a = { x: -PERSONAL_SPACE - 0.01, y: -0.5 }, b = { x: -PERSONAL_SPACE + 0.01, y: -0.5 };
  separate([a, b], [false, false], open);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= PERSONAL_SPACE - 1e-9);
});

test('nie in ein versperrtes Tile geschoben', () => {
  const blocked = (x) => x < 0;
  const a = { x: 0.02, y: 0.5 }, b = { x: 0.1, y: 0.5 };
  separate([a, b], [false, false], blocked);
  assert.ok(a.x >= 0, `a.x ${a.x}`);
});

/**
 * Läuft die Figuren `seconds` lang wie VillagerWork.walk: zum Ziel (tx, ty),
 * ausweichen, aber nicht ins Versperrte; angekommen bei 0.05 oder wenn das
 * Ziel besetzt ist. Danach separate(). Gibt den kleinsten Abstand zurück.
 */
function simulate(units, blocked, seconds) {
  const speed = 0.8, dt = 1 / 30;
  let closest = Infinity;
  for (let tick = 0; tick < seconds * 30; tick++) {
    for (const u of units) {
      if (u.arrived) continue;
      const dx = u.tx - u.x, dy = u.ty - u.y, d = Math.hypot(dx, dy);
      if (d < 0.05 || (d < CROWDED_ARRIVAL && occupied(u, u.tx, u.ty, units))) {
        u.arrived = true;
        continue;
      }
      const step = Math.min(speed * dt, d);
      let [ux, uy] = [dx / d, dy / d];
      const [sx, sy] = steer(u, ux, uy, units);
      if (!blocked(Math.floor(u.x + sx * step), Math.floor(u.y + sy * step))) [ux, uy] = [sx, sy];
      u.x += ux * step;
      u.y += uy * step;
    }
    separate(units, units.map(() => false), blocked);
    closest = Math.min(closest, minDistance(units));
    for (const u of units) assert.ok(!blocked(Math.floor(u.x), Math.floor(u.y)), `im Versperrten bei ${u.x},${u.y}`);
  }
  return closest;
}

test('Gegenverkehr in einer Gasse von einem Tile: beide kommen an, keiner geht durch den anderen', () => {
  // Nur die Reihe y = 0 ist frei, x von 0 bis 9.
  const blocked = (x, y) => y !== 0 || x < 0 || x > 9;
  const a = { x: 0.5, y: 0.5, tx: 9.5, ty: 0.5 }, b = { x: 9.5, y: 0.5, tx: 0.5, ty: 0.5 };
  const closest = simulate([a, b], blocked, 30);
  assert.ok(a.arrived && b.arrived, `a bei ${a.x}, b bei ${b.x}`);
  assert.ok(closest >= PERSONAL_SPACE - 1e-6, `kamen sich auf ${closest} nah`);
});

test('zwei mit demselben Ziel: beide kommen an, statt sich endlos zu schieben', () => {
  const a = { x: 1, y: 3, tx: 2.5, ty: 2.5 }, b = { x: 4, y: 3, tx: 2.5, ty: 2.5 };
  simulate([a, b], open, 10);
  assert.ok(a.arrived && b.arrived, `a ${a.arrived}, b ${b.arrived}`);
});
