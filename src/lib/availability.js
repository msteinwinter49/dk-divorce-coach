import { createClient } from "@supabase/supabase-js";

const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || "America/New_York";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Break a Date object into { date, hour, minute } as observed in a specific
// IANA time zone. Needed because Vercel servers run in UTC — new Date(iso).getHours()
// would give us UTC hours, not Diana's business-local hours.
function partsInTimezone(date, tz) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const p = {};
  for (const part of parts) p[part.type] = part.value;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hour: parseInt(p.hour, 10) % 24, // Intl may emit "24" for midnight
    minute: parseInt(p.minute, 10),
  };
}

// Fetch local events (Diana's personal blocks) from the events table as busy
// ranges. Always authoritative for what's in the DB — independent of whether
// Google is reachable, so the Client Schedule stays accurate even if the Google
// API is down or the integration hasn't been configured. Returns {} on failure.
async function getLocalEventsBusyByDate(supabase, startDate, endDate) {
  try {
    const { data: events } = await supabase
      .from("events")
      .select("date, start_time, end_time")
      .gte("date", startDate)
      .lte("date", endDate);

    const busy = {};
    const push = (dateKey, startMin, endMin) => {
      if (endMin <= startMin) return;
      (busy[dateKey] ||= []).push([startMin, endMin]);
    };

    for (const ev of events || []) {
      if (!ev.start_time || !ev.end_time) continue;
      const startParts = partsInTimezone(new Date(ev.start_time), BUSINESS_TIMEZONE);
      const endParts = partsInTimezone(new Date(ev.end_time), BUSINESS_TIMEZONE);
      if (startParts.date === endParts.date) {
        push(
          startParts.date,
          startParts.hour * 60 + startParts.minute,
          endParts.hour * 60 + endParts.minute
        );
      } else {
        push(startParts.date, startParts.hour * 60 + startParts.minute, 24 * 60);
        push(endParts.date, 0, endParts.hour * 60 + endParts.minute);
      }
    }

    return busy;
  } catch (e) {
    console.error("[availability] local events fetch failed:", e?.message || e);
    return {};
  }
}

// Fetch Google Calendar busy ranges keyed by business-timezone date, skipping
// only cancelled and transparent ("show me as available") events. Returns {}
// on any failure — availability stays permissive rather than blocking Diana's
// business.
//
// NOTE: We deliberately do NOT deduplicate against locally-synced records.
// Filtering is idempotent — blocking the same slot twice is identical to
// blocking it once. Some events will be present in both sources (a personal
// event in the local events table AND in Google after sync) and that's fine.
async function getGoogleBusyByDate(supabase, startDate, endDate) {
  try {
    const { data: tokenRow } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "google_refresh_token")
      .single();
    const token = tokenRow?.value;
    if (!token) return {};

    const { listEvents } = await import("./google-calendar.js");
    const onNewToken = async (newToken) => {
      await supabase.from("settings").upsert({
        key: "google_refresh_token",
        value: newToken,
        updated_at: new Date().toISOString(),
      });
    };
    const events = await listEvents(token, startDate, endDate, onNewToken);

    const busy = {};
    const push = (dateKey, startMin, endMin) => {
      if (endMin <= startMin) return;
      (busy[dateKey] ||= []).push([startMin, endMin]);
    };

    for (const ev of events) {
      if (!ev || ev.status === "cancelled") continue;
      if (ev.transparency === "transparent" && ev._type !== "sp") continue;

      // All-day event: block the whole day(s)
      if (ev.start?.date && !ev.start?.dateTime) {
        const start = new Date(`${ev.start.date}T12:00:00Z`);
        const endExclusive = new Date(`${(ev.end?.date || ev.start.date)}T12:00:00Z`);
        // Google all-day events use an exclusive end date; if same-day just block that one day
        if (endExclusive <= start) {
          push(ev.start.date, 0, 24 * 60);
        } else {
          for (let d = new Date(start); d < endExclusive; d.setUTCDate(d.getUTCDate() + 1)) {
            push(d.toISOString().slice(0, 10), 0, 24 * 60);
          }
        }
        continue;
      }

      if (!ev.start?.dateTime || !ev.end?.dateTime) continue;
      const startParts = partsInTimezone(new Date(ev.start.dateTime), BUSINESS_TIMEZONE);
      const endParts = partsInTimezone(new Date(ev.end.dateTime), BUSINESS_TIMEZONE);

      if (startParts.date === endParts.date) {
        push(
          startParts.date,
          startParts.hour * 60 + startParts.minute,
          endParts.hour * 60 + endParts.minute
        );
      } else {
        // Rare multi-day timed event — block start day tail, end day head
        push(startParts.date, startParts.hour * 60 + startParts.minute, 24 * 60);
        push(endParts.date, 0, endParts.hour * 60 + endParts.minute);
      }
    }

    return busy;
  } catch (e) {
    console.error("[availability] Google busy fetch failed, falling back to DB-only:", e?.message || e);
    return {};
  }
}

// Get available slots for a date range
// Returns: { "2026-04-05": ["09:00", "09:30", "10:00", ...], ... }
export async function getAvailableSlots(startDate, endDate, incrementMinutes = 30) {
  const supabase = getSupabase();

  // Fetch rules, overrides, and existing bookings in parallel
  const [rulesRes, overridesRes, bookingsRes, settingsRes] = await Promise.all([
    supabase.from("availability_rules").select("*"),
    supabase
      .from("availability_overrides")
      .select("*")
      .gte("date", startDate)
      .lte("date", endDate),
    supabase
      .from("bookings")
      .select("date, time_slot, session_duration, start_time, end_time, status")
      .in("status", ["requested", "booked"])
      .gte("date", startDate)
      .lte("date", endDate),
    supabase
      .from("settings")
      .select("key, value")
      .in("key", ["scheduling_increment"]),
  ]);

  const rules = rulesRes.data || [];
  const overrides = overridesRes.data || [];
  const bookings = bookingsRes.data || [];

  // Use configured increment if available
  const incrementSetting = settingsRes.data?.find(s => s.key === "scheduling_increment");
  const increment = incrementSetting ? parseInt(incrementSetting.value) : incrementMinutes;

  // Busy ranges from both sources: local events table (always authoritative
  // for Diana's personal blocks, even if Google is unreachable) and Google
  // Calendar (SP appointments + any Google-only events). Merging these two
  // independent sources means the grid stays accurate even if Google fails —
  // anything Diana added through the app still blocks availability.
  const [localBusy, googleBusy] = await Promise.all([
    getLocalEventsBusyByDate(supabase, startDate, endDate),
    getGoogleBusyByDate(supabase, startDate, endDate),
  ]);
  const busyByDate = {};
  for (const source of [localBusy, googleBusy]) {
    for (const [dateKey, ranges] of Object.entries(source)) {
      (busyByDate[dateKey] ||= []).push(...ranges);
    }
  }

  const slots = {};
  const current = new Date(startDate + "T12:00:00");
  const end = new Date(endDate + "T12:00:00");

  while (current <= end) {
    const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`;
    const dayOfWeek = current.getDay();

    // Get base availability from recurring rules
    const dayRules = rules.filter(r => r.day_of_week === dayOfWeek && !r.is_blocked);
    const dayBlocks = rules.filter(r => r.day_of_week === dayOfWeek && r.is_blocked);

    // Get overrides for this date
    const dayOverrides = overrides.filter(o => o.date === dateStr);

    // Check if the whole day is blocked by an override
    const dayBlocked = dayOverrides.some(o => !o.is_available && !o.start_time);
    if (dayBlocked) {
      slots[dateStr] = [];
      current.setDate(current.getDate() + 1);
      continue;
    }

    // Build time ranges from rules
    let available = [];
    for (const rule of dayRules) {
      const times = generateTimeSlots(rule.start_time, rule.end_time, increment);
      available.push(...times);
    }

    // Remove blocked times from rules
    for (const block of dayBlocks) {
      available = available.filter(
        t => t < block.start_time.slice(0, 5) || t >= block.end_time.slice(0, 5)
      );
    }

    // Apply overrides
    for (const override of dayOverrides) {
      if (override.is_available && override.start_time && override.end_time) {
        // Add availability
        const times = generateTimeSlots(override.start_time, override.end_time, increment);
        for (const t of times) {
          if (!available.includes(t)) available.push(t);
        }
      } else if (!override.is_available && override.start_time && override.end_time) {
        // Remove availability for specific time range
        available = available.filter(
          t => t < override.start_time.slice(0, 5) || t >= override.end_time.slice(0, 5)
        );
      }
    }

    // Remove times that overlap with existing bookings
    // Use date + time_slot + session_duration (local time, no timezone conversion)
    const dayBookings = bookings.filter(b => b.date === dateStr);

    for (const booking of dayBookings) {
      const [bH, bM] = booking.time_slot.split(":").map(Number);
      const bStartMin = bH * 60 + bM;
      const bEndMin = bStartMin + (booking.session_duration || 60);
      available = available.filter(t => {
        const [h, m] = t.split(":").map(Number);
        const slotMin = h * 60 + m;
        return slotMin < bStartMin || slotMin >= bEndMin;
      });
    }

    // Remove times that overlap with busy ranges from Google + local events.
    // Uses range-overlap (not point-in-range) because external events aren't
    // constrained to Diana's scheduling increment — a 10:15–10:45 SP session
    // must still block the 10:00–10:30 slot.
    const dayBusy = busyByDate[dateStr] || [];
    if (dayBusy.length > 0) {
      available = available.filter(t => {
        const [h, m] = t.split(":").map(Number);
        const slotStart = h * 60 + m;
        const slotEnd = slotStart + increment;
        return !dayBusy.some(([gStart, gEnd]) => slotStart < gEnd && slotEnd > gStart);
      });
    }

    available.sort();
    slots[dateStr] = available;
    current.setDate(current.getDate() + 1);
  }

  return slots;
}

// Check if a contiguous block is available for a given duration
export function isSlotAvailable(availableSlots, date, startTime, durationMinutes, incrementMinutes = 30) {
  const dateSlots = availableSlots[date] || [];
  const slotsNeeded = Math.ceil(durationMinutes / incrementMinutes);
  const startIndex = dateSlots.indexOf(startTime);

  if (startIndex === -1) return false;

  // Check that we have enough contiguous slots
  for (let i = 0; i < slotsNeeded; i++) {
    const expectedTime = addMinutes(startTime, i * incrementMinutes);
    if (dateSlots[startIndex + i] !== expectedTime) return false;
  }

  return true;
}

// Generate time slots between start and end at given increment
function generateTimeSlots(startTime, endTime, incrementMinutes) {
  const slots = [];
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);

  let minutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  while (minutes < endMinutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    minutes += incrementMinutes;
  }

  return slots;
}

// Add minutes to a time string "HH:MM" → "HH:MM"
function addMinutes(time, mins) {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + mins;
  const newH = Math.floor(total / 60);
  const newM = total % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}
