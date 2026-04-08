"use client";
import { C, S } from "@/lib/constants";
import { useIsMobile } from "@/lib/hooks";

export default function Admin({ setPage }) {
  const mobile = useIsMobile();

  const links = [
    {
      page: "Admin Clients",
      title: "Clients",
      desc: "View, search, and invite clients",
    },
    {
      page: "Admin Settings",
      title: "Settings",
      desc: "Configure site and account settings",
    },
  ];

  return (
    <div style={S.page}>
      <h1 style={{...S.h1, fontSize:26}}>Admin</h1>
      <p style={S.p}>Manage your coaching practice.</p>
      <div style={{ display:"grid", gridTemplateColumns: mobile ? "1fr" : "repeat(3,1fr)", gap:12 }}>
        {links.map(l => (
          <div key={l.page} style={{ ...S.card, cursor:"pointer" }} onClick={() => setPage(l.page)}>
            <h3 style={{ ...S.h3, color:C.teal }}>{l.title}</h3>
            <p style={{ ...S.p, marginBottom:0, fontSize:13 }}>{l.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
