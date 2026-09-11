import { describe, expect, it, vi } from 'vitest';
import type { InterestCategory } from '../../src/domain/types.js';

const generateContent = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: { generateContent },
  })),
  Type: { OBJECT: 'OBJECT', ARRAY: 'ARRAY', STRING: 'STRING' },
}));

const { createGeminiQuestionGenerator } = await import('../../src/ai/geminiQuestionGenerator.js');

const CATEGORIES: InterestCategory[] = ['cuisine-gastronomie', 'sports-activites'];

const CUISINE_OPTIONS = [
  { id: 'a', label: 'Escargots' },
  { id: 'b', label: 'Tartare' },
  { id: 'c', label: 'Fondue' },
  { id: 'd', label: 'Sushi' },
];

const SPORT_OPTIONS = [
  { id: 'a', label: 'Saut a l’elastique' },
  { id: 'b', label: 'Plongee' },
  { id: 'c', label: 'Escalade' },
  { id: 'd', label: 'Surf' },
];

function validGeminiResponse() {
  return {
    text: JSON.stringify({
      questions: [
        {
          category: 'cuisine-gastronomie',
          prompt: 'Quel plat mysterieux oserais-tu commander ?',
          options: CUISINE_OPTIONS,
        },
        {
          category: 'sports-activites',
          prompt: 'Quel sport extreme tenterais-tu ?',
          options: SPORT_OPTIONS,
        },
      ],
    }),
  };
}

describe('createGeminiQuestionGenerator', () => {
  it('retourne une WeeklyQuestion par categorie a partir d’une reponse valide', async () => {
    generateContent.mockResolvedValueOnce(validGeminiResponse());
    const generator = createGeminiQuestionGenerator('fake-key');

    const questions = await generator.generateWeeklyQuestions(CATEGORIES);

    expect(questions).toHaveLength(2);
    expect(questions[0]).toEqual({
      category: 'cuisine-gastronomie',
      categoryLabel: 'Cuisine et gastronomie',
      prompt: 'Quel plat mysterieux oserais-tu commander ?',
      options: CUISINE_OPTIONS,
    });
  });

  it('leve une exception si Gemini renvoie une reponse vide', async () => {
    generateContent.mockResolvedValueOnce({ text: undefined });
    const generator = createGeminiQuestionGenerator('fake-key');

    await expect(generator.generateWeeklyQuestions(CATEGORIES)).rejects.toThrow(/vide/);
  });

  it('leve une exception si le format ne respecte pas le schema attendu', async () => {
    generateContent.mockResolvedValueOnce({
      text: JSON.stringify({ questions: [{ category: 'cuisine-gastronomie' }] }), // prompt/options manquants
    });
    const generator = createGeminiQuestionGenerator('fake-key');

    await expect(generator.generateWeeklyQuestions(CATEGORIES)).rejects.toThrow(/invalide/);
  });

  it('leve une exception si une categorie a moins de 4 reponses', async () => {
    generateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        questions: [
          {
            category: 'cuisine-gastronomie',
            prompt: 'Quel plat ?',
            options: [
              { id: 'a', label: 'A' },
              { id: 'b', label: 'B' },
            ],
          },
          {
            category: 'sports-activites',
            prompt: 'Quel sport ?',
            options: SPORT_OPTIONS,
          },
        ],
      }),
    });
    const generator = createGeminiQuestionGenerator('fake-key');

    await expect(generator.generateWeeklyQuestions(CATEGORIES)).rejects.toThrow(/invalide/);
  });

  it('leve une exception si une categorie demandee est absente de la reponse', async () => {
    generateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        questions: [
          {
            category: 'cuisine-gastronomie',
            prompt: 'Quel plat ?',
            options: CUISINE_OPTIONS,
          },
          // "sports-activites" manquant
        ],
      }),
    });
    const generator = createGeminiQuestionGenerator('fake-key');

    await expect(generator.generateWeeklyQuestions(CATEGORIES)).rejects.toThrow(/sports-activites/);
  });

  it("propage l'erreur si l'appel a l'API echoue", async () => {
    generateContent.mockRejectedValueOnce(new Error('network down'));
    const generator = createGeminiQuestionGenerator('fake-key');

    await expect(generator.generateWeeklyQuestions(CATEGORIES)).rejects.toThrow('network down');
  });
});
