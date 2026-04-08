import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
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
