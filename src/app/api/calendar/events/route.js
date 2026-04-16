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
  const normalized = (localEvents || []).map(e => ({
    id: e.id,
    summary: e.summary,
    start: { dateTime: e.start_time },
    end: { dateTime: e.end_time },
    _local: true,
    _synced: !!e.google_calendar_event_id,
  }));

  // 2. Google Calendar events (if connected)
  let googleEvents = [];
  const token = await getGoogleToken(ctx.adminClient);
  if (token) {
    try {
      const { listEvents } = await import("@/lib/google-calendar");
      googleEvents = await listEvents(token, start, end);
    } catch (e) {
      console.error("Google Calendar fetch error:", e?.message || e);
      // Continue without Google events
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

  return NextResponse.json([...normalized, ...filteredGoogle]);
}

// POST — create event locally, sync to Google if available
export async function POST(request) {
  const ctx = await getAdminContext();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { summary, date, start_time, end_time, tz_offset } = await request.json();
  if (!summary || !date || !start_time || !end_time) {
    return NextResponse.json({ error: "summary, date, start_time, and end_time are required" }, { status: 400 });
  }

  const offStr = buildTzOffset(tz_offset);
  const startISO = `${date}T${start_time}:00${offStr}`;
  const endISO = `${date}T${end_time}:00${offStr}`;

  // Save locally
  const { data: event, error } = await ctx.adminClient
    .from("events")
    .insert({ summary, date, start_time: startISO, end_time: endISO })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Try to sync to Google Calendar
  const token = await getGoogleToken(ctx.adminClient);
  if (token) {
    try {
      const { createEvent } = await import("@/lib/google-calendar");
      const gEvent = await createEvent(token, {
        summary,
        start: startISO,
        end: endISO,
        status: "confirmed",
      });
      // Store the Google event ID for dedup
      await ctx.adminClient
        .from("events")
        .update({ google_calendar_event_id: gEvent.id })
        .eq("id", event.id);
      event.google_calendar_event_id = gEvent.id;
    } catch (e) {
      console.error("Google Calendar sync error (event still saved locally):", e);
    }
  }

  return NextResponse.json({
    id: event.id,
    summary: event.summary,
    start: { dateTime: event.start_time },
    end: { dateTime: event.end_time },
    _local: true,
    _synced: !!event.google_calendar_event_id,
  });
}

// PATCH — update a local event
export async function PATCH(request) {
  const ctx = await getAdminContext();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { id, summary, date, start_time, end_time, tz_offset } = await request.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const offStr = buildTzOffset(tz_offset);
  const updates = { updated_at: new Date().toISOString() };
  if (summary) updates.summary = summary;
  if (date) updates.date = date;
  if (date && start_time) updates.start_time = `${date}T${start_time}:00${offStr}`;
  if (date && end_time) updates.end_time = `${date}T${end_time}:00${offStr}`;

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
        if (updates.start_time) gUpdates.start = { dateTime: updates.start_time };
        if (updates.end_time) gUpdates.end = { dateTime: updates.end_time };
        await updateEvent(token, event.google_calendar_event_id, gUpdates);
      } catch (e) {
        console.error("Google Calendar update sync error:", e);
      }
    }
  }

  return NextResponse.json({
    id: event.id,
    summary: event.summary,
    start: { dateTime: event.start_time },
    end: { dateTime: event.end_time },
    _local: true,
    _synced: !!event.google_calendar_event_id,
  });
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
        await deleteEvent(token, event.google_calendar_event_id);
      } catch (e) {
        console.error("Google Calendar delete sync error:", e);
      }
    }
  }

  return NextResponse.json({ success: true });
}
