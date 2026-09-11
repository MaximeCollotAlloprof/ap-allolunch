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
  musique: 'Musique',
  'films-series-culture-pop': 'Films, series et culture pop',
  'cuisine-gastronomie': 'Cuisine et gastronomie',
  'voyages-decouvertes': 'Voyages et decouvertes',
  'sports-activites': 'Sports et activites',
  'jeux-loisirs': 'Jeux et loisirs',
  'culture-curiosite': 'Culture et curiosite',
  'mode-de-vie-habitudes': 'Mode de vie et habitudes',
  'personnalite-facon-de-penser': 'Personnalite et facon de penser',
  'relations-vie-sociale': 'Relations et vie sociale',
  'humour-insolite': 'Humour et insolite',
  'preferences-would-you-rather': 'Preferences et "Would you rather?"',
};

const geminiResponseSchema = z.object({
  questions: z.array(
    z.object({
      category: z.string(),
      prompt: z.string().min(1),
      options: z
        .array(z.object({ id: z.string().min(1), label: z.string().min(1) }))
        .min(4)
        .max(6),
    }),
  ),
});

/**
 * Instructions de generation - voir docs/tickets.md lot 4. Le format de sortie demande a
 * Gemini reste du JSON structure (responseSchema ci-dessous), pas le format markdown
 * numerote qu'on donnerait a un humain: le reste des regles (ton, categories, qualite du
 * matching, controle qualite) est repris tel quel.
 */
const GENERATION_INSTRUCTIONS = [
  'Tu es un generateur de questions pour un programme de diners de jumelage entre',
  'collegues.\n\nOBJECTIF\nChaque semaine, tu dois generer un questionnaire de 12 questions',
  'permettant de decouvrir les affinites entre les participants et de creer des groupes',
  "de personnes qui auront de bonnes chances d'avoir des sujets de conversation communs.",
  "Les questions doivent permettre d'identifier des interets communs, des preferences",
  'personnelles, des traits de personnalite, des habitudes de vie, des experiences ou',
  'aspirations communes, et des sujets pouvant naturellement lancer une conversation.',
  "Le questionnaire doit etre agreable, leger, inclusif et amusant - ce n'est PAS un test",
  'de personnalite ni une evaluation professionnelle.',
  '\n\nCATEGORIES\nGenere exactement une question dans chacune des categories demandees',
  "(fournies separement), dans l'ordre donne. Chaque question doit appartenir clairement",
  'a sa categorie.',
  '\n\nREGLES DE GENERATION',
  '1. Reponses a choix multiples: chaque question propose entre 4 et 6 reponses,',
  'suffisamment differentes pour distinguer les preferences des participants. Evite les',
  'reponses trop vagues ("Ca depend", "Autre", "Je ne sais pas") comme reponse',
  "principale permettant d'eviter systematiquement la question.",
  '2. Questions faciles et rapides: on doit pouvoir repondre immediatement, sans',
  'reflexion prolongee. Evite les questions necessitant des connaissances particulieres,',
  'trop personnelles, politiques, religieuses, financieres, sur la sante, ou pouvant',
  'creer un malaise au travail ou reveler des informations sensibles.',
  '3. Favoriser les conversations: une question ne doit pas seulement reveler si deux',
  'personnes ont exactement la meme reponse - elle doit permettre a deux personnes avec',
  "des reponses differentes d'avoir tout de meme un sujet de conversation interessant.",
  'Exemple moins bon: "Quelle est ta couleur preferee ?". Exemple meilleur: "Pour une',
  'journee de conge parfaite, tu choisis plutot: une journee a la plage / une randonnee',
  'en nature / une visite de ville / une journee tranquille a la maison / une activite',
  'avec des amis" - cette deuxieme question fournit davantage de matiere a discuter.',
  '4. Varier les formats: alterne entre preference, choix entre deux options, choix de',
  'scenario, situation hypothetique, souvenir, habitude, opinion legere, "tu preferes...",',
  'classement, choix de style de vie - ne genere pas systematiquement le meme type de',
  'question.',
  '5. Varier la difficulte et le niveau de reflexion sur les 12 questions: environ 4',
  'questions tres faciles et instinctives, 4 questions qui revelent des gouts ou',
  'habitudes, 2 questions qui revelent la personnalite, 2 questions plus originales ou',
  'amusantes.',
  '6. Ton: chaleureux, leger, positif, naturel, inclusif, legerement ludique - comme des',
  "questions qu'on poserait naturellement a un collegue pendant un diner. Evite un ton",
  'corporatif, psychologique ou scolaire.',
  '7. Contexte professionnel: les participants sont des collegues qui ne se connaissent',
  'pas necessairement bien - les questions doivent etre suffisamment personnelles pour',
  'creer des affinites, mais confortables a poser entre collegues. Evite les sujets',
  "susceptibles de provoquer des conflits ou de mettre quelqu'un mal a l'aise.",
  '8. Qualite du matching: les choix de reponse doivent representer des preferences ou',
  'des comportements plutot que de simples objets precis. Exemple moins bon (voyage):',
  'Montreal / Toronto / Paris / New York. Exemple meilleur: decouvrir une grande ville /',
  'me detendre sur une plage / explorer la nature / faire un road trip / decouvrir la',
  'gastronomie locale.',
  '\n\nRepond entierement en francais. Avant de repondre, verifie silencieusement que:',
  'il y a exactement une question par categorie demandee; chaque question a entre 4 et 6',
  "reponses; aucune question n'est trop personnelle ou sensible; les reponses permettent",
  'reellement de distinguer les participants; plusieurs questions peuvent lancer une',
  "conversation meme entre des participants aux reponses differentes; l'ensemble est",
  'equilibre entre gouts, personnalite, habitudes et questions amusantes; aucune question',
  "ne ressemble a un test RH. Remplace toute question qui echoue a l'un de ces criteres",
  'avant de produire le resultat final.',
].join(' ');

export function createGeminiQuestionGenerator(apiKey: string): GeminiQuestionGenerator {
  const client = new GoogleGenAI({ apiKey });

  return {
    async generateWeeklyQuestions(categories) {
      const response = await client.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `${GENERATION_INSTRUCTIONS}\n\nCategories demandees, dans cet ordre: ${categories
                  .map((category) => CATEGORY_LABELS[category])
                  .join(', ')}.`,
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
                      minItems: '4',
                      maxItems: '6',
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
