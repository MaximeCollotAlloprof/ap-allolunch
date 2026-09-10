import type { EmployeeId } from '../domain/types.js';

export interface CreateLunchEventInput {
  attendeeEmails: EmployeeId[];
  /** Jour propose, calcule a partir des disponibilites communes du groupe. */
  proposedDate: Date;
  matchGroupId: string;
}

export interface CalendarService {
  createLunchEvent(input: CreateLunchEventInput): Promise<{ eventId: string }>;
}

/**
 * A implementer avec `googleapis` (calendar.events.insert) en utilisant un service account
 * avec delegation domain-wide (sujet = un des employes du groupe, ou une boite "AlloLunch").
 * Voir docs/tickets.md - lot 3.
 */
export function createGoogleCalendarService(): CalendarService {
  return {
    createLunchEvent(): Promise<{ eventId: string }> {
      throw new Error(
        'createGoogleCalendarService: not implemented yet (lot 3 - integration Calendar)',
      );
    },
  };
}
