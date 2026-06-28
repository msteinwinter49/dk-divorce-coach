"use client";
import { useState, useRef, useEffect } from "react";
import { C, S } from "@/lib/constants";
import { useAuth } from "@/context/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { useIsMobile, useSmsEnabled } from "@/lib/hooks";
import { retryFetch } from "@/lib/fetchUtils";
import { PaymentMethodSection } from "@/components/portal/PaymentMethodSection";

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

function computeAgeFromDob(dobStr) {
  if (!dobStr) return "";
  const [y, m, d] = dobStr.split("-").map(Number);
  if (!y || !m || !d) return "";
  const today = new Date();
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--;
  return (age > 0 && age < 111) ? String(age) : "";
}

function formatPhone(value) {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

const ERR = { fontSize: 12, color: "#c0392b", marginTop: 4, marginBottom: 8 };
const TA = {
  width: "100%", padding: "10px 12px", fontSize: 14,
  border: "0.5px solid #d0d0d0", borderRadius: 6, outline: "none",
  resize: "vertical", minHeight: 80, marginBottom: "0.75rem",
  fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box",
};

export default function ClientIntake({ onComplete, preview = false, onClosePreview }) {
  const { user, refreshProfile } = useAuth();
  const mobile = useIsMobile();
  const smsEnabled = useSmsEnabled();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [backupPhone, setBackupPhone] = useState("");
  const [dob, setDob] = useState("");
  const [age, setAge] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [addressZip, setAddressZip] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [zipLooking, setZipLooking] = useState(false);
  const [bgOccupation, setBgOccupation] = useState("");
  const [bgEducation, setBgEducation] = useState("");
  const [bgRelationship, setBgRelationship] = useState("");
  const [bgRelationshipStatus, setBgRelationshipStatus] = useState("");
  const [bgRelationshipEnding, setBgRelationshipEnding] = useState("");
  const [bgSafety, setBgSafety] = useState("");
  const [bgTherapist, setBgTherapist] = useState("");
  const [bgChildren, setBgChildren] = useState("");
  const [bgLiving, setBgLiving] = useState("");
  const [bgBrings, setBgBrings] = useState("");
  const [bgGoals, setBgGoals] = useState("");
  const [bgOther, setBgOther] = useState("");
  const [preferredEmail, setPreferredEmail] = useState(preview ? "" : (user?.email || ""));
  const [notificationPref, setNotificationPref] = useState("email");
  const [reminderPref, setReminderPref] = useState("both");
  const [timezone, setTimezone] = useState(detectTz);

  const [disclaimerAgreed, setDisclaimerAgreed] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [errors, setErrors] = useState({});

  const disclaimerRef = useRef(null);
  const firstNameRef = useRef(null);
  const lastNameRef = useRef(null);
  const emailRef = useRef(null);
  const phoneRef = useRef(null);
  const backupPhoneRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmPasswordRef = useRef(null);
  const dobRef = useRef(null);
  const ageRef = useRef(null);
  const addressLine1Ref = useRef(null);
  const addressZipRef = useRef(null);
  const draftTimerRef = useRef(null);

  // Restore draft on mount (skipped in preview mode)
  useEffect(() => {
    if (preview || !user?.id) return;
    try {
      const saved = localStorage.getItem(`intake_draft_${user.id}`);
      if (!saved) return;
      const d = JSON.parse(saved);
      if (d.firstName)        setFirstName(d.firstName);
      if (d.lastName)         setLastName(d.lastName);
      if (d.phone)            setPhone(d.phone);
      if (d.backupPhone)      setBackupPhone(d.backupPhone);
      if (d.dob)              { setDob(d.dob); setAge(computeAgeFromDob(d.dob)); }
      if (d.addressLine1)     setAddressLine1(d.addressLine1);
      if (d.addressLine2)     setAddressLine2(d.addressLine2);
      if (d.addressZip)       setAddressZip(d.addressZip);
      if (d.addressCity)      setAddressCity(d.addressCity);
      if (d.addressState)     setAddressState(d.addressState);
      if (d.bgOccupation)     setBgOccupation(d.bgOccupation);
      if (d.bgEducation)      setBgEducation(d.bgEducation);
      if (d.bgRelationship)         setBgRelationship(d.bgRelationship);
      if (d.bgRelationshipStatus)   setBgRelationshipStatus(d.bgRelationshipStatus);
      if (d.bgRelationshipEnding)   setBgRelationshipEnding(d.bgRelationshipEnding);
      if (d.bgSafety)               setBgSafety(d.bgSafety);
      if (d.bgTherapist)      setBgTherapist(d.bgTherapist);
      if (d.bgChildren)      setBgChildren(d.bgChildren);
      if (d.bgLiving)         setBgLiving(d.bgLiving);
      if (d.bgBrings)         setBgBrings(d.bgBrings);
      if (d.bgGoals)          setBgGoals(d.bgGoals);
      if (d.bgOther)          setBgOther(d.bgOther);
      if (d.preferredEmail)   setPreferredEmail(d.preferredEmail);
      if (d.notificationPref) setNotificationPref(d.notificationPref);
      if (d.reminderPref)     setReminderPref(d.reminderPref);
      if (d.timezone)         setTimezone(d.timezone);
      if (d.disclaimerAgreed) setDisclaimerAgreed(d.disclaimerAgreed);
    } catch {}
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced draft save (skipped in preview mode)
  useEffect(() => {
    if (preview || !user?.id) return;
    clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(`intake_draft_${user.id}`, JSON.stringify({
          firstName, lastName, dob, phone, backupPhone,
          addressLine1, addressLine2, addressZip, addressCity, addressState,
          bgOccupation, bgEducation, bgRelationship, bgRelationshipStatus, bgRelationshipEnding, bgSafety, bgTherapist, bgChildren, bgLiving, bgBrings, bgGoals, bgOther,
          preferredEmail, notificationPref, reminderPref, timezone, disclaimerAgreed,
        }));
      } catch {}
    }, 800);
  }, [user?.id, preview, firstName, lastName, dob, phone, backupPhone, addressLine1, addressLine2, addressZip, addressCity, addressState, // eslint-disable-line react-hooks/exhaustive-deps
     bgOccupation, bgEducation, bgRelationship, bgRelationshipStatus, bgRelationshipEnding, bgSafety, bgTherapist, bgChildren, bgLiving, bgBrings, bgGoals, bgOther,
     preferredEmail, notificationPref, reminderPref, timezone, disclaimerAgreed]);

  const handleZipBlur = async (zip) => {
    if (zip.length !== 5 || !/^\d{5}$/.test(zip)) return;
    setZipLooking(true);
    try {
      const res = await retryFetch(`https://api.zippopotam.us/us/${zip}`);
      if (res.ok) {
        const data = await res.json();
        const place = data.places?.[0];
        if (place) {
          setAddressCity(place["place name"] || "");
          setAddressState(place["state abbreviation"] || "");
        }
      }
    } catch { /* leave city/state as-is */ }
    setZipLooking(false);
  };

  const handleSubmit = async () => {
    const e = {};
    if (!disclaimerAgreed) e.disclaimer = "You must agree to the terms before continuing.";
    if (!firstName.trim()) e.firstName = "First name is required.";
    if (!lastName.trim()) e.lastName = "Last name is required.";
    const emailVal = preferredEmail.trim() || user?.email || "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) e.email = "Please enter a valid email address.";
    if (!dob) e.dob = "Date of birth is required.";
    else if (!computeAgeFromDob(dob)) e.dob = "Please enter a valid date of birth.";
    if (!addressLine1.trim()) e.addressLine1 = "Address is required.";
    const zipVal = addressZip.trim();
    if (!zipVal) e.addressZip = "ZIP code is required.";
    else if (!/^\d{5}$/.test(zipVal)) e.addressZip = "ZIP code must be 5 digits.";
    const phoneDigits = phone.replace(/\D/g, "");
    if (!phoneDigits) e.phone = "Phone number is required.";
    else if (phoneDigits.length !== 10) e.phone = "Phone number must be 10 digits.";
    const backupPhoneDigits = backupPhone.replace(/\D/g, "");
    if (backupPhoneDigits && backupPhoneDigits.length !== 10) e.backupPhone = "Phone number must be 10 digits.";
    if (!password) e.password = "Please set a password.";
    else if (password.length < 8) e.password = "Password must be at least 8 characters.";
    if (password && password !== confirmPassword) e.confirmPassword = "Passwords do not match.";

    if (Object.keys(e).length > 0) {
      setErrors(e);
      const first = e.disclaimer ? disclaimerRef : e.firstName ? firstNameRef : e.lastName ? lastNameRef :
        e.dob ? dobRef : e.addressLine1 ? addressLine1Ref : e.addressZip ? addressZipRef :
        e.email ? emailRef : e.phone ? phoneRef : e.password ? passwordRef : confirmPasswordRef;
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
      date_of_birth: dob || null,
      age: parseInt(age, 10),
      full_name: `${firstName.trim()} ${lastName.trim()}`,
      phone: phone.trim() || null,
      backup_phone: backupPhone.trim() || null,
      address_line1: addressLine1.trim() || null,
      address_line2: addressLine2.trim() || null,
      address_zip: addressZip.trim() || null,
      address_city: addressCity.trim() || null,
      address_state: addressState.trim() || null,
      bg_occupation: bgOccupation.trim() || null,
      bg_education: bgEducation.trim() || null,
      bg_relationship: bgRelationship.trim() || null,
      bg_relationship_status: bgRelationshipStatus.trim() || null,
      bg_relationship_ending: bgRelationshipEnding.trim() || null,
      bg_safety: bgSafety.trim() || null,
      bg_therapist: bgTherapist.trim() || null,
      bg_children: bgChildren.trim() || null,
      bg_living: bgLiving.trim() || null,
      bg_brings: bgBrings.trim() || null,
      bg_goals: bgGoals.trim() || null,
      bg_other: bgOther.trim() || null,
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

    try { localStorage.removeItem(`intake_draft_${user.id}`); } catch {}
    await refreshProfile();
    setSaving(false);
    if (onComplete) onComplete();
  };

  return (
    <div style={{ ...S.page, minHeight: "100dvh", paddingBottom: "max(5rem, env(safe-area-inset-bottom, 5rem))" }}>
      {preview && (
        <div style={{
          position: "sticky", top: 0, zIndex: 100,
          background: "#2C2C2A", color: "#fff",
          padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
          fontSize: 13, fontWeight: 500, marginBottom: 8,
        }}>
          <span>Admin preview — this is what new clients see on first login</span>
          <button onClick={onClosePreview} style={{
            background: "none", border: "1px solid rgba(255,255,255,0.4)", borderRadius: 4,
            color: "#fff", cursor: "pointer", padding: "3px 10px", fontSize: 12,
          }}>Close preview</button>
        </div>
      )}
      <div style={{ ...S.logo, marginBottom: "1.5rem" }}>
        <span style={S.logoMain}>DK Divorce Coach</span>
        <span style={S.logoSub}>DIANA KIEREIN · CDC</span>
      </div>
      <h1 style={{ ...S.h1, fontSize: 26 }}>Welcome! Please complete and submit this form to start using your coaching portal.</h1>
      <p style={S.p}>You can leave this page before finishing and your work will be saved. Continue by returning to dkdivorcecoach.com on the SAME DEVICE.</p>

      <p style={{ ...S.p, fontSize: 13, marginBottom: 12 }}><span style={{ color: "#c0392b" }}>*</span> required field</p>

      {/* Disclaimer */}
      <div style={{ ...S.card, borderColor: errors.disclaimer ? "#c0392b" : undefined }}>
        <h3 style={S.h3}>Disclaimer</h3>
        <p style={{ ...S.p, fontSize: 13, marginBottom: 12 }}>Please read and check the box below.</p>
        <ul style={{ margin: "0 0 16px 0", paddingLeft: 20, fontSize: 14, color: C.text, lineHeight: 1.7 }}>
          <li>This coaching service is not a substitute for professional therapy or legal advice.</li>
          <li>All discussions are confidential but may be subject to legal exceptions.</li>
          <li>The coach is licensed as a therapist and lawyer. This coaching service will not include therapy or legal advice.</li>
          <li>Clients are encouraged to seek specialized help for mental health or legal issues.</li>
          <li>Participation in coaching does not establish a therapist-client or attorney-client relationship.</li>
        </ul>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", fontSize: 14, color: errors.disclaimer ? "#c0392b" : C.text }}>
          <input
            ref={disclaimerRef}
            type="checkbox"
            checked={disclaimerAgreed}
            onChange={e => { setDisclaimerAgreed(e.target.checked); setErrors(v => ({ ...v, disclaimer: null })); }}
            style={{ marginTop: 2, flexShrink: 0 }}
          />
          I have read, understand, and agree to these terms. <span style={{ color: "#c0392b" }}>*</span>
        </label>
        {errors.disclaimer && <p style={{ ...ERR, marginTop: 8, marginBottom: 0 }}>{errors.disclaimer}</p>}
      </div>

      {/* Password */}
      <div style={S.card}>
        <h3 style={S.h3}>Set your password</h3>
        <p style={{ ...S.p, fontSize: 13 }}>You&apos;ll use this to sign in to your portal.</p>
        <label style={S.label}>Password <span style={{ color: "#c0392b" }}>*</span></label>
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
        <label style={S.label}>Confirm password <span style={{ color: "#c0392b" }}>*</span></label>
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
            <label style={S.label}>First name <span style={{ color: "#c0392b" }}>*</span></label>
            <input
              ref={firstNameRef}
              style={{ ...S.input, borderColor: errors.firstName ? "#c0392b" : undefined }}
              placeholder="Jane" value={firstName}
              onChange={e => { setFirstName(e.target.value); setErrors(v => ({ ...v, firstName: null })); }}
            />
            {errors.firstName && <p style={ERR}>{errors.firstName}</p>}
          </div>
          <div>
            <label style={S.label}>Last name <span style={{ color: "#c0392b" }}>*</span></label>
            <input
              ref={lastNameRef}
              style={{ ...S.input, borderColor: errors.lastName ? "#c0392b" : undefined }}
              placeholder="Smith" value={lastName}
              onChange={e => { setLastName(e.target.value); setErrors(v => ({ ...v, lastName: null })); }}
            />
            {errors.lastName && <p style={ERR}>{errors.lastName}</p>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={S.label}>Date of birth <span style={{ color: "#c0392b" }}>*</span></label>
            <input
              ref={dobRef}
              type="date"
              style={{ ...S.input, width: 180, marginBottom: 0, borderColor: errors.dob ? "#c0392b" : undefined }}
              value={dob}
              max={new Date().toLocaleDateString("en-CA")}
              onChange={e => {
                const newDob = e.target.value;
                setDob(newDob);
                setAge(computeAgeFromDob(newDob));
                setErrors(v => ({ ...v, dob: null }));
              }}
            />
          </div>
          <div>
            <label style={S.label}>Age</label>
            <input
              ref={ageRef}
              style={{ ...S.input, width: 80, marginBottom: 0, background: "#f9f9f9", color: C.muted }}
              type="text"
              readOnly
              value={age}
              placeholder="—"
            />
          </div>
        </div>
        {errors.dob && <p style={{ ...ERR, marginTop: 6 }}>{errors.dob}</p>}
        <div style={{ marginBottom: "0.75rem" }} />
        <label style={S.label}>Mailing address <span style={{ color: "#c0392b" }}>*</span></label>
        <input
          ref={addressLine1Ref}
          style={{ ...S.input, borderColor: errors.addressLine1 ? "#c0392b" : undefined }}
          placeholder="Address line 1"
          value={addressLine1}
          onChange={e => { setAddressLine1(e.target.value); setErrors(v => ({ ...v, addressLine1: null })); }}
        />
        {errors.addressLine1 && <p style={ERR}>{errors.addressLine1}</p>}
        <input
          style={S.input}
          placeholder="Address line 2 (apt, suite, etc.)"
          value={addressLine2}
          onChange={e => setAddressLine2(e.target.value)}
        />
        <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "100px 1fr 80px", gap: 12 }}>
          <div>
            <input
              ref={addressZipRef}
              style={{ ...S.input, marginBottom: 0, borderColor: errors.addressZip ? "#c0392b" : undefined }}
              placeholder="ZIP"
              value={addressZip}
              maxLength={5}
              onChange={e => { const v = e.target.value.replace(/\D/g, "").slice(0, 5); setAddressZip(v); setErrors(prev => ({ ...prev, addressZip: null })); }}
              onBlur={e => handleZipBlur(e.target.value)}
            />
            {zipLooking && <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Looking up…</p>}
            {errors.addressZip && <p style={{ ...ERR, marginTop: 2 }}>{errors.addressZip}</p>}
          </div>
          <input
            style={{ ...S.input, marginBottom: 0 }}
            placeholder="City"
            value={addressCity}
            onChange={e => setAddressCity(e.target.value)}
          />
          <input
            style={{ ...S.input, marginBottom: 0 }}
            placeholder="ST"
            maxLength={2}
            value={addressState}
            onChange={e => setAddressState(e.target.value.toUpperCase().slice(0, 2))}
          />
        </div>
        <div style={{ marginBottom: "0.75rem" }} />
        <label style={S.label}>Mobile number <span style={{ color: "#c0392b" }}>*</span></label>
        <input
          ref={phoneRef}
          style={{ ...S.input, borderColor: errors.phone ? "#c0392b" : undefined }}
          placeholder="(555) 012-3456" type="tel" value={phone}
          onChange={e => { setPhone(formatPhone(e.target.value)); setErrors(v => ({ ...v, phone: null })); }}
        />
        {errors.phone && <p style={ERR}>{errors.phone}</p>}
        <label style={S.label}>Backup phone number</label>
        <input
          ref={backupPhoneRef}
          style={{ ...S.input, borderColor: errors.backupPhone ? "#c0392b" : undefined }}
          placeholder="(555) 012-3456" type="tel" value={backupPhone}
          onChange={e => { setBackupPhone(formatPhone(e.target.value)); setErrors(v => ({ ...v, backupPhone: null })); }}
        />
        {errors.backupPhone && <p style={ERR}>{errors.backupPhone}</p>}
        <label style={S.label}>Preferred email address <span style={{ color: "#c0392b" }}>*</span></label>
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
          {smsEnabled && <option value="text">Text only</option>}
          {smsEnabled && <option value="both">Email and text</option>}
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

      {/* Payment method */}
      <div style={S.card}>
        <h3 style={S.h3}>Payment Method</h3>
        <p style={{ ...S.p, fontSize: 13, marginBottom: 16 }}>This is optional now but must be done before you can request a session. Your card will be saved at a secure 3rd party processor.</p>
        <PaymentMethodSection hasCard={false} />
      </div>

      {/* Background */}
      <div style={S.card}>
        <h3 style={S.h3}>Background</h3>
        <p style={{ ...S.p, fontSize: 13, marginBottom: 16 }}>Help me get to know a bit about you. Skip any question that is not applicable.</p>

        <label style={S.label}>What is your current occupation?</label>
        <textarea style={TA} value={bgOccupation} onChange={e => setBgOccupation(e.target.value)} />

        <label style={S.label}>What is your highest level of education?</label>
        <textarea style={TA} value={bgEducation} onChange={e => setBgEducation(e.target.value)} />

        <label style={S.label}>Are you currently seeing an individual therapist?</label>
        <textarea style={TA} value={bgTherapist} onChange={e => setBgTherapist(e.target.value)} />

        <label style={S.label}>If you have children, please list their names, dates of birth, ages, and grades in school.</label>
        <textarea style={TA} value={bgChildren} onChange={e => setBgChildren(e.target.value)} />

        <label style={S.label}>Describe your current living situation: alone or with what others?</label>
        <textarea style={TA} value={bgLiving} onChange={e => setBgLiving(e.target.value)} />

        <label style={S.label}>If you are in a relationship, please list your partner&apos;s name, their date of birth/age, and how long you&apos;ve been together.</label>
        <textarea style={TA} value={bgRelationship} onChange={e => setBgRelationship(e.target.value)} />

        <label style={S.label}>Describe the nature and current status of your partner relationship.</label>
        <textarea style={TA} value={bgRelationshipStatus} onChange={e => setBgRelationshipStatus(e.target.value)} />

        <label style={S.label}>If the relationship is ending, are you or the other party the initiator? Are you still together or have you separated?</label>
        <textarea style={TA} value={bgRelationshipEnding} onChange={e => setBgRelationshipEnding(e.target.value)} />

        <label style={S.label}>Are you in fear for your, or others&apos; in your household, safety or wellbeing?</label>
        <textarea style={TA} value={bgSafety} onChange={e => setBgSafety(e.target.value)} />

        <label style={S.label}>What is the next step for you, both short-term and long-term? What brings you to coaching now?</label>
        <textarea style={TA} value={bgBrings} onChange={e => setBgBrings(e.target.value)} />

        <label style={S.label}>What are your goals for coaching?</label>
        <textarea style={TA} value={bgGoals} onChange={e => setBgGoals(e.target.value)} />

        <label style={{ ...S.label, marginBottom: 4 }}>What else would you like me to know?</label>
        <textarea style={{ ...TA, marginBottom: 0 }} value={bgOther} onChange={e => setBgOther(e.target.value)} />
      </div>

      {!preview && saveError && <p style={{ fontSize: 13, color: "#c0392b", marginBottom: 12 }}>{saveError}</p>}
      {preview ? (
        <button style={{ ...S.btn, width: "100%", marginBottom: "2rem", background: C.muted }} onClick={onClosePreview}>
          Close preview
        </button>
      ) : (
        <button style={{ ...S.btn, width: "100%", marginBottom: "2rem" }} onClick={handleSubmit} disabled={saving}>
          {saving ? "Completing registration…" : "Complete registration"}
        </button>
      )}
    </div>
  );
}
