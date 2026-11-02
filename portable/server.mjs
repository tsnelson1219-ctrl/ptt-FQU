import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { attachBbsProxy } from "../api/bbs.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const staticRoot = resolve(packageRoot, "dist");
const host = "127.0.0.1";
const port = 38120;
const appUrl = `http://${host}:${port}/`;
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".woff2": "font/woff2",
};

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, appUrl).pathname);
  } catch {
    response.writeHead(400);
    response.end("Invalid URL");
    return;
  }

  const relativePath =
    pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  let filePath = resolve(staticRoot, relativePath);
  if (filePath !== staticRoot && !filePath.startsWith(`${staticRoot}${sep}`)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type":
        contentTypes[extname(filePath).toLowerCase()] ||
        "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": filePath.endsWith("index.html")
        ? "no-cache"
        : "public, max-age=3600",
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

attachBbsProxy(server, { path: "/bbs" });

server.listen(port, host, () => {
  console.log(`PTT-FQU 已啟動：${appUrl}`);
  console.log("保持此視窗開啟即可使用；關閉此視窗會停止本機服務。");
  const command = process.env.ComSpec || "cmd.exe";
  spawn(command, ["/d", "/s", "/c", `start "" "${appUrl}"`], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  }).unref();
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `連接埠 ${port} 已被使用。關閉佔用程式後再重新點擊開始使用。`
    );
  } else {
    console.error("PTT-FQU 本機服務啟動失敗：", error.message);
  }
  process.exitCode = 1;
});
