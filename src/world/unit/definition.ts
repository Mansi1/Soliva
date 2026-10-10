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
  /**
   * Tiles je Sekunde Spielzeit beim Umherziehen und auf der Flucht (1 Tile =
   * 5 m). Die Beine passen sich über `stride` an jede Geschwindigkeit an. Ein
   * Jäger geht 0.8 Tiles/s (VILLAGER.speed) und muss auf Wurfweite (HUNT.range)
   * heran - ohne `sprint` bleibt die Flucht darunter, sonst entkäme jedes Tier.
   */
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
  /**
   * Tiles je Durchlauf des Geh-Clips (jedes Bein ein Schritt) - die Beine
   * schwingen nach der Strecke. So weit, dass die Hufe nicht rutschen: der
   * Fuß im tiefsten Punkt seines Schwungs läuft so schnell nach hinten, wie
   * das Tier vorankommt (Clip und Beinhöhe des Modells mal `height`). Auf der
   * Flucht FLEE_STRIDE-mal so weit (world/render.ts).
   * VERIFIED: tests/animal-ground.test.mjs - je Art auf 5 % an Clip und Modell.
   */
  stride: number;
}
