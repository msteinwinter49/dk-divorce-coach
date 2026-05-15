import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  // Verify the caller is an admin
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  // Use service_role client to bypass RLS and fetch all profiles
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const [
    { data: clients, error },
    { data: { users } },
    { data: memberships },
  ] = await Promise.all([
    adminClient
      .from("profiles")
      .select("id, first_name, last_name, full_name, phone, preferred_email, notification_preference, reminder_preference, timezone, role, created_at")
      .order("created_at", { ascending: false }),
    adminClient.auth.admin.listUsers(),
    adminClient
      .from("group_members")
      .select("client_id, group_id, is_active, groups(id, name, hourly_rate)"),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const emailMap = {};
  (users || []).forEach(u => { emailMap[u.id] = u.email; });

  const membershipMap = {};
  (memberships || []).forEach(m => { membershipMap[m.client_id] = m; });

  const enriched = (clients || []).map(c => {
    const membership = membershipMap[c.id];
    return {
      ...c,
      email: emailMap[c.id] || c.preferred_email || "",
      group_id: membership?.group_id ?? null,
      group_name: membership?.groups?.name ?? null,
      group_hourly_rate: membership?.groups?.hourly_rate ?? null,
      group_is_active: membership?.is_active ?? null,
    };
  });

  return NextResponse.json({ clients: enriched });
}

// PATCH — admin updates a client's profile
export async function PATCH(request) {
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

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { id, first_name, last_name, phone, preferred_email, notification_preference, reminder_preference, timezone } = await request.json();
  if (!id) return NextResponse.json({ error: "Client id is required" }, { status: 400 });

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await adminClient
    .from("profiles")
    .update({
      first_name: first_name?.trim() || undefined,
      last_name: last_name?.trim() || undefined,
      full_name: first_name && last_name ? `${first_name.trim()} ${last_name.trim()}` : undefined,
      phone: phone?.trim() || null,
      preferred_email: preferred_email?.trim() || undefined,
      notification_preference,
      reminder_preference,
      timezone,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
