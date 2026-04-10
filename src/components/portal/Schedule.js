"use client";
import React, { useState, useEffect, useCallback } from "react";
import { C, S } from "@/lib/constants";
import { useIsMobile } from "@/lib/hooks";
import { useAuth } from "@/context/AuthContext";
import MiniCalendar from "@/components/portal/MiniCalendar";

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7am - 8pm
const DAY_ROW_H = 52;
const WEEK_ROW_H = 44;
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
  const { user, profile } = useAuth();
  const isAdminViewing = !!viewAsClient && profile?.role === "admin";
  const readOnly = !!viewAsClient && !isAdminViewing;
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

  const [showSpinner, setShowSpinner] = useState(false);

  // Cancel state
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelSuccess, setCancelSuccess] = useState(false);

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
    const spinnerTimer = setTimeout(() => setShowSpinner(true), 500);

    const body = {
      session_type_id: selectedType.id,
      date: bookingDate,
      start_time: selectedTime,
    };
    if (isAdminViewing) body.user_id = viewAsClient.id;

    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const { start, end } = getRange();
      const [availRes, bookingsRes] = await Promise.all([
        fetch(`/api/availability?start=${start}&end=${end}`).then(r => r.json()).catch(() => ({})),
        fetch(`/api/bookings?start=${start}&end=${end}`).then(r => r.json()).catch(() => []),
      ]);
      setAvailability(availRes && !availRes.error ? availRes : {});
      setBookings(Array.isArray(bookingsRes) ? bookingsRes : []);
      setBookingSuccess(true);
    } else {
      const err = await res.json();
      setBookingError(err.error || "Could not book. Please try again.");
    }
    clearTimeout(spinnerTimer);
    setShowSpinner(false);
    setConfirming(false);
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    setConfirming(true);
    const spinnerTimer = setTimeout(() => setShowSpinner(true), 500);
    const res = await fetch("/api/bookings", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: cancelTarget.id }),
    });
    clearTimeout(spinnerTimer);
    setShowSpinner(false);
    setConfirming(false);
    if (res.ok) {
      setCancelSuccess(true);
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

  const isHourOccupied = (date, hour) => {
    const hourStart = hour * 60;
    const hourEnd = hourStart + 60;
    return bookings.some(b => {
      const bDate = localDateStr(new Date(b.start_time));
      if (bDate !== date) return false;
      const bStart = new Date(b.start_time).getHours() * 60 + new Date(b.start_time).getMinutes();
      const bEnd = new Date(b.end_time).getHours() * 60 + new Date(b.end_time).getMinutes();
      return bStart < hourEnd && bEnd > hourStart;
    });
  };

  // Get all bookings for a date with pixel position info
  const getBookingsForDateOverlay = (date, rowH) => {
    const firstHour = HOURS[0];
    return bookings.filter(b => {
      if (b.start_time) return localDateStr(new Date(b.start_time)) === date;
      return b.date === date;
    }).map(b => {
      const startMin = new Date(b.start_time).getHours() * 60 + new Date(b.start_time).getMinutes();
      const endMin = new Date(b.end_time).getHours() * 60 + new Date(b.end_time).getMinutes();
      return {
        data: b,
        top: ((startMin - firstHour * 60) / 60) * rowH,
        height: ((endMin - startMin) / 60) * rowH,
      };
    });
  };

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

  const renderOverlayBooking = (b, top, height, compact) => {
    const isRequested = b.status === "requested";
    return (
      <div
        key={b.id}
        style={{
          position: "absolute", top, left: 2, right: 2, zIndex: 4,
          height,
          padding: compact ? "2px 4px" : "4px 8px",
          borderRadius: compact ? 4 : 6,
          fontSize: compact ? 11 : 13,
          background: isRequested ? "#fdecea" : C.tealLight,
          border: isRequested ? "2px solid #c0392b" : `1px solid ${C.teal}`,
          cursor: (isRequested || isAdminViewing) ? "pointer" : "default",
          overflow: "hidden",
          boxSizing: "border-box",
        }}
        onClick={e => { e.stopPropagation(); if (isRequested || (isAdminViewing && b.status === "booked")) setCancelTarget(b); }}
      >
        {compact ? (
          <span style={{ color: isRequested ? "#c0392b" : C.teal, fontWeight: 500, whiteSpace: "nowrap" }}>
            {b.session_duration}m {b.status}
          </span>
        ) : (
          <>
            <div style={{ fontWeight: 500, color: isRequested ? "#c0392b" : C.teal, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {b.session_types?.label || "Session"} — {b.status}
            </div>
            {height > 36 && (
              <div style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {formatTime(b.start_time)} - {formatTime(b.end_time)} | {b.session_duration}min | ${Number(b.fee).toFixed(2)}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const renderDayView = () => {
    const date = dateStr(currentDate);
    const totalH = HOURS.length * DAY_ROW_H;
    const overlayItems = getBookingsForDateOverlay(date, DAY_ROW_H);
    return (
      <div style={{ border: `0.5px solid ${C.gridLine}`, borderRadius: 8, userSelect: "none" }}>
        <div style={{ display: "flex" }}>
          <div style={{ width: 70, flexShrink: 0 }}>
            {HOURS.map(h => (
              <div key={h} style={{ height: DAY_ROW_H, padding: "8px", fontSize: 12, color: C.hint, borderBottom: `0.5px solid ${C.gridLine}`, borderRight: `0.5px solid ${C.gridLine}`, boxSizing: "border-box" }}>
                {formatHour(h)}
              </div>
            ))}
          </div>
          <div style={{ flex: 1, position: "relative", height: totalH }}>
            {HOURS.map(h => {
              const avail = isSlotAvailable(date, `${String(h).padStart(2, "0")}:00`);
              const occupied = isHourOccupied(date, h);
              return (
                <div key={h} style={{
                  height: DAY_ROW_H, borderBottom: `0.5px solid ${C.gridLine}`,
                  background: (avail || occupied) ? "#d4edda" : "#fafafa",
                  cursor: avail && !occupied ? "pointer" : "default",
                  boxSizing: "border-box",
                }} onClick={() => avail && !occupied && openBookingPopup(date, h)} />
              );
            })}
            {overlayItems.map(item => renderOverlayBooking(item.data, item.top, item.height, false))}
          </div>
        </div>
      </div>
    );
  };

  const renderWeekView = () => {
    const weekStart = startOfWeek(currentDate);
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const totalH = HOURS.length * WEEK_ROW_H;
    return (
      <div style={{ overflowX: "auto", userSelect: "none" }}>
        <div style={{ display: "flex", minWidth: mobile ? 770 : "auto" }}>
          <div style={{ width: 70, flexShrink: 0 }}>
            <div style={{ height: 36, padding: "4px 0", borderBottom: `0.5px solid ${C.gridLine}`, borderRight: `0.5px solid ${C.gridLine}`, background: "#fafafa" }} />
            {HOURS.map(h => (
              <div key={h} style={{ height: WEEK_ROW_H, fontSize: 12, color: C.hint, borderBottom: `0.5px solid ${C.gridLine}`, borderRight: `0.5px solid ${C.gridLine}`, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {formatHour(h)}
              </div>
            ))}
          </div>
          {days.map((d, i) => {
            const date = dateStr(d);
            const overlayItems = getBookingsForDateOverlay(date, WEEK_ROW_H);
            return (
              <div key={i} style={{ flex: 1, minWidth: 0, borderRight: i < 6 ? `0.5px solid ${C.gridLine}` : "none" }}>
                <div style={{
                  height: 36, textAlign: "center", padding: "4px 0",
                  borderBottom: `0.5px solid ${C.gridLine}`, background: "#fafafa",
                  fontWeight: sameDay(d, new Date()) ? 600 : 400,
                  color: sameDay(d, new Date()) ? C.teal : C.text,
                }}>
                  <div style={{ fontSize: 11, color: C.hint }}>{DAYS_SHORT[d.getDay()]}</div>
                  <div style={{ fontSize: 14 }}>{d.getDate()}</div>
                </div>
                <div style={{ position: "relative", height: totalH }}>
                  {HOURS.map(h => {
                    const avail = isSlotAvailable(date, `${String(h).padStart(2, "0")}:00`);
                    const occupied = isHourOccupied(date, h);
                    return (
                      <div key={h} style={{
                        height: WEEK_ROW_H, borderBottom: `0.5px solid ${C.gridLine}`,
                        background: (avail || occupied) ? "#d4edda" : "#fafafa",
                        cursor: avail && !occupied ? "pointer" : "default",
                        boxSizing: "border-box",
                      }} onClick={() => avail && !occupied && openBookingPopup(date, h)} />
                    );
                  })}
                  {overlayItems.map(item => renderOverlayBooking(item.data, item.top, item.height, true))}
                </div>
              </div>
            );
          })}
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", border: `0.5px solid ${C.gridLine}`, borderRadius: 8, overflow: "hidden" }}>
          {DAYS_SHORT.map(d => (
            <div key={d} style={{ textAlign: "center", padding: "8px 4px", fontSize: 12, color: C.hint, background: "#fafafa", borderBottom: `0.5px solid ${C.gridLine}`, borderRight: d !== "Sat" ? `0.5px solid ${C.gridLine}` : "none" }}>{d}</div>
          ))}
        {weeks.map((week, wi) => (
          <React.Fragment key={wi}>
            {week.map((day, di) => {
              const date = dateStr(day);
              const isCurrentMonth = day.getMonth() === m;
              const dayBookings = getBookingsForDate(date);
              const hasAvail = (availability[date] || []).length > 0;
              const isPast = day < new Date(new Date().setHours(0, 0, 0, 0));

              return (
                <div key={di} style={{
                  minHeight: 80, padding: "4px 6px",
                  borderBottom: wi < weeks.length - 1 ? `0.5px solid ${C.gridLine}` : "none",
                  borderRight: di < 6 ? `0.5px solid ${C.gridLine}` : "none",
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
                      cursor: (b.status === "requested" || isAdminViewing) ? "pointer" : "default",
                    }} onClick={e => { e.stopPropagation(); if (b.status === "requested" || (isAdminViewing && b.status === "booked")) setCancelTarget(b); }}>
                      {formatTime(b.start_time)} {b.session_duration}m — {b.status}
                    </div>
                  ))}
                  {hasAvail && !isPast && dayBookings.length === 0 && (
                    <div style={{ fontSize: 10, color: C.teal }}>Available</div>
                  )}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    );
  };

  // --- Booking popup ---
  const openBookingPopup = (date, hour) => {
    if (readOnly) return;
    setBookingDate(date);
    setSelectedType(null);
    setSelectedTime(hour != null ? `${String(hour).padStart(2, "0")}:00` : null);
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
              <div style={{ fontSize: 16, fontWeight: 500, color: C.teal, marginBottom: 8 }}>
                {isAdminViewing ? "Session booked!" : "Session requested!"}
              </div>
              <p style={{ ...S.p, color: C.muted }}>
                {isAdminViewing
                  ? `Session for ${viewAsClient.first_name} on ${dateLabel} at ${selectedTime} has been confirmed.`
                  : `Your request for ${dateLabel} at ${selectedTime} has been submitted. Diana will review and confirm.`}
              </p>
              <button style={S.btn} onClick={closePopup}>Close</button>
            </div>
          ) : (
            <>
              <h3 style={S.h3}>{isAdminViewing ? `Book for ${viewAsClient.first_name}` : "Book a Session"}</h3>
              <p style={{ ...S.p, fontSize: 13 }}>{dateLabel}</p>

              {/* Start / End time */}
              <div style={{ display: "flex", gap: 16, alignItems: "flex-end", marginBottom: 16 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ ...S.label, marginBottom: 4 }}>Start time</label>
                  <input type="time" value={selectedTime || ""}
                    onChange={e => setSelectedTime(e.target.value)}
                    style={{ ...S.input, width: "100%", fontSize: 14, marginBottom: 0 }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ ...S.label, marginBottom: 4 }}>End time</label>
                  <div style={{ padding: "8px 12px", background: C.warm, borderRadius: 8, fontSize: 14, color: C.muted }}>
                    {selectedTime && selectedType ? formatTimeStr(addMinutesToTime(selectedTime, selectedType.duration)) : "—"}
                  </div>
                </div>
              </div>

              {/* Session type */}
              <label style={{ ...S.label, marginBottom: 8 }}>Session type</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                {sessionTypes.map(t => (
                  <div key={t.id} onClick={() => setSelectedType(t)}
                    style={{
                      padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                      border: `1px solid ${selectedType?.id === t.id ? C.teal : C.gridLine}`,
                      background: selectedType?.id === t.id ? C.tealLight : "#fff",
                    }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{t.label}</div>
                    <div style={{ fontSize: 12, color: C.muted }}>{t.duration} min — ${Number(t.fee).toFixed(2)}</div>
                  </div>
                ))}
              </div>

              {/* Availability warning */}
              {selectedType && selectedTime && (() => {
                const slots = availability[bookingDate] || [];
                const [h, m] = selectedTime.split(":").map(Number);
                const startMin = h * 60 + m;
                const endMin = startMin + selectedType.duration;

                // Build continuous available ranges from discrete slots
                let increment = 30;
                if (slots.length >= 2) {
                  const [h0, m0] = slots[0].split(":").map(Number);
                  const [h1, m1] = slots[1].split(":").map(Number);
                  increment = (h1 * 60 + m1) - (h0 * 60 + m0);
                }
                const ranges = [];
                for (const s of slots) {
                  const [sh, sm] = s.split(":").map(Number);
                  const sMin = sh * 60 + sm;
                  const sEnd = sMin + increment;
                  if (ranges.length > 0 && ranges[ranges.length - 1][1] >= sMin) {
                    ranges[ranges.length - 1][1] = sEnd;
                  } else {
                    ranges.push([sMin, sEnd]);
                  }
                }
                const covered = ranges.some(([rStart, rEnd]) => startMin >= rStart && endMin <= rEnd);

                const overlap = bookings.some(b => {
                  const bDate = localDateStr(new Date(b.start_time));
                  if (bDate !== bookingDate || !["requested", "booked"].includes(b.status)) return false;
                  const bStart = new Date(b.start_time).getHours() * 60 + new Date(b.start_time).getMinutes();
                  const bEnd = bStart + (b.session_duration || 60);
                  return startMin < bEnd && endMin > bStart;
                });

                if (overlap) {
                  return <p style={{ fontSize: 13, color: "#c0392b", margin: "0 0 12px" }}>This time overlaps an existing booking.</p>;
                }
                if (!covered) {
                  return <p style={{ fontSize: 13, color: "#c0392b", margin: "0 0 12px" }}>Part of this time slot is outside available hours.</p>;
                }
                return null;
              })()}

              {/* Step 3: Confirm */}
              {selectedType && selectedTime && (
                <div style={{ padding: "1rem", background: C.warm, borderRadius: 12, marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{selectedType.label}</div>
                  <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
                    {dateLabel} at {formatTimeStr(selectedTime)} — {selectedType.duration} min — ${Number(selectedType.fee).toFixed(2)}
                  </div>
                </div>
              )}

              {bookingError && <p style={{ fontSize: 13, color: "#c0392b", marginBottom: 12 }}>{bookingError}</p>}

              <div style={{ display: "flex", gap: 8 }}>
                {selectedType && selectedTime && (
                  <button style={S.btn} onClick={handleBook} disabled={confirming}>
                    {confirming ? (isAdminViewing ? "Booking..." : "Requesting...") : (isAdminViewing ? "Book Session" : "Request Session")}
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
  const closeCancelModal = () => {
    setCancelTarget(null);
    setCancelSuccess(false);
  };

  const renderCancelModal = () => {
    if (!cancelTarget) return null;
    return (
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
      }} onClick={closeCancelModal}>
        <div style={{ ...S.card, maxWidth: 400, width: "90%", margin: 0 }} onClick={e => e.stopPropagation()}>
          {cancelSuccess ? (
            <div style={{ textAlign: "center", padding: "1rem" }}>
              <div style={{ fontSize: 16, fontWeight: 500, color: C.teal, marginBottom: 8 }}>
                {cancelTarget.status === "booked" ? "Session cancelled." : "Request cancelled."}
              </div>
              <p style={{ ...S.p, color: C.muted }}>
                Your {cancelTarget.status === "booked" ? "session" : "session request"} for{" "}
                <strong>{formatTime(cancelTarget.start_time)}</strong> on{" "}
                <strong>{cancelTarget.date}</strong> has been cancelled.
              </p>
              <button style={S.btn} onClick={closeCancelModal}>Close</button>
            </div>
          ) : (
            <>
              <h3 style={S.h3}>{cancelTarget.status === "booked" ? "Cancel Session" : "Cancel Request"}</h3>
              <p style={S.p}>
                Are you sure you want to cancel {isAdminViewing ? `${viewAsClient.first_name}'s` : "your"} {cancelTarget.status === "booked" ? "session" : "session request"} for{" "}
                <strong>{formatTime(cancelTarget.start_time)}</strong> on{" "}
                <strong>{cancelTarget.date}</strong>?
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ ...S.btn, background: "#c0392b" }} onClick={handleCancel} disabled={confirming}>
                  {confirming ? "Cancelling..." : "Yes, Cancel"}
                </button>
                <button style={S.btnSmOut} onClick={closeCancelModal}>No, Keep It</button>
              </div>
            </>
          )}
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
          : isAdminViewing
          ? `Managing ${viewAsClient.first_name}\u2019s schedule. Click to book or cancel sessions.`
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
      {showSpinner && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
        }}>
          <div style={{
            width: 40, height: 40, border: `3px solid ${C.gridLine}`, borderTopColor: C.teal,
            borderRadius: "50%", animation: "spin 0.8s linear infinite",
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
    </div>
  );
}

function cellStyle(borderBottom, borderRight, bg) {
  return {
    padding: "4px 6px",
    borderBottom: borderBottom ? `0.5px solid ${C.gridLine}` : "none",
    borderRight: borderRight ? `0.5px solid ${C.gridLine}` : "none",
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
