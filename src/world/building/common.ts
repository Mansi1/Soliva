// common.ts
// Was die Gebäudeklassen schon beim Laden ihrer Definition brauchen - ohne
// Abhängigkeit von catalog.ts, das seinerseits die Klassen lädt.

import type { ResourceKind } from '../catalog';

/** Was Dorfbewohner draußen sammeln - das nimmt das Dorfzentrum an. */
export const GATHERED_KINDS: readonly ResourceKind[] = ['food', 'wood', 'stone', 'gold'];

/** Alle Rohstoffe im Vorrat: das Gesammelte und was in Werkstätten entsteht. */
export const RESOURCE_KINDS: readonly ResourceKind[] = [...GATHERED_KINDS, 'bows', 'spears', 'shoes'];

/** Waffen: liegen in der Waffenkammer und teilen sich ihren Platz (weaponCapacity). */
export const WEAPON_KINDS: readonly ResourceKind[] = ['bows', 'spears'];

/** Untergründe, auf denen überhaupt gebaut werden kann. */
export const BUILDABLE = ['beach', 'desert', 'grass', 'forest', 'snow'] as const;
