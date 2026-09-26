// Die Modelle als .glb (tools/models/glb.mjs): jedes lässt sich lesen und
// verlustfrei wieder schreiben, die Namen im Spiel folgen den Regeln für
// Blender (doppelte mit "#", Kopien mit ".001"), und Lage, Drehung und Größe
// der Knoten - so speichert Blender verschobene Objekte - werden eingerechnet.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gameName, glbToObj, modelNames, objToGlb, readModel } from '../tools/models/glb.mjs';

const MODELS = modelNames();

test('jedes Modell lässt sich lesen und unverändert wieder schreiben', () => {
  assert.ok(MODELS.length > 0);
  for (const model of MODELS) {
    const { obj, mtl } = readModel(model);
    assert.ok(/^f /m.test(obj), `${model}: keine Flächen`);
    assert.deepEqual(glbToObj(objToGlb(obj, mtl), `${model}.mtl`), { obj, mtl }, `${model}: ändert sich beim Schreiben`);
  }
});

test('aufgemalte Details (Bild "Detail…") kommen als map_detail mit Texturkoordinaten an', () => {
  const { obj, mtl } = readModel('villagers/male');
  assert.match(mtl, /^map_detail data:image\/png;base64,/m);
  assert.doesNotMatch(mtl, /^map_Kd /m, 'Details dürfen keine Bildtextur werden');
  assert.match(obj, /^f \d+\/\d+ /m);
});

test('Namen im Spiel: bis zum "#", Kopien aus Blender ohne ".001"', () => {
  const names = new Set(['Window.Bar', 'Berry.100', 'Entry']);
  assert.equal(gameName('Window.Bar#3', names), 'Window.Bar');
  assert.equal(gameName('Window.Bar.001', names), 'Window.Bar');
  assert.equal(gameName('Berry.100#2.001', names), 'Berry.100');
  assert.equal(gameName('Berry.100', names), 'Berry.100');
  assert.equal(gameName('Berry.101', names), 'Berry.101');
  assert.equal(gameName('Laterne.001', names), 'Laterne.001');
});

test('doppelte Namen bleiben doppelt', () => {
  const obj = 'o Bar\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\no Bar\nv 0 0 1\nv 1 0 1\nv 0 1 1\nf 4 5 6\n';
  const back = glbToObj(objToGlb(obj, ''));
  assert.deepEqual(back.obj.split('\n').filter((l) => l.startsWith('o ')), ['o Bar', 'o Bar']);
});

/** .glb mit geändertem JSON-Teil (Länge darf sich ändern). */
function withJson(bytes, change) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
  change(json);
  let text = new TextEncoder().encode(JSON.stringify(json));
  text = Uint8Array.from([...text, ...new Array((4 - (text.length % 4)) % 4).fill(0x20)]);
  const rest = bytes.subarray(20 + length);
  const out = new Uint8Array(20 + text.length + rest.length);
  const o = new DataView(out.buffer);
  o.setUint32(0, 0x46546c67, true);
  o.setUint32(4, 2, true);
  o.setUint32(8, out.length, true);
  o.setUint32(12, text.length, true);
  o.setUint32(16, 0x4e4f534a, true);
  out.set(text, 20);
  out.set(rest, 20 + text.length);
  return out;
}

test('Lage, Drehung und Größe der Knoten und ihrer Eltern werden eingerechnet', () => {
  const glb = objToGlb('o Part\nv 1 0 0\nv 0 1 0\nv 0 0 1\nf 1 2 3\n', '');
  const moved = withJson(glb, (json) => {
    // Eltern: 90° um Y (x -> -z), Kind: doppelt so groß, 1 m nach oben
    json.nodes[0].scale = [2, 2, 2];
    json.nodes[0].translation = [0, 1, 0];
    json.nodes.push({ name: 'Parent', rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2], children: [0] });
    json.scenes[0].nodes = [json.nodes.length - 1];
  });
  const points = glbToObj(moved).obj.split('\n').filter((l) => l.startsWith('v ')).map((l) => l.slice(2));
  assert.deepEqual(points, ['0 1 -2', '0 3 0', '2 1 0']);
});
