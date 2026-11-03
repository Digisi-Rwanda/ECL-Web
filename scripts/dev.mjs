#!/usr/bin/env node
// Runs `next dev` with Turbopack's cache (.next/dev/cache) in RAM when /dev/shm
// exists (Linux). The cache is thousands of small files read and written on every
// compile; on a spinning disk each costs a seek, turning compiles into minutes.
// Only the cache moves: build output stays under .next so loaders (PostCSS,
// Tailwind) still resolve node_modules. After a reboot the cache rebuilds once.
// Set NEXT_CACHE_ON_DISK=1 to opt out.
import { spawn } from "node:child_process";
import { lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const cache = join(root, ".next", "dev", "cache");
const ram = "/dev/shm/ecl-web-turbopack-cache";

function linkTarget(path) {
  try {
    const stat = lstatSync(path);
    return stat.isSymbolicLink() ? readlinkSync(path) : "dir";
  } catch {
    return null;
  }
}

if (process.platform === "linux" && process.env.NEXT_CACHE_ON_DISK !== "1") {
  try {
    mkdirSync(ram, { recursive: true });
    if (linkTarget(cache) !== ram) {
      rmSync(cache, { recursive: true, force: true });
      mkdirSync(join(root, ".next", "dev"), { recursive: true });
      symlinkSync(ram, cache);
    }
    console.log(`[dev] Turbopack cache in RAM at ${ram}`);
  } catch (err) {
    console.warn(`[dev] RAM cache unavailable, using disk: ${err.message}`);
  }
}

const child = spawn(join(root, "node_modules/.bin/next"), ["dev", ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
});
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
