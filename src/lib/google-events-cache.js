// Google Calendar event cache — serves events from the DB when fresh,
// fetches from Google and updates the cache when stale.
import { retryWithBackoff, recordAlert } from "./alert.js";
//
// TTL: CACHE_TTL_MS (5 min). On stale read, we update the cache synchronously
// (same request) so the next caller gets fast data. The slow path only triggers
// once per TTL window.

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// How far ahead to cache (covers all schedule/portal-home use cases)
const CACHE_DAYS_AHEAD = 90;

// Return a YYYY-MM-DD string N days from today
function daysFromToday(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
}

// Convert a cached row back to the shape listEvents() returns so callers
// can treat cached and live events identically.
function rowToEvent(row) {
  const ev = {
    id: row.google_event_id,
    summary: row.summary,
    status: row.status,
    transparency: row.transparency,
    _type: row.event_type,
    _sourceCalendarId: row.source_calendar_id,
    _sourceCalendarName: row.source_calendar_name,
    _sourceCalendarPrimary: false,
  };
  if (row.is_all_day) {
    ev.start = { date: row.start_date };
    ev.end = { date: row.end_date };
  } else {
    ev.start = { dateTime: row.start_datetime };
    ev.end = { dateTime: row.end_datetime };
  }
  return ev;
}

// Convert a listEvents() event to a cache row for upsert.
function eventToRow(ev) {
  const isAllDay = !!(ev.start?.date && !ev.start?.dateTime);
  return {
    google_event_id: ev.id,
    summary: ev.summary || null,
    status: ev.status || null,
    transparency: ev.transparency || null,
    event_type: ev._type || null,
    is_all_day: isAllDay,
    start_date: isAllDay ? (ev.start.date || null) : null,
    end_date: isAllDay ? (ev.end?.date || null) : null,
    start_datetime: !isAllDay ? (ev.start?.dateTime || null) : null,
    end_datetime: !isAllDay ? (ev.end?.dateTime || null) : null,
    source_calendar_id: ev._sourceCalendarId || null,
    source_calendar_name: ev._sourceCalendarName || null,
    fetched_at: new Date().toISOString(),
  };
}

// Fetch events from Google, upsert into cache, return the raw event list.
async function refreshCache(supabase, token) {
  const cacheStart = daysFromToday(-1); // one day back for timezone safety
  const cacheEnd = daysFromToday(CACHE_DAYS_AHEAD);

  const { listEvents } = await import("./google-calendar.js");
  const onNewToken = async (newToken) => {
    const { error } = await supabase.from("settings").upsert({
      key: "google_refresh_token",
      value: newToken,
      updated_at: new Date().toISOString(),
    });
    if (error) await recordAlert(supabase, { category: "gcal_sync", action: "TOKEN_ROTATE", resource: "google_refresh_token", error: error.message });
  };

  const events = await listEvents(token, cacheStart, cacheEnd, onNewToken);

  // Only update the cache when Google returned events. An empty result most
  // likely means a transient per-calendar fetch failure (each calendar's error
  // is swallowed in listEvents and returns []). If we cleared the cache on an
  // empty result we'd serve "all times available" until the next successful
  // refresh — exactly the wrong behaviour for SP appointment blocking.
  if (events.length > 0) {
    const rows = events.map(eventToRow);
    await supabase
      .from("google_events_cache")
      .upsert(rows, { onConflict: "google_event_id" });

    // Delete stale rows: anything not touched by this upsert is gone from Google.
    const cutoff = new Date(Date.now() - 60 * 1000).toISOString(); // 60s grace
    await supabase
      .from("google_events_cache")
      .delete()
      .lt("fetched_at", cutoff);

    // Mark cache as fresh only on a successful non-empty refresh.
    await supabase.from("settings").upsert({
      key: "gcal_cache_fetched_at",
      value: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  return events;
}

// Main export: returns Google Calendar events for [startDate, endDate].
// Serves from DB cache when fresh; refreshes from Google when stale.
// Falls back to empty array on any failure — callers must handle gracefully.
export async function getGoogleEvents(supabase, startDate, endDate) {
  try {
    // Check cache freshness
    const { data: cacheRow } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "gcal_cache_fetched_at")
      .maybeSingle();

    const lastFetched = cacheRow?.value ? new Date(cacheRow.value).getTime() : 0;
    const isFresh = Date.now() - lastFetched < CACHE_TTL_MS;

    // Get Google token (needed for refresh)
    const { data: tokenRow } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "google_refresh_token")
      .maybeSingle();
    const token = tokenRow?.value || null;

    if (!token) return []; // Google not connected

    if (!isFresh) {
      // Synchronous refresh — slow path, updates cache for next callers
      const events = await retryWithBackoff(() => refreshCache(supabase, token));
      // Filter to requested range from the fresh list
      return filterToRange(events, startDate, endDate);
    }

    // Fast path: serve from DB cache. Cache is small (≤90 days, < 200 rows),
    // so fetching all and filtering in JS is simpler than a complex OR filter.
    const { data: rows } = await supabase
      .from("google_events_cache")
      .select("*");

    const allEvents = (rows || []).map(rowToEvent);
    return filterToRange(allEvents, startDate, endDate);
  } catch (e) {
    console.error("[gcal-cache] getGoogleEvents failed, falling back to empty:", e?.message || e);
    await recordAlert(supabase, { category: "gcal_sync", action: "getGoogleEvents", resource: "gcal-cache", error: e?.message || String(e) });
    return [];
  }
}

const BUSINESS_TZ = "America/New_York";

// Filter a raw event list to those that overlap [startDate, endDate].
// Compares dates in business timezone so events after 8 PM ET don't
// shift into the next UTC calendar day.
function filterToRange(events, startDate, endDate) {
  return events.filter(ev => {
    if (ev.start?.date) {
      return ev.start.date <= endDate && (ev.end?.date || ev.start.date) >= startDate;
    }
    if (ev.start?.dateTime) {
      const startInET = new Date(ev.start.dateTime).toLocaleDateString("en-CA", { timeZone: BUSINESS_TZ });
      const endInET = ev.end?.dateTime
        ? new Date(ev.end.dateTime).toLocaleDateString("en-CA", { timeZone: BUSINESS_TZ })
        : startInET;
      return startInET <= endDate && endInET >= startDate;
    }
    return false;
  });
}
