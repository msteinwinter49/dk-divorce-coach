import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

// Convert browser's getTimezoneOffset() to an ISO offset string like "-04:00"
function buildTzOffset(tz_offset) {
  const off = typeof tz_offset === "number" ? tz_offset : 0;
  const h = String(Math.floor(Math.abs(off) / 60)).padStart(2, "0");
  const m = String(Math.abs(off) % 60).padStart(2, "0");
  return (off <= 0 ? "+" : "-") + h + ":" + m;
}

async function getAdminContext() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll() { return cookieStore.getAll(); } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", status: 401 };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return { error: "Admin access required", status: 403 };
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  return { user, adminClient };
}

async function getGoogleToken(adminClient) {
  const { data } = await adminClient
    .from("settings")
    .select("value")
    .eq("key", "google_refresh_token")
    .single();
  return data?.value || null;
}

// Build a token-rotation saver to pass into gcal library functions.
// When googleapis refreshes an access token, Google sometimes issues a new
// refresh token too. This persists it so the old one isn't used on the next call.
function makeSaveToken(adminClient) {
  return async (newRefreshToken) => {
    await adminClient.from("settings").upsert({
      key: "google_refresh_token",
      value: newRefreshToken,
      updated_at: new Date().toISOString(),
    });
  };
}

function isAuthError(e) {
  const status = e?.response?.status || e?.status || e?.code;
  const msg = e?.message || "";
  return status === 401 || status === 403 ||
    msg.includes("invalid_grant") ||
    msg.includes("Token has been expired") ||
    msg.includes("Invalid Credentials");
}

// GET — fetch local events + Google Calendar events (if connected)
export async function GET(request) {
  const ctx = await getAdminContext();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  if (!start || !end) return NextResponse.json({ error: "start and end required" }, { status: 400 });

  const startISO = new Date(`${start}T00:00:00`).toISOString();
  const endISO = new Date(`${end}T23:59:59`).toISOString();

  // 1. Local events from Supabase
  const { data: localEvents } = await ctx.adminClient
    .from("events")
    .select("*")
    .gte("start_time", startISO)
    .lte("start_time", endISO)
    .order("start_time");

  // Normalize local events to Google Calendar event shape for the frontend
  const normalized = (localEvents || []).map(e => {
    if (e.all_day) {
      const endDate = new Date(e.end_time).toISOString().slice(0, 10);
      return { id: e.id, summary: e.summary, start: { date: e.date }, end: { date: endDate }, _local: true, _type: "personal", _synced: !!e.google_calendar_event_id };
    }
    return { id: e.id, summary: e.summary, start: { dateTime: e.start_time }, end: { dateTime: e.end_time }, _local: true, _type: "personal", _synced: !!e.google_calendar_event_id };
  });

  // 2. Google Calendar events (if connected) — served from cache when fresh
  let googleEvents = [];
  let googleDisconnected = false;
  const token = await getGoogleToken(ctx.adminClient);
  if (token) {
    try {
      const { getGoogleEvents } = await import("@/lib/google-events-cache");
      googleEvents = await getGoogleEvents(ctx.adminClient, start, end);
    } catch (e) {
      console.error("Google Calendar fetch error:", e?.message || e);
      if (isAuthError(e)) {
        // Clear the stored token so Settings shows "Disconnected" and the admin
        // knows to reconnect rather than seeing silently empty SP sessions.
        await ctx.adminClient.from("settings").upsert({
          key: "google_refresh_token",
          value: null,
          updated_at: new Date().toISOString(),
        });
        googleDisconnected = true;
      }
    }
  }

  // Deduplicate: remove Google events that have a local counterpart so AdminSchedule
  // doesn't render each coaching booking twice (once as a booking chip, once as a
  // Google event chip classified as "coaching" by summary prefix).
  // Pull synced ids from both events (Diana's personal blocks) and bookings (9c).
  const { data: syncedBookings } = await ctx.adminClient
    .from("bookings")
    .select("google_calendar_event_id")
    .not("google_calendar_event_id", "is", null)
    .in("status", ["requested", "booked"])
    .gte("start_time", startISO)
    .lte("start_time", endISO);

  const syncedGoogleIds = new Set();
  for (const e of localEvents || []) {
    if (e.google_calendar_event_id) syncedGoogleIds.add(e.google_calendar_event_id);
  }
  for (const b of syncedBookings || []) {
    if (b.google_calendar_event_id) syncedGoogleIds.add(b.google_calendar_event_id);
  }
  const filteredGoogle = googleEvents.filter(e => !syncedGoogleIds.has(e.id));

  return NextResponse.json({
    events: [...normalized, ...filteredGoogle],
    ...(googleDisconnected && { _googleDisconnected: true }),
  });
}

function addDaysToDate(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// POST — create event locally, sync to Google if available
export async function POST(request) {
  const ctx = await getAdminContext();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { summary, date, start_time, end_time, tz_offset, all_day, days } = await request.json();
  if (!summary || !date) {
    return NextResponse.json({ error: "summary and date are required" }, { status: 400 });
  }
  if (!all_day && (!start_time || !end_time)) {
    return NextResponse.json({ error: "start_time and end_time are required for timed events" }, { status: 400 });
  }

  let startISO, endISO, endDateExclusive;
  if (all_day) {
    const numDays = Math.max(1, parseInt(days) || 1);
    endDateExclusive = addDaysToDate(date, numDays);
    startISO = `${date}T00:00:00Z`;
    endISO = `${endDateExclusive}T00:00:00Z`;
  } else {
    const offStr = buildTzOffset(tz_offset);
    startISO = `${date}T${start_time}:00${offStr}`;
    endISO = `${date}T${end_time}:00${offStr}`;
  }

  // Save locally
  const { data: event, error } = await ctx.adminClient
    .from("events")
    .insert({ summary, date, start_time: startISO, end_time: endISO, all_day: !!all_day })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Try to sync to Google Calendar
  const token = await getGoogleToken(ctx.adminClient);
  if (token) {
    try {
      const { createEvent } = await import("@/lib/google-calendar");
      const gEvent = await createEvent(token, all_day
        ? { summary, all_day: true, start_date: date, end_date_exclusive: endDateExclusive, status: "confirmed" }
        : { summary, start: startISO, end: endISO, status: "confirmed" },
        makeSaveToken(ctx.adminClient)
      );
      await ctx.adminClient
        .from("events")
        .update({ google_calendar_event_id: gEvent.id })
        .eq("id", event.id);
      event.google_calendar_event_id = gEvent.id;
    } catch (e) {
      console.error("Google Calendar sync error (event still saved locally):", e);
    }
  }

  if (all_day) {
    return NextResponse.json({
      id: event.id,
      summary: event.summary,
      start: { date },
      end: { date: endDateExclusive },
      _local: true,
      _type: "personal",
      _synced: !!event.google_calendar_event_id,
    });
  }
  return NextResponse.json({
    id: event.id,
    summary: event.summary,
    start: { dateTime: event.start_time },
    end: { dateTime: event.end_time },
    _local: true,
    _type: "personal",
    _synced: !!event.google_calendar_event_id,
  });
}

// PATCH — update a local event
export async function PATCH(request) {
  const ctx = await getAdminContext();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { id, summary, date, start_time, end_time, tz_offset, all_day, days } = await request.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const updates = { updated_at: new Date().toISOString() };
  if (summary) updates.summary = summary;
  if (date) updates.date = date;

  let endDateExclusive;
  if (all_day && date) {
    const numDays = Math.max(1, parseInt(days) || 1);
    endDateExclusive = addDaysToDate(date, numDays);
    updates.start_time = `${date}T00:00:00Z`;
    updates.end_time = `${endDateExclusive}T00:00:00Z`;
    updates.all_day = true;
  } else if (!all_day && date && start_time && end_time) {
    const offStr = buildTzOffset(tz_offset);
    updates.start_time = `${date}T${start_time}:00${offStr}`;
    updates.end_time = `${date}T${end_time}:00${offStr}`;
    updates.all_day = false;
  }

  const { data: event, error } = await ctx.adminClient
    .from("events")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sync update to Google if connected
  if (event.google_calendar_event_id) {
    const token = await getGoogleToken(ctx.adminClient);
    if (token) {
      try {
        const { updateEvent } = await import("@/lib/google-calendar");
        const gUpdates = {};
        if (summary) gUpdates.summary = summary;
        if (all_day && date) {
          gUpdates.start = { date };
          gUpdates.end = { date: endDateExclusive };
        } else {
          if (updates.start_time) gUpdates.start = { dateTime: updates.start_time };
          if (updates.end_time) gUpdates.end = { dateTime: updates.end_time };
        }
        await updateEvent(token, event.google_calendar_event_id, gUpdates, makeSaveToken(ctx.adminClient));
      } catch (e) {
        console.error("Google Calendar update sync error:", e);
      }
    }
  }

  if (event.all_day) {
    const endDate = new Date(event.end_time).toISOString().slice(0, 10);
    return NextResponse.json({ id: event.id, summary: event.summary, start: { date: event.date }, end: { date: endDate }, _local: true, _type: "personal", _synced: !!event.google_calendar_event_id });
  }
  return NextResponse.json({ id: event.id, summary: event.summary, start: { dateTime: event.start_time }, end: { dateTime: event.end_time }, _local: true, _type: "personal", _synced: !!event.google_calendar_event_id });
}

// DELETE — delete a local event
export async function DELETE(request) {
  const ctx = await getAdminContext();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  // Get the event first to check for Google sync
  const { data: event } = await ctx.adminClient
    .from("events")
    .select("google_calendar_event_id")
    .eq("id", id)
    .single();

  const { error } = await ctx.adminClient
    .from("events")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Delete from Google Calendar if synced
  if (event?.google_calendar_event_id) {
    const token = await getGoogleToken(ctx.adminClient);
    if (token) {
      try {
        const { deleteEvent } = await import("@/lib/google-calendar");
        await deleteEvent(token, event.google_calendar_event_id, makeSaveToken(ctx.adminClient));
      } catch (e) {
        console.error("Google Calendar delete sync error:", e);
      }
    }
    // Evict from cache immediately so the deleted event doesn't re-appear
    // before the 5-min TTL expires (dedup relies on the local row being present).
    await ctx.adminClient
      .from("google_events_cache")
      .delete()
      .eq("google_event_id", event.google_calendar_event_id);
  }

  return NextResponse.json({ success: true });
}
