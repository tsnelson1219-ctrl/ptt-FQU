import { execFileSync, spawnSync } from "node:child_process";
import {
  cp,
  mkdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const dist = resolve(root, "dist");
const workRoot = resolve(root, "work");
const stage = resolve(workRoot, `PTT-FQU-${pkg.version}-portable`);
const archive = resolve(root, `PTT-FQU-${pkg.version}-portable.zip`);
const nodePath = process.execPath;
const wsPath = await realpath(resolve(root, "node_modules/ws"));

if (!(await stat(nodePath)).isFile()) throw new Error("Node.js 執行檔不存在。");
if (!stage.startsWith(`${workRoot}${sep}`)) throw new Error("Portable staging path is outside work/.");

await mkdir(workRoot, { recursive: true });
await rm(stage, { recursive: true, force: true });
await rm(archive, { force: true });

for (const path of [
  resolve(dist, "assets"),
  resolve(dist, "index.html"),
  resolve(dist, "manifest.webmanifest"),
  resolve(dist, "sw.js"),
  resolve(dist, "version.json"),
  resolve(dist, "apple-touch-icon.png"),
  resolve(dist, "icon-192.png"),
  resolve(dist, "icon-512.png"),
  resolve(dist, "icon-maskable-512.png"),
]) {
  await rm(path, { recursive: true, force: true });
}

const commitHash =
  process.env.COMMIT_HASH ||
  execFileSync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
const build = spawnSync(
  process.execPath,
  [resolve(root, "node_modules/vite/bin/vite.js"), "build"],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      SITE_URL: "ws://127.0.0.1:38120/bbs",
      COMMIT_HASH: commitHash,
    },
  }
);
if (build.status !== 0)
  throw new Error(`Vite build failed with status ${build.status}`);

await mkdir(resolve(stage, "portable"), { recursive: true });
await mkdir(resolve(stage, "api"), { recursive: true });
await mkdir(resolve(stage, "node_modules"), { recursive: true });
await cp(dist, resolve(stage, "dist"), { recursive: true });
await cp(resolve(root, "api/bbs.js"), resolve(stage, "api/bbs.js"));
await cp(
  resolve(root, "portable/server.mjs"),
  resolve(stage, "portable/server.mjs")
);
await cp(
  resolve(root, "portable/README.txt"),
  resolve(stage, "portable/README.txt")
);
await cp(
  resolve(root, "portable/開始使用.bat"),
  resolve(stage, "開始使用 PTT-FQU.bat")
);
await cp(nodePath, resolve(stage, "node.exe"));
await cp(wsPath, resolve(stage, "node_modules/ws"), { recursive: true });
await writeFile(
  resolve(stage, "版本資訊.txt"),
  `PTT-FQU ${pkg.version}\nCommit: ${commitHash}\nBuild date: ${new Date().toISOString().slice(0, 10)}\n`,
  "utf8"
);

console.log(`Portable package staged at: ${stage}`);
console.log(
  `Create the ZIP with: Compress-Archive -Path '${stage}' -DestinationPath '${archive}' -Force`
);
