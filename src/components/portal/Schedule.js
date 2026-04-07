"use client";
import React, { useState, useEffect, useCallback } from "react";
import { C, S } from "@/lib/constants";
import { useIsMobile } from "@/lib/hooks";
import { useAuth } from "@/context/AuthContext";
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

function sameDay(a, b) { return dateStr(a) === dateStr(b); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function startOfWeek(d) { const r = new Date(d); r.setDate(r.getDate() - r.getDay()); return r; }

export default function Schedule({ viewAsClient }) {
  const { user } = useAuth();
  const readOnly = !!viewAsClient;
  const mobile = useIsMobile();
  const [view, setView] = useState("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [availability, setAvailability] = useState({});
  const [bookings, setBookings] = useState([]);
  const [sessionTypes, setSessionTypes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Booking popup state
  const [bookingDate, setBookingDate] = useState(null);
  const [selectedType, setSelectedType] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [bookingError, setBookingError] = useState(null);
  const [bookingSuccess, setBookingSuccess] = useState(false);

  // Cancel state
  const [cancelTarget, setCancelTarget] = useState(null);

  const getRange = useCallback(() => {
    if (view === "day") return { start: dateStr(currentDate), end: dateStr(currentDate) };
    if (view === "week") {
      const s = startOfWeek(currentDate);
      return { start: dateStr(s), end: dateStr(addDays(s, 6)) };
    }
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    return { start: dateStr(startOfWeek(first)), end: dateStr(addDays(startOfWeek(last), 6)) };
  }, [view, currentDate]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { start, end } = getRange();
    const [availRes, bookingsRes, typesRes] = await Promise.all([
      fetch(`/api/availability?start=${start}&end=${end}`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/bookings?start=${start}&end=${end}`).then(r => r.json()).catch(() => []),
      fetch("/api/session-types").then(r => r.json()).catch(() => []),
    ]);
    setAvailability(availRes && !availRes.error ? availRes : {});
    setBookings(Array.isArray(bookingsRes) ? bookingsRes : []);
    setSessionTypes(Array.isArray(typesRes) ? typesRes : []);
    setLoading(false);
  }, [getRange]);

  useEffect(() => { if (user) loadData(); }, [user, loadData]);

  const navigate = (dir) => {
    const d = new Date(currentDate);
    if (view === "day") d.setDate(d.getDate() + dir);
    else if (view === "week") d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setCurrentDate(d);
    closePopup();
  };

  const closePopup = () => {
    setBookingDate(null);
    setSelectedType(null);
    setSelectedTime(null);
    setBookingError(null);
    setBookingSuccess(false);
  };

  const handleBook = async () => {
    if (!selectedType || !selectedTime || !bookingDate) return;
    setConfirming(true);
    setBookingError(null);

    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_type_id: selectedType.id,
        date: bookingDate,
        start_time: selectedTime,
      }),
    });

    setConfirming(false);
    if (res.ok) {
      setBookingSuccess(true);
      // Re-fetch data so all views reflect the new booking
      const { start, end } = getRange();
      const [availRes, bookingsRes] = await Promise.all([
        fetch(`/api/availability?start=${start}&end=${end}`).then(r => r.json()).catch(() => ({})),
        fetch(`/api/bookings?start=${start}&end=${end}`).then(r => r.json()).catch(() => []),
      ]);
      setAvailability(availRes && !availRes.error ? availRes : {});
      setBookings(Array.isArray(bookingsRes) ? bookingsRes : []);
    } else {
      const err = await res.json();
      setBookingError(err.error || "Could not book. Please try again.");
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget || readOnly) return;
    const res = await fetch("/api/bookings", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: cancelTarget.id }),
    });
    if (res.ok) {
      setCancelTarget(null);
      loadData();
    } else {
      alert("Could not cancel request.");
    }
  };

  const isSlotAvailable = (date, time) => (availability[date] || []).includes(time);

  const getBookingsForDate = (date) =>
    bookings.filter(b => {
      if (b.start_time) return localDateStr(new Date(b.start_time)) === date;
      return b.date === date;
    });

  const getBookingAtHour = (date, hour) =>
    bookings.find(b => {
      const bDate = localDateStr(new Date(b.start_time));
      const bH = new Date(b.start_time).getHours();
      return bDate === date && bH === hour;
    });

  const isHourOccupied = (date, hour) =>
    bookings.some(b => {
      const bDate = localDateStr(new Date(b.start_time));
      const startH = new Date(b.start_time).getHours();
      const endH = new Date(b.end_time).getHours();
      return bDate === date && hour >= startH && hour < endH;
    });

  // Get available start times for a date + duration
  const getTimesForDuration = (date, durationMin) => {
    const slots = availability[date] || [];
    if (slots.length === 0) return [];

    // Detect increment from slot spacing
    let increment = 30;
    if (slots.length >= 2) {
      const [h0, m0] = slots[0].split(":").map(Number);
      const [h1, m1] = slots[1].split(":").map(Number);
      increment = (h1 * 60 + m1) - (h0 * 60 + m0);
    }

    const slotsNeeded = Math.ceil(durationMin / increment);
    const times = [];
    for (let i = 0; i <= slots.length - slotsNeeded; i++) {
      // Check contiguous
      let ok = true;
      for (let j = 1; j < slotsNeeded; j++) {
        const expected = addMinutesToTime(slots[i], j * increment);
        if (slots[i + j] !== expected) { ok = false; break; }
      }
      if (!ok) continue;
      // Check no booking overlap
      const [h, m] = slots[i].split(":").map(Number);
      const startMin = h * 60 + m;
      const endMin = startMin + durationMin;
      const overlap = bookings.some(b => {
        const bDate = localDateStr(new Date(b.start_time));
        if (bDate !== date || !["requested", "booked"].includes(b.status)) return false;
        const bStartH = new Date(b.start_time).getHours();
        const bStartM = new Date(b.start_time).getMinutes();
        const bStart = bStartH * 60 + bStartM;
        const bEnd = bStart + (b.session_duration || 60);
        return startMin < bEnd && endMin > bStart;
      });
      if (!overlap) times.push(slots[i]);
    }
    return times;
  };

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
          const booking = getBookingAtHour(date, h);
          const avail = isSlotAvailable(date, `${String(h).padStart(2, "0")}:00`);
          const occupied = isHourOccupied(date, h);
          return (
            <div key={h} style={{
              display: "flex", minHeight: 52, borderBottom: `0.5px solid ${C.border}`,
              background: occupied ? "transparent" : avail ? "#d4edda" : "#fafafa",
              cursor: avail && !occupied ? "pointer" : "default",
            }} onClick={() => avail && !occupied && openBookingPopup(date)}>
              <div style={{ width: 70, padding: "8px", fontSize: 12, color: C.hint, borderRight: `0.5px solid ${C.border}`, flexShrink: 0 }}>
                {formatHour(h)}
              </div>
              <div style={{ flex: 1, padding: "6px 8px" }}>
                {booking && renderBooking(booking)}
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
        <div style={{ display: "grid", gridTemplateColumns: `70px repeat(7, 1fr)`, minWidth: mobile ? 700 : "auto" }}>
          <div style={cellStyle(true, true, "#fafafa")} />
          {days.map((d, i) => (
            <div key={i} style={{
              ...cellStyle(true, i < 6, "#fafafa"), textAlign: "center",
              fontWeight: sameDay(d, new Date()) ? 600 : 400,
              color: sameDay(d, new Date()) ? C.teal : C.text,
            }}>
              <div style={{ fontSize: 11, color: C.hint }}>{DAYS_SHORT[d.getDay()]}</div>
              <div style={{ fontSize: 14 }}>{d.getDate()}</div>
            </div>
          ))}
          {HOURS.map(h => (
            <React.Fragment key={h}>
              <div style={{ ...cellStyle(true, true), fontSize: 12, color: C.hint, padding: "8px" }}>
                {formatHour(h)}
              </div>
              {days.map((d, i) => {
                const date = dateStr(d);
                const booking = getBookingAtHour(date, h);
                const avail = isSlotAvailable(date, `${String(h).padStart(2, "0")}:00`);
                const occupied = isHourOccupied(date, h);
                return (
                  <div key={i} style={{
                    ...cellStyle(true, i < 6), minHeight: 44,
                    background: occupied ? "transparent" : avail ? "#d4edda" : "#fafafa",
                    cursor: avail && !occupied ? "pointer" : "default",
                  }} onClick={() => avail && !occupied && openBookingPopup(date)}>
                    {booking && renderBookingCompact(booking)}
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
      for (let i = 0; i < 7; i++) { week.push(new Date(d)); d = addDays(d, 1); }
      weeks.push(week);
    }

    return (
      <div style={{ border: `0.5px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", background: "#fafafa" }}>
          {DAYS_SHORT.map(d => (
            <div key={d} style={{ textAlign: "center", padding: "8px 4px", fontSize: 12, color: C.hint, borderBottom: `0.5px solid ${C.border}` }}>{d}</div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
            {week.map((day, di) => {
              const date = dateStr(day);
              const isCurrentMonth = day.getMonth() === m;
              const dayBookings = getBookingsForDate(date);
              const hasAvail = (availability[date] || []).length > 0;
              const isPast = day < new Date(new Date().setHours(0, 0, 0, 0));

              return (
                <div key={di} style={{
                  minHeight: 80, padding: "4px 6px",
                  borderBottom: wi < weeks.length - 1 ? `0.5px solid ${C.border}` : "none",
                  borderRight: di < 6 ? `0.5px solid ${C.border}` : "none",
                  opacity: isCurrentMonth ? 1 : 0.4,
                  cursor: hasAvail && !isPast ? "pointer" : "default",
                  background: sameDay(day, new Date()) ? C.tealLight : hasAvail && !isPast ? "#f0faf5" : "transparent",
                }} onClick={() => hasAvail && !isPast && openBookingPopup(date)}>
                  <div style={{
                    fontSize: 13, marginBottom: 4,
                    fontWeight: sameDay(day, new Date()) ? 600 : 400,
                    color: hasAvail && !isPast ? C.teal : C.text,
                  }}>
                    {day.getDate()}
                  </div>
                  {dayBookings.map(b => (
                    <div key={b.id} style={{
                      fontSize: 10, padding: "1px 4px", borderRadius: 3, marginBottom: 2,
                      background: b.status === "requested" ? "#fdecea" : C.tealLight,
                      color: b.status === "requested" ? "#c0392b" : C.teal,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }} onClick={e => { e.stopPropagation(); if (b.status === "requested") setCancelTarget(b); }}>
                      {formatTime(b.start_time)} {b.session_duration}m — {b.status}
                    </div>
                  ))}
                  {hasAvail && !isPast && dayBookings.length === 0 && (
                    <div style={{ fontSize: 10, color: C.teal }}>Available</div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  const renderBooking = (b) => {
    const isRequested = b.status === "requested";
    return (
      <div style={{
        padding: "4px 8px", borderRadius: 6, fontSize: 13,
        background: isRequested ? "#fdecea" : C.tealLight,
        border: isRequested ? "2px solid #c0392b" : `1px solid ${C.teal}`,
        cursor: isRequested ? "pointer" : "default",
      }} onClick={e => { e.stopPropagation(); if (isRequested) setCancelTarget(b); }}>
        <div style={{ fontWeight: 500, color: isRequested ? "#c0392b" : C.teal }}>
          {b.session_types?.label || "Session"} — {b.status}
        </div>
        <div style={{ fontSize: 12, color: C.muted }}>
          {formatTime(b.start_time)} - {formatTime(b.end_time)} | {b.session_duration}min | ${Number(b.fee).toFixed(2)}
        </div>
      </div>
    );
  };

  const renderBookingCompact = (b) => {
    const isRequested = b.status === "requested";
    return (
      <div style={{
        padding: "2px 4px", borderRadius: 4, fontSize: 11,
        background: isRequested ? "#fdecea" : C.tealLight,
        border: isRequested ? "2px solid #c0392b" : `1px solid ${C.teal}`,
        overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
        cursor: isRequested ? "pointer" : "default",
      }} onClick={e => { e.stopPropagation(); if (isRequested) setCancelTarget(b); }}>
        <span style={{ color: isRequested ? "#c0392b" : C.teal, fontWeight: 500 }}>
          {b.session_duration}m {b.status}
        </span>
      </div>
    );
  };

  // --- Booking popup ---
  const openBookingPopup = (date) => {
    if (readOnly) return;
    setBookingDate(date);
    setSelectedType(null);
    setSelectedTime(null);
    setBookingError(null);
    setBookingSuccess(false);
  };

  const renderBookingPopup = () => {
    if (!bookingDate) return null;

    const times = selectedType ? getTimesForDuration(bookingDate, selectedType.duration) : [];
    const dateLabel = new Date(bookingDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

    return (
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
      }} onClick={closePopup}>
        <div style={{ ...S.card, maxWidth: 480, width: "90%", margin: 0, maxHeight: "80vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>

          {bookingSuccess ? (
            <div style={{ textAlign: "center", padding: "1rem" }}>
              <div style={{ fontSize: 16, fontWeight: 500, color: C.teal, marginBottom: 8 }}>Session requested!</div>
              <p style={{ ...S.p, color: C.muted }}>
                Your request for {dateLabel} at {selectedTime} has been submitted. Diana will review and confirm.
              </p>
              <button style={S.btn} onClick={closePopup}>Close</button>
            </div>
          ) : (
            <>
              <h3 style={S.h3}>Book a Session</h3>
              <p style={{ ...S.p, fontSize: 13 }}>{dateLabel}</p>

              {/* Step 1: Select session type */}
              <label style={{ ...S.label, marginBottom: 8 }}>Session type</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                {sessionTypes.map(t => (
                  <div key={t.id} onClick={() => { setSelectedType(t); setSelectedTime(null); }}
                    style={{
                      padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                      border: `1px solid ${selectedType?.id === t.id ? C.teal : C.border}`,
                      background: selectedType?.id === t.id ? C.tealLight : "#fff",
                    }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{t.label}</div>
                    <div style={{ fontSize: 12, color: C.muted }}>{t.duration} min — ${Number(t.fee).toFixed(2)}</div>
                  </div>
                ))}
              </div>

              {/* Step 2: Select time */}
              {selectedType && (
                <>
                  <label style={{ ...S.label, marginBottom: 8 }}>Available times</label>
                  {times.length === 0 ? (
                    <p style={{ fontSize: 13, color: C.hint }}>No available times for this duration on this date.</p>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: mobile ? "repeat(3, 1fr)" : "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
                      {times.map(t => {
                        const isPicked = selectedTime === t;
                        return (
                          <div key={t} onClick={() => setSelectedTime(t)}
                            style={{
                              padding: "10px 4px", textAlign: "center", borderRadius: 8, fontSize: 13, cursor: "pointer",
                              background: isPicked ? C.teal : "#fff",
                              color: isPicked ? "#fff" : C.text,
                              border: `1px solid ${isPicked ? C.teal : C.border}`,
                            }}>
                            {formatTimeStr(t)}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {/* Step 3: Confirm */}
              {selectedTime && (
                <div style={{ padding: "1rem", background: C.warm, borderRadius: 12, marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{selectedType.label}</div>
                  <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
                    {dateLabel} at {formatTimeStr(selectedTime)} — {selectedType.duration} min — ${Number(selectedType.fee).toFixed(2)}
                  </div>
                </div>
              )}

              {bookingError && <p style={{ fontSize: 13, color: "#c0392b", marginBottom: 12 }}>{bookingError}</p>}

              <div style={{ display: "flex", gap: 8 }}>
                {selectedTime && (
                  <button style={S.btn} onClick={handleBook} disabled={confirming}>
                    {confirming ? "Requesting..." : "Request Session"}
                  </button>
                )}
                <button style={S.btnSmOut} onClick={closePopup}>Cancel</button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // --- Cancel modal ---
  const renderCancelModal = () => {
    if (!cancelTarget) return null;
    return (
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
      }} onClick={() => setCancelTarget(null)}>
        <div style={{ ...S.card, maxWidth: 400, width: "90%", margin: 0 }} onClick={e => e.stopPropagation()}>
          <h3 style={S.h3}>Cancel Request</h3>
          <p style={S.p}>
            Are you sure you want to cancel your session request for{" "}
            <strong>{formatTime(cancelTarget.start_time)}</strong> on{" "}
            <strong>{cancelTarget.date}</strong>?
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ ...S.btn, background: "#c0392b" }} onClick={handleCancel}>Yes, Cancel</button>
            <button style={S.btnSmOut} onClick={() => setCancelTarget(null)}>No, Keep It</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={S.page}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ ...S.h1, fontSize: 26, marginBottom: 0 }}>Schedule</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button style={S.btnSmOut} onClick={() => { setCurrentDate(new Date()); closePopup(); }}>Today</button>
          <button style={S.btnSmOut} onClick={() => navigate(-1)}>&lsaquo;</button>
          <button style={S.btnSmOut} onClick={() => navigate(1)}>&rsaquo;</button>
          <span style={{ fontSize: 14, color: C.text, fontWeight: 500, minWidth: 180, textAlign: "center" }}>{headerLabel()}</span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {["day", "week", "month"].map(v => (
            <button key={v}
              style={{ ...S.btnSmOut, ...(view === v ? { background: C.teal, color: "#fff", border: `0.5px solid ${C.teal}` } : {}) }}
              onClick={() => { setView(v); closePopup(); }}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <p style={{ ...S.p, fontSize: 13 }}>
        {readOnly
          ? "Read-only view — showing this client\u2019s bookings and available slots."
          : "Green slots are available. Click a date or time to book a session. Click a pending request to cancel it."}
      </p>

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: C.hint }}>Loading...</div>
      ) : (
        <>
          {(view === "day" || view === "week") && (
            <div style={{ marginBottom: 16, display: "flex", justifyContent: "center" }}>
              <MiniCalendar currentDate={currentDate} onSelectDate={(d) => { setCurrentDate(d); closePopup(); }} view={view} />
            </div>
          )}
          {view === "day" && renderDayView()}
          {view === "week" && renderWeekView()}
          {view === "month" && renderMonthView()}
        </>
      )}

      {renderBookingPopup()}
      {renderCancelModal()}
    </div>
  );
}

function cellStyle(borderBottom, borderRight, bg) {
  return {
    padding: "4px 6px",
    borderBottom: borderBottom ? `0.5px solid ${C.border}` : "none",
    borderRight: borderRight ? `0.5px solid ${C.border}` : "none",
    background: bg || "transparent",
  };
}

function formatTimeStr(t) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:${String(m).padStart(2, "0")} ${ampm}`;
}

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addMinutesToTime(time, mins) {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
