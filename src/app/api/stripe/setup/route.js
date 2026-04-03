import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createCustomer, createSetupIntent } from "@/lib/stripe";

// POST — create a SetupIntent for client to save a card on file
export async function POST() {
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

  // Get or create Stripe customer
  const { data: profile } = await adminClient
    .from("profiles")
    .select("stripe_customer_id, first_name, last_name, preferred_email")
    .eq("id", user.id)
    .single();

  let customerId = profile.stripe_customer_id;

  if (!customerId) {
    const customer = await createCustomer(
      profile.preferred_email || user.email,
      `${profile.first_name} ${profile.last_name}`
    );
    customerId = customer.id;

    await adminClient
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", user.id);
  }

  const setupIntent = await createSetupIntent(customerId);

  return NextResponse.json({
    clientSecret: setupIntent.client_secret,
  });
}
