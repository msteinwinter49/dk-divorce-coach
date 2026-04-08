import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAvailableSlots, isSlotAvailable } from "@/lib/availability";
import { notifyAdmin, notifyClient } from "@/lib/notifications";

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

  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  const isAdmin = ctx.profile?.role === "admin";

  let query = adminClient
    .from("bookings")
    .select(isAdmin
      ? "*, session_types(label, duration, fee)"
      : "*, session_types(label, duration, fee)")
    .order("start_time");

  // Clients only see their own bookings
  if (!isAdmin) {
    query = query.eq("user_id", ctx.user.id);
  }

  if (start) query = query.gte("start_time", new Date(start).toISOString());
  if (end) query = query.lte("start_time", new Date(end + "T23:59:59").toISOString());

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // For admin, attach profile info to each booking
  if (isAdmin && data?.length > 0) {
    const userIds = [...new Set(data.map(b => b.user_id))];
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("id, first_name, last_name, client_code, preferred_email, phone, notification_preference, stripe_customer_id")
      .in("id", userIds);

    const profileMap = {};
    (profiles || []).forEach(p => { profileMap[p.id] = p; });
    data.forEach(b => { b.profiles = profileMap[b.user_id] || null; });
  }

  return NextResponse.json(data);
}

// POST — client requests a booking
export async function POST(request) {
  const ctx = await getAuthContext();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { session_type_id, date, start_time, user_id: targetUserId } = await request.json();
  if (!session_type_id || !date || !start_time) {
    return NextResponse.json({ error: "session_type_id, date, and start_time are required" }, { status: 400 });
  }

  // Admin can book on behalf of a client (view-as-client)
  const isAdmin = ctx.profile?.role === "admin";
  const bookingUserId = (isAdmin && targetUserId) ? targetUserId : ctx.user.id;

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

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

  if (!isSlotAvailable(slots, date, start_time, sessionType.duration, increment)) {
    return NextResponse.json({ error: "Time slot is not available" }, { status: 409 });
  }

  // Calculate end time
  const [h, m] = start_time.split(":").map(Number);
  const endMinutes = h * 60 + m + sessionType.duration;
  const endH = Math.floor(endMinutes / 60);
  const endM = endMinutes % 60;
  const endTimeStr = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;

  const startTimestamp = new Date(`${date}T${start_time}:00`).toISOString();
  const endTimestamp = new Date(`${date}T${endTimeStr}:00`).toISOString();

  // Create the booking
  // Admin booking on behalf of client goes straight to "booked"
  const bookingStatus = (isAdmin && targetUserId) ? "booked" : "requested";

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
      fee: sessionType.fee,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (isAdmin && targetUserId) {
    // Admin booked on behalf — notify the client
    const { data: clientProfile } = await adminClient
      .from("profiles")
      .select("first_name, last_name, preferred_email, phone, notification_preference")
      .eq("id", targetUserId)
      .single();

    if (clientProfile) {
      try {
        await notifyClient(
          clientProfile,
          "Your coaching session is confirmed!",
          `<h2>Session Confirmed</h2>
           <p>A coaching session has been scheduled for you:</p>
           <p><strong>Date:</strong> ${date}</p>
           <p><strong>Time:</strong> ${start_time} - ${endTimeStr}</p>
           <p><strong>Duration:</strong> ${sessionType.duration} min</p>
           ${sessionType.fee > 0 ? `<p><strong>Fee:</strong> $${sessionType.fee}</p>` : ""}`,
          `Your coaching session on ${date} at ${start_time} (${sessionType.duration}min) is confirmed.`
        );
      } catch (e) {
        console.error("Notification error:", e);
      }
    }
  } else {
    // Client booked — notify Diana
    const clientName = `${ctx.profile.first_name} ${ctx.profile.last_name}`;
    try {
      await notifyAdmin(
        `New session request from ${clientName}`,
        `<h2>New Session Request</h2>
         <p><strong>Client:</strong> ${clientName}</p>
         <p><strong>Date:</strong> ${date}</p>
         <p><strong>Time:</strong> ${start_time} - ${endTimeStr}</p>
         <p><strong>Duration:</strong> ${sessionType.duration} min</p>
         <p><strong>Fee:</strong> $${sessionType.fee}</p>
         <p>Log in to your admin calendar to accept or decline.</p>`,
        `New session request from ${clientName}: ${date} at ${start_time} (${sessionType.duration}min). Log in to accept or decline.`
      );
    } catch (e) {
      console.error("Notification error:", e);
    }
  }

  return NextResponse.json(booking);
}

// PATCH — admin accepts, declines, or updates a booking
export async function PATCH(request) {
  const ctx = await getAuthContext();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (ctx.profile?.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const body = await request.json();
  const { id, action } = body;
  if (!id || !["accept", "decline", "update"].includes(action)) {
    return NextResponse.json({ error: "id and action (accept/decline/update) required" }, { status: 400 });
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

  // Get client profile separately (no FK between bookings and profiles)
  const { data: clientProfile } = await adminClient
    .from("profiles")
    .select("first_name, last_name, preferred_email, phone, notification_preference, stripe_customer_id")
    .eq("id", booking.user_id)
    .single();

  booking.profiles = clientProfile;

  if (action === "accept") {
    // Charge the client if they have a payment method
    let paymentIntentId = null;
    if (booking.profiles.stripe_customer_id && booking.fee > 0) {
      try {
        const { chargeClient } = await import("@/lib/stripe");
        const payment = await chargeClient(
          booking.profiles.stripe_customer_id,
          Math.round(booking.fee * 100),
          `Coaching session - ${booking.date}`
        );
        paymentIntentId = payment.id;
      } catch (e) {
        return NextResponse.json({
          error: `Payment failed: ${e.message}. Booking not accepted.`
        }, { status: 402 });
      }
    }

    const { data, error } = await adminClient
      .from("bookings")
      .update({
        status: "booked",
        stripe_payment_intent_id: paymentIntentId,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const startTime = new Date(booking.start_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    try {
      await notifyClient(
        booking.profiles,
        "Your coaching session is confirmed!",
        `<h2>Session Confirmed</h2>
         <p>Your coaching session on <strong>${booking.date}</strong> at <strong>${startTime}</strong> has been confirmed.</p>
         <p><strong>Duration:</strong> ${booking.session_duration} min</p>
         ${booking.fee > 0 ? `<p><strong>Fee:</strong> $${booking.fee} (charged to card on file)</p>` : ""}`,
        `Your coaching session on ${booking.date} at ${startTime} (${booking.session_duration}min) is confirmed.`
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

    const startTime = new Date(booking.start_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    try {
      await notifyClient(
        booking.profiles,
        "Coaching session update",
        `<h2>Session Not Available</h2>
         <p>Unfortunately, the coaching session you requested on <strong>${booking.date}</strong> at <strong>${startTime}</strong> is not available.</p>
         <p>Please visit your calendar to request a different time.</p>`,
        `Your session request for ${booking.date} at ${startTime} was declined. Please request a different time.`
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
    let fee = booking.fee;
    if (session_type_id && session_type_id !== booking.session_type_id) {
      const { data: sessionType } = await adminClient
        .from("session_types")
        .select("*")
        .eq("id", session_type_id)
        .single();
      if (!sessionType) return NextResponse.json({ error: "Invalid session type" }, { status: 400 });
      updates.session_type_id = session_type_id;
      updates.session_duration = sessionType.duration;
      updates.fee = sessionType.fee;
      duration = sessionType.duration;
      fee = sessionType.fee;
    }

    // If date or time changed, recalculate timestamps
    const newDate = date || booking.date;
    const newStartTime = start_time || booking.time_slot;

    if (date || start_time) {
      const [h, m] = newStartTime.split(":").map(Number);
      const endMinutes = h * 60 + m + duration;
      const endH = Math.floor(endMinutes / 60);
      const endM = endMinutes % 60;
      const endTimeStr = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;

      updates.date = newDate;
      updates.time_slot = newStartTime;
      updates.start_time = new Date(`${newDate}T${newStartTime}:00`).toISOString();
      updates.end_time = new Date(`${newDate}T${endTimeStr}:00`).toISOString();
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

    // Notify client of the change
    const newStartFormatted = new Date(data.start_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    try {
      await notifyClient(
        booking.profiles,
        "Your coaching session has been updated",
        `<h2>Session Updated</h2>
         <p>Your coaching session has been updated to:</p>
         <p><strong>Date:</strong> ${data.date}</p>
         <p><strong>Time:</strong> ${newStartFormatted}</p>
         <p><strong>Duration:</strong> ${data.session_duration} min</p>
         ${data.fee > 0 ? `<p><strong>Fee:</strong> $${data.fee}</p>` : ""}`,
        `Your coaching session has been moved to ${data.date} at ${newStartFormatted} (${data.session_duration}min).`
      );
    } catch (e) {
      console.error("Notification error:", e);
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
    query = query.eq("user_id", ctx.user.id).eq("status", "requested");
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

  const startTime = new Date(booking.start_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

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
           <p>Your coaching session on <strong>${booking.date}</strong> at <strong>${startTime}</strong> has been cancelled.</p>
           <p>Please visit your calendar to request a new time if needed.</p>`,
          `Your coaching session on ${booking.date} at ${startTime} has been cancelled. Please request a new time if needed.`
        );
      } catch (e) {
        console.error("Notification error:", e);
      }
    }
  } else {
    // Client cancelled — notify Diana
    const clientName = `${ctx.profile.first_name} ${ctx.profile.last_name}`;
    try {
      await notifyAdmin(
        `Session request cancelled by ${clientName}`,
        `<h2>Session Request Cancelled</h2>
         <p><strong>Client:</strong> ${clientName}</p>
         <p><strong>Date:</strong> ${booking.date}</p>
         <p><strong>Time:</strong> ${startTime}</p>
         <p>The time slot has been returned to the available pool.</p>`,
        `${clientName} cancelled their session request for ${booking.date} at ${startTime}.`
      );
    } catch (e) {
      console.error("Notification error:", e);
    }
  }

  return NextResponse.json({ success: true });
}
