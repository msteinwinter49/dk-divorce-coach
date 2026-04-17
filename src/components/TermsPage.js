"use client";
import { C, S } from "@/lib/constants";

export default function TermsPage({ setPage }) {
  return (
    <div style={S.page}>
      <p style={{ fontSize:13, color:C.teal, fontWeight:500, letterSpacing:"0.08em", marginBottom:"0.5rem" }}>TERMS</p>
      <h1 style={S.h1}>Terms &amp; Conditions</h1>
      <p style={{ fontSize:13, color:C.hint, marginBottom:"1.5rem" }}>Last updated: April 16, 2026</p>

      <p style={S.p}>
        These terms apply to your use of the DK Divorce Coach website, client portal, and text-message (SMS) program. By using the service or enrolling in text messages, you agree to these terms.
      </p>

      <div style={S.card}>
        <h3 style={S.h3}>Service</h3>
        <p style={{...S.p, marginBottom:"0.5rem"}}>
          <strong style={{ color:C.text }}>Service name:</strong> DK Divorce Coach (Diana Kierein, CDC).
        </p>
        <p style={{...S.p, marginBottom:0}}>
          <strong style={{ color:C.text }}>Description:</strong> Certified Divorce Coaching services, including individual and co-parent coaching sessions, a secure client portal for document sharing and messaging, and online appointment scheduling. Divorce coaching is not therapy and is not legal advice.
        </p>
      </div>

      <div style={{ ...S.card, background:C.tealLight, border:`0.5px solid ${C.tealMid}` }}>
        <h3 style={S.h3}>SMS / Text message program</h3>
        <p style={{...S.p, marginBottom:"0.75rem"}}>
          If you provide a mobile number and opt in to text messages, you agree to receive SMS messages from DK Divorce Coach at the number you supplied. Consent to receive text messages is not a condition of purchase.
        </p>

        <p style={{...S.p, marginBottom:"0.35rem"}}>
          <strong style={{ color:C.text }}>What we send:</strong> appointment confirmations and updates, session reminders, and direct messages related to your coaching engagement.
        </p>
        <p style={{...S.p, marginBottom:"0.35rem"}}>
          <strong style={{ color:C.text }}>Message frequency:</strong> varies based on your appointment activity. Typical volume is up to a few messages per week per active client; inactive clients generally receive none.
        </p>
        <p style={{...S.p, marginBottom:"0.35rem"}}>
          <strong style={{ color:C.text }}>Message and data rates:</strong> message and data rates may apply. Check with your mobile carrier for details about your plan.
        </p>
        <p style={{...S.p, marginBottom:"0.35rem"}}>
          <strong style={{ color:C.text }}>Carriers:</strong> carriers are not liable for delayed or undelivered messages.
        </p>
        <p style={{...S.p, marginBottom:0}}>
          <strong style={{ color:C.text }}>Help:</strong> for assistance, reply <strong style={{ color:C.text }}>HELP</strong> to any message or email <a href="mailto:dkdivorcecoach@gmail.com" style={{ color:C.teal }}>dkdivorcecoach@gmail.com</a>.
        </p>
      </div>

      <div style={S.card}>
        <h3 style={S.h3}>How to opt out of SMS</h3>
        <p style={S.p}>You can stop receiving text messages at any time using either method below.</p>
        <p style={{...S.p, marginBottom:"0.5rem"}}>
          <strong style={{ color:C.text }}>Reply STOP.</strong> Reply <strong style={{ color:C.text }}>STOP</strong> to any text message from us. We will send one confirmation message and will not send further texts unless you opt back in.
        </p>
        <p style={{...S.p, marginBottom:"0.5rem"}}>
          <strong style={{ color:C.text }}>Update your Profile page.</strong> Sign in to the client portal and open <strong style={{ color:C.text }}>Profile</strong>. To stop all text messages, set <em>Notification preference</em> to <strong style={{ color:C.text }}>&quot;Email only&quot;</strong>. To stop only the automated session reminders, set <em>Session reminders</em> to <strong style={{ color:C.text }}>&quot;No reminders&quot;</strong>. Save the profile to apply the change.
        </p>
        <p style={{...S.p, marginBottom:0}}>
          To opt back in later, change the same settings back and save.
        </p>
      </div>

      <div style={S.card}>
        <h3 style={S.h3}>Support</h3>
        <p style={{...S.p, marginBottom:0}}>
          Questions about the service or the text-message program? Email <a href="mailto:dkdivorcecoach@gmail.com" style={{ color:C.teal }}>dkdivorcecoach@gmail.com</a>. We respond during normal business hours, Monday through Friday.
        </p>
      </div>

      <div style={S.card}>
        <h3 style={S.h3}>Scheduling, cancellations, and payment</h3>
        <p style={{...S.p, marginBottom:0}}>
          Coaching sessions are booked through the client portal. A card on file may be required to request a session, and charges are applied when a session is confirmed. Cancellation and rescheduling policies are communicated at the time of booking.
        </p>
      </div>

      <div style={S.card}>
        <h3 style={S.h3}>Not therapy or legal advice</h3>
        <p style={{...S.p, marginBottom:0}}>
          Divorce coaching is a supportive, goal-oriented service. It is not a substitute for licensed mental-health care, medical treatment, or legal counsel. If you need those services, please consult an appropriate licensed professional.
        </p>
      </div>

      <div style={S.card}>
        <h3 style={S.h3}>Privacy</h3>
        <p style={{...S.p, marginBottom:0}}>
          Your information is handled as described in our{" "}
          {setPage ? (
            <button
              onClick={() => setPage("Privacy")}
              style={{ background:"none", border:"none", color:C.teal, fontFamily:"inherit", fontSize:"inherit", padding:0, cursor:"pointer", textDecoration:"underline" }}
            >
              Privacy Policy
            </button>
          ) : "Privacy Policy"}.
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
