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

async function requireAdmin() {
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
  if (profile?.role !== "admin") return { error: "Admin access required", status: 403 };
  return { user };
}

// GET — list all groups with current balance and active member count
export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = adminSupabase();

  const [{ data: groups, error }, { data: balances }, { data: members }] = await Promise.all([
    admin.from("groups").select("*").order("name"),
    admin.from("group_balances").select("group_id, balance_minutes"),
    admin.from("group_members").select("group_id, client_id, is_active"),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const balanceMap = {};
  (balances || []).forEach(b => { balanceMap[b.group_id] = b.balance_minutes; });

  const memberMap = {};
  (members || []).forEach(m => {
    if (!memberMap[m.group_id]) memberMap[m.group_id] = [];
    memberMap[m.group_id].push(m);
  });

  const enriched = (groups || []).map(g => ({
    ...g,
    balance_minutes: balanceMap[g.id] ?? 0,
    member_count: (memberMap[g.id] || []).filter(m => m.is_active).length,
  }));

  return NextResponse.json({ groups: enriched });
}

// POST — create a group
export async function POST(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { name, hourly_rate } = await request.json();
  if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const { data, error } = await adminSupabase()
    .from("groups")
    .insert({ name: name.trim(), hourly_rate: hourly_rate ? Number(hourly_rate) : null })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

// PATCH — update group name or hourly_rate
export async function PATCH(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id, name, hourly_rate } = await request.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const updates = {};
  if (name !== undefined) updates.name = name.trim();
  if (hourly_rate !== undefined) updates.hourly_rate = hourly_rate ? Number(hourly_rate) : null;

  const { data, error } = await adminSupabase()
    .from("groups")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

// DELETE — delete a group (only if it has no members)
export async function DELETE(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const admin = adminSupabase();

  const { count } = await admin
    .from("group_members")
    .select("client_id", { count: "exact", head: true })
    .eq("group_id", id);
  if (count > 0) {
    return NextResponse.json({ error: "Cannot delete a group that has members" }, { status: 409 });
  }

  const { error } = await admin.from("groups").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
