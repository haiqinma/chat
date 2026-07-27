// Learn more: https://github.com/testing-library/jest-dom
import "@testing-library/jest-dom";
import { TextDecoder, TextEncoder } from "node:util";

Object.assign(globalThis, {
  TextEncoder,
  TextDecoder,
});

for (const listener of process.listeners("unhandledRejection")) {
  process.removeListener("unhandledRejection", listener);
}

process.on("unhandledRejection", (reason) => {
  throw reason instanceof Error ? reason : new Error(String(reason));
});

global.fetch = (() => {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve([]),
    headers: new Headers(),
    redirected: false,
    statusText: "OK",
    type: "basic",
    url: "",
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    text: () => Promise.resolve(""),
  } as Response);
}) as typeof fetch;
