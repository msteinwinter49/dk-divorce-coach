import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { notifyAdmin } from "@/lib/notifications";

export async function POST(request) {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll() { return cookieStore.getAll(); } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file) return NextResponse.json({ error: "file is required" }, { status: 400 });

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: doc, error: insertErr } = await adminClient
    .from("documents")
    .insert({
      name: file.name,
      type: "file",
      created_by: user.id,
      file_extension: file.name.split(".").pop().toLowerCase(),
      file_size_bytes: file.size,
    })
    .select()
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  const storagePath = `clients/${user.id}/${doc.id}/${file.name}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: storageErr } = await adminClient.storage
    .from("documents")
    .upload(storagePath, buffer, { contentType: file.type });

  if (storageErr) {
    await adminClient.from("documents").delete().eq("id", doc.id);
    return NextResponse.json({ error: storageErr.message }, { status: 500 });
  }

  await Promise.all([
    adminClient.from("documents").update({ storage_path: storagePath }).eq("id", doc.id),
    adminClient.from("document_shares").insert({
      document_id: doc.id,
      client_id: user.id,
      shared_by: user.id,
      client_upload: true,
    }),
  ]);

  try {
    const [{ data: profile }, { data: share }] = await Promise.all([
      adminClient.from("profiles").select("first_name, last_name").eq("id", user.id).single(),
      adminClient.from("document_shares").select("id").eq("document_id", doc.id).eq("client_id", user.id).single(),
    ]);
    const origin = new URL(request.url).origin.replace("//0.0.0.0", "//localhost");
    const clientName = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() || "A client";
    await notifyAdmin(
      `${clientName} uploaded "${file.name}"`,
      `<p>${clientName} uploaded a file: <strong>${file.name}</strong>.</p><p><a href="${origin}/?admin_doc=${share?.id}">View in portal</a></p>`,
      null
    );
  } catch (err) {
    console.error("client-upload email error:", err);
  }

  return NextResponse.json({ success: true, document_id: doc.id });
}

export async function DELETE(request) {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll() { return cookieStore.getAll(); } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { share_id } = await request.json();
  if (!share_id) return NextResponse.json({ error: "share_id is required" }, { status: 400 });

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: share } = await adminClient
    .from("document_shares")
    .select("id, client_id, client_upload, document_id, documents(storage_path)")
    .eq("id", share_id)
    .single();

  if (!share) return NextResponse.json({ error: "Share not found" }, { status: 404 });
  if (share.client_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!share.client_upload) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (share.documents?.storage_path) {
    await adminClient.storage.from("documents").remove([share.documents.storage_path]);
  }

  await adminClient.from("documents").delete().eq("id", share.document_id);

  return NextResponse.json({ success: true });
}
