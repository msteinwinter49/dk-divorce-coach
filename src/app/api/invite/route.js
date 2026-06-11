import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { withErrorCatch } from "@/lib/alert";

export const POST = withErrorCatch(async (request) => {
  const { email, makeAdmin, group_id, group_name, hourly_rate } = await request.json();
  const origin = new URL(request.url).origin.replace("//0.0.0.0", "//localhost");

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const hasExistingGroup = !!group_id;
  const hasNewGroup = !!group_name?.trim();

  if (!makeAdmin) {
    if (!hasExistingGroup && !hasNewGroup) {
      return NextResponse.json({ error: "Either group_id or group_name is required" }, { status: 400 });
    }
    if (hasNewGroup && (!hourly_rate || isNaN(Number(hourly_rate)) || Number(hourly_rate) <= 0)) {
      return NextResponse.json({ error: "A valid hourly rate is required when creating a new group" }, { status: 400 });
    }
  }

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
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/auth/confirm`,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (data?.user?.id) {
    if (makeAdmin) {
      await adminClient
        .from("profiles")
        .update({ role: "admin" })
        .eq("id", data.user.id);
    } else {
      let resolvedGroupId = group_id;

      if (hasNewGroup) {
        const { data: newGroup, error: groupErr } = await adminClient
          .from("groups")
          .insert({ name: group_name.trim(), hourly_rate: Number(hourly_rate) })
          .select()
          .single();
        if (groupErr) {
          return NextResponse.json({ error: groupErr.message }, { status: 500 });
        }
        resolvedGroupId = newGroup.id;
      }

      await adminClient
        .from("group_members")
        .upsert({ client_id: data.user.id, group_id: resolvedGroupId, is_active: true }, { onConflict: "client_id" });
    }
  }

  return NextResponse.json({ success: true });
}, { action: "POST /api/invite", resource: "invite" });
