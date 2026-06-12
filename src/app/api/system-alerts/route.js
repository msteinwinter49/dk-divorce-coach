import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { withErrorCatch, recordAlert } from "@/lib/alert";

async function getAdminClient(request) {
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
  if (!user) return { error: "Not authenticated", status: 401 };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") return { error: "Admin access required", status: 403 };

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  return { adminClient };
}

export const GET = withErrorCatch(async (request) => {
  const { adminClient, error, status } = await getAdminClient(request);
  if (error) return NextResponse.json({ error }, { status });

  const { searchParams } = new URL(request.url);

  if (searchParams.get("unread_count") !== null) {
    const { count, error: dbError } = await adminClient
      .from("system_alerts")
      .select("*", { count: "exact", head: true })
      .eq("acknowledged", false);

    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
    return NextResponse.json({ count: count ?? 0 });
  }

  if (searchParams.get("format") === "csv") {
    const { data, error: dbError } = await adminClient
      .from("system_alerts")
      .select("id, created_at, category, action, resource, summary, error_detail, acknowledged, user_id, user_name, user_email")
      .order("created_at", { ascending: false });

    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

    const headers = ["id", "created_at", "category", "action", "resource", "summary", "error_detail", "acknowledged", "user_id", "user_name", "user_email"];
    const escapeField = (val) => {
      const str = val == null ? "" : String(val);
      return str.includes(",") ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const rows = (data || []).map(row =>
      headers.map(h => escapeField(row[h])).join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="system-alerts.csv"',
      },
    });
  }

  const limit = parseInt(searchParams.get("limit") || "100");
  const offset = parseInt(searchParams.get("offset") || "0");

  const { data, count, error: dbError } = await adminClient
    .from("system_alerts")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ alerts: data || [], total: count });
}, { action: "GET /api/system-alerts", resource: "system-alerts" });

// Client-side alert submission — any authenticated user, no admin required.
// retryFetch() POSTs here after exhausting retries so one ntfy/email fires per incident.
export const POST = withErrorCatch(async (request) => {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll() { return cookieStore.getAll(); } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { category = "client_error", action, resource, summary, error: errorMsg } = await request.json();
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: profile } = await adminClient
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", user.id)
    .single();
  const userName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || null;

  await recordAlert(adminClient, { category, action, resource, summary, error: errorMsg, userId: user.id, userName, userEmail: user.email });
  return NextResponse.json({ ok: true });
}, { action: "POST /api/system-alerts", resource: "system-alerts" });

export const PATCH = withErrorCatch(async (request) => {
  const { adminClient, error, status } = await getAdminClient(request);
  if (error) return NextResponse.json({ error }, { status });

  const { error: dbError } = await adminClient
    .from("system_alerts")
    .update({ acknowledged: true })
    .eq("acknowledged", false);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ success: true });
}, { action: "PATCH /api/system-alerts", resource: "system-alerts" });
