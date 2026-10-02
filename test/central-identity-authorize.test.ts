import { jest } from "@jest/globals";
import {
  approveCentralAuthorizePresentation,
  applyCentralAuthorizeExchange,
  createCentralAuthorizeRequest,
  exchangeCentralAuthorizeCode,
  getCentralIdentityDid,
  getCentralIdentityOwner,
  getCentralWalletAddress,
  getCentralUcanAuthorizationHeaderForAudience,
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
      chatApplicationUid: "chat",
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
      chatApplicationUid: "chat",
    } as any;

    const fetchMock = jest.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        expect(JSON.parse(String(init?.body || "{}"))).toEqual({
          code: "iac_1",
          appId: "chat",
          redirectUri: "https://chat.example/callback",
          codeVerifier: "verifier-1",
          issueUcanSession: true,
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
            ucanSession: {
              sessionToken: "identity-session-1",
              issuerDid: "did:key:zIdentityIssuer",
              issuedAt: Date.now(),
              expiresAt: Date.now() + 15 * 60 * 1000,
            },
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
    expect(localStorage.getItem("centralIssueSessionToken")).toBe(
      "identity-session-1",
    );
    expect(isCentralUcanAuthorized()).toBe(true);
  });

  test("uses the identity DID as the owner when exchange has no wallet address", () => {
    window.__CHAT_RUNTIME_CONFIG__ = {
      centralUcanAuthBaseUrl: "https://node.example",
      chatApplicationUid: "chat",
    } as any;
    localStorage.setItem("currentAccount", "0xold");

    applyCentralAuthorizeExchange({
      requestId: "iar_2",
      appId: "chat",
      redirectUri: "https://chat.example/callback",
      did: "did:yeying:wid_did_only",
      scopes: ["identity.basic"],
      credentials: [],
      ucanSession: {
        sessionToken: "identity-session-2",
        expiresAt: Date.now() + 60_000,
      },
    });

    expect(getCentralIdentityOwner()).toBe("did:yeying:wid_did_only");
    expect(localStorage.getItem("currentAccount")).toBeNull();
    expect(isCentralUcanAuthorized()).toBe(true);
  });

  test("renews an expired issue session with the identity refresh token", async () => {
    window.__CHAT_RUNTIME_CONFIG__ = {
      centralUcanAuthBaseUrl: "https://node.example",
      chatApplicationUid: "chat",
      centralUcanRedirectUri: "chat://localhost/central-ucan-callback.html",
    } as any;
    localStorage.setItem("ucanAuthMode", "central");
    localStorage.setItem("centralIdentityDid", "did:yeying:wid_refresh_test");
    localStorage.setItem("currentIdentityDid", "did:yeying:wid_refresh_test");
    localStorage.setItem("centralIdentityRefreshToken", "refresh-old");
    localStorage.setItem(
      "centralIdentityRefreshExpiresAt",
      String(Date.now() + 24 * 60 * 60 * 1000),
    );
    localStorage.setItem("centralIssueSessionToken", "expired-session");
    localStorage.setItem(
      "centralIssueSessionExpiresAt",
      String(Date.now() - 1000),
    );

    const now = Math.floor(Date.now() / 1000);
    const toBase64Url = (value: unknown) =>
      btoa(JSON.stringify(value))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
    const token = `${toBase64Url({ alg: "EdDSA", typ: "UCAN" })}.${toBase64Url({ aud: "did:web:warehouse.example", exp: now + 600, nbf: now - 1, cap: [{ with: "app:all:chat", can: "write" }] })}.signature`;
    const fetchMock = jest.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        const urlText = String(url);
        const body = JSON.parse(String(init?.body || "{}"));
        if (urlText.endsWith("/identity/session/refresh")) {
          expect(body).toEqual({
            refreshToken: "refresh-old",
            appId: "chat",
            redirectUri: "chat://localhost/central-ucan-callback.html",
          });
          return new TestResponse({
            code: 0,
            message: "ok",
            data: {
              did: "did:yeying:wid_refresh_test",
              walletAddress: "0x1111111111111111111111111111111111111111",
              refreshToken: "refresh-new",
              refreshExpiresAt: Date.now() + 24 * 60 * 60 * 1000,
              ucanSession: {
                sessionToken: "renewed-session",
                issuerDid: "did:key:zIdentityIssuer",
                issuedAt: Date.now(),
                expiresAt: Date.now() + 5 * 60 * 1000,
              },
            },
            timestamp: Date.now(),
          }) as unknown as Response;
        }
        expect(urlText).toContain("/api/v1/public/auth/central/issue");
        expect(
          String(
            init?.headers &&
              (init.headers as Record<string, string>).Authorization,
          ),
        ).toBe("Bearer renewed-session");
        return new TestResponse({
          code: 0,
          message: "ok",
          data: {
            ucan: token,
            audience: "did:web:warehouse.example",
            capabilities: [{ with: "app:all:chat", can: "write" }],
            expiresAt: (now + 600) * 1000,
            notBefore: (now - 1) * 1000,
          },
          timestamp: Date.now(),
        }) as unknown as Response;
      },
    ) as unknown as typeof fetch;
    jest.spyOn(globalThis, "fetch").mockImplementation(fetchMock);

    await expect(
      getCentralUcanAuthorizationHeaderForAudience({
        audience: "did:web:warehouse.example",
        capabilities: [{ with: "app:all:chat", can: "write" }],
      }),
    ).resolves.toBe(`Bearer ${token}`);
    expect(localStorage.getItem("centralIssueSessionToken")).toBe(
      "renewed-session",
    );
    expect(localStorage.getItem("centralIdentityRefreshToken")).toBe(
      "refresh-new",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("uses the exchange UCAN session to issue audience-specific tokens", async () => {
    window.__CHAT_RUNTIME_CONFIG__ = {
      centralUcanAuthBaseUrl: "https://node.example",
      chatApplicationUid: "chat",
    } as any;
    localStorage.setItem("ucanAuthMode", "central");
    localStorage.setItem("centralIdentityDid", "did:yeying:wid_sync");
    localStorage.setItem("currentIdentityDid", "did:yeying:wid_sync");
    localStorage.setItem("centralIssueSessionToken", "exchange-session");
    localStorage.setItem(
      "centralIssueSessionExpiresAt",
      String(Date.now() + 60_000),
    );

    const now = Math.floor(Date.now() / 1000);
    const toBase64Url = (value: unknown) =>
      btoa(JSON.stringify(value))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
    const token = `${toBase64Url({ alg: "EdDSA", typ: "UCAN" })}.${toBase64Url({ aud: "did:web:warehouse.example", exp: now + 600, nbf: now - 1, cap: [{ with: "app:all:chat", can: "write" }] })}.signature`;
    const fetchMock = jest.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        expect(
          String(
            init?.headers &&
              (init.headers as Record<string, string>).Authorization,
          ),
        ).toBe("Bearer exchange-session");
        expect(JSON.parse(String(init?.body || "{}"))).toMatchObject({
          audience: "did:web:warehouse.example",
        });
        return new TestResponse({
          code: 0,
          message: "ok",
          data: {
            ucan: token,
            audience: "did:web:warehouse.example",
            capabilities: [{ with: "app:all:chat", can: "write" }],
            expiresAt: (now + 600) * 1000,
            notBefore: (now - 1) * 1000,
          },
          timestamp: Date.now(),
        }) as unknown as Response;
      },
    ) as unknown as typeof fetch;
    jest.spyOn(globalThis, "fetch").mockImplementation(fetchMock);

    await expect(
      getCentralUcanAuthorizationHeaderForAudience({
        audience: "did:web:warehouse.example",
        capabilities: [{ with: "app:all:chat", can: "write" }],
      }),
    ).resolves.toBe(`Bearer ${token}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://node.example/api/v1/public/auth/central/issue",
      expect.any(Object),
    );
  });

  test("approves an authorization request with a wallet identity presentation", async () => {
    window.__CHAT_RUNTIME_CONFIG__ = {
      centralUcanAuthBaseUrl: "https://node.example",
      chatApplicationUid: "chat",
    } as any;
    const presentation = {
      version: 1,
      holder: "did:yeying:wid_1234567890abcdefghijklmn",
    };
    const fetchMock = jest.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        expect(JSON.parse(String(init?.body || "{}"))).toEqual({
          requestId: "iar_1",
          presentation,
        });
        return new TestResponse({
          code: 0,
          message: "ok",
          data: {
            requestId: "iar_1",
            did: presentation.holder,
            authorizationCode: "iac_1",
            authorizationCodeExpiresAt: "2026-08-24T00:00:00.000Z",
            redirectTo: "https://chat.example/callback?code=iac_1",
          },
          timestamp: Date.now(),
        }) as unknown as Response;
      },
    ) as unknown as typeof fetch;
    jest.spyOn(globalThis, "fetch").mockImplementation(fetchMock);

    const result = await approveCentralAuthorizePresentation({
      requestId: "iar_1",
      presentation,
    });

    expect(result.authorizationCode).toBe("iac_1");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://node.example/api/v1/public/identity/authorize/approve",
      expect.any(Object),
    );
  });
});
