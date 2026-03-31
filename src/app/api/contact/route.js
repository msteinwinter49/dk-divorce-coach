import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { NextResponse } from "next/server";

export async function POST(request) {
  const { first_name, last_name, email, phone, process_stage, message, send_copy } = await request.json();

  const formatPhone = (value) => {
    if (!value) return "Not provided";
    const digits = value.replace(/\D/g, "");
    if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    return value;
  };

  if (!first_name || !last_name || !email) {
    return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Save to database
  const { error: insertError } = await supabase.from("contact_submissions").insert({
    first_name,
    last_name,
    email,
    phone: phone || null,
    process_stage: process_stage || null,
    message: message || null,
  });

  if (insertError) {
    return NextResponse.json({ error: "Could not save submission" }, { status: 500 });
  }

  // Get the notification email from settings
  const { data: setting } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "contact_email")
    .single();

  const contactEmail = setting?.value;

  if (contactEmail) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: "DK Divorce Coach <diana@dkdivorcecoach.com>",
        replyTo: "dkdivorcecoach@gmail.com",
        to: contactEmail,
        subject: `New contact form: ${first_name} ${last_name}`,
        html: `
          <h2>New Contact Form Submission</h2>
          <p><strong>Name:</strong> ${first_name} ${last_name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Phone:</strong> ${formatPhone(phone)}</p>
          <p><strong>Stage:</strong> ${process_stage || "Not specified"}</p>
          <p><strong>Message:</strong></p>
          <p>${message ? message.replace(/\n/g, "<br>") : "No message"}</p>
        `,
      });
      // Send copy to the submitter if requested
      if (send_copy && email) {
        await resend.emails.send({
          from: "DK Divorce Coach <diana@dkdivorcecoach.com>",
          replyTo: "dkdivorcecoach@gmail.com",
          to: email,
          subject: "Copy of your message to DK Divorce Coach",
          html: `
            <h2>Your Message to DK Divorce Coach</h2>
            <p>Thank you for reaching out. Here is a copy of your submission:</p>
            <hr>
            <p><strong>Name:</strong> ${first_name} ${last_name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Phone:</strong> ${formatPhone(phone)}</p>
            <p><strong>Stage:</strong> ${process_stage || "Not specified"}</p>
            <p><strong>Message:</strong></p>
            <p>${message ? message.replace(/\n/g, "<br>") : "No message"}</p>
            <hr>
            <p>Diana will be in touch within one business day.</p>
          `,
        });
      }
    } catch (emailError) {
      // Log but don't fail — the submission is already saved
      console.error("Email send error:", emailError);
    }
  }

  return NextResponse.json({ success: true });
}
