// hooks/useAuth.ts
import { useEffect, useState } from "react";
import { isValidUcanAuthorization } from "../plugins/wallet";
import { notifyError } from "../plugins/show_window";

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);
  useEffect(() => {
    const check = async () => {
      if (localStorage.getItem("hasConnectedWallet") === "false") {
        notifyError("❌未检测到钱包，请先安装并连接钱包");
        setIsAuthenticated(false);
        return;
      }
      const valid = await isValidUcanAuthorization();
      if (!valid) {
        setIsAuthenticated(false);
        notifyError("❌未完成授权，请连接钱包完成 UCAN 授权");
        return;
      }
      setIsAuthenticated(true);
    };
    check();
  }, []);

  return isAuthenticated;
}
