---
name: screenshots
description: Bilder in Soliva vor und nach einer Shader-Änderung vergleichen - feste Szenen angehalten per Playwright aufnehmen, ein zweiter Lauf misst das Rauschen, dann pixelweise vergleichen und bewerten. Vor der ersten Änderung an GLSL in src/gl/ laden (terrainShader.ts, entityRenderer.ts, grassRenderer.ts, particleRenderer.ts, postRenderer.ts), bei Licht, Farben, Wasser oder Schatten und wenn eine Optimierung das Bild nicht ändern darf. Gilt zusätzlich zum Skill bench.
---

# Screenshots: Bilder vor und nach einer Shader-Änderung vergleichen

Gilt zusätzlich zum Skill `bench`. Ein fertiges Skript gibt es noch nicht. Das Aufnahme-Skript und die Bilder gehören nach `tmp/` (gitignored), nicht ins Repo.

## Aufnehmen

- Playwright mit `launch()` aus `tools/ui/browser.mjs`, Fenster 1280×800, `deviceScaleFactor: 1`.
- Das Spiel anhalten (`paused: true` in `pgm.settings`) und die Maus aus dem Bild nehmen.
- Szenen: weit, mittel, nah, Stadt (Welt `Demo`), Wasser oder Fels. Aufsetzen wie im Skill `bench`, „Eigene Szene messen“.
- Erst aufnehmen, wenn das Ladeschild weg ist (`#loading` verborgen) und kein Gelände mehr entsteht (`terrainTexels` in den Stats 0).
- Vergleichen geht ohne Zusatzpaket im Browser: beide PNG per `createImageBitmap` laden, `getImageData`, abweichende Pixel zählen und die größte Abweichung merken.

## Ablauf

1. Vor der Änderung alle Szenen aufnehmen (Lauf A).
2. Einen zweiten Lauf desselben Codes aufnehmen (Lauf B). Der Unterschied A/B ist das Rauschen der Animationen.
3. Ändern, dieselben Szenen aufnehmen (Lauf C) und C gegen A pixelweise vergleichen: Anteil abweichender Pixel und größte Abweichung je Szene.

## Bewerten

- Liegt der Unterschied im Rauschen (A/B), ist das Bild gleich.
- Liegt er darüber, die Bilder ansehen und die Änderung begründen oder zurücknehmen.
- Soll sich das Bild nicht ändern (reine Optimierung), muss die Abweichung im Rauschen liegen.
- Das Ergebnis je Szene in Commit oder PR, z. B. „Fels, Wasser, weit im Rauschen; Äcker, Stadt gewollt geändert“.
