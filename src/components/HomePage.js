"use client";
import { C, S } from "@/lib/constants";
import { useIsMobile } from "@/lib/hooks";
import IllustrationHero from "@/components/illustrations/Hero";
import IllustrationCoParent from "@/components/illustrations/CoParent";

export default function HomePage({ setPage }) {
  const mobile = useIsMobile();
  return (
    <div style={{ minHeight:"calc(100vh - 64px)" }}>
      <div style={{ background:`linear-gradient(160deg, ${C.tealLight} 0%, #fff 55%)`, padding: mobile ? "2.5rem 1rem 2rem" : "4rem 2rem 3rem" }}>
        <div style={{ maxWidth:800, margin:"0 auto", display:"flex", flexDirection: mobile ? "column" : "row", gap:"2rem", alignItems:"center" }}>
          <div>
            <p style={{ fontSize:13, color:C.teal, fontWeight:500, letterSpacing:"0.08em", marginBottom:"0.75rem" }}>CERTIFIED DIVORCE COACH</p>
            <h1 style={{...S.h1, fontSize: mobile ? 26 : 36}}>Your children deserve to thrive, especially through family separation, and so do you.</h1>
            <p style={{ fontSize:15, color:C.muted, lineHeight:1.75, marginBottom:"1.75rem" }}>
              Separation or divorce is difficult for all family members, but the difficulties can be worked with, worked through, and overcome. New, rich, beneficial family relationships can emerge. I will help you to contribute to your best re-oriented family.
            </p>
            <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
              <button style={S.btn} onClick={() => setPage("Contact")}>Book a discovery session</button>
              <button style={S.btnOutline} onClick={() => setPage("About")}>Meet Diana</button>
            </div>
          </div>
          {!mobile && <IllustrationHero />}
        </div>
        {mobile && <div style={{ textAlign:"center", marginTop:"1.5rem" }}><IllustrationHero /></div>}
      </div>

      <div style={{ padding: mobile ? "2rem 1rem" : "3rem 2rem", maxWidth:800, margin:"0 auto" }}>
        <h2 style={{...S.h2, textAlign:"center", marginBottom:"0.5rem"}}>How I will help</h2>
        <p style={{...S.p, textAlign:"center", marginBottom:"2rem"}}>Every family&#39;s situation is unique. My coaching meets you where you are.</p>
        <div style={{ display:"grid", gridTemplateColumns: mobile ? "1fr" : "repeat(2,1fr)", gap:16 }}>
          {[
            ["Telling the Children","Prepare for one of the hardest conversations you\u2019ll ever have and a moment they will remember for the rest of their lives."],
            ["CoParent Work: Create a New Business \u201CYour Kids Names, LLC\u201D","With help learning child-focused coparenting skills you will create a 4-star business relationship from which your children will benefit emotionally and socially."],
            ["Child-Focused Attention","Just like for you, once your children learn about the separation, it\u2019s a whole new world for them. Let me be your partner in helping them traverse their own waves of uncertainty."],
            ["Legal, Emotional and Financial Options Feel Overwhelming","Let me be your partner to help you gain clarity, be organized and feel confident prior to meeting with ancillary professionals, whether they are attorneys, mediators, real estate experts, financial analysts, bankers, mortgage brokers, or therapists."],
            ["You Are Not Alone","My drive to help separating families create positive outcomes comes from multiple personal childhood and adult experiences within separated families. My training as a CDC Certified Divorce Coach with CDC precisely Divorce Coach training qualifies me to offer that support to you."],
            ["Post-Divorce, Being a Single Parent","Successful single parenting is a behavioral art. Being a good single parent means acting as an effective coparent. Effective coparenting is a learned skill and can restore your children\u2019s sense that the only family of origin they will ever have did not disappear."],
          ].map(([t,d]) => (
            <div key={t} style={{ ...S.card, borderLeft:`3px solid ${C.tealMid}` }}>
              <h3 style={S.h3}>{t}</h3>
              <p style={{...S.p, marginBottom:0, fontSize:14}}>{d}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background:C.warm, padding: mobile ? "2rem 1rem" : "3rem 2rem" }}>
        <div style={{ maxWidth:800, margin:"0 auto", display:"flex", flexDirection: mobile ? "column" : "row", gap:"2rem", alignItems:"center" }}>
          <div style={{ textAlign:"center" }}><IllustrationCoParent /></div>
          <div>
            <h2 style={S.h2}>Children do better when parents cooperate</h2>
            <p style={S.p}>Effective coparenting role models for children how to positively address relationships that are difficult.</p>
            <p style={{...S.p, marginBottom:0}}>That&#39;s exactly what I help you do.</p>
          </div>
        </div>
      </div>

      <div style={{ padding:"3rem 1rem", textAlign:"center" }}>
        <h2 style={S.h2}>Ready to take the first step?</h2>
        <p style={{...S.p, maxWidth:440, margin:"0 auto 1.5rem"}}>A free 30-minute consultation is the best way to find out if we&#39;re a good fit. No pressure, no commitment.</p>
        <button style={S.btn} onClick={() => setPage("Contact")}>Book a discovery session</button>
      </div>

      <div style={{ borderTop:`0.5px solid ${C.border}`, padding:"1.25rem 1rem", textAlign:"center" }}>
        <a href="/privacy" style={{ color:C.muted, fontSize:13, padding:"4px 8px", textDecoration:"underline" }}>
          Privacy Policy
        </a>
        <span style={{ color:C.hint, fontSize:13 }}>·</span>
        <a href="/terms" style={{ color:C.muted, fontSize:13, padding:"4px 8px", textDecoration:"underline" }}>
          Terms &amp; Conditions
        </a>
      </div>
    </div>
  );
}
