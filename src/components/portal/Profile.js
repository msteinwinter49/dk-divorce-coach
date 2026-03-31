"use client";
import { useState, useEffect } from "react";
import { C, S } from "@/lib/constants";
import { useAuth } from "@/context/AuthContext";
import { createClient } from "@/lib/supabase/client";

export default function Profile({ onSaved }) {
  const { user, profile } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [preferredEmail, setPreferredEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const isFirstLogin = !profile?.first_name;

  const formatPhone = (value) => {
    const digits = value.replace(/\D/g, "").slice(0, 10);
    if (digits.length === 0) return "";
    if (digits.length <= 3) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name || "");
      setLastName(profile.last_name || "");
      setPhone(formatPhone(profile.phone || ""));
      setPreferredEmail(profile.preferred_email || user?.email || "");
    } else if (user) {
      setPreferredEmail(user.email || "");
    }
  }, [profile, user]);

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setError("First name and last name are required.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(false);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        full_name: `${firstName.trim()} ${lastName.trim()}`,
        phone: phone.trim() || null,
        preferred_email: preferredEmail.trim() || user.email,
      })
      .eq("id", user.id);

    setSaving(false);
    if (updateError) {
      setError("Could not save profile. Please try again.");
    } else {
      setSuccess(true);
      if (onSaved) onSaved();
    }
  };

  return (
    <div style={S.page}>
      <h1 style={{...S.h1, fontSize:26}}>
        {isFirstLogin ? "Welcome! Set up your profile" : "Your profile"}
      </h1>
      <p style={S.p}>
        {isFirstLogin
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
        <label style={S.label}>Mobile number</label>
        <input style={S.input} placeholder="(555) 012-3456" type="tel" value={phone} onChange={e => setPhone(formatPhone(e.target.value))} />
        <label style={S.label}>Preferred email address</label>
        <input style={S.input} placeholder="jane@example.com" type="email" value={preferredEmail} onChange={e => setPreferredEmail(e.target.value)} />
        {error && <p style={{ fontSize:13, color:"#c0392b", marginBottom:12 }}>{error}</p>}
        {success && <p style={{ fontSize:13, color:C.teal, marginBottom:12 }}>Profile saved.</p>}
        <button style={S.btn} onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save profile"}
        </button>
      </div>
    </div>
  );
}
