"use client";
import { useEffect, useState, useCallback } from "react";
import { C, S, SERVER_ERROR } from "@/lib/constants";
import { useError } from "@/context/ErrorContext";
import { retryFetch } from "@/lib/fetchUtils";
import { useAuth } from "@/context/AuthContext";
import { createClient } from "@/lib/supabase/client";

export default function BuySessions({ setPage, setProfileFocus, viewAsClient }) {
  const { user } = useAuth();
  const readOnly = !!viewAsClient;

  const [pricing, setPricing] = useState([]);
  const [sessionTypes, setSessionTypes] = useState([]);
  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(true);

  const [step, setStep] = useState("duration"); // duration | package | confirm | result
  const [chosenDuration, setChosenDuration] = useState(null);
  const [chosenPackage, setChosenPackage] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const { setServerError } = useError();
  const [result, setResult] = useState(null); // { ok, balance_after } | { ok:false, error }
  const [balanceMinutes, setBalanceMinutes] = useState(null);
  const [groupHourlyRate, setGroupHourlyRate] = useState(null);

  const clientId = viewAsClient?.id || null;

  const refreshBalance = useCallback(() => {
    if (!user) return;
    const balanceUrl = clientId ? `/api/purchases?client_id=${clientId}` : "/api/purchases";
    fetch(balanceUrl).then(r => r.json()).then(b => { setBalanceMinutes(b?.balance_minutes ?? 0); setGroupHourlyRate(b?.hourly_rate ?? null); }).catch(() => {});
  }, [user, clientId]);

  useEffect(() => {
    if (!user) return;
    const cardUrl = clientId ? `/api/stripe/card?client_id=${clientId}` : "/api/stripe/card";
    const balanceUrl = clientId ? `/api/purchases?client_id=${clientId}` : "/api/purchases";
    (async () => {
      try {
        const [pr, tr, cr, br] = await Promise.all([
          retryFetch("/api/pricing-matrix"),
          retryFetch("/api/session-types"),
          retryFetch(cardUrl),
          retryFetch(balanceUrl),
        ]);
        if (pr.status >= 500 || tr.status >= 500) { setServerError(SERVER_ERROR); setLoading(false); return; }
        const [p, t, c, b] = await Promise.all([
          pr.json().catch(() => []),
          tr.json().catch(() => []),
          cr.ok ? cr.json().catch(() => ({ card: null })) : Promise.resolve({ card: null }),
          br.ok ? br.json().catch(() => ({ balance_minutes: 0 })) : Promise.resolve({ balance_minutes: 0 }),
        ]);
        setPricing(Array.isArray(p) ? p.filter(x => x.is_active) : []);
        setSessionTypes(Array.isArray(t) ? t : []);
        setCard(c?.card || null);
        setBalanceMinutes(b?.balance_minutes ?? 0);
        setGroupHourlyRate(b?.hourly_rate ?? null);
      } catch {
        setServerError(SERVER_ERROR);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;
    const watchId = clientId || user.id;
    const supabase = createClient();
    const channel = supabase
      .channel(`balance_ledger_buy:${watchId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "balance_ledger", filter: `client_id=eq.${watchId}` }, refreshBalance)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, clientId, refreshBalance]);

  const fmtBalance = (min) => {
    const h = Math.floor(Math.abs(min) / 60);
    const m = Math.abs(min) % 60;
    const sign = min < 0 ? "-" : "";
    if (h === 0) return `${sign}${m} minute${m !== 1 ? "s" : ""}`;
    if (m === 0) return `${sign}${h} hour${h !== 1 ? "s" : ""}`;
    return `${sign}${h} hour${h !== 1 ? "s" : ""} ${m} minute${m !== 1 ? "s" : ""}`;
  };
  const balanceSubtitle = balanceMinutes != null
    ? <p style={{ ...S.p, fontSize: 20, color: C.muted, marginTop: 4, marginBottom: 0 }}>Available to schedule: {fmtBalance(balanceMinutes)}</p>
    : null;

  const effectiveCents = (p) => groupHourlyRate
    ? Math.round(p.duration_min * p.package_size / 60 * groupHourlyRate * 100)
    : p.price_cents;

  const distinctDurations = Array.from(new Set(pricing.map(p => p.duration_min)))
    .filter(d => sessionTypes.some(st => st.duration === d))
    .sort((a, b) => a - b);
  const packagesForDuration = (d) => pricing.filter(p => p.duration_min === d).sort((a, b) => a.package_size - b.package_size);
  const sessionLabel = (d) => sessionTypes.find(st => st.duration === d)?.label || `${d} min`;

  const expiryPreview = (months) => {
    const dt = new Date();
    dt.setMonth(dt.getMonth() + months);
    return dt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  };

  const handleConfirm = async () => {
    if (readOnly || !chosenPackage) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matrix_id: chosenPackage.id }),
      });
      if (!res.ok) {
        if (res.status >= 500) { setServerError(SERVER_ERROR); return; }
        const data = await res.json().catch(() => ({}));
        setResult({ ok: false, error: data.error || "Purchase failed." });
        setStep("result");
        return;
      }
      const data = await res.json();
      setResult({ ok: true, balance_after: data.balance_after });
      if (data.balance_after != null) setBalanceMinutes(data.balance_after);
      setStep("result");
    } catch {
      setServerError(SERVER_ERROR);
    } finally {
      setSubmitting(false);
    }
  };

  const restart = () => {
    setChosenDuration(null);
    setChosenPackage(null);
    setResult(null);
    setStep("duration");
  };

  if (loading) {
    return <div style={S.page}><p style={S.p}>Loading…</p></div>;
  }

  if (!card) {
    return (
      <div style={S.page}>
        <h1 style={S.h1}>Buy Sessions</h1>
        {balanceSubtitle}
        <div style={S.card}>
          <h3 style={S.h3}>Add a card first</h3>
          <p style={{ ...S.p, marginBottom: "1rem" }}>You need a payment method on file before you can purchase a package.</p>
          <button style={S.btn} onClick={() => { setProfileFocus("payment"); setPage("Profile"); }}>Add a card</button>
        </div>
      </div>
    );
  }

  if (pricing.length === 0) {
    return (
      <div style={S.page}>
        <h1 style={S.h1}>Buy Sessions</h1>
        {balanceSubtitle}
        <div style={S.card}>
          <p style={{ ...S.p, marginBottom: 0 }}>No packages are currently available. Please contact Diana directly.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <h1 style={S.h1}>Buy Sessions</h1>
      {balanceSubtitle}

      {step === "duration" && (
        <div style={S.card}>
          <h3 style={S.h3}>Choose a session type</h3>
          <div style={{ display: "grid", gap: 10 }}>
            {distinctDurations.map(d => (
              <button
                key={d}
                onClick={() => { setChosenDuration(d); setStep("package"); }}
                style={{ ...optionRow }}
              >
                <span style={{ fontSize: 15, color: C.text, fontWeight: 500 }}>{sessionLabel(d)} ({d} min)</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === "package" && chosenDuration != null && (
        <div style={S.card}>
          <button style={backLink} onClick={() => setStep("duration")}>&larr; Back</button>
          <h3 style={S.h3}>Choose a package</h3>
          <p style={{ ...S.p, fontSize: 14 }}>{sessionLabel(chosenDuration)} — {chosenDuration} min sessions.</p>
          <div style={{ display: "grid", gap: 10 }}>
            {packagesForDuration(chosenDuration).map(p => {
              const perSession = effectiveCents(p) / p.package_size / 100;
              const total = effectiveCents(p) / 100;
              return (
                <button
                  key={p.id}
                  onClick={() => { setChosenPackage(p); setStep("confirm"); }}
                  style={{ ...optionRow, justifyContent: "flex-start" }}
                >
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                    <span style={{ fontSize: 15, color: C.text, fontWeight: 500 }}>
                      {p.package_size} session{p.package_size > 1 ? "s" : ""}
                      <span style={{ marginLeft: 12, color: C.teal }}>Total Price ${fmtUSD(total)}</span>
                    </span>
                    <span style={{ fontSize: 12, color: C.hint }}>${fmtUSD(perSession)} per session · expires in {p.expires_months} mo</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {step === "confirm" && chosenPackage && (
        <div style={S.card}>
          <button style={backLink} onClick={() => setStep("package")}>&larr; Choose a different package</button>
          <h3 style={S.h3}>Confirm your purchase</h3>
          <div style={{ display: "grid", gap: 8, marginBottom: "1rem", fontSize: 14, color: C.text }}>
            <Row label="Package" value={`${chosenPackage.package_size} × ${chosenPackage.duration_min} min`} />
            <Row label="Total time" value={(() => { const total = chosenPackage.duration_min * chosenPackage.package_size; const h = Math.floor(total / 60); const m = total % 60; if (h === 0) return `${m} minute${m !== 1 ? "s" : ""}`; if (m === 0) return `${h} hour${h !== 1 ? "s" : ""}`; return `${h} hour${h !== 1 ? "s" : ""} and ${m} minute${m !== 1 ? "s" : ""}`; })()} />
            <Row label="Sessions expire" value={expiryPreview(chosenPackage.expires_months)} />
            <Row label="Payment method" value={`${card.brand?.toUpperCase() || "CARD"} ···· ${card.last4}`} />
            <Row label="Total" value={`$${fmtUSD(effectiveCents(chosenPackage) / 100)}`} bold />
          </div>
          {readOnly && (
            <p style={{ fontSize: 13, color: "#c0392b", marginBottom: 12 }}>
              Read-only mode — exit View as Client to make a purchase.
            </p>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              style={{ ...S.btn, opacity: submitting || readOnly ? 0.6 : 1 }}
              disabled={submitting || readOnly}
              onClick={handleConfirm}
            >
              {submitting ? "Processing…" : "Confirm Purchase"}
            </button>
            <button style={S.btnSmOut} disabled={submitting} onClick={() => setStep("package")}>Cancel</button>
          </div>
        </div>
      )}

      {step === "result" && result && (
        <div style={S.card}>
          {result.ok ? (
            <>
              <h3 style={{ ...S.h3, color: C.teal }}>Purchase complete</h3>
              <p style={{ ...S.p, fontSize: 14, marginBottom: "1rem" }}>
                Your card was charged successfully.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={S.btn} onClick={() => setPage("Schedule")}>Schedule a session</button>
                <button style={S.btnSmOut} onClick={restart}>Buy another package</button>
              </div>
            </>
          ) : (
            <>
              <h3 style={{ ...S.h3, color: "#c0392b" }}>Purchase failed</h3>
              <p style={{ ...S.p, fontSize: 14, marginBottom: "1rem" }}>{result.error}</p>
              <p style={{ ...S.p, fontSize: 13, marginBottom: "1rem" }}>
                If your card was declined or needs verification, you can update your payment method and try again.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={S.btn} onClick={restart}>Try again</button>
                <button style={S.btnSmOut} onClick={() => setPage("Profile")}>Update card</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: `0.5px solid ${C.border}`, paddingBottom: 6 }}>
      <span style={{ color: C.muted }}>{label}</span>
      <span style={{ fontWeight: bold ? 600 : 400, color: bold ? C.teal : C.text }}>{value}</span>
    </div>
  );
}

function fmtUSD(n) {
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const optionRow = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 16px",
  background: "#fff",
  border: `0.5px solid ${C.border}`,
  borderRadius: 10,
  cursor: "pointer",
  fontFamily: "inherit",
  textAlign: "left",
};

const backLink = {
  background: "none",
  border: "none",
  color: C.teal,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
  padding: 0,
  marginBottom: 12,
};
