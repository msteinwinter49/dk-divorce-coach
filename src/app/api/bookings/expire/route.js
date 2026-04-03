import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { notifyAdmin } from "@/lib/notifications";

// Cron job: expire unactioned requests and send reminders
// Called by Vercel cron every 15 minutes
export async function GET(request) {
  // Verify cron secret (Vercel sets this header)
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const now = new Date();

  // 1. Expire requests where start_time has passed
  const { data: expired } = await supabase
    .from("bookings")
    .update({ status: "expired" })
    .eq("status", "requested")
    .lt("start_time", now.toISOString())
    .select();

  // 2. Send 24-hour reminders
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const { data: upcoming24h } = await supabase
    .from("bookings")
    .select("*, profiles(first_name, last_name)")
    .eq("status", "requested")
    .gt("start_time", now.toISOString())
    .lte("start_time", in24h.toISOString());

  // 3. Send 1-hour reminders
  const in1h = new Date(now.getTime() + 60 * 60 * 1000);
  const { data: upcoming1h } = await supabase
    .from("bookings")
    .select("*, profiles(first_name, last_name)")
    .eq("status", "requested")
    .gt("start_time", now.toISOString())
    .lte("start_time", in1h.toISOString());

  // Send reminder notifications to Diana
  const reminders = [...(upcoming1h || []), ...(upcoming24h || [])];
  // Deduplicate (1h bookings also appear in 24h)
  const seen = new Set();
  for (const booking of reminders) {
    if (seen.has(booking.id)) continue;
    seen.add(booking.id);

    const clientName = `${booking.profiles.first_name} ${booking.profiles.last_name}`;
    const startTime = new Date(booking.start_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const isUrgent = upcoming1h?.some(b => b.id === booking.id);

    try {
      await notifyAdmin(
        `${isUrgent ? "URGENT: " : ""}Pending session request from ${clientName}`,
        `<h2>${isUrgent ? "Urgent: " : ""}Pending Session Request</h2>
         <p>You have an unactioned session request from <strong>${clientName}</strong>.</p>
         <p><strong>Date:</strong> ${booking.date}</p>
         <p><strong>Time:</strong> ${startTime}</p>
         <p>${isUrgent ? "This session starts in less than 1 hour!" : "This session starts in less than 24 hours."}</p>
         <p>Log in to accept or decline.</p>`,
        `${isUrgent ? "URGENT: " : ""}Pending request from ${clientName} on ${booking.date} at ${startTime}. Log in to accept or decline.`
      );
    } catch (e) {
      console.error("Reminder notification error:", e);
    }
  }

  return NextResponse.json({
    expired: expired?.length || 0,
    reminders_sent: seen.size,
  });
}
