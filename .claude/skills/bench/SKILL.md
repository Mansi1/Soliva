---
name: bench
description: Leistung in Soliva messen und belegen - Render-Stats lesen, npm run bench vor und nach der Änderung, Ergebnis richtig lesen (Rauschen, vsync), GPU-Last ohne Deckel, Teile abschalten, eigene Szenen per Playwright. Vor der ersten Änderung am Rendering oder an der Leistung laden (src/gl/, src/map.ts, Render-Schleife in src/main.ts, Gelände, Gras, Modelle, Partikel, Shader) und bei Fragen zu fps, Rucklern, Bildzeit oder Ladezeit.
---

# Bench: Leistung messen und belegen

Hintergrund und Plan: `docs/OPTIMIZATION_PLAN.md` (ein Hinweis, keine Tatsache, siehe `AGENTS.md`). Frühere Messwerte und das Rauschen je Rechner stehen in `memory.md`.

## Vor einer Vermutung: Render-Stats

`window.getRenderStats()` (`src/renderStats.ts`) liefert die letzten 30 Sekunden, je Sekunde ein JSON-Objekt: fps, `frameMs`/`cpuMs` samt Aufteilung (`simMs`, `collectMs`, `renderMs`, `minimapMs`, `pickMs`), `longTaskMs`, `drawCalls`, `vertices`, `terrainVertices`, `terrainTexels`, `instances`/`batched` und mehr. Per Playwright: `page.evaluate(() => window.getRenderStats())`. `window.getRenderInfo()` nennt die Umstände: GPU, Pixel-Verhältnis, Einstellungen, `off`.

## Ablauf

1. Dev-Server starten: `npm run dev` (http://localhost:5173) oder `make start`.
2. Vor der Änderung `npm run bench`. Das Skript misst vier feste Szenen, je Feld der Median über 8 Sekunden, und vergleicht mit `tools/perf/baseline.json`.
3. Ändern.
4. Nachher `npm run bench`, auf demselben Rechner unter denselben Umständen.
5. Beide Ausgaben mit Vorher/Nachher in Commit oder PR. Zeigt die Messung keinen Effekt, das offen sagen und keinen behaupten.

- Vorher-Lauf verpasst: `main` in einem Worktree auf eigenem Port starten (`npx vite --port 5188`) und `node tools/perf/bench.mjs http://localhost:5188` messen.
- `npm run bench -- --save` setzt die Basis neu. Das nur bewusst und nur auf demselben Rechner tun.

## Ergebnis lesen

- Zählwerte (`drawCalls`, `vertices`, `terrainVertices`, `terrainTexels`) rauschen um ±2 %. Sie sind die harten Belege.
- Zeiten um 1 ms (`cpuMs`, `renderMs`) rauschen bis ±40 %. Kleine Zeitunterschiede belegen nichts.
- `fps` steht bei 60 an (vsync). Ein Gewinn zeigt sich in `cpuMs` und den Zählwerten, nicht in `fps`.
- Meldet der Bench eine andere GPU oder einen anderen Deckel als die Basis, taugt der Vergleich mit der Basis nicht. Dann `main` und Branch im selben Lauf messen.

## GPU-Last

- `npm run bench -- --uncapped` startet Chrome ohne vsync und Bildraten-Deckel. Dann zeigen `fps`/`frameMs` die Last. Nicht mit einer Basis ohne `--uncapped` vergleichen.
- `gpuMs` mit vsync misst auf Apple (ANGLE Metal) das Warten aufs nächste Bild mit und taugt dort nicht zum Vergleich.
- Abschalten statt Vermuten: einen Teil testweise nicht zeichnen und die fps ohne Deckel vergleichen. Dafür hat das Entwickler-Panel (`showDebug`) die Zeile „Aus“: Gras, Modelle, Partikel, Vorausrechnen (`MapRenderer.off`). Per Playwright: `page.click('#dev-off input[data-off=models]')`. `getRenderInfo().off` nennt, was aus ist.
- Die Leertaste (flaches Gelände) spart die Höhen im Gelände-Gitter.
- Das Vorausrechnen läuft im Stand mit (3 Kacheln je Bild). Für Bildzeiten im Stand abschalten.

## Eigene Szene messen

Die vier Bench-Szenen haben kaum Bäume. Für anderes eine eigene Szene per Playwright aufsetzen, mit `launch()` aus `tools/ui/browser.mjs`, Fenster 1280×800 und `deviceScaleFactor: 1` wie in `tools/perf/bench.mjs`.

- Am einfachsten per Link `/game/<seed>?lat=…&lng=…&zoom=…&save=…` (`AGENTS.md`, „Test-Spielstände als Link“).
- `entry.ts` lädt `main.ts` erst nach dem `load`-Ereignis. Wer Welt und Start-Vermerk selbst setzt (`pgm.seed`, `sessionStorage` `pgm.start`), wartet vorher, bis `window.getRenderStats` existiert. Sonst verbraucht die laufende Seite den Vermerk, und gemessen wird das Hauptmenü, mit plausibel aussehenden Zahlen.
- Danach prüfen, dass `#start` verborgen ist, und in den Stats nachsehen, ob `tileSize` zur Szene passt.
- **Stillstand ist keine Langsamkeit:** Steht die Kamera eine Sekunde, zeichnet das Spiel absichtlich nur 30 fps (`idleFps`), in den Stats `idle` nahe 1. Zum Messen `idleFps: false` in `pgm.settings` setzen. Der Bench tut das schon.
- **Nur gleiche Umstände vergleichen:** Playwright läuft mit Pixel-Verhältnis 1, ein Retina-Bildschirm mit 2, also viermal so vielen Pixeln. Vor einem Vergleich `getRenderInfo()` beider Läufe ansehen.
- Wegwerf-Skripte und Ergebnisse nach `tmp/` (gitignored), nicht ins Repo.
