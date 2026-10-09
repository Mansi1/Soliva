// Tags eines Musikstücks samt Spotify-Link (WXXX "Spotify") per HTTP lesen (src/trackTags.ts): nur Teile der
// Datei per Range, und auch von einem Server ohne Range. Echter Server auf
// einem freien Port, echte Datei aus assets/music/.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { writeID3File } from 'audio-tag';
import { readTrackTags } from '../src/trackTags.ts';

const file = readFileSync(new URL('../assets/music/1_fuer_die_neue_siedlung.mp3', import.meta.url));

/** Liefert `data`; mit `ranges` beantwortet er Range-Anfragen (206), sonst immer ganz (200). */
async function serve(ranges, requests, data = file) {
  const server = createServer((req, res) => {
    const m = ranges && /^bytes=(\d+)-(\d+)$/.exec(req.headers.range ?? '');
    requests.push(m ? 'range' : 'full');
    if (!m) return res.writeHead(200, { 'Content-Length': data.length }).end(data);
    const [from, to] = [Number(m[1]), Math.min(Number(m[2]), data.length - 1)];
    if (from > to) return res.writeHead(416).end();
    res.writeHead(206, { 'Content-Range': `bytes ${from}-${to}/${data.length}` }).end(data.subarray(from, to + 1));
  });
  await new Promise((resolve) => server.listen(0, resolve));
  return { server, url: `http://localhost:${server.address().port}/track.mp3` };
}

for (const ranges of [true, false]) {
  test(`Titel, Interpret, Album und Cover - Server ${ranges ? 'mit' : 'ohne'} Range`, async (t) => {
    const requests = [];
    const { server, url } = await serve(ranges, requests);
    t.after(() => server.close());
    const tags = await readTrackTags(url);
    assert.equal(tags.title, 'Eine neue Siedlung');
    assert.equal(tags.artist, 'Aron Homberg');
    assert.equal(tags.album, 'Soliva (Original Soundtrack)');
    assert.equal(tags.link, 'https://open.spotify.com/album/0Zd3J7lAlag3Tlnq3Uq0YX');
    const cover = await (await fetch(tags.cover)).blob();
    assert.equal(cover.type, 'image/jpeg');
    assert.ok(cover.size > 1000, `cover only ${cover.size} bytes`);
    // Ohne Range kommt die Datei genau einmal ganz, mit Range nie.
    assert.equal(requests.filter((r) => r === 'full').length, ranges ? 0 : 1);
  });
}

// Der Link gilt nur aus WXXX mit der Beschreibung "Spotify" und nur als https - ohne WXXX,
// mit einer anderen Beschreibung oder als javascript:-Link gibt es keinen Knopf.
for (const [what, userUrls] of [
  ['ohne WXXX', undefined],
  ['andere Beschreibung', { Shop: 'https://open.spotify.com/album/x' }],
  ['javascript:-Link', { Spotify: 'javascript:alert(1)' }],
]) {
  test(`kein Spotify-Link: ${what}`, async (t) => {
    // Erst alle WXXX entfernen, dann den Fall schreiben.
    const bare = writeID3File(file, { metadata: { userUrls: null } }).bytes;
    const bytes = userUrls ? writeID3File(bare, { metadata: { userUrls } }).bytes : bare;
    const { server, url } = await serve(true, [], bytes);
    t.after(() => server.close());
    const tags = await readTrackTags(url);
    assert.equal(tags.title, 'Eine neue Siedlung');
    assert.equal(tags.link, undefined);
  });
}
