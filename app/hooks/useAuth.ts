// hooks/useAuth.ts
import { useEffect, useState } from "react";
import { isValidUcanAuthorization, UCAN_AUTH_EVENT } from "../plugins/wallet";
import { notifyError } from "../plugins/show_window";

export function useAuth(options?: { notify?: boolean }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);
  const shouldNotify = options?.notify === true;
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (localStorage.getItem("hasConnectedWallet") === "false") {
        if (!cancelled) {
          if (shouldNotify) {
            notifyError("❌未检测到钱包，请先安装并连接钱包");
          }
          setIsAuthenticated(false);
        }
        return;
      }
      const valid = await isValidUcanAuthorization();
      if (cancelled) return;
      if (!valid) {
        setIsAuthenticated(false);
        if (shouldNotify) {
          notifyError("❌未完成授权，请连接钱包完成 UCAN 授权");
        }
        return;
      }
      setIsAuthenticated(true);
    };
    check();
    const onAuthChange = () => {
      check();
    };
    window.addEventListener(UCAN_AUTH_EVENT, onAuthChange);
    window.addEventListener("storage", onAuthChange);
    return () => {
      cancelled = true;
      window.removeEventListener(UCAN_AUTH_EVENT, onAuthChange);
      window.removeEventListener("storage", onAuthChange);
    };
  }, [shouldNotify]);

  return isAuthenticated;
}
