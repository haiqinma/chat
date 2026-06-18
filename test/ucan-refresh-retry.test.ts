import { jest } from "@jest/globals";
import { authUcanFetch } from "@yeying-community/web3-bs";

class TestResponse {
  readonly ok: boolean;
  readonly statusText: string;

  constructor(
    private readonly bodyText: string,
    readonly init: { status: number; headers?: Record<string, string> },
  ) {
    this.ok = init.status >= 200 && init.status < 300;
    this.statusText = this.ok ? "OK" : "Unauthorized";
  }

  get status() {
    return this.init.status;
  }

  async text() {
    return this.bodyText;
  }

  async json() {
    return JSON.parse(this.bodyText);
  }

  clone() {
    return new TestResponse(this.bodyText, this.init);
  }
}

describe("UCAN refresh retry integration", () => {
  it("refreshes invocation token and retries once after UCAN expired", async () => {
    const authHeaders: string[] = [];
    let signatureCount = 0;
    const issuer = {
      id: "chat-test-session",
      did: "did:key:zChatTestIssuer",
      createdAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      signer: async () => `chat-test-signature-${++signatureCount}`,
    };

    const fetcher = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const authorization = new Headers(init?.headers).get("authorization") || "";
      authHeaders.push(authorization);

      if (authHeaders.length === 1) {
        return new TestResponse(
          JSON.stringify({
            error: {
              message: "UCAN expired (trace id: chat-test)",
              code: "UCAN_EXPIRED",
            },
          }),
          {
            status: 401,
            headers: { "content-type": "application/json" },
          },
        );
      }

      return new TestResponse(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const response = await authUcanFetch(
      "https://router.example.test/v1/responses",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "test-model", input: "hello" }),
      },
      {
        fetcher,
        issuer,
        audience: "did:web:router.example.test",
        capabilities: [{ with: "app:all:chat-test", can: "invoke" }],
        proofs: ["root-proof"],
      },
    );

    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(authHeaders).toHaveLength(2);
    expect(authHeaders[0]).toMatch(/^Bearer /);
    expect(authHeaders[1]).toMatch(/^Bearer /);
    expect(authHeaders[1]).not.toBe(authHeaders[0]);
    expect(signatureCount).toBe(2);
  });
});
