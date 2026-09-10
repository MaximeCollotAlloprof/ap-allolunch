import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import type { InterestCategory, WeeklyQuestion } from '../domain/types.js';

export interface GeminiQuestionGenerator {
  /**
   * Genere une question a choix multiples par categorie. Leve une exception si l'appel
   * echoue ou si la reponse ne respecte pas le format attendu - aucune tentative de
   * reparation automatique, l'appelant (src/scheduler/weeklyReset.ts) traite tout echec
   * comme une semaine sans AlloLunch.
   */
  generateWeeklyQuestions(categories: readonly InterestCategory[]): Promise<WeeklyQuestion[]>;
}

const CATEGORY_LABELS: Record<InterestCategory, string> = {
  cuisine: 'Cuisine',
  sport: 'Sport',
  voyage: 'Voyage',
  technologie: 'Technologie',
  'jeux-video': 'Jeux video',
  lecture: 'Lecture',
  musique: 'Musique',
  cinema: 'Cinema',
  'plein-air': 'Plein air',
  'art-creatif': 'Art creatif',
  'famille-enfants': 'Famille et enfants',
  entrepreneuriat: 'Entrepreneuriat',
};

const geminiResponseSchema = z.object({
  questions: z.array(
    z.object({
      category: z.string(),
      prompt: z.string().min(1),
      options: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) })).min(2),
    }),
  ),
});

export function createGeminiQuestionGenerator(apiKey: string): GeminiQuestionGenerator {
  const client = new GoogleGenAI({ apiKey });

  return {
    async generateWeeklyQuestions(categories) {
      const response = await client.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: [
                  'Genere une question a choix multiples originale et amusante pour chacune',
                  `des categories suivantes: ${categories.join(', ')}.`,
                  'Ces questions serviront a jumeler des collegues de bureau pour un diner -',
                  'elles doivent aider a decouvrir des affinites, pas juste evaluer un niveau.',
                  'Chaque question a entre 4 et 6 reponses possibles, courtes (2-5 mots),',
                  'variees et concretes. Reponds entierement en francais.',
                ].join(' '),
              },
            ],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            required: ['questions'],
            properties: {
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  required: ['category', 'prompt', 'options'],
                  properties: {
                    category: { type: Type.STRING, enum: [...categories] },
                    prompt: { type: Type.STRING },
                    options: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        required: ['id', 'label'],
                        properties: {
                          id: { type: Type.STRING },
                          label: { type: Type.STRING },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      const rawText = response.text;
      if (!rawText) {
        throw new Error('Gemini a renvoye une reponse vide');
      }

      const parsed = geminiResponseSchema.safeParse(JSON.parse(rawText));
      if (!parsed.success) {
        const details = parsed.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ');
        throw new Error(`Reponse Gemini invalide: ${details}`);
      }

      const byCategory = new Map(parsed.data.questions.map((q) => [q.category, q]));
      return categories.map((category) => {
        const question = byCategory.get(category);
        if (!question) {
          throw new Error(`Gemini n'a pas genere de question pour la categorie "${category}"`);
        }
        return {
          category,
          categoryLabel: CATEGORY_LABELS[category],
          prompt: question.prompt,
          options: question.options,
        };
      });
    },
  };
}
