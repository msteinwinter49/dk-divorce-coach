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

export default function Clients({ setPage, onViewAsClient, onOpenGroup, onViewStatement, onViewSessions }) {
  const mobile = useIsMobile();
  // Invite form state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [inviteHourlyRate, setInviteHourlyRate] = useState("");
  const [inviteGroupId, setInviteGroupId] = useState(""); // "" = create new group
  const [inviteGroupName, setInviteGroupName] = useState("");
  const [groups, setGroups] = useState([]);
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
  const [editAge, setEditAge] = useState("");
  const [editTimezone, setEditTimezone] = useState("America/New_York");
  const [profileOpen, setProfileOpen] = useState(false);
  const [bgOpen, setBgOpen] = useState(false);
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [detailSuccess, setDetailSuccess] = useState(null);
  const [magicLoading, setMagicLoading] = useState(false);
  const [magicResult, setMagicResult] = useState(null); // { ok, text }
  const [confirmClose, setConfirmClose] = useState(false);
  const [phoneBlurred, setPhoneBlurred] = useState(false);
  const [emailBlurred, setEmailBlurred] = useState(false);
  const [editBackupPhone, setEditBackupPhone] = useState("");
  const [editAddressLine1, setEditAddressLine1] = useState("");
  const [editAddressLine2, setEditAddressLine2] = useState("");
  const [editAddressZip, setEditAddressZip] = useState("");
  const [editAddressCity, setEditAddressCity] = useState("");
  const [editAddressState, setEditAddressState] = useState("");
  const [editZipLooking, setEditZipLooking] = useState(false);
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
  const [editHourlyRate, setEditHourlyRate] = useState("");
  const [hourlyRateSaving, setHourlyRateSaving] = useState(false);
  const [hourlyRateResult, setHourlyRateResult] = useState(null);
  const [editGroupId, setEditGroupId] = useState("");
  const [groupSaving, setGroupSaving] = useState(false);
  const [groupResult, setGroupResult] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveError, setArchiveError] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

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
    setEditBackupPhone(formatPhoneInput(c.backup_phone || ""));
    setEditAddressLine1(c.address_line1 || "");
    setEditAddressLine2(c.address_line2 || "");
    setEditAddressZip(c.address_zip || "");
    setEditAddressCity(c.address_city || "");
    setEditAddressState(c.address_state || "");
    setEditContactEmail(c.preferred_email || c.email || "");
    setEditAge(c.age != null ? String(c.age) : "");
    setEditTimezone(c.timezone || "America/New_York");
    setEditHourlyRate(c.group_hourly_rate != null ? String(c.group_hourly_rate) : "");
    setEditGroupId(c.group_id || "");
    setGroupResult(null);
    setDetailError(null);
    setDetailSuccess(null);
    setMagicResult(null);
    setPhoneBlurred(false);
    setEmailBlurred(false);
    setArchiveError(null);
    setDeleteConfirmOpen(false);
    setDeleteInput("");
    setDeleteError(null);
  };

  const handleEditZipBlur = async (zip) => {
    if (zip.length !== 5 || !/^\d{5}$/.test(zip)) return;
    setEditZipLooking(true);
    try {
      const res = await fetch(`https://api.zippopotam.us/us/${zip}`);
      if (res.ok) {
        const data = await res.json();
        const place = data.places?.[0];
        if (place) {
          setEditAddressCity(place["place name"] || "");
          setEditAddressState(place["state abbreviation"] || "");
        }
      }
    } catch { /* leave city/state as-is */ }
    setEditZipLooking(false);
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
    setEditBackupPhone("");
    setEditAddressLine1("");
    setEditAddressLine2("");
    setEditAddressZip("");
    setEditAddressCity("");
    setEditAddressState("");
    setEditAge("");
    setEditHourlyRate("");
    setHourlyRateResult(null);
    setEditGroupId("");
    setProfileOpen(false);
    setBgOpen(false);
    setGroupResult(null);
    setArchiveError(null);
    setDeleteConfirmOpen(false);
    setDeleteInput("");
    setDeleteError(null);
  };

  const requestClose = () => {
    if (!detail) return closeDetail();
    const phoneDigits = editPhone.replace(/\D/g, "");
    const dirty =
      editFirst !== (detail.first_name || "") ||
      editLast !== (detail.last_name || "") ||
      phoneDigits !== (detail.phone || "").replace(/\D/g, "") ||
      editBackupPhone.replace(/\D/g, "") !== (detail.backup_phone || "").replace(/\D/g, "") ||
      editAddressLine1 !== (detail.address_line1 || "") ||
      editAddressLine2 !== (detail.address_line2 || "") ||
      editAddressZip !== (detail.address_zip || "") ||
      editAddressCity !== (detail.address_city || "") ||
      editAddressState !== (detail.address_state || "") ||
      editContactEmail !== (detail.preferred_email || detail.email || "") ||
      editAge !== (detail.age != null ? String(detail.age) : "") ||
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

  const saveHourlyRate = async () => {
    const rate = parseFloat(editHourlyRate);
    if (!detail || !detail.group_id || isNaN(rate) || rate <= 0) return;
    setHourlyRateSaving(true);
    setHourlyRateResult(null);
    const res = await fetch("/api/groups", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: detail.group_id, hourly_rate: rate }),
    });
    const data = await res.json().catch(() => ({}));
    setHourlyRateSaving(false);
    if (!res.ok) {
      setHourlyRateResult({ ok: false, error: data.error || "Could not save." });
      return;
    }
    setHourlyRateResult({ ok: true });
    // Update all clients in this group and the cached groups list
    setClients(prev => prev.map(c => c.group_id === detail.group_id ? { ...c, group_hourly_rate: rate } : c));
    setGroups(prev => prev.map(g => g.id === detail.group_id ? { ...g, hourly_rate: rate } : g));
    setDetail(d => d ? { ...d, group_hourly_rate: rate } : d);
  };

  const saveGroup = async () => {
    if (!detail || !editGroupId) return;
    setGroupSaving(true);
    setGroupResult(null);
    const res = await fetch("/api/groups/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: detail.id, group_id: editGroupId }),
    });
    const data = await res.json().catch(() => ({}));
    setGroupSaving(false);
    if (!res.ok) {
      setGroupResult({ ok: false, error: data.error || "Could not save." });
      return;
    }
    const g = groups.find(gr => gr.id === editGroupId);
    const updates = { group_id: editGroupId, group_name: g?.name || "", group_hourly_rate: g?.hourly_rate ?? null };
    setGroupResult({ ok: true });
    setClients(prev => prev.map(c => c.id === detail.id ? { ...c, ...updates } : c));
    setDetail(d => d ? { ...d, ...updates } : d);
  };

  const handleArchiveToggle = async () => {
    if (!detail) return;
    setArchiveLoading(true);
    setArchiveError(null);
    const res = await fetch("/api/clients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: detail.id, is_archived: !detail.is_archived }),
    });
    const data = await res.json().catch(() => ({}));
    setArchiveLoading(false);
    if (!res.ok) { setArchiveError(data.error || "Could not update."); return; }
    const newArchived = !detail.is_archived;
    setDetail(d => d ? { ...d, is_archived: newArchived } : d);
    setClients(prev => prev.map(c => c.id === detail.id ? { ...c, is_archived: newArchived } : c));
  };

const handleClientDelete = async () => {
    if (!detail) return;
    setDeleteLoading(true);
    setDeleteError(null);
    const res = await fetch("/api/clients", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: detail.id }),
    });
    const data = await res.json().catch(() => ({}));
    setDeleteLoading(false);
    if (!res.ok) { setDeleteError(data.error || "Delete failed."); return; }
    setClients(prev => prev.filter(c => c.id !== detail.id));
    closeDetail();
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
      backup_phone: editBackupPhone.replace(/\D/g, "") || null,
      address_line1: editAddressLine1 || null,
      address_line2: editAddressLine2 || null,
      address_zip: editAddressZip || null,
      address_city: editAddressCity || null,
      address_state: editAddressState || null,
      preferred_email: editContactEmail,
      age: editAge !== "" ? parseInt(editAge) || null : null,
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
    setClients(prev => prev.map(c => c.id === detail.id ? { ...c, ...data } : c));
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

  const fetchGroups = async () => {
    const res = await fetch("/api/groups");
    const data = await res.json();
    if (res.ok) setGroups(data.groups || []);
  };

  useEffect(() => { fetchClients(); fetchGroups(); }, []);

  const handleInvite = async () => {
    if (!email.trim()) {
      setInviteError("Please enter an email address.");
      return;
    }
    const isNewGroup = inviteGroupId === "__new__";
    if (!makeAdmin) {
      if (!inviteGroupId) {
        setInviteError("Please select or create a group.");
        return;
      }
      if (isNewGroup) {
        if (!inviteGroupName.trim()) {
          setInviteError("Please enter a group name.");
          return;
        }
        const parsedRate = parseFloat(inviteHourlyRate);
        if (!inviteHourlyRate || isNaN(parsedRate) || parsedRate <= 0) {
          setInviteError("Please enter a valid hourly rate for the new group.");
          return;
        }
      }
    }
    setInviteLoading(true);
    setInviteError(null);
    setInviteSuccess(null);

    const payload = { email, makeAdmin };
    if (!makeAdmin) {
      if (isNewGroup) {
        payload.group_name = inviteGroupName.trim();
        payload.hourly_rate = parseFloat(inviteHourlyRate);
      } else {
        payload.group_id = inviteGroupId;
      }
    }

    const res = await fetch("/api/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    setInviteLoading(false);

    if (!res.ok) {
      setInviteError(data.error || "Something went wrong.");
    } else {
      setInviteSuccess(`Invitation sent to ${email}`);
      setEmail("");
      setInviteHourlyRate("");
      setInviteGroupId("");
      setInviteGroupName("");
      setMakeAdmin(false);
      fetchClients();
      fetchGroups();
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
    if (!showArchived) list = list.filter(c => !c.is_archived);
    if (q) {
      list = clients.filter(c =>
        (c.first_name || "").toLowerCase().includes(q) ||
        (c.last_name || "").toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q) ||
        (c.phone || "").toLowerCase().includes(q) ||
        (c.group_name || "").toLowerCase().includes(q)
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
  }, [clients, search, sortField, sortAsc, showArchived]);

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
        <div
          onClick={() => setInviteOpen(o => !o)}
          style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none" }}
        >
          <h3 style={{ ...S.h3, margin: 0 }}>Invite a new client</h3>
          <span style={{ fontSize: 18, color: C.muted, transition: "transform 0.2s", display: "inline-block", transform: inviteOpen ? "rotate(180deg)" : "rotate(0deg)", lineHeight: 1 }}>▾</span>
        </div>
        {inviteOpen && <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.muted, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={makeAdmin}
              onChange={e => { setMakeAdmin(e.target.checked); setInviteGroupId(""); setInviteGroupName(""); setInviteHourlyRate(""); }}
              style={{ accentColor: C.teal }}
            />
            Grant admin access
          </label>
          {!makeAdmin && <>
            <div>
              <label style={S.label}>Assign client to a group</label>
              <select
                style={{ ...S.input, marginBottom: 0, cursor: "pointer" }}
                value={inviteGroupId}
                onChange={e => setInviteGroupId(e.target.value)}
              >
                <option value="" disabled>Select…</option>
                <option value="__new__">Create a new group</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.name}{g.hourly_rate ? ` ($${g.hourly_rate}/hr)` : ""}
                  </option>
                ))}
              </select>
            </div>
            {inviteGroupId === "__new__" && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label style={S.label}>New group name</label>
                  <input
                    style={{ ...S.input, marginBottom: 0 }}
                    placeholder="e.g. Smith Family"
                    value={inviteGroupName}
                    onChange={e => setInviteGroupName(e.target.value)}
                  />
                </div>
                <div>
                  <label style={S.label}>Hourly rate</label>
                  <div style={{ display: "flex", alignItems: "center", border: `0.5px solid ${C.border}`, borderRadius: 8, width: 140, overflow: "hidden" }}>
                    <span style={{ padding: "10px 6px 10px 12px", fontSize: 16, color: C.muted, background: "#fafafa", borderRight: `0.5px solid ${C.border}`, flexShrink: 0 }}>$</span>
                    <input
                      style={{ ...S.input, width: "100%", marginBottom: 0, border: "none", borderRadius: 0, paddingLeft: 8, outline: "none" }}
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={inviteHourlyRate}
                      onChange={e => {
                        let val = e.target.value.replace(/[^0-9.]/g, "");
                        const parts = val.split(".");
                        if (parts.length > 2) val = parts[0] + "." + parts.slice(1).join("");
                        setInviteHourlyRate(val);
                      }}
                    />
                    <span style={{ padding: "10px 12px 10px 6px", fontSize: 16, color: C.muted, background: "#fafafa", borderLeft: `0.5px solid ${C.border}`, flexShrink: 0 }}>/hr</span>
                  </div>
                </div>
              </div>
            )}
          </>}
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
          {inviteError && <p style={{ fontSize: 13, color: "#c0392b", marginTop: 8, marginBottom: 0 }}>{inviteError}</p>}
          {inviteSuccess && <p style={{ fontSize: 13, color: C.teal, marginTop: 8, marginBottom: 0 }}>{inviteSuccess}</p>}
        </div>}
      </div>

      {/* Client list */}
      <div style={S.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <h3 style={{ ...S.h3, marginBottom: 0 }}>All clients ({filtered.length})</h3>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: C.muted, cursor: "pointer" }}>
              <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} style={{ accentColor: C.teal }} />
              Show archived
            </label>
            <input
              style={{ ...S.input, marginBottom: 0, maxWidth: 260 }}
              placeholder="Search by name, email, phone, or group..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
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
                  <th style={thStyle} onClick={() => handleSort("group_name")}>Group{sortArrow("group_name")}</th>
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
                    <td style={{ ...tdStyle, opacity: c.is_archived ? 0.55 : 1 }}>
                      {c.first_name || c.last_name
                        ? `${c.first_name || ""} ${c.last_name || ""}`.trim()
                        : <span style={{ color: C.hint, fontStyle: "italic" }}>No name</span>}
                      {c.is_archived && <span style={{ fontSize: 11, marginLeft: 6, padding: "1px 6px", borderRadius: 10, background: "#f0f0f0", color: "#888" }}>archived</span>}
                    </td>
                    <td style={tdStyle}>{c.email}</td>
                    <td style={tdStyle}>{formatPhone(c.phone)}</td>
                    <td style={tdStyle}>
                      {c.group_name && c.group_id ? (
                        <button
                          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: C.teal, fontSize: 13, fontFamily: "inherit", textDecoration: "underline", textUnderlineOffset: 2 }}
                          onClick={e => { e.stopPropagation(); onOpenGroup?.(c.group_id); }}
                        >
                          {c.group_name}
                        </button>
                      ) : (
                        <span style={{ color: C.hint, fontStyle: "italic" }}>—</span>
                      )}
                    </td>
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
                {detail.group_name && (
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                    Group:{" "}
                    <button
                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: C.teal, fontSize: 12, fontFamily: "inherit", textDecoration: "underline", textUnderlineOffset: 2 }}
                      onClick={() => onOpenGroup?.(detail.group_id)}
                    >
                      {detail.group_name}
                    </button>
                  </div>
                )}
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
              <button
                onClick={() => setProfileOpen(o => !o)}
                style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: 0, width: "100%" }}
              >
                <h3 style={{ ...S.h3, fontSize: 21, margin: 0, lineHeight: 1 }}>Edit Profile{(() => { const d = detail; const dirty = editFirst !== (d.first_name || "") || editLast !== (d.last_name || "") || editPhone.replace(/\D/g,"") !== (d.phone || "").replace(/\D/g,"") || editBackupPhone.replace(/\D/g,"") !== (d.backup_phone || "").replace(/\D/g,"") || editAddressLine1 !== (d.address_line1 || "") || editAddressLine2 !== (d.address_line2 || "") || editAddressZip !== (d.address_zip || "") || editAddressCity !== (d.address_city || "") || editAddressState !== (d.address_state || "") || editContactEmail !== (d.preferred_email || d.email || "") || editAge !== (d.age != null ? String(d.age) : "") || editTimezone !== (d.timezone || "America/New_York"); return dirty ? <span style={{ ...S.h3, fontSize: 21, color: "#c0392b", marginLeft: 6 }}>(pending)</span> : null; })()}</h3>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, transform: profileOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
                  <path d="M6 9l6 6 6-6" stroke={C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {profileOpen && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
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
                  <label style={{ ...S.label, fontSize: 16 }}>Backup phone</label>
                  <input
                    style={{ ...S.input, marginBottom: 0 }}
                    value={editBackupPhone}
                    onChange={e => setEditBackupPhone(formatPhoneInput(e.target.value))}
                    placeholder="(555) 555-5555"
                  />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ ...S.label, fontSize: 16 }}>Mailing address</label>
                  <input style={{ ...S.input, marginBottom: 8 }} placeholder="Address line 1" value={editAddressLine1} onChange={e => setEditAddressLine1(e.target.value)} />
                  <input style={{ ...S.input, marginBottom: 8 }} placeholder="Address line 2" value={editAddressLine2} onChange={e => setEditAddressLine2(e.target.value)} />
                  <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 72px", gap: 8 }}>
                    <div>
                      <input
                        style={{ ...S.input, marginBottom: 0 }}
                        placeholder="ZIP" value={editAddressZip} maxLength={5}
                        onChange={e => { const v = e.target.value.replace(/\D/g, "").slice(0, 5); setEditAddressZip(v); }}
                        onBlur={e => handleEditZipBlur(e.target.value)}
                      />
                      {editZipLooking && <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Looking up…</p>}
                    </div>
                    <input style={{ ...S.input, marginBottom: 0 }} placeholder="City" value={editAddressCity} onChange={e => setEditAddressCity(e.target.value)} />
                    <input style={{ ...S.input, marginBottom: 0 }} placeholder="ST" maxLength={2} value={editAddressState} onChange={e => setEditAddressState(e.target.value.toUpperCase().slice(0, 2))} />
                  </div>
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
                <div>
                  <label style={{ ...S.label, fontSize: 16 }}>Age</label>
                  <input
                    style={{ ...S.input, marginBottom: 0 }}
                    type="number"
                    min="0"
                    max="120"
                    placeholder="—"
                    value={editAge}
                    onChange={e => setEditAge(e.target.value)}
                  />
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
              </div>}
              {profileOpen && detailError && <p style={{ fontSize: 16, color: "#c0392b", marginTop: 10, marginBottom: 0 }}>{detailError}</p>}
              {profileOpen && detailSuccess && <p style={{ fontSize: 16, color: C.teal, marginTop: 10, marginBottom: 0 }}>{detailSuccess}</p>}
              {profileOpen && <div style={{ marginTop: 12 }}>
                <button style={S.btn} onClick={saveDetail} disabled={detailSaving || (editPhone && editPhone.replace(/\D/g, "").length !== 10) || (editContactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editContactEmail))}>
                  {detailSaving ? "Saving..." : "Save"}
                </button>
              </div>}
            </div>

            <div style={{ padding: "16px 18px", borderBottom: "1px solid rgba(0,0,0,0.2)" }}>
              <button
                onClick={() => setBgOpen(o => !o)}
                style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: 0, width: "100%" }}
              >
                <h3 style={{ ...S.h3, fontSize: 21, margin: 0, lineHeight: 1 }}>Background</h3>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, transform: bgOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
                  <path d="M6 9l6 6 6-6" stroke={C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {bgOpen && (() => {
                const BG_FIELDS = [
                  ["What is your current occupation?", detail.bg_occupation],
                  ["What is your highest level of education?", detail.bg_education],
                  ["If you are in a relationship, please describe its nature.", detail.bg_relationship],
                  ["Are you currently seeing an individual therapist?", detail.bg_therapist],
                  ["Describe your current living situation: alone or with what others?", detail.bg_living],
                  ["What brings you to coaching now?", detail.bg_brings],
                  ["What are your goals for coaching?", detail.bg_goals],
                  ["What else would you like me to know?", detail.bg_other],
                ];
                return (
                  <div style={{ marginTop: 12 }}>
                    {BG_FIELDS.map(([q, a]) => (
                      <div key={q} style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.muted, marginBottom: 2 }}>{q}</div>
                        <div style={{ fontSize: 15, color: a ? C.text : C.hint }}>{a || "—"}</div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            <div style={{ padding: "16px 18px", borderBottom: "1px solid rgba(0,0,0,0.2)" }}>
              <h3 style={{ ...S.h3, fontSize: 21, marginBottom: 10 }}>Group Assignment</h3>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <label style={{ ...S.label, fontSize: 16 }}>Group</label>
                  <select
                    style={{ ...S.input, marginBottom: 0, cursor: "pointer" }}
                    value={editGroupId}
                    onChange={e => { setEditGroupId(e.target.value); setGroupResult(null); }}
                  >
                    <option value="">No group</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>
                        {g.name}{g.hourly_rate ? ` ($${g.hourly_rate}/hr)` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  style={{ ...S.btn, alignSelf: "flex-end" }}
                  onClick={saveGroup}
                  disabled={groupSaving || !editGroupId || editGroupId === (detail.group_id || "")}
                >
                  {groupSaving ? "Saving..." : "Save"}
                </button>
              </div>
              {groupResult && (
                <p style={{ fontSize: 16, marginTop: 8, marginBottom: 0, color: groupResult.ok ? C.teal : "#c0392b" }}>
                  {groupResult.ok ? "Group assignment saved." : groupResult.error}
                </p>
              )}
            </div>

            {detail.role !== "admin" && (
              <div style={{ padding: "16px 18px", borderBottom: "1px solid rgba(0,0,0,0.2)" }}>
                <h3 style={{ ...S.h3, fontSize: 21, marginBottom: 10 }}>Purchase Package{purchaseDirty ? <span style={{ ...S.h3, fontSize: 21, color: "#c0392b", marginLeft: 6 }}>(pending)</span> : null}</h3>
                <AdminPurchasePackage client={detail} onDirtyChange={setPurchaseDirty} />
              </div>
            )}

            {detail.role !== "admin" && (
              <div style={{ padding: "16px 18px", borderBottom: "1px solid rgba(0,0,0,0.2)" }}>
                <h3 style={{ ...S.h3, fontSize: 21, marginBottom: 10 }}>Adjust Group Available Time{(adjustMinutes || adjustNote) ? <span style={{ ...S.h3, fontSize: 21, color: "#c0392b", marginLeft: 6 }}>(pending)</span> : null}</h3>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div>
                    <label style={{ ...S.label, marginBottom: 4, fontSize: 16 }}>N/C Minutes</label>
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

            {detail.group_id && (
              <div style={{ padding: "16px 18px", borderBottom: "1px solid rgba(0,0,0,0.2)" }}>
                <h3 style={{ ...S.h3, fontSize: 21, marginBottom: 10 }}>Reports</h3>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {detail.role !== "admin" && (
                    <button style={S.btn} onClick={() => { closeDetail(); onViewStatement?.(detail); }}>View statement →</button>
                  )}
                  <button style={{ ...S.btn, background: C.teal }} onClick={() => { closeDetail(); onViewSessions?.(detail); }}>View session activity →</button>
                </div>
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

            <div style={{ padding: "16px 18px" }}>
              <h3 style={{ ...S.h3, fontSize: 21, marginBottom: 10 }}>Account Status</h3>
              {!deleteConfirmOpen && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    style={{ ...S.btnSmOut, border: `1px solid ${detail.is_archived ? C.teal : "#888"}`, color: detail.is_archived ? C.teal : "#888" }}
                    onClick={handleArchiveToggle}
                    disabled={archiveLoading}
                  >
                    {archiveLoading ? "..." : detail.is_archived ? "Unarchive" : "Archive"}
                  </button>
                  <button
                    style={{ ...S.btnSmOut, border: "1px solid #c0392b", color: "#c0392b" }}
                    onClick={() => setDeleteConfirmOpen(true)}
                  >
                    Delete permanently
                  </button>
                </div>
              )}
              {archiveError && <p style={{ fontSize: 14, color: "#c0392b", marginTop: 6, marginBottom: 0 }}>{archiveError}</p>}
              {deleteConfirmOpen && (
                <div style={{ background: "#fdf3f2", border: "1px solid rgba(192,57,43,0.3)", borderRadius: 8, padding: 14 }}>
                  {detail.stripe_customer_id && (
                    <p style={{ fontSize: 14, color: "#c0392b", marginBottom: 8, marginTop: 0 }}>
                      This client has a saved payment method. It will be permanently removed from Stripe.
                    </p>
                  )}
                  <p style={{ fontSize: 14, color: C.text, marginBottom: 8, marginTop: 0 }}>
                    This permanently deletes all data. Type <strong>{[detail.first_name, detail.last_name].filter(Boolean).join(" ") || detail.email}</strong> to confirm.
                  </p>
                  <input
                    style={{ ...S.input, marginBottom: 8 }}
                    placeholder="Type name to confirm"
                    value={deleteInput}
                    onChange={e => setDeleteInput(e.target.value)}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      style={{ ...S.btn, background: "#c0392b", opacity: deleteInput === ([detail.first_name, detail.last_name].filter(Boolean).join(" ") || detail.email) ? 1 : 0.5 }}
                      disabled={deleteInput !== ([detail.first_name, detail.last_name].filter(Boolean).join(" ") || detail.email) || deleteLoading}
                      onClick={handleClientDelete}
                    >
                      {deleteLoading ? "Deleting..." : "Delete permanently"}
                    </button>
                    <button style={S.btnSmOut} onClick={() => { setDeleteConfirmOpen(false); setDeleteInput(""); setDeleteError(null); }}>
                      Cancel
                    </button>
                  </div>
                  {deleteError && <p style={{ fontSize: 14, color: "#c0392b", marginTop: 8, marginBottom: 0 }}>{deleteError}</p>}
                </div>
              )}
            </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
