"use client";
import { useState, useEffect } from "react";
import { C, S } from "@/lib/constants";
import { useAuth } from "@/context/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

export default function Profile({ onSaved, viewAsClient }) {
  const { user, profile, refreshProfile } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [preferredEmail, setPreferredEmail] = useState("");
  const [notificationPref, setNotificationPref] = useState("email");
  const [reminderPref, setReminderPref] = useState("both");
  const [timezone, setTimezone] = useState("America/New_York");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const isFirstLogin = !profile?.first_name;

  const TIMEZONES = [
    { value: "America/New_York", label: "Eastern Time (New York)" },
    { value: "America/Chicago", label: "Central Time (Chicago)" },
    { value: "America/Denver", label: "Mountain Time (Denver)" },
    { value: "America/Phoenix", label: "Arizona (no DST)" },
    { value: "America/Los_Angeles", label: "Pacific Time (Los Angeles)" },
    { value: "America/Anchorage", label: "Alaska Time" },
    { value: "Pacific/Honolulu", label: "Hawaii Time" },
  ];

  const detectTz = () => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
    } catch {
      return "America/New_York";
    }
  };

  const formatPhone = (value) => {
    const digits = value.replace(/\D/g, "").slice(0, 10);
    if (digits.length === 0) return "";
    if (digits.length <= 3) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  useEffect(() => {
    if (viewAsClient) {
      setFirstName(viewAsClient.first_name || "");
      setLastName(viewAsClient.last_name || "");
      setPhone(formatPhone(viewAsClient.phone || ""));
      setPreferredEmail(viewAsClient.preferred_email || viewAsClient.email || "");
      setNotificationPref(viewAsClient.notification_preference || "email");
      setReminderPref(viewAsClient.reminder_preference || "both");
      setTimezone(viewAsClient.timezone || "America/New_York");
    } else if (profile) {
      setFirstName(profile.first_name || "");
      setLastName(profile.last_name || "");
      setPhone(formatPhone(profile.phone || ""));
      setPreferredEmail(profile.preferred_email || user?.email || "");
      setNotificationPref(profile.notification_preference || "email");
      setReminderPref(profile.reminder_preference || "both");
      setTimezone(profile.timezone || detectTz());
    } else if (user) {
      setPreferredEmail(user.email || "");
    }
  }, [profile, user, viewAsClient]);

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setError("First name and last name are required.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(false);

    if (viewAsClient) {
      // Admin saving client profile via API
      const res = await fetch("/api/clients", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: viewAsClient.id,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim() || null,
          preferred_email: preferredEmail.trim() || viewAsClient.email,
          notification_preference: notificationPref,
          reminder_preference: reminderPref,
          timezone,
        }),
      });
      setSaving(false);
      if (!res.ok) {
        setError("Could not save profile. Please try again.");
      } else {
        setSuccess(true);
        // Update viewAsClient in memory so nav/banner reflect changes
        Object.assign(viewAsClient, {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim() || null,
          preferred_email: preferredEmail.trim() || viewAsClient.email,
          notification_preference: notificationPref,
          reminder_preference: reminderPref,
          timezone,
        });
      }
    } else {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          full_name: `${firstName.trim()} ${lastName.trim()}`,
          phone: phone.trim() || null,
          preferred_email: preferredEmail.trim() || user.email,
          notification_preference: notificationPref,
          reminder_preference: reminderPref,
          timezone,
        })
        .eq("id", user.id);

      setSaving(false);
      if (updateError) {
        setError("Could not save profile. Please try again.");
      } else {
        setSuccess(true);
        if (onSaved) onSaved();
      }
    }
  };

  return (
    <div style={S.page}>
      <h1 style={{...S.h1, fontSize:26}}>
        {viewAsClient ? `${viewAsClient.first_name}'s Profile` : isFirstLogin ? "Welcome! Set up your profile" : "Your profile"}
      </h1>
      <p style={S.p}>
        {viewAsClient
          ? "Edit this client's profile information."
          : isFirstLogin
          ? "Please fill in your details to get started."
          : "Update your information below."}
      </p>
      <div style={S.card}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <div>
            <label style={S.label}>First name</label>
            <input style={S.input} placeholder="Jane" value={firstName} onChange={e => setFirstName(e.target.value)} />
          </div>
          <div>
            <label style={S.label}>Last name</label>
            <input style={S.input} placeholder="Smith" value={lastName} onChange={e => setLastName(e.target.value)} />
          </div>
        </div>
        <label style={S.label}>Mobile number</label>
        <input style={S.input} placeholder="(555) 012-3456" type="tel" value={phone} onChange={e => setPhone(formatPhone(e.target.value))} />
        <label style={S.label}>Preferred email address</label>
        <input style={S.input} placeholder="jane@example.com" type="email" value={preferredEmail} onChange={e => setPreferredEmail(e.target.value)} />

        <label style={S.label}>Notification preference</label>
        <select style={{ ...S.input, cursor: "pointer" }} value={notificationPref} onChange={e => setNotificationPref(e.target.value)}>
          <option value="email">Email only</option>
          <option value="text">Text only</option>
          <option value="both">Email and text</option>
        </select>

        <label style={S.label}>Session reminders</label>
        <select style={{ ...S.input, cursor: "pointer" }} value={reminderPref} onChange={e => setReminderPref(e.target.value)}>
          <option value="both">24 hours and 1 hour before</option>
          <option value="24h">24 hours before</option>
          <option value="1h">1 hour before</option>
          <option value="none">No reminders</option>
        </select>

        <label style={S.label}>Timezone</label>
        <select style={{ ...S.input, cursor: "pointer" }} value={timezone} onChange={e => setTimezone(e.target.value)}>
          {TIMEZONES.find(t => t.value === timezone) ? null : (
            <option value={timezone}>{timezone}</option>
          )}
          {TIMEZONES.map(tz => (
            <option key={tz.value} value={tz.value}>{tz.label}</option>
          ))}
        </select>

        {error && <p style={{ fontSize:13, color:"#c0392b", marginBottom:12 }}>{error}</p>}
        {success && <p style={{ fontSize:13, color:C.teal, marginBottom:12 }}>Profile saved.</p>}
        <button style={S.btn} onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save profile"}
        </button>
      </div>

      {/* Payment method — only show for clients after initial profile setup, not in admin view */}
      {!viewAsClient && !isFirstLogin && profile?.role !== "admin" && (
        <div style={{ ...S.card, marginTop: "1rem" }}>
          <h3 style={S.h3}>Payment Method</h3>
          <p style={{ ...S.p, fontSize: 13 }}>
            {profile?.stripe_customer_id
              ? "You have a card on file. You can update it below."
              : "Add a card on file to book coaching sessions."}
          </p>
          <Elements stripe={stripePromise}>
            <CardForm userId={user?.id} hasCard={!!profile?.stripe_customer_id} onSaved={refreshProfile} />
          </Elements>
        </div>
      )}
    </div>
  );
}

function CardForm({ userId, hasCard, onSaved }) {
  const stripe = useStripe();
  const elements = useElements();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [cardInfo, setCardInfo] = useState(null);
  const [showForm, setShowForm] = useState(!hasCard);

  useEffect(() => {
    if (hasCard) {
      fetch("/api/stripe/card").then(r => r.json()).then(data => {
        if (data.card) setCardInfo(data.card);
      });
    }
  }, [hasCard]);

  const handleSubmit = async () => {
    if (!stripe || !elements) return;
    setSaving(true);
    setError(null);
    setSuccess(false);

    const res = await fetch("/api/stripe/setup", { method: "POST" });
    if (!res.ok) {
      setError("Could not initialize payment setup.");
      setSaving(false);
      return;
    }
    const { clientSecret } = await res.json();

    const { error: stripeError } = await stripe.confirmCardSetup(clientSecret, {
      payment_method: { card: elements.getElement(CardElement) },
    });

    setSaving(false);
    if (stripeError) {
      setError(stripeError.message);
    } else {
      setSuccess(true);
      setShowForm(false);
      // Re-fetch card info
      const cardRes = await fetch("/api/stripe/card").then(r => r.json());
      if (cardRes.card) setCardInfo(cardRes.card);
      if (onSaved) onSaved();
    }
  };

  const brandName = (brand) => {
    const names = { visa: "Visa", mastercard: "Mastercard", amex: "Amex", discover: "Discover" };
    return names[brand] || brand;
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

      {showForm && (
        <>
          <div style={{ padding: "10px 12px", border: `0.5px solid ${C.border}`, borderRadius: 8, marginBottom: "0.75rem", background: "#fff" }}>
            <CardElement options={{
              style: {
                base: { fontSize: "14px", color: C.text, "::placeholder": { color: C.hint } },
              },
            }} />
          </div>
          {error && <p style={{ fontSize: 13, color: "#c0392b", marginBottom: 12 }}>{error}</p>}
          {success && <p style={{ fontSize: 13, color: C.teal, marginBottom: 12 }}>{hasCard ? "Card updated." : "Card saved."}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button style={S.btn} onClick={handleSubmit} disabled={saving || !stripe}>
              {saving ? "Saving..." : hasCard ? "Update card" : "Save card"}
            </button>
            {hasCard && <button style={S.btnSmOut} onClick={() => setShowForm(false)}>Cancel</button>}
          </div>
        </>
      )}
    </>
  );
}
