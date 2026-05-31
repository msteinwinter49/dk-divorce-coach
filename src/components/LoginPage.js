"use client";
import { useState } from "react";
import { C, S } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage({ setPage, initialPage }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSignIn = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (authError) {
      setError(authError.message);
    } else {
      setPage(initialPage || "Portal Home");
    }
  };

  const handleResetPassword = async () => {
    if (!email.trim()) {
      setError("Please enter your email address first.");
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email);
    setLoading(false);
    if (resetError) {
      setError(resetError.message);
    } else {
      setResetSent(true);
    }
  };

  return (
    <div style={{ ...S.page, maxWidth:400 }}>
      <h1 style={{...S.h1, fontSize:26}}>Client portal</h1>
      <p style={S.p}>Welcome back. Sign in to access your documents, schedule sessions, and message Diana.</p>
      <div style={S.card}>
        <label style={S.label}>Email address</label>
        <input style={S.input} placeholder="jane@example.com" type="email" value={email} onChange={e => setEmail(e.target.value)} />
        <label style={S.label}>Password</label>
        <div style={{ position: "relative" }}>
          <input style={{ ...S.input, marginBottom: 0, paddingRight: 40 }} placeholder="••••••••"
            type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSignIn()} />
          <button onClick={() => setShowPassword(v => !v)} type="button"
            style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 0, color: C.hint }}
            aria-label={showPassword ? "Hide password" : "Show password"}>
            {showPassword ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            )}
          </button>
        </div>
        <div style={{ marginBottom: "0.75rem" }} />
        {error && <p style={{ fontSize:13, color:"#c0392b", marginBottom:12 }}>{error}</p>}
        {resetSent && <p style={{ fontSize:13, color:C.teal, marginBottom:12 }}>Password reset email sent. Check your inbox.</p>}
        <button style={{ ...S.btn, width:"100%", marginTop:4 }} onClick={handleSignIn} disabled={loading}>
          {loading ? "Please wait..." : "Sign in"}
        </button>
        <p style={{ fontSize:13, color:C.hint, textAlign:"center", marginTop:12, marginBottom:0 }}>
          <span style={{ color:C.teal, cursor:"pointer" }} onClick={handleResetPassword}>Forgot your password?</span>
        </p>
      </div>
    </div>
  );
}
