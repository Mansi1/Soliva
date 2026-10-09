// trackTags.ts
// Titel, Interpret, Album, Cover und Spotify-Link eines Musikstücks aus seinen ID3-Tags
// (audio-tag). Gelesen wird nur der Anfang der Datei per HTTP-Range - das
// Stück selbst streamt das <audio>-Element, hier nicht noch einmal ganz laden.
// VERIFIED: Vite (dev) und vite preview antworten auf Range mit 206; im Browser
// 4 Anfragen je Stück (512 KB am Anfang, 3 kleine am Ende) statt der ganzen Datei (4-7 MB).

import { readID3RandomAccess, type RandomAccess } from 'audio-tag';

export interface TrackTags {
  title?: string;
  artist?: string;
  album?: string;
  /** Object-URL des Covers - lebt bis zum Schließen der Seite. */
  cover?: string;
  /**
   * Link zum Album bei Spotify: Frame WXXX mit der Beschreibung "Spotify". WCOM
   * kennt keine Beschreibung - daran sähe man nicht, wohin der Link führt.
   */
  link?: string;
}

/** So viel kommt mit der ersten Anfrage - reicht für Tags samt Cover (~200 KB). */
const HEAD = 512 * 1024;

/** Die Datei hinter `url` als RandomAccess: der Anfang einmal geholt, der Rest je Lesen per Range. */
async function remoteFile(url: string): Promise<RandomAccess> {
  const res = await fetch(url, { headers: { Range: `bytes=0-${HEAD - 1}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const head = new Uint8Array(await res.arrayBuffer());
  // Ohne Range-Unterstützung schickt der Server die ganze Datei (200).
  const size = res.status === 206 ? Number(res.headers.get('Content-Range')?.split('/')[1]) : head.length;
  if (!Number.isFinite(size)) throw new Error(`no file size in Content-Range: ${res.headers.get('Content-Range')}`);
  return {
    size,
    async read(offset, length) {
      // Auch leere Lesen am Dateiende - eine Range "bytes=n-(n-1)" lehnt der Server ab (416).
      if (offset + length <= head.length || length <= 0) return head.subarray(offset, offset + Math.max(0, length));
      const part = await fetch(url, { headers: { Range: `bytes=${offset}-${offset + length - 1}` } });
      if (part.status !== 206) throw new Error(`range ${offset}+${length}: HTTP ${part.status}`);
      return new Uint8Array(await part.arrayBuffer());
    },
  };
}

export async function readTrackTags(url: string): Promise<TrackTags> {
  const { metadata } = await readID3RandomAccess(await remoteFile(url));
  const spotify = metadata.userUrls?.Spotify;
  const picture = metadata.pictures?.find((p) => p.type === 3) ?? metadata.pictures?.[0];
  return {
    title: metadata.title,
    artist: metadata.artist?.join(', '),
    album: metadata.album,
    cover: picture && URL.createObjectURL(new Blob([picture.data as BlobPart], { type: picture.mimeType })),
    // Nur https - der Link landet als href in Menü und Karte, ein javascript:-Link liefe beim Klick.
    link: spotify?.startsWith('https://') ? spotify : undefined,
  };
}
