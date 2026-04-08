import twilio from "twilio";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

function toE164(phone) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

export async function sendSMS(to, body) {
  const e164 = toE164(to);
  console.log(`[SMS] Sending to ${e164} from ${process.env.TWILIO_FROM_NUMBER}`);
  try {
    const result = await client.messages.create({
      body,
      from: process.env.TWILIO_FROM_NUMBER,
      to: e164,
    });
    console.log(`[SMS] Sent: ${result.sid} status=${result.status}`);
    return result;
  } catch (err) {
    console.error(`[SMS] Failed:`, err.message, err.code, err.moreInfo);
    throw err;
  }
}
