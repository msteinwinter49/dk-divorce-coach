import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Create a Stripe customer for a client
export async function createCustomer(email, name) {
  return stripe.customers.create({ email, name });
}

// Create a SetupIntent so the client can save a card on file
export async function createSetupIntent(customerId) {
  return stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ["card"],
  });
}

// Charge a client's card on file
export async function chargeClient(customerId, amountCents, description) {
  // Get the customer's default payment method
  const customer = await stripe.customers.retrieve(customerId);
  const paymentMethod =
    customer.invoice_settings?.default_payment_method ||
    (await getDefaultPaymentMethod(customerId));

  if (!paymentMethod) {
    throw new Error("No payment method on file");
  }

  return stripe.paymentIntents.create({
    amount: amountCents,
    currency: "usd",
    customer: customerId,
    payment_method: paymentMethod,
    off_session: true,
    confirm: true,
    description,
  });
}

// Get the first available payment method for a customer
async function getDefaultPaymentMethod(customerId) {
  const methods = await stripe.paymentMethods.list({
    customer: customerId,
    type: "card",
    limit: 1,
  });
  return methods.data[0]?.id || null;
}

// Construct and verify a webhook event
export function constructWebhookEvent(body, signature) {
  return stripe.webhooks.constructEvent(
    body,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET
  );
}

export { stripe };
