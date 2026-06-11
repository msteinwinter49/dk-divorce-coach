import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { notifyAdmin, notifyCoach, notifyClient, formatSessionDate, formatSessionTime, formatSessionDateTime } from "@/lib/notifications";
import { expireStaleRequests } from "@/lib/bookings-sweep";
import { recordAlert, withErrorCatch } from "@/lib/alert";

export const GET = withErrorCatch(async (request) => {
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

  const sweep = await expireStaleRequests(supabase);
  results.expired = sweep.expired;

  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const in1h = new Date(now.getTime() + 60 * 60 * 1000);

  const { data: pendingBookings } = await supabase
    .from("bookings")
    .select("*")
    .eq("status", "requested")
    .gt("start_time", now.toISOString())
    .lte("start_time", in24h.toISOString());

  if (pendingBookings?.length > 0) {
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
        await recordAlert(supabase, { category: "notification", action: "SEND", resource: "pending_reminder", summary: clientName, error: e?.message || String(e) });
      }
    }
  }

  const { data: coach } = await supabase
    .from("profiles")
    .select("preferred_email, phone, admin_reminder_channel, admin_reminder_minutes")
    .eq("is_coach", true)
    .maybeSingle();

  const coachChannel = coach?.admin_reminder_channel || "none";
  const coachMinutes = parseInt(coach?.admin_reminder_minutes || "0");

  const CRON_BUFFER_MIN = 1440;

  const { data: confirmedBookings } = await supabase
    .from("bookings")
    .select("*")
    .eq("status", "booked")
    .gt("start_time", now.toISOString())
    .lte("start_time", new Date(now.getTime() + (24 * 60 + CRON_BUFFER_MIN) * 60000).toISOString());

  if (confirmedBookings?.length > 0) {
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
            await recordAlert(supabase, { category: "notification", action: "SEND", resource: "client_reminder", summary: clientName, error: e?.message || String(e) });
          }
        }
      }

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
          await recordAlert(supabase, { category: "notification", action: "SEND", resource: "coach_reminder", summary: clientName, error: e?.message || String(e) });
        }
      }
    }
  }

  try {
    const sweepStart = now.toISOString();
    const { data: expiredRows } = await supabase.rpc("expire_purchase_minutes");
    results.expired_purchase_rows = expiredRows ?? 0;

    if ((expiredRows ?? 0) > 0) {
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
    await recordAlert(supabase, { category: "sweep", action: "EXPIRE", resource: "purchase_minutes", error: e?.message || String(e) });
    results.expired_purchase_rows = -1;
  }

  try { await supabase.from("system_alerts").delete().lt("created_at", new Date(Date.now() - 90*24*60*60*1000).toISOString()); } catch {}

  return NextResponse.json(results);
}, { action: "GET /api/bookings/expire", resource: "bookings-expire" });
