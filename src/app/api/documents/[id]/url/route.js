import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { withErrorCatch } from "@/lib/alert";

export const GET = withErrorCatch(async (request, { params }) => {
  const { id } = await params;
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll() { return cookieStore.getAll(); } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const isAdmin = profile?.role === "admin";

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  if (!isAdmin) {
    const { data: share } = await adminClient
      .from("document_shares")
      .select("id")
      .eq("document_id", id)
      .eq("client_id", user.id)
      .single();
    if (!share) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: doc } = await adminClient
    .from("documents")
    .select("storage_path")
    .eq("id", id)
    .single();

  if (!doc?.storage_path) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const { data, error } = await adminClient.storage
    .from("documents")
    .createSignedUrl(doc.storage_path, 3600);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ url: data.signedUrl });
}, { action: "GET /api/documents/[id]/url", resource: "document-url" });
