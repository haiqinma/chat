import axios, { AxiosRequestConfig } from "axios";
import * as yaml from "js-yaml";
import { isDesktopAppRuntime } from "../tauri";
import { fetch as tauriStreamFetch } from "./stream";

type HttpMethod =
  "get" | "put" | "post" | "delete" | "options" | "head" | "patch" | "trace";

const HTTP_METHODS = new Set<HttpMethod>([
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
]);

type OpenApiParameter = {
  name: string;
  in?: "query" | "header" | "path" | "cookie";
  required?: boolean;
  description?: string;
  schema?: Record<string, any>;
};

export type OpenApiOperation = {
  path: string;
  method: HttpMethod;
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: OpenApiParameter[];
  requestBody?: Record<string, any>;
};

export type OpenApiDefinition = {
  openapi?: string;
  swagger?: string;
  info?: {
    title?: string;
    version?: string;
    description?: string;
  };
  servers?: Array<{ url?: string }>;
  host?: string;
  basePath?: string;
  schemes?: string[];
  paths?: Record<string, Record<string, any>>;
};

export type OpenApiRuntimeConfig = {
  definition: OpenApiDefinition;
  baseURL?: string;
  headers?: Record<string, string | undefined>;
};

export class OpenApiRuntime {
  definition: OpenApiDefinition;
  axiosConfigDefaults: AxiosRequestConfig;

  constructor(config: OpenApiRuntimeConfig) {
    this.definition = config.definition;
    this.axiosConfigDefaults = {
      adapter: (isDesktopAppRuntime() ? tauriAxiosAdapter : undefined) as any,
      baseURL: config.baseURL,
      headers: config.headers,
    };
  }

  getOperations() {
    return getOpenApiOperations(this.definition);
  }

  callOperation(
    operation: OpenApiOperation,
    args: Record<string, any> = {},
    extra?: {
      query?: Record<string, any>;
      body?: Record<string, any>;
    },
  ) {
    const { parameters, body } = splitOperationArgs(operation, { ...args });
    const url = buildPath(operation.path, parameters.path);

    return axios.request({
      ...this.axiosConfigDefaults,
      url,
      method: operation.method,
      params: { ...parameters.query, ...extra?.query },
      headers: {
        ...(this.axiosConfigDefaults.headers as Record<string, string>),
        ...parameters.header,
      },
      data: shouldSendBody(operation.method)
        ? { ...body, ...extra?.body }
        : undefined,
    });
  }
}

export function parseOpenApiDefinition(content: string): OpenApiDefinition {
  const definition = yaml.load(content) as OpenApiDefinition;

  if (!definition || typeof definition !== "object") {
    throw new Error("Invalid OpenAPI definition");
  }

  if (!definition.paths || typeof definition.paths !== "object") {
    throw new Error("OpenAPI definition is missing paths");
  }

  return definition;
}

export function getOpenApiOperations(definition: OpenApiDefinition) {
  const operations: OpenApiOperation[] = [];

  Object.entries(definition.paths || {}).forEach(([path, pathItem]) => {
    Object.entries(pathItem || {}).forEach(([method, operation]) => {
      const normalizedMethod = method.toLowerCase() as HttpMethod;
      if (!HTTP_METHODS.has(normalizedMethod)) return;

      operations.push({
        ...(operation as Record<string, any>),
        path,
        method: normalizedMethod,
        parameters: [
          ...((pathItem.parameters as OpenApiParameter[] | undefined) || []),
          ...(((operation as Record<string, any>).parameters as
            OpenApiParameter[] | undefined) || []),
        ],
      });
    });
  });

  return operations;
}

export function operationToToolParameters(operation: OpenApiOperation) {
  const schema = getJsonRequestBodySchema(operation) || {
    type: "object",
    properties: {},
  };
  const parameters = cloneSchema(schema);

  parameters.type ||= "object";
  parameters.properties ||= {};
  parameters.required ||= [];

  operation.parameters?.forEach((parameter) => {
    if (parameter.in !== "query" && parameter.in !== "path") return;
    if (!parameter.name) return;

    parameters.properties[parameter.name] = {
      ...(parameter.schema || { type: "string" }),
      description: parameter.description,
    };

    if (parameter.required && !parameters.required.includes(parameter.name)) {
      parameters.required.push(parameter.name);
    }
  });

  return parameters;
}

export function createOpenApiRuntime(config: OpenApiRuntimeConfig) {
  return new OpenApiRuntime(config);
}

export function getOperationId(operation: {
  operationId?: string;
  method: string;
  path: string;
}) {
  return (
    operation?.operationId ||
    `${operation.method.toUpperCase()}${operation.path.replaceAll("/", "_")}`
  );
}

function tauriAxiosAdapter(config: Record<string, any>) {
  const { baseURL, url, params, data: body, ...rest } = config;
  const path = baseURL ? `${baseURL}${url}` : url;
  const fetchUrl = params
    ? `${path}?${new URLSearchParams(params as any).toString()}`
    : path;

  return tauriStreamFetch(fetchUrl as string, { ...rest, body }).then((res) => {
    const { status, headers, statusText } = res;
    return res.text().then((data: string) => ({
      status,
      statusText,
      headers,
      data,
      config,
    }));
  });
}

function getJsonRequestBodySchema(operation: OpenApiOperation) {
  const content = operation.requestBody?.content;
  return (
    content?.["application/json"]?.schema ||
    content?.["application/x-www-form-urlencoded"]?.schema ||
    content?.["multipart/form-data"]?.schema
  );
}

function cloneSchema(schema: Record<string, any>) {
  return JSON.parse(JSON.stringify(schema));
}

function splitOperationArgs(
  operation: OpenApiOperation,
  args: Record<string, any>,
) {
  const parameters = {
    path: {} as Record<string, any>,
    query: {} as Record<string, any>,
    header: {} as Record<string, any>,
  };

  operation.parameters?.forEach((parameter) => {
    if (!parameter.name || !(parameter.name in args)) return;

    if (parameter.in === "path") {
      parameters.path[parameter.name] = args[parameter.name];
      delete args[parameter.name];
    } else if (parameter.in === "query") {
      parameters.query[parameter.name] = args[parameter.name];
      delete args[parameter.name];
    } else if (parameter.in === "header") {
      parameters.header[parameter.name] = args[parameter.name];
      delete args[parameter.name];
    }
  });

  return { parameters, body: args };
}

function buildPath(path: string, pathParams: Record<string, any>) {
  return path.replace(/\{([^}]+)\}/g, (_, name) => {
    const value = pathParams[name];
    return encodeURIComponent(value == null ? "" : String(value));
  });
}

function shouldSendBody(method: HttpMethod) {
  return method !== "get" && method !== "head";
}
