import { StoreKey, ApiPath, OpenaiPath, ServiceProvider } from "@/app/constant";
import { createPersistStore } from "@/app/utils/store";
import { nanoid } from "nanoid";
import {
  uploadGeneratedImageAndGetStableUrl,
  base64Image2Blob,
} from "@/app/utils/chat";
import { getModelParamBasicData } from "@/app/components/sd/sd-panel";
import {
  getImageEndpointSchema,
  ImageFormMode,
} from "@/app/components/sd/image-endpoint-schemas";
import { resolveStoredImageUrl } from "@/app/components/sd/image-result";
import { getDefaultImageModel } from "@/app/components/sd/image-registry";
import { getHeadersWithRouterUcan } from "@/app/client/platforms/openai";
import { useAccessStore } from "./access";
import Locale from "@/app/locales";

function normalizeSdErrorMessage(message: string) {
  const text = String(message || "");
  const lower = text.toLowerCase();
  if (
    lower.includes("missing token") ||
    text.includes("未提供令牌") ||
    lower.includes("access token is missing")
  ) {
    return Locale.Sd.Errors.MissingToken;
  }
  if (
    lower.includes("unauthorized") ||
    lower.includes("forbidden") ||
    text.includes("无权") ||
    text.includes("未授权")
  ) {
    return Locale.Sd.Errors.Unauthorized;
  }
  return text;
}

function resolveImageFetchUrl(input: string) {
  if (!input) return input;
  if (
    input.startsWith("data:") ||
    input.startsWith("blob:") ||
    input.startsWith("/")
  ) {
    return input;
  }

  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return input;
  }

  if (
    typeof window !== "undefined" &&
    parsed.origin === window.location.origin
  ) {
    return input;
  }

  const normalizedPath = parsed.pathname.replace(/^\/+/, "");
  const isWebdavPublicShare =
    normalizedPath.startsWith("api/v1/public/share/") ||
    normalizedPath.startsWith("api/v1/public/webdav/");

  if (!isWebdavPublicShare) {
    return input;
  }

  const search = new URLSearchParams(parsed.search);
  search.set("endpoint", parsed.origin);
  return `/api/webdav/${normalizedPath}?${search.toString()}`;
}

async function fetchImageBlob(input: string) {
  const response = await fetch(resolveImageFetchUrl(input));
  if (!response.ok) {
    throw new Error(
      `Failed to fetch image: ${response.status} ${response.statusText}`,
    );
  }
  return response.blob();
}

const defaultModel = getDefaultImageModel() || {
  name: "",
  value: "",
  provider: "",
  providerName: "",
  endpointType: "images-generation",
  supportsImage: true as const,
  params: () => [],
};

const defaultParams = getModelParamBasicData(defaultModel.params({}), {});

const DEFAULT_SD_STATE = {
  currentId: 0,
  currentSessionId: "",
  draw: [],
  currentMode: "generation" as ImageFormMode,
  editSourceType: "history" as "history" | "upload",
  editSourceImage: "",
  editSourceName: "",
  editMaskImage: "",
  editMaskName: "",
  currentModel: defaultModel,
  currentParams: defaultParams,
};

export const useSdStore = createPersistStore<
  {
    currentId: number;
    currentSessionId: string;
    draw: any[];
    currentMode: ImageFormMode;
    editSourceType: "history" | "upload";
    editSourceImage: string;
    editSourceName: string;
    editMaskImage: string;
    editMaskName: string;
    currentModel: typeof defaultModel;
    currentParams: any;
  },
  {
    getNextId: () => number;
    sendTask: (data: any, okCall?: Function) => void;
    updateDraw: (draw: any) => void;
    setCurrentMode: (mode: ImageFormMode) => void;
    setEditSourceType: (type: "history" | "upload") => void;
    setEditSourceImage: (image: string, name?: string) => void;
    setEditMaskImage: (image: string, name?: string) => void;
    setCurrentModel: (model: any) => void;
    setCurrentParams: (data: any) => void;
    setCurrentSessionId: (sessionId: string) => void;
    startBlankCreation: (prompt?: string) => void;
    deleteDraw: (id: string) => void;
    deleteSession: (sessionId: string) => void;
  }
>(
  DEFAULT_SD_STATE,
  (set, _get) => {
    function get() {
      return {
        ..._get(),
        ...methods,
      };
    }

    const methods = {
      getNextId() {
        const id = ++_get().currentId;
        set({ currentId: id });
        return id;
      },
      sendTask(data: any, okCall?: Function) {
        const sessionId =
          data.session_id || _get().currentSessionId || nanoid();
        data = {
          ...data,
          id: nanoid(),
          session_id: sessionId,
          status: "running",
        };
        set({ currentSessionId: sessionId, draw: [data, ..._get().draw] });
        get().getNextId();
        get().imageGenerationRequestCall(data);
        okCall?.();
      },
      async imageGenerationRequestCall(data: any) {
        const accessStore = useAccessStore.getState();
        const prefix = (
          accessStore.useCustomConfig
            ? accessStore.openaiUrl || (ApiPath.OpenAI as string)
            : (ApiPath.OpenAI as string)
        ).replace(/\/+$/, "");
        const endpointType = data.endpoint_type || "images-generation";
        const schema = getImageEndpointSchema(endpointType);
        const sourceImage = data.source_image
          ? await fetchImageBlob(data.source_image)
          : undefined;
        const maskImage = data.mask_image
          ? await fetchImageBlob(data.mask_image)
          : undefined;
        const requestBody = schema.buildRequestBody({
          model: data.model,
          params: data.params,
          sourceImage,
          maskImage,
        });

        const endpointPath =
          endpointType === "images-edits"
            ? OpenaiPath.ImagePath.replace("generations", "edits")
            : OpenaiPath.ImagePath;
        const path = `${prefix}/${endpointPath}`;
        getHeadersWithRouterUcan(path, ServiceProvider.OpenAI)
          .then((headers) => {
            const nextHeaders = { ...headers };
            if (requestBody instanceof FormData) {
              delete nextHeaders["Content-Type"];
            }
            return fetch(path, {
              method: "POST",
              headers: nextHeaders,
              body:
                requestBody instanceof FormData
                  ? requestBody
                  : JSON.stringify(requestBody),
            });
          })
          .then((response) => response.json())
          .then((resData) => {
            const errorMessage = schema.resolveErrorMessage(resData);
            if (errorMessage) {
              get().updateDraw({
                ...data,
                status: "error",
                error: normalizeSdErrorMessage(errorMessage),
              });
              get().getNextId();
              return;
            }

            const imageResult = schema.resolveImageResult(resData);
            if (!imageResult) {
              get().updateDraw({
                ...data,
                status: "error",
                error: normalizeSdErrorMessage(JSON.stringify(resData)),
              });
              get().getNextId();
              return;
            }

            const imagePromise = resolveStoredImageUrl(imageResult, {
              base64Image2Blob,
              uploadGeneratedImageAndGetStableUrl,
            });

            imagePromise
              .then((img_data: string) => {
                get().updateDraw({
                  ...data,
                  status: "success",
                  img_data,
                });
              })
              .catch((e) => {
                get().updateDraw({
                  ...data,
                  status: "error",
                  error: normalizeSdErrorMessage(JSON.stringify(e)),
                });
              })
              .finally(() => {
                get().getNextId();
              });
          })
          .catch((error) => {
            get().updateDraw({
              ...data,
              status: "error",
              error: normalizeSdErrorMessage(error.message),
            });
            console.error("Error:", error);
            get().getNextId();
          });
      },
      updateDraw(_draw: any) {
        const draw = _get().draw || [];
        const nextDraw = draw.map((item) =>
          item.id === _draw.id ? _draw : item,
        );
        set({ draw: nextDraw });
      },
      deleteDraw(id: string) {
        set({ draw: (_get().draw || []).filter((item) => item.id !== id) });
        get().getNextId();
      },
      deleteSession(sessionId: string) {
        set({
          draw: (_get().draw || []).filter((item) => {
            const itemSessionId = item.session_id || item.id;
            return itemSessionId !== sessionId;
          }),
          currentSessionId:
            _get().currentSessionId === sessionId
              ? ""
              : _get().currentSessionId,
        });
        get().getNextId();
      },
      setCurrentMode(mode: ImageFormMode) {
        set({ currentMode: mode });
      },
      setEditSourceType(type: "history" | "upload") {
        set({ editSourceType: type });
      },
      setEditSourceImage(image: string, name?: string) {
        set({ editSourceImage: image, editSourceName: name || "" });
      },
      setEditMaskImage(image: string, name?: string) {
        set({ editMaskImage: image, editMaskName: name || "" });
      },
      setCurrentModel(model: any) {
        set({ currentModel: model });
      },
      setCurrentParams(data: any) {
        set({
          currentParams: data,
        });
      },
      setCurrentSessionId(sessionId: string) {
        set({ currentSessionId: sessionId });
      },
      startBlankCreation(prompt = "") {
        const currentModel = _get().currentModel;
        const sessionId = nanoid();
        const currentParams = getModelParamBasicData(
          currentModel?.params?.({}) ?? [],
          {},
        );
        set({
          currentSessionId: sessionId,
          currentMode: "generation",
          editSourceType: "history",
          editSourceImage: "",
          editSourceName: "",
          editMaskImage: "",
          editMaskName: "",
          currentParams: {
            ...currentParams,
            prompt,
          },
        });
      },
    };

    return methods;
  },
  {
    name: StoreKey.SdList,
    version: 1.0,
  },
);
