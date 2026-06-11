"use client";
import { useState, useEffect } from "react";
import { C, S, SERVER_ERROR } from "@/lib/constants";
import { useError } from "@/context/ErrorContext";
import { retryFetch } from "@/lib/fetchUtils";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardNumberElement, CardExpiryElement, CardCvcElement, useStripe, useElements } from "@stripe/react-stripe-js";

export const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

const brandName = (brand) => {
  const names = { visa: "Visa", mastercard: "Mastercard", amex: "Amex", discover: "Discover" };
  return names[brand] || brand;
};

export function PaymentMethodSection({ hasCard, onSaved }) {
  const [cardInfo, setCardInfo] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [clientSecret, setClientSecret] = useState(null);
  const [loadingSecret, setLoadingSecret] = useState(false);
  const [initError, setInitError] = useState(null);
  const { setServerError } = useError();

  useEffect(() => {
    if (hasCard) {
      (async () => {
        try {
          const res = await retryFetch("/api/stripe/card");
          if (res.ok) {
            const data = await res.json();
            if (data.card) setCardInfo(data.card);
          } else if (res.status >= 500) {
            setServerError(SERVER_ERROR);
          }
        } catch {
          setServerError(SERVER_ERROR);
        }
      })();
    }
  }, [hasCard]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (showForm && !clientSecret && !loadingSecret && !initError) {
      setLoadingSecret(true);
      (async () => {
        try {
          const res = await fetch("/api/stripe/setup", { method: "POST" });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            if (res.status >= 500) {
              setServerError(SERVER_ERROR);
            } else {
              setInitError(body.error || "Could not initialize payment setup.");
            }
          } else {
            setClientSecret(body.clientSecret);
          }
        } catch {
          setServerError(SERVER_ERROR);
        } finally {
          setLoadingSecret(false);
        }
      })();
    }
  }, [showForm, clientSecret, loadingSecret, initError]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaved = async () => {
    try {
      const res = await retryFetch("/api/stripe/card");
      if (res.ok) {
        const data = await res.json();
        if (data.card) setCardInfo(data.card);
      } else if (res.status >= 500) {
        setServerError(SERVER_ERROR);
      }
    } catch {
      setServerError(SERVER_ERROR);
    }
    setShowForm(false);
    setClientSecret(null);
    if (onSaved) onSaved();
  };

  const handleCancel = () => {
    setShowForm(false);
    setClientSecret(null);
    setInitError(null);
  };

  return (
    <>
      {cardInfo && !showForm && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 14px", border: `0.5px solid ${C.border}`, borderRadius: 8, marginBottom: "0.75rem", background: "#fafafa",
        }}>
          <div>
            <span style={{ fontSize: 14, color: C.text, fontWeight: 500 }}>{brandName(cardInfo.brand)}</span>
            <span style={{ fontSize: 14, color: C.muted, marginLeft: 8 }}>**** {cardInfo.last4}</span>
            <span style={{ fontSize: 13, color: C.hint, marginLeft: 12 }}>
              Exp {String(cardInfo.exp_month).padStart(2, "0")}/{cardInfo.exp_year}
            </span>
          </div>
          <button style={S.btnSmOut} onClick={() => setShowForm(true)}>Change</button>
        </div>
      )}

      {!cardInfo && !showForm && (
        <button style={S.btn} onClick={() => setShowForm(true)}>Add a card</button>
      )}

      {showForm && (
        <>
          {initError && <p style={{ fontSize: 13, color: "#c0392b", marginBottom: 12 }}>{initError}</p>}
          {!clientSecret && !initError && <p style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>Loading…</p>}
          {clientSecret && (
            <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe" } }}>
              <PaymentForm hasCard={hasCard} clientSecret={clientSecret} onSaved={handleSaved} onCancel={handleCancel} />
            </Elements>
          )}
        </>
      )}
    </>
  );
}

function PaymentForm({ hasCard, clientSecret, onSaved, onCancel }) {
  const stripe = useStripe();
  const elements = useElements();
  const [zip, setZip] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (!stripe || !elements) return;
    setSaving(true);
    setError(null);

    const { error: stripeError, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
      payment_method: {
        card: elements.getElement(CardNumberElement),
        billing_details: { address: { postal_code: zip } },
      },
    });

    setSaving(false);
    if (stripeError) {
      setError(stripeError.message);
    } else if (setupIntent && setupIntent.status === "succeeded") {
      if (onSaved) await onSaved();
    } else {
      setError("Card could not be saved. Please try again.");
    }
  };

  const stripeFieldStyle = {
    padding: "10px 12px",
    border: `0.5px solid ${C.border}`,
    borderRadius: 8,
    marginBottom: "0.75rem",
    background: "#fff",
  };

  const stripeOptions = {
    style: {
      base: { fontSize: "16px", fontFamily: "system-ui, sans-serif", color: "#333", "::placeholder": { color: "#aab7c4" } },
    },
  };

  return (
    <>
      <label style={S.label}>Card number</label>
      <div style={stripeFieldStyle}>
        <CardNumberElement options={{ ...stripeOptions, showIcon: true, disableLink: true }} />
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={S.label}>Expiry</label>
          <div style={stripeFieldStyle}><CardExpiryElement options={stripeOptions} /></div>
        </div>
        <div style={{ flex: 1 }}>
          <label style={S.label}>CVC</label>
          <div style={stripeFieldStyle}><CardCvcElement options={stripeOptions} /></div>
        </div>
        <div style={{ flex: 1 }}>
          <label style={S.label}>ZIP code</label>
          <input
            style={{ ...S.input, marginBottom: "0.75rem" }}
            placeholder="12345"
            value={zip}
            onChange={e => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
          />
        </div>
      </div>
      {error && <p style={{ fontSize: 13, color: "#c0392b", marginBottom: 12 }}>{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button style={S.btn} onClick={handleSubmit} disabled={saving || !stripe}>
          {saving ? "Saving..." : hasCard ? "Update card" : "Save card"}
        </button>
        <button style={S.btnSmOut} onClick={onCancel}>Cancel</button>
      </div>
    </>
  );
}
