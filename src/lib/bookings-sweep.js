// Shared sweep that expires past-due unactioned requests and cleans up their
// Google Calendar events. Called from the daily cron and opportunistically
// from /api/bookings GET so cleanup runs at page-load cadence instead of
// waiting up to 24h for the next cron.
//
// Policy: a request expires ONLY when its start_time has passed. There is no
// creation-age TTL — Diana may not triage requests on a timely cadence, so
// old-but-future requests stay active. Surfacing them is handled by the
// admin-portal "unaddressed requests" banner, not by auto-expiry.

// Throttle opportunistic calls. No point sweeping more than once per minute.
const MIN_SWEEP_INTERVAL_MS = 60 * 1000;
let lastSweepAt = 0;

async function getGoogleToken(supabase) {
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "google_refresh_token")
    .single();
  return data?.value || null;
}

// Expire requests whose start_time has passed. For each expired row,
// best-effort delete its Google Calendar event. Returns { expired: number }.
export async function expireStaleRequests(supabase) {
  const now = new Date();

  // Find candidates before updating so we can delete their Google events
  // afterward (once the row is flipped to "expired", the UI won't show it
  // but we still need the stored event id to clean Google).
  const { data: candidates } = await supabase
    .from("bookings")
    .select("id, user_id, session_duration, google_calendar_event_id, start_time, created_at")
    .eq("status", "requested")
    .lt("start_time", now.toISOString());

  if (!candidates || candidates.length === 0) return { expired: 0 };

  const ids = candidates.map(c => c.id);
  await supabase
    .from("bookings")
    .update({ status: "expired" })
    .in("id", ids);

  // Refund the debited minutes for each expired request
  for (const c of candidates) {
    try {
      await supabase.rpc("apply_balance_delta", {
        p_client_id: c.user_id,
        p_delta_minutes: c.session_duration,
        p_source_type: "cancel",
        p_source_id: c.id,
        p_created_by: null,
      });
    } catch (e) {
      console.error(`[sweep] balance refund failed for booking ${c.id}:`, e?.message || e);
    }
  }

  // Best-effort Google cleanup. Load the token once and delete each event
  // whose id we have on file.
  const token = await getGoogleToken(supabase);
  if (token) {
    const toDelete = candidates.filter(c => c.google_calendar_event_id);
    if (toDelete.length > 0) {
      try {
        const { deleteEvent } = await import("@/lib/google-calendar");
        await Promise.all(toDelete.map(async (c) => {
          try {
            await deleteEvent(token, c.google_calendar_event_id);
            await supabase
              .from("bookings")
              .update({ google_calendar_event_id: null })
              .eq("id", c.id);
          } catch (e) {
            console.error(`[sweep] google delete failed for booking ${c.id}:`, e?.message || e);
          }
        }));
      } catch (e) {
        console.error("[sweep] google-calendar import failed:", e?.message || e);
      }
    }
  }

  return { expired: candidates.length };
}

// Opportunistic wrapper used by API reads. Throttled so every page load
// doesn't hammer the DB/Google.
export async function maybeExpireStaleRequests(supabase) {
  const now = Date.now();
  if (now - lastSweepAt < MIN_SWEEP_INTERVAL_MS) return { expired: 0, skipped: true };
  lastSweepAt = now;
  try {
    return await expireStaleRequests(supabase);
  } catch (e) {
    console.error("[sweep] opportunistic expire failed:", e?.message || e);
    return { expired: 0, error: true };
  }
}
