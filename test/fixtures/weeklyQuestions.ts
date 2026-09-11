import type { WeeklyQuestion, WeeklyQuestionSet } from '../../src/domain/types.js';

/**
 * Jeu de questions de test - memes 12 categories que le prompt Gemini reel (voir
 * src/ai/geminiQuestionGenerator.ts), avec des questions/libelles simplifies pour garder
 * les assertions de test lisibles. Les ids d'options sont des chiffres 1-based (comme le
 * numero affiche) pour que les tests restent simples a lire.
 */
export const TEST_QUESTIONS: WeeklyQuestion[] = [
  {
    category: 'musique',
    categoryLabel: 'Musique',
    prompt: 'Quel est ton style de musique prefere ?',
    options: [
      { id: '1', label: 'Rock' },
      { id: '2', label: 'Pop' },
    ],
  },
  {
    category: 'films-series-culture-pop',
    categoryLabel: 'Films, series et culture pop',
    prompt: 'Quel genre de film preferes-tu ?',
    options: [
      { id: '1', label: 'Action' },
      { id: '2', label: 'Comedie' },
    ],
  },
  {
    category: 'cuisine-gastronomie',
    categoryLabel: 'Cuisine et gastronomie',
    prompt: 'Quel type de cuisine preferes-tu pour un diner ?',
    options: [
      { id: '1', label: 'Italienne' },
      { id: '2', label: 'Asiatique' },
      { id: '3', label: 'Mexicaine' },
    ],
  },
  {
    category: 'voyages-decouvertes',
    categoryLabel: 'Voyages et decouvertes',
    prompt: 'Quel type de voyage te fait le plus rever ?',
    options: [
      { id: '1', label: 'Plage et detente' },
      { id: '2', label: 'Aventure / nature' },
    ],
  },
  {
    category: 'sports-activites',
    categoryLabel: 'Sports et activites',
    prompt: 'Quel sport te passionne le plus ?',
    options: [
      { id: '1', label: 'Hockey' },
      { id: '2', label: 'Soccer' },
      { id: '3', label: 'Course a pied' },
    ],
  },
  {
    category: 'jeux-loisirs',
    categoryLabel: 'Jeux et loisirs',
    prompt: 'Apres le travail, quel loisir te detend le plus ?',
    options: [
      { id: '1', label: 'Jeux video' },
      { id: '2', label: 'Jeux de societe' },
    ],
  },
  {
    category: 'culture-curiosite',
    categoryLabel: 'Culture et curiosite',
    prompt: "Si tu pouvais devenir expert instantanement d'un sujet, ce serait :",
    options: [
      { id: '1', label: 'Histoire' },
      { id: '2', label: 'Sciences' },
    ],
  },
  {
    category: 'mode-de-vie-habitudes',
    categoryLabel: 'Mode de vie et habitudes',
    prompt: 'Ton rituel du matin ideal, c’est :',
    options: [
      { id: '1', label: 'Cafe et silence' },
      { id: '2', label: 'Sport avant tout' },
    ],
  },
  {
    category: 'personnalite-facon-de-penser',
    categoryLabel: 'Personnalite et facon de penser',
    prompt: 'Face a un imprevu, tu es plutot du genre a :',
    options: [
      { id: '1', label: 'Planifier tout de suite' },
      { id: '2', label: 'Improviser' },
    ],
  },
  {
    category: 'relations-vie-sociale',
    categoryLabel: 'Relations et vie sociale',
    prompt: 'Ta soiree ideale entre amis, c’est :',
    options: [
      { id: '1', label: 'Souper a la maison' },
      { id: '2', label: 'Sortie animee' },
    ],
  },
  {
    category: 'humour-insolite',
    categoryLabel: 'Humour et insolite',
    prompt: 'Ton type d’humour prefere, c’est :',
    options: [
      { id: '1', label: 'Jeux de mots' },
      { id: '2', label: 'Humour absurde' },
    ],
  },
  {
    category: 'preferences-would-you-rather',
    categoryLabel: 'Preferences et "Would you rather?"',
    prompt: 'Tu preferes...',
    options: [
      { id: '1', label: 'Perdre le wifi une semaine' },
      { id: '2', label: 'Perdre le cafe une semaine' },
    ],
  },
];

export const TEST_QUESTION_SET: WeeklyQuestionSet = {
  weekId: '2026-W38',
  status: 'ready',
  generatedAt: new Date('2026-09-14T08:00:00Z'),
  questions: TEST_QUESTIONS,
};
