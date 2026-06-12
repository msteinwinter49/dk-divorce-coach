import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getTokensFromCode } from "@/lib/google-calendar";
import { withErrorCatch, recordAlert } from "@/lib/alert";

export const GET = withErrorCatch(async (request) => {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll() { return cookieStore.getAll(); } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/", request.url));

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") return NextResponse.redirect(new URL("/", request.url));

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/?error=no_code", request.url));
  }

  try {
    const tokens = await getTokensFromCode(code);

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    await adminClient.from("settings").upsert({
      key: "google_refresh_token",
      value: tokens.refresh_token,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.redirect(new URL("/?google_connected=true", request.url));
  } catch (e) {
    console.error("Google OAuth error:", e);
    const alertClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    await recordAlert(alertClient, { category: "gcal_sync", action: "GET /api/calendar/callback", resource: "oauth-callback", error: e?.message || String(e) });
    return NextResponse.redirect(new URL("/?error=google_auth_failed", request.url));
  }
}, { action: "GET /api/calendar/callback", resource: "calendar-callback" });
