export type EmployeeId = string;

/**
 * Les 12 categories larges de centres d'interet - fixes, ne changent jamais. Chaque
 * semaine, Gemini genere une question + des reponses a choix multiples POUR chacune de
 * ces categories (voir src/ai/geminiQuestionGenerator.ts) - les reponses elles-memes ne
 * sont plus une liste fermee en dur, contrairement aux categories.
 */
export type InterestCategory =
  | 'cuisine'
  | 'sport'
  | 'voyage'
  | 'technologie'
  | 'jeux-video'
  | 'lecture'
  | 'musique'
  | 'cinema'
  | 'plein-air'
  | 'art-creatif'
  | 'famille-enfants'
  | 'entrepreneuriat';

export const INTEREST_CATEGORIES: readonly InterestCategory[] = [
  'cuisine',
  'sport',
  'voyage',
  'technologie',
  'jeux-video',
  'lecture',
  'musique',
  'cinema',
  'plein-air',
  'art-creatif',
  'famille-enfants',
  'entrepreneuriat',
];

/** Une option de reponse a choix multiple pour une categorie, generee par Gemini. */
export interface WeeklyQuestionOption {
  id: string;
  label: string;
}

/** Question generee par Gemini pour une categorie, pour la semaine en cours. */
export interface WeeklyQuestion {
  category: InterestCategory;
  categoryLabel: string;
  prompt: string;
  options: WeeklyQuestionOption[];
}

/**
 * Jeu de questions de la semaine en cours - genere une fois par Gemini le lundi et
 * partage par tout le monde, pour que le matching reste fiable (tout le monde compare
 * les memes identifiants generes cette semaine-la). `status: 'paused'` signifie que la
 * generation Gemini a echoue ce lundi-la - aucun cycle n'a lieu cette semaine.
 */
export interface WeeklyQuestionSet {
  weekId: string;
  status: 'ready' | 'paused';
  generatedAt: Date;
  questions: WeeklyQuestion[];
}

export type EmployeeStatus = 'active' | 'paused';

export type DayOfWeek = 'lundi' | 'mardi' | 'mercredi' | 'jeudi' | 'vendredi';

export interface EmployeeProfile {
  id: EmployeeId;
  displayName: string;
  status: EmployeeStatus;
  /**
   * Reponses de l'employe pour la semaine en cours, sous la forme `${category}:${optionId}`
   * (ex: "musique:opt-3") - unique et comparable par egalite exacte sans dependre du
   * texte affiche, meme si celui-ci change chaque semaine. Efface chaque lundi.
   */
  interestAnswers: string[];
  /** Disponibilites pour la semaine en cours (redemandees chaque lundi). */
  availableDays: DayOfWeek[];
  /**
   * true entre deux messages tant que l'employe est au milieu du questionnaire
   * /interets (voir src/chat/interestsQuestionnaire.ts) - permet d'interpreter un
   * message texte brut (ex: "2") comme une reponse plutot que comme une commande
   * inconnue, et de reprendre le questionnaire a la bonne question plus tard.
   */
  interestsQuestionnaireActive: boolean;
  /**
   * true juste apres /rejoindre pour une nouvelle semaine (avant d'avoir donne ses
   * disponibilites) - le prochain message texte brut est interprete comme une liste de
   * jours plutot qu'une commande ou une reponse au questionnaire.
   */
  awaitingAvailability: boolean;
  /**
   * Nom de la ressource Chat (`spaces/xxx`) du DM avec l'employe, capture lors de
   * /rejoindre. Necessaire pour lui envoyer un message proactif (notification de match)
   * qui n'est pas une reponse synchrone a une requete entrante - voir src/chat/chatNotifier.ts.
   */
  chatSpaceName?: string;
  /**
   * Categorie ciblee par /interets modifier <numero> - le prochain message texte brut
   * (numero de choix, ou 0 pour annuler) modifie cette categorie precise plutot que la
   * prochaine question sans reponse.
   */
  interestsEditingCategory?: InterestCategory;
  /**
   * Categories "passees" en repondant 0 a une question du questionnaire /interets -
   * reproposees seulement une fois toutes les autres questions sans reponse traitees.
   * Ne participe jamais au matching (contrairement a interestAnswers) - sert
   * uniquement a ordonner le questionnaire.
   */
  interestsSkippedCategories?: InterestCategory[];
  createdAt: Date;
  updatedAt: Date;
}

export interface MatchCycle {
  id: string;
  /** Compteur sequentiel (1, 2, 3, ...) - permet de filtrer une fenetre de N cycles sans
   * dependre de `limit()` ni de `startedAt`. */
  cycleIndex: number;
  startedAt: Date;
  status: 'pending' | 'completed';
}

export interface MatchGroup {
  id: string;
  cycleId: string;
  /** Duplique MatchCycle.cycleIndex - evite un lookup supplementaire pour filtrer par
   * fenetre de cycles dans getRecentPairs. */
  cycleIndex: number;
  employeeIds: EmployeeId[];
  calendarEventId?: string;
  createdAt: Date;
}
