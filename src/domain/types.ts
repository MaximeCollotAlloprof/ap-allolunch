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
  startedAt: Date;
  status: 'pending' | 'completed';
}

export interface MatchGroup {
  id: string;
  cycleId: string;
  employeeIds: EmployeeId[];
  calendarEventId?: string;
  createdAt: Date;
}
