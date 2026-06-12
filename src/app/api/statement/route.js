import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { withErrorCatch } from "@/lib/alert";

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
        ? `Session on ${bookingMap[row.source_id].label}`
        : "Session requested";
    case "cancel":
      return bookingMap[row.source_id]
        ? `Cancellation — ${bookingMap[row.source_id].label}`
        : "Session cancelled";
    case "edit_delta":
      return bookingMap[row.source_id]
        ? `Duration adjustment — ${bookingMap[row.source_id].label}`
        : "Duration adjustment";
    case "admin_adjust":
      return row.note ? `Admin adjustment: ${row.note}` : "Admin adjustment";
    case "admin_charge":
      return row.note ? `Charge: ${row.note}` : "Manual charge";
    case "admin_refund":
      return row.note ? `Refund: ${row.note}` : "Manual refund";
    case "decline":
      return bookingMap[row.source_id]
        ? `Declined request for ${bookingMap[row.source_id].label}`
        : "Declined request";
    case "expiration":
      return "Minutes expired";
    default:
      return row.source_type;
  }
}

function fmtName(profile) {
  if (!profile) return null;
  const first = profile.first_name || "";
  const last = profile.last_name || "";
  return last ? `${first} ${last.charAt(0)}.` : first || null;
}

const ADMIN_TYPES = new Set(["admin_adjust", "admin_charge", "admin_refund"]);
const SESSION_TYPES = new Set(["request", "cancel", "edit_delta", "decline"]);

function rowNames(row, bookingMap, purchaseMap, profileMap, isMultiMember) {
  if (ADMIN_TYPES.has(row.source_type)) return ["Admin"];
  if (!isMultiMember) return [];
  if (row.source_type === "purchase") {
    const p = purchaseMap[row.source_id];
    const name = p ? fmtName(profileMap[p.purchaser_client_id]) : null;
    return name ? [name] : [];
  }
  if (SESSION_TYPES.has(row.source_type)) {
    const b = bookingMap[row.source_id];
    if (!b) return [];
    const ids = b.participant_ids?.length > 0 ? b.participant_ids : (b.user_id ? [b.user_id] : []);
    return ids.map(id => fmtName(profileMap[id])).filter(Boolean);
  }
  return [];
}

export const GET = withErrorCatch(async (request) => {
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

  const priorQuery = start
    ? admin.from("balance_ledger").select("delta_minutes").eq("group_id", groupId).lt("created_at", new Date(start).toISOString())
    : null;

  const [{ data: ledger, error }, { data: group }, { count: memberCount }, priorRes] = await Promise.all([
    query,
    admin.from("groups").select("name").eq("id", groupId).single(),
    admin.from("group_members").select("*", { count: "exact", head: true }).eq("group_id", groupId),
    priorQuery ?? Promise.resolve({ data: [] }),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const balanceForward = (priorRes.data || []).reduce((sum, r) => sum + (r.delta_minutes || 0), 0);

  if (!ledger?.length) return NextResponse.json({ group_name: group?.name ?? null, balance_forward: balanceForward, rows: [] });

  const isMultiMember = (memberCount ?? 1) > 1;

  const bookingIds = [...new Set(ledger.filter(r => r.source_id && SESSION_TYPES.has(r.source_type)).map(r => r.source_id))];
  const purchaseIds = [...new Set(ledger.filter(r => r.source_id && r.source_type === "purchase").map(r => r.source_id))];

  const [bookingsRes, purchasesRes] = await Promise.all([
    bookingIds.length
      ? admin.from("bookings").select("id, date, time_slot, user_id, participant_ids").in("id", bookingIds)
      : { data: [] },
    purchaseIds.length
      ? admin.from("purchases").select("id, total_minutes, package_size, purchaser_client_id").in("id", purchaseIds)
      : { data: [] },
  ]);

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
    bookingMap[b.id] = { label: `${dateStr} at ${timeStr}`, user_id: b.user_id, participant_ids: b.participant_ids };
  });

  const purchaseMap = {};
  (purchasesRes.data || []).forEach(p => { purchaseMap[p.id] = p; });

  const clientIds = new Set();
  if (isMultiMember) {
    (bookingsRes.data || []).forEach(b => {
      if (b.user_id) clientIds.add(b.user_id);
      (b.participant_ids || []).forEach(id => clientIds.add(id));
    });
    (purchasesRes.data || []).forEach(p => {
      if (p.purchaser_client_id) clientIds.add(p.purchaser_client_id);
    });
  }

  const profileMap = {};
  if (clientIds.size > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", [...clientIds]);
    (profiles || []).forEach(p => { profileMap[p.id] = p; });
  }

  let running = balanceForward;
  const rows = ledger.map(row => {
    running += row.delta_minutes || 0;
    return {
      id: row.id,
      date: row.created_at,
      description: describeRow(row, bookingMap, purchaseMap),
      names: rowNames(row, bookingMap, purchaseMap, profileMap, isMultiMember),
      delta_minutes: row.delta_minutes || 0,
      amount_cents: row.amount_cents || null,
      balance_minutes: running,
    };
  });

  return NextResponse.json({ group_name: group?.name ?? null, balance_forward: balanceForward, rows });
}, { action: "GET /api/statement", resource: "statement" });
