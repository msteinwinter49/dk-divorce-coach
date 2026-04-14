import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

// Email-confirmation callback for Supabase OTP flows (magic links, invites,
// password recovery, email change). Uses the hashed_token query param emitted
// by auth.admin.generateLink and calls verifyOtp server-side so the new session
// cookie is written on our domain — swapping any prior session (e.g. an admin
// who clicked a client's magic link in the same browser).
export async function GET(request) {
  const url = new URL(request.url);
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = url.searchParams.get("next") || "/";

  if (!token_hash || !type) {
    return NextResponse.redirect(new URL("/?auth_error=missing_token", url.origin));
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  // Clear any existing session first so the new OTP result replaces it cleanly.
  await supabase.auth.signOut();

  const { error } = await supabase.auth.verifyOtp({ type, token_hash });
  if (error) {
    return NextResponse.redirect(new URL(`/?auth_error=${encodeURIComponent(error.message)}`, url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
