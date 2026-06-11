import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
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

export const GET = withErrorCatch(async () => {
  const ctx = await getAuthContext();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  let query = adminClient.from("session_types").select("*").order("duration");
  if (ctx.profile?.role !== "admin") {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}, { action: "GET /api/session-types", resource: "session-types" });

export const POST = withErrorCatch(async (request) => {
  const ctx = await getAuthContext();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (ctx.profile?.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { label, duration } = await request.json();
  if (!label || !duration) {
    return NextResponse.json({ error: "label and duration are required" }, { status: 400 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await adminClient
    .from("session_types")
    .insert({ label, duration })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}, { action: "POST /api/session-types", resource: "session-types" });

export const PATCH = withErrorCatch(async (request) => {
  const ctx = await getAuthContext();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (ctx.profile?.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { id, ...updates } = await request.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await adminClient
    .from("session_types")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}, { action: "PATCH /api/session-types", resource: "session-types" });

export const DELETE = withErrorCatch(async (request) => {
  const ctx = await getAuthContext();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (ctx.profile?.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await adminClient
    .from("session_types")
    .update({ is_active: false })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}, { action: "DELETE /api/session-types", resource: "session-types" });
