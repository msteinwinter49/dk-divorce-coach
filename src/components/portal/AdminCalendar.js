"use client";
import React, { useState, useEffect, useCallback } from "react";
import { C, S } from "@/lib/constants";
import { useIsMobile } from "@/lib/hooks";
import MiniCalendar from "@/components/portal/MiniCalendar";

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7am - 8pm
const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function formatHour(h) {
  if (h === 0) return "12 am";
  if (h < 12) return `${h} am`;
  if (h === 12) return "12 pm";
  return `${h - 12} pm`;
}

function formatTime(t) {
  if (!t) return "";
  const d = new Date(t);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function sameDay(a, b) {
  return dateStr(a) === dateStr(b);
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function startOfWeek(d) {
  const r = new Date(d);
  r.setDate(r.getDate() - r.getDay());
  return r;
}

// Source colors
const SRC = {
  coaching: C.teal,
  coachingBg: C.tealLight,
  sp: C.purple,
  spBg: C.purpleLight,
  personal: "#B8860B",
  personalBg: "#FFF8E7",
  available: "#d4edda",
  requested: "#c0392b",
  requestedBg: "#fdecea",
};

export default function AdminCalendar({ setPage }) {
  const isMobile = useIsMobile();
  const [view, setView] = useState("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [bookings, setBookings] = useState([]);
  const [availability, setAvailability] = useState({});
  const [googleEvents, setGoogleEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // booking to accept/decline

  const getRange = useCallback(() => {
    if (view === "day") {
      return { start: dateStr(currentDate), end: dateStr(currentDate) };
    }
    if (view === "week") {
      const s = startOfWeek(currentDate);
      return { start: dateStr(s), end: dateStr(addDays(s, 6)) };
    }
    // month
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    // Extend to full weeks
    const s = startOfWeek(first);
    const e = addDays(startOfWeek(last), 6);
    return { start: dateStr(s), end: dateStr(e) };
  }, [view, currentDate]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { start, end } = getRange();

    const [bookingsRes, availRes, eventsRes] = await Promise.all([
      fetch(`/api/bookings?start=${start}&end=${end}`).then(r => r.json()).catch(() => []),
      fetch(`/api/availability?start=${start}&end=${end}`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/calendar/events?start=${start}&end=${end}`).then(r => r.json()).catch(() => []),
    ]);

    setBookings(Array.isArray(bookingsRes) ? bookingsRes : []);
    setAvailability(availRes && !availRes.error ? availRes : {});
    setGoogleEvents(Array.isArray(eventsRes) ? eventsRes : []);
    setLoading(false);
  }, [getRange]);

  useEffect(() => { loadData(); }, [loadData]);

  const navigate = (dir) => {
    const d = new Date(currentDate);
    if (view === "day") d.setDate(d.getDate() + dir);
    else if (view === "week") d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setCurrentDate(d);
  };

  const handleAcceptDecline = async (action) => {
    if (!modal) return;
    const res = await fetch("/api/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: modal.id, action }),
    });
    if (res.ok) {
      setModal(null);
      loadData();
    } else {
      const err = await res.json();
      alert(err.error || "Failed");
    }
  };

  const toggleOverride = async (date, hour) => {
    const time = `${String(hour).padStart(2, "0")}:00`;
    const endTime = `${String(hour + 1).padStart(2, "0")}:00`;
    const slots = availability[date] || [];
    const isAvailable = slots.includes(time);

    await fetch("/api/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "override",
        date,
        start_time: time,
        end_time: endTime,
        is_available: !isAvailable,
      }),
    });
    loadData();
  };

  // Classify Google Calendar events
  const classifyEvent = (event) => {
    const summary = (event.summary || "").toLowerCase();
    if (summary.includes("coaching:") || summary.includes("clt-")) return "coaching";
    if (event.organizer?.email?.includes("simplepractice") || summary.includes("simplepractice") || summary.includes("therapy") || summary.includes("session")) return "sp";
    return "personal";
  };

  // Get bookings for a specific date
  const getBookingsForDate = (date) => {
    return bookings.filter(b => {
      const bDate = dateStr(new Date(b.start_time));
      return bDate === date;
    });
  };

  // Get Google events for a specific date
  const getEventsForDate = (date) => {
    return googleEvents.filter(e => {
      const eDate = (e.start?.dateTime || e.start?.date || "").split("T")[0];
      return eDate === date;
    });
  };

  // Get booking/event at a specific hour
  const getItemAtHour = (date, hour) => {
    const booking = bookings.find(b => {
      const bDate = dateStr(new Date(b.start_time));
      const bHour = new Date(b.start_time).getHours();
      return bDate === date && bHour === hour;
    });
    if (booking) return { type: "booking", data: booking };

    const event = googleEvents.find(e => {
      const eDate = (e.start?.dateTime || "").split("T")[0];
      const eHour = e.start?.dateTime ? new Date(e.start.dateTime).getHours() : -1;
      return eDate === date && eHour === hour;
    });
    if (event) return { type: "event", data: event, source: classifyEvent(event) };

    return null;
  };

  // Check if hour is within a booking's span
  const isHourOccupied = (date, hour) => {
    return bookings.some(b => {
      const bDate = dateStr(new Date(b.start_time));
      const startH = new Date(b.start_time).getHours();
      const endH = new Date(b.end_time).getHours();
      return bDate === date && hour >= startH && hour < endH;
    }) || googleEvents.some(e => {
      if (!e.start?.dateTime) return false;
      const eDate = e.start.dateTime.split("T")[0];
      const startH = new Date(e.start.dateTime).getHours();
      const endH = e.end?.dateTime ? new Date(e.end.dateTime).getHours() : startH + 1;
      return eDate === date && hour >= startH && hour < endH;
    });
  };

  const isSlotAvailable = (date, hour) => {
    const time = `${String(hour).padStart(2, "0")}:00`;
    return (availability[date] || []).includes(time);
  };

  // --- Header ---
  const headerLabel = () => {
    if (view === "day") return currentDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    if (view === "week") {
      const s = startOfWeek(currentDate);
      const e = addDays(s, 6);
      return `${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${e.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    }
    return `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
  };

  // --- VIEWS ---
  const renderDayView = () => {
    const date = dateStr(currentDate);
    return (
      <div style={{ border: `0.5px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        {HOURS.map(h => {
          const item = getItemAtHour(date, h);
          const avail = isSlotAvailable(date, h);
          const occupied = isHourOccupied(date, h);
          return (
            <div
              key={h}
              style={{
                display: "flex", minHeight: 52, borderBottom: `0.5px solid ${C.border}`,
                background: occupied ? "transparent" : avail ? SRC.available : "#fafafa",
                cursor: !occupied ? "pointer" : "default",
              }}
              onClick={() => !occupied && toggleOverride(date, h)}
            >
              <div style={{ width: 70, padding: "8px 8px", fontSize: 12, color: C.hint, borderRight: `0.5px solid ${C.border}`, flexShrink: 0 }}>
                {formatHour(h)}
              </div>
              <div style={{ flex: 1, padding: "6px 8px" }}>
                {item && renderItem(item)}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderWeekView = () => {
    const weekStart = startOfWeek(currentDate);
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

    return (
      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: `70px repeat(7, 1fr)`, minWidth: isMobile ? 700 : "auto" }}>
          {/* Header row */}
          <div style={cellStyle({ borderBottom: true, borderRight: true, bg: "#fafafa" })} />
          {days.map((d, i) => (
            <div key={i} style={{
              ...cellStyle({ borderBottom: true, borderRight: i < 6, bg: "#fafafa" }),
              textAlign: "center", fontWeight: sameDay(d, new Date()) ? 600 : 400,
              color: sameDay(d, new Date()) ? C.teal : C.text,
            }}>
              <div style={{ fontSize: 11, color: C.hint }}>{DAYS_SHORT[d.getDay()]}</div>
              <div style={{ fontSize: 14 }}>{d.getDate()}</div>
            </div>
          ))}

          {/* Hour rows */}
          {HOURS.map(h => (
            <React.Fragment key={h}>
              <div style={{ ...cellStyle({ borderBottom: true, borderRight: true }), fontSize: 12, color: C.hint, padding: "8px 8px" }}>
                {formatHour(h)}
              </div>
              {days.map((d, i) => {
                const date = dateStr(d);
                const item = getItemAtHour(date, h);
                const avail = isSlotAvailable(date, h);
                const occupied = isHourOccupied(date, h);
                return (
                  <div
                    key={i}
                    style={{
                      ...cellStyle({ borderBottom: true, borderRight: i < 6 }),
                      background: occupied ? "transparent" : avail ? SRC.available : "#fafafa",
                      cursor: !occupied ? "pointer" : "default",
                      minHeight: 44,
                    }}
                    onClick={() => !occupied && toggleOverride(date, h)}
                  >
                    {item && renderItemCompact(item)}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  };

  const renderMonthView = () => {
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const gridStart = startOfWeek(first);
    const weeks = [];
    let d = new Date(gridStart);
    while (d <= addDays(startOfWeek(last), 6)) {
      const week = [];
      for (let i = 0; i < 7; i++) {
        week.push(new Date(d));
        d = addDays(d, 1);
      }
      weeks.push(week);
    }

    return (
      <div style={{ border: `0.5px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        {/* Day headers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", background: "#fafafa" }}>
          {DAYS_SHORT.map(d => (
            <div key={d} style={{ textAlign: "center", padding: "8px 4px", fontSize: 12, color: C.hint, borderBottom: `0.5px solid ${C.border}` }}>{d}</div>
          ))}
        </div>
        {/* Weeks */}
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
            {week.map((day, di) => {
              const date = dateStr(day);
              const isCurrentMonth = day.getMonth() === m;
              const dayBookings = getBookingsForDate(date);
              const dayEvents = getEventsForDate(date);
              const daySlots = (availability[date] || []).length;

              const spCount = dayEvents.filter(e => classifyEvent(e) === "sp").length;
              const coachCount = dayBookings.length;
              const total = spCount + coachCount + (daySlots > 0 ? 1 : 0);

              return (
                <div
                  key={di}
                  style={{
                    minHeight: 80, padding: "4px 6px",
                    borderBottom: wi < weeks.length - 1 ? `0.5px solid ${C.border}` : "none",
                    borderRight: di < 6 ? `0.5px solid ${C.border}` : "none",
                    opacity: isCurrentMonth ? 1 : 0.4,
                    cursor: "pointer",
                    background: sameDay(day, new Date()) ? C.tealLight : "transparent",
                  }}
                  onClick={() => { setCurrentDate(day); setView("day"); }}
                >
                  <div style={{ fontSize: 13, fontWeight: sameDay(day, new Date()) ? 600 : 400, color: C.text, marginBottom: 4 }}>
                    {day.getDate()}
                  </div>
                  {/* Stacked bars */}
                  {total > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {daySlots > 0 && <div style={{ height: 4, borderRadius: 2, background: SRC.available }} />}
                      {spCount > 0 && <div style={{ height: 4, borderRadius: 2, background: SRC.sp }} />}
                      {coachCount > 0 && dayBookings.map(b => (
                        <div key={b.id} style={{ height: 4, borderRadius: 2, background: b.status === "requested" ? SRC.requested : SRC.coaching }} />
                      ))}
                    </div>
                  )}
                  {/* Compact labels */}
                  {dayBookings.slice(0, 2).map(b => (
                    <div key={b.id} style={{ fontSize: 10, color: b.status === "requested" ? SRC.requested : SRC.coaching, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {formatTime(b.start_time)} {b.profiles?.first_name}
                    </div>
                  ))}
                  {dayBookings.length > 2 && <div style={{ fontSize: 10, color: C.hint }}>+{dayBookings.length - 2} more</div>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  // --- Render items ---
  const renderItem = (item) => {
    if (item.type === "booking") {
      const b = item.data;
      const isRequested = b.status === "requested";
      return (
        <div
          style={{
            padding: "4px 8px", borderRadius: 6, fontSize: 13,
            background: isRequested ? SRC.requestedBg : SRC.coachingBg,
            border: isRequested ? `2px solid ${SRC.requested}` : `1px solid ${C.teal}`,
            cursor: isRequested ? "pointer" : "default",
          }}
          onClick={(e) => { e.stopPropagation(); if (isRequested) setModal(b); }}
        >
          <div style={{ fontWeight: 500, color: isRequested ? SRC.requested : SRC.coaching }}>
            {b.profiles?.first_name} {b.profiles?.last_name}
          </div>
          <div style={{ fontSize: 12, color: C.muted }}>
            {formatTime(b.start_time)} - {formatTime(b.end_time)} | {b.session_duration}min | ${Number(b.fee).toFixed(2)} | {b.status}
          </div>
        </div>
      );
    }
    if (item.type === "event") {
      const e = item.data;
      const src = item.source;
      const color = SRC[src];
      const bg = SRC[src + "Bg"];
      return (
        <div style={{ padding: "4px 8px", borderRadius: 6, fontSize: 13, background: bg, border: `1px solid ${color}` }}>
          <div style={{ fontWeight: 500, color }}>{e.summary || "Busy"}</div>
          <div style={{ fontSize: 12, color: C.muted }}>
            {e.start?.dateTime ? formatTime(e.start.dateTime) : "All day"}
            {e.end?.dateTime ? ` - ${formatTime(e.end.dateTime)}` : ""}
          </div>
        </div>
      );
    }
    return null;
  };

  const renderItemCompact = (item) => {
    if (item.type === "booking") {
      const b = item.data;
      const isRequested = b.status === "requested";
      return (
        <div
          style={{
            padding: "2px 4px", borderRadius: 4, fontSize: 11,
            background: isRequested ? SRC.requestedBg : SRC.coachingBg,
            border: isRequested ? `2px solid ${SRC.requested}` : `1px solid ${C.teal}`,
            cursor: isRequested ? "pointer" : "default",
            overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
          }}
          onClick={(e) => { e.stopPropagation(); if (isRequested) setModal(b); }}
        >
          <span style={{ color: isRequested ? SRC.requested : SRC.coaching, fontWeight: 500 }}>
            {b.profiles?.first_name} {b.session_duration}m
          </span>
        </div>
      );
    }
    if (item.type === "event") {
      const e = item.data;
      const src = item.source;
      return (
        <div style={{
          padding: "2px 4px", borderRadius: 4, fontSize: 11,
          background: SRC[src + "Bg"], color: SRC[src],
          overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
        }}>
          {e.summary || "Busy"}
        </div>
      );
    }
    return null;
  };

  // --- Modal ---
  const renderModal = () => {
    if (!modal) return null;
    const b = modal;
    return (
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
      }} onClick={() => setModal(null)}>
        <div style={{ ...S.card, maxWidth: 420, width: "90%", margin: 0 }} onClick={e => e.stopPropagation()}>
          <h3 style={S.h3}>Session Request</h3>
          <div style={{ fontSize: 14, color: C.text, marginBottom: 8 }}>
            <p><strong>Client:</strong> {b.profiles?.first_name} {b.profiles?.last_name}</p>
            <p><strong>Date:</strong> {b.date}</p>
            <p><strong>Time:</strong> {formatTime(b.start_time)} - {formatTime(b.end_time)}</p>
            <p><strong>Duration:</strong> {b.session_duration} min</p>
            <p><strong>Fee:</strong> ${Number(b.fee).toFixed(2)}</p>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button style={S.btn} onClick={() => handleAcceptDecline("accept")}>Accept</button>
            <button style={{ ...S.btnOutline, color: SRC.requested, border: `1px solid ${SRC.requested}` }} onClick={() => handleAcceptDecline("decline")}>Decline</button>
            <button style={S.btnSmOut} onClick={() => setModal(null)}>Cancel</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={S.page}>
      <button style={{ ...S.navLink, marginBottom: 12, fontSize: 13, color: C.teal }} onClick={() => setPage("Admin")}>&larr; Back to Admin</button>

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ ...S.h1, marginBottom: 0 }}>Calendar</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button style={S.btnSmOut} onClick={() => setCurrentDate(new Date())}>Today</button>
          <button style={S.btnSmOut} onClick={() => navigate(-1)}>&lsaquo;</button>
          <button style={S.btnSmOut} onClick={() => navigate(1)}>&rsaquo;</button>
          <span style={{ fontSize: 14, color: C.text, fontWeight: 500, minWidth: 180, textAlign: "center" }}>{headerLabel()}</span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {["day", "week", "month"].map(v => (
            <button
              key={v}
              style={{ ...S.btnSmOut, ...(view === v ? { background: C.teal, color: "#fff", border: `0.5px solid ${C.teal}` } : {}) }}
              onClick={() => setView(v)}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginBottom: 12, flexWrap: "wrap", fontSize: 12, color: C.muted }}>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: SRC.available, marginRight: 4 }} />Available</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: SRC.coaching, marginRight: 4 }} />Coaching</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: SRC.sp, marginRight: 4 }} />SimplePractice</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: SRC.personal, marginRight: 4 }} />Personal</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, border: `2px solid ${SRC.requested}`, marginRight: 4 }} />Requested</span>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: C.hint }}>Loading...</div>
      ) : (
        <>
          {(view === "day" || view === "week") && (
            <div style={{ marginBottom: 16, display: "flex", justifyContent: "center" }}>
              <MiniCalendar currentDate={currentDate} onSelectDate={(d) => setCurrentDate(d)} view={view} />
            </div>
          )}
          {view === "day" && renderDayView()}
          {view === "week" && renderWeekView()}
          {view === "month" && renderMonthView()}
        </>
      )}

      {renderModal()}
    </div>
  );
}

function cellStyle({ borderBottom, borderRight, bg }) {
  return {
    padding: "4px 6px",
    borderBottom: borderBottom ? `0.5px solid ${C.border}` : "none",
    borderRight: borderRight ? `0.5px solid ${C.border}` : "none",
    background: bg || "transparent",
  };
}
