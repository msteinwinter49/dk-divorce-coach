"use client";
import { useRouter } from "next/navigation";
import { C, S } from "@/lib/constants";
import { useIsMobile } from "@/lib/hooks";

export default function LegalLayout({ children }) {
  const router = useRouter();
  const mobile = useIsMobile();
  const goHome = () => router.push("/");

  return (
    <div style={{ fontFamily:"system-ui, sans-serif", background:"#fff", minHeight:"100vh" }}>
      {mobile ? (
        <nav style={{ borderBottom:`0.5px solid ${C.border}`, background:"#fff", position:"sticky", top:0, zIndex:10 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 1rem", height:44 }}>
            <div style={S.logo} onClick={goHome}>
              <span style={S.logoMain}>DK Divorce Coach</span>
            </div>
            <button style={S.btnSmOut} onClick={goHome}>Home</button>
          </div>
        </nav>
      ) : (
        <nav style={{ ...S.nav, position:"sticky" }}>
          <div style={S.logo} onClick={goHome}>
            <span style={S.logoMain}>DK Divorce Coach</span>
            <span style={S.logoSub}>DIANA KIEREIN · CDC</span>
          </div>
          <div style={S.navLinks}>
            <button style={S.btnSmOut} onClick={goHome}>Home</button>
          </div>
        </nav>
      )}
      {children}
    </div>
  );
}
