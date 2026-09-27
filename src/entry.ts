// entry.ts
// Einstieg: /galerie zeigt alle Modelle und Animationen (gallery.ts), jede
// andere Adresse das Spiel (main.ts), /game/<seed> mit Test-Spielstand (worlds.ts).
import './style.css';
import { gameUrl, installSave } from './worlds';

if (window.location.pathname.replace(/\/+$/, '') === '/galerie') {
  void import('./gallery');
} else {
  // /game/<seed>: erst den mitgelieferten Spielstand ablegen, falls es einen gibt.
  void (gameUrl ? installSave(gameUrl.seed) : Promise.resolve()).then(() => import('./main'));
}
