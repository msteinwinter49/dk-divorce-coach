"use client";
import { useError } from "@/context/ErrorContext";

export default function ErrorBanner() {
  const { serverError, setServerError } = useError();
  if (!serverError) return null;
  return (
    <div style={{ padding: "12px 1rem", background: "#fdecea", borderBottom: "1px solid #e6b8b0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <span style={{ fontSize: 13, color: "#c0392b" }}>{serverError}</span>
      <button
        onClick={() => setServerError(null)}
        style={{ fontSize: 12, padding: "4px 12px", borderRadius: 6, border: "1px solid #c0392b", background: "#fff", color: "#c0392b", cursor: "pointer", fontFamily: "inherit", fontWeight: 500, flexShrink: 0 }}
      >
        Dismiss
      </button>
    </div>
  );
}
