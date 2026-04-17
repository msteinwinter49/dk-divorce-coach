import { Resend } from "resend";
import { sendSMS } from "./twilio";
import { createClient } from "@supabase/supabase-js";

const resend = new Resend(process.env.RESEND_API_KEY);

// Business runs on Eastern Time. All client-facing date/time copy is rendered
// in ET and explicitly labeled, regardless of server or viewer timezone.
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const WEEKDAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

// "2026-04-26" → "Friday, April 26, 2026"
export function formatSessionDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  // Noon UTC avoids day-off-by-one when getUTCDay is used on the server.
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return `${WEEKDAYS[dt.getUTCDay()]}, ${MONTHS[m - 1]} ${d}, ${y}`;
}

// "15:45" → "3:45 pm ET"
export function formatSessionTime(timeSlot) {
  if (!timeSlot) return "";
  const [h, m] = timeSlot.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm} ET`;
}

// "2026-04-26", "15:45" → "Friday, April 26, 2026 at 3:45 pm ET"
export function formatSessionDateTime(dateStr, timeSlot) {
  return `${formatSessionDate(dateStr)} at ${formatSessionTime(timeSlot)}`;
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Send email via Resend
async function sendEmail(to, subject, html) {
  return resend.emails.send({
    from: "DK Divorce Coach <diana@dkdivorcecoach.com>",
    replyTo: "dkdivorcecoach@gmail.com",
    to,
    subject,
    html,
  });
}

// Notify a client based on their notification preference
export async function notifyClient(profile, subject, html, smsBody) {
  const pref = profile.notification_preference || "email";
  const results = { email: null, sms: null };

  if ((pref === "email" || pref === "both") && profile.preferred_email) {
    results.email = await sendEmail(profile.preferred_email, subject, html);
  }

  if ((pref === "text" || pref === "both") && profile.phone) {
    results.sms = await sendSMS(profile.phone, smsBody);
  }

  return results;
}

// Notify Diana (admin) — always email + text
export async function notifyAdmin(subject, html, smsBody) {
  const supabase = getSupabase();
  const results = { email: null, sms: null };

  // Get admin notification email from settings
  const { data: setting } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "contact_email")
    .single();

  if (setting?.value) {
    results.email = await sendEmail(setting.value, subject, html);
  }

  // Get admin profile for phone number
  const { data: admin } = await supabase
    .from("profiles")
    .select("phone")
    .eq("role", "admin")
    .limit(1)
    .single();

  if (admin?.phone && smsBody) {
    results.sms = await sendSMS(admin.phone, smsBody);
  }

  return results;
}
