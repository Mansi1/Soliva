# Optimierungsplan: 3D-Rendering

Stand: 2026-09-26. Reine Analyse — es wurde noch nichts verändert.
Erweiterung 2026-09-26: Abschnitte 10–12 ergänzt (Unsicherheiten der Einschätzung, weitere Prüf-Optionen, Umsetzungs-Checklisten für Coding Agents).
Grundlage: Vollständige Durchsicht von `src/gl/` (entityRenderer, terrainRenderer, terrainShader, iso, clips, obj), `src/main.ts`, `src/map.ts`, `src/world/` (render, resources, deposits, flowers, villagers, wildlife, world, pathfinding), `src/game/` (Camera, Picker, MouseInput, Ground, DevPanel) sowie der Asset-Pipeline (`vite.config.ts`, `tools/models/glb.mjs`).

---

## 0. Status quo: Was bereits stark optimiert ist

Diese Mechanismen funktionieren bereits auf hohem Niveau und sollen **nicht** angefasst werden:

| Bereich | Mechanismus | Ort |
|---|---|---|
| Draw-Architektur | Ein Shader-Programm für alles, GPU-Instancing (`drawArraysInstanced`) | `entityRenderer.ts:3200` |
| Geometrie | Ein VAO pro Modell-Shape (~76 ModelSlots), Geometrie voll geteilt | `entityRenderer.ts:2808-2813, 2969` |
| LOD | LOD-Meshes mit Zoom-Schwellen, Billboard-Atlanten für ferne Bäume (Budget: max. 1 Art/Frame) | `entityRenderer.ts:2398-2404, 3164-3181` |
| Statische Vorkommen | GPU-Static-Batches je 64×64-Tile-Region, Rebuild nur bei Revisionswechsel | `main.ts:656`, `resources.ts:430` |
| Animation | GPU-Skinning über einmalig gebackene Clip-Textur, **null** CPU-Animation pro Frame | `entityRenderer.ts:2896-2966, 817-824` |
| Terrain-Fill | Gecachter Füllpass mit Texel-Budgets (1M / 250k / 250k), Ringpuffer, bis zu 4 Cache-Texturen, Prefetch | `terrainRenderer.ts:104-120` |
| Terrain-Display | `gl_VertexID`-Gitter ohne Vertex-Puffer, Index-Puffer `STATIC_DRAW` | `terrainRenderer.ts:399-413` |
| GL-Context | `alpha:false, antialias:false, depth:true, stencil:false, preserveDrawingBuffer:false` | `terrainRenderer.ts:204-210` |
| Simulation | Fester 10-Hz-Schritt, Rendering mit Blend-Interpolation (entkoppelt) | `main.ts:623`, `UnitBase.ts:32` |
| Texturen | Genau eine Bitmap im ganzen Spiel (`birch_leaf.png` 256×256), keine eingebetteten Texturen in den 68 GLBs | `entityRenderer.ts:2828-2841` |
| Drosselung | Idle auf 30 fps nach 1 s Kamerastillstand, Minimap 10 Hz, UI-Refresh 5 Hz, guarded DOM-Writes | `main.ts:578-589, 680-684, 718-731` |
| Weltgenerierung | Chunk-Befüllung mit 3-ms-Zeitbudget, LRU-Obergrenzen | `resources.ts:465` |

**Kein Handlungsbedarf:** CPU-Matrizen (Projektion läuft analytisch im Shader), CPU-Animationsinterpolation, Shader-Wechsel, Textur-Thrashing, Mipmaps/Atlas-Fragen.

---

## 1. Messmethodik (vor Start einrichten)

Damit jede Phase vorher/nachher belegbar ist:

- **Eingerichtet:** `window.getRenderStats()` (`src/renderStats.ts`) — Ringpuffer der letzten 30 Sekunden, je Sekunde ein JSON-Objekt mit fps, Frame- und CPU-Zeit (Mittel/Max), `longTasks`/`longTaskMs` (auch außerhalb der Schleife), deren Aufteilung (`simMs`, `collectMs`, `renderMs`, `minimapMs`, `pickMs`), `drawCalls`, `vertices`/`terrainVertices`, `mpx`, `frozen`, `instances`/`batched`, `billboards`, `terrainTexels`, `tileSize`, `relief`, `idle`. Über Playwright: `await page.evaluate(() => window.getRenderStats())`. Eigene Werte mit `addRenderStats(key, value)`. Umstände des Laufs (GPU, Pixel-Verhältnis, Einstellungen): `window.getRenderInfo()`.
- **Vergleich:** `npm run bench` fährt vier feste Szenen ab (weit-leer, stadt, nah, zoom-wechsel), verwirft den Anlauf und vergleicht die Mediane mit `tools/perf/baseline.json` (neu setzen mit `npm run bench -- --save`).
- **Frame-Zeit & FPS:** DevPanel ist vorhanden (`src/game/DevPanel.ts`) — um durchschnittliche/p95-Framezeit erweitern oder extern per Chrome-Performance-Profil.
- **GL-Calls pro Frame:** Zähler um `draw*`/`uniform*`/`bind*`-Aufrufe legen (oder SpectorJS).
- **GC-Druck:** `performance.memory` (Chrome) bzw. Allocation-Timeline im Profiler; Ziel: keine Allokations-Spitzen im Render-Loop.
- **GPU-Zeit:** `EXT_disjoint_timer_query_webgl2` um die drei Pässe (Fill, Display, Entities) legen.
- **Tests:** `npm test` (IDs/Modelle) muss nach jeder Phase grün bleiben; `check:models` / `check:anim` bei Asset-Änderungen.

Referenzszenarien zum Messen: (a) leere Karte herausgezoomt, (b) große Stadt mit 80+ Dorfbewohnern, (c) dichter Wald nah rangezoomt, (d) Zoom-Richtung-Wechsel (Fill-Pass-Stress).

---

## 2. Phase 1 — Quick Wins (hoher Impact, minimaler Aufwand)

Reihenfolge innerhalb der Phase beliebig; jeder Punkt ist isoliert mergebar.

**Stand 2026-09-26:**
- **Umgesetzt:** 2.1, 2.4, 2.5, 2.10 (`MODELS.find` → Map, `FIELDS` → Set, Prop-Body und Pose-Props nachgeschlagen), aus 2.9 `uFlat` nur bei `flatCount > 0`, aus 4.5 der Komparator ohne `Math.hypot`. Screenshots vorher/nachher gleich (Abweichung im Rauschen der Animationen), Zählwerte im Bench unverändert.
- **Außerhalb des Plans, Ladezeit (2026-09-27):** Feld-Modelle (~1,3 Mio. Dreiecke) werden erst beim ersten Zugriff gebaut (`lazyFieldModels`), jeder `EntityRenderer` lädt ein Mesh erst beim ersten Zeichnen hoch. `partOf` ist je Objektname gemerkt. Erstes Bild auf dem Dev-Server (M1) von ~5,7 s auf ~1,3–1,4 s. Die Mesh-Daten sind Byte für Byte gleich.
- **4.7 (2026-09-28, `fix/building-roof-click`):** Anders als vorgeschlagen: `resourceObject` verwirft jedes Objekt erst nach Bildschirm-x (hängt nicht von der Höhe ab), bevor es `resourceInfo` und die Geländehöhe (Rauschen, der größere Teil) fragt. Seit dem Hand-Mauszeiger läuft es bei jeder Mausbewegung. Gemessen (M1, Playwright): 10-16 ms → 0,5-0,7 ms je Aufruf, an 5.600 Punkten dasselbe Ergebnis wie vorher. Danach prüft es stehende Objekte gegen ihre Dreiecke statt als Streifen (0,7-1,1 ms), sonst fing ein Baum Klicks neben sich ab.
- **Messen (2026-09-29):** `gpuMs` in den Render-Stats und im Bench (eine Timer-Query um das Bild der Hauptansicht, `src/gpuTimer.ts`). Das Entwickler-Panel zeigt CPU und GPU je Bild und für das Ausgewählte: Objekte seiner Modellart, deren Draw-Calls, Eckpunkte je Objekt und Anteil an allen, bei Dorfbewohnern und Tieren die Simulationszeit je Objekt. GPU-Zeit je Abschnitt oder je Modell (Teil von 11.1 und E0) ist auf ANGLE Metal nicht messbar - siehe `memory.md`.
- **Weizen und Gras als Bildkarten (2026-09-29, `perf-optimization`):** Der Weizen war der größte GPU-Posten in Ansichten mit Äckern (M4, ohne Bildraten-Deckel ~5 ms je Bild, 4 Mio. Eckpunkte). Jetzt je Pflanzplatz drei gekreuzte Kartenpaare (`fields/wheat_card.glb`) statt 84 Blättern und Halmen, Wuchs und Ernte unverändert über `P_CROP`: 76 → 120 fps bei Zoom 4, `stadt` 2,7 → 1,6 Mio. Eckpunkte. Das Gras ist eine Karte je Zelle (`src/models/foliage/`, dazu Schilf und Rohrkolben am Ufer) statt Halmen als Dreiecken, zwei statt vier Draw-Calls, 0,34 → 0,05 Mio. Eckpunkte. Die Zeit fürs Gras sinkt bei Zoom 5 von ~1 ms auf ~0, bei Zoom 4 bleibt sie etwa gleich.
- **2.3, 6.3 und Einebnen je Eckpunkt (2026-09-29, `perf-optimization`):** Gemessen per Abschalten ohne Bildraten-Deckel (M4, `stadt`): der Modell-Pass war ~3,5 von 5,2 ms, und er hängt an den Eckpunkten (halbe Auflösung spart nur ~1 ms). Gebäude und Ruinen bekommen ihre Bodenhöhe von der CPU (`world.groundAt`, eingeebnet wie im Shader) - vorher rechnete der Shader `elevation()` je Eckpunkt: 5,2 → 4,35 ms. `flattenZ` prüft zuerst eine Hülle aller Zonen (letzter Platz in `uFlat`) - vorher lief die Schleife über bis zu 48 Zonen je Eckpunkt jedes Baums: → 3,9 ms. Indizierte Meshes (`indexVertices` in `gl/obj.ts`, gleiche Eckpunkte einmal): 4,9× weniger Eckpunkte durch den Vertex-Shader, → 2,05 ms (`stadt` 193 → 488 fps ohne Deckel), `nah` 495 → 668 fps. Beim Laden ~12-14 ms fürs Indizieren. Bild: Screenshots gleich bis auf einzelne Kantenpixel an Modellen (bei 4× Vergrößerung nicht zu sehen), gegen Baustellen am Hang geprüft.
- **5.5, Teil Gitter (2026-09-29):** Das Geländegitter zählt seine Zellen (4 px, höchstens 16 px) in CSS-Pixeln statt in Geräte-Pixeln (`TerrainRenderer.pixelRatio`), `Ground.groundAt` rechnet mit derselben Feinheit. Bei Retina (DPR 2) sonst viermal so viele Eckpunkte: `weit-leer` 2,5 → 0,62 Mio., `nah` 1,06 → 0,30 Mio. Gelände-Eckpunkte, das Gitter kostete dort 1,2-1,9 ms (M4). Bild bei DPR 1 unverändert; bei DPR 2 so fein wie bei DPR 1 (im Gebirge leicht andere Schattierung). `pixelRatio` selbst bleibt voll.
- **Gemessen und verworfen:** 3.4 (`BLEND` aus) - kein Unterschied in `stadt`. `invalidateFramebuffer` für die Tiefe vor den Post-Effekten - kein Unterschied bei DPR 2.
- **Bewusst nicht:**
  - 2.2: Ein grober Vorlauf kann schmale Grate überspringen, das Ergebnis wäre also nicht garantiert gleich. Nach 2.1 ist der Nutzen zudem klein.
  - 2.8: Ein kleinerer Faktor baut den Index-Puffer beim Zoomen neu, das bedeutet je Stufe einen Ruckler.
  - 3.5: Das `bufferData`-Orphaning vermeidet GPU-Wartezeiten, `bufferSubData` kann sie auslösen.
  - `armoryStock`-Early-out: `render.ts` prüft `has()`, das Verhalten würde sich ändern.

### 2.1 `updateZoom` pickt jeden Frame umsonst — **trivial, hoch**

- **Ort:** `src/main.ts:459`
- **Befund:** `picker.point(ax, ay)` läuft jeden Frame mit vollem Terrain-Ray-March (s. 2.2), auch wenn `stepZoom` `false` liefert und der Anker gar nicht gebraucht wird.
- **Maßnahme:** Pick nur ausführen, wenn `camera.zoom !== camera.targetZoom`.
- **Erwartung:** ~0,2–1 ms/Frame dauerhaft gespart. Eine Zeile.

### 2.2 `pickWorld`: grob→fein statt 200 Feinschritte — **klein, hoch**

- **Ort:** `src/gl/iso.ts:196-217`
- **Befund:** Ray-March von `z = MAX_RELIEF` (40) abwärts in 0,2-Schritten → bis zu 200 Terrain-Auswertungen pro Pick; jede Auswertung = JS-Simplex-FBM (~15 Noise-Calls) + `flatten` über bis zu 48 Zonen (`src/world/flatten.ts:21-30`). In Flachland sind ~190 der 200 Schritte nutzlos. Danach 8 Bisektions-Schritte.
- **Aufrufer (wirkt multiplikativ):** `updateZoom` (`main.ts:459`), `updateHoveredTile` pro mousemove (`main.ts:340-347, 536-547`, `MouseInput.ts:84`) und pro Frame bei Kamerabewegung (`main.ts:695`), `minimapView` 10×/s (`main.ts:511-514`), `focusPoint` (bereits gecacht, `main.ts:369-377`).
- **Maßnahme:** Grober Vormarsch in 2,0-Schritten (~20 Auswertungen) bis zum ersten Unterschreiten, ein Schritt zurück, mit 0,2 verfeinern (~10), Bisektion bleibt (8). ≈ **38 statt 200** Auswertungen bei gleicher Endgenauigkeit. Alternativ/ergänzend: Start-h bei `min(MAX_RELIEF, Obergrenze aus Meeresspiegel-Fußpunkt + Bergzuschlag)`.
- **Risiko:** niedrig — Ergebnis muss bit-identisch bleiben (Trefferintervall enthält denselben Schnittpunkt); gegen alte Implementierung abgleichen.

### 2.3 `ground` für Gebäude setzen — **klein, hoch (GPU)**

- **Ort:** `src/world/render.ts:97-112` → Vertex-Shader `entityRenderer.ts:1174`
- **Befund:** Dorfbewohner bekommen `ground` via `world.groundAt` (`render.ts:146`), Gebäude **nicht**. Der Shader wertet dann `groundZ(center)` = `elevation()` (Domain-Warping + 2× fbm(4 Oktaven) + Micro ≈ 15–20 Simplex-Aufrufe, `terrainShader.ts:158-170`) **pro Vertex** aus. Ein Haus hat Hunderte Vertices.
- **Maßnahme:** Einmal `ground` pro Gebäude im Caller setzen.
- **Achtung:** Eingeebnete Zonen — `flattenZ` muss im Wert enthalten sein (sonst schweben/sinken Gebäude an Baustellen). Gegen `Ground.heightAt`/`flatten.ts` abgleichen.

### 2.4 `groundBump` nur aktive Anteile rechnen — **klein, hoch (Zoom-Phasen)**

- **Ort:** `terrainShader.ts:839-857`, Aufgerufen 3× aus `main` (`:957-959`)
- **Befund:** ~18 snoise pro Aufruf (lean + Gras + `forestGrain` + `sandGrain` + `rockGrit` + `snowGrain`), **immer alle fünf Bodenarten** → 54 snoise/Texel, auch wo nur ein Gewicht > 0 ist. Auf reiner Wiese wären 12 snoise (3× Gras-Pfad) genug.
- **Maßnahme:** Terme mit Gewicht 0 überspringen (`if (wood > 0.0)` usw. — Gewichte sind dort bekannt).
- **Erwartung:** >4× schnelleres Bump in homogenen Gebieten; direkt spürbar beim Zoomen (Fill-Budget ~11 ms GPU/Bild, `terrainRenderer.ts:99-120`).

### 2.5 `climate()` unter Wasser überspringen — **trivial, mittel-hoch, bildneutral**

- **Ort:** `terrainShader.ts:320-327`, Aufruf `:884`
- **Befund:** 11 snoise (Fringe 2×2 + Feuchte 4 + Temperatur 3) pro Texel. Für `height < uSeaLevel` entscheidet `classify` allein über die Höhe (`:330-332`), der Wasser-Zweig liest weder Feuchte noch Temperatur (`:895-904`).
- **Maßnahme:** `if (height >= uSeaLevel) climate(...)`. Null Bildänderung; Ozeane sind oft 30–60 % des Bildes.

### 2.6 Tiefwasser-Shortcut im Display-Vertex-Shader — **klein, mittel**

- **Ort:** `terrainShader.ts:183-188` (`reliefZ`), `:247-254` (`main`)
- **Befund:** Für `h ≤ uSeaLevel` ist stets `z = 0`; Feindetail/Micro/Ridge (~8–11 der ~15–19 snoise) beeinflussen z dort nicht.
- **Maßnahme:** Nach dem groben Anteil (Warp + Basis, 8 snoise) bei `coarse + FeinMax < uSeaLevel` vorzeitig `z = 0` zurückgeben (FeinMax ≈ `uDetailStrength` + Micro-Amplitudensumme ≈ 0,18, konservativ wählen). Halbiert Vertex-Noise über Ozeanen.
- **Achtung:** **Nicht** auf den Fill-Shader übertragen — die Wasserfarbe braucht die echte Tiefe (`:896-897`).

### 2.7 Hillshade auf tiefem Wasser ohne Nachbar-`elevation()` — **klein, mittel**

- **Ort:** `terrainShader.ts:880, 979-984`
- **Befund:** ~16 snoise je `elevation()`-Aufruf, dreifach pro Texel für die Normale → ~48–60 snoise/Texel nur Höhe. Für `B_DEEP_WATER` ist der Shade-Faktor nur 0.08.
- **Maßnahme:** Im Tiefwasser-Zweig die beiden Nachbar-Auswertungen streichen.
- **Risiko:** minimaler Bilddelta an Wasserhängen — per Screenshot-Vergleich prüfen.

### 2.8 `ensureGrid`-Wiederverwendung straffen — **trivial, mittel**

- **Ort:** `terrainRenderer.ts:394`
- **Befund:** Nach Fenster-Verkleinerung wird ein bis zu 2,5× zu breiter Index-Puffer weiterbenutzt; die überschüssigen Spalten werden **mit vollem Vertex-Noise berechnet** und erst danach geclippt. Worst Case: 2,5× Vertex-Arbeit, jedes Bild.
- **Maßnahme:** Faktor 2.5 → ~1.3. Neuaufbau kostet einmalig ~8 MB Upload (2 Mio. Indizes, `:399-413`).

### 2.9 Redundante Uniform-Uploads kappen — **trivial, niedrig**

- `uFlat[0]` (48 vec4 = 768 B) wird jedes Bild geladen, auch unverändert (`terrainRenderer.ts:839`) — Änderungs-Flag in `setFlatZones` (`map.ts:443-450`).
- Entity-Pendant `uFlat[0]` (192 Floats) auch bei `flatCount === 0` (`entityRenderer.ts:3277`) — überspringen.
- Konstante `normalize(SUN_XY)`/`normalize(SUN)` als `const vec2` hinterlegen (`terrainShader.ts:443, 541, 657, 707, 779, 794, 966, 997` — letzteres zweimal in einer Zeile).

### 2.10 Lineare Scans durch Sets/Maps ersetzen — **trivial, mittel**

| Ort | Scan | Häufigkeit |
|---|---|---|
| `entityRenderer.ts:2728` (`packInstance`) + `:499` (`buildingHeading`) | `FIELDS.includes` (18er-Array) | 2× pro Instanz pro Frame |
| `entityRenderer.ts:3404` (`writeBar`) | `MODELS.find` (~80 Einträge) — `modelByShape` existiert bereits! | pro Lebensbalken |
| `entityRenderer.ts:3309` | `this.models.find` für Prop-Body | pro Figur-Shape/Frame |
| `entityRenderer.ts:2559` (`propsOfPose`) | `CLIPS.find` | pro Dorfbewohner/Frame via `figureProps` |

- **Maßnahme:** `Set`/`Map`/vorberechnete Tabellen bei Konstruktion auflösen.

---

## 3. Phase 2 — GL-Call-Reduktion (größter CPU-Posten)

Ziel: von ~1.500–3.000 GL-Calls/Frame (inkl. Minimap) auf einen Bruchteil.

### 3.1 Uniform-Block pro Shape kategorisieren — **mittel, hoch**

- **Ort:** `drawModel` (`entityRenderer.ts:3306-3353`)
- **Befund:** ~24 Uniform-Uploads **pro Shape pro Frame**, darunter 10 Clip-Arrays (`:3323-3333`) auch für Bäume/Felsen (dort `NO_CLIPS`) und Hand-/Körper-Maße für statische Gebäude. Bei ~30–40 nicht-leeren Shapes × 2 Renderer (Hauptansicht **und** Minimap haben je einen `EntityRenderer`, `map.ts:363, 510`) → 1.500–3.000 GL-Calls/Frame. `location()` cached zwar (`:2998-3003`), aber die Uploads selbst summieren sich.
- **Maßnahmen (kombinierbar):**
  1. Upload-Sets nach Kategorie (Baum braucht nur 8 der 24).
  2. Werte-Cache pro Uniform: Props laden die Body-Uniforms identisch 6× hintereinander; Clip-Arrays sind nach `bakeClips` konstant → nur bei Modell-/Programmwechsel laden.
  3. Perspektivisch: UBO pro Modell.
- **Erwartung:** größter einzelner CPU-GL-Gewinn.

### 3.2 VAO-Cache für statische Batch-Draws — **mittel, hoch**

- **Ort:** `draw()` (`entityRenderer.ts:3187-3201`)
- **Befund:** Bei **jedem** Draw werden 6 `vertexAttribPointer` + `bindBuffer` neu gesetzt, weil der Offset (`first * bytes`) variiert. Bei statischen Regions-Batches ist `(mesh, buffer, first)` über Frames konstant.
- **Maßnahme:** Lazy-VAO-Cache je `(mesh, buffer, first)` (direkt am `ranges`-Eintrag) → ein `bindVertexArray` statt ~7 GL-Calls × Hunderte Draws.

### 3.3 Draw-Call-Anzahl Regionen × Shapes reduzieren — **mittel-hoch, hoch-mittel**

- **Ort:** `entityRenderer.ts:3348-3351`; Erzeuger `resources.ts:339`
- **Befund:** Für jede Modell-Shape wird über **alle** Regions-Batches iteriert, je Treffer ein eigener Draw. Bei 20 sichtbaren Regionen × 15 Vorkommen-Shapes bis zu ~300 kleine Instanced-Draws plus 76 × 20 = 1.520 `Map.get`-Lookups pro Frame.
- **Maßnahmen:** (a) Batch-Konsolidierung (Regionen zu größeren Instanz-Blöcken mergen, solange LOD-Stufe passt), (b) `WEBGL_multi_draw` evaluieren (Verfügbarkeit prüfen), (c) Lookup-Struktur flach vorberechnen.

### 3.4 `BLEND` für opake Pässe deaktivieren — **klein, mittel (GPU)**

- **Ort:** `entityRenderer.ts:3280-3281`
- **Befund:** Blending ist dauerhaft an, auch für die per Kommentar (`:3247`) undurchsichtigen Bäume/Felsen — kostet Fill-Rate bei bildschirmfüllenden Wäldern.
- **Maßnahme:** `BLEND` nur für Overlays/Vorschau/Billboards/Staub/Silhouetten aktivieren.

### 3.5 Instanz-Puffer: `bufferSubData` statt Voll-`bufferData` — **klein, niedrig-mittel**

- **Ort:** `entityRenderer.ts:3270`
- **Befund:** `gl.bufferData(..., DYNAMIC_DRAW)` pro Frame allokiert den Puffer neu; dazu kommt eine View-Allokation.
- **Maßnahme:** Einmal `bufferData` (Kapazität, wächst bereits ohne Re-Allokation, `:2785, 3255-3257`) + `bufferSubData` pro Frame.

### 3.6 Minimap: Clip-Textur und Modelldaten teilen — **mittel, mittel**

- **Ort:** `map.ts:510-532, 604`
- **Befund:** Die Minimap hat einen zweiten kompletten `EntityRenderer` mit eigenem WebGL2-Context: doppelter Modell-Parse (~1–2 Mio. Textzeilen), doppeltes `bakeClips` (12,6 MB), doppelte Per-Frame-Uniform-Kosten.
- **Maßnahme:** Modelldaten/Clip-Bake-Daten (Float32Array) gemeinsam erzeugen und in beide Contexts hochladen (Context-übergreifendes Teilen von GL-Objekten geht nicht, wohl aber das CPU-seitige Parsen/Backen).

---

## 4. Phase 3 — Allokationen & GC-Druck

Ziel: keine nennenswerten Allokationen mehr im Render-Loop. Aktuell entstehen bei großen Städten mehrere tausend Objekte/Sekunde.

### 4.1 Instanz-Pooling in `worldInstances` — **mittel, mittel**

- **Ort:** `src/world/render.ts:74-171`
- **Befund:** Pro Frame neue `EntityInstance`-Objekte je Gebäude/Dorfbewohner/Tier/Furche (Objekt-Literale), 500–1.000+ Objekte/Frame. Vorbild im selben Projekt: `ResourceNode.instance` (`resources.ts:117`) und Blumen (`flowers.ts:104`) verwenden gecachte Instanzen.
- **Maßnahme:** Muster übertragen — Instanz-Objekte je Entity persistent halten, nur geänderte Felder schreiben.

### 4.2 `figureProps` ohne Spread-Allokationen — **klein, mittel**

- **Ort:** `entityRenderer.ts:2568-2574`, Aufrufer `world/render.ts:151`
- **Befund:** Pro Dorfbewohner pro Frame Array + Spread-Objekte `{ ...figure, shape, health: undefined }` → 100–300 Objekte/Frame bei 100 Dorfbewohnern.
- **Maßnahme:** Props direkt in eine wiederverwendete Out-Struktur schreiben; Pose→Props-Tabelle vorberechnen (räumt zugleich `CLIPS.find` aus 2.10 ab).

### 4.3 Numerische Tile-Keys statt Strings — **mittel, mittel**

- **Orte:** `Deposits` (`deposits.ts:23`, `remainingShare`/`fall` `:61-66, 103-111`), `VillagerWork.terrainBlock` (`villagers.ts:59, 151`), `World.occupied` (`world.ts:58`)
- **Befund:** Pro sichtbarem Baum/Blume pro Frame 2–4 String-Allokationen (`"x,y"`) + Map-Lookups (~2–4k Strings/Frame im Nah-Modus); in der Tick-Hot-Path baut `lineOfSight` ~300 String-Keys/Tick für Läufer (`villagers.ts:176-178`, `pathfinding.ts:64-76`).
- **Maßnahme:** Numerische Keys durchgehend — Muster existiert: `pack` in `pathfinding.ts:55`.

### 4.4 Sortierung statischer Modell-Listen cachen — **klein-mittel, mittel**

- **Ort:** `entityRenderer.ts:3246-3251`
- **Befund:** `solids.sort(backToFront)` und `m.list.sort(...)` für alle nicht-natürlichen Modelle **jeden Frame**. Häuser/Mühlen/Lager bewegen sich nie — O(n log n) mit stabilem Ergebnis. (Bäume/Felsen werden korrekt nicht sortiert — `NATURAL`-Check.)
- **Maßnahme:** Sortier-Cache (Version/Länge + Stichprobe) oder stabile Einfügereihenfolge aus dem Caller nutzen; nur bei Bau/Abriss neu sortieren.

### 4.5 `updateFlatZones` ereignisgesteuert — **klein, mittel (bei großer Stadt hoch)**

- **Ort:** `src/game/Ground.ts:58-84`
- **Befund:** Jeden Frame: alle Gebäude durchlaufen, String-Key `${b.type}:${b.x},${b.y}` pro Gebäude, neuer `zones`-Array, Sortierung mit `Math.hypot` **im Komparator**, `packZones` allokiert neue Float32Array, Upload zum Shader — auch ohne jede Änderung.
- **Maßnahme:** Neuaufbau nur bei Gebäudeänderung (Revision) oder Kamerabewegung; numerischer Key (`b.anchor`); quadrierte Distanz im Komparator.

### 4.6 Hover-Pipeline entdoppeln und drosseln — **klein-mittel, hoch während Bewegung**

- **Ort:** `main.ts:536-547, 695`, `MouseInput.ts:84`
- **Befund:** Während Kamerabewegung läuft `updateHoveredTile` komplett pro Frame **und** zusätzlich pro mousemove-Event (ungen drosselt, mousemove kann >60 Hz feuern): Ray-March + `devPanel.showTile` mit `terrain.getTile` (~10 Noise-Auswertungen) + `updateHoverInfo`.
- **Maßnahme:** mousemove auf rAF coalescieren (letzte Position merken, einmal pro Frame verarbeiten); Verarbeitung nur bei Tile-Wechsel; `terrain.getTile` fürs DevPanel cachen.

### 4.7 `resourceObject`-Pick entzerren — **klein, mittel-hoch im Wald**

- **Ort:** `Picker.ts:71-106`, `resources.ts:173-191`, `world.ts:233-242`, `entityRenderer.ts:2615-2618`
- **Befund:** Pro sichtbarem Node pro mousemove: `modelSize` = lineares `MODELS.find` (~80 Einträge), `world.resourceInfo` = **iteriert alle Dorfbewohner** zum Gatherer-Zählen, 4× `worldToScreen`. Im Wald O(Nodes × Villagers) pro Mausbewegung.
- **Maßnahme:** Gatherer-Zahl wird fürs Picking nicht gebraucht → billigen `deposits`-Existenzcheck statt `resourceInfo`; `modelSize` per Map-Lookup.

### 4.8 Kleinigkeiten gebündelt — **jeweils niedrig**

- `entityRenderer.ts:3260`: `models.map(...)` + Spread pro Frame (76er-Array) → zwei Schleifen.
- `entityRenderer.ts:3344-3345`: `cells.flatMap(rect/box)` je billboardeter Baumart/Frame (bis 20 Arrays/Frame) → einmal als `Float32Array` auf der `BillboardBand` ablegen.
- `entityRenderer.ts:3253`: `instances.filter(...)` für Lebensbalken → in die Bucketing-Schleife (`:3240-3244`) falten.
- `entityRenderer.ts:3225, 3354, 3359`: `shown`-/`batched`-Sets, `figures`-Tupel pro Frame → Scratch-Strukturen.
- `entityRenderer.ts:3165`: Billboard-Key mit `toFixed(4)` → numerischer Key.
- `main.ts:674`: `view`-Vergleichsstring → numerischer Vergleich.
- `map.ts:474-486`: `prefetchPixelsPerTile` mit Spread/`filter`/`map` + `snapCamera`-Objekt pro Frame.
- `terrainRenderer.ts:448-635` (`selectCache`/`updateCache`): Fenster-Rechnung mit Rect-Allokationen auch bei unveränderter Kamera → Early-out.
- `world.ts:187-194` (`armoryStock`): Map-Neubau pro Frame auch bei 0 Bögen → Early-out/Cache (Aufrufer `world/render.ts:61`).
- `iso.ts`: `worldToGround`/`groundToWorld`/`worldToScreen`/`visibleWorldRect` (`:231-250`) allokieren kleine Objekte — bei aktuellen Aufrufraten fast irrelevant, beim Anfassen anderer Punkte mit erledigen.

---

## 5. Phase 4 — Strukturelle GPU-Gewinne

### 5.1 Höhen-Cache-Textur (der große Wurf) — **mittel-hoch, hoch**

- **Ort:** Display-Vertex-Shader `terrainShader.ts:241-262`; Cache `terrainRenderer.ts:420-439`
- **Befund:** Jeder Vertex des Display-Gitters ruft `elevation()` auf: Warp 2×2 Oktaven + Basis 4 + Detail 4 + Micro ~3 = **~15–19 snoise à 3 `texelFetch`**, plus `flattenZ`-Schleife über 48 Zonen. Bei ~350.000 Vertices/Bild (2560×1440, ppt=16, `cellPixels=4` → ~642×558 Gitter, ~714.000 Dreiecke) sind das **~5–7 Mio. snoise / 16–20 Mio. texelFetch pro Bild** — der mit Abstand größte konstante GPU-Posten. Es gibt keinerlei Caching (kein Transform Feedback, keine Höhentextur).
- **Maßnahme:** Fill-Pass schreibt die Höhe (oder `reliefZ`) in einen Float-Kanal (RGBA16F statt RGBA8, oder separate R16F-Textur); Vertex-Shader macht 1 LINEAR-gefilterten Fetch; `flattenZ` bleibt dynamisch darüber (Baustellen sofort korrekt).
- **Details/Risiken:** Cache-Texel liegen auf Geräte-Pixel-Mitten, Gitterecken am Weltraster → gefilterter Fetch nötig; Ringpuffer-Koordinaten wie bei `vCache` (REPEAT) wiederverwenden; Speicher ×2; Quantisierung beachten.
- **Synergie:** `entityRenderer.groundZ` (`entityRenderer.ts:767-771`, 8 Aufrufstellen u. a. `:861, 879, 1154, 1193, 1225`) rechnet dasselbe Noise pro Entity-Vertex und könnte dieselbe Textur nutzen — zusammen mit 2.3 wird `elevation()` dann **nirgends** mehr pro Vertex gerechnet.

### 5.2 Adaptives `reach` statt pauschal 49 v-Einheiten — **mittel, mittel**

- **Ort:** `terrainRenderer.ts:803, 811`
- **Befund:** `reach = reliefScale · viewZScreen() · MAX_RELIEF` ≈ 1,22 · 40 ≈ 49 v-Einheiten — bei ppt=16 ~196 von 558 Zeilen (~35 % der Vertices) liegen pauschal unter dem Bildrand und werden nur für Gipfel vorgehalten. In Flachland/See volle Vertex-Kosten für abgeschnittene Dreiecke.
- **Maßnahme:** CPU besitzt dasselbe Noise (`noise.ts`/`Ground.heightAt`) — grobe Abtastung der Maximalhöhe entlang des unteren Bildstreifens (z. B. alle 4 Tiles) und `reach` danach klemmen. Spart bis zu ~30 % der Vertex-Kosten.

### 5.3 Silhouetten-Pass nur bei Bedarf — **mittel, mittel-hoch bei vielen Figuren**

- **Ort:** `entityRenderer.ts:3367-3376`
- **Befund:** Jede Figur wird zweimal gezeichnet (Silhouette mit `depthFunc(GREATER)` + Normal-Pass) — also 2× volles GPU-Skinning (6 `texelFetch` + Mix je Knochen, `:817-824`) und doppelter Uniform-Block. Bei 50 Dorfbewohnern ≈ 1,6 Mio. Texel-Fetches/Frame; bei 200+ spürbar.
- **Maßnahmen:** (a) Silhouette nur zeichnen, wenn Verdeckung überhaupt möglich ist (günstiger Vorab-Test), (b) Zoom-Schwelle, (c) Stencil-basiert. **Bewusster Trade-off, kein Bug** — der AoE2-Umriss ist gewollt; zuerst messen, ob es im Referenzszenario (b) überhaupt ins Gewicht fällt.

### 5.4 Pause = null Redraws — **klein, Energie**

- **Ort:** `main.ts:173` (`setAnimationsPaused`), `:680-684`
- **Befund:** Im Pause-Zustand wird 30×/s dasselbe Bild neu gezeichnet.
- **Maßnahme:** Bei `paused` + stiller Kamera + keiner UI-Änderung Zeichnen aussetzen, nur bei Input Einzelbild. Reine Akku-/Lüfter-Ersparnis, risikofrei.

### 5.5 GPU-Budget-Stufe (Qualitätseinstellung) — **klein, visueller Trade-off**

- **Ort:** `main.ts:79-80` (volle devicePixelRatio), `terrainRenderer.ts:354, 370-378` (`cellPixels`)
- **Befund:** Retina = 4× Pixel; das Vollbild-Gitter kostet herausgezoomt grob 1,5–2 Mio. Dreiecke/Frame, jeder Vertex mit Höhenfunktion. Auf iGPU der dominierende Kostenpunkt.
- **Maßnahme:** `pixelRatio` deckeln und/oder `cellPixels` zoomabhängig erhöhen — als Qualitätsstufe in `settings.ts` anbieten. Nach 5.1 deutlich weniger relevant (Fetch statt Noise), deshalb **nach** der Höhen-Textur entscheiden.

### 5.6 Zeilenreihenfolge nah→fern (Early-Z) — **niedrig, optional**

- **Ort:** `terrainRenderer.ts:874`
- **Befund:** Painters-Reihenfolge fern→nah erzeugt worst-case-Overdraw bei Berghängen; Fragment-Shader ist billig, Pass ist vertex-limitiert → Impact niedrig. Umkehrung aktiviert Early-Z, bricht aber die Index-Ordnung. Nur mitnehmen, wenn der Index-Puffer ohnehin angefasst wird.

---

## 6. Phase 5 — Assets & Startzeit

### 6.1 Clip-Bake verschlanken — **mittel, mittel (Startzeit + 12,6 MB)**

- **Ort:** `entityRenderer.ts:2896-2966` (`bakeClips`), `clips.ts:475-524`
- **Befund:** Textur 768×1024 RGBA32F ≈ **12,6 MB** + gleich großes Float32Array; ~16.000 Textur-Zeilen gesamt. Treiber:
  - `sails` (Mühle): 1.258 Frames à 10 fps (125,7 s) × **4 Mühlen-Modelle = 5.032 Zeilen = 31 % der Textur** — für 2 Knochen. Die Rotation ist für alle Mühlen identisch, nur der Pivot (`hub`) unterscheidet sich.
  - Riesige Idle-Clips: `stand` 1.021 (34 s), `carve` 786 (26 s), `graze` 1.062 (35 s) — 88 % der Humanoid-Frames sind stand+carve.
  - Bake mit vielen kleinen Array-Allokationen (`Array.from`, `qRotate`, `clips.ts:488-524`), einmalig geschätzt 100–300 ms.
- **Maßnahmen:** (a) `sails` nur **einmal** backen, Pivot per Uniform; (b) Idle-Clips in Blender kürzen/loopen (Export-Pipeline `tools/export/`, Paritäts-Tests `check:anim` beachten); (c) Bake verzögert/in Worker (erst `stand`/`walk`, Rest lazy).

### 6.2 Binärformat statt OBJ-Text im Bundle — **mittel, niedrig-mittel**

- **Ort:** `vite.config.ts:13-25` (`glbModels()`), `tools/models/glb.mjs`, `src/gl/obj.ts:23`
- **Befund:** 6,4 MB JS-Brocken (`dist/assets/catalog-*.js`) mit allen Modellen als OBJ-Text plus Clip-GLBs als Base64; `parseObj` splittet beim Start ~1–2 Mio. Textzeilen.
- **Maßnahme:** Beim Konvertieren Float32Array-Binärdaten als Asset ausgeben (fetch statt `?inline`-Text) — spart Text-Parsing und ~33 % Größe.

### 6.3 Indizierte Meshes — **mittel, niedrig**

- **Ort:** `entityRenderer.ts:2284` (`loadModel`), Konverter `tools/models/glb.mjs`
- **Befund:** Unindizierte Dreieckssuppe, 3 Eckpunkte à 32 B je Dreieck; ~120k Dreiecke über alle Modelle (`villager_male` 4.900, `armory` 13.620, `town_center` 7.996) → ~360k Eckpunkte ≈ 11,5 MB GPU-RAM, dazu LOD-Kopien (`:2351`).
- **Maßnahme:** Indizes schon in `glb.mjs` erzeugen → ~3× weniger Vertex-Speicher, besserer Post-Transform-Cache.

---

## 7. Phase 6 — Simulation (Frame-Nebenkosten, kein Rendering)

Gehört nicht zum Rendering, drückt aber auf die Frame-Zeit — deshalb hier dokumentiert, nach den Render-Phasen angehen.

| # | Befund | Ort | Impact | Maßnahme |
|---|---|---|---|---|
| 6.1 | `blockedAt` mit String-Keys in Tick-Hot-Path: `waypoint()` prüft jeden Tick je Läufer die Sichtlinie neu (`lineOfSight` ~5 Schritte/Tile × 3 Seitenabfragen → ~300 `blockedAt`-Aufrufe/Tick, jeder mit `"x,y"`-String) | `villagers.ts:150-165, 176-178`, `pathfinding.ts:64-76` | mittel | Numerische Keys (`pack`, `pathfinding.ts:55`), Re-Check nur alle N Ticks — Synergie mit 4.3 |
| 6.2 | Tiere nutzen den teuren Pfad: `animalBlocked` ruft volles `terrain.getTile` (inkl. Schattierung/RGB), bis zu 7× je Tier-Tick; Dorfbewohner nutzen das 3× billigere `resourceAt` + Cache | `world.ts:661-667`, `map.ts:345-351`, `AnimalBase.ts:142` | niedrig-mittel | `terrainAt()` + kleinen Cache auch für Tiere |
| 6.3 | `nearestThreat` O(Tiere × Dorfbewohner) je Tick (~54k hypot/s bei 90×60) | `world.ts:682-690` | niedrig | Erst bei großen Städten: räumliches Gitter |
| 6.4 | `autosave` alle 60 s: JSON in localStorage — kurzer Blocker | `main.ts:597, 732` | niedrig | In ruhige Phase legen (`requestIdleCallback`) |

---

## 8. Gesamt-Reihenfolge (Empfehlung)

Nach Impact/Aufwand sortiert; Phasen 1–3 sind risikoarm und unabhängig mergebar.

| Reihenfolge | Maßnahme | Phase | Impact | Aufwand | Risiko |
|---|---|---|---|---|---|
| 1 | `updateZoom`-Pick-Guard | 2.1 | hoch (Interaktion) | trivial | keins |
| 2 | `pickWorld` grob→fein | 2.2 | hoch (multiplikativ) | klein | niedrig (Gleichheit prüfen) |
| 3 | `ground` für Gebäude | 2.3 | hoch (GPU) | klein | mittel (flattenZ!) |
| 4 | `groundBump`-Guards, `climate`-Skip, Tiefwasser-Shortcuts, Hillshade-Wasser | 2.4–2.7 | hoch (Zoom) | klein | niedrig |
| 5 | Lineare Scans → Sets/Maps, redundante Uniforms | 2.9–2.10 | mittel | trivial | keins |
| 6 | Uniform-Kategorien + Werte-Cache | 3.1 | hoch (CPU) | mittel | niedrig |
| 7 | VAO-Cache statische Batches | 3.2 | hoch (CPU) | mittel | niedrig |
| 8 | Hover-Coalescing, `resourceObject`-Pick, `updateFlatZones` | 4.5–4.7 | mittel-hoch | klein-mittel | niedrig |
| 9 | Instanz-Pooling, `figureProps`, numerische Tile-Keys, Sortier-Cache | 4.1–4.4 | mittel (GC) | mittel | niedrig |
| 10 | `BLEND`-Steuerung, `bufferSubData`, Minimap-Teilen, Draw-Konsolidierung | 3.3–3.6 | mittel | mittel | niedrig-mittel |
| 11 | **Höhen-Cache-Textur** (+ `entityRenderer.groundZ`-Synergie) | 5.1 | **sehr hoch (GPU konstant)** | mittel-hoch | mittel (Screenshot-Diff!) |
| 12 | Adaptives `reach`, `ensureGrid` | 5.2, 2.8 | mittel | klein-mittel | niedrig |
| 13 | Silhouetten-Pass bedarfsabhängig | 5.3 | mittel-hoch (viele Figuren) | mittel | mittel (Optik) |
| 14 | Clip-Bake (`sails` 1×, Idle kürzen, lazy) | 6.1 | mittel (Start + 12,6 MB) | mittel | mittel (`check:anim`) |
| 15 | Binärformat, indizierte Meshes | 6.2–6.3 | niedrig-mittel | mittel | niedrig (`check:models`) |
| 16 | Simulation: String-Keys, Tier-Terrain-Pfad | 7.x | mittel | klein-mittel | niedrig |
| 17 | Pause-Redraws aus, GPU-Budget-Stufe, Early-Z, Kleinigkeiten | 5.4–5.6, 4.8 | niedrig-mittel | klein | keins-mittel |

**Nach jeder Stufe:** Referenzszenarien (a)–(d) aus Abschnitt 1 messen und gegen den vorherigen Stand abgleichen; bei Shader-Änderungen Screenshot-Vergleich (Gipfel, Wasserhang, Wald) auf Bildgleichheit.

---

## 9. Explizit nicht empfohlen

- **WebGL1→2-Migration / Compute:** WebGL2 ist bereits im Einsatz; Transform Feedback für Höhen wäre eine Alternative zu 5.1, aber die Cache-Textur deckt mehr Fälle ab (Ringpuffer-Synergie).
- **Backface-Culling für Terrain:** Heightfield von oben ist praktisch immer front-facing — kein Gewinn.
- **Textur-Atlas für Modelle:** Es gibt nur eine Bitmap im gesamten Spiel — nichts zu konsolidieren.
- **Worker-Offloading der Simulation:** 10-Hz-Tick ist billig genug; Komplexitätsgewinn negativ.
- **Frustum-Culling für das Display-Gitter:** Das Gitter passt exakt ins Bild — nichts zu cullen; die einzige Verschwendung dort ist über 5.2/2.8 abgedeckt.
- Kosmetik: doppelter Kommentar `entityRenderer.ts:2287-2288` („Stammstücke bleiben immer" zweimal) — beim nächsten Anfassen der Datei mitnehmen.


---

## 10. Unsicherheiten in dieser Einschätzung

Die Analyse beruht auf **statischer Code-Lektüre, nicht auf Messungen**. Die folgenden Punkte sind explizit unsicher und müssen vor bzw. während der Umsetzung validiert werden.

### 10.1 Messunsicherheiten (betreffen alle Impact-Stufen)

1. **CPU- vs. GPU-Engpass unbekannt.** Alle Einstufungen (hoch/mittel/niedrig) sind Schätzungen aus der Code-Analyse. Ob die Frame-Zeit auf der Zielhardware von GL-Calls (CPU), Vertex-Noise (GPU) oder GC-Pausen dominiert wird, ist nicht gemessen. → Vor den Phasen 2–4 Profiling nach §1 durchführen; Reihenfolge in §8 ggf. anpassen.
2. **Szenario-Annahmen.** Zahlen wie ~350.000 Vertices/Bild, ~714.000 Dreiecke, ~300 Draws, 1.500–3.000 GL-Calls/Frame gelten für ein angenommenes Szenario (2560×1440 Canvas, ppt=16, ~20 sichtbare Regionen, 30–40 nicht-leere Shapes). Andere Fenstergrößen, Zoomstufen und Weltzustände verschieben die Werte deutlich.
3. **GC-Druck ist unbewiesen.** Dass die Frame-Allokationen (Phase 3) spürbare Pausen erzeugen, hängt von Browser und Gerät ab. Auf Desktop mit viel RAM kann der Effekt nahe null sein, auf Mobilgeräten spürbar. → Allocation-Timeline vor Phase 3.
4. **GLSL-Kostenzählung vs. Treiber-Realität.** Die snoise-/texelFetch-Zählungen sind statisch aus dem Shader-Quelltext gezählt. Treiber können Konstantfaltung und Dead-Code-Elimination anwenden (senkt die Ist-Kosten). Umgekehrt können die datenabhängigen `if`-Guards (2.4) auf Tiler-GPUs durch Divergenz einen Teil des erwarteten Gewinns auffressen. → Auf echter Hardware beide Varianten messen.
5. **Fehlende Zielhardware-Definition.** Ohne definiertes Low-End-Profil ist die Frage „GPU-bound oder nicht?" nicht beantwortbar — alle GPU-bezogenen Einstufungen schweben in der Luft (s. Prüf-Option 11.7).

### 10.2 Korrektheits-Risiken einzelner Maßnahmen

| Maßnahme | Unsicherheit | Validierung |
|---|---|---|
| 2.2 `pickWorld` grob→fein | Grobschritt 2.0 kann einen schmalen Kamm zwischen zwei Stützstellen überspringen (Peak-Miss), weil das Relief zwischen den Samples über den Strahl ragen kann | A/B-Vergleich alte/neue Funktion über ≥10k Zufalls-Bildschirmpunkte auf mehreren Seeds; Abweichungen dokumentieren; ggf. Grobschritt an die maximale Relief-Steigung koppeln |
| 2.3 `ground` für Gebäude | Nicht verifiziert, ob `Ground.heightAt` das Shader-Ergebnis inkl. `flattenZ` exakt abbildet — besonders **während** der Einebnungs-Animation an Baustellen | Screenshot-Diff an Baustellen; Höhenvergleich Bau vs. Shader |
| 2.7 Hillshade auf Tiefwasser | „Minimaler Bilddelta" ist eine Vermutung — an Wasserhängen/Küsten können Übergangskanten sichtbar werden | Screenshot-Diff Küste/Hanggewässer |
| 3.2 VAO-Cache | VAO-Anzahl wächst mit sichtbaren Regionen × Shapes; ohne Obergrenze/Eviction entsteht Verwaltungs-Overhead statt Gewinn | Obergrenze + LRU; GL-Call-Zähler als Nachweis |
| 3.4 `BLEND` aus | Unklar, ob „opake" Modelle Alpha-Cutout-Fragmente enthalten (`birch_leaf.png` hat einen Alpha-Kanal); die Überdeckungs-Reihenfolge muss ohne Blend weiter stimmen | Alpha-Pfade im Shader prüfen, dann Screenshot-Diff dichter Wald |
| 4.4 Sortier-Cache | Die in §4.4 skizzierte Stichproben-Erkennung kann seltene Falsch-Negative liefern → vereinzelt falsche Überdeckung einzelner Gebäude | Sicherere Variante wählen: Revisionszähler aus dem Bau-/Abriss-Code statt Stichprobe |
| 5.1 Höhen-Cache-Textur | (a) Texel-Ausrichtung: Cache-Texel liegen auf Geräte-Pixel-Mitten, Gitterecken am Weltraster — an Steilhängen können trotz LINEAR-Filterung Stufen sichtbar werden; (b) Quantisierung bei 16-Bit-Float; (c) VRAM verdoppelt sich für bis zu 4 Cache-Texturen — Low-End ungeprüft | Screenshot-Diff Gebirge; VRAM-Budget rechnen; separate R16F-Textur als speicherschonendere Variante erwägen |
| 5.2 Adaptives `reach` | Die CPU-Höhenabtastung kostet selbst Noise-Auswertungen pro Frame; der Break-even gegen gesparte Vertices ist nicht belegt — und nach 5.1 (Fetch statt Noise) sinkt der Nutzen stark | Erst nach 5.1 neu bewerten, ggf. streichen |
| 6.1 `sails` einmal backen | Ob der Pivot-Unterschied (`hub`) per Uniform abbildbar ist, ohne die Clip-Zeilen-Indizierung (`uClipRow` pro Modell) umbauen zu müssen, ist im Detail nicht verifiziert | Machbarkeit am Code prüfen, dann `npm run check:anim` |
| 3.6 Minimap-Teilen | WebGL-Contexts können GL-Objekte **nicht** teilen — die Einsparung beschränkt sich auf CPU-Parse/Bake; Upload und Per-Frame-Kosten bleiben doppelt. Der erwartete Gewinn ist ggf. zu hoch angesetzt | Gegen Prüf-Option 11.2 (Minimal-Modus) abwägen |

### 10.3 Abhängigkeiten, die Prioritäten verschieben

1. **Nach 5.1 (Höhen-Fetch)** wird 2.6 (Tiefwasser-Vertex-Shortcut) obsolet; 5.2 (`reach`) und 5.5 (`pixelRatio`) verlieren deutlich an Wert. Wer 5.1 vorzieht, kann diese drei Punkte streichen oder abwerten — dafür steigt das Risiko früh im Projekt.
2. **3.1 und 3.6 verstärken sich:** die Minimap verdoppelt die Uniform-Kosten; beide zusammen bringen mehr als die Summe der Einzelteile.
3. **4.3 und 7.1 gehören zusammen** (gleiche Datenstrukturen, gleiche Key-Umstellung) — als ein Arbeitspaket umsetzen.
4. **2.10 räumt Teile von 4.2 mit ab** (`CLIPS.find` in `propsOfPose`) — Reihenfolge beachten, um Doppelarbeit zu vermeiden.
5. **5.3 (Silhouetten-Pass) hängt von 3.1 ab:** der doppelte Uniform-Block der Figuren wird mit den Uniform-Kategorien bereits billiger — danach kann 5.3 an Priorität verlieren.

---

## 11. Weitere Optionen — als Nächstes prüfen

Bevor größere Phasen starten, in dieser Reihenfolge klären:

1. **Profiling statt Schätzung (oberste Priorität).** Chrome-Performance-Profil + SpectorJS + `EXT_disjoint_timer_query_webgl2` auf den drei Pässen (Fill, Display, Entities). Erst dann ist klar, ob Phase 2 (GL-Calls) oder Phase 4 (GPU) zuerst drankommen sollte. Verfügbarkeit der Timer-Extension auf Zielgeräten prüfen — nicht überall vorhanden.
2. **Minimap radikal vereinfachen statt nur teilen (Alternative zu 3.6).** Braucht die Minimap Skinning, Silhouetten und LOD überhaupt? Wenn ein Minimal-Modus (Punkte/flache Icons) reicht, entfällt der zweite `EntityRenderer` fast komplett — ein größerer Hebel als das Teilen von Daten. Dabei prüfen, ob der Silhouetten-Pass in der Minimap überhaupt sichtbar ist (sonst: doppelt doppelt gezeichnet).
3. **Adaptive Qualität während Interaktion.** Oktaven-/Detail-Uniforms (`uDetailStrength` u. a.) während Zoom/Pan temporär senken und bei Stillstand wieder hochfahren — glättet die teuerste Phase (Fill) ohne Qualitätsverlust im Endbild. Zu klären: Übergangsstrategie, da der Cache mit Zielqualität befüllt werden muss.
4. **Speicher-Varianten für 5.1 abwägen.** Separate R16F-Höhen-Textur statt Upgrade aller Caches auf RGBA16F. VRAM-Gesamtbudget rechnen: bis zu 4 Cache-Texturen + Clip-Textur (12,6 MB) + Billboard-Atlanten (2048er-Kacheln) — gegen ein Low-End-Profil prüfen.
5. **Billboard-Rebake-Empfindlichkeit.** Der Cache-Key nutzt `toFixed(4)` auf Rotation/Zoom/Neigung (`entityRenderer.ts:3165`) — prüfen, ob das bei sanften Kamerafahrten unnötige Atlas-Neubauten auslöst (das Budget von 1 Art/Frame kann trotzdem permanent laufen).
6. **Fill-Budget-Dynamik.** Prüfen, ob `SMOOTH_BUDGET`/`FILL_BUDGET` (`terrainRenderer.ts:104-120`) adaptiv an die gemessene GPU-Zeit angepasst werden sollten, statt fix auf 250k/1M — deckelt Frame-Einbrüche beim Zoomen auf schwachen Geräten.
7. **Zielhardware festlegen.** Ein definiertes Low-End-Profil (z. B. iGPU + 4 GB RAM, ggf. Mobil) fehlt; ohne es sind die GPU-Fragen nicht beantwortbar. Alle Messungen nach §1 dagegen normieren.
8. **`gallery.ts` einordnen (29 KB).** Wurde nicht vollständig analysiert — klären, ob sie im Spiel-Renderpfad hängt oder ein Dev-/Galerie-Tool ist. Falls Renderpfad: eigene Analyse nötig, der Plan deckt sie aktuell nicht ab.
9. **OffscreenCanvas/Worker-Rendering** als langfristige Option bewerten (Main-Thread-Entlastung). Browser-Support ist inzwischen breit, der Umbau aber groß — nur erwägen, wenn nach den Phasen 1–4 noch ein CPU-Limit bleibt.

---

## 12. Umsetzungs-Checklisten für Coding Agents

**Arbeitsregeln für alle Gruppen:**

- [ ] Vor Beginn: §1-Messmethodik einrichten und eine **Baseline-Messung** der vier Referenzszenarien (a–d) durchführen; Werte hier eintragen: …
- [ ] Pro Gruppe ein eigener Branch/Commit; nach jeder Gruppe muss `npm run build && npm test` grün sein
- [ ] Nach jeder Gruppe: dieselben Szenarien erneut messen und das Ergebnis direkt unter der Gruppe in dieser Datei eintragen
- [ ] Bei Shader- oder Reihenfolge-Änderungen: Screenshot-Vergleich (Gipfel, Wasserhang, Wald, Baustelle) **vor** dem Merge
- [ ] Unsicherheiten aus §10.2 zur jeweiligen Gruppe lesen, bevor mit der Umsetzung begonnen wird

### Checkliste A — Quick Wins (§2)

- [ ] **A1 Zoom-Pick-Guard (2.1)**
  - [ ] In `src/main.ts:459` `picker.point(ax, ay)` nur ausführen, wenn `camera.zoom !== camera.targetZoom`
  - [ ] Abnahme: Build grün; Mausrad-Zoom bleibt am Cursor verankert; Hover funktioniert weiter
- [ ] **A2 pickWorld grob→fein (2.2)**
  - [ ] `src/gl/iso.ts:196-217`: Grobschritt 2.0 bis erster Treffer, ein Grobschritt zurück, Feinschritt 0.2, bestehende Bisektion unverändert lassen
  - [ ] A/B-Vergleichsskript schreiben: alte vs. neue Funktion über ≥10k Zufalls-Bildschirmpunkte auf 3 Seeds; Abweichungen dokumentieren (Peak-Miss-Check, §10.2)
  - [ ] Abnahme: `npm test` grün; Hover auf Gipfel/Kamm/Küste/Flachland manuell geprüft
- [ ] **A3 ground für Gebäude (2.3)**
  - [ ] In `src/world/render.ts:97-112` `ground` pro Gebäude setzen (Wert muss Shader-konsistent inkl. `flattenZ` sein)
  - [ ] Abnahme: Screenshot-Diff an Baustelle/eingeebnete Zone — nichts schwebt oder sinkt; GPU-Zeit Entities-Pass eingetragen
- [ ] **A4 GLSL-Guards (2.4–2.7)**
  - [ ] `groundBump`: Terme mit Gewicht 0 per `if` überspringen (`terrainShader.ts:839-857`)
  - [ ] `climate()` nur bei `height >= uSeaLevel` (`terrainShader.ts:884`)
  - [ ] Tiefwasser-Shortcut im **Display**-Vertex-Shader (`terrainShader.ts:247-254`) mit konservativer FeinMax-Marge — **nicht** im Fill-Shader
  - [ ] Hillshade: Tiefwasser ohne die beiden Nachbar-`elevation()` (`terrainShader.ts:979-984`)
  - [ ] Abnahme: Screenshot-Diffs (Ozean, Küste, Wiese, Gebirge) ohne sichtbare Änderung; Fill-GPU-Zeit beim Zoomen gemessen und eingetragen
- [ ] **A5 Grid + Uniform-Kleinkram (2.8–2.9)**
  - [ ] `ensureGrid`-Wiederverwendungsfaktor 2.5 → 1.3 (`terrainRenderer.ts:394`)
  - [ ] `uFlat[0]` nur bei Änderung laden (Flag in `setFlatZones`, `map.ts:443-450`); Entity-`uFlat[0]` bei `flatCount === 0` überspringen (`entityRenderer.ts:3277`)
  - [ ] Konstante `normalize(SUN…)`-Ausdrücke als `const` hinterlegen (`terrainShader.ts:443, 541, 657, 707, 779, 794, 966, 997`)
- [ ] **A6 Lineare Scans → Sets/Maps (2.10)**
  - [ ] `FIELDS.includes` → `Set` (`entityRenderer.ts:2728` und `:499`)
  - [ ] `writeBar`: `MODELS.find` → vorhandenes `modelByShape` (`entityRenderer.ts:3404`)
  - [ ] Prop-Body-`find` bei Konstruktion auflösen (`entityRenderer.ts:3309`)
  - [ ] `CLIPS.find` in `propsOfPose` → vorberechnete Tabelle (`entityRenderer.ts:2559`)

### Checkliste B — GL-Calls (§3)

- [ ] **B1 Uniform-Kategorien (3.1)**
  - [ ] Upload-Set je Modell-Kategorie definieren (Baum/Fels/Gebäude/Figur/Prop)
  - [ ] Werte-Cache: konstante Uniforms (Clip-Arrays nach `bakeClips`, Body-Maße) nur bei Modell-/Programmwechsel laden
  - [ ] Abnahme: GL-Call-Zähler vorher/nachher in dieser Datei notiert (Ziel: deutlich unter 1.000 Calls/Frame inkl. Minimap)
- [ ] **B2 VAO-Cache (3.2)**
  - [ ] Lazy-VAO je `(mesh, buffer, first)` am `ranges`-Eintrag (`entityRenderer.ts:3187-3201`)
  - [ ] Obergrenze + LRU-Eviction; VAOs beim Verwerfen von Regionen freigeben (§10.2)
- [ ] **B3 Draw-Konsolidierung (3.3)**
  - [ ] Zuerst zählen: sichtbare Regionen × Shapes je Szenario loggen (Basis für die Strategie)
  - [ ] `WEBGL_multi_draw`-Support auf Zielgeräten prüfen; Fallback-Pfad behalten
- [ ] **B4 BLEND-Steuerung (3.4)**
  - [ ] Zuerst Alpha-Pfade der Modelle prüfen (Cutout? `birch_leaf.png`-Alpha?) — erst dann `BLEND` für opake Pässe deaktivieren
  - [ ] Abnahme: Screenshot-Diff dichter Wald + Baum vor Gebäude
- [ ] **B5 Instanz-Puffer (3.5)**
  - [ ] Einmal `bufferData` (Kapazität) + `bufferSubData` pro Frame (`entityRenderer.ts:3270`)
- [ ] **B6 Minimap (3.6)** — erst nach Prüf-Option 11.2 entscheiden
  - [ ] Entscheidung dokumentiert: Daten teilen **oder** Minimal-Modus
  - [ ] Umsetzung + Startzeit-Messung eingetragen

### Checkliste C — Allokationen (§4)

- [ ] **C1 Instanz-Pooling (4.1)** — `world/render.ts`: persistente Instanz-Objekte je Gebäude/Dorfbewohner/Tier/Furche nach dem Muster von `ResourceNode.instance` (`resources.ts:117`)
- [ ] **C2 figureProps (4.2)** — Out-Struktur wiederverwenden; Pose→Props-Tabelle (deckt A6/`CLIPS.find` mit ab)
- [ ] **C3 Numerische Tile-Keys (4.3)** — `deposits.ts`, `villagers.ts`, `world.ts` auf das `pack`-Schema (`pathfinding.ts:55`) umstellen; **gemeinsam mit D1 umsetzen**
- [ ] **C4 Sortier-Cache (4.4)** — Revisionszähler aus dem Bau-/Abriss-Code (nicht die Stichproben-Variante, §10.2)
- [ ] **C5 updateFlatZones (4.5)** — ereignisgesteuert (Gebäude-Revision/Kamera), numerischer Key statt String, quadrierte Distanz im Komparator
- [ ] **C6 Hover-Coalescing (4.6)** — mousemove auf rAF legen; nur bei Tile-Wechsel verarbeiten; `terrain.getTile` fürs DevPanel cachen
- [x] **C7 resourceObject-Pick (4.7)** — früh nach Bildschirm-x verwerfen (siehe Stand in Abschnitt 2)
- [ ] **C8 Kleinigkeiten (4.8)** — die Liste in §4.8 Punkt für Punkt abarbeiten
- [ ] **C9 Validierung** — Allocation-Timeline zeigt keine Spitzen mehr im Render-Loop; Messung eingetragen

### Checkliste D — Simulation (§7, wegen der C3-Abhängigkeit vorgezogen)

- [ ] **D1 blockedAt (7.1)** — numerische Keys + Re-Check nur alle N Ticks (`villagers.ts:150-165, 176-178`); gemeinsamer Branch mit C3
- [ ] **D2 Tier-Terrain-Pfad (7.2)** — `terrainAt()` + kleinen Cache statt `getTile` (`world.ts:661-667`)
- [ ] **D3 Autosave (7.4)** — in `requestIdleCallback` verlegen
- [ ] **D4 nearestThreat (7.3)** — nur umsetzen, falls eine Messung es zeigt; sonst als „nicht nötig" markieren

### Checkliste E — Strukturelle GPU-Gewinne (§5, erst nach Profiling)

- [ ] **E0 Profiling & Entscheid** — CPU/GPU-Split gemessen (Prüf-Option 11.1); bestätigt die Reihenfolge E vs. B/C; Ergebnis hier eintragen
- [ ] **E1 Höhen-Cache-Textur (5.1)**
  - [ ] Speicher-Variante festgelegt (R16F separat vs. RGBA16F) und VRAM-Budget gerechnet (Prüf-Option 11.4)
  - [ ] Fill-Pass schreibt Höhe; Ringpuffer-Koordinaten wie bei `vCache` (REPEAT)
  - [ ] Display-Vertex-Shader: ein gefilterter Fetch; `flattenZ` dynamisch darüber
  - [ ] Optional: `entityRenderer.groundZ` auf dieselbe Textur umstellen (8 Aufrufstellen)
  - [ ] Abnahme: Screenshot-Diffs (Steilhang, Baustelle) sauber; danach 2.6/5.2/5.5 in dieser Datei neu bewerten (vermutlich streichen/abwerten, §10.3)
- [ ] **E2 reach adaptiv (5.2)** — nur falls nach E1 noch relevant; Break-even-Messung (CPU-Abtastung vs. gesparte Vertices) eintragen
- [ ] **E3 Silhouetten-Pass (5.3)** — erst in Szenario (b) messen; dann Bedarfs-Test/Zoom-Schwelle; Screenshot-Diff der Umriss-Optik
- [ ] **E4 Pause-Redraws (5.4)** — kein Zeichnen bei `paused` + stiller Kamera + keiner UI-Änderung; Einzelbild bei Input
- [ ] **E5 Qualitätsstufe (5.5)** — `pixelRatio`-Deckel/`cellPixels` als Einstellung in `settings.ts`; nach E1 bewerten

### Checkliste F — Assets (§6)

- [ ] **F1 sails einmal backen (6.1a)** — zuerst Machbarkeit Pivot-per-Uniform am Code verifizieren (§10.2), dann umsetzen; `npm run check:anim` grün
- [ ] **F2 Idle-Clips kürzen (6.1b)** — Blender-Seite (`tools/blender/`, `tools/export/`); nach Export `npm run check:anim` grün; Optik manuell abgenommen (kein sichtbarer Loop-Sprung)
- [ ] **F3 Bake lazy/Worker (6.1c)** — erst nach F1/F2 neu bewerten
- [ ] **F4 Binärformat (6.2)** — `tools/models/glb.mjs` gibt Float32-Assets aus; `src/gl/obj.ts`-Parsing ersetzen; Bundle-Größe + Startzeit vorher/nachher eingetragen; `npm run check:models` grün
- [ ] **F5 Indizierte Meshes (6.3)** — Indizes bereits im Konverter erzeugen; GPU-Speicher-Messung eintragen

### Checkliste G — Abschluss

- [ ] Alle Messwerte der Gruppen A–F in dieser Datei eingetragen
- [ ] `npm run build && npm test && npm run smoke` grün
- [ ] Umgesetzte Punkte hier als erledigt markiert; gestrichene Punkte mit Begründung versehen
- [ ] `docs/OFFEN.md` und `docs/REFACTOR.md` auf Widersprüche geprüft und ggf. aktualisiert
