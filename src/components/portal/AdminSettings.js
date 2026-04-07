"use client";
import { useState, useEffect } from "react";
import { C, S } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function AdminSettings({ setPage }) {
  const [contactEmail, setContactEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  // Session types
  const [sessionTypes, setSessionTypes] = useState([]);
  const [newType, setNewType] = useState({ label: "", duration: "", fee: "" });
  const [editingType, setEditingType] = useState(null);

  // Scheduling settings
  const [increment, setIncrement] = useState("30");
  const [horizon, setHorizon] = useState("30");

  // Availability rules
  const [rules, setRules] = useState([]);
  const [newRule, setNewRule] = useState({ day_of_week: "1", start_time: "09:00", end_time: "17:00", is_blocked: false });

  // Google Calendar
  const [googleConnected, setGoogleConnected] = useState(false);

  useEffect(() => {
    loadAll();
    // Check for Google OAuth callback
    const params = new URLSearchParams(window.location.search);
    if (params.get("google_connected") === "true") {
      setGoogleConnected(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const loadAll = async () => {
    const supabase = createClient();

    const [settingsRes, typesRes, rulesRes] = await Promise.all([
      supabase.from("settings").select("key, value").in("key", [
        "contact_email", "scheduling_increment", "booking_horizon_days", "google_refresh_token"
      ]),
      fetch("/api/session-types").then(r => r.json()),
      supabase.from("availability_rules").select("*").order("day_of_week").order("start_time"),
    ]);

    const settings = {};
    (settingsRes.data || []).forEach(s => { settings[s.key] = s.value; });

    setContactEmail(settings.contact_email || "");
    setIncrement(settings.scheduling_increment || "30");
    setHorizon(settings.booking_horizon_days || "30");
    setGoogleConnected(!!settings.google_refresh_token);
    setSessionTypes(Array.isArray(typesRes) ? typesRes : []);
    setRules(rulesRes.data || []);
    setLoading(false);
  };

  // --- Save settings ---
  const saveSetting = async (key, value) => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    const supabase = createClient();
    const { error: e } = await supabase
      .from("settings")
      .upsert({ key, value, updated_at: new Date().toISOString() });
    setSaving(false);
    if (e) { setError("Could not save."); return false; }
    setSuccess(true);
    return true;
  };

  const handleSaveGeneral = async () => {
    await saveSetting("contact_email", contactEmail.trim());
    await saveSetting("scheduling_increment", increment);
    await saveSetting("booking_horizon_days", horizon);
  };

  // --- Session types ---
  const addSessionType = async () => {
    if (!newType.label || !newType.duration || !newType.fee) return;
    const res = await fetch("/api/session-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newType.label, duration: parseInt(newType.duration), fee: parseFloat(newType.fee) }),
    });
    if (res.ok) {
      const data = await res.json();
      setSessionTypes([...sessionTypes, data]);
      setNewType({ label: "", duration: "", fee: "" });
    }
  };

  const updateSessionType = async (id, updates) => {
    const res = await fetch("/api/session-types", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    });
    if (res.ok) {
      const data = await res.json();
      setSessionTypes(sessionTypes.map(t => t.id === id ? data : t));
      setEditingType(null);
    }
  };

  const removeSessionType = async (id) => {
    const res = await fetch("/api/session-types", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setSessionTypes(sessionTypes.filter(t => t.id !== id));
    }
  };

  // --- Availability rules ---
  const addRule = async () => {
    const res = await fetch("/api/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "rule", ...newRule, day_of_week: parseInt(newRule.day_of_week) }),
    });
    if (res.ok) {
      const data = await res.json();
      setRules([...rules, data].sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time)));
      setNewRule({ day_of_week: "1", start_time: "09:00", end_time: "17:00", is_blocked: false });
    }
  };

  const removeRule = async (id) => {
    const res = await fetch("/api/availability", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "rule", id }),
    });
    if (res.ok) {
      setRules(rules.filter(r => r.id !== id));
    }
  };

  if (loading) return <div style={S.page}><p style={S.p}>Loading...</p></div>;

  return (
    <div style={S.page}>
      <button style={{ ...S.navLink, marginBottom: 12, fontSize: 13, color: C.teal }} onClick={() => setPage("Admin")}>&larr; Back to Admin</button>
      <h1 style={{ ...S.h1, fontSize: 26 }}>Settings</h1>

      {error && <p style={{ fontSize: 13, color: "#c0392b", marginBottom: 12 }}>{error}</p>}
      {success && <p style={{ fontSize: 13, color: C.teal, marginBottom: 12 }}>Saved.</p>}

      {/* General settings */}
      <div style={S.card}>
        <h3 style={S.h3}>General</h3>
        <label style={S.label}>Contact form notification email</label>
        <input style={S.input} type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="diana@dkdivorcecoach.com" />

        <div style={{ display: "flex", gap: "1rem", marginBottom: "0.75rem" }}>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Scheduling increment</label>
            <select style={{ ...S.input, cursor: "pointer" }} value={increment} onChange={e => setIncrement(e.target.value)}>
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="60">60 minutes</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Booking horizon (days)</label>
            <input style={S.input} type="number" min="1" max="365" value={horizon} onChange={e => setHorizon(e.target.value)} />
          </div>
        </div>

        <button style={S.btn} onClick={handleSaveGeneral} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {/* Session types */}
      <div style={S.card}>
        <h3 style={S.h3}>Session Types</h3>
        <p style={{ ...S.p, fontSize: 13 }}>Define the coaching session options clients can book.</p>

        {sessionTypes.map(t => (
          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "8px 0", borderBottom: `0.5px solid ${C.border}` }}>
            {editingType === t.id ? (
              <>
                <input style={{ ...S.input, flex: 2, marginBottom: 0 }} value={t.label} onChange={e => setSessionTypes(sessionTypes.map(s => s.id === t.id ? { ...s, label: e.target.value } : s))} />
                <input style={{ ...S.input, flex: 1, marginBottom: 0 }} type="number" value={t.duration} onChange={e => setSessionTypes(sessionTypes.map(s => s.id === t.id ? { ...s, duration: parseInt(e.target.value) } : s))} />
                <input style={{ ...S.input, flex: 1, marginBottom: 0 }} type="number" step="0.01" value={t.fee} onChange={e => setSessionTypes(sessionTypes.map(s => s.id === t.id ? { ...s, fee: parseFloat(e.target.value) } : s))} />
                <button style={S.btnSm} onClick={() => updateSessionType(t.id, { label: t.label, duration: t.duration, fee: t.fee })}>Save</button>
                <button style={S.btnSmOut} onClick={() => setEditingType(null)}>Cancel</button>
              </>
            ) : (
              <>
                <span style={{ flex: 2, fontSize: 14, color: C.text }}>{t.label}</span>
                <span style={{ flex: 1, fontSize: 13, color: C.muted }}>{t.duration} min</span>
                <span style={{ flex: 1, fontSize: 13, color: C.muted }}>${Number(t.fee).toFixed(2)}</span>
                <button style={S.btnSmOut} onClick={() => setEditingType(t.id)}>Edit</button>
                <button style={{ ...S.btnSmOut, color: "#c0392b", border: "0.5px solid #c0392b" }} onClick={() => removeSessionType(t.id)}>Remove</button>
              </>
            )}
          </div>
        ))}

        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem", alignItems: "flex-end" }}>
          <div style={{ flex: 2 }}>
            <label style={S.label}>Label</label>
            <input style={{ ...S.input, marginBottom: 0 }} placeholder="e.g. Standard Session" value={newType.label} onChange={e => setNewType({ ...newType, label: e.target.value })} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Minutes</label>
            <input style={{ ...S.input, marginBottom: 0 }} type="number" placeholder="60" value={newType.duration} onChange={e => setNewType({ ...newType, duration: e.target.value })} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Fee ($)</label>
            <input style={{ ...S.input, marginBottom: 0 }} type="number" step="0.01" placeholder="150.00" value={newType.fee} onChange={e => setNewType({ ...newType, fee: e.target.value })} />
          </div>
          <button style={S.btnSm} onClick={addSessionType}>Add</button>
        </div>
      </div>

      {/* Availability rules */}
      <div style={S.card}>
        <h3 style={S.h3}>Weekly Availability</h3>
        <p style={{ ...S.p, fontSize: 13 }}>Set your recurring weekly schedule. Clients can only book during these hours.</p>

        {rules.map(r => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "8px 0", borderBottom: `0.5px solid ${C.border}` }}>
            <span style={{ flex: 2, fontSize: 14, color: r.is_blocked ? "#c0392b" : C.text }}>
              {r.is_blocked ? "Block: " : ""}{DAYS[r.day_of_week]}
            </span>
            <span style={{ flex: 1, fontSize: 13, color: C.muted }}>
              {formatTime(r.start_time)} - {formatTime(r.end_time)}
            </span>
            <button style={{ ...S.btnSmOut, color: "#c0392b", border: "0.5px solid #c0392b" }} onClick={() => removeRule(r.id)}>Remove</button>
          </div>
        ))}

        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 2, minWidth: 120 }}>
            <label style={S.label}>Day</label>
            <select style={{ ...S.input, marginBottom: 0, cursor: "pointer" }} value={newRule.day_of_week} onChange={e => setNewRule({ ...newRule, day_of_week: e.target.value })}>
              {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 90 }}>
            <label style={S.label}>From</label>
            <input style={{ ...S.input, marginBottom: 0 }} type="time" value={newRule.start_time} onChange={e => setNewRule({ ...newRule, start_time: e.target.value })} />
          </div>
          <div style={{ flex: 1, minWidth: 90 }}>
            <label style={S.label}>To</label>
            <input style={{ ...S.input, marginBottom: 0 }} type="time" value={newRule.end_time} onChange={e => setNewRule({ ...newRule, end_time: e.target.value })} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, paddingBottom: 2 }}>
            <input type="checkbox" id="is_blocked" checked={newRule.is_blocked} onChange={e => setNewRule({ ...newRule, is_blocked: e.target.checked })} />
            <label htmlFor="is_blocked" style={{ fontSize: 12, color: C.muted, cursor: "pointer" }}>Block</label>
          </div>
          <button style={S.btnSm} onClick={addRule}>{newRule.is_blocked ? "Add Block" : "Add Hours"}</button>
        </div>
      </div>

      {/* Google Calendar */}
      <div style={S.card}>
        <h3 style={S.h3}>Google Calendar</h3>
        <p style={{ ...S.p, fontSize: 13 }}>
          {googleConnected
            ? "Google Calendar is connected. Events will sync automatically."
            : "Connect your Google Calendar to sync appointments."}
        </p>
        {googleConnected ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: C.teal, fontWeight: 500 }}>Connected</span>
            <button style={S.btnSmOut} onClick={() => window.location.href = "/api/calendar/auth"}>Reconnect</button>
          </div>
        ) : (
          <button style={S.btn} onClick={() => window.location.href = "/api/calendar/auth"}>Connect Google Calendar</button>
        )}
      </div>
    </div>
  );
}

function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "pm" : "am";
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${display}:${m} ${ampm}`;
}
