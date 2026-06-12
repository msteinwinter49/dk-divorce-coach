// System alert recording and notification utilities.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Wraps a route handler in a top-level try/catch.
// SyntaxError from request.json() → 400.
// Any other throw → recordAlert to DB + 500.
export function withErrorCatch(handler, { action, resource }) {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof SyntaxError) {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
      }
      const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      // DB insert only — client fires ntfy/email after its own retries exhaust
      await recordAlert(admin, { category: "server_error", action, resource, error: err, push: false });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}

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

// Wraps a Supabase query (fn returns {data, error}).
// Tries fn once. If error or throws, waits 500ms and tries once more.
// If second attempt also fails, records an alert and returns { data: null, error: lastError }.
// On success returns the result unchanged. Never throws.
export async function retryableRead(fn, adminClient, alertContext) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await fn();
      if (result.error) {
        lastError = result.error;
      } else {
        return result;
      }
    } catch (e) {
      lastError = e;
    }
    if (attempt === 0) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  await recordAlert(adminClient, {
    ...alertContext,
    error: lastError?.message || String(lastError),
  });
  return { data: null, error: lastError };
}

let lastDbDownAlertAt = 0;

async function pushNtfy(title, body) {
  if (!process.env.NTFY_TOPIC) return;
  try {
    await fetch("https://ntfy.sh/" + process.env.NTFY_TOPIC, {
      method: "POST",
      headers: {
        "Title": title,
        "Content-Type": "text/plain",
      },
      body,
    });
  } catch (e) {
    // Silently ignore ntfy failures
  }
}

async function sendEmailAlert(rows) {
  if (!process.env.ALERT_EMAIL) return;
  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const n = rows.length;
  const bulletList = rows.map(r => `<li style="margin-bottom:8px">${r}</li>`).join("");
  await resend.emails.send({
    from: "DK Divorce Coach <diana@dkdivorcecoach.com>",
    to: process.env.ALERT_EMAIL,
    subject: `System alert(s): ${n} pending`,
    html: `<ul style="font-family:sans-serif;font-size:14px">${bulletList}</ul>`,
  });
}

// Records a system alert to the DB and pushes notifications.
// Pass push: false to skip ntfy/email (DB insert only).
// Never throws — all errors are caught internally.
export async function recordAlert(adminClient, { category, action, resource, summary, error: errorInput, push = true, userId, userName }) {
  const errorMsg = errorInput?.message || String(errorInput ?? "Unknown error");
  const httpMatch = errorMsg.match(/^HTTP (\d{3})$/);
  const base = action ? `${action}${httpMatch ? ` ${httpMatch[1]}` : ""}` : category;
  const title = `DK Divorce Coach — ${base}`;
  const ntfyBody = [summary, errorMsg].filter(Boolean).join(" — ");

  // DB-down path: adminClient is null
  if (!adminClient) {
    if (push) {
      pushNtfy(title, ntfyBody);
      if (Date.now() - lastDbDownAlertAt > 10 * 60 * 1000) {
        try {
          await sendEmailAlert([`<strong>${title}</strong>: ${ntfyBody}`]);
          lastDbDownAlertAt = Date.now();
        } catch {}
      }
    }
    return;
  }

  // Normal path: attempt DB insert
  let insertedId;
  try {
    const { data: inserted, error: insertError } = await adminClient
      .from("system_alerts")
      .insert({ category, action, resource, summary, error_detail: errorMsg, user_id: userId || null, user_name: userName || null })
      .select("id")
      .single();
    if (insertError) throw insertError;
    insertedId = inserted?.id;
  } catch (e) {
    // Fall to DB-down path
    if (push) {
      pushNtfy(title, ntfyBody);
      if (Date.now() - lastDbDownAlertAt > 10 * 60 * 1000) {
        try {
          await sendEmailAlert([`<strong>${title}</strong>: ${ntfyBody}`]);
          lastDbDownAlertAt = Date.now();
        } catch {}
      }
    }
    return;
  }

  if (!push) return;

  // Push ntfy notification
  pushNtfy(title, ntfyBody);

  // Rate-limited email
  try {
    const { data: lastEmailedRow } = await adminClient
      .from("system_alerts")
      .select("emailed_at")
      .not("emailed_at", "is", null)
      .order("emailed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastEmailed = lastEmailedRow?.emailed_at ? new Date(lastEmailedRow.emailed_at).getTime() : null;
    const shouldEmail = lastEmailed === null || Date.now() - lastEmailed > 10 * 60 * 1000;

    if (shouldEmail) {
      const { data: unemaledRows } = await adminClient
        .from("system_alerts")
        .select("id, created_at, category, action, resource, summary, error_detail, user_id, user_name")
        .is("emailed_at", null)
        .order("created_at", { ascending: false });

      if (unemaledRows && unemaledRows.length > 0) {
        const emailRows = unemaledRows.map(row => {
          const label = [row.category, row.action, row.resource].filter(Boolean).join("/");
          const ts = row.created_at
            ? new Date(row.created_at).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true })
            : "";
          const user = row.user_name
            ? `${row.user_name}${row.user_id ? ` (${row.user_id})` : ""}`
            : row.user_id || "";
          const meta = [ts, user].filter(Boolean).join(" · ");
          return `<strong>${label}</strong> — ${row.summary ? row.summary + ": " : ""}${row.error_detail}${meta ? `<br><span style="color:#888;font-size:12px">${meta}</span>` : ""}`;
        });
        await sendEmailAlert(emailRows);
        const ids = unemaledRows.map(r => r.id);
        await adminClient
          .from("system_alerts")
          .update({ emailed_at: new Date().toISOString() })
          .in("id", ids);
      }
    }
  } catch (e) {
    console.error("[alert] rate-limited email block failed:", e?.message || e);
  }
}
