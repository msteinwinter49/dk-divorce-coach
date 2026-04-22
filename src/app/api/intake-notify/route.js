import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { NextResponse } from "next/server";

export async function POST(request) {
  const { first_name, last_name, email, phone } = await request.json();

  const formatPhone = (value) => {
    if (!value) return "Not provided";
    const digits = value.replace(/\D/g, "");
    if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    return value;
  };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: setting } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "contact_email")
    .single();

  const contactEmail = setting?.value;
  if (!contactEmail) return NextResponse.json({ success: true });

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: "DK Divorce Coach <diana@dkdivorcecoach.com>",
      replyTo: email,
      to: contactEmail,
      subject: `New client registered: ${first_name} ${last_name}`,
      html: `
        <h2>New Client Registration</h2>
        <p>${first_name} ${last_name} has completed their intake form and is now active in the portal.</p>
        <p><strong>Name:</strong> ${first_name} ${last_name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${formatPhone(phone)}</p>
      `,
    });
  } catch (err) {
    console.error("intake-notify email error:", err);
  }

  return NextResponse.json({ success: true });
}
