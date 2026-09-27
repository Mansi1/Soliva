// entry.ts
// Einstieg: /galerie zeigt alle Modelle und Animationen (gallery.ts), jede
// andere Adresse das Spiel (main.ts), /game/<seed>/<stand> mit Test-Spielstand (worlds.ts).
import './style.css';
import { gameUrl, installSave } from './worlds';

if (window.location.pathname.replace(/\/+$/, '') === '/galerie') {
  void import('./gallery');
} else {
  // /game/<seed>/<stand>: erst den mitgelieferten Test-Stand ablegen.
  void (gameUrl?.save ? installSave(gameUrl.seed, gameUrl.save) : Promise.resolve()).then(() => import('./main'));
}
