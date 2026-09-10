import type { InterestTag } from '../domain/types.js';

export interface InterestQuestionOption {
  tag: InterestTag;
  label: string;
}

export interface InterestQuestion {
  /** Tag "large" de la categorie, ajoute au profil en plus du tag specifique choisi. */
  category: InterestTag;
  categoryLabel: string;
  prompt: string;
  options: readonly InterestQuestionOption[];
}

/**
 * Une question par categorie de InterestTag, dans l'ordre ou elles sont posees. Chaque
 * reponse ajoute au profil a la fois le tag "large" (`category`) et le tag "specifique"
 * choisi, pour permettre un matching a deux niveaux de granularite.
 */
export const INTEREST_QUESTIONS: readonly InterestQuestion[] = [
  {
    category: 'cuisine',
    categoryLabel: 'Cuisine',
    prompt: 'Quel type de cuisine preferes-tu pour un diner ?',
    options: [
      { tag: 'cuisine-italienne', label: 'Italienne' },
      { tag: 'cuisine-asiatique', label: 'Asiatique' },
      { tag: 'cuisine-mexicaine', label: 'Mexicaine' },
      { tag: 'cuisine-vegetarienne', label: 'Vegetarienne' },
      { tag: 'cuisine-quebecoise', label: 'Quebecoise' },
      { tag: 'cuisine-street-food', label: 'Street food' },
    ],
  },
  {
    category: 'sport',
    categoryLabel: 'Sport',
    prompt: 'Quel sport te passionne le plus ?',
    options: [
      { tag: 'sport-hockey', label: 'Hockey' },
      { tag: 'sport-soccer', label: 'Soccer' },
      { tag: 'sport-course', label: 'Course a pied' },
      { tag: 'sport-musculation', label: 'Musculation / gym' },
      { tag: 'sport-raquette', label: 'Sports de raquette' },
      { tag: 'sport-aquatique', label: 'Sports aquatiques' },
    ],
  },
  {
    category: 'voyage',
    categoryLabel: 'Voyage',
    prompt: 'Quel type de voyage te fait le plus rever ?',
    options: [
      { tag: 'voyage-plage', label: 'Plage et detente' },
      { tag: 'voyage-aventure', label: 'Aventure / nature' },
      { tag: 'voyage-grandes-villes', label: 'Grandes villes' },
      { tag: 'voyage-road-trip', label: 'Road trip' },
      { tag: 'voyage-sac-a-dos', label: 'Sac a dos' },
      { tag: 'voyage-tout-inclus', label: 'Tout inclus' },
    ],
  },
  {
    category: 'technologie',
    categoryLabel: 'Technologie',
    prompt: 'Quel domaine tech t’interesse le plus ?',
    options: [
      { tag: 'technologie-ia', label: 'Intelligence artificielle' },
      { tag: 'technologie-developpement', label: 'Developpement logiciel' },
      { tag: 'technologie-gadgets', label: 'Gadgets et electronique' },
      { tag: 'technologie-cybersecurite', label: 'Cybersecurite' },
      { tag: 'technologie-jeux-high-tech', label: 'Jeux et high-tech' },
    ],
  },
  {
    category: 'jeux-video',
    categoryLabel: 'Jeux video',
    prompt: 'Quel genre de jeu video preferes-tu ?',
    options: [
      { tag: 'jeux-video-action-aventure', label: 'Action / aventure' },
      { tag: 'jeux-video-strategie', label: 'Strategie' },
      { tag: 'jeux-video-rpg', label: 'RPG' },
      { tag: 'jeux-video-sport-course', label: 'Sport / course' },
      { tag: 'jeux-video-multijoueur', label: 'Multijoueur' },
      { tag: 'jeux-video-mobile', label: 'Mobile' },
    ],
  },
  {
    category: 'lecture',
    categoryLabel: 'Lecture',
    prompt: 'Quel genre de lecture preferes-tu ?',
    options: [
      { tag: 'lecture-romans', label: 'Romans' },
      { tag: 'lecture-essais', label: 'Essais / documentaires' },
      { tag: 'lecture-science-fiction', label: 'Science-fiction' },
      { tag: 'lecture-polar', label: 'Polar / thriller' },
      { tag: 'lecture-bd', label: 'Bandes dessinees' },
      { tag: 'lecture-developpement-personnel', label: 'Developpement personnel' },
    ],
  },
  {
    category: 'musique',
    categoryLabel: 'Musique',
    prompt: 'Quel est ton style de musique prefere ?',
    options: [
      { tag: 'musique-rock', label: 'Rock' },
      { tag: 'musique-pop', label: 'Pop' },
      { tag: 'musique-rap', label: 'Rap / hip-hop' },
      { tag: 'musique-electro', label: 'Electro' },
      { tag: 'musique-jazz', label: 'Jazz / blues' },
      { tag: 'musique-classique', label: 'Classique' },
    ],
  },
  {
    category: 'cinema',
    categoryLabel: 'Cinema',
    prompt: 'Quel genre de film preferes-tu ?',
    options: [
      { tag: 'cinema-action', label: 'Action' },
      { tag: 'cinema-comedie', label: 'Comedie' },
      { tag: 'cinema-drame', label: 'Drame' },
      { tag: 'cinema-horreur', label: 'Horreur / thriller' },
      { tag: 'cinema-science-fiction', label: 'Science-fiction' },
      { tag: 'cinema-documentaire', label: 'Documentaire' },
    ],
  },
  {
    category: 'plein-air',
    categoryLabel: 'Plein air',
    prompt: 'Quelle activite de plein air preferes-tu ?',
    options: [
      { tag: 'plein-air-randonnee', label: 'Randonnee' },
      { tag: 'plein-air-velo', label: 'Velo' },
      { tag: 'plein-air-camping', label: 'Camping' },
      { tag: 'plein-air-sports-hiver', label: 'Sports d’hiver' },
      { tag: 'plein-air-jardinage', label: 'Jardinage' },
      { tag: 'plein-air-peche-chasse', label: 'Peche / chasse' },
    ],
  },
  {
    category: 'art-creatif',
    categoryLabel: 'Art creatif',
    prompt: 'Quelle activite creative te ressemble le plus ?',
    options: [
      { tag: 'art-creatif-dessin', label: 'Dessin / peinture' },
      { tag: 'art-creatif-photographie', label: 'Photographie' },
      { tag: 'art-creatif-instrument', label: 'Instrument de musique' },
      { tag: 'art-creatif-ecriture', label: 'Ecriture' },
      { tag: 'art-creatif-artisanat', label: 'Artisanat / DIY' },
      { tag: 'art-creatif-danse', label: 'Danse' },
    ],
  },
  {
    category: 'famille-enfants',
    categoryLabel: 'Famille et enfants',
    prompt: 'Qu’est-ce qui decrit le mieux ta situation ?',
    options: [
      { tag: 'famille-enfants-jeunes-enfants', label: 'Parent de jeunes enfants' },
      { tag: 'famille-enfants-ados', label: 'Parent d’ados' },
      { tag: 'famille-enfants-futur-parent', label: 'Futur parent' },
      { tag: 'famille-enfants-activites-familiales', label: 'Aime les activites familiales' },
      { tag: 'famille-enfants-sans-enfants', label: 'Pas d’enfants' },
    ],
  },
  {
    category: 'entrepreneuriat',
    categoryLabel: 'Entrepreneuriat',
    prompt: 'Quel aspect de l’entrepreneuriat t’interesse le plus ?',
    options: [
      { tag: 'entrepreneuriat-startup', label: 'Lancer une startup' },
      { tag: 'entrepreneuriat-investissement', label: 'Investissement' },
      { tag: 'entrepreneuriat-freelance', label: 'Freelance / side projects' },
      { tag: 'entrepreneuriat-leadership', label: 'Leadership / gestion' },
      { tag: 'entrepreneuriat-innovation', label: 'Innovation produit' },
    ],
  },
];

const TAG_LABELS: ReadonlyMap<InterestTag, string> = new Map(
  INTEREST_QUESTIONS.flatMap((question) => [
    [question.category, question.categoryLabel] as const,
    ...question.options.map((option) => [option.tag, option.label] as const),
  ]),
);

/** Premiere question dont aucune reponse n'a encore ete enregistree, ou undefined si complet. */
export function findNextQuestion(
  interestTags: readonly InterestTag[],
): InterestQuestion | undefined {
  const answered = new Set(interestTags);
  return INTEREST_QUESTIONS.find((question) => !question.options.some((o) => answered.has(o.tag)));
}

export function formatQuestionPrompt(question: InterestQuestion): string {
  const index = INTEREST_QUESTIONS.indexOf(question);
  const optionLines = question.options.map((option, i) => `${i + 1}. ${option.label}`).join('\n');
  return [
    `(Question ${index + 1}/${INTEREST_QUESTIONS.length}) ${question.prompt}`,
    optionLines,
    '0. Arreter (tu pourras reprendre plus tard avec /interets)',
  ].join('\n');
}

/**
 * Pour l'affichage du profil: n'affiche pas le tag "large" d'une categorie quand le
 * tag specifique correspondant est deja present (redondant), et traduit chaque tag en
 * libelle lisible.
 */
export function getDisplayInterestLabels(interestTags: readonly InterestTag[]): string[] {
  const tagSet = new Set(interestTags);
  const specificTagsByCategory = new Map(
    INTEREST_QUESTIONS.map((question) => [question.category, question.options.map((o) => o.tag)]),
  );

  return interestTags
    .filter((tag) => {
      const specifics = specificTagsByCategory.get(tag);
      return !specifics || !specifics.some((specific) => tagSet.has(specific));
    })
    .map((tag) => TAG_LABELS.get(tag) ?? tag);
}

export interface SharedInterestAnswer {
  categoryLabel: string;
  answerLabel: string;
}

/**
 * Pour chaque question du questionnaire, ne retient la categorie que si tous les
 * membres ont choisi exactement la meme reponse specifique (pas juste repondu a la
 * meme categorie avec des reponses differentes - ex: Sport/Soccer vs Sport/Raquette
 * n'est pas un point commun).
 */
export function computeSharedAnswers(
  membersInterestTags: readonly (readonly InterestTag[])[],
): SharedInterestAnswer[] {
  if (membersInterestTags.length === 0) return [];

  const shared: SharedInterestAnswer[] = [];
  for (const question of INTEREST_QUESTIONS) {
    const answers = membersInterestTags.map((tags) =>
      question.options.find((option) => tags.includes(option.tag)),
    );
    const [first, ...rest] = answers;
    if (first && rest.every((answer) => answer?.tag === first.tag)) {
      shared.push({ categoryLabel: question.categoryLabel, answerLabel: first.label });
    }
  }
  return shared;
}
