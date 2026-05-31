import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

async function getCallerInfo(cookieStore) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll() { return cookieStore.getAll(); } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, isAdmin: false };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return { user, isAdmin: profile?.role === "admin" };
}

export async function GET(request) {
  const cookieStore = await cookies();
  const { user, isAdmin } = await getCallerInfo(cookieStore);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  let query = adminClient
    .from("document_shares")
    .select("*, documents(id, name, type, file_extension, file_size_bytes, created_at)")
    .order("shared_at", { ascending: false });

  if (!isAdmin) query = query.eq("client_id", user.id);

  const { data: shares, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (isAdmin && shares?.length) {
    const clientIds = [...new Set(shares.map(s => s.client_id))];
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", clientIds);
    const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));
    return NextResponse.json(shares.map(s => ({ ...s, client: profileMap[s.client_id] || null })));
  }

  return NextResponse.json(shares);
}

export async function POST(request) {
  const cookieStore = await cookies();
  const { user, isAdmin } = await getCallerInfo(cookieStore);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { document_id, client_ids, require_acknowledgment, acknowledgment_label } = await request.json();
  if (!document_id || !client_ids?.length) {
    return NextResponse.json({ error: "document_id and client_ids are required" }, { status: 400 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const rows = client_ids.map(client_id => ({
    document_id,
    client_id,
    shared_by: user.id,
    require_acknowledgment: !!require_acknowledgment,
    acknowledgment_label: require_acknowledgment
      ? (acknowledgment_label?.trim() || "I have read and agree")
      : null,
  }));

  const { data, error } = await adminClient
    .from("document_shares")
    .upsert(rows, { onConflict: "document_id,client_id" })
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request) {
  const cookieStore = await cookies();
  const { user, isAdmin } = await getCallerInfo(cookieStore);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { share_id } = await request.json();
  if (!share_id) return NextResponse.json({ error: "share_id is required" }, { status: 400 });

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { error } = await adminClient.from("document_shares").delete().eq("id", share_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
