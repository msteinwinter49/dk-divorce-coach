"use client";
import { C } from "@/lib/constants";

const DAYS_SHORT = ["S", "M", "T", "W", "T", "F", "S"];

function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function startOfWeek(d) { const r = new Date(d); r.setDate(r.getDate() - r.getDay()); return r; }
function sameDay(a, b) { return dateStr(a) === dateStr(b); }

export default function MiniCalendar({ currentDate, onSelectDate, view }) {
  const today = new Date();
  const miniMonth = currentDate.getMonth();
  const miniYear = currentDate.getFullYear();

  // Build week grid for the displayed month
  const first = new Date(miniYear, miniMonth, 1);
  const last = new Date(miniYear, miniMonth + 1, 0);
  const gridStart = startOfWeek(first);
  const weeks = [];
  let d = new Date(gridStart);
  while (d <= addDays(startOfWeek(last), 6)) {
    const week = [];
    for (let i = 0; i < 7; i++) { week.push(new Date(d)); d = addDays(d, 1); }
    weeks.push(week);
  }

  // Determine which dates are in the selected range
  const selectedWeekStart = view === "week" ? startOfWeek(currentDate) : null;
  const isInRange = (day) => {
    if (view === "day") return sameDay(day, currentDate);
    if (view === "week") return dateStr(day) >= dateStr(selectedWeekStart) && dateStr(day) <= dateStr(addDays(selectedWeekStart, 6));
    return false;
  };

  const monthLabel = first.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const navMonth = (dir) => {
    const d = new Date(currentDate);
    d.setMonth(d.getMonth() + dir);
    onSelectDate(d);
  };

  return (
    <div style={{ border: `0.5px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", background: "#fff", width: 220, flexShrink: 0 }}>
      {/* Month header with arrows */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <button onClick={() => navMonth(-1)} style={arrowStyle}>&lsaquo;</button>
        <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{monthLabel}</span>
        <button onClick={() => navMonth(1)} style={arrowStyle}>&rsaquo;</button>
      </div>
      {/* Today button */}
      <div style={{ textAlign: "center", marginBottom: 6 }}>
        <button
          onClick={() => onSelectDate(new Date())}
          style={{ fontSize: 11, color: C.teal, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 500, padding: 0 }}
        >
          Today
        </button>
      </div>

      {/* Day headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center" }}>
        {DAYS_SHORT.map((d, i) => (
          <div key={i} style={{ fontSize: 10, color: C.hint, padding: "2px 0" }}>{d}</div>
        ))}
      </div>

      {/* Date grid */}
      {weeks.map((week, wi) => (
        <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center" }}>
          {week.map((day, di) => {
            const isCurrentMonth = day.getMonth() === miniMonth;
            const selected = isInRange(day);
            const isToday = sameDay(day, today);
            return (
              <div
                key={di}
                onClick={() => onSelectDate(day)}
                style={{
                  fontSize: 12,
                  padding: "3px 0",
                  cursor: "pointer",
                  borderRadius: view === "day" ? 4 : 0,
                  ...(view === "week" && di === 0 ? { borderRadius: "4px 0 0 4px" } : {}),
                  ...(view === "week" && di === 6 ? { borderRadius: "0 4px 4px 0" } : {}),
                  background: selected ? C.tealLight : "transparent",
                  color: !isCurrentMonth ? C.hint : selected ? C.teal : C.text,
                  fontWeight: isToday ? 700 : selected ? 500 : 400,
                  opacity: isCurrentMonth ? 1 : 0.4,
                }}
              >
                {day.getDate()}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const arrowStyle = {
  background: "none", border: "none", fontSize: 16, color: C.muted,
  cursor: "pointer", padding: "0 4px", fontFamily: "inherit", lineHeight: 1,
};
