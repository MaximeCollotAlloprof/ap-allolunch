import { describe, expect, it } from 'vitest';
import { computeSharedAnswers } from '../../src/chat/interestsQuestionnaire.js';

describe('computeSharedAnswers', () => {
  it('ne retient que les categories ou la reponse specifique est identique', () => {
    const alice = ['musique', 'musique-rock', 'sport', 'sport-soccer'] as const;
    const bob = ['musique', 'musique-rock', 'sport', 'sport-raquette'] as const;

    const shared = computeSharedAnswers([alice, bob]);

    expect(shared).toEqual([{ categoryLabel: 'Musique', answerLabel: 'Rock' }]);
  });

  it('ignore une categorie ou un membre n’a pas encore repondu', () => {
    const alice = ['musique', 'musique-rock'] as const;
    const bob = ['musique'] as const; // pas encore de reponse specifique

    expect(computeSharedAnswers([alice, bob])).toEqual([]);
  });

  it('fonctionne pour un groupe de plus de deux personnes (tous doivent matcher)', () => {
    const alice = ['cuisine', 'cuisine-italienne'] as const;
    const bob = ['cuisine', 'cuisine-italienne'] as const;
    const carol = ['cuisine', 'cuisine-mexicaine'] as const;

    expect(computeSharedAnswers([alice, bob, carol])).toEqual([]);
    expect(computeSharedAnswers([alice, bob])).toEqual([
      { categoryLabel: 'Cuisine', answerLabel: 'Italienne' },
    ]);
  });

  it('retourne un tableau vide sans membres', () => {
    expect(computeSharedAnswers([])).toEqual([]);
  });
});
