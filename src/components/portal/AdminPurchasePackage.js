"use client";
import { useEffect, useState } from "react";
import { C, S, SERVER_ERROR } from "@/lib/constants";
import { useError } from "@/context/ErrorContext";

export default function AdminPurchasePackage({ client, onDirtyChange, onSuccess }) {
  const [pricing, setPricing] = useState([]);
  const [sessionTypes, setSessionTypes] = useState([]);
  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(true);

  const [chosenDuration, setChosenDuration] = useState("");
  const [chosenMatrixId, setChosenMatrixId] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { ok, balance_after, charged_dollars } | { ok:false, error }
  const { setServerError } = useError();

  useEffect(() => {
    if (!client?.id) return;
    setLoading(true);
    setResult(null);
    setChosenDuration("");
    setChosenMatrixId("");
    (async () => {
      try {
        const [pr, tr, cr] = await Promise.all([
          fetch("/api/pricing-matrix"),
          fetch("/api/session-types"),
          fetch(`/api/stripe/card?client_id=${encodeURIComponent(client.id)}`),
        ]);
        if (pr.status >= 500 || tr.status >= 500) { setServerError(SERVER_ERROR); setLoading(false); return; }
        const [p, t, c] = await Promise.all([
          pr.json().catch(() => []),
          tr.json().catch(() => []),
          cr.ok ? cr.json().catch(() => ({ card: null })) : Promise.resolve({ card: null }),
        ]);
        setPricing(Array.isArray(p) ? p.filter(x => x.is_active) : []);
        setSessionTypes(Array.isArray(t) ? t.filter(x => x.is_active) : []);
        setCard(c?.card || null);
      } catch {
        setServerError(SERVER_ERROR);
      } finally {
        setLoading(false);
      }
    })();
  }, [client?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const distinctDurations = Array.from(new Set(pricing.map(p => p.duration_min)))
    .filter(d => sessionTypes.some(st => st.duration === d))
    .sort((a, b) => a - b);
  const packagesForDuration = (d) => pricing.filter(p => p.duration_min === Number(d)).sort((a, b) => a.package_size - b.package_size);
  const sessionLabel = (d) => sessionTypes.find(st => st.duration === Number(d))?.label || `${d} min`;
  const chosenPackage = pricing.find(p => p.id === chosenMatrixId);

  const effectivePriceCents = (p) => {
    const rate = client?.group_hourly_rate;
    return (rate && rate > 0)
      ? Math.round(p.duration_min * p.package_size / 60 * rate * 100)
      : p.price_cents;
  };
  const fmtDollars = (cents) => (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const expiryPreview = (months) => {
    const dt = new Date();
    dt.setMonth(dt.getMonth() + months);
    return dt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  };

  const handleCharge = async () => {
    if (!chosenPackage || submitting) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matrix_id: chosenPackage.id, client_id: client.id }),
      });
      if (!res.ok) {
        if (res.status >= 500) { setServerError(SERVER_ERROR); return; }
        const data = await res.json().catch(() => ({}));
        setResult({ ok: false, error: data.error || "Charge failed." });
        return;
      }
      const data = await res.json();
      setResult({
        ok: true,
        balance_after: data.balance_after,
        charged_dollars: fmtDollars(effectivePriceCents(chosenPackage)),
      });
      setChosenDuration("");
      setChosenMatrixId("");
      onDirtyChange?.(false);
      onSuccess?.(data.balance_after);
    } catch {
      setServerError(SERVER_ERROR);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p style={{ fontSize: 16, color: C.muted, marginBottom: 0 }}>Loading…</p>;
  }

  if (!card) {
    return (
      <p style={{ fontSize: 16, color: "#c0392b", marginBottom: 0 }}>
        No card on file. Ask the client to add a payment method in their portal first.
      </p>
    );
  }

  if (pricing.length === 0) {
    return <p style={{ fontSize: 16, color: C.muted, marginBottom: 0 }}>No active packages configured.</p>;
  }

  const cardLine = `${(card.brand || "card").toUpperCase()} ···· ${card.last4}`;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label style={{ ...S.label, fontSize: 16 }}>Session type</label>
          <select
            style={{ ...S.input, marginBottom: 0, cursor: "pointer" }}
            value={chosenDuration}
            onChange={e => { setChosenDuration(e.target.value); setChosenMatrixId(""); onDirtyChange?.(!!e.target.value); }}
          >
            <option value="">Select…</option>
            {distinctDurations.map(d => (
              <option key={d} value={d}>{sessionLabel(d)} ({d} min)</option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label style={{ ...S.label, fontSize: 16 }}>Package</label>
          <select
            style={{ ...S.input, marginBottom: 0, cursor: "pointer" }}
            value={chosenMatrixId}
            onChange={e => setChosenMatrixId(e.target.value)}
            disabled={!chosenDuration}
          >
            <option value="">Select…</option>
            {chosenDuration && packagesForDuration(chosenDuration).map(p => {
              const total = fmtDollars(effectivePriceCents(p));
              return (
                <option key={p.id} value={p.id}>
                  {p.package_size} session{p.package_size > 1 ? "s" : ""} — ${total}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {chosenPackage && (
        <div style={{ background: C.warm, border: `0.5px solid ${C.warmBorder}`, borderRadius: 8, padding: "10px 12px", fontSize: 16, color: C.text }}>
          <div>Will charge <strong>{cardLine}</strong>: <strong>${fmtDollars(effectivePriceCents(chosenPackage))}</strong></div>
          <div style={{ color: C.muted, marginTop: 2 }}>
            Adds {chosenPackage.duration_min * chosenPackage.package_size} min · expires {expiryPreview(chosenPackage.expires_months)}
          </div>
        </div>
      )}

      <div>
        <button
          style={{ ...S.btn, opacity: !chosenPackage || submitting ? 0.6 : 1 }}
          disabled={!chosenPackage || submitting}
          onClick={handleCharge}
        >
          {submitting ? "Charging…" : "Charge Card on File"}
        </button>
      </div>

      {result && (
        result.ok ? (
          <p style={{ fontSize: 16, color: C.teal, marginBottom: 0 }}>
            Charged ${result.charged_dollars}. New balance: {(() => { const sign = result.balance_after < 0 ? "-" : ""; const abs = Math.abs(result.balance_after); const h = Math.floor(abs / 60); const m = abs % 60; if (h === 0) return `${sign}${m} minute${m !== 1 ? "s" : ""}`; if (m === 0) return `${sign}${h} hour${h !== 1 ? "s" : ""}`; return `${sign}${h} hour${h !== 1 ? "s" : ""} and ${m} minute${m !== 1 ? "s" : ""}`; })()}. Email receipt sent.
          </p>
        ) : (
          <p style={{ fontSize: 16, color: "#c0392b", marginBottom: 0 }}>{result.error}</p>
        )
      )}
    </div>
  );
}
