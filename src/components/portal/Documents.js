"use client";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { C, S, SERVER_ERROR } from "@/lib/constants";
import { useError } from "@/context/ErrorContext";
import { useAuth } from "@/context/AuthContext";
import { useIsMobile } from "@/lib/hooks";

function formatDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function ExtBadge({ doc }) {
  const ext = doc.file_extension?.toUpperCase() || (doc.type === "form" ? "FORM" : "FILE");
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, letterSpacing: "0.04em",
      background: doc.type === "form" ? C.purpleLight : C.warm,
      color: doc.type === "form" ? C.purple : C.muted,
      flexShrink: 0,
    }}>{ext}</span>
  );
}

function viewerSrc(url, ext) {
  const e = ext?.toLowerCase();
  if (!url) return null;
  if (["pdf", "png", "jpg", "jpeg", "gif", "webp", "svg", "txt"].includes(e)) return url;
  if (["docx", "xlsx", "pptx", "doc", "xls", "ppt"].includes(e))
    return `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;
  return null;
}

export default function Documents({ viewAsClient, initialShareId }) {
  const { user, profile } = useAuth();
  const { setServerError } = useError();
  const mobile = useIsMobile();
  const isAdminUser = profile?.role === "admin";
  const isAdmin = isAdminUser && !viewAsClient;

  // Admin data
  const [docs, setDocs] = useState([]);
  const [allShares, setAllShares] = useState([]);
  const [allClients, setAllClients] = useState([]);
  // Client data
  const [ownShares, setOwnShares] = useState([]);
  const [loading, setLoading] = useState(true);

  // Admin upload
  const adminFileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  // Rename
  const [renameId, setRenameId] = useState(null);
  const [renameName, setRenameName] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);

  // Delete (admin library)
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Share modal
  const [shareDoc, setShareDoc] = useState(null);
  const [shareGroupId, setShareGroupId] = useState("");
  const [shareClientIds, setShareClientIds] = useState([]);
  const [shareRequireAck, setShareRequireAck] = useState(false);
  const [shareAckLabel, setShareAckLabel] = useState("");
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState(null);

  // Admin library search
  const [librarySearch, setLibrarySearch] = useState("");

  // Admin shared docs table
  const [sharesSearch, setSharesSearch] = useState("");
  const [sharesStatus, setSharesStatus] = useState("all");
  const [sortField, setSortField] = useState("shared_at");
  const [sortAsc, setSortAsc] = useState(false);
  const [unshareLoading, setUnshareLoading] = useState(null);

  // Admin viewer (practice library preview)
  const [adminViewerDoc, setAdminViewerDoc] = useState(null);
  const [adminViewerUrl, setAdminViewerUrl] = useState(null);
  const [adminViewerLoading, setAdminViewerLoading] = useState(false);

  // Client viewer
  const [viewerShare, setViewerShare] = useState(null);
  const [viewerUrl, setViewerUrl] = useState(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [ackLoading, setAckLoading] = useState(false);
  const [ackError, setAckError] = useState(null);
  const [downloadHint, setDownloadHint] = useState(false);

  // Client upload
  const clientFileRef = useRef(null);
  const [clientUploading, setClientUploading] = useState(false);
  const [clientUploadError, setClientUploadError] = useState(null);
  const [clientDeleteLoading, setClientDeleteLoading] = useState(null);

  // Highlight (deep link)
  const [highlightId, setHighlightId] = useState(initialShareId || null);
  const highlightRef = useRef(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      if (isAdminUser) {
        const [docsR, sharesR, clientsR] = await Promise.all([
          fetch("/api/documents"),
          fetch("/api/documents/shares"),
          fetch("/api/clients"),
        ]);
        if (docsR.status >= 500 || sharesR.status >= 500 || clientsR.status >= 500) {
          setServerError(SERVER_ERROR);
          return;
        }
        const [docsRes, sharesRes, clientsRes] = await Promise.all([
          docsR.json().catch(() => []),
          sharesR.json().catch(() => []),
          clientsR.json().catch(() => ({ clients: [] })),
        ]);
        setDocs(Array.isArray(docsRes) ? docsRes : []);
        setAllShares(Array.isArray(sharesRes) ? sharesRes : []);
        setAllClients((clientsRes.clients || []).filter(c => c.role === "client" && !c.is_archived));
      } else {
        const r = await fetch("/api/documents/shares");
        if (r.status >= 500) { setServerError(SERVER_ERROR); return; }
        const res = await r.json().catch(() => []);
        setOwnShares(Array.isArray(res) ? res : []);
      }
    } catch {
      setServerError(SERVER_ERROR);
    } finally {
      setLoading(false);
    }
  }, [user, isAdminUser]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (initialShareId) setHighlightId(initialShareId);
  }, [initialShareId]);

  useEffect(() => {
    if (!highlightId || loading) return;
    const t = setTimeout(() => highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
    return () => clearTimeout(t);
  }, [highlightId, loading]);

  useEffect(() => {
    if (!highlightId) return;
    const t = setTimeout(() => setHighlightId(null), 3000);
    return () => clearTimeout(t);
  }, [highlightId]);

  const groups = useMemo(() => {
    const seen = new Set();
    return allClients
      .filter(c => c.group_id && !seen.has(c.group_id) && seen.add(c.group_id))
      .map(c => ({ id: c.group_id, name: c.group_name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allClients]);

  const modalClients = useMemo(() => (
    shareGroupId ? allClients.filter(c => c.group_id === shareGroupId) : []
  ), [allClients, shareGroupId]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleAdminUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("name", file.name.replace(/\.[^/.]+$/, ""));
    fd.append("type", "file");
    try {
      const r = await fetch("/api/documents", { method: "POST", body: fd });
      if (r.status >= 500) { setServerError(SERVER_ERROR); return; }
      const res = await r.json();
      if (res.error) setUploadError(res.error);
      else setDocs(prev => [{ ...res, document_shares: [{ count: 0 }] }, ...prev]);
    } catch {
      setServerError(SERVER_ERROR);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const submitRename = async (id) => {
    if (!renameName.trim()) { setRenameId(null); return; }
    setRenameSaving(true);
    try {
      const r = await fetch("/api/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name: renameName.trim() }),
      });
      if (r.status >= 500) { setServerError(SERVER_ERROR); }
      else {
        const res = await r.json().catch(() => ({}));
        if (!res.error) setDocs(prev => prev.map(d => d.id === id ? { ...d, name: res.name } : d));
      }
    } catch {
      setServerError(SERVER_ERROR);
    } finally {
      setRenameId(null);
      setRenameSaving(false);
    }
  };

  const handleDelete = async (id) => {
    setDeleteLoading(true);
    try {
      const r = await fetch("/api/documents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (r.status >= 500) { setServerError(SERVER_ERROR); }
      else {
        const res = await r.json().catch(() => ({}));
        if (!res.error) {
          setDocs(prev => prev.filter(d => d.id !== id));
          setAllShares(prev => prev.filter(s => s.document_id !== id));
        }
      }
    } catch {
      setServerError(SERVER_ERROR);
    } finally {
      setDeleteConfirmId(null);
      setDeleteLoading(false);
    }
  };

  const openShareModal = (doc) => {
    setShareDoc(doc);
    setShareGroupId("");
    setShareClientIds([]);
    setShareRequireAck(false);
    setShareAckLabel("");
    setShareError(null);
  };

  const handleShare = async () => {
    if (!shareClientIds.length) { setShareError("Select at least one client."); return; }
    setShareLoading(true);
    setShareError(null);
    try {
      const r = await fetch("/api/documents/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_id: shareDoc.id,
          client_ids: shareClientIds,
          require_acknowledgment: shareRequireAck,
          acknowledgment_label: shareAckLabel,
        }),
      });
      if (r.status >= 500) { setServerError(SERVER_ERROR); return; }
      const res = await r.json().catch(() => ({}));
      if (res.error) { setShareError(res.error); return; }
      const [docsR, sharesR] = await Promise.all([
        fetch("/api/documents"),
        fetch("/api/documents/shares"),
      ]);
      if (docsR.status >= 500 || sharesR.status >= 500) { setServerError(SERVER_ERROR); return; }
      const [docsRes, sharesRes] = await Promise.all([
        docsR.json().catch(() => []),
        sharesR.json().catch(() => []),
      ]);
      setDocs(Array.isArray(docsRes) ? docsRes : []);
      setAllShares(Array.isArray(sharesRes) ? sharesRes : []);
      setShareDoc(null);
    } catch {
      setServerError(SERVER_ERROR);
    } finally {
      setShareLoading(false);
    }
  };

  const handleUnshare = async (shareId) => {
    setUnshareLoading(shareId);
    try {
      const r = await fetch("/api/documents/shares", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ share_id: shareId }),
      });
      if (r.ok) setAllShares(prev => prev.filter(s => s.id !== shareId));
      else if (r.status >= 500) setServerError(SERVER_ERROR);
    } catch {
      setServerError(SERVER_ERROR);
    } finally {
      setUnshareLoading(null);
    }
  };

  const openAdminViewer = async (doc) => {
    setAdminViewerDoc(doc);
    setAdminViewerUrl(null);
    setAdminViewerLoading(true);
    try {
      const r = await fetch(`/api/documents/${doc.id}/url`);
      if (r.status >= 500) { setServerError(SERVER_ERROR); setAdminViewerDoc(null); return; }
      const res = await r.json().catch(() => ({}));
      setAdminViewerUrl(res.url || null);
    } catch {
      setServerError(SERVER_ERROR);
      setAdminViewerDoc(null);
    } finally {
      setAdminViewerLoading(false);
    }
  };

  const openViewer = async (share) => {
    setViewerShare(share);
    setViewerUrl(null);
    setViewerLoading(true);
    setAckError(null);
    try {
      const r = await fetch(`/api/documents/${share.document_id}/url`);
      if (r.status >= 500) { setServerError(SERVER_ERROR); setViewerShare(null); return; }
      const res = await r.json().catch(() => ({}));
      setViewerUrl(res.url || null);
    } catch {
      setServerError(SERVER_ERROR);
      setViewerShare(null);
    } finally {
      setViewerLoading(false);
    }
  };

  const handleAcknowledge = async () => {
    setAckLoading(true);
    setAckError(null);
    try {
      const r = await fetch(`/api/documents/shares/${viewerShare.id}/acknowledge`, { method: "POST" });
      if (r.status >= 500) { setServerError(SERVER_ERROR); return; }
      const res = await r.json().catch(() => ({}));
      if (res.error) { setAckError(res.error); return; }
      const now = new Date().toISOString();
      setOwnShares(prev => prev.map(s => s.id === viewerShare.id ? { ...s, acknowledged_at: now } : s));
      setViewerShare(prev => ({ ...prev, acknowledged_at: now }));
    } catch {
      setServerError(SERVER_ERROR);
    } finally {
      setAckLoading(false);
    }
  };

  const triggerDownload = async (url, name, ext) => {
    const filename = ext ? `${name}.${ext}` : name;
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({ suggestedName: filename });
        const res = await fetch(url);
        const blob = await res.blob();
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (err) {
        if (err.name === "AbortError") return;
        // unsupported or permission denied — fall through to legacy
      }
    }
    const res = await fetch(url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
    setDownloadHint(true);
    setTimeout(() => setDownloadHint(false), 5000);
  };

  const handleClientUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setClientUploading(true);
    setClientUploadError(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await fetch("/api/documents/client-upload", { method: "POST", body: fd });
      if (r.status >= 500) { setServerError(SERVER_ERROR); return; }
      const res = await r.json();
      if (res.error) setClientUploadError(res.error);
      else {
        const sharesR = await fetch("/api/documents/shares");
        if (sharesR.status >= 500) { setServerError(SERVER_ERROR); return; }
        const sharesRes = await sharesR.json().catch(() => []);
        setOwnShares(Array.isArray(sharesRes) ? sharesRes : []);
      }
    } catch {
      setServerError(SERVER_ERROR);
    } finally {
      setClientUploading(false);
      e.target.value = "";
    }
  };

  const handleClientDeleteUpload = async (shareId) => {
    setClientDeleteLoading(shareId);
    try {
      const r = await fetch("/api/documents/client-upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ share_id: shareId }),
      });
      if (r.status >= 500) { setServerError(SERVER_ERROR); return; }
      const res = await r.json().catch(() => ({}));
      if (!res.error) setOwnShares(prev => prev.filter(s => s.id !== shareId));
    } catch {
      setServerError(SERVER_ERROR);
    } finally {
      setClientDeleteLoading(null);
    }
  };

  // Admin shared docs table helpers
  const filteredShares = useMemo(() => {
    let list = [...allShares];
    if (sharesSearch) {
      const q = sharesSearch.toLowerCase();
      list = list.filter(s =>
        s.documents?.name?.toLowerCase().includes(q) ||
        s.client?.first_name?.toLowerCase().includes(q) ||
        s.client?.last_name?.toLowerCase().includes(q)
      );
    }
    if (sharesStatus === "pending") list = list.filter(s => s.require_acknowledgment && !s.acknowledged_at && !s.client_upload);
    else if (sharesStatus === "acknowledged") list = list.filter(s => !!s.acknowledged_at);
    else if (sharesStatus === "upload") list = list.filter(s => s.client_upload);
    list.sort((a, b) => {
      let av = "", bv = "";
      if (sortField === "document") { av = a.documents?.name || ""; bv = b.documents?.name || ""; }
      else if (sortField === "client") { av = a.client?.last_name || ""; bv = b.client?.last_name || ""; }
      else { av = a.shared_at || ""; bv = b.shared_at || ""; }
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return list;
  }, [allShares, sharesSearch, sharesStatus, sortField, sortAsc]);

  const SortTh = ({ field, label }) => (
    <th
      onClick={() => { if (sortField === field) setSortAsc(p => !p); else { setSortField(field); setSortAsc(true); } }}
      style={{ textAlign: "left", padding: "8px 12px", fontSize: 12, color: C.muted, fontWeight: 500, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
    >
      {label}{sortField === field ? (sortAsc ? " ↑" : " ↓") : ""}
    </th>
  );

  // Client shares (own or admin-as-client)
  const displayShares = viewAsClient
    ? allShares.filter(s => s.client_id === viewAsClient.id)
    : ownShares;

  if (loading) {
    return (
      <div style={S.page}>
        <h1 style={{ ...S.h1, fontSize: 26 }}>Documents</h1>
        <p style={{ ...S.p, textAlign: "center" }}>Loading…</p>
      </div>
    );
  }

  // ── CLIENT VIEW ───────────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div style={S.page}>
        <input ref={clientFileRef} type="file" style={{ display: "none" }} onChange={handleClientUpload} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
          <h1 style={{ ...S.h1, marginBottom: 0, fontSize: 26 }}>Documents</h1>
          {!viewAsClient && (
            <button style={S.btnSm} onClick={() => clientFileRef.current?.click()} disabled={clientUploading}>
              {clientUploading ? "Uploading…" : "Upload file"}
            </button>
          )}
        </div>
        {clientUploadError && <p style={{ color: "#c0392b", fontSize: 13, marginBottom: 12 }}>{clientUploadError}</p>}

        {displayShares.length === 0 ? (
          <div style={{ ...S.card, textAlign: "center", color: C.hint }}>No documents yet.</div>
        ) : (
          displayShares.map(share => {
            const doc = share.documents || {};
            const isHighlighted = highlightId === share.id;
            const pendingAck = share.require_acknowledgment && !share.acknowledged_at;
            return (
              <div
                key={share.id}
                ref={isHighlighted ? highlightRef : null}
                style={{
                  ...S.card, cursor: "pointer", display: "flex", alignItems: "center", gap: 12,
                  background: isHighlighted ? "#fffbea" : "#fff",
                  borderColor: isHighlighted ? "#f0c040" : undefined,
                  transition: "background 0.4s",
                }}
                onClick={() => openViewer(share)}
              >
                <div style={{ width: 42, height: 42, borderRadius: 8, background: C.warm, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <ExtBadge doc={doc} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {doc.name || "Untitled"}
                  </div>
                  <div style={{ fontSize: 12, color: C.hint, marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span>{formatDate(share.shared_at)}</span>
                    {share.client_upload && <span>Uploaded by you</span>}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                  {pendingAck && (
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#fef3c7", color: "#92400e", fontWeight: 500 }}>
                      Action required
                    </span>
                  )}
                  {share.acknowledged_at && (
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: C.tealLight, color: C.teal, fontWeight: 500 }}>
                      Acknowledged
                    </span>
                  )}
                  {share.client_upload && !viewAsClient && (
                    <button
                      style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, border: `0.5px solid ${C.border}`, background: "none", color: C.hint, cursor: "pointer", fontFamily: "inherit" }}
                      disabled={clientDeleteLoading === share.id}
                      onClick={e => { e.stopPropagation(); handleClientDeleteUpload(share.id); }}
                    >
                      {clientDeleteLoading === share.id ? "…" : "Delete"}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Viewer modal */}
        {viewerShare && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 100, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#fff", borderBottom: `0.5px solid ${C.border}`, flexShrink: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: 12 }}>
                {viewerShare.documents?.name || "Document"}
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                {viewerUrl && (
                  <button
                    style={{ ...S.btnSmOut, padding: "6px 12px", fontSize: 12 }}
                    onClick={() => triggerDownload(viewerUrl, viewerShare.documents?.name || "document", viewerShare.documents?.file_extension)}>
                    Download
                  </button>
                )}
                <button onClick={() => setViewerShare(null)}
                  style={{ background: "none", border: `0.5px solid ${C.border}`, borderRadius: 8, fontSize: 20, lineHeight: 1, cursor: "pointer", color: C.muted, padding: "4px 10px", fontFamily: "inherit" }}>
                  ×
                </button>
              </div>
            </div>
            {downloadHint && (
              <div style={{ padding: "7px 14px", background: "#f0faf4", borderBottom: `0.5px solid #a7d7b8`, fontSize: 12, color: "#2d6a4f", flexShrink: 0 }}>
                File saved — check your Downloads folder.
              </div>
            )}
            <div style={{ flex: 1, overflow: "hidden", background: "#f0f0f0", position: "relative" }}>
              {viewerLoading && (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: C.hint, fontSize: 14 }}>
                  Loading…
                </div>
              )}
              {!viewerLoading && (() => {
                const src = viewerSrc(viewerUrl, viewerShare.documents?.file_extension);
                if (src) return <iframe src={src} style={{ width: "100%", height: "100%", border: "none" }} title="Document viewer" />;
                if (viewerUrl) return (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12 }}>
                    <p style={{ fontSize: 14, color: C.muted }}>Preview not available for this file type.</p>
                    <button style={{ ...S.btn, fontSize: 13 }} onClick={() => triggerDownload(viewerUrl, viewerShare.documents?.name || "document", viewerShare.documents?.file_extension)}>Download file</button>
                  </div>
                );
                return (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                    <p style={{ fontSize: 14, color: C.hint }}>Unable to load document.</p>
                  </div>
                );
              })()}
            </div>
            {viewerShare.require_acknowledgment && !viewerShare.acknowledged_at && (
              <div style={{ padding: "12px 16px", background: "#fffbea", borderTop: "1px solid #fbbf24", display: "flex", alignItems: "center", gap: 12, flexShrink: 0, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: "#92400e" }}>
                  {viewerShare.acknowledgment_label || "I have read and agree"}
                </span>
                <button style={{ ...S.btn, fontSize: 13, padding: "8px 20px" }} onClick={handleAcknowledge} disabled={ackLoading}>
                  {ackLoading ? "…" : "Acknowledge"}
                </button>
              </div>
            )}
            {ackError && (
              <div style={{ padding: "8px 16px", background: "#fdecea", borderTop: "1px solid #e6b8b0", fontSize: 12, color: "#c0392b", flexShrink: 0 }}>{ackError}</div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── ADMIN VIEW ────────────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      <input ref={adminFileRef} type="file" style={{ display: "none" }} onChange={handleAdminUpload} />
      <h1 style={{ ...S.h1, fontSize: 26 }}>Documents</h1>

      {/* Practice Library */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ ...S.h2, marginBottom: 0, fontSize: 17 }}>Practice Library</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <input
            value={librarySearch}
            onChange={e => setLibrarySearch(e.target.value)}
            placeholder="Search…"
            style={{ ...S.input, marginBottom: 0, fontSize: 13, padding: "7px 10px", width: 200 }}
          />
          <button style={S.btnSm} onClick={() => adminFileRef.current?.click()} disabled={uploading}>
            {uploading ? "Uploading…" : "+ Upload file"}
          </button>
        </div>
      </div>
      {uploadError && <p style={{ color: "#c0392b", fontSize: 13, marginBottom: 8 }}>{uploadError}</p>}

      {(() => {
        const filteredDocs = librarySearch
          ? docs.filter(d => d.name.toLowerCase().includes(librarySearch.toLowerCase()))
          : docs;
        return filteredDocs.length === 0 ? (
          <div style={{ ...S.card, textAlign: "center", color: C.hint, marginBottom: "2rem" }}>
            {docs.length === 0 ? "No documents uploaded yet." : "No documents match your search."}
          </div>
        ) : (
        <div style={{ ...S.card, padding: 0, overflow: "hidden", marginBottom: "2rem" }}>
          {filteredDocs.map((doc, i) => {
            const shareCount = doc.document_shares?.[0]?.count ?? 0;
            return (
              <div key={doc.id} style={{ padding: "12px 16px", borderBottom: i < docs.length - 1 ? `0.5px solid ${C.border}` : "none", display: "flex", alignItems: "center", gap: 10, flexWrap: mobile ? "wrap" : "nowrap" }}>
                <ExtBadge doc={doc} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {renameId === doc.id ? (
                    <input
                      autoFocus
                      value={renameName}
                      onChange={e => setRenameName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") submitRename(doc.id); if (e.key === "Escape") setRenameId(null); }}
                      onBlur={() => submitRename(doc.id)}
                      disabled={renameSaving}
                      style={{ ...S.input, marginBottom: 0, fontSize: 13, padding: "4px 8px" }}
                    />
                  ) : (
                    <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{doc.name}</div>
                  )}
                  <div style={{ fontSize: 11, color: C.hint, marginTop: 2 }}>
                    {formatDate(doc.created_at)} · {shareCount} share{shareCount !== 1 ? "s" : ""}{doc.file_size_bytes ? ` · ${formatSize(doc.file_size_bytes)}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button style={S.btnSmOut} onClick={() => openAdminViewer(doc)}>View</button>
                  <button style={S.btnSmOut} onClick={() => openShareModal(doc)}>Share</button>
                  <button style={S.btnSmOut} onClick={() => { setRenameId(doc.id); setRenameName(doc.name); }}>Rename</button>
                  {deleteConfirmId === doc.id ? (
                    <>
                      <button style={{ ...S.btnSm, background: "#c0392b" }} onClick={() => handleDelete(doc.id)} disabled={deleteLoading}>
                        {deleteLoading ? "…" : "Confirm"}
                      </button>
                      <button style={S.btnSmOut} onClick={() => setDeleteConfirmId(null)}>Cancel</button>
                    </>
                  ) : (
                    <button style={S.btnSmOut} onClick={() => setDeleteConfirmId(doc.id)}>Delete</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        );
      })()}

      {/* Shared Documents */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ ...S.h2, marginBottom: 0, fontSize: 17 }}>Shared Documents</h2>
        <span style={{ fontSize: 12, color: C.hint }}>{allShares.length} total</span>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input
          value={sharesSearch}
          onChange={e => setSharesSearch(e.target.value)}
          placeholder="Search document or client…"
          style={{ ...S.input, marginBottom: 0, flex: 1, minWidth: 180, fontSize: 13, padding: "7px 10px" }}
        />
        <select
          value={sharesStatus}
          onChange={e => setSharesStatus(e.target.value)}
          style={{ ...S.input, marginBottom: 0, width: "auto", fontSize: 13, padding: "7px 10px", cursor: "pointer" }}
        >
          <option value="all">All</option>
          <option value="pending">Pending ack</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="upload">Client uploads</option>
        </select>
      </div>

      {filteredShares.length === 0 ? (
        <div style={{ ...S.card, textAlign: "center", color: C.hint }}>No shares found.</div>
      ) : (
        <div style={{ ...S.card, padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `0.5px solid ${C.border}`, background: C.warm }}>
                <SortTh field="document" label="Document" />
                <SortTh field="client" label="Client" />
                <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 12, color: C.muted, fontWeight: 500 }}>Required</th>
                <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 12, color: C.muted, fontWeight: 500 }}>Status</th>
                <SortTh field="shared_at" label="Shared" />
                <th style={{ padding: "8px 12px" }} />
              </tr>
            </thead>
            <tbody>
              {filteredShares.map((share, i) => {
                const isHighlighted = highlightId === share.id;
                const clientName = share.client
                  ? `${share.client.first_name || ""} ${share.client.last_name || ""}`.trim() || "—"
                  : "—";
                return (
                  <tr
                    key={share.id}
                    ref={isHighlighted ? highlightRef : null}
                    style={{
                      borderBottom: i < filteredShares.length - 1 ? `0.5px solid ${C.border}` : "none",
                      background: isHighlighted ? "#fffbea" : "transparent",
                      transition: "background 0.4s",
                    }}
                  >
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {share.client_upload && (
                          <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: C.purpleLight, color: C.purple, fontWeight: 600, flexShrink: 0 }}>Upload</span>
                        )}
                        <span title={share.documents?.name} style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.text }}>
                          {share.documents?.name || "—"}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span title={clientName} style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.text, display: "block" }}>{clientName}</span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {share.require_acknowledgment
                        ? <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#fef3c7", color: "#92400e", fontWeight: 500 }}>Ack</span>
                        : <span style={{ color: C.hint }}>—</span>}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {share.acknowledged_at
                        ? <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: C.tealLight, color: C.teal, fontWeight: 500 }}>Acknowledged</span>
                        : share.require_acknowledgment
                          ? <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#fef3c7", color: "#92400e", fontWeight: 500 }}>Pending</span>
                          : <span style={{ color: C.hint }}>—</span>}
                    </td>
                    <td style={{ padding: "10px 12px", color: C.hint, whiteSpace: "nowrap" }}>{formatDate(share.shared_at)}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          style={{ ...S.btnSmOut, fontSize: 11, padding: "4px 10px" }}
                          onClick={() => openAdminViewer(share.documents)}
                        >
                          View
                        </button>
                        <button
                          style={{ ...S.btnSmOut, fontSize: 11, padding: "4px 10px" }}
                          onClick={() => handleUnshare(share.id)}
                          disabled={unshareLoading === share.id}
                        >
                          {unshareLoading === share.id ? "…" : "Unshare"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Admin viewer modal */}
      {adminViewerDoc && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 100, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#fff", borderBottom: `0.5px solid ${C.border}`, flexShrink: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: 12 }}>
              {adminViewerDoc.name}
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              {adminViewerUrl && (
                <button
                  style={{ ...S.btnSmOut, padding: "6px 12px", fontSize: 12 }}
                  onClick={() => triggerDownload(adminViewerUrl, adminViewerDoc.name, adminViewerDoc.file_extension)}>
                  Download
                </button>
              )}
              <button onClick={() => setAdminViewerDoc(null)}
                style={{ background: "none", border: `0.5px solid ${C.border}`, borderRadius: 8, fontSize: 20, lineHeight: 1, cursor: "pointer", color: C.muted, padding: "4px 10px", fontFamily: "inherit" }}>
                ×
              </button>
            </div>
          </div>
          {downloadHint && (
            <div style={{ padding: "7px 14px", background: "#f0faf4", borderBottom: `0.5px solid #a7d7b8`, fontSize: 12, color: "#2d6a4f", flexShrink: 0 }}>
              File saved — check your Downloads folder.
            </div>
          )}
          <div style={{ flex: 1, overflow: "hidden", background: "#f0f0f0", position: "relative" }}>
            {adminViewerLoading && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: C.hint, fontSize: 14 }}>
                Loading…
              </div>
            )}
            {!adminViewerLoading && (() => {
              const src = viewerSrc(adminViewerUrl, adminViewerDoc.file_extension);
              if (src) return <iframe src={src} style={{ width: "100%", height: "100%", border: "none" }} title="Document viewer" />;
              if (adminViewerUrl) return (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12 }}>
                  <p style={{ fontSize: 14, color: C.muted }}>Preview not available for this file type.</p>
                  <button style={{ ...S.btn, fontSize: 13 }} onClick={() => triggerDownload(adminViewerUrl, adminViewerDoc.name, adminViewerDoc.file_extension)}>Download file</button>
                </div>
              );
              return (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                  <p style={{ fontSize: 14, color: C.hint }}>Unable to load document.</p>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Share modal */}
      {shareDoc && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: "1.5rem", width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ ...S.h3, marginBottom: 0, fontSize: 16 }}>Share "{shareDoc.name}"</h3>
              <button onClick={() => setShareDoc(null)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: C.hint, lineHeight: 1, padding: "0 4px" }}>×</button>
            </div>

            <label style={S.label}>Group <span style={{ color: "#c0392b" }}>*</span></label>
            <select
              style={{ ...S.input, cursor: "pointer" }}
              value={shareGroupId}
              onChange={e => { setShareGroupId(e.target.value); setShareClientIds([]); }}
            >
              <option value="">— Select a group —</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>

            <label style={{ ...S.label, marginBottom: 6 }}>Clients</label>
            <div style={{ border: `0.5px solid ${C.border}`, borderRadius: 8, overflow: "hidden", marginBottom: "0.75rem", maxHeight: 200, overflowY: "auto" }}>
              {!shareGroupId ? (
                <p style={{ padding: 12, fontSize: 13, color: C.hint, margin: 0 }}>Select a group above to see clients.</p>
              ) : modalClients.length === 0 ? (
                <p style={{ padding: 12, fontSize: 13, color: C.hint, margin: 0 }}>No active clients in this group.</p>
              ) : (<>
                <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderBottom: `0.5px solid ${C.border}`, cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
                  <input
                    type="checkbox"
                    checked={shareClientIds.length === modalClients.length}
                    onChange={() => setShareClientIds(shareClientIds.length === modalClients.length ? [] : modalClients.map(c => c.id))}
                    style={{ accentColor: C.teal }}
                  />
                  <span style={{ color: C.text }}>All</span>
                </label>
                {modalClients.map((c, i) => (
                <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderBottom: i < modalClients.length - 1 ? `0.5px solid ${C.border}` : "none", cursor: "pointer", fontSize: 13 }}>
                  <input type="checkbox" checked={shareClientIds.includes(c.id)} onChange={() => setShareClientIds(prev => prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id])} style={{ accentColor: C.teal }} />
                  <span style={{ color: C.text }}>{`${c.first_name || ""} ${c.last_name || ""}`.trim() || c.email}</span>
                  {c.group_name && <span style={{ fontSize: 11, color: C.hint }}>({c.group_name})</span>}
                </label>
              ))}
              </>)}
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, cursor: "pointer", marginBottom: "0.75rem" }}>
              <input type="checkbox" checked={shareRequireAck} onChange={e => setShareRequireAck(e.target.checked)} style={{ accentColor: C.teal }} />
              <span style={{ color: C.text }}>Require acknowledgment</span>
            </label>
            {shareRequireAck && (
              <>
                <label style={S.label}>Acknowledgment text</label>
                <select
                  value={shareAckLabel}
                  onChange={e => setShareAckLabel(e.target.value)}
                  style={{ ...S.input, cursor: "pointer" }}
                >
                  <option value="">— Select —</option>
                  <option value="By clicking I acknowledge I have read this document.">By clicking I acknowledge I have read this document.</option>
                  <option value="By clicking I acknowledge I have read this document and agree to the terms.">By clicking I acknowledge I have read this document and agree to the terms.</option>
                </select>
              </>
            )}

            {shareError && <p style={{ color: "#c0392b", fontSize: 13, marginBottom: 8 }}>{shareError}</p>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button style={S.btnSmOut} onClick={() => setShareDoc(null)}>Cancel</button>
              <button style={S.btnSm} onClick={handleShare} disabled={shareLoading || !shareClientIds.length}>
                {shareLoading ? "Sharing…" : `Share with ${shareClientIds.length || 0} client${shareClientIds.length !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
