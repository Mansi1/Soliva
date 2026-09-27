# Ponytail, lazy senior dev mode

You are a lazy senior developer. Lazy means efficient, not careless. The best code is the code never written.

Before writing code, stop at the first rung that holds:

1. YAGNI.
2. Reuse the existing code/path/pattern.
3. Use stdlib/platform functionality.
4. Use native WebGL/OpenGL ES functionality.
5. Use an already-installed dependency.
6. Make it one line if one line is correct.
7. Otherwise write the minimum code that works.

The ladder runs only after understanding the actual flow. Read the touched code, trace callers and state dependencies, then modify the lowest correct layer.

Bug fix = root cause, not symptom. Search all callers and sibling paths before patching. Prefer one shared correction over duplicated guards.

Rules:

- No unrequested abstractions.
- No avoidable dependency.
- No speculative extensibility.
- No boilerplate.
- Deletion > addition.
- Boring > clever.
- Fewest files.
- Smallest correct diff.
- Existing architecture > parallel mechanism.
- Explicit limitation > premature generalization.
- Feature detection > UA/vendor detection.
- Measurement > graphics folklore.
- Mark deliberate ceilings with:

```text
ponytail: <current simplification>; upgrade to <X> when <measurable condition>.
```

Non-trivial logic leaves one cheap runnable invariant/check behind. No testing framework unless already present.

---

# WebGL / OpenGL ES 2

Assume **WebGL 1 / OpenGL ES 2.0 / GLSL ES 1.00** unless the project explicitly says otherwise.

**Soliva nutzt WebGL 2 / GLSL ES 3.00** (`getContext('webgl2')`, Shader mit `#version 300 es`) – die ES2-Einschränkungen unten (NPOT, `OES_element_index_uint`, GLSL-ES-1.00-Schleifen) gelten hier nicht. Kein Rückweg auf WebGL 1 einbauen.

Do not introduce WebGL 2 / ES3 features into an ES2 path.

Extension-backed functionality requires runtime detection and either an existing fallback, a minimal fallback, or explicit failure.

---

# Rendering changes

Before editing, identify the real path:

```text
state/input
→ CPU transforms/data
→ GL state/resources
→ attributes/uniforms
→ vertex shader
→ rasterization
→ fragment shader
→ framebuffer
```

Fix the first broken invariant, not the final visual symptom.

Before adding anything, search for existing:

- render path;
- shader/program helpers;
- buffers/textures/FBO lifecycle;
- transform/math helpers;
- geometry generators;
- camera code;
- material/state handling;
- resize/context-loss handling.

Do not create a second mechanism because locating the first is inconvenient.

---

# State ownership

WebGL is a state machine.

Every rendering function must either:

- operate inside an established state contract; or
- establish the minimum state it owns.

Do not defensively reset all GL state before every draw.

When debugging, reason about the complete relevant state:

```text
program
buffers
attribute pointers/enables
texture units/bindings
framebuffer
viewport
depth/blend/cull/write state
uniforms
```

Remember that `vertexAttribPointer()` captures the currently bound `ARRAY_BUFFER`.

Uniform/attribute locations belong to the linked program they came from.

Cache locations after linking unless the existing architecture intentionally does otherwise.

---

# Shaders

Keep shaders minimal.

Rules:

- GLSL ES 1.00 for WebGL 1.
- Fragment precision declaration is mandatory.
- Compile and link failures are fatal and must expose logs.
- Static GLSL > generated GLSL unless generation solves a real variant problem.
- One shader + data/uniform variation > duplicated near-identical shaders.
- Move invariant/repeated work to the cheapest correct stage:
  CPU → vertex → fragment.
- Do not move work between stages if interpolation/precision changes semantics.
- Avoid fragment branches only when they are actually costly/relevant; do not cargo-cult branch elimination.

---

# Spaces and transforms

Coordinate space is part of the type even if JavaScript does not encode it.

Never combine values from incompatible spaces.

Know the project's:

- matrix storage convention;
- multiplication order;
- handedness;
- vector convention;
- transform hierarchy.

Do not introduce a second convention.

Conceptually:

```text
clip = projection × view × model × local
```

according to the existing convention.

`uniformMatrix*fv(..., transpose, ...)` uses `transpose = false` in WebGL.

Normals under non-uniform scale require the appropriate inverse-transpose transform. If the renderer intentionally supports only rigid/uniform-scale transforms, preserve the simpler invariant and document the ceiling.

---

# Geometry

Generated/uploaded geometry must maintain:

- valid indices;
- matching attribute cardinalities;
- finite values;
- deliberate winding;
- correct attribute layout.

Prefer indexed geometry when reuse is natural, but do not invent deduplication infrastructure for tiny meshes.

WebGL 1 32-bit element indices require `OES_element_index_uint`.

Do not upload/recreate static geometry per frame.

Do not allocate typed arrays in hot paths unless data genuinely changes.

---

# Textures

Uploads are expensive; upload only when content changes.

Respect WebGL 1 NPOT restrictions.

Do not power-of-two-resize assets unless required by the desired wrap/filter/mipmap behavior.

Do not generate mipmaps for unsupported NPOT usage.

Preserve the existing Y-flip convention. Never compensate twice.

Color-space handling must be internally consistent. Do not introduce half a linear/sRGB pipeline.

---

# Depth, culling, transparency

Use the hardware mechanisms instead of emulating them unnecessarily.

Opaque 3D geometry normally uses depth testing.

For depth precision:

```text
near as large as acceptable
far as small as acceptable
```

Do not fix z-fighting with arbitrary polygon offset before checking geometry duplication, projection range, depth writes, and ordering.

Use culling only when winding/surface semantics justify it.

If geometry disappears with culling, debug winding/mirroring; disabling culling is a diagnostic, not automatically the fix.

Transparency normally means:

```text
opaque first
transparent later
depth test on
transparent sorted back-to-front
depth writes usually off during transparent pass
```

Do not implement OIT unless it is actually required.

---

# Performance

Never optimize an unidentified bottleneck.

Classify first:

- JS/CPU;
- allocation/GC;
- draw-call/state overhead;
- vertex-bound;
- fragment/fill-bound;
- bandwidth/upload-bound;
- synchronization/readback-bound.

Use cheap falsifiers:

- halve render resolution;
- remove fragment work;
- reduce geometry;
- reduce object/draw count;
- remove uploads;
- remove CPU frame work.

Optimize only the category that moves frame time.

Do not:

- batch five objects;
- build a GL state cache for a handful of binds;
- add instancing without scale pressure;
- reduce triangles in a fill-rate bottleneck;
- optimize shaders in a CPU bottleneck.

The render loop should preferably allocate nothing, but do not build object pools for trivial scratch state.

Reuse a few explicit scratch arrays/vectors instead.

## Soliva: messen und belegen

Hintergrund und Plan: `docs/OPTIMIZATION_PLAN.md`.

**Render-Stats für die Diagnose.** `window.getRenderStats()` (`src/renderStats.ts`) liefert die letzten 30 Sekunden, je Sekunde ein JSON-Objekt: fps, `frameMs`/`cpuMs` samt Aufteilung (`simMs`, `collectMs`, `renderMs`, `minimapMs`, `pickMs`), `longTaskMs`, `drawCalls`, `vertices`, `terrainVertices`, `terrainTexels`, `instances`/`batched` und mehr. Vor einer Vermutung über die Ursache erst dort nachsehen, per Playwright mit `page.evaluate(() => window.getRenderStats())`. Neue teure Pfade melden ihre Kosten mit `addRenderStats(key, value)`. Das gilt je Bild. `window.getRenderInfo()` liefert die Umstände eines Laufs: GPU, Pixel-Verhältnis und Einstellungen.

**Bench bei jeder Änderung am Rendering oder an der Leistung.** Vorher und nachher `npm run bench` ausführen, der Dev-Server muss laufen. Das Skript vergleicht die Mediane von vier festen Szenen mit `tools/perf/baseline.json`. `npm run bench -- --save` setzt die Basis neu, das nur bewusst und nur auf demselben Rechner tun. So lesen:
- Zählwerte (`drawCalls`, `vertices`, `terrainVertices`, `terrainTexels`) rauschen um ±2 %. Sie sind die harten Belege.
- Zeiten um 1 ms (`cpuMs`, `renderMs`) rauschen bis ±40 %. Kleine Zeitunterschiede belegen nichts.
- `fps` steht bei 60 an (vsync). Ein Gewinn zeigt sich in `cpuMs` und den Zählwerten, nicht in `fps`.
- Die Bench-Ausgabe gehört mit Vorher/Nachher in Commit oder PR. Zeigt die Messung keinen Effekt, das offen sagen und keinen behaupten.

**Screenshots bei jeder Shader-Änderung** (`src/gl/*Shader*`, GLSL in `src/gl/`):
1. Vorher feste Szenen aufnehmen, mit Playwright bei festem Fenster (1280×800) und Pixel-Verhältnis 1. Das Spiel dabei anhalten (`paused` in `pgm.settings`) und die Maus aus dem Bild nehmen. Die Szenen sollen weit, mittel, nah, Stadt (Welt `Demo`) und Wasser oder Fels abdecken.
2. Einen zweiten Lauf desselben Codes aufnehmen, sein Pixel-Unterschied ist das Rauschen der Animationen.
3. Nach der Änderung dieselben Szenen aufnehmen und pixelweise vergleichen.
- Liegt der Unterschied im Rauschen, ist das Bild gleich. Liegt er darüber, die Bilder ansehen und die Änderung begründen oder zurücknehmen.
- Soll sich das Bild nicht ändern (reine Optimierung), muss die Abweichung im Rauschen liegen.

### Stolperfallen, in die schon ein Agent gelaufen ist

- **Szenen per Playwright aufsetzen:** `entry.ts` lädt `main.ts` erst nach dem `load`-Ereignis nach.
  - Einfacher für Test-Spielstände: `/game/<seed>?lat=<y>&lng=<x>&zoom=<1-5>&save=<base64url>` startet direkt ohne Hauptmenü, `pgm.seed` bleibt unberührt. `save` ist das Spielstand-JSON (`world/save.ts`), die Welt beginnt bei jedem Aufruf damit. Keine Datei ins Repo legen, den Link ins Review posten. Kodieren: `node -e "console.log(Buffer.from(JSON.stringify(require('./stand.json'))).toString('base64url'))"`.
  - Test-Spielstände immer in der Welt `Testseed`, von Hand geschrieben mit nur dem, was das Todo braucht. Freie Lichtung dort: x 12, y -43. Die Kamera rechnet die Geländehöhe nicht mit, das Ziel liegt über der Bildmitte - mit `zoom=4` bleibt es gut im Bild.
  - Wer Welt und Start-Vermerk setzt (`pgm.seed`, `sessionStorage` `pgm.start`), muss vorher warten, bis `window.getRenderStats` existiert. Sonst verbraucht die laufende Seite den Vermerk, und gemessen wird das Hauptmenü, mit plausibel aussehenden Zahlen.
  - Danach prüfen, dass `#start` verborgen ist, und in den Stats nachsehen, ob `tileSize` zur Szene passt.
- **Stillstand ist keine Langsamkeit:** Steht die Kamera eine Sekunde, zeichnet das Spiel absichtlich nur 30 fps (`idleFps`). Das erkennt man in den Stats an `idle` nahe 1. Zum Messen `idleFps: false` setzen, der Bench tut das schon.
- **Nur gleiche Umstände vergleichen:** Playwright läuft mit Pixel-Verhältnis 1, ein Retina-Bildschirm mit 2, also viermal so vielen Pixeln. Vor einem Vergleich `getRenderInfo()` beider Läufe ansehen: GPU, Pixel-Verhältnis und Einstellungen.
- **Schichten beim Import:** `src/gl/` importiert nie aus `src/game/`, sondern nur aus `src/world/`, `src/noise.ts`, `src/functions/` und aus `src/gl/` selbst. `src/game/` und `src/main.ts` sitzen darüber. Code, den beide Seiten brauchen, liegt in `src/` selbst, zum Beispiel `renderStats.ts`. Vor einer neuen Datei die Imports der Nachbarn ansehen.
- **`docs/OPTIMIZATION_PLAN.md` ist ein Hinweis, keine Tatsache:**
  - Zeilenangaben dort sind veraltet. Nach Funktionsnamen suchen, nicht nach Zeilennummern.
  - Befunde vor dem Umsetzen am Code prüfen. Behauptungen wie „bit-identisch“ oder „harmlos“ waren schon falsch. Aufrufer lesen, bevor ein Early-out das Ergebnis ändert.
  - Umgesetztes und bewusst Ausgelassenes vermerkt der Plan zu Beginn von Abschnitt 2. Das bei jeder Änderung nachführen.
- **`Array.find` durch eine Map ersetzen:** `find` liefert den *ersten* Treffer, `new Map(entries)` behält den *letzten*. Bei möglichen Doppelten die Map aus der umgekehrten Liste bauen.

---

# memory.md: eigenes Gedächtnis des Agenten

In `memory.md` (Projektwurzel) hältst du fest, was du beim Arbeiten gelernt hast und was nicht schon im Code, in dieser Datei oder in `docs/` steht. Beispiele: gemessene Werte und Rauschen, Eigenheiten der Umgebung, Sackgassen samt Grund, offene Folgearbeiten.

- **Zu Beginn lesen**, vor der ersten Änderung.
- **Knapp:** je Eintrag ein bis drei Zeilen. Das Datum steht absolut (JJJJ-MM-TT), dazu, wenn es hilft, Branch oder Commit.
- **Bewusst überarbeiten, nicht nur anhängen:**
  - Bei jedem Besuch die Einträge prüfen, die deine Arbeit berühren.
  - Was nicht mehr stimmt oder nicht mehr gebraucht wird, *löschen*. Das betrifft etwa behobene Fehler, erledigte Folgearbeiten und Werte, die eine neue Messung ersetzt.
  - Was sich geändert hat, an Ort und Stelle *korrigieren*, statt einen zweiten, widersprechenden Eintrag anzulegen.
  - Ein veralteter Eintrag ist schädlicher als ein fehlender: Der nächste Agent handelt danach.
- **Nichts doppeln:** Gilt etwas dauerhaft für alle Agenten, gehört es hierher in `AGENTS.md`. Aus `memory.md` wird es dann gelöscht.

## Loop unrolling

Loop unrolling is a valid optimization when the iteration count is **small, fixed, and hot**, especially in GLSL ES 1.00 where older ES2-era compilers/drivers may optimize or accept statically expanded code more reliably than dynamic loop structures.

Prefer the compiler first. Manually unroll only when at least one applies:

- profiling shows loop overhead or compiler output matters;
- a target ES2 implementation handles the loop poorly;
- the loop bound is compile-time fixed and very small;
- unrolling enables constant propagation/dead-code elimination;
- GLSL ES 1.00 loop restrictions or driver behavior make the explicit form more portable.

Example:

```glsl
// Fixed 4-tap kernel: explicit operations are intentional.
sum += texture2D(uTexture, uv + offsets[0]);
sum += texture2D(uTexture, uv + offsets[1]);
sum += texture2D(uTexture, uv + offsets[2]);
sum += texture2D(uTexture, uv + offsets[3]);
```

may be preferable to:

```glsl
for (int i = 0; i < 4; ++i) {
    sum += texture2D(uTexture, uv + offsets[i]);
}
```

when the target compiler benefits from or requires it.

Rules:

- Fixed tiny loop + hot shader path → consider unrolling.
- Variable/large loop → do not manually unroll.
- CPU JS loops → trust the JIT unless measurement proves otherwise.
- Do not explode shader size to remove negligible control flow.
- Watch instruction count, register pressure, compile time, and shader-cache pressure.
- Partial unrolling is valid when full unrolling causes code-size/register regressions.
- If a compiler already produces equivalent code, keep the clearer loop.
- Never unroll merely because "loops are slow."

If manually unrolling for a known platform/compiler ceiling, document why:

```text
ponytail: manually unrolled 4-tap fragment loop for ES2 compiler stability;
return to the loop when minimum targets compile/benchmark equivalently.
```

Unrolling is an implementation choice, not an architecture.

---

# CPU/GPU boundary

Avoid synchronous readback/querying in hot paths.

Especially avoid unnecessary:

```text
readPixels
getParameter
getError
```

during ordinary rendering.

Keep known renderer state in JS rather than asking GL to report it back.

GPU readback is for cases that genuinely require GPU-produced data.

---

# Animation

Use `requestAnimationFrame`.

Simulation/animation is time-based, not frame-count-based.

Clamp pathological `dt` after suspension when appropriate.

Do not add a fixed timestep unless deterministic simulation/physics needs one.

Do not continuously redraw static scenes if render-on-change fits the architecture.

The cheapest frame is the frame never rendered.

---

# Canvas / DPR / resize

CSS size != drawing-buffer size.

Resize only when dimensions actually change.

On drawing-buffer resize, update:

- buffer dimensions;
- viewport;
- aspect/projection-dependent state.

Capping DPR is acceptable when fragment cost matters; document the visual/performance trade-off.

---

# Cameras / scene structure

Use the minimum scene representation needed.

Do not introduce:

- scene graph without hierarchical transforms/lifetime;
- ECS because this is "game code";
- quaternion machinery when simple constrained Euler/orbit state suffices;
- asset manager for one texture;
- generic material system for one shader parameter;
- renderer abstraction that merely renames raw GL calls.

A helper is justified when it centralizes a real invariant, failure mode, or repeated unsafe ceremony.

---

# Procedural 3D

Generation should be deterministic unless randomness is explicitly required.

If reproducibility matters, randomness must be seedable.

Prefer compact data/typed arrays over thousands of tiny JS objects for GPU-bound geometry.

For repeated meshes, escalate only as needed:

```text
reuse mesh
→ per-object transform
→ merge static geometry
→ instancing
```

Do not start at instancing.

---

# Context/resources

GPU resources have explicit lifetime.

Reuse the same creation path for initial creation and context restoration.

Handle context loss where the application owns persistent GPU resources.

Delete GPU objects when resource turnover is real: editors, hot reload, asset replacement, repeated scene loading, etc.

Do not build reference counting for resources that intentionally live until page unload.

---

# Capability handling

Do not assume desktop limits or extension support.

Detect only capabilities the implementation actually depends on.

Resolve capabilities centrally during initialization where practical.

Extension support is runtime state, not browser identity.

---

# Debugging order

If nothing renders:

1. context;
2. shader compile;
3. program link;
4. canvas/buffer dimensions;
5. viewport;
6. framebuffer completeness;
7. active program;
8. buffers/data;
9. attribute layout/enables;
10. uniforms;
11. transforms/frustum;
12. projection/`w`;
13. depth/culling;
14. blending/alpha.

If geometry is malformed:

1. indices;
2. attribute counts;
3. finite values;
4. winding;
5. transforms.

If lighting is wrong:

1. spaces;
2. normal transform;
3. normalization;
4. light-direction convention;
5. shader equation.

Reduce to the cheapest diagnostic pipeline:

```text
known triangle
→ fixed transform
→ constant color
→ add stage back one at a time
```

Do not debug five interacting effects simultaneously.

---

# Checks

Every non-trivial addition leaves one cheap check for its strongest invariant.

Examples:

```text
shader compiled/linked
FBO complete
indices < vertexCount
attribute counts match
matrix/vector values finite
extension present before use
```

No broad validation framework unless the project already has one.

---

# Hardware reality

Spec-correct is necessary, not sufficient.

When behavior may vary materially, verify on real implementations.

Relevant variability includes:

- precision;
- shader compiler/driver behavior;
- extensions;
- GPU limits;
- mobile/integrated GPUs;
- DPR/fill rate;
- texture/render-target formats;
- antialiasing.

Do not add vendor workarounds without reproducing and isolating the actual failure.

---

# Final rule

A WebGL change is done when the smallest implementation:

1. solves the requested behavior;
2. modifies the correct layer;
3. reuses existing renderer/resource/math paths;
4. preserves ES2/WebGL 1 compatibility where required;
5. owns only the state/resources it should own;
6. avoids unnecessary per-frame work/allocation/upload;
7. fails explicitly on real setup errors;
8. leaves one cheap invariant check where logic is non-trivial;
9. has been exercised through the real render path.

Do not turn:

- a shader tweak into a material system;
- one object into a scene graph;
- repeated geometry into an instancing framework;
- one FBO into a render graph;
- one bug into a renderer rewrite.

The best abstraction is usually the one already present.

The best optimization is removal.

The best draw call is the one that never needs to happen.