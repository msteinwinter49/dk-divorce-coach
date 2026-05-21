import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/calendar"];

// Hard cap on any single Google Calendar API round-trip so a slow response
// can't stall an API route. Googleapis sets no default timeout; without this
// a hung request blocks the entire handler for up to the Vercel function limit.
const GCAL_TIMEOUT_MS = 8000;
function withTimeout(p, label = "gcal") {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout after ${GCAL_TIMEOUT_MS}ms`)), GCAL_TIMEOUT_MS);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

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

// Get an authenticated calendar client using stored refresh token.
// onNewToken(newRefreshToken) is called if Google rotates the refresh token
// during an access-token refresh so the caller can persist the new value.
export function getCalendarClient(refreshToken, onNewToken) {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  if (onNewToken) {
    oauth2Client.on("tokens", (tokens) => {
      if (tokens.refresh_token) {
        console.log("[gcal] Refresh token rotated, persisting new value");
        onNewToken(tokens.refresh_token).catch(e =>
          console.error("[gcal] Failed to persist rotated refresh token:", e)
        );
      }
    });
  }
  return google.calendar({ version: "v3", auth: oauth2Client });
}

// List all calendars visible to the authenticated user (for debugging)
export async function listCalendars(refreshToken, onNewToken) {
  const calendar = getCalendarClient(refreshToken, onNewToken);
  const { data } = await withTimeout(calendar.calendarList.list(), "calendarList.list");
  return data.items || [];
}

// List events in a date range across every calendar the account can see,
// except holiday calendars. Each event is tagged with its source calendar so
// the frontend can classify/color them correctly.
export async function listEvents(refreshToken, timeMin, timeMax, onNewToken) {
  const calendar = getCalendarClient(refreshToken, onNewToken);

  // 1. Discover all visible calendars (skip holidays)
  const { data: calList } = await withTimeout(calendar.calendarList.list(), "listEvents/calendarList");
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
      const { data } = await withTimeout(
        calendar.events.list({
          calendarId: cal.id,
          timeMin: wideMin.toISOString(),
          timeMax: wideMax.toISOString(),
          singleEvents: true,
          orderBy: "startTime",
        }),
        `listEvents/${cal.id}`
      );
      const isSP = (cal.summary || "").toLowerCase().includes("simplepractice");
      return (data.items || []).map(ev => ({
        ...ev,
        _sourceCalendarId: cal.id,
        _sourceCalendarName: cal.summary,
        _sourceCalendarPrimary: !!cal.primary,
        _type: isSP ? "sp" : "personal",
      }));
    } catch (e) {
      console.error(`[gcal] listEvents failed for calendar ${cal.id}:`, e?.message || e);
      return [];
    }
  }));

  return results.flat();
}

// Create an event (tentative for requests, confirmed for booked)
export async function createEvent(refreshToken, { summary, start, end, status }, onNewToken) {
  const calendar = getCalendarClient(refreshToken, onNewToken);
  const { data } = await withTimeout(
    calendar.events.insert({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      requestBody: {
        summary,
        start: { dateTime: new Date(start).toISOString() },
        end: { dateTime: new Date(end).toISOString() },
        status: status || "tentative",
      },
    }),
    "createEvent"
  );
  return data;
}

// Update an event (e.g. tentative → confirmed, or change details)
export async function updateEvent(refreshToken, eventId, updates, onNewToken) {
  const calendar = getCalendarClient(refreshToken, onNewToken);
  const { data } = await withTimeout(
    calendar.events.patch({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      eventId,
      requestBody: updates,
    }),
    "updateEvent"
  );
  return data;
}

// Delete an event (on cancel/decline/expire)
export async function deleteEvent(refreshToken, eventId, onNewToken) {
  const calendar = getCalendarClient(refreshToken, onNewToken);
  await withTimeout(
    calendar.events.delete({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      eventId,
    }),
    "deleteEvent"
  );
}

// Format a booking's Google Calendar description (multiline plain text)
function buildBookingDescription(booking, sessionType, status) {
  const lines = [];
  if (sessionType?.label) lines.push(`Session: ${sessionType.label}`);
  const duration = booking.session_duration ?? sessionType?.duration;
  if (duration) lines.push(`Duration: ${duration} min`);
  lines.push(`Status: ${status}`);
  lines.push("");
  lines.push("https://dkdivorcecoach.com/");
  return lines.join("\n");
}

function buildBookingSummary(groupName, attendeeCount, status) {
  const name = (groupName || "").trim() || "Client";
  const suffix = attendeeCount > 1 ? ` (${attendeeCount})` : "";
  const prefix = status === "tentative" ? "DKDC Request" : "DKDC Session";
  return `${prefix}: ${name}${suffix}`;
}

// Create or update the Google Calendar event for a booking.
// Returns the Google event object. Caller is responsible for persisting
// google_calendar_event_id back onto the booking row.
//
// status: "tentative" (requested) or "confirmed" (booked)
// sessionType may be passed separately (e.g. joined via session_types(...)),
// or as booking.session_types from the join.
export async function syncBookingToGoogle(refreshToken, booking, clientProfile, status, sessionType, onNewToken, groupName, attendeeCount) {
  if (!refreshToken) throw new Error("No Google refresh token");
  const calendar = getCalendarClient(refreshToken, onNewToken);
  const st = sessionType || booking.session_types || null;

  const requestBody = {
    summary: buildBookingSummary(groupName, attendeeCount || 1, status),
    description: buildBookingDescription(booking, st, status),
    start: { dateTime: new Date(booking.start_time).toISOString() },
    end: { dateTime: new Date(booking.end_time).toISOString() },
    status,
  };

  if (booking.google_calendar_event_id) {
    const { data } = await withTimeout(
      calendar.events.patch({
        calendarId: process.env.GOOGLE_CALENDAR_ID,
        eventId: booking.google_calendar_event_id,
        requestBody,
      }),
      "syncBookingToGoogle/patch"
    );
    return data;
  }

  const { data } = await withTimeout(
    calendar.events.insert({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      requestBody,
    }),
    "syncBookingToGoogle/insert"
  );
  return data;
}
