import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

// GET — fetch the client's card on file. Admins may pass ?client_id=X to look up
// another client's card.
export async function GET(request) {
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

  let targetId = user.id;
  const url = new URL(request.url);
  const clientIdParam = url.searchParams.get("client_id");
  if (clientIdParam && clientIdParam !== user.id) {
    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (callerProfile?.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    targetId = clientIdParam;
  }

  const { data: profile } = await adminClient
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", targetId)
    .single();

  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ card: null });
  }

  const methods = await stripe.paymentMethods.list({
    customer: profile.stripe_customer_id,
    type: "card",
    limit: 1,
  });

  const pm = methods.data[0];
  if (!pm) return NextResponse.json({ card: null });

  return NextResponse.json({
    card: {
      brand: pm.card.brand,
      last4: pm.card.last4,
      exp_month: pm.card.exp_month,
      exp_year: pm.card.exp_year,
    },
  });
}
