import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAvailableSlots, isSlotAvailable as checkSlotAvailable } from "@/lib/availability";
import { notifyAdmin, notifyClient, formatSessionDate, formatSessionTime, formatSessionDateTime } from "@/lib/notifications";
import { maybeExpireStaleRequests } from "@/lib/bookings-sweep";

// Convert browser's getTimezoneOffset() value to ISO offset string like "-04:00"
function buildTzOffset(tz_offset) {
  const off = typeof tz_offset === "number" ? tz_offset : 0;
  const h = String(Math.floor(Math.abs(off) / 60)).padStart(2, "0");
  const m = String(Math.abs(off) % 60).padStart(2, "0");
  return (off <= 0 ? "+" : "-") + h + ":" + m;
}

// Read Diana's stored Google OAuth refresh token. Returns null if not connected.
async function getGoogleToken(adminClient) {
  const { data } = await adminClient
    .from("settings")
    .select("value")
    .eq("key", "google_refresh_token")
    .single();
  return data?.value || null;
}

// Race a promise against a timeout so a slow/hanging Google API call can't
// stall the response. Rejects with "gcal timeout" if p doesn't settle in time.
function withTimeout(p, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

// Best-effort Google Calendar sync for a booking. Never throws — DB is truth.
// Bounded at 8s so the user's response never waits on a slow Google round-trip.
// action: "upsert" (create or patch) | "delete"
// On upsert, persists the returned event id back onto the booking row.
async function syncBookingGoogle(adminClient, booking, clientProfile, status, action = "upsert", sessionType = null) {
  try {
    const token = await getGoogleToken(adminClient);
    if (!token) return;

    if (action === "delete") {
      if (!booking.google_calendar_event_id) return;
      const { deleteEvent } = await import("@/lib/google-calendar");
      await withTimeout(deleteEvent(token, booking.google_calendar_event_id), 8000, "gcal delete");
      await adminClient
        .from("bookings")
        .update({ google_calendar_event_id: null })
        .eq("id", booking.id);
      return;
    }

    const { syncBookingToGoogle } = await import("@/lib/google-calendar");
    const gEvent = await withTimeout(
      syncBookingToGoogle(token, booking, clientProfile, status, sessionType),
      8000,
      "gcal upsert"
    );
    if (gEvent?.id && gEvent.id !== booking.google_calendar_event_id) {
      await adminClient
        .from("bookings")
        .update({ google_calendar_event_id: gEvent.id })
        .eq("id", booking.id);
    }
  } catch (e) {
    console.error(`[gcal] booking sync ${action} failed:`, e?.message || e);
  }
}

async function getAuthContext() {
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
    .select("role, first_name, last_name, preferred_email, phone, notification_preference, client_code")
    .eq("id", user.id)
    .single();

  return { user, profile, supabase };
}

// GET — list bookings
export async function GET(request) {
  const ctx = await getAuthContext();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Opportunistic cleanup: flip stale/past-due requests to expired and clear
  // their Google events so they don't hoard slots until the next daily cron.
  // Throttled internally — safe to call on every read.
  await maybeExpireStaleRequests(adminClient);

  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  const isAdmin = ctx.profile?.role === "admin";

  let query = adminClient
    .from("bookings")
    .select("*, session_types(label, duration)")
    .in("status", ["requested", "booked"])
    .order("start_time");

  // Clients see their own bookings plus group bookings they participate in
  if (!isAdmin) {
    query = query.or(`user_id.eq.${ctx.user.id},participant_ids.cs.{${ctx.user.id}}`);
  }

  if (start) query = query.gte("start_time", new Date(start).toISOString());
  if (end) query = query.lte("start_time", new Date(end + "T23:59:59").toISOString());

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Attach profile info — all user_ids plus all participant_ids
  if (data?.length > 0) {
    const allIds = new Set();
    data.forEach(b => {
      if (b.user_id) allIds.add(b.user_id);
      (b.participant_ids || []).forEach(id => allIds.add(id));
    });

    const { data: profiles } = await adminClient
      .from("profiles")
      .select(isAdmin
        ? "id, first_name, last_name, full_name, client_code, preferred_email, phone, notification_preference, stripe_customer_id"
        : "id, first_name, last_name, full_name")
      .in("id", [...allIds]);

    const profileMap = {};
    (profiles || []).forEach(p => { profileMap[p.id] = p; });
    data.forEach(b => {
      b.profiles = profileMap[b.user_id] || null;
      if (b.participant_ids?.length > 0) {
        b.participant_profiles = b.participant_ids.map(id => profileMap[id]).filter(Boolean);
      }
    });
  }

  return NextResponse.json(data);
}

// POST — client requests a booking
export async function POST(request) {
  const ctx = await getAuthContext();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { session_type_id, date, start_time, user_id: targetUserId, participant_ids: rawParticipantIds, force, tz_offset } = await request.json();
  if (!session_type_id || !date || !start_time) {
    return NextResponse.json({ error: "session_type_id, date, and start_time are required" }, { status: 400 });
  }

  const isAdmin = ctx.profile?.role === "admin";
  const isGroupBooking = Array.isArray(rawParticipantIds) && rawParticipantIds.length > 1;
  const storedParticipantIds = isGroupBooking ? rawParticipantIds : null;

  let bookingUserId;
  if (isAdmin) {
    bookingUserId = isGroupBooking ? rawParticipantIds[0] : (targetUserId || ctx.user.id);
  } else {
    bookingUserId = ctx.user.id;
    if (isGroupBooking && !rawParticipantIds.includes(ctx.user.id)) {
      return NextResponse.json({ error: "You must be included in the booking." }, { status: 400 });
    }
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Look up the client's group for all balance operations
  const { data: bookingMembership } = await adminClient
    .from("group_members")
    .select("group_id")
    .eq("client_id", bookingUserId)
    .maybeSingle();
  const bookingGroupId = bookingMembership?.group_id ?? null;

  // Block client requests when balance is already negative
  if (!isAdmin) {
    if (!bookingGroupId) {
      return NextResponse.json({ error: "No group assigned. Please contact your coach." }, { status: 402 });
    }
    const { data: groupBalance } = await adminClient
      .from("group_balances")
      .select("balance_minutes")
      .eq("group_id", bookingGroupId)
      .maybeSingle();
    const currentBalance = groupBalance?.balance_minutes ?? 0;
    if (currentBalance < 0) {
      return NextResponse.json({ error: "Your session balance is negative. Please purchase more sessions before requesting a session." }, { status: 402 });
    }
  }

  // Get session type details
  const { data: sessionType } = await adminClient
    .from("session_types")
    .select("*")
    .eq("id", session_type_id)
    .eq("is_active", true)
    .single();

  if (!sessionType) {
    return NextResponse.json({ error: "Invalid session type" }, { status: 400 });
  }

  // Check availability
  const slots = await getAvailableSlots(date, date);
  const { data: settings } = await adminClient
    .from("settings")
    .select("key, value")
    .eq("key", "scheduling_increment")
    .single();
  const increment = settings ? parseInt(settings.value) : 30;

  if (!checkSlotAvailable(slots, date, start_time, sessionType.duration, increment)) {
    if (!(isAdmin && force)) {
      return NextResponse.json({ error: "Time slot is not available" }, { status: 409 });
    }
  }

  // Calculate end time
  const [h, m] = start_time.split(":").map(Number);
  const endMinutes = h * 60 + m + sessionType.duration;
  const endH = Math.floor(endMinutes / 60);
  const endM = endMinutes % 60;
  const endTimeStr = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;

  const offStr = buildTzOffset(tz_offset);
  const startTimestamp = new Date(`${date}T${start_time}:00${offStr}`).toISOString();
  const endTimestamp = new Date(`${date}T${endTimeStr}:00${offStr}`).toISOString();

  // Create the booking
  // Admin booking on behalf of client goes straight to "booked"
  const bookingStatus = (isAdmin && (targetUserId || isGroupBooking)) ? "booked" : "requested";

  const { data: booking, error } = await adminClient
    .from("bookings")
    .insert({
      user_id: bookingUserId,
      date,
      time_slot: start_time,
      status: bookingStatus,
      start_time: startTimestamp,
      end_time: endTimestamp,
      session_type_id,
      session_duration: sessionType.duration,
      ...(storedParticipantIds ? { participant_ids: storedParticipantIds } : {}),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Debit the client's minute balance. Allowed to go negative — warn but don't block.
  const { data: ledgerRows } = await adminClient.rpc("apply_balance_delta", {
    p_group_id: bookingGroupId,
    p_delta_minutes: -sessionType.duration,
    p_source_type: "request",
    p_source_id: booking.id,
    p_created_by: ctx.user.id,
    p_actor_client_id: bookingUserId,
  });
  const balanceAfter = ledgerRows?.[0]?.balance_after ?? null;
  const lowBalance = balanceAfter != null && balanceAfter < 0;

  // Google Calendar sync — admin-on-behalf is confirmed; client request is tentative.
  // Look up the client profile once so we can pass it to both sync and notification.
  let clientProfileForSync;
  if (isAdmin && (targetUserId || isGroupBooking)) {
    const lookupId = isGroupBooking ? rawParticipantIds[0] : targetUserId;
    const { data } = await adminClient
      .from("profiles")
      .select("first_name, last_name, full_name, preferred_email, phone, notification_preference")
      .eq("id", lookupId)
      .single();
    clientProfileForSync = data;
  } else {
    clientProfileForSync = {
      first_name: ctx.profile.first_name,
      last_name: ctx.profile.last_name,
    };
  }

  const gcalStatus = bookingStatus === "booked" ? "confirmed" : "tentative";
  await syncBookingGoogle(adminClient, booking, clientProfileForSync, gcalStatus, "upsert", sessionType);

  if (isAdmin && (targetUserId || isGroupBooking)) {
    // Admin booked on behalf — notify all participants
    const notifyIds = isGroupBooking ? rawParticipantIds : [targetUserId];
    let participantProfiles = [clientProfileForSync].filter(Boolean);
    if (isGroupBooking && rawParticipantIds.length > 1) {
      const { data: extraProfiles } = await adminClient
        .from("profiles")
        .select("first_name, last_name, full_name, preferred_email, phone, notification_preference")
        .in("id", notifyIds);
      participantProfiles = extraProfiles || [];
    }
    const subject = "Your coaching session is confirmed!";
    const html = `<h2>Session Confirmed</h2>
       <p>A coaching session has been scheduled for you:</p>
       <p><strong>Date:</strong> ${formatSessionDate(date)}</p>
       <p><strong>Time:</strong> ${formatSessionTime(start_time).replace(" ET", "")} &ndash; ${formatSessionTime(endTimeStr)}</p>
       <p><strong>Duration:</strong> ${sessionType.duration} min</p>`;
    const text = `Your coaching session on ${formatSessionDateTime(date, start_time)} (${sessionType.duration}min) is confirmed.`;
    for (const p of participantProfiles) {
      try { await notifyClient(p, subject, html, text); } catch (e) { console.error("Notification error:", e); }
    }
  } else {
    // Client booked — notify Diana
    const clientName = `${ctx.profile.first_name} ${ctx.profile.last_name}`;
    try {
      await notifyAdmin(
        `New session request from ${clientName}`,
        `<h2>New Session Request</h2>
         <p><strong>Client:</strong> ${clientName}</p>
         <p><strong>Date:</strong> ${formatSessionDate(date)}</p>
         <p><strong>Time:</strong> ${formatSessionTime(start_time).replace(" ET", "")} &ndash; ${formatSessionTime(endTimeStr)}</p>
         <p><strong>Duration:</strong> ${sessionType.duration} min</p>
         ${lowBalance ? `<p style="color:#c0392b"><strong>⚠ Balance alert:</strong> This session puts ${clientName}&apos;s balance negative. They should purchase more sessions.</p>` : ""}
         <p>Log in to your admin calendar to accept or decline.</p>`,
        `New session request from ${clientName}: ${formatSessionDateTime(date, start_time)} (${sessionType.duration}min).${lowBalance ? " ⚠ Balance will be negative." : ""} Log in to accept or decline.`
      );
    } catch (e) {
      console.error("Notification error:", e);
    }
  }

  return NextResponse.json({ ...booking, balance_after: balanceAfter, low_balance: lowBalance });
}

// PATCH — admin accepts, declines, or updates a booking; client updates own booking
export async function PATCH(request) {
  const ctx = await getAuthContext();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await request.json();
  const { id, action, tz_offset } = body;
  if (!id || !["accept", "decline", "update"].includes(action)) {
    return NextResponse.json({ error: "id and action (accept/decline/update) required" }, { status: 400 });
  }

  const isAdmin = ctx.profile?.role === "admin";
  // Only admins can accept/decline. Update is allowed for clients on their own bookings.
  if (!isAdmin && action !== "update") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Get the booking (accept/decline require "requested", update requires "requested" or "booked")
  let query = adminClient.from("bookings").select("*").eq("id", id);
  if (action === "update") {
    query = query.in("status", ["requested", "booked"]);
  } else {
    query = query.eq("status", "requested");
  }
  const { data: booking } = await query.single();

  if (!booking) {
    return NextResponse.json({ error: "Booking not found or not in valid status" }, { status: 404 });
  }

  // Clients can only update their own bookings
  if (!isAdmin && booking.user_id !== ctx.user.id) {
    return NextResponse.json({ error: "You can only edit your own bookings" }, { status: 403 });
  }

  // Get client profile separately (no FK between bookings and profiles)
  const { data: clientProfile } = await adminClient
    .from("profiles")
    .select("first_name, last_name, preferred_email, phone, notification_preference")
    .eq("id", booking.user_id)
    .single();

  booking.profiles = clientProfile;

  // Look up the booking client's group for balance operations (decline/update branches)
  const { data: patchMembership } = await adminClient
    .from("group_members")
    .select("group_id")
    .eq("client_id", booking.user_id)
    .maybeSingle();
  const patchGroupId = patchMembership?.group_id ?? null;

  if (action === "accept") {
    const { data, error } = await adminClient
      .from("bookings")
      .update({ status: "booked" })
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Google sync: flip tentative → confirmed (patches existing event; creates if missing)
    await syncBookingGoogle(adminClient, data, clientProfile, "confirmed", "upsert");

    const whenStr = formatSessionDateTime(booking.date, booking.time_slot);
    try {
      await notifyClient(
        booking.profiles,
        "Your coaching session is confirmed!",
        `<h2>Session Confirmed</h2>
         <p>Your coaching session on <strong>${whenStr}</strong> has been confirmed.</p>
         <p><strong>Duration:</strong> ${booking.session_duration} min</p>`,
        `Your coaching session on ${whenStr} (${booking.session_duration}min) is confirmed.`
      );
    } catch (e) {
      console.error("Notification error:", e);
    }

    return NextResponse.json(data);
  }

  if (action === "decline") {
    const { data, error } = await adminClient
      .from("bookings")
      .update({ status: "declined" })
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Refund the debited minutes back to the client's balance
    await adminClient.rpc("apply_balance_delta", {
      p_group_id: patchGroupId,
      p_delta_minutes: booking.session_duration,
      p_source_type: "decline",
      p_source_id: booking.id,
      p_created_by: ctx.user.id,
      p_actor_client_id: booking.user_id,
    });

    // Google sync: remove the tentative event
    await syncBookingGoogle(adminClient, booking, clientProfile, null, "delete");

    const whenStr = formatSessionDateTime(booking.date, booking.time_slot);
    try {
      await notifyClient(
        booking.profiles,
        "Coaching session update",
        `<h2>Session Not Available</h2>
         <p>Unfortunately, the coaching session you requested on <strong>${whenStr}</strong> is not available.</p>
         <p>Please visit your calendar to request a different time.</p>`,
        `Your session request for ${whenStr} was declined. Please request a different time.`
      );
    } catch (e) {
      console.error("Notification error:", e);
    }

    return NextResponse.json(data);
  }

  if (action === "update") {
    const { date, start_time, session_type_id } = body;
    const updates = {};

    // If session type changed, look it up
    let duration = booking.session_duration;
    if (session_type_id && session_type_id !== booking.session_type_id) {
      const { data: sessionType } = await adminClient
        .from("session_types")
        .select("*")
        .eq("id", session_type_id)
        .single();
      if (!sessionType) return NextResponse.json({ error: "Invalid session type" }, { status: 400 });
      updates.session_type_id = session_type_id;
      updates.session_duration = sessionType.duration;
      duration = sessionType.duration;
    }

    // If date or time changed, recalculate timestamps
    const newDate = date || booking.date;
    const newStartTime = start_time || booking.time_slot;
    const dateOrTimeChanged = (date && date !== booking.date) || (start_time && start_time !== booking.time_slot);

    if (date || start_time) {
      const [h, m] = newStartTime.split(":").map(Number);
      const endMinutes = h * 60 + m + duration;
      const endH = Math.floor(endMinutes / 60);
      const endM = endMinutes % 60;
      const endTimeStr = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;

      updates.date = newDate;
      updates.time_slot = newStartTime;
      const offStr = buildTzOffset(tz_offset);
      updates.start_time = new Date(`${newDate}T${newStartTime}:00${offStr}`).toISOString();
      updates.end_time = new Date(`${newDate}T${endTimeStr}:00${offStr}`).toISOString();
    }

    // Client edits: block only on overlap with another booking. Availability
    // isn't enforced — booked sessions revert to "requested" so Diana reviews
    // the proposed time anyway. Matches the client drag and avoids locking a
    // booking in place when it sits flush against a chunk boundary.
    if (!isAdmin) {
      const [nh, nm] = newStartTime.split(":").map(Number);
      const newStartMin = nh * 60 + nm;
      const newEndMin = newStartMin + duration;

      const { data: otherBookings } = await adminClient
        .from("bookings")
        .select("id, date, time_slot, session_duration, status")
        .eq("date", newDate)
        .in("status", ["requested", "booked"])
        .neq("id", id);

      const overlaps = (otherBookings || []).some(b => {
        const [bH, bM] = (b.time_slot || "00:00").split(":").map(Number);
        const bStart = bH * 60 + bM;
        const bEnd = bStart + (b.session_duration || 60);
        return newStartMin < bEnd && newEndMin > bStart;
      });

      if (overlaps) {
        return NextResponse.json({ error: "Time slot overlaps another booking" }, { status: 409 });
      }

      if (booking.status === "booked") {
        updates.status = "requested";
      }
    }

    // Reset reminder tracking since session moved
    updates.client_reminder_sent_at = null;
    updates.admin_reminder_sent_at = null;

    const { data, error } = await adminClient
      .from("bookings")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // If session duration changed, write a ledger delta for the difference.
    const durationDelta = booking.session_duration - duration;
    if (durationDelta !== 0) {
      await adminClient.rpc("apply_balance_delta", {
        p_group_id: patchGroupId,
        p_delta_minutes: durationDelta,
        p_source_type: "edit_delta",
        p_source_id: booking.id,
        p_created_by: ctx.user.id,
        p_actor_client_id: booking.user_id,
      });
    }

    // Google sync: patch event with new time/title. Status reflects post-update state:
    // - admin edit of a booked session → stays confirmed
    // - client edit of a booked session → reverts to requested (tentative)
    const gcalStatus = data.status === "booked" ? "confirmed" : "tentative";
    // If session type changed, pull the new label for the description.
    let syncSessionType = null;
    if (updates.session_type_id) {
      const { data: st } = await adminClient
        .from("session_types")
        .select("label, duration")
        .eq("id", updates.session_type_id)
        .single();
      syncSessionType = st;
    }
    await syncBookingGoogle(adminClient, data, clientProfile, gcalStatus, "upsert", syncSessionType);

    const whenStr = formatSessionDateTime(data.date, data.time_slot);

    if (isAdmin) {
      // Admin edited — notify client
      try {
        await notifyClient(
          booking.profiles,
          "Your coaching session has been updated",
          `<h2>Session Updated</h2>
           <p>Your coaching session has been updated to:</p>
           <p><strong>Date:</strong> ${formatSessionDate(data.date)}</p>
           <p><strong>Time:</strong> ${formatSessionTime(data.time_slot)}</p>
           <p><strong>Duration:</strong> ${data.session_duration} min</p>`,
          `Your coaching session has been moved to ${whenStr} (${data.session_duration}min).`
        );
      } catch (e) {
        console.error("Notification error:", e);
      }
    } else {
      // Client edited — notify Diana for re-approval
      const clientName = `${ctx.profile.first_name} ${ctx.profile.last_name}`;
      const wasApproved = booking.status === "booked";
      try {
        await notifyAdmin(
          wasApproved
            ? `Session change request from ${clientName} (was approved)`
            : `Session request updated by ${clientName}`,
          `<h2>${wasApproved ? "Session Change Requested" : "Session Request Updated"}</h2>
           <p><strong>Client:</strong> ${clientName}</p>
           <p><strong>New date:</strong> ${formatSessionDate(data.date)}</p>
           <p><strong>New time:</strong> ${formatSessionTime(data.time_slot)}</p>
           <p><strong>Duration:</strong> ${data.session_duration} min</p>
           ${wasApproved ? "<p>This session was previously approved and has been reverted to a pending request.</p>" : ""}
           <p>Log in to your admin calendar to accept or decline.</p>`,
          `${wasApproved ? "CHANGE REQUEST" : "Updated request"} from ${clientName}: ${whenStr} (${data.session_duration}min). Log in to accept or decline.`
        );
      } catch (e) {
        console.error("Notification error:", e);
      }
    }

    return NextResponse.json(data);
  }
}

// DELETE — client cancels their own request
export async function DELETE(request) {
  const ctx = await getAuthContext();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const isAdmin = ctx.profile?.role === "admin";

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Admin can cancel any booking; client can only cancel their own requested bookings
  let query = adminClient
    .from("bookings")
    .select("*")
    .eq("id", id);

  if (!isAdmin) {
    query = query.eq("user_id", ctx.user.id).in("status", ["requested", "booked"]);
  } else {
    query = query.in("status", ["requested", "booked"]);
  }

  const { data: booking } = await query.single();

  if (!booking) {
    return NextResponse.json({ error: "Booking not found or cannot be cancelled" }, { status: 404 });
  }

  const { error } = await adminClient
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Look up the client's group for the refund ledger entry
  const { data: cancelMembership } = await adminClient
    .from("group_members")
    .select("group_id")
    .eq("client_id", booking.user_id)
    .maybeSingle();

  // Refund the debited minutes back to the client's balance
  await adminClient.rpc("apply_balance_delta", {
    p_group_id: cancelMembership?.group_id ?? null,
    p_delta_minutes: booking.session_duration,
    p_source_type: "cancel",
    p_source_id: booking.id,
    p_created_by: ctx.user.id,
    p_actor_client_id: booking.user_id,
  });

  // Google sync: remove the event
  await syncBookingGoogle(adminClient, booking, null, null, "delete");

  const whenStr = formatSessionDateTime(booking.date, booking.time_slot);

  if (isAdmin) {
    // Admin cancelled — notify the client
    const { data: clientProfile } = await adminClient
      .from("profiles")
      .select("first_name, last_name, preferred_email, phone, notification_preference")
      .eq("id", booking.user_id)
      .single();

    if (clientProfile) {
      try {
        await notifyClient(
          clientProfile,
          "Coaching session cancelled",
          `<h2>Session Cancelled</h2>
           <p>Your coaching session on <strong>${whenStr}</strong> has been cancelled.</p>
           <p>Please visit your calendar to request a new time if needed.</p>`,
          `Your coaching session on ${whenStr} has been cancelled. Please request a new time if needed.`
        );
      } catch (e) {
        console.error("Notification error:", e);
      }
    }
  } else {
    // Client cancelled — notify Diana
    const clientName = `${ctx.profile.first_name} ${ctx.profile.last_name}`;
    try {
      const wasBooked = booking.status === "booked";
      await notifyAdmin(
        `Session ${wasBooked ? "cancelled" : "request cancelled"} by ${clientName}`,
        `<h2>Session ${wasBooked ? "Cancelled" : "Request Cancelled"}</h2>
         <p><strong>Client:</strong> ${clientName}</p>
         <p><strong>Date:</strong> ${formatSessionDate(booking.date)}</p>
         <p><strong>Time:</strong> ${formatSessionTime(booking.time_slot)}</p>
         <p>The time slot has been returned to the available pool.</p>`,
        `${clientName} cancelled their ${wasBooked ? "confirmed session" : "session request"} for ${whenStr}.`
      );
    } catch (e) {
      console.error("Notification error:", e);
    }
  }

  return NextResponse.json({ success: true });
}
