// Exportiert das Skelett der Tiere mit allen Clips als glTF (.glb), gerechnet
// aus den früheren Formeln - daraus entstand einmal src/models/clips/quadruped.glb;
// heute zum Vergleich. Die Clips gelten am Reh (REFERENCE); das Spiel backt sie
// für jede Art mit deren Gelenken (src/gl/clips.ts, QUADRUPED).
//
// Im Shader (Zweig "beast") schwingen die Beine um ihr oberes Gelenk und der
// Kopf nickt um den Halsansatz. Hier wird daraus ein Skelett mit denselben
// Gelenken, und jede Bewegung wird mit denselben Formeln
// (tools/export/animal-poses.mjs) als Animation hineingerechnet.
//
// Daneben schreibt es <Ausgabe>.clips.json: je Clip Pose, Arten, Phasenbereich
// und ob das Tier liegt (wie in src/models/clips/quadruped.json). Dazu Höhe und uGraze des Rehs: das Spiel rechnet damit die
// Verschiebung der Wurzel in Körperhöhen und das Senken des Kopfs je Art um.
//
// Aufruf: node tools/export/animals.mjs [Ausgabedatei]
//   Standard: tools/export/out/quadruped.glb

import { writeFileSync } from 'node:fs';
import { GltfBuilder, parseMtl, parseObj } from './gltf.mjs';
import { ANIMAL_CLIPS, REFERENCE, animalBones, animalPart, animalPose, measureAnimal } from './animal-poses.mjs';
import { readModel } from '../models/glb.mjs';

const root = new URL('../../', import.meta.url).pathname;
const outFile = process.argv.slice(2).find((a) => a.endsWith('.glb')) ?? `${root}tools/export/out/quadruped.glb`;
const FPS = 30;

const reference = readModel(`animals/${REFERENCE}`);
const tris = parseObj(reference.obj);
const colors = parseMtl(reference.mtl);
const j = measureAnimal(tris);
const { H, minY } = j;
/** Modell-Koordinaten (x vorn, y links, z oben, Höhe 1) -> Datei (x links, y oben, z vorn, Meter). */
const toFile = ([x, y, z]) => [y * H, z * H + minY, x * H];

// Knochen: Name, Eltern, Drehpunkt (Modell-Koordinaten) - wie QUADRUPED in src/gl/clips.ts.
const BONES = [
  ['root', null, [0, 0, 0]],
  ['leg.FL', 'root', [j.legs[0], 0, j.hip]], ['leg.FR', 'root', [j.legs[0], 0, j.hip]],
  ['leg.BL', 'root', [j.legs[1], 0, j.hip]], ['leg.BR', 'root', [j.legs[1], 0, j.hip]],
  ['neck', 'root', [j.neck[0], 0, j.neck[1]]], ['head', 'neck', [j.neck[0], 0, j.neck[1]]],
].map(([name, parent, pivot]) => [name, parent, toFile(pivot)]);
const boneIndex = new Map(BONES.map(([name], i) => [name, i]));

const gltf = new GltfBuilder();
const { nodes: boneNodes, skin } = gltf.skeleton('Skelett', BONES);

// Das Reh: jeder Eckpunkt an seinem Knochen - Beine, Kopf, sonst die Wurzel.
const mesh = gltf.mesh('Reh', tris, colors, (t) => {
  const part = animalPart(t.object);
  return boneIndex.get(part === 'body' ? 'root' : part);
});
const meshNode = gltf.node({ name: 'Reh', mesh, skin });
const rigNode = gltf.node({
  name: 'quadruped',
  // Höhe des Rehs in Metern und wie weit es den Kopf zum Äsen senkt (uGraze) -
  // Blender übernimmt beides als Custom Properties des Skeletts.
  extras: { height: H, graze: j.graze },
  children: [boneNodes[0], meshNode],
});

// Je Clip: Bild i zeigt die Phase shift + i / (Bilder - 1) * period - die
// Schleife schließt genau (das letzte Bild ist das erste eine Periode später).
const sidecar = [];
for (const clip of ANIMAL_CLIPS) {
  const frames = Math.round(clip.seconds * FPS) + 1;
  const duration = (frames - 1) / FPS;
  const times = Array.from({ length: frames }, (_, i) => i / FPS);
  const poses = times.map((_, i) => animalBones(
    animalPose(clip.name, clip.shift + (i / (frames - 1)) * clip.period, { graze: j.graze }), H, j.side));
  gltf.animation(clip.name, times, [
    // Die Wurzel: Ruhelage plus Anheben (bzw. Liegen).
    [boneNodes[0], 'translation', poses.flatMap((p) => p.translation.map((v, k) => v + BONES[0][2][k]))],
    ...Object.keys(poses[0].rotations).map((name) => [boneNodes[boneIndex.get(name)], 'rotation', poses.flatMap((p) => p.rotations[name])]),
  ]);
  sidecar.push({
    name: clip.name, pose: clip.pose, props: '', phase_period: clip.period, phase_shift: clip.shift,
    kneel: false, species: clip.species, lying: Boolean(clip.lying), frames, duration,
  });
}

const sceneRoot = gltf.node({ name: 'Tiere.Szene', children: [rigNode] });
const total = gltf.write(outFile, 'Tiere', [sceneRoot]);
writeFileSync(outFile.replace(/\.glb$/, '.clips.json'), JSON.stringify({ height: H, graze: j.graze, clips: sidecar }, null, 2) + '\n');
console.log(`${outFile} - ${(total / 1024).toFixed(0)} KB, Clips: ${sidecar.map((c) => `${c.name} ${c.frames}`).join(', ')}`);
