"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { C, S } from "@/lib/constants";
import { useIsMobile } from "@/lib/hooks";
import AdminPurchasePackage from "./AdminPurchasePackage";

function formatPhoneInput(value) {
  const digits = (value || "").replace(/\D/g, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export default function Clients({ setPage, onViewAsClient }) {
  const mobile = useIsMobile();
  // Invite form state
  const [email, setEmail] = useState("");
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState(null);
  const [inviteSuccess, setInviteSuccess] = useState(null);

  // Client list state
  const [clients, setClients] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState("created_at");
  const [sortAsc, setSortAsc] = useState(false);

  // Detail modal state
  const [detail, setDetail] = useState(null); // the selected client row
  const [editFirst, setEditFirst] = useState("");
  const [editLast, setEditLast] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editContactEmail, setEditContactEmail] = useState("");
  const [editTimezone, setEditTimezone] = useState("America/New_York");
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [detailSuccess, setDetailSuccess] = useState(null);
  const [magicLoading, setMagicLoading] = useState(false);
  const [magicResult, setMagicResult] = useState(null); // { ok, text }
  const [confirmClose, setConfirmClose] = useState(false);
  const [phoneBlurred, setPhoneBlurred] = useState(false);
  const [emailBlurred, setEmailBlurred] = useState(false);
  const phoneRef = useRef(null);
  const emailRef = useRef(null);
  const [adjustMinutes, setAdjustMinutes] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustSaving, setAdjustSaving] = useState(false);
  const [adjustResult, setAdjustResult] = useState(null); // { ok, balance_after } | { ok: false, error }
  const [chargeDollars, setChargeDollars] = useState("");
  const [chargeNote, setChargeNote] = useState("");
  const [chargeSaving, setChargeSaving] = useState(false);
  const [chargeResult, setChargeResult] = useState(null); // { ok, charged_dollars } | { ok, refunded_dollars } | { ok: false, error }
  const [purchaseDirty, setPurchaseDirty] = useState(false);

  const TIMEZONES = [
    { value: "America/New_York", label: "Eastern Time (New York)" },
    { value: "America/Chicago", label: "Central Time (Chicago)" },
    { value: "America/Denver", label: "Mountain Time (Denver)" },
    { value: "America/Phoenix", label: "Arizona (no DST)" },
    { value: "America/Los_Angeles", label: "Pacific Time (Los Angeles)" },
    { value: "America/Anchorage", label: "Alaska Time" },
    { value: "Pacific/Honolulu", label: "Hawaii Time" },
  ];

  const openDetail = (c) => {
    setDetail(c);
    setEditFirst(c.first_name || "");
    setEditLast(c.last_name || "");
    setEditPhone(formatPhoneInput(c.phone || ""));
    setEditContactEmail(c.preferred_email || c.email || "");
    setEditTimezone(c.timezone || "America/New_York");
    setDetailError(null);
    setDetailSuccess(null);
    setMagicResult(null);
    setPhoneBlurred(false);
    setEmailBlurred(false);
  };

  const closeDetail = () => {
    setDetail(null);
    setDetailError(null);
    setDetailSuccess(null);
    setMagicResult(null);
    setAdjustMinutes("");
    setAdjustNote("");
    setAdjustResult(null);
    setChargeDollars("");
    setChargeNote("");
    setChargeResult(null);
    setPurchaseDirty(false);
    setConfirmClose(false);
    setPhoneBlurred(false);
    setEmailBlurred(false);
  };

  const requestClose = () => {
    if (!detail) return closeDetail();
    const phoneDigits = editPhone.replace(/\D/g, "");
    const dirty =
      editFirst !== (detail.first_name || "") ||
      editLast !== (detail.last_name || "") ||
      phoneDigits !== (detail.phone || "") ||
      editContactEmail !== (detail.preferred_email || detail.email || "") ||
      editTimezone !== (detail.timezone || "America/New_York");
    if (dirty) { setConfirmClose(true); } else { closeDetail(); }
  };

  const handleAdjust = async (delta) => {
    if (!detail || isNaN(delta) || delta === 0) return;
    setAdjustSaving(true);
    setAdjustResult(null);
    const res = await fetch("/api/purchases", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: detail.id, delta_minutes: delta, note: adjustNote.trim() || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setAdjustSaving(false);
    if (res.ok) {
      setAdjustResult({ ok: true, balance_after: data.balance_after });
      setAdjustMinutes("");
      setAdjustNote("");
    } else {
      setAdjustResult({ ok: false, error: data.error || "Adjustment failed." });
    }
  };

  const handleCharge = async () => {
    const dollars = parseFloat(chargeDollars.replace(/,/g, ""));
    if (!detail || isNaN(dollars) || dollars <= 0) return;
    setChargeSaving(true);
    setChargeResult(null);
    const res = await fetch("/api/purchases", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "admin_charge", client_id: detail.id, amount_dollars: dollars, note: chargeNote.trim() || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setChargeSaving(false);
    if (res.ok) {
      setChargeResult({ ok: true, charged_dollars: data.charged_dollars });
      setChargeDollars("");
      setChargeNote("");
    } else {
      setChargeResult({ ok: false, error: data.error || "Charge failed." });
    }
  };

  const handleRefund = async () => {
    const dollars = parseFloat(chargeDollars.replace(/,/g, ""));
    if (!detail || isNaN(dollars) || dollars <= 0) return;
    setChargeSaving(true);
    setChargeResult(null);
    const res = await fetch("/api/purchases", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "admin_refund", client_id: detail.id, amount_dollars: dollars, note: chargeNote.trim() || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setChargeSaving(false);
    if (res.ok) {
      setChargeResult({ ok: true, refunded_dollars: data.refunded_dollars });
      setChargeDollars("");
      setChargeNote("");
    } else {
      setChargeResult({ ok: false, error: data.error || "Refund failed." });
    }
  };

  const saveDetail = async () => {
    if (!detail) return;
    const phoneDigitsNow = editPhone.replace(/\D/g, "");
    if (editPhone && phoneDigitsNow.length !== 10) {
      setPhoneBlurred(true);
      phoneRef.current?.focus();
      return;
    }
    if (editContactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editContactEmail)) {
      setEmailBlurred(true);
      emailRef.current?.focus();
      return;
    }
    setDetailSaving(true);
    setDetailError(null);
    setDetailSuccess(null);
    const phoneDigits = editPhone.replace(/\D/g, "");
    const body = {
      id: detail.id,
      first_name: editFirst,
      last_name: editLast,
      phone: phoneDigits,
      preferred_email: editContactEmail,
      timezone: editTimezone,
    };
    const res = await fetch("/api/clients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setDetailSaving(false);
    if (!res.ok) {
      setDetailError(data.error || "Could not save.");
      return;
    }
    setDetailSuccess("Saved.");
    // Update local list + the modal's own snapshot.
    setClients(prev => prev.map(c => c.id === detail.id
      ? { ...c, first_name: data.first_name, last_name: data.last_name, full_name: data.full_name, phone: data.phone, preferred_email: data.preferred_email, timezone: data.timezone }
      : c));
    setDetail(d => d ? { ...d, ...data } : d);
  };

  const sendMagicLink = async () => {
    if (!detail) return;
    setMagicLoading(true);
    setMagicResult(null);
    const res = await fetch("/api/clients/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: detail.id }),
    });
    const data = await res.json();
    setMagicLoading(false);
    if (!res.ok) {
      setMagicResult({ ok: false, text: data.error || "Could not send link." });
      return;
    }
    setMagicResult({ ok: true, text: `Sign-in link sent to ${data.deliveredTo}.` });
  };

  const fetchClients = async () => {
    setListLoading(true);
    const res = await fetch("/api/clients");
    const data = await res.json();
    if (res.ok) setClients(data.clients || []);
    setListLoading(false);
  };

  useEffect(() => { fetchClients(); }, []);

  const handleInvite = async () => {
    if (!email.trim()) {
      setInviteError("Please enter an email address.");
      return;
    }
    setInviteLoading(true);
    setInviteError(null);
    setInviteSuccess(null);

    const res = await fetch("/api/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, makeAdmin }),
    });

    const data = await res.json();
    setInviteLoading(false);

    if (!res.ok) {
      setInviteError(data.error || "Something went wrong.");
    } else {
      setInviteSuccess(`Invitation sent to ${email}`);
      setEmail("");
      setMakeAdmin(false);
      fetchClients();
    }
  };

  const handleSort = (field) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  };

  const sortArrow = (field) => {
    if (sortField !== field) return "";
    return sortAsc ? " \u25B2" : " \u25BC";
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = clients;
    if (q) {
      list = clients.filter(c =>
        (c.first_name || "").toLowerCase().includes(q) ||
        (c.last_name || "").toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q) ||
        (c.phone || "").toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      let va = a[sortField] || "";
      let vb = b[sortField] || "";
      if (sortField === "created_at") {
        va = new Date(va).getTime();
        vb = new Date(vb).getTime();
      } else {
        va = String(va).toLowerCase();
        vb = String(vb).toLowerCase();
      }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [clients, search, sortField, sortAsc]);

  const formatPhone = (value) => {
    if (!value) return "\u2014";
    const digits = value.replace(/\D/g, "");
    if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    return value;
  };

  const thStyle = {
    fontSize: 12, fontWeight: 500, color: C.muted, textAlign: "left",
    padding: "8px 12px", cursor: "pointer", whiteSpace: "nowrap",
    borderBottom: `1px solid ${C.border}`, userSelect: "none",
  };
  const tdStyle = {
    fontSize: 13, color: C.text, padding: "10px 12px",
    borderBottom: "1px solid rgba(0,0,0,0.2)",
  };

  return (
    <div style={S.page}>
      <button style={{ ...S.navLink, marginBottom:12, fontSize:13, color:C.teal }} onClick={() => setPage("Admin")}>&larr; Back to Admin</button>
      <h1 style={{...S.h1, fontSize:26}}>Clients</h1>

      {/* Invite section */}
      <div style={{ ...S.card, marginBottom: "1.5rem" }}>
        <h3 style={S.h3}>Invite a new client</h3>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={S.label}>Email address</label>
            <input
              style={{ ...S.input, marginBottom: 0 }}
              placeholder="client@example.com"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleInvite()}
            />
          </div>
          <button style={S.btn} onClick={handleInvite} disabled={inviteLoading}>
            {inviteLoading ? "Sending..." : "Send invite"}
          </button>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.muted, cursor: "pointer", marginTop: 10 }}>
          <input
            type="checkbox"
            checked={makeAdmin}
            onChange={e => setMakeAdmin(e.target.checked)}
            style={{ accentColor: C.teal }}
          />
          Grant admin access
        </label>
        {inviteError && <p style={{ fontSize: 13, color: "#c0392b", marginTop: 8, marginBottom: 0 }}>{inviteError}</p>}
        {inviteSuccess && <p style={{ fontSize: 13, color: C.teal, marginTop: 8, marginBottom: 0 }}>{inviteSuccess}</p>}
      </div>

      {/* Client list */}
      <div style={S.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <h3 style={{ ...S.h3, marginBottom: 0 }}>All clients ({filtered.length})</h3>
          <input
            style={{ ...S.input, marginBottom: 0, maxWidth: 260 }}
            placeholder="Search by name, email, or phone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {listLoading ? (
          <p style={{ ...S.p, textAlign: "center" }}>Loading clients...</p>
        ) : filtered.length === 0 ? (
          <p style={{ ...S.p, textAlign: "center", color: C.hint }}>
            {search ? "No clients match your search." : "No clients yet."}
          </p>
        ) : (
          <>
          {mobile && (
            <p style={{ fontSize: 12, color: C.muted, background: C.warm, borderRadius: 6, padding: "6px 10px", marginBottom: 8 }}>
              Best viewed in landscape mode.
            </p>
          )}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle} onClick={() => handleSort("first_name")}>Name{sortArrow("first_name")}</th>
                  <th style={thStyle} onClick={() => handleSort("email")}>Email{sortArrow("email")}</th>
                  <th style={thStyle} onClick={() => handleSort("phone")}>Phone{sortArrow("phone")}</th>
                  <th style={thStyle} onClick={() => handleSort("role")}>Role{sortArrow("role")}</th>
                  <th style={thStyle} onClick={() => handleSort("created_at")}>Joined{sortArrow("created_at")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id}
                      onClick={() => openDetail(c)}
                      style={{ cursor: "pointer" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#fafafa"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <td style={tdStyle}>
                      {c.first_name || c.last_name
                        ? `${c.first_name || ""} ${c.last_name || ""}`.trim()
                        : <span style={{ color: C.hint, fontStyle: "italic" }}>No name</span>}
                    </td>
                    <td style={tdStyle}>{c.email}</td>
                    <td style={tdStyle}>{formatPhone(c.phone)}</td>
                    <td style={tdStyle}>
                      <span style={{
                        fontSize: 11, padding: "2px 8px", borderRadius: 12,
                        background: c.role === "admin" ? C.purpleLight : C.tealLight,
                        color: c.role === "admin" ? C.purple : C.teal,
                        fontWeight: 500,
                      }}>
                        {c.role}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {detail && (
        <>
          <div onClick={requestClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100 }} />
          <div style={{
            position: "fixed", top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            width: "min(560px, calc(100vw - 24px))",
            maxHeight: "85vh",
            background: "#fff", border: `0.5px solid ${C.border}`,
            borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
            zIndex: 101, display: "flex", flexDirection: "column",
          }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(0,0,0,0.2)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, position: "relative" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: C.text }}>
                  {`${detail.first_name || ""} ${detail.last_name || ""}`.trim() || "Client"}
                </div>
                <div style={{ fontSize: 12, color: C.hint, marginTop: 2 }}>
                  {detail.role} · joined {new Date(detail.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </div>
              </div>
              <h3 style={{ ...S.h3, fontSize: 21, margin: 0, position: "absolute", left: "50%", transform: "translateX(-50%)" }}>Client Actions</h3>
              <button style={S.btnSmOut} onClick={requestClose}>Close</button>
            </div>
            {confirmClose && (
              <div style={{ padding: "12px 18px", background: "#fdf3f2", borderBottom: "1px solid rgba(192,57,43,0.25)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: 16, color: C.text }}>You have incomplete pending items. Cancel those and close, or resume edits?</span>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button style={{ ...S.btn, padding: "4px 12px", fontSize: 13, background: "#c0392b" }} onClick={closeDetail}>Cancel Pending</button>
                  <button style={{ ...S.btn, padding: "4px 12px", fontSize: 13, background: C.teal }} onClick={() => setConfirmClose(false)}>Resume Editing</button>
                </div>
              </div>
            )}
            <div style={{ overflowY: "auto", flex: 1 }}>

            <div style={{ padding: "16px 18px", borderBottom: "1px solid rgba(0,0,0,0.2)" }}>
              <h3 style={{ ...S.h3, fontSize: 21, marginBottom: 10 }}>Edit Profile{(() => { const d = detail; const dirty = editFirst !== (d.first_name || "") || editLast !== (d.last_name || "") || editPhone.replace(/\D/g,"") !== (d.phone || "") || editContactEmail !== (d.preferred_email || d.email || "") || editTimezone !== (d.timezone || "America/New_York"); return dirty ? <span style={{ ...S.h3, fontSize: 21, color: "#c0392b", marginLeft: 6 }}>(pending)</span> : null; })()}</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ ...S.label, fontSize: 16 }}>First name</label>
                  <input style={{ ...S.input, marginBottom: 0 }} value={editFirst} onChange={e => setEditFirst(e.target.value)} />
                </div>
                <div>
                  <label style={{ ...S.label, fontSize: 16 }}>Last name</label>
                  <input style={{ ...S.input, marginBottom: 0 }} value={editLast} onChange={e => setEditLast(e.target.value)} />
                </div>
                <div>
                  <label style={{ ...S.label, fontSize: 16 }}>Phone</label>
                  <input
                    ref={phoneRef}
                    style={{ ...S.input, marginBottom: 0, borderColor: phoneBlurred && editPhone && editPhone.replace(/\D/g, "").length !== 10 ? "#c0392b" : undefined }}
                    value={editPhone}
                    onChange={e => { setEditPhone(formatPhoneInput(e.target.value)); setPhoneBlurred(false); }}
                    onBlur={() => { setPhoneBlurred(true); if (editPhone && editPhone.replace(/\D/g, "").length !== 10) phoneRef.current?.focus(); }}
                    placeholder="(555) 555-5555"
                  />
                  {phoneBlurred && editPhone && editPhone.replace(/\D/g, "").length !== 10 && (
                    <p style={{ fontSize: 13, color: "#c0392b", margin: "4px 0 0" }}>Enter a 10-digit phone number</p>
                  )}
                </div>
                <div>
                  <label style={{ ...S.label, fontSize: 16 }}>Contact email</label>
                  <input
                    ref={emailRef}
                    style={{ ...S.input, marginBottom: 0, borderColor: emailBlurred && editContactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editContactEmail) ? "#c0392b" : undefined }}
                    type="email"
                    value={editContactEmail}
                    onChange={e => { setEditContactEmail(e.target.value); setEmailBlurred(false); }}
                    onBlur={() => { setEmailBlurred(true); if (editContactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editContactEmail)) emailRef.current?.focus(); }}
                  />
                  {emailBlurred && editContactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editContactEmail) && (
                    <p style={{ fontSize: 13, color: "#c0392b", margin: "4px 0 0" }}>Enter a valid email address</p>
                  )}
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ ...S.label, fontSize: 16 }}>Timezone</label>
                  <select style={{ ...S.input, marginBottom: 0, cursor: "pointer" }} value={editTimezone} onChange={e => setEditTimezone(e.target.value)}>
                    {TIMEZONES.find(t => t.value === editTimezone) ? null : (
                      <option value={editTimezone}>{editTimezone}</option>
                    )}
                    {TIMEZONES.map(tz => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ ...S.label, fontSize: 16 }}>Login email (not editable)</label>
                  <input style={{ ...S.input, marginBottom: 0, background: "#fafafa", color: C.muted }} value={detail.email || ""} readOnly />
                </div>
              </div>
              {detailError && <p style={{ fontSize: 16, color: "#c0392b", marginTop: 10, marginBottom: 0 }}>{detailError}</p>}
              {detailSuccess && <p style={{ fontSize: 16, color: C.teal, marginTop: 10, marginBottom: 0 }}>{detailSuccess}</p>}
              <div style={{ marginTop: 12 }}>
                <button style={S.btn} onClick={saveDetail} disabled={detailSaving || (editPhone && editPhone.replace(/\D/g, "").length !== 10) || (editContactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editContactEmail))}>
                  {detailSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>

            {detail.role !== "admin" && (
              <div style={{ padding: "16px 18px", borderBottom: "1px solid rgba(0,0,0,0.2)" }}>
                <h3 style={{ ...S.h3, fontSize: 21, marginBottom: 10 }}>Purchase Package on Behalf of Client{purchaseDirty ? <span style={{ ...S.h3, fontSize: 21, color: "#c0392b", marginLeft: 6 }}>(pending)</span> : null}</h3>
                <AdminPurchasePackage client={detail} onDirtyChange={setPurchaseDirty} />
              </div>
            )}

            {detail.role !== "admin" && (
              <div style={{ padding: "16px 18px", borderBottom: "1px solid rgba(0,0,0,0.2)" }}>
                <h3 style={{ ...S.h3, fontSize: 21, marginBottom: 10 }}>Adjust Purchased Time Balance{(adjustMinutes || adjustNote) ? <span style={{ ...S.h3, fontSize: 21, color: "#c0392b", marginLeft: 6 }}>(pending)</span> : null}</h3>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div>
                    <label style={{ ...S.label, marginBottom: 4, fontSize: 16 }}>Minutes</label>
                    <input
                      style={{ ...S.input, width: 120, marginBottom: 0, borderColor: adjustMinutes && parseInt(adjustMinutes, 10) <= 0 ? "#c0392b" : undefined }}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="e.g. 30"
                      value={adjustMinutes}
                      onChange={e => { setAdjustMinutes(e.target.value.replace(/\D/g, "")); setAdjustResult(null); }}
                    />
                    {adjustMinutes && parseInt(adjustMinutes, 10) <= 0 && (
                      <p style={{ fontSize: 13, color: "#c0392b", margin: "4px 0 0" }}>Must be greater than 0</p>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <label style={{ ...S.label, marginBottom: 4, fontSize: 16 }}>Note (optional)</label>
                    <input
                      style={{ ...S.input, marginBottom: 0 }}
                      type="text"
                      placeholder="Reason for adjustment"
                      value={adjustNote}
                      onChange={e => setAdjustNote(e.target.value)}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 8, alignSelf: "flex-end" }}>
                    <button style={S.btn} onClick={() => handleAdjust(Math.abs(parseInt(adjustMinutes, 10)))} disabled={adjustSaving || !adjustMinutes || parseInt(adjustMinutes, 10) <= 0 || isNaN(parseInt(adjustMinutes, 10))}>
                      {adjustSaving ? "Saving..." : "Add Minutes"}
                    </button>
                    <button style={{ ...S.btn, background: "#c0392b" }} onClick={() => handleAdjust(-Math.abs(parseInt(adjustMinutes, 10)))} disabled={adjustSaving || !adjustMinutes || parseInt(adjustMinutes, 10) <= 0 || isNaN(parseInt(adjustMinutes, 10))}>
                      {adjustSaving ? "Saving..." : "Subtract Minutes"}
                    </button>
                  </div>
                </div>
                {adjustResult && (
                  <p style={{ fontSize: 16, marginTop: 8, marginBottom: 0, color: adjustResult.ok ? C.teal : "#c0392b" }}>
                    {adjustResult.ok
                      ? `Done. New balance: ${adjustResult.balance_after} min.`
                      : adjustResult.error}
                  </p>
                )}
              </div>
            )}

            {detail.role !== "admin" && (
              <div style={{ padding: "16px 18px", borderBottom: "1px solid rgba(0,0,0,0.2)" }}>
                <h3 style={{ ...S.h3, fontSize: 21, marginBottom: 10 }}>Charge / Refund: Card on File{(chargeDollars || chargeNote) ? <span style={{ ...S.h3, fontSize: 21, color: "#c0392b", marginLeft: 6 }}>(pending)</span> : null}</h3>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 10 }}>
                  <div>
                    <label style={{ ...S.label, marginBottom: 4, fontSize: 16 }}>Amount</label>
                    <div style={{ display: "flex", alignItems: "center", border: `0.5px solid ${chargeDollars && (!/^\d*\.?\d*$/.test(chargeDollars) || parseFloat(chargeDollars.replace(/,/g, "")) <= 0) ? "#c0392b" : C.border}`, borderRadius: 8, width: 130, overflow: "hidden" }}>
                      <span style={{ padding: "10px 6px 10px 12px", fontSize: 16, color: C.muted, background: "#fafafa", borderRight: `0.5px solid ${C.border}`, flexShrink: 0 }}>$</span>
                      <input
                        style={{ ...S.input, width: "100%", marginBottom: 0, border: "none", borderRadius: 0, paddingLeft: 8, outline: "none" }}
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={chargeDollars}
                        onChange={e => {
                          let val = e.target.value.replace(/[^0-9.]/g, "");
                          const parts = val.split(".");
                          if (parts.length > 2) val = parts[0] + "." + parts.slice(1).join("");
                          setChargeDollars(val);
                          setChargeResult(null);
                        }}
                        onFocus={() => setChargeDollars(v => v.replace(/,/g, ""))}
                        onBlur={() => {
                          const n = parseFloat(chargeDollars.replace(/,/g, ""));
                          if (!isNaN(n) && n > 0) setChargeDollars(n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                        }}
                      />
                    </div>
                    {chargeDollars && parseFloat(chargeDollars.replace(/,/g, "")) <= 0 && /^\d*\.?\d*$/.test(chargeDollars) && (
                      <p style={{ fontSize: 13, color: "#c0392b", margin: "4px 0 0" }}>Must be greater than 0</p>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <label style={{ ...S.label, marginBottom: 4, fontSize: 16 }}>Note (optional)</label>
                    <input
                      style={{ ...S.input, marginBottom: 0 }}
                      type="text"
                      placeholder="e.g. Session 4/21"
                      value={chargeNote}
                      onChange={e => setChargeNote(e.target.value)}
                    />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={S.btn} onClick={handleCharge} disabled={chargeSaving || !chargeDollars || !(parseFloat(chargeDollars.replace(/,/g, "")) > 0)}>
                    {chargeSaving ? "Processing..." : "Charge"}
                  </button>
                  <button style={{ ...S.btn, background: "#c0392b" }} onClick={handleRefund} disabled={chargeSaving || !chargeDollars || !(parseFloat(chargeDollars.replace(/,/g, "")) > 0)}>
                    {chargeSaving ? "Processing..." : "Refund"}
                  </button>
                </div>
                {chargeResult && (
                  <p style={{ fontSize: 16, marginTop: 8, marginBottom: 0, color: chargeResult.ok ? C.teal : "#c0392b" }}>
                    {chargeResult.ok
                      ? chargeResult.refunded_dollars !== undefined
                        ? `Refunded $${chargeResult.refunded_dollars.toFixed(2)} successfully.`
                        : `Card charged $${chargeResult.charged_dollars.toFixed(2)} successfully.`
                      : chargeResult.error}
                  </p>
                )}
              </div>
            )}

            <div style={{ padding: "16px 18px", borderBottom: "1px solid rgba(0,0,0,0.2)" }}>
              <h3 style={{ ...S.h3, fontSize: 21, marginBottom: 10 }}>Portal Actions</h3>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button style={S.btn} onClick={sendMagicLink} disabled={magicLoading}>
                  {magicLoading ? "Sending..." : "Send sign-in link"}
                </button>
                {detail.role !== "admin" && (
                  <button
                    style={{ ...S.btnSmOut, border: `1px solid ${C.teal}`, color: C.teal }}
                    onClick={() => { const c = detail; closeDetail(); onViewAsClient(c); }}
                  >
                    View as client
                  </button>
                )}
              </div>
              <p style={{ fontSize: 15, color: C.hint, marginTop: 8, marginBottom: 0 }}>
                Sends a one-click sign-in email to {editContactEmail || detail.email}. Save profile changes first if you want the new contact email used.
              </p>
              {magicResult && (
                <p style={{ fontSize: 16, color: magicResult.ok ? C.teal : "#c0392b", marginTop: 8, marginBottom: 0 }}>
                  {magicResult.text}
                </p>
              )}
            </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
