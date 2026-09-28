// Titel der Musikstücke aus den Dateinamen (src/trackTitle.ts): Nummer weg,
// echte Umlaute, Hauptwörter groß - für alle Stücke in assets/music/.

import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { test } from 'node:test';
import { trackTitle } from '../src/trackTitle.ts';

test('Titel aus den Dateinamen', () => {
  const titles = readdirSync(new URL('../assets/music/', import.meta.url))
    .filter((f) => f.endsWith('.mp3'))
    .map((f) => f.replace(/\.mp3$/, ''))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
    .map(trackTitle);
  assert.deepEqual(titles, [
    'Für die neue Siedlung',
    'Zum Erntedankfest',
    'Das Abendbrot',
    'Der Dorfalltag',
    'Am Frühlingsfest wird hart gefeiert',
    'Morgenstund hat Gold im Mund',
    'Auf zu neuen Ufern',
    'Das Holzfällerlied',
    'Eine Heldenehrung',
    'Die neuen Zeiten brechen an',
    'Entspannt gehts aufs Land',
    'Ahoi und auf zur See',
    'Die Blumen stehen in der Blüte',
    'Brauermeister Sepp',
    'Hymne des Kartoffelbauern',
    'Ein Steinmetz vom Berg',
    'Die schöne Jägersfrau',
    'Lied der Goldgräber',
    'Für einen Tomatenbauern',
  ]);
});
