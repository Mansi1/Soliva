# tools

Skripte rund um die Modelle und Bilder in `src/`. Die Modelle sind `.glb`-Dateien
in `src/models/`, die Blender direkt öffnet und speichert (docs/BLENDER.md) -
sie brauchen keinen Export; ebenso die Clip-Bibliotheken `src/models/clips/*.glb`.

| Befehl | erzeugt |
| --- | --- |
| `npm run gen:ui` | `src/icons/*.png`: Symbole der Rohstoffleiste und ihre Holztextur |

- `models/glb.mjs` - liest und schreibt die Modelle (`.glb` ↔ OBJ/MTL-Text), mit den Regeln für
  Objektnamen; `models/check-models.mjs` prüft die Namen mit Bedeutung (`npm run check:models`)
- `blender/parity*.mjs` - vergleicht die Clips mit den früheren Formeln (`npm run check:anim`)
- `models/primitives.mjs` - Grundformen (für das L-System und die Felder)
- `models/farmsGen.mjs` - stellt die Felder (Weizen, Mais, Tomaten, Kartoffeln, Hopfen) aus ihren Teilen aus Blender auf
  (`src/models/fields/*.glb`); `node tools/models/farms.mjs <Ordner>` schreibt sie zum Ansehen als OBJ
- Die früheren Generatoren (`villagers.mjs`, `buildings.mjs` ...) und der Export der Modelle
  aus `.blend` sind entfallen; sie stehen in der Git-Geschichte.
- `ui/icons.mjs` + `ui/icons.html` - rendert die Spielmodelle als Symbole
- `ui/wood-bar.mjs` - Holzplanken für die Rohstoffleiste
- `ui/smoke.mjs` - Rauchtest im Browser (`npm run smoke`, bei laufendem `npm run dev`):
  Hauptmenü, neues Spiel, bauen, ausbilden, Feld, speichern und neu laden, Demo, alter
  Spielstand, Galerie.
  Andere Adresse als Argument: `node tools/ui/smoke.mjs http://localhost:5199`

`gen:ui` braucht Google Chrome (über `playwright-core`). Liegt Chrome nicht am
üblichen Ort unter macOS, den Pfad in der Umgebungsvariable `CHROME` angeben.
Die Symbole zeigen die Modelle - nach einer Änderung an einem Modell also `gen:ui` laufen lassen.

## L-System-Bäume (`lsystem/`)

Versuch, Bäume und Pflanzen mit einem [L-System](https://en.wikipedia.org/wiki/L-system)
in 3D zu erzeugen - noch nicht im Spiel. In TypeScript, streng geprüft:
`npx tsc -p tools/lsystem`.

- Spielwiese: `npm run dev`, dann <http://localhost:5173/tools/lsystem/> - online unter
  `/tools/lsystem/` (im Hauptmenü "L-System"; `vite.config.ts` baut beide Seiten mit). Beispiel
  wählen, Regeln und Regler ändern, Blätter als Form oder Foto, ziehen dreht,
  Mausrad zoomt, als OBJ + MTL herunterladen.
- Galerie aller Beispiele: <http://localhost:5173/tools/lsystem/gallery.html>
  (`?leaves=texture` für die Fotos)
- „Für Blender herunterladen (.glb)“ in der Spielwiese: eine glTF-2.0-Datei mit
  eingebetteten Texturen (gltf.ts), Blender öffnet sie über File > Import > glTF 2.0.
  Echte .blend-Dateien kann nur Blender selbst schreiben - glTF ist der Austauschweg.
- Export aller Beispiele: `npx vite-node tools/lsystem/export.ts [--texture] [--einzeln] [Zielordner]`
  (Standard `tools/lsystem/out`, nicht eingecheckt). Ohne `--texture` sind die Blätter
  einfarbige Flächen nach dem Umriss des Fotos und die Rinde einfarbig, mit `--texture`
  Blatt-Vierecke mit Foto und die Rinde als Kachel-Textur (`map_Kd`/`map_d`, die Bilder
  werden nach `<Zielordner>/textures/` kopiert).
- Blattebenen: Das Laub besteht aus Ebenen mit einem Zweig und 4 bis 6 Blättern
  (`img/<name>-card.png`) - weniger Flächen, dichter. `--einzeln` bzw. „Einzelblätter“
  in der Spielwiese setzt jedes Blatt als eigene Fläche. Nadelbäume nutzen ihr
  Zweigfoto direkt, es ist schon eine Ebene.
- `lsystem.ts` - Regeln lesen, ersetzen, Schildkröte in 3D (mit Tropismus), Astdicke
  nach dem Pipe-Modell, Laub und Organe (Blatt, Ähre, Kolben, Rosetten, Früchte)
- `foliage.ts` - echte Blätter: Umriss triangulieren oder Foto-Viereck, Farbe bzw. Einfärbung
- `leaves/` - Blattfotos von Wikimedia Commons: `sources.ts` (Datei, Lizenz, Drehung),
  `fetch.ts` lädt, stellt frei und setzt die Blattebenen zusammen (`process.ts`;
  `npx vite-node tools/lsystem/leaves/fetch.ts [name ...]`, braucht Chrome wie `gen:ui`,
  Downloads bleiben in `.cache/`), Ergebnis in `img/`, `leaves.json` und `CREDITS.md`.
  Die Bilder stehen unter CC BY-SA/CC BY/CC0 - Urheber und Lizenz in `leaves/CREDITS.md`
  nennen, wenn sie weitergegeben werden.
- `bark/` - Rinden-Texturen: CC0 von Poly Haven, die Birke von Wikimedia Commons
  (`bark/CREDITS.md`). `bark/fetch.ts` lädt und verkleinert sie; `sources.ts` ordnet
  jedem Stamm-Material eine Textur zu (`MATERIAL_BARK`), Rezepte weichen mit
  `barkTexture` ab. Die Stämme sind dafür mit Texturkoordinaten abgewickelt
  (u = Umfang, v = Weg vom Boden); die Vorschau zeigt die Rinde in beiden
  Blatt-Modi - das Spiel hätte dafür seinen eigenen Shader
  (`treeTexture` in `src/gl/entityRenderer.ts`).
- `materials.ts`, `mtl.ts` - Farben und MTL-Ausgabe
- `presets/` - Rezepte nach Gruppen: Laubbäume, Nadelbäume, Obstbäume, Exoten,
  Getreide, Klassiker aus "The Algorithmic Beauty of Plants"; dazu Varianten
  (Herbst, Winter, Blüte, jung) über `variant`, `autumn`, `winter` in `presets/base.ts`
- `render.ts`, `looks.ts`, `viewer.ts`, `gallery.ts` + die beiden HTML-Seiten - Vorschau
  in WebGL2 (Tiefentest, Beleuchtung im Shader, Mipmaps, Alphatest fürs Laub);
  alle Canvases teilen sich einen Kontext, das Bild wird per drawImage kopiert
