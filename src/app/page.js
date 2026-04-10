"use client";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { C } from "@/lib/constants";
import Nav from "@/components/Nav";
import HomePage from "@/components/HomePage";
import AboutPage from "@/components/AboutPage";
import ContactPage from "@/components/ContactPage";
import LoginPage from "@/components/LoginPage";
import PortalHome from "@/components/portal/PortalHome";
import Documents from "@/components/portal/Documents";
import Schedule from "@/components/portal/Schedule";
import Messages from "@/components/portal/Messages";
import Profile from "@/components/portal/Profile";
import Admin from "@/components/portal/Admin";
import Clients from "@/components/portal/Clients";
import AdminCalendar from "@/components/portal/AdminCalendar";
import AdminSchedule from "@/components/portal/AdminSchedule";
import AdminSettings from "@/components/portal/AdminSettings";

export default function App() {
  const { user, profile, loading, refreshProfile } = useAuth();
  // When Google OAuth redirects back with ?google_connected=true, land on Admin
  // Settings so the admin sees the "Connected" state immediately.
  const [page, setPage] = useState(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("google_connected") === "true") return "Admin Settings";
    }
    return "Home";
  });
  const [viewAsClient, setViewAsClient] = useState(null);
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

  const renderPage = () => {
    if (!inPortal) {
      if (page === "Home") return <HomePage setPage={setPage} />;
      if (page === "About") return <AboutPage />;
      if (page === "Contact") return <ContactPage />;
      return <LoginPage setPage={setPage} />;
    }
    // Force profile setup on first login
    if (needsProfile) {
      return <Profile onSaved={() => { refreshProfile(); setPage("Portal Home"); }} />;
    }
    if (page === "Profile") return <Profile onSaved={refreshProfile} viewAsClient={viewAsClient} />;
    if (page === "Portal Home") return <PortalHome setPage={setPage} viewAsClient={viewAsClient} />;
    if (page === "Documents") return <Documents viewAsClient={viewAsClient} />;
    if (page === "Schedule") return <Schedule viewAsClient={viewAsClient} />;
    if (page === "Messages") return <Messages viewAsClient={viewAsClient} />;
    if (isAdmin && page === "Admin Schedule") return <AdminSchedule setPage={setPage} />;
    if (isAdmin && page === "Admin Calendar") return <AdminCalendar setPage={setPage} />;
    if (isAdmin && !viewAsClient) {
      if (page === "Admin") return <Admin setPage={setPage} />;
      if (page === "Admin Clients") return <Clients setPage={setPage} onViewAsClient={handleViewAsClient} />;
      if (page === "Admin Settings") return <AdminSettings setPage={setPage} />;
    }
    return <PortalHome setPage={setPage} viewAsClient={viewAsClient} />;
  };

  if (loading) return null;

  // When user logs in, redirect to portal if on a public page
  if (inPortal && !needsProfile && ["Home", "About", "Contact", "Login"].includes(page)) {
    setPage("Portal Home");
    return null;
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", background: "#fff", minHeight: "100vh" }}>
      <Nav page={page} setPage={setPage} inPortal={inPortal && !needsProfile} onLogout={handleLogout} viewAsClient={viewAsClient} />
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
      {inPortal && !needsProfile && !viewAsClient && profile?.first_name && (
        <div style={{ padding:"6px 1rem", background:C.warm, borderBottom:`0.5px solid ${C.warmBorder}`, fontSize:13, color:C.muted }}>
          Account Holder: {profile.first_name}
        </div>
      )}
      {renderPage()}
    </div>
  );
}
