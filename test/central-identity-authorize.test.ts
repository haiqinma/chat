import { jest } from "@jest/globals";
import {
  applyCentralAuthorizeExchange,
  createCentralAuthorizeRequest,
  exchangeCentralAuthorizeCode,
  getCentralIdentityDid,
  getCentralWalletAddress,
  isCentralUcanAuthorized,
} from "../app/plugins/central-ucan";

class TestResponse {
  readonly ok = true;
  readonly status = 200;

  constructor(private readonly payload: unknown) {}

  async text() {
    return JSON.stringify(this.payload);
  }
}

describe("central wallet identity authorization", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
    delete window.__CHAT_RUNTIME_CONFIG__;
  });

  test("creates identity authorize request without address subject", async () => {
    window.__CHAT_RUNTIME_CONFIG__ = {
      centralUcanAuthBaseUrl: "https://node.example",
      centralUcanAppId: "chat",
    } as any;

    const fetchMock = jest.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body || "{}"));
        expect(body).toEqual({
          appId: "chat",
          redirectUri: "https://chat.example/callback",
          state: "state-1",
          codeChallenge: "challenge-1",
          codeChallengeMethod: "S256",
          scopes: ["identity.basic", "identity.wallet", "identity.username"],
        });
        expect(body.address).toBeUndefined();
        return new TestResponse({
          code: 0,
          message: "ok",
          data: {
            requestId: "iar_1",
            status: "pending",
            appId: "chat",
            redirectUri: "https://chat.example/callback",
            state: "state-1",
            audience: "https://chat.example",
            scopes: ["identity.basic", "identity.wallet", "identity.username"],
            expiresAt: "2026-08-24T00:00:00.000Z",
            verifyUrl:
              "https://node.example/identity/authorize?requestId=iar_1",
          },
          timestamp: Date.now(),
        }) as unknown as Response;
      },
    ) as unknown as typeof fetch;
    jest.spyOn(globalThis, "fetch").mockImplementation(fetchMock);

    const result = await createCentralAuthorizeRequest({
      appId: "chat",
      redirectUri: "https://chat.example/callback",
      state: "state-1",
      codeChallenge: "challenge-1",
      scopes: ["identity.basic", "identity.wallet", "identity.username"],
    });

    expect(result.requestId).toBe("iar_1");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://node.example/api/v1/public/identity/authorize/request",
      expect.any(Object),
    );
  });

  test("exchanges identity code with PKCE and stores DID result", async () => {
    window.__CHAT_RUNTIME_CONFIG__ = {
      centralUcanAuthBaseUrl: "https://node.example",
      centralUcanAppId: "chat",
    } as any;

    const fetchMock = jest.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        expect(JSON.parse(String(init?.body || "{}"))).toEqual({
          code: "iac_1",
          appId: "chat",
          redirectUri: "https://chat.example/callback",
          codeVerifier: "verifier-1",
        });
        return new TestResponse({
          code: 0,
          message: "ok",
          data: {
            requestId: "iar_1",
            appId: "chat",
            redirectUri: "https://chat.example/callback",
            did: "did:yeying:wid_1234567890abcdefghijklmn",
            walletAddress: "0x1111111111111111111111111111111111111111",
            scopes: ["identity.basic", "identity.wallet", "identity.username"],
            credentials: [],
          },
          timestamp: Date.now(),
        }) as unknown as Response;
      },
    ) as unknown as typeof fetch;
    jest.spyOn(globalThis, "fetch").mockImplementation(fetchMock);

    const result = await exchangeCentralAuthorizeCode({
      code: "iac_1",
      appId: "chat",
      redirectUri: "https://chat.example/callback",
      codeVerifier: "verifier-1",
    });
    applyCentralAuthorizeExchange(result);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://node.example/api/v1/public/identity/authorize/exchange",
      expect.any(Object),
    );
    expect(getCentralIdentityDid()).toBe(
      "did:yeying:wid_1234567890abcdefghijklmn",
    );
    expect(getCentralWalletAddress()).toBe(
      "0x1111111111111111111111111111111111111111",
    );
    expect(localStorage.getItem("currentIdentityDid")).toBe(
      "did:yeying:wid_1234567890abcdefghijklmn",
    );
    expect(localStorage.getItem("currentAccount")).toBe(
      "0x1111111111111111111111111111111111111111",
    );
    expect(localStorage.getItem("centralAuthSubject")).toBeNull();
    expect(isCentralUcanAuthorized()).toBe(true);
  });
});
