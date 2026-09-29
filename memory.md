# memory.md

Gelerntes und Erfahrungen der Agenten - Regeln dazu in `AGENTS.md` ("memory.md").
Veraltetes löschen, Geändertes an Ort und Stelle korrigieren.

## Umgebung

- 2026-09-26, Mac (M4): Headless-Chrome aus `tools/ui/browser.mjs` rendert über Metal auf der echten GPU (`ANGLE Metal Renderer: Apple M4`), kein Software-Renderer; `EXT_disjoint_timer_query_webgl2` ist vorhanden. Messwerte aus Playwright sind echt.
- 2026-09-27: Es gibt auch einen Mac mit M1 (`ANGLE Metal Renderer: Apple M1`). `baseline.json` stammt nicht von ihm - dort nur `main` gegen Branch im selben Lauf vergleichen, nicht gegen die Basis. `stadt` erreicht auf dem M1 keine 60 fps (29-48 fps im Median, stark schwankend).
- Bench, Rauchtest und Screenshots brauchen den laufenden Dev-Server (`npm run dev`, http://localhost:5173). Für einen zweiten Stand (Worktree) einen eigenen Port nehmen (`npx vite --port 5188`) und die Adresse übergeben: `node tools/perf/bench.mjs http://localhost:5188`.
- 2026-09-27: Wikimedia antwortet bei schnellen Folgen von Bild-Downloads mit 429 - `tools/models/download-flower-photos.ts` wartet und versucht es erneut.
- 2026-09-27: `npm test` braucht Node ≥ 22.6: `tests/lighting.test.mjs` importiert `.ts` direkt. Mit dem nvm-Standard 20.18 schlägt er fehl (`ERR_UNKNOWN_FILE_EXTENSION`), mit `~/.nvm/versions/node/v24.20.0` laufen alle.
- 2026-09-27: Spielzustand per Playwright auslesen ohne Debug-Global: `window.dispatchEvent(new Event('beforeunload'))` speichert, dann `localStorage['pgm.world.<seed>']` lesen (Aufgaben, Lagen, Vorrat). Gebäude anklicken: Bäume dahinter fangen den Klick - Treffer am Panel prüfen (z. B. `[data-action=dismiss]`).

- 2026-09-27: Mehrere Modelle in einer Blender-Szene: Blender hängt `.001` an gleiche Objekt- *und Materialnamen* (`Tunic.001`, `Skin.001`). Materialnamen bestimmen das Aussehen im Spiel - vor dem Export je Modell die Namen gegen `git show HEAD:<glb>` vergleichen oder ein Modell je Szene.
- 2026-09-26: Modelle aus Blender (auch per `blender-mcp`) mit `export_normals=False` exportieren. Mit Normalen wurde `villagers/male.glb` 4× so groß (118 → 508 KB), das Spiel liest nur POSITION.
- 2026-09-27: Die Fischerei-Modelle (`fisher_hut`, `fish_trap`, `fisher_boat`, `fishing_rod`, `herring`) kamen aus trimesh: Z oben, Vorderseite -Y, ohne glTF-Drehung, ohne `Entry`. Sie liegen dann im Spiel auf der Seite. Gedreht mit `glbToObj` → (x, z, -y) → `objToGlb`, Marker als kleine Würfel ergänzt. Bei jedem neuen GLB den `generator` prüfen. Neue Fassungen aus trimesh brauchen die Drehung wieder.
- 2026-09-27: `render.ts` rechnet mit Maßen aus den Fischerei-Modellen (`BOAT_*`, `TRAP_DRAFT`). Wer Boot oder Reuse neu exportiert, muss sie nachziehen.
- 2026-09-26, M4: `stadt`-fps schwanken zwischen Läufen desselben Codes zwischen 50 und 60 (Median je Lauf). Einzelläufe belegen nichts. Nur abwechselnd A/B/A/B messen (Datei tauschen, 4 s warten, `npm run bench`).

- 2026-09-27: Im Demo-Stand stehen keine Tiere im Startbild (die 125 liegen weit weg, z. B. bei 35,-104). Zum Testen vor dem Laden `animals` im Spielstand ersetzen, z. B. `{ k: 'deer', x: 92, y: 70, hp: 3, f: 140 }` neben dem Hauptgebäude (96,67). Das Spiel hat keine Test-Hooks auf `window`, außer den Render-Stats.

## Repo

- `main` folgt `upstream` (Mansi1/procedurally-generated-map). PR-Branches werden nach `origin` (kyr0/soliva) gepusht, die PRs laufen gegen `upstream`.
- 2026-09-27, Checkout von Mansi1 (M1): Hier ist `origin` selbst Mansi1/procedurally-generated-map - Branch dorthin pushen (HTTPS mit `gh auth git-credential`, SSH ist gesperrt), PR gegen `main`.

- 2026-09-28: Die Adresse ist `/game/<seed>` im Spiel, `/` im Hauptmenü (`StartScreen.open/close`, `history.replaceState`), die Abfrage fällt beim Start weg. Adress-Schalter nur über `startParams` lesen, das vorher gelesen wird. Prüfschalter: `?festesLicht` (Sonne wie früher, kein Wetter), `?regen` (Dauerregen), `?ohneEffekte` (keine Post-Effekte). Nur mit `?festesLicht&ohneEffekte` ist das Bild mit dem vor dem Lichtsystem vergleichbar.
- 2026-09-27: Der Gelände-Cache (RGBA8) speichert die Farbe geteilt durch `CACHE_HEADROOM` (1,5), weil das Licht jetzt erst im Bild dazukommt. Ohne das werden helle Felsfarben auf der Schattenseite zu dunkel. Wer Farben im Cache ausliest, muss mit `uCacheGain` multiplizieren. Der Alpha-Kanal ist belegt: Tiefe im Flachwasser 0..1 für die Brandung, 1 = Land oder tiefes Wasser.
- 2026-09-27, `feat/flower-type`: Texturen mit Alpha filtern ohne grauen Saum nur vormultipliziert - durchsichtige Pixel sind schwarz (Canvas und WebP verlieren ihre Farbe). Die Blüten-Streifen sind darum vormultipliziert und werden direkt (nicht über `loadModelImages`s Canvas) hochgeladen, `blossomCard` teilt durch Alpha.
- 2026-09-27: Vite bündelt ein Bild nur, wenn der Pfad im Quelltext steht (Import oder `new URL(\`…/${name}.png\`, import.meta.url)`). Eine Ordner-URL plus Name zur Laufzeit fehlt im Build.
- 2026-09-28, `fix/flower-pick`: Vorab gemerkte Bodenhöhen (`ground` einer Instanz) weichen vom Gelände ab, wenn sie mit `mapGen.heightAt(x, y)` (Schritt 1, ohne Feindetail) gemessen sind - am Hang bis 0,27 Tiles (~35 px bei Zoom 5), die Blumen schwebten, Klicks gingen daneben. Darum: Blumen ohne `ground`, Vorkommen und Felder mit `NEAR_STEP`, Vorkommen im Shader und im Picker zusätzlich eingeebnet (`flattenZ` / `Ground.flat`). Prüfen per Debug-Global: gemerkte Höhe gegen `Ground.groundAt`.

- 2026-09-27: Partikel (`gl/particleRenderer.ts`) sind Punkte ohne Zustand - ihre Lage rechnet der Shader aus Quelle, Partikelnummer und `animationTime()`. Ein Standbild zeigt deshalb nur einen Augenblick; Seltenes wie Gold- und Steinblitze fehlt oft darin. Zum Prüfen die Galerie (`/galerie?zeige=Partikel&animation=...`) oder `particleSources` in den Render-Stats. `Terrain.resourceAt().height` ist die grobe Höhe - im Gebirge Tiles unter dem sichtbaren Relief. Was auf dem Boden sitzen soll, nimmt `world.groundAt`.

## Messen

- 2026-09-26, M4, Stand `6b5b5bd`: Alle Bench-Szenen laufen mit 60 fps und `frameMsMax` 16,8 ms, auch `zoom-wechsel`. Der Zoom ist auf diesem Rechner nicht langsam, Gewinne im Gelände-Shader zeigt der Bench hier nicht.
- 2026-09-26, M4: Größenordnungen je Bild - `weit-leer` 144 Draw-Calls, 0,87 Mio. Gelände-Eckpunkte; `stadt` rund 3 Mio. Modell-Eckpunkte; `zoom-wechsel` rund 95.000 neue Gelände-Texel; ein Pick (`pickMs`) 0,2-0,3 ms. Die erste Sekunde nach dem Laden hat eine lange Long Task - nie mitmessen.
- 2026-09-28, M1: `pickMs` misst nur `Picker.point` (0,2 ms). Ganze Klick-Ziele (`Picker.target`) kosteten mit `resourceObject` 10-16 ms, jetzt 0,7-1,2 ms (Dreiecks-Test für Bäume, Felsen, Gebäude). Messen: in `main.ts` nach `new Picker` vorübergehend `picker` auf `window` legen (nicht committen) und in `page.evaluate` über ein Raster aufrufen.
- 2026-09-28: Klickfläche prüfen: Playwright klickt ein Raster ab und malt die Treffer (Panel zeigt den Namen) als rote Punkte ins Bildschirmfoto. Haus am Hang in `Testseed`: im Spiel bauen (Taste 2, Klick) auf der Wiese bei 26,-44 (Ansicht `lat=-44&lng=28&zoom=5`, Klick 400,200), per `save` gesetzte Gebäude stehen sonst auf Bäumen.
- 2026-09-28, `Testseed`: Stein und Gold gibt es nur im Gebirge. Dort landet die Ansicht bis zu 50 Tiles neben `lat`/`lng` (Geländehöhe 30-40) - nachführen, bis das Tile in der Bildmitte stimmt. Gefunden: Stein bei -11,-5 (Ansicht `lat=-48&lng=-53&zoom=5`), Gold bei -28,-19 (`lat=-67&lng=-76`), Beeren bei -7,-79 (`lat=-79&lng=-7`). Beim Abrastern die Minimap (rechts unten) aussparen - ein Klick dort verschiebt die Kamera.
- 2026-09-27, M1, Dev-Server: Erstes Bild nach ~1,3 s (Bench-Welt) bzw. ~1,4 s (Demo), vorher ~5,7 s. Danach kostet die Ladezeit: Modelle parsen (`loadModel`), `bakeClips` je `EntityRenderer` (Spiel und Symbol-Bühne backen dieselben Clips doppelt), Symbole der Befehlsleiste (`readPixels`/`toDataURL`). Messen per CDP-Profiler (`Profiler.start` vor `page.goto`).
- 2026-09-27: Die Demo baut ihre Felder im ersten Bild, in dem eins sichtbar ist - ~0,5-1 s Stocken. Kosten je Feldart etwa zu gleichen Teilen: `farmModel` erzeugt OBJ-Text (~60 MB für alle), `parseObj` liest ihn wieder, `loadModel` misst je Furche das ganze Feld (9×).
- 2026-09-27: Auch auf diesem Rechner (M1) schwankt `stadt` zwischen Läufen desselben Codes zwischen 28 und 60 fps, bei gleichen Draw-Calls und Eckpunkten.
- 2026-09-26: `baseline.json` stammt von vor den Optimierungen (`6b5b5bd`). Nach der nächsten bewussten Messung neu setzen.
- 2026-09-26, M4: Screenshot-Rauschen zweier Läufe desselben Codes (angehalten, 1280×800, DPR 1): 0,004-0,095 % der Pixel, einzelne Pixel bis 237 Farbstufen (Animationen). Darunter gilt ein Bild als gleich.
- 2026-09-26, M4: `stadt` zeigt reproduzierbar eine einzelne `frameMsMax`-Spitze von 50-90 ms, auch auf `main` ohne Änderung (91,7 ms) - kein Befund gegen eine Änderung, Ursache noch offen.
- Medianwerte je Szene verstecken Spitzen: Beim Zoom-Wechsel `frameMsMax` und `terrainTexels` mit ansehen, nicht nur `frameMs`.
- Die Demo-Welt hat 31 Gebäude und 42 Dorfbewohner - weniger als die "große Stadt mit 80+" aus Szenario (b) des Optimierungsplans.

- 2026-09-29, M4: `gpuMs` (eine Timer-Query um die Hauptansicht) und die Wartezeit eines `readPixels` danach zeigen mit vsync beide ~12 ms, auch ohne 4 Mio. Eckpunkte Weizen - sie messen das Warten aufs nächste Bild mit. GPU-Last nur ohne Deckel messen (`npm run bench -- --uncapped`, AGENTS.md).
- 2026-09-29, M4: Timer-Queries je Abschnitt (Gelände, Gras, Modelle, ...) sind auf ANGLE Metal unbrauchbar: jede Grenze kostet selbst GPU-Zeit, Werte sprangen zwischen Läufen auf 66-130 ms bei 60 fps. `gl.finish()` blockiert dort nicht (0 ms).
- 2026-09-29, M4, ohne Deckel, Demo über den Äckern (`/game/Demo?lat=62&lng=100&zoom=4`): Weizen als Halme kostete ~5 ms je Bild (76 → 120 fps als Karten, 5,7 → 1,8 Mio. Eckpunkte), das Gras 0,5-1,1 ms (als Karten bei Zoom 5 ~0, bei Zoom 4 etwa gleich). Die Wärme des Rechners verschiebt fps zwischen Läufen um bis zu 40 % - nur direkt aufeinanderfolgende Paare vergleichen.

- 2026-09-29, M4, `stadt` ohne Deckel, Stand `7f1e195`: ~2 ms je Bild bei DPR 1 (vorher 5,2), kein Modell-Teil sticht mehr heraus. Offen: M1 (`stadt` 29-48 fps) mit diesem Stand neu messen - vermutlich war es die GPU.
- 2026-09-29, M4, DPR 2 (4,1 Mio. Pixel), ohne Deckel: Post-Effekte 1,2-1,4 ms je Bild in jeder Szene (größter fester Posten), Modelle in `stadt` 2,3 ms, Gelände vor dem CSS-Pixel-Gitter 1,2-1,9 ms. `nah` füllt bei DPR 2 nach 4 s noch den Gelände-Cache (100-250k Texel je Bild) - erst nach dem Anlauf messen.
- Zerlegen per Abschalten: Schalter über `localStorage.probe` in `map.ts`/`entityRenderer.ts` einbauen (nicht committen), Szenen des Bench ohne Deckel, je zwei Runden. `cheapground` (groundZ = 0) ist kein reiner Messwert - die Modelle stehen dann anders im Bild.

## Optimierungsplan

- 2026-09-26: Falsch im Plan, am Code geprüft: 2.2 ist nicht bit-identisch (ein grober Vorlauf überspringt schmale Grate); ein Early-out in `World.armoryStock` ändert das Verhalten, weil `world/render.ts` `has()` prüft. Die Zeilenangaben des Plans stimmen seit 2026-09-26 (Merge von PR #4) nicht mehr.

## Offen

- Schilf und Rohrkolben (`gl/grassRenderer.ts`, Uferstreifen über `uShoreLevel`) sind nur mit erzwungener Art geprüft: in `Testseed` folgt auf den Strand Wald, eine Wiese am Ufer fehlte zum Ansehen.
- Kein Screenshot-Skript im Repo - das Verfahren steht in `AGENTS.md`; als `tools/perf/shots.mjs` neben dem Bench wäre es ein Aufruf.
