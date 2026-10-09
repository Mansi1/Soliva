// TrackCard.tsx
// Beginnt ein Musikstück, blendet oben rechts kurz ein Holzschild mit Cover,
// Titel, Interpret und Album ein und nach 10 Sekunden wieder aus (music.ts
// meldet den Start, main.ts ruft showTrack). VERIFIED: im Browser nach 11,5 s
// wieder aus dem DOM (animationend).

import { render } from 'defuss';
import './TrackCard.css';

export interface TrackCardInfo {
  title: string;
  artist?: string;
  album?: string;
  cover?: string;
  /** Album bei Spotify (trackTags.ts) - dann ein Link auf der Karte. */
  link?: string;
}

let root: HTMLElement | null = null;

export function showTrack(info: TrackCardInfo) {
  // Neu anlegen statt wiederverwenden - so beginnt die Animation von vorn.
  root?.remove();
  const el = document.createElement('div');
  el.className = 'track-card';
  el.setAttribute('role', 'status');
  el.addEventListener('animationend', () => el.remove());
  document.body.appendChild(el);
  root = el;
  render(
    <>
      {info.cover && <img class="track-cover" src={info.cover} alt="" />}
      <div class="track-text">
        <div class="track-title">{info.title}</div>
        {info.artist && <div class="track-artist">{info.artist}</div>}
        {info.album && <div class="track-album">{info.album}</div>}
        {info.link && <a class="track-link" href={info.link} target="_blank" rel="noopener noreferrer">Auf Spotify anhören ↗</a>}
      </div>
    </>,
    el,
  );
}
