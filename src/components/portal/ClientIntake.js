"use client";
import { useState, useRef } from "react";
import { C, S } from "@/lib/constants";
import { useAuth } from "@/context/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { useIsMobile } from "@/lib/hooks";

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time (New York)" },
  { value: "America/Chicago", label: "Central Time (Chicago)" },
  { value: "America/Denver", label: "Mountain Time (Denver)" },
  { value: "America/Phoenix", label: "Arizona (no DST)" },
  { value: "America/Los_Angeles", label: "Pacific Time (Los Angeles)" },
  { value: "America/Anchorage", label: "Alaska Time" },
  { value: "Pacific/Honolulu", label: "Hawaii Time" },
];

function detectTz() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York"; }
  catch { return "America/New_York"; }
}

function formatPhone(value) {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

const ERR = { fontSize: 12, color: "#c0392b", marginTop: 4, marginBottom: 8 };

export default function ClientIntake({ onComplete }) {
  const { user, refreshProfile } = useAuth();
  const mobile = useIsMobile();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [preferredEmail, setPreferredEmail] = useState(user?.email || "");
  const [notificationPref, setNotificationPref] = useState("email");
  const [reminderPref, setReminderPref] = useState("both");
  const [timezone, setTimezone] = useState(detectTz);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [errors, setErrors] = useState({});

  const firstNameRef = useRef(null);
  const lastNameRef = useRef(null);
  const emailRef = useRef(null);
  const phoneRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmPasswordRef = useRef(null);

  const handleSubmit = async () => {
    const e = {};
    if (!firstName.trim()) e.firstName = "First name is required.";
    if (!lastName.trim()) e.lastName = "Last name is required.";
    const emailVal = preferredEmail.trim() || user?.email || "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) e.email = "Please enter a valid email address.";
    const phoneDigits = phone.replace(/\D/g, "");
    if (phoneDigits && phoneDigits.length !== 10) e.phone = "Phone number must be 10 digits.";
    if (!password) e.password = "Please set a password.";
    else if (password.length < 8) e.password = "Password must be at least 8 characters.";
    if (password && password !== confirmPassword) e.confirmPassword = "Passwords do not match.";

    if (Object.keys(e).length > 0) {
      setErrors(e);
      const first = e.firstName ? firstNameRef : e.lastName ? lastNameRef : e.email ? emailRef :
        e.phone ? phoneRef : e.password ? passwordRef : confirmPasswordRef;
      first.current?.focus();
      return;
    }

    setErrors({});
    setSaving(true);
    setSaveError(null);

    const supabase = createClient();

    const { error: pwErr } = await supabase.auth.updateUser({ password });
    if (pwErr) { setSaveError(pwErr.message || "Could not set password."); setSaving(false); return; }

    const { error: profErr } = await supabase.from("profiles").update({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      full_name: `${firstName.trim()} ${lastName.trim()}`,
      phone: phone.trim() || null,
      preferred_email: preferredEmail.trim() || user.email,
      notification_preference: notificationPref,
      reminder_preference: reminderPref,
      timezone,
    }).eq("id", user.id);

    if (profErr) { setSaveError("Could not save profile. Please try again."); setSaving(false); return; }

    fetch("/api/intake-notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: preferredEmail.trim() || user.email,
        phone: phone.trim() || null,
      }),
    }).catch(() => {});

    await refreshProfile();
    setSaving(false);
    if (onComplete) onComplete();
  };

  return (
    <div style={S.page}>
      <h1 style={{ ...S.h1, fontSize: 26 }}>Welcome! Let&apos;s get you set up.</h1>
      <p style={S.p}>Complete your registration to access your coaching portal.</p>

      {/* Password */}
      <div style={S.card}>
        <h3 style={S.h3}>Set your password</h3>
        <p style={{ ...S.p, fontSize: 13 }}>You&apos;ll use this to sign in to your portal.</p>
        <label style={S.label}>Password</label>
        <div style={{ position: "relative", marginBottom: errors.password ? 4 : "0.75rem" }}>
          <input
            ref={passwordRef}
            type={showPassword ? "text" : "password"}
            style={{ ...S.input, marginBottom: 0, paddingRight: 40, borderColor: errors.password ? "#c0392b" : undefined }}
            placeholder="Minimum 8 characters"
            value={password}
            onChange={e => { setPassword(e.target.value); setErrors(v => ({ ...v, password: null })); }}
          />
          <button onClick={() => setShowPassword(v => !v)} style={{
            position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
            background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 4,
          }}>
            {showPassword ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            )}
          </button>
        </div>
        {errors.password && <p style={ERR}>{errors.password}</p>}
        <label style={S.label}>Confirm password</label>
        <input
          ref={confirmPasswordRef}
          type={showPassword ? "text" : "password"}
          style={{ ...S.input, borderColor: errors.confirmPassword ? "#c0392b" : undefined }}
          placeholder="Re-enter your password"
          value={confirmPassword}
          onChange={e => { setConfirmPassword(e.target.value); setErrors(v => ({ ...v, confirmPassword: null })); }}
        />
        {errors.confirmPassword && <p style={ERR}>{errors.confirmPassword}</p>}
      </div>

      {/* Profile info */}
      <div style={S.card}>
        <h3 style={S.h3}>Your information</h3>
        <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 12 }}>
          <div>
            <label style={S.label}>First name</label>
            <input
              ref={firstNameRef}
              style={{ ...S.input, borderColor: errors.firstName ? "#c0392b" : undefined }}
              placeholder="Jane" value={firstName}
              onChange={e => { setFirstName(e.target.value); setErrors(v => ({ ...v, firstName: null })); }}
            />
            {errors.firstName && <p style={ERR}>{errors.firstName}</p>}
          </div>
          <div>
            <label style={S.label}>Last name</label>
            <input
              ref={lastNameRef}
              style={{ ...S.input, borderColor: errors.lastName ? "#c0392b" : undefined }}
              placeholder="Smith" value={lastName}
              onChange={e => { setLastName(e.target.value); setErrors(v => ({ ...v, lastName: null })); }}
            />
            {errors.lastName && <p style={ERR}>{errors.lastName}</p>}
          </div>
        </div>
        <label style={S.label}>Mobile number</label>
        <input
          ref={phoneRef}
          style={{ ...S.input, borderColor: errors.phone ? "#c0392b" : undefined }}
          placeholder="(555) 012-3456" type="tel" value={phone}
          onChange={e => { setPhone(formatPhone(e.target.value)); setErrors(v => ({ ...v, phone: null })); }}
        />
        {errors.phone && <p style={ERR}>{errors.phone}</p>}
        <label style={S.label}>Preferred email address</label>
        <input
          ref={emailRef}
          style={{ ...S.input, borderColor: errors.email ? "#c0392b" : undefined }}
          placeholder="jane@example.com" type="email" value={preferredEmail}
          onChange={e => { setPreferredEmail(e.target.value); setErrors(v => ({ ...v, email: null })); }}
        />
        {errors.email && <p style={ERR}>{errors.email}</p>}
        <label style={S.label}>Notification preference</label>
        <select style={{ ...S.input, cursor: "pointer" }} value={notificationPref} onChange={e => setNotificationPref(e.target.value)}>
          <option value="email">Email only</option>
          <option value="text">Text only</option>
          <option value="both">Email and text</option>
        </select>
        <label style={S.label}>Session reminders</label>
        <select style={{ ...S.input, cursor: "pointer" }} value={reminderPref} onChange={e => setReminderPref(e.target.value)}>
          <option value="both">24 hours and 1 hour before</option>
          <option value="24h">24 hours before</option>
          <option value="1h">1 hour before</option>
          <option value="none">No reminders</option>
        </select>
        <label style={S.label}>Timezone</label>
        <select style={{ ...S.input, cursor: "pointer" }} value={timezone} onChange={e => setTimezone(e.target.value)}>
          {!TIMEZONES.find(t => t.value === timezone) && <option value={timezone}>{timezone}</option>}
          {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
        </select>
      </div>

      {/* ── FUTURE INTAKE FIELDS ────────────────────────────────────────────────
          Add additional intake sections here as separate S.card blocks.
          Each section can contain any field type: text, select, file upload,
          multi-select, conditional questions, date pickers, rich text, etc.
          Example stub:

          <div style={S.card}>
            <h3 style={S.h3}>About your situation</h3>
            [fields go here]
          </div>

          ─────────────────────────────────────────────────────────────────────── */}

      {saveError && <p style={{ fontSize: 13, color: "#c0392b", marginBottom: 12 }}>{saveError}</p>}
      <button style={{ ...S.btn, width: "100%", marginBottom: "2rem" }} onClick={handleSubmit} disabled={saving}>
        {saving ? "Completing registration…" : "Complete registration"}
      </button>
    </div>
  );
}
