"use client";
import { useState, useEffect, useMemo } from "react";
import { C, S } from "@/lib/constants";

function formatPhoneInput(value) {
  const digits = (value || "").replace(/\D/g, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export default function Clients({ setPage, onViewAsClient }) {
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
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [detailSuccess, setDetailSuccess] = useState(null);
  const [magicLoading, setMagicLoading] = useState(false);
  const [magicResult, setMagicResult] = useState(null); // { ok, text }

  const openDetail = (c) => {
    setDetail(c);
    setEditFirst(c.first_name || "");
    setEditLast(c.last_name || "");
    setEditPhone(formatPhoneInput(c.phone || ""));
    setEditContactEmail(c.preferred_email || c.email || "");
    setDetailError(null);
    setDetailSuccess(null);
    setMagicResult(null);
  };

  const closeDetail = () => {
    setDetail(null);
    setDetailError(null);
    setDetailSuccess(null);
    setMagicResult(null);
  };

  const saveDetail = async () => {
    if (!detail) return;
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
      ? { ...c, first_name: data.first_name, last_name: data.last_name, full_name: data.full_name, phone: data.phone, preferred_email: data.preferred_email }
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
    borderBottom: `0.5px solid ${C.border}`,
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
        )}
      </div>

      {detail && (
        <>
          <div onClick={closeDetail} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100 }} />
          <div style={{
            position: "fixed", top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            width: "min(560px, calc(100vw - 24px))",
            maxHeight: "85vh", overflowY: "auto",
            background: "#fff", border: `0.5px solid ${C.border}`,
            borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
            zIndex: 101, display: "flex", flexDirection: "column",
          }}>
            <div style={{ padding: "14px 18px", borderBottom: `0.5px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: C.text }}>
                  {`${detail.first_name || ""} ${detail.last_name || ""}`.trim() || "Client"}
                </div>
                <div style={{ fontSize: 12, color: C.hint, marginTop: 2 }}>
                  {detail.role} · joined {new Date(detail.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </div>
              </div>
              <button style={S.btnSmOut} onClick={closeDetail}>Close</button>
            </div>

            <div style={{ padding: "16px 18px", borderBottom: `0.5px solid ${C.border}` }}>
              <h3 style={{ ...S.h3, fontSize: 14, marginBottom: 10 }}>Profile</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={S.label}>First name</label>
                  <input style={{ ...S.input, marginBottom: 0 }} value={editFirst} onChange={e => setEditFirst(e.target.value)} />
                </div>
                <div>
                  <label style={S.label}>Last name</label>
                  <input style={{ ...S.input, marginBottom: 0 }} value={editLast} onChange={e => setEditLast(e.target.value)} />
                </div>
                <div>
                  <label style={S.label}>Phone</label>
                  <input style={{ ...S.input, marginBottom: 0 }} value={editPhone} onChange={e => setEditPhone(formatPhoneInput(e.target.value))} placeholder="(555) 555-5555" />
                </div>
                <div>
                  <label style={S.label}>Contact email</label>
                  <input style={{ ...S.input, marginBottom: 0 }} type="email" value={editContactEmail} onChange={e => setEditContactEmail(e.target.value)} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={S.label}>Login email (not editable)</label>
                  <input style={{ ...S.input, marginBottom: 0, background: "#fafafa", color: C.muted }} value={detail.email || ""} readOnly />
                </div>
              </div>
              {detailError && <p style={{ fontSize: 13, color: "#c0392b", marginTop: 10, marginBottom: 0 }}>{detailError}</p>}
              {detailSuccess && <p style={{ fontSize: 13, color: C.teal, marginTop: 10, marginBottom: 0 }}>{detailSuccess}</p>}
              <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button style={S.btnSmOut} onClick={closeDetail}>Cancel</button>
                <button style={S.btn} onClick={saveDetail} disabled={detailSaving}>
                  {detailSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>

            <div style={{ padding: "16px 18px", borderBottom: `0.5px solid ${C.border}` }}>
              <h3 style={{ ...S.h3, fontSize: 14, marginBottom: 10 }}>Portal actions</h3>
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
              <p style={{ fontSize: 12, color: C.hint, marginTop: 8, marginBottom: 0 }}>
                Sends a one-click sign-in email to {editContactEmail || detail.email}. Save profile changes first if you want the new contact email used.
              </p>
              {magicResult && (
                <p style={{ fontSize: 13, color: magicResult.ok ? C.teal : "#c0392b", marginTop: 8, marginBottom: 0 }}>
                  {magicResult.text}
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
