"use client";
import { useState, useCallback } from "react";
import { C, S } from "@/lib/constants";

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtMins(n) {
  if (!n) return "—";
  return (n > 0 ? "+" : "") + n + " min";
}

function fmtDollars(cents) {
  if (cents == null) return "—";
  return "$" + (Math.abs(cents) / 100).toFixed(2);
}

function downloadCSV(rows, clientName) {
  const header = ["Date", "Description", "Minutes", "Amount", "Balance (min)"];
  const lines = rows.map(r => [
    `"${fmtDate(r.date)}"`,
    `"${r.description.replace(/"/g, '""')}"`,
    r.delta_minutes || 0,
    r.amount_cents != null ? (Math.abs(r.amount_cents) / 100).toFixed(2) : "",
    r.balance_minutes,
  ].join(","));
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `statement-${(clientName || "client").replace(/\s+/g, "-").toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function buildPrintHtml(rows, clientName, start, end) {
  const headerRow = `<tr style="background:#f7f7f5">
    <th style="text-align:left;padding:8px 7px;font-size:12px;font-weight:600;color:#5F5E5A;border-bottom:1px solid rgba(0,0,0,0.1)">Date</th>
    <th style="text-align:left;padding:8px 7px;font-size:12px;font-weight:600;color:#5F5E5A;border-bottom:1px solid rgba(0,0,0,0.1)">Description</th>
    <th style="text-align:right;padding:8px 7px;font-size:12px;font-weight:600;color:#5F5E5A;border-bottom:1px solid rgba(0,0,0,0.1)">Minutes</th>
    <th style="text-align:right;padding:8px 7px;font-size:12px;font-weight:600;color:#5F5E5A;border-bottom:1px solid rgba(0,0,0,0.1)">Amount</th>
    <th style="text-align:right;padding:8px 7px;font-size:12px;font-weight:600;color:#5F5E5A;border-bottom:1px solid rgba(0,0,0,0.1)">Balance</th>
  </tr>`;

  const bodyRows = rows.map(r => {
    const minColor = r.delta_minutes > 0 ? "#0F6E56" : r.delta_minutes < 0 ? "#c0392b" : "#5F5E5A";
    return `<tr>
      <td style="padding:8px 7px;font-size:13px;border-bottom:0.5px solid rgba(0,0,0,0.1)">${fmtDate(r.date)}</td>
      <td style="padding:8px 7px;font-size:13px;border-bottom:0.5px solid rgba(0,0,0,0.1)">${r.description}</td>
      <td style="padding:8px 7px;font-size:13px;text-align:right;border-bottom:0.5px solid rgba(0,0,0,0.1);color:${minColor}">${fmtMins(r.delta_minutes)}</td>
      <td style="padding:8px 7px;font-size:13px;text-align:right;border-bottom:0.5px solid rgba(0,0,0,0.1)">${fmtDollars(r.amount_cents)}</td>
      <td style="padding:8px 7px;font-size:13px;text-align:right;font-weight:500;border-bottom:0.5px solid rgba(0,0,0,0.1)">${r.balance_minutes} min</td>
    </tr>`;
  }).join("");

  return `<!DOCTYPE html><html><head><title>Statement</title>
    <style>
      body { font-family: system-ui, sans-serif; padding: 24px; color: #2C2C2A; }
      table { width: 100%; border-collapse: collapse; }
      h2 { margin: 0 0 4px; font-size: 18px; }
      p { margin: 0 0 20px; font-size: 13px; color: #5F5E5A; }
    </style>
  </head><body>
    <h2>${clientName ? `Statement — ${clientName}` : "Statement"}</h2>
    <p>${fmtDate(start + "T00:00:00")} – ${fmtDate(end + "T00:00:00")}</p>
    <table><thead>${headerRow}</thead><tbody>${bodyRows}</tbody></table>
  </body></html>`;
}

export default function Statement({ groupId, clientName }) {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const fmt = d => d.toISOString().slice(0, 10);

  const [start, setStart] = useState(fmt(firstOfMonth));
  const [end, setEnd] = useState(fmt(today));
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ start, end });
    if (groupId) params.set("group_id", groupId);
    const res = await fetch(`/api/statement?${params}`).then(r => r.json()).catch(() => ({ error: "Network error" }));
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    setRows(res.rows || []);
  }, [groupId, start, end]);

  const handlePrint = () => {
    const win = window.open("", "_blank");
    win.document.write(buildPrintHtml(rows, clientName, start, end));
    win.document.close();
    win.focus();
    win.print();
  };

  const thStyle = { textAlign: "left", padding: "8px 7px", fontSize: 12, fontWeight: 600, color: C.muted, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" };
  const tdStyle = { padding: "8px 7px", fontSize: 13, color: C.text, borderBottom: `0.5px solid ${C.border}`, verticalAlign: "top" };
  const tdNum = { ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" };

  return (
    <div>
      {/* Controls */}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <label style={S.label}>From</label>
          <input style={{ ...S.input, width: 140, marginBottom: 0 }} type="date" value={start} onChange={e => setStart(e.target.value)} />
        </div>
        <div>
          <label style={S.label}>To</label>
          <input style={{ ...S.input, width: 140, marginBottom: 0 }} type="date" value={end} onChange={e => setEnd(e.target.value)} />
        </div>
        <button style={S.btn} onClick={load} disabled={loading}>
          {loading ? "Loading..." : "Load"}
        </button>
        {rows?.length > 0 && (
          <>
            <button style={S.btnSmOut} onClick={handlePrint}>Print</button>
            <button style={S.btnSmOut} onClick={() => downloadCSV(rows, clientName)}>Download CSV</button>
          </>
        )}
      </div>

      {error && <p style={{ color: "#c0392b", fontSize: 14 }}>{error}</p>}

      {rows !== null && (
        <div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>
              {clientName ? `Statement — ${clientName}` : "Statement"}
            </div>
            <div style={{ fontSize: 13, color: C.muted }}>
              {fmtDate(start + "T00:00:00")} – {fmtDate(end + "T00:00:00")}
            </div>
          </div>

          {rows.length === 0 ? (
            <p style={{ fontSize: 14, color: C.muted }}>No transactions in this period.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f7f7f5" }}>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Description</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Minutes</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id}>
                      <td style={tdStyle}>{fmtDate(r.date)}</td>
                      <td style={tdStyle}>{r.description}</td>
                      <td style={{ ...tdNum, color: r.delta_minutes > 0 ? C.teal : r.delta_minutes < 0 ? "#c0392b" : C.muted }}>
                        {fmtMins(r.delta_minutes)}
                      </td>
                      <td style={tdNum}>{fmtDollars(r.amount_cents)}</td>
                      <td style={{ ...tdNum, fontWeight: 500 }}>{r.balance_minutes} min</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
