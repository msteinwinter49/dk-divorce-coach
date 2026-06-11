import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { withErrorCatch } from "@/lib/alert";

export const POST = withErrorCatch(async (request) => {
  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "Client id is required" }, { status: 400 });

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll() { return cookieStore.getAll(); } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: callerProfile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (callerProfile?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: targetProfile, error: pErr } = await adminClient
    .from("profiles")
    .select("id, first_name, preferred_email")
    .eq("id", id)
    .single();
  if (pErr || !targetProfile) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const { data: authUser } = await adminClient.auth.admin.getUserById(id);
  const loginEmail = authUser?.user?.email;
  const deliveryEmail = targetProfile.preferred_email?.trim() || loginEmail;
  if (!loginEmail) {
    return NextResponse.json({ error: "Client has no login email" }, { status: 400 });
  }
  if (!deliveryEmail) {
    return NextResponse.json({ error: "No delivery email available" }, { status: 400 });
  }

  const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "https://dkdivorcecoach.com";

  const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
    type: "magiclink",
    email: loginEmail,
    options: { redirectTo: `${origin}/` },
  });
  if (linkErr || !linkData?.properties?.hashed_token) {
    return NextResponse.json({ error: linkErr?.message || "Could not create link" }, { status: 500 });
  }

  const hashedToken = linkData.properties.hashed_token;
  const actionLink = `${origin}/auth/confirm?token_hash=${encodeURIComponent(hashedToken)}&type=magiclink&next=${encodeURIComponent("/")}`;
  const firstName = targetProfile.first_name || "there";

  const html = `
    <p>Hi ${firstName},</p>
    <p>Here is your one-click sign-in link to the DK Divorce Coach portal:</p>
    <p><a href="${actionLink}" style="display:inline-block;padding:10px 18px;background:#0F6E56;color:#fff;text-decoration:none;border-radius:6px;">Sign in to your portal</a></p>
    <p style="font-size:13px;color:#666;">This link will sign you in automatically — no password needed. It expires shortly, so use it soon.</p>
    <p style="font-size:13px;color:#666;">If you didn't expect this email, you can ignore it.</p>
    <p>— Diana</p>
  `;

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error: sendErr } = await resend.emails.send({
    from: "DK Divorce Coach <diana@dkdivorcecoach.com>",
    replyTo: "dkdivorcecoach@gmail.com",
    to: deliveryEmail,
    subject: "Your sign-in link to the DK Divorce Coach portal",
    html,
  });
  if (sendErr) {
    return NextResponse.json({ error: sendErr.message || "Email delivery failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true, deliveredTo: deliveryEmail });
}, { action: "POST /api/clients/magic-link", resource: "magic-link" });
