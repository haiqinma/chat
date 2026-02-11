# Router and WebDAV Integration

This document explains how the current Chat integrates Router and WebDAV using UCAN, including request flow and key configuration points.

## Goals

- One wallet authorization (UCAN Root) enables access to multiple backends (Router + WebDAV).
- Router provides OpenAI-compatible APIs; WebDAV provides storage and quota services.
- Next.js acts as both UI and API proxy to unify CORS and auth.

## Request Flow

```mermaid
flowchart TB
  subgraph Browser["Browser"]
    UI["Next.js UI\n- Wallet connect\n- Root UCAN\n- Invocation UCAN"]
  end
  subgraph Proxy["Next.js API Proxy"]
    AUTH["/api/v1/public/auth/*"]
    WEBDAVQ["/api/v1/public/webdav/quota"]
    WEBDAVSYNC["/api/webdav/*"]
  end
  subgraph Backends["Backends"]
    ROUTER["Router\nOpenAI-compatible"]
    WEBDAV["WebDAV\nStorage/Quota"]
  end

  UI -->|"Authorization: Bearer UCAN"| AUTH
  UI -->|"Authorization: Bearer UCAN"| WEBDAVQ
  UI -->|"Authorization: Bearer UCAN"| WEBDAVSYNC
  AUTH --> ROUTER
  WEBDAVQ --> WEBDAV
  WEBDAVSYNC --> WEBDAV
```

## Router Integration

- **Entry point**: `app/client/platforms/openai.ts` generates Invocation UCAN for Router requests.
- **Header**: `Authorization: Bearer <UCAN>`.
- **Proxy path**: `/api/v1/public/auth/*` with an allowlist for permitted backend routes.
- **Audience**: `NEXT_PUBLIC_ROUTER_UCAN_AUD` if set; otherwise derived as `did:web:<router-host>`.

## WebDAV Integration

- **Quota**: `app/plugins/webdav.ts` calls `/api/v1/public/webdav/quota` via `authUcanFetch`.
- **Sync**: `/api/webdav/*` proxies WebDAV file sync to `WEBDAV_BACKEND_BASE_URL + WEBDAV_BACKEND_PREFIX`, with method/path restrictions to prevent SSRF.
- **Headers**: quota proxy uses an allowlist to avoid forwarding sensitive headers.
- **Audience**: `NEXT_PUBLIC_WEBDAV_UCAN_AUD` if set; otherwise derived as `did:web:<webdav-host>`.
- **App capability**: defaults to `app:<appId>` (`appId` defaults to current host).

## Direct WebDAV (No Proxy)

When proxy is disabled, the browser will call the WebDAV server directly (no `/api/webdav/*`).

### How to enable

1) Set `WEBDAV_BACKEND_BASE_URL` to a publicly reachable WebDAV base URL (with scheme, no path).
2) Turn off **Proxy** in Sync settings (`useProxy = false`).
3) If the service is mounted under a path, set `WEBDAV_BACKEND_PREFIX` (e.g. `/dav`).
4) Ensure the WebDAV service supports UCAN and CORS.

### Requirements

- CORS allows `Authorization`, `Depth`, `Content-Type`, etc.
- WebDAV allows `MKCOL/PUT/GET/PROPFIND` and related methods.
- UCAN `aud` matches the backend configuration.

### Notes

- Direct mode exposes the WebDAV origin publicly.
- `127.0.0.1` is only reachable from the local machine, not remote browsers.

## UCAN Session and Local Storage

- Root UCAN and session are stored in IndexedDB: `yeying-web3 / ucan-sessions`.
- Key cached fields in `localStorage`:
  - `currentAccount`
  - `ucanRootExp`
  - `ucanRootIss`
- Each backend request creates a fresh Invocation UCAN, enabling multi-backend access after a single authorization.

## Key Environment Variables

- `ROUTER_BACKEND_URL`: Router backend URL (required)
- `WEBDAV_BACKEND_BASE_URL`: WebDAV base URL (required, no path)
- `WEBDAV_BACKEND_PREFIX`: path prefix (default `/dav`, optional to change)
- `WebDAV app action`: fixed to `write`
- `Shared UCAN caps`: fixed to `profile/read`
- `NEXT_PUBLIC_ROUTER_UCAN_AUD`: Router audience (optional)
- `NEXT_PUBLIC_WEBDAV_UCAN_AUD`: WebDAV audience (optional)

## Security Notes

- Router proxy enforces an allowlist of routes.
- WebDAV sync proxy restricts methods and target paths to prevent SSRF.
- Quota proxy uses header allowlist to avoid sensitive header forwarding.
- Ensure UCAN `aud` matches backend configuration.
