import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { appendFileSync, existsSync, statSync, truncateSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { inspect } from "node:util";
import { attachBbsProxy } from "../api/bbs.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const staticRoot = resolve(packageRoot, "dist");
const host = "::1";
const port = 8081;
const appUrl = `http://[${host}]:${port}/`;

// --- 記錄檔：無黑窗模式下，錯誤也能在 ptt-fqu.log 看到 ---
const logFile = resolve(packageRoot, "ptt-fqu.log");
try {
  if (existsSync(logFile) && statSync(logFile).size > 512 * 1024) {
    truncateSync(logFile, 0);
  }
} catch {}
for (const method of ["log", "info", "warn", "error"]) {
  const original = console[method].bind(console);
  console[method] = (...args) => {
    const text = args
      .map((a) => (typeof a === "string" ? a : inspect(a)))
      .join(" ");
    try {
      appendFileSync(logFile, `[${new Date().toISOString()}] ${text}\n`);
    } catch {}
    original(...args);
  };
}
process.on("uncaughtException", (error) => {
  console.error("未捕捉的錯誤：", error);
  process.exit(1);
});

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

function getBrowserAppCommand(url) {
  // Reuse the user's normal Chrome / Edge profile so existing sign-ins and
  // browser sessions remain available when links open from the PTT window.

  const chromeCandidates = [
    process.env["PROGRAMFILES"] + "\\Google\\Chrome\\Application\\chrome.exe",
    process.env["PROGRAMFILES(X86)"] + "\\Google\\Chrome\\Application\\chrome.exe",
    process.env["LOCALAPPDATA"] + "\\Google\\Chrome\\Application\\chrome.exe",
  ];
  for (const p of chromeCandidates) {
    if (p && existsSync(p)) {
      return {
        bin: p,
        args: [
          `--app=${url}`,
          "--window-size=1080,750",
          "--no-first-run",
          "--no-default-browser-check",
        ],
      };
    }
  }

  const edgeCandidates = [
    process.env["PROGRAMFILES(X86)"] + "\\Microsoft\\Edge\\Application\\msedge.exe",
    process.env["PROGRAMFILES"] + "\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  for (const p of edgeCandidates) {
    if (p && existsSync(p)) {
      return {
        bin: p,
        args: [
          `--app=${url}`,
          "--window-size=1080,750",
          "--no-first-run",
          "--no-default-browser-check",
        ],
      };
    }
  }

  const cmd = process.env.ComSpec || "cmd.exe";
  return { bin: cmd, args: ["/d", "/s", "/c", `start "" "${url}"`] };
}

function openAppWindow(url) {
  const { bin, args } = getBrowserAppCommand(url);
  console.log(`開啟視窗：${bin} ${args.join(" ")}`);
  const child = spawn(bin, args, {
    detached: true,
    stdio: "ignore",
  });
  // 找不到或無法啟動瀏覽器時只記錄錯誤，不讓整個本機服務崩潰
  child.on("error", (error) => {
    console.error("無法開啟瀏覽器視窗：", error.message);
    console.error(`請手動用瀏覽器開啟 ${url}`);
  });
  child.unref();
}

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
      "Cache-Control": ["index.html", "manifest.webmanifest", "sw.js", "version.json"].includes(relativePath)
        ? "no-cache, no-store, must-revalidate"
        : "public, max-age=3600",
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

const wss = attachBbsProxy(server, { path: "/bbs" });

let idleTimer = null;
const IDLE_SHUTDOWN_TIMEOUT_MS = 2000;

function checkIdle() {
  if (wss.clients.size === 0) {
    if (!idleTimer) {
      idleTimer = setTimeout(() => {
        if (wss.clients.size === 0) {
          console.log("偵測到所有 PTT 視窗已關閉，本機服務自動結束。");
          process.exit(0);
        }
      }, IDLE_SHUTDOWN_TIMEOUT_MS);
    }
  } else {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }
}

idleTimer = setTimeout(() => {
  if (wss.clients.size === 0) {
    console.log("啟動逾時未連線，本機服務自動結束。");
    process.exit(0);
  }
}, 60000);

wss.on("connection", (client) => {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  client.on("close", checkIdle);
});

server.listen(port, host, () => {
  console.log(`PTT-FQU 已啟動：${appUrl}`);
  openAppWindow(appUrl);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.log(`連接埠 ${port} 已在執行，直接開啟 PTT 視窗...`);
    openAppWindow(appUrl);
    setTimeout(() => process.exit(0), 1000);
  } else {
    console.error("PTT-FQU 本機服務啟動失敗：", error.message);
    process.exitCode = 1;
  }
});
