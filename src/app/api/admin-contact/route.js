import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { withErrorCatch } from "@/lib/alert";

export const GET = withErrorCatch(async () => {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll() { return cookieStore.getAll(); } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const [settingRes, profileRes] = await Promise.all([
    admin.from("settings").select("value").eq("key", "min_client_change_notice_hours").maybeSingle(),
    admin.from("profiles").select("phone").eq("role", "admin").limit(1).maybeSingle(),
  ]);

  return NextResponse.json({
    min_notice_hours: settingRes.data?.value ? Number(settingRes.data.value) : 24,
    admin_phone: profileRes.data?.phone || "",
  });
}, { action: "GET /api/admin-contact", resource: "admin-contact" });
