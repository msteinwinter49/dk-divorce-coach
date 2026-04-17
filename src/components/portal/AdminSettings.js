"use client";
import { useState, useEffect } from "react";
import { C, S } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// type="text" + inputMode avoids browser spinner controls on number inputs
const plainNumberInput = {
  width: "100%",
  padding: "10px 12px",
  fontSize: 14,
  border: "0.5px solid #d0d0d0",
  borderRadius: 6,
  outline: "none",
  marginBottom: 0,
  flex: 1,
  background: "#fff",
};

export default function AdminSettings({ setPage }) {
  const [contactEmail, setContactEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  // Session types
  const [sessionTypes, setSessionTypes] = useState([]);
  const [newType, setNewType] = useState({ label: "", duration: "" });
  const [editingType, setEditingType] = useState(null);

  // Pricing matrix
  const [pricingRows, setPricingRows] = useState([]);
  const [newPricing, setNewPricing] = useState({ duration_min: "", package_size: "", hourly_rate: "", expires_months: "" });
  const [editingPricing, setEditingPricing] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [pricingError, setPricingError] = useState(null);

  // Package sizes offered (1..20)
  const [packageSizes, setPackageSizes] = useState([]);

  // Scheduling settings
  const [increment, setIncrement] = useState("30");
  const [horizon, setHorizon] = useState("30");

  // Availability rules
  const [rules, setRules] = useState([]);
  const [newRule, setNewRule] = useState({ day_of_week: "1", start_time: "09:00", end_time: "17:00", is_blocked: false });

  // Admin reminders
  const [reminderChannel, setReminderChannel] = useState("both");
  const [reminderMinutes, setReminderMinutes] = useState("30");

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

    const [settingsRes, typesRes, rulesRes, pricingRes] = await Promise.all([
      supabase.from("settings").select("key, value").in("key", [
        "contact_email", "scheduling_increment", "booking_horizon_days", "google_refresh_token",
        "admin_reminder_channel", "admin_reminder_minutes", "package_sizes"
      ]),
      fetch("/api/session-types").then(r => r.json()),
      supabase.from("availability_rules").select("*").order("day_of_week").order("start_time"),
      fetch("/api/pricing-matrix").then(r => r.json()),
    ]);

    const settings = {};
    (settingsRes.data || []).forEach(s => { settings[s.key] = s.value; });

    setContactEmail(settings.contact_email || "");
    setIncrement(settings.scheduling_increment || "30");
    setHorizon(settings.booking_horizon_days || "30");
    setReminderChannel(settings.admin_reminder_channel || "both");
    setReminderMinutes(settings.admin_reminder_minutes || "30");
    setGoogleConnected(!!settings.google_refresh_token);
    setPackageSizes(parsePackageSizes(settings.package_sizes));
    setSessionTypes(Array.isArray(typesRes) ? typesRes : []);
    setRules(rulesRes.data || []);
    const activePricing = Array.isArray(pricingRes) ? pricingRes.filter(p => p.is_active) : [];
    setPricingRows(activePricing);
    // Seed new-line form with last row's hourly rate + expiration (carry-over)
    if (activePricing.length > 0) {
      const last = activePricing[activePricing.length - 1];
      setNewPricing(prev => ({
        ...prev,
        hourly_rate: hourlyRateOf(last).toFixed(2),
        expires_months: String(last.expires_months),
      }));
    }
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
    await saveSetting("admin_reminder_channel", reminderChannel);
    await saveSetting("admin_reminder_minutes", reminderMinutes);
  };

  // --- Session types ---
  const addSessionType = async () => {
    if (!newType.label || !newType.duration) return;
    const res = await fetch("/api/session-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newType.label, duration: parseInt(newType.duration) }),
    });
    if (res.ok) {
      const data = await res.json();
      setSessionTypes([...sessionTypes, data]);
      setNewType({ label: "", duration: "" });
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

  // --- Package sizes ---
  const togglePackageSize = async (n) => {
    const next = packageSizes.includes(n)
      ? packageSizes.filter(x => x !== n)
      : [...packageSizes, n].sort((a, b) => a - b);
    setPackageSizes(next);
    await saveSetting("package_sizes", next.join(","));
  };

  // --- Pricing matrix ---
  const addPricing = async () => {
    const { duration_min, package_size, hourly_rate, expires_months } = newPricing;
    const d = parseInt(duration_min);
    const s = parseInt(package_size);
    const hr = parseFloat(hourly_rate);
    const m = parseInt(expires_months);
    setPricingError(null);
    const missing = [];
    if (!d) missing.push("Duration");
    if (!s) missing.push("Sessions");
    if (!hr) missing.push("Hourly Rate");
    if (!m) missing.push("Expires");
    if (missing.length) {
      setPricingError(`Fill in: ${missing.join(", ")}`);
      return;
    }
    const price_cents = Math.round((hr * d * s / 60) * 100);
    const res = await fetch("/api/pricing-matrix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ duration_min: d, package_size: s, price_cents, expires_months: m }),
    });
    if (res.ok) {
      const data = await res.json();
      setPricingRows([...pricingRows, data].sort(sortPricing));
      // Carry-over hourly_rate + expires_months; clear duration + sessions
      setNewPricing({ duration_min: "", package_size: "", hourly_rate, expires_months });
    } else {
      const { error: e } = await res.json().catch(() => ({}));
      setPricingError(e || "Could not add pricing row. (Duplicate duration + package size?)");
    }
  };

  const startEditPricing = (p) => {
    setEditingPricing(p.id);
    setEditDraft({
      duration_min: String(p.duration_min),
      package_size: String(p.package_size),
      hourly_rate: hourlyRateOf(p).toFixed(2),
      expires_months: String(p.expires_months),
    });
  };

  const saveEditPricing = async () => {
    if (!editDraft) return;
    const d = parseInt(editDraft.duration_min);
    const s = parseInt(editDraft.package_size);
    const hr = parseFloat(editDraft.hourly_rate);
    const m = parseInt(editDraft.expires_months);
    if (!d || !s || !hr || !m) return;
    const price_cents = Math.round((hr * d * s / 60) * 100);
    const res = await fetch("/api/pricing-matrix", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingPricing, duration_min: d, package_size: s, price_cents, expires_months: m }),
    });
    if (res.ok) {
      const data = await res.json();
      setPricingRows(pricingRows.map(p => p.id === editingPricing ? data : p).sort(sortPricing));
      setEditingPricing(null);
      setEditDraft(null);
    }
  };

  const removePricing = async (id) => {
    const res = await fetch("/api/pricing-matrix", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setPricingRows(pricingRows.filter(p => p.id !== id));
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

        <div style={{ display: "flex", gap: "1rem", marginBottom: "0.75rem" }}>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Session reminder method</label>
            <select style={{ ...S.input, cursor: "pointer" }} value={reminderChannel} onChange={e => setReminderChannel(e.target.value)}>
              <option value="none">None</option>
              <option value="email">Email only</option>
              <option value="text">Text only</option>
              <option value="both">Email and text</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Remind me before session</label>
            <select style={{ ...S.input, cursor: "pointer" }} value={reminderMinutes} onChange={e => setReminderMinutes(e.target.value)}>
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="45">45 minutes</option>
              <option value="60">60 minutes</option>
            </select>
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
                <button style={S.btnSm} onClick={() => updateSessionType(t.id, { label: t.label, duration: t.duration })}>Save</button>
                <button style={S.btnSmOut} onClick={() => setEditingType(null)}>Cancel</button>
              </>
            ) : (
              <>
                <span style={{ flex: 2, fontSize: 14, color: C.text }}>{t.label}</span>
                <span style={{ flex: 1, fontSize: 13, color: C.muted }}>{t.duration} min</span>
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
          <button style={S.btnSm} onClick={addSessionType}>Add</button>
        </div>
      </div>

      {/* Packages */}
      <div style={S.card}>
        <h3 style={S.h3}>Packages</h3>
        <p style={{ ...S.p, fontSize: 13 }}>Select the package sizes (number of sessions) clients can purchase.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem 1rem", paddingTop: "0.25rem" }}>
          {Array.from({ length: 20 }, (_, i) => i + 1).map(n => (
            <label key={n} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: C.text, cursor: "pointer", userSelect: "none" }}>
              <input type="checkbox" checked={packageSizes.includes(n)} onChange={() => togglePackageSize(n)} />
              {n}
            </label>
          ))}
        </div>
      </div>

      {/* Pricing matrix */}
      <div style={S.card}>
        <h3 style={S.h3}>Pricing</h3>
        <p style={{ ...S.p, fontSize: 13 }}>Each row is a package offering: session duration × package size. Hourly rate drives the Package Price.</p>
        {pricingError && <p style={{ fontSize: 13, color: "#c0392b", marginBottom: 12 }}>{pricingError}</p>}

        {pricingRows.length > 0 && (
          <div style={{ display: "flex", gap: "0.75rem", padding: "6px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12, color: C.hint, fontWeight: 500 }}>
            <span style={{ flex: 1 }}>Session Type</span>
            <span style={{ flex: 1 }}>Package</span>
            <span style={{ flex: 1 }}>Hourly Rate</span>
            <span style={{ flex: 1 }}>Package Price</span>
            <span style={{ flex: 1 }}>Expires</span>
            <span style={{ width: 140 }}></span>
          </div>
        )}

        {pricingRows.map(p => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "8px 0", borderBottom: `0.5px solid ${C.border}` }}>
            {editingPricing === p.id && editDraft ? (
              <>
                <select style={{ ...plainNumberInput, cursor: "pointer" }} value={editDraft.duration_min} onChange={e => setEditDraft({ ...editDraft, duration_min: e.target.value })}>
                  <option value="">Select…</option>
                  {sessionTypes.map(st => (
                    <option key={st.id} value={st.duration}>{st.label} ({st.duration} min)</option>
                  ))}
                </select>
                <select style={{ ...plainNumberInput, cursor: "pointer" }} value={editDraft.package_size} onChange={e => setEditDraft({ ...editDraft, package_size: e.target.value })}>
                  <option value="">Select…</option>
                  {packageSizes.map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <input style={plainNumberInput} inputMode="decimal" value={editDraft.hourly_rate} onChange={e => setEditDraft({ ...editDraft, hourly_rate: e.target.value })} />
                <span style={{ flex: 1, fontSize: 14, color: C.muted }}>{formatPrice(computedPrice(editDraft))}</span>
                <input style={plainNumberInput} inputMode="numeric" value={editDraft.expires_months} onChange={e => setEditDraft({ ...editDraft, expires_months: e.target.value })} />
                <button style={S.btnSm} onClick={saveEditPricing}>Save</button>
                <button style={S.btnSmOut} onClick={() => { setEditingPricing(null); setEditDraft(null); }}>Cancel</button>
              </>
            ) : (
              <>
                <span style={{ flex: 1, fontSize: 14, color: C.text }}>{sessionTypeLabel(sessionTypes, p.duration_min)}</span>
                <span style={{ flex: 1, fontSize: 14, color: C.text }}>{p.package_size}</span>
                <span style={{ flex: 1, fontSize: 14, color: C.text }}>${hourlyRateOf(p).toFixed(2)}</span>
                <span style={{ flex: 1, fontSize: 14, color: C.text }}>${(p.price_cents / 100).toFixed(2)}</span>
                <span style={{ flex: 1, fontSize: 13, color: C.muted }}>{p.expires_months} mo</span>
                <button style={S.btnSmOut} onClick={() => startEditPricing(p)}>Edit</button>
                <button style={{ ...S.btnSmOut, color: "#c0392b", border: "0.5px solid #c0392b" }} onClick={() => removePricing(p.id)}>Remove</button>
              </>
            )}
          </div>
        ))}

        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem", alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Session Type</label>
            <select style={{ ...plainNumberInput, marginBottom: 0, cursor: "pointer" }} value={newPricing.duration_min} onChange={e => setNewPricing({ ...newPricing, duration_min: e.target.value })}>
              <option value="">Select…</option>
              {sessionTypes.map(st => (
                <option key={st.id} value={st.duration}>{st.label} ({st.duration} min)</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Package</label>
            <select style={{ ...plainNumberInput, marginBottom: 0, cursor: "pointer" }} value={newPricing.package_size} onChange={e => setNewPricing({ ...newPricing, package_size: e.target.value })}>
              <option value="">Select…</option>
              {packageSizes.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Hourly Rate ($)</label>
            <input style={{ ...plainNumberInput, marginBottom: 0 }} inputMode="decimal" placeholder="180.00" value={newPricing.hourly_rate} onChange={e => setNewPricing({ ...newPricing, hourly_rate: e.target.value })} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Package Price</label>
            <div style={{ padding: "10px 12px", fontSize: 14, color: C.muted }}>{formatPrice(computedPrice(newPricing))}</div>
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Expires (months)</label>
            <input style={{ ...plainNumberInput, marginBottom: 0 }} inputMode="numeric" placeholder="12" value={newPricing.expires_months} onChange={e => setNewPricing({ ...newPricing, expires_months: e.target.value })} />
          </div>
          <button style={S.btnSm} onClick={addPricing}>Add</button>
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

function sortPricing(a, b) {
  return a.duration_min - b.duration_min || a.package_size - b.package_size;
}

function parsePackageSizes(csv) {
  if (!csv) return [];
  return csv.split(",")
    .map(s => parseInt(s.trim(), 10))
    .filter(n => Number.isFinite(n) && n >= 1 && n <= 20)
    .sort((a, b) => a - b);
}

function sessionTypeLabel(sessionTypes, durationMin) {
  const match = sessionTypes.find(st => st.duration === durationMin);
  return match ? `${match.label} (${durationMin} min)` : `${durationMin} min`;
}

function hourlyRateOf(p) {
  const totalMin = (p.duration_min || 0) * (p.package_size || 0);
  if (!totalMin) return 0;
  return ((p.price_cents || 0) / 100) * 60 / totalMin;
}

function computedPrice(draft) {
  const d = parseInt(draft.duration_min);
  const s = parseInt(draft.package_size);
  const hr = parseFloat(draft.hourly_rate);
  if (!d || !s || !hr) return null;
  return (hr * d * s) / 60;
}

function formatPrice(v) {
  return v == null ? "" : `$${v.toFixed(2)}`;
}

function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "pm" : "am";
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${display}:${m} ${ampm}`;
}
