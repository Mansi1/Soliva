// worlds.ts
// Welche Welt (Seed) gespielt wird - nicht mehr in der Adresse, sondern im
// localStorage: die zuletzt gewählte. Eine andere Welt beginnt mit einem
// Neuladen der Seite; ein Vermerk im sessionStorage sagt der neuen Seite,
// dass sie gleich ins Spiel geht (neu oder weiter) statt ins Hauptmenü.
// Dazu die Liste der Spielstände fürs Laden-Menü - das Format und den Ort
// der Spielstände kennt world/save.ts.
// Ausnahme zum Testen: /game/<seed>?lat=<y>&lng=<x>&zoom=<1-5>&save=<base64>
// geht direkt in diese Welt an diese Stelle, ohne Hauptmenü und ohne sich die
// Welt zu merken. Ohne Seed (/game) eine Zufallswelt - ihr Name kommt in die
// Adresse. Mit save (Spielstand-JSON als base64url) beginnt sie jedes Mal mit
// diesem Stand - so passt ein Test-Spielstand in einen Link, ohne Datei im Repo.

import { readSave, saveKey, seedOfKey } from './world/save';

/** Die Welt, wenn noch keine gewählt wurde. */
export const DEFAULT_SEED = 'Soliva';
/** Wer eine neue Welt mit diesem Namen beginnt, bekommt die Demo (public/savegame/demo.json). */
export const DEMO_SEED = 'Demo';

const SEED_KEY = 'pgm.seed';
const START_KEY = 'pgm.start';

/** Wie die Seite nach dem Wechsel der Welt beginnt. */
export type StartRequest = 'new' | 'continue';

/** Welt und Stelle aus /game/<seed>?lat=&lng=&zoom=&save= - null bei jeder anderen Adresse. */
export const gameUrl = parseGameUrl();

function parseGameUrl() {
  const match = window.location.pathname.match(/^\/game(?:\/([^/]*))?\/?$/);
  if (!match) return null;
  const seed = decodeURIComponent(match[1] ?? '') || randomSeed();
  const params = new URLSearchParams(window.location.search);
  const num = (key: string) => (params.get(key) ? Number(params.get(key)) : NaN);
  const [lat, lng, zoom] = [num('lat'), num('lng'), num('zoom')];
  const save = params.get('save');
  // Fehlerhafter Stand: laut scheitern statt still eine leere Welt zeigen.
  if (save) localStorage.setItem(saveKey(seed), JSON.stringify(JSON.parse(fromBase64(save))));
  window.history.replaceState(null, '', `/game/${encodeURIComponent(seed)}${window.location.search}`);
  return {
    seed,
    at: Number.isFinite(lat) && Number.isFinite(lng) ? { x: lng, y: lat } : null,
    zoom: Number.isInteger(zoom) ? zoom : null,
  };
}

/** base64 oder base64url (UTF-8) als Text - ein '+' kommt aus der Adresse als Leerzeichen. */
function fromBase64(text: string): string {
  const binary = atob(text.replace(/[- ]/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

/** Die Welt aus der Adresse, sonst die zuletzt gewählte. */
export function currentSeed(): string {
  if (gameUrl) return gameUrl.seed;
  try {
    return localStorage.getItem(SEED_KEY) || DEFAULT_SEED;
  } catch {
    return DEFAULT_SEED;
  }
}

/** Hat die Welt einen Spielstand mit Gebäuden oder Dorfbewohnern? */
export function hasProgress(seed: string): boolean {
  const info = saveInfo(seed);
  return info !== null && (info.buildings > 0 || info.villagers > 0);
}

/** Ein Spielstand, wie ihn das Laden-Menü zeigt. */
export interface SaveInfo {
  seed: string;
  buildings: number;
  villagers: number;
  /** Wann gespeichert (ms) - fehlt bei älteren Ständen. */
  savedAt?: number;
}

/** Kurzinfo zum Spielstand einer Welt - null, wenn es keinen (lesbaren) gibt. */
function saveInfo(seed: string): SaveInfo | null {
  const saved = readSave(seed);
  if (!saved) return null;
  const { data } = saved;
  return { seed, buildings: data.buildings.length, villagers: data.villagers.length, savedAt: data.savedAt };
}

/** Alle Spielstände mit Gebäuden oder Dorfbewohnern, der jüngste zuerst. */
export function listSaves(): SaveInfo[] {
  const seeds: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const seed = seedOfKey(localStorage.key(i) ?? '');
      if (seed !== null) seeds.push(seed);
    }
  } catch {
    return [];
  }
  return seeds.map(saveInfo)
    .filter((info): info is SaveInfo => info !== null && (info.buildings > 0 || info.villagers > 0))
    .sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
}

/** Spielstand einer Welt löschen. */
export function deleteSave(seed: string) {
  try {
    localStorage.removeItem(saveKey(seed));
  } catch {
    // Ohne Speicher gibt es auch nichts zu löschen.
  }
}

/** Ist das der Name der Demo-Welt? Groß- und Kleinschreibung egal. */
export function isDemo(seed: string): boolean {
  return seed.toLowerCase() === DEMO_SEED.toLowerCase();
}

/** Den Demo-Spielstand als Spielstand der Welt "Demo" ablegen; false, wenn es nicht ging. */
export async function installDemo(): Promise<boolean> {
  try {
    const response = await fetch('/savegame/demo.json');
    if (!response.ok) return false;
    localStorage.setItem(saveKey(DEMO_SEED), JSON.stringify(await response.json()));
    return true;
  } catch {
    return false;
  }
}

/** In eine andere Welt wechseln: Seed merken und die Seite neu laden - dort `request`. */
export function switchWorld(seed: string, request: StartRequest) {
  try {
    localStorage.setItem(SEED_KEY, seed);
    sessionStorage.setItem(START_KEY, request);
  } catch {
    // Ohne Speicher bleibt es bei der jetzigen Welt.
    return;
  }
  window.location.replace('/');
}

/** Wie diese Seite beginnen soll, wenn eine andere Welt gewählt wurde. Der Vermerk gilt nur einmal. */
export function takeStartRequest(): StartRequest | null {
  if (gameUrl) return 'continue';
  try {
    const request = sessionStorage.getItem(START_KEY);
    sessionStorage.removeItem(START_KEY);
    return request === 'new' || request === 'continue' ? request : null;
  } catch {
    return null;
  }
}

/** Ein Name für eine Zufallswelt, aussprechbar wie "Soliva": Silben aus Mitlaut und Selbstlaut. */
export function randomSeed(): string {
  const consonants = 'bdfgklmnprstvz';
  const vowels = 'aeiou';
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  const syllables = 2 + Math.floor(Math.random() * 2);
  let name = '';
  for (let i = 0; i < syllables; i++) name += pick(consonants) + pick(vowels);
  return name[0].toUpperCase() + name.slice(1);
}
