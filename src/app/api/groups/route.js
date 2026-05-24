import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

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

  const { id, name, hourly_rate, is_archived } = await request.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const admin = adminSupabase();
  const updates = {};
  if (name !== undefined) updates.name = name.trim();
  if (hourly_rate !== undefined) updates.hourly_rate = hourly_rate ? Number(hourly_rate) : null;
  if (is_archived !== undefined) updates.is_archived = is_archived;

  const { data, error } = await admin.from("groups").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Cascade archive/unarchive to all group members
  if (is_archived !== undefined) {
    const { data: memberRows } = await admin.from("group_members").select("client_id").eq("group_id", id);
    const memberIds = (memberRows || []).map(m => m.client_id);
    if (memberIds.length > 0) {
      await admin.from("profiles").update({ is_archived }).in("id", memberIds);
    }
  }

  return NextResponse.json(data);
}

// DELETE — fully delete a group and all its members
export async function DELETE(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const admin = adminSupabase();

  // Get all members
  const { data: memberRows } = await admin.from("group_members").select("client_id").eq("group_id", id);

  // Fully delete each member
  for (const { client_id } of memberRows || []) {
    const { data: profile } = await admin.from("profiles").select("stripe_customer_id").eq("id", client_id).single();

    const { data: files } = await admin.storage.from("documents").list(client_id);
    if (files?.length) {
      await admin.storage.from("documents").remove(files.map(f => `${client_id}/${f.name}`));
    }

    await admin.from("messages").delete().or(`sender_id.eq.${client_id},conversation_id.eq.${client_id}`);

    if (profile?.stripe_customer_id) {
      try { await stripe.customers.del(profile.stripe_customer_id); } catch { /* non-fatal */ }
    }

    await admin.auth.admin.deleteUser(client_id);
  }

  // Delete group record — cascades balance_ledger, purchases, remaining group_members
  const { error } = await admin.from("groups").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
