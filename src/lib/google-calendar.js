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

// List all calendars visible to the authenticated user (for debugging)
export async function listCalendars(refreshToken) {
  const calendar = getCalendarClient(refreshToken);
  const { data } = await calendar.calendarList.list();
  return data.items || [];
}

// List events in a date range across every calendar the account can see,
// except holiday calendars. Each event is tagged with its source calendar so
// the frontend can classify/color them correctly.
export async function listEvents(refreshToken, timeMin, timeMax) {
  const calendar = getCalendarClient(refreshToken);

  // 1. Discover all visible calendars (skip holidays)
  const { data: calList } = await calendar.calendarList.list();
  const calendars = (calList.items || []).filter(c => !c.id.includes("#holiday@"));

  // 2. Expand the time window by one day on each side so timezone edge cases
  //    (the frontend passes date-only strings that get interpreted as UTC
  //    midnight) don't clip events near the boundary.
  const wideMin = new Date(timeMin);
  wideMin.setUTCDate(wideMin.getUTCDate() - 1);
  const wideMax = new Date(timeMax);
  wideMax.setUTCDate(wideMax.getUTCDate() + 1);

  // 3. Fetch events from every calendar in parallel
  const results = await Promise.all(calendars.map(async (cal) => {
    try {
      const { data } = await calendar.events.list({
        calendarId: cal.id,
        timeMin: wideMin.toISOString(),
        timeMax: wideMax.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
      });
      return (data.items || []).map(ev => ({
        ...ev,
        _sourceCalendarId: cal.id,
        _sourceCalendarName: cal.summary,
        _sourceCalendarPrimary: !!cal.primary,
      }));
    } catch (e) {
      console.error(`[gcal] listEvents failed for calendar ${cal.id}:`, e?.message || e);
      return [];
    }
  }));

  return results.flat();
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
