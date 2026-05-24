import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export async function GET() {
  // Verify the caller is an admin
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

  // Use service_role client to bypass RLS and fetch all profiles
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const [
    { data: clients, error },
    { data: { users } },
    { data: memberships },
  ] = await Promise.all([
    adminClient
      .from("profiles")
      .select("id, first_name, last_name, full_name, phone, backup_phone, address_line1, address_line2, address_zip, address_city, address_state, preferred_email, notification_preference, reminder_preference, timezone, role, created_at, bg_occupation, bg_education, bg_relationship, bg_therapist, bg_living, bg_brings, bg_goals, bg_other, stripe_customer_id, is_archived")
      .order("created_at", { ascending: false }),
    adminClient.auth.admin.listUsers(),
    adminClient
      .from("group_members")
      .select("client_id, group_id, is_active, groups(id, name, hourly_rate)"),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const emailMap = {};
  (users || []).forEach(u => { emailMap[u.id] = u.email; });

  const membershipMap = {};
  (memberships || []).forEach(m => { membershipMap[m.client_id] = m; });

  const enriched = (clients || []).map(c => {
    const membership = membershipMap[c.id];
    return {
      ...c,
      email: emailMap[c.id] || c.preferred_email || "",
      group_id: membership?.group_id ?? null,
      group_name: membership?.groups?.name ?? null,
      group_hourly_rate: membership?.groups?.hourly_rate ?? null,
      group_is_active: membership?.is_active ?? null,
      stripe_customer_id: c.stripe_customer_id || null,
      is_archived: c.is_archived ?? false,
    };
  });

  return NextResponse.json({ clients: enriched });
}

// PATCH — admin updates a client's profile
export async function PATCH(request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll() { return cookieStore.getAll(); } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const {
    id, first_name, last_name, phone, backup_phone,
    address_line1, address_line2, address_zip, address_city, address_state,
    preferred_email, notification_preference, reminder_preference, timezone,
    bg_occupation, bg_education, bg_relationship, bg_therapist,
    bg_living, bg_brings, bg_goals, bg_other, is_archived,
  } = await request.json();
  if (!id) return NextResponse.json({ error: "Client id is required" }, { status: 400 });

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const updates = {};
  if (first_name !== undefined) { updates.first_name = first_name?.trim() || undefined; }
  if (last_name !== undefined) { updates.last_name = last_name?.trim() || undefined; }
  if (first_name !== undefined && last_name !== undefined) {
    updates.full_name = `${first_name.trim()} ${last_name.trim()}`;
  }
  if (phone !== undefined) updates.phone = phone?.trim() || null;
  if (backup_phone !== undefined) updates.backup_phone = backup_phone?.trim() || null;
  if (address_line1 !== undefined) updates.address_line1 = address_line1?.trim() || null;
  if (address_line2 !== undefined) updates.address_line2 = address_line2?.trim() || null;
  if (address_zip !== undefined) updates.address_zip = address_zip?.trim() || null;
  if (address_city !== undefined) updates.address_city = address_city?.trim() || null;
  if (address_state !== undefined) updates.address_state = address_state?.trim() || null;
  if (preferred_email !== undefined) updates.preferred_email = preferred_email?.trim() || undefined;
  if (notification_preference !== undefined) updates.notification_preference = notification_preference;
  if (reminder_preference !== undefined) updates.reminder_preference = reminder_preference;
  if (timezone !== undefined) updates.timezone = timezone;
  if (bg_occupation !== undefined) updates.bg_occupation = bg_occupation?.trim() || null;
  if (bg_education !== undefined) updates.bg_education = bg_education?.trim() || null;
  if (bg_relationship !== undefined) updates.bg_relationship = bg_relationship?.trim() || null;
  if (bg_therapist !== undefined) updates.bg_therapist = bg_therapist?.trim() || null;
  if (bg_living !== undefined) updates.bg_living = bg_living?.trim() || null;
  if (bg_brings !== undefined) updates.bg_brings = bg_brings?.trim() || null;
  if (bg_goals !== undefined) updates.bg_goals = bg_goals?.trim() || null;
  if (bg_other !== undefined) updates.bg_other = bg_other?.trim() || null;
  if (is_archived !== undefined) updates.is_archived = is_archived;

  const { data, error } = await adminClient
    .from("profiles")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE — fully delete a client and all their data
export async function DELETE(request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll() { return cookieStore.getAll(); } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { data: callerProfile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (callerProfile?.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "Client id is required" }, { status: 400 });

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Fetch stripe_customer_id
  const { data: profile } = await adminClient.from("profiles").select("stripe_customer_id").eq("id", id).single();

  // Delete storage files
  const { data: files } = await adminClient.storage.from("documents").list(id);
  if (files?.length) {
    await adminClient.storage.from("documents").remove(files.map(f => `${id}/${f.name}`));
  }

  // Delete messages
  await adminClient.from("messages").delete().or(`sender_id.eq.${id},conversation_id.eq.${id}`);

  // Delete Stripe customer if present
  if (profile?.stripe_customer_id) {
    try {
      await stripe.customers.del(profile.stripe_customer_id);
    } catch (err) {
      return NextResponse.json({ error: `Stripe error: ${err.message}` }, { status: 500 });
    }
  }

  // Delete auth user — cascades profiles, documents, bookings, group_members, balance_ledger, purchases
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
