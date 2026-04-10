"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { C, S } from "@/lib/constants";
import { useIsMobile } from "@/lib/hooks";
import MiniCalendar from "@/components/portal/MiniCalendar";

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7am - 8pm
const DAY_ROW_H = 52;
const WEEK_ROW_H = 44;
const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Source colors. Coaching uses a green in the same family as Available so
// the two read as related (available slot → confirmed coaching session).
const SRC = {
  coaching: "#2e7d32",       // dark green (readable on light bg)
  coachingBg: "#c8e6c9",     // mid-light green (distinct from Available's paler tint)
  sp: "#6b46c1",
  spBg: "#ede9fe",
  personal: "#B8860B",
  personalBg: "#FFF8E7",
  available: "#d4edda",      // pale green
  requested: "#c0392b",
  requestedBg: "#fdecea",
};

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

function formatTimeStr(t) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:${String(m).padStart(2, "0")} ${ampm}`;
}

// Client display-name helper with fallbacks
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

// Classify a Google event as SimplePractice, personal, or coaching.
// The source calendar name (set server-side in listEvents) is the most reliable
// signal; summary/organizer matching is the fallback for events from the primary.
function classifyEvent(event) {
  const calName = (event._sourceCalendarName || "").toLowerCase();
  if (calName.includes("simplepractice")) return "sp";
  const summary = (event.summary || "").toLowerCase();
  if (summary.includes("coaching:") || summary.includes("clt-")) return "coaching";
  if (event.organizer?.email?.includes("simplepractice") || summary.includes("simplepractice") || summary.includes("therapy") || summary.includes("session")) return "sp";
  return "personal";
}

export default function AdminSchedule() {
  const mobile = useIsMobile();
  const [view, setView] = useState("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [bookings, setBookings] = useState([]);
  const [availability, setAvailability] = useState({});
  const [googleEvents, setGoogleEvents] = useState([]);
  const [clients, setClients] = useState([]);
  const [sessionTypes, setSessionTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [increment, setIncrement] = useState(30);

  // Modal state: mode = "choose"|"accept"|"edit"|"book"|"event"|"editEvent"
  const [modal, setModal] = useState(null);
  const [bookClient, setBookClient] = useState("");
  const [bookType, setBookType] = useState("");
  const [bookDate, setBookDate] = useState("");
  const [bookTime, setBookTime] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [eventEndTime, setEventEndTime] = useState("");
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState(null);

  // Drag-to-move state (existing bookings + events)
  const dragRef = useRef(null);
  const [dragOver, setDragOver] = useState(null); // { date, hour, snapTime, snapMinutes, blocked, x, y, itemId, durationMin, status, dragType }
  const [pendingMove, setPendingMove] = useState(null); // awaiting confirmation

  // Range selection state (click-drag to select contiguous empty slots)
  const selectRef = useRef(null); // { date, anchorMin }
  const [selection, setSelection] = useState(null); // { date, startMin, endMin, x, y }

  // Hover tooltip state
  const [hover, setHover] = useState(null); // { kind: "booking"|"event", data, x, y }

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
    // Derive scheduling increment from slot spacing
    const availData = availRes && !availRes.error ? availRes : {};
    for (const dateKey of Object.keys(availData)) {
      const slots = availData[dateKey];
      if (slots && slots.length >= 2) {
        const [h0, m0] = slots[0].split(":").map(Number);
        const [h1, m1] = slots[1].split(":").map(Number);
        setIncrement((h1 * 60 + m1) - (h0 * 60 + m0));
        break;
      }
    }
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

  // --- Modal open/close helpers ---

  const minToTime = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

  const openChooseModal = (date, startMin, endMin) => {
    setBookDate(date);
    setBookTime(startMin != null ? minToTime(startMin) : "");
    setEventEndTime(endMin != null ? minToTime(endMin) : "");
    setModalError(null);
    setSelection(null);
    setModal({ mode: "choose" });
  };

  const openBookModal = () => {
    setBookClient("");
    setBookType("");
    setModalError(null);
    setModal({ mode: "book" });
  };

  const openEventModal = () => {
    setEventTitle("");
    setModalError(null);
    setModal({ mode: "event" });
  };

  const openEditModal = (booking) => {
    setBookType(booking.session_type_id || "");
    setBookDate(booking.date);
    setBookTime(booking.time_slot);
    setModalError(null);
    setModal({ mode: "edit", booking });
  };

  const openEditEventModal = (event) => {
    setEventTitle(event.summary || "");
    setBookDate(event.start?.dateTime ? dateStr(new Date(event.start.dateTime)) : "");
    const startD = event.start?.dateTime ? new Date(event.start.dateTime) : null;
    const endD = event.end?.dateTime ? new Date(event.end.dateTime) : null;
    setBookTime(startD ? `${String(startD.getHours()).padStart(2, "0")}:${String(startD.getMinutes()).padStart(2, "0")}` : "");
    setEventEndTime(endD ? `${String(endD.getHours()).padStart(2, "0")}:${String(endD.getMinutes()).padStart(2, "0")}` : "");
    setModalError(null);
    setModal({ mode: "editEvent", event });
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

  // --- Action handlers ---

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
      const err = await res.json().catch(() => ({}));
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
      const err = await res.json().catch(() => ({}));
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
      const err = await res.json().catch(() => ({}));
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
      const err = await res.json().catch(() => ({}));
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
    else { const err = await res.json().catch(() => ({})); setModalError(err.error || "Could not update event."); }
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
    else { const err = await res.json().catch(() => ({})); setModalError(err.error || "Could not delete event."); }
  };

  const handleCancelBooking = async () => {
    const id = modal?.booking?.id;
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
      const err = await res.json().catch(() => ({}));
      setModalError(err.error || "Could not cancel booking.");
    }
  };

  // --- Range selection (click-drag on empty cells) ---
  // Uses minute-level precision snapped to the scheduling increment.

  // Compute the minute-of-day inside a cell based on cursor position.
  const minFromCellEvent = (e, hour) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rowH = view === "day" ? DAY_ROW_H : WEEK_ROW_H;
    const fractionInRow = Math.max(0, Math.min(0.999, (e.clientY - rect.top) / rowH));
    const minuteInHour = Math.floor(fractionInRow * 60 / increment) * increment;
    return hour * 60 + minuteInHour;
  };

  const handleCellMouseDown = (e, date, hour) => {
    if (e.target !== e.currentTarget && e.target.closest("[draggable]")) return;
    if (isHourOccupied(date, hour)) return;
    const anchorMin = minFromCellEvent(e, hour);
    selectRef.current = { date, anchorMin };
    setSelection({ date, startMin: anchorMin, endMin: anchorMin + increment, x: e.clientX, y: e.clientY });
  };

  const handleCellMouseMove = (e, date, hour) => {
    if (!selectRef.current || selectRef.current.date !== date) return;
    const curMin = minFromCellEvent(e, hour);
    const anchor = selectRef.current.anchorMin;
    // Build an inclusive range that always contains at least the anchor slot
    let startMin = Math.min(anchor, curMin);
    let endMin = Math.max(anchor, curMin) + increment;
    setSelection({ date, startMin, endMin, x: e.clientX, y: e.clientY });
  };

  // Commit selection on global mouseup so a mouseup outside a cell still closes the range
  useEffect(() => {
    const handleGlobalUp = () => {
      if (selectRef.current && selection) {
        const sel = selection;
        selectRef.current = null;
        openChooseModal(sel.date, sel.startMin, sel.endMin);
      } else {
        selectRef.current = null;
      }
    };
    window.addEventListener("mouseup", handleGlobalUp);
    return () => window.removeEventListener("mouseup", handleGlobalUp);
  });

  // --- Drag and drop (move existing bookings and local events) ---

  const handleDragStart = (e, item, type) => {
    let durationMin = 60;
    if (type === "booking") {
      durationMin = item.session_duration || 60;
    } else if (type === "event" && item.start?.dateTime && item.end?.dateTime) {
      durationMin = (new Date(item.end.dateTime) - new Date(item.start.dateTime)) / 60000;
    }
    dragRef.current = { ...item, _dragType: type, _durationMin: durationMin };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", item.id);

    const startTime = type === "booking" ? item.time_slot : null;
    const startDateTime = type === "event" && item.start?.dateTime ? new Date(item.start.dateTime) : null;
    const startH = startTime ? parseInt(startTime.split(":")[0]) : startDateTime ? startDateTime.getHours() : 0;
    const startM = startTime ? parseInt(startTime.split(":")[1]) : startDateTime ? startDateTime.getMinutes() : 0;
    const itemDate = type === "booking" ? item.date : (startDateTime ? dateStr(startDateTime) : dateStr(currentDate));

    setDragOver({
      date: itemDate, hour: startH,
      snapTime: `${String(startH).padStart(2, "0")}:${String(startM).padStart(2, "0")}`,
      snapMinutes: startH * 60 + startM,
      x: e.clientX, y: e.clientY,
      itemId: item.id,
      durationMin,
      status: item.status,
      dragType: type,
    });

    // Hide native drag ghost so our own tooltip is visible
    const ghost = document.createElement("div");
    ghost.style.position = "absolute";
    ghost.style.top = "-9999px";
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => document.body.removeChild(ghost), 0);
  };

  // Check if dropping at the given minute would overlap another item
  const wouldOverlap = (date, startMin, durationMin) => {
    const endMin = startMin + durationMin;
    const dragId = dragRef.current?.id;
    const bookingOverlap = bookings.some(b => {
      if (b.id === dragId) return false;
      if (!["requested", "booked"].includes(b.status)) return false;
      const bDate = b.date || dateStr(new Date(b.start_time));
      if (bDate !== date) return false;
      const [bH, bM] = (b.time_slot || "00:00").split(":").map(Number);
      const bStart = bH * 60 + bM;
      const bEnd = bStart + (b.session_duration || 60);
      return startMin < bEnd && endMin > bStart;
    });
    if (bookingOverlap) return true;
    return googleEvents.some(ev => {
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
  };

  const handleDragOver = (e, date, hour) => {
    e.preventDefault();
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
    setDragOver(prev => ({
      ...prev,
      date, hour, snapTime, snapMinutes: totalMinutes, blocked,
      x: e.clientX, y: e.clientY,
    }));
  };

  const handleDragLeave = () => { /* Avoid flicker; cleared on drop/end */ };

  const handleDragEnd = () => {
    setDragOver(null);
    dragRef.current = null;
  };

  // When a drop is blocked the browser fires dragend instead of drop, so listen
  // globally to clear the ghost / tooltip / faded-source state on mouseUp.
  useEffect(() => {
    const onEnd = () => {
      setTimeout(() => { if (dragRef.current) handleDragEnd(); }, 0);
    };
    window.addEventListener("dragend", onEnd);
    return () => window.removeEventListener("dragend", onEnd);
  }, []);

  const handleDrop = (e, date, hour) => {
    e.preventDefault();
    if (dragOver?.blocked) {
      handleDragEnd();
      return;
    }
    const newTime = dragOver?.snapTime || `${String(hour).padStart(2, "0")}:00`;
    const item = dragRef.current;
    handleDragEnd();
    if (!item) return;

    if (item._dragType === "booking") {
      if (item.date === date && item.time_slot === newTime) return;
      setPendingMove({ kind: "booking", item, newDate: date, newTime });
    } else {
      const oldStart = new Date(item.start.dateTime);
      const oldDate = dateStr(oldStart);
      const oldTime = `${String(oldStart.getHours()).padStart(2, "0")}:${String(oldStart.getMinutes()).padStart(2, "0")}`;
      if (oldDate === date && oldTime === newTime) return;
      setPendingMove({ kind: "event", item, newDate: date, newTime });
    }
  };

  const confirmPendingMove = async () => {
    if (!pendingMove) return;
    setModalSaving(true);
    const { kind, item, newDate, newTime } = pendingMove;
    let res;
    if (kind === "booking") {
      res = await fetch("/api/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, action: "update", date: newDate, start_time: newTime }),
      });
    } else {
      // Calculate new end time preserving duration
      const oldStart = new Date(item.start.dateTime);
      const oldEnd = new Date(item.end.dateTime);
      const durationMin = (oldEnd - oldStart) / 60000;
      const [newH, newM] = newTime.split(":").map(Number);
      const newStartMin = newH * 60 + newM;
      const newEndMin = newStartMin + durationMin;
      const endTimeStr = `${String(Math.floor(newEndMin / 60)).padStart(2, "0")}:${String(newEndMin % 60).padStart(2, "0")}`;
      res = await fetch("/api/calendar/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          date: newDate,
          start_time: newTime,
          end_time: endTimeStr,
          tz_offset: new Date().getTimezoneOffset(),
        }),
      });
    }
    setModalSaving(false);
    if (res.ok) {
      setPendingMove(null);
      loadData();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Could not move item.");
      setPendingMove(null);
    }
  };

  const cancelPendingMove = () => setPendingMove(null);

  // --- Data helpers ---

  const isHourBooking = (date, hour) => {
    const hourStart = hour * 60;
    const hourEnd = hourStart + 60;
    return bookings.some(b => {
      const bDate = b.date || dateStr(new Date(b.start_time));
      if (bDate !== date) return false;
      const bStart = new Date(b.start_time).getHours() * 60 + new Date(b.start_time).getMinutes();
      const bEnd = new Date(b.end_time).getHours() * 60 + new Date(b.end_time).getMinutes();
      return bStart < hourEnd && bEnd > hourStart;
    });
  };

  const isHourOccupied = (date, hour) => {
    // Used by range-selection and drag-drop to prevent selecting occupied slots.
    // Both bookings and events count as "occupied" here.
    const hourStart = hour * 60;
    const hourEnd = hourStart + 60;
    if (isHourBooking(date, hour)) return true;
    return googleEvents.some(e => {
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

  const isSlotAvailable = (date, time) => (availability[date] || []).includes(time);

  // Combine bookings + events into positioned overlay items for a date
  const getItemsForDate = (date, rowH) => {
    const firstHour = HOURS[0];
    const items = [];
    bookings.forEach(b => {
      const bDate = b.date || dateStr(new Date(b.start_time));
      if (bDate !== date) return;
      const startMin = new Date(b.start_time).getHours() * 60 + new Date(b.start_time).getMinutes();
      const endMin = new Date(b.end_time).getHours() * 60 + new Date(b.end_time).getMinutes();
      items.push({
        kind: "booking", data: b,
        top: ((startMin - firstHour * 60) / 60) * rowH,
        height: ((endMin - startMin) / 60) * rowH,
      });
    });
    googleEvents.forEach(ev => {
      if (!ev.start?.dateTime) return;
      const eDate = ev.start.dateTime.split("T")[0];
      if (eDate !== date) return;
      const startMin = new Date(ev.start.dateTime).getHours() * 60 + new Date(ev.start.dateTime).getMinutes();
      const endD = ev.end?.dateTime ? new Date(ev.end.dateTime) : null;
      const endMin = endD ? endD.getHours() * 60 + endD.getMinutes() : startMin + 60;
      items.push({
        kind: "event", data: ev,
        top: ((startMin - firstHour * 60) / 60) * rowH,
        height: Math.max(((endMin - startMin) / 60) * rowH, rowH * 0.5),
      });
    });
    return items;
  };

  const getBookingsForDate = (date) =>
    bookings.filter(b => (b.date || dateStr(new Date(b.start_time))) === date);

  const getEventsForDate = (date) =>
    googleEvents.filter(e => (e.start?.dateTime || e.start?.date || "").split("T")[0] === date);

  // --- Render helpers ---

  const renderOverlayBooking = (b, top, height, compact) => {
    const isRequested = b.status === "requested";
    const chipH = Math.max(height, compact ? 20 : 28);
    const canDrag = ["requested", "booked"].includes(b.status);
    return (
      <div
        key={b.id}
        draggable={canDrag}
        onDragStart={canDrag ? (e) => { setHover(null); handleDragStart(e, b, "booking"); } : undefined}
        onMouseEnter={(e) => setHover({ kind: "booking", data: b, x: e.clientX, y: e.clientY })}
        onMouseMove={(e) => setHover(h => h && h.kind === "booking" && h.data.id === b.id ? { ...h, x: e.clientX, y: e.clientY } : h)}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          e.stopPropagation();
          setHover(null);
          if (isRequested) openAcceptModal(b);
          else openEditModal(b);
        }}
        style={{
          position: "absolute", top, left: 2, right: 2, zIndex: 4,
          height: chipH,
          padding: compact ? "2px 4px" : "4px 8px",
          borderRadius: compact ? 4 : 6,
          fontSize: compact ? 11 : 13,
          background: isRequested ? SRC.requestedBg : SRC.coachingBg,
          border: isRequested ? `2px solid ${SRC.requested}` : `1px solid ${C.teal}`,
          opacity: dragOver && dragOver.itemId === b.id ? 0.3 : 1,
          pointerEvents: dragOver ? "none" : "auto",
          cursor: "pointer",
          overflow: "hidden",
          boxSizing: "border-box",
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
    const isLocal = !!event._local;
    return (
      <div
        key={event.id || event.summary}
        draggable={isLocal}
        onDragStart={isLocal ? (e) => { setHover(null); handleDragStart(e, event, "event"); } : undefined}
        onMouseEnter={(e) => setHover({ kind: "event", data: event, x: e.clientX, y: e.clientY })}
        onMouseMove={(e) => setHover(h => h && h.kind === "event" && h.data.id === event.id ? { ...h, x: e.clientX, y: e.clientY } : h)}
        onMouseLeave={() => setHover(null)}
        onClick={isLocal ? (e) => { e.stopPropagation(); setHover(null); openEditEventModal(event); } : undefined}
        style={{
          position: "absolute", top, left: 2, right: 2, zIndex: 4,
          height: chipH,
          padding: compact ? "2px 4px" : "4px 8px",
          borderRadius: compact ? 4 : 6,
          fontSize: compact ? 11 : 13,
          background: bg, border: `1px solid ${color}`,
          opacity: dragOver && dragOver.itemId === event.id ? 0.3 : 1,
          pointerEvents: dragOver ? "none" : "auto",
          cursor: isLocal ? "pointer" : "default",
          overflow: "hidden",
          boxSizing: "border-box",
        }}
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

  const renderDayView = () => {
    const date = dateStr(currentDate);
    const totalH = HOURS.length * DAY_ROW_H;
    const overlayItems = getItemsForDate(date, DAY_ROW_H);
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
              const hasBooking = isHourBooking(date, h);
              const occupied = isHourOccupied(date, h);
              return (
                <div key={h} style={{
                  height: DAY_ROW_H, borderBottom: `0.5px solid ${C.gridLine}`,
                  background: (avail || hasBooking) ? SRC.available : "#fafafa",
                  cursor: !occupied ? "crosshair" : "default",
                  boxSizing: "border-box",
                }}
                  onMouseDown={(e) => handleCellMouseDown(e, date, h)}
                  onMouseMove={(e) => handleCellMouseMove(e, date, h)}
                  onDragOver={(e) => handleDragOver(e, date, h)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, date, h)}
                />
              );
            })}
            {overlayItems.map(item =>
              item.kind === "booking"
                ? renderOverlayBooking(item.data, item.top, item.height, false)
                : renderOverlayEvent(item.data, item.top, item.height, false)
            )}
            {renderSelectionOverlay(date, DAY_ROW_H)}
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
            const overlayItems = getItemsForDate(date, WEEK_ROW_H);
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
                    const hasBooking = isHourBooking(date, h);
                    const occupied = isHourOccupied(date, h);
                    return (
                      <div key={h} style={{
                        height: WEEK_ROW_H, borderBottom: `0.5px solid ${C.gridLine}`,
                        background: (avail || hasBooking) ? SRC.available : "#fafafa",
                        cursor: !occupied ? "crosshair" : "default",
                        boxSizing: "border-box",
                      }}
                        onMouseDown={(e) => handleCellMouseDown(e, date, h)}
                        onMouseMove={(e) => handleCellMouseMove(e, date, h)}
                        onDragOver={(e) => handleDragOver(e, date, h)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, date, h)}
                      />
                    );
                  })}
                  {overlayItems.map(item =>
                    item.kind === "booking"
                      ? renderOverlayBooking(item.data, item.top, item.height, true)
                      : renderOverlayEvent(item.data, item.top, item.height, true)
                  )}
                  {renderSelectionOverlay(date, WEEK_ROW_H)}
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", border: `0.5px solid ${C.gridLine}`, borderRadius: 8, overflow: "hidden" }}>
        {DAYS_SHORT.map(dd => (
          <div key={dd} style={{ textAlign: "center", padding: "8px 4px", fontSize: 12, color: C.hint, background: "#fafafa", borderBottom: `0.5px solid ${C.gridLine}`, borderRight: dd !== "Sat" ? `0.5px solid ${C.gridLine}` : "none" }}>{dd}</div>
        ))}
        {weeks.map((week, wi) => (
          <React.Fragment key={wi}>
            {week.map((day, di) => {
              const date = dateStr(day);
              const isCurrentMonth = day.getMonth() === m;
              const dayBookings = getBookingsForDate(date);
              const dayEvents = getEventsForDate(date);
              const hasAvail = (availability[date] || []).length > 0;
              const chips = [];
              dayBookings.forEach(b => chips.push({ kind: "booking", data: b }));
              dayEvents.forEach(ev => chips.push({ kind: "event", data: ev }));
              chips.sort((a, b) => {
                const aT = new Date(a.data.start_time || a.data.start?.dateTime || 0).getTime();
                const bT = new Date(b.data.start_time || b.data.start?.dateTime || 0).getTime();
                return aT - bT;
              });

              return (
                <div key={di} style={{
                  minHeight: 80, padding: "4px 6px",
                  borderBottom: wi < weeks.length - 1 ? `0.5px solid ${C.gridLine}` : "none",
                  borderRight: di < 6 ? `0.5px solid ${C.gridLine}` : "none",
                  opacity: isCurrentMonth ? 1 : 0.4,
                  cursor: "pointer",
                  background: sameDay(day, new Date()) ? C.tealLight : hasAvail ? "#f0faf5" : "transparent",
                }}
                onClick={() => { setCurrentDate(new Date(date + "T12:00:00")); setView("day"); }}
                >
                  <div style={{
                    fontSize: 13, marginBottom: 4,
                    fontWeight: sameDay(day, new Date()) ? 600 : 400,
                    color: hasAvail ? C.teal : C.text,
                  }}>
                    {day.getDate()}
                  </div>
                  {chips.slice(0, 3).map((c, idx) => {
                    if (c.kind === "booking") {
                      const b = c.data;
                      const isRequested = b.status === "requested";
                      return (
                        <div key={`b${idx}${b.id}`}
                          onMouseEnter={(e) => setHover({ kind: "booking", data: b, x: e.clientX, y: e.clientY })}
                          onMouseMove={(e) => setHover(h => h && h.kind === "booking" && h.data.id === b.id ? { ...h, x: e.clientX, y: e.clientY } : h)}
                          onMouseLeave={() => setHover(null)}
                          style={{
                            fontSize: 10, padding: "1px 4px", borderRadius: 3, marginBottom: 2,
                            background: isRequested ? SRC.requestedBg : SRC.coachingBg,
                            color: isRequested ? SRC.requested : SRC.coaching,
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          }}
                        >
                          {formatTime(b.start_time)} {clientFirstName(b.profiles)}
                        </div>
                      );
                    }
                    const ev = c.data;
                    const src = classifyEvent(ev);
                    return (
                      <div key={`e${idx}${ev.id}`}
                        onMouseEnter={(e) => setHover({ kind: "event", data: ev, x: e.clientX, y: e.clientY })}
                        onMouseMove={(e) => setHover(h => h && h.kind === "event" && h.data.id === ev.id ? { ...h, x: e.clientX, y: e.clientY } : h)}
                        onMouseLeave={() => setHover(null)}
                        style={{
                          fontSize: 10, padding: "1px 4px", borderRadius: 3, marginBottom: 2,
                          background: SRC[src + "Bg"], color: SRC[src],
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        }}
                      >
                        {ev.start?.dateTime ? formatTime(ev.start.dateTime) : ""} {ev.summary || "Busy"}
                      </div>
                    );
                  })}
                  {chips.length > 3 && (
                    <div style={{ fontSize: 10, color: C.hint }}>+{chips.length - 3} more</div>
                  )}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    );
  };

  // --- Drag ghost + drag tooltip ---
  const renderDragGhost = (rowH) => {
    if (!dragOver) return null;
    const firstHour = HOURS[0];
    const { snapMinutes, blocked, durationMin = 60, status, dragType } = dragOver;
    const isRequested = dragType === "booking" && status === "requested";
    const isBooking = dragType === "booking";
    const top = ((snapMinutes - firstHour * 60) / 60) * rowH;
    const height = (durationMin / 60) * rowH;
    const bgColor = blocked ? "rgba(192,57,43,0.12)"
      : isRequested ? "rgba(192,57,43,0.15)"
      : isBooking ? "rgba(15,110,86,0.15)"
      : "rgba(184,134,11,0.15)";
    const borderColor = blocked ? SRC.requested
      : isRequested ? SRC.requested
      : isBooking ? C.teal
      : SRC.personal;
    return (
      <div style={{
        position: "absolute", top, left: 2, right: 2, zIndex: 5,
        height, borderRadius: 6,
        background: bgColor,
        border: `2px dashed ${borderColor}`,
        boxSizing: "border-box",
        pointerEvents: "none",
      }} />
    );
  };

  const renderSelectionOverlay = (date, rowH) => {
    if (!selection || selection.date !== date) return null;
    const firstHour = HOURS[0];
    const top = ((selection.startMin - firstHour * 60) / 60) * rowH;
    const height = ((selection.endMin - selection.startMin) / 60) * rowH;
    return (
      <div style={{
        position: "absolute", top, left: 2, right: 2, zIndex: 3,
        height,
        background: "rgba(15,110,86,0.18)",
        border: `2px dashed ${C.teal}`,
        borderRadius: 6,
        pointerEvents: "none",
        boxSizing: "border-box",
      }} />
    );
  };

  const renderSelectionTooltip = () => {
    if (!selection) return null;
    const startT = minToTime(selection.startMin);
    const endT = minToTime(selection.endMin);
    const durMin = selection.endMin - selection.startMin;
    const hours = Math.floor(durMin / 60);
    const mins = durMin % 60;
    const durLabel = hours > 0
      ? (mins > 0 ? `${hours}h ${mins}m` : `${hours}h`)
      : `${mins}m`;
    return (
      <div style={{
        position: "fixed", left: selection.x + 16, top: selection.y - 40, zIndex: 1000,
        background: C.teal, color: "#fff",
        borderRadius: 6, padding: "5px 12px",
        fontSize: 13, fontWeight: 500,
        pointerEvents: "none", whiteSpace: "nowrap",
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
      }}>
        {formatTimeStr(startT)} – {formatTimeStr(endT)} · {durLabel}
      </div>
    );
  };

  const renderDragTooltip = () => {
    if (!dragOver || dragOver.itemId == null) return null;
    const { date, snapTime, blocked, x, y } = dragOver;
    const dateLabel = new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const timeLabel = snapTime ? formatTimeStr(snapTime) : "";
    return (
      <div style={{
        position: "fixed", left: x + 16, top: y - 36, zIndex: 1000,
        background: blocked ? SRC.requested : C.teal, color: "#fff",
        borderRadius: 6, padding: "5px 12px",
        fontSize: 13, fontWeight: 500,
        pointerEvents: "none", whiteSpace: "nowrap",
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
      }}>
        {dateLabel} · {timeLabel}
      </div>
    );
  };

  // --- Modal renderer ---
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
          {modalError && <p style={{ fontSize: 13, color: SRC.requested, marginTop: 8 }}>{modalError}</p>}
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
          <div onClick={openBookModal}
            style={{ flex: 1, padding: "1.5rem 1rem", textAlign: "center", borderRadius: 12, cursor: "pointer", border: `1px solid ${C.teal}`, background: C.tealLight }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.teal, marginBottom: 4 }}>Session</div>
            <div style={{ fontSize: 12, color: C.muted }}>Book a coaching session for a client</div>
          </div>
          <div onClick={openEventModal}
            style={{ flex: 1, padding: "1.5rem 1rem", textAlign: "center", borderRadius: 12, cursor: "pointer", border: `1px solid ${C.gridLine}`, background: "#fafafa" }}>
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
          <p><strong>Client:</strong> {clientName(b.profiles)}</p>
          <p><strong>Date:</strong> {b.date}</p>
          <p><strong>Time:</strong> {formatTime(b.start_time)} - {formatTime(b.end_time)}</p>
          <p><strong>Duration:</strong> {b.session_duration} min</p>
          <p><strong>Fee:</strong> ${Number(b.fee).toFixed(2)}</p>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button style={S.btn} onClick={() => handleAcceptDecline("accept")} disabled={modalSaving}>
            {modalSaving ? "Saving..." : "Accept"}
          </button>
          <button
            style={{ ...S.btnSmOut, color: SRC.requested, border: `1px solid ${SRC.requested}` }}
            onClick={() => handleAcceptDecline("decline")}
            disabled={modalSaving}
          >
            Decline
          </button>
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
          <strong>Client:</strong> {clientName(b.profiles)}
        </p>

        <label style={S.label}>Session type</label>
        <select style={{ ...S.input, cursor: "pointer" }} value={bookType} onChange={e => setBookType(e.target.value)}>
          {sessionTypes.map(t => (
            <option key={t.id} value={t.id}>{t.label} ({t.duration}min — ${Number(t.fee).toFixed(2)})</option>
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
          <button
            style={{ ...S.btnSmOut, color: SRC.requested, border: `1px solid ${SRC.requested}` }}
            onClick={handleCancelBooking}
            disabled={modalSaving}
          >
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
            <option key={c.id} value={c.id}>{clientName(c)}</option>
          ))}
        </select>

        <label style={S.label}>Session type</label>
        <select style={{ ...S.input, cursor: "pointer" }} value={bookType} onChange={e => setBookType(e.target.value)}>
          <option value="">Select a session type...</option>
          {sessionTypes.map(t => (
            <option key={t.id} value={t.id}>{t.label} ({t.duration}min — ${Number(t.fee).toFixed(2)})</option>
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

  const renderEventContent = () => (
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

  const renderEditEventContent = () => (
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
        <button
          style={{ ...S.btnSmOut, color: SRC.requested, border: `1px solid ${SRC.requested}` }}
          onClick={handleDeleteEvent}
          disabled={modalSaving}
        >
          Delete Event
        </button>
        <button style={S.btnSmOut} onClick={closeModal}>Close</button>
      </div>
    </>
  );

  // --- Move confirmation modal ---
  const renderMoveConfirmModal = () => {
    if (!pendingMove) return null;
    const { kind, item, newDate, newTime } = pendingMove;
    const newDateLabel = new Date(newDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const newTimeLabel = formatTimeStr(newTime);

    let oldDateLabel, oldTimeLabel, title, body;
    if (kind === "booking") {
      oldDateLabel = new Date(item.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      oldTimeLabel = formatTimeStr(item.time_slot || "00:00");
      title = "Move Session?";
      body = (
        <>
          Move {clientName(item.profiles)}&apos;s session from{" "}
          <strong>{oldDateLabel} at {oldTimeLabel}</strong>
          <br />to <strong>{newDateLabel} at {newTimeLabel}</strong>?
        </>
      );
    } else {
      const oldStart = new Date(item.start.dateTime);
      oldDateLabel = oldStart.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      oldTimeLabel = oldStart.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      title = "Move Event?";
      body = (
        <>
          Move <strong>{item.summary || "event"}</strong> from{" "}
          <strong>{oldDateLabel} at {oldTimeLabel}</strong>
          <br />to <strong>{newDateLabel} at {newTimeLabel}</strong>?
        </>
      );
    }

    return (
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
      }} onClick={cancelPendingMove}>
        <div style={{ ...S.card, maxWidth: 440, width: "90%", margin: 0 }} onClick={e => e.stopPropagation()}>
          <h3 style={S.h3}>{title}</h3>
          <p style={S.p}>{body}</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ ...S.btn, flex: 1, fontWeight: 600 }} onClick={confirmPendingMove} disabled={modalSaving}>
              {modalSaving ? "Saving..." : "Yes"}
            </button>
            <button
              style={{ ...S.btnSmOut, flex: 1, color: C.text, fontWeight: 600, border: `1px solid ${C.text}` }}
              onClick={cancelPendingMove}
              disabled={modalSaving}
            >
              No
            </button>
          </div>
        </div>
      </div>
    );
  };

  // --- Hover tooltip ---
  const renderHoverTooltip = () => {
    if (!hover || dragOver || modal || pendingMove) return null;
    const { kind, data, x, y } = hover;
    let content;
    if (kind === "booking") {
      const b = data;
      content = (
        <>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{clientName(b.profiles)}</div>
          <div>{b.session_types?.label || "Session"}</div>
          <div>{formatTime(b.start_time)} – {formatTime(b.end_time)}</div>
          <div>{b.session_duration} min · ${Number(b.fee).toFixed(2)}</div>
          <div style={{ marginTop: 4, fontStyle: "italic", color: b.status === "requested" ? SRC.requested : C.teal }}>
            {b.status}
          </div>
        </>
      );
    } else {
      const ev = data;
      const src = classifyEvent(ev);
      content = (
        <>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{ev.summary || "Event"}</div>
          <div style={{ fontSize: 11, color: SRC[src], fontStyle: "italic" }}>
            {src === "sp" ? "SimplePractice" : src === "coaching" ? "Coaching" : "Personal"}
          </div>
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

  // --- Color key legend ---
  const renderColorKey = () => {
    const swatch = (color, bg, label) => (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: C.text }}>
        <span style={{
          display: "inline-block", width: 20, height: 14, borderRadius: 3,
          background: bg, border: `1.5px solid ${color}`,
        }} />
        {label}
      </span>
    );
    return (
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 18, marginBottom: 10, fontSize: 13, color: C.muted }}>
        <span style={{ fontWeight: 600, color: C.text }}>Key:</span>
        {swatch("#7cb342", SRC.available, "Available")}
        {swatch(SRC.coaching, SRC.coachingBg, "Coaching")}
        {swatch(SRC.requested, SRC.requestedBg, "Requested")}
        {swatch(SRC.sp, SRC.spBg, "SimplePractice")}
        {swatch(SRC.personal, SRC.personalBg, "Personal")}
      </div>
    );
  };

  return (
    <div style={S.page}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ ...S.h1, fontSize: 26, marginBottom: 0 }}>Schedule</h1>
      </div>

      {renderColorKey()}

      <p style={{ ...S.p, fontSize: 13 }}>
        Click or drag across empty cells to add a session or event. Click a session to edit or cancel. Drag sessions to reschedule.
      </p>

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: C.hint }}>Loading...</div>
      ) : (
        <>
          {(view === "day" || view === "week") ? (
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <button style={S.btnSmOut} onClick={() => setCurrentDate(new Date())}>Today</button>
              </div>
              <MiniCalendar currentDate={currentDate} onSelectDate={(d) => setCurrentDate(d)} view={view} />
              <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", gap: 4 }}>
                {["day", "week", "month"].map(v => (
                  <button key={v}
                    style={{ ...S.btnSmOut, ...(view === v ? { background: C.teal, color: "#fff", border: `0.5px solid ${C.teal}` } : {}) }}
                    onClick={() => setView(v)}>
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <button style={S.btnSmOut} onClick={() => setCurrentDate(new Date())}>Today</button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <button
                  onClick={() => navigate(-1)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    fontSize: 28, lineHeight: 1, color: C.text, fontWeight: 700,
                    padding: "0 6px", fontFamily: "inherit",
                  }}
                >
                  &lsaquo;
                </button>
                <span style={{ fontSize: 18, color: C.text, fontWeight: 600, textAlign: "center" }}>
                  {`${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`}
                </span>
                <button
                  onClick={() => navigate(1)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    fontSize: 28, lineHeight: 1, color: C.text, fontWeight: 700,
                    padding: "0 6px", fontFamily: "inherit",
                  }}
                >
                  &rsaquo;
                </button>
              </div>
              <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", gap: 4 }}>
                {["day", "week", "month"].map(v => (
                  <button key={v}
                    style={{ ...S.btnSmOut, ...(view === v ? { background: C.teal, color: "#fff", border: `0.5px solid ${C.teal}` } : {}) }}
                    onClick={() => setView(v)}>
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {view === "day" && renderDayView()}
          {view === "week" && renderWeekView()}
          {view === "month" && renderMonthView()}
        </>
      )}

      {renderModal()}
      {renderMoveConfirmModal()}
      {renderHoverTooltip()}
      {renderDragTooltip()}
      {renderSelectionTooltip()}
    </div>
  );
}
