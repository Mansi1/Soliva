# Migrationsplan: Animationen wie in Blender

Was noch offen ist: docs/OFFEN.md.

Ziel: Bewegungen werden in Blender gemacht und nicht mehr als Formeln im
Shader geschrieben. Dazu gehören Skelett, Gewichte, Keyframes und IK. Das
Spiel spielt sie ab. Was keine Animation im Blender-Sinn ist, sondern vom
Spielzustand abhängt, bleibt im Shader. Beispiele: Beeren verschwinden, ein
Baum wird abgesägt, das Werkstück auf der Bank wächst. Solche Dinge bekommen
aber feste, in Blender pflegbare Namensregeln.

## Stand

Phase 0 und Phase 1 sind fertig. Von Phase 2 ist der erste Teil fertig:
**Alle sechs Bewegungen der Dorfbewohner kommen als Clips aus Blender**
(`stand`, `walk`, `chop`, `pick`, `mow`, `carve`), für Mann und Frau.

- **Gleichstand:** Alle Clips stimmen auf den Bildern mit den Formeln
  überein, bei Mann und Frau auf 0,00 cm genau (Hände, Füße, Kopf, unterer
  Rumpf; `npm run check:anim`). Die Ausnahme ist `stand`: Das Atmen
  (Oberkörper streckt sich) kann kein Knochen tragen und fällt weg, am
  Scheitel sind das bis 1,4 cm. Die Gewichtsverlagerung ist als Rollen der
  Wurzel nachgebildet, bis 0,6 cm. Zwischen den Bildern weicht `carve` dort
  ab, wo die Formel selbst springt (Ende eines Zugs, Prüfen), bis 7,8 cm.
- **Je Körper gebacken:** Die Frau schreitet beim Gehen kürzer
  (`uStride` 0,6 auf die Oberschenkel). Beim Knien liegt ihr Knie mit ihrer
  eigenen Kniehöhe auf dem Boden.
- **Was im Shader nachgebildet wird, weil Knochen es nicht tragen:**
  - Der Hosenboden schwingt mit der Drehung der Schultern (`clipTwist`, gelesen
    aus der Matrix des Oberkörpers).
  - Die Frau trägt seit 27.09.2026 Hose statt Rock; das Stauchen des Rocks
    beim Knien ist aus dem Shader entfernt. `kneel` senkt nur noch die
    Figur, bis das Knie den Boden berührt (`HUMANOID.rootZ`).
- **Textur:** Die Bilder aller Clips liegen in Spalten zu 1024 Bildern.
  Mann und Frau brauchen zusammen 4118 Bilder, das passt auf jede
  WebGL2-Grafik.
- **Größe:** `clips/humanoid.glb` hat 1,2 MB, vor allem durch `stand`
  (34 s Schleife).

- **Takt-Marken:** Der Ton beim Hacken, Pflücken, Mähen und Schnitzen kommt
  aus `strike` des Clips in `clips/humanoid.json` (`VillagerWork.swing`). Über
  20 Minuten Arbeit kommt jeder Ton im selben Takt wie mit der Formel.
- **IK für die Hände:** Die frühere `humanoid.blend` hatte IK-Ziele für beide
  Hände, aktiv in `carve` und `mow`. Ihr Ergebnis ist in die Clips gebacken;
  die IK-Ziele selbst gibt es seit dem Wegfall der `.blend`-Dateien
  (25.09.2026) nicht mehr.

**Werkzeuge sind Anhänge:** Beil, Sense und Zugmesser stecken nicht mehr in
den Körpern, sondern sind eigene Modelle an der rechten Hand
(`src/models/props/*.glb`). Sie erscheinen je nach den `props` des Clips, den
die Figur gerade spielt. Das Bild ist Pixel für Pixel wie vorher (alle Posen
von Mann und Frau). Die eine Ausnahme ist das Zugmesser der Frau: Es war
bisher für ihren Handabstand eigens gebaut und wird jetzt aus dem des Mannes
auf ihren gestreckt, die Griffe sitzen dabei weiter in beiden Händen.
Siehe „Werkzeuge anhängen" unten.

**Die Formeln sind weg.** Im Shader bewegt nur noch der Clip-Weg Figuren,
Tiere, Mühlenflügel und Fahnen. Gelöscht sind die Posen 0-5 der Figuren, der
Tier-Zweig, die Flügel- und die Tuch-Formel samt ihren Uniforms (`uShoulder`,
`uElbow`, `uStride`, `uLegs`, `uNeck`, `uGraze`, `uSide`, `uHub`) und die
Hilfen `swingAround`, `swingSideways`, `swingAt`. Der Vertex-Shader hat 648
statt 941 Zeilen. Die Maße der Modelle (Hüfte, Knie, Nabe, Beine, Hals ...)
bleiben - mit ihnen werden die Clips gebacken. `poses/mow.json` und
`poses/carve.json` bleiben ebenfalls: `tools/export/poses.mjs` und
`npm run check:anim` rechnen damit.

- **Ohne Clip:** Fehlt eine Bibliothek, stehen ihre Figuren in Ruhelage still,
  Werkzeuge weggesteckt - es stürzt nichts ab. Der Rauchtest schlägt dann an
  (`window.__clipLibraries`, „Clips aus Blender geladen").
- **Fahne auf dem Dorfzentrum:** spielt jetzt auch den Clip `wave`. Er ist
  für das Tuch am Sammelpunkt gemacht; ein längeres Tuch (in Modell-Einheiten)
  schlägt entsprechend weiter aus (`FlagJoints.stretch`, `Rig.moveScale`).

Offen in Phase 2: Schichten (`walk` + `carry`).

**Phase 3 ist fertig: Alle sechs Tiere spielen Clips aus
`src/models/clips/quadruped.glb`** (Reh, Hase, Kuh, Schaf, Ziege,
Wildschwein).

- **Gleichstand:** Alle Clips stimmen auf den Bildern mit der Formel überein,
  bei jeder Art auf höchstens 0,01 cm (Hufe, Maul, Körper vorn und hinten;
  `npm run check:anim`). Zwischen zwei Bildern sind es bis 0,4 cm, am Knick
  des Anhebens beim Springen.
- **Wiederverwendet:** Es gibt ein Skelett und eine Bibliothek für alle
  Arten, bearbeitet wird am Reh. Eigene Clips gibt es nur, wo eine Art anders
  läuft: `hop` und `hop_flee` (Hase), `trot` (Kuh auf der Flucht).
- **Je Art gebacken:** Beim Äsen senkt jede Art den Kopf so weit, bis ihr Maul
  den Boden erreicht. Der Knochen `neck` wird dafür auf ihr eigenes `uGraze`
  gebracht. Erlegt liegt sie so hoch, wie ihr Körper halb breit ist.
- **Größe:** `clips/quadruped.glb` hat 0,3 MB, vor allem durch `graze`
  (35,4 s Schleife).

**Phase 4 ist fertig: Mühlenflügel und Fahne spielen Clips** aus
`src/models/clips/mill.glb` (Clip `sails`) und `clips/flag.glb` (Clip `wave`).

- **Gleichstand:** Die Fahne weicht an den Eckpunkten des Tuchs um 0,03 cm
  ab. Die Böen der Flügel sind exakt. Die Stellung der Flügel weicht bis 6,4°
  ab, weil alle Mühlen eine gebackene Schleife teilen. Wegen der vier Flügel
  ist das nicht zu sehen.
- **Ruinen:** Eine eingestürzte Mühle hält die Flügel an. Der Zeitpunkt
  kommt jetzt aus der Spieluhr (`animationTime()`). Vorher lag der Winkel nach
  Pause oder Tempowechsel daneben.
- Die Fahne auf dem Dorfzentrum spielt denselben Clip, auf ihr Tuch gestreckt.

**Alle Clips zusammen:** rund 16 000 Bilder (Dorfbewohner 4118, Tiere 6756,
Mühlen 5032, Fahne 39). Das sind 16 Spalten in einer Textur von 768 × 1024
Texeln, etwa 12,6 MB Grafikspeicher. Die vier Bibliotheken zusammen haben
1,7 MB.

Aus Phase 1:

- **Gleichstand:** Der Clip entspricht der alten Formel exakt. Die rechte
  Hand weicht über alle 786 Bilder um 0,00 cm ab.
- **Leistung:** 500 schnitzende Figuren brauchen 38 ms je Bild. Mit den
  Formel-Posen sind es 54-60 ms (Messung ohne Spiel-Logik, Software-GL im
  Test-Browser). Der Clip-Weg ist also schneller: einige Texturzugriffe statt
  viel Trigonometrie je Eckpunkt.
- **Hin und zurück:** Eine Änderung in Blender kam damals (Export aus der
  `.blend`) im Spiel an, geprüft mit einem nach hinten gedrehten Kopf.


## Überblick: wie es aufgebaut ist

Seit dem 25.09.2026 gibt es keine `.blend`-Dateien und keinen Export mehr:
Die Clip-Bibliotheken sind selbst die Quelle.

```
 1. KÖRPER (docs/BLENDER.md)
    src/models/villagers/male.glb, src/models/villagers/female.glb
                                   (Teilnamen wie Arm.L.Lower + Materialnamen)

 2. BEWEGUNGEN - je Skelett eine Bibliothek, eingecheckt
    src/models/clips/humanoid.glb      Skelett + alle Clips (gebackene Bilder, 30 fps)
    src/models/clips/humanoid.json     je Clip: Länge, Werkzeuge, Pose, Takt ... (von Hand)
    ebenso quadruped, mill, flag
            │
            ▼
    src/gl/clips.ts                    liest die Clips (Drehung je Knochen gegenüber
                                       der Ruhelage) und backt sie je Figur in eine Textur
            │
            ▼
    src/gl/entityRenderer.ts           Shader: Pose mit Clip → Skinning aus der Textur,
                                       ohne Clip → Ruhelage
            │
            ▼
    Spiel und Galerie („Clips aus Blender“)
```

**Quellen:**

| Art | Dateien | Bearbeiten? |
|---|---|---|
| Bewegung | `src/models/clips/*.glb` | in Blender (Import/Export glTF), siehe unten |
| Angaben je Clip | `src/models/clips/*.json` | von Hand |
| Körperform | `src/models/villagers/*.glb` | in Blender (Import/Export glTF) |
| Spiel-Logik | `src/gl/clips.ts`, `src/gl/entityRenderer.ts` | als Code |
| Prüfen | `tools/blender/parity*.mjs` (`npm run check:anim`), `tools/export/*` (glTF-Vorschau) | - |

**Was wo geändert wird:**

| Ich will ... | Wo |
|---|---|
| eine Bewegung ändern | `clips/humanoid.glb` bzw. `clips/quadruped.glb` (Tiere) → die Animation gleichen Namens |
| Mühlenflügel oder Fahne ändern | `clips/mill.glb` → `sails`, `clips/flag.glb` → `wave` |
| einen neuen Clip | neue Animation im `.glb` und ein Eintrag in `clips` der `.json` |
| festlegen, welche Pose ein Clip ersetzt | `pose` des Clips in der `.json` |
| einen Clip nur für bestimmte Tiere | `species` des Clips in `clips/quadruped.json` (z. B. `["hare"]`) |
| die Form eines Körpers ändern | `src/models/villagers/*.glb` in Blender |
| ein Werkzeug ändern oder neu anhängen | `src/models/props/*.glb` in Blender, `FIGURE_PROPS` in `entityRenderer.ts`, siehe „Werkzeuge anhängen" |
| einen Clip ansehen | Galerie → „Clips aus Blender" |

**Drei Regeln halten es zusammen:**

1. **Knochennamen sind der Vertrag.** Das Spiel erkennt Knochen am Namen
   (`HUMANOID_BONES` in `clips.ts`). Wird einer in Blender umbenannt, findet
   das Spiel ihn nicht mehr.
2. **Clips sind getrennt von den Körpern.** Ein Clip trägt nur Drehungen und
   passt deshalb auf jeden Körper mit denselben Knochen.
3. **Materialnamen bleiben.** Das Aussehen kommt aus dem Shader nach Namen.
   Farben in Blender sind nur Vorschau.

## Werkzeuge anhängen

Ein Werkzeug ist ein eigenes kleines Modell (`src/models/props/<name>.glb`),
in Metern, mit dem Ursprung in der Mitte der rechten Hand in Ruhelage (Arm
hängt). Das Spiel hängt es an die rechte Hand des Körpers, der es trägt:

- **Je Werkzeug und Körper eine Form** (`SHAPE.propAxe`, `propAxeFemale` ...).
  Beim Zeichnen leiht sie sich Gelenke, Clip-Uniforms und Handlage ihres
  Körpers (`body` in `MODELS`, `uSocket`). Sie bewegt sich darum genau mit
  dessen Unterarm. Das Modell ist nur einmal geladen, auch wenn zwei Körper
  es nutzen.
- **Wann es zu sehen ist,** entscheiden die `props` des Clips
  (`clips/humanoid.json`). `figureProps()` in `entityRenderer.ts` gibt für
  eine Figur die passenden Anhänge als Instanzen. Welt, Galerie und Symbole
  zeichnen sie mit. Ohne Clip keine - die Figur steht in Ruhelage.
- **Zweihändig:** Das Zugmesser hängt an beiden Unterarmen, der Shader mischt
  nach der Lage zwischen den Händen. Es ist für den Handabstand des Mannes
  gebaut und wird auf den des Trägers gestreckt (`uKnifeScale`). Die Sense
  liegt in der Mäh-Haltung in beiden Händen und gibt es deshalb je Körper.

**Ein neues Werkzeug (z. B. den Bogen):**

1. In Blender bauen: `src/models/props/axe.glb` importieren, ändern und als
   `src/models/props/<name>.glb` exportieren. Der Ursprung ist die Mitte der
   rechten Hand, die Objekte heißen `Arm.R.Lower.Tool…`.
2. In `entityRenderer.ts`: je Körper eine Form in `SHAPE`, ein Eintrag in
   `MODELS` mit `body`, ein Bit in `PROP_BITS` (`clips.ts`) und ein Eintrag
   in `FIGURE_PROPS`. Die Teile heißen wie beim Beil (`Arm.R.Lower.Tool…`),
   damit der Shader sie am rechten Unterarm führt.
3. Den Namen in `props` der Clips eintragen, die es brauchen
   (`clips/humanoid.json`).

## So wird jetzt gearbeitet

1. Blender: Datei → Import → glTF 2.0, z. B. `src/models/clips/humanoid.glb`.
   Jeder Clip ist eine Animation (Action) mit dem Namen wie im Spiel:
   `stand`, `walk`, `chop`, `pick`, `mow`, `carve`.
2. Bearbeiten, dann Datei → Export → glTF 2.0 (glTF Binary) über dieselbe
   Datei. **Achtung:** Mit den vorgegebenen Einstellungen rechnet Blender
   die Bilder beim Export neu ab. Zur Probe (Import und sofort Export, nichts
   geändert) wichen die Hände danach bis 7 cm ab (`chop`, vorher 0,5 cm),
   die Tiere bis 0,9 cm. Vor dem ersten echten Export die
   Animations-Einstellungen so wählen, dass `npm run check:anim` wie vorher
   bleibt - das ist noch nicht herausgefunden (docs/OFFEN.md).
3. Die Angaben je Clip stehen in `clips/<name>.json` unter `clips` und werden
   von Hand gepflegt; `frames` und `duration` müssen zur Animation passen:
   - `props`: die Werkzeuge in der Hand (`axe`, `scythe`, `knife`, `hoe`)
   - `pose`: welche Pose des Spiels der Clip ersetzt (0 stehen, 1 gehen,
     2 hacken, 3 pflücken, 4 mähen, 5 schnitzen, 6 sitzen, 7 Hacke (pflügen),
     8 werfen (Jagd); Tiere: 0 äsen, 1 gehen,
     5 fliehen, 6 erlegt)
   - `phase_period`, `phase_shift`: welcher Bereich der Spiel-Phase eine
     Schleife ist. Die Clip-Zeit ist (Phase − shift) × Dauer / period.
   - `kneel`: `true`, wenn die Figur kniet (sie sinkt, bis das Knie den Boden berührt)
   - `strike`: Clip-Zeiten in Sekunden, zu denen der Hieb bzw. Griff zu
     hören ist (z. B. `chop`: `[0.775]`). Wer einen Clip umbaut, verschiebt
     die Marken mit.
   - Tiere: `species` (für welche Arten, leer heißt alle) und `lying`
     (liegt auf der Seite); `graze` oben in der Datei ist, wie weit das Reh
     den Kopf senkt - das Spiel bringt den Knochen `neck` je Art auf ihre
     Halslänge.
4. **Neuer Clip, ohne `humanoid.glb` anzufassen:** eigene Datei daneben
   (so `clips/humanoid_sit.glb` + `.json` mit `sit`, `clips/humanoid_tools`
   mit `hoe` und `throw`), in
   `src/gl/entityRenderer.ts` an `CLIPS` gehängt. In Blender
   `humanoid.glb` importieren, die NLA-Spuren und die übrigen Actions aus der
   Szene löschen (sonst legt der Export sie zu einer Animation zusammen),
   neue Action anlegen, nur das Skelett exportieren
   (`export_animation_mode="ACTIONS"`, `use_selection`,
   `export_optimize_animation_size=False` - sonst schrumpfen gleichbleibende
   Knochen auf zwei Bilder). Die Knochen heißen wie im Skelett, die Ruhelage
   bleibt gleich; höchstens 10 Clips je Figur (`MAX_CLIPS`). Ein Clip
   speichert je Knochen die Drehung gegenüber der Ruhelage im Weltsinn: per
   Skript gesetzte Posen (`pose_bone.matrix`) erst ohne aktive Action
   rechnen und dann als Keyframes schreiben - mit Action überschreibt jedes
   `view_layer.update()` die Eltern-Knochen mit den schon gesetzten Bildern.
5. `npm run check:anim` zeigt, wie weit ein Clip von der alten Formel
   abweicht; `npm test`, dass kein Knochen, Clip oder keine Pose verloren
   ging. In der Galerie zeigen „Clips aus Blender" jeden Clip.

Die IK-Ziele der Hände (`ik.hand.*`, `hand.*`) lebten in der früheren
`humanoid.blend`; in den gebackenen Clips stecken nur noch ihre Ergebnisse.
Die `.blend`-Dateien und die Python-Skripte, die sie angelegt und exportiert
haben, stehen in der Git-Geschichte.

## Heute

Alles, was sich bewegt, rechnet der Vertex-Shader in
`src/gl/entityRenderer.ts`:

- **Teile statt Skelett.** Jeder Eckpunkt trägt eine Teilnummer (`P_*`), die
  aus dem Objektnamen im OBJ stammt, zum Beispiel `Arm.L.Lower`. Das ist
  starres Skinning mit einem Knochen je Eckpunkt.
- **Formeln statt Keyframes.** Die Gelenkwinkel folgen je Pose aus der Phase
  (`pose == 1` ... `pose == 5`). Zwei Posen haben ihre Werte in JSON
  ausgelagert: `poses/mow.json` und `poses/carve.json`.
- **Vier Zahlen je Instanz.** `motion = [Blickrichtung, Phase, Pose, Ladung]`.
  Gebäude, Bäume und Felder deuten dieselben vier Zahlen je nach Art anders.

Das ist billig und genau mit dem Spiel verzahnt. Der Ton kommt im Takt, die
Schrittweite folgt dem Tempo. Es hat aber zwei Nachteile: Jede neue Bewegung
ist Code, und ohne IK treffen Hände ihr Ziel nicht. Das hat sich beim
Zugmesser gezeigt. Außerdem gibt es keinen Weg aus Blender zurück ins Spiel.

## Leitlinien

1. **Blender ist die Quelle** für alles, was eine Bewegung im Blender-Sinn
   ist: Skelett, Gewichte, Clips. Das Spiel rechnet sie nicht nach.
2. **Der Spielzustand bleibt im Spiel.** Was von Vorrat, Fortschritt oder
   Ereignissen abhängt, wird nicht als Clip gebacken. In Blender werden dafür
   nur die Teile benannt.
3. **Gleichstand zuerst.** Jede Migration beginnt mit einem Export der
   heutigen Formeln als Keyframes (wie `tools/export/bognerei.mjs`). Erst
   wenn das Spiel damit gleich aussieht, wird in Blender verbessert.
4. **Alter und neuer Weg laufen nebeneinander**, bis eine Gruppe komplett
   umgezogen ist. Das Umschalten geschieht je Modell.
5. **Jeder Schritt ist für sich fertig.** Er besteht `tsc` und
   `npm run build`, dazu `npm run smoke` und einen Bildvergleich in der
   Galerie, und bekommt einen eigenen Commit.

## Wie ein Modell heute aufgebaut ist

Ein Modell besteht heute aus drei Dingen, und nur eines davon zieht um:

| Was | Heute | Künftig |
|---|---|---|
| **Form** | OBJ aus einem Skript (`tools/models/*.mjs`), Objektnamen als Teile | Form bleibt OBJ bzw. `.glb`, dazu Skelett und Gewichte |
| **Aussehen** | Materialname je Fläche (`Wood`, `Wool`, `Marble` ...). Der Shader macht daraus Farbe und Muster (`MATERIAL_ROLE`, `treeTexture`, `figureTexture`), `Paint` und `Tunic` werden zur Spielerfarbe | **bleibt so**: Shader-Materialien nach Namen |
| **Bewegung** | Formeln im Shader je Pose | Clips aus Blender |

Die Shader-Materialien sind schon eine gemeinsame Bibliothek. Ein Fass sieht
in jedem Gebäude gleich aus, weil seine Flächen `Wood` und `Iron` heißen, und
eine neue Figur hat sofort Leinen, Leder und Haut. In Blender heißt das: die
Materialnamen behalten. Farbe und Muster in Blender sind nur Vorschau, das
Spiel liest den Namen.

## Wiederverwenden: einmal machen, überall nutzen

Heute steckt jedes Werkzeug fest im Modell jeder Figur, jede Pose ist eigener
Code, und die sechs Tiere haben zwar gleiche Teilnamen, aber keine gemeinsamen
Bewegungen. Künftig gilt:

1. **Ein Skelett, viele Körper.** Mann, Frau und später Bogenschütze oder
   Soldat haben dieselben Knochennamen und dieselbe Hierarchie. Ihre
   Proportionen dürfen sich unterscheiden. Clips speichern nur Drehungen,
   dazu die Verschiebung der Wurzel in Körperhöhen. So passt ein Clip ohne
   Nacharbeit auf jeden Körper mit diesem Skelett. Gebacken wird je Körper
   und Clip (die Drehpunkte unterscheiden sich), die Clip-Daten gibt es aber
   nur einmal.
2. **Eine Clip-Bibliothek je Skelett.** Die Clips liegen in eigenen Dateien
   (`clips/humanoid.glb`, `clips/quadruped.glb`), getrennt von den Körpern
   (`villager_male.glb` ...). Ein neuer Körper bekommt alle Clips sofort. Ein
   verbesserter Clip wirkt auf alle Körper.
3. **Werkzeuge und Waffen als Anhänge.** Die Hände bekommen Sockel-Knochen
   (`hand.R`, `hand.L`). Beil, Spitzhacke, Hacke, Sense, Zugmesser, Speer und
   Bogen sind eigene kleine Modelle und werden je Tätigkeit angehängt. Welches
   Werkzeug ein Clip braucht, steht in `props` des Clips
   (`clips/humanoid.json`). Beispiele:
   - `chop` mit Beil (Holz), Spitzhacke (Stein, Gold) oder Hacke (Pflügen):
     ein Clip, drei Werkzeuge.
   - Der fertige Bogen auf der Werkbank, im Gestell der Waffenkammer, im
     Symbol und später in der Hand eines Bogenschützen ist ein und dasselbe
     Modell (`bow`).
   - Zweihändige Werkzeuge (Sense, Zugmesser) hängen an `hand.R`. Die linke
     Hand greift sie in Blender per IK, das Spiel muss nichts überblenden.
4. **Teil-Clips in Schichten.** Ein Clip darf nur einen Teil des Skeletts
   bewegen, per Knochenmaske Unterkörper oder Oberkörper. Das Spiel legt zwei
   übereinander: `walk` (Beine) + `carry` (Arme halten die Last) oder später
   `walk` + `aim` für Bogenschützen. Kombinationen wie „gehen und tragen"
   müssen dann nicht als eigener Clip entstehen.
5. **Eine Vierbeiner-Vorlage für alle Tiere.** Reh, Hase, Kuh, Schaf, Ziege
   und Wildschwein teilen Skelett und Clips (`graze`, `walk`, `flee`, `dead`).
   Eine Art bekommt nur dort einen eigenen Clip, wo sie sich wirklich anders
   bewegt, zum Beispiel `hop` für den Hasen oder `trot` für die Kuh auf der
   Flucht.
6. **Materialien nach Namen.** Siehe oben. Sie werden nicht je Modell
   gebaut, sondern einmal im Shader, und über den Namen genutzt.
7. **Kleinteile für alle Gebäude.** Fass, Kiste, Laterne, Zielscheibe,
   Schild und Holzstapel entstehen heute als Hilfsfunktionen in
   `tools/models/lib.mjs` und werden in jedes Gebäude hineinkopiert. In
   Blender werden sie eine Asset-Bibliothek (verknüpfte Collections). Im
   Spiel können sie später als eigene Instanzen gezeichnet werden, dann
   liegt jedes Kleinteil nur einmal im Speicher.

Was davon in welche Phase gehört, steht bei den Phasen.

## Bestand: jede Animation, heute und künftig

Ziel **Clip** heißt: Skelett und Keyframes aus Blender. **Zustand** heißt:
bleibt im Shader und wird vom Spiel gesteuert. **Ereignis** heißt: bleibt
prozedural, weil Richtung, Zufall oder Physik erst zur Laufzeit feststehen.

### Dorfbewohner und Dorfbewohnerin (`villager_male/female.glb`)

| Bewegung | Heute | Ziel | Phase |
|---|---|---|---|
| Stehen: Atmen, Arme pendeln, Umschauen, Gewicht verlagern | Pose 0, Formel mit Weltzeit | Clip `stand` (Schleife) | 2 |
| Gehen | Pose 1, Phase aus der Schrittlänge | Clip `walk`, Tempo aus der Strecke | 2 |
| Tragen (Last wächst mit der Ladung) | Teil `Load`, skaliert mit `motion[3]` | Knochen `load`, Skalierung aus dem Instanzwert | 2 |
| Hacken, Pflügen, Speerwurf | Pose 2, Beil (`P_TOOL`) | Clip `chop` (Beil sichtbar) | 2 |
| Pflücken, Säen, Jäten, Zerlegen (kniend, der Rock staucht sich) | Pose 3, eigene Rock-Formel | Clip `pick`, Rock über Gewichte an den Oberschenkeln | 2 |
| Mähen | Pose 4, `poses/mow.json`, Sense in Ruhelage zurückgerechnet | Clip `mow`, Sense an beiden Händen per IK | 2 |
| Schnitzen | Pose 5, `poses/carve.json`, Zugmesser an beiden Unterarmen überblendet | Clip `carve`, Hände per IK auf dem Stab | 2 (Pilot in 1) |
| Werkzeug je Tätigkeit (Beil, Sense, Messer) | Teile im Shader auf einen Punkt gedrückt | Werkzeugknochen je Clip auf 0 skaliert | 2 |
| Blickrichtung, Versatz je Figur | `motion[0]`, Phase + id | bleibt, Zeitversatz je Figur | - |

### Tiere (Reh, Hase, Kuh, Schaf, Ziege, Wildschwein)

| Bewegung | Heute | Ziel | Phase |
|---|---|---|---|
| Äsen: Kopf unten, ab und zu hoch | Pose 0, Hals-Gelenk `uNeck` | Clip `graze` je Art | 3 |
| Gehen: Kreuzgang, Hase hoppelt | Pose 1, Beine `Leg.FL/FR/BL/BR` | Clip `walk` je Art, Tempo aus der Strecke | 3 |
| Fliehen: Sprünge, Kuh trabt | Pose 5 | Clip `flee` je Art | 3 |
| Erlegt, auf der Seite | Pose 6, Kippen um `uSide` | Clip `dead` (ein Bild) | 3 |

### Gebäude und Dinge

| Bewegung | Heute | Ziel | Phase |
|---|---|---|---|
| Mühlenflügel: drehen, Böen, eigener Takt, steht bei Einsturz still | `P_SAILS`, `millMotion()` | Clip `sails` (Knochen an der Nabe, Böen gebacken), Tempo und Versatz je Mühle | 4 |
| Fahne am Sammelpunkt weht | `P_CLOTH`, Sinuswelle | Clip `wave` (Knochenkette im Tuch) | 4 |
| Hinweispfeil wippt und dreht | Shader, `uTime` | bleibt, zu einfach für einen Clip | - |
| Waffenkammer: Dach weg, Wände gekappt | `P_CUT_ROOF` / `P_CUT_WALL` | **Zustand**: Namensregel `Cut.Roof`, `Cut.Wall` | 5 |
| Waffenkammer: Bögen je Vorrat | `P_STOCK` + `Stock.<n>` | **Zustand**: Namensregel `Stock.<n>` | 5 |
| Bognerei: Werkstück in Stufen | `P_CRAFT` + `Craft.<n>` | **Zustand**: Namensregel `Craft.<n>` | 5 |
| Einsturz: wackeln, zusammensacken, Staub, Schutt | Shader (`motion[3]`) und `ruinInstances()` | **Ereignis**, bleibt | 6 |

### Natur

| Bewegung | Heute | Ziel | Phase |
|---|---|---|---|
| Baum fällt (Richtung, Aufprall, Rutschen) | `world.fall()` und Shader „falling" | **Ereignis**, bleibt (Richtung erst zur Laufzeit) | 6 |
| Baum wird von der Spitze her abgesägt, Stumpf bleibt | `P_CROWN` / `P_TRUNK` / `P_STUMP` | **Zustand**: Namensregeln `Trunk`, `Trunk.Stump` | 5 |
| Beeren verschwinden einzeln | `P_BERRY` + `Berry.<n>` | **Zustand**: Namensregel `Berry.<n>` | 5 |
| Stein und Gold schrumpfen | Instanzgröße (`resources.ts`) | **Zustand**, bleibt | - |
| Felder: pflügen, säen, wachsen, reifen, ernten je Furche; Schnur | `P_CROP` / `P_SOIL` / `P_EDGE`, `farmsGen.mjs` | **Zustand**, bleibt (vom Skript erzeugt) | 5 |

Nicht betroffen sind Lebensbalken, Auswahl und Bauvorschau. Das sind
Anzeigen, keine Animationen.

## Phasen

### Phase 0: Regeln festlegen (klein) - erledigt

- **Format:** glTF 2.0 (`.glb`), Meter, Y oben, Blick nach +Z. So exportiert
  Blender von selbst.
- **Bildrate der Clips:** 30 fps. Schleifen beginnen und enden in derselben
  Haltung.
- **Knochennamen** für Figuren nach dem Schema aus `tools/export/bognerei.mjs`:
  `root`, `lowerBody`, `thigh.L`, `shin.L`, `upperBody`, `head`,
  `shoulder.L`, `upperArm.L`, `forearm.L` usw. Dazu kommen `tool.axe`,
  `tool.scythe`, `tool.knife` und `load`.
- **Clip-Namen:** `stand`, `walk`, `chop`, `pick`, `mow`, `carve`. Bei Tieren
  `graze`, `walk`, `flee`, `dead`.
- **Takt-Marken:** Wann ein Hieb trifft (für den Ton), steht als
  Custom Property `strike` (Zeiten in Sekunden) an der Action. Heute rechnet
  `VillagerWork.swing()` das aus der Formel.
- **Quellen:** `.blend`-Dateien liegen in `assets/blender/clips/` (Clips), über Git LFS wie
  die MP3s. Dafür kommt ein Eintrag in `.gitattributes`.
- **Export:** Ein Skript ruft Blender ohne Oberfläche auf
  (`blender -b datei.blend --python tools/blender/export.py`) und schreibt
  `src/models/<name>.glb`. Aufruf: `npm run gen:anim`.

### Phase 1: Abspielen im Spiel, Pilot „Schnitzen" (groß) - erledigt

Umgesetzt wie unten beschrieben, mit diesen Abweichungen:

- **Lader:** Er heißt `src/gl/clips.ts` und liest die Clip-Bibliothek. Er
  backt auch gleich die Knochen-Textur, eine eigene `animationAtlas.ts` gibt
  es nicht. Genommen wird je Knochen und Bild nur die Drehung gegenüber der
  Ruhelage im Weltsinn, dazu die Verschiebung der Wurzel in Körperhöhen.
  Wie Blender Knochen intern ausrichtet, spielt deshalb keine Rolle, und ein
  Clip passt auf jeden Körper mit denselben Knochennamen: Mann 1,76 m, Frau
  1,72 m.
- **Körper:** Die Körper sind `.glb` aus Blender
  (`src/models/villagers/*.glb`). Gewichte liest das Spiel daraus nicht. Der Shader leitet je Eckpunkt
  den Knochen aus der Teilnummer ab (`boneOf()`). Das Zugmesser verteilt er
  wie bisher auf beide Unterarme. Weiche Gewichte aus Blender folgen in
  Phase 2.
- **Was glTF nicht trägt:** Clip-Länge und Werkzeuge stehen im Manifest
  `clips/<name>.json`, das `tools/blender/export_clips.py` aus den Custom
  Properties schreibt.
- **Zeit:** Die Pose-Zeit wird zur Clip-Zeit. Beim Schnitzen gilt
  (Phase − 7,854) / 6. So beginnt jeder Zug wie bei der Formel, und der Ton aus
  `VillagerWork.swing()` bleibt im Takt. Takt-Marken aus Blender (`strike`)
  kommen in Phase 2.
- **Rückfall:** Die Formel für das Schnitzen bleibt vorerst im Shader.
  Fehlt die Bibliothek oder lässt sie sich nicht lesen, läuft die Figur
  darüber.

1. **`src/gl/gltf.ts`:** liest `.glb`, also Meshes, Materialfarben, Skin
   (Knochen, `inverseBindMatrices`, `JOINTS_0` / `WEIGHTS_0`) und
   Animationen. Er braucht keine Bibliothek, das Format ist schon in
   `tools/export/bognerei.mjs` geschrieben.
2. **`src/gl/animationAtlas.ts`:** backt beim Laden jeden Clip Bild für Bild
   zu Knochenmatrizen in eine Textur (RGBA32F, je Knochen drei Texel für
   eine 3×4-Matrix). Eine Figur mit 16 Knochen, 6 Clips und je rund 60
   Bildern braucht etwa 17 000 Texel, das ist winzig.
3. **Shader:** Er bekommt einen zweiten Weg für Modelle mit Skin. Je
   Eckpunkt werden bis zu 4 Knochen aus der Textur geholt (`texelFetch`) und
   gewichtet gemischt. Die Instanz bleibt bei vier Zahlen:
   `motion = [Blickrichtung, Clip-Zeit, Clip-Nummer, Ladung]`.
4. **Galerie:** Sie zeigt für jedes `.glb` automatisch alle Clips als Knöpfe.
5. **Clip-Bibliothek getrennt vom Körper:** Der Lader verbindet Clips mit
   jedem Körper, dessen Knochennamen passen. Gebacken wird je Paar aus Körper
   und Clip.
6. **Pilot:** `bognerei.glb` aus dem bestehenden Export wird geladen, und
   Bogner und Bognerin schnitzen darüber. Schon hier teilen sich Mann und Frau
   einen Clip. Alle anderen Posen laufen noch über
   den alten Weg.

Fertig ist Phase 1, wenn das Schnitzen im Spiel aus Blender kommt, eine
Änderung in Blender nach `npm run gen:anim` im Spiel zu sehen ist und die
Bildrate mit 500 Dorfbewohnern gleich bleibt.

### Phase 2: Dorfbewohner komplett (groß)

1. `tools/export/bognerei.mjs` wird zu `tools/export/figures.mjs`
   verallgemeinert. Es schreibt Mann und Frau mit allen sechs Posen als
   Clips. Das ist der Gleichstand, wie heute aus den Formeln gerechnet.
2. **In Blender:**
   - IK für die Hände bei `mow` und `carve`, damit Sense und Stab gegriffen
     werden - **erledigt** (`humanoid_ik.py`, siehe „Hände mit IK").
   - Weiche Gewichte an Ellbogen, Knien und Schultern.
   - Der Rock folgt beim Knien über Gewichte, statt über eine eigene Formel.
3. Das Spiel lädt `villager_male.glb` und `villager_female.glb`. `POSE.*`
   wird zu Clip-Namen, die Phase zur Clip-Zeit. Beim Gehen bestimmt die
   Strecke die Zeit.
4. **Werkzeuge als Anhänge - erledigt** für Beil, Sense und Zugmesser (siehe
   „Werkzeuge anhängen"). Statt eigener Sockel-Knochen hängen sie an der
   Hand des Unterarms (`uSocket`). Offen: Spitzhacke, Hacke und Speer als
   eigene Modelle, damit `chop` für Holz, Stein, Gold und Pflügen je mit
   anderem Werkzeug genutzt wird.
5. **Schichten:** `walk` nur für den Unterkörper, `carry` nur für den
   Oberkörper, übereinander abgespielt.
6. **Ton:** `swing()` liest `strike` aus dem Clip statt aus der Formel -
   **erledigt**. Ohne Clip für die Pose gilt weiter die Formel.
7. **Bildvergleich:** alle Posen in der Galerie, alt und neu nebeneinander.
8. **Weg damit - erledigt:** die Posen 0-5 im Shader und die Uniforms, die
   nur sie brauchten (`uShoulder`, `uElbow`, `uStride`). `uHip`, `uKnee`,
   `uArm` und `uLoadAnchor` bleiben (Rock, Knien, Zugmesser, Last).
   `poses/mow.json` und `poses/carve.json` bleiben für den Export und
   `check:anim`. Die Werkzeuge sind Anhänge, `villagers.mjs` gibt es nicht
   mehr (docs/BLENDER.md).

### Phase 3: Tiere (mittel) - erledigt

Umgesetzt mit diesen Abweichungen vom ursprünglichen Plan:

1. **Skelett `QUADRUPED` in `src/gl/clips.ts`:** `root`, `leg.FL/FR/BL/BR`,
   `neck`, `head`. Die Beine haben kein eigenes Unterteil und keinen
   `spine`, weil die Formel sie nur um das obere Gelenk schwingt. Beides kann
   in Blender dazukommen, wenn die Modelle es brauchen.
2. **Clips:** `graze` und `dead` gelten für alle Arten. `walk` (Kreuzgang) gilt
   für alle außer dem Hasen, `flee` (Springen) für Reh, Schaf, Ziege und
   Wildschwein. Eigene Clips: `hop` und `hop_flee` für den Hasen, `trot` für
   die Kuh. `bound` heißt `flee`. Exportiert wird mit `tools/export/animals.mjs`
   (Formeln in `tools/export/animal-poses.mjs`), angelegt mit
   `tools/blender/bootstrap_rig.py`.
3. **Abspielrate:** Die Phase kommt wie bisher aus `render.ts` (Strecke je
   Schritt aus `stride`). Die Clips decken je 2π davon ab.
4. **Je Art gebacken:** Das Rig kann jetzt je Körper Knochen verkürzen oder
   verlängern (`Rig.scale`) und die Höhe der Wurzel festlegen (`Rig.rootZ`).
   Bei den Dorfbewohnern sind das Schrittweite und Kniehöhe, bei den Tieren
   das Senken des Kopfs (`neck` auf uGraze) und die Höhe im Liegen (uSide).
5. **Weg:** Der Tier-Zweig im Shader und `uLegs`, `uNeck`, `uGraze`, `uSide`
   sind gelöscht. Die Maße bleiben im Modell, sie backen die Clips je Art.

### Phase 4: Mühle und Fahne (klein) - erledigt

Mühlenflügel und die Fahne am Sammelpunkt kommen als Clips aus Blender
(`assets/blender/clips/mill.blend`, `flag.blend`; eingerichtet mit
`npm run export:props` und `tools/blender/bootstrap_rig.py`).

- **Mühle:** Skelett `mill` (`root`, `sails` an der Nabe), Clip `sails`:
  125,7 s bei 10 Bildern je Sekunde, das sind 7 Böen-Takte und genau
  16 Umdrehungen. Die Zeit ist „Mühlenzeit" (Spielzeit × Drehzahl der
  Mühle), versetzt je Mühle (`millClipOffset`). Eine eingestürzte Mühle
  bleibt mit der Mühlenzeit beim Abriss stehen (`frozenMillMotion`,
  gemessen an der Animations-Uhr wie `uTime`). Die Böen treffen genau wie
  bei der Formel, Abweichung der Drehzahl 0,005 rad/s. Die Stellung
  der Flügel weicht bis zu 6,4° ab (an der Flügelspitze bis 47 cm bei
  4,65 m Breite). Das kommt daher, dass eine Schleife mit gemeinsamen Böen
  nicht jede Startstellung erreicht. Man sieht es nicht: jede Mühle dreht in
  ihrem eigenen Takt, und nach einer Vierteldrehung sehen die Flügel gleich aus.
- **Fahne:** Skelett `flag` (`root`, `cloth.0` bis `cloth.6` gleichmäßig
  längs des Tuchs, wo seine Eckpunkte liegen). Die Knochen verschieben sich
  seitwärts, der Shader mischt je Eckpunkt die beiden Nachbarn nach der Lage.
  Clip `wave`: 39 Bilder, eine Welle. Abweichung an den Eckpunkten 0,03 cm.
- **Neu im Rückweg:** Knochen dürfen sich auch verschieben (`Clip.moves`),
  nicht nur drehen. Clips ohne Pose laufen nach der Spielzeit:
  (Zeit − `phase_shift`) × Dauer / `phase_period`.
- **Formeln weg:** `P_SAILS` und `P_CLOTH` gibt es nur noch als Clip, `uHub`
  und `GUST_AMOUNT` sind gelöscht. `SAIL_SPEED` und `GUST_RATE` bleiben in
  `entityRenderer.ts`: `millClipOffset` setzt damit jede Mühle an ihre Stelle
  der Schleife. Die Fahne auf dem Dorfzentrum spielt denselben Clip.
- **Galerie:** Beim Abriss bleiben die Flügel jetzt auch dort stehen.

### Phase 5: Zustands-Teile Blender-fest machen (klein bis mittel)

Diese Teile bleiben im Shader, aber jemand, der ein Modell in Blender
bearbeitet, soll sie nicht aus Versehen kaputt machen:

1. Alle Namensregeln werden an einer Stelle beschrieben, in einer Tabelle in
   diesem Dokument: `Berry.<n>`, `Trunk`, `Trunk.Stump`, `Stock.<n>`,
   `Craft.<n>`, `Cut.Roof`, `Cut.Wall`, `Entry`, `Work.Stand`, `Work.Aim`,
   `Crop.*`, `Soil.*`, `Edge.*`.
2. Sobald Modelle aus Blender kommen, liest der Lader diese Angaben aus
   Custom Properties (glTF `extras`), nicht mehr aus Namensanfängen.
   Beispiel: `role: "stock", index: 7`.
3. Ein Prüfskript meldet beim Export fehlende oder doppelte Nummern.

### Phase 6: Ereignisse (bleiben)

Umfallen, Einsturz, Staub und Schutt bleiben prozedural. Die Fallrichtung
steht erst fest, wenn der Holzfäller zuschlägt. Der Einsturz lebt vom Zufall
je Eckpunkt. Später wäre je Gebäude ein gestalteter Einsturz-Clip möglich,
wenn gewünscht.

### Phase 7: Aufräumen und Absichern (klein)

- `npm run smoke` prüft, dass jedes `.glb` lädt und die erwarteten Clips hat.
- Ein Bildvergleich in der Galerie für jede Pose (Playwright, wie in
  `tools/ui/smoke.mjs`).
- Eine Messung der Bildrate mit 500 Dorfbewohnern und 100 Tieren.
- Die Kommentare in `entityRenderer.ts`, `villagers.mjs` und `animals.mjs`
  werden auf den neuen Weg umgeschrieben.

## Risiken und offene Fragen

- **Übergänge:** Heute springt die Pose sofort um. Ein Überblenden
  (0,2 s von Gehen zu Hacken) braucht einen zweiten Clip und ein Gewicht je
  Instanz, also mehr Instanzdaten. Das kommt erst nach Phase 2.
- **Leistung:** 4 Knochen mal 3 Texel sind 12 Texturzugriffe je Eckpunkt.
  Bei Tausenden Figuren wird das in Phase 1 gemessen. Für weit herausgezoomte
  Figuren wäre ein 1-Knochen-Weg denkbar.
- **Eckpunkte:** Weiche Haut braucht geteilte Eckpunkte. Heute ist jede
  Fläche flach, das Modell wird damit etwas größer.
- **Modelle selbst:** Sind nach Blender umgezogen (docs/BLENDER.md).
- **Texturen:** Leinen, Leder, Haar und Holzmaserung rechnet der Shader nach
  Materialnamen. Das bleibt so. Die Materialnamen müssen deshalb in Blender
  erhalten bleiben.

## Reihenfolge und Umfang

| Phase | Inhalt | Umfang | Voraussetzung |
|---|---|---|---|
| 0 | Regeln, Ordner, Export-Aufruf | klein | - |
| 1 | Lader, Clip-Textur, Skinning im Shader, Clip-Bibliothek, Pilot Schnitzen | groß | 0 |
| 2 | Dorfbewohner (6 Clips, IK, Werkzeuge als Anhänge, Formeln gelöscht) - erledigt bis auf Schichten | groß | 1 |
| 3 | Tiere (eine Vorlage, gemeinsame Clips, 3 eigene) - erledigt | mittel | 1 |
| 4 | Mühle, Fahne - erledigt | klein | 1 |
| 5 | Namensregeln absichern, später `extras` | klein bis mittel | - |
| 6 | Ereignisse (bleiben) | - | - |
| 7 | Tests, Messung, Aufräumen | klein | 2-4 |

Die Phasen 2, 3 und 4 sind voneinander unabhängig und können in beliebiger
Reihenfolge laufen, sobald Phase 1 steht.
