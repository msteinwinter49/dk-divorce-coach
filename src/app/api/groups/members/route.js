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

// GET — list members of a group with profile info
export async function GET(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const group_id = searchParams.get("group_id");
  if (!group_id) return NextResponse.json({ error: "group_id is required" }, { status: 400 });

  const admin = adminSupabase();
  const { data, error } = await admin
    .from("group_members")
    .select("client_id, group_id, is_active, joined_at")
    .eq("group_id", group_id)
    .order("joined_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const clientIds = (data || []).map(m => m.client_id);
  if (clientIds.length) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, first_name, last_name, full_name, preferred_email")
      .in("id", clientIds);
    const profileMap = {};
    (profiles || []).forEach(p => { profileMap[p.id] = p; });
    data.forEach(m => { m.profile = profileMap[m.client_id] || null; });
  }

  return NextResponse.json({ members: data || [] });
}

// POST — add (or move) a client to a group
// client_id is the PK so upsert reassigns to the new group if they were in another
export async function POST(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { client_id, group_id } = await request.json();
  if (!client_id || !group_id) {
    return NextResponse.json({ error: "client_id and group_id are required" }, { status: 400 });
  }

  const { data, error } = await adminSupabase()
    .from("group_members")
    .upsert({ client_id, group_id, is_active: true }, { onConflict: "client_id" })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

// PATCH — toggle is_active for a member
export async function PATCH(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { client_id, is_active } = await request.json();
  if (!client_id || is_active === undefined) {
    return NextResponse.json({ error: "client_id and is_active are required" }, { status: 400 });
  }

  const { data, error } = await adminSupabase()
    .from("group_members")
    .update({ is_active })
    .eq("client_id", client_id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

// DELETE — remove a client from their group
export async function DELETE(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { client_id } = await request.json();
  if (!client_id) return NextResponse.json({ error: "client_id is required" }, { status: 400 });

  const { error } = await adminSupabase()
    .from("group_members")
    .delete()
    .eq("client_id", client_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
