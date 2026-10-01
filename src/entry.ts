// entry.ts
// Einstieg: /galerie zeigt alle Modelle und Animationen (gallery.ts), jede
// andere Adresse das Spiel (main.ts).
import './style.css';

if (window.location.pathname.slice(import.meta.env.BASE_URL.length).replace(/\/+$/, '') === 'galerie') {
  void import('./gallery');
} else {
  void import('./main');
}
