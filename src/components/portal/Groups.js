"use client";
import { useState, useEffect } from "react";
import { C, S } from "@/lib/constants";
import { useIsMobile } from "@/lib/hooks";
import AdminPurchasePackage from "./AdminPurchasePackage";

function fmtBalance(minutes) {
  if (minutes == null) return "—";
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${sign}${m} min`;
  if (m === 0) return `${sign}${h}h`;
  return `${sign}${h}h ${m}m`;
}

function fmtRate(rate) {
  if (!rate) return "—";
  return `$${Number(rate).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/hr`;
}

export default function Groups({ setPage, initialGroupId, onGroupOpened }) {
  const mobile = useIsMobile();

  const [groups, setGroups] = useState([]);
  const [listLoading, setListLoading] = useState(true);

  // null = closed | { id: null } = create mode | group object = detail mode
  const [modal, setModal] = useState(null);
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // Group info editing
  const [editName, setEditName] = useState("");
  const [editRate, setEditRate] = useState("");
  const [infoSaving, setInfoSaving] = useState(false);
  const [infoResult, setInfoResult] = useState(null);

  // Balance display + adjust
  const [displayBalance, setDisplayBalance] = useState(0);
  const [adjustMinutes, setAdjustMinutes] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustSaving, setAdjustSaving] = useState(false);
  const [adjustResult, setAdjustResult] = useState(null);

  // Purchase
  const [purchaseClientId, setPurchaseClientId] = useState("");
  const [purchaseDirty, setPurchaseDirty] = useState(false);

  // Member actions
  const [removeConfirm, setRemoveConfirm] = useState(null);

  // Archive / delete
  const [showArchived, setShowArchived] = useState(false);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveResult, setArchiveResult] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const fetchGroups = async () => {
    setListLoading(true);
    const res = await fetch("/api/groups");
    const data = await res.json();
    if (res.ok) setGroups(data.groups || []);
    setListLoading(false);
  };

  useEffect(() => { fetchGroups(); }, []);

  // Auto-open a specific group when navigated from the Clients page
  useEffect(() => {
    if (initialGroupId && groups.length > 0) {
      const g = groups.find(gr => gr.id === initialGroupId);
      if (g) {
        openGroup(g);
        onGroupOpened?.();
      }
    }
  }, [initialGroupId, groups]);

  const openGroup = async (group) => {
    setModal(group);
    setEditName(group.name);
    setEditRate(group.hourly_rate != null ? String(group.hourly_rate) : "");
    setDisplayBalance(group.balance_minutes ?? 0);
    setAdjustMinutes("");
    setAdjustNote("");
    setAdjustResult(null);
    setInfoResult(null);
    setPurchaseClientId("");
    setPurchaseDirty(false);
    setRemoveConfirm(null);
    setArchiveResult(null);
    setDeleteConfirmOpen(false);
    setDeleteInput("");
    setDeleteError(null);

    setMembersLoading(true);
    setMembers([]);
    const res = await fetch(`/api/groups/members?group_id=${group.id}`);
    const data = await res.json();
    setMembersLoading(false);
    if (res.ok) {
      const list = data.members || [];
      setMembers(list);
      const firstActive = list.find(m => m.is_active);
      if (firstActive) setPurchaseClientId(firstActive.client_id);
    }
  };

  const openCreate = () => {
    setModal({ id: null });
    setEditName("");
    setEditRate("");
    setInfoResult(null);
    setMembers([]);
  };

  const closeModal = () => {
    setModal(null);
    setMembers([]);
    setRemoveConfirm(null);
    setArchiveResult(null);
    setDeleteConfirmOpen(false);
    setDeleteInput("");
    setDeleteError(null);
  };

  const saveInfo = async () => {
    const name = editName.trim();
    const rate = parseFloat(editRate);
    if (!name) { setInfoResult({ ok: false, error: "Name is required." }); return; }
    if (!editRate || isNaN(rate) || rate <= 0) { setInfoResult({ ok: false, error: "A valid hourly rate is required." }); return; }
    setInfoSaving(true);
    setInfoResult(null);

    if (!modal.id) {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, hourly_rate: rate }),
      });
      const data = await res.json();
      setInfoSaving(false);
      if (!res.ok) { setInfoResult({ ok: false, error: data.error || "Could not create." }); return; }
      await fetchGroups();
      openGroup({ ...data, balance_minutes: 0, member_count: 0 });
    } else {
      const res = await fetch("/api/groups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: modal.id, name, hourly_rate: rate }),
      });
      const data = await res.json();
      setInfoSaving(false);
      if (!res.ok) { setInfoResult({ ok: false, error: data.error || "Could not save." }); return; }
      setInfoResult({ ok: true });
      setModal(prev => ({ ...prev, name: data.name, hourly_rate: data.hourly_rate }));
      setGroups(prev => prev.map(g => g.id === data.id ? { ...g, name: data.name, hourly_rate: data.hourly_rate } : g));
    }
  };

  const handleAdjust = async (delta) => {
    if (!modal?.id || isNaN(delta) || delta === 0) return;
    setAdjustSaving(true);
    setAdjustResult(null);
    const res = await fetch("/api/purchases", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group_id: modal.id, delta_minutes: delta, note: adjustNote.trim() || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setAdjustSaving(false);
    if (res.ok) {
      const newBal = data.balance_after;
      setDisplayBalance(newBal);
      setGroups(prev => prev.map(g => g.id === modal.id ? { ...g, balance_minutes: newBal } : g));
      setAdjustResult({ ok: true, balance_after: newBal });
      setAdjustMinutes("");
      setAdjustNote("");
    } else {
      setAdjustResult({ ok: false, error: data.error || "Adjustment failed." });
    }
  };

  const toggleMember = async (clientId, newActive) => {
    const res = await fetch("/api/groups/members", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, is_active: newActive }),
    });
    if (res.ok) {
      setMembers(prev => prev.map(m => m.client_id === clientId ? { ...m, is_active: newActive } : m));
      if (!newActive && purchaseClientId === clientId) {
        const next = members.find(m => m.client_id !== clientId && m.is_active);
        setPurchaseClientId(next?.client_id || "");
      }
    }
  };

  const removeMember = async (clientId) => {
    const res = await fetch("/api/groups/members", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId }),
    });
    if (res.ok) {
      setMembers(prev => prev.filter(m => m.client_id !== clientId));
      setGroups(prev => prev.map(g => g.id === modal?.id ? { ...g, member_count: Math.max(0, g.member_count - 1) } : g));
      if (purchaseClientId === clientId) {
        const next = members.find(m => m.client_id !== clientId && m.is_active);
        setPurchaseClientId(next?.client_id || "");
      }
      setRemoveConfirm(null);
    }
  };

  const handleGroupArchiveToggle = async () => {
    if (!modal?.id) return;
    setArchiveLoading(true);
    setArchiveResult(null);
    const newArchived = !modal.is_archived;
    const res = await fetch("/api/groups", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: modal.id, is_archived: newArchived }),
    });
    const data = await res.json().catch(() => ({}));
    setArchiveLoading(false);
    if (!res.ok) { setArchiveResult({ ok: false, error: data.error || "Could not update." }); return; }
    setArchiveResult({ ok: true, archived: newArchived });
    setModal(prev => ({ ...prev, is_archived: newArchived }));
    setGroups(prev => prev.map(g => g.id === modal.id ? { ...g, is_archived: newArchived } : g));
  };

  const handleGroupDelete = async () => {
    if (!modal?.id) return;
    setDeleteLoading(true);
    setDeleteError(null);
    const res = await fetch("/api/groups", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: modal.id }),
    });
    const data = await res.json().catch(() => ({}));
    setDeleteLoading(false);
    if (!res.ok) { setDeleteError(data.error || "Delete failed."); return; }
    setGroups(prev => prev.filter(g => g.id !== modal.id));
    closeModal();
  };

  const isCreateMode = modal?.id == null;
  const activeMembers = members.filter(m => m.is_active);
  const parsedAdjust = parseInt(adjustMinutes, 10);
  const adjustValid = !isNaN(parsedAdjust) && parsedAdjust > 0;

  const purchaseClient = purchaseClientId
    ? { id: purchaseClientId, group_hourly_rate: modal?.hourly_rate }
    : null;

  // ─── Render ───────────────────────────────────────────────────────────────

  const sectionStyle = {
    padding: "16px 18px",
    borderBottom: `1px solid rgba(0,0,0,0.15)`,
  };

  const renderModal = () => {
    if (!modal) return null;

    return (
      <div
        style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.18)", display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: mobile ? 0 : "2rem 1rem" }}
        onMouseDown={e => { if (e.target === e.currentTarget) closeModal(); }}
      >
        <div style={{ background: "#fff", borderRadius: mobile ? 0 : 12, boxShadow: "0 8px 40px rgba(0,0,0,0.18)", width: "100%", maxWidth: 560, minHeight: mobile ? "100dvh" : undefined, position: "relative" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: `1px solid rgba(0,0,0,0.15)` }}>
            <h2 style={{ ...S.h3, fontSize: 20, marginBottom: 0 }}>
              {isCreateMode ? "New Group" : `Group Actions — ${modal.name || "Group"}`}
            </h2>
            <button onClick={closeModal} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: C.muted, lineHeight: 1, padding: "0 4px" }}>✕</button>
          </div>

          {/* Section 1: Group Info */}
          <div style={sectionStyle}>
            <h3 style={{ ...S.h3, fontSize: 17, marginBottom: 12 }}>
              {isCreateMode ? "Group Info" : "Edit Group Info"}
            </h3>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label style={{ ...S.label, fontSize: 15 }}>Name</label>
                <input
                  style={{ ...S.input, marginBottom: 0 }}
                  placeholder="e.g. Smith Family"
                  value={editName}
                  onChange={e => { setEditName(e.target.value); setInfoResult(null); }}
                  onKeyDown={e => e.key === "Enter" && saveInfo()}
                />
              </div>
              <div>
                <label style={{ ...S.label, fontSize: 15 }}>Hourly rate</label>
                <div style={{ display: "flex", alignItems: "center", border: `0.5px solid ${C.border}`, borderRadius: 8, width: 140, overflow: "hidden" }}>
                  <span style={{ padding: "10px 6px 10px 12px", fontSize: 16, color: C.muted, background: "#fafafa", borderRight: `0.5px solid ${C.border}`, flexShrink: 0 }}>$</span>
                  <input
                    style={{ ...S.input, width: "100%", marginBottom: 0, border: "none", borderRadius: 0, paddingLeft: 8, outline: "none" }}
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={editRate}
                    onChange={e => {
                      let val = e.target.value.replace(/[^0-9.]/g, "");
                      const parts = val.split(".");
                      if (parts.length > 2) val = parts[0] + "." + parts.slice(1).join("");
                      setEditRate(val);
                      setInfoResult(null);
                    }}
                  />
                  <span style={{ padding: "10px 12px 10px 6px", fontSize: 16, color: C.muted, background: "#fafafa", borderLeft: `0.5px solid ${C.border}`, flexShrink: 0 }}>/hr</span>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <button
                style={{ ...S.btn, opacity: infoSaving ? 0.6 : 1 }}
                disabled={infoSaving}
                onClick={saveInfo}
              >
                {infoSaving ? (isCreateMode ? "Creating…" : "Saving…") : (isCreateMode ? "Create Group" : "Save")}
              </button>
            </div>
            {infoResult && (
              <p style={{ fontSize: 15, marginTop: 8, marginBottom: 0, color: infoResult.ok ? C.teal : "#c0392b" }}>
                {infoResult.ok ? "Saved." : infoResult.error}
              </p>
            )}
          </div>

          {/* Remaining sections only for existing groups */}
          {!isCreateMode && (
            <>
              {/* Section 2: Balance */}
              <div style={sectionStyle}>
                <h3 style={{ ...S.h3, fontSize: 17, marginBottom: 6 }}>Balance</h3>
                <p style={{ fontSize: 22, fontWeight: 700, color: displayBalance < 0 ? "#c0392b" : C.teal, marginBottom: 14 }}>
                  {fmtBalance(displayBalance)}
                </p>

                {/* Adjust */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div>
                    <label style={{ ...S.label, fontSize: 15, marginBottom: 4 }}>Minutes</label>
                    <input
                      style={{ ...S.input, width: 110, marginBottom: 0 }}
                      type="text"
                      inputMode="numeric"
                      placeholder="e.g. 60"
                      value={adjustMinutes}
                      onChange={e => { setAdjustMinutes(e.target.value.replace(/\D/g, "")); setAdjustResult(null); }}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 130 }}>
                    <label style={{ ...S.label, fontSize: 15, marginBottom: 4 }}>Note (optional)</label>
                    <input
                      style={{ ...S.input, marginBottom: 0 }}
                      placeholder="Reason…"
                      value={adjustNote}
                      onChange={e => setAdjustNote(e.target.value)}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      style={{ ...S.btn, background: C.teal, opacity: adjustValid && !adjustSaving ? 1 : 0.5 }}
                      disabled={!adjustValid || adjustSaving}
                      onClick={() => handleAdjust(parsedAdjust)}
                    >+ Add</button>
                    <button
                      style={{ ...S.btn, background: "#c0392b", opacity: adjustValid && !adjustSaving ? 1 : 0.5 }}
                      disabled={!adjustValid || adjustSaving}
                      onClick={() => handleAdjust(-parsedAdjust)}
                    >− Remove</button>
                  </div>
                </div>
                {adjustResult && (
                  <p style={{ fontSize: 15, marginTop: 8, marginBottom: 0, color: adjustResult.ok ? C.teal : "#c0392b" }}>
                    {adjustResult.ok
                      ? `Done. New balance: ${fmtBalance(adjustResult.balance_after)}`
                      : adjustResult.error}
                  </p>
                )}
              </div>

              {/* Section 3: Purchase Package */}
              <div style={sectionStyle}>
                <h3 style={{ ...S.h3, fontSize: 17, marginBottom: 10 }}>
                  Purchase Package{purchaseDirty ? <span style={{ ...S.h3, fontSize: 17, color: "#c0392b", marginLeft: 6 }}>(pending)</span> : null}
                </h3>
                {activeMembers.length === 0 ? (
                  <p style={{ fontSize: 15, color: C.muted, marginBottom: 0 }}>Add members first to enable purchases.</p>
                ) : (
                  <>
                    {activeMembers.length > 1 && (
                      <div style={{ marginBottom: 10 }}>
                        <label style={{ ...S.label, fontSize: 15 }}>Charge which member's card</label>
                        <select
                          style={{ ...S.input, marginBottom: 0, cursor: "pointer" }}
                          value={purchaseClientId}
                          onChange={e => { setPurchaseClientId(e.target.value); setPurchaseDirty(false); }}
                        >
                          {activeMembers.map(m => (
                            <option key={m.client_id} value={m.client_id}>
                              {m.profile?.full_name || `${m.profile?.first_name || ""} ${m.profile?.last_name || ""}`.trim() || m.client_id}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {purchaseClient && (
                      <AdminPurchasePackage
                        key={purchaseClientId}
                        client={purchaseClient}
                        onDirtyChange={setPurchaseDirty}
                        onSuccess={newBal => {
                          setDisplayBalance(newBal);
                          setGroups(prev => prev.map(g => g.id === modal.id ? { ...g, balance_minutes: newBal } : g));
                        }}
                      />
                    )}
                  </>
                )}
              </div>

              {/* Section 4: Members */}
              <div style={sectionStyle}>
                <h3 style={{ ...S.h3, fontSize: 17, marginBottom: 10 }}>Members</h3>
                {membersLoading && <p style={{ fontSize: 15, color: C.muted }}>Loading…</p>}
                {!membersLoading && members.length === 0 && (
                  <p style={{ fontSize: 15, color: C.muted, marginBottom: 0 }}>No members yet. Invite clients via the Clients page.</p>
                )}
                {members.map(m => {
                  const name = m.profile?.full_name
                    || `${m.profile?.first_name || ""} ${m.profile?.last_name || ""}`.trim()
                    || "(unnamed)";
                  const email = m.profile?.preferred_email || "";
                  return (
                    <div key={m.client_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `0.5px solid ${C.border}` }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 500, color: C.text }}>{name}</div>
                        {email && <div style={{ fontSize: 13, color: C.muted }}>{email}</div>}
                      </div>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: C.muted, cursor: "pointer", flexShrink: 0 }}>
                        <input
                          type="checkbox"
                          checked={m.is_active}
                          onChange={e => toggleMember(m.client_id, e.target.checked)}
                          style={{ accentColor: C.teal }}
                        />
                        Active
                      </label>
                      {removeConfirm === m.client_id ? (
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          <button
                            style={{ fontSize: 12, padding: "3px 10px", borderRadius: 6, border: "1px solid #c0392b", background: "#c0392b", color: "#fff", cursor: "pointer", fontFamily: "inherit" }}
                            onClick={() => removeMember(m.client_id)}
                          >Confirm</button>
                          <button
                            style={{ fontSize: 12, padding: "3px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "#fff", color: C.text, cursor: "pointer", fontFamily: "inherit" }}
                            onClick={() => setRemoveConfirm(null)}
                          >Cancel</button>
                        </div>
                      ) : (
                        <button
                          style={{ fontSize: 12, padding: "3px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "#fff", color: C.muted, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}
                          onClick={() => setRemoveConfirm(m.client_id)}
                        >Remove</button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Section 5: Account Status */}
              <div style={{ ...sectionStyle, borderBottom: "none" }}>
                <h3 style={{ ...S.h3, fontSize: 17, marginBottom: 10 }}>Account Status</h3>
                {!deleteConfirmOpen && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      style={{ ...S.btnSmOut, border: `1px solid ${modal.is_archived ? C.teal : "#888"}`, color: modal.is_archived ? C.teal : "#888" }}
                      onClick={handleGroupArchiveToggle}
                      disabled={archiveLoading}
                    >
                      {archiveLoading ? "..." : modal.is_archived ? "Unarchive group" : "Archive group"}
                    </button>
                    <button
                      style={{ ...S.btnSmOut, border: "1px solid #c0392b", color: "#c0392b" }}
                      onClick={() => setDeleteConfirmOpen(true)}
                    >
                      Delete group permanently
                    </button>
                  </div>
                )}
                {archiveResult && (
                  <p style={{ fontSize: 14, marginTop: 6, marginBottom: 0, color: archiveResult.ok ? C.teal : "#c0392b" }}>
                    {archiveResult.ok
                      ? archiveResult.archived ? "Group and all members archived." : "Group and all members unarchived."
                      : archiveResult.error}
                  </p>
                )}
                {deleteConfirmOpen && (
                  <div style={{ background: "#fdf3f2", border: "1px solid rgba(192,57,43,0.3)", borderRadius: 8, padding: 14, marginTop: 8 }}>
                    <p style={{ fontSize: 14, color: C.text, marginBottom: 8, marginTop: 0 }}>
                      This permanently deletes the group and all its members. Type <strong>{modal.name}</strong> to confirm.
                    </p>
                    <input
                      style={{ ...S.input, marginBottom: 8 }}
                      placeholder="Type group name to confirm"
                      value={deleteInput}
                      onChange={e => setDeleteInput(e.target.value)}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        style={{ ...S.btn, background: "#c0392b", opacity: deleteInput === modal.name ? 1 : 0.5 }}
                        disabled={deleteInput !== modal.name || deleteLoading}
                        onClick={handleGroupDelete}
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
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={S.page}>
      <button style={{ ...S.navLink, marginBottom: 12, fontSize: 13, color: C.teal }} onClick={() => setPage("Admin")}>
        &larr; Back to Admin
      </button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ ...S.h1, fontSize: 26, marginBottom: 0 }}>Groups</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: C.muted, cursor: "pointer" }}>
            <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} style={{ accentColor: C.teal }} />
            Show archived
          </label>
          <button style={S.btn} onClick={openCreate}>+ New Group</button>
        </div>
      </div>

      {listLoading && <p style={{ color: C.muted }}>Loading…</p>}

      {!listLoading && groups.length === 0 && (
        <div style={S.card}>
          <p style={{ fontSize: 15, color: C.muted, marginBottom: 0 }}>
            No groups yet. Create a group, then invite clients to it.
          </p>
        </div>
      )}

      {groups.filter(g => showArchived || !g.is_archived).map(g => (
        <div
          key={g.id}
          style={{ ...S.card, marginBottom: 10, cursor: "pointer", transition: "box-shadow 0.15s", opacity: g.is_archived ? 0.55 : 1 }}
          onClick={() => openGroup(g)}
          onMouseEnter={e => e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.12)"}
          onMouseLeave={e => e.currentTarget.style.boxShadow = ""}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 600, color: C.text, marginBottom: 4 }}>
                {g.name}
                {g.is_archived && <span style={{ fontSize: 11, marginLeft: 8, padding: "1px 6px", borderRadius: 10, background: "#f0f0f0", color: "#888" }}>archived</span>}
              </div>
              <div style={{ fontSize: 13, color: C.muted }}>
                {g.member_count} member{g.member_count !== 1 ? "s" : ""}
                {" · "}
                <span style={{ color: g.balance_minutes < 0 ? "#c0392b" : "inherit" }}>{fmtBalance(g.balance_minutes)}</span>
                {" · "}{fmtRate(g.hourly_rate)}
              </div>
            </div>
            <span style={{ color: C.muted, fontSize: 18, flexShrink: 0 }}>›</span>
          </div>
        </div>
      ))}

      {renderModal()}
    </div>
  );
}
