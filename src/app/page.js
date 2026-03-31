"use client";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { createClient } from "@/lib/supabase/client";
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
import AdminSettings from "@/components/portal/AdminSettings";

export default function App() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const [page, setPage] = useState("Home");
  const inPortal = !!user;
  const isAdmin = profile?.role === "admin";
  const needsProfile = inPortal && profile && !profile.first_name;

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setPage("Home");
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
    if (page === "Profile") return <Profile onSaved={refreshProfile} />;
    if (page === "Portal Home") return <PortalHome setPage={setPage} />;
    if (page === "Documents") return <Documents />;
    if (page === "Schedule") return <Schedule />;
    if (page === "Messages") return <Messages />;
    if (isAdmin) {
      if (page === "Admin") return <Admin setPage={setPage} />;
      if (page === "Admin Clients") return <Clients setPage={setPage} />;
      if (page === "Admin Calendar") return <AdminCalendar setPage={setPage} />;
      if (page === "Admin Settings") return <AdminSettings setPage={setPage} />;
    }
    return <PortalHome setPage={setPage} />;
  };

  if (loading) return null;

  // When user logs in, redirect to portal if on a public page
  if (inPortal && !needsProfile && ["Home", "About", "Contact", "Login"].includes(page)) {
    setPage("Portal Home");
    return null;
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", background: "#fff", minHeight: "100vh" }}>
      <Nav page={page} setPage={setPage} inPortal={inPortal && !needsProfile} onLogout={handleLogout} />
      {renderPage()}
    </div>
  );
}
