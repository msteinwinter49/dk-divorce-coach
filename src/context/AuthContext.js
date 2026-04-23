"use client";
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

const AuthContext = createContext({ user: null, profile: null, loading: true });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchSeqRef = useRef(0);

  const fetchProfile = useCallback(async (userId) => {
    const seq = ++fetchSeqRef.current;
    const supabase = createClient();
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (seq !== fetchSeqRef.current) return; // superseded by a newer fetch
    if (error) {
      await new Promise(r => setTimeout(r, 500));
      const { data: retryData } = await supabase.from("profiles").select("*").eq("id", userId).single();
      if (seq !== fetchSeqRef.current) return;
      setProfile(retryData);
    } else {
      setProfile(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const supabase = createClient();

    async function init() {
      // Invite links use the legacy implicit flow — tokens arrive in the URL hash.
      // createBrowserClient (SSR) skips these, so we set the session explicitly first.
      if (typeof window !== "undefined" && window.location.hash.includes("access_token")) {
        const params = new URLSearchParams(window.location.hash.substring(1));
        const access_token = params.get("access_token");
        const refresh_token = params.get("refresh_token");
        if (access_token && refresh_token) {
          window.history.replaceState(null, "", window.location.pathname);
          await supabase.auth.setSession({ access_token, refresh_token });
        }
      }

      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (user) fetchProfile(user.id);
      else setLoading(false);
    }

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        if (event === "SIGNED_IN") setLoading(true);
        fetchProfile(u.id);
      } else {
        setProfile(null);
        if (event === "SIGNED_OUT") setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const refreshProfile = useCallback(() => {
    if (user) fetchProfile(user.id);
  }, [user, fetchProfile]);

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
