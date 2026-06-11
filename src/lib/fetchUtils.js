// Drop-in for fetch() at safe (idempotent/read-only) call sites.
// Retries on 5xx or network failure with exponential backoff.
// After all retries fail: fires one client-side system alert and either
// returns the last 500 Response (for 5xx) or re-throws (for network failure).
export async function retryFetch(url, options = {}) {
  const delays = [1000, 2000];
  let lastRes;
  let lastErr;

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.status < 500) return res;
      lastRes = res;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
      lastRes = null;
    }
    if (attempt < delays.length) {
      await new Promise(r => setTimeout(r, delays[attempt]));
    }
  }

  const method = (options?.method || "GET").toUpperCase();
  const path = typeof url === "string" ? url.split("?")[0] : String(url);
  fetch("/api/system-alerts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      category: "client_error",
      action: `${method} ${path}`,
      error: lastErr?.message || String(lastErr),
    }),
  }).catch(() => {});

  if (lastRes) return lastRes;
  throw lastErr;
}
