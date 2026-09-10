export type EmployeeId = string;

/**
 * Liste fermee des centres d'interet. Chaque categorie "large" (ex: `musique`) a des
 * tags "specifiques" associes (ex: `musique-rock`) proposes via le questionnaire
 * /interets - voir src/chat/interestsQuestionnaire.ts pour les questions/reponses et
 * l'association categorie -> tags specifiques.
 */
export type InterestTag =
  // Categories larges
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
  | 'entrepreneuriat'
  // cuisine
  | 'cuisine-italienne'
  | 'cuisine-asiatique'
  | 'cuisine-mexicaine'
  | 'cuisine-vegetarienne'
  | 'cuisine-quebecoise'
  | 'cuisine-street-food'
  // sport
  | 'sport-hockey'
  | 'sport-soccer'
  | 'sport-course'
  | 'sport-musculation'
  | 'sport-raquette'
  | 'sport-aquatique'
  // voyage
  | 'voyage-plage'
  | 'voyage-aventure'
  | 'voyage-grandes-villes'
  | 'voyage-road-trip'
  | 'voyage-sac-a-dos'
  | 'voyage-tout-inclus'
  // technologie
  | 'technologie-ia'
  | 'technologie-developpement'
  | 'technologie-gadgets'
  | 'technologie-cybersecurite'
  | 'technologie-jeux-high-tech'
  // jeux-video
  | 'jeux-video-action-aventure'
  | 'jeux-video-strategie'
  | 'jeux-video-rpg'
  | 'jeux-video-sport-course'
  | 'jeux-video-multijoueur'
  | 'jeux-video-mobile'
  // lecture
  | 'lecture-romans'
  | 'lecture-essais'
  | 'lecture-science-fiction'
  | 'lecture-polar'
  | 'lecture-bd'
  | 'lecture-developpement-personnel'
  // musique
  | 'musique-rock'
  | 'musique-pop'
  | 'musique-rap'
  | 'musique-electro'
  | 'musique-jazz'
  | 'musique-classique'
  // cinema
  | 'cinema-action'
  | 'cinema-comedie'
  | 'cinema-drame'
  | 'cinema-horreur'
  | 'cinema-science-fiction'
  | 'cinema-documentaire'
  // plein-air
  | 'plein-air-randonnee'
  | 'plein-air-velo'
  | 'plein-air-camping'
  | 'plein-air-sports-hiver'
  | 'plein-air-jardinage'
  | 'plein-air-peche-chasse'
  // art-creatif
  | 'art-creatif-dessin'
  | 'art-creatif-photographie'
  | 'art-creatif-instrument'
  | 'art-creatif-ecriture'
  | 'art-creatif-artisanat'
  | 'art-creatif-danse'
  // famille-enfants
  | 'famille-enfants-jeunes-enfants'
  | 'famille-enfants-ados'
  | 'famille-enfants-futur-parent'
  | 'famille-enfants-activites-familiales'
  | 'famille-enfants-sans-enfants'
  // entrepreneuriat
  | 'entrepreneuriat-startup'
  | 'entrepreneuriat-investissement'
  | 'entrepreneuriat-freelance'
  | 'entrepreneuriat-leadership'
  | 'entrepreneuriat-innovation';

export type EmployeeStatus = 'active' | 'paused';

export type DayOfWeek = 'lundi' | 'mardi' | 'mercredi' | 'jeudi' | 'vendredi';

export interface EmployeeProfile {
  id: EmployeeId;
  displayName: string;
  status: EmployeeStatus;
  interestTags: InterestTag[];
  availableDays: DayOfWeek[];
  /**
   * true entre deux messages tant que l'employe est au milieu du questionnaire
   * /interets (voir src/chat/interestsQuestionnaire.ts) - permet d'interpreter un
   * message texte brut (ex: "2") comme une reponse plutot que comme une commande
   * inconnue, et de reprendre le questionnaire a la bonne question plus tard.
   */
  interestsQuestionnaireActive: boolean;
  /**
   * Nom de la ressource Chat (`spaces/xxx`) du DM avec l'employe, capture lors de
   * /rejoindre. Necessaire pour lui envoyer un message proactif (notification de match)
   * qui n'est pas une reponse synchrone a une requete entrante - voir src/chat/chatNotifier.ts.
   */
  chatSpaceName?: string;
  /**
   * Categorie ciblee par /interets modifier <numero> - le prochain message texte brut
   * (numero de choix, ou 0 pour annuler) modifie cette categorie precise plutot que la
   * prochaine question sans reponse. `| undefined` explicite pour pouvoir l'effacer une
   * fois la modification faite ou annulee (cf. exactOptionalPropertyTypes).
   */
  interestsEditingCategory?: InterestTag | undefined;
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
