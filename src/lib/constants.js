export const C = {
  teal: "#0F6E56", tealLight: "#E1F5EE", tealMid: "#5DCAA5",
  purple: "#534AB7", purpleLight: "#EEEDFE",
  warm: "#F5F0EB", warmBorder: "#E8E0D5",
  text: "#2C2C2A", muted: "#5F5E5A", hint: "#888780",
  border: "rgba(0,0,0,0.35)",
  gridLine: "rgba(0,0,0,0.3)",
};

export const SERVER_ERROR = "Something went wrong. Please reload the page and try again.";

export const S = {
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
  page: { minHeight:"calc(100vh - 64px)", padding:"2rem 1rem 5rem", maxWidth:800, margin:"0 auto" },
  h1: { fontSize:30, fontWeight:500, color:C.text, marginBottom:"1rem", lineHeight:1.25 },
  h2: { fontSize:22, fontWeight:500, color:C.text, marginBottom:"0.75rem" },
  h3: { fontSize:20, fontWeight:500, color:C.text, marginBottom:"0.5rem" },
  p: { fontSize:15, color:C.muted, lineHeight:1.75, marginBottom:"1rem" },
  card: { background:"#fff", border:`0.5px solid ${C.border}`, borderRadius:12, padding:"1.25rem 1.5rem", marginBottom:"1rem" },
  input: { width:"100%", padding:"10px 12px", border:`0.5px solid ${C.border}`, borderRadius:8, fontSize:16, fontFamily:"inherit", marginBottom:"0.75rem", boxSizing:"border-box", outline:"none" },
  label: { fontSize:13, color:C.muted, display:"block", marginBottom:4 },
};
