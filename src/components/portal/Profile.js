"use client";
import { useState, useEffect, useRef } from "react";
import { C, S, SERVER_ERROR } from "@/lib/constants";
import { useError } from "@/context/ErrorContext";
import { useAuth } from "@/context/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { useSmsEnabled } from "@/lib/hooks";
import { retryFetch } from "@/lib/fetchUtils";
import { PaymentMethodSection } from "@/components/portal/PaymentMethodSection";

const TA = {
  width: "100%", padding: "10px 12px", fontSize: 14,
  border: "0.5px solid #d0d0d0", borderRadius: 6, outline: "none",
  resize: "vertical", minHeight: 80, marginBottom: "0.75rem",
  fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box",
};

export default function Profile({ onSaved, viewAsClient, scrollTo, onScrolled }) {
  const { user, profile, refreshProfile } = useAuth();
  const smsEnabled = useSmsEnabled();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [backupPhone, setBackupPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [addressZip, setAddressZip] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [zipLooking, setZipLooking] = useState(false);
  const [preferredEmail, setPreferredEmail] = useState("");
  const [notificationPref, setNotificationPref] = useState("email");
  const [reminderPref, setReminderPref] = useState("both");
  const [isCoach, setIsCoach] = useState(false);
  const [adminReminderChannel, setAdminReminderChannel] = useState("both");
  const [adminReminderMinutes, setAdminReminderMinutes] = useState("30");
  const [timezone, setTimezone] = useState("America/New_York");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const [bgOccupation, setBgOccupation] = useState("");
  const [bgEducation, setBgEducation] = useState("");
  const [bgRelationship, setBgRelationship] = useState("");
  const [bgTherapist, setBgTherapist] = useState("");
  const [bgLiving, setBgLiving] = useState("");
  const [bgBrings, setBgBrings] = useState("");
  const [bgGoals, setBgGoals] = useState("");
  const [bgOther, setBgOther] = useState("");
  const [bgSaving, setBgSaving] = useState(false);
  const [bgError, setBgError] = useState(null);
  const [bgSuccess, setBgSuccess] = useState(false);

  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [cardOnFile, setCardOnFile] = useState(null);
  const { setServerError } = useError();

  const paymentRef = useRef(null);

  useEffect(() => {
    if (scrollTo === "payment" && paymentRef.current) {
      paymentRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
      if (onScrolled) onScrolled();
    }
  }, [scrollTo, onScrolled, profile]);

  const isFirstLogin = !profile?.first_name;

  useEffect(() => {
    if (!viewAsClient && profile?.role === "client" && !isFirstLogin) {
      fetch("/api/stripe/card")
        .then(r => r.json())
        .then(d => setCardOnFile(!!d.card))
        .catch(() => {});
    }
  }, [profile, viewAsClient, isFirstLogin]);

  const TIMEZONES = [
    { value: "America/New_York", label: "Eastern Time (New York)" },
    { value: "America/Chicago", label: "Central Time (Chicago)" },
    { value: "America/Denver", label: "Mountain Time (Denver)" },
    { value: "America/Phoenix", label: "Arizona (no DST)" },
    { value: "America/Los_Angeles", label: "Pacific Time (Los Angeles)" },
    { value: "America/Anchorage", label: "Alaska Time" },
    { value: "Pacific/Honolulu", label: "Hawaii Time" },
  ];

  const detectTz = () => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
    } catch {
      return "America/New_York";
    }
  };

  const formatPhone = (value) => {
    const digits = value.replace(/\D/g, "").slice(0, 10);
    if (digits.length === 0) return "";
    if (digits.length <= 3) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const populateFrom = (src, emailFallback) => {
    setFirstName(src.first_name || "");
    setLastName(src.last_name || "");
    setPhone(formatPhone(src.phone || ""));
    setBackupPhone(formatPhone(src.backup_phone || ""));
    setAddressLine1(src.address_line1 || "");
    setAddressLine2(src.address_line2 || "");
    setAddressZip(src.address_zip || "");
    setAddressCity(src.address_city || "");
    setAddressState(src.address_state || "");
    setPreferredEmail(src.preferred_email || emailFallback || "");
    setNotificationPref(src.notification_preference || "email");
    setReminderPref(src.reminder_preference || "both");
    setIsCoach(src.is_coach || false);
    setAdminReminderChannel(src.admin_reminder_channel || "both");
    setAdminReminderMinutes(src.admin_reminder_minutes ? String(src.admin_reminder_minutes) : "30");
    setTimezone(src.timezone || detectTz());
    setBgOccupation(src.bg_occupation || "");
    setBgEducation(src.bg_education || "");
    setBgRelationship(src.bg_relationship || "");
    setBgTherapist(src.bg_therapist || "");
    setBgLiving(src.bg_living || "");
    setBgBrings(src.bg_brings || "");
    setBgGoals(src.bg_goals || "");
    setBgOther(src.bg_other || "");
  };

  useEffect(() => {
    if (viewAsClient) {
      populateFrom(viewAsClient, viewAsClient.email);
    } else if (profile) {
      populateFrom(profile, user?.email);
    } else if (user) {
      setPreferredEmail(user.email || "");
    }
  }, [profile, user, viewAsClient]);

  const resetProfile = () => {
    const src = viewAsClient || profile;
    if (!src) return;
    populateFrom(src, viewAsClient ? viewAsClient.email : user?.email);
    setError(null);
    setSuccess(false);
  };

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

  const profilePayload = () => ({
    first_name: firstName.trim(),
    last_name: lastName.trim(),
    phone: phone.trim() || null,
    backup_phone: backupPhone.trim() || null,
    address_line1: addressLine1.trim() || null,
    address_line2: addressLine2.trim() || null,
    address_zip: addressZip.trim() || null,
    address_city: addressCity.trim() || null,
    address_state: addressState.trim() || null,
    notification_preference: notificationPref,
    reminder_preference: reminderPref,
    timezone,
  });

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setError("First name and last name are required.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(false);

    if (viewAsClient) {
      const payload = {
        id: viewAsClient.id,
        preferred_email: preferredEmail.trim() || viewAsClient.email,
        ...profilePayload(),
      };
      try {
        const res = await retryFetch("/api/clients", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        setSaving(false);
        if (!res.ok) {
          if (res.status >= 500) { setServerError(SERVER_ERROR); return; }
          setError("Could not save profile. Please try again.");
          return;
        }
        setSuccess(true);
        Object.assign(viewAsClient, payload);
      } catch {
        setSaving(false);
        setServerError(SERVER_ERROR);
        return;
      }
    } else {
      const supabase = createClient();
      const adminFields = isAdminSelf ? {
        is_coach: isCoach,
        admin_reminder_channel: isCoach ? adminReminderChannel : null,
        admin_reminder_minutes: isCoach ? parseInt(adminReminderMinutes) : null,
      } : {};
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          full_name: `${firstName.trim()} ${lastName.trim()}`,
          preferred_email: preferredEmail.trim() || user.email,
          ...profilePayload(),
          ...adminFields,
        })
        .eq("id", user.id);

      setSaving(false);
      if (updateError) {
        setError("Could not save profile. Please try again.");
      } else {
        setSuccess(true);
        if (onSaved) onSaved();
      }
    }
  };

  const handleBgSave = async () => {
    setBgSaving(true);
    setBgError(null);
    setBgSuccess(false);
    const bgPayload = {
      bg_occupation: bgOccupation.trim() || null,
      bg_education: bgEducation.trim() || null,
      bg_relationship: bgRelationship.trim() || null,
      bg_therapist: bgTherapist.trim() || null,
      bg_living: bgLiving.trim() || null,
      bg_brings: bgBrings.trim() || null,
      bg_goals: bgGoals.trim() || null,
      bg_other: bgOther.trim() || null,
    };
    try {
      const res = await retryFetch("/api/clients", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: viewAsClient.id, ...bgPayload }),
      });
      setBgSaving(false);
      if (!res.ok) {
        if (res.status >= 500) { setServerError(SERVER_ERROR); return; }
        setBgError("Could not save. Please try again.");
        return;
      }
      setBgSuccess(true);
      Object.assign(viewAsClient, bgPayload);
    } catch {
      setBgSaving(false);
      setServerError(SERVER_ERROR);
    }
  };

  const isAdminSelf = profile?.role === "admin" && !viewAsClient;

  const handleIsCoachChange = async (checked) => {
    if (!checked) {
      if (!window.confirm("Unchecking this will disable session reminders for your profile. Continue?")) return;
      setIsCoach(false);
      return;
    }
    const supabase = createClient();
    const { data: existing } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("is_coach", true)
      .neq("id", user.id)
      .maybeSingle();
    if (existing) {
      setError(`${existing.first_name} ${existing.last_name} is currently the coach. Remove that designation from their profile first.`);
      return;
    }
    setIsCoach(true);
  };

  return (
    <div style={S.page}>
      <h1 style={{...S.h1, fontSize:26}}>
        {viewAsClient ? `${viewAsClient.first_name}'s Profile` : isFirstLogin ? "Welcome! Set up your profile" : "Your profile"}
      </h1>
      <p style={S.p}>
        {viewAsClient
          ? "Edit this client's profile information."
          : isFirstLogin
          ? "Please fill in your details to get started."
          : "Update your information below."}
      </p>
      <div style={S.card}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <div>
            <label style={S.label}>First name</label>
            <input style={S.input} placeholder="Jane" value={firstName} onChange={e => setFirstName(e.target.value)} />
          </div>
          <div>
            <label style={S.label}>Last name</label>
            <input style={S.input} placeholder="Smith" value={lastName} onChange={e => setLastName(e.target.value)} />
          </div>
        </div>
        <label style={S.label}>Mailing address</label>
        <input style={S.input} placeholder="Address line 1" value={addressLine1} onChange={e => setAddressLine1(e.target.value)} />
        <input style={S.input} placeholder="Address line 2 (apt, suite, etc.)" value={addressLine2} onChange={e => setAddressLine2(e.target.value)} />
        <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 80px", gap: 12, marginBottom: "0.75rem" }}>
          <div>
            <input
              style={{ ...S.input, marginBottom: 0 }}
              placeholder="ZIP" value={addressZip} maxLength={5}
              onChange={e => { const v = e.target.value.replace(/\D/g, "").slice(0, 5); setAddressZip(v); }}
              onBlur={e => handleZipBlur(e.target.value)}
            />
            {zipLooking && <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Looking up…</p>}
          </div>
          <input style={{ ...S.input, marginBottom: 0 }} placeholder="City" value={addressCity} onChange={e => setAddressCity(e.target.value)} />
          <input style={{ ...S.input, marginBottom: 0 }} placeholder="ST" maxLength={2} value={addressState} onChange={e => setAddressState(e.target.value.toUpperCase().slice(0, 2))} />
        </div>
        <label style={S.label}>Mobile number</label>
        <input style={S.input} placeholder="(555) 012-3456" type="tel" value={phone} onChange={e => setPhone(formatPhone(e.target.value))} />
        <label style={S.label}>Backup phone number</label>
        <input style={S.input} placeholder="(555) 012-3456" type="tel" value={backupPhone} onChange={e => setBackupPhone(formatPhone(e.target.value))} />
        <label style={S.label}>Preferred email address</label>
        <input style={S.input} placeholder="jane@example.com" type="email" value={preferredEmail} onChange={e => setPreferredEmail(e.target.value)} />

        <label style={S.label}>Notification preference</label>
        {smsEnabled && !isAdminSelf && <p style={{ fontSize: 12, color: C.muted, marginBottom: "0.5rem", marginTop: "-0.25rem", lineHeight: 1.5 }}>If you opt-in to receive notifications regarding your schedule by text (SMS), msg and data rates may apply. Msg frequency depends on your use of the website. You can opt-out any time by returning and selecting &ldquo;Email only&rdquo;.</p>}
        <select style={{ ...S.input, cursor: "pointer" }} value={notificationPref} onChange={e => setNotificationPref(e.target.value)}>
          <option value="email">Email only</option>
          {smsEnabled && <option value="text">Text only</option>}
          {smsEnabled && <option value="both">Email and text</option>}
          {isAdminSelf && <option value="none">None</option>}
        </select>

        {isAdminSelf ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "0.75rem" }}>
              <input
                id="is-coach"
                type="checkbox"
                checked={isCoach}
                onChange={e => handleIsCoachChange(e.target.checked)}
                style={{ width: 16, height: 16, cursor: "pointer" }}
              />
              <label htmlFor="is-coach" style={{ ...S.label, marginBottom: 0, cursor: "pointer" }}>
                I am the coach
              </label>
            </div>
            {isCoach && (
              <div style={{ display: "flex", gap: "1rem", marginBottom: "0.75rem" }}>
                <div style={{ flex: 1 }}>
                  <label style={S.label}>Session reminder method</label>
                  <select style={{ ...S.input, cursor: "pointer" }} value={adminReminderChannel} onChange={e => setAdminReminderChannel(e.target.value)}>
                    <option value="none">None</option>
                    <option value="email">Email only</option>
                    <option value="text">Text only</option>
                    <option value="both">Email and text</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={S.label}>Remind me before session</label>
                  <select style={{ ...S.input, cursor: "pointer" }} value={adminReminderMinutes} onChange={e => setAdminReminderMinutes(e.target.value)}>
                    <option value="15">15 minutes</option>
                    <option value="30">30 minutes</option>
                    <option value="45">45 minutes</option>
                    <option value="60">60 minutes</option>
                  </select>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <label style={S.label}>Session reminders</label>
            <select style={{ ...S.input, cursor: "pointer" }} value={reminderPref} onChange={e => setReminderPref(e.target.value)}>
              <option value="both">24 hours and 1 hour before</option>
              <option value="24h">24 hours before</option>
              <option value="1h">1 hour before</option>
              <option value="none">No reminders</option>
            </select>
          </>
        )}

        <label style={S.label}>Timezone</label>
        <select style={{ ...S.input, cursor: "pointer" }} value={timezone} onChange={e => setTimezone(e.target.value)}>
          {TIMEZONES.find(t => t.value === timezone) ? null : (
            <option value={timezone}>{timezone}</option>
          )}
          {TIMEZONES.map(tz => (
            <option key={tz.value} value={tz.value}>{tz.label}</option>
          ))}
        </select>

        {error && <p style={{ fontSize:13, color:"#c0392b", marginBottom:12 }}>{error}</p>}
        {success && <p style={{ fontSize:13, color:C.teal, marginBottom:12 }}>Profile saved.</p>}
        <div style={{ display:"flex", gap:8 }}>
          <button style={S.btn} onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save profile"}
          </button>
          <button style={S.btnSmOut} onClick={resetProfile} disabled={saving}>Discard changes</button>
        </div>
      </div>

      {/* Background — admin view only */}
      {viewAsClient && (
        <div style={{ ...S.card, marginTop: "1rem" }}>
          <h3 style={{ ...S.h3, fontWeight: 700 }}>Background</h3>
          <p style={{ ...S.p, fontSize: 13, marginBottom: 16 }}>Help me get to know a bit about you.</p>

          <label style={S.label}>What is your current occupation?</label>
          <textarea style={TA} value={bgOccupation} onChange={e => setBgOccupation(e.target.value)} />

          <label style={S.label}>What is your highest level of education?</label>
          <textarea style={TA} value={bgEducation} onChange={e => setBgEducation(e.target.value)} />

          <label style={S.label}>If you are in a relationship, please describe its nature.</label>
          <textarea style={TA} value={bgRelationship} onChange={e => setBgRelationship(e.target.value)} />

          <label style={S.label}>Are you currently seeing an individual therapist?</label>
          <textarea style={TA} value={bgTherapist} onChange={e => setBgTherapist(e.target.value)} />

          <label style={S.label}>Describe your current living situation: alone or with what others?</label>
          <textarea style={TA} value={bgLiving} onChange={e => setBgLiving(e.target.value)} />

          <label style={S.label}>What brings you to coaching now?</label>
          <textarea style={TA} value={bgBrings} onChange={e => setBgBrings(e.target.value)} />

          <label style={S.label}>What are your goals for coaching?</label>
          <textarea style={TA} value={bgGoals} onChange={e => setBgGoals(e.target.value)} />

          <label style={{ ...S.label, marginBottom: 4 }}>What else would you like me to know?</label>
          <textarea style={{ ...TA, marginBottom: "0.75rem" }} value={bgOther} onChange={e => setBgOther(e.target.value)} />

          {bgError && <p style={{ fontSize: 13, color: "#c0392b", marginBottom: 12 }}>{bgError}</p>}
          {bgSuccess && <p style={{ fontSize: 13, color: C.teal, marginBottom: 12 }}>Saved.</p>}
          <button style={S.btn} onClick={handleBgSave} disabled={bgSaving}>
            {bgSaving ? "Saving…" : "Save background"}
          </button>
        </div>
      )}

      {/* Change password — only show after profile is set up, not in admin view mode */}
      {!viewAsClient && !isFirstLogin && (
        <div style={{ ...S.card, marginTop: "1rem" }}>
          <h3 style={{ ...S.h3, fontWeight: 700 }}>Change Password</h3>
          <label style={S.label}>New password</label>
          <div style={{ position: "relative", marginBottom: "0.75rem" }}>
            <input
              type={showPw ? "text" : "password"}
              style={{ ...S.input, marginBottom: 0, paddingRight: 40 }}
              placeholder="Minimum 8 characters"
              value={pwNew}
              onChange={e => { setPwNew(e.target.value); setPwError(null); setPwSuccess(false); }}
            />
            <button onClick={() => setShowPw(v => !v)} style={{
              position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 4,
            }}>
              {showPw ? (
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
          <label style={S.label}>Confirm new password</label>
          <input
            type={showPw ? "text" : "password"}
            style={S.input}
            placeholder="Re-enter your new password"
            value={pwConfirm}
            onChange={e => { setPwConfirm(e.target.value); setPwError(null); setPwSuccess(false); }}
          />
          {pwError && <p style={{ fontSize: 13, color: "#c0392b", marginBottom: 12 }}>{pwError}</p>}
          {pwSuccess && <p style={{ fontSize: 13, color: C.teal, marginBottom: 12 }}>Password updated.</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button style={S.btn} disabled={pwSaving} onClick={async () => {
            if (!pwNew) { setPwError("Enter a new password."); return; }
            if (pwNew.length < 8) { setPwError("Password must be at least 8 characters."); return; }
            if (pwNew !== pwConfirm) { setPwError("Passwords do not match."); return; }
            setPwSaving(true);
            setPwError(null);
            const supabase = createClient();
            const { error: err } = await supabase.auth.updateUser({ password: pwNew });
            setPwSaving(false);
            if (err) { setPwError(err.message || "Could not update password."); }
            else { setPwSuccess(true); setPwNew(""); setPwConfirm(""); }
          }}>
              {pwSaving ? "Updating…" : "Update password"}
            </button>
            <button style={S.btnSmOut} disabled={pwSaving} onClick={() => { setPwNew(""); setPwConfirm(""); setPwError(null); setPwSuccess(false); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Payment method — only show for clients after initial profile setup, not in admin view */}
      {!viewAsClient && !isFirstLogin && profile?.role !== "admin" && (
        <div ref={paymentRef} style={{ ...S.card, marginTop: "1rem" }}>
          <h3 style={{ ...S.h3, fontWeight: 700 }}>Payment Method</h3>
          <p style={{ ...S.p, fontSize: 13 }}>
            {cardOnFile === true
              ? "You have a card on file. You can update it below."
              : cardOnFile === false
              ? "Add a card on file to book coaching sessions."
              : " "}
          </p>
          <PaymentMethodSection hasCard={!!profile?.stripe_customer_id} onSaved={refreshProfile} />
        </div>
      )}
    </div>
  );
}

