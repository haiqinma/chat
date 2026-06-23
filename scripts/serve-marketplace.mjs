#!/usr/bin/env node

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

const rootArg = process.argv[2];
const port = Number(process.env.MARKETPLACE_PORT || process.argv[3] || 3090);
const host = process.env.MARKETPLACE_HOST || "127.0.0.1";

if (!rootArg) {
  console.error("Usage: node scripts/serve-marketplace.mjs <marketplace-dir>");
  process.exit(1);
}

const rootDir = path.resolve(rootArg);

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
]);

function setCommonHeaders(res, contentType = "text/plain; charset=utf-8") {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", contentType);
}

function resolveRequestPath(url) {
  const pathname = new URL(url || "/", "http://localhost").pathname;
  const decodedPath = decodeURIComponent(pathname);
  const relativePath = decodedPath.replace(/^\/+/, "");
  const filePath = path.resolve(rootDir, relativePath || "index.html");

  if (!filePath.startsWith(rootDir + path.sep) && filePath !== rootDir) {
    return undefined;
  }

  return filePath;
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    setCommonHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    setCommonHeaders(res);
    res.writeHead(405);
    res.end("Method Not Allowed");
    return;
  }

  const filePath = resolveRequestPath(req.url);
  if (!filePath) {
    setCommonHeaders(res);
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      setCommonHeaders(res);
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    const contentType =
      contentTypes.get(path.extname(filePath).toLowerCase()) ||
      "application/octet-stream";
    setCommonHeaders(res, contentType);
    res.setHeader("Content-Length", String(fileStat.size));
    res.writeHead(200);

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    createReadStream(filePath).pipe(res);
  } catch {
    setCommonHeaders(res);
    res.writeHead(404);
    res.end("Not Found");
  }
});

server.listen(port, host, () => {
  console.log(`Marketplace server with CORS: http://${host}:${port}`);
  console.log(`Root: ${rootDir}`);
});
