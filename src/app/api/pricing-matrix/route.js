import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

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

  return { user, profile };
}

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// GET — list pricing rows. Non-admins get active only.
export async function GET() {
  const ctx = await getAuthContext();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const client = adminSupabase();
  let query = client.from("pricing_matrix").select("*").order("duration_min").order("package_size");
  if (ctx.profile?.role !== "admin") query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST — create a pricing row (admin only)
export async function POST(request) {
  const ctx = await getAuthContext();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (ctx.profile?.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { duration_min, package_size, price_cents, expires_months } = await request.json();
  if (!duration_min || !package_size || price_cents == null || !expires_months) {
    return NextResponse.json({ error: "duration_min, package_size, price_cents, expires_months are required" }, { status: 400 });
  }

  const { data, error } = await adminSupabase()
    .from("pricing_matrix")
    .insert({
      duration_min: parseInt(duration_min),
      package_size: parseInt(package_size),
      price_cents: parseInt(price_cents),
      expires_months: parseInt(expires_months),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

// PATCH — update a pricing row (admin only)
export async function PATCH(request) {
  const ctx = await getAuthContext();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (ctx.profile?.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { id, ...updates } = await request.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  // Coerce numeric fields
  const coerced = { ...updates, updated_at: new Date().toISOString() };
  for (const k of ["duration_min", "package_size", "price_cents", "expires_months"]) {
    if (k in coerced && coerced[k] !== null && coerced[k] !== "") coerced[k] = parseInt(coerced[k]);
  }

  const { data, error } = await adminSupabase()
    .from("pricing_matrix")
    .update(coerced)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

// DELETE — soft-delete a pricing row (admin only)
export async function DELETE(request) {
  const ctx = await getAuthContext();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (ctx.profile?.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data, error } = await adminSupabase()
    .from("pricing_matrix")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
