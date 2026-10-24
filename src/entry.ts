// entry.ts
// Einstieg: /galerie zeigt alle Modelle und Animationen (gallery.ts),
// /generator den Kartengenerator zum Ausprobieren (generator.ts), jede
// andere Adresse das Spiel (main.ts). VERIFIED: tools/ui/smoke.mjs öffnet alle drei.
import './style.css';

const route = window.location.pathname.slice(import.meta.env.BASE_URL.length).replace(/\/+$/, '');
if (route === 'galerie') {
  void import('./gallery');
} else if (route === 'generator') {
  void import('./generator');
} else {
  void import('./main');
}
