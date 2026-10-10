// Tiere auf dem Gelände (B22): am Hang stehen Vorder- und Hinterhufe auf dem
// Boden (world/render.ts animalGround), die Hufe rutschen beim Gehen und
// Fliehen nicht (AnimalDefinition.stride, FLEE_STRIDE gegen die Clips), und
// am Ufer läuft kein Tier ins Wasser, wie man es sieht.

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { loadModules, makeWorld, run } from './worldFixture.mjs';

const { modules: [render, gl, clips, worldModule, unit], close } = await loadModules(
  '/src/world/render.ts', '/src/gl/entityRenderer.ts', '/src/gl/clips.ts', '/src/world/world.ts', '/src/world/unit/index.ts');
after(close);

// Je Art das Modell der Definition und die Modelle der Geschlechter (B11):
// type = Art (Clips), model = Datei in src/models/animals.
const kinds = Object.values(unit.ANIMALS).flatMap((def) => [
  { ...def, model: def.type },
  ...['female', 'male'].filter((sex) => def[sex]).map((sex) => ({ ...def, ...def[sex], model: `${def.type}_${sex}` })),
]);

test('am Hang: beide Beinpaare stehen auf dem Gelände, an Klippen schwebt keins', () => {
  for (const def of kinds) {
    const legs = gl.animalJoints(def.shape).legs.map((l) => l * def.height);
    // Hang (Steigung 0.5 längs x) und Klippe (4, wie in Testseed bei -6,-62).
    for (const steep of [0.5, 4]) {
      const ground = (x, y) => 2 + steep * x - 0.1 * y;
      for (const heading of [0, 0.3, Math.PI, -2.9]) {
        const [x, y] = [3.3, -7.1];
        const [z, slope] = render.animalGround(ground, def.shape, x, y, def.height, heading);
        // Die Gerade durch beide Hufe - der Shader neigt das Tier auf sie.
        const gaps = legs.map((along) => z + slope * along - ground(x + Math.cos(heading) * along, y + Math.sin(heading) * along));
        assert.ok(gaps.every((g) => g < 1e-9), `${def.model}: kein Huf in der Luft (${gaps.map((g) => g.toFixed(3))})`);
        if (steep < 0.6 - 1e-9) assert.ok(gaps.every((g) => Math.abs(g) < 1e-9), `${def.model}: beide Hufe auf dem Hang`);
        else assert.ok(gaps.some((g) => Math.abs(g) < 1e-9), `${def.model}: ein Huf auf der Klippe`);
      }
    }
    assert.deepEqual(render.animalGround(() => 1.5, def.shape, 0, 0, def.height, 0.7), [1.5, 0]);
  }
});

/**
 * Tiles je Durchlauf des Clips, bei denen der Fuß nicht rutscht: wie schnell
 * der Vorderfuß im tiefsten Punkt seines Schwungs nach hinten läuft.
 */
function slipFree(def, clipName) {
  const clip = gl.ANIMAL_CLIPS.find((c) => c.name === clipName);
  assert.ok(clip, `Clip ${clipName}`);
  const joints = gl.animalJoints(def.shape);
  const baked = clips.bakeClip(clip, joints, {}, clips.QUADRUPED);
  const bone = clips.QUADRUPED_BONE['leg.FL'];
  const texels = clips.TEXELS_PER_BONE * 4;
  const bones = clips.QUADRUPED_BONES.length;
  const n = clip.frames - 1; // das letzte Bild gleicht dem ersten
  const foot = [];
  for (let f = 0; f < n; f++) {
    const m = baked.subarray((f * bones + bone) * texels);
    // Fuß in Ruhe unter dem Gelenk am Boden: (legs[0], 0, 0).
    foot.push({ x: m[0] * joints.legs[0] + m[3], z: m[8] * joints.legs[0] + m[11] });
  }
  let best = -1;
  for (let f = 0; f < n; f++) {
    const back = foot[(f - 1 + n) % n].x > foot[(f + 1) % n].x;
    if (back && (best < 0 || foot[f].z < foot[best].z)) best = f;
  }
  const speed = ((foot[(best - 1 + n) % n].x - foot[(best + 1) % n].x) / 2) * clip.fps;
  return speed * clip.duration * def.height;
}

test('Schrittlänge passt zu den Clips - die Hufe rutschen nicht', () => {
  for (const def of kinds) {
    const own = (pose) => gl.ANIMAL_CLIPS.find((c) => c.pose === pose && (c.species.length === 0 || c.species.includes(def.type))).name;
    const walk = slipFree(def, own(gl.ANIMAL_POSE.walk));
    const flee = slipFree(def, own(gl.ANIMAL_POSE.flee));
    assert.ok(Math.abs(def.stride / walk - 1) < 0.05, `${def.model}: stride ${def.stride}, Clip ${walk.toFixed(3)}`);
    assert.ok(Math.abs(render.FLEE_STRIDE * def.stride / flee - 1) < 0.05,
        `${def.model}: Flucht ${(render.FLEE_STRIDE * def.stride).toFixed(3)}, Clip ${flee.toFixed(3)}`);
  }
});

test('am Ufer: ein fliehendes Tier läuft nicht ins Wasser, wie man es sieht', () => {
  // Alles Wiese (Tiles), aber westlich von x = 10 ist sichtbar Wasser - wie
  // ein Tile am Ufer, durch das die Wasserlinie läuft.
  const world = makeWorld(worldModule.World, () => 'grass');
  world.groundAt = (x) => (x < 10 ? 0 : 0.1);
  assert.equal(world.spawnAround('villager', 13, 5, 1), 1);
  const deer = world.wildlife.add('deer', 11, 5.5);
  let fled = false;
  run(world, 20, () => {
    fled ||= deer.state === 'flee';
    assert.ok(deer.x >= 10, `Reh im Wasser bei x ${deer.x.toFixed(2)}`);
  });
  assert.ok(fled, 'das Reh ist vor dem Dorfbewohner geflohen');
});

test('Größe: Tiere im Maßstab der Dorfbewohner (1 Tile = 5 m), nur der Hase etwas größer', async () => {
  const { readModel } = await import('../tools/models/glb.mjs');
  // Höhe des Modells in Metern (Datei: Y oben).
  const meters = (name) => {
    const ys = readModel(name).obj.split('\n').filter((l) => l.startsWith('v ')).map((l) => Number(l.split(/\s+/)[2]));
    return Math.max(...ys) - Math.min(...ys);
  };
  const TILE = 5;
  for (const def of kinds) {
    const real = meters(`animals/${def.model}`) / TILE;
    const boost = def.type === 'hare' ? 1.25 : 1;
    assert.ok(Math.abs(def.height / (real * boost) - 1) < 0.03, `${def.model}: height ${def.height}, Modell ${(real * boost).toFixed(3)}`);
  }
});
