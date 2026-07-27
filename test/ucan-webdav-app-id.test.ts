import { getWebdavAppId, getWebdavCapabilities } from "../app/plugins/ucan";

describe("webdav UCAN app id", () => {
  afterEach(() => {
    delete window.__CHAT_RUNTIME_CONFIG__;
  });

  test("uses configured webdav app id before deriving from location", () => {
    window.__CHAT_RUNTIME_CONFIG__ = {
      webdavAppId: "localhost:3020",
    } as any;

    expect(getWebdavAppId()).toBe("localhost-3020");
    expect(getWebdavCapabilities()).toEqual([
      {
        with: "app:all:localhost-3020",
        can: "write",
        resource: "app:all:localhost-3020",
        action: "write",
      },
    ]);
  });
});
