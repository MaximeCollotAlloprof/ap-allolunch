import type { WeeklyQuestion, WeeklyQuestionSet } from '../../src/domain/types.js';

/**
 * Jeu de questions de test - memes categories/libelles que l'ancien questionnaire
 * statique, pour garder les assertions de test lisibles. Les ids d'options sont des
 * chiffres 1-based (comme le numero affiche) pour que les tests restent simples a lire.
 */
export const TEST_QUESTIONS: WeeklyQuestion[] = [
  {
    category: 'cuisine',
    categoryLabel: 'Cuisine',
    prompt: 'Quel type de cuisine preferes-tu pour un diner ?',
    options: [
      { id: '1', label: 'Italienne' },
      { id: '2', label: 'Asiatique' },
      { id: '3', label: 'Mexicaine' },
    ],
  },
  {
    category: 'sport',
    categoryLabel: 'Sport',
    prompt: 'Quel sport te passionne le plus ?',
    options: [
      { id: '1', label: 'Hockey' },
      { id: '2', label: 'Soccer' },
      { id: '3', label: 'Course a pied' },
    ],
  },
  {
    category: 'voyage',
    categoryLabel: 'Voyage',
    prompt: 'Quel type de voyage te fait le plus rever ?',
    options: [
      { id: '1', label: 'Plage et detente' },
      { id: '2', label: 'Aventure / nature' },
    ],
  },
  {
    category: 'technologie',
    categoryLabel: 'Technologie',
    prompt: 'Quel domaine tech t’interesse le plus ?',
    options: [
      { id: '1', label: 'Intelligence artificielle' },
      { id: '2', label: 'Jeux et high-tech' },
    ],
  },
  {
    category: 'jeux-video',
    categoryLabel: 'Jeux video',
    prompt: 'Quel genre de jeu video preferes-tu ?',
    options: [
      { id: '1', label: 'Action / aventure' },
      { id: '2', label: 'RPG' },
    ],
  },
  {
    category: 'lecture',
    categoryLabel: 'Lecture',
    prompt: 'Quel genre de lecture preferes-tu ?',
    options: [
      { id: '1', label: 'Romans' },
      { id: '2', label: 'Polar / thriller' },
    ],
  },
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
    category: 'cinema',
    categoryLabel: 'Cinema',
    prompt: 'Quel genre de film preferes-tu ?',
    options: [
      { id: '1', label: 'Action' },
      { id: '2', label: 'Comedie' },
    ],
  },
  {
    category: 'plein-air',
    categoryLabel: 'Plein air',
    prompt: 'Quelle activite de plein air preferes-tu ?',
    options: [
      { id: '1', label: 'Randonnee' },
      { id: '2', label: 'Velo' },
    ],
  },
  {
    category: 'art-creatif',
    categoryLabel: 'Art creatif',
    prompt: 'Quelle activite creative te ressemble le plus ?',
    options: [
      { id: '1', label: 'Dessin / peinture' },
      { id: '2', label: 'Instrument de musique' },
    ],
  },
  {
    category: 'famille-enfants',
    categoryLabel: 'Famille et enfants',
    prompt: 'Qu’est-ce qui decrit le mieux ta situation ?',
    options: [
      { id: '1', label: 'Parent de jeunes enfants' },
      { id: '2', label: 'Pas d’enfants' },
    ],
  },
  {
    category: 'entrepreneuriat',
    categoryLabel: 'Entrepreneuriat',
    prompt: 'Quel aspect de l’entrepreneuriat t’interesse le plus ?',
    options: [
      { id: '1', label: 'Lancer une startup' },
      { id: '2', label: 'Innovation produit' },
    ],
  },
];

export const TEST_QUESTION_SET: WeeklyQuestionSet = {
  weekId: '2026-W38',
  status: 'ready',
  generatedAt: new Date('2026-09-14T08:00:00Z'),
  questions: TEST_QUESTIONS,
};
