# Was noch offen ist

Stand 25.09.2026. Alles, was im Spiel eine Form hat oder sich bewegt, kommt
aus Blender (docs/BLENDER.md, docs/ANIMATION.md): 59 Modelle und 4 Clip-Bibliotheken als
`.glb` in `src/models/`, die Felder aus Pflanzen-Teilen. Kein Python, kein
Blender beim Bauen. Die Bewegungsformeln
im Shader sind gelöscht. `npm test` wacht darüber, dass keine ID verloren
geht.

Was danach noch zu tun bleibt, grob nach Wichtigkeit.

## Zuerst

- **Mögliche Konflikte beim Übernehmen:** Der L-System-Branch
  (`lsystem-blattebenen`, eigener Worktree unter `.agents/worktree`) ändert
  ebenfalls `tools/README.md`, dessen Anfang hier neu geschrieben wurde.
- **Clips in Blender bearbeiten - Export-Einstellungen finden.** Die
  Clip-Bibliotheken (`src/models/clips/*.glb`) sind seit dem 25.09.2026 die
  Quelle. Zur Probe durch Blender (Import, sofort Export mit den Vorgaben)
  wichen die Hände danach bis 7 cm von der Formel ab (`chop`, vorher
  0,5 cm), die Tiere bis 0,9 cm (vorher 0,01 cm) - Blender rechnet die
  Bilder neu ab. Einstellungen suchen (Bildrate 30, Sampling, keine
  Optimierung der Keyframes), bei denen `npm run check:anim` gleich bleibt,
  und in docs/ANIMATION.md festhalten. Bis dahin Clips nicht über Blender
  speichern.
- **Tests automatisch laufen lassen.** `npm test` und `npm run smoke` laufen
  nur von Hand. Eine CI (z. B. GitHub Actions) würde bei jedem Push prüfen.
  Blender braucht keiner der Tests.

## Prüfen

- **Bildrate mit vielen Figuren ohne die Formeln.** Mit Formeln brauchten 500
  Figuren 54-60 ms je Bild, mit Clips 38 ms (Software-GL im Test-Browser).
  Nach dem Löschen der Formeln nicht neu gemessen; die Demo-Welt läuft mit
  56-60 Bildern je Sekunde.
- **Erlegter Hase:** Im Vergleich vorher/nachher 2,28 % andere Pixel, Ursache
  nicht gefunden. Nebeneinander sieht er gleich aus.
- **Symbole neu zeichnen:** Nach Änderungen an Modellen `npm run gen:ui`
  laufen lassen - die Symbole der Rohstoffleiste zeigen die Modelle.

## Vorhaben: Animationen und Modelle verbessern (ab 26.09.2026)

Beschlossen, in dieser Reihenfolge. Erledigte Schritte hier streichen und
in docs/ANIMATION.md unter „Stand" festhalten.

0. **Blender anbinden (`blender-mcp`).** Mit dem Add-on kann ein Agent Blender
   live steuern, also Modelle ansehen und ändern. Das Add-on und der Server
   (`uvx blender-mcp`) laufen in Python, aber außerhalb des Repos. Im Repo
   bleibt kein Python. Seit 26.09.2026 eingerichtet, aus dem lokalen
   Checkout `~/Projects/py/mcp-for-blender`: Das Add-on liegt in Blender 4.3,
   der Server ist in Claude Code als `blender` eingetragen (Telemetrie aus).
   In Blender das Add-on „MCP for Blender" einschalten, dann N → „MCP for
   Blender" → Start MCP Server. Clips *nicht* über
   Blender speichern, solange die Export-Einstellungen fehlen (siehe oben,
   „Zuerst").
1. **Übergänge überblenden:** Posen springen heute sofort um. Geplant ist,
   etwa 0,2 s zu überblenden, z. B. von Gehen zu Hacken. Dazu braucht jede
   Figur einen zweiten Clip (den vorigen) und ein Gewicht. Gemischt wird im
   Shader zwischen den beiden Posen aus der Clip-Textur.
2. **Schichten** (`walk` für die Beine, `carry` oder `aim` für die Arme):
   Das baut auf Schritt 1 auf und nutzt denselben zweiten Clip, gewichtet je
   Knochen statt je Figur. Erster Fall: Tragen beim Gehen.
3. **Clips verkleinern:** `clips/humanoid.glb` hat 1,2 MB, vor allem wegen
   `stand` (34 s Schleife, jedes Bild voll gespeichert). Die Schleife soll
   kürzer werden oder weniger Bilder haben. `npm run check:anim` muss dabei
   halten.
4. **Bewegungen natürlicher, Modelle verbessern:** Stand 26.09.2026: Der
   Mann (`villager_male`) ist neu geformt, mit runden Gliedern und
   aufgemalten Details (docs/BLENDER.md). Er hat 3 092 statt 4 900 Dreiecke,
   Gelenke und Clips sind unverändert. Offen: die Frau, danach die Tiere.
   Gearbeitet wird über Blender (Schritt 0) oder direkt in den `.glb` mit
   `tools/models/glb.mjs`. Welche Clips und Modelle zuerst drankommen, legt
   der Nutzer mit Beispielen fest.

Jede Änderung am Rendering wird mit Bench und Screenshots belegt (AGENTS.md).

## Bewegungen (docs/ANIMATION.md)

- **Weiche Haut:** Beim Mann erledigt. Er ist eine Hülle mit Knochen aus
  Blender (docs/BLENDER.md, „Knochen"). Die Frau ist noch starr in Teile
  geschnitten.
- **Körper in `humanoid.blend`:** Die Figur in der Clip-Bibliothek ist nur
  Vorschau. Wird ein Körper in `models/villagers/` geändert, passt die
  Vorschau nicht mehr dazu - die Clips selbst passen, die Gelenke liest das
  Spiel aus dem Körper.
- **Weitere Werkzeuge** als Anhänge: Spitzhacke, Hacke, Speer - heute hält
  jeder beim Hacken, Pflügen und Jagen das Beil.
- **Einsturz:** bleibt prozedural. Möglich wäre je Gebäude ein gestalteter
  Einsturz-Clip.

## Modelle (docs/BLENDER.md)

- **Neue Modelle brauchen Code.** Ein neues Gebäude oder Tier muss im Spiel
  eingetragen werden (Import, `SHAPE`, `MODELS` in `entityRenderer.ts`, bei
  Gebäuden die Klasse). Ein Eintrag je Modell aus einer Liste würde das
  ersparen.
- **Gemeinsame Teile:** Fass, Kiste, Laterne, Zielscheibe, Schild stecken in
  jedem Gebäude als eigene Kopie. Eine Bibliothek (`library.blend`,
  verknüpfte Collections) machte sie an einer Stelle änderbar.
- **Materialien:** Das Aussehen (Holzmaserung, Leinen, Stroh ...) rechnet der
  Shader nach dem Materialnamen. In Blender sieht man nur die Farbe. Eine
  Vorschau der Muster in Blender (Material-Knoten) fehlt.
- **Kleine Abweichungen durch den Umzug** (gewollt, zur Kenntnis):
  - Zugmesser der Frau ist das des Mannes, auf ihren Handabstand gestreckt.
  - Felder: Ähren setzen den Halm fort (im Mittel 1,5 cm anders), Maiskolben
    haben eine feste Höhe statt einer zufälligen.
  - Fahne am Sammelpunkt: 4 statt 5 Nachkommastellen (unter 0,1 mm).
  - Fahne am Dorfzentrum weht etwas ruhiger (Clip statt Formel).
