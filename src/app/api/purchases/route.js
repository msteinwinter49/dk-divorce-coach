import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { chargeClient, refundPaymentIntent } from "@/lib/stripe";
import { notifyClient } from "@/lib/notifications";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// GET — return the authenticated client's current minute balance.
export async function GET(request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll() { return cookieStore.getAll(); } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("client_id");

  const admin = adminSupabase();
  const targetId = clientId || user.id;
  const { data } = await admin
    .from("client_balances")
    .select("balance_minutes")
    .eq("client_id", targetId)
    .maybeSingle();

  return NextResponse.json({ balance_minutes: data?.balance_minutes ?? 0 });
}

// POST — purchase a pricing_matrix package. Charges card on file.
// Body: { matrix_id, client_id? }
// If client_id is provided AND caller is admin, the purchase is made on behalf
// of that client. Otherwise the caller is the buyer.
// On Stripe decline: 402, no DB writes.
// On success: writes purchases row + balance_ledger row, emails the client, returns { purchase, balance_after }.
export async function POST(request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll() { return cookieStore.getAll(); } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { matrix_id, client_id } = await request.json();
  if (!matrix_id) return NextResponse.json({ error: "matrix_id is required" }, { status: 400 });

  const admin = adminSupabase();

  // Resolve target client (self by default; admins may purchase on behalf of another client)
  let targetClientId = user.id;
  if (client_id && client_id !== user.id) {
    const { data: callerProfile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (callerProfile?.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    targetClientId = client_id;
  }

  const { data: matrix, error: matrixErr } = await admin
    .from("pricing_matrix")
    .select("id, duration_min, package_size, price_cents, expires_months, is_active")
    .eq("id", matrix_id)
    .single();
  if (matrixErr || !matrix) return NextResponse.json({ error: "Package not found" }, { status: 404 });
  if (!matrix.is_active) return NextResponse.json({ error: "Package no longer available" }, { status: 410 });

  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id, first_name, last_name, preferred_email, phone, notification_preference, hourly_rate")
    .eq("id", targetClientId)
    .single();
  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: "No card on file. Please add a payment method first." }, { status: 400 });
  }

  const totalMinutes = matrix.duration_min * matrix.package_size;
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + matrix.expires_months);

  const effectivePriceCents = profile.hourly_rate
    ? Math.round(matrix.duration_min * matrix.package_size / 60 * profile.hourly_rate * 100)
    : matrix.price_cents;

  let paymentIntentId;
  try {
    const payment = await chargeClient(
      profile.stripe_customer_id,
      effectivePriceCents,
      `Coaching package: ${matrix.package_size} × ${matrix.duration_min}min`
    );
    paymentIntentId = payment.id;
  } catch (e) {
    const reason = (e.message || "Payment failed").replace(/\.+$/, "");
    return NextResponse.json({ error: reason }, { status: 402 });
  }

  const { data: purchase, error: purchaseErr } = await admin
    .from("purchases")
    .insert({
      client_id: targetClientId,
      matrix_id: matrix.id,
      duration_min: matrix.duration_min,
      package_size: matrix.package_size,
      total_minutes: totalMinutes,
      amount_cents: effectivePriceCents,
      expires_months: matrix.expires_months,
      expires_at: expiresAt.toISOString(),
      stripe_payment_intent_id: paymentIntentId,
      status: "succeeded",
    })
    .select()
    .single();

  if (purchaseErr) {
    console.error("Purchase insert failed after Stripe charge", paymentIntentId, purchaseErr);
    return NextResponse.json({
      error: "Charge succeeded but recording the purchase failed. Please contact support.",
      stripe_payment_intent_id: paymentIntentId,
    }, { status: 500 });
  }

  const { data: ledgerRows, error: ledgerErr } = await admin.rpc("apply_balance_delta", {
    p_client_id: targetClientId,
    p_delta_minutes: totalMinutes,
    p_source_type: "purchase",
    p_source_id: purchase.id,
    p_amount_cents: effectivePriceCents,
    p_stripe_payment_intent_id: paymentIntentId,
    p_created_by: user.id,
  });

  if (ledgerErr) {
    console.error("Ledger write failed after purchase insert", purchase.id, ledgerErr);
    return NextResponse.json({
      error: "Purchase recorded but balance update failed. Please contact support.",
      purchase,
    }, { status: 500 });
  }

  const balanceAfter = ledgerRows?.[0]?.balance_after ?? null;

  // Email the client. Best-effort — do not fail the response if the email errors.
  try {
    const totalDollars = (effectivePriceCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const expiresLabel = expiresAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const sessionWord = matrix.package_size === 1 ? "session" : "sessions";
    await notifyClient(
      profile,
      "Your coaching package purchase",
      `<h2>Package purchased</h2>
       <p>Hi ${profile.first_name || "there"},</p>
       <p>Your purchase has been recorded. Here are the details:</p>
       <ul>
         <li><strong>Package:</strong> ${matrix.package_size} × ${matrix.duration_min} min ${sessionWord}</li>
         <li><strong>Total minutes added:</strong> ${totalMinutes} min</li>
         <li><strong>Sessions expire:</strong> ${expiresLabel}</li>
         <li><strong>Amount charged:</strong> $${totalDollars}</li>
         <li><strong>Your new balance:</strong> ${balanceAfter} min</li>
       </ul>
       <p>Reply to this email if anything looks off.</p>`,
      `Package purchased: ${matrix.package_size} × ${matrix.duration_min}min ($${totalDollars}). New balance: ${balanceAfter} min.`
    );
  } catch (e) {
    console.error("Purchase email failed", purchase.id, e);
  }

  return NextResponse.json({ purchase, balance_after: balanceAfter });
}

// PATCH — admin manual actions. action = 'admin_adjust' | 'admin_charge'
export async function PATCH(request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll() { return cookieStore.getAll(); } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: callerProfile } = await adminSupabase()
    .from("profiles").select("role").eq("id", user.id).single();
  if (callerProfile?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await request.json();
  const { action, client_id } = body;
  if (!client_id) return NextResponse.json({ error: "client_id is required" }, { status: 400 });

  // --- admin_adjust: minutes only, no Stripe ---
  if (action === "admin_adjust" || !action) {
    const { delta_minutes, note } = body;
    if (delta_minutes === undefined || delta_minutes === 0) {
      return NextResponse.json({ error: "Non-zero delta_minutes is required" }, { status: 400 });
    }
    const { data: ledgerRows, error } = await adminSupabase().rpc("apply_balance_delta", {
      p_client_id: client_id,
      p_delta_minutes: delta_minutes,
      p_source_type: "admin_adjust",
      p_note: note || null,
      p_created_by: user.id,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ balance_after: ledgerRows?.[0]?.balance_after ?? null });
  }

  // --- admin_charge: Stripe only, no minutes ---
  if (action === "admin_charge") {
    const { amount_dollars, note } = body;
    const dollars = parseFloat(amount_dollars);
    if (!dollars || dollars <= 0) {
      return NextResponse.json({ error: "amount_dollars must be a positive number" }, { status: 400 });
    }
    const amount_cents = Math.round(dollars * 100);

    const { data: profile } = await adminSupabase()
      .from("profiles").select("stripe_customer_id").eq("id", client_id).single();
    if (!profile?.stripe_customer_id) {
      return NextResponse.json({ error: "No card on file for this client." }, { status: 400 });
    }

    let paymentIntentId;
    try {
      const payment = await chargeClient(
        profile.stripe_customer_id,
        amount_cents,
        note || "Manual coaching charge"
      );
      paymentIntentId = payment.id;
    } catch (e) {
      return NextResponse.json({ error: (e.message || "Payment failed").replace(/\.+$/, "") }, { status: 402 });
    }

    const { error } = await adminSupabase().rpc("apply_balance_delta", {
      p_client_id: client_id,
      p_delta_minutes: 0,
      p_source_type: "admin_charge",
      p_amount_cents: amount_cents,
      p_stripe_payment_intent_id: paymentIntentId,
      p_note: note || null,
      p_created_by: user.id,
    });
    if (error) {
      console.error("Ledger write failed after admin charge", paymentIntentId, error);
    }

    return NextResponse.json({ charged_dollars: dollars, payment_intent_id: paymentIntentId });
  }

  // --- admin_refund: Stripe refund only, capped at prior charges for this client ---
  if (action === "admin_refund") {
    const { amount_dollars, note } = body;
    const dollars = parseFloat(amount_dollars);
    if (!dollars || dollars <= 0) {
      return NextResponse.json({ error: "amount_dollars must be a positive number" }, { status: 400 });
    }
    const amount_cents = Math.round(dollars * 100);

    // Find prior succeeded PaymentIntents for this client, most recent first
    const { data: priorCharges } = await adminSupabase()
      .from("balance_ledger")
      .select("stripe_payment_intent_id, amount_cents")
      .eq("client_id", client_id)
      .in("source_type", ["purchase", "admin_charge"])
      .not("stripe_payment_intent_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(20);

    if (!priorCharges?.length) {
      return NextResponse.json({ error: "No prior charges found for this client." }, { status: 400 });
    }

    // Use the most recent PaymentIntent as the refund target
    const target = priorCharges[0];

    let refund;
    try {
      refund = await refundPaymentIntent(target.stripe_payment_intent_id, amount_cents);
    } catch (e) {
      return NextResponse.json({ error: (e.message || "Refund failed").replace(/\.+$/, "") }, { status: 402 });
    }

    const { error } = await adminSupabase().rpc("apply_balance_delta", {
      p_client_id: client_id,
      p_delta_minutes: 0,
      p_source_type: "admin_refund",
      p_amount_cents: -amount_cents,
      p_stripe_payment_intent_id: target.stripe_payment_intent_id,
      p_note: note || null,
      p_created_by: user.id,
    });
    if (error) {
      console.error("Ledger write failed after admin refund", refund.id, error);
    }

    return NextResponse.json({ refunded_dollars: dollars, refund_id: refund.id });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
