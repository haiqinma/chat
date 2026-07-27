import { getBuildConfig } from "../app/config/build";

describe("build config", () => {
  const originalBuildVersion = process.env.BUILD_VERSION;

  afterEach(() => {
    if (originalBuildVersion === undefined) {
      delete process.env.BUILD_VERSION;
    } else {
      process.env.BUILD_VERSION = originalBuildVersion;
    }
  });

  test("uses BUILD_VERSION when provided", () => {
    process.env.BUILD_VERSION = "v9.8.7";

    expect(getBuildConfig().version).toBe("v9.8.7");
  });
});
