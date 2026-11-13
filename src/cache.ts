import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export interface CacheEntry {
  url: string;
  fetchedAt: string;
  body: string;
}

export function cacheDir(): string {
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    return path.join(localAppData, "poe-wiki-cli", "cache");
  }
  const xdgCache = process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache");
  return path.join(xdgCache, "poe-wiki-cli");
}

export function cacheFile(requestUrl: string): string {
  const digest = createHash("sha256").update(requestUrl).digest("hex");
  return path.join(cacheDir(), `${digest}.json`);
}

export async function readCache(requestUrl: string, ttlSeconds: number): Promise<CacheEntry | null> {
  try {
    const raw = await fs.readFile(cacheFile(requestUrl), "utf8");
    const entry = JSON.parse(raw) as Partial<CacheEntry>;
    if (typeof entry.fetchedAt !== "string" || typeof entry.body !== "string") {
      return null;
    }
    const fetchedAt = Date.parse(entry.fetchedAt);
    if (!Number.isFinite(fetchedAt)) {
      return null;
    }
    if (Date.now() - fetchedAt > ttlSeconds * 1000) {
      return null;
    }
    return {
      url: typeof entry.url === "string" && entry.url ? entry.url : requestUrl,
      fetchedAt: entry.fetchedAt,
      body: entry.body,
    };
  } catch {
    return null;
  }
}

export async function writeCache(requestUrl: string, finalUrl: string, body: string): Promise<void> {
  try {
    await fs.mkdir(cacheDir(), { recursive: true });
    const entry: CacheEntry = {
      url: finalUrl || requestUrl,
      fetchedAt: new Date().toISOString(),
      body,
    };
    await fs.writeFile(cacheFile(requestUrl), JSON.stringify(entry), "utf8");
  } catch {
    // 缓存目录不可写时静默降级为不缓存，不能因此让查询失败。
  }
}
