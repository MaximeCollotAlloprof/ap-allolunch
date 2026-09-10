import { describe, expect, it } from 'vitest';
import { buildAnswerId, computeSharedAnswers } from '../../src/chat/interestsQuestionnaire.js';
import { TEST_QUESTIONS } from '../fixtures/weeklyQuestions.js';

describe('computeSharedAnswers', () => {
  it('ne retient que les categories ou la reponse specifique est identique', () => {
    const alice = [buildAnswerId('musique', '1'), buildAnswerId('sport', '2')];
    const bob = [buildAnswerId('musique', '1'), buildAnswerId('sport', '3')];

    const shared = computeSharedAnswers(TEST_QUESTIONS, [alice, bob]);

    expect(shared).toEqual([{ categoryLabel: 'Musique', answerLabel: 'Rock' }]);
  });

  it('ignore une categorie ou un membre n’a pas encore repondu', () => {
    const alice = [buildAnswerId('musique', '1')];
    const bob: string[] = []; // pas encore de reponse

    expect(computeSharedAnswers(TEST_QUESTIONS, [alice, bob])).toEqual([]);
  });

  it('fonctionne pour un groupe de plus de deux personnes (tous doivent matcher)', () => {
    const alice = [buildAnswerId('cuisine', '1')];
    const bob = [buildAnswerId('cuisine', '1')];
    const carol = [buildAnswerId('cuisine', '3')];

    expect(computeSharedAnswers(TEST_QUESTIONS, [alice, bob, carol])).toEqual([]);
    expect(computeSharedAnswers(TEST_QUESTIONS, [alice, bob])).toEqual([
      { categoryLabel: 'Cuisine', answerLabel: 'Italienne' },
    ]);
  });

  it('retourne un tableau vide sans membres', () => {
    expect(computeSharedAnswers(TEST_QUESTIONS, [])).toEqual([]);
  });
});
