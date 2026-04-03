import twilio from "twilio";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export async function sendSMS(to, body) {
  return client.messages.create({
    body,
    from: process.env.TWILIO_FROM_NUMBER,
    to,
  });
}
