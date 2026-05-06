"use client";
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { C, S } from "@/lib/constants";
import { useIsMobile } from "@/lib/hooks";
import MiniCalendar from "@/components/portal/MiniCalendar";

// Diana's business timezone — used for all schedule comparisons so Vercel's UTC
// server never leaks through and the client-side conflict scan is portable to
// admins browsing from other time zones.
const BUSINESS_TZ = "America/New_York";

// Inline spinner for button-side loading feedback. Ships its own keyframes
// so it works wherever it's rendered (modals, standalone, etc.).
function Spinner({ size = 12, color = "#fff" }) {
  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <span style={{
        display: "inline-block",
        width: size, height: size,
        border: `2px solid rgba(255,255,255,0.35)`,
        borderTopColor: color,
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
        verticalAlign: "-2px",
        marginRight: 6,
      }} />
    </>
  );
}

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

function classifyEvent(event) {
  return event._type || "personal";
}

// Extract business-local { date, hour, minute } from a Date. Using Intl avoids
// depending on whatever the browser's local zone happens to be.
function partsInBusinessTz(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);
  const p = {};
  for (const part of parts) p[part.type] = part.value;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hour: parseInt(p.hour, 10) % 24,
    minute: parseInt(p.minute, 10),
  };
}

// Normalize a coaching booking into a conflict-scan chip. Uses the DB's
// date + time_slot + session_duration (already business-local, no tz games).
function bookingToChip(b) {
  if (!b.date || !b.time_slot) return null;
  if (!["requested", "booked"].includes(b.status)) return null;
  const [h, m] = b.time_slot.split(":").map(Number);
  const startMin = h * 60 + m;
  const endMin = startMin + (b.session_duration || 60);
  return {
    key: `booking:${b.id}`,
    kind: "coaching",
    date: b.date,
    startMin,
    endMin,
    title: `Coaching: ${clientName(b.profiles)} (${b.status})`,
    raw: b,
  };
}

// Normalize a Google event into a conflict-scan chip. Skips all-day events and
// multi-day events (out of scope for this first pass). Redacts SP summaries to
// "SP appointment" so the admin panel doesn't surface SP-side PII; personal
// events pass through their summary, coaching shows whatever the event says.
// Requires a Google event id so the chip key is deterministic across re-renders
// (needed for the layout lookup map downstream).
function eventToChip(ev) {
  if (!ev?.id) return null;
  if (!ev?.start?.dateTime || !ev?.end?.dateTime) return null;
  const startParts = partsInBusinessTz(new Date(ev.start.dateTime));
  const endParts = partsInBusinessTz(new Date(ev.end.dateTime));
  if (startParts.date !== endParts.date) return null;
  if (ev.status === "cancelled") return null;
  if (ev.transparency === "transparent") return null;

  const kind = classifyEvent(ev);
  let title;
  if (kind === "sp") title = "SP appointment";
  else if (kind === "coaching") title = ev.summary || "Coaching";
  else title = ev.summary ? `Personal: ${ev.summary}` : "Personal";

  return {
    key: `event:${ev.id}`,
    kind,
    date: startParts.date,
    startMin: startParts.hour * 60 + startParts.minute,
    endMin: endParts.hour * 60 + endParts.minute,
    title,
    raw: ev,
  };
}

// Filter out SP chips that only overlap other SP chips. Diana sometimes
// double-books an SP slot for the same person as an annotation about the
// appointment — those SP-on-SP collisions are intentional, not errors.
// An SP chip stays if (a) it has no direct overlaps at all, or (b) at least
// one of its direct overlaps is non-SP (e.g. a coaching session). Non-SP
// chips are never removed by this filter.
function filterIntentionalSpDupes(dayChips) {
  return dayChips.filter(chip => {
    if (chip.kind !== "sp") return true;
    let overlapsAnything = false;
    for (const other of dayChips) {
      if (other === chip) continue;
      const overlaps = other.startMin < chip.endMin && other.endMin > chip.startMin;
      if (!overlaps) continue;
      overlapsAnything = true;
      if (other.kind !== "sp") return true; // at least one non-SP overlap → keep
    }
    // Has overlaps but all are SP → drop as an intentional annotation duplicate.
    // No overlaps at all → keep (vacuous, not a conflict regardless).
    return !overlapsAnything;
  });
}

// Build the full chip list from bookings + Google events.
function buildChips(bookings, googleEvents) {
  const chips = [];
  for (const b of bookings || []) {
    const c = bookingToChip(b);
    if (c) chips.push(c);
  }
  for (const ev of googleEvents || []) {
    const c = eventToChip(ev);
    if (c) chips.push(c);
  }
  return chips;
}

// Cluster chips into connected-component groups per day where members strictly
// overlap (touching boundaries don't count). Groups of size < 2 are dropped.
// Sorted by date ascending.
function clusterOverlapsByDate(chips) {
  const byDate = {};
  for (const c of chips) {
    (byDate[c.date] ||= []).push(c);
  }
  const groups = [];
  for (const [date, dayChips] of Object.entries(byDate)) {
    dayChips.sort((a, b) => a.startMin - b.startMin);
    let current = null;
    let currentMaxEnd = -1;
    const flush = () => {
      if (current && current.length >= 2) groups.push({ date, chips: current });
    };
    for (const chip of dayChips) {
      if (current && chip.startMin < currentMaxEnd) {
        current.push(chip);
        currentMaxEnd = Math.max(currentMaxEnd, chip.endMin);
      } else {
        flush();
        current = [chip];
        currentMaxEnd = chip.endMin;
      }
    }
    flush();
  }
  groups.sort((a, b) => a.date.localeCompare(b.date));
  return groups;
}

// Scan bookings + Google events for conflict groups. Applies
// filterIntentionalSpDupes per-day so SP-on-SP annotation duplicates are not
// reported as conflicts.
function detectConflicts(bookings, googleEvents) {
  const chips = buildChips(bookings, googleEvents);
  const byDate = {};
  for (const c of chips) {
    (byDate[c.date] ||= []).push(c);
  }
  const filtered = [];
  for (const dayChips of Object.values(byDate)) {
    filtered.push(...filterIntentionalSpDupes(dayChips));
  }
  return clusterOverlapsByDate(filtered);
}

// Unfiltered overlap groups — used for day-view side-by-side layout so even
// SP-on-SP overlaps render adjacent instead of stacking on top of each other.
function detectAllOverlaps(bookings, googleEvents) {
  return clusterOverlapsByDate(buildChips(bookings, googleEvents));
}

export default function AdminSchedule({ setPage }) {
  const mobile = useIsMobile();
  const [view, setView] = useState("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [bookings, setBookings] = useState([]);
  const [availability, setAvailability] = useState({});
  const [googleEvents, setGoogleEvents] = useState([]);
  const [googleDisconnected, setGoogleDisconnected] = useState(false);
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
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [showAdminCloseWarning, setShowAdminCloseWarning] = useState(false);

  // Drag-to-move state (existing bookings + events)
  const dragRef = useRef(null);
  const weekHeaderRef = useRef(null);
  const weekBodyRef = useRef(null);
  const [dragOver, setDragOver] = useState(null); // { date, hour, snapTime, snapMinutes, blocked, x, y, itemId, durationMin, status, dragType }
  const [pendingMove, setPendingMove] = useState(null); // awaiting confirmation

  // Range selection state (click-drag to select contiguous empty slots)
  const selectRef = useRef(null); // { date, anchorMin }
  const [selection, setSelection] = useState(null); // { date, startMin, endMin, x, y }

  // Hover tooltip state
  const [hover, setHover] = useState(null); // { kind: "booking"|"event", data, x, y }

  // Conflict banner + modal state
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [conflictModalPos, setConflictModalPos] = useState({ x: 0, y: 0 });
  // When non-null the modal header is being dragged; the effect below attaches
  // window-level mouse listeners and updates conflictModalPos accordingly.
  const [conflictDragState, setConflictDragState] = useState(null);
  const [conflictCopyFeedback, setConflictCopyFeedback] = useState(null);

  // Search modal state
  const today0 = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchPreset, setSearchPreset] = useState("next60");
  const [searchStart, setSearchStart] = useState(() => dateStr(today0()));
  const [searchEnd, setSearchEnd] = useState(() => dateStr(addDays(today0(), 60)));
  const [searchBookings, setSearchBookings] = useState([]);
  const [searchEvents, setSearchEvents] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchDirty, setSearchDirty] = useState(false);
  // Committed snapshot — only updated when the Search button is clicked.
  const [committedText, setCommittedText] = useState("");
  const [committedStart, setCommittedStart] = useState("");
  const [committedEnd, setCommittedEnd] = useState("");
  const [searchModalPos, setSearchModalPos] = useState({ x: 0, y: 0 });
  const [searchDragState, setSearchDragState] = useState(null);
  const [searchMinimized, setSearchMinimized] = useState(false);
  const [selectedResultKey, setSelectedResultKey] = useState(null);
  const [miniPos, setMiniPos] = useState({ x: 20, y: 120 }); // top-left offset in px
  const [miniDragState, setMiniDragState] = useState(null);
  const miniMovedRef = useRef(false);
  const [flashChipKey, setFlashChipKey] = useState(null);
  const flashTimerRef = useRef(null);

  const flashChip = (key) => {
    setFlashChipKey(key);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlashChipKey(null), 2200);
  };

  // Compute start/end for a preset. Returns null for "custom" (keep current dates).
  const datesForPreset = (preset) => {
    const t = today0();
    if (preset === "all") {
      const s = new Date(t); s.setFullYear(s.getFullYear() - 5);
      const e = new Date(t); e.setFullYear(e.getFullYear() + 2);
      return { start: dateStr(s), end: dateStr(e) };
    }
    if (preset === "lastYear") {
      const y = t.getFullYear() - 1;
      return { start: `${y}-01-01`, end: `${y}-12-31` };
    }
    if (preset === "thisYear") {
      const y = t.getFullYear();
      return { start: `${y}-01-01`, end: `${y}-12-31` };
    }
    if (preset === "last60") return { start: dateStr(addDays(t, -60)), end: dateStr(t) };
    if (preset === "next60") return { start: dateStr(t), end: dateStr(addDays(t, 60)) };
    return null;
  };

  const applyPreset = (preset) => {
    setSearchPreset(preset);
    const r = datesForPreset(preset);
    if (r) { setSearchStart(r.start); setSearchEnd(r.end); }
  };

  const runSearch = () => {
    setCommittedText(searchText);
    setCommittedStart(searchStart);
    setCommittedEnd(searchEnd);
    setSearchDirty(true);
    setSelectedResultKey(null);
  };

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

  // Wider range for conflict detection: current displayed month + next month.
  // Bookings and Google events use this wider window so the conflict banner
  // reflects a rolling 2-month horizon, not just what's currently on screen.
  // Availability stays at the visible view range since it's view-scoped.
  const getConflictRange = useCallback(() => {
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 2, 0); // last day of next month
    return { start: dateStr(first), end: dateStr(last) };
  }, [currentDate]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { start, end } = getRange();
    const { start: wideStart, end: wideEnd } = getConflictRange();
    const [bookingsRes, availRes, eventsRes, clientsRes, typesRes] = await Promise.all([
      fetch(`/api/bookings?start=${wideStart}&end=${wideEnd}`).then(r => r.json()).catch(() => []),
      fetch(`/api/availability?start=${start}&end=${end}`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/calendar/events?start=${wideStart}&end=${wideEnd}`).then(r => r.json()).catch(() => []),
      fetch("/api/clients").then(r => r.json()).catch(() => ({ clients: [] })),
      fetch("/api/session-types").then(r => r.json()).catch(() => []),
    ]);
    setBookings(Array.isArray(bookingsRes) ? bookingsRes : []);
    const availOk = availRes && !availRes.error ? availRes : {};
    const { __increment, ...slotsByDate } = availOk;
    setAvailability(slotsByDate);
    if (typeof __increment === "number" && __increment > 0) setIncrement(__increment);
    // events response is now { events: [...], _googleDisconnected?: true }
    const eventsArr = Array.isArray(eventsRes) ? eventsRes : (eventsRes?.events || []);
    setGoogleEvents(eventsArr);
    setGoogleDisconnected(!!eventsRes?._googleDisconnected);
    setClients(clientsRes.clients || []);
    setSessionTypes(Array.isArray(typesRes) ? typesRes : []);
    setLoading(false);
  }, [getRange, getConflictRange]);

  useEffect(() => { loadData(); }, [loadData]);

  // Search modal: fetch bookings + events for the selected search range.
  // Debounced so live edits to dates/text don't spam the API.
  useEffect(() => {
    if (!searchOpen || !searchDirty) return;
    if (!committedStart || !committedEnd) return;
    let cancelled = false;
    (async () => {
      setSearchLoading(true);
      try {
        const [bRes, eRes] = await Promise.all([
          fetch(`/api/bookings?start=${committedStart}&end=${committedEnd}`).then(r => r.json()).catch(() => []),
          fetch(`/api/calendar/events?start=${committedStart}&end=${committedEnd}`).then(r => r.json()).catch(() => []),
        ]);
        if (cancelled) return;
        setSearchBookings(Array.isArray(bRes) ? bRes : []);
        setSearchEvents(Array.isArray(eRes) ? eRes : (eRes?.events || []));
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [searchOpen, searchDirty, committedStart, committedEnd, committedText]);

  // Derived: scheduling conflicts across bookings + Google events (2-month
  // horizon from getConflictRange). Only recomputes when the underlying data
  // changes — not on every mouse-hover re-render.
  const conflictGroups = useMemo(
    () => detectConflicts(bookings, googleEvents),
    [bookings, googleEvents]
  );

  // Derived: per-chip column layout for Day-view conflict splitting. Runs the
  // classic interval-scheduling column assignment within each conflict group,
  // then emits { leftPct, widthPct } for each chip. Chips outside any group
  // are absent from the map — callers fall back to full-width rendering.
  //
  // Example: A [10:00–11:00], B [10:30–11:30], C [11:00–12:00]
  //   A gets column 0 (end=11:00)
  //   B gets column 1 (col 0 still busy until 11:00; end=11:30)
  //   C gets column 0 (col 0 freed at 11:00, C starts at 11:00 → reuse)
  //   Group uses 2 columns → A/C at 0–50%, B at 50–100%.
  const overlapGroups = useMemo(
    () => detectAllOverlaps(bookings, googleEvents),
    [bookings, googleEvents]
  );

  const conflictLayoutByKey = useMemo(() => {
    const map = new Map();
    for (const group of overlapGroups) {
      const sorted = [...group.chips].sort((a, b) => a.startMin - b.startMin);
      const columnEnds = []; // columnEnds[i] = end time of the chip currently in column i
      const colIndexByKey = new Map();
      for (const chip of sorted) {
        let col = -1;
        for (let i = 0; i < columnEnds.length; i++) {
          if (chip.startMin >= columnEnds[i]) { col = i; break; }
        }
        if (col === -1) {
          col = columnEnds.length;
          columnEnds.push(chip.endMin);
        } else {
          columnEnds[col] = chip.endMin;
        }
        colIndexByKey.set(chip.key, col);
      }
      const colCount = columnEnds.length;
      for (const chip of sorted) {
        const col = colIndexByKey.get(chip.key);
        map.set(chip.key, {
          leftPct: (col / colCount) * 100,
          widthPct: 100 / colCount,
        });
      }
    }
    return map;
  }, [overlapGroups]);

  // Drag-to-move the conflict modal: when conflictDragState is set, window-level
  // mouse listeners update conflictModalPos; when drag ends, the state clears
  // and the cleanup removes the listeners. Mobile skips this entirely.
  useEffect(() => {
    if (!conflictDragState) return;
    const onMove = (e) => {
      setConflictModalPos({
        x: conflictDragState.posX + (e.clientX - conflictDragState.startX),
        y: conflictDragState.posY + (e.clientY - conflictDragState.startY),
      });
    };
    const onUp = () => setConflictDragState(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [conflictDragState]);

  const onConflictHeaderMouseDown = (e) => {
    if (mobile) return;
    e.preventDefault();
    setConflictDragState({
      startX: e.clientX,
      startY: e.clientY,
      posX: conflictModalPos.x,
      posY: conflictModalPos.y,
    });
  };

  // Drag-to-move the search modal. Clamp so the header bar can never leave the
  // viewport — without this the user can drag the modal above the top edge and
  // lose the ability to grab it again.
  useEffect(() => {
    if (!searchDragState) return;
    const onMove = (e) => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // Modal is centered with translate(-50%, -50%) + extra offset. Keep ~40px
      // of header clear of every edge.
      const maxUp = vh / 2 - 40;      // how far the center can rise before header clips top
      const maxDown = vh / 2 - 40;
      const maxLeft = vw / 2 - 40;
      const maxRight = vw / 2 - 40;
      const rawX = searchDragState.posX + (e.clientX - searchDragState.startX);
      const rawY = searchDragState.posY + (e.clientY - searchDragState.startY);
      setSearchModalPos({
        x: Math.max(-maxLeft, Math.min(maxRight, rawX)),
        y: Math.max(-maxUp, Math.min(maxDown, rawY)),
      });
    };
    const onUp = () => setSearchDragState(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [searchDragState]);

  // Drag-to-move the minimized search bubble. Also clamps to keep it on-screen.
  useEffect(() => {
    if (!miniDragState) return;
    const onMove = (e) => {
      const size = 48;
      const rawX = miniDragState.posX + (e.clientX - miniDragState.startX);
      const rawY = miniDragState.posY + (e.clientY - miniDragState.startY);
      const maxX = window.innerWidth - size - 8;
      const maxY = window.innerHeight - size - 8;
      const nx = Math.max(8, Math.min(maxX, rawX));
      const ny = Math.max(8, Math.min(maxY, rawY));
      if (nx !== miniDragState.posX || ny !== miniDragState.posY) miniMovedRef.current = true;
      setMiniPos({ x: nx, y: ny });
    };
    const onUp = () => setMiniDragState(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [miniDragState]);

  const onSearchHeaderMouseDown = (e) => {
    if (mobile) return;
    // Don't start a drag when clicking the Close button inside the header.
    if (e.target.closest("button")) return;
    e.preventDefault();
    setSearchDragState({
      startX: e.clientX,
      startY: e.clientY,
      posX: searchModalPos.x,
      posY: searchModalPos.y,
    });
  };

  // Jump to Day view for a conflict's date and dismiss the modal.
  const viewConflictDay = (dateStrVal) => {
    setView("day");
    setCurrentDate(new Date(dateStrVal + "T12:00:00"));
    setConflictModalOpen(false);
  };

  // Serialize the current conflict set as plain text for copy-to-clipboard.
  const copyConflictsInfo = async () => {
    if (conflictGroups.length === 0) return;
    const fmtMin = (min) => {
      const h = Math.floor(min / 60);
      const m = min % 60;
      const ampm = h >= 12 ? "pm" : "am";
      const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
      return `${display}:${String(m).padStart(2, "0")} ${ampm}`;
    };
    const body = conflictGroups.map(g => {
      const dateLabel = new Date(g.date + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric", year: "numeric",
      });
      const lines = [dateLabel];
      for (const chip of g.chips) {
        lines.push(`  \u2022 ${chip.title}, ${fmtMin(chip.startMin)} \u2013 ${fmtMin(chip.endMin)}`);
      }
      return lines.join("\n");
    }).join("\n\n");
    const header = `Scheduling conflicts \u2014 ${conflictGroups.length} group${conflictGroups.length === 1 ? "" : "s"}\n\n`;
    try {
      await navigator.clipboard.writeText(header + body);
      setConflictCopyFeedback("Copied!");
    } catch (e) {
      console.error("Copy failed:", e);
      setConflictCopyFeedback("Copy failed");
    }
    setTimeout(() => setConflictCopyFeedback(null), 2000);
  };

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
    setConfirmCancel(false);
    setShowAdminCloseWarning(false);
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
    if (res.ok) {
      await loadData();
      setModalSaving(false);
      closeModal();
    } else {
      setModalSaving(false);
      const err = await res.json().catch(() => ({}));
      setModalError(err.error || "Failed");
    }
  };

  const handleBookSession = async (force = false) => {
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
        tz_offset: new Date().getTimezoneOffset(),
        ...(force && { force: true }),
      }),
    });
    if (res.ok) {
      await loadData();
      setModalSaving(false);
      closeModal();
    } else {
      setModalSaving(false);
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
        tz_offset: new Date().getTimezoneOffset(),
      }),
    });
    if (res.ok) {
      await loadData();
      setModalSaving(false);
      closeModal();
    } else {
      setModalSaving(false);
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
    if (res.ok) {
      await loadData();
      setModalSaving(false);
      closeModal();
    } else {
      setModalSaving(false);
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
    if (res.ok) {
      await loadData();
      setModalSaving(false);
      closeModal();
    } else {
      setModalSaving(false);
      const err = await res.json().catch(() => ({}));
      setModalError(err.error || "Could not update event.");
    }
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
    if (res.ok) {
      await loadData();
      setModalSaving(false);
      closeModal();
    } else {
      setModalSaving(false);
      const err = await res.json().catch(() => ({}));
      setModalError(err.error || "Could not delete event.");
    }
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
    if (res.ok) {
      await loadData();
      setModalSaving(false);
      closeModal();
    } else {
      setModalSaving(false);
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

  // Raw (unsnapped) minute-of-day under the cursor.
  const rawMinFromCellEvent = (e, hour) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rowH = view === "day" ? DAY_ROW_H : WEEK_ROW_H;
    const fractionInRow = Math.max(0, Math.min(0.999, (e.clientY - rect.top) / rowH));
    return hour * 60 + fractionInRow * 60;
  };

  // All chip intervals [startMin, endMin) on the given date.
  const chipIntervalsOnDate = (date) => {
    const ivs = [];
    for (const b of bookings) {
      const bDate = b.date || dateStr(new Date(b.start_time));
      if (bDate !== date) continue;
      const s = new Date(b.start_time).getHours() * 60 + new Date(b.start_time).getMinutes();
      const eMin = new Date(b.end_time).getHours() * 60 + new Date(b.end_time).getMinutes();
      ivs.push([s, eMin]);
    }
    for (const ev of googleEvents) {
      if (!ev.start?.dateTime) continue;
      const eDate = ev.start.dateTime.split("T")[0];
      if (eDate !== date) continue;
      const s = new Date(ev.start.dateTime).getHours() * 60 + new Date(ev.start.dateTime).getMinutes();
      const eMin = ev.end?.dateTime
        ? new Date(ev.end.dateTime).getHours() * 60 + new Date(ev.end.dateTime).getMinutes()
        : s + 60;
      ivs.push([s, eMin]);
    }
    ivs.sort((a, b) => a[0] - b[0]);
    return ivs;
  };

  // Free range around the given raw minute. Returns null if the minute falls
  // inside an existing chip; otherwise the enclosing white/green span.
  const getFreeRangeAt = (date, rawMinute) => {
    const ivs = chipIntervalsOnDate(date);
    for (const [s, e] of ivs) {
      if (rawMinute >= s && rawMinute < e) return null;
    }
    let start = 0;
    let end = 24 * 60;
    for (const [s, e] of ivs) {
      if (e <= rawMinute) start = Math.max(start, e);
      if (s > rawMinute) { end = Math.min(end, s); break; }
    }
    return { start, end };
  };

  const handleCellMouseDown = (e, date, hour) => {
    if (e.target !== e.currentTarget && e.target.closest("[draggable]")) return;
    const rawMin = rawMinFromCellEvent(e, hour);
    const free = getFreeRangeAt(date, rawMin);
    if (!free) return;
    let anchorMin, endMin;
    const freeLen = free.end - free.start;
    if (freeLen <= increment * 2) {
      // Gap too small to snap inside — consume the whole free range so the user
      // can't miss a fragment above or below the click.
      anchorMin = free.start;
      endMin = free.end;
    } else {
      const snapped = Math.floor(rawMin / increment) * increment;
      anchorMin = Math.max(free.start, snapped);
      endMin = Math.min(free.end, anchorMin + increment);
    }
    selectRef.current = { date, anchorMin, freeStart: free.start, freeEnd: free.end };
    setSelection({ date, startMin: anchorMin, endMin, x: e.clientX, y: e.clientY });
  };

  const handleCellMouseMove = (e, date, hour) => {
    if (!selectRef.current || selectRef.current.date !== date) return;
    const { anchorMin: anchor, freeStart, freeEnd } = selectRef.current;
    const curMin = minFromCellEvent(e, hour);
    let startMin = Math.min(anchor, curMin);
    let endMin = Math.max(anchor, curMin) + increment;
    // Clamp the selection to the free range so it can't cross into another chip.
    startMin = Math.max(startMin, freeStart);
    endMin = Math.min(endMin, freeEnd);
    if (endMin <= startMin) endMin = Math.min(freeEnd, startMin + 1);
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
    if (res.ok) {
      // Keep "Saving..." on the modal until the post-move refetch completes,
      // so the user has a single continuous spinner across PATCH + reload
      // instead of the modal vanishing while the calendar silently refreshes.
      await loadData();
      setModalSaving(false);
      setPendingMove(null);
    } else {
      setModalSaving(false);
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

  // Merge contiguous availability slots into minute ranges so partial-hour
  // availability (e.g. 10:30–12:00) renders as one continuous bar instead of
  // snapping to hour-cell boundaries.
  const getAvailableRanges = (date) => {
    const slots = [...(availability[date] || [])].sort();
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
    return ranges;
  };

  // Emit hour-aligned sub-blocks for each available range so hour boundaries
  // stay visible inside green spans (mirrors the client Schedule bookable bars).
  const getAvailableOverlay = (date, rowH) => {
    const firstMin = HOURS[0] * 60;
    const lastMin = (HOURS[HOURS.length - 1] + 1) * 60;
    const blocks = [];
    for (const [rawS, rawE] of getAvailableRanges(date)) {
      const s = Math.max(rawS, firstMin);
      const e = Math.min(rawE, lastMin);
      if (e <= s) continue;
      let cursor = s;
      while (cursor < e) {
        const nextHour = (Math.floor(cursor / 60) + 1) * 60;
        const blockEnd = Math.min(nextHour, e);
        blocks.push({
          top: ((cursor - firstMin) / 60) * rowH,
          height: ((blockEnd - cursor) / 60) * rowH,
          isLast: blockEnd >= e,
        });
        cursor = blockEnd;
      }
    }
    return blocks;
  };

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
        layout: conflictLayoutByKey.get(`booking:${b.id}`),
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
        layout: ev.id ? conflictLayoutByKey.get(`event:${ev.id}`) : undefined,
      });
    });
    return items;
  };

  const getBookingsForDate = (date) =>
    bookings.filter(b => (b.date || dateStr(new Date(b.start_time))) === date);

  const getEventsForDate = (date) =>
    googleEvents.filter(e => (e.start?.dateTime || e.start?.date || "").split("T")[0] === date);

  // --- Render helpers ---

  const renderOverlayBooking = (b, top, height, compact, layout) => {
    const isRequested = b.status === "requested";
    const chipH = Math.max(height, compact ? 20 : 28);
    const canDrag = ["requested", "booked"].includes(b.status);
    const flashing = flashChipKey === `booking:${b.id}`;
    // When layout is provided (day-view conflict split), use percentage-based
    // horizontal positioning instead of the default full-width. The 1px
    // left-padding / 2px width-subtraction creates a thin gap between columns.
    const horizontal = layout
      ? { left: `calc(${layout.leftPct}% + 1px)`, width: `calc(${layout.widthPct}% - 2px)` }
      : { left: 2, right: 2 };
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
          position: "absolute", top, ...horizontal, zIndex: 4,
          height: chipH,
          padding: compact ? "2px 4px" : "4px 8px",
          borderRadius: compact ? 4 : 6,
          fontSize: compact ? 11 : 13,
          background: isRequested ? SRC.requestedBg : SRC.coachingBg,
          border: isRequested ? `2px solid ${SRC.requested}` : `1px solid ${C.teal}`,
          animation: flashing ? "chipFlash 1.1s ease-out 2" : undefined,
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

  const renderOverlayEvent = (event, top, height, compact, layout) => {
    const src = classifyEvent(event);
    const color = SRC[src];
    const bg = SRC[src + "Bg"];
    const chipH = Math.max(height, compact ? 20 : 28);
    const isLocal = !!event._local;
    const flashing = flashChipKey === `event:${event.id}`;
    const horizontal = layout
      ? { left: `calc(${layout.leftPct}% + 1px)`, width: `calc(${layout.widthPct}% - 2px)` }
      : { left: 2, right: 2 };
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
          position: "absolute", top, ...horizontal, zIndex: 4,
          height: chipH,
          padding: compact ? "2px 4px" : "4px 8px",
          borderRadius: compact ? 4 : 6,
          fontSize: compact ? 11 : 13,
          background: bg, border: `1px solid ${color}`,
          animation: flashing ? "chipFlash 1.1s ease-out 2" : undefined,
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
            {HOURS.map(h => (
              <div key={h} style={{
                height: DAY_ROW_H, borderBottom: `0.5px solid ${C.gridLine}`,
                background: "#fafafa",
                cursor: "crosshair",
                boxSizing: "border-box",
              }}
                onMouseDown={(e) => handleCellMouseDown(e, date, h)}
                onMouseMove={(e) => handleCellMouseMove(e, date, h)}
                onDragOver={(e) => handleDragOver(e, date, h)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, date, h)}
              />
            ))}
            {getAvailableOverlay(date, DAY_ROW_H).map((r, idx) => (
              <div key={`avail-${idx}`} style={{
                position: "absolute", left: 0, right: 0,
                top: r.top, height: r.height,
                background: SRC.available, pointerEvents: "none", zIndex: 0,
                borderBottom: r.isLast ? "none" : `0.5px solid ${C.gridLine}`,
                boxSizing: "border-box",
              }} />
            ))}
            {overlayItems.map(item =>
              item.kind === "booking"
                ? renderOverlayBooking(item.data, item.top, item.height, false, item.layout)
                : renderOverlayEvent(item.data, item.top, item.height, false, item.layout)
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
    const minW = mobile ? 770 : "auto";
    return (
      <div>
        {/* Header row is outside the overflow-x container so position:sticky works vertically */}
        <div ref={weekHeaderRef} style={{ position: "sticky", top: 0, zIndex: 20, overflowX: "hidden", background: "#fafafa" }}>
          <div style={{ display: "flex", minWidth: minW }}>
            <div style={{ width: 70, flexShrink: 0, height: 36, borderBottom: `0.5px solid ${C.gridLine}`, borderRight: `0.5px solid ${C.gridLine}` }} />
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
                  cursor: "pointer",
                }}
              >
                <div style={{ fontSize: 11, color: C.hint }}>{DAYS_SHORT[d.getDay()]}</div>
                <div style={{ fontSize: 14 }}>{d.getDate()}</div>
              </div>
            ))}
          </div>
        </div>
        {/* Body scrolls horizontally; header is synced to match */}
        <div
          ref={weekBodyRef}
          style={{ overflowX: "auto", userSelect: "none" }}
          onScroll={(e) => { if (weekHeaderRef.current) weekHeaderRef.current.scrollLeft = e.target.scrollLeft; }}
        >
          <div style={{ display: "flex", minWidth: minW }}>
            <div style={{ width: 70, flexShrink: 0, position: "sticky", left: 0, zIndex: 10, background: "#fff" }}>
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
                  <div style={{ position: "relative", height: totalH }}>
                    {HOURS.map(h => (
                      <div key={h} style={{
                        height: WEEK_ROW_H, borderBottom: `0.5px solid ${C.gridLine}`,
                        background: "#fafafa",
                        cursor: "crosshair",
                        boxSizing: "border-box",
                      }}
                        onMouseDown={(e) => handleCellMouseDown(e, date, h)}
                        onMouseMove={(e) => handleCellMouseMove(e, date, h)}
                        onDragOver={(e) => handleDragOver(e, date, h)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, date, h)}
                      />
                    ))}
                    {getAvailableOverlay(date, WEEK_ROW_H).map((r, idx) => (
                      <div key={`avail-${idx}`} style={{
                        position: "absolute", left: 0, right: 0,
                        top: r.top, height: r.height,
                        background: SRC.available, pointerEvents: "none", zIndex: 0,
                        borderBottom: r.isLast ? "none" : `0.5px solid ${C.gridLine}`,
                        boxSizing: "border-box",
                      }} />
                    ))}
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
      <div key={`month-${currentDate.getFullYear()}-${currentDate.getMonth()}`} style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", width: "100%", boxSizing: "border-box", border: `0.5px solid ${C.gridLine}`, borderRadius: 8, overflow: "hidden" }}>
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
                  minHeight: 80, padding: "4px 6px", minWidth: 0, overflow: "hidden",
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

  // --- Search icon button + modal ---
  const renderSearchIconButton = () => (
    <button
      type="button"
      onClick={() => {
        if (searchOpen && searchMinimized) setSearchMinimized(false);
        else setSearchOpen(true);
      }}
      title="Search"
      aria-label="Search"
      style={{
        ...S.btnSmOut,
        padding: "6px 10px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    </button>
  );

  // Build search results from the current search range + text.
  const buildSearchResults = () => {
    const q = committedText.trim().toLowerCase();
    const inRange = (date) => date >= committedStart && date <= committedEnd;
    const rows = [];

    for (const b of searchBookings) {
      if (!b.date || !b.time_slot) continue;
      if (!inRange(b.date)) continue;
      if (!["requested", "booked"].includes(b.status)) continue;
      const name = clientName(b.profiles);
      const typeLabel = b.session_types?.label || "Session";
      const statusLabel = b.status === "requested" ? "Request" : "Coaching";
      const timeStr = formatTimeStr(b.time_slot);
      const hay = [
        name, typeLabel, b.status, b.notes || "",
        b.date, timeStr, statusLabel,
      ].join(" \u0001 ").toLowerCase();
      if (q && !hay.includes(q)) continue;
      rows.push({
        key: `booking:${b.id}`,
        type: statusLabel,
        typeColor: b.status === "requested" ? SRC.requested : SRC.coaching,
        date: b.date,
        timeStr,
        timeSort: b.time_slot,
        name: `${name} · ${typeLabel}`,
      });
    }

    for (const ev of searchEvents) {
      if (!ev?.start?.dateTime) continue;
      const parts = partsInBusinessTz(new Date(ev.start.dateTime));
      if (!inRange(parts.date)) continue;
      const kind = classifyEvent(ev);
      const typeLabel = kind === "sp" ? "SP" : kind === "coaching" ? "Coaching" : "Personal";
      const summary = ev.summary || "Busy";
      const description = ev.description || "";
      const location = ev.location || "";
      const timeStr = formatTime(ev.start.dateTime);
      const timeKey = `${String(parts.hour).padStart(2,"0")}:${String(parts.minute).padStart(2,"0")}`;
      // Admin search: match against the real summary/description so Diana can find
      // SP appointments by client or topic. Grid display stays redacted.
      const hay = [summary, description, location, parts.date, timeStr, typeLabel].join(" ").toLowerCase();
      if (q && !hay.includes(q)) continue;
      rows.push({
        key: `event:${ev.id}`,
        type: typeLabel,
        typeColor: SRC[kind],
        date: parts.date,
        timeStr,
        timeSort: timeKey,
        name: summary,
      });
    }

    rows.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.timeSort.localeCompare(b.timeSort);
    });
    return rows;
  };

  const handleSearchResultClick = (row) => {
    const d = new Date(row.date + "T12:00:00");
    setCurrentDate(d);
    setView("day");
    flashChip(row.key);
    setSelectedResultKey(row.key);
    // Auto-minimize so the flashing chip is fully visible; modal state preserved.
    if (!miniMovedRef.current) setMiniPos({ x: 20, y: 120 });
    setSearchMinimized(true);
  };

  const renderSearchMini = () => {
    const size = 48;
    return (
      <button
        type="button"
        title="Open search"
        aria-label="Open search"
        onMouseDown={(e) => {
          if (mobile) return;
          miniMovedRef.current = false;
          setMiniDragState({
            startX: e.clientX, startY: e.clientY,
            posX: miniPos.x, posY: miniPos.y,
          });
        }}
        onClick={() => {
          // Only restore if this wasn't a drag.
          if (!miniMovedRef.current) setSearchMinimized(false);
          miniMovedRef.current = false;
        }}
        style={{
          position: "fixed",
          top: miniPos.y, left: miniPos.x,
          width: size, height: size, borderRadius: "50%",
          background: C.teal, color: "#fff",
          border: "none",
          boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
          cursor: miniDragState ? "grabbing" : "grab",
          zIndex: 151,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "inherit",
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>
    );
  };

  const renderSearchModal = () => {
    if (!searchOpen) return null;
    if (searchMinimized) return renderSearchMini();
    const rows = buildSearchResults();
    const presets = [
      ["all", "All"],
      ["lastYear", "Last year"],
      ["thisYear", "This year"],
      ["last60", "Last 60 days"],
      ["next60", "Next 60 days"],
      ["custom", "Custom"],
    ];
    return (
      <>
        <style>{`@keyframes chipFlash { 0% { box-shadow: 0 0 0 0 rgba(15,110,86,0.9); } 50% { box-shadow: 0 0 0 6px rgba(15,110,86,0.35); } 100% { box-shadow: 0 0 0 0 rgba(15,110,86,0); } }`}</style>
        <div
          role="dialog"
          aria-modal="false"
          style={{
            position: "fixed",
            top: mobile ? 40 : "50%",
            left: mobile ? 12 : "50%",
            right: mobile ? 12 : "auto",
            transform: mobile ? "none" : `translate(calc(-50% + ${searchModalPos.x}px), calc(-50% + ${searchModalPos.y}px))`,
            width: mobile ? "auto" : 640,
            maxWidth: "calc(100vw - 24px)",
            maxHeight: mobile ? "calc(100vh - 60px)" : "85vh",
            background: "#fff",
            border: `0.5px solid ${C.border}`,
            borderRadius: 12,
            boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
            zIndex: 151,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            onMouseDown={onSearchHeaderMouseDown}
            style={{
              padding: "14px 16px",
              borderBottom: `0.5px solid ${C.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: mobile ? "default" : (searchDragState ? "grabbing" : "grab"),
              userSelect: "none",
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Search schedule</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                style={S.btnSmOut}
                title="Minimize"
                aria-label="Minimize"
                onClick={() => {
                  if (!miniMovedRef.current) {
                    // Default-place the mini bubble below the page header on first use.
                    setMiniPos({ x: 20, y: 120 });
                  }
                  setSearchMinimized(true);
                }}
              >
                &#x2013;
              </button>
              <button style={S.btnSmOut} onClick={() => { setSearchOpen(false); setSearchMinimized(false); setSearchDirty(false); setSearchBookings([]); setSearchEvents([]); setSearchModalPos({ x: 0, y: 0 }); setCommittedText(""); setCommittedStart(""); setCommittedEnd(""); setSelectedResultKey(null); }}>Close</button>
            </div>
          </div>

          <div style={{ padding: "12px 16px", borderBottom: `0.5px solid ${C.border}` }}>
            <input
              type="text"
              placeholder="Search (name, type, title, description, notes…)"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
              style={{ ...S.input, marginBottom: 10 }}
              autoFocus
            />
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
              {presets.map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => applyPreset(k)}
                  style={{
                    ...S.btnSmOut,
                    ...(searchPreset === k ? { background: C.teal, color: "#fff", border: `0.5px solid ${C.teal}` } : {}),
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ ...S.label, margin: 0 }}>From</label>
              <input type="date" value={searchStart}
                onChange={(e) => { setSearchStart(e.target.value); setSearchPreset("custom"); }}
                style={{ ...S.input, width: "auto", marginBottom: 0 }} />
              <label style={{ ...S.label, margin: 0 }}>To</label>
              <input type="date" value={searchEnd}
                onChange={(e) => { setSearchEnd(e.target.value); setSearchPreset("custom"); }}
                style={{ ...S.input, width: "auto", marginBottom: 0 }} />
              <button style={S.btnSm} onClick={runSearch}>Search</button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {!searchDirty ? (
              <div style={{ padding: "2rem", textAlign: "center", color: C.hint }}>
                Enter search criteria and click Search.
              </div>
            ) : searchLoading ? (
              <div style={{ padding: "2rem", textAlign: "center", color: C.hint }}>Loading…</div>
            ) : rows.length === 0 ? (
              <div style={{ padding: "2rem", textAlign: "center", color: C.hint }}>
                {searchStart > searchEnd ? "Start date is after end date." : "No results."}
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#fafafa", position: "sticky", top: 0 }}>
                    <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: C.muted, borderBottom: `0.5px solid ${C.border}` }}>Type</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: C.muted, borderBottom: `0.5px solid ${C.border}` }}>Date</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: C.muted, borderBottom: `0.5px solid ${C.border}` }}>Start</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: C.muted, borderBottom: `0.5px solid ${C.border}` }}>Name / Description</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const isSelected = r.key === selectedResultKey;
                    const selectedBg = C.tealLight;
                    return (
                    <tr key={r.key}
                      onClick={() => handleSearchResultClick(r)}
                      style={{
                        cursor: "pointer",
                        borderBottom: `0.5px solid ${C.border}`,
                        background: isSelected ? selectedBg : "transparent",
                        borderLeft: isSelected ? `3px solid ${C.teal}` : "3px solid transparent",
                      }}
                      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "#f5f5f5"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = isSelected ? selectedBg : "transparent"; }}
                    >
                      <td style={{ padding: "8px 12px", color: r.typeColor, fontWeight: 500, whiteSpace: "nowrap" }}>{r.type}</td>
                      <td style={{ padding: "8px 12px", whiteSpace: "nowrap", color: C.text }}>{r.date}</td>
                      <td style={{ padding: "8px 12px", whiteSpace: "nowrap", color: C.text }}>{r.timeStr}</td>
                      <td style={{ padding: "8px 12px", color: C.text }}>{r.name}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ padding: "10px 16px", borderTop: `0.5px solid ${C.border}`, textAlign: "right", color: C.hint, fontSize: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{searchDirty ? `${rows.length} result${rows.length === 1 ? "" : "s"}` : ""}</span>
            <button style={S.btnSmOut} onClick={() => { setSearchOpen(false); setSearchDirty(false); setSearchBookings([]); setSearchEvents([]); setSearchModalPos({ x: 0, y: 0 }); setCommittedText(""); setCommittedStart(""); setCommittedEnd(""); }}>Close</button>
          </div>
        </div>
      </>
    );
  };

  // --- Modal renderer ---
  const renderModal = () => {
    if (!modal) return null;

    const hasAdminUnsavedChanges = (() => {
      if (modal.mode === "edit") {
        const b = modal.booking;
        return bookType !== (b.session_type_id || "") || bookDate !== (b.date || "") || bookTime !== (b.time_slot || "");
      }
      if (modal.mode === "editEvent") {
        const ev = modal.event;
        const startD = ev.start?.dateTime ? new Date(ev.start.dateTime) : null;
        const endD = ev.end?.dateTime ? new Date(ev.end.dateTime) : null;
        const origDate = startD ? dateStr(startD) : "";
        const origStart = startD ? `${String(startD.getHours()).padStart(2, "0")}:${String(startD.getMinutes()).padStart(2, "0")}` : "";
        const origEnd = endD ? `${String(endD.getHours()).padStart(2, "0")}:${String(endD.getMinutes()).padStart(2, "0")}` : "";
        return eventTitle !== (ev.summary || "") || bookDate !== origDate || bookTime !== origStart || eventEndTime !== origEnd;
      }
      if (modal.mode === "book") return !!(bookClient || bookType);
      if (modal.mode === "event") return !!eventTitle;
      return false;
    })();

    const tryCloseAdmin = () => {
      if (hasAdminUnsavedChanges) setShowAdminCloseWarning(true);
      else closeModal();
    };

    return (
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
      }} onClick={tryCloseAdmin}>
        <div style={{ ...S.card, maxWidth: 480, width: "90%", margin: 0, maxHeight: "80vh", overflowY: "auto", overscrollBehavior: "contain", position: "relative" }} onClick={e => e.stopPropagation()}>
          <button onClick={tryCloseAdmin} aria-label="Close" style={{
            position: "absolute", top: 10, right: 10, background: "none", border: "none",
            cursor: "pointer", fontSize: 18, color: C.muted, lineHeight: 1, padding: "4px 8px", zIndex: 1,
          }}>✕</button>
          {modal.mode === "choose" && renderChooseContent()}
          {modal.mode === "accept" && renderAcceptContent()}
          {modal.mode === "edit" && renderEditContent()}
          {modal.mode === "book" && renderBookContent()}
          {modal.mode === "event" && renderEventContent()}
          {modal.mode === "editEvent" && renderEditEventContent()}
          {modalError && (
            <div style={{ marginTop: 8 }}>
              <p style={{ fontSize: 13, color: SRC.requested, marginBottom: modalError === "Time slot is not available" && modal?.mode === "book" ? 6 : 0 }}>{modalError}</p>
              {modalError === "Time slot is not available" && modal?.mode === "book" && (
                <button style={{ ...S.btnSmOut, borderColor: SRC.requested, color: SRC.requested, fontSize: 13 }} onClick={() => handleBookSession(true)} disabled={modalSaving}>
                  Submit Anyway
                </button>
              )}
            </div>
          )}
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
        <h3 style={{ ...S.h3, paddingRight: 32 }}>New Entry</h3>
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
      </>
    );
  };

  const renderAcceptContent = () => {
    const b = modal.booking;
    return (
      <>
        <h3 style={{ ...S.h3, paddingRight: 32 }}>Session Request</h3>
        <div style={{ fontSize: 14, color: C.text, marginBottom: 8 }}>
          <p><strong>Client:</strong> {clientName(b.profiles)}</p>
          <p><strong>Date:</strong> {b.date}</p>
          <p><strong>Time:</strong> {formatTime(b.start_time)} - {formatTime(b.end_time)}</p>
          <p><strong>Duration:</strong> {b.session_duration} min</p>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button style={S.btn} onClick={() => handleAcceptDecline("accept")} disabled={modalSaving}>
            {modalSaving ? (<><Spinner />Saving...</>) : "Accept"}
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
        <h3 style={{ ...S.h3, paddingRight: 32 }}>Edit Session</h3>
        <p style={{ ...S.p, fontSize: 13, marginBottom: 12 }}>
          <strong>Client:</strong> {clientName(b.profiles)}
        </p>
        {showAdminCloseWarning && (
          <div style={{ background: "#fff8e1", border: "1px solid #f0c040", borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
            <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 500 }}>You have unsaved changes. Save or discard before closing?</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={S.btn} disabled={modalSaving} onClick={() => { setShowAdminCloseWarning(false); handleUpdateBooking(); }}>
                {modalSaving ? "Saving..." : "Save"}
              </button>
              <button style={{ ...S.btnSmOut, color: "#c0392b", border: "1px solid #c0392b" }} onClick={closeModal}>Discard</button>
            </div>
          </div>
        )}

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

        {confirmCancel ? (
          <div style={{ marginTop: 8, padding: "12px 14px", background: "#fdecea", borderRadius: 8 }}>
            <p style={{ fontSize: 13, color: SRC.requested, marginBottom: 8 }}>
              Are you sure you want to cancel this session? The client will be notified and their balance refunded.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                style={{ ...S.btn, background: SRC.requested }}
                onClick={handleCancelBooking}
                disabled={modalSaving}
              >
                {modalSaving ? <><Spinner />Cancelling...</> : "Yes, Cancel Session"}
              </button>
              <button style={S.btnSmOut} onClick={() => setConfirmCancel(false)} disabled={modalSaving}>Go Back</button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button style={S.btn} onClick={handleUpdateBooking} disabled={modalSaving}>
              {modalSaving ? (<><Spinner />Saving...</>) : "Save Changes"}
            </button>
            <button
              style={{ ...S.btnSmOut, color: SRC.requested, border: `1px solid ${SRC.requested}` }}
              onClick={() => setConfirmCancel(true)}
              disabled={modalSaving}
            >
              Cancel Session
            </button>
          </div>
        )}
      </>
    );
  };

  const renderBookContent = () => {
    const clientList = clients.filter(c => c.role === "client");
    return (
      <>
        <h3 style={{ ...S.h3, paddingRight: 32 }}>Book a Session</h3>
        {showAdminCloseWarning && (
          <div style={{ background: "#fff8e1", border: "1px solid #f0c040", borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
            <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 500 }}>You have unsaved changes. Save or discard before closing?</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={S.btn} disabled={modalSaving || !bookClient || !bookType} onClick={() => { setShowAdminCloseWarning(false); handleBookSession(); }}>
                {modalSaving ? "Saving..." : "Save"}
              </button>
              <button style={{ ...S.btnSmOut, color: "#c0392b", border: "1px solid #c0392b" }} onClick={closeModal}>Discard</button>
            </div>
          </div>
        )}

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
            {modalSaving ? (<><Spinner />Booking...</>) : "Book Session"}
          </button>
        </div>
      </>
    );
  };

  const renderEventContent = () => (
    <>
      <h3 style={{ ...S.h3, paddingRight: 32 }}>Add Event</h3>
      {showAdminCloseWarning && (
        <div style={{ background: "#fff8e1", border: "1px solid #f0c040", borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
          <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 500 }}>You have unsaved changes. Save or discard before closing?</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={S.btn} disabled={modalSaving || !eventTitle} onClick={() => { setShowAdminCloseWarning(false); handleCreateEvent(); }}>
              {modalSaving ? "Saving..." : "Save"}
            </button>
            <button style={{ ...S.btnSmOut, color: "#c0392b", border: "1px solid #c0392b" }} onClick={closeModal}>Discard</button>
          </div>
        </div>
      )}
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
          {modalSaving ? (<><Spinner />Creating...</>) : "Create Event"}
        </button>
      </div>
    </>
  );

  const renderEditEventContent = () => (
    <>
      <h3 style={{ ...S.h3, paddingRight: 32 }}>Edit Event</h3>
      {showAdminCloseWarning && (
        <div style={{ background: "#fff8e1", border: "1px solid #f0c040", borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
          <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 500 }}>You have unsaved changes. Save or discard before closing?</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={S.btn} disabled={modalSaving} onClick={() => { setShowAdminCloseWarning(false); handleUpdateEvent(); }}>
              {modalSaving ? "Saving..." : "Save"}
            </button>
            <button style={{ ...S.btnSmOut, color: "#c0392b", border: "1px solid #c0392b" }} onClick={closeModal}>Discard</button>
          </div>
        </div>
      )}
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
          {modalSaving ? (<><Spinner />Saving...</>) : "Save Changes"}
        </button>
        <button
          style={{ ...S.btnSmOut, color: SRC.requested, border: `1px solid ${SRC.requested}` }}
          onClick={handleDeleteEvent}
          disabled={modalSaving}
        >
          Delete Event
        </button>
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
              {modalSaving ? (<><Spinner />Saving...</>) : "Yes"}
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
          <div>{b.session_duration} min</div>
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
  // --- Conflict banner + modal ---

  const renderConflictBanner = () => {
    const count = conflictGroups.length;
    if (count === 0) return null;
    return (
      <div
        onClick={() => setConflictModalOpen(true)}
        style={{
          background: "#c0392b",
          color: "#fff",
          padding: "10px 16px",
          borderRadius: 6,
          marginBottom: 12,
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          gap: 10,
          boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
        }}
      >
        <span style={{ fontSize: 18 }}>&#9888;</span>
        <span>
          {`${count} scheduling conflict${count === 1 ? "" : "s"} detected \u2014 click to review`}
        </span>
      </div>
    );
  };

  const renderConflictModal = () => {
    if (!conflictModalOpen || conflictGroups.length === 0) return null;

    const mobileStyle = {
      position: "fixed",
      top: 60,
      left: 16,
      right: 16,
      maxHeight: "calc(100vh - 80px)",
    };
    const desktopStyle = {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: `translate(calc(-50% + ${conflictModalPos.x}px), calc(-50% + ${conflictModalPos.y}px))`,
      width: 520,
      maxHeight: "80vh",
    };

    const fmtMin = (min) => {
      const h = Math.floor(min / 60);
      const m = min % 60;
      const ampm = h >= 12 ? "pm" : "am";
      const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
      return `${display}:${String(m).padStart(2, "0")} ${ampm}`;
    };

    return (
      <div
        style={{
          ...(mobile ? mobileStyle : desktopStyle),
          background: "#fff",
          border: "2px solid #c0392b",
          borderRadius: 10,
          boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
          zIndex: 200,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Draggable header */}
        <div
          onMouseDown={onConflictHeaderMouseDown}
          style={{
            background: "#c0392b",
            color: "#fff",
            padding: "10px 16px",
            fontWeight: 600,
            fontSize: 15,
            cursor: mobile ? "default" : (conflictDragState ? "grabbing" : "grab"),
            userSelect: "none",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 18 }}>&#9888;</span>
          <span>Scheduling Conflict{conflictGroups.length === 1 ? "" : "s"}</span>
          <span style={{ marginLeft: "auto", fontSize: 12, opacity: 0.9, fontWeight: 400 }}>
            {conflictGroups.length} group{conflictGroups.length === 1 ? "" : "s"}
          </span>
        </div>

        {/* Body */}
        <div style={{ padding: "14px 16px", overflowY: "auto", flex: 1 }}>
          {conflictGroups.map((g, idx) => {
            const dateLabel = new Date(g.date + "T12:00:00").toLocaleDateString("en-US", {
              weekday: "long", month: "long", day: "numeric", year: "numeric",
            });
            return (
              <div key={`${g.date}-${idx}`} style={{ marginBottom: 18 }}>
                <div style={{ fontWeight: 600, color: C.text, marginBottom: 6 }}>{dateLabel}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 8, paddingLeft: 4 }}>
                  {g.chips.map((chip) => (
                    <div key={chip.key} style={{ fontSize: 13, color: C.text }}>
                      &bull;{" "}
                      <span style={{ color: SRC[chip.kind] || C.text, fontWeight: 500 }}>
                        {chip.title}
                      </span>
                      , {fmtMin(chip.startMin)} &ndash; {fmtMin(chip.endMin)}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => viewConflictDay(g.date)}
                  style={{ ...S.btnSmOut, fontSize: 12 }}
                >
                  View Day
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          borderTop: `1px solid ${C.gridLine}`,
          padding: "10px 16px",
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          alignItems: "center",
          background: "#fafafa",
        }}>
          {conflictCopyFeedback && (
            <span style={{ fontSize: 12, color: C.muted, marginRight: "auto" }}>
              {conflictCopyFeedback}
            </span>
          )}
          <button onClick={copyConflictsInfo} style={S.btnSmOut}>Copy Info</button>
          <button
            onClick={() => setConflictModalOpen(false)}
            style={{ ...S.btnSmOut, background: C.teal, color: "#fff", borderColor: C.teal }}
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  };

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

      {renderConflictBanner()}
      {googleDisconnected && (
        <div style={{ background: "#fff3cd", border: "1px solid #ffc107", borderRadius: 6, padding: "10px 14px", marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span>⚠ Google Calendar disconnected — SimplePractice sessions won't appear.</span>
          {setPage && (
            <button
              style={{ background: "none", border: "none", cursor: "pointer", color: C.teal, fontWeight: 600, fontSize: 13, padding: 0, textDecoration: "underline" }}
              onClick={() => setPage("Admin Settings")}
            >
              Reconnect in Settings
            </button>
          )}
        </div>
      )}
      {renderColorKey()}

      <p style={{ ...S.p, fontSize: 13 }}>
        Click or drag across empty cells to add a session or event. Click a session to edit or cancel. Drag sessions to reschedule.
      </p>

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: C.hint }}>Loading...</div>
      ) : (
        <>
          {(view === "day" || view === "week") ? (
            <>
              {mobile ? (
                <div style={{ position: "relative", display: "flex", justifyContent: "center", alignItems: "flex-end", marginBottom: 6 }}>
                  <div style={{ position: "absolute", left: 0 }}>{renderSearchIconButton()}</div>
                  <MiniCalendar currentDate={currentDate} onSelectDate={(d) => setCurrentDate(d)} view={view} />
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>{renderSearchIconButton()}</div>
                  <MiniCalendar currentDate={currentDate} onSelectDate={(d) => setCurrentDate(d)} view={view} />
                  <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", gap: 4, flexWrap: "wrap" }}>
                    <button style={S.btnSmOut} onClick={() => setCurrentDate(new Date())}>Today</button>
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
              {mobile && (
                <div style={{ display: "flex", justifyContent: "center", gap: 4, marginBottom: 8 }}>
                  <button style={S.btnSmOut} onClick={() => setCurrentDate(new Date())}>Today</button>
                  {["day", "week", "month"].map(v => (
                    <button key={v}
                      style={{ ...S.btnSmOut, ...(view === v ? { background: C.teal, color: "#fff", border: `0.5px solid ${C.teal}` } : {}) }}
                      onClick={() => setView(v)}>
                      {v.charAt(0).toUpperCase() + v.slice(1)}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {mobile ? (
                <div style={{ position: "relative", display: "flex", justifyContent: "center", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ position: "absolute", left: 0 }}>{renderSearchIconButton()}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 28, lineHeight: 1, color: C.text, fontWeight: 700, padding: "0 6px", fontFamily: "inherit" }}>&lsaquo;</button>
                    <span style={{ fontSize: 18, color: C.text, fontWeight: 600 }}>{`${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`}</span>
                    <button onClick={() => navigate(1)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 28, lineHeight: 1, color: C.text, fontWeight: 700, padding: "0 6px", fontFamily: "inherit" }}>&rsaquo;</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>{renderSearchIconButton()}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 28, lineHeight: 1, color: C.text, fontWeight: 700, padding: "0 6px", fontFamily: "inherit" }}>&lsaquo;</button>
                    <span style={{ fontSize: 18, color: C.text, fontWeight: 600, textAlign: "center" }}>{`${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`}</span>
                    <button onClick={() => navigate(1)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 28, lineHeight: 1, color: C.text, fontWeight: 700, padding: "0 6px", fontFamily: "inherit" }}>&rsaquo;</button>
                  </div>
                  <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", gap: 4, flexWrap: "wrap" }}>
                    <button style={S.btnSmOut} onClick={() => setCurrentDate(new Date())}>Today</button>
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
              {mobile && (
                <div style={{ display: "flex", justifyContent: "center", gap: 4, marginBottom: 8 }}>
                  <button style={S.btnSmOut} onClick={() => setCurrentDate(new Date())}>Today</button>
                  {["day", "week", "month"].map(v => (
                    <button key={v}
                      style={{ ...S.btnSmOut, ...(view === v ? { background: C.teal, color: "#fff", border: `0.5px solid ${C.teal}` } : {}) }}
                      onClick={() => setView(v)}>
                      {v.charAt(0).toUpperCase() + v.slice(1)}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {view === "day" && renderDayView()}
          {view === "week" && renderWeekView()}
          {view === "month" && renderMonthView()}
        </>
      )}

      {renderSearchModal()}
      {renderModal()}
      {renderMoveConfirmModal()}
      {renderConflictModal()}
      {renderHoverTooltip()}
      {renderDragTooltip()}
      {renderSelectionTooltip()}
    </div>
  );
}
