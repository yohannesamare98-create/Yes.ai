// backend/lib/googleCalendar.js
// ============================================================
// Books an appointment on a client's Google Calendar.
// DEMO MODE: if Google credentials are not set, this logs to the
// console and returns a fake event ID instead of calling the real API.
// ============================================================

import { google } from 'googleapis';

const DEMO_MODE = !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET;

function getAuthClient() {
  const credentials = JSON.parse(
    Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '', 'base64').toString('utf-8') || '{}'
  );
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/calendar']
  });
}

/**
 * @param {string} calendarId - from `clients.google_calendar_id` (often just the client's Google email)
 * @param {object} appointment - { service, appointment_time (ISO string), customer_name }
 */
export async function bookAppointment(calendarId, appointment) {
  if (DEMO_MODE) {
    const fakeEventId = `demo-event-${Date.now()}`;
    console.log('[googleCalendar:DEMO MODE] Would book event on', calendarId, appointment, '-> event id', fakeEventId);
    return { demo: true, eventId: fakeEventId };
  }

  const auth = getAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const start = new Date(appointment.appointment_time);
  const end = new Date(start.getTime() + 30 * 60 * 1000); // default 30-min slot

  const event = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: `${appointment.service || 'Appointment'} — ${appointment.customer_name || 'Customer'}`,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() }
    }
  });

  return { demo: false, eventId: event.data.id };
}
