"use client";
import { useState } from "react";
import { C, S } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage({ setPage }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

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
      setPage("Portal Home");
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
        <input style={S.input} placeholder="••••••••" type="password" value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSignIn()} />
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
