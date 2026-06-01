import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { maybeExpireStaleRequests } from "@/lib/bookings-sweep";

// GET — combined PortalHome data for a client: bookings, balance, card status.
// Query params: start, end (ISO strings for bookings date range)
export async function GET(request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll() { return cookieStore.getAll(); } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  await maybeExpireStaleRequests(adminClient);

  const [bookingsResult, membershipResult, profileResult] = await Promise.all([
    // Bookings (client sees own + group)
    (() => {
      let q = adminClient
        .from("bookings")
        .select("id, date, time_slot, start_time, end_time, status, session_duration, session_types(label, duration)")
        .in("status", ["requested", "booked"])
        .or(`user_id.eq.${user.id},participant_ids.cs.{${user.id}}`)
        .order("start_time");
      if (start) q = q.gte("start_time", new Date(start).toISOString());
      if (end) q = q.lte("start_time", new Date(end + "T23:59:59").toISOString());
      return q;
    })(),
    // Group membership → balance
    adminClient
      .from("group_members")
      .select("group_id, groups(hourly_rate)")
      .eq("client_id", user.id)
      .maybeSingle(),
    // Profile for stripe_customer_id
    adminClient
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single(),
  ]);

  const bookings = bookingsResult.data || [];

  // Balance
  let balance_minutes = 0;
  let hourly_rate = null;
  const groupId = membershipResult.data?.group_id ?? null;
  if (groupId) {
    hourly_rate = membershipResult.data?.groups?.hourly_rate ?? null;
    const { data: balRow } = await adminClient
      .from("group_balances")
      .select("balance_minutes")
      .eq("group_id", groupId)
      .maybeSingle();
    balance_minutes = balRow?.balance_minutes ?? 0;
  }

  // Card
  let card = null;
  const stripeCustomerId = profileResult.data?.stripe_customer_id;
  if (stripeCustomerId) {
    try {
      const methods = await stripe.paymentMethods.list({
        customer: stripeCustomerId,
        type: "card",
        limit: 1,
      });
      const pm = methods.data[0];
      if (pm) {
        card = {
          brand: pm.card.brand,
          last4: pm.card.last4,
          exp_month: pm.card.exp_month,
          exp_year: pm.card.exp_year,
        };
      }
    } catch (e) {
      console.error("[portal-home] Stripe card fetch failed:", e?.message || e);
    }
  }

  return NextResponse.json({ bookings, balance_minutes, hourly_rate, card });
}
