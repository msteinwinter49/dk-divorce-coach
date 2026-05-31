import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request, { params }) {
  const { shareId } = await params;
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll() { return cookieStore.getAll(); } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: share } = await adminClient
    .from("document_shares")
    .select("id, client_id, acknowledged_at, document_id, documents(name)")
    .eq("id", shareId)
    .single();

  if (!share) return NextResponse.json({ error: "Share not found" }, { status: 404 });
  if (share.client_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (share.acknowledged_at) return NextResponse.json({ error: "Already acknowledged" }, { status: 400 });

  const { error } = await adminClient
    .from("document_shares")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("id", shareId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    const [{ data: setting }, { data: profile }] = await Promise.all([
      adminClient.from("settings").select("value").eq("key", "contact_email").single(),
      adminClient.from("profiles").select("first_name, last_name").eq("id", user.id).single(),
    ]);
    const contactEmail = setting?.value;
    if (contactEmail) {
      const origin = new URL(request.url).origin;
      const clientName = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() || "A client";
      const docName = share.documents?.name || "a document";
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: "DK Divorce Coach <diana@dkdivorcecoach.com>",
        to: contactEmail,
        subject: `${clientName} acknowledged "${docName}"`,
        html: `<p>${clientName} has acknowledged the document <strong>${docName}</strong>.</p><p><a href="${origin}/?admin_doc=${shareId}">View in portal</a></p>`,
      });
    }
  } catch (err) {
    console.error("acknowledge email error:", err);
  }

  return NextResponse.json({ success: true });
}
