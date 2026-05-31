"use client";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { C, S } from "@/lib/constants";
import Nav from "@/components/Nav";
import HomePage from "@/components/HomePage";
import AboutPage from "@/components/AboutPage";
import ContactPage from "@/components/ContactPage";
import LoginPage from "@/components/LoginPage";
import PrivacyPage from "@/components/PrivacyPage";
import TermsPage from "@/components/TermsPage";
import PortalHome from "@/components/portal/PortalHome";
import Documents from "@/components/portal/Documents";
import Schedule from "@/components/portal/Schedule";
import Messages from "@/components/portal/Messages";
import Profile from "@/components/portal/Profile";
import ClientIntake from "@/components/portal/ClientIntake";
import BuySessions from "@/components/portal/BuySessions";
import Admin from "@/components/portal/Admin";
import Clients from "@/components/portal/Clients";
import AdminCalendar from "@/components/portal/AdminCalendar";
import AdminSchedule from "@/components/portal/AdminSchedule";
import AdminSettings from "@/components/portal/AdminSettings";
import Groups from "@/components/portal/Groups";
import Statement from "@/components/portal/Statement";
import SessionActivity from "@/components/portal/SessionActivity";

export default function App() {
  const { user, profile, loading, refreshProfile } = useAuth();
  // When Google OAuth redirects back with ?google_connected=true, land on Admin
  // Settings so the admin sees the "Connected" state immediately.
  const [page, setPage] = useState(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("google_connected") === "true") return "Admin Settings";
      if (params.get("doc_share") || params.get("admin_doc")) return "Documents";
    }
    return "Home";
  });
  const [initialDocShareId] = useState(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("doc_share") || params.get("admin_doc") || null;
    }
    return null;
  });
  const [viewAsClient, setViewAsClient] = useState(null);
  const [groupDetailId, setGroupDetailId] = useState(null);
  const [adminStatementClient, setAdminStatementClient] = useState(null);
  const [adminSessionClient, setAdminSessionClient] = useState(null);
  const [profileFocus, setProfileFocus] = useState(null);
  const [bookingActive, setBookingActive] = useState(false);
  const inPortal = !!user;
  const isAdmin = profile?.role === "admin";
  const needsProfile = inPortal && profile && !profile.first_name;

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setPage("Home");
    setViewAsClient(null);
  };

  const handleViewAsClient = (client) => {
    setViewAsClient(client);
    setPage("Portal Home");
  };

  const exitViewAsClient = () => {
    setViewAsClient(null);
    setPage("Admin Clients");
  };

  const handleOpenGroup = (groupId) => {
    setGroupDetailId(groupId);
    setPage("Admin Groups");
  };

  const disclaimerFooter = (
    <div style={{ borderTop: `0.5px solid ${C.border}`, padding: "1rem 1.25rem", textAlign: "center" }}>
      <p style={{ fontSize: 13, color: C.hint, lineHeight: 1.6, maxWidth: 680, margin: "0 auto 0.75rem" }}>
        <strong>Disclaimer:</strong> Coaching Services only. Services will not be therapeutic, mental health or legal advice. No therapist-client or attorney-client relationship is created through coaching services.
      </p>
      <a href="/privacy" style={{ color: C.muted, fontSize: 13, padding: "4px 8px", textDecoration: "underline" }}>Privacy Policy</a>
      <span style={{ color: C.hint, fontSize: 13 }}>·</span>
      <a href="/terms" style={{ color: C.muted, fontSize: 13, padding: "4px 8px", textDecoration: "underline" }}>Terms &amp; Conditions</a>
    </div>
  );

  const portalDisclaimerFooter = (
    <div style={{ borderTop: `0.5px solid ${C.border}`, padding: "1rem 1.25rem", textAlign: "center" }}>
      <p style={{ fontSize: 13, color: C.hint, lineHeight: 1.6, maxWidth: 680, margin: "0 auto" }}>
        <strong>Disclaimer:</strong> Coaching Services only. Services will not be therapeutic, mental health or legal advice. No therapist-client or attorney-client relationship is created through coaching services.
      </p>
    </div>
  );

  const renderPage = () => {
    if (page === "Privacy") return <><PrivacyPage setPage={setPage} />{disclaimerFooter}</>;
    if (page === "Terms") return <><TermsPage setPage={setPage} />{disclaimerFooter}</>;
    if (!inPortal) {
      if (page === "Home") return <><HomePage setPage={setPage} />{disclaimerFooter}</>;
      if (page === "About") return <><AboutPage />{disclaimerFooter}</>;
      if (page === "Contact") return <><ContactPage />{disclaimerFooter}</>;
      return <><LoginPage setPage={setPage} initialPage={page !== "Home" ? page : undefined} />{disclaimerFooter}</>;
    }
    if (isAdmin && page === "Preview Intake") {
      return <ClientIntake preview onClosePreview={() => setPage("Admin Settings")} />;
    }
    // Block archived clients from accessing the portal
    if (inPortal && profile?.is_archived && !isAdmin) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem", gap: 16, textAlign: "center" }}>
          <p style={{ fontSize: 18, color: C.text, maxWidth: 400, margin: 0 }}>
            Your account has been deactivated. Please contact your coach for assistance.
          </p>
          <button onClick={handleLogout} style={{ ...S.btn, background: C.muted }}>Sign out</button>
        </div>
      );
    }
    // Force profile setup on first login
    if (needsProfile) {
      if (profile?.role === "client") {
        return <ClientIntake onComplete={() => { refreshProfile(); setPage("Portal Home"); setTimeout(() => window.scrollTo(0, 0), 0); }} />;
      }
      return <Profile onSaved={() => { refreshProfile(); setPage("Portal Home"); }} />;
    }
    if (page === "Profile") return <><Profile onSaved={refreshProfile} viewAsClient={viewAsClient} scrollTo={profileFocus} onScrolled={() => setProfileFocus(null)} />{portalDisclaimerFooter}</>;
    if (page === "Portal Home") return <><PortalHome setPage={setPage} viewAsClient={viewAsClient} setProfileFocus={setProfileFocus} />{portalDisclaimerFooter}</>;
    if (page === "Documents") return <><Documents viewAsClient={viewAsClient} initialShareId={initialDocShareId} />{portalDisclaimerFooter}</>;
    if (page === "Schedule") return <Schedule setPage={setPage} setProfileFocus={setProfileFocus} viewAsClient={viewAsClient} setBookingActive={setBookingActive} />;
    if (page === "Buy Sessions") return <><BuySessions setPage={setPage} setProfileFocus={setProfileFocus} viewAsClient={viewAsClient} />{portalDisclaimerFooter}</>;
    if (page === "Messages") return <Messages viewAsClient={viewAsClient} />;
    if (page === "Statement") return (
      <div style={{ minHeight: "calc(100vh - 64px)", padding: "2rem 1rem 5rem", maxWidth: 800, margin: "0 auto" }}>
        <h1 style={{ fontSize: 26, fontWeight: 600, color: "#2C2C2A", marginBottom: 4 }}>Statement</h1>
        <p style={{ fontSize: 15, color: "#5F5E5A", marginBottom: 24 }}>Your session and purchase history.</p>
        <Statement />
        {portalDisclaimerFooter}
      </div>
    );
    if (isAdmin && page === "Admin Schedule") return <AdminSchedule setPage={setPage} />;
    if (isAdmin && page === "Admin Calendar") return <AdminCalendar setPage={setPage} />;
    if (isAdmin && !viewAsClient) {
      if (page === "Admin") return <Admin setPage={setPage} />;
      if (page === "Admin Clients") return <Clients setPage={setPage} onViewAsClient={handleViewAsClient} onOpenGroup={handleOpenGroup} onViewStatement={(client) => { setAdminStatementClient(client); setPage("Admin Statement"); }} onViewSessions={(client) => { setAdminSessionClient(client); setPage("Admin Session Activity"); }} />;
      if (page === "Admin Statement" && adminStatementClient) return (
        <div style={{ minHeight: "calc(100vh - 64px)", padding: "2rem 1rem 5rem", maxWidth: 800, margin: "0 auto" }}>
          <button style={{ background: "none", border: "none", cursor: "pointer", color: "#4AAFA0", fontSize: 13, padding: 0, marginBottom: 12, fontFamily: "inherit" }} onClick={() => { setPage("Admin Clients"); setAdminStatementClient(null); }}>← Back to Clients</button>
          <h1 style={{ fontSize: 26, fontWeight: 600, color: "#2C2C2A", marginBottom: 4 }}>{adminStatementClient.first_name} {adminStatementClient.last_name} — Statement</h1>
          <p style={{ fontSize: 15, color: "#5F5E5A", marginBottom: 24 }}>Session and purchase history.</p>
          <Statement groupId={adminStatementClient.group_id} isAdmin={true} />
        </div>
      );
      if (page === "Admin Session Activity" && adminSessionClient) return (
        <div style={{ minHeight: "calc(100vh - 64px)", padding: "2rem 1rem 5rem", maxWidth: 1100, margin: "0 auto" }}>
          <button style={{ background: "none", border: "none", cursor: "pointer", color: "#4AAFA0", fontSize: 13, padding: 0, marginBottom: 12, fontFamily: "inherit" }} onClick={() => { setPage("Admin Clients"); setAdminSessionClient(null); }}>← Back to Clients</button>
          <h1 style={{ fontSize: 26, fontWeight: 600, color: "#2C2C2A", marginBottom: 4 }}>{adminSessionClient.first_name} {adminSessionClient.last_name} — Session Activity</h1>
          <p style={{ fontSize: 15, color: "#5F5E5A", marginBottom: 24 }}>All sessions for this client.</p>
          <SessionActivity clientId={adminSessionClient.id} />
        </div>
      );
      if (page === "Admin Groups") return <Groups setPage={setPage} initialGroupId={groupDetailId} onGroupOpened={() => setGroupDetailId(null)} />;
      if (page === "Admin Settings") return <AdminSettings setPage={setPage} />;
    }
    return <><PortalHome setPage={setPage} viewAsClient={viewAsClient} />{portalDisclaimerFooter}</>;
  };

  if (loading) return null;

  // When user logs in, redirect to portal if on a public page
  if (inPortal && !needsProfile && ["Home", "About", "Contact", "Login"].includes(page)) {
    setPage("Portal Home");
    return null;
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", background: "#fff", minHeight: "100vh" }}>
      {!needsProfile && <Nav page={page} setPage={setPage} inPortal={inPortal} onLogout={handleLogout} viewAsClient={viewAsClient} bookingActive={bookingActive} />}
      {viewAsClient && (
        <div style={{ padding:"8px 1rem", background:"#fdecea", borderBottom:"1px solid #e6b8b0", display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
          <span style={{ fontSize:13, color:"#c0392b", fontWeight:500 }}>
            Viewing as: {viewAsClient.first_name} {viewAsClient.last_name || ""} ({viewAsClient.email}) — Read only
          </span>
          <button onClick={exitViewAsClient} style={{ fontSize:12, padding:"4px 12px", borderRadius:6, border:"1px solid #c0392b", background:"#fff", color:"#c0392b", cursor:"pointer", fontFamily:"inherit", fontWeight:500 }}>
            Exit
          </button>
        </div>
      )}
      {renderPage()}
    </div>
  );
}
