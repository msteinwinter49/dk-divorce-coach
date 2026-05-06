import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAvailableSlots } from "@/lib/availability";

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
    .select("role")
    .eq("id", user.id)
    .single();

  return { user, profile, supabase };
}

// GET — compute available slots for a date range
export async function GET(request) {
  const ctx = await getAuthContext();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("start");
  const endDate = searchParams.get("end");

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "start and end query params required" }, { status: 400 });
  }

  const { slots, _debugEvents, _debugGoogleBusy } = await getAvailableSlots(startDate, endDate);
  // Include the scheduling increment so the client doesn't have to derive it
  // from slot spacing (which breaks on sparse days like a single [09:30, 12:30]).
  const { data: settingsData } = await ctx.supabase
    .from("settings")
    .select("value")
    .eq("key", "scheduling_increment")
    .maybeSingle();
  const increment = settingsData?.value ? parseInt(settingsData.value) : 30;
  return NextResponse.json({ ...slots, __increment: increment, _debugEvents, _debugGoogleBusy });
}

// POST — admin creates/updates availability rules or overrides
export async function POST(request) {
  const ctx = await getAuthContext();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (ctx.profile?.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const body = await request.json();
  const { type } = body; // "rule" or "override"

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  if (type === "rule") {
    const { day_of_week, start_time, end_time, is_blocked } = body;
    const { data, error } = await adminClient
      .from("availability_rules")
      .insert({ day_of_week, start_time, end_time, is_blocked: is_blocked || false })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (type === "override") {
    const { date, start_time, end_time, is_available } = body;
    const { data, error } = await adminClient
      .from("availability_overrides")
      .insert({ date, start_time: start_time || null, end_time: end_time || null, is_available })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: "type must be 'rule' or 'override'" }, { status: 400 });
}

// DELETE — admin removes a rule or override
export async function DELETE(request) {
  const ctx = await getAuthContext();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (ctx.profile?.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { type, id } = await request.json();
  if (!type || !id) return NextResponse.json({ error: "type and id required" }, { status: 400 });

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const table = type === "rule" ? "availability_rules" : "availability_overrides";
  const { error } = await adminClient.from(table).delete().eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
