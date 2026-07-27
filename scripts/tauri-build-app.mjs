import { spawn } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import tauriConfig from "../src-tauri/tauri.conf.json" with { type: "json" };

const rootDir = process.cwd();
const releaseMode = process.argv.includes("--release-updater");
const tempConfigPath = path.join(rootDir, "src-tauri", "tauri.release.conf.json");
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env: process.env,
      stdio: "inherit",
      shell: process.platform === "win32",
      ...options,
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
      }
    });

    child.on("error", reject);
  });
}

function runCapture(command, args, options = {}) {
  return new Promise((resolve) => {
    let output = "";
    const child = spawn(command, args, {
      cwd: rootDir,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
      ...options,
    });

    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("exit", (code) => {
      resolve({ code, output });
    });
    child.on("error", (error) => {
      resolve({ code: 1, output: error.message });
    });
  });
}

function resolveArch() {
  switch (process.arch) {
    case "arm64":
      return "aarch64";
    case "x64":
      return "x64";
    default:
      return process.arch;
  }
}

function normalizeVersion(value) {
  return value?.trim().replace(/^refs\/tags\//, "").replace(/^v/i, "") || "";
}

function isSemverVersion(value) {
  return SEMVER_PATTERN.test(value);
}

function resolveBuildVersion() {
  const candidates = [
    process.env.BUILD_VERSION,
    process.env.GITHUB_REF_NAME,
    process.env.npm_package_version,
    tauriConfig.version,
  ];

  for (const candidate of candidates) {
    const version = normalizeVersion(candidate);
    if (version && isSemverVersion(version)) {
      return version;
    }
  }

  throw new Error(
    "Unable to resolve a valid desktop app version. Set BUILD_VERSION to v<major>.<minor>.<patch>.",
  );
}

function resolveSigningKeySource() {
  if (process.env.TAURI_SIGNING_PRIVATE_KEY?.trim()) {
    return "TAURI_SIGNING_PRIVATE_KEY";
  }

  if (process.env.TAURI_SIGNING_PRIVATE_KEY_PATH?.trim()) {
    return "TAURI_SIGNING_PRIVATE_KEY_PATH";
  }

  return null;
}

function validateReleaseSigningEnv() {
  const signingKeySource = resolveSigningKeySource();
  if (!signingKeySource) {
    throw new Error(
      "Release updater build requires TAURI_SIGNING_PRIVATE_KEY or TAURI_SIGNING_PRIVATE_KEY_PATH.",
    );
  }

  if (!process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD?.trim()) {
    throw new Error(
      "Release updater build requires TAURI_SIGNING_PRIVATE_KEY_PASSWORD.",
    );
  }

  return signingKeySource;
}

function readEnv(name) {
  return process.env[name]?.trim() || "";
}

function requireMacosReleaseConfig() {
  const config = {
    appleId: readEnv("APPLE_ID"),
    applePassword: readEnv("APPLE_PASSWORD"),
    appleTeamId: readEnv("APPLE_TEAM_ID"),
    signingIdentity: readEnv("APPLE_SIGNING_IDENTITY"),
  };
  const missing = [];

  if (!config.appleId) missing.push("APPLE_ID");
  if (!config.applePassword) missing.push("APPLE_PASSWORD");
  if (!config.appleTeamId) missing.push("APPLE_TEAM_ID");
  if (!config.signingIdentity) missing.push("APPLE_SIGNING_IDENTITY");

  if (missing.length > 0) {
    throw new Error(
      `macOS release build requires Apple signing/notarization env: ${missing.join(", ")}.`,
    );
  }

  return config;
}

async function withTemporaryTauriConfig(buildVersion, callback) {
  const config = {};

  if (buildVersion !== tauriConfig.version) {
    config.version = buildVersion;
  }

  if (releaseMode) {
    config.bundle = {
      createUpdaterArtifacts: true,
      ...(process.platform === "linux"
        ? { targets: ["deb", "appimage"] }
        : {}),
    };
  }

  if (Object.keys(config).length === 0) {
    await callback(undefined);
    return;
  }

  await fs.writeFile(tempConfigPath, JSON.stringify(config, null, 2));

  try {
    await callback(tempConfigPath);
  } finally {
    try {
      await fs.unlink(tempConfigPath);
    } catch {}
  }
}

async function buildTauri(configPath) {
  const args = ["tauri", "build"];

  if (process.platform === "linux") {
    if (configPath) {
      args.push("--config", configPath);
    }
  } else {
    args.push("--bundles", "app");
    if (configPath) {
      args.push("--config", configPath);
    }
  }

  await run("npx", args);
}

async function ensureMacosAppSignature(appPath) {
  if (releaseMode) {
    const config = requireMacosReleaseConfig();

    await run("codesign", [
      "--force",
      "--deep",
      "--options",
      "runtime",
      "--sign",
      config.signingIdentity,
      appPath,
    ]);

    const developerIdVerify = await runCapture("codesign", [
      "--verify",
      "--deep",
      "--strict",
      "--verbose=2",
      appPath,
    ]);

    if (developerIdVerify.code !== 0) {
      throw new Error(
        `macOS Developer ID app signature verification failed:\n${developerIdVerify.output.trim()}`,
      );
    }

    return;
  }

  const verify = await runCapture("codesign", [
    "--verify",
    "--deep",
    "--strict",
    "--verbose=2",
    appPath,
  ]);

  if (verify.code === 0) {
    return;
  }

  console.warn("[Tauri] macOS app signature incomplete; applying ad-hoc signature");
  await run("codesign", ["--force", "--deep", "--sign", "-", appPath]);

  const adHocVerify = await runCapture("codesign", [
    "--verify",
    "--deep",
    "--strict",
    "--verbose=2",
    appPath,
  ]);

  if (adHocVerify.code !== 0) {
    throw new Error(
      `macOS ad-hoc signature verification failed:\n${adHocVerify.output.trim()}`,
    );
  }
}

async function rebuildMacosUpdaterArchive(macosDir, appName) {
  if (!releaseMode) {
    return;
  }

  const updaterBundleName = `${appName}.tar.gz`;
  const updaterBundlePath = path.join(macosDir, updaterBundleName);
  const updaterSignaturePath = `${updaterBundlePath}.sig`;

  if (existsSync(updaterBundlePath)) {
    await fs.unlink(updaterBundlePath);
  }

  if (existsSync(updaterSignaturePath)) {
    await fs.unlink(updaterSignaturePath);
  }

  await run("tar", ["-czf", updaterBundleName, appName], { cwd: macosDir });
  await run("npx", ["tauri", "signer", "sign", updaterBundlePath]);
  await fs.access(updaterBundlePath);
  await fs.access(updaterSignaturePath);
}

async function verifyMacosDmg(dmgPath) {
  const verify = await runCapture("hdiutil", ["verify", dmgPath]);
  if (verify.code !== 0) {
    throw new Error(`DMG verification failed:\n${verify.output.trim()}`);
  }
}

async function signAndNotarizeDmg(dmgPath) {
  if (!releaseMode) {
    await verifyMacosDmg(dmgPath);
    return;
  }

  const config = requireMacosReleaseConfig();

  await run("codesign", [
    "--force",
    "--sign",
    config.signingIdentity,
    dmgPath,
  ]);

  const signature = await runCapture("codesign", [
    "--verify",
    "--verbose=2",
    dmgPath,
  ]);

  if (signature.code !== 0) {
    throw new Error(`DMG signature verification failed:\n${signature.output.trim()}`);
  }

  await run("xcrun", [
    "notarytool",
    "submit",
    dmgPath,
    "--apple-id",
    config.appleId,
    "--password",
    config.applePassword,
    "--team-id",
    config.appleTeamId,
    "--wait",
  ]);
  await run("xcrun", ["stapler", "staple", dmgPath]);

  const assess = await runCapture("spctl", [
    "--assess",
    "--type",
    "open",
    "--context",
    "context:primary-signature",
    "--verbose=4",
    dmgPath,
  ]);

  if (assess.code !== 0) {
    throw new Error(`DMG Gatekeeper assessment failed:\n${assess.output.trim()}`);
  }
}

async function buildDmg(buildVersion) {
  const productName = tauriConfig.productName;
  const version = buildVersion;
  const arch = resolveArch();
  const macosDir = path.join(rootDir, "src-tauri", "target", "release", "bundle", "macos");
  const dmgDir = path.join(rootDir, "src-tauri", "target", "release", "bundle", "dmg");
  const bundleScript = path.join(dmgDir, "bundle_dmg.sh");
  const iconPath = path.join(dmgDir, "icon.icns");
  const appName = `${productName}.app`;
  const appPath = path.join(macosDir, appName);
  const dmgName = `${productName}_${version}_${arch}.dmg`;
  const dmgPath = path.join(macosDir, dmgName);
  const tempDmgSuffix = `.${dmgName}`;

  for (const entry of await fs.readdir(macosDir)) {
    if (entry.startsWith("rw.") && entry.endsWith(tempDmgSuffix)) {
      await fs.unlink(path.join(macosDir, entry));
    }
  }

  if (existsSync(dmgPath)) {
    await fs.unlink(dmgPath);
  }

  if (!existsSync(appPath)) {
    throw new Error(`Missing macOS app bundle: ${appPath}`);
  }

  await ensureMacosAppSignature(appPath);
  await rebuildMacosUpdaterArchive(macosDir, appName);

  if (!existsSync(bundleScript)) {
    const stagingDir = path.join(macosDir, `.dmg-stage-${productName}-${version}-${arch}`);
    await fs.rm(stagingDir, { recursive: true, force: true });
    await fs.mkdir(stagingDir, { recursive: true });

    try {
      await run("ditto", [appPath, path.join(stagingDir, appName)]);
      await fs.symlink("/Applications", path.join(stagingDir, "Applications"));
      await run("hdiutil", [
        "create",
        "-volname",
        productName,
        "-srcfolder",
        stagingDir,
        "-ov",
        "-format",
        "UDZO",
        dmgPath,
      ]);
    } finally {
      await fs.rm(stagingDir, { recursive: true, force: true });
    }
  } else {
    await run(
      bundleScript,
      [
        "--skip-jenkins",
        "--volname",
        productName,
        "--icon",
        appName,
        "180",
        "170",
        "--app-drop-link",
        "480",
        "170",
        "--window-size",
        "660",
        "400",
        "--hide-extension",
        appName,
        "--volicon",
        iconPath,
        dmgName,
        appName,
      ],
      { cwd: macosDir },
    );

    for (const entry of await fs.readdir(macosDir)) {
      if (entry.startsWith("rw.") && entry.endsWith(tempDmgSuffix)) {
        await fs.unlink(path.join(macosDir, entry));
      }
    }
  }

  await signAndNotarizeDmg(dmgPath);
}

await run("npm", ["run", "skill"]);

const buildVersion = resolveBuildVersion();
process.env.BUILD_VERSION = buildVersion;
console.log(`[Tauri] desktop app version ${buildVersion}`);

if (releaseMode) {
  const signingKeySource = validateReleaseSigningEnv();
  console.log(`[Tauri] updater release build enabled via ${signingKeySource}`);

  if (process.platform === "darwin") {
    const macosReleaseConfig = requireMacosReleaseConfig();
    console.log(`[Tauri] macOS release signing identity ${macosReleaseConfig.signingIdentity}`);
  }

  await withTemporaryTauriConfig(buildVersion, async (configPath) => {
    await buildTauri(configPath);
  });
} else {
  await withTemporaryTauriConfig(buildVersion, async (configPath) => {
    await buildTauri(configPath);
  });
}

if (process.platform === "darwin") {
  await buildDmg(buildVersion);
}
