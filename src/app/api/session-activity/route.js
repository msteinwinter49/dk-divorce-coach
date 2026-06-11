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

function fmtName(profile) {
  if (!profile) return null;
  const first = profile.first_name || "";
  const last = profile.last_name || "";
  return last ? `${first} ${last.charAt(0)}.` : first || null;
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

  const { data: callerProfile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (callerProfile?.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("client_id");
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!clientId) return NextResponse.json({ error: "client_id required" }, { status: 400 });

  const admin = adminSupabase();

  const [{ data: profile }, { data: membership }] = await Promise.all([
    admin.from("profiles").select("first_name, last_name").eq("id", clientId).single(),
    admin.from("group_members").select("group_id, groups(name)").eq("client_id", clientId).maybeSingle(),
  ]);

  const clientName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Client";
  const groupName = membership?.groups?.name ?? null;

  let query = admin
    .from("bookings")
    .select("id, date, time_slot, start_time, end_time, status, user_id, participant_ids, session_types(label, duration)")
    .or(`user_id.eq.${clientId},participant_ids.cs.{${clientId}}`)
    .order("start_time", { ascending: false });

  if (start) query = query.gte("date", start);
  if (end) query = query.lte("date", end);

  const { data: bookings, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!bookings?.length) return NextResponse.json({ client_name: clientName, group_name: groupName, rows: [] });

  const allIds = new Set();
  bookings.forEach(b => {
    if (b.user_id) allIds.add(b.user_id);
    (b.participant_ids || []).forEach(id => allIds.add(id));
  });

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, first_name, last_name")
    .in("id", [...allIds]);

  const profileMap = {};
  (profiles || []).forEach(p => { profileMap[p.id] = p; });

  const rows = bookings.map(b => {
    const allParticipantIds = b.participant_ids?.length > 0
      ? [...new Set([b.user_id, ...b.participant_ids].filter(Boolean))]
      : [b.user_id].filter(Boolean);

    const attendeeNames = allParticipantIds.map(id => fmtName(profileMap[id])).filter(Boolean);

    return {
      id: b.id,
      date: b.date,
      start_time: b.start_time || null,
      end_time: b.end_time || null,
      time_slot: b.time_slot,
      session_type: b.session_types?.label ?? null,
      duration_minutes: b.session_types?.duration ?? null,
      status: b.status,
      attendee_count: allParticipantIds.length,
      attendee_names: attendeeNames,
    };
  });

  return NextResponse.json({ client_name: clientName, group_name: groupName, rows });
}, { action: "GET /api/session-activity", resource: "session-activity" });
