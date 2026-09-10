import type { DayOfWeek } from '../domain/types.js';

const DAY_ORDER: readonly DayOfWeek[] = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'];

/**
 * Regle simple pour le MVP (voir docs/tickets.md, lot 3): le premier jour de la semaine
 * (lundi -> vendredi) disponible chez tous les membres du groupe, ou undefined si aucun
 * jour commun n'existe.
 */
export function findCommonAvailableDay(
  membersAvailableDays: readonly (readonly DayOfWeek[])[],
): DayOfWeek | undefined {
  if (membersAvailableDays.length === 0) return undefined;
  return DAY_ORDER.find((day) => membersAvailableDays.every((days) => days.includes(day)));
}

/** Prochaine occurrence (strictement apres `from`, minuit) du jour de semaine donne. */
export function nextDateForDayOfWeek(day: DayOfWeek, from: Date): Date {
  const targetJsDay = DAY_ORDER.indexOf(day) + 1; // lundi=1 ... vendredi=5 (Date#getDay(): dimanche=0)
  const result = new Date(from);
  result.setHours(0, 0, 0, 0);

  let diff = targetJsDay - result.getDay();
  if (diff <= 0) diff += 7;
  result.setDate(result.getDate() + diff);
  return result;
}
