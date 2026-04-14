"use client";
import { C, S } from "@/lib/constants";
import { useIsMobile } from "@/lib/hooks";
import { useAuth } from "@/context/AuthContext";

export default function Nav({ page, setPage, inPortal, onLogout, viewAsClient }) {
  const mobile = useIsMobile();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const clientLinks = [
    ["Portal Home","Home"],
    ["Documents","Docs"],
    ["Schedule","Schedule"],
    ["Messages","Messages"],
  ];

  const portalLinks = viewAsClient ? [
    ...clientLinks,
    ["Profile","Profile"],
  ] : [
    // Admin sees "Schedule" routing to AdminSchedule (not the client Schedule)
    ...(isAdmin ? clientLinks.map(l => l[0] === "Schedule" ? ["Admin Schedule","Schedule"] : l) : clientLinks),
    ["Profile","Profile"],
    ...(isAdmin ? [["Admin","Admin"]] : []),
  ];

  const isActive = (p) => page === p || (p === "Admin" && page.startsWith("Admin") && page !== "Admin Calendar" && page !== "Admin Schedule");

  if (mobile) return (
    <nav style={{ borderBottom:`0.5px solid ${C.border}`, background:"#fff", position:"sticky", top:0, zIndex:10 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 1rem", height:44, position:"relative" }}>
        <div style={S.logo} onClick={() => { onLogout(); setPage("Home"); }}>
          <span style={S.logoMain}>DK Divorce Coach</span>
        </div>
        {inPortal && (
          <span style={{ position:"absolute", left:"50%", top:"50%", transform:"translate(-50%, -50%)", fontSize:26, fontWeight:600, color:C.teal, pointerEvents:"none", whiteSpace:"nowrap" }}>
            Client Portal
          </span>
        )}
        {inPortal && <button style={S.btnSmOut} onClick={() => { onLogout(); setPage("Home"); }}>Log out</button>}
      </div>
      <div style={{ display:"flex", borderTop:`0.5px solid ${C.border}` }}>
        {!inPortal ? (
          [["Home","Home"],["About","About"],["Contact","Contact"],["Login","Login"]].map(([l,p]) => (
            <button key={l} onClick={() => setPage(p)}
              style={{ flex:1, padding:"10px 4px", fontSize:12, fontFamily:"inherit", border:"none",
                borderBottom: isActive(p) ? `2px solid ${C.teal}` : "2px solid transparent",
                background:"none", color: isActive(p) ? C.teal : C.muted,
                fontWeight: isActive(p) ? 500 : 400, cursor:"pointer" }}>
              {l}
            </button>
          ))
        ) : (
          portalLinks.map(([p,l]) => (
            <button key={p} onClick={() => setPage(p)}
              style={{ flex:1, padding:"10px 4px", fontSize:12, fontFamily:"inherit", border:"none",
                borderBottom: isActive(p) ? `2px solid ${C.teal}` : "2px solid transparent",
                background:"none", color: isActive(p) ? C.teal : C.muted,
                fontWeight: isActive(p) ? 500 : 400, cursor:"pointer" }}>
              {l}
            </button>
          ))
        )}
      </div>
    </nav>
  );

  return (
    <nav style={{ ...S.nav, position: "sticky" }}>
      <div style={S.logo} onClick={() => { onLogout(); setPage("Home"); }}>
        <span style={S.logoMain}>DK Divorce Coach</span>
        <span style={S.logoSub}>DIANA KIEREIN · CDC</span>
      </div>
      {inPortal && (
        <span style={{ position:"absolute", left:"50%", top:"50%", transform:"translate(-50%, -50%)", fontSize:32, fontWeight:600, color:C.teal, pointerEvents:"none", whiteSpace:"nowrap" }}>
          Client Portal
        </span>
      )}
      <div style={S.navLinks}>
        {!inPortal ? (
          <>
            {["Home","About","Contact"].map(l => (
              <button key={l} style={{...S.navLink,...(page===l?S.navLinkActive:{})}} onClick={() => setPage(l)}>{l}</button>
            ))}
            <button style={S.btnSm} onClick={() => setPage("Login")}>Client Login</button>
          </>
        ) : (
          <>
            {portalLinks.map(([p,l]) => (
              <button key={p} style={{...S.navLink,...(isActive(p)?S.navLinkActive:{})}} onClick={() => setPage(p)}>{l}</button>
            ))}
            <button style={S.btnSmOut} onClick={() => { onLogout(); setPage("Home"); }}>Log out</button>
          </>
        )}
      </div>
    </nav>
  );
}
