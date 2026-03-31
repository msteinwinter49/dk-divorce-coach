"use client";
import { useState, useEffect } from "react";
import { C, S } from "@/lib/constants";
import { useIsMobile } from "@/lib/hooks";
import { useAuth } from "@/context/AuthContext";
import { createClient } from "@/lib/supabase/client";

export default function Schedule() {
  const { user } = useAuth();
  const mobile = useIsMobile();
  const [selDay, setSelDay] = useState(null);
  const [selSlot, setSelSlot] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [availability, setAvailability] = useState({});
  const [bookedSlots, setBookedSlots] = useState({});
  const [loading, setLoading] = useState(true);
  const [bookingError, setBookingError] = useState(null);

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const monthName = new Date(viewYear, viewMonth).toLocaleString("en-US", { month: "long", year: "numeric" });

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    const startDate = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-01`;
    const endDate = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${daysInMonth}`;

    setLoading(true);
    Promise.all([
      supabase.from("availability")
        .select("date, slots")
        .gte("date", startDate)
        .lte("date", endDate),
      supabase.from("bookings")
        .select("date, time_slot")
        .gte("date", startDate)
        .lte("date", endDate)
        .eq("status", "confirmed"),
    ]).then(([availRes, bookRes]) => {
      const availMap = {};
      (availRes.data || []).forEach(a => {
        const day = new Date(a.date + "T00:00:00").getDate();
        availMap[day] = a.slots;
      });
      setAvailability(availMap);

      const bookMap = {};
      (bookRes.data || []).forEach(b => {
        const day = new Date(b.date + "T00:00:00").getDate();
        if (!bookMap[day]) bookMap[day] = [];
        bookMap[day].push(b.time_slot);
      });
      setBookedSlots(bookMap);
      setLoading(false);
    });
  }, [user, viewYear, viewMonth, daysInMonth]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
    setSelDay(null); setSelSlot(null);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
    setSelDay(null); setSelSlot(null);
  };

  const handleConfirm = async () => {
    setBookingError(null);
    const supabase = createClient();
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(selDay).padStart(2, "0")}`;
    const { error } = await supabase.from("bookings").insert({
      user_id: user.id,
      date: dateStr,
      time_slot: selSlot,
    });
    if (error) {
      if (error.code === "23505") {
        setBookingError("This slot was just booked by someone else. Please choose another time.");
      } else {
        setBookingError("Could not book this session. Please try again.");
      }
    } else {
      setConfirmed(true);
    }
  };

  if (confirmed) return (
    <div style={S.page}>
      <div style={{ ...S.card, background:C.tealLight, border:`0.5px solid ${C.tealMid}`, textAlign:"center", padding:"2.5rem" }}>
        <div style={{ fontSize:16, fontWeight:500, color:C.teal, marginBottom:8 }}>Session booked!</div>
        <p style={{...S.p, color:C.teal, marginBottom:0}}>Your session with Diana is confirmed for <strong>{monthName.split(" ")[0]} {selDay} at {selSlot}</strong>. A video link will be emailed to you 30 minutes before.</p>
        <button style={{ ...S.btnSm, marginTop:"1.25rem" }} onClick={() => { setConfirmed(false); setSelDay(null); setSelSlot(null); }}>Schedule another</button>
      </div>
    </div>
  );

  const slotsForDay = availability[selDay] || [];

  return (
    <div style={S.page}>
      <h1 style={{...S.h1, fontSize:26}}>Schedule a session</h1>
      <p style={S.p}>Select an available date, then choose a time. Sessions are 60 minutes via video or phone.</p>
      <div style={S.card}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1rem" }}>
          <button style={S.btnSmOut} onClick={prevMonth}>&larr;</button>
          <span style={{ fontSize:16, fontWeight:500 }}>{monthName}</span>
          <button style={S.btnSmOut} onClick={nextMonth}>&rarr;</button>
        </div>
        {loading ? (
          <p style={{ ...S.p, textAlign: "center" }}>Loading availability...</p>
        ) : (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4, marginBottom:"1.25rem" }}>
              {["S","M","T","W","T","F","S"].map((d,i) => <div key={i} style={{ textAlign:"center", fontSize:11, color:C.hint, padding:"4px 0", fontWeight:500 }}>{d}</div>)}
              {Array(firstDayOfWeek).fill(null).map((_,i) => <div key={`empty-${i}`} />)}
              {Array(daysInMonth).fill(null).map((_,i) => {
                const d = i + 1;
                const isAvail = !!availability[d];
                const isSel = selDay === d;
                return (
                  <div key={d} onClick={() => { if (isAvail) { setSelDay(d); setSelSlot(null); setBookingError(null); } }}
                    style={{ aspectRatio:"1", display:"flex", alignItems:"center", justifyContent:"center", borderRadius:8, fontSize: mobile ? 12 : 14, cursor:isAvail?"pointer":"default",
                      background:isSel?C.teal:isAvail?C.tealLight:"transparent",
                      color:isSel?"#fff":isAvail?C.teal:C.hint,
                      border:`0.5px solid ${isSel?C.teal:isAvail?C.tealMid:"transparent"}` }}>
                    {d}
                  </div>
                );
              })}
            </div>
            {selDay && slotsForDay.length > 0 && (
              <>
                <p style={{ fontSize:13, color:C.muted, marginBottom:12 }}>Available times — {monthName.split(" ")[0]} {selDay}</p>
                <div style={{ display:"grid", gridTemplateColumns: mobile ? "repeat(3,1fr)" : "repeat(4,1fr)", gap:8 }}>
                  {slotsForDay.map(s => {
                    const isBooked = (bookedSlots[selDay] || []).includes(s);
                    const isPicked = selSlot === s;
                    return (
                      <div key={s} onClick={() => !isBooked && setSelSlot(s)}
                        style={{ padding:"10px 4px", textAlign:"center", borderRadius:8, fontSize:13, cursor:isBooked?"default":"pointer",
                          background:isPicked?C.teal:isBooked?C.warm:"#fff",
                          color:isPicked?"#fff":isBooked?C.hint:C.text,
                          border:`0.5px solid ${isPicked?C.teal:isBooked?C.warmBorder:C.border}`,
                          textDecoration:isBooked?"line-through":"none" }}>
                        {s}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
        {bookingError && <p style={{ fontSize:13, color:"#c0392b", marginTop:12 }}>{bookingError}</p>}
        {selSlot && (
          <div style={{ marginTop:"1.25rem", padding:"1rem", background:C.warm, borderRadius:12, display:"flex", flexDirection: mobile ? "column" : "row", alignItems: mobile ? "flex-start" : "center", justifyContent:"space-between", gap:12 }}>
            <div>
              <div style={{ fontSize:14, fontWeight:500 }}>{monthName.split(" ")[0]} {selDay}, {viewYear} · {selSlot}</div>
              <div style={{ fontSize:13, color:C.muted, marginTop:2 }}>60-min session with Diana Kierein</div>
            </div>
            <button style={S.btn} onClick={handleConfirm}>Confirm</button>
          </div>
        )}
      </div>
    </div>
  );
}
