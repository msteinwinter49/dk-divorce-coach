import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { notifyAdmin, notifyCoach, notifyClient, formatSessionDate, formatSessionTime, formatSessionDateTime } from "@/lib/notifications";
import { expireStaleRequests } from "@/lib/bookings-sweep";

// Cron job: expire unactioned requests, send admin reminders for pending,
// and send session reminders for confirmed bookings.
// Called by Vercel cron daily (Hobby plan limit).
export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const now = new Date();
  const results = { expired: 0, pending_reminders: 0, client_reminders: 0, admin_reminders: 0 };

  // ============================================
  // 1. Expire requests: past-start-time AND TTL (stale unactioned requests).
  //    Shared with /api/bookings GET via lib/bookings-sweep so the same rules
  //    apply on opportunistic sweeps.
  // ============================================
  const sweep = await expireStaleRequests(supabase);
  results.expired = sweep.expired;

  // ============================================
  // 2. Admin reminders for pending requests (24h and 1h)
  // ============================================
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const in1h = new Date(now.getTime() + 60 * 60 * 1000);

  const { data: pendingBookings } = await supabase
    .from("bookings")
    .select("*")
    .eq("status", "requested")
    .gt("start_time", now.toISOString())
    .lte("start_time", in24h.toISOString());

  if (pendingBookings?.length > 0) {
    // Fetch profiles separately (no FK between bookings and profiles)
    const userIds = [...new Set(pendingBookings.map(b => b.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", userIds);

    const profileMap = {};
    (profiles || []).forEach(p => { profileMap[p.id] = p; });

    for (const booking of pendingBookings) {
      const profile = profileMap[booking.user_id];
      const clientName = profile ? `${profile.first_name} ${profile.last_name}` : "Unknown client";
      const whenStr = formatSessionDateTime(booking.date, booking.time_slot);
      const isUrgent = new Date(booking.start_time) <= in1h;

      try {
        await notifyAdmin(
          `${isUrgent ? "URGENT: " : ""}Pending session request from ${clientName}`,
          `<h2>${isUrgent ? "Urgent: " : ""}Pending Session Request</h2>
           <p>You have an unactioned session request from <strong>${clientName}</strong>.</p>
           <p><strong>Date:</strong> ${formatSessionDate(booking.date)}</p>
           <p><strong>Time:</strong> ${formatSessionTime(booking.time_slot)}</p>
           <p>${isUrgent ? "This session starts in less than 1 hour!" : "This session starts in less than 24 hours."}</p>
           <p>Log in to accept or decline.</p>`,
          `${isUrgent ? "URGENT: " : ""}Pending request from ${clientName} on ${whenStr}. Log in to accept or decline.`
        );
        results.pending_reminders++;
      } catch (e) {
        console.error("Pending reminder notification error:", e);
      }
    }
  }

  // ============================================
  // 3. Confirmed session reminders
  // ============================================

  // Load the coach profile for session reminder settings
  const { data: coach } = await supabase
    .from("profiles")
    .select("preferred_email, phone, admin_reminder_channel, admin_reminder_minutes")
    .eq("is_coach", true)
    .maybeSingle();

  const coachChannel = coach?.admin_reminder_channel || "none";
  const coachMinutes = parseInt(coach?.admin_reminder_minutes || "0");

  // Buffer to compensate for cron interval — reminders may arrive early by
  // up to this amount, but never late. Matches the longest cron gap (daily = 1440).
  const CRON_BUFFER_MIN = 1440;

  // Find all confirmed bookings starting within the next 24h + buffer
  const { data: confirmedBookings } = await supabase
    .from("bookings")
    .select("*")
    .eq("status", "booked")
    .gt("start_time", now.toISOString())
    .lte("start_time", new Date(now.getTime() + (24 * 60 + CRON_BUFFER_MIN) * 60000).toISOString());

  if (confirmedBookings?.length > 0) {
    // Fetch client profiles
    const userIds = [...new Set(confirmedBookings.map(b => b.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, preferred_email, phone, notification_preference, reminder_preference")
      .in("id", userIds);

    const profileMap = {};
    (profiles || []).forEach(p => { profileMap[p.id] = p; });

    for (const booking of confirmedBookings) {
      const profile = profileMap[booking.user_id];
      const clientName = profile ? `${profile.first_name} ${profile.last_name}` : "Unknown client";
      const whenStr = formatSessionDateTime(booking.date, booking.time_slot);
      const minutesUntil = (new Date(booking.start_time) - now) / 60000;

      // --- Client reminders ---
      if (profile && !booking.client_reminder_sent_at) {
        const pref = profile.reminder_preference || "both";
        let shouldNotify = false;

        if (pref === "both" && minutesUntil <= 24 * 60 + CRON_BUFFER_MIN) {
          shouldNotify = true;
        } else if (pref === "24h" && minutesUntil <= 24 * 60 + CRON_BUFFER_MIN) {
          shouldNotify = true;
        } else if (pref === "1h" && minutesUntil <= 60 + CRON_BUFFER_MIN) {
          shouldNotify = true;
        }
        // pref === "none" — no reminder

        if (shouldNotify) {
          try {
            await notifyClient(
              profile,
              "Upcoming coaching session reminder",
              `<h2>Session Reminder</h2>
               <p>You have a coaching session coming up:</p>
               <p><strong>Date:</strong> ${formatSessionDate(booking.date)}</p>
               <p><strong>Time:</strong> ${formatSessionTime(booking.time_slot)}</p>
               <p><strong>Duration:</strong> ${booking.session_duration} min</p>`,
              `Reminder: You have a coaching session on ${whenStr} (${booking.session_duration}min).`
            );
            await supabase
              .from("bookings")
              .update({ client_reminder_sent_at: now.toISOString() })
              .eq("id", booking.id);
            results.client_reminders++;
          } catch (e) {
            console.error("Client reminder error:", e);
          }
        }
      }

      // --- Admin (coach) reminder ---
      if (coachChannel !== "none" && coach && !booking.admin_reminder_sent_at && minutesUntil <= coachMinutes + CRON_BUFFER_MIN) {
        try {
          await notifyCoach(
            coach,
            `Upcoming session with ${clientName}`,
            `<h2>Session Reminder</h2>
             <p>You have a coaching session coming up:</p>
             <p><strong>Client:</strong> ${clientName}</p>
             <p><strong>Date:</strong> ${formatSessionDate(booking.date)}</p>
             <p><strong>Time:</strong> ${formatSessionTime(booking.time_slot)}</p>
             <p><strong>Duration:</strong> ${booking.session_duration} min</p>`,
            `Reminder: Session with ${clientName} on ${whenStr} (${booking.session_duration}min).`
          );
          await supabase
            .from("bookings")
            .update({ admin_reminder_sent_at: now.toISOString() })
            .eq("id", booking.id);
          results.admin_reminders++;
        } catch (e) {
          console.error("Admin reminder error:", e);
        }
      }
    }
  }

  // ============================================
  // Expire purchase minutes: debit balance for expired packages.
  // ============================================
  try {
    const sweepStart = now.toISOString();
    const { data: expiredRows } = await supabase.rpc("expire_purchase_minutes");
    results.expired_purchase_rows = expiredRows ?? 0;

    if ((expiredRows ?? 0) > 0) {
      // Find actual debits (non-zero delta) written during this sweep
      const { data: expirations } = await supabase
        .from("balance_ledger")
        .select("client_id, delta_minutes")
        .eq("source_type", "expiration")
        .lt("delta_minutes", 0)
        .gte("created_at", sweepStart);

      if (expirations?.length > 0) {
        const clientIds = [...new Set(expirations.map(e => e.client_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", clientIds);
        const profileMap = {};
        (profiles || []).forEach(p => { profileMap[p.id] = p; });

        const listItems = expirations.map(e => {
          const p = profileMap[e.client_id];
          const name = p ? `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Unknown" : "Unknown";
          return `<li><strong>${name}</strong>: ${Math.abs(e.delta_minutes)} min expired</li>`;
        }).join("");

        const smsLine = expirations.map(e => {
          const p = profileMap[e.client_id];
          return `${p?.first_name || "Client"} ${p?.last_name || ""}: ${Math.abs(e.delta_minutes)}min`;
        }).join("; ");

        await notifyAdmin(
          "Purchased minutes expired",
          `<h2>Purchased Minutes Expired</h2>
           <p>The following clients had purchased minutes expire in today's sweep:</p>
           <ul>${listItems}</ul>`,
          `Expired minutes: ${smsLine}`
        );
      }
    }
  } catch (e) {
    console.error("Purchase expiration error:", e);
    results.expired_purchase_rows = -1;
  }

  return NextResponse.json(results);
}

