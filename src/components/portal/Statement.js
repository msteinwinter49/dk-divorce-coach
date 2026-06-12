"use client";
import { useState, useCallback } from "react";
import { C, S, SERVER_ERROR } from "@/lib/constants";
import { useError } from "@/context/ErrorContext";
import { retryFetch } from "@/lib/fetchUtils";

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

function downloadCSV(rows, groupName) {
  const header = ["Date", "Description", "Clients", "Amount", "Minutes", "Balance (min)"];
  const lines = rows.map(r => [
    `"${fmtDate(r.date)}"`,
    `"${r.description.replace(/"/g, '""')}"`,
    r.names?.length ? `"${r.names.join(", ")}"` : "",
    r.amount_cents != null ? (Math.abs(r.amount_cents) / 100).toFixed(2) : "",
    r.delta_minutes || 0,
    r.balance_minutes,
  ].join(","));
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `statement-${(groupName || "group").replace(/\s+/g, "-").toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function buildPrintHtml(rows, groupName, start, end, balanceForward) {
  const thL = "text-align:left;padding:8px 7px;font-size:12px;font-weight:600;color:#5F5E5A;border-bottom:1px solid rgba(0,0,0,0.1);background:#f7f7f5";
  const thR = "text-align:right;padding:8px 7px;font-size:12px;font-weight:600;color:#5F5E5A;border-bottom:1px solid rgba(0,0,0,0.1);background:#f7f7f5";

  const headerRow = `<tr>
    <th style="${thL}">Date</th>
    <th style="${thL}">Description</th>
    <th style="${thR}">Amount</th>
    <th style="${thR}">Minutes</th>
    <th style="${thR}">Balance</th>
  </tr>`;

  const forwardRow = balanceForward !== 0 ? `<tr>
    <td style="padding:8px 7px;font-size:13px;border-bottom:0.5px solid rgba(0,0,0,0.1)">${fmtDate(start + "T00:00:00")}</td>
    <td style="padding:8px 7px;font-size:13px;border-bottom:0.5px solid rgba(0,0,0,0.1);color:#5F5E5A;font-style:italic">Balance forward</td>
    <td style="padding:8px 7px;font-size:13px;text-align:right;border-bottom:0.5px solid rgba(0,0,0,0.1)"></td>
    <td style="padding:8px 7px;font-size:13px;text-align:right;border-bottom:0.5px solid rgba(0,0,0,0.1)"></td>
    <td style="padding:8px 7px;font-size:13px;text-align:right;font-weight:500;border-bottom:0.5px solid rgba(0,0,0,0.1)">${balanceForward} min</td>
  </tr>` : "";

  const bodyRows = rows.map(r => {
    const minColor = r.delta_minutes > 0 ? "#0F6E56" : r.delta_minutes < 0 ? "#c0392b" : "#5F5E5A";
    const nameStr = r.names?.length ? `<div style="font-size:11px;color:#5F5E5A;margin-top:2px">${r.names.join(", ")}</div>` : "";
    return `<tr>
      <td style="padding:8px 7px;font-size:13px;border-bottom:0.5px solid rgba(0,0,0,0.1)">${fmtDate(r.date)}</td>
      <td style="padding:8px 7px;font-size:13px;border-bottom:0.5px solid rgba(0,0,0,0.1)">${r.description}${nameStr}</td>
      <td style="padding:8px 7px;font-size:13px;text-align:right;border-bottom:0.5px solid rgba(0,0,0,0.1)">${fmtDollars(r.amount_cents)}</td>
      <td style="padding:8px 7px;font-size:13px;text-align:right;border-bottom:0.5px solid rgba(0,0,0,0.1);color:${minColor}">${fmtMins(r.delta_minutes)}</td>
      <td style="padding:8px 7px;font-size:13px;text-align:right;font-weight:500;border-bottom:0.5px solid rgba(0,0,0,0.1)">${r.balance_minutes} min</td>
    </tr>`;
  }).join("");

  const title = groupName ? `Statement — ${groupName}` : "Statement";
  const dateRange = `${fmtDate(start + "T00:00:00")} – ${fmtDate(end + "T00:00:00")}`;

  const thead = `<thead>
    <tr><td colspan="5" style="padding:10px 7px 2px;font-size:16px;font-weight:700;text-align:center;background:#fff">DK Divorce Coach</td></tr>
    <tr><td colspan="5" style="padding:2px 7px;font-size:13px;font-weight:600;background:#fff">${title}</td></tr>
    <tr><td colspan="5" style="padding:2px 7px 10px;font-size:12px;color:#5F5E5A;border-bottom:1px solid rgba(0,0,0,0.15);background:#fff">${dateRange}</td></tr>
    ${headerRow}
  </thead>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Statement</title>
    <style>* { box-sizing: border-box; } @page { margin: 0.25in; } body { font-family: system-ui, sans-serif; color: #2C2C2A; margin: 0; padding: 0; } table { width: 100%; border-collapse: collapse; } thead { display: table-header-group; }</style>
  </head><body>
    <table>${thead}<tbody>${forwardRow}${bodyRows}</tbody></table>
  </body></html>`;
}

export default function Statement({ groupId }) {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const fmt = d => d.toISOString().slice(0, 10);

  const [start, setStart] = useState(fmt(firstOfMonth));
  const [end, setEnd] = useState(fmt(today));
  const [rows, setRows] = useState(null);
  const [groupName, setGroupName] = useState(null);
  const [balanceForward, setBalanceForward] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { setServerError } = useError();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ start, end });
    if (groupId) params.set("group_id", groupId);
    try {
      const res = await retryFetch(`/api/statement?${params}`);
      setLoading(false);
      if (!res.ok) {
        if (res.status >= 500) { setServerError(SERVER_ERROR); return; }
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Something went wrong");
        return;
      }
      const data = await res.json();
      setGroupName(data.group_name || null);
      setBalanceForward(data.balance_forward ?? 0);
      setRows(data.rows || []);
    } catch {
      setLoading(false);
      setServerError(SERVER_ERROR);
    }
  }, [groupId, start, end]);

  const handlePrint = () => {
    const win = window.open("", "_blank");
    win.document.write(buildPrintHtml(rows, groupName, start, end, balanceForward));
    win.document.close();
    win.focus();
    win.print();
  };

  const thStyle = { textAlign: "left", padding: "8px 7px", fontSize: 12, fontWeight: 600, color: C.muted, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", background: "#f7f7f5" };
  const tdStyle = { padding: "8px 7px", fontSize: 13, color: C.text, borderBottom: `0.5px solid ${C.border}`, verticalAlign: "top" };
  const tdNum = { ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" };
  const tblStyle = { width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" };
  const colGroup = (
    <colgroup>
      <col style={{ width: "14%" }} />
      <col style={{ width: "44%" }} />
      <col style={{ width: "14%" }} />
      <col style={{ width: "14%" }} />
      <col style={{ width: "14%" }} />
    </colgroup>
  );

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
            <button style={S.btnSmOut} onClick={() => downloadCSV(rows, groupName)}>Download CSV</button>
          </>
        )}
      </div>

      {error && <p style={{ color: "#c0392b", fontSize: 14 }}>{error}</p>}

      {rows !== null && (
        <div>
          <div style={{ position: "sticky", top: "var(--nav-height, 56px)", zIndex: 5, background: "#fff" }}>
            <div style={{ paddingTop: 8, paddingBottom: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>
                {groupName ? `Statement — ${groupName}` : "Statement"}
              </div>
              <div style={{ fontSize: 13, color: C.muted }}>
                {fmtDate(start + "T00:00:00")} – {fmtDate(end + "T00:00:00")}
              </div>
            </div>
            {rows.length > 0 && (
              <table style={tblStyle}>
                {colGroup}
                <thead>
                  <tr>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Description</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Minutes</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Balance</th>
                  </tr>
                </thead>
              </table>
            )}
          </div>

          {rows.length === 0 ? (
            <p style={{ fontSize: 14, color: C.muted }}>No transactions in this period.</p>
          ) : (
            <table style={tblStyle}>
              {colGroup}
              <tbody>
                {balanceForward !== 0 && (
                  <tr>
                    <td style={tdStyle}>{fmtDate(start + "T00:00:00")}</td>
                    <td style={{ ...tdStyle, color: C.muted, fontStyle: "italic" }}>Balance forward</td>
                    <td style={tdNum} />
                    <td style={tdNum} />
                    <td style={{ ...tdNum, fontWeight: 500 }}>{balanceForward} min</td>
                  </tr>
                )}
                {rows.map(r => (
                  <tr key={r.id}>
                    <td style={tdStyle}>{fmtDate(r.date)}</td>
                    <td style={tdStyle}>
                      <div>{r.description}</div>
                      {r.names?.length > 0 && (
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{r.names.join(", ")}</div>
                      )}
                    </td>
                    <td style={tdNum}>{fmtDollars(r.amount_cents)}</td>
                    <td style={{ ...tdNum, color: r.delta_minutes > 0 ? C.teal : r.delta_minutes < 0 ? "#c0392b" : C.muted }}>
                      {fmtMins(r.delta_minutes)}
                    </td>
                    <td style={{ ...tdNum, fontWeight: 500 }}>{r.balance_minutes} min</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
