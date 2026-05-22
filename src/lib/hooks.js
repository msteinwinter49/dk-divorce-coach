"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return mobile;
}

export function useSmsEnabled() {
  const [smsEnabled, setSmsEnabled] = useState(true); // optimistic: show all options while loading
  useEffect(() => {
    createClient()
      .from("settings")
      .select("value")
      .eq("key", "sms_enabled")
      .single()
      .then(({ data }) => setSmsEnabled(data?.value === "true"));
  }, []);
  return smsEnabled;
}

// phones + tablets (< 1024px) — use for hamburger nav
export function useIsNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const check = () => setNarrow(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return narrow;
}
