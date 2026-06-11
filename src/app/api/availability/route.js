import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAvailableSlots } from "@/lib/availability";
import { withErrorCatch } from "@/lib/alert";

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

export const GET = withErrorCatch(async (request) => {
  const ctx = await getAuthContext();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("start");
  const endDate = searchParams.get("end");

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "start and end query params required" }, { status: 400 });
  }

  const slots = await getAvailableSlots(startDate, endDate);
  const { data: settingsData } = await ctx.supabase
    .from("settings")
    .select("value")
    .eq("key", "scheduling_increment")
    .maybeSingle();
  const increment = settingsData?.value ? parseInt(settingsData.value) : 30;
  return NextResponse.json({ ...slots, __increment: increment });
}, { action: "GET /api/availability", resource: "availability" });

export const POST = withErrorCatch(async (request) => {
  const ctx = await getAuthContext();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (ctx.profile?.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const body = await request.json();
  const { type } = body;

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
}, { action: "POST /api/availability", resource: "availability" });

export const DELETE = withErrorCatch(async (request) => {
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
}, { action: "DELETE /api/availability", resource: "availability" });
