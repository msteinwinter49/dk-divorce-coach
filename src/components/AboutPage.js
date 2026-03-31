"use client";
import { C, S } from "@/lib/constants";
import { useIsMobile } from "@/lib/hooks";
import IllustrationCoach from "@/components/illustrations/Coach";

export default function AboutPage() {
  const mobile = useIsMobile();
  return (
    <div style={S.page}>
      {mobile && <div style={{ textAlign:"center", marginBottom:"1.5rem" }}><IllustrationCoach /></div>}
      <div style={{ display:"flex", flexDirection:"row", gap:"2rem", alignItems:"start", marginBottom:"2rem" }}>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ fontSize:13, color:C.teal, fontWeight:500, letterSpacing:"0.08em", marginBottom:"0.5rem" }}>MEET YOUR COACH</p>
          <h1 style={S.h1}>Diana Kierein, CDC</h1>
          <p style={S.p}>I became a Certified Divorce Coach because I believe that how parents navigate separation shapes their children&#39;s futures. Too often, the legal process takes center stage — while the emotional and practical needs of children and families are left behind.</p>
          <p style={S.p}>My work focuses on helping parents slow down, think clearly, and make decisions they&#39;ll be proud of — decisions that protect their kids and lay the foundation for a healthy co-parenting relationship for years to come.</p>
          <p style={S.p}>I bring warmth, structure, and deep experience to every session. Whether you&#39;re just beginning to face the reality of separation or navigating a difficult custody situation, you don&#39;t have to do this alone.</p>
        </div>
        {!mobile && <div style={{ textAlign:"center", flexShrink:0 }}><IllustrationCoach /></div>}
      </div>

      <div style={{ display:"grid", gridTemplateColumns: mobile ? "1fr" : "repeat(3,1fr)", gap:12, marginBottom:"2rem" }}>
        {[["Certified","Divorce Coach (CDC)"],["Specialized","Child-focused separation"],["Experienced","Hundreds of families helped"]].map(([t,d]) => (
          <div key={t} style={{ ...S.card, textAlign:"center", background:C.tealLight, border:`0.5px solid ${C.tealMid}` }}>
            <div style={{ fontSize:14, fontWeight:500, color:C.teal }}>{t}</div>
            <div style={{ fontSize:13, color:C.muted, marginTop:4 }}>{d}</div>
          </div>
        ))}
      </div>

      <div style={S.card}>
        <h3 style={S.h3}>My approach</h3>
        <p style={S.p}>Divorce coaching is not therapy, and it&#39;s not legal advice. It sits alongside both — helping you process emotions enough to think clearly, prepare for difficult conversations, and stay focused on what matters most: your children&#39;s wellbeing and your family&#39;s future.</p>
        <p style={{...S.p, marginBottom:0}}>Sessions are available by video or phone. I work with individual parents as well as co-parenting pairs who are committed to putting their kids first.</p>
      </div>

      <div style={{ ...S.card, background:C.purpleLight, border:`0.5px solid #CECBF6` }}>
        <p style={{ fontSize:15, fontStyle:"italic", color:"#3C3489", lineHeight:1.8, marginBottom:"0.5rem" }}>
          &quot;Children don&#39;t need perfect parents. They need parents who love them enough to work together, especially when it&#39;s hard.&quot;
        </p>
        <p style={{ fontSize:13, color:"#534AB7", marginBottom:0 }}>— Diana Kierein, CDC</p>
      </div>
    </div>
  );
}
