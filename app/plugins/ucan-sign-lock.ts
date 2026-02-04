const UCAN_SIGN_LOCK_KEY = "ucanSignPending";
const UCAN_SIGN_LOCK_TTL_MS = 90 * 1000;

function readTimestamp(): number | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(UCAN_SIGN_LOCK_KEY);
  if (!raw) return null;
  const ts = Number(raw);
  if (!Number.isFinite(ts)) {
    localStorage.removeItem(UCAN_SIGN_LOCK_KEY);
    return null;
  }
  return ts;
}

export function isUcanSignPending(): boolean {
  const ts = readTimestamp();
  if (!ts) return false;
  if (Date.now() - ts > UCAN_SIGN_LOCK_TTL_MS) {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(UCAN_SIGN_LOCK_KEY);
    }
    return false;
  }
  return true;
}

export function acquireUcanSignLock(): boolean {
  if (typeof localStorage === "undefined") return true;
  if (isUcanSignPending()) return false;
  localStorage.setItem(UCAN_SIGN_LOCK_KEY, String(Date.now()));
  return true;
}

export function refreshUcanSignLock() {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(UCAN_SIGN_LOCK_KEY, String(Date.now()));
}

export function releaseUcanSignLock() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(UCAN_SIGN_LOCK_KEY);
}

export function isUcanSignPendingError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const msg = "message" in error ? String((error as any).message) : "";
  return (
    msg.includes("Sign message request already pending") ||
    msg.includes("UCAN sign pending")
  );
}
