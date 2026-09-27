// trackTitle.ts
// Titel eines Musikstücks aus seinem Dateinamen (music.ts) - eigene Datei,
// damit der Test ohne Vite auskommt (music.ts braucht import.meta.glob).

/**
 * Wörter, die im Titel klein bleiben - alle anderen sind Hauptwörter und
 * beginnen groß (Dateinamen sind ganz klein geschrieben).
 */
const LOWER = new Set([
  'am', 'an', 'auf', 'aufs', 'das', 'der', 'des', 'die', 'ein', 'eine', 'einen', 'für', 'im', 'in', 'und', 'vom', 'zu',
  'zum', 'zur', 'neue', 'neuen', 'schöne', 'hart', 'hat', 'wird', 'gefeiert', 'brechen', 'stehen', 'entspannt', 'gehts',
]);

/**
 * Titel aus dem Dateinamen: "5_am_fruehlingsfest_wird_hart_gefeiert" →
 * "Am Frühlingsfest wird hart gefeiert". Die Nummer vorn fällt weg, ae/oe/ue
 * werden zu ä/ö/ü - nicht nach a und e (au, eu: "Bauern", "neue").
 */
export function trackTitle(name: string): string {
  const words = name.replace(/^\d+_/, '').split('_')
    .map((w) => w.replace(/(^|[^ae])([aou])e/g, (_, before: string, v: string) => before + ({ a: 'ä', o: 'ö', u: 'ü' } as Record<string, string>)[v]))
    .map((w, i) => (i > 0 && LOWER.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)));
  return words.join(' ');
}
