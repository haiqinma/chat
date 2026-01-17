import tauriConfig from "../../src-tauri/tauri.conf.json";
import { DEFAULT_INPUT_TEMPLATE } from "../constant";

export const getBuildConfig = () => {
  if (typeof process === "undefined") {
    throw Error(
      "[Server Config] you are importing a nodejs-only module outside of nodejs",
    );
  }
  const defaultRouterBackendUrl = "http://127.0.0.1:3011";
  const adminWalletAccount = process.env.ADMIN_WALLET_ACCOUNT;
  const buildMode = process.env.BUILD_MODE ?? "standalone";
  const isApp = !!process.env.BUILD_APP;
  const version = "v" + tauriConfig.package.version;
  const webdavBackendUrl = process.env.WEBDAV_BACKEND_URL;
  const routerBackendUrl =
    process.env.ROUTER_BACKEND_URL ??
    process.env.YEYING_BACKEND_URL ??
    defaultRouterBackendUrl;

  const commitInfo = (() => {
    try {
      const childProcess = require("child_process");
      const commitDate: string = childProcess
        .execSync('git log -1 --format="%at000" --date=unix')
        .toString()
        .trim();
      const commitHash: string = childProcess
        .execSync('git log --pretty=format:"%H" -n 1')
        .toString()
        .trim();

      return { commitDate, commitHash };
    } catch (e) {
      console.error("[Build Config] No git or not from git repo.");
      return {
        commitDate: "unknown",
        commitHash: "unknown",
      };
    }
  })();

  return {
    version,
    ...commitInfo,
    buildMode,
    isApp,
    template: process.env.DEFAULT_INPUT_TEMPLATE ?? DEFAULT_INPUT_TEMPLATE,
    adminWalletAccount,
    webdavBackendUrl,
    routerBackendUrl,
  };
};

export type BuildConfig = ReturnType<typeof getBuildConfig>;
