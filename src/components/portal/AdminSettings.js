"use client";
import { useState, useEffect } from "react";
import { C, S } from "@/lib/constants";
import { useIsMobile } from "@/lib/hooks";
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
  const mobile = useIsMobile();
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
  const [pricingDrafts, setPricingDrafts] = useState({}); // key `${dur}-${pkg}` → string hourly rate input
  const [pricingErrors, setPricingErrors] = useState({}); // key → error message
  const [defaultExpiresMonths, setDefaultExpiresMonths] = useState("12");
  const [defaultExpiresError, setDefaultExpiresError] = useState(null);

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

  // Client change notice
  const [minNoticeHours, setMinNoticeHours] = useState("24");

  // SMS
  const [smsEnabled, setSmsEnabled] = useState(false);

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
        "admin_reminder_channel", "admin_reminder_minutes", "package_sizes", "default_expires_months",
        "sms_enabled", "min_client_change_notice_hours"
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
    setSmsEnabled(settings.sms_enabled === "true");
    setMinNoticeHours(settings.min_client_change_notice_hours || "24");
    setPackageSizes(parsePackageSizes(settings.package_sizes));
    setDefaultExpiresMonths(settings.default_expires_months || "12");
    setSessionTypes(Array.isArray(typesRes) ? typesRes : []);
    setRules(rulesRes.data || []);
    const allPricing = Array.isArray(pricingRes) ? pricingRes : [];
    setPricingRows(allPricing);
    // Seed in-progress drafts with current hourly rates from existing rows
    const drafts = {};
    allPricing.forEach(p => {
      drafts[`${p.duration_min}-${p.package_size}`] = hourlyRateOf(p).toFixed(2);
    });
    setPricingDrafts(drafts);
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
    await saveSetting("sms_enabled", smsEnabled ? "true" : "false");
    await saveSetting("min_client_change_notice_hours", minNoticeHours);
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
  const matrixKey = (d, s) => `${d}-${s}`;
  const findRow = (d, s) => pricingRows.find(p => p.duration_min === d && p.package_size === s);

  const validateHourlyRate = (val) => {
    if (val == null || val.trim() === "") return { ok: true, empty: true };
    const trimmed = val.trim();
    // Require a well-formed non-negative decimal: 5, 5.5, 5., .5 — but reject 5.5.5 etc.
    if (!/^(\d+\.?\d*|\.\d+)$/.test(trimmed)) return { ok: false, error: "Must be a number ≥ 0" };
    const n = parseFloat(trimmed);
    if (!Number.isFinite(n) || n < 0) return { ok: false, error: "Must be a number ≥ 0" };
    return { ok: true, value: n };
  };

  const upsertCell = async (d, s, hourlyRate, isActive) => {
    const m = parseInt(defaultExpiresMonths);
    if (!m || m < 1) return;
    const price_cents = Math.round((hourlyRate * d * s / 60) * 100);
    const res = await fetch("/api/pricing-matrix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        duration_min: d,
        package_size: s,
        price_cents,
        expires_months: m,
        is_active: isActive,
      }),
    });
    if (!res.ok) {
      const { error: e } = await res.json().catch(() => ({}));
      setPricingErrors(prev => ({ ...prev, [matrixKey(d, s)]: e || "Save failed" }));
      return;
    }
    const data = await res.json();
    setPricingRows(prev => {
      const idx = prev.findIndex(p => p.id === data.id);
      const next = idx >= 0 ? prev.map((p, i) => i === idx ? data : p) : [...prev, data];
      return next.sort(sortPricing);
    });
  };

  const handleHourlyRateBlur = async (d, s, e) => {
    const key = matrixKey(d, s);
    const draft = pricingDrafts[key];
    const v = validateHourlyRate(draft);
    if (!v.ok) {
      setPricingErrors(prev => ({ ...prev, [key]: v.error }));
      const el = e?.target;
      if (el) setTimeout(() => { el.focus(); el.select?.(); }, 0);
      return;
    }
    setPricingErrors(prev => { const n = { ...prev }; delete n[key]; return n; });
    if (v.empty) return;
    const formatted = v.value.toFixed(2);
    setPricingDrafts(prev => ({ ...prev, [key]: formatted }));
    const existing = findRow(d, s);
    if (existing && hourlyRateOf(existing).toFixed(2) === formatted) return; // no change
    await upsertCell(d, s, v.value, existing ? existing.is_active : true);
  };

  const handleHideToggle = async (d, s) => {
    const existing = findRow(d, s);
    if (!existing) return; // can't hide a row that doesn't exist yet
    await upsertCell(d, s, hourlyRateOf(existing), !existing.is_active);
  };

  const handleDefaultExpiresBlur = async (e) => {
    const trimmed = (defaultExpiresMonths || "").trim();
    const valid = /^\d+$/.test(trimmed) && parseInt(trimmed) >= 1;
    if (!valid) {
      setDefaultExpiresError("Must be a whole number ≥ 1");
      const el = e?.target;
      if (el) setTimeout(() => { el.focus(); el.select?.(); }, 0);
      return;
    }
    const m = parseInt(trimmed);
    setDefaultExpiresError(null);
    await saveSetting("default_expires_months", String(m));
    if (pricingRows.length === 0) return;
    const res = await fetch("/api/pricing-matrix", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expires_months: m }),
    });
    if (res.ok) {
      setPricingRows(prev => prev.map(p => ({ ...p, expires_months: m })));
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

  // Size the Session Type column to fit the longest label (incl. "(NN min)" suffix).
  const longestLabel = sessionTypes.reduce((max, st) => {
    const text = `${st.label} (${st.duration} min)`;
    return text.length > max.length ? text : max;
  }, "Session Type");
  const sessionTypeColWidth = Math.max(120, Math.ceil(longestLabel.length * 7.5) + 16);

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

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "0.75rem" }}>
          <input
            id="sms-enabled"
            type="checkbox"
            checked={smsEnabled}
            onChange={e => setSmsEnabled(e.target.checked)}
            style={{ width: 16, height: 16, cursor: "pointer" }}
          />
          <label htmlFor="sms-enabled" style={{ ...S.label, marginBottom: 0, cursor: "pointer" }}>
            SMS notifications enabled
          </label>
        </div>

        <div style={{ display: "flex", gap: "1rem", marginBottom: "0.75rem" }}>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Minimum notice for client changes (hours)</label>
            <input style={S.input} type="number" min="0" max="168" value={minNoticeHours} onChange={e => setMinNoticeHours(e.target.value)} />
          </div>
          <div style={{ flex: 1 }} />
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
        {mobile && (
          <p style={{ fontSize: 12, color: C.muted, background: C.warm, borderRadius: 6, padding: "6px 10px", marginBottom: 12 }}>
            Best viewed in landscape mode.
          </p>
        )}
        <p style={{ ...S.p, fontSize: 13 }}>Set the hourly rate for each combination of session type and package size. Hide rows you do not want to offer.</p>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
          <label style={{ ...S.label, marginBottom: 0 }}>Expires after</label>
          <input
            style={{
              ...plainNumberInput,
              flex: "0 0 80px",
              width: 80,
              borderColor: defaultExpiresError ? "#c0392b" : "#d0d0d0",
            }}
            inputMode="numeric"
            value={defaultExpiresMonths}
            onChange={e => setDefaultExpiresMonths(e.target.value)}
            onBlur={e => handleDefaultExpiresBlur(e)}
          />
          <span style={{ fontSize: 13, color: C.muted }}>months (applies to all combinations)</span>
        </div>
        {defaultExpiresError && <p style={{ fontSize: 12, color: "#c0392b", marginTop: -8, marginBottom: 12 }}>{defaultExpiresError}</p>}

        {sessionTypes.length === 0 || packageSizes.length === 0 ? (
          <p style={{ fontSize: 13, color: C.muted, marginBottom: 0 }}>
            Configure at least one Session Type and one Package size above to populate the pricing table.
          </p>
        ) : (
          <div style={{ overflowX: "auto", marginLeft: -4, marginRight: -4, paddingLeft: 4, paddingRight: 4 }}>
            <div style={{ minWidth: 420 }}>
            <div style={{ display: "flex", gap: "0.75rem", padding: "6px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12, color: C.hint, fontWeight: 500 }}>
              <span style={{ flex: `0 0 ${sessionTypeColWidth}px` }}>Session Type</span>
              <span style={{ flex: 1, textAlign: "center" }}>Package</span>
              <span style={{ flex: "0 0 110px" }}>Hourly Rate ($)</span>
              <span style={{ flex: 1 }}>Package Price</span>
              <span style={{ width: 60, textAlign: "center" }}>Hide</span>
            </div>

            {sessionTypes.map(st =>
              packageSizes.map((sz, pi) => {
                const key = matrixKey(st.duration, sz);
                const row = findRow(st.duration, sz);
                const draft = pricingDrafts[key] ?? "";
                const err = pricingErrors[key];
                const hidden = !!row && !row.is_active;
                const hr = parseFloat(draft);
                const computedCents = Number.isFinite(hr) && hr >= 0
                  ? Math.round((hr * st.duration * sz / 60) * 100)
                  : null;
                const isFirstOfGroup = pi === 0;
                return (
                  <div
                    key={key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      padding: "7.2px 0",
                      borderBottom: `0.5px solid ${C.border}`,
                      background: hidden ? "#f5f5f5" : "transparent",
                      opacity: hidden ? 0.7 : 1,
                    }}
                  >
                    <span
                      style={{
                        flex: `0 0 ${sessionTypeColWidth}px`,
                        fontSize: 14,
                        paddingLeft: 4,
                        textAlign: isFirstOfGroup ? "left" : "center",
                        color: isFirstOfGroup ? (hidden ? C.muted : C.text) : C.hint,
                      }}
                    >
                      {isFirstOfGroup ? `${st.label} (${st.duration} min)` : "〃"}
                    </span>
                    <span style={{ flex: 1, fontSize: 14, color: hidden ? C.muted : C.text, textAlign: "center" }}>
                      {sz}
                    </span>
                    <div style={{ flex: "0 0 110px" }}>
                      <div style={{ position: "relative" }}>
                        <span style={{
                          position: "absolute",
                          left: 10,
                          top: "50%",
                          transform: "translateY(-50%)",
                          fontSize: 14,
                          color: hidden ? C.muted : C.text,
                          pointerEvents: "none",
                        }}>$</span>
                        <input
                          style={{
                            ...plainNumberInput,
                            boxSizing: "border-box",
                            paddingLeft: 22,
                            borderColor: err ? "#c0392b" : "#d0d0d0",
                            background: hidden ? "#fafafa" : "#fff",
                          }}
                          inputMode="decimal"
                          placeholder="0.00"
                          value={draft}
                          onChange={e => setPricingDrafts(prev => ({ ...prev, [key]: e.target.value }))}
                          onBlur={e => handleHourlyRateBlur(st.duration, sz, e)}
                        />
                      </div>
                      {err && <div style={{ fontSize: 11, color: "#c0392b", marginTop: 2 }}>{err}</div>}
                    </div>
                    <span style={{ flex: 1, fontSize: 14, color: hidden ? C.muted : C.text }}>
                      {computedCents != null ? `$${fmtUSD(computedCents / 100)}` : "—"}
                    </span>
                    <span style={{ width: 60, textAlign: "center" }}>
                      <input
                        type="checkbox"
                        tabIndex={-1}
                        checked={hidden}
                        disabled={!row}
                        onChange={() => handleHideToggle(st.duration, sz)}
                        title={!row ? "Set an hourly rate first" : (hidden ? "Show this combination" : "Hide this combination")}
                      />
                    </span>
                  </div>
                );
              })
            )}
            </div>
          </div>
        )}
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

      {/* Client experience preview */}
      <div style={S.card}>
        <h3 style={S.h3}>Client experience</h3>
        <p style={{ ...S.p, fontSize: 13 }}>Preview what new clients see when they click their invitation link.</p>
        <button style={S.btnSmOut} onClick={() => setPage("Preview Intake")}>Preview intake form</button>
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

function fmtUSD(n) {
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "pm" : "am";
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${display}:${m} ${ampm}`;
}
