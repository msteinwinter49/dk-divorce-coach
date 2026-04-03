import { NextResponse } from "next/server";
import { constructWebhookEvent } from "@/lib/stripe";
import { createClient } from "@supabase/supabase-js";

export async function POST(request) {
  // App Router gives us the raw body via request.text()
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  let event;
  try {
    event = constructWebhookEvent(body, signature);
  } catch (e) {
    console.error("Webhook signature verification failed:", e.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  switch (event.type) {
    case "payment_intent.succeeded": {
      const paymentIntent = event.data.object;
      // Update booking payment status if needed
      await supabase
        .from("bookings")
        .update({ stripe_payment_intent_id: paymentIntent.id })
        .eq("stripe_payment_intent_id", paymentIntent.id);
      break;
    }

    case "payment_intent.payment_failed": {
      const paymentIntent = event.data.object;
      console.error("Payment failed:", paymentIntent.id, paymentIntent.last_payment_error?.message);
      break;
    }

    case "setup_intent.succeeded": {
      // Card saved successfully — set as default payment method
      const setupIntent = event.data.object;
      if (setupIntent.customer && setupIntent.payment_method) {
        const { stripe } = await import("@/lib/stripe");
        await stripe.customers.update(setupIntent.customer, {
          invoice_settings: {
            default_payment_method: setupIntent.payment_method,
          },
        });
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
