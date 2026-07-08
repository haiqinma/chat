import { invalidateUcanAuthorization } from "./wallet";

export const UCAN_REAUTH_ERROR_MESSAGE = "UCAN 授权已失效，请重新连接钱包";

const UCAN_INVALIDATION_PATTERNS = [
  "missing ucan proof chain",
  "ucan root audience mismatch",
  "ucan root is not ready",
  "ucan root capability mismatch",
  "ucan root expired",
  "invalid wallet ucan session response",
  "unlock requires active tab",
];

export function getErrorMessage(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || "";
  if (typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : "";
  }
  return "";
}

export function shouldInvalidateUcanByError(error: unknown): boolean {
  const normalized = getErrorMessage(error).trim().toLowerCase();
  if (!normalized) return false;
  return UCAN_INVALIDATION_PATTERNS.some((entry) => normalized.includes(entry));
}

export async function invalidateUcan(reason?: string): Promise<void> {
  await invalidateUcanAuthorization(
    reason && reason.trim() ? reason.trim() : "UCAN invocation failed",
  );
}

export async function invalidateUcanAndThrow(reason?: string): Promise<never> {
  await invalidateUcan(reason);
  throw new Error(UCAN_REAUTH_ERROR_MESSAGE);
}
