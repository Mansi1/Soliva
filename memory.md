# memory.md

Gelerntes und Erfahrungen der Agenten - Regeln dazu in `AGENTS.md` ("memory.md").
Veraltetes löschen, Geändertes an Ort und Stelle korrigieren.

## Umgebung

- 2026-09-26, Mac (M4): Headless-Chrome aus `tools/ui/browser.mjs` rendert über Metal auf der echten GPU (`ANGLE Metal Renderer: Apple M4`), kein Software-Renderer; `EXT_disjoint_timer_query_webgl2` ist vorhanden. Messwerte aus Playwright sind echt.
- Bench, Rauchtest und Screenshots brauchen den laufenden Dev-Server (`npm run dev`, http://localhost:5173).

- 2026-09-26: Modelle aus Blender (auch per `blender-mcp`) mit `export_normals=False` exportieren. Mit Normalen wurde `villagers/male.glb` 4× so groß (118 → 508 KB), das Spiel liest nur POSITION.
- 2026-09-27: Die Fischerei-Modelle (`fisher_hut`, `fish_trap`, `fisher_boat`, `fishing_rod`, `herring`) kamen aus trimesh: Z oben, Vorderseite -Y, ohne glTF-Drehung, ohne `Entry`. Sie liegen dann im Spiel auf der Seite. Gedreht mit `glbToObj` → (x, z, -y) → `objToGlb`, Marker als kleine Würfel ergänzt. Bei jedem neuen GLB den `generator` prüfen. Neue Fassungen aus trimesh brauchen die Drehung wieder.
- 2026-09-27: `render.ts` rechnet mit Maßen aus den Fischerei-Modellen (`BOAT_*`, `TRAP_DRAFT`). Wer Boot oder Reuse neu exportiert, muss sie nachziehen.
- 2026-09-26, M4: `stadt`-fps schwanken zwischen Läufen desselben Codes zwischen 50 und 60 (Median je Lauf). Einzelläufe belegen nichts. Nur abwechselnd A/B/A/B messen (Datei tauschen, 4 s warten, `npm run bench`).

- 2026-09-27: Im Demo-Stand stehen keine Tiere im Startbild (die 125 liegen weit weg, z. B. bei 35,-104). Zum Testen vor dem Laden `animals` im Spielstand ersetzen, z. B. `{ k: 'deer', x: 92, y: 70, hp: 3, f: 140 }` neben dem Hauptgebäude (96,67). Das Spiel hat keine Test-Hooks auf `window`, außer den Render-Stats.

## Repo

- `main` folgt `upstream` (Mansi1/procedurally-generated-map). PR-Branches werden nach `origin` (kyr0/soliva) gepusht, die PRs laufen gegen `upstream`.

## Messen

- 2026-09-26, M4, Stand `6b5b5bd`: Alle Bench-Szenen laufen mit 60 fps und `frameMsMax` 16,8 ms, auch `zoom-wechsel`. Der Zoom ist auf diesem Rechner nicht langsam, Gewinne im Gelände-Shader zeigt der Bench hier nicht.
- 2026-09-26, M4: Größenordnungen je Bild - `weit-leer` 144 Draw-Calls, 0,87 Mio. Gelände-Eckpunkte; `stadt` rund 3 Mio. Modell-Eckpunkte; `zoom-wechsel` rund 95.000 neue Gelände-Texel; ein Pick (`pickMs`) 0,2-0,3 ms. Die erste Sekunde nach dem Laden hat eine lange Long Task - nie mitmessen.
- 2026-09-27, M1, Dev-Server: Erstes Bild nach ~1,3 s (Bench-Welt) bzw. ~1,4 s (Demo), vorher ~5,7 s. Danach kostet die Ladezeit: Modelle parsen (`loadModel`), `bakeClips` je `EntityRenderer` (Spiel und Symbol-Bühne backen dieselben Clips doppelt), Symbole der Befehlsleiste (`readPixels`/`toDataURL`). Messen per CDP-Profiler (`Profiler.start` vor `page.goto`).
- 2026-09-27: Die Demo baut ihre Felder im ersten Bild, in dem eins sichtbar ist - ~0,5-1 s Stocken. Kosten je Feldart etwa zu gleichen Teilen: `farmModel` erzeugt OBJ-Text (~60 MB für alle), `parseObj` liest ihn wieder, `loadModel` misst je Furche das ganze Feld (9×).
- 2026-09-27: Auch auf diesem Rechner (M1) schwankt `stadt` zwischen Läufen desselben Codes zwischen 28 und 60 fps, bei gleichen Draw-Calls und Eckpunkten.
- 2026-09-26: `baseline.json` stammt von vor den Optimierungen (`6b5b5bd`). Nach der nächsten bewussten Messung neu setzen.
- 2026-09-26, M4: Screenshot-Rauschen zweier Läufe desselben Codes (angehalten, 1280×800, DPR 1): 0,004-0,095 % der Pixel, einzelne Pixel bis 237 Farbstufen (Animationen). Darunter gilt ein Bild als gleich.
- 2026-09-26, M4: `stadt` zeigt reproduzierbar eine einzelne `frameMsMax`-Spitze von 50-90 ms, auch auf `main` ohne Änderung (91,7 ms) - kein Befund gegen eine Änderung, Ursache noch offen.
- Medianwerte je Szene verstecken Spitzen: Beim Zoom-Wechsel `frameMsMax` und `terrainTexels` mit ansehen, nicht nur `frameMs`.
- Die Demo-Welt hat 31 Gebäude und 42 Dorfbewohner - weniger als die "große Stadt mit 80+" aus Szenario (b) des Optimierungsplans.

## Optimierungsplan

- 2026-09-26: Falsch im Plan, am Code geprüft: 2.2 ist nicht bit-identisch (ein grober Vorlauf überspringt schmale Grate); ein Early-out in `World.armoryStock` ändert das Verhalten, weil `world/render.ts` `has()` prüft. Die Zeilenangaben des Plans stimmen seit 2026-09-26 (Merge von PR #4) nicht mehr.

## Offen

- GPU-Zeit fehlt im Bench: `gpuFillMs` über `EXT_disjoint_timer_query_webgl2` würde Shader-Optimierungen belegbar machen - vor Plan 5.1 (Höhen-Textur) einbauen.
- Kein Screenshot-Skript im Repo - das Verfahren steht in `AGENTS.md`; als `tools/perf/shots.mjs` neben dem Bench wäre es ein Aufruf.
