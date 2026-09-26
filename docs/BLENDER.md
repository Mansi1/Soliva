# Modelle und Blender

Was noch offen ist: docs/OFFEN.md.

Jedes Objekt des Spiels ist eine glTF-Datei in `src/models/`: Dorfbewohner,
Gebäude, Bäume, Sträucher, Stein und Gold, Tiere, Werkzeuge und die Pflanzen
der Felder. Blender öffnet und speichert sie ohne Zusatz (Datei → Import /
Export → glTF 2.0) - es gibt keinen Export-Schritt und beim Bauen kein
Blender. Die Bewegungen stecken in eigenen Clip-Bibliotheken, ebenfalls
`.glb` (docs/ANIMATION.md).

## Wo was liegt

```
src/models/                           Modelle - je Objekt eine .glb, eingecheckt
  villager_male, villager_female
  town_center, house(_2.._4), lumber_camp(_2.._4), mining_camp,
  mill(_2.._4), bowyer, armory
  tree_spruce, tree_pine, tree_oak(_young, _old), tree_birch(_2, _3),
  tree_maple, tree_poplar
  berry_bush_1..4, stone_1..3, gold_1..3
  deer, hare, cow, sheep, goat, boar
  prop_axe, prop_knife, prop_scythe_male/_female, bow, rally_flag, marker_arrow
  field_stake, field_cord, field_wheat_leaf,
  field_wheat_stalk(_light, _dark), field_corn_1, field_corn_2,
  field_tomato, field_potato, field_hop
  humanoid, quadruped, mill, flag _clips.glb + .json
                                      Bewegungen - je Skelett eine Bibliothek
```

Das Spiel liest ein Modell mit `import house from '../models/house.glb?model'`.
Beim Bauen wandelt `vite.config.ts` die Datei in OBJ- und MTL-Text
(`tools/models/glb.mjs`) - damit arbeiten Spiel und Werkzeuge weiter; in Node
liefert `readModel('house')` dasselbe.

## Ein Modell bearbeiten

1. Blender: Datei → Import → glTF 2.0, z. B. `src/models/house.glb`
   (Einstellungen wie vorgegeben).
2. Bearbeiten: Objekte verschieben, drehen, skalieren, im Edit Mode formen,
   neue Objekte anlegen, Materialfarben ändern. Lage, Drehung und Größe
   eines Objekts rechnet das Spiel ein.
3. Datei → Export → glTF 2.0, Format **glTF Binary (.glb)**, über dieselbe
   Datei. Die übrigen Einstellungen wie vorgegeben (+Y oben bleibt an).
4. `npm test` prüft die Namen mit Bedeutung; ansehen im Spiel oder in der
   Galerie (`npm run dev`, `/galerie`).

Blender exportiert alle Objekte der Szene, auch ausgeblendete. Hilfsobjekte,
die nicht ins Spiel sollen, vor dem Export löschen - oder unter Include
„Visible Objects“ anhaken und sie ausblenden.

Achsen und Maße: In Blender ist Z oben, die Vorderseite zeigt nach -Y
(Vorderansicht, Taste 1); der glTF-Export dreht das richtig. Einheit Meter,
1 Tile = 5 m, ein Dorfbewohner ist 1,7 m groß, Türen 2,1 m. Gebäude werden im
Spiel auf ihre Breite gebracht (`size` der Gebäudeart), Figuren auf ihre
Höhe - wird ein Gebäude breiter, wirkt es im Spiel also kleiner.

## Was das Spiel aus der Datei liest

- **Der Name jedes Objekts.** Er sagt dem Spiel, was das Teil ist, und darf
  sich wiederholen (viele `Window.Bar`). Blender duldet keine doppelten Namen
  - darum heißt ab dem zweiten gleichen Namen das Objekt `Window.Bar#2`,
  `#3` ...; das Spiel liest den Namen bis zum `#`. Eine Kopie (Shift+D) von
  `Window.Bar` heißt in Blender `Window.Bar.001` und im Spiel wieder
  `Window.Bar`. Umbenennen wirkt; ein neues Objekt heißt im Spiel wie in
  Blender. Achtung bei Namen, die schon auf eine Zahl enden (`Berry.93`,
  `Stock.42`): Blender gibt der Kopie die nächste freie Nummer (`Berry.94`)
  - bei `Stock` und `Craft` zählt die Nummer, dort von Hand benennen.
- **Der Name des Materials.** Er bestimmt das Aussehen: Farbe aus dem
  Material, Muster aus dem Shader (Holz, Stroh, Leinen, Marmor ...). `Paint`
  und `Tunic` werden zur Spielerfarbe. Materialnamen beim Bearbeiten
  behalten; ein neues Material mit neuem Namen bekommt nur seine Farbe.
- **Die Farbe des Materials:** Base Color des Principled BSDF, genau der
  Zahlenwert (in glTF `baseColorFactor`). Eine Bildtextur ersetzt die Farbe
  (Blattkarten, Blüten); alles andere am Material liest das Spiel nicht.
- **Aufgemalte Details:** Heißt das Bild `Detail…` (auch `detail.png`), legt
  das Spiel es über Farbe und Muster, nach der Deckkraft des Bilds. Das
  Material behält seine Farbe, die Hose bleibt in der Spielerfarbe. Ein Bild
  je Modell, alle bemalten Materialien teilen es (Image Texture → Mix
  *Multiply* mit der Farbe → Base Color). Durchsichtig und weiß heißt:
  nichts gemalt. So trägt `villager_male` Augen, Bart, Sixpack, Rücken,
  Armbänder, Nähte, Gürtel, Schnürung, Kappe und Sohle. Export mit
  Texturkoordinaten, ohne Normalen.
- **Knochen (Armature):** Eine Figur kann eine Hülle mit Knochen sein statt
  starrer Teile, so ist es `villager_male`. Das Objekt heißt `Body` und ist
  an das Skelett `Rig` gebunden. Die Knochen heißen wie im Clip-Skelett:
  `root`, `lowerBody`, `upperBody`, `head`, `thigh.L`, `shin.L`,
  `shoulder.L`, `upperArm.L`, `forearm.L`, dazu `hand.L` (zählt zum
  Unterarm), ebenso `.R`. Ihre Köpfe sind die Gelenke: Hüfte =
  `thigh.L`, Knie = `shin.L`, Schulter = `upperArm.L`, Ellbogen =
  `forearm.L`, Kopf von `hand.R` = Halterung der Werkzeuge. Je Eckpunkt
  zählen die zwei stärksten Gewichte (Weight Paint). Starre Teile wie
  `Head…`, `Load` und die Stiefel `Leg.*.Lower.*` hängen weiter über ihren
  Namen an einem Knochen. Export mit „Skinning“ an und dem Skelett
  ausgewählt.

Namen mit Bedeutung (nicht umbenennen, beim Kopieren mitnehmen):

| Name | Bedeutung |
|---|---|
| `Entry` | Eingang - dorthin gehen Dorfbewohner, wird nicht gezeichnet |
| `Work.Stand`, `Work.Aim` | Platz an der Werkbank und Blickrichtung (Bognerei) |
| `Leg.L`, `Leg.L.Lower`, `Arm.R`, `Arm.R.Lower`, `Head`, `Load` ... | Körperteile der Figuren - an ihnen hängen die Knochen |
| `Leg.FL/FR/BL/BR`, `Head` | Beine und Kopf der Tiere |
| `Arm.R.Lower.Tool…`, `…Scythe…`, `Knife…` | Werkzeuge an der Hand |
| `Sails` | Flügel der Mühle (drehen sich) |
| `Cloth` | Fahnentuch (weht) |
| `Berry.<n>` | einzelne Beeren - verschwinden beim Pflücken |
| `Trunk`, `Trunk.Stump` | Stamm und Stumpf - der Baum wird von oben abgesägt |
| `Stock.<n>` | Bögen in der Waffenkammer, je Vorrat sichtbar |
| `Craft.<n>` | Stufen des Bogens auf der Werkbank |
| `Cut.Roof`, `Cut.Wall` | Dach und Wände der Waffenkammer, beim Hineinsehen weg bzw. niedrig |

**Geprüft von `npm test`:** Es schlägt an, wenn einem Modell ein Name mit
Bedeutung fehlt - z. B. ein Gebäude ohne `Entry`, eine Mühle ohne `Sails`,
Lücken in `Stock.0` bis `Stock.99`, ein Werkzeug im Körper eines
Dorfbewohners -, wenn eine Fläche kein Material hat oder wenn ein Name von
früher verloren geht (`tests/ids.snapshot.json`). Die Regeln stehen in
`tools/models/check-models.mjs`, einzeln: `npm run check:models`.

## Ein neues Modell

1. In Blender bauen - neu oder aus einem importierten Modell als Vorlage -
   und als `src/models/<name>.glb` exportieren (glTF Binary).
2. Im Spiel eintragen: `import bakeryModel from '../models/bakery.glb?model'`,
   Form in `SHAPE` und Eintrag in `MODELS` (`src/gl/entityRenderer.ts`), bei
   einem Gebäude dazu seine Klasse in `src/world/building/`.

## Die Umzüge (einmalig)

Die Modelle entstanden zuerst in Generator-Skripten (`tools/models/villagers.mjs`,
`buildings.mjs`, `trees.mjs` ...), wurden dann `.blend`-Dateien mit einem
Export nach OBJ und sind seit dem 25.09.2026 `.glb`. Dafür hat
`objToGlb` (`tools/models/glb.mjs`) jedes OBJ aus dem letzten Export der
`.blend`-Dateien gewandelt: alle 59 Modelle lesen sich Dreieck für Dreieck,
Name für Name und Farbe für Farbe gleich; 8 davon sind zur Probe einmal
durch Blender (Import und Export mit den Vorgaben) gegangen, ebenfalls ohne
Unterschied. Die Skripte und `.blend`-Dateien stehen in der Git-Geschichte.

## Felder

Ein Feld sind Tausende Pflanzen - als eine Blender-Datei wären das 20 000
Objekte. In `src/models/` liegen deshalb die **Teile** (`field_*.glb`), das
Spiel stellt sie beim Start auf (`tools/models/farmsGen.mjs`): wo jede
Pflanze steht, wie hoch, geneigt und gedreht - mit denselben Zufallszahlen
wie früher, die Felder sehen aus wie vorher.

| Datei | wird im Spiel |
|---|---|
| `field_stake` | Pflock am Rand, so wie er ist |
| `field_cord` | Schnur - 1 m lang entlang x, gestreckt von Pflock zu Pflock |
| `field_wheat_leaf` | Blatt am Boden - 1 m nach oben, gestreckt auf 0,35–0,6 m und schräg gestellt |
| `field_wheat_stalk`, `_light`, `_dark` | Halm mit Ähre (drei Farben: 30 %, 55 %, 15 %) - Halm 1 m, gestreckt auf 0,8–1,05 m und geneigt, die Ähre sitzt darüber |
| `field_corn_1`, `field_corn_2` | Maispflanze mit einem bzw. zwei Kolben, 2,2 m - gedreht; was über 2 m liegt (Stängelspitze, Rispe), wächst mit der Höhe der Pflanze (2,0–2,45 m) |
| `field_tomato` | Tomatenstaude am Holzpfahl mit drei Rispen, 1,45 m - gedreht, vier je Pflanzplatz |
| `field_potato` | Kartoffelstaude mit weißen Blüten, 0,5 m - gedreht, sechs je Pflanzplatz |
| `field_hop` | Hopfenrebe, die sich an einem Draht mit Pfahl hochwindet, 3,2 m, mit Dolden - gedreht, zwei je Pflanzplatz |

Halm, Blatt und Schnur werden entlang ihrer Achse gestreckt, quer dazu
behalten sie ihre Dicke. Wer eine Maispflanze in Blender ändert: Blätter und
Kolben unter 2 m bleiben auf ihrer Höhe.

Verglichen mit den früheren Feldern: Blätter, Halme, Pflöcke und Schnur
liegen bis auf 0,2 cm gleich, die Ähren im Mittel 1,5 cm anders (sie setzen
jetzt den Halm fort), beim Mais Blätter 1 cm, Kolben 2,6 cm (ihre Höhe ist
jetzt im Modell fest statt zufällig).
