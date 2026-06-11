"use client";
import { useState, useEffect } from "react";
import { C, S } from "@/lib/constants";
import { useIsMobile } from "@/lib/hooks";

export default function Admin({ setPage }) {
  const mobile = useIsMobile();

  const links = [
    {
      page: "Admin Clients",
      title: "Clients",
      desc: "View, search, and invite clients",
    },
    {
      page: "Admin Groups",
      title: "Groups",
      desc: "Manage groups, balances, and rates",
    },
    {
      page: "Admin Settings",
      title: "Settings",
      desc: "Configure site and account settings",
    },
  ];

  const [alerts, setAlerts] = useState([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState({});
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    fetch("/api/system-alerts")
      .then(r => r.ok ? r.json() : { alerts: [] })
      .then(d => { setAlerts(d.alerts || []); setAlertsLoading(false); })
      .catch(() => setAlertsLoading(false));
  }, []);

  const markAllRead = async () => {
    setMarking(true);
    await fetch("/api/system-alerts", { method: "PATCH" });
    setAlerts(a => a.map(x => ({ ...x, acknowledged: true })));
    setMarking(false);
  };

  const unread = alerts.filter(a => !a.acknowledged).length;

  const fmtTs = (ts) => new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });

  return (
    <div style={S.page}>
      <h1 style={{...S.h1, fontSize:26}}>Admin</h1>
      <p style={S.p}>Manage your coaching practice.</p>
      <div style={{ display:"grid", gridTemplateColumns: mobile ? "1fr" : "repeat(3,1fr)", gap:12, marginBottom:16 }}>
        {links.map(l => (
          <div key={l.page} style={{ ...S.card, cursor:"pointer" }} onClick={() => setPage(l.page)}>
            <h3 style={{ ...S.h3, color:C.teal }}>{l.title}</h3>
            <p style={{ ...S.p, marginBottom:0, fontSize:13 }}>{l.desc}</p>
          </div>
        ))}
      </div>

      {/* System Alerts card */}
      <div style={S.card}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <h3 style={{ ...S.h3, marginBottom:0 }}>System Alerts</h3>
            {unread > 0 && (
              <span style={{ background:"#c0392b", color:"#fff", borderRadius:10, fontSize:11, fontWeight:700, padding:"2px 7px", lineHeight:1.4 }}>{unread}</span>
            )}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                disabled={marking}
                style={{ background:"none", border:"none", cursor:"pointer", fontSize:13, color:C.teal, padding:0 }}
              >
                {marking ? "Marking..." : "Mark all read"}
              </button>
            )}
            <a
              href="/api/system-alerts?format=csv"
              style={{ fontSize:13, color:C.teal, textDecoration:"none" }}
            >
              Export CSV
            </a>
          </div>
        </div>

        {alertsLoading ? (
          <p style={{ fontSize:13, color:C.muted, marginBottom:0 }}>Loading...</p>
        ) : alerts.length === 0 ? (
          <p style={{ fontSize:13, color:C.muted, marginBottom:0 }}>No alerts.</p>
        ) : (
          <div style={{ maxHeight:360, overflowY:"auto" }}>
            {alerts.map(alert => (
              <div
                key={alert.id}
                style={{
                  display:"flex",
                  gap:10,
                  paddingTop:8,
                  paddingBottom:8,
                  borderBottom:`0.5px solid ${C.border}`,
                  opacity: alert.acknowledged ? 0.5 : 1,
                }}
              >
                {/* Left: unread dot */}
                <div style={{ flexShrink:0, width:7 }}>
                  {!alert.acknowledged && (
                    <div style={{ width:7, height:7, borderRadius:"50%", background:"#c0392b", marginTop:5 }} />
                  )}
                </div>

                {/* Right: content */}
                <div style={{ flex:1, minWidth:0 }}>
                  {/* Top row: meta + summary */}
                  <div style={{ fontSize:12, color:C.muted, lineHeight:1.6 }}>
                    <span style={{ marginRight:6 }}>{fmtTs(alert.created_at)}</span>
                    {alert.category && (
                      <span style={{ background:"#e0f4f4", color:C.teal, borderRadius:4, padding:"1px 5px", fontSize:12, marginRight:6 }}>{alert.category}</span>
                    )}
                    {alert.action && (
                      <span style={{ marginRight:6 }}>{alert.action}</span>
                    )}
                    {alert.resource && (
                      <span style={{ marginRight:6 }}>{alert.resource}</span>
                    )}
                    {alert.summary && (
                      <span style={{ fontWeight:700, fontSize:14, color:C.text }}>{alert.summary}</span>
                    )}
                  </div>

                  {/* Error detail */}
                  {alert.error_detail && (
                    <div style={{ marginTop:2 }}>
                      <div style={{
                        fontSize:12,
                        color:"#c0392b",
                        wordBreak:"break-word",
                        ...(expandedIds[alert.id] ? {} : { overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }),
                      }}>
                        {alert.error_detail}
                      </div>
                      {alert.error_detail.length > 80 && (
                        <button
                          onClick={() => setExpandedIds(prev => ({ ...prev, [alert.id]: !prev[alert.id] }))}
                          style={{ background:"none", border:"none", cursor:"pointer", fontSize:11, color:C.teal, padding:0, marginTop:2 }}
                        >
                          {expandedIds[alert.id] ? "Show less" : "Show more"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
