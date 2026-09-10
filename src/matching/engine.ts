import type { EmployeeId } from '../domain/types.js';

export interface MatchingCandidate {
  employeeId: EmployeeId;
  /** `${category}:${optionId}` - voir EmployeeProfile.interestAnswers. */
  interestAnswers: string[];
}

export interface FormMatchGroupsOptions {
  /** Taille minimale d'un groupe. Defaut: 2. */
  minGroupSize?: number;
  /** Taille maximale d'un groupe. Defaut: 4. */
  maxGroupSize?: number;
  /** RNG injectable pour des tests deterministes. Defaut: Math.random. */
  random?: () => number;
}

export interface FormMatchGroupsResult {
  groups: EmployeeId[][];
  /** Employes qui n'ont pas pu etre places dans un groupe valide ce cycle-ci. */
  deferred: EmployeeId[];
}

/**
 * recentPairs contient les paires d'employes deja matchees lors des N derniers cycles,
 * sous la forme `pairKey(a, b)`. Utilise pour eviter de reformer les memes duos/groupes.
 */
export function buildPairKey(a: EmployeeId, b: EmployeeId): string {
  return [a, b].sort().join('|');
}

export function formMatchGroups(
  candidates: MatchingCandidate[],
  recentPairs: ReadonlySet<string>,
  options: FormMatchGroupsOptions = {},
): FormMatchGroupsResult {
  const minGroupSize = options.minGroupSize ?? 2;
  const maxGroupSize = options.maxGroupSize ?? 4;
  const random = options.random ?? Math.random;

  const pool = shuffle(candidates, random);
  const groups: MatchingCandidate[][] = [];
  const deferred: MatchingCandidate[] = [];

  // Planifie des tailles de groupe qui couvrent tout le monde (ex: 5 personnes -> 3+2
  // plutot que 4+1) avant de placer qui va avec qui, pour minimiser le nombre de deferred.
  const plannedSizes = planGroupSizes(pool.length, minGroupSize, maxGroupSize);
  let sizeIndex = 0;

  while (pool.length > 0) {
    const targetSize = plannedSizes[sizeIndex] ?? maxGroupSize;
    sizeIndex++;

    const seed = pool.shift();
    if (!seed) break;
    const group: MatchingCandidate[] = [seed];

    while (group.length < targetSize && pool.length > 0) {
      const bestIndex = pickBestCompatibleIndex(group, pool, recentPairs);
      if (bestIndex === -1) break;
      const [chosen] = pool.splice(bestIndex, 1);
      if (chosen) group.push(chosen);
    }

    if (group.length >= minGroupSize) {
      groups.push(group);
    } else {
      deferred.push(...group);
    }
  }

  rescueDeferredIntoExistingGroups(deferred, groups, recentPairs, maxGroupSize);

  return {
    groups: groups.map((group) => group.map((member) => member.employeeId)),
    deferred: deferred.map((member) => member.employeeId),
  };
}

/**
 * Determine des tailles de groupe (entre min et max) qui couvrent le plus possible de
 * candidats sans laisser de reste isole. Ex: 5 personnes, groupes 2-4 -> [3, 2] plutot
 * que de remplir un groupe de 4 et laisser 1 personne seule.
 */
function planGroupSizes(total: number, min: number, max: number): number[] {
  for (let deferCount = 0; deferCount < total; deferCount++) {
    const usable = total - deferCount;
    if (usable < min) continue;

    const minGroups = Math.ceil(usable / max);
    const maxGroups = Math.floor(usable / min);
    if (minGroups > maxGroups) continue;

    const groupCount = minGroups;
    const base = Math.floor(usable / groupCount);
    const extra = usable % groupCount;
    return Array.from({ length: groupCount }, (_, i) => base + (i < extra ? 1 : 0));
  }
  return [];
}

function pickBestCompatibleIndex(
  group: MatchingCandidate[],
  pool: MatchingCandidate[],
  recentPairs: ReadonlySet<string>,
): number {
  let bestIndex = -1;
  let bestScore = -1;

  for (let i = 0; i < pool.length; i++) {
    const candidate = pool[i];
    if (!candidate || hasRecentPairConflict(candidate.employeeId, group, recentPairs)) continue;

    const score = group.reduce(
      (acc, member) => acc + sharedInterestScore(member.interestAnswers, candidate.interestAnswers),
      0,
    );
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function rescueDeferredIntoExistingGroups(
  deferred: MatchingCandidate[],
  groups: MatchingCandidate[][],
  recentPairs: ReadonlySet<string>,
  maxGroupSize: number,
): void {
  for (let i = deferred.length - 1; i >= 0; i--) {
    const person = deferred[i];
    if (!person) continue;
    const target = groups.find(
      (group) =>
        group.length < maxGroupSize &&
        !hasRecentPairConflict(person.employeeId, group, recentPairs),
    );
    if (target) {
      target.push(person);
      deferred.splice(i, 1);
    }
  }
}

function hasRecentPairConflict(
  candidateId: EmployeeId,
  group: MatchingCandidate[],
  recentPairs: ReadonlySet<string>,
): boolean {
  return group.some((member) => recentPairs.has(buildPairKey(member.employeeId, candidateId)));
}

function sharedInterestScore(a: string[], b: string[]): number {
  const setB = new Set(b);
  return a.filter((tag) => setB.has(tag)).length;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = result[i];
    const b = result[j];
    if (a === undefined || b === undefined) continue;
    result[i] = b;
    result[j] = a;
  }
  return result;
}
