import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const rootDir = process.cwd();
const appDir = path.join(rootDir, "app");
const disabledSuffix = ".export-disabled";
const toolActionsPath = path.join(appDir, "tools", "actions.ts");
const toolActionsExportPath = path.join(appDir, "tools", "actions.export.ts");

async function findRouteFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return findRouteFiles(fullPath);
      }
      if (entry.isFile() && entry.name === "route.ts") {
        return [fullPath];
      }
      return [];
    }),
  );

  return files.flat();
}

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env,
      stdio: "inherit",
      shell: process.platform === "win32",
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

async function disableRoutes(routeFiles) {
  const renamed = [];
  for (const file of routeFiles) {
    const disabledPath = `${file}${disabledSuffix}`;
    await fs.rename(file, disabledPath);
    renamed.push([disabledPath, file]);
  }
  return renamed;
}

async function restoreRoutes(renamedFiles) {
  await Promise.all(
    renamedFiles.map(async ([from, to]) => {
      try {
        await fs.rename(from, to);
      } catch {}
    }),
  );
}

async function swapToolActions() {
  const backupPath = `${toolActionsPath}${disabledSuffix}`;
  await fs.rename(toolActionsPath, backupPath);
  await fs.copyFile(toolActionsExportPath, toolActionsPath);

  return async () => {
    try {
      await fs.unlink(toolActionsPath);
    } catch {}
    try {
      await fs.rename(backupPath, toolActionsPath);
    } catch {}
  };
}

const routeFiles = await findRouteFiles(appDir);
const renamedFiles = await disableRoutes(routeFiles);
const restoreToolActions = await swapToolActions();

try {
  await run("npm", ["run", "skill"]);
  await run(
    "npx",
    ["cross-env", "BUILD_MODE=export", "BUILD_APP=1", "next", "build", "--webpack"],
    { ...process.env, BUILD_MODE: "export", BUILD_APP: "1" },
  );
} finally {
  await restoreToolActions();
  await restoreRoutes(renamedFiles);
}
