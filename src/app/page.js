"use client";
import { useState, useEffect } from "react";

const C = {
  teal: "#0F6E56", tealLight: "#E1F5EE", tealMid: "#5DCAA5",
  purple: "#534AB7", purpleLight: "#EEEDFE",
  warm: "#F5F0EB", warmBorder: "#E8E0D5",
  text: "#2C2C2A", muted: "#5F5E5A", hint: "#888780",
  border: "rgba(0,0,0,0.1)",
};

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return mobile;
}

const S = {
  nav: { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 1rem", height:56, borderBottom:`0.5px solid ${C.border}`, background:"#fff", position:"sticky", top:0, zIndex:10 },
  logo: { display:"flex", flexDirection:"column", cursor:"pointer", flexShrink:0 },
  logoMain: { fontSize:15, fontWeight:500, color:C.teal, lineHeight:1.2, whiteSpace:"nowrap" },
  logoSub: { fontSize:10, color:C.muted, letterSpacing:"0.05em", whiteSpace:"nowrap" },
  navLinks: { display:"flex", gap:"0.75rem", alignItems:"center", flexWrap:"wrap" },
  navLink: { fontSize:13, color:C.muted, cursor:"pointer", background:"none", border:"none", fontFamily:"inherit", padding:"4px 0" },
  navLinkActive: { color:C.teal, fontWeight:500 },
  btn: { background:C.teal, color:"#fff", border:"none", borderRadius:8, padding:"11px 24px", fontSize:14, cursor:"pointer", fontFamily:"inherit" },
  btnOutline: { background:"none", color:C.teal, border:`1px solid ${C.teal}`, borderRadius:8, padding:"11px 24px", fontSize:14, cursor:"pointer", fontFamily:"inherit" },
  btnSm: { background:C.teal, color:"#fff", border:"none", borderRadius:8, padding:"8px 14px", fontSize:12, cursor:"pointer", fontFamily:"inherit" },
  btnSmOut: { background:"none", color:C.muted, border:`0.5px solid ${C.border}`, borderRadius:8, padding:"8px 14px", fontSize:12, cursor:"pointer", fontFamily:"inherit" },
  page: { minHeight:"calc(100vh - 64px)", padding:"2rem 1rem", maxWidth:800, margin:"0 auto" },
  h1: { fontSize:30, fontWeight:500, color:C.text, marginBottom:"1rem", lineHeight:1.25 },
  h2: { fontSize:22, fontWeight:500, color:C.text, marginBottom:"0.75rem" },
  h3: { fontSize:16, fontWeight:500, color:C.text, marginBottom:"0.5rem" },
  p: { fontSize:15, color:C.muted, lineHeight:1.75, marginBottom:"1rem" },
  card: { background:"#fff", border:`0.5px solid ${C.border}`, borderRadius:12, padding:"1.25rem 1.5rem", marginBottom:"1rem" },
  input: { width:"100%", padding:"10px 12px", border:`0.5px solid ${C.border}`, borderRadius:8, fontSize:14, fontFamily:"inherit", marginBottom:"0.75rem", boxSizing:"border-box", outline:"none" },
  label: { fontSize:13, color:C.muted, display:"block", marginBottom:4 },
};

function IllustrationHero() {
  return (
    <svg viewBox="0 0 420 280" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",maxWidth:340}}>
      <ellipse cx="210" cy="255" rx="180" ry="18" fill="#E1F5EE"/>
      <circle cx="210" cy="130" r="22" fill="#FAC775"/>
      <line x1="210" y1="152" x2="210" y2="210" stroke="#AFA9EC" strokeWidth="3" strokeLinecap="round"/>
      <line x1="210" y1="168" x2="188" y2="188" stroke="#AFA9EC" strokeWidth="3" strokeLinecap="round"/>
      <line x1="210" y1="168" x2="232" y2="188" stroke="#AFA9EC" strokeWidth="3" strokeLinecap="round"/>
      <line x1="210" y1="210" x2="196" y2="240" stroke="#AFA9EC" strokeWidth="3" strokeLinecap="round"/>
      <line x1="210" y1="210" x2="224" y2="240" stroke="#AFA9EC" strokeWidth="3" strokeLinecap="round"/>
      <circle cx="120" cy="110" r="26" fill="#9FE1CB"/>
      <line x1="120" y1="136" x2="120" y2="200" stroke="#5DCAA5" strokeWidth="3.5" strokeLinecap="round"/>
      <line x1="120" y1="158" x2="95" y2="178" stroke="#5DCAA5" strokeWidth="3.5" strokeLinecap="round"/>
      <line x1="120" y1="158" x2="148" y2="175" stroke="#5DCAA5" strokeWidth="3.5" strokeLinecap="round"/>
      <line x1="120" y1="200" x2="106" y2="240" stroke="#5DCAA5" strokeWidth="3.5" strokeLinecap="round"/>
      <line x1="120" y1="200" x2="134" y2="240" stroke="#5DCAA5" strokeWidth="3.5" strokeLinecap="round"/>
      <line x1="148" y1="175" x2="188" y2="168" stroke="#5DCAA5" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="4 3"/>
      <circle cx="300" cy="110" r="26" fill="#CECBF6"/>
      <line x1="300" y1="136" x2="300" y2="200" stroke="#AFA9EC" strokeWidth="3.5" strokeLinecap="round"/>
      <line x1="300" y1="158" x2="325" y2="178" stroke="#AFA9EC" strokeWidth="3.5" strokeLinecap="round"/>
      <line x1="300" y1="158" x2="272" y2="175" stroke="#AFA9EC" strokeWidth="3.5" strokeLinecap="round"/>
      <line x1="300" y1="200" x2="286" y2="240" stroke="#AFA9EC" strokeWidth="3.5" strokeLinecap="round"/>
      <line x1="300" y1="200" x2="314" y2="240" stroke="#AFA9EC" strokeWidth="3.5" strokeLinecap="round"/>
      <line x1="272" y1="175" x2="232" y2="168" stroke="#AFA9EC" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="4 3"/>
      <path d="M204 98 Q204 91 210 91 Q216 91 216 98 Q216 104 210 110 Q204 104 204 98Z" fill="#F09595" opacity="0.7"/>
      <circle cx="380" cy="118" r="20" fill="#FAC775"/>
      <line x1="380" y1="138" x2="380" y2="195" stroke="#BA7517" strokeWidth="3" strokeLinecap="round"/>
      <line x1="380" y1="155" x2="358" y2="170" stroke="#BA7517" strokeWidth="3" strokeLinecap="round"/>
      <line x1="380" y1="155" x2="400" y2="172" stroke="#BA7517" strokeWidth="3" strokeLinecap="round"/>
      <line x1="380" y1="195" x2="368" y2="240" stroke="#BA7517" strokeWidth="3" strokeLinecap="round"/>
      <line x1="380" y1="195" x2="392" y2="240" stroke="#BA7517" strokeWidth="3" strokeLinecap="round"/>
      <path d="M363 113 Q365 95 380 96 Q395 95 397 113" fill="#BA7517" opacity="0.6"/>
      <path d="M358 170 Q340 165 325 175" stroke="#EF9F27" strokeWidth="2" fill="none" strokeLinecap="round" strokeDasharray="3 3"/>
    </svg>
  );
}

function IllustrationCoParent() {
  return (
    <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",maxWidth:280}}>
      <ellipse cx="160" cy="165" rx="130" ry="12" fill="#E1F5EE"/>
      <circle cx="80" cy="75" r="22" fill="#9FE1CB"/>
      <line x1="80" y1="97" x2="80" y2="148" stroke="#5DCAA5" strokeWidth="3" strokeLinecap="round"/>
      <line x1="80" y1="113" x2="58" y2="130" stroke="#5DCAA5" strokeWidth="3" strokeLinecap="round"/>
      <line x1="80" y1="113" x2="106" y2="125" stroke="#5DCAA5" strokeWidth="3" strokeLinecap="round"/>
      <line x1="80" y1="148" x2="68" y2="170" stroke="#5DCAA5" strokeWidth="3" strokeLinecap="round"/>
      <line x1="80" y1="148" x2="92" y2="170" stroke="#5DCAA5" strokeWidth="3" strokeLinecap="round"/>
      <circle cx="240" cy="75" r="22" fill="#CECBF6"/>
      <line x1="240" y1="97" x2="240" y2="148" stroke="#AFA9EC" strokeWidth="3" strokeLinecap="round"/>
      <line x1="240" y1="113" x2="262" y2="130" stroke="#AFA9EC" strokeWidth="3" strokeLinecap="round"/>
      <line x1="240" y1="113" x2="214" y2="125" stroke="#AFA9EC" strokeWidth="3" strokeLinecap="round"/>
      <line x1="240" y1="148" x2="228" y2="170" stroke="#AFA9EC" strokeWidth="3" strokeLinecap="round"/>
      <line x1="240" y1="148" x2="252" y2="170" stroke="#AFA9EC" strokeWidth="3" strokeLinecap="round"/>
      <circle cx="160" cy="100" r="16" fill="#FAC775"/>
      <line x1="160" y1="116" x2="160" y2="155" stroke="#EF9F27" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="160" y1="130" x2="148" y2="145" stroke="#EF9F27" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="160" y1="130" x2="172" y2="145" stroke="#EF9F27" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="160" y1="155" x2="152" y2="170" stroke="#EF9F27" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="160" y1="155" x2="168" y2="170" stroke="#EF9F27" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M106 125 Q130 108 154 118" stroke="#5DCAA5" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <path d="M214 125 Q190 108 166 118" stroke="#AFA9EC" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <circle cx="160" cy="117" r="5" fill="#F09595" opacity="0.8"/>
    </svg>
  );
}

function IllustrationCoach() {
  return (
    <svg viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",maxWidth:150}}>
      <ellipse cx="100" cy="205" rx="70" ry="10" fill="#E1F5EE"/>
      <circle cx="100" cy="60" r="32" fill="#FAC775"/>
      <path d="M70 52 Q72 25 100 26 Q128 25 130 52 Q125 35 100 36 Q75 35 70 52Z" fill="#BA7517" opacity="0.7"/>
      <path d="M68 92 Q65 140 65 185 L135 185 Q135 140 132 92 Q116 105 100 105 Q84 105 68 92Z" fill="#5DCAA5"/>
      <path d="M68 110 Q48 130 44 155" stroke="#5DCAA5" strokeWidth="10" strokeLinecap="round" fill="none"/>
      <path d="M132 110 Q152 125 158 148" stroke="#5DCAA5" strokeWidth="10" strokeLinecap="round" fill="none"/>
      <circle cx="44" cy="160" r="9" fill="#FAC775"/>
      <circle cx="158" cy="153" r="9" fill="#FAC775"/>
      <path d="M90 68 Q100 76 110 68" stroke="#BA7517" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <circle cx="91" cy="57" r="3" fill="#3C3489"/>
      <circle cx="109" cy="57" r="3" fill="#3C3489"/>
      <rect x="76" y="120" width="48" height="22" rx="4" fill="#fff" opacity="0.9"/>
      <text x="100" y="135" textAnchor="middle" fontSize="9" fill="#0F6E56" fontWeight="500">C D C</text>
    </svg>
  );
}

function Nav({ page, setPage, inPortal, setInPortal }) {
  const mobile = useIsMobile();
  if (inPortal && mobile) return (
    <nav style={{ borderBottom:`0.5px solid ${C.border}`, background:"#fff", position:"sticky", top:0, zIndex:10 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 1rem", height:48 }}>
        <div style={S.logo} onClick={() => { setInPortal(false); setPage("Home"); }}>
          <span style={S.logoMain}>DK Divorce Coach</span>
        </div>
        <button style={S.btnSmOut} onClick={() => { setInPortal(false); setPage("Home"); }}>Log out</button>
      </div>
      <div style={{ display:"flex", gap:0, borderTop:`0.5px solid ${C.border}` }}>
        {[["Portal Home","Home"],["Documents","Docs"],["Schedule","Schedule"],["Messages","Messages"]].map(([p,l]) => (
          <button key={p} onClick={() => setPage(p)}
            style={{ flex:1, padding:"10px 4px", fontSize:12, fontFamily:"inherit", border:"none", borderBottom: page===p ? `2px solid ${C.teal}` : "2px solid transparent", background:"none", color: page===p ? C.teal : C.muted, fontWeight: page===p ? 500 : 400, cursor:"pointer" }}>
            {l}
          </button>
        ))}
      </div>
    </nav>
  );
  return (
    <nav style={S.nav}>
      <div style={S.logo} onClick={() => { setInPortal(false); setPage("Home"); }}>
        <span style={S.logoMain}>DK Divorce Coach</span>
        {!mobile && <span style={S.logoSub}>DIANA KIEREIN · CDC</span>}
      </div>
      <div style={S.navLinks}>
        {!inPortal ? (
          <>
            {["Home","About","Contact"].map(l => (
              <button key={l} style={{...S.navLink,...(page===l?S.navLinkActive:{})}} onClick={() => setPage(l)}>{l}</button>
            ))}
            <button style={S.btnSm} onClick={() => { setInPortal(true); setPage("Portal Home"); }}>Client Login</button>
          </>
        ) : (
          <>
            {[["Portal Home","Home"],["Documents","Docs"],["Schedule","Schedule"],["Messages","Messages"]].map(([p,l]) => (
              <button key={p} style={{...S.navLink,...(page===p?S.navLinkActive:{})}} onClick={() => setPage(p)}>{l}</button>
            ))}
            <button style={S.btnSmOut} onClick={() => { setInPortal(false); setPage("Home"); }}>Log out</button>
          </>
        )}
      </div>
    </nav>
  );
}

function HomePage({ setPage, setInPortal }) {
  const mobile = useIsMobile();
  return (
    <div style={{ minHeight:"calc(100vh - 64px)" }}>
      <div style={{ background:`linear-gradient(160deg, ${C.tealLight} 0%, #fff 55%)`, padding: mobile ? "2.5rem 1rem 2rem" : "4rem 2rem 3rem" }}>
        <div style={{ maxWidth:800, margin:"0 auto", display:"flex", flexDirection: mobile ? "column" : "row", gap:"2rem", alignItems:"center" }}>
          <div>
            <p style={{ fontSize:13, color:C.teal, fontWeight:500, letterSpacing:"0.08em", marginBottom:"0.75rem" }}>CERTIFIED DIVORCE COACHING</p>
            <h1 style={{...S.h1, fontSize: mobile ? 26 : 36}}>Your children deserve to thrive — even through this.</h1>
            <p style={{ fontSize:15, color:C.muted, lineHeight:1.75, marginBottom:"1.75rem" }}>
              Diana Kierein helps separating parents navigate one of life's hardest transitions with clarity, cooperation, and an unwavering focus on protecting their kids.
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
        <p style={{...S.p, textAlign:"center", marginBottom:"2rem"}}>Every family's situation is unique. My coaching meets you where you are.</p>
        <div style={{ display:"grid", gridTemplateColumns: mobile ? "1fr" : "repeat(2,1fr)", gap:16 }}>
          {[
            ["Co-Parenting Planning","Build a parenting plan that puts your children's stability first — reducing conflict and confusion for everyone."],
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
            <p style={S.p}>Research consistently shows that kids adjust better to family change when their parents can set aside differences and communicate respectfully. That doesn't mean you have to agree on everything — it means finding a way to put your children at the center.</p>
            <p style={{...S.p, marginBottom:0}}>That's exactly what I help you do.</p>
          </div>
        </div>
      </div>

      <div style={{ padding:"3rem 1rem", textAlign:"center" }}>
        <h2 style={S.h2}>Ready to take the first step?</h2>
        <p style={{...S.p, maxWidth:440, margin:"0 auto 1.5rem"}}>A free 30-minute consultation is the best way to find out if we're a good fit. No pressure, no commitment.</p>
        <button style={S.btn} onClick={() => setPage("Contact")}>Schedule a free call</button>
      </div>
    </div>
  );
}

function AboutPage() {
  const mobile = useIsMobile();
  return (
    <div style={S.page}>
      {mobile && <div style={{ textAlign:"center", marginBottom:"1.5rem" }}><IllustrationCoach /></div>}
      <div style={{ display:"flex", flexDirection:"row", gap:"2rem", alignItems:"start", marginBottom:"2rem" }}>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ fontSize:13, color:C.teal, fontWeight:500, letterSpacing:"0.08em", marginBottom:"0.5rem" }}>MEET YOUR COACH</p>
          <h1 style={S.h1}>Diana Kierein, CDC</h1>
          <p style={S.p}>I became a Certified Divorce Coach because I believe that how parents navigate separation shapes their children's futures. Too often, the legal process takes center stage — while the emotional and practical needs of children and families are left behind.</p>
          <p style={S.p}>My work focuses on helping parents slow down, think clearly, and make decisions they'll be proud of — decisions that protect their kids and lay the foundation for a healthy co-parenting relationship for years to come.</p>
          <p style={S.p}>I bring warmth, structure, and deep experience to every session. Whether you're just beginning to face the reality of separation or navigating a difficult custody situation, you don't have to do this alone.</p>
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
        <p style={S.p}>Divorce coaching is not therapy, and it's not legal advice. It sits alongside both — helping you process emotions enough to think clearly, prepare for difficult conversations, and stay focused on what matters most: your children's wellbeing and your family's future.</p>
        <p style={{...S.p, marginBottom:0}}>Sessions are available by video or phone. I work with individual parents as well as co-parenting pairs who are committed to putting their kids first.</p>
      </div>

      <div style={{ ...S.card, background:C.purpleLight, border:`0.5px solid #CECBF6` }}>
        <p style={{ fontSize:15, fontStyle:"italic", color:"#3C3489", lineHeight:1.8, marginBottom:"0.5rem" }}>
          "Children don't need perfect parents. They need parents who love them enough to work together — even when it's hard."
        </p>
        <p style={{ fontSize:13, color:"#534AB7", marginBottom:0 }}>— Diana Kierein, CDC</p>
      </div>
    </div>
  );
}

function ContactPage() {
  const [sent, setSent] = useState(false);
  return (
    <div style={S.page}>
      <h1 style={S.h1}>Let's talk</h1>
      <p style={S.p}>The first step is often the hardest. Reach out below and Diana will personally respond within one business day to schedule a free 30-minute consultation.</p>
      {sent ? (
        <div style={{ ...S.card, background:C.tealLight, border:`0.5px solid ${C.tealMid}`, textAlign:"center", padding:"2.5rem" }}>
          <div style={{ fontSize:16, fontWeight:500, color:C.teal, marginBottom:8 }}>Thank you for reaching out.</div>
          <p style={{...S.p, color:C.teal, marginBottom:0}}>Diana will be in touch within one business day. You're taking a courageous step — for yourself and for your children.</p>
        </div>
      ) : (
        <div style={S.card}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div><label style={S.label}>First name</label><input style={S.input} placeholder="Jane" /></div>
            <div><label style={S.label}>Last name</label><input style={S.input} placeholder="Smith" /></div>
          </div>
          <label style={S.label}>Email address</label>
          <input style={S.input} placeholder="jane@example.com" type="email" />
          <label style={S.label}>Phone (optional)</label>
          <input style={S.input} placeholder="(555) 012-3456" type="tel" />
          <label style={S.label}>Where are you in the process?</label>
          <select style={{...S.input}}>
            <option>Just starting to consider separation</option>
            <option>Separation is underway</option>
            <option>Divorce is finalized — navigating co-parenting</option>
            <option>Dealing with a specific custody challenge</option>
          </select>
          <label style={S.label}>What's on your mind?</label>
          <textarea style={{...S.input, height:110, resize:"vertical"}} placeholder="Share as little or as much as you'd like..." />
          <button style={S.btn} onClick={() => setSent(true)}>Send message</button>
        </div>
      )}
      <div style={{ display:"grid", gridTemplateColumns:"1fr", gap:12, marginTop:"1.5rem" }}>
        {[["Email","diana@dkdivorcecoach.com"],["Sessions","Video & phone"],["Hours","Mon–Fri, 9am–5pm EST"]].map(([l,v]) => (
          <div key={l} style={{ ...S.card, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div style={{ fontSize:12, color:C.hint }}>{l}</div>
            <div style={{ fontSize:13, fontWeight:500, color:C.text }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LoginPage({ setPage, setInPortal }) {
  return (
    <div style={{ ...S.page, maxWidth:400 }}>
      <h1 style={{...S.h1, fontSize:26}}>Client portal</h1>
      <p style={S.p}>Welcome back. Sign in to access your documents, schedule sessions, and message Diana.</p>
      <div style={S.card}>
        <label style={S.label}>Email address</label>
        <input style={S.input} placeholder="jane@example.com" type="email" />
        <label style={S.label}>Password</label>
        <input style={S.input} placeholder="••••••••" type="password" />
        <button style={{ ...S.btn, width:"100%", marginTop:4 }} onClick={() => { setInPortal(true); setPage("Portal Home"); }}>Sign in</button>
        <p style={{ fontSize:13, color:C.hint, textAlign:"center", marginTop:12, marginBottom:0 }}>Forgot your password? <span style={{ color:C.teal, cursor:"pointer" }}>Reset it here</span></p>
      </div>
    </div>
  );
}

function PortalHome({ setPage }) {
  const mobile = useIsMobile();
  return (
    <div style={S.page}>
      <div style={{ ...S.card, background:C.tealLight, border:`0.5px solid ${C.tealMid}`, marginBottom:"1.5rem" }}>
        <h2 style={{...S.h2, color:C.teal}}>Welcome back, Jane</h2>
        <p style={{...S.p, color:C.teal, marginBottom:0}}>Your next session with Diana is on <strong>April 8 at 10:00 AM</strong>. A video link will be sent to your email 30 minutes before.</p>
      </div>
      <div style={{ display:"grid", gridTemplateColumns: mobile ? "1fr" : "repeat(3,1fr)", gap:12 }}>
        {[["Documents","3 new files shared"],["Schedule","Next: Apr 8, 10am"],["Messages","1 unread message"]].map(([t,d]) => (
          <div key={t} style={{ ...S.card, cursor:"pointer" }} onClick={() => setPage(t)}>
            <h3 style={{ ...S.h3, color:C.teal }}>{t}</h3>
            <p style={{ ...S.p, marginBottom:0, fontSize:13 }}>{d}</p>
          </div>
        ))}
      </div>
      <div style={{ ...S.card, marginTop:"0.5rem" }}>
        <h3 style={S.h3}>Your progress</h3>
        <p style={{...S.p, fontSize:14}}>You've completed 4 sessions. Diana has noted strong progress on co-parenting communication and your parenting plan outline is nearly complete.</p>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {["Co-parenting plan","Communication tools","Child conversation guide","Legal prep checklist"].map(t => (
            <span key={t} style={{ fontSize:12, padding:"4px 12px", borderRadius:20, background:C.tealLight, color:C.teal, border:`0.5px solid ${C.tealMid}` }}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Documents() {
  const docs = [
    { name:"Co-Parenting Plan Template.pdf", date:"Mar 28, 2026", tag:"Resource" },
    { name:"Session Notes – Mar 22.pdf", date:"Mar 23, 2026", tag:"Notes" },
    { name:"Talking to Your Kids – Guide.pdf", date:"Mar 15, 2026", tag:"Resource" },
    { name:"Session Notes – Mar 15.pdf", date:"Mar 16, 2026", tag:"Notes" },
    { name:"Intake Form – Completed.pdf", date:"Feb 10, 2026", tag:"Admin" },
  ];
  const tagColor = t => t==="Resource"?{bg:C.tealLight,color:C.teal}:t==="Notes"?{bg:C.purpleLight,color:C.purple}:{bg:C.warm,color:C.muted};
  return (
    <div style={S.page}>
      <h1 style={{...S.h1, fontSize:26}}>Documents</h1>
      <p style={S.p}>Files shared by Diana appear here. Click any file to download.</p>
      {docs.map(d => {
        const tc = tagColor(d.tag);
        return (
          <div key={d.name} style={{ ...S.card, display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer", gap:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:12, minWidth:0 }}>
              <div style={{ width:36, height:36, borderRadius:8, background:C.warm, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:500, color:C.muted, flexShrink:0 }}>PDF</div>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:14, fontWeight:500, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{d.name}</div>
                <div style={{ fontSize:12, color:C.hint, marginTop:2 }}>{d.date}</div>
              </div>
            </div>
            <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, background:tc.bg, color:tc.color, fontWeight:500, flexShrink:0 }}>{d.tag}</span>
          </div>
        );
      })}
    </div>
  );
}

function Schedule() {
  const [selDay, setSelDay] = useState(null);
  const [selSlot, setSelSlot] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const mobile = useIsMobile();
  const avail = new Set([2,3,6,7,9,10,13,14,16,17,20,21]);
  const booked = { 3:["9:00 AM"], 9:["2:00 PM"], 16:["11:00 AM"] };
  const slots = ["9:00 AM","10:00 AM","11:00 AM","1:00 PM","2:00 PM","3:30 PM","4:30 PM"];
  const daysInMonth = 30;

  if (confirmed) return (
    <div style={S.page}>
      <div style={{ ...S.card, background:C.tealLight, border:`0.5px solid ${C.tealMid}`, textAlign:"center", padding:"2.5rem" }}>
        <div style={{ fontSize:16, fontWeight:500, color:C.teal, marginBottom:8 }}>Session booked!</div>
        <p style={{...S.p, color:C.teal, marginBottom:0}}>Your session with Diana is confirmed for <strong>April {selDay} at {selSlot}</strong>. A video link will be emailed to you 30 minutes before.</p>
        <button style={{ ...S.btnSm, marginTop:"1.25rem" }} onClick={() => { setConfirmed(false); setSelDay(null); setSelSlot(null); }}>Schedule another</button>
      </div>
    </div>
  );

  return (
    <div style={S.page}>
      <h1 style={{...S.h1, fontSize:26}}>Schedule a session</h1>
      <p style={S.p}>Select an available date, then choose a time. Sessions are 60 minutes via video or phone.</p>
      <div style={S.card}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1rem" }}>
          <span style={{ fontSize:16, fontWeight:500 }}>April 2026</span>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4, marginBottom:"1.25rem" }}>
          {["S","M","T","W","T","F","S"].map((d,i) => <div key={i} style={{ textAlign:"center", fontSize:11, color:C.hint, padding:"4px 0", fontWeight:500 }}>{d}</div>)}
          {Array(daysInMonth).fill(null).map((_,i) => {
            const d = i+1;
            const isAvail = avail.has(d);
            const isSel = selDay===d;
            return (
              <div key={d} onClick={() => { if(isAvail){ setSelDay(d); setSelSlot(null); } }}
                style={{ aspectRatio:"1", display:"flex", alignItems:"center", justifyContent:"center", borderRadius:8, fontSize: mobile ? 12 : 14, cursor:isAvail?"pointer":"default",
                  background:isSel?C.teal:isAvail?C.tealLight:"transparent",
                  color:isSel?"#fff":isAvail?C.teal:C.hint,
                  border:`0.5px solid ${isSel?C.teal:isAvail?C.tealMid:"transparent"}` }}>
                {d}
              </div>
            );
          })}
        </div>
        {selDay && (
          <>
            <p style={{ fontSize:13, color:C.muted, marginBottom:12 }}>Available times — April {selDay}</p>
            <div style={{ display:"grid", gridTemplateColumns: mobile ? "repeat(3,1fr)" : "repeat(4,1fr)", gap:8 }}>
              {slots.map(s => {
                const isBooked = (booked[selDay]||[]).includes(s);
                const isPicked = selSlot===s;
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
        {selSlot && (
          <div style={{ marginTop:"1.25rem", padding:"1rem", background:C.warm, borderRadius:12, display:"flex", flexDirection: mobile ? "column" : "row", alignItems: mobile ? "flex-start" : "center", justifyContent:"space-between", gap:12 }}>
            <div>
              <div style={{ fontSize:14, fontWeight:500 }}>April {selDay}, 2026 · {selSlot}</div>
              <div style={{ fontSize:13, color:C.muted, marginTop:2 }}>60-min session with Diana Kierein</div>
            </div>
            <button style={S.btn} onClick={() => setConfirmed(true)}>Confirm</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Messages() {
  const [msgs, setMsgs] = useState([
    { from:"Diana", text:"Hi Jane — just wanted to check in after our last session. How are you and the kids doing this week?", time:"Mar 29, 2:14 PM" },
    { from:"Jane", text:"We're managing. The kids had a tough weekend but we used the talking points you suggested and it helped a lot.", time:"Mar 29, 4:32 PM" },
    { from:"Diana", text:"That's really encouraging to hear. It takes courage to use those tools in hard moments. I've shared a new resource in your Documents folder that might help going forward.", time:"Mar 30, 9:05 AM" },
  ]);
  const [draft, setDraft] = useState("");
  const send = () => {
    if (!draft.trim()) return;
    setMsgs(m => [...m, { from:"Jane", text:draft, time:"Just now" }]);
    setDraft("");
  };
  return (
    <div style={S.page}>
      <h1 style={{...S.h1, fontSize:26}}>Messages</h1>
      <div style={{ ...S.card, padding:0, overflow:"hidden" }}>
        <div style={{ padding:"1rem 1.25rem", borderBottom:`0.5px solid ${C.border}`, display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:36, height:36, borderRadius:"50%", background:C.tealLight, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:500, color:C.teal, flexShrink:0 }}>DK</div>
          <div>
            <div style={{ fontSize:14, fontWeight:500 }}>Diana Kierein, CDC</div>
            <div style={{ fontSize:12, color:C.teal }}>● Online</div>
          </div>
        </div>
        <div style={{ padding:"1.25rem", minHeight:260, display:"flex", flexDirection:"column", gap:12 }}>
          {msgs.map((m,i) => (
            <div key={i} style={{ display:"flex", flexDirection:"column", alignItems:m.from==="Jane"?"flex-end":"flex-start" }}>
              <div style={{ maxWidth:"85%", padding:"10px 14px", borderRadius:12, fontSize:14, lineHeight:1.6,
                background:m.from==="Jane"?C.teal:C.warm,
                color:m.from==="Jane"?"#fff":C.text }}>
                {m.text}
              </div>
              <span style={{ fontSize:11, color:C.hint, marginTop:4 }}>{m.from==="Jane"?"You":m.from} · {m.time}</span>
            </div>
          ))}
        </div>
        <div style={{ padding:"1rem", borderTop:`0.5px solid ${C.border}`, display:"flex", gap:10 }}>
          <input style={{...S.input, marginBottom:0, flex:1}} placeholder="Write a message…" value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} />
          <button style={S.btn} onClick={send}>Send</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState("Home");
  const [inPortal, setInPortal] = useState(false);

  const renderPage = () => {
    if (!inPortal) {
      if (page==="Home") return <HomePage setPage={setPage} setInPortal={setInPortal}/>;
      if (page==="About") return <AboutPage/>;
      if (page==="Contact") return <ContactPage/>;
      return <LoginPage setPage={setPage} setInPortal={setInPortal}/>;
    }
    if (page==="Portal Home") return <PortalHome setPage={setPage}/>;
    if (page==="Documents") return <Documents/>;
    if (page==="Schedule") return <Schedule/>;
    if (page==="Messages") return <Messages/>;
  };

  return (
    <div style={{ fontFamily:"system-ui, sans-serif", background:"#fff", minHeight:"100vh" }}>
      <Nav page={page} setPage={setPage} inPortal={inPortal} setInPortal={setInPortal}/>
      {renderPage()}
    </div>
  );
}