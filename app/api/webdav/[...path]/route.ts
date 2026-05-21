import { NextRequest, NextResponse } from "next/server";
import { STORAGE_KEY, internalAllowedWebDavEndpoints } from "../../../constant";
import { getServerSideConfig } from "@/app/config/server";

export const dynamic = "force-static";

export function generateStaticParams() {
  return [];
}

const config = getServerSideConfig();

function isEnabledEnv(value?: string): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

const allowLocalWebDav =
  isEnabledEnv(process.env.ALLOW_LOCAL_WEBDAV) ||
  process.env.NODE_ENV !== "production";
const localAllowedWebDavEndpoints = allowLocalWebDav
  ? ["http://127.0.0.1/", "http://localhost/", "http://[::1]/"]
  : [];
const mergedAllowedWebDavEndpoints = [
  ...internalAllowedWebDavEndpoints,
  ...(config.web_dav_backend_url ? [config.web_dav_backend_url] : []),
  ...localAllowedWebDavEndpoints,
].filter((domain) => Boolean(domain.trim()));

const normalizeUrl = (url: string) => {
  try {
    return new URL(url);
  } catch (err) {
    return null;
  }
};

async function handle(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const resolvedParams = await params;
  if (req.method === "OPTIONS") {
    return NextResponse.json({ body: "OK" }, { status: 200 });
  }
  const folder = STORAGE_KEY;

  const requestUrl = new URL(req.url);
  let endpoint = requestUrl.searchParams.get("endpoint");
  const proxy_method = (
    requestUrl.searchParams.get("proxy_method") || req.method
  ).toUpperCase();
  const endpointPath = resolvedParams.path.join("/");
  const normalizedEndpointPath = endpointPath
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  const isPublicShareApiPath = normalizedEndpointPath.startsWith(
    "api/v1/public/share/",
  );
  const isPublicWebdavApiPath = normalizedEndpointPath.startsWith(
    "api/v1/public/webdav/",
  );
  const isPublicApiPath = isPublicShareApiPath || isPublicWebdavApiPath;

  // Validate the endpoint to prevent potential SSRF attacks
  if (
    !endpoint ||
    !mergedAllowedWebDavEndpoints.some((allowedEndpoint) => {
      const normalizedAllowedEndpoint = normalizeUrl(allowedEndpoint);
      const normalizedEndpoint = normalizeUrl(endpoint as string);

      if (!normalizedEndpoint || !normalizedAllowedEndpoint) {
        return false;
      }
      if (normalizedEndpoint.hostname !== normalizedAllowedEndpoint.hostname) {
        return false;
      }
      if (isPublicApiPath) {
        return true;
      }
      return normalizedEndpoint.pathname.startsWith(
        normalizedAllowedEndpoint.pathname,
      );
    })
  ) {
    return NextResponse.json(
      {
        error: true,
        msg: "Invalid endpoint",
      },
      {
        status: 400,
      },
    );
  }

  if (!endpoint?.endsWith("/")) {
    endpoint += "/";
  }

  const pathSegments = normalizedEndpointPath.split("/").filter(Boolean);
  const hasPathTraversal = pathSegments.some((segment) => segment === "..");
  const isInsideFolder =
    normalizedEndpointPath === folder ||
    normalizedEndpointPath.startsWith(`${folder}/`);
  const targetPath = `${endpoint}${endpointPath}`;

  if (hasPathTraversal || (!isInsideFolder && !isPublicApiPath)) {
    return NextResponse.json(
      {
        error: true,
        msg: "you are not allowed to request " + targetPath,
      },
      {
        status: 403,
      },
    );
  }

  const allowedMethods = isPublicApiPath
    ? new Set(["GET", "POST", "DELETE"])
    : new Set(["MKCOL", "GET", "PUT", "DELETE"]);
  if (!allowedMethods.has(proxy_method)) {
    return NextResponse.json(
      {
        error: true,
        msg: "you are not allowed to request " + targetPath,
      },
      {
        status: 403,
      },
    );
  }

  // never allow deleting the root sync folder from proxy.
  if (
    !isPublicApiPath &&
    proxy_method === "DELETE" &&
    normalizedEndpointPath === folder
  ) {
    return NextResponse.json(
      {
        error: true,
        msg: "you are not allowed to request " + targetPath,
      },
      {
        status: 403,
      },
    );
  }

  const targetUrl = targetPath;

  const method = proxy_method || req.method;
  const shouldNotHaveBody = ["get", "head"].includes(
    method?.toLowerCase() ?? "",
  );

  const fetchOptions: RequestInit = {
    headers: {
      authorization: req.headers.get("authorization") ?? "",
    },
    body: shouldNotHaveBody ? null : req.body,
    redirect: "manual",
    method,
    // @ts-ignore
    duplex: "half",
  };

  let fetchResult;

  try {
    fetchResult = await fetch(targetUrl, fetchOptions);
  } finally {
    console.log(
      "[Any Proxy]",
      targetUrl,
      {
        method: method,
      },
      {
        status: fetchResult?.status,
        statusText: fetchResult?.statusText,
      },
    );
  }

  return fetchResult;
}

export const PUT = handle;
export const GET = handle;
export const POST = handle;
export const DELETE = handle;
export const OPTIONS = handle;

export const runtime = "nodejs";
