import { describe, expect, it } from 'vitest';
import {
  buildPairKey,
  formMatchGroups,
  type MatchingCandidate,
} from '../../src/matching/engine.js';

function candidate(
  id: string,
  answers: MatchingCandidate['interestAnswers'] = [],
): MatchingCandidate {
  return { employeeId: id, interestAnswers: answers };
}

// RNG deterministe pour des tests reproductibles (evite le vrai Math.random).
function fixedRandom(sequence: number[]): () => number {
  let i = 0;
  return () => {
    const value = sequence[i % sequence.length] ?? 0;
    i++;
    return value;
  };
}

describe('formMatchGroups', () => {
  it('regroupe tous les employes quand aucun historique ne bloque un match', () => {
    const candidates = [candidate('a'), candidate('b'), candidate('c'), candidate('d')];

    const result = formMatchGroups(candidates, new Set(), { random: fixedRandom([0]) });

    const matched = result.groups.flat();
    expect(matched).toHaveLength(4);
    expect(result.deferred).toHaveLength(0);
    for (const group of result.groups) {
      expect(group.length).toBeGreaterThanOrEqual(3);
      expect(group.length).toBeLessThanOrEqual(5);
    }
  });

  it('utilise 3 comme taille minimale et 5 comme taille maximale par defaut', () => {
    // 2 personnes: sous le minimum (3) par defaut -> reportees, aucun groupe forme.
    const two = [candidate('a'), candidate('b')];
    const resultTwo = formMatchGroups(two, new Set(), { random: fixedRandom([0]) });
    expect(resultTwo.groups).toHaveLength(0);
    expect(resultTwo.deferred.sort()).toEqual(['a', 'b']);

    // 5 personnes: tient dans un seul groupe (maximum par defaut).
    const five = [candidate('a'), candidate('b'), candidate('c'), candidate('d'), candidate('e')];
    const resultFive = formMatchGroups(five, new Set(), { random: fixedRandom([0]) });
    expect(resultFive.groups).toHaveLength(1);
    expect(resultFive.groups[0]).toHaveLength(5);
    expect(resultFive.deferred).toHaveLength(0);
  });

  it("exclut les paires recemment matchees l'une de l'autre", () => {
    const candidates = [candidate('a'), candidate('b'), candidate('c'), candidate('d')];
    const recentPairs = new Set([buildPairKey('a', 'b')]);

    const result = formMatchGroups(candidates, recentPairs, {
      minGroupSize: 2,
      maxGroupSize: 2,
      random: fixedRandom([0]),
    });

    for (const group of result.groups) {
      if (group.includes('a')) {
        expect(group).not.toContain('b');
      }
    }
  });

  it('reporte au cycle suivant un employe qui ne peut integrer aucun groupe valide', () => {
    // a-b, a-c et a-d sont tous des paires recentes: "a" ne peut rejoindre personne.
    const candidates = [candidate('a'), candidate('b'), candidate('c'), candidate('d')];
    const recentPairs = new Set([
      buildPairKey('a', 'b'),
      buildPairKey('a', 'c'),
      buildPairKey('a', 'd'),
    ]);

    const result = formMatchGroups(candidates, recentPairs, {
      minGroupSize: 2,
      maxGroupSize: 4,
      random: fixedRandom([0]),
    });

    expect(result.deferred).toEqual(['a']);
    expect(result.groups.flat()).toHaveLength(3);
  });

  it("priorise les employes qui partagent des centres d'interet communs", () => {
    const candidates = [
      candidate('a', ['cuisine', 'sport']),
      candidate('b', ['cuisine']),
      candidate('c', ['technologie']),
    ];

    const result = formMatchGroups(candidates, new Set(), {
      minGroupSize: 2,
      maxGroupSize: 2,
      random: fixedRandom([0]),
    });

    const groupWithA = result.groups.find((group) => group.includes('a'));
    expect(groupWithA).toContain('b');
  });

  it('recupere un employe isole en le rattachant a un groupe existant sous la taille max', () => {
    // 5 personnes, groupes de taille max 4: "e" devrait rejoindre le groupe forme par a-b-c-d
    // plutot que d'etre reporte, tant qu'il n'y a pas de conflit d'historique.
    const candidates = [
      candidate('a'),
      candidate('b'),
      candidate('c'),
      candidate('d'),
      candidate('e'),
    ];

    const result = formMatchGroups(candidates, new Set(), {
      minGroupSize: 2,
      maxGroupSize: 4,
      random: fixedRandom([0]),
    });

    expect(result.deferred).toHaveLength(0);
    expect(result.groups.flat()).toHaveLength(5);
  });
});

describe('buildPairKey', () => {
  it("est symetrique peu importe l'ordre des identifiants", () => {
    expect(buildPairKey('a', 'b')).toBe(buildPairKey('b', 'a'));
  });
});
