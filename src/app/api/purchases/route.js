import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { chargeClient, refundPaymentIntent } from "@/lib/stripe";
import { notifyClient } from "@/lib/notifications";
import { recordAlert, withErrorCatch } from "@/lib/alert";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function getGroupId(admin, clientId) {
  const { data } = await admin
    .from("group_members")
    .select("group_id")
    .eq("client_id", clientId)
    .maybeSingle();
  return data?.group_id ?? null;
}

export const GET = withErrorCatch(async (request) => {
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

  const { data: membership } = await admin
    .from("group_members")
    .select("group_id, groups(hourly_rate)")
    .eq("client_id", targetId)
    .maybeSingle();
  const groupId = membership?.group_id ?? null;
  if (!groupId) return NextResponse.json({ balance_minutes: 0, hourly_rate: null });

  const { data } = await admin
    .from("group_balances")
    .select("balance_minutes")
    .eq("group_id", groupId)
    .maybeSingle();

  return NextResponse.json({
    balance_minutes: data?.balance_minutes ?? 0,
    hourly_rate: membership?.groups?.hourly_rate ?? null,
  });
}, { action: "GET /api/purchases", resource: "purchases" });

export const POST = withErrorCatch(async (request) => {
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

  const { data: membership } = await admin
    .from("group_members")
    .select("group_id, groups(hourly_rate)")
    .eq("client_id", targetClientId)
    .maybeSingle();

  if (!membership?.group_id) {
    return NextResponse.json({ error: "Client has no group assigned. Please contact your coach." }, { status: 400 });
  }

  const groupId = membership.group_id;
  const groupHourlyRate = membership.groups?.hourly_rate ?? null;

  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id, first_name, last_name, preferred_email, phone, notification_preference")
    .eq("id", targetClientId)
    .single();
  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: "No card on file. Please add a payment method first." }, { status: 400 });
  }

  const totalMinutes = matrix.duration_min * matrix.package_size;
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + matrix.expires_months);

  const effectivePriceCents = groupHourlyRate
    ? Math.round(matrix.duration_min * matrix.package_size / 60 * groupHourlyRate * 100)
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
      group_id: groupId,
      purchaser_client_id: targetClientId,
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
    await recordAlert(admin, { category: "payment", action: "CREATE", resource: "purchase", summary: `stripe pi ${paymentIntentId}`, error: purchaseErr.message });
    return NextResponse.json({
      error: "Charge succeeded but recording the purchase failed. Please contact support.",
      stripe_payment_intent_id: paymentIntentId,
    }, { status: 500 });
  }

  const { data: ledgerRows, error: ledgerErr } = await admin.rpc("apply_balance_delta", {
    p_group_id: groupId,
    p_delta_minutes: totalMinutes,
    p_source_type: "purchase",
    p_source_id: purchase.id,
    p_amount_cents: effectivePriceCents,
    p_stripe_payment_intent_id: paymentIntentId,
    p_created_by: user.id,
    p_actor_client_id: targetClientId,
  });

  if (ledgerErr) {
    console.error("Ledger write failed after purchase insert", purchase.id, ledgerErr);
    await recordAlert(admin, { category: "payment", action: "CREATE", resource: "balance_ledger", summary: `purchase ${purchase.id}`, error: ledgerErr.message });
    return NextResponse.json({
      error: "Purchase recorded but balance update failed. Please contact support.",
      purchase,
    }, { status: 500 });
  }

  const balanceAfter = ledgerRows?.[0]?.balance_after ?? null;

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
    await recordAlert(admin, { category: "email", action: "POST /api/purchases", resource: "purchase-confirmation", summary: `purchase ${purchase.id}`, error: e?.message || String(e) });
  }

  return NextResponse.json({ purchase, balance_after: balanceAfter });
}, { action: "POST /api/purchases", resource: "purchases" });

export const PATCH = withErrorCatch(async (request) => {
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
  const { action, client_id, group_id: directGroupId } = body;
  if (!client_id && !directGroupId) return NextResponse.json({ error: "client_id or group_id is required" }, { status: 400 });

  let groupId = directGroupId || null;
  if (!groupId && client_id) {
    groupId = await getGroupId(adminSupabase(), client_id);
    if (!groupId) return NextResponse.json({ error: "Client has no group assigned" }, { status: 400 });
  }

  if (action === "admin_adjust" || !action) {
    const { delta_minutes, note } = body;
    if (delta_minutes === undefined || delta_minutes === 0) {
      return NextResponse.json({ error: "Non-zero delta_minutes is required" }, { status: 400 });
    }
    const { data: ledgerRows, error } = await adminSupabase().rpc("apply_balance_delta", {
      p_group_id: groupId,
      p_delta_minutes: delta_minutes,
      p_source_type: "admin_adjust",
      p_note: note || null,
      p_created_by: user.id,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ balance_after: ledgerRows?.[0]?.balance_after ?? null });
  }

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

    const adminForAlert = adminSupabase();
    const { error } = await adminForAlert.rpc("apply_balance_delta", {
      p_group_id: groupId,
      p_delta_minutes: 0,
      p_source_type: "admin_charge",
      p_amount_cents: amount_cents,
      p_stripe_payment_intent_id: paymentIntentId,
      p_note: note || null,
      p_created_by: user.id,
    });
    if (error) {
      console.error("Ledger write failed after admin charge", paymentIntentId, error);
      await recordAlert(adminForAlert, { category: "payment", action: "CREATE", resource: "balance_ledger", summary: `admin_charge pi ${paymentIntentId}`, error: error.message });
    }

    return NextResponse.json({ charged_dollars: dollars, payment_intent_id: paymentIntentId });
  }

  if (action === "admin_refund") {
    const { amount_dollars, note } = body;
    const dollars = parseFloat(amount_dollars);
    if (!dollars || dollars <= 0) {
      return NextResponse.json({ error: "amount_dollars must be a positive number" }, { status: 400 });
    }
    const amount_cents = Math.round(dollars * 100);

    const { data: priorCharges } = await adminSupabase()
      .from("balance_ledger")
      .select("stripe_payment_intent_id, amount_cents")
      .eq("group_id", groupId)
      .in("source_type", ["purchase", "admin_charge"])
      .not("stripe_payment_intent_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(20);

    if (!priorCharges?.length) {
      return NextResponse.json({ error: "No prior charges found for this client." }, { status: 400 });
    }

    const target = priorCharges[0];

    let refund;
    try {
      refund = await refundPaymentIntent(target.stripe_payment_intent_id, amount_cents);
    } catch (e) {
      return NextResponse.json({ error: (e.message || "Refund failed").replace(/\.+$/, "") }, { status: 402 });
    }

    const adminForAlert = adminSupabase();
    const { error } = await adminForAlert.rpc("apply_balance_delta", {
      p_group_id: groupId,
      p_delta_minutes: 0,
      p_source_type: "admin_refund",
      p_amount_cents: -amount_cents,
      p_stripe_payment_intent_id: target.stripe_payment_intent_id,
      p_note: note || null,
      p_created_by: user.id,
    });
    if (error) {
      console.error("Ledger write failed after admin refund", refund.id, error);
      await recordAlert(adminForAlert, { category: "payment", action: "CREATE", resource: "balance_ledger", summary: `admin_refund ${refund.id}`, error: error.message });
    }

    return NextResponse.json({ refunded_dollars: dollars, refund_id: refund.id });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}, { action: "PATCH /api/purchases", resource: "purchases" });
