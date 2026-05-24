"use client";
import { useState, useCallback } from "react";
import { C, S } from "@/lib/constants";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function fmtDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${DAYS[dt.getDay()]} ${MONTHS[m - 1]} ${d}, ${y}`;
}

function fmtTime(isoTimestamp, timeSlot) {
  if (isoTimestamp) {
    const d = new Date(isoTimestamp);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  }
  if (timeSlot) {
    const [h, m] = timeSlot.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  }
  return "—";
}

function statusBadge(status) {
  const colors = {
    confirmed: { bg: "#e8f5f2", color: "#0F6E56" },
    pending:   { bg: "#fef9e7", color: "#d4ac0d" },
    cancelled: { bg: "#fdecea", color: "#c0392b" },
    declined:  { bg: "#fdecea", color: "#c0392b" },
  };
  const c = colors[status] || { bg: "#f0f0f0", color: "#888" };
  return `<span style="font-size:11px;padding:1px 7px;border-radius:10px;background:${c.bg};color:${c.color};font-weight:500">${status}</span>`;
}

function downloadCSV(rows, clientName, groupName) {
  const header = ["Date", "Start", "End", "Session Type", "Status", "Attendees", "Names"];
  const lines = rows.map(r => [
    `"${fmtDate(r.date)}"`,
    `"${fmtTime(r.start_time, r.time_slot)}"`,
    `"${r.end_time ? fmtTime(r.end_time) : "—"}"`,
    `"${(r.session_type || "—").replace(/"/g, '""')}"`,
    `"${r.status}"`,
    r.attendee_count,
    r.attendee_names?.length ? `"${r.attendee_names.join(", ")}"` : "",
  ].join(","));
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sessions-${(clientName || "client").replace(/\s+/g, "-").toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function buildPrintHtml(rows, clientName, groupName, start, end) {
  const thL = "text-align:left;padding:8px 7px;font-size:12px;font-weight:600;color:#5F5E5A;border-bottom:1px solid rgba(0,0,0,0.1);background:#f7f7f5";
  const thC = "text-align:center;padding:8px 7px;font-size:12px;font-weight:600;color:#5F5E5A;border-bottom:1px solid rgba(0,0,0,0.1);background:#f7f7f5";

  const title = `Session Activity — ${clientName}${groupName ? ` (${groupName})` : ""}`;
  const dateRange = start && end
    ? `${fmtDate(start)} – ${fmtDate(end)}`
    : start ? `From ${fmtDate(start)}` : end ? `Through ${fmtDate(end)}` : "All time";

  const thead = `<thead>
    <tr><td colspan="7" style="padding:10px 7px 2px;font-size:16px;font-weight:700;text-align:center;background:#fff">DK Divorce Coach</td></tr>
    <tr><td colspan="7" style="padding:2px 7px;font-size:13px;font-weight:600;background:#fff">${title}</td></tr>
    <tr><td colspan="7" style="padding:2px 7px 10px;font-size:12px;color:#5F5E5A;border-bottom:1px solid rgba(0,0,0,0.15);background:#fff">${dateRange}</td></tr>
    <tr>
      <th style="${thL}">Date</th>
      <th style="${thL}">Start</th>
      <th style="${thL}">End</th>
      <th style="${thL}">Session Type</th>
      <th style="${thL}">Status</th>
      <th style="${thC}">Attendees</th>
      <th style="${thL}">Names</th>
    </tr>
  </thead>`;

  const tdBase = "padding:8px 7px;font-size:13px;border-bottom:0.5px solid rgba(0,0,0,0.1)";
  const bodyRows = rows.map(r => `<tr>
    <td style="${tdBase}">${fmtDate(r.date)}</td>
    <td style="${tdBase}">${fmtTime(r.start_time, r.time_slot)}</td>
    <td style="${tdBase}">${r.end_time ? fmtTime(r.end_time) : "—"}</td>
    <td style="${tdBase}">${r.session_type || "—"}</td>
    <td style="${tdBase}">${statusBadge(r.status)}</td>
    <td style="${tdBase};text-align:center">${r.attendee_count}</td>
    <td style="${tdBase};color:#5F5E5A">${r.attendee_names?.join(", ") || "—"}</td>
  </tr>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Session Activity</title>
    <style>* { box-sizing: border-box; } @page { size: landscape; margin: 0.25in; } body { font-family: system-ui, sans-serif; color: #2C2C2A; margin: 0; padding: 0; } table { width: 100%; border-collapse: collapse; } thead { display: table-header-group; }</style>
    <script>window.onload = function() { window.print(); }<\/script>
  </head><body><table>${thead}<tbody>${bodyRows}</tbody></table></body></html>`;
}

export default function SessionActivity({ clientId }) {
  const today = new Date();
  const firstOfYear = new Date(today.getFullYear(), 0, 1);
  const fmt = d => d.toISOString().slice(0, 10);

  const [start, setStart] = useState(fmt(firstOfYear));
  const [end, setEnd] = useState(fmt(today));
  const [rows, setRows] = useState(null);
  const [clientName, setClientName] = useState(null);
  const [groupName, setGroupName] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ client_id: clientId });
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    const res = await fetch(`/api/session-activity?${params}`).then(r => r.json()).catch(() => ({ error: "Network error" }));
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    setClientName(res.client_name || null);
    setGroupName(res.group_name || null);
    setRows(res.rows || []);
  }, [clientId, start, end]);

  const handlePrint = () => {
    const html = buildPrintHtml(rows, clientName, groupName, start, end);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    win.addEventListener("unload", () => URL.revokeObjectURL(url));
  };

  const thStyle = { textAlign: "left", padding: "8px 7px", fontSize: 12, fontWeight: 600, color: C.muted, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", background: "#f7f7f5" };
  const thC = { ...thStyle, textAlign: "center" };
  const tdStyle = { padding: "8px 7px", fontSize: 13, color: C.text, borderBottom: `0.5px solid ${C.border}`, verticalAlign: "top" };
  const tdC = { ...tdStyle, textAlign: "center" };

  const STATUS_COLORS = {
    confirmed: { bg: "#e8f5f2", color: "#0F6E56" },
    pending:   { bg: "#fef9e7", color: "#d4ac0d" },
    cancelled: { bg: "#fdecea", color: "#c0392b" },
    declined:  { bg: "#fdecea", color: "#c0392b" },
  };

  return (
    <div>
      {/* Controls */}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <label style={S.label}>From</label>
          <input style={{ ...S.input, width: 160, marginBottom: 0 }} type="date" value={start} onChange={e => setStart(e.target.value)} />
        </div>
        <div>
          <label style={S.label}>To</label>
          <input style={{ ...S.input, width: 160, marginBottom: 0 }} type="date" value={end} onChange={e => setEnd(e.target.value)} />
        </div>
        <button style={S.btn} onClick={load} disabled={loading}>
          {loading ? "Loading..." : "Load"}
        </button>
        {rows?.length > 0 && (
          <>
            <button style={S.btnSmOut} onClick={handlePrint}>Print</button>
            <button style={S.btnSmOut} onClick={() => downloadCSV(rows, clientName, groupName)}>Download CSV</button>
          </>
        )}
      </div>

      {error && <p style={{ color: "#c0392b", fontSize: 14 }}>{error}</p>}

      {rows !== null && (
        <div>
          <div style={{ position: "sticky", top: "var(--nav-height, 56px)", zIndex: 5, background: "#fff" }}>
            <div style={{ paddingTop: 8, paddingBottom: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>
                Session Activity — {clientName}{groupName ? ` (${groupName})` : ""}
              </div>
              <div style={{ fontSize: 13, color: C.muted }}>
                {start && end ? `${fmtDate(start)} – ${fmtDate(end)}` : "All time"}
              </div>
            </div>
            {rows.length > 0 && (
              <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "20%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "22%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Start</th>
                    <th style={thStyle}>End</th>
                    <th style={thStyle}>Session Type</th>
                    <th style={thStyle}>Status</th>
                    <th style={thC}>People</th>
                    <th style={thStyle}>Names</th>
                  </tr>
                </thead>
              </table>
            )}
          </div>

          {rows.length === 0 ? (
            <p style={{ fontSize: 14, color: C.muted }}>No sessions in this period.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "18%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "20%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "22%" }} />
              </colgroup>
              <tbody>
                {rows.map(r => {
                  const sc = STATUS_COLORS[r.status] || { bg: "#f0f0f0", color: "#888" };
                  return (
                    <tr key={r.id}>
                      <td style={tdStyle}>{fmtDate(r.date)}</td>
                      <td style={tdStyle}>{fmtTime(r.start_time, r.time_slot)}</td>
                      <td style={tdStyle}>{r.end_time ? fmtTime(r.end_time) : "—"}</td>
                      <td style={tdStyle}>{r.session_type || "—"}</td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 10, background: sc.bg, color: sc.color, fontWeight: 500 }}>
                          {r.status}
                        </span>
                      </td>
                      <td style={tdC}>{r.attendee_count}</td>
                      <td style={{ ...tdStyle, color: C.muted, fontSize: 12 }}>{r.attendee_names?.join(", ") || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
