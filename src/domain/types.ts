export type EmployeeId = string;

export type InterestTag =
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

export type EmployeeStatus = 'active' | 'paused';

export type DayOfWeek = 'lundi' | 'mardi' | 'mercredi' | 'jeudi' | 'vendredi';

export interface EmployeeProfile {
  id: EmployeeId;
  displayName: string;
  status: EmployeeStatus;
  interestTags: InterestTag[];
  availableDays: DayOfWeek[];
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
