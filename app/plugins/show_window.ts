import { toast } from "sonner";

const RECENT_TOASTS = new Map<string, number>();
const DEDUPE_WINDOW_MS = 1500;

function shouldToast(key: string) {
  const now = Date.now();
  const last = RECENT_TOASTS.get(key);
  if (last && now - last < DEDUPE_WINDOW_MS) return false;
  RECENT_TOASTS.set(key, now);
  return true;
}

export const notifyError = (msg: string) => {
  const key = `error:${msg}`;
  if (!shouldToast(key)) return;
  toast.error(msg, { id: key, duration: 3000 });
};

export const notifyInfo = (msg: string) => {
  const key = `info:${msg}`;
  if (!shouldToast(key)) return;
  toast.info(msg, { id: key });
};

export const notifySuccess = (msg: string) => {
  const key = `success:${msg}`;
  if (!shouldToast(key)) return;
  toast.success(msg, { id: key });
};
