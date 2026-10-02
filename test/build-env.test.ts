import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

describe("build environment", () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = mkdtempSync(path.join(tmpdir(), "chat-build-env-"));
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  test("uses CI values before .env.build and isolates .env", () => {
    writeFileSync(
      path.join(rootDir, ".env.build"),
      "ROUTER_BACKEND_URL=https://build.example.com\nENABLE_TOOLS=1\n",
    );
    writeFileSync(
      path.join(rootDir, ".env"),
      "ROUTER_BACKEND_URL=https://web.example.com\nENABLE_TOOLS=0\nWEB_ONLY=value\n",
    );
    const loaderPath = path.resolve("scripts/build-env.mjs");
    const childEnv = { ...process.env };
    delete childEnv.ENABLE_TOOLS;
    delete childEnv.WEB_ONLY;
    childEnv.ROUTER_BACKEND_URL = "https://ci.example.com";
    const output = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `import { loadBuildEnvironment } from ${JSON.stringify(loaderPath)};
         loadBuildEnvironment(${JSON.stringify(rootDir)});
         console.log(JSON.stringify({
           router: process.env.ROUTER_BACKEND_URL,
           tools: process.env.ENABLE_TOOLS,
           webOnly: process.env.WEB_ONLY,
         }));`,
      ],
      {
        encoding: "utf8",
        env: childEnv,
      },
    );

    expect(JSON.parse(output)).toEqual({
      router: "https://ci.example.com",
      tools: "1",
      webOnly: "",
    });
  });

  test("keeps only build parameters for a standalone build", () => {
    writeFileSync(
      path.join(rootDir, ".env.build"),
      "DISABLE_CHUNK=1\nROUTER_BACKEND_URL=https://desktop.example.com\n",
    );
    writeFileSync(
      path.join(rootDir, ".env.template"),
      "ROUTER_BACKEND_URL=\nENABLE_TOOLS=0\n",
    );
    const loaderPath = path.resolve("scripts/build-env.mjs");
    const childEnv = { ...process.env };
    delete childEnv.DISABLE_CHUNK;
    childEnv.ROUTER_BACKEND_URL = "https://ci.example.com";
    childEnv.ENABLE_TOOLS = "1";
    const output = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `import { loadBuildEnvironment } from ${JSON.stringify(loaderPath)};
         loadBuildEnvironment(${JSON.stringify(rootDir)}, process.env, {
           includeArtifactDefaults: false,
         });
         console.log(JSON.stringify({
           chunk: process.env.DISABLE_CHUNK,
           router: process.env.ROUTER_BACKEND_URL,
           tools: process.env.ENABLE_TOOLS,
         }));`,
      ],
      { encoding: "utf8", env: childEnv },
    );

    expect(JSON.parse(output)).toEqual({
      chunk: "1",
      router: "",
      tools: "",
    });
  });

  test("keeps runtime and build templates in their declared boundaries", () => {
    const readKeys = (fileName: string) =>
      new Set(
        readFileSync(path.resolve(fileName), "utf8")
          .split(/\r?\n/)
          .map((line) => line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/)?.[1])
          .filter((key): key is string => Boolean(key)),
      );
    const runtimeKeys = readKeys(".env.template");
    const buildKeys = readKeys(".env.build.template");
    const buildOnlyKeys = new Set([
      "BUILD_VERSION",
      "DISABLE_CHUNK",
      "TAURI_SIGNING_PRIVATE_KEY",
      "TAURI_SIGNING_PRIVATE_KEY_PATH",
      "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
    ]);

    for (const key of buildOnlyKeys) {
      expect(runtimeKeys).not.toContain(key);
      expect(buildKeys).toContain(key);
    }
    for (const key of buildKeys) {
      if (!buildOnlyKeys.has(key)) {
        expect(runtimeKeys).toContain(key);
      }
    }
    expect(buildKeys).not.toContain("OPENAI_API_KEY");
    expect(buildKeys).not.toContain("CODE");
  });
});
