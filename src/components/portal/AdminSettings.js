"use client";
import { useState, useEffect } from "react";
import { C, S } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";

export default function AdminSettings({ setPage }) {
  const [contactEmail, setContactEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.from("settings")
      .select("value")
      .eq("key", "contact_email")
      .single()
      .then(({ data }) => {
        if (data) setContactEmail(data.value);
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    const supabase = createClient();
    const { error: upsertError } = await supabase
      .from("settings")
      .upsert({ key: "contact_email", value: contactEmail.trim(), updated_at: new Date().toISOString() });
    setSaving(false);
    if (upsertError) {
      setError("Could not save. Please try again.");
    } else {
      setSuccess(true);
    }
  };

  return (
    <div style={S.page}>
      <button style={{ ...S.navLink, marginBottom:12, fontSize:13, color:C.teal }} onClick={() => setPage("Admin")}>&larr; Back to Admin</button>
      <h1 style={{...S.h1, fontSize:26}}>Settings</h1>
      <p style={S.p}>Configure site and account settings.</p>
      <div style={S.card}>
        <h3 style={S.h3}>Contact form notifications</h3>
        <p style={{ ...S.p, fontSize:13 }}>New contact form submissions will be sent to this email address.</p>
        <label style={S.label}>Email address</label>
        <input
          style={S.input}
          placeholder="diana@dkdivorcecoach.com"
          type="email"
          value={loading ? "" : contactEmail}
          onChange={e => setContactEmail(e.target.value)}
          disabled={loading}
        />
        {error && <p style={{ fontSize:13, color:"#c0392b", marginBottom:12 }}>{error}</p>}
        {success && <p style={{ fontSize:13, color:C.teal, marginBottom:12 }}>Saved.</p>}
        <button style={S.btn} onClick={handleSave} disabled={saving || loading}>
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
