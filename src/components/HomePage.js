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
            <p style={{ fontSize:13, color:C.teal, fontWeight:500, letterSpacing:"0.08em", marginBottom:"0.75rem" }}>CERTIFIED DIVORCE COACHING</p>
            <h1 style={{...S.h1, fontSize: mobile ? 26 : 36}}>Your children deserve to thrive — even through this.</h1>
            <p style={{ fontSize:15, color:C.muted, lineHeight:1.75, marginBottom:"1.75rem" }}>
              Diana Kierein helps separating parents navigate one of life&#39;s hardest transitions with clarity, cooperation, and an unwavering focus on protecting their kids.
            </p>
            <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
              <button style={S.btn} onClick={() => setPage("Contact")}>Book a free call</button>
              <button style={S.btnOutline} onClick={() => setPage("About")}>Meet Diana</button>
            </div>
          </div>
          {!mobile && <IllustrationHero />}
        </div>
        {mobile && <div style={{ textAlign:"center", marginTop:"1.5rem" }}><IllustrationHero /></div>}
      </div>

      <div style={{ padding: mobile ? "2rem 1rem" : "3rem 2rem", maxWidth:800, margin:"0 auto" }}>
        <h2 style={{...S.h2, textAlign:"center", marginBottom:"0.5rem"}}>How I can help</h2>
        <p style={{...S.p, textAlign:"center", marginBottom:"2rem"}}>Every family&#39;s situation is unique. My coaching meets you where you are.</p>
        <div style={{ display:"grid", gridTemplateColumns: mobile ? "1fr" : "repeat(2,1fr)", gap:16 }}>
          {[
            ["Co-Parenting Planning","Build a parenting plan that puts your children\u2019s stability first \u2014 reducing conflict and confusion for everyone."],
            ["Child-Focused Guidance","Learn how to talk to your kids about the separation, recognize signs of stress, and maintain their sense of security."],
            ["Emotional Navigation","Process the overwhelm, fear, and grief that come with separation so you can show up as the parent your kids need."],
            ["Process & Legal Prep","Understand your options, prepare for meetings with attorneys and mediators, and move forward with confidence."],
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
            <p style={S.p}>Research consistently shows that kids adjust better to family change when their parents can set aside differences and communicate respectfully. That doesn&#39;t mean you have to agree on everything — it means finding a way to put your children at the center.</p>
            <p style={{...S.p, marginBottom:0}}>That&#39;s exactly what I help you do.</p>
          </div>
        </div>
      </div>

      <div style={{ padding:"3rem 1rem", textAlign:"center" }}>
        <h2 style={S.h2}>Ready to take the first step?</h2>
        <p style={{...S.p, maxWidth:440, margin:"0 auto 1.5rem"}}>A free 30-minute consultation is the best way to find out if we&#39;re a good fit. No pressure, no commitment.</p>
        <button style={S.btn} onClick={() => setPage("Contact")}>Schedule a free call</button>
      </div>
    </div>
  );
}
