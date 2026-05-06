"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { C, S } from "@/lib/constants";
import { useIsMobile } from "@/lib/hooks";
import { createClient } from "@/lib/supabase/client";
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

function formatTimeStr(t) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:${String(m).padStart(2, "0")} ${ampm}`;
}

function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function sameDay(a, b) { return dateStr(a) === dateStr(b); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function startOfWeek(d) { const r = new Date(d); r.setDate(r.getDate() - r.getDay()); return r; }

// Client display-name helper with fallbacks: first+last → full_name → client_code → "Client"
function clientName(p) {
  if (!p) return "Client";
  const fn = (p.first_name || "").trim();
  const ln = (p.last_name || "").trim();
  if (fn || ln) return `${fn} ${ln}`.trim();
  if (p.full_name && p.full_name.trim()) return p.full_name.trim();
  if (p.client_code) return p.client_code;
  return "Client";
}
function clientFirstName(p) {
  if (!p) return "Client";
  if (p.first_name && p.first_name.trim()) return p.first_name.trim();
  if (p.full_name && p.full_name.trim()) return p.full_name.trim().split(" ")[0];
  if (p.client_code) return p.client_code;
  return "Client";
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
  const [clients, setClients] = useState([]);
  const [sessionTypes, setSessionTypes] = useState([]);
  const [increment, setIncrement] = useState(30);

  // Modal state: mode = "choose"|"accept"|"edit"|"book"|"event"
  const [modal, setModal] = useState(null);

  // Book/edit form state
  const [bookClient, setBookClient] = useState("");
  const [bookType, setBookType] = useState("");
  const [bookDate, setBookDate] = useState("");
  const [bookTime, setBookTime] = useState("");

  // Event form state
  const [eventTitle, setEventTitle] = useState("");
  const [eventEndTime, setEventEndTime] = useState("");

  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState(null);

  // Drag-to-move state (existing bookings)
  const dragRef = useRef(null);
  const [dragOver, setDragOver] = useState(null); // { date, hour }

  // Range selection state (click-drag to select contiguous empty cells)
  const selectRef = useRef(null); // { date, startHour }
  const [selection, setSelection] = useState(null); // { date, startHour, endHour }

  // Hover tooltip
  const [hover, setHover] = useState(null); // { type, data, x, y }

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
    const s = startOfWeek(first);
    const e = addDays(startOfWeek(last), 6);
    return { start: dateStr(s), end: dateStr(e) };
  }, [view, currentDate]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { start, end } = getRange();

    const [bookingsRes, availRes, eventsRes, clientsRes, typesRes] = await Promise.all([
      fetch(`/api/bookings?start=${start}&end=${end}`).then(r => r.json()).catch(() => []),
      fetch(`/api/availability?start=${start}&end=${end}`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/calendar/events?start=${start}&end=${end}`).then(r => r.json()).catch(() => []),
      fetch("/api/clients").then(r => r.json()).catch(() => ({ clients: [] })),
      fetch("/api/session-types").then(r => r.json()).catch(() => []),
    ]);

    setBookings(Array.isArray(bookingsRes) ? bookingsRes : []);
    setAvailability(availRes && !availRes.error ? availRes : {});
    setGoogleEvents(Array.isArray(eventsRes) ? eventsRes : []);
    setClients(clientsRes.clients || []);
    setSessionTypes(Array.isArray(typesRes) ? typesRes : []);

    // Load scheduling increment
    const supabase = createClient();
    const { data: incSetting } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "scheduling_increment")
      .single();
    if (incSetting?.value) setIncrement(parseInt(incSetting.value));
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

  // --- Modal actions ---

  const openChooseModal = (date, startHour, endHour) => {
    const sh = startHour != null ? startHour : null;
    const eh = endHour != null ? endHour : (sh != null ? sh + 1 : null);
    setBookDate(date);
    setBookTime(sh != null ? `${String(sh).padStart(2, "0")}:00` : "");
    setEventEndTime(eh != null ? `${String(eh).padStart(2, "0")}:00` : "");
    setModalError(null);
    setSelection(null);
    setModal({ mode: "choose", _endTime: eh != null ? `${String(eh).padStart(2, "0")}:00` : "" });
  };

  const openBookModal = () => {
    setBookClient("");
    setBookType("");
    // bookDate and bookTime are already set by openChooseModal
    setModalError(null);
    setModal({ mode: "book" });
  };

  const openEventModal = () => {
    setEventTitle("");
    // bookDate, bookTime, eventEndTime are already set by openChooseModal
    setModalError(null);
    setModal({ mode: "event" });
  };

  const openEditEventModal = (event) => {
    setEventTitle(event.summary || "");
    setBookDate(event.start?.dateTime ? dateStr(new Date(event.start.dateTime)) : "");
    const startD = event.start?.dateTime ? new Date(event.start.dateTime) : null;
    const endD = event.end?.dateTime ? new Date(event.end.dateTime) : null;
    setBookTime(startD ? `${String(startD.getHours()).padStart(2,"0")}:${String(startD.getMinutes()).padStart(2,"0")}` : "");
    setEventEndTime(endD ? `${String(endD.getHours()).padStart(2,"0")}:${String(endD.getMinutes()).padStart(2,"0")}` : "");
    setModalError(null);
    setModal({ mode: "editEvent", event });
  };

  const openEditModal = (booking) => {
    setBookType(booking.session_type_id || "");
    setBookDate(booking.date);
    setBookTime(booking.time_slot);
    setModalError(null);
    setModal({ mode: "edit", booking });
  };

  const openAcceptModal = (booking) => {
    setModalError(null);
    setModal({ mode: "accept", booking });
  };

  const closeModal = () => {
    setModal(null);
    setModalError(null);
    setModalSaving(false);
  };

  const handleAcceptDecline = async (action) => {
    if (!modal?.booking) return;
    setModalSaving(true);
    setModalError(null);
    const res = await fetch("/api/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: modal.booking.id, action }),
    });
    setModalSaving(false);
    if (res.ok) {
      closeModal();
      loadData();
    } else {
      const err = await res.json();
      setModalError(err.error || "Failed");
    }
  };

  const handleBookSession = async () => {
    if (!bookClient || !bookType || !bookDate || !bookTime) {
      setModalError("All fields are required.");
      return;
    }
    setModalSaving(true);
    setModalError(null);
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: bookClient,
        session_type_id: bookType,
        date: bookDate,
        start_time: bookTime,
      }),
    });
    setModalSaving(false);
    if (res.ok) {
      closeModal();
      loadData();
    } else {
      const err = await res.json();
      setModalError(err.error || "Could not create booking.");
    }
  };

  const handleUpdateBooking = async () => {
    if (!modal?.booking || !bookDate || !bookTime) return;
    setModalSaving(true);
    setModalError(null);
    const res = await fetch("/api/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: modal.booking.id,
        action: "update",
        date: bookDate,
        start_time: bookTime,
        session_type_id: bookType || undefined,
      }),
    });
    setModalSaving(false);
    if (res.ok) {
      closeModal();
      loadData();
    } else {
      const err = await res.json();
      setModalError(err.error || "Could not update booking.");
    }
  };

  const handleCreateEvent = async () => {
    if (!eventTitle.trim() || !bookDate || !bookTime || !eventEndTime) {
      setModalError("All fields are required.");
      return;
    }
    setModalSaving(true);
    setModalError(null);
    const res = await fetch("/api/calendar/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: eventTitle.trim(),
        date: bookDate,
        start_time: bookTime,
        end_time: eventEndTime,
        tz_offset: new Date().getTimezoneOffset(),
      }),
    });
    setModalSaving(false);
    if (res.ok) {
      closeModal();
      loadData();
    } else {
      const err = await res.json();
      setModalError(err.error || "Could not create event.");
    }
  };

  const handleUpdateEvent = async () => {
    if (!modal?.event || !eventTitle.trim() || !bookDate || !bookTime || !eventEndTime) {
      setModalError("All fields are required.");
      return;
    }
    setModalSaving(true);
    setModalError(null);
    const res = await fetch("/api/calendar/events", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: modal.event.id,
        summary: eventTitle.trim(),
        date: bookDate,
        start_time: bookTime,
        end_time: eventEndTime,
        tz_offset: new Date().getTimezoneOffset(),
      }),
    });
    setModalSaving(false);
    if (res.ok) { closeModal(); loadData(); }
    else { const err = await res.json(); setModalError(err.error || "Could not update event."); }
  };

  const handleDeleteEvent = async () => {
    if (!modal?.event) return;
    setModalSaving(true);
    setModalError(null);
    const res = await fetch("/api/calendar/events", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: modal.event.id }),
    });
    setModalSaving(false);
    if (res.ok) { closeModal(); loadData(); }
    else { const err = await res.json(); setModalError(err.error || "Could not delete event."); }
  };

  const handleCancelBooking = async (bookingId) => {
    const id = bookingId || modal?.booking?.id;
    if (!id) return;
    setModalSaving(true);
    setModalError(null);
    const res = await fetch("/api/bookings", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setModalSaving(false);
    if (res.ok) {
      closeModal();
      loadData();
    } else {
      const err = await res.json();
      setModalError(err.error || "Could not cancel booking.");
    }
  };

  // --- Range selection (click-drag on empty cells) ---

  const handleCellMouseDown = (e, date, hour) => {
    // Don't start selection if clicking a booking chip
    if (e.target !== e.currentTarget && e.target.closest("[draggable]")) return;
    if (isHourOccupied(date, hour)) return;
    selectRef.current = { date, startHour: hour };
    setSelection({ date, startHour: hour, endHour: hour + 1 });
  };

  const handleCellMouseEnter = (date, hour) => {
    if (!selectRef.current || selectRef.current.date !== date) return;
    if (isHourOccupied(date, hour)) return;
    const start = Math.min(selectRef.current.startHour, hour);
    const end = Math.max(selectRef.current.startHour, hour) + 1;
    setSelection({ date, startHour: start, endHour: end });
  };

  const handleCellMouseUp = () => {
    if (!selectRef.current || !selection) {
      selectRef.current = null;
      return;
    }
    selectRef.current = null;
    openChooseModal(selection.date, selection.startHour, selection.endHour);
  };

  // Clear selection if mouse leaves the grid
  useEffect(() => {
    const handleGlobalUp = () => {
      if (selectRef.current && selection) {
        selectRef.current = null;
        openChooseModal(selection.date, selection.startHour, selection.endHour);
      } else {
        selectRef.current = null;
      }
    };
    window.addEventListener("mouseup", handleGlobalUp);
    return () => window.removeEventListener("mouseup", handleGlobalUp);
  });

  const isCellSelected = (date, hour) =>
    selection && selection.date === date && hour >= selection.startHour && hour < selection.endHour;

  // --- Drag and drop (move existing bookings) ---

  const handleDragStart = (e, item, type) => {
    // Calculate duration in minutes for ghost preview
    let durationMin = 60;
    if (type === "booking") {
      durationMin = item.session_duration || 60;
    } else if (type === "event" && item.start?.dateTime && item.end?.dateTime) {
      durationMin = (new Date(item.end.dateTime) - new Date(item.start.dateTime)) / 60000;
    }
    dragRef.current = { ...item, _dragType: type, _durationMin: durationMin };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", item.id);
    // Set initial dragOver so chips become pointer-transparent immediately
    const startTime = type === "booking" ? item.time_slot : null;
    const startDateTime = type === "event" && item.start?.dateTime ? new Date(item.start.dateTime) : null;
    const startH = startTime ? parseInt(startTime.split(":")[0]) : startDateTime ? startDateTime.getHours() : 0;
    const startM = startTime ? parseInt(startTime.split(":")[1]) : startDateTime ? startDateTime.getMinutes() : 0;
    const snapMin = startH * 60 + startM;
    const itemDate = type === "booking" ? item.date : (startDateTime ? dateStr(startDateTime) : dateStr(currentDate));
    setDragOver({
      date: itemDate, hour: startH,
      snapTime: `${String(startH).padStart(2,"0")}:${String(startM).padStart(2,"0")}`,
      snapMinutes: snapMin, x: e.clientX, y: e.clientY,
    });
    // Hide the native drag ghost so our tooltip is visible
    const ghost = document.createElement("div");
    ghost.style.position = "absolute";
    ghost.style.top = "-9999px";
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => document.body.removeChild(ghost), 0);
  };

  // Check if dropping at a given date/time would overlap any other item (excluding the dragged one)
  const wouldOverlap = (date, startMin, durationMin) => {
    const endMin = startMin + durationMin;
    const dragId = dragRef.current?.id;

    const hasBookingOverlap = bookings.some(b => {
      if (b.id === dragId) return false;
      if (!["requested", "booked"].includes(b.status)) return false;
      if (b.date !== date) return false;
      const [bH, bM] = (b.time_slot || "00:00").split(":").map(Number);
      const bStart = bH * 60 + bM;
      const bEnd = bStart + (b.session_duration || 60);
      return startMin < bEnd && endMin > bStart;
    });
    if (hasBookingOverlap) return true;

    const hasEventOverlap = googleEvents.some(ev => {
      if (ev.id === dragId) return false;
      if (!ev.start?.dateTime) return false;
      const eDate = ev.start.dateTime.split("T")[0];
      if (eDate !== date) return false;
      const eStart = new Date(ev.start.dateTime).getHours() * 60 + new Date(ev.start.dateTime).getMinutes();
      const eEnd = ev.end?.dateTime
        ? new Date(ev.end.dateTime).getHours() * 60 + new Date(ev.end.dateTime).getMinutes()
        : eStart + 60;
      return startMin < eEnd && endMin > eStart;
    });
    return hasEventOverlap;
  };

  const handleDragOver = (e, date, hour) => {
    e.preventDefault();
    // Calculate sub-hour time snapped to increment
    const rect = e.currentTarget.getBoundingClientRect();
    const rowH = view === "day" ? DAY_ROW_H : WEEK_ROW_H;
    const fractionInRow = Math.max(0, Math.min(1, (e.clientY - rect.top) / rowH));
    const minuteInHour = Math.floor(fractionInRow * 60 / increment) * increment;
    const totalMinutes = hour * 60 + minuteInHour;
    const snapH = Math.floor(totalMinutes / 60);
    const snapM = totalMinutes % 60;
    const snapTime = `${String(snapH).padStart(2, "0")}:${String(snapM).padStart(2, "0")}`;
    const durationMin = dragRef.current?._durationMin || 60;
    const blocked = wouldOverlap(date, totalMinutes, durationMin);
    e.dataTransfer.dropEffect = blocked ? "none" : "move";
    setDragOver({ date, hour, snapTime, snapMinutes: totalMinutes, blocked, x: e.clientX, y: e.clientY });
  };

  const handleDragLeave = () => {
    setDragOver(null);
  };

  const handleDrop = async (e, date, hour) => {
    e.preventDefault();
    // Block drop if position overlaps another item
    if (dragOver?.blocked) {
      setDragOver(null);
      dragRef.current = null;
      return;
    }
    // Use the snapped time from dragOver if available
    const newTime = dragOver?.snapTime || `${String(hour).padStart(2, "0")}:00`;
    setDragOver(null);
    const item = dragRef.current;
    dragRef.current = null;
    if (!item) return;

    if (item._dragType === "event") {
      // Moving a local event
      const oldStart = new Date(item.start.dateTime);
      const oldDate = dateStr(oldStart);
      const oldTime = `${String(oldStart.getHours()).padStart(2, "0")}:${String(oldStart.getMinutes()).padStart(2, "0")}`;
      if (oldDate === date && oldTime === newTime) return;

      // Calculate new end time preserving duration
      const oldEnd = new Date(item.end.dateTime);
      const durationMin = (oldEnd - oldStart) / 60000;
      const [newH, newM] = newTime.split(":").map(Number);
      const newStartMin = newH * 60 + newM;
      const newEndMin = newStartMin + durationMin;
      const endTimeStr = `${String(Math.floor(newEndMin / 60)).padStart(2, "0")}:${String(newEndMin % 60).padStart(2, "0")}`;

      const res = await fetch("/api/calendar/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, date, start_time: newTime, end_time: endTimeStr, tz_offset: new Date().getTimezoneOffset() }),
      });
      if (res.ok) { loadData(); }
      else { const err = await res.json(); alert(err.error || "Could not move event."); }
    } else {
      // Moving a booking
      if (item.date === date && item.time_slot === newTime) return;
      const res = await fetch("/api/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, action: "update", date, start_time: newTime }),
      });
      if (res.ok) { loadData(); }
      else { const err = await res.json(); alert(err.error || "Could not move booking."); }
    }
  };

  // --- Data helpers ---

  const classifyEvent = (event) => event._type || "personal";

  const getBookingsForDate = (date) =>
    bookings.filter(b => dateStr(new Date(b.start_time)) === date);

  const getEventsForDate = (date) =>
    googleEvents.filter(e => (e.start?.dateTime || e.start?.date || "").split("T")[0] === date);

  const isHourOccupied = (date, hour) => {
    const hourStart = hour * 60;
    const hourEnd = hourStart + 60;
    return bookings.some(b => {
      const bDate = dateStr(new Date(b.start_time));
      if (bDate !== date) return false;
      const bStart = new Date(b.start_time).getHours() * 60 + new Date(b.start_time).getMinutes();
      const bEnd = new Date(b.end_time).getHours() * 60 + new Date(b.end_time).getMinutes();
      return bStart < hourEnd && bEnd > hourStart;
    }) || googleEvents.some(e => {
      if (!e.start?.dateTime) return false;
      const eDate = e.start.dateTime.split("T")[0];
      if (eDate !== date) return false;
      const eStart = new Date(e.start.dateTime).getHours() * 60 + new Date(e.start.dateTime).getMinutes();
      const eEnd = e.end?.dateTime
        ? new Date(e.end.dateTime).getHours() * 60 + new Date(e.end.dateTime).getMinutes()
        : eStart + 60;
      return eStart < hourEnd && eEnd > hourStart;
    });
  };

  const isSlotAvailable = (date, hour) => {
    const time = `${String(hour).padStart(2, "0")}:00`;
    return (availability[date] || []).includes(time);
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

  // --- Render helpers ---

  const bookingDraggable = (b) => ["requested", "booked"].includes(b.status);

  // dragOver is set during drag, so its presence means a drag is active
  const isDragging = !!dragOver;

  const renderOverlayBooking = (b, top, height, compact) => {
    const isRequested = b.status === "requested";
    const canDrag = bookingDraggable(b);
    const chipH = Math.max(height, compact ? 20 : 28);
    const isBeingDragged = isDragging && dragRef.current?.id === b.id;
    return (
      <div
        key={b.id}
        draggable={canDrag}
        onDragStart={canDrag ? (e) => { setHover(null); handleDragStart(e, b, "booking"); } : undefined}
        onMouseEnter={(e) => setHover({ type: "booking", data: b, x: e.clientX, y: e.clientY })}
        onMouseMove={(e) => { if (hover?.data?.id === b.id) setHover(h => h ? { ...h, x: e.clientX, y: e.clientY } : null); }}
        onMouseLeave={() => setHover(null)}
        style={{
          position: "absolute", top, left: 2, right: 2, zIndex: 4,
          height: chipH,
          pointerEvents: isDragging ? "none" : "auto",
          opacity: isBeingDragged ? 0.3 : 1,
          padding: compact ? "2px 4px" : "4px 8px",
          borderRadius: compact ? 4 : 6,
          fontSize: compact ? 11 : 13,
          background: isRequested ? SRC.requestedBg : SRC.coachingBg,
          border: isRequested ? `2px solid ${SRC.requested}` : `1px solid ${C.teal}`,
          cursor: "pointer",
          overflow: "hidden",
          boxSizing: "border-box",
        }}
        onClick={(e) => {
          e.stopPropagation();
          setHover(null);
          if (isRequested) openAcceptModal(b);
          else openEditModal(b);
        }}
      >
        {compact ? (
          <span style={{ color: isRequested ? SRC.requested : SRC.coaching, fontWeight: 500, whiteSpace: "nowrap" }}>
            {clientFirstName(b.profiles)} {b.session_duration}m
          </span>
        ) : (
          <>
            <div style={{ fontWeight: 500, color: isRequested ? SRC.requested : SRC.coaching, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {clientName(b.profiles)}
            </div>
            {chipH > 36 && (
              <div style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {formatTime(b.start_time)} - {formatTime(b.end_time)} | {b.session_duration}min
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const renderOverlayEvent = (event, top, height, compact) => {
    const src = classifyEvent(event);
    const color = SRC[src];
    const bg = SRC[src + "Bg"];
    const chipH = Math.max(height, compact ? 20 : 28);
    const isLocal = event._local;
    const isBeingDragged = isDragging && dragRef.current?.id === event.id;
    return (
      <div key={event.id || event.summary}
      draggable={isLocal}
      onDragStart={isLocal ? (e) => { setHover(null); handleDragStart(e, event, "event"); } : undefined}
      onMouseEnter={(e) => setHover({ type: "event", data: event, x: e.clientX, y: e.clientY })}
      onMouseMove={(e) => setHover(h => h ? { ...h, x: e.clientX, y: e.clientY } : null)}
      onMouseLeave={() => setHover(null)}
      style={{
        position: "absolute", top, left: 2, right: 2, zIndex: 4,
        height: chipH,
        pointerEvents: isDragging ? "none" : "auto",
        opacity: isBeingDragged ? 0.3 : 1,
        padding: compact ? "2px 4px" : "4px 8px",
        borderRadius: compact ? 4 : 6,
        fontSize: compact ? 11 : 13,
        background: bg, border: `1px solid ${color}`,
        overflow: "hidden",
        boxSizing: "border-box",
        cursor: isLocal ? "pointer" : "default",
      }}
      onClick={isLocal ? (e) => { e.stopPropagation(); setHover(null); openEditEventModal(event); } : undefined}
      >
        {compact ? (
          <span style={{ color, whiteSpace: "nowrap" }}>{event.summary || "Busy"}</span>
        ) : (
          <>
            <div style={{ fontWeight: 500, color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{event.summary || "Busy"}</div>
            {chipH > 36 && (
              <div style={{ fontSize: 12, color: C.muted }}>
                {event.start?.dateTime ? formatTime(event.start.dateTime) : "All day"}
                {event.end?.dateTime ? ` - ${formatTime(event.end.dateTime)}` : ""}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  // --- VIEWS ---

  // Get all bookings + events for a given date, with pixel position info
  const getItemsForDate = (date, rowH) => {
    const firstHour = HOURS[0];
    const items = [];
    bookings.forEach(b => {
      if (dateStr(new Date(b.start_time)) !== date) return;
      const startMin = new Date(b.start_time).getHours() * 60 + new Date(b.start_time).getMinutes();
      const endMin = new Date(b.end_time).getHours() * 60 + new Date(b.end_time).getMinutes();
      items.push({
        type: "booking", data: b,
        top: ((startMin - firstHour * 60) / 60) * rowH,
        height: ((endMin - startMin) / 60) * rowH,
      });
    });
    googleEvents.forEach(ev => {
      const eDate = (ev.start?.dateTime || ev.start?.date || "").split("T")[0];
      if (eDate !== date) return;
      if (!ev.start?.dateTime) return;
      const startMin = new Date(ev.start.dateTime).getHours() * 60 + new Date(ev.start.dateTime).getMinutes();
      const endD = ev.end?.dateTime ? new Date(ev.end.dateTime) : null;
      const endMin = endD ? endD.getHours() * 60 + endD.getMinutes() : startMin + 60;
      items.push({
        type: "event", data: ev,
        top: ((startMin - firstHour * 60) / 60) * rowH,
        height: Math.max(((endMin - startMin) / 60) * rowH, rowH * 0.5),
      });
    });
    return items;
  };

  const renderDayView = () => {
    const date = dateStr(currentDate);
    const totalH = HOURS.length * DAY_ROW_H;
    const overlayItems = getItemsForDate(date, DAY_ROW_H);
    return (
      <div style={{ border: `0.5px solid ${C.gridLine}`, borderRadius: 8, userSelect: "none" }}>
        <div style={{ display: "flex" }}>
          {/* Time labels */}
          <div style={{ width: 70, flexShrink: 0 }}>
            {HOURS.map(h => (
              <div key={h} style={{ height: DAY_ROW_H, padding: "8px", fontSize: 12, color: C.hint, borderBottom: `0.5px solid ${C.gridLine}`, borderRight: `0.5px solid ${C.gridLine}`, boxSizing: "border-box" }}>
                {formatHour(h)}
              </div>
            ))}
          </div>
          {/* Grid + overlay */}
          <div style={{ flex: 1, position: "relative", height: totalH }}>
            {/* Background rows (for colors, selection, interactions) */}
            {HOURS.map(h => {
              const avail = isSlotAvailable(date, h);
              const occupied = isHourOccupied(date, h);

              const selected = isCellSelected(date, h);
              return (
                <div
                  key={h}
                  style={{
                    height: DAY_ROW_H, borderBottom: `0.5px solid ${C.gridLine}`,
                    background: selected ? "#b2dfdb" : (avail || isHourOccupied(date, h)) ? SRC.available : "#fafafa",
                    cursor: !occupied ? "crosshair" : "default",
                    boxSizing: "border-box",
                  }}
                  onMouseDown={(e) => handleCellMouseDown(e, date, h)}
                  onMouseEnter={() => handleCellMouseEnter(date, h)}
                  onDragOver={(e) => handleDragOver(e, date, h)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, date, h)}
                />
              );
            })}
            {/* Overlay: positioned items */}
            {overlayItems.map(item => {
              if (item.type === "booking") {
                return renderOverlayBooking(item.data, item.top, item.height, false);
              }
              if (item.type === "event") {
                return renderOverlayEvent(item.data, item.top, item.height, false);
              }
              return null;
            })}
            {/* Drag ghost preview */}
            {dragOver?.date === date && renderDragGhost(DAY_ROW_H)}
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
        <div style={{ display: "flex", minWidth: isMobile ? 770 : "auto" }}>
          {/* Time labels column */}
          <div style={{ width: 70, flexShrink: 0 }}>
            {/* Header spacer */}
            <div style={{ height: 36, borderBottom: `0.5px solid ${C.gridLine}`, borderRight: `0.5px solid ${C.gridLine}`, background: "#fafafa" }} />
            {HOURS.map(h => (
              <div key={h} style={{ height: WEEK_ROW_H, padding: "8px 6px", fontSize: 12, color: C.hint, borderBottom: `0.5px solid ${C.gridLine}`, borderRight: `0.5px solid ${C.gridLine}`, boxSizing: "border-box" }}>
                {formatHour(h)}
              </div>
            ))}
          </div>
          {/* Day columns */}
          {days.map((d, i) => {
            const date = dateStr(d);
            const overlayItems = getItemsForDate(date, WEEK_ROW_H);
            return (
              <div key={i} style={{ flex: 1, minWidth: 0, borderRight: i < 6 ? `0.5px solid ${C.gridLine}` : "none" }}>
                {/* Day header */}
                <div style={{
                  height: 36, textAlign: "center", padding: "4px 0",
                  borderBottom: `0.5px solid ${C.gridLine}`, background: "#fafafa",
                  fontWeight: sameDay(d, new Date()) ? 600 : 400,
                  color: sameDay(d, new Date()) ? C.teal : C.text,
                }}>
                  <div style={{ fontSize: 11, color: C.hint }}>{DAYS_SHORT[d.getDay()]}</div>
                  <div style={{ fontSize: 14 }}>{d.getDate()}</div>
                </div>
                {/* Time grid + overlay */}
                <div style={{ position: "relative", height: totalH }}>
                  {/* Background rows */}
                  {HOURS.map(h => {
                    const avail = isSlotAvailable(date, h);
                    const occupied = isHourOccupied(date, h);
      
                    const selected = isCellSelected(date, h);
                    return (
                      <div
                        key={h}
                        style={{
                          height: WEEK_ROW_H, borderBottom: `0.5px solid ${C.gridLine}`,
                          background: selected ? "#b2dfdb" : (avail || isHourOccupied(date, h)) ? SRC.available : "#fafafa",
                          cursor: !occupied ? "crosshair" : "default",
                          boxSizing: "border-box",
                        }}
                        onMouseDown={(e) => handleCellMouseDown(e, date, h)}
                        onMouseEnter={() => handleCellMouseEnter(date, h)}
                        onDragOver={(e) => handleDragOver(e, date, h)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, date, h)}
                      />
                    );
                  })}
                  {/* Overlay: positioned items */}
                  {overlayItems.map(item => {
                    if (item.type === "booking") return renderOverlayBooking(item.data, item.top, item.height, true);
                    if (item.type === "event") return renderOverlayEvent(item.data, item.top, item.height, true);
                    return null;
                  })}
                  {/* Drag ghost preview */}
                  {dragOver?.date === date && renderDragGhost(WEEK_ROW_H)}
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
      <div style={{ border: `0.5px solid ${C.gridLine}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", background: "#fafafa" }}>
          {DAYS_SHORT.map(d => (
            <div key={d} style={{ textAlign: "center", padding: "8px 4px", fontSize: 12, color: C.hint, borderBottom: `0.5px solid ${C.gridLine}` }}>{d}</div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
            {week.map((day, di) => {
              const date = dateStr(day);
              const isCurrentMonth = day.getMonth() === m;
              const dayBookings = getBookingsForDate(date);
              const dayEvents = getEventsForDate(date);
              const daySlots = (availability[date] || []).length;

              return (
                <div
                  key={di}
                  style={{
                    minHeight: 80, padding: "4px 6px",
                    borderBottom: wi < weeks.length - 1 ? `0.5px solid ${C.gridLine}` : "none",
                    borderRight: di < 6 ? `0.5px solid ${C.gridLine}` : "none",
                    opacity: isCurrentMonth ? 1 : 0.4,
                    cursor: "pointer",
                    background: sameDay(day, new Date()) ? C.tealLight : "transparent",
                  }}
                  onClick={() => { setCurrentDate(day); setView("day"); }}
                >
                  <div style={{ fontSize: 13, fontWeight: sameDay(day, new Date()) ? 600 : 400, color: C.text, marginBottom: 4 }}>
                    {day.getDate()}
                  </div>
                  {(daySlots > 0 || dayBookings.length > 0 || dayEvents.length > 0) && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {daySlots > 0 && <div style={{ height: 4, borderRadius: 2, background: SRC.available }} />}
                      {dayEvents.filter(e => classifyEvent(e) === "sp").length > 0 && <div style={{ height: 4, borderRadius: 2, background: SRC.sp }} />}
                      {dayBookings.map(b => (
                        <div key={b.id} style={{ height: 4, borderRadius: 2, background: b.status === "requested" ? SRC.requested : SRC.coaching }} />
                      ))}
                    </div>
                  )}
                  {dayBookings.slice(0, 2).map(b => (
                    <div key={b.id} style={{
                      fontSize: 10, color: b.status === "requested" ? SRC.requested : SRC.coaching,
                      marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      cursor: "pointer",
                    }} onClick={(e) => {
                      e.stopPropagation();
                      if (b.status === "requested") openAcceptModal(b);
                      else openEditModal(b);
                    }}>
                      {formatTime(b.start_time)} {clientFirstName(b.profiles)}
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

  // --- Modals ---

  const renderModal = () => {
    if (!modal) return null;

    return (
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
      }} onClick={closeModal}>
        <div style={{ ...S.card, maxWidth: 480, width: "90%", margin: 0, maxHeight: "80vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>

          {modal.mode === "choose" && renderChooseContent()}
          {modal.mode === "accept" && renderAcceptContent()}
          {modal.mode === "edit" && renderEditContent()}
          {modal.mode === "book" && renderBookContent()}
          {modal.mode === "event" && renderEventContent()}
          {modal.mode === "editEvent" && renderEditEventContent()}

          {modalError && <p style={{ fontSize: 13, color: "#c0392b", marginTop: 8 }}>{modalError}</p>}
        </div>
      </div>
    );
  };

  const renderChooseContent = () => {
    const dateLabel = bookDate
      ? new Date(bookDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
      : "";
    const timeRange = bookTime && eventEndTime
      ? `${formatTimeStr(bookTime)} \u2013 ${formatTimeStr(eventEndTime)}`
      : bookTime ? `at ${formatTimeStr(bookTime)}` : "";
    return (
      <>
        <h3 style={S.h3}>New Entry</h3>
        {dateLabel && <p style={{ ...S.p, fontSize: 13 }}>{dateLabel}{timeRange ? ` \u00b7 ${timeRange}` : ""}</p>}
        <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
          <div
            onClick={() => openBookModal()}
            style={{
              flex: 1, padding: "1.5rem 1rem", textAlign: "center", borderRadius: 12, cursor: "pointer",
              border: `1px solid ${C.teal}`, background: C.tealLight,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, color: C.teal, marginBottom: 4 }}>Session</div>
            <div style={{ fontSize: 12, color: C.muted }}>Book a coaching session for a client</div>
          </div>
          <div
            onClick={() => openEventModal()}
            style={{
              flex: 1, padding: "1.5rem 1rem", textAlign: "center", borderRadius: 12, cursor: "pointer",
              border: `1px solid ${C.gridLine}`, background: "#fafafa",
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 4 }}>Event</div>
            <div style={{ fontSize: 12, color: C.muted }}>Add a personal or other calendar event</div>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <button style={S.btnSmOut} onClick={closeModal}>Cancel</button>
        </div>
      </>
    );
  };

  const renderAcceptContent = () => {
    const b = modal.booking;
    return (
      <>
        <h3 style={S.h3}>Session Request</h3>
        <div style={{ fontSize: 14, color: C.text, marginBottom: 8 }}>
          <p><strong>Client:</strong> {b.profiles?.first_name} {b.profiles?.last_name}</p>
          <p><strong>Date:</strong> {b.date}</p>
          <p><strong>Time:</strong> {formatTime(b.start_time)} - {formatTime(b.end_time)}</p>
          <p><strong>Duration:</strong> {b.session_duration} min</p>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button style={S.btn} onClick={() => handleAcceptDecline("accept")} disabled={modalSaving}>Accept</button>
          <button style={{ ...S.btnOutline, color: SRC.requested, border: `1px solid ${SRC.requested}` }} onClick={() => handleAcceptDecline("decline")} disabled={modalSaving}>Decline</button>
          <button style={S.btnSmOut} onClick={closeModal}>Close</button>
        </div>
      </>
    );
  };

  const renderEditContent = () => {
    const b = modal.booking;
    return (
      <>
        <h3 style={S.h3}>Edit Session</h3>
        <p style={{ ...S.p, fontSize: 13, marginBottom: 12 }}>
          <strong>Client:</strong> {b.profiles?.first_name} {b.profiles?.last_name}
        </p>

        <label style={S.label}>Session type</label>
        <select style={{ ...S.input, cursor: "pointer" }} value={bookType} onChange={e => setBookType(e.target.value)}>
          {sessionTypes.map(t => (
            <option key={t.id} value={t.id}>{t.label} ({t.duration}min)</option>
          ))}
        </select>

        <div style={{ display: "flex", gap: "1rem" }}>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Date</label>
            <input style={S.input} type="date" value={bookDate} onChange={e => setBookDate(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Time</label>
            <input style={S.input} type="time" value={bookTime} onChange={e => setBookTime(e.target.value)} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button style={S.btn} onClick={handleUpdateBooking} disabled={modalSaving}>
            {modalSaving ? "Saving..." : "Save Changes"}
          </button>
          <button style={{ ...S.btnSmOut, color: "#c0392b", border: "1px solid #c0392b" }} onClick={() => handleCancelBooking()} disabled={modalSaving}>
            Cancel Session
          </button>
          <button style={S.btnSmOut} onClick={closeModal}>Close</button>
        </div>
      </>
    );
  };

  const renderBookContent = () => {
    const clientList = clients.filter(c => c.role === "client");
    return (
      <>
        <h3 style={S.h3}>Book a Session</h3>

        <label style={S.label}>Client</label>
        <select style={{ ...S.input, cursor: "pointer" }} value={bookClient} onChange={e => setBookClient(e.target.value)}>
          <option value="">Select a client...</option>
          {clientList.map(c => (
            <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
          ))}
        </select>

        <label style={S.label}>Session type</label>
        <select style={{ ...S.input, cursor: "pointer" }} value={bookType} onChange={e => setBookType(e.target.value)}>
          <option value="">Select a session type...</option>
          {sessionTypes.map(t => (
            <option key={t.id} value={t.id}>{t.label} ({t.duration}min)</option>
          ))}
        </select>

        <div style={{ display: "flex", gap: "1rem" }}>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Date</label>
            <input style={S.input} type="date" value={bookDate} onChange={e => setBookDate(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Time</label>
            <input style={S.input} type="time" value={bookTime} onChange={e => setBookTime(e.target.value)} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button style={S.btn} onClick={handleBookSession} disabled={modalSaving}>
            {modalSaving ? "Booking..." : "Book Session"}
          </button>
          <button style={S.btnSmOut} onClick={closeModal}>Cancel</button>
        </div>
      </>
    );
  };

  const renderEventContent = () => {
    return (
      <>
        <h3 style={S.h3}>Add Event</h3>

        <label style={S.label}>Title</label>
        <input style={S.input} placeholder="e.g. Lunch, Meeting, Personal" value={eventTitle} onChange={e => setEventTitle(e.target.value)} />

        <div style={{ display: "flex", gap: "1rem" }}>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Date</label>
            <input style={S.input} type="date" value={bookDate} onChange={e => setBookDate(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Start</label>
            <input style={S.input} type="time" value={bookTime} onChange={e => setBookTime(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.label}>End</label>
            <input style={S.input} type="time" value={eventEndTime} onChange={e => setEventEndTime(e.target.value)} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button style={S.btn} onClick={handleCreateEvent} disabled={modalSaving}>
            {modalSaving ? "Creating..." : "Create Event"}
          </button>
          <button style={S.btnSmOut} onClick={closeModal}>Cancel</button>
        </div>
      </>
    );
  };

  const renderHoverTooltip = () => {
    if (!hover) return null;
    const { type, data, x, y } = hover;

    let content;
    if (type === "booking") {
      const b = data;
      content = (
        <>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {clientName(b.profiles)}
          </div>
          <div>{b.session_types?.label || "Session"}</div>
          <div>{formatTime(b.start_time)} – {formatTime(b.end_time)}</div>
          <div>{b.session_duration} min</div>
          <div style={{ marginTop: 4, fontStyle: "italic", color: b.status === "requested" ? SRC.requested : C.teal }}>
            {b.status}
          </div>
        </>
      );
    } else {
      const ev = data;
      content = (
        <>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{ev.summary || "Event"}</div>
          <div>
            {ev.start?.dateTime ? formatTime(ev.start.dateTime) : "All day"}
            {ev.end?.dateTime ? ` – ${formatTime(ev.end.dateTime)}` : ""}
          </div>
          {ev._local && (
            <div style={{ marginTop: 4, fontSize: 11, color: C.hint }}>
              {ev._synced ? "Synced to Google" : "Local only"}
            </div>
          )}
        </>
      );
    }

    return (
      <div style={{
        position: "fixed",
        left: x + 12,
        top: y + 12,
        zIndex: 50,
        background: "#fff",
        border: `1px solid ${C.gridLine}`,
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: 13,
        color: C.text,
        boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
        pointerEvents: "none",
        maxWidth: 260,
        lineHeight: 1.5,
      }}>
        {content}
      </div>
    );
  };

  const renderDragGhost = (rowH) => {
    if (!dragOver || !dragRef.current) return null;
    const firstHour = HOURS[0];
    const { snapMinutes, blocked } = dragOver;
    const durationMin = dragRef.current._durationMin || 60;
    const isBooking = dragRef.current._dragType === "booking";
    const isRequested = isBooking && dragRef.current.status === "requested";

    const top = ((snapMinutes - firstHour * 60) / 60) * rowH;
    const height = (durationMin / 60) * rowH;

    const bgColor = blocked ? "rgba(192,57,43,0.12)"
      : isRequested ? "rgba(192,57,43,0.15)"
      : isBooking ? "rgba(15,110,86,0.15)"
      : "rgba(184,134,11,0.15)";
    const borderColor = blocked ? "#c0392b"
      : isRequested ? "#c0392b"
      : isBooking ? C.teal
      : "#B8860B";

    return (
      <div style={{
        position: "absolute", top, left: 2, right: 2, zIndex: 5,
        height,
        borderRadius: 6,
        background: bgColor,
        border: `2px dashed ${borderColor}`,
        boxSizing: "border-box",
        pointerEvents: "none",
      }} />
    );
  };

  const renderDragTooltip = () => {
    if (!dragOver || !dragRef.current) return null;
    const { date, snapTime, blocked, x, y } = dragOver;
    const dateLabel = new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const timeLabel = snapTime ? formatTimeStr(snapTime) : "";
    return (
      <div style={{
        position: "fixed",
        left: x + 16,
        top: y - 36,
        zIndex: 1000,
        background: blocked ? "#c0392b" : C.teal,
        color: "#fff",
        borderRadius: 6,
        padding: "5px 12px",
        fontSize: 13,
        fontWeight: 500,
        pointerEvents: "none",
        whiteSpace: "nowrap",
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
      }}>
        {dateLabel} · {timeLabel}
      </div>
    );
  };

  const renderEditEventContent = () => {
    return (
      <>
        <h3 style={S.h3}>Edit Event</h3>

        <label style={S.label}>Title</label>
        <input style={S.input} value={eventTitle} onChange={e => setEventTitle(e.target.value)} />

        <div style={{ display: "flex", gap: "1rem" }}>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Date</label>
            <input style={S.input} type="date" value={bookDate} onChange={e => setBookDate(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Start</label>
            <input style={S.input} type="time" value={bookTime} onChange={e => setBookTime(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.label}>End</label>
            <input style={S.input} type="time" value={eventEndTime} onChange={e => setEventEndTime(e.target.value)} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button style={S.btn} onClick={handleUpdateEvent} disabled={modalSaving}>
            {modalSaving ? "Saving..." : "Save Changes"}
          </button>
          <button style={{ ...S.btnSmOut, color: "#c0392b", border: "1px solid #c0392b" }} onClick={handleDeleteEvent} disabled={modalSaving}>
            Delete Event
          </button>
          <button style={S.btnSmOut} onClick={closeModal}>Close</button>
        </div>
      </>
    );
  };

  return (
    <div style={S.page}>
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
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: C.muted, marginBottom: 12 }}>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: SRC.available, marginRight: 4 }} />Available</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: SRC.coaching, marginRight: 4 }} />Coaching</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: SRC.sp, marginRight: 4 }} />SimplePractice</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: SRC.personal, marginRight: 4 }} />Personal</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, border: `2px solid ${SRC.requested}`, marginRight: 4 }} />Requested</span>
      </div>

      <p style={{ ...S.p, fontSize: 12, color: C.hint, marginBottom: 12 }}>
        Click or drag across empty cells to add a session or event. Click a session to edit or cancel. Drag sessions to reschedule.
      </p>

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
      {hover && !modal && renderHoverTooltip()}
      {dragOver && dragRef.current && renderDragTooltip()}
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
