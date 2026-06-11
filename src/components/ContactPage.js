"use client";
import { useState } from "react";
import { C, S, SERVER_ERROR } from "@/lib/constants";
import { useError } from "@/context/ErrorContext";

export default function ContactPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [processStage, setProcessStage] = useState("Just starting to consider separation");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const { setServerError } = useError();
  const [sendCopy, setSendCopy] = useState(true);
  const [honeypot, setHoneypot] = useState("");

  const handlePhoneChange = (e) => {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
    let masked = "";
    if (digits.length <= 3) masked = digits.length ? `(${digits}` : "";
    else if (digits.length <= 6) masked = `(${digits.slice(0,3)}) ${digits.slice(3)}`;
    else masked = `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
    setPhone(masked);
  };

  const handleSubmit = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError("Please fill in your name and email.");
      return;
    }
    if (phone.replace(/\D/g, "").length < 10) {
      setError("Please enter a valid 10-digit phone number.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          process_stage: processStage,
          message: message || null,
          send_copy: sendCopy,
          _hp: honeypot,
        }),
      });
      setSubmitting(false);
      if (!res.ok) {
        if (res.status >= 500) { setServerError(SERVER_ERROR); return; }
        setError("Something went wrong. Please try again.");
        return;
      }
      setSent(true);
    } catch {
      setSubmitting(false);
      setServerError(SERVER_ERROR);
    }
  };

  return (
    <div style={S.page}>
      <h1 style={S.h1}>Let&#39;s talk</h1>
      <p style={S.p}>The first step is often the hardest. Reach out below and Diana will personally respond within one business day to schedule a free 30-minute consultation.</p>
      {sent ? (
        <div style={{ ...S.card, background:C.tealLight, border:`0.5px solid ${C.tealMid}`, textAlign:"center", padding:"2.5rem" }}>
          <div style={{ fontSize:16, fontWeight:500, color:C.teal, marginBottom:8 }}>Email sent. Thank you for reaching out.</div>
          <p style={{...S.p, color:C.teal, marginBottom:0}}>Diana will be in touch within one business day.</p>
        </div>
      ) : (
        <div style={S.card}>
          {/* Honeypot — hidden from humans, bots fill it in */}
          <input
            type="text"
            name="website"
            value={honeypot}
            onChange={e => setHoneypot(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
          />
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div><label style={S.label}>First name</label><input style={S.input} placeholder="Jane" value={firstName} onChange={e => setFirstName(e.target.value)} /></div>
            <div><label style={S.label}>Last name</label><input style={S.input} placeholder="Smith" value={lastName} onChange={e => setLastName(e.target.value)} /></div>
          </div>
          <label style={S.label}>Email address</label>
          <input style={S.input} placeholder="jane@example.com" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          <label style={S.label}>Phone</label>
          <input style={S.input} placeholder="(555) 012-3456" type="tel" value={phone} onChange={handlePhoneChange} />
          <label style={S.label}>Where are you in the process?</label>
          <select style={{...S.input}} value={processStage} onChange={e => setProcessStage(e.target.value)}>
            <option>Just starting to consider separation</option>
            <option>Separation is underway</option>
            <option>Divorce is finalized — navigating coparenting</option>
            <option>Dealing with a specific custody challenge</option>
          </select>
          <label style={S.label}>What&#39;s on your mind?</label>
          <textarea style={{...S.input, height:110, resize:"vertical"}} placeholder="Share as little or as much as you&#39;d like..." value={message} onChange={e => setMessage(e.target.value)} />
          <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, color:C.muted, cursor:"pointer", marginBottom:16 }}>
            <input type="checkbox" checked={sendCopy} onChange={e => setSendCopy(e.target.checked)} style={{ accentColor: C.teal }} />
            Send a copy to yourself
          </label>
          {error && <p style={{ fontSize:13, color:"#c0392b", marginBottom:12 }}>{error}</p>}
          <button style={S.btn} onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Sending..." : "Send message"}
          </button>
        </div>
      )}
    </div>
  );
}
