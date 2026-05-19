"use client";
import { useState, useEffect } from "react";
import { C, S } from "@/lib/constants";
import { useIsMobile } from "@/lib/hooks";
import { useAuth } from "@/context/AuthContext";
import { createClient } from "@/lib/supabase/client";

export default function PortalHome({ setPage, viewAsClient, setProfileFocus }) {
  const mobile = useIsMobile();
  const { user, profile } = useAuth();
  const [nextBooking, setNextBooking] = useState(null);
  const [requestedCount, setRequestedCount] = useState(0);
  const [adminStats, setAdminStats] = useState(null);
  const [docCount, setDocCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [balanceMinutes, setBalanceMinutes] = useState(null);
  const [hasCard, setHasCard] = useState(null);

  const targetId = viewAsClient?.id || user?.id;
  const targetProfile = viewAsClient || profile;
  const isAdmin = profile?.role === "admin" && !viewAsClient;

  useEffect(() => {
    if (!targetId) return;
    const supabase = createClient();
    const today = new Date();
    const todayStr = today.toLocaleDateString("en-CA");

    if (isAdmin) {
      const in28d = new Date(today);
      in28d.setDate(in28d.getDate() + 28);
      const end28dStr = in28d.toLocaleDateString("en-CA");

      Promise.all([
        fetch(`/api/bookings?start=${encodeURIComponent(today.toISOString())}&end=${end28dStr}`).then(r => r.json()).catch(() => []),
        fetch(`/api/calendar/events?start=${todayStr}&end=${end28dStr}`).then(r => r.json()).catch(() => ({})),
      ]).then(([bookingsData, eventsData]) => {
        const bookings = Array.isArray(bookingsData) ? bookingsData : [];
        const events = Array.isArray(eventsData) ? eventsData : (eventsData?.events || []);

        const w1 = { booked: 0, requested: 0, sp: 0 };
        const w2 = { booked: 0, requested: 0, sp: 0 };
        const w3 = { booked: 0, requested: 0, sp: 0 };
        const w4 = { booked: 0, requested: 0, sp: 0 };
        const tDate = new Date(todayStr + "T12:00:00");

        bookings.forEach(b => {
          const diff = Math.round((new Date(b.date + "T12:00:00") - tDate) / 86400000);
          const key = b.status === "booked" ? "booked" : b.status === "requested" ? "requested" : null;
          if (!key || diff < 0 || diff > 28) return;
          if (diff <= 7)       w1[key]++;
          else if (diff <= 14) w2[key]++;
          else if (diff <= 21) w3[key]++;
          else                 w4[key]++;
        });

        events.forEach(ev => {
          if (ev._type !== "sp" || !ev.start?.dateTime) return;
          const eLocalDate = new Date(ev.start.dateTime).toLocaleDateString("en-CA");
          const diff = Math.round((new Date(eLocalDate + "T12:00:00") - tDate) / 86400000);
          if (diff < 0 || diff > 28) return;
          if (diff <= 7)       w1.sp++;
          else if (diff <= 14) w2.sp++;
          else if (diff <= 21) w3.sp++;
          else                 w4.sp++;
        });

        setAdminStats({ w1, w2, w3, w4 });
      });
    } else {
      const in12mo = new Date(today);
      in12mo.setFullYear(in12mo.getFullYear() + 1);
      const end12moStr = in12mo.toLocaleDateString("en-CA");

      supabase.from("bookings")
        .select("date, time_slot")
        .eq("user_id", targetId)
        .eq("status", "booked")
        .gte("date", todayStr)
        .lte("date", end12moStr)
        .order("date", { ascending: true })
        .limit(1)
        .then(({ data }) => {
          if (data && data.length > 0) setNextBooking(data[0]);
        });

      supabase.from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("user_id", targetId)
        .eq("status", "requested")
        .gte("date", todayStr)
        .lte("date", end12moStr)
        .then(({ count }) => setRequestedCount(count || 0));
    }

    supabase.from("documents")
      .select("id", { count: "exact", head: true })
      .eq("user_id", targetId)
      .then(({ count }) => setDocCount(count || 0));

    const balUrl = viewAsClient ? `/api/purchases?client_id=${targetId}` : "/api/purchases";
    fetch(balUrl).then(r => r.json()).then(b => setBalanceMinutes(b?.balance_minutes ?? 0)).catch(() => {});

    supabase.from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", targetId)
      .neq("sender_id", targetId)
      .then(({ count }) => setUnreadCount(count || 0));

    if (!viewAsClient && targetProfile?.role === "client") {
      fetch("/api/stripe/card").then(r => r.json()).then(d => setHasCard(!!d.card)).catch(() => setHasCard(false));
    }
  }, [targetId]);

  const displayName = targetProfile?.first_name || targetProfile?.full_name?.split(" ")[0] || "there";
  const showCardBanner = !viewAsClient && targetProfile?.role === "client" && hasCard === false;

  const formatBooking = () => {
    if (!nextBooking) {
      if (requestedCount > 0) return `No booked sessions · ${requestedCount} pending request${requestedCount !== 1 ? "s" : ""}`;
      return "No upcoming sessions";
    }
    const d = new Date(nextBooking.date + "T00:00:00");
    const month = d.toLocaleString("en-US", { month: "short" });
    const day = d.getDate();
    const base = `Next: ${month} ${day}, ${nextBooking.time_slot}`;
    if (requestedCount > 0) return `${base} · ${requestedCount} pending request${requestedCount !== 1 ? "s" : ""}`;
    return base;
  };

  const adminScheduleDesc = () => {
    if (!adminStats) return "Loading...";
    return (
      <div>
        {[["1w", adminStats.w1], ["2w", adminStats.w2], ["3w", adminStats.w3], ["4w", adminStats.w4]].map(([label, stat]) => (
          <div key={label} style={{ display: "flex", gap: 8, fontSize: 13, color: C.text, marginBottom: 2 }}>
            <span style={{ color: C.muted, width: 24, flexShrink: 0 }}>{label}</span>
            <span>{stat.booked} session{stat.booked !== 1 ? "s" : ""} · {stat.requested} request{stat.requested !== 1 ? "s" : ""} · {stat.sp} SP</span>
          </div>
        ))}
      </div>
    );
  };

  const scheduleTarget = isAdmin ? "Admin Schedule" : "Schedule";
  const scheduleLabel = isAdmin ? "Schedule" : "Schedule";
  const scheduleDesc = isAdmin ? adminScheduleDesc() : formatBooking();

  return (
    <div style={S.page}>
      {showCardBanner && (
        <div
          onClick={() => { setProfileFocus("payment"); setPage("Profile"); }}
          style={{ background:"#fff8e1", border:"1px solid #ffe082", borderRadius:8, padding:"0.75rem 1rem", marginBottom:"1rem", fontSize:14, color:C.text, lineHeight:1.5, cursor:"pointer" }}
        >
          To book a session, you must have a valid credit card on file.<br />
          Click to enter a Payment Method on your Profile page.
        </div>
      )}
      <div style={{ ...S.card, background:C.tealLight, border:`0.5px solid ${C.tealMid}`, marginBottom:"1.5rem" }}>
        <h2 style={{...S.h2, color:C.teal}}>Welcome back, {displayName}</h2>
        <p style={{...S.p, color:C.teal, marginBottom:0}}>
          {isAdmin
            ? "Here's your upcoming schedule overview."
            : nextBooking
              ? <>Your next session with Diana is on <strong>{new Date(nextBooking.date + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" })} at {nextBooking.time_slot}</strong>. A video link will be sent to your email 30 minutes before.</>
              : "You have no upcoming sessions. Head to Schedule to book one."}
        </p>
      </div>
      <div style={{ display:"grid", gridTemplateColumns: mobile ? "1fr" : "repeat(2,1fr)", gap:12 }}>
        {[
          ["Documents", "Documents", `${docCount} file${docCount !== 1 ? "s" : ""} shared`],
          [scheduleTarget, scheduleLabel, scheduleDesc],
          ["Messages", "Messages", `${unreadCount} message${unreadCount !== 1 ? "s" : ""}`],
          ["Buy Sessions", "Buy Sessions", (() => {
            if (balanceMinutes === null) return "Purchase a package";
            if (balanceMinutes <= 0) return "Low balance — buy more";
            const h = Math.floor(balanceMinutes / 60);
            const m = balanceMinutes % 60;
            if (h === 0) return `${m} minute${m !== 1 ? "s" : ""} available`;
            if (m === 0) return `${h} hour${h !== 1 ? "s" : ""} available`;
            return `${h} hour${h !== 1 ? "s" : ""} and ${m} minute${m !== 1 ? "s" : ""} available`;
          })()],
        ].map(([target, label, d]) => (
          <div key={label} style={{ ...S.card, cursor:"pointer" }} onClick={() => setPage(target)}>
            <h3 style={{ ...S.h3, color:C.teal }}>{label}</h3>
            {typeof d === "string"
              ? <p style={{ ...S.p, marginBottom:0, fontSize:13 }}>{d}</p>
              : <div style={{ marginBottom: 0 }}>{d}</div>
            }
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
