function isEnabledEnv(value?: string): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

function normalizeBuildVersion(value?: string) {
  const version = value?.trim().replace(/^v/i, "");
  return version || "";
}

function readBuildVersion() {
  const buildVersion = normalizeBuildVersion(process.env.BUILD_VERSION);
  if (buildVersion) return buildVersion;

  const fs = (process as any).getBuiltinModule?.("fs") as
    typeof import("fs") | undefined;
  const path = (process as any).getBuiltinModule?.("path") as
    typeof import("path") | undefined;
  if (!fs || !path) {
    throw Error("[Build Config] Node built-in modules are not available");
  }

  const packageJsonPath = path.resolve(process.cwd(), "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
    version?: string;
  };

  return normalizeBuildVersion(packageJson.version) || "0.0.0";
}

export const getBuildConfig = () => {
  if (typeof process === "undefined") {
    throw Error(
      "[Server Config] you are importing a nodejs-only module outside of nodejs",
    );
  }
  const buildMode = process.env.BUILD_MODE ?? "standalone";
  const isApp = isEnabledEnv(process.env.BUILD_APP);
  const version = "v" + readBuildVersion();

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
  };
};

export type BuildConfig = ReturnType<typeof getBuildConfig>;
