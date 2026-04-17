"use client";
import { C, S } from "@/lib/constants";

export default function PrivacyPage({ setPage }) {
  return (
    <div style={S.page}>
      <p style={{ fontSize:13, color:C.teal, fontWeight:500, letterSpacing:"0.08em", marginBottom:"0.5rem" }}>PRIVACY</p>
      <h1 style={S.h1}>Privacy Policy</h1>
      <p style={{ fontSize:13, color:C.hint, marginBottom:"1.5rem" }}>Last updated: April 16, 2026</p>

      <p style={S.p}>
        DK Divorce Coach (&quot;we,&quot; &quot;us&quot;) respects your privacy. This page explains what personal information we collect, how it is used, and how it is protected.
      </p>

      <div style={S.card}>
        <h3 style={S.h3}>Information we collect</h3>
        <p style={{...S.p, marginBottom:"0.5rem"}}><strong style={{ color:C.text }}>Inquiries and contact forms.</strong> Name, email address, phone number, and the content of your message when you reach out through the website.</p>
        <p style={{...S.p, marginBottom:"0.5rem"}}><strong style={{ color:C.text }}>Client portal accounts.</strong> Name, email address, phone number, preferred contact email, and timezone. Documents you upload to your private portal folder. Messages you exchange with Diana through the portal. Scheduling and session history (requested and booked appointments).</p>
        <p style={{...S.p, marginBottom:"0.5rem"}}><strong style={{ color:C.text }}>Payment information.</strong> If you provide a card on file for sessions, it is stored directly with our payment processor (Stripe). We do not store full card numbers on our servers.</p>
        <p style={{...S.p, marginBottom:0}}><strong style={{ color:C.text }}>Technical information.</strong> A secure session cookie keeps you signed into the portal. We do not use advertising or tracking cookies.</p>
      </div>

      <div style={S.card}>
        <h3 style={S.h3}>How we use your information</h3>
        <ul style={{ ...S.p, paddingLeft:"1.25rem", marginBottom:0 }}>
          <li style={{ marginBottom:"0.4rem" }}>To deliver coaching services, including scheduling sessions, sending confirmations and reminders, sharing documents, and replying to messages.</li>
          <li style={{ marginBottom:"0.4rem" }}>To respond to inquiries submitted through the contact form.</li>
          <li style={{ marginBottom:"0.4rem" }}>To process payments for sessions.</li>
          <li>To maintain the security and integrity of your portal account.</li>
        </ul>
      </div>

      <div style={{ ...S.card, background:C.tealLight, border:`0.5px solid ${C.tealMid}` }}>
        <h3 style={S.h3}>We do not share your information for marketing</h3>
        <p style={{...S.p, marginBottom:0}}>
          We do not sell, rent, or share your personal information with third parties for marketing or advertising purposes. We do not send marketing communications. The only messages you will receive from us relate to your inquiries, sessions, account, or billing.
        </p>
      </div>

      <div style={S.card}>
        <h3 style={S.h3}>Service providers</h3>
        <p style={S.p}>
          We rely on a small set of vetted service providers to operate the site and portal. These providers process information only on our behalf and only to the extent needed to deliver the service.
        </p>
        <ul style={{ ...S.p, paddingLeft:"1.25rem", marginBottom:0 }}>
          <li style={{ marginBottom:"0.3rem" }}><strong style={{ color:C.text }}>Supabase</strong> — account and portal database, authentication, document storage.</li>
          <li style={{ marginBottom:"0.3rem" }}><strong style={{ color:C.text }}>Vercel</strong> — website and application hosting.</li>
          <li style={{ marginBottom:"0.3rem" }}><strong style={{ color:C.text }}>Google Calendar</strong> — calendar and appointment management.</li>
          <li style={{ marginBottom:"0.3rem" }}><strong style={{ color:C.text }}>Stripe</strong> — payment processing.</li>
          <li style={{ marginBottom:"0.3rem" }}><strong style={{ color:C.text }}>Resend</strong> — transactional email delivery.</li>
          <li><strong style={{ color:C.text }}>Twilio</strong> — text-message reminders (optional, when enabled).</li>
        </ul>
      </div>

      <div style={S.card}>
        <h3 style={S.h3}>Confidentiality</h3>
        <p style={{...S.p, marginBottom:0}}>
          Information you share while working with Diana is treated as confidential. It will not be disclosed to anyone outside the service providers listed above, except when disclosure is required by law (for example, to comply with a subpoena or to report a risk of serious harm).
        </p>
      </div>

      <div style={S.card}>
        <h3 style={S.h3}>Your choices and record retention</h3>
        <p style={{...S.p, marginBottom:0}}>
          You can request to review, update, or delete your account information at any time by emailing <a href="mailto:dkdivorcecoach@gmail.com" style={{ color:C.teal }}>dkdivorcecoach@gmail.com</a>. Please note that session and scheduling records are retained for at least seven years in accordance with professional record-keeping practices.
        </p>
      </div>

      <div style={S.card}>
        <h3 style={S.h3}>Questions</h3>
        <p style={{...S.p, marginBottom:0}}>
          Questions about this policy? Email <a href="mailto:dkdivorcecoach@gmail.com" style={{ color:C.teal }}>dkdivorcecoach@gmail.com</a>.
        </p>
      </div>

      {setPage && (
        <div style={{ textAlign:"center", marginTop:"1.5rem" }}>
          <button style={S.btnOutline} onClick={() => setPage("Home")}>Back to Home</button>
        </div>
      )}
    </div>
  );
}
