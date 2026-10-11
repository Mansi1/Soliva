// skills.ts
// Fähigkeiten je Dorfbewohner (B24): wer eine Arbeit oft tut, wird darin
// schneller. Gespeichert sind die Sekunden Übung je Fähigkeit
// (Villager.skills, im Spielstand `sk`); Stufe und Bonus folgen daraus.
//
// Die Formel, bewusst klein:
//   Stufe  = min(1, Übung / SKILL.mastery)        0..1, linear
//   Tempo  = 1 + SKILL.bonus * Stufe              1..1,5
// Nach 10 Minuten Arbeit (600 s) ist er Meister und arbeitet 50 % schneller,
// mehr gibt es nicht. Die Zahlen sind geschätzt (Vorgabe: "plausibel"): ein
// Holzfäller braucht für eine Ladung ~12 s, Meister ist er nach ~50 Ladungen.
// ponytail: linear und ohne Vergessen; eine Kurve mit abnehmendem Gewinn oder
// Verfall einbauen, wenn Meister zu schnell oder zu billig wirken.
//
// Welche Arbeit welche Fähigkeit übt und schneller macht (villagers.ts, archery.ts):
//   gathering  Holz, Stein, Gold und Beeren sammeln - eine Fähigkeit für alles
//              Sammeln, statt drei: sie wirken an derselben Stelle (Sammeltempo).
//   farming    pflügen, säen, ernten
//   crafting   Bögen und Speere schnitzen (Bognerei, Speermacherei)
//   hunting    Speerwurf bzw. Zustoßen: schneller nachladen
//   archery    am Schießplatz üben; mit dem Bogen jagen: schneller nachladen

/** Die Fähigkeiten - Reihenfolge wie im Panel. */
export const SKILL_KINDS = ['archery', 'hunting', 'gathering', 'farming', 'crafting'] as const;
export type Skill = (typeof SKILL_KINDS)[number];

/** Sekunden Übung je Fähigkeit; was fehlt, ist 0. */
export type Skills = Partial<Record<Skill, number>>;

/** Namen für die Oberfläche. */
export const SKILL_LABEL: Record<Skill, string> = {
  archery: 'Bogen', hunting: 'Jagen', gathering: 'Sammeln', farming: 'Ackerbau', crafting: 'Handwerk',
};

/** `mastery`: Sekunden Übung bis Stufe 1; `bonus`: so viel schneller arbeitet ein Meister (0,5 = +50 %). */
export const SKILL = { mastery: 600, bonus: 0.5 };

/** Stufe 0..1. */
export function skillLevel(skills: Skills, skill: Skill): number {
  return Math.min(1, (skills[skill] ?? 0) / SKILL.mastery);
}

/**
 * Faktor aufs Arbeitstempo: 1 ohne Übung, 1 + SKILL.bonus als Meister.
 * VERIFIED: tests/archery.test.mjs - ein Meister sammelt schneller, nie mehr als +50 %.
 */
export function skillFactor(skills: Skills, skill: Skill): number {
  return 1 + SKILL.bonus * skillLevel(skills, skill);
}

/**
 * `dt` Sekunden Arbeit: zählt sie als Übung und gibt die Arbeit zurück, die er
 * darin schafft (dt mal Faktor) - so wirkt die Fähigkeit dort, wo die Arbeit zählt.
 */
export function practise(skills: Skills, skill: Skill, dt: number): number {
  const factor = skillFactor(skills, skill);
  skills[skill] = Math.min(SKILL.mastery, (skills[skill] ?? 0) + dt);
  return dt * factor;
}

/** Fürs Panel: "Bogen 40 % · Jagen 10 %" - nur, was er schon kann; leer ohne. */
export function skillsText(skills: Skills): string {
  return SKILL_KINDS
    .map((s) => [s, Math.floor(skillLevel(skills, s) * 100)] as const)
    .filter(([, percent]) => percent > 0)
    .map(([s, percent]) => `${SKILL_LABEL[s]} ${percent} %`)
    .join(' · ');
}

/** Für den Spielstand: nur Geübtes, auf Zehntelsekunden - undefined ohne. */
export function skillsSave(skills: Skills): Skills | undefined {
  const out: Skills = {};
  for (const s of SKILL_KINDS) {
    const t = Math.round((skills[s] ?? 0) * 10) / 10;
    if (t > 0) out[s] = t;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Aus dem Spielstand: nur bekannte Fähigkeiten mit endlicher Übung, höchstens
 * bis zum Meister. Ältere Stände haben keine - dann kann er noch nichts.
 */
export function skillsFromSave(saved: unknown): Skills {
  const out: Skills = {};
  if (!saved || typeof saved !== 'object') return out;
  for (const s of SKILL_KINDS) {
    const t = (saved as Record<string, unknown>)[s];
    if (typeof t === 'number' && Number.isFinite(t) && t > 0) out[s] = Math.min(SKILL.mastery, t);
  }
  return out;
}
