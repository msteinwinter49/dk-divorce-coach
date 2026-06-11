import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyAdmin } from "@/lib/notifications";
import { recordAlert } from "@/lib/alert";

export async function POST(request) {
  const { first_name, last_name, email, phone } = await request.json();

  const formatPhone = (value) => {
    if (!value) return "Not provided";
    const digits = value.replace(/\D/g, "");
    if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    return value;
  };

  try {
    await notifyAdmin(
      `New client registered: ${first_name} ${last_name}`,
      `
        <h2>New Client Registration</h2>
        <p>${first_name} ${last_name} has completed their intake form and is now active in the portal.</p>
        <p><strong>Name:</strong> ${first_name} ${last_name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${formatPhone(phone)}</p>
      `,
      null
    );
  } catch (err) {
    console.error("intake-notify email error:", err);
    const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    await recordAlert(adminClient, { category: "notification", action: "SEND", resource: "intake_email", summary: `${first_name} ${last_name}`, error: err?.message || String(err) });
  }

  return NextResponse.json({ success: true });
}
