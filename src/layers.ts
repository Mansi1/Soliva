/**
 * Ebenen der Hauptansicht für das Entwickler-Panel (Taste P): in welcher
 * Reihenfolge MapRenderer.render die Durchgänge zeichnet und welche Ebenen
 * jeder enthält. Jede Ebene lässt sich abschalten (MapRenderer.off), die
 * Durchgänge lassen sich zum Testen umsortieren (MapRenderer.order, movePass).
 * Liegt in src/, weil gl/ (EntityRenderer), map.ts und die Oberfläche sie brauchen.
 */

/** Ein Durchgang der Hauptansicht - so wie map.ts ihn zeichnet. */
export type Pass = 'terrain' | 'grass' | 'models' | 'particles' | 'post' | 'bars';

/**
 * Reihenfolge ab Werk. Alles vor 'post' landet im Bild der Post-Effekte
 * (FXAA, Farbe, Glühen, Regen), alles danach direkt im Canvas - darum
 * stehen die Balken dahinter: scharf und in ihrer echten Farbe.
 * VERIFIED: tests/layers.test.mjs - Balken nach 'post', jede gewünschte Ebene einmal.
 */
export const DRAW_ORDER: readonly Pass[] = ['terrain', 'grass', 'models', 'particles', 'post', 'bars'];

/** Name je Durchgang im Panel. */
export const PASS_LABELS: Record<Pass, string> = {
  terrain: 'Gelände',
  grass: 'Gras',
  models: 'Modelle',
  particles: 'Partikel',
  post: 'Post-Effekte',
  bars: 'Balken',
};

/** Ebenen je Durchgang: Schlüssel in MapRenderer.off, Name, Hinweis. */
export const LAYERS = {
  terrain: [
    ['terrain', 'Gelände', 'Boden an Land (Gelände-Shader)'],
    ['water', 'Wasser', 'Meer, Seen und Brandung (Gelände-Shader, unter dem Meeresspiegel)'],
  ],
  grass: [['grass', 'Gras', 'Gras- und Steinkarten']],
  models: [
    ['buildings', 'Gebäude', 'Gebäude samt Bauvorschau und Staub beim Einsturz'],
    ['trees', 'Bäume', 'Bäume, Stümpfe, Felsen, Gold und Sträucher (Vorkommen)'],
    ['fields', 'Felder', 'Äcker mit ihren Pflanzen'],
    ['flowers', 'Blumen', 'Blumen in der Wiese'],
    ['figures', 'Figuren', 'Dorfbewohner, ihr Werkzeug und Boote'],
    ['animals', 'Tiere', 'Wild und Vieh'],
    ['overlays', 'Überlagerungen', 'Auswahlring, Sammelpunkt, Flagge, Bau-Klötze, Pfeil und Bedarf über Werkstätten'],
  ],
  particles: [['particles', 'Partikel', 'Rauch, Staub, Insekten, Fische']],
  post: [
    ['fxaa', 'FXAA', 'Kantenglättung - zusätzlich zur Einstellung im Menü'],
    ['grading', 'Farbe', 'Farbgebung samt Vignette - zusätzlich zur Einstellung im Menü'],
    ['bloom', 'Glühen', 'Leuchten heller Stellen - zusätzlich zur Einstellung im Menü'],
    ['weather', 'Wetter', 'Regen vor der Kamera'],
  ],
  bars: [['bars', 'Balken', 'Lebens- und Nahrungsbalken über Ausgewähltem']],
} as const satisfies Record<Pass, readonly (readonly [string, string, string])[]>;

export type LayerKey = (typeof LAYERS)[Pass][number][0];
/** Eine Ebene: Schlüssel, Name, Hinweis. */
export type Layer = readonly [LayerKey, string, string];
/** Ebenen, die EntityRenderer selbst nach Modellart filtert. */
export type ModelLayer = (typeof LAYERS)['models'][number][0];

/** Alle Ebenen in der Reihenfolge ab Werk. */
export const LAYER_KEYS: readonly LayerKey[] = DRAW_ORDER.flatMap((pass) => LAYERS[pass].map((layer) => layer[0]));

/**
 * Durchgang `pass` in `order` um eine Stelle nach vorn (-1) oder hinten (+1).
 * Das Gelände bleibt vorn: es löscht Bild und Tiefenpuffer, was davor
 * gezeichnet wäre, ginge verloren. false, wenn sich nichts bewegt.
 */
export function movePass(order: Pass[], pass: Pass, by: -1 | 1): boolean {
  const i = order.indexOf(pass);
  const j = i + by;
  if (order[0] !== 'terrain' || i <= 0 || j <= 0 || j >= order.length) return false;
  [order[i], order[j]] = [order[j], order[i]];
  return true;
}
