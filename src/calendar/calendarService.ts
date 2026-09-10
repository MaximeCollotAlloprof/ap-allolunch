import { google } from 'googleapis';
import type { EmployeeId } from '../domain/types.js';

export interface CreateLunchEventInput {
  attendeeEmails: EmployeeId[];
  /** Jour propose, calcule a partir des disponibilites communes du groupe. */
  proposedDate: Date;
  /** Description de l'evenement (message de match + centres d'interet communs). */
  description: string;
}

export interface CalendarService {
  createLunchEvent(input: CreateLunchEventInput): Promise<{ eventId: string }>;
}

const LUNCH_HOUR = 12;
const LUNCH_DURATION_MINUTES = 60;

/**
 * Cree l'invitation via `googleapis` (calendar.events.insert) en utilisant un service
 * account avec delegation domain-wide (scope calendar.events), en impersonnant
 * `organizerEmail` (`CALENDAR_DELEGATED_SERVICE_ACCOUNT_EMAIL` - un des employes du
 * groupe, ou une boite partagee "AlloLunch"). Le service account qui execute ce code
 * (credentials par defaut de l'environnement, ex: Cloud Run) doit deja avoir ete autorise
 * pour ce scope dans la Google Workspace Admin Console - voir docs/tickets.md, lot 3.
 */
export function createGoogleCalendarService(organizerEmail: string): CalendarService {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/calendar.events'],
    clientOptions: { subject: organizerEmail },
  });
  const calendar = google.calendar({ version: 'v3', auth });

  return {
    async createLunchEvent({ attendeeEmails, proposedDate, description }) {
      const start = new Date(proposedDate);
      start.setHours(LUNCH_HOUR, 0, 0, 0);
      const end = new Date(start.getTime() + LUNCH_DURATION_MINUTES * 60_000);

      const response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary: 'Diner AlloLunch',
          description,
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
          attendees: attendeeEmails.map((email) => ({ email })),
        },
      });

      const eventId = response.data.id;
      if (!eventId) {
        throw new Error('Google Calendar API did not return an event id');
      }
      return { eventId };
    },
  };
}
