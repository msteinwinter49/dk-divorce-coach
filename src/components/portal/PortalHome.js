"use client";
import { useState, useEffect } from "react";
import { C, S } from "@/lib/constants";
import { useIsMobile } from "@/lib/hooks";
import { useAuth } from "@/context/AuthContext";
import { createClient } from "@/lib/supabase/client";

export default function PortalHome({ setPage, viewAsClient }) {
  const mobile = useIsMobile();
  const { user, profile } = useAuth();
  const [nextBooking, setNextBooking] = useState(null);
  const [docCount, setDocCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);

  const targetId = viewAsClient?.id || user?.id;
  const targetProfile = viewAsClient || profile;

  useEffect(() => {
    if (!targetId) return;
    const supabase = createClient();
    const today = new Date().toISOString().split("T")[0];

    supabase.from("bookings")
      .select("date, time_slot")
      .eq("user_id", targetId)
      .eq("status", "confirmed")
      .gte("date", today)
      .order("date", { ascending: true })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) setNextBooking(data[0]);
      });

    supabase.from("documents")
      .select("id", { count: "exact", head: true })
      .eq("user_id", targetId)
      .then(({ count }) => setDocCount(count || 0));

    supabase.from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", targetId)
      .neq("sender_id", targetId)
      .then(({ count }) => setUnreadCount(count || 0));
  }, [targetId]);

  const displayName = targetProfile?.first_name || targetProfile?.full_name?.split(" ")[0] || "there";

  const formatBooking = () => {
    if (!nextBooking) return "No upcoming sessions";
    const d = new Date(nextBooking.date + "T00:00:00");
    const month = d.toLocaleString("en-US", { month: "short" });
    const day = d.getDate();
    return `Next: ${month} ${day}, ${nextBooking.time_slot}`;
  };

  return (
    <div style={S.page}>
      <div style={{ ...S.card, background:C.tealLight, border:`0.5px solid ${C.tealMid}`, marginBottom:"1.5rem" }}>
        <h2 style={{...S.h2, color:C.teal}}>Welcome back, {displayName}</h2>
        <p style={{...S.p, color:C.teal, marginBottom:0}}>
          {nextBooking
            ? <>Your next session with Diana is on <strong>{new Date(nextBooking.date + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" })} at {nextBooking.time_slot}</strong>. A video link will be sent to your email 30 minutes before.</>
            : "You have no upcoming sessions. Head to Schedule to book one."}
        </p>
      </div>
      <div style={{ display:"grid", gridTemplateColumns: mobile ? "1fr" : "repeat(2,1fr)", gap:12 }}>
        {[
          ["Documents", "Documents", `${docCount} file${docCount !== 1 ? "s" : ""} shared`],
          // Admin (not in view-as-client) gets the AdminSchedule page
          [profile?.role === "admin" && !viewAsClient ? "Admin Schedule" : "Schedule", "Schedule", formatBooking()],
          ["Messages", "Messages", `${unreadCount} message${unreadCount !== 1 ? "s" : ""}`],
          ["Buy Sessions", "Buy Sessions", "Purchase a package"],
        ].map(([target, label, d]) => (
          <div key={label} style={{ ...S.card, cursor:"pointer" }} onClick={() => setPage(target)}>
            <h3 style={{ ...S.h3, color:C.teal }}>{label}</h3>
            <p style={{ ...S.p, marginBottom:0, fontSize:13 }}>{d}</p>
          </div>
        ))}
      </div>
      <div style={{ ...S.card, marginTop:"0.5rem" }}>
        <h3 style={S.h3}>Your progress</h3>
        <p style={{...S.p, fontSize:14}}>Work with Diana to track your coaching milestones here.</p>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {["Coparenting plan","Communication tools","Child conversation guide","Legal prep checklist"].map(t => (
            <span key={t} style={{ fontSize:12, padding:"4px 12px", borderRadius:20, background:C.tealLight, color:C.teal, border:`0.5px solid ${C.tealMid}` }}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
