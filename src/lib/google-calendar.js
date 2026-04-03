import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/calendar"];

// Build OAuth2 client
export function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/calendar/callback`
  );
}

// Generate the URL Diana visits to authorize Google Calendar access
export function getAuthUrl() {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}

// Exchange authorization code for tokens, return them
export async function getTokensFromCode(code) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

// Get an authenticated calendar client using stored refresh token
export function getCalendarClient(refreshToken) {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return google.calendar({ version: "v3", auth: oauth2Client });
}

// List events in a date range
export async function listEvents(refreshToken, timeMin, timeMax, calendarId) {
  const calendar = getCalendarClient(refreshToken);
  const { data } = await calendar.events.list({
    calendarId: calendarId || process.env.GOOGLE_CALENDAR_ID,
    timeMin: new Date(timeMin).toISOString(),
    timeMax: new Date(timeMax).toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  });
  return data.items || [];
}

// Create an event (tentative for requests, confirmed for booked)
export async function createEvent(refreshToken, { summary, start, end, status }) {
  const calendar = getCalendarClient(refreshToken);
  const { data } = await calendar.events.insert({
    calendarId: process.env.GOOGLE_CALENDAR_ID,
    requestBody: {
      summary,
      start: { dateTime: new Date(start).toISOString() },
      end: { dateTime: new Date(end).toISOString() },
      status: status || "tentative",
    },
  });
  return data;
}

// Update an event (e.g. tentative → confirmed, or change details)
export async function updateEvent(refreshToken, eventId, updates) {
  const calendar = getCalendarClient(refreshToken);
  const { data } = await calendar.events.patch({
    calendarId: process.env.GOOGLE_CALENDAR_ID,
    eventId,
    requestBody: updates,
  });
  return data;
}

// Delete an event (on cancel/decline/expire)
export async function deleteEvent(refreshToken, eventId) {
  const calendar = getCalendarClient(refreshToken);
  await calendar.events.delete({
    calendarId: process.env.GOOGLE_CALENDAR_ID,
    eventId,
  });
}
