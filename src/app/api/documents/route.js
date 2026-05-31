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
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await adminClient
    .from("documents")
    .select("*, document_shares(count)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request) {
  const cookieStore = await cookies();
  const { user, isAdmin } = await getCallerInfo(cookieStore);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const formData = await request.formData();
  const file = formData.get("file");
  const name = formData.get("name")?.trim();
  const type = formData.get("type") || "file";

  if (!file || !name) return NextResponse.json({ error: "file and name are required" }, { status: 400 });

  const { data: doc, error: insertErr } = await adminClient
    .from("documents")
    .insert({
      name,
      type,
      created_by: user.id,
      file_extension: file.name.split(".").pop().toLowerCase(),
      file_size_bytes: file.size,
    })
    .select()
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  const storagePath = `practice/${doc.id}/${file.name}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: storageErr } = await adminClient.storage
    .from("documents")
    .upload(storagePath, buffer, { contentType: file.type });

  if (storageErr) {
    await adminClient.from("documents").delete().eq("id", doc.id);
    return NextResponse.json({ error: storageErr.message }, { status: 500 });
  }

  await adminClient.from("documents").update({ storage_path: storagePath }).eq("id", doc.id);

  return NextResponse.json({ ...doc, storage_path: storagePath });
}

export async function PATCH(request) {
  const cookieStore = await cookies();
  const { user, isAdmin } = await getCallerInfo(cookieStore);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { id, name } = await request.json();
  if (!id || !name?.trim()) return NextResponse.json({ error: "id and name are required" }, { status: 400 });

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await adminClient
    .from("documents")
    .update({ name: name.trim() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request) {
  const cookieStore = await cookies();
  const { user, isAdmin } = await getCallerInfo(cookieStore);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: doc } = await adminClient.from("documents").select("storage_path").eq("id", id).single();
  if (doc?.storage_path) {
    await adminClient.storage.from("documents").remove([doc.storage_path]);
  }

  const { error } = await adminClient.from("documents").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
