import {
  CACHE_URL_PREFIX,
  UPLOAD_URL,
  REQUEST_TIMEOUT_MS,
} from "@/app/constant";
import { MultimodalContent, RequestMessage } from "@/app/client/api";
import Locale from "@/app/locales";
import { getTimeoutMSByModel } from "@/app/utils";
import {
  EventStreamContentType,
  fetchEventSource,
} from "@fortaine/fetch-event-source";
import { prettyObject } from "./format";
import { fetch as tauriFetch } from "./stream";
import { uploadFileToWebDavAndCreateShareLink } from "./cloud/webdav";
import { useSyncStore } from "../store/sync";

export function compressImage(file: Blob, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (readerEvent: any) => {
      const image = new Image();
      image.onload = () => {
        let canvas = document.createElement("canvas");
        let ctx = canvas.getContext("2d");
        let width = image.width;
        let height = image.height;
        let quality = 0.9;
        let dataUrl;

        do {
          canvas.width = width;
          canvas.height = height;
          ctx?.clearRect(0, 0, canvas.width, canvas.height);
          ctx?.drawImage(image, 0, 0, width, height);
          dataUrl = canvas.toDataURL("image/jpeg", quality);

          if (dataUrl.length < maxSize) break;

          if (quality > 0.5) {
            // Prioritize quality reduction
            quality -= 0.1;
          } else {
            // Then reduce the size
            width *= 0.9;
            height *= 0.9;
          }
        } while (dataUrl.length > maxSize);

        resolve(dataUrl);
      };
      image.onerror = reject;
      image.src = readerEvent.target.result;
    };
    reader.onerror = reject;

    if (file.type.includes("heic")) {
      try {
        const heic2any = require("heic2any");
        heic2any({ blob: file, toType: "image/jpeg" })
          .then((blob: Blob) => {
            reader.readAsDataURL(blob);
          })
          .catch((e: any) => {
            reject(e);
          });
      } catch (e) {
        reject(e);
      }
    }

    reader.readAsDataURL(file);
  });
}

export async function preProcessImageContentBase(
  content: RequestMessage["content"],
  transformImageUrl: (
    url: string,
    detail?: string,
  ) => Promise<{ [key: string]: any }>,
) {
  if (typeof content === "string") {
    return content;
  }
  const result = [];
  for (const part of content) {
    if (part?.type == "image_url" && part?.image_url?.url) {
      try {
        const url = await cacheImageToBase64Image(part?.image_url?.url);
        const detail =
          typeof part.image_url?.detail === "string"
            ? part.image_url.detail
            : undefined;
        result.push(await transformImageUrl(url, detail));
      } catch (error) {
        console.error("Error processing image URL:", error);
      }
    } else {
      result.push({ ...part });
    }
  }
  return result;
}

export async function preProcessImageContent(
  content: RequestMessage["content"],
) {
  return preProcessImageContentBase(content, async (url, detail) => ({
    type: "image_url",
    image_url: {
      url,
      ...(detail ? { detail } : {}),
    },
  })) as Promise<MultimodalContent[] | string>;
}

export async function preProcessImageContentForAlibabaDashScope(
  content: RequestMessage["content"],
) {
  return preProcessImageContentBase(content, async (url) => ({
    image: url,
  }));
}

const imageCaches: Record<string, string> = {};
export function cacheImageToBase64Image(imageUrl: string) {
  if (imageUrl.includes(CACHE_URL_PREFIX)) {
    if (!imageCaches[imageUrl]) {
      const reader = new FileReader();
      return fetch(imageUrl, {
        method: "GET",
        mode: "cors",
        credentials: "include",
      })
        .then((res) => res.blob())
        .then(
          async (blob) =>
            (imageCaches[imageUrl] = await compressImage(blob, 256 * 1024)),
        ); // compressImage
    }
    return Promise.resolve(imageCaches[imageUrl]);
  }
  return Promise.resolve(imageUrl);
}

export function base64Image2Blob(base64Data: string, contentType: string) {
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: contentType });
}

function blobToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("read file as Data URL failed"));
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("read file as Data URL failed"));
    reader.readAsDataURL(file);
  });
}

function uploadImageFallback(file: Blob): Promise<string> {
  if (file.type.startsWith("image/")) {
    return compressImage(file, 256 * 1024);
  }
  return blobToDataUrl(file);
}

function isServiceWorkerReadyForCacheUpload() {
  const swEnabled = typeof window !== "undefined" && !!window._SW_ENABLED;
  const swControlled =
    typeof navigator !== "undefined" && !!navigator.serviceWorker?.controller;
  return swEnabled && swControlled;
}

export function uploadImage(file: Blob): Promise<string> {
  const swReady = isServiceWorkerReadyForCacheUpload();
  console.log(
    "[Upload] cache route state",
    JSON.stringify({
      swEnabled: typeof window !== "undefined" ? !!window._SW_ENABLED : false,
      swControlled:
        typeof navigator !== "undefined" &&
        !!navigator.serviceWorker?.controller,
      swReady,
      mime: file.type || "unknown",
    }),
  );

  if (!swReady) {
    // ServiceWorker is not controlling current page, fallback to inline data URL.
    return uploadImageFallback(file);
  }
  const body = new FormData();
  body.append("file", file);
  return fetch(UPLOAD_URL, {
    method: "post",
    body,
    mode: "cors",
    credentials: "include",
  })
    .then((res) => res.json())
    .then((res) => {
      // console.log("res", res);
      if (res?.code == 0 && res?.data) {
        return res?.data;
      }
      throw Error(`upload Error: ${res?.msg}`);
    })
    .catch((error) => {
      console.warn(
        "[Upload] cache upload failed, fallback to inline data URL",
        error,
      );
      return uploadImageFallback(file);
    });
}

export function removeImage(imageUrl: string) {
  return fetch(imageUrl, {
    method: "DELETE",
    mode: "cors",
    credentials: "include",
  });
}

export async function uploadGeneratedImageAndGetStableUrl(
  file: Blob,
  fileName?: string,
): Promise<string> {
  try {
    const syncStore = useSyncStore.getState();
    const uploaded = await uploadFileToWebDavAndCreateShareLink({
      store: syncStore,
      file,
      fileName: fileName || `generated-${Date.now()}.png`,
      expiresValue: 0,
      expiresUnit: "day",
    });
    if (uploaded.url) {
      return uploaded.url;
    }
  } catch (error) {
    console.warn(
      "[Upload] upload generated image to WebDAV failed, fallback to local cache",
      error,
    );
  }

  return await uploadImage(file);
}

export async function uploadAttachmentForChat(
  file: File,
): Promise<MultimodalContent> {
  const mimeType = (file.type || "").trim().toLowerCase();
  const isImage = mimeType.startsWith("image/");
  const isPdf =
    mimeType === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  if (!isImage && !isPdf) {
    throw new Error("仅支持上传图片或 PDF 文件");
  }

  const syncStore = useSyncStore.getState();
  const uploaded = await uploadFileToWebDavAndCreateShareLink({
    store: syncStore,
    file,
    fileName: file.name || (isPdf ? "attachment.pdf" : "attachment"),
    expiresValue: 0,
    expiresUnit: "day",
  });

  if (isImage) {
    return {
      type: "image_url",
      image_url: {
        url: uploaded.url,
        detail: "low",
      },
    };
  }

  return {
    type: "file_url",
    file_url: {
      url: uploaded.url,
      name: uploaded.fileName,
      mime_type: uploaded.mimeType,
    },
  };
}

function normalizeStreamError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error(String(error));
  }
}

function resolveStreamTimeoutMS(requestPayload: any): number {
  const model = String(requestPayload?.model ?? "").trim();
  if (!model) return REQUEST_TIMEOUT_MS;
  return getTimeoutMSByModel(model);
}

function buildStreamTimeoutError(timeoutMS: number): Error {
  return new Error(
    `request timed out after ${Math.round(
      timeoutMS / 1000,
    )}s while waiting for server response`,
  );
}

async function refreshHeadersForUnauthorized(
  options: any,
  res: Response,
  extraInfo: string,
) {
  const refreshHeaders = options?.getRefreshedHeaders;
  if (res.status !== 401 || typeof refreshHeaders !== "function") {
    return null;
  }
  return await refreshHeaders({ response: res, bodyText: extraInfo });
}

export function stream(
  chatPath: string,
  requestPayload: any,
  headers: any,
  tools: any[],
  funcs: Record<string, Function>,
  controller: AbortController,
  parseSSE: (text: string, runTools: any[]) => string | undefined,
  processToolMessage: (
    requestPayload: any,
    toolCallMessage: any,
    toolCallResult: any[],
  ) => void,
  options: any,
) {
  let responseText = "";
  let remainText = "";
  let finished = false;
  let hasStreamError = false;
  let running = false;
  let runTools: any[] = [];
  let responseRes: Response;
  let unauthorizedRetryCount = 0;
  const streamTimeoutMS = resolveStreamTimeoutMS(requestPayload);
  const reportError = (error: unknown) => {
    if (hasStreamError) return;
    hasStreamError = true;
    options?.onError?.(normalizeStreamError(error));
  };

  // animate response to make it looks smooth
  function animateResponseText() {
    if (finished || controller.signal.aborted) {
      responseText += remainText;
      console.log("[Response Animation] finished");
      if (responseText?.length === 0 && !hasStreamError) {
        reportError(new Error("empty response from server"));
      }
      return;
    }

    if (remainText.length > 0) {
      const fetchCount = Math.max(1, Math.round(remainText.length / 60));
      const fetchText = remainText.slice(0, fetchCount);
      responseText += fetchText;
      remainText = remainText.slice(fetchCount);
      options.onUpdate?.(responseText, fetchText);
    }

    requestAnimationFrame(animateResponseText);
  }

  // start animaion
  animateResponseText();

  const finish = () => {
    if (!finished) {
      if (!running && runTools.length > 0) {
        const toolCallMessage = {
          role: "assistant",
          tool_calls: [...runTools],
        };
        running = true;
        runTools.splice(0, runTools.length); // empty runTools
        return Promise.all(
          toolCallMessage.tool_calls.map((tool) => {
            options?.onBeforeTool?.(tool);
            const toolName = tool?.function?.name;
            const toolFn =
              typeof toolName === "string" && toolName
                ? funcs[toolName]
                : undefined;
            if (typeof toolFn !== "function") {
              return Promise.resolve(
                Promise.reject(
                  new Error(
                    `tool function not found: ${String(toolName || "(empty)")}`,
                  ),
                ),
              )
                .catch((e) => {
                  options?.onAfterTool?.({
                    ...tool,
                    isError: true,
                    errorMsg: e.toString(),
                  });
                  return e.toString();
                })
                .then((content) => ({
                  name: toolName,
                  role: "tool",
                  content,
                  tool_call_id: tool.id,
                }));
            }
            return Promise.resolve(
              toolFn(
                // @ts-ignore
                tool?.function?.arguments
                  ? JSON.parse(tool?.function?.arguments)
                  : {},
              ),
            )
              .then((res) => {
                let content = res.data || res?.statusText;
                // hotfix #5614
                content =
                  typeof content === "string"
                    ? content
                    : JSON.stringify(content);
                if (res.status >= 300) {
                  return Promise.reject(content);
                }
                return content;
              })
              .then((content) => {
                options?.onAfterTool?.({
                  ...tool,
                  content,
                  isError: false,
                });
                return content;
              })
              .catch((e) => {
                options?.onAfterTool?.({
                  ...tool,
                  isError: true,
                  errorMsg: e.toString(),
                });
                return e.toString();
              })
              .then((content) => ({
                name: tool.function.name,
                role: "tool",
                content,
                tool_call_id: tool.id,
              }));
          }),
        )
          .then((toolCallResult) => {
            processToolMessage(requestPayload, toolCallMessage, toolCallResult);
            setTimeout(() => {
              // call again
              console.debug("[ChatAPI] restart");
              running = false;
              chatApi(chatPath, headers, requestPayload, tools); // call fetchEventSource
            }, 60);
          })
          .catch((error) => {
            running = false;
            reportError(error);
            finish();
          });
        return;
      }
      if (running) {
        return;
      }
      console.debug("[ChatAPI] end");
      finished = true;
      options.onFinish(responseText + remainText, responseRes); // 将res传递给onFinish
    }
  };

  controller.signal.onabort = finish;

  function chatApi(
    chatPath: string,
    headers: any,
    requestPayload: any,
    tools: any,
  ) {
    const chatPayload = {
      method: "POST",
      body: JSON.stringify({
        ...requestPayload,
        tools: tools && tools.length ? tools : undefined,
      }),
      signal: controller.signal,
      headers,
    };
    let timeoutTriggered = false;
    const requestTimeoutId = setTimeout(() => {
      timeoutTriggered = true;
      reportError(buildStreamTimeoutError(streamTimeoutMS));
      controller.abort();
    }, streamTimeoutMS);
    void fetchEventSource(chatPath, {
      fetch: tauriFetch as any,
      ...chatPayload,
      async onopen(res) {
        clearTimeout(requestTimeoutId);
        const contentType = res.headers.get("content-type");
        console.log("[Request] response content type: ", contentType);
        responseRes = res;

        if (contentType?.startsWith("text/plain")) {
          responseText = await res.clone().text();
          return finish();
        }

        if (
          !res.ok ||
          !res.headers
            .get("content-type")
            ?.startsWith(EventStreamContentType) ||
          res.status !== 200
        ) {
          const responseTexts = [responseText];
          let extraInfo = await res.clone().text();
          try {
            const resJson = await res.clone().json();
            extraInfo = prettyObject(resJson);
          } catch {}

          if (unauthorizedRetryCount < 1) {
            const refreshedHeaders = await refreshHeadersForUnauthorized(
              options,
              res,
              extraInfo,
            ).catch((error) => {
              console.warn("[UCAN] failed to refresh stream headers", error);
              return null;
            });
            if (refreshedHeaders) {
              unauthorizedRetryCount += 1;
              console.warn("[UCAN] retry stream request with refreshed token");
              chatApi(chatPath, refreshedHeaders, requestPayload, tools);
              return;
            }
          }

          if (res.status === 401) {
            responseTexts.push(Locale.Error.Unauthorized);
          }

          if (extraInfo) {
            responseTexts.push(extraInfo);
          }

          responseText = responseTexts.join("\n\n");

          return finish();
        }
      },
      onmessage(msg) {
        if (msg.data === "[DONE]" || finished) {
          return finish();
        }
        const text = msg.data;
        // Skip empty messages
        if (!text || text.trim().length === 0) {
          return;
        }
        try {
          const chunk = parseSSE(text, runTools);
          if (chunk) {
            remainText += chunk;
          }
        } catch (e) {
          console.error("[Request] parse error", text, msg, e);
        }
      },
      onclose() {
        clearTimeout(requestTimeoutId);
        finish();
      },
      onerror(e) {
        clearTimeout(requestTimeoutId);
        throw timeoutTriggered
          ? buildStreamTimeoutError(streamTimeoutMS)
          : normalizeStreamError(e);
      },
      openWhenHidden: true,
    }).catch((error) => {
      clearTimeout(requestTimeoutId);
      if (finished) return;
      reportError(
        timeoutTriggered
          ? buildStreamTimeoutError(streamTimeoutMS)
          : normalizeStreamError(error),
      );
      finish();
    });
  }
  console.debug("[ChatAPI] start");
  chatApi(chatPath, headers, requestPayload, tools); // call fetchEventSource
}

export function streamWithThink(
  chatPath: string,
  requestPayload: any,
  headers: any,
  tools: any[],
  funcs: Record<string, Function>,
  controller: AbortController,
  parseSSE: (
    text: string,
    runTools: any[],
  ) => {
    isThinking: boolean;
    content: string | undefined;
  },
  processToolMessage: (
    requestPayload: any,
    toolCallMessage: any,
    toolCallResult: any[],
  ) => void,
  options: any,
) {
  let responseText = "";
  let remainText = "";
  let finished = false;
  let hasStreamError = false;
  let running = false;
  let runTools: any[] = [];
  let responseRes: Response;
  let unauthorizedRetryCount = 0;
  const streamTimeoutMS = resolveStreamTimeoutMS(requestPayload);
  const reportError = (error: unknown) => {
    if (hasStreamError) return;
    hasStreamError = true;
    options?.onError?.(normalizeStreamError(error));
  };
  let isInThinkingMode = false;
  let lastIsThinking = false;
  let lastIsThinkingTagged = false; //between <think> and </think> tags

  // animate response to make it looks smooth
  function animateResponseText() {
    if (finished || controller.signal.aborted) {
      responseText += remainText;
      console.log("[Response Animation] finished");
      if (responseText?.length === 0 && !hasStreamError) {
        reportError(new Error("empty response from server"));
      }
      return;
    }

    if (remainText.length > 0) {
      const fetchCount = Math.max(1, Math.round(remainText.length / 60));
      const fetchText = remainText.slice(0, fetchCount);
      responseText += fetchText;
      remainText = remainText.slice(fetchCount);
      options.onUpdate?.(responseText, fetchText);
    }

    requestAnimationFrame(animateResponseText);
  }

  // start animaion
  animateResponseText();

  const finish = () => {
    if (!finished) {
      if (!running && runTools.length > 0) {
        const toolCallMessage = {
          role: "assistant",
          tool_calls: [...runTools],
        };
        running = true;
        runTools.splice(0, runTools.length); // empty runTools
        return Promise.all(
          toolCallMessage.tool_calls.map((tool) => {
            options?.onBeforeTool?.(tool);
            const toolName = tool?.function?.name;
            const toolFn =
              typeof toolName === "string" && toolName
                ? funcs[toolName]
                : undefined;
            if (typeof toolFn !== "function") {
              return Promise.resolve(
                Promise.reject(
                  new Error(
                    `tool function not found: ${String(toolName || "(empty)")}`,
                  ),
                ),
              )
                .catch((e) => {
                  options?.onAfterTool?.({
                    ...tool,
                    isError: true,
                    errorMsg: e.toString(),
                  });
                  return e.toString();
                })
                .then((content) => ({
                  name: toolName,
                  role: "tool",
                  content,
                  tool_call_id: tool.id,
                }));
            }
            return Promise.resolve(
              toolFn(
                // @ts-ignore
                tool?.function?.arguments
                  ? JSON.parse(tool?.function?.arguments)
                  : {},
              ),
            )
              .then((res) => {
                let content = res.data || res?.statusText;
                // hotfix #5614
                content =
                  typeof content === "string"
                    ? content
                    : JSON.stringify(content);
                if (res.status >= 300) {
                  return Promise.reject(content);
                }
                return content;
              })
              .then((content) => {
                options?.onAfterTool?.({
                  ...tool,
                  content,
                  isError: false,
                });
                return content;
              })
              .catch((e) => {
                options?.onAfterTool?.({
                  ...tool,
                  isError: true,
                  errorMsg: e.toString(),
                });
                return e.toString();
              })
              .then((content) => ({
                name: tool.function.name,
                role: "tool",
                content,
                tool_call_id: tool.id,
              }));
          }),
        )
          .then((toolCallResult) => {
            processToolMessage(requestPayload, toolCallMessage, toolCallResult);
            setTimeout(() => {
              // call again
              console.debug("[ChatAPI] restart");
              running = false;
              chatApi(chatPath, headers, requestPayload, tools); // call fetchEventSource
            }, 60);
          })
          .catch((error) => {
            running = false;
            reportError(error);
            finish();
          });
        return;
      }
      if (running) {
        return;
      }
      console.debug("[ChatAPI] end");
      finished = true;
      options.onFinish(responseText + remainText, responseRes);
    }
  };

  controller.signal.onabort = finish;

  function chatApi(
    chatPath: string,
    headers: any,
    requestPayload: any,
    tools: any,
  ) {
    const chatPayload = {
      method: "POST",
      body: JSON.stringify({
        ...requestPayload,
        tools: tools && tools.length ? tools : undefined,
      }),
      signal: controller.signal,
      headers,
    };
    let timeoutTriggered = false;
    const requestTimeoutId = setTimeout(() => {
      timeoutTriggered = true;
      reportError(buildStreamTimeoutError(streamTimeoutMS));
      controller.abort();
    }, streamTimeoutMS);
    void fetchEventSource(chatPath, {
      fetch: tauriFetch as any,
      ...chatPayload,
      async onopen(res) {
        clearTimeout(requestTimeoutId);
        const contentType = res.headers.get("content-type");
        console.log("[Request] response content type: ", contentType);
        responseRes = res;

        if (contentType?.startsWith("text/plain")) {
          responseText = await res.clone().text();
          return finish();
        }

        if (
          !res.ok ||
          !res.headers
            .get("content-type")
            ?.startsWith(EventStreamContentType) ||
          res.status !== 200
        ) {
          const responseTexts = [responseText];
          let extraInfo = await res.clone().text();
          try {
            const resJson = await res.clone().json();
            extraInfo = prettyObject(resJson);
          } catch {}

          if (unauthorizedRetryCount < 1) {
            const refreshedHeaders = await refreshHeadersForUnauthorized(
              options,
              res,
              extraInfo,
            ).catch((error) => {
              console.warn("[UCAN] failed to refresh stream headers", error);
              return null;
            });
            if (refreshedHeaders) {
              unauthorizedRetryCount += 1;
              console.warn("[UCAN] retry stream request with refreshed token");
              chatApi(chatPath, refreshedHeaders, requestPayload, tools);
              return;
            }
          }

          if (res.status === 401) {
            responseTexts.push(Locale.Error.Unauthorized);
          }

          if (extraInfo) {
            responseTexts.push(extraInfo);
          }

          responseText = responseTexts.join("\n\n");

          return finish();
        }
      },
      onmessage(msg) {
        if (msg.data === "[DONE]" || finished) {
          return finish();
        }
        const text = msg.data;
        // Skip empty messages
        if (!text || text.trim().length === 0) {
          return;
        }
        try {
          const chunk = parseSSE(text, runTools);
          // Skip if content is empty
          if (!chunk?.content || chunk.content.length === 0) {
            return;
          }

          // deal with <think> and </think> tags start
          if (!chunk.isThinking) {
            if (chunk.content.startsWith("<think>")) {
              chunk.isThinking = true;
              chunk.content = chunk.content.slice(7).trim();
              lastIsThinkingTagged = true;
            } else if (chunk.content.endsWith("</think>")) {
              chunk.isThinking = false;
              chunk.content = chunk.content.slice(0, -8).trim();
              lastIsThinkingTagged = false;
            } else if (lastIsThinkingTagged) {
              chunk.isThinking = true;
            }
          }
          // deal with <think> and </think> tags start

          // Check if thinking mode changed
          const isThinkingChanged = lastIsThinking !== chunk.isThinking;
          lastIsThinking = chunk.isThinking;

          if (chunk.isThinking) {
            // If in thinking mode
            if (!isInThinkingMode || isThinkingChanged) {
              // If this is a new thinking block or mode changed, add prefix
              isInThinkingMode = true;
              if (remainText.length > 0) {
                remainText += "\n";
              }
              remainText += "> " + chunk.content;
            } else {
              // Handle newlines in thinking content
              if (chunk.content.includes("\n\n")) {
                const lines = chunk.content.split("\n\n");
                remainText += lines.join("\n\n> ");
              } else {
                remainText += chunk.content;
              }
            }
          } else {
            // If in normal mode
            if (isInThinkingMode || isThinkingChanged) {
              // If switching from thinking mode to normal mode
              isInThinkingMode = false;
              remainText += "\n\n" + chunk.content;
            } else {
              remainText += chunk.content;
            }
          }
        } catch (e) {
          console.error("[Request] parse error", text, msg, e);
          // Don't throw error for parse failures, just log them
        }
      },
      onclose() {
        clearTimeout(requestTimeoutId);
        finish();
      },
      onerror(e) {
        clearTimeout(requestTimeoutId);
        throw timeoutTriggered
          ? buildStreamTimeoutError(streamTimeoutMS)
          : normalizeStreamError(e);
      },
      openWhenHidden: true,
    }).catch((error) => {
      clearTimeout(requestTimeoutId);
      if (finished) return;
      reportError(
        timeoutTriggered
          ? buildStreamTimeoutError(streamTimeoutMS)
          : normalizeStreamError(error),
      );
      finish();
    });
  }
  console.debug("[ChatAPI] start");
  chatApi(chatPath, headers, requestPayload, tools); // call fetchEventSource
}
