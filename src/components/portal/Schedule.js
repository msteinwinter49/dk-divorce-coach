"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { C, S } from "@/lib/constants";
import { useIsMobile } from "@/lib/hooks";
import { useAuth } from "@/context/AuthContext";
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

function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function sameDay(a, b) { return dateStr(a) === dateStr(b); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function startOfWeek(d) { const r = new Date(d); r.setDate(r.getDate() - r.getDay()); return r; }

export default function Schedule({ setPage, setProfileFocus, viewAsClient, setBookingActive }) {
  const { user, profile } = useAuth();
  const isAdminViewing = !!viewAsClient && profile?.role === "admin";
  const readOnly = !!viewAsClient && !isAdminViewing;
  const mobile = useIsMobile();
  const [view, setView] = useState("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [availability, setAvailability] = useState({});
  const [bookings, setBookings] = useState([]);
  const [sessionTypes, setSessionTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [balanceMinutes, setBalanceMinutes] = useState(null);

  // Booking popup state
  const [bookingDate, setBookingDate] = useState(null);
  const [selectedType, setSelectedType] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [bookingError, setBookingError] = useState(null);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [lowBalance, setLowBalance] = useState(false);
  const [groupMembers, setGroupMembers] = useState([]);
  const [selectedParticipants, setSelectedParticipants] = useState([]);
  const [bookingBalanceAfter, setBookingBalanceAfter] = useState(null);
  const [editingBooking, setEditingBooking] = useState(null);
  const [noChangeMessage, setNoChangeMessage] = useState(false);
  const [showCloseWarning, setShowCloseWarning] = useState(false);
  const [showDayView, setShowDayView] = useState(false);
  const [dayViewDate, setDayViewDate] = useState(null);
  const [popupPos, setPopupPos] = useState(null); // { x, y } px when dragged; null = centered
  const [cancelModalPos, setCancelModalPos] = useState(null);
  const [moveModalPos, setMoveModalPos] = useState(null);

  const [showSpinner, setShowSpinner] = useState(false);
  const [visualVpHeight, setVisualVpHeight] = useState(null);

  // Client change policy
  const [minNoticeHours, setMinNoticeHours] = useState(24);
  const [adminPhone, setAdminPhone] = useState("");
  const [blockedAlertOpen, setBlockedAlertOpen] = useState(false);
  const [blockedAlertReason, setBlockedAlertReason] = useState("");

  // Cancel state
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelSuccess, setCancelSuccess] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const lastOwnActionAt = useRef(0);
  const weekHeaderRef = useRef(null);
  const weekBodyRef = useRef(null);
  const popupRef = useRef(null);
  const cancelModalRef = useRef(null);
  const moveModalRef = useRef(null);
  const dragStateRef = useRef(null);
  const bookingPageInnerRef = useRef(null);
  const popupScrollRef = useRef(null);

  // Drag-and-drop state (move existing bookings)
  const dragRef = useRef(null);
  const [dragOver, setDragOver] = useState(null); // { date, hour, snapTime, snapMinutes, blocked, x, y }
  const [increment, setIncrement] = useState(30);
  const [pendingMove, setPendingMove] = useState(null); // { booking, newDate, newTime } awaiting confirmation

  // Hover tooltip state
  const [hover, setHover] = useState(null); // { data, x, y }

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

  // Tracks whether the wide availability window has been fetched this session.
  // Resets on user change so a re-login gets fresh data.
  const availLoadedRef = useRef(false);
  useEffect(() => { availLoadedRef.current = false; }, [user]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { start, end } = getRange();

    // Availability: fetch a wide window once on mount (prev month → end of month+2).
    // Subsequent navigations reuse the cached state — no re-fetch needed.
    let availPromise;
    if (!availLoadedRef.current) {
      const now = new Date();
      const aStart = dateStr(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      const aEnd = dateStr(new Date(now.getFullYear(), now.getMonth() + 3, 0));
      availPromise = fetch(`/api/availability?start=${aStart}&end=${aEnd}`).then(r => r.json()).catch(() => ({}));
    } else {
      availPromise = Promise.resolve(null);
    }

    const [availRes, bookingsRes, typesRes] = await Promise.all([
      availPromise,
      fetch(`/api/bookings?start=${start}&end=${end}`).then(r => r.json()).catch(() => []),
      fetch("/api/session-types").then(r => r.json()).catch(() => []),
    ]);

    if (availRes !== null) {
      availLoadedRef.current = true;
      const { __increment, ...slotsByDate } = availRes && !availRes.error ? availRes : {};
      setAvailability(slotsByDate);
      if (typeof __increment === "number" && __increment > 0) setIncrement(__increment);
    }

    setBookings(Array.isArray(bookingsRes) ? bookingsRes : []);
    setSessionTypes(Array.isArray(typesRes) ? typesRes : []);
    setLoading(false);
  }, [getRange]);

  useEffect(() => { if (user) loadData(); }, [user, loadData]);

  // Load group members once for participant selection (clients only, not admin-viewing)
  useEffect(() => {
    if (!user || isAdminViewing || profile?.role === "admin") return;
    fetch("/api/groups/members").then(r => r.json()).then(d => {
      setGroupMembers(d.members || []);
    }).catch(() => {});
  }, [user, isAdminViewing, profile?.role]);

  // Load client change policy (min notice hours + admin phone)
  useEffect(() => {
    if (!user || profile?.role === "admin") return;
    fetch("/api/admin-contact").then(r => r.json()).then(d => {
      if (typeof d.min_notice_hours === "number") setMinNoticeHours(d.min_notice_hours);
      if (d.admin_phone) setAdminPhone(d.admin_phone);
    }).catch(() => {});
  }, [user, profile?.role]);

  const refreshBalance = useCallback(() => {
    if (!user) return;
    const clientId = viewAsClient?.id;
    const url = clientId ? `/api/purchases?client_id=${clientId}` : "/api/purchases";
    fetch(url).then(r => r.json()).then(b => setBalanceMinutes(b?.balance_minutes ?? 0)).catch(() => {});
  }, [user, viewAsClient?.id]);

  useEffect(() => { refreshBalance(); }, [refreshBalance]);


  useEffect(() => {
    const onMouseMove = (e) => {
      if (!dragStateRef.current) return;
      const { startX, startY, origX, origY, setter } = dragStateRef.current;
      const pos = { x: origX + (e.clientX - startX), y: origY + (e.clientY - startY) };
      (setter || setPopupPos)(pos);
    };
    const onMouseUp = () => { dragStateRef.current = null; };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    const watchId = viewAsClient?.id || user.id;
    const supabase = createClient();
    const channel = supabase
      .channel(`balance_ledger:${watchId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "balance_ledger", filter: `client_id=eq.${watchId}` }, () => {
          refreshBalance();
          if (Date.now() - lastOwnActionAt.current > 3000) setNeedsRefresh(true);
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, viewAsClient?.id, refreshBalance]);

  const navigate = (dir) => {
    const d = new Date(currentDate);
    if (view === "day") d.setDate(d.getDate() + dir);
    else if (view === "week") d.setDate(d.getDate() + dir * 7);
    else { d.setDate(1); d.setMonth(d.getMonth() + dir); }
    setCurrentDate(d);
    closePopup();
  };

  const closePopup = () => {
    setBookingDate(null);
    setSelectedType(null);
    setSelectedTime(null);
    setBookingError(null);
    setBookingSuccess(false);
    setEditingBooking(null);
    setNoChangeMessage(false);
    setLowBalance(false);
    setBookingBalanceAfter(null);
    setShowCloseWarning(false);
    setShowDayView(false);
    setPopupPos(null);
  };

  const isChangeBlocked = (b) => {
    if (readOnly) return false;
    const hasOthers = (b.participant_ids || []).length > 1;
    const tooClose = new Date(b.start_time).getTime() - Date.now() < minNoticeHours * 60 * 60 * 1000;
    return hasOthers || tooClose;
  };

  const blockReason = (b) => {
    const hasOthers = (b.participant_ids || []).length > 1;
    const tooClose = new Date(b.start_time).getTime() - Date.now() < minNoticeHours * 60 * 60 * 1000;
    if (tooClose && hasOthers) return `This booking cannot be changed because there is less than ${minNoticeHours} hours notice and there are other attendees.`;
    if (tooClose) return `This booking cannot be changed because there is less than ${minNoticeHours} hours notice.`;
    return "This booking cannot be changed because there are other attendees.";
  };

  const showBlockedAlert = (b) => { setBlockedAlertReason(blockReason(b)); setBlockedAlertOpen(true); };

  const openEditPopup = (b) => {
    if (readOnly) return;
    const dateOnly = b.date || localDateStr(new Date(b.start_time));
    const timeOnly = b.time_slot || (() => {
      const d = new Date(b.start_time);
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    })();
    setEditingBooking(b);
    setBookingDate(dateOnly);
    setSelectedTime(timeOnly);
    // Pre-select the session type from sessionTypes by id
    const t = sessionTypes.find(s => s.id === b.session_type_id);
    setSelectedType(t || (b.session_types ? { id: b.session_type_id, label: b.session_types.label, duration: b.session_duration } : null));
    setBookingError(null);
    setBookingSuccess(false);
    setShowCloseWarning(false);
    setPopupPos(null);
  };

  const handleBook = async () => {
    if (!selectedType || !selectedTime || !bookingDate) return;

    // No-op when nothing changed in edit mode — skip the API call so Diana isn't notified.
    if (editingBooking
        && bookingDate === editingBooking.date
        && selectedTime === editingBooking.time_slot
        && selectedType.id === editingBooking.session_type_id) {
      setNoChangeMessage(true);
      setBookingSuccess(true);
      return;
    }

    setConfirming(true);
    setBookingError(null);
    const spinnerTimer = setTimeout(() => setShowSpinner(true), 500);

    let res;
    if (editingBooking) {
      // Update existing booking
      res = await fetch("/api/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingBooking.id,
          action: "update",
          date: bookingDate,
          start_time: selectedTime,
          session_type_id: selectedType.id,
          tz_offset: new Date().getTimezoneOffset(),
        }),
      });
    } else {
      const body = {
        session_type_id: selectedType.id,
        date: bookingDate,
        start_time: selectedTime,
        tz_offset: new Date().getTimezoneOffset(),
      };
      if (isAdminViewing) {
        body.user_id = viewAsClient.id;
      } else if (selectedParticipants.length > 1) {
        body.participant_ids = selectedParticipants;
      }

      res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }

    if (res.ok) {
      const responseData = await res.json();
      if (!editingBooking) {
        setLowBalance(!!responseData.low_balance);
        if (responseData.balance_after != null) setBookingBalanceAfter(responseData.balance_after);
      }
      const { start, end } = getRange();
      const [availRes, bookingsRes] = await Promise.all([
        fetch(`/api/availability?start=${start}&end=${end}`).then(r => r.json()).catch(() => ({})),
        fetch(`/api/bookings?start=${start}&end=${end}`).then(r => r.json()).catch(() => []),
      ]);
      const availOk = availRes && !availRes.error ? availRes : {};
      const { __increment, ...slotsByDate } = availOk;
      setAvailability(slotsByDate);
      if (typeof __increment === "number" && __increment > 0) setIncrement(__increment);
      setBookings(Array.isArray(bookingsRes) ? bookingsRes : []);
      refreshBalance();
      lastOwnActionAt.current = Date.now();
      setNeedsRefresh(false);
      setBookingSuccess(true);
    } else {
      const err = await res.json().catch(() => ({}));
      setBookingError(err.error || "Could not book. Please try again.");
      // Refresh availability so the UI reflects the real state after a conflict
      if (res.status === 409) {
        const { start, end } = getRange();
        fetch(`/api/availability?start=${start}&end=${end}`).then(r => r.json()).then(availRes => {
          const availOk = availRes && !availRes.error ? availRes : {};
          const { __increment, ...slotsByDate } = availOk;
          setAvailability(slotsByDate);
          if (typeof __increment === "number" && __increment > 0) setIncrement(__increment);
        }).catch(() => {});
      }
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
      lastOwnActionAt.current = Date.now();
      setNeedsRefresh(false);
      refreshBalance();
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

  // Smallest selectable session duration — used to decide whether a free stretch
  // is even worth showing as "available." A 15-min gap next to an SP appointment
  // can't fit any session type, so it's white, not green.
  const minDuration = sessionTypes.length > 0
    ? Math.min(...sessionTypes.map(t => t.duration))
    : 30;

  // Collapse the discrete availability slot list into contiguous free ranges,
  // then drop ranges shorter than minDuration. Returns [[startMin, endMin], ...].
  const getBookableRanges = useCallback((date) => {
    const now = new Date();
    const todayStr = localDateStr(now);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    let slots = availability[date] || [];
    if (slots.length === 0) return [];
    if (date === todayStr) slots = slots.filter(s => { const [sh, sm] = s.split(":").map(Number); return sh * 60 + sm > nowMin; });
    if (slots.length === 0) return [];
    const ranges = [];
    for (const s of slots) {
      const [sh, sm] = s.split(":").map(Number);
      const sMin = sh * 60 + sm;
      const sEnd = sMin + increment;
      if (ranges.length > 0 && ranges[ranges.length - 1][1] >= sMin) {
        ranges[ranges.length - 1][1] = Math.max(ranges[ranges.length - 1][1], sEnd);
      } else {
        ranges.push([sMin, sEnd]);
      }
    }
    return ranges.filter(([s, e]) => (e - s) >= minDuration);
  }, [availability, increment, minDuration]);

  // Position bookable ranges onto the day/week time grid, clipped to the visible
  // HOURS range. Returns rects ready to render as green overlay bars.
  const getBookableOverlay = useCallback((date, rowH) => {
    const firstMin = HOURS[0] * 60;
    const lastMin = (HOURS[HOURS.length - 1] + 1) * 60;
    return getBookableRanges(date)
      .map(([s, e]) => [Math.max(s, firstMin), Math.min(e, lastMin)])
      .filter(([s, e]) => e > s)
      .map(([s, e]) => ({
        startMin: s,
        endMin: e,
        top: ((s - firstMin) / 60) * rowH,
        height: ((e - s) / 60) * rowH,
      }));
  }, [getBookableRanges]);

  // Render a bookable range as a stack of hour-aligned sub-blocks with visible
  // hour dividers. Each block is its own click target — clicking in the 10–11
  // portion of a 9–12 range starts the booking at 10:00, not 9:00. The first or
  // last block in a range may be a partial hour (e.g. 9:30–10:00) when the range
  // doesn't begin/end on the hour; clicking that block still uses its true start.
  // Transparent to pointer events while dragging so the underlying hour cell
  // still receives drag handlers.
  const renderBookableBar = (date, item, rowH) => {
    const firstMin = HOURS[0] * 60;
    const blocks = [];
    let cursor = item.startMin;
    while (cursor < item.endMin) {
      const nextHourBoundary = (Math.floor(cursor / 60) + 1) * 60;
      const blockEnd = Math.min(nextHourBoundary, item.endMin);
      const h = Math.floor(cursor / 60);
      const m = cursor % 60;
      blocks.push({
        startMin: cursor,
        endMin: blockEnd,
        timeStr: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
        top: ((cursor - firstMin) / 60) * rowH,
        height: ((blockEnd - cursor) / 60) * rowH,
        isLast: blockEnd >= item.endMin,
      });
      cursor = blockEnd;
    }
    return blocks.map(b => (
      <div
        key={`avail-${b.startMin}`}
        onClick={(e) => { e.stopPropagation(); if (!readOnly) openBookingPopup(date, b.timeStr); }}
        style={{
          position: "absolute",
          top: b.top,
          left: 0,
          right: 0,
          height: b.height,
          background: "#dbeafe",
          borderBottom: b.isLast ? "none" : `0.5px solid ${C.gridLine}`,
          cursor: readOnly ? "default" : "pointer",
          zIndex: 1,
          boxSizing: "border-box",
          pointerEvents: dragOver ? "none" : "auto",
        }}
      />
    ));
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
        if (editingBooking && b.id === editingBooking.id) return false;
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

  // --- Drag and drop ---

  const handleDragStart = (e, b) => {
    if (isChangeBlocked(b)) { e.preventDefault(); showBlockedAlert(b); return; }
    const durationMin = b.session_duration || 60;
    dragRef.current = { ...b, _durationMin: durationMin };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", b.id);
    const [sH, sM] = (b.time_slot || "00:00").split(":").map(Number);
    setDragOver({
      date: b.date, hour: sH,
      snapTime: `${String(sH).padStart(2, "0")}:${String(sM).padStart(2, "0")}`,
      snapMinutes: sH * 60 + sM,
      x: e.clientX, y: e.clientY,
      // Mirror drag metadata into state so render functions don't need to read dragRef
      itemId: b.id,
      durationMin,
      status: b.status,
    });
    // Hide native drag ghost so our tooltip is visible
    const ghost = document.createElement("div");
    ghost.style.position = "absolute";
    ghost.style.top = "-9999px";
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => document.body.removeChild(ghost), 0);
  };

  // Block only on overlap with another booking. Availability containment is not
  // enforced — the server reverts booked → requested for Diana's review anyway.
  const isDropAllowed = (date, startMin, durationMin) => {
    const endMin = startMin + durationMin;
    const dragId = dragRef.current?.id;
    return !bookings.some(b => {
      if (b.id === dragId) return false;
      if (!["requested", "booked"].includes(b.status)) return false;
      const bDate = b.date || localDateStr(new Date(b.start_time));
      if (bDate !== date) return false;
      const [bH, bM] = (b.time_slot || "00:00").split(":").map(Number);
      const bStart = bH * 60 + bM;
      const bEnd = bStart + (b.session_duration || 60);
      return startMin < bEnd && endMin > bStart;
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
    const blocked = !isDropAllowed(date, totalMinutes, durationMin);
    e.dataTransfer.dropEffect = blocked ? "none" : "move";
    // Preserve itemId/durationMin/status set in handleDragStart so the ghost keeps the right size & color
    setDragOver(prev => ({
      ...prev,
      date, hour, snapTime, snapMinutes: totalMinutes, blocked,
      x: e.clientX, y: e.clientY,
    }));
  };

  const handleDragLeave = () => {
    // Don't clear here — would flicker as cursor crosses cell borders. Cleared on drop/end.
  };

  const handleDragEnd = () => {
    setDragOver(null);
    dragRef.current = null;
  };

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
    if (item.date === date && item.time_slot === newTime) return;

    // Defer the actual change to a confirmation modal — undoing a mistaken
    // drop is painful, so make the user confirm explicitly.
    setPendingMove({ booking: item, newDate: date, newTime });
  };

  const confirmPendingMove = async () => {
    if (!pendingMove) return;
    const { booking, newDate, newTime } = pendingMove;
    if (isChangeBlocked(booking)) { setPendingMove(null); showBlockedAlert(booking); return; }
    setConfirming(true);
    const spinnerTimer = setTimeout(() => setShowSpinner(true), 500);
    const res = await fetch("/api/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: booking.id,
        action: "update",
        date: newDate,
        start_time: newTime,
        tz_offset: new Date().getTimezoneOffset(),
      }),
    });
    clearTimeout(spinnerTimer);
    setShowSpinner(false);
    setConfirming(false);
    if (res.ok) {
      setPendingMove(null);
      lastOwnActionAt.current = Date.now();
      setNeedsRefresh(false);
      loadData();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Could not move session.");
      setPendingMove(null);
    }
  };

  const cancelPendingMove = () => { setPendingMove(null); setMoveModalPos(null); };

  const renderBookingPreview = (date, rowH) => {
    if (!bookingDate || !selectedTime || !selectedType || bookingSuccess) return null;
    if (bookingDate !== date) return null;
    const [h, m] = selectedTime.split(":").map(Number);
    const startMin = h * 60 + m;
    const top = ((startMin - HOURS[0] * 60) / 60) * rowH;
    const height = (selectedType.duration / 60) * rowH;
    const gridH = HOURS.length * rowH;
    if (top >= gridH || top + height <= 0) return null;
    return (
      <div style={{
        position: "absolute", left: 2, right: 2, zIndex: 5,
        top: Math.max(top, 0),
        height: Math.max(Math.min(height, gridH - Math.max(top, 0)), rowH * 0.4),
        border: `2.5px dashed ${C.teal}`,
        borderRadius: 6,
        background: "rgba(15,110,86,0.1)",
        pointerEvents: "none",
        boxSizing: "border-box",
      }} />
    );
  };

  const renderDragGhost = (rowH) => {
    if (!dragOver) return null;
    const firstHour = HOURS[0];
    const { snapMinutes, blocked, durationMin = 60, status } = dragOver;
    const isRequested = status === "requested";
    const top = ((snapMinutes - firstHour * 60) / 60) * rowH;
    const height = (durationMin / 60) * rowH;
    const bgColor = blocked ? "rgba(192,57,43,0.12)"
      : isRequested ? "rgba(192,57,43,0.15)"
      : "rgba(15,110,86,0.15)";
    const borderColor = blocked ? "#c0392b" : isRequested ? "#c0392b" : C.teal;
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

  const renderHoverTooltip = () => {
    if (!hover || dragOver || bookingDate || cancelTarget || pendingMove) return null;
    const { data: b, x, y } = hover;
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
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          {b.session_types?.label || "Session"}
        </div>
        <div>
          {new Date(b.start_time).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
        </div>
        <div>{formatTime(b.start_time)} – {formatTime(b.end_time)}</div>
        <div>{b.session_duration} min</div>
        <div style={{ marginTop: 4, fontStyle: "italic", color: b.status === "requested" ? "#c0392b" : C.teal }}>
          {b.status}
        </div>
      </div>
    );
  };

  const renderDragTooltip = () => {
    if (!dragOver) return null;
    const { date, snapTime, blocked, x, y } = dragOver;
    const dateLabel = new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const timeLabel = snapTime ? formatTimeStr(snapTime) : "";
    return (
      <div style={{
        position: "fixed", left: x + 16, top: y - 36, zIndex: 1000,
        background: blocked ? "#c0392b" : C.teal, color: "#fff",
        borderRadius: 6, padding: "5px 12px",
        fontSize: 13, fontWeight: 500,
        pointerEvents: "none", whiteSpace: "nowrap",
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
      }}>
        {dateLabel} · {timeLabel}
      </div>
    );
  };

  // Clear drag state if drop happens off-grid
  useEffect(() => {
    const onUp = () => {
      // Use a microtask delay so handleDrop fires first if it's going to
      setTimeout(() => { if (dragRef.current) handleDragEnd(); }, 0);
    };
    window.addEventListener("dragend", onUp);
    return () => window.removeEventListener("dragend", onUp);
  }, []);

  // Notify page.js when mobile full-page booking is active so Nav can hide the hamburger.
  // Also scroll to top so the form and nav bar are immediately visible.
  useEffect(() => {
    if (!setBookingActive) return;
    const active = mobile && !isAdminViewing && !!(bookingDate || editingBooking);
    setBookingActive(active);
    if (active) window.scrollTo({ top: 0, behavior: "instant" });
    return () => setBookingActive(false);
  }, [mobile, isAdminViewing, bookingDate, editingBooking]);

  // Track visual viewport height (used for keyboard detection on mobile)
  useEffect(() => {
    if (!mobile) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      setVisualVpHeight(Math.round(vv.height));
      // Also adjust inner div padding when keyboard is open
      const el = bookingPageInnerRef.current;
      if (!el) return;
      const kbHeight = Math.max(0, window.innerHeight - vv.offsetTop - vv.height);
      el.style.paddingBottom = kbHeight > 0
        ? `${kbHeight + 32}px`
        : "calc(3rem + env(safe-area-inset-bottom, 0px))";
    };
    update();
    vv.addEventListener("resize", update);
    return () => vv.removeEventListener("resize", update);
  }, [mobile]);

  // --- VIEWS ---

  const renderOverlayBooking = (b, top, height, compact) => {
    const isRequested = b.status === "requested";
    const canEdit = !readOnly && (isRequested || b.status === "booked");
    return (
      <div
        key={b.id}
        draggable={canEdit}
        onDragStart={canEdit ? (e) => { setHover(null); handleDragStart(e, b); } : undefined}
        onMouseEnter={(e) => setHover({ data: b, x: e.clientX, y: e.clientY })}
        onMouseMove={(e) => setHover(h => h && h.data.id === b.id ? { ...h, x: e.clientX, y: e.clientY } : h)}
        onMouseLeave={() => setHover(null)}
        style={{
          position: "absolute", top, left: 2, right: 2, zIndex: 4,
          height,
          padding: compact ? "2px 4px" : "4px 8px",
          borderRadius: compact ? 4 : 6,
          fontSize: compact ? 11 : 13,
          background: isRequested ? "#fdecea" : C.tealLight,
          border: isRequested ? "2px solid #c0392b" : `1px solid ${C.teal}`,
          cursor: canEdit ? "pointer" : "default",
          opacity: dragOver && dragOver.itemId === b.id ? 0.3 : 1,
          pointerEvents: dragOver ? "none" : "auto",
          overflow: "hidden",
          boxSizing: "border-box",
        }}
        onClick={e => { e.stopPropagation(); setHover(null); if (canEdit) openEditPopup(b); }}
      >
        {compact ? (
          <span style={{ color: isRequested ? "#c0392b" : C.teal, fontWeight: 500, whiteSpace: "nowrap" }}>
            {b.session_duration}m {b.status}
          </span>
        ) : (
          <>
            <div style={{ fontWeight: 500, color: isRequested ? "#c0392b" : C.teal, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {(() => {
                const others = (b.participant_profiles || []).filter(p => p.id !== user?.id);
                const base = `${b.session_types?.label || "Session"} — ${b.status}`;
                if (others.length === 0) return base;
                const names = others.map(p => { const fn = (p.first_name || "").trim(); const li = (p.last_name || "").trim().slice(0, 1); return li ? `${fn} ${li}.` : fn || "Member"; }).join(", ");
                return `${base} · Plus ${others.length} other${others.length === 1 ? "" : "s"} (${names})`;
              })()}
            </div>
            {height > 36 && (
              <div style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {formatTime(b.start_time)} - {formatTime(b.end_time)} | {b.session_duration}min
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
    const isToday = sameDay(currentDate, new Date());
    return (
      <div style={{ border: `0.5px solid ${C.gridLine}`, borderRadius: 8, userSelect: "none" }}>
        {/* Sticky day header */}
        <div style={{ position: "sticky", top: mobile ? 44 : 56, zIndex: 20, background: "#fafafa", display: "flex", borderTop: `0.5px solid ${C.gridLine}`, borderBottom: `0.5px solid ${C.gridLine}` }}>
          <div style={{ width: 70, flexShrink: 0, height: 36, borderRight: `0.5px solid ${C.gridLine}` }} />
          <div style={{ flex: 1, height: 36, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 600, color: isToday ? C.teal : C.text, background: isToday ? "#FEF9C3" : "transparent" }}>
            {DAYS_SHORT[currentDate.getDay()]} {currentDate.getDate()}
          </div>
        </div>
        <div style={{ display: "flex" }}>
          <div style={{ width: 70, flexShrink: 0 }}>
            {HOURS.map(h => (
              <div key={h} style={{ height: DAY_ROW_H, padding: "8px", fontSize: 12, color: C.hint, borderBottom: `0.5px solid ${C.gridLine}`, borderRight: `0.5px solid ${C.gridLine}`, boxSizing: "border-box" }}>
                {formatHour(h)}
              </div>
            ))}
          </div>
          <div style={{ flex: 1, position: "relative", height: totalH }}>
            {HOURS.map(h => (
              <div key={h} style={{
                height: DAY_ROW_H, borderBottom: `0.5px solid ${C.gridLine}`,
                background: "#fff",
                boxSizing: "border-box",
              }}
                onDragOver={(e) => handleDragOver(e, date, h)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, date, h)}
              />
            ))}
            {getBookableOverlay(date, DAY_ROW_H).map(item => renderBookableBar(date, item, DAY_ROW_H))}
            {overlayItems.map(item => renderOverlayBooking(item.data, item.top, item.height, false))}
            {renderBookingPreview(date, DAY_ROW_H)}
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
    const minW = mobile ? 770 : "auto";
    return (
      <div>
        {/* Header row is outside the overflow-x container so position:sticky works vertically */}
        <div ref={weekHeaderRef} style={{ position: "sticky", top: 0, zIndex: 20, overflowX: mobile ? "auto" : "hidden", overscrollBehavior: "none", scrollSnapType: mobile ? "x mandatory" : "none", scrollPaddingLeft: 70, background: "#fafafa", scrollbarWidth: "none", msOverflowStyle: "none" }}
          onScroll={(e) => { if (weekBodyRef.current) weekBodyRef.current.scrollLeft = e.target.scrollLeft; }}>
          <div style={{ display: "flex", minWidth: minW }}>
            <div style={{ width: 70, flexShrink: 0, alignSelf: "stretch", borderBottom: `0.5px solid ${C.gridLine}`, borderRight: `0.5px solid ${C.gridLine}`, position: "sticky", left: 0, background: "#fafafa", zIndex: 1 }} />
            {days.map((d, i) => (
              <div
                key={i}
                onClick={() => { setCurrentDate(new Date(d)); setView("day"); }}
                style={{
                  flex: 1, minWidth: 0, height: 36, textAlign: "center", padding: "4px 0",
                  borderBottom: `0.5px solid ${C.gridLine}`,
                  borderRight: i < 6 ? `0.5px solid ${C.gridLine}` : "none",
                  fontWeight: sameDay(d, new Date()) ? 600 : 400,
                  color: sameDay(d, new Date()) ? C.teal : C.text,
                  background: sameDay(d, new Date()) ? "#FEF9C3" : "transparent",
                  cursor: "pointer",
                  scrollSnapAlign: mobile ? "start" : "none",
                }}
              >
                <div style={{ fontSize: 11, color: C.hint }}>{DAYS_SHORT[d.getDay()]}</div>
                <div style={{ fontSize: 14 }}>{d.getDate()}</div>
              </div>
            ))}
          </div>
        </div>
        {/* Body: vertical scroll only on mobile; horizontal locked to header */}
        <div
          ref={weekBodyRef}
          style={{ overflowX: mobile ? "hidden" : "auto", userSelect: "none" }}
        >
          <div style={{ display: "flex", minWidth: minW }}>
            <div style={{ width: 70, flexShrink: 0, position: "sticky", left: 0, zIndex: 10, background: "#fff" }}>
              {HOURS.map(h => (
                <div key={h} style={{ height: WEEK_ROW_H, fontSize: 12, color: C.hint, borderBottom: `0.5px solid ${C.gridLine}`, borderRight: `0.5px solid ${C.gridLine}`, boxSizing: "border-box", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 2 }}>
                  {formatHour(h)}
                </div>
              ))}
            </div>
            {days.map((d, i) => {
              const date = dateStr(d);
              const isPast = d < new Date(new Date().setHours(0, 0, 0, 0));
              const overlayItems = getBookingsForDateOverlay(date, WEEK_ROW_H);
              return (
                <div key={i} style={{ flex: 1, minWidth: 0, borderRight: i < 6 ? `0.5px solid ${C.gridLine}` : "none" }}>
                  <div style={{ position: "relative", height: totalH }}>
                    {HOURS.map(h => (
                      <div key={h} style={{
                        height: WEEK_ROW_H, borderBottom: `0.5px solid ${C.gridLine}`,
                        background: "#fff",
                        boxSizing: "border-box",
                      }}
                        onDragOver={(e) => handleDragOver(e, date, h)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, date, h)}
                      />
                    ))}
                    {!isPast && getBookableOverlay(date, WEEK_ROW_H).map(item => renderBookableBar(date, item, WEEK_ROW_H))}
                    {overlayItems.map(item => renderOverlayBooking(item.data, item.top, item.height, true))}
                    {renderBookingPreview(date, WEEK_ROW_H)}
                    {dragOver?.date === date && renderDragGhost(WEEK_ROW_H)}
                  </div>
                </div>
              );
            })}
          </div>
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
              // "Available" means there's at least one contiguous free range long
              // enough to fit the smallest session type — not just any leftover slot.
              const hasAvail = getBookableRanges(date).length > 0;
              const isPast = day < new Date(new Date().setHours(0, 0, 0, 0));

              return (
                <div key={di} style={{
                  minHeight: 80, padding: "4px 6px", minWidth: 0, overflow: "hidden",
                  borderBottom: wi < weeks.length - 1 ? `0.5px solid ${C.gridLine}` : "none",
                  borderRight: di < 6 ? `0.5px solid ${C.gridLine}` : "none",
                  outline: sameDay(day, new Date()) ? `2px solid ${C.teal}` : "none",
                  outlineOffset: "-2px",
                  opacity: isCurrentMonth ? 1 : 0.4,
                  cursor: hasAvail && !isPast ? "pointer" : "default",
                  background: hasAvail && !isPast ? "#eff6ff" : "transparent",
                }} onClick={() => hasAvail && !isPast && openBookingPopup(date)}>
                  <div style={{ marginBottom: 4 }}>
                    <span style={{
                      fontSize: 13, display: "inline-block", minWidth: 20, textAlign: "center",
                      borderRadius: 4, padding: "1px 3px",
                      background: sameDay(day, new Date()) ? "#FEF9C3" : "transparent",
                      fontWeight: sameDay(day, new Date()) ? 600 : 400,
                      color: sameDay(day, new Date()) ? C.text : hasAvail && !isPast ? "#3b82f6" : C.text,
                    }}>
                      {day.getDate()}
                    </span>
                  </div>
                  {dayBookings.map(b => {
                    const canEdit = !readOnly && ["requested", "booked"].includes(b.status);
                    return (
                      <div key={b.id} style={{
                        fontSize: 10, padding: "1px 4px", borderRadius: 3, marginBottom: 2,
                        background: b.status === "requested" ? "#fdecea" : C.tealLight,
                        color: b.status === "requested" ? "#c0392b" : C.teal,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        cursor: canEdit ? "pointer" : "default",
                      }}
                        onMouseEnter={(e) => setHover({ data: b, x: e.clientX, y: e.clientY })}
                        onMouseMove={(e) => setHover(h => h && h.data.id === b.id ? { ...h, x: e.clientX, y: e.clientY } : h)}
                        onMouseLeave={() => setHover(null)}
                        onClick={e => {
                        e.stopPropagation();
                        setHover(null);
                        if (!canEdit) return;
                        // From month view, jump into day view rather than open the popup —
                        // edits need the time grid for day/time changes.
                        setCurrentDate(new Date(date + "T12:00:00"));
                        setView("day");
                      }}>
                        {formatTime(b.start_time)} {b.session_duration}m — {b.status}
                      </div>
                    );
                  })}
                  {hasAvail && !isPast && dayBookings.length === 0 && (
                    <div style={{ fontSize: 10, color: "#3b82f6" }}>Available</div>
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
  // `time` is an optional HH:MM string pre-selecting a start time; pass nothing
  // to open the popup in "pick a time" mode (e.g. from month view).
  const openBookingPopup = (date, time) => {
    if (readOnly) return;
    if (balanceMinutes !== null && balanceMinutes < 0) return;
    if (date < localDateStr(new Date())) return;
    setBookingDate(date);
    setSelectedType(null);
    setSelectedTime(time || null);
    setBookingError(null);
    setBookingSuccess(false);
    setPopupPos(null);
    setSelectedParticipants(user ? [user.id] : []);
  };

  // Derived booking state — shared by renderBookingPopup, renderBookingFullPage, renderBookingDayView
  const dateLabel = bookingDate
    ? new Date(bookingDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : "";
  const origDate = editingBooking ? (editingBooking.date || localDateStr(new Date(editingBooking.start_time))) : null;
  const origTime = editingBooking ? (editingBooking.time_slot || (() => {
    const d = new Date(editingBooking.start_time);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  })()) : null;
  const hasUnsavedChanges = !bookingSuccess && (editingBooking
    ? (bookingDate !== origDate || selectedTime !== origTime || selectedType?.id !== editingBooking.session_type_id)
    : !!selectedType);
  const tryClose = () => { if (hasUnsavedChanges) { setShowCloseWarning(true); setTimeout(() => popupScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" }), 0); } else closePopup(); };

  const renderBookingDayView = () => {
    const date = dayViewDate || bookingDate || origDate;
    if (!date) return null;
    const totalH = HOURS.length * DAY_ROW_H;
    const dayDate = new Date(date + "T12:00:00");
    const firstMin = HOURS[0] * 60;
    const overlayItems = getBookingsForDateOverlay(date, DAY_ROW_H);

    const handleSlotClick = (timeStr) => {
      if (dayViewDate && dayViewDate !== bookingDate) setBookingDate(dayViewDate);
      setSelectedTime(timeStr);
      setShowDayView(false);
    };

    const renderAvailBar = (item) => {
      const blocks = [];
      let cursor = item.startMin;
      while (cursor < item.endMin) {
        const nextHour = (Math.floor(cursor / 60) + 1) * 60;
        const blockEnd = Math.min(nextHour, item.endMin);
        const h = Math.floor(cursor / 60);
        const m = cursor % 60;
        blocks.push({
          startMin: cursor,
          timeStr: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
          top: ((cursor - firstMin) / 60) * DAY_ROW_H,
          height: ((blockEnd - cursor) / 60) * DAY_ROW_H,
          isLast: blockEnd >= item.endMin,
        });
        cursor = blockEnd;
      }
      return blocks.map(b => (
        <div key={`dvavail-${b.startMin}`} onClick={() => handleSlotClick(b.timeStr)}
          style={{
            position: "absolute", top: b.top, left: 0, right: 0, height: b.height,
            background: "#dbeafe",
            borderBottom: b.isLast ? "none" : `0.5px solid ${C.gridLine}`,
            cursor: "pointer", zIndex: 1, boxSizing: "border-box",
          }} />
      ));
    };

    const renderSelectionHighlight = () => {
      if (!selectedTime || !selectedType) return null;
      const [h, m] = selectedTime.split(":").map(Number);
      const startMin = h * 60 + m;
      const top = ((startMin - HOURS[0] * 60) / 60) * DAY_ROW_H;
      const height = (selectedType.duration / 60) * DAY_ROW_H;
      const gridH = HOURS.length * DAY_ROW_H;
      if (top >= gridH || top + height <= 0) return null;
      return (
        <div style={{
          position: "absolute", left: 2, right: 2, zIndex: 5,
          top: Math.max(top, 0),
          height: Math.max(Math.min(height, gridH - Math.max(top, 0)), DAY_ROW_H * 0.4),
          border: `2.5px solid ${C.teal}`, borderRadius: 6,
          background: "rgba(15,110,86,0.12)", pointerEvents: "none", boxSizing: "border-box",
        }} />
      );
    };

    return (
      <div>
        <div style={{ marginBottom: 10 }}>
          <button onClick={() => setShowDayView(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: C.teal, fontWeight: 500, padding: 0 }}>
            ← Back to Booking
          </button>
        </div>
        <div style={{ position: "sticky", top: "var(--nav-height, 56px)", background: "#fff", zIndex: 10, paddingBottom: 8, borderBottom: `0.5px solid ${C.border}`, marginBottom: 4 }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <MiniCalendar currentDate={dayDate} onSelectDate={(d) => setDayViewDate(dateStr(d))} view="day" />
          </div>
          <p style={{ fontSize: 12, color: C.muted, margin: "6px 0 0", textAlign: "center" }}>Tap a blue slot to set your start time</p>
        </div>
        <div style={{ display: "flex", paddingBottom: "calc(3rem + env(safe-area-inset-bottom, 0px))" }}>
          <div style={{ width: 60, flexShrink: 0 }}>
            {HOURS.map(h => (
              <div key={h} style={{ height: DAY_ROW_H, padding: "8px 4px", fontSize: 11, color: C.hint, borderBottom: `0.5px solid ${C.gridLine}`, borderRight: `0.5px solid ${C.gridLine}`, boxSizing: "border-box" }}>
                {formatHour(h)}
              </div>
            ))}
          </div>
          <div style={{ flex: 1, position: "relative", height: totalH }}>
            {HOURS.map(h => (
              <div key={h} style={{ height: DAY_ROW_H, borderBottom: `0.5px solid ${C.gridLine}`, background: "#fff", boxSizing: "border-box" }} />
            ))}
            {getBookableOverlay(date, DAY_ROW_H).map(item => renderAvailBar(item))}
            {overlayItems.map(item => (
              <div key={item.data.id} style={{
                position: "absolute", top: item.top, left: 2, right: 2, height: item.height, zIndex: 4,
                padding: "4px 8px", borderRadius: 6, fontSize: 13, overflow: "hidden", boxSizing: "border-box",
                background: item.data.status === "requested" ? "#fdecea" : C.tealLight,
                border: item.data.status === "requested" ? "2px solid #c0392b" : `1px solid ${C.teal}`,
                pointerEvents: "none",
              }}>
                <div style={{ fontWeight: 500, color: item.data.status === "requested" ? "#c0392b" : C.teal, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {item.data.session_types?.label || "Session"} — {item.data.status}
                </div>
              </div>
            ))}
            {renderSelectionHighlight()}
          </div>
        </div>
      </div>
    );
  };

  const renderBookingFullPage = () => {
    if (!bookingDate && !editingBooking) return null;
    if (showDayView) return renderBookingDayView();

    const formBody = (
      <>
        <h3 style={{ ...S.h3, marginTop: 4, marginBottom: 8 }}>
          {editingBooking
            ? (isChangeBlocked(editingBooking)
                ? (editingBooking.status === "requested" ? "View Request" : "View Session")
                : (editingBooking.status === "requested" ? "Edit Request" : "Edit Session"))
            : "Request a Session"}
        </h3>
        {!editingBooking && !isAdminViewing && balanceMinutes !== null && (() => {
          const abs = Math.abs(balanceMinutes);
          const h = Math.floor(abs / 60);
          const m = abs % 60;
          const sign = balanceMinutes < 0 ? "-" : "";
          const label = h === 0 ? `${sign}${m} min` : m === 0 ? `${sign}${h} hr` : `${sign}${h} hr ${m} min`;
          return (
            <p style={{ fontSize: 13, color: balanceMinutes < 0 ? "#c0392b" : C.muted, marginTop: -4, marginBottom: 8 }}>
              Available to schedule: {label}
            </p>
          );
        })()}
        <button onClick={() => { setDayViewDate(bookingDate || origDate); setShowDayView(true); }} style={{
          display: "flex", alignItems: "center", gap: 6, marginBottom: 12,
          background: "none", border: "none", cursor: "pointer", padding: 0,
        }}>
          <span style={{ ...S.p, fontSize: 13, margin: 0 }}>{dateLabel}</span>
          <span style={{ fontSize: 13, color: C.teal, fontWeight: 500 }}>· Tap to view or change day</span>
        </button>

        {editingBooking && isChangeBlocked(editingBooking) ? (
          <>
            <p style={{ ...S.p, fontSize: 13, marginBottom: 12 }}>
              {selectedTime && selectedType
                ? `${formatTimeStr(selectedTime)} – ${formatTimeStr(addMinutesToTime(selectedTime, selectedType.duration))} (${selectedType.duration} min)`
                : selectedTime ? formatTimeStr(selectedTime) : "—"}
            </p>
            {(() => {
              const others = (editingBooking.participant_profiles || []).filter(p => p.id !== user?.id);
              if (others.length === 0) return null;
              return (
                <div style={{ marginBottom: 12, padding: "8px 12px", background: C.warm, borderRadius: 8, border: `0.5px solid ${C.warmBorder}` }}>
                  <div style={{ fontSize: 12, color: C.muted, fontWeight: 500, marginBottom: 4 }}>Also attending</div>
                  {others.map(p => (
                    <div key={p.id} style={{ fontSize: 13, color: C.text }}>
                      {`${(p.first_name || "").trim()} ${(p.last_name || "").trim()}`.trim() || "Member"}
                    </div>
                  ))}
                </div>
              );
            })()}
            <div style={{ padding: "10px 14px", background: "#fff8e1", border: "1px solid #f0c040", borderRadius: 8, fontSize: 13, color: C.text }}>
              {blockReason(editingBooking)}
              {adminPhone && <> Text Diana at <strong>{adminPhone}</strong> for assistance.</>}
            </div>
          </>
        ) : (
          <>
            {editingBooking && (() => {
              const others = (editingBooking.participant_profiles || []).filter(p => p.id !== user?.id);
              if (others.length === 0) return null;
              return (
                <div style={{ marginBottom: 12, padding: "8px 12px", background: C.warm, borderRadius: 8, border: `0.5px solid ${C.warmBorder}` }}>
                  <div style={{ fontSize: 12, color: C.muted, fontWeight: 500, marginBottom: 4 }}>Also attending</div>
                  {others.map(p => (
                    <div key={p.id} style={{ fontSize: 13, color: C.text }}>
                      {`${(p.first_name || "").trim()} ${(p.last_name || "").trim()}`.trim() || "Member"}
                    </div>
                  ))}
                </div>
              );
            })()}
            {showCloseWarning && (
              <div style={{ background: "#fff8e1", border: "1px solid #f0c040", borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
                <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 500 }}>
                  You have unsaved changes. Save or discard before closing?
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={S.btn} disabled={!selectedType || !selectedTime || confirming}
                    onClick={() => { setShowCloseWarning(false); handleBook(); }}>
                    {confirming ? "Saving..." : "Save"}
                  </button>
                  <button style={{ ...S.btnSmOut, color: "#c0392b", border: "1px solid #c0392b" }} onClick={closePopup}>
                    Discard
                  </button>
                </div>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "row", gap: 12, alignItems: "flex-end", marginBottom: 16 }}>
              <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                <label style={{ ...S.label, marginBottom: 4 }}>Start time</label>
                <input type="time" value={selectedTime || ""}
                  onChange={e => setSelectedTime(e.target.value)}
                  style={{ ...S.input, width: "100%", boxSizing: "border-box", fontSize: 14, marginBottom: 0, textAlign: "left", WebkitAppearance: "none" }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={{ ...S.label, marginBottom: 4 }}>End time</label>
                <div style={{ padding: "10px 12px", background: C.warm, borderRadius: 8, fontSize: 14, color: C.muted, border: "0.5px solid transparent" }}>
                  {selectedTime && selectedType ? formatTimeStr(addMinutesToTime(selectedTime, selectedType.duration)) : "—"}
                </div>
              </div>
            </div>
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
                  <div style={{ fontSize: 12, color: C.muted }}>{t.duration} min</div>
                </div>
              ))}
            </div>
            {!editingBooking && !isAdminViewing && (() => {
              const otherMembers = groupMembers.filter(m => m.is_active && !m.profile?.is_archived && m.client_id !== user?.id);
              if (otherMembers.length === 0) return null;
              const allMembers = groupMembers.filter(m => m.is_active && !m.profile?.is_archived);
              const allSelected = allMembers.every(m => selectedParticipants.includes(m.client_id));
              const someSelected = allMembers.some(m => selectedParticipants.includes(m.client_id) && m.client_id !== user?.id);
              const toggleParticipant = (id) => {
                if (id === user?.id) return;
                setSelectedParticipants(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
              };
              const toggleAll = () => {
                if (allSelected) setSelectedParticipants(user ? [user.id] : []);
                else setSelectedParticipants(allMembers.map(m => m.client_id));
              };
              return (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ ...S.label, marginBottom: 8 }}>Who's attending?</label>
                  <div style={{ border: `0.5px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                    {allMembers.length > 1 && (
                      <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: `0.5px solid ${C.border}`, cursor: "pointer", background: "#fafafa", fontSize: 13, fontWeight: 500 }}>
                        <input type="checkbox" checked={allSelected} onChange={toggleAll}
                          ref={el => { if (el) el.indeterminate = !allSelected && someSelected; }}
                          style={{ accentColor: C.teal }} />
                        All
                      </label>
                    )}
                    {allMembers.map(m => (
                      <label key={m.client_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: `0.5px solid ${C.border}`, cursor: m.client_id === user?.id ? "default" : "pointer", fontSize: 13 }}>
                        <input type="checkbox" checked={selectedParticipants.includes(m.client_id)}
                          onChange={() => toggleParticipant(m.client_id)}
                          disabled={m.client_id === user?.id}
                          style={{ accentColor: C.teal }} />
                        {m.profile ? `${m.profile.first_name || ""} ${m.profile.last_name || ""}`.trim() || "Member" : "Member"}
                        {m.client_id === user?.id && <span style={{ color: C.muted, fontSize: 11, marginLeft: 4 }}>you</span>}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })()}
            {selectedType && selectedTime && (() => {
              const slots = availability[bookingDate] || [];
              const [h, m] = selectedTime.split(":").map(Number);
              const startMin = h * 60 + m;
              const endMin = startMin + selectedType.duration;
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
              if (editingBooking && (editingBooking.date === bookingDate)) {
                const [eh, em] = (editingBooking.time_slot || "00:00").split(":").map(Number);
                const eStart = eh * 60 + em;
                const eEnd = eStart + (editingBooking.session_duration || 60);
                ranges.push([eStart, eEnd]);
                ranges.sort((a, b) => a[0] - b[0]);
                for (let i = ranges.length - 2; i >= 0; i--) {
                  if (ranges[i][1] >= ranges[i + 1][0]) {
                    ranges[i][1] = Math.max(ranges[i][1], ranges[i + 1][1]);
                    ranges.splice(i + 1, 1);
                  }
                }
              }
              const covered = ranges.some(([rStart, rEnd]) => startMin >= rStart && endMin <= rEnd);
              const overlap = bookings.some(b => {
                if (editingBooking && b.id === editingBooking.id) return false;
                const bDate = localDateStr(new Date(b.start_time));
                if (bDate !== bookingDate || !["requested", "booked"].includes(b.status)) return false;
                const bStart = new Date(b.start_time).getHours() * 60 + new Date(b.start_time).getMinutes();
                const bEnd = bStart + (b.session_duration || 60);
                return startMin < bEnd && endMin > bStart;
              });
              const validStart = !!editingBooking || (availability[bookingDate] || []).includes(selectedTime);
              if (overlap) return <p style={{ fontSize: 13, color: "#c0392b", margin: "0 0 12px" }}>This time overlaps an existing booking.</p>;
              if (!validStart) return <p style={{ fontSize: 13, color: "#c0392b", margin: "0 0 12px" }}>This start time is not on an available time slot.</p>;
              if (!covered) return <p style={{ fontSize: 13, color: "#c0392b", margin: "0 0 12px" }}>Part of this time slot is outside available hours.</p>;
              return null;
            })()}
          </>
        )}

        {!(editingBooking && isChangeBlocked(editingBooking)) && (
          <div style={{ borderTop: `0.5px solid ${C.border}`, paddingTop: 12, marginTop: 4 }}>
            {selectedType && selectedTime && (
              <div style={{ padding: "0.75rem 1rem", background: C.warm, borderRadius: 12, marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{selectedType.label}</div>
                <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
                  {dateLabel} at {formatTimeStr(selectedTime)} — {selectedType.duration} min
                </div>
              </div>
            )}
            {bookingError && (
              <div style={{ marginBottom: 10 }}>
                <p style={{ fontSize: 13, color: "#c0392b", marginBottom: bookingError.includes("payment method") ? 8 : 0 }}>{bookingError}</p>
                {bookingError.includes("payment method") && !viewAsClient && (
                  <button style={S.btnSm} onClick={() => { setProfileFocus("payment"); setPage("Profile"); }}>Add a payment method</button>
                )}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {selectedType && selectedTime && (
                <button style={S.btn} onClick={handleBook} disabled={confirming}>
                  {confirming
                    ? (editingBooking ? "Saving..." : "Requesting...")
                    : editingBooking ? "Save Changes" : "Request Session"}
                </button>
              )}
              {editingBooking && ["requested", "booked"].includes(editingBooking.status) && (
                <button style={{ ...S.btnSmOut, color: "#c0392b", border: "1px solid #c0392b" }}
                  onClick={() => { closePopup(); setCancelTarget(editingBooking); }}
                  disabled={confirming}>
                  {editingBooking.status === "booked" ? "Cancel Session" : "Cancel Request"}
                </button>
              )}
            </div>
          </div>
        )}
      </>
    );

    return (
      <>
        <div style={{ marginBottom: 8 }}>
          <button onClick={tryClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: C.teal, fontWeight: 500, padding: 0 }}>
            ← Back
          </button>
        </div>
        {bookingSuccess ? (
          <div style={{ textAlign: "center", padding: "2rem 0" }}>
            <div style={{ fontSize: 16, fontWeight: 500, color: C.teal, marginBottom: 8 }}>
              {noChangeMessage ? "No changes were made." : editingBooking ? "Changes saved!" : "Session requested!"}
            </div>
            {!noChangeMessage && (
              <p style={{ ...S.p, color: C.muted }}>
                {editingBooking
                  ? `Your updated session for ${dateLabel} at ${selectedTime} has been submitted for Diana's review.`
                  : `Your request for ${dateLabel} at ${selectedTime} has been submitted. Diana will review and confirm.`}
              </p>
            )}
            {!noChangeMessage && !editingBooking && bookingBalanceAfter != null && (() => {
              const min = bookingBalanceAfter;
              const abs = Math.abs(min);
              const h = Math.floor(abs / 60);
              const m = abs % 60;
              const sign = min < 0 ? "-" : "";
              const label = h === 0 ? `${sign}${m} minute${m !== 1 ? "s" : ""}` : m === 0 ? `${sign}${h} hour${h !== 1 ? "s" : ""}` : `${sign}${h} hr ${m} min`;
              return <p style={{ fontSize: 13, color: min < 0 ? "#c0392b" : C.muted, marginTop: 4, marginBottom: 4 }}>Your remaining balance is now {label}.</p>;
            })()}
            <button style={S.btn} onClick={closePopup}>Close</button>
          </div>
        ) : formBody}
      </>
    );
  };

  const renderBookingPopup = () => {
    if (!bookingDate) return null;

    return (
      <>
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.1)", zIndex: 100,
      }} onClick={tryClose} />
        <div ref={popupRef} style={{
          ...S.card,
          position: "fixed",
          left: popupPos ? popupPos.x : "50%",
          top: popupPos ? popupPos.y : "50%",
          transform: popupPos ? "none" : "translate(-50%, -50%)",
          maxWidth: 480, width: "90%", margin: 0,
          maxHeight: "80vh", display: "flex", flexDirection: "column", overflow: "hidden",
          zIndex: 101,
        }} onClick={e => e.stopPropagation()}>
          <button onClick={tryClose} onMouseDown={e => e.stopPropagation()} aria-label="Close" style={{
            position: "absolute", top: 10, right: 10, background: "none", border: "none",
            cursor: "pointer", fontSize: 18, color: C.muted, lineHeight: 1, padding: "4px 8px", zIndex: 10,
          }}>✕</button>

          {bookingSuccess ? (
            <div style={{ textAlign: "center", padding: "1rem" }}>
              <div style={{ fontSize: 16, fontWeight: 500, color: C.teal, marginBottom: 8 }}>
                {noChangeMessage
                  ? "No changes were made."
                  : editingBooking
                    ? "Changes saved!"
                    : (isAdminViewing ? "Session booked!" : "Session requested!")}
              </div>
              {!noChangeMessage && (
                <p style={{ ...S.p, color: C.muted }}>
                  {editingBooking
                    ? `Your updated session for ${dateLabel} at ${selectedTime} has been submitted for Diana's review.`
                    : (isAdminViewing
                        ? `Session for ${viewAsClient.first_name} on ${dateLabel} at ${selectedTime} has been confirmed.`
                        : `Your request for ${dateLabel} at ${selectedTime} has been submitted. Diana will review and confirm.`)}
                </p>
              )}
              {!noChangeMessage && !editingBooking && !isAdminViewing && bookingBalanceAfter != null && (() => {
                const min = bookingBalanceAfter;
                const abs = Math.abs(min);
                const h = Math.floor(abs / 60);
                const m = abs % 60;
                const sign = min < 0 ? "-" : "";
                const label = h === 0 ? `${sign}${m} minute${m !== 1 ? "s" : ""}`
                  : m === 0 ? `${sign}${h} hour${h !== 1 ? "s" : ""}`
                  : `${sign}${h} hr ${m} min`;
                return (
                  <p style={{ fontSize: 13, color: min < 0 ? "#c0392b" : C.muted, marginTop: 4, marginBottom: 4 }}>
                    Your remaining balance is now {label}.
                  </p>
                );
              })()}
              <button style={S.btn} onClick={closePopup}>Close</button>
            </div>
          ) : (
            <>
              <div
                onMouseDown={(e) => {
                  if (!popupRef.current) return;
                  const rect = popupRef.current.getBoundingClientRect();
                  dragStateRef.current = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top };
                  e.preventDefault();
                }}
                style={{ cursor: "grab", userSelect: "none", margin: "-1.25rem -1.5rem 0", padding: "1.25rem 1.5rem 0" }}
              >
                <h3 style={{ ...S.h3, paddingRight: 32 }}>
                  {editingBooking
                    ? (isChangeBlocked(editingBooking)
                        ? (editingBooking.status === "requested" ? "View Request" : "View Session")
                        : (editingBooking.status === "requested" ? "Edit Request" : "Edit Session"))
                    : (isAdminViewing ? `Book for ${viewAsClient.first_name}` : "Request a Session")}
                </h3>
              </div>
              {!editingBooking && !isAdminViewing && balanceMinutes !== null && (() => {
                const abs = Math.abs(balanceMinutes);
                const h = Math.floor(abs / 60);
                const m = abs % 60;
                const sign = balanceMinutes < 0 ? "-" : "";
                const label = h === 0 ? `${sign}${m} min` : m === 0 ? `${sign}${h} hr` : `${sign}${h} hr ${m} min`;
                return (
                  <p style={{ fontSize: 13, color: balanceMinutes < 0 ? "#c0392b" : C.muted, marginTop: -4, marginBottom: 8 }}>
                    Available to schedule: {label}
                  </p>
                );
              })()}
              <p style={{ ...S.p, fontSize: 13 }}>{dateLabel}</p>

              <div ref={popupScrollRef} style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain", minHeight: 0 }}>
              {editingBooking && isChangeBlocked(editingBooking) ? (
                <>
                  <p style={{ ...S.p, fontSize: 13, marginBottom: 12 }}>
                    {selectedTime && selectedType
                      ? `${formatTimeStr(selectedTime)} – ${formatTimeStr(addMinutesToTime(selectedTime, selectedType.duration))} (${selectedType.duration} min)`
                      : selectedTime ? formatTimeStr(selectedTime) : "—"}
                  </p>
                  {(() => {
                    const others = (editingBooking.participant_profiles || []).filter(p => p.id !== user?.id);
                    if (others.length === 0) return null;
                    return (
                      <div style={{ marginBottom: 12, padding: "8px 12px", background: C.warm, borderRadius: 8, border: `0.5px solid ${C.warmBorder}` }}>
                        <div style={{ fontSize: 12, color: C.muted, fontWeight: 500, marginBottom: 4 }}>Also attending</div>
                        {others.map(p => (
                          <div key={p.id} style={{ fontSize: 13, color: C.text }}>
                            {`${(p.first_name || "").trim()} ${(p.last_name || "").trim()}`.trim() || "Member"}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                  <div style={{ padding: "10px 14px", background: "#fff8e1", border: "1px solid #f0c040", borderRadius: 8, fontSize: 13, color: C.text }}>
                    {blockReason(editingBooking)}
                    {adminPhone && <> Text Diana at <strong>{adminPhone}</strong> for assistance.</>}
                  </div>
                </>
              ) : (
                <>
                  {/* Edit mode: also attending → close warning → time inputs → session type tiles */}
                  {editingBooking && (() => {
                    const others = (editingBooking.participant_profiles || []).filter(p => p.id !== user?.id);
                    if (others.length === 0) return null;
                    return (
                      <div style={{ marginBottom: 12, padding: "8px 12px", background: C.warm, borderRadius: 8, border: `0.5px solid ${C.warmBorder}` }}>
                        <div style={{ fontSize: 12, color: C.muted, fontWeight: 500, marginBottom: 4 }}>Also attending</div>
                        {others.map(p => (
                          <div key={p.id} style={{ fontSize: 13, color: C.text }}>
                            {`${(p.first_name || "").trim()} ${(p.last_name || "").trim()}`.trim() || "Member"}
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {showCloseWarning && (
                    <div style={{
                      background: "#fff8e1", border: "1px solid #f0c040", borderRadius: 8,
                      padding: "10px 14px", marginBottom: 16,
                    }}>
                      <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 500 }}>
                        You have unsaved changes. Save or discard before closing?
                      </p>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button style={S.btn} disabled={!selectedType || !selectedTime || confirming}
                          onClick={() => { setShowCloseWarning(false); handleBook(); }}>
                          {confirming ? "Saving..." : "Save"}
                        </button>
                        <button style={{ ...S.btnSmOut, color: "#c0392b", border: "1px solid #c0392b" }}
                          onClick={closePopup}>
                          Discard
                        </button>
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", flexDirection: "row", gap: 12, alignItems: "flex-end", marginBottom: 16 }}>
                    <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                      <label style={{ ...S.label, marginBottom: 4 }}>Start time</label>
                      <input type="time" value={selectedTime || ""}
                        onChange={e => setSelectedTime(e.target.value)}
                        style={{ ...S.input, width: "100%", boxSizing: "border-box", fontSize: 14, marginBottom: 0, textAlign: "left", WebkitAppearance: "none" }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label style={{ ...S.label, marginBottom: 4 }}>End time</label>
                      <div style={{ padding: "10px 12px", background: C.warm, borderRadius: 8, fontSize: 14, color: C.muted, border: "0.5px solid transparent" }}>
                        {selectedTime && selectedType ? formatTimeStr(addMinutesToTime(selectedTime, selectedType.duration)) : "—"}
                      </div>
                    </div>
                  </div>

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
                        <div style={{ fontSize: 12, color: C.muted }}>{t.duration} min</div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Participant selection — only for clients with other active group members */}
              {!editingBooking && !isAdminViewing && (() => {
                const otherMembers = groupMembers.filter(m => m.is_active && !m.profile?.is_archived && m.client_id !== user?.id);
                if (otherMembers.length === 0) return null;
                const allMembers = groupMembers.filter(m => m.is_active && !m.profile?.is_archived);
                const allSelected = allMembers.every(m => selectedParticipants.includes(m.client_id));
                const someSelected = allMembers.some(m => selectedParticipants.includes(m.client_id) && m.client_id !== user?.id);
                const toggleParticipant = (id) => {
                  if (id === user?.id) return;
                  setSelectedParticipants(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
                };
                const toggleAll = () => {
                  if (allSelected) setSelectedParticipants(user ? [user.id] : []);
                  else setSelectedParticipants(allMembers.map(m => m.client_id));
                };
                return (
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ ...S.label, marginBottom: 8 }}>Who's attending?</label>
                    <div style={{ border: `0.5px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                      {allMembers.length > 1 && (
                        <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: `0.5px solid ${C.border}`, cursor: "pointer", background: "#fafafa", fontSize: 13, fontWeight: 500 }}>
                          <input type="checkbox" checked={allSelected} onChange={toggleAll}
                            ref={el => { if (el) el.indeterminate = !allSelected && someSelected; }}
                            style={{ accentColor: C.teal }} />
                          All
                        </label>
                      )}
                      {allMembers.map(m => (
                        <label key={m.client_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: `0.5px solid ${C.border}`, cursor: m.client_id === user?.id ? "default" : "pointer", fontSize: 13 }}>
                          <input type="checkbox" checked={selectedParticipants.includes(m.client_id)}
                            onChange={() => toggleParticipant(m.client_id)}
                            disabled={m.client_id === user?.id}
                            style={{ accentColor: C.teal }} />
                          {m.profile ? `${m.profile.first_name || ""} ${m.profile.last_name || ""}`.trim() || "Member" : "Member"}
                          {m.client_id === user?.id && <span style={{ color: C.muted, fontSize: 11, marginLeft: 4 }}>you</span>}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Availability warning */}
              {!(editingBooking && isChangeBlocked(editingBooking)) && selectedType && selectedTime && (() => {

                const slots = availability[bookingDate] || [];
                const [h, m] = selectedTime.split(":").map(Number);
                const startMin = h * 60 + m;
                const endMin = startMin + selectedType.duration;

                // Build continuous available ranges from discrete slots
                // Use the authoritative increment from the API, not slot gap inference
                // (gaps caused by SP appointments would produce a wrong larger value).
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
                // When editing, the booking's own slots were filtered out of availability —
                // add them back so the booking doesn't appear "outside available hours" against itself.
                if (editingBooking && (editingBooking.date === bookingDate)) {
                  const [eh, em] = (editingBooking.time_slot || "00:00").split(":").map(Number);
                  const eStart = eh * 60 + em;
                  const eEnd = eStart + (editingBooking.session_duration || 60);
                  ranges.push([eStart, eEnd]);
                  ranges.sort((a, b) => a[0] - b[0]);
                  for (let i = ranges.length - 2; i >= 0; i--) {
                    if (ranges[i][1] >= ranges[i + 1][0]) {
                      ranges[i][1] = Math.max(ranges[i][1], ranges[i + 1][1]);
                      ranges.splice(i + 1, 1);
                    }
                  }
                }
                const covered = ranges.some(([rStart, rEnd]) => startMin >= rStart && endMin <= rEnd);

                const overlap = bookings.some(b => {
                  if (editingBooking && b.id === editingBooking.id) return false;
                  const bDate = localDateStr(new Date(b.start_time));
                  if (bDate !== bookingDate || !["requested", "booked"].includes(b.status)) return false;
                  const bStart = new Date(b.start_time).getHours() * 60 + new Date(b.start_time).getMinutes();
                  const bEnd = bStart + (b.session_duration || 60);
                  return startMin < bEnd && endMin > bStart;
                });

                const validStart = !!editingBooking || (availability[bookingDate] || []).includes(selectedTime);
                if (overlap) {
                  return <p style={{ fontSize: 13, color: "#c0392b", margin: "0 0 12px" }}>This time overlaps an existing booking.</p>;
                }
                if (!validStart) {
                  return <p style={{ fontSize: 13, color: "#c0392b", margin: "0 0 12px" }}>This start time is not on an available time slot.</p>;
                }
                if (!covered) {
                  return <p style={{ fontSize: 13, color: "#c0392b", margin: "0 0 12px" }}>Part of this time slot is outside available hours.</p>;
                }
                return null;
              })()}
              </div>

              {/* Sticky footer: summary + error + action buttons */}
              {!(editingBooking && isChangeBlocked(editingBooking)) && (
                <div style={{ flexShrink: 0, borderTop: `0.5px solid ${C.border}`, paddingTop: 12, marginTop: 4 }}>
                  {selectedType && selectedTime && (
                    <div style={{ padding: "0.75rem 1rem", background: C.warm, borderRadius: 12, marginBottom: 10 }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{selectedType.label}</div>
                      <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
                        {dateLabel} at {formatTimeStr(selectedTime)} — {selectedType.duration} min
                      </div>
                    </div>
                  )}
                  {bookingError && (
                    <div style={{ marginBottom: 10 }}>
                      <p style={{ fontSize: 13, color: "#c0392b", marginBottom: bookingError.includes("payment method") ? 8 : 0 }}>{bookingError}</p>
                      {bookingError.includes("payment method") && !viewAsClient && (
                        <button style={S.btnSm} onClick={() => { setProfileFocus("payment"); setPage("Profile"); }}>Add a payment method</button>
                      )}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {selectedType && selectedTime && (
                      <button style={S.btn} onClick={handleBook} disabled={confirming}>
                        {confirming
                          ? (editingBooking ? "Saving..." : isAdminViewing ? "Booking..." : "Requesting...")
                          : editingBooking
                            ? "Save Changes"
                            : (isAdminViewing ? "Book Session" : "Request Session")}
                      </button>
                    )}
                    {editingBooking && ["requested", "booked"].includes(editingBooking.status) && (
                      <button
                        style={{ ...S.btnSmOut, color: "#c0392b", border: "1px solid #c0392b" }}
                        onClick={() => { closePopup(); setCancelTarget(editingBooking); }}
                        disabled={confirming}
                      >
                        {editingBooking.status === "booked" ? "Cancel Session" : "Cancel Request"}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </>
    );
  };

  // --- Cancel modal ---
  const closeCancelModal = () => {
    setCancelTarget(null);
    setCancelSuccess(false);
    setCancelModalPos(null);
  };

  const renderCancelModal = () => {
    if (!cancelTarget) return null;
    return (
      <>
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.1)", zIndex: 100,
        }} onClick={closeCancelModal} />
        <div ref={cancelModalRef} style={{ ...S.card, maxWidth: 400, width: "90%", margin: 0, position: "fixed", left: cancelModalPos ? cancelModalPos.x : "50%", top: cancelModalPos ? cancelModalPos.y : "50%", transform: cancelModalPos ? "none" : "translate(-50%, -50%)", zIndex: 101 }} onClick={e => e.stopPropagation()}>
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
              <div onMouseDown={e => {
                if (e.target.closest("button")) return;
                if (!cancelModalRef.current) return;
                const rect = cancelModalRef.current.getBoundingClientRect();
                dragStateRef.current = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top, setter: setCancelModalPos };
                e.preventDefault();
              }} style={{ cursor: "grab", userSelect: "none", margin: "-1.25rem -1.5rem 0", padding: "1.25rem 1.5rem 0" }}>
                <h3 style={S.h3}>{cancelTarget.status === "booked" ? "Cancel Session" : "Cancel Request"}</h3>
              </div>
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
      </>
    );
  };

  // --- Move confirmation modal ---
  const renderMoveConfirmModal = () => {
    if (!pendingMove) return null;
    const { booking, newDate, newTime } = pendingMove;
    const oldDateLabel = new Date(booking.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const newDateLabel = new Date(newDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const oldTimeLabel = formatTimeStr(booking.time_slot || "00:00");
    const newTimeLabel = formatTimeStr(newTime);
    const wasBooked = booking.status === "booked";
    return (
      <>
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.1)", zIndex: 100,
        }} onClick={cancelPendingMove} />
        <div ref={moveModalRef} style={{ ...S.card, maxWidth: 440, width: "90%", margin: 0, position: "fixed", left: moveModalPos ? moveModalPos.x : "50%", top: moveModalPos ? moveModalPos.y : "50%", transform: moveModalPos ? "none" : "translate(-50%, -50%)", zIndex: 101 }} onClick={e => e.stopPropagation()}>
          <div onMouseDown={e => {
            if (e.target.closest("button")) return;
            if (!moveModalRef.current) return;
            const rect = moveModalRef.current.getBoundingClientRect();
            dragStateRef.current = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top, setter: setMoveModalPos };
            e.preventDefault();
          }} style={{ cursor: "grab", userSelect: "none", margin: "-1.25rem -1.5rem 0", padding: "1.25rem 1.5rem 0" }}>
          <h3 style={S.h3}>{wasBooked ? "Change Session?" : "Move Request?"}</h3>
          </div>
          <p style={S.p}>
            Move {wasBooked ? "your session" : "your request"} from{" "}
            <strong>{oldDateLabel} at {oldTimeLabel}</strong>
            <br />to{" "}
            <strong>{newDateLabel} at {newTimeLabel}</strong>?
          </p>
          {wasBooked && (
            <p style={{ ...S.p, fontSize: 13, color: "#c0392b" }}>
              This session is currently approved. Changing the time will send it back to Diana for re-approval.
            </p>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              style={{ ...S.btn, flex: 1, fontWeight: 600 }}
              onClick={confirmPendingMove}
              disabled={confirming}
            >
              {confirming ? "Saving..." : "Yes"}
            </button>
            <button
              style={{ ...S.btnSmOut, flex: 1, color: C.text, fontWeight: 600, border: `1px solid ${C.text}` }}
              onClick={cancelPendingMove}
              disabled={confirming}
            >
              No
            </button>
          </div>
        </div>
      </>
    );
  };

  // Mobile client booking: render form in normal document flow (avoids all iOS fixed-positioning bugs)
  if (mobile && !isAdminViewing && (bookingDate || editingBooking)) {
    return (
      <div style={{...S.page, paddingTop: "0.75rem", paddingBottom: "calc(5rem + env(safe-area-inset-bottom, 0px))"}}>
        {renderBookingFullPage()}
        {renderCancelModal()}
        {blockedAlertOpen && (
          <>
            <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.1)", zIndex: 200 }} onClick={() => setBlockedAlertOpen(false)} />
            <div style={{ ...S.card, maxWidth: 380, width: "90%", margin: 0, position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)", zIndex: 201 }} onClick={e => e.stopPropagation()}>
              <h3 style={{ ...S.h3, marginBottom: 10 }}>Change Not Allowed</h3>
              <p style={{ ...S.p, marginBottom: 4 }}>{blockedAlertReason}</p>
              {adminPhone && <p style={{ ...S.p, marginBottom: 16 }}>Text Diana at <strong>{adminPhone}</strong> for assistance.</p>}
              <button style={S.btn} onClick={() => setBlockedAlertOpen(false)}>OK</button>
            </div>
          </>
        )}
        {showSpinner && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
            <div style={{ width: 40, height: 40, border: `3px solid ${C.gridLine}`, borderTopColor: C.teal, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={S.page}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div>
          <h1 style={{ ...S.h1, fontSize: 26, marginBottom: 0 }}>Schedule</h1>
          {balanceMinutes != null && (() => {
            const h = Math.floor(Math.abs(balanceMinutes) / 60);
            const m = Math.abs(balanceMinutes) % 60;
            const sign = balanceMinutes < 0 ? "-" : "";
            const label = h === 0 ? `${sign}${m} minute${m !== 1 ? "s" : ""}`
              : m === 0 ? `${sign}${h} hour${h !== 1 ? "s" : ""}`
              : `${sign}${h} hour${h !== 1 ? "s" : ""} ${m} minute${m !== 1 ? "s" : ""}`;
            return <p style={{ ...S.p, fontSize: 20, color: C.muted, marginTop: 2, marginBottom: 0 }}>Available to schedule: {label}</p>;
          })()}
        </div>
        <button title="Refresh schedule" onClick={() => { availLoadedRef.current = false; loadData(); }} disabled={loading} style={{ background: "none", border: "none", cursor: loading ? "default" : "pointer", fontSize: 22, color: loading ? C.hint : C.muted, padding: "4px 2px", lineHeight: 1, marginTop: 2 }}>↻</button>
      </div>

      {!readOnly && !isAdminViewing && balanceMinutes !== null && balanceMinutes < 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 14px", marginBottom: 12, background: "#fdecea", borderRadius: 8, fontSize: 13, color: "#c0392b" }}>
          Your balance is negative — add time to your account before requesting a session.
          <button style={{ ...S.btnSm, padding: "4px 12px", fontSize: 13, background: "#c0392b" }} onClick={() => setPage("Buy Sessions")}>
            Buy Sessions
          </button>
        </div>
      )}

      {needsRefresh && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", marginBottom: 12, background: C.tealLight, borderRadius: 8, fontSize: 13, color: C.teal }}>
          Your schedule may have changed.
          <button style={{ ...S.btnSm, padding: "4px 12px", fontSize: 13 }} onClick={() => { setNeedsRefresh(false); loadData(); }}>
            Refresh Now
          </button>
        </div>
      )}

      <p style={{ ...S.p, fontSize: 13 }}>
        {readOnly
          ? "Read-only view — showing this client\u2019s bookings and available slots."
          : isAdminViewing
          ? `Managing ${viewAsClient.first_name}\u2019s schedule. Click to book or cancel sessions.`
          : "Available times are shown in blue. Click one to request a session. Click or drag your existing sessions to edit them — changing an approved session will send it back to Diana for re-approval."}
      </p>

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: C.hint }}>Loading...</div>
      ) : (
        <>
          {(view === "day" || view === "week") ? (
            <>
              {mobile ? (
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
                  <MiniCalendar currentDate={currentDate} onSelectDate={(d) => { setCurrentDate(d); closePopup(); }} view={view} />
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1 }} />
                  <MiniCalendar currentDate={currentDate} onSelectDate={(d) => { setCurrentDate(d); closePopup(); }} view={view} />
                  <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4 }}>
                    <button style={{ ...S.btnSmOut, marginRight: 10 }} onClick={() => { setCurrentDate(new Date()); closePopup(); }}>Today</button>
                    <button onClick={() => navigate(-1)} title={`Previous ${view}`} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 40, fontWeight: 300, lineHeight: 1, color: C.muted, padding: "0 2px", fontFamily: "inherit", display: "inline-flex", alignItems: "center", transform: "translateY(-5px)" }}>&lsaquo;</button>
                    <button onClick={() => navigate(1)} title={`Next ${view}`} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 40, fontWeight: 300, lineHeight: 1, color: C.muted, padding: "0 2px", fontFamily: "inherit", display: "inline-flex", alignItems: "center", transform: "translateY(-5px)" }}>&rsaquo;</button>
                    <select value={view} onChange={e => { setView(e.target.value); closePopup(); }} style={{ ...S.btnSmOut, paddingRight: 6, marginLeft: 10 }}>
                      <option value="day">Day</option>
                      <option value="week">Week</option>
                      <option value="month">Month</option>
                    </select>
                  </div>
                </div>
              )}
              {mobile && (
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 4, marginBottom: 8 }}>
                  <button style={{ ...S.btnSmOut, marginRight: 10 }} onClick={() => { setCurrentDate(new Date()); closePopup(); }}>Today</button>
                  <button onClick={() => navigate(-1)} title={`Previous ${view}`} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 40, fontWeight: 300, lineHeight: 1, color: C.muted, padding: "0 2px", fontFamily: "inherit", display: "inline-flex", alignItems: "center", transform: "translateY(-5px)" }}>&lsaquo;</button>
                  <button onClick={() => navigate(1)} title={`Next ${view}`} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 40, fontWeight: 300, lineHeight: 1, color: C.muted, padding: "0 2px", fontFamily: "inherit", display: "inline-flex", alignItems: "center", transform: "translateY(-5px)" }}>&rsaquo;</button>
                  <select value={view} onChange={e => { setView(e.target.value); closePopup(); }} style={{ ...S.btnSmOut, paddingRight: 6, marginLeft: 10 }}>
                    <option value="day">Day</option>
                    <option value="week">Week</option>
                    <option value="month">Month</option>
                  </select>
                </div>
              )}
            </>
          ) : (
            <>
              {mobile ? (
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 18, color: C.text, fontWeight: 600 }}>{`${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`}</span>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <button style={{ ...S.btnSmOut, marginRight: 10 }} onClick={() => { setCurrentDate(new Date()); closePopup(); }}>Today</button>
                  </div>
                  <span style={{ fontSize: 18, color: C.text, fontWeight: 600, textAlign: "center" }}>{`${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`}</span>
                  <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4 }}>
                    <button onClick={() => navigate(-1)} title={`Previous ${view}`} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 40, fontWeight: 300, lineHeight: 1, color: C.muted, padding: "0 2px", fontFamily: "inherit", display: "inline-flex", alignItems: "center", transform: "translateY(-5px)" }}>&lsaquo;</button>
                    <button onClick={() => navigate(1)} title={`Next ${view}`} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 40, fontWeight: 300, lineHeight: 1, color: C.muted, padding: "0 2px", fontFamily: "inherit", display: "inline-flex", alignItems: "center", transform: "translateY(-5px)" }}>&rsaquo;</button>
                    <select value={view} onChange={e => { setView(e.target.value); closePopup(); }} style={{ ...S.btnSmOut, paddingRight: 6, marginLeft: 10 }}>
                      <option value="day">Day</option>
                      <option value="week">Week</option>
                      <option value="month">Month</option>
                    </select>
                  </div>
                </div>
              )}
              {mobile && (
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 4, marginBottom: 8 }}>
                  <button style={{ ...S.btnSmOut, marginRight: 10 }} onClick={() => { setCurrentDate(new Date()); closePopup(); }}>Today</button>
                  <button onClick={() => navigate(-1)} title={`Previous ${view}`} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 40, fontWeight: 300, lineHeight: 1, color: C.muted, padding: "0 2px", fontFamily: "inherit", display: "inline-flex", alignItems: "center", transform: "translateY(-5px)" }}>&lsaquo;</button>
                  <button onClick={() => navigate(1)} title={`Next ${view}`} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 40, fontWeight: 300, lineHeight: 1, color: C.muted, padding: "0 2px", fontFamily: "inherit", display: "inline-flex", alignItems: "center", transform: "translateY(-5px)" }}>&rsaquo;</button>
                  <select value={view} onChange={e => { setView(e.target.value); closePopup(); }} style={{ ...S.btnSmOut, paddingRight: 6, marginLeft: 10 }}>
                    <option value="day">Day</option>
                    <option value="week">Week</option>
                    <option value="month">Month</option>
                  </select>
                </div>
              )}
            </>
          )}
          {view === "day" && renderDayView()}
          {view === "week" && renderWeekView()}
          {view === "month" && renderMonthView()}
        </>
      )}

      {renderBookingPopup()}
      {renderCancelModal()}
      {renderMoveConfirmModal()}
      {renderHoverTooltip()}
      {renderDragTooltip()}
      {blockedAlertOpen && (
        <>
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.1)", zIndex: 200 }} onClick={() => setBlockedAlertOpen(false)} />
          <div style={{ ...S.card, maxWidth: 380, width: "90%", margin: 0, position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)", zIndex: 201 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ ...S.h3, marginBottom: 10 }}>Change Not Allowed</h3>
            <p style={{ ...S.p, marginBottom: 4 }}>{blockedAlertReason}</p>
            {adminPhone && (
              <p style={{ ...S.p, marginBottom: 16 }}>Text Diana at <strong>{adminPhone}</strong> for assistance.</p>
            )}
            <button style={S.btn} onClick={() => setBlockedAlertOpen(false)}>OK</button>
          </div>
        </>
      )}
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
