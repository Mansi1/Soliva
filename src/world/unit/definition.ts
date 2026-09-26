// definition.ts
// Was für alle Tiere einer Art gilt. Jede Tierklasse trägt ihre Definition
// statisch: `static readonly definition: AnimalDefinition<'deer'> = {...}`.

export interface AnimalDefinition<T extends string = string> {
  /** Kennung der Art, gleich der Klasse in snake_case: 'deer' ↔ Deer. */
  type: T;
  label: string;
  /** Was es für die Natur leistet - fürs Auswahl-Panel. */
  info: string;
  /** Modell (SHAPE) */
  shape: number;
  /** Höhe in Tiles (1 Tile = 5 m) - der Hase etwas größer als echt, sonst sähe man ihn kaum. */
  height: number;
  /** So viele Speerwürfe hält es aus. */
  hp: number;
  /** Nahrung, die der Kadaver hergibt. */
  food: number;
  /** Tiles je Sekunde beim Umherziehen und auf der Flucht. */
  walk: number;
  flee: number;
  /**
   * Sprinten nur kurz (Sekunden) und müssen dann verschnaufen - so holt ein
   * Jäger sie ein. Ohne: gleichmäßig auf der Flucht.
   */
  sprint?: { time: number; rest: number; slow: number };
  /** Ab dieser Nähe (Tiles) eines Dorfbewohners flieht es. */
  fear: number;
  /** So viele leben zusammen (von, bis). */
  herd: [number, number];
  /** Tiles zwischen zwei Schritten - die Beine schwingen danach. */
  stride: number;
}
