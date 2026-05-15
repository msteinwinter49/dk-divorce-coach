"use client";
import { useState } from "react";
import { C, S } from "@/lib/constants";
import { useIsMobile, useIsNarrow } from "@/lib/hooks";
import { useAuth } from "@/context/AuthContext";

export default function Nav({ page, setPage, inPortal, onLogout, viewAsClient }) {
  const mobile = useIsMobile();
  const narrow = useIsNarrow();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const [menuOpen, setMenuOpen] = useState(false);

  const clientLinks = [
    ["Portal Home","Home"],
    ["Documents","Docs"],
    ["Schedule","Schedule"],
    ["Messages","Messages"],
    ["Statement","Statement"],
  ];

  const portalLinks = viewAsClient ? [
    ...clientLinks,
    ["Profile","Profile"],
  ] : [
    ...(isAdmin ? clientLinks.map(l => l[0] === "Schedule" ? ["Admin Schedule","Schedule"] : l) : clientLinks),
    ["Profile","Profile"],
    ...(isAdmin ? [["Admin","Admin"]] : []),
  ];

  const isActive = (p) => page === p || (p === "Admin" && page.startsWith("Admin") && page !== "Admin Calendar" && page !== "Admin Schedule");

  const closeMenu = () => setMenuOpen(false);

  // Hamburger icon
  const Hamburger = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <line x1="3" y1="6" x2="21" y2="6" stroke={C.text} strokeWidth="2" strokeLinecap="round"/>
      <line x1="3" y1="12" x2="21" y2="12" stroke={C.text} strokeWidth="2" strokeLinecap="round"/>
      <line x1="3" y1="18" x2="21" y2="18" stroke={C.text} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );

  // Close (X) icon
  const Close = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <line x1="4" y1="4" x2="20" y2="20" stroke={C.text} strokeWidth="2" strokeLinecap="round"/>
      <line x1="20" y1="4" x2="4" y2="20" stroke={C.text} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );

  // Narrow portal nav: phones + tablets (< 1024px) when in portal
  if (narrow && inPortal) return (
    <>
      <nav style={{ borderBottom: `0.5px solid ${C.border}`, background: "#fff", position: "sticky", top: 0, zIndex: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 1rem", height: 44, position: "relative" }}>
          {/* Left: logo on tablet, invisible spacer on phone for balance */}
          {!mobile ? (
            <div style={S.logo} onClick={() => { onLogout(); setPage("Home"); }}>
              <span style={S.logoMain}>DK Divorce Coach</span>
              <span style={S.logoSub}>DIANA KIEREIN · CDC</span>
            </div>
          ) : (
            <div style={{ width: 38 }} />
          )}
          {/* Centered title */}
          <span style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", fontSize: 20, fontWeight: 600, color: C.teal, pointerEvents: "none", whiteSpace: "nowrap" }}>
            Client Portal
          </span>
          {/* Right: hamburger */}
          <button
            onClick={() => setMenuOpen(o => !o)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            style={{ background: "none", border: "none", cursor: "pointer", padding: "8px 0", lineHeight: 0, flexShrink: 0 }}
          >
            {menuOpen ? <Close /> : <Hamburger />}
          </button>
        </div>
      </nav>
      {menuOpen && (
        <>
          <div
            onClick={closeMenu}
            style={{ position: "fixed", inset: 0, top: 44, background: "rgba(0,0,0,0.3)", zIndex: 19 }}
          />
          <div style={{ position: "fixed", top: 44, right: "1rem", width: "max-content", background: "#fff", zIndex: 20, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", borderRadius: 8, overflow: "hidden" }}>
            {portalLinks.map(([p]) => (
              <button key={p}
                onClick={() => { setPage(p); closeMenu(); }}
                style={{
                  display: "block", width: "100%", padding: "13px 15px",
                  fontSize: 15, fontFamily: "inherit", border: "none",
                  borderBottom: `0.5px solid ${C.border}`,
                  background: isActive(p) ? C.tealLight : "none",
                  color: isActive(p) ? C.teal : C.text,
                  fontWeight: isActive(p) ? 600 : 400, cursor: "pointer", textAlign: "left",
                  boxSizing: "border-box",
                }}>
                {p}
              </button>
            ))}
            <button
              onClick={() => { onLogout(); setPage("Home"); closeMenu(); }}
              style={{
                display: "block", width: "100%", padding: "13px 15px",
                fontSize: 15, fontFamily: "inherit", border: "none", background: "none",
                color: C.muted, cursor: "pointer", textAlign: "left", boxSizing: "border-box",
              }}>
              Log out
            </button>
          </div>
        </>
      )}
    </>
  );

  // Mobile public nav (< 768px, not in portal)
  if (mobile) return (
    <nav style={{ borderBottom: `0.5px solid ${C.border}`, background: "#fff", position: "sticky", top: 0, zIndex: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 1rem", height: 44 }}>
        <div style={S.logo} onClick={() => setPage("Home")}>
          <span style={S.logoMain}>DK Divorce Coach</span>
        </div>
      </div>
      <div style={{ display: "flex", borderTop: `0.5px solid ${C.border}` }}>
        {[["Home","Home"],["About","About"],["Contact","Contact"],["Login","Login"]].map(([l,p]) => (
          <button key={l} onClick={() => setPage(p)}
            style={{ flex: 1, padding: "10px 4px", fontSize: 12, fontFamily: "inherit", border: "none",
              borderBottom: isActive(p) ? `2px solid ${C.teal}` : "2px solid transparent",
              background: "none", color: isActive(p) ? C.teal : C.muted,
              fontWeight: isActive(p) ? 500 : 400, cursor: "pointer" }}>
            {l}
          </button>
        ))}
      </div>
    </nav>
  );

  // Desktop nav (>= 1024px, or tablet on public pages)
  return (
    <nav style={{ ...S.nav, position: "sticky" }}>
      <div style={S.logo} onClick={() => { onLogout(); setPage("Home"); }}>
        <span style={S.logoMain}>DK Divorce Coach</span>
        <span style={S.logoSub}>DIANA KIEREIN · CDC</span>
      </div>
      {inPortal && (
        <span style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", fontSize: 32, fontWeight: 600, color: C.teal, pointerEvents: "none", whiteSpace: "nowrap" }}>
          Client Portal
        </span>
      )}
      <div style={S.navLinks}>
        {!inPortal ? (
          <>
            {["Home","About","Contact"].map(l => (
              <button key={l} style={{ ...S.navLink, ...(page === l ? S.navLinkActive : {}) }} onClick={() => setPage(l)}>{l}</button>
            ))}
            <button style={S.btnSm} onClick={() => setPage("Login")}>Client Login</button>
          </>
        ) : (
          <>
            {portalLinks.map(([p,l]) => (
              <button key={p} style={{ ...S.navLink, ...(isActive(p) ? S.navLinkActive : {}) }} onClick={() => setPage(p)}>{l}</button>
            ))}
            <button style={S.btnSmOut} onClick={() => { onLogout(); setPage("Home"); }}>Log out</button>
          </>
        )}
      </div>
    </nav>
  );
}
