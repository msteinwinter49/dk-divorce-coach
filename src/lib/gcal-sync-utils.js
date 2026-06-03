// Shared utilities for Google Calendar sync retries and failure alerting.

function isAuthError(e) {
  const status = e?.response?.status || e?.status || e?.code;
  const msg = e?.message || "";
  return status === 401 || status === 403 ||
    msg.includes("invalid_grant") ||
    msg.includes("Token has been expired") ||
    msg.includes("Invalid Credentials");
}

// Run an async fn with up to 2 retries (delays: 2s then 4s).
// Auth errors are thrown immediately — retrying won't help.
export async function retryWithBackoff(fn) {
  const delays = [2000, 4000];
  let lastError;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (isAuthError(e)) throw e;
      if (attempt < delays.length) {
        await new Promise(r => setTimeout(r, delays[attempt]));
      }
    }
  }
  throw lastError;
}

// Send a sync failure alert to the tech_support_email configured in settings.
// Never throws — email failure must not cascade into the caller.
export async function sendSyncFailureEmail(adminClient, { action, resource, summary, date, error }) {
  try {
    const { data } = await adminClient
      .from("settings")
      .select("value")
      .eq("key", "tech_support_email")
      .maybeSingle();
    const to = data?.value;
    if (!to) return;

    const errorMsg = error || "Unknown error";
    const looksLikeAuth = /invalid_grant|Token has been expired|Invalid Credentials|401|403/.test(errorMsg);
    const hint = looksLikeAuth
      ? "This looks like an authentication error. Reconnect Google Calendar in Admin &gt; Settings."
      : "This may be a transient network issue. Check Vercel logs for more detail.";

    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: "DK Divorce Coach <diana@dkdivorcecoach.com>",
      to,
      subject: `Google Calendar sync failed — ${action} ${resource}`,
      html: `
        <p style="font-family:sans-serif;font-size:14px">
          A Google Calendar sync operation failed after 3 attempts and requires attention.
        </p>
        <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;margin-bottom:16px">
          <tr><td style="padding:4px 16px 4px 0;color:#666">Action</td><td><strong>${action}</strong></td></tr>
          <tr><td style="padding:4px 16px 4px 0;color:#666">Resource</td><td>${resource}</td></tr>
          ${summary ? `<tr><td style="padding:4px 16px 4px 0;color:#666">Title / Client</td><td>${summary}</td></tr>` : ""}
          ${date ? `<tr><td style="padding:4px 16px 4px 0;color:#666">Date</td><td>${date}</td></tr>` : ""}
          <tr><td style="padding:4px 16px 4px 0;color:#666">Error</td><td style="color:#c0392b">${errorMsg}</td></tr>
        </table>
        <p style="font-family:sans-serif;font-size:13px;color:#666">${hint}</p>
      `,
    });
  } catch (e) {
    console.error("[gcal-sync] failed to send failure alert email:", e?.message || e);
  }
}
