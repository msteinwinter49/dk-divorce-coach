import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function describeRow(row, bookingMap, purchaseMap) {
  switch (row.source_type) {
    case "purchase": {
      const p = purchaseMap[row.source_id];
      return p
        ? `Package purchase — ${p.total_minutes} min (${p.package_size} sessions)`
        : "Package purchase";
    }
    case "request":
      return bookingMap[row.source_id]
        ? `Session on ${bookingMap[row.source_id]}`
        : "Session requested";
    case "cancel":
      return bookingMap[row.source_id]
        ? `Cancellation — ${bookingMap[row.source_id]}`
        : "Session cancelled";
    case "edit_delta":
      return bookingMap[row.source_id]
        ? `Duration adjustment — ${bookingMap[row.source_id]}`
        : "Duration adjustment";
    case "admin_adjust":
      return row.note ? `Admin adjustment: ${row.note}` : "Admin adjustment";
    case "admin_charge":
      return row.note ? `Charge: ${row.note}` : "Manual charge";
    case "admin_refund":
      return row.note ? `Refund: ${row.note}` : "Manual refund";
    case "expiration":
      return "Minutes expired";
    default:
      return row.source_type;
  }
}

export async function GET(request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll() { return cookieStore.getAll(); } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role === "admin";
  const admin = adminSupabase();
  const { searchParams } = new URL(request.url);

  let groupId = searchParams.get("group_id");
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  // Non-admins can only view their own group
  if (!isAdmin) {
    const { data: membership } = await admin
      .from("group_members")
      .select("group_id")
      .eq("client_id", user.id)
      .maybeSingle();
    groupId = membership?.group_id ?? null;
    if (!groupId) return NextResponse.json({ rows: [] });
  }

  if (!groupId) return NextResponse.json({ error: "group_id required" }, { status: 400 });

  // Fetch ledger rows for the group in range
  let query = admin
    .from("balance_ledger")
    .select("id, created_at, source_type, source_id, delta_minutes, amount_cents, note")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true });

  if (start) query = query.gte("created_at", new Date(start).toISOString());
  if (end) {
    const endDate = new Date(end);
    endDate.setDate(endDate.getDate() + 1);
    query = query.lt("created_at", endDate.toISOString());
  }

  const { data: ledger, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!ledger?.length) return NextResponse.json({ rows: [] });

  // Collect source IDs by type to batch-fetch descriptions
  const bookingIds = [...new Set(ledger.filter(r => r.source_id && ["request", "cancel", "edit_delta"].includes(r.source_type)).map(r => r.source_id))];
  const purchaseIds = [...new Set(ledger.filter(r => r.source_id && r.source_type === "purchase").map(r => r.source_id))];

  const [bookingsRes, purchasesRes] = await Promise.all([
    bookingIds.length
      ? admin.from("bookings").select("id, date, time_slot").in("id", bookingIds)
      : { data: [] },
    purchaseIds.length
      ? admin.from("purchases").select("id, total_minutes, package_size").in("id", purchaseIds)
      : { data: [] },
  ]);

  // Format booking date/time as "Mon Apr 21 at 9:00 AM"
  const DAYS_ABB = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS_ABB = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const bookingMap = {};
  (bookingsRes.data || []).forEach(b => {
    const [year, month, day] = b.date.split("-").map(Number);
    const d = new Date(year, month - 1, day);
    const dateStr = `${DAYS_ABB[d.getDay()]} ${MONTHS_ABB[d.getMonth()]} ${day}`;
    const [h, m] = b.time_slot.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    const timeStr = m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
    bookingMap[b.id] = `${dateStr} at ${timeStr}`;
  });

  const purchaseMap = {};
  (purchasesRes.data || []).forEach(p => { purchaseMap[p.id] = p; });

  // Build rows with running balance
  let running = 0;
  const rows = ledger.map(row => {
    running += row.delta_minutes || 0;
    return {
      id: row.id,
      date: row.created_at,
      description: describeRow(row, bookingMap, purchaseMap),
      delta_minutes: row.delta_minutes || 0,
      amount_cents: row.amount_cents || null,
      balance_minutes: running,
    };
  });

  return NextResponse.json({ rows });
}
