"use client";
import { C, S } from "@/lib/constants";

export default function AdminCalendar({ setPage }) {
  return (
    <div style={S.page}>
      <button style={{ ...S.navLink, marginBottom:12, fontSize:13, color:C.teal }} onClick={() => setPage("Admin")}>&larr; Back to Admin</button>
      <h1 style={{...S.h1, fontSize:26}}>Calendar</h1>
      <p style={S.p}>Manage your availability and view upcoming bookings.</p>
      <div style={{ ...S.card, textAlign:"center", color:C.hint, padding:"3rem" }}>
        Coming soon
      </div>
    </div>
  );
}
