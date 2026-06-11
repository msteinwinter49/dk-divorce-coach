"use client";
import { useState, useEffect } from "react";
import { C, S, SERVER_ERROR } from "@/lib/constants";
import { useError } from "@/context/ErrorContext";
import { useIsMobile } from "@/lib/hooks";
import { useAuth } from "@/context/AuthContext";
import { createClient } from "@/lib/supabase/client";

const Skel = ({ w = "70%", h = 16, mb = 8 }) => (
  <div style={{ width: w, height: h, background: "rgba(0,0,0,0.08)", borderRadius: 6, marginBottom: mb, animation: "skel-pulse 1.5s ease-in-out infinite" }} />
);

export default function PortalHome({ setPage, viewAsClient, setProfileFocus }) {
  const mobile = useIsMobile();
  const { user, profile } = useAuth();
  const [nextBooking, setNextBooking] = useState(null);
  const [bookedCount, setBookedCount] = useState(0);
  const [requestedCount, setRequestedCount] = useState(0);
  const [adminStats, setAdminStats] = useState(null);
  const [docCount, setDocCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [balanceMinutes, setBalanceMinutes] = useState(null);
  const [hasCard, setHasCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const { setServerError } = useError();

  const targetId = viewAsClient?.id || user?.id;
  const targetProfile = viewAsClient || profile;
  const isAdmin = profile?.role === "admin" && !viewAsClient;

  useEffect(() => {
    if (!targetId) return;
    setLoading(true);
    const supabase = createClient();
    const today = new Date();
    const todayStr = today.toLocaleDateString("en-CA");

    (async () => {
      if (isAdmin) {
        const in28d = new Date(today);
        in28d.setDate(in28d.getDate() + 28);
        const end28dStr = in28d.toLocaleDateString("en-CA");

        try {
          const [bookingsRes, eventsRes] = await Promise.all([
            fetch(`/api/bookings?start=${encodeURIComponent(today.toISOString())}&end=${end28dStr}`),
            fetch(`/api/calendar/events?start=${todayStr}&end=${end28dStr}`),
          ]);
          if (bookingsRes.status >= 500 || eventsRes.status >= 500) {
            setServerError(SERVER_ERROR);
            setLoading(false);
            return;
          }
          const [bookingsData, eventsData] = await Promise.all([
            bookingsRes.json().catch(() => []),
            eventsRes.json().catch(() => ({})),
          ]);
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
        } catch {
          setServerError(SERVER_ERROR);
        } finally {
          setLoading(false);
        }
      } else if (viewAsClient) {
        // Admin viewing as client — keep separate calls (infrequent, admin path)
        const in12mo = new Date(today);
        in12mo.setFullYear(in12mo.getFullYear() + 1);
        const end12moStr = in12mo.toLocaleDateString("en-CA");

        try {
          const res = await fetch(`/api/bookings?start=${encodeURIComponent(today.toISOString())}&end=${end12moStr}`);
          if (!res.ok) {
            if (res.status >= 500) setServerError(SERVER_ERROR);
            setLoading(false);
            return;
          }
          const data = await res.json();
          if (!Array.isArray(data)) { setLoading(false); return; }
          const end30d = new Date(today);
          end30d.setDate(end30d.getDate() + 30);
          const end30dStr = end30d.toLocaleDateString("en-CA");
          const booked = data.filter(b => b.status === "booked").sort((a, b) => a.start_time < b.start_time ? -1 : 1);
          if (booked.length > 0) setNextBooking(booked[0]);
          setBookedCount(booked.filter(b => b.date <= end30dStr).length);
          setRequestedCount(data.filter(b => b.status === "requested" && b.date <= end30dStr).length);
        } catch {
          setServerError(SERVER_ERROR);
        } finally {
          setLoading(false);
        }

        fetch(`/api/purchases?client_id=${targetId}`).then(r => r.json()).then(b => setBalanceMinutes(b?.balance_minutes ?? 0)).catch(() => {});
      } else {
        // Client viewing own portal — single combined request
        const in12mo = new Date(today);
        in12mo.setFullYear(in12mo.getFullYear() + 1);
        const end12moStr = in12mo.toLocaleDateString("en-CA");

        try {
          const res = await fetch(`/api/portal-home?start=${encodeURIComponent(today.toISOString())}&end=${end12moStr}`);
          if (!res.ok) {
            if (res.status >= 500) setServerError(SERVER_ERROR);
            setLoading(false);
            return;
          }
          const data = await res.json();
          const bookings = Array.isArray(data.bookings) ? data.bookings : [];
          const end30d = new Date(today);
          end30d.setDate(end30d.getDate() + 30);
          const end30dStr = end30d.toLocaleDateString("en-CA");
          const booked = bookings.filter(b => b.status === "booked").sort((a, b) => a.start_time < b.start_time ? -1 : 1);
          if (booked.length > 0) setNextBooking(booked[0]);
          setBookedCount(booked.filter(b => b.date <= end30dStr).length);
          setRequestedCount(bookings.filter(b => b.status === "requested" && b.date <= end30dStr).length);
          setBalanceMinutes(data.balance_minutes ?? 0);
          setHasCard(!!data.card);
        } catch {
          setServerError(SERVER_ERROR);
        } finally {
          setLoading(false);
        }
      }

      supabase.from("documents")
        .select("id", { count: "exact", head: true })
        .eq("user_id", targetId)
        .then(({ count }) => setDocCount(count || 0));

      supabase.from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", targetId)
        .neq("sender_id", targetId)
        .then(({ count }) => setUnreadCount(count || 0));

      if (viewAsClient) {
        // Admin "view as client" — no card check needed (admin doesn't manage their own card here)
        setHasCard(null);
      }
    })();
  }, [targetId]); // eslint-disable-line react-hooks/exhaustive-deps

  const allReady = !loading && (isAdmin || balanceMinutes !== null);
  const [showSpinner, setShowSpinner] = useState(false);
  useEffect(() => {
    if (allReady) { setShowSpinner(false); return; }
    const t = setTimeout(() => setShowSpinner(true), 1000);
    return () => clearTimeout(t);
  }, [allReady]);

  const displayName = targetProfile?.first_name || targetProfile?.full_name?.split(" ")[0] || "there";
  const showCardBanner = !viewAsClient && targetProfile?.role === "client" && hasCard === false;

  const formatTime = (slot) => {
    const [h, m] = slot.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const hour = h % 12 || 12;
    return m === 0 ? `${hour} ${period}` : `${hour}:${String(m).padStart(2, "0")} ${period}`;
  };

  const formatBooking = () => !allReady ? (
    <div>
      <Skel w="90%" />
      <Skel w="55%" />
      <Skel w="65%" mb={0} />
    </div>
  ) : (
    <div style={{ fontSize: 16, color: C.text }}>
      <div>Upcoming in the next 30 days:</div>
      <div>{bookedCount} session{bookedCount !== 1 ? "s" : ""}</div>
      <div>{requestedCount} request{requestedCount !== 1 ? "s" : ""}</div>
    </div>
  );

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
  const scheduleDesc = isAdmin ? adminScheduleDesc() : formatBooking();

  const balanceDesc = (() => {
    if (!allReady) return <Skel w="60%" mb={0} />;
    if (balanceMinutes <= 0) return "Low balance — buy more";
    const h = Math.floor(balanceMinutes / 60);
    const m = balanceMinutes % 60;
    if (h === 0) return `${m} minute${m !== 1 ? "s" : ""} available`;
    if (m === 0) return `${h} hour${h !== 1 ? "s" : ""} available`;
    return `${h} hour${h !== 1 ? "s" : ""} and ${m} minute${m !== 1 ? "s" : ""} available`;
  })();

  const homeCards = isAdmin
    ? [
        [scheduleTarget, "Schedule", scheduleDesc],
        ["Admin Clients", "Clients", "View, search, and invite clients"],
        ["Admin Groups", "Groups", "Manage groups, balances, and rates"],
      ]
    : [
        [scheduleTarget, "Schedule", scheduleDesc],
        ["Buy Sessions", "Buy Sessions", balanceDesc],
      ];

  return (
    <div style={S.page}>
      <style>{`@keyframes skel-pulse{0%,100%{opacity:1}50%{opacity:.45}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>
      {showCardBanner && (
        <div
          onClick={() => { setProfileFocus("payment"); setPage("Profile"); }}
          style={{ background:"#fff8e1", border:"1px solid #ffe082", borderRadius:8, padding:"0.75rem 1rem", marginBottom:"1rem", fontSize:14, color:C.text, lineHeight:1.5, cursor:"pointer" }}
        >
          To book a session, you must have a valid credit card on file.<br />
          Click to enter a Payment Method on your Profile page.
        </div>
      )}
      <div style={{ ...S.card, background:C.tealLight, border:`0.5px solid ${C.tealMid}`, marginBottom: isAdmin ? "0.75rem" : "1.5rem" }}>
        <h2 style={{...S.h2, color:C.teal}}>Welcome back, {displayName}</h2>
        <div style={{...S.p, color:C.teal, marginBottom:0}}>
          {isAdmin
            ? "Here's your upcoming schedule overview."
            : !allReady
              ? <><Skel w="85%" h={14} mb={6} /><Skel w="60%" h={14} mb={0} /></>
              : nextBooking
                ? <>Your next session with Diana is on <strong>{new Date(nextBooking.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} at {formatTime(nextBooking.time_slot)}{nextBooking.session_duration ? ` (${nextBooking.session_duration} min)` : ""}</strong>. A video link will be sent to your email shortly before.</>
                : "You have no upcoming sessions. Head to Schedule to book one."}
        </div>
      </div>
      {!allReady && showSpinner && (
        <div style={{ display:"flex", justifyContent:"center", marginBottom:"0.75rem" }}>
          <div style={{ width:22, height:22, border:`3px solid ${C.tealLight}`, borderTop:`3px solid ${C.teal}`, borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
        </div>
      )}
      <div style={{ display:"grid", gridTemplateColumns: mobile ? "1fr" : "repeat(2,1fr)", gap: (isAdmin || mobile) ? 0 : 12 }}>
        {homeCards.map(([target, label, d]) => (
          <div key={label} style={{ ...S.card, cursor:"pointer", ...((isAdmin || mobile) && { padding:"0.5rem 0 1rem 1rem", marginBottom:"1rem", marginLeft:"0.5rem" }) }} onClick={() => setPage(target)}>
            <h3 style={{ ...S.h3, color:C.teal }}>{label}</h3>
            {typeof d === "string"
              ? <p style={{ ...S.p, marginBottom:0, fontSize:16 }}>{d}</p>
              : <div style={{ marginBottom: 0 }}>{d}</div>
            }
          </div>
        ))}
      </div>
    </div>
  );
}
