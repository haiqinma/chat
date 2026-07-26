import { promises as fs } from "node:fs";
import path from "node:path";
import tauriConfig from "../src-tauri/tauri.conf.json" with { type: "json" };

const rootDir = process.cwd();

function getArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

function requiredArg(name) {
  const value = getArg(name);
  if (!value) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return value;
}

function resolveArch() {
  switch (process.arch) {
    case "arm64":
      return { artifact: "aarch64", platform: "aarch64" };
    case "x64":
      return { artifact: "x64", platform: "x86_64" };
    default:
      return { artifact: process.arch, platform: process.arch };
  }
}

const repo = requiredArg("--repo");
const tag = requiredArg("--tag");
const notes = getArg("--notes") ?? "";
const pubDate = getArg("--pub-date") ?? new Date().toISOString();

const { artifact: artifactArch, platform: platformArch } = resolveArch();
const productName = tauriConfig.productName;
const normalizedTagVersion = tag.replace(/^v/, "");

if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(normalizedTagVersion)) {
  throw new Error(
    `Release tag ${tag} is not a valid app version. Expected v<major>.<minor>.<patch>.`,
  );
}

const version = normalizedTagVersion;
const bundleDir = path.join(rootDir, "src-tauri", "target", "release", "bundle", "macos");
const updaterBundleName = `${productName}.app.tar.gz`;
const updaterSignatureName = `${updaterBundleName}.sig`;
const updaterBundlePath = path.join(bundleDir, updaterBundleName);
const updaterSignaturePath = path.join(bundleDir, updaterSignatureName);
const outputPath = path.join(bundleDir, "latest.json");

await fs.access(updaterBundlePath);
const signature = (await fs.readFile(updaterSignaturePath, "utf8")).trim();

const manifest = {
  version,
  notes,
  pub_date: pubDate,
  platforms: {
    [`darwin-${platformArch}`]: {
      signature,
      url: `https://github.com/${repo}/releases/download/${tag}/${productName}.app.tar.gz`,
    },
  },
};

await fs.writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`[Updater] wrote ${path.relative(rootDir, outputPath)} for ${productName} ${version} (${artifactArch})`);
