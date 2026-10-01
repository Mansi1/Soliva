<p align="center">
  <img src="public/logo.svg" alt="Soliva" width="480">
</p>

# Soliva

Ein Aufbauspiel im Stil von *Age of Empires II* in einer endlosen, prozedural
erzeugten Welt: Aus einem Seed wächst eine ganze Landschaft mit Küsten, Wäldern,
Wiesen und Bergen. Darin gründest du ein Dorf, bildest Dorfbewohner aus,
sammelst Holz, Stein, Gold und Beeren, legst Felder an, jagst Rehe und Hasen
und baust deine Siedlung aus.

## Der Name

**Soliva** (so-LEE-vah) leitet sich vom lateinischen Wort *solivagant* ab, das
„einer, der allein umherzieht“ bedeutet (*solus* „allein“ und *vagari*
„umherstreifen“). Die weichen, fließenden Vokale geben dem Namen einen
anmutigen, melodischen Klang – passend für jemanden, der unabhängig
aufbricht, um ein unbekanntes Land zu erkunden.

Genau so beginnt jedes Spiel: allein in einer unberührten, endlosen Welt, die
es noch zu entdecken gilt – und aus der nach und nach eine eigene Siedlung
wird. Auch der Standard-Seed der Welt heißt `Soliva`.

## Starten

```bash
bun install
npm run dev
```

**Paketmanager ist [Bun](https://bun.sh)** – aber nur zum Installieren der
Abhängigkeiten: `bun install` statt `npm install` oder `yarn`. Die
Versionen stehen in `bun.lock`; `package-lock.json` und `yarn.lock` gibt es
nicht mehr. Alles andere läuft weiter mit Node: die Skripte startet man
wie gewohnt mit `npm run …` (auch in `docs/`).

Danach läuft das Spiel unter der Adresse, die Vite ausgibt (z. B.
`http://localhost:5173`).

```bash
npm run build     # Typprüfung und Build nach dist/
npm run preview   # den Build lokal ansehen
```

Die Hintergrundmusik (`assets/music/*.mp3`) liegt in **Git LFS**. Vor dem Klonen `git lfs install`
ausführen – sonst kommen statt der Dateien nur kleine Zeiger-Dateien an
(nachholen mit `git lfs pull`). Beim Hosten auf Vercel muss unter
*Settings → Git* „Git Large File Storage (LFS)“ eingeschaltet sein.

## Adressen

| Adresse | Inhalt |
|---|---|
| `/` | das Spiel, beginnend im Hauptmenü |
| `/galerie` | alle Modelle und Animationen ohne Gelände (`?zeige=Birke&zoom=300` zeigt auf ein Modell) |

Die Welt (Seed) wählt man im Hauptmenü unter Einzelspieler → Neues Spiel;
gleicher Name, gleiche Welt. Standard ist `Soliva`. Unter Einzelspieler →
Spiel laden stehen alle Spielstände dieses Browsers. Der Spielstand liegt im
`localStorage` des Browsers, je Seed unter `pgm.world.<seed>`, die zuletzt
gewählte Welt unter `pgm.seed`.

## Steuerung

| Eingabe | Wirkung |
|---|---|
| `W` `A` `S` `D` / Pfeiltasten, rechte Maustaste halten und ziehen | Karte verschieben |
| Mausrad, `Q` / `E` | zoomen |
| Linksklick / Ziehen | auswählen (Doppelklick: alle gleichartigen in der Nähe) |
| Rechtsklick | Befehl: sammeln, jagen, Feld bestellen, abliefern, hingehen |
| `1` – `6` | bauen: Hauptgebäude, Haus, Holzlager, Minenlager, Mühle, Feld |
| `V` (mit Umschalt: 5) | Dorfbewohner ausbilden |
| `H` / `.` | zum Hauptgebäude / untätige Dorfbewohner |
| `Entf` | abreißen |
| `Leertaste` halten | Gelände flachlegen, um hinter Berge zu sehen |
| `Alt` + rechte Maustaste ziehen | Blickwinkel: hoch/runter neigen (20°–70°), links/rechts eine Vierteldrehung |
| `Alt` + `↑` / `↓` | steiler / flacher neigen |
| `Alt` + `←` / `→` | Vierteldrehung nach links / rechts |
| `F3` / `F10` / `M` | Pause / Menü / Ton an und aus |
| `Enter` | Cheat eingeben (siehe unten) |

`Alt` ist auf dem Mac die Option-Taste; unter Windows geht auch `AltGr`. Der
Blickwinkel bleibt wie die Blickrichtung beim Neuladen erhalten.

## Cheats

`Enter` öffnet unten in der Mitte ein Eingabefeld: Cheat eintippen, mit
`Enter` ausführen, `Esc` bricht ab. Groß-/Kleinschreibung und Leerzeichen
zählen nicht. Wirkt ein Cheat, erscheint eine grüne Meldung, sonst passiert
nichts.

| Cheat | Wirkung |
|---|---|
| `im the king` | je +30.000 Nahrung, Holz, Stein und Gold, Bevölkerungsgrenze +100 |
| `i need help` | 20 Dorfbewohner rund um den Mauszeiger – nur auf begehbarem Boden; über Wasser, Wald oder Gebäuden nichts |
| `muh`, `muh muh`, `muh muh muh`, … | je „muh“ eine Kuh am Mauszeiger, weitere rundherum – nicht auf Wasser, Gebirge, Schnee oder in Gebäuden |
| `speedy gonzales` | an/aus, siehe unten |

`speedy gonzales` schaltet ein; noch einmal eingegeben schaltet es wieder
aus. Solange es an ist:

- Dorfbewohner kommen ohne Ausbildungszeit aus dem Hauptgebäude.
- Ein ganzes Feld wird auf einmal gepflügt und gesät und ist sofort reif.
- Jedes Tier fällt mit einem Treffer.
- Beim Ernten, Holzfällen, Beerenpflücken und Zerlegen ist die Ladung sofort
  voll; abgeliefert wird wie sonst.

Neu säen kostet auch dann 2 Holz je Furche; Stein und Gold werden normal
abgebaut. Die Bevölkerungsgrenze aus `im the king` und `speedy gonzales`
stehen nicht im Spielstand – nach dem Laden sind sie weg. Die Cheats stehen
in `src/main.ts` (`CHEATS`).

## Modelle

Jedes Objekt des Spiels ist eine glTF-Datei: `src/models/<ordner>/<name>.glb` (z. B. `trees/oak.glb`). Blender
öffnet und speichert sie ohne Zusatz – zum Bearbeiten Datei → Import →
glTF 2.0, danach Export → glTF 2.0 (glTF Binary) über dieselbe Datei. Es gibt
keinen Export-Schritt, und zum Bauen braucht es kein Blender. Wie das Spiel
die Dateien liest und welche Objektnamen etwas bedeuten: docs/BLENDER.md.

Die Bewegungen stecken in Clip-Bibliotheken, ebenfalls glTF:
`src/models/clips/<skelett>.glb`, dazu je eine `.json` mit den Angaben je
Clip (docs/ANIMATION.md).

Die Felder baut das Spiel beim Start selbst (`tools/models/farmsGen.mjs`) –
ein Weizenfeld besteht aus Tausenden einzelner Halme.
