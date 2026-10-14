// using tauri command to send request
// see src-tauri/src/stream.rs, and src-tauri/src/main.rs
// 1. invoke('stream_fetch', {url, method, headers, body}), get response with headers.
// 2. listen event: `stream-response` multi times to get body
import { isDesktopAppRuntime, tauriInvoke, tauriListen } from "../tauri";

type ResponseEvent = {
  request_id: number;
  status?: number;
  chunk?: number[];
};

type StreamResponse = {
  request_id: number;
  status: number;
  status_text: string;
  headers: Record<string, string>;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "Tauri request failed";
}

function createErrorResponse(error: unknown) {
  return new Response(getErrorMessage(error), {
    status: 599,
    statusText: "Tauri request failed",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export function fetch(url: string, options?: RequestInit): Promise<Response> {
  if (isDesktopAppRuntime()) return fetchFromTauri(url, options);
  return window.fetch(url, options);
}

async function fetchFromTauri(
  url: string,
  options?: RequestInit,
): Promise<Response> {
  const {
    signal,
    method = "GET",
    headers: requestHeaders = {},
    body = [],
  } = options || {};
  if (signal?.aborted) {
    return createErrorResponse(new Error("The request was aborted"));
  }

  let unlisten: (() => void) | undefined;
  let resolveRequestId: ((requestId: number) => void) | undefined;
  const requestIdPromise = new Promise<number>((resolve) => {
    resolveRequestId = resolve;
  });
  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    unlisten?.();
    void writer.ready
      .then(() => writer.close())
      .catch((error) => console.error("stream close error", error));
  };

  if (signal) {
    signal.addEventListener("abort", close, { once: true });
  }

  try {
    // Register before invoking Rust. The command starts emitting chunks as
    // soon as the response headers arrive, so registering afterward can lose
    // the response on fast connections.
    unlisten = await tauriListen<ResponseEvent>("stream-response", (event) => {
      void requestIdPromise.then((requestId) => {
        const {
          request_id: responseRequestId,
          chunk,
          status,
        } = event.payload || {};
        if (requestId !== responseRequestId || closed) return;
        if (chunk) {
          void writer.ready
            .then(() => writer.write(new Uint8Array(chunk)))
            .catch((error) => console.error("stream write error", error));
        } else if (status === 0) {
          close();
        }
      });
    });

    const headers: Record<string, string> = {
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
      "User-Agent": navigator.userAgent,
    };
    for (const item of new Headers(requestHeaders || {})) {
      headers[item[0]] = item[1];
    }

    const result = await tauriInvoke<StreamResponse>("stream_fetch", {
      method: method.toUpperCase(),
      url,
      headers,
      // TODO FormData
      body:
        typeof body === "string"
          ? Array.from(new TextEncoder().encode(body))
          : [],
    });
    resolveRequestId?.(result.request_id);
    // Fetch forbids a body for 204/205/304 responses. Rust still emits the
    // completion event, but expose these responses with a null body so a
    // successful WebDAV DELETE is not reported as a 599 transport failure.
    const responseBody =
      result.status === 204 || result.status === 205 || result.status === 304
        ? null
        : stream.readable;
    if (!responseBody) close();
    return new Response(responseBody, {
      status: result.status,
      statusText: result.status_text,
      headers: result.headers,
    });
  } catch (error) {
    console.error("stream error", error);
    close();
    return createErrorResponse(error);
  }
}
