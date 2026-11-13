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
    await pruneCacheOnce();
  } catch {
    // 缓存目录不可写时静默降级为不缓存，不能因此让查询失败。
  }
}

export interface CacheFileInfo {
  path: string;
  mtime: number;
}

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FILES = 500;

let pruneStarted = false;

/**
 * 选择要删除的缓存文件：先清掉超过 7 天的，再按 mtime 从旧到新把总数压到 500。
 * 纯函数便于测试，真正的删除由 pruneCacheOnce 负责。
 */
export function selectPrunableFiles(files: CacheFileInfo[], now: number): string[] {
  const cutoff = now - MAX_AGE_MS;
  const expired = files.filter((file) => file.mtime < cutoff);
  const alive = files
    .filter((file) => file.mtime >= cutoff)
    .sort((a, b) => a.mtime - b.mtime);

  const overflow = Math.max(0, alive.length - MAX_FILES);
  return [...expired, ...alive.slice(0, overflow)].map((file) => file.path);
}

/**
 * 每个进程最多清理一次；任何错误都静默忽略，绝不影响查询。
 */
export async function pruneCacheOnce(): Promise<void> {
  if (pruneStarted) {
    return;
  }
  pruneStarted = true;

  try {
    const dir = cacheDir();
    const names = await fs.readdir(dir);
    const files: CacheFileInfo[] = [];

    for (const name of names) {
      if (!name.endsWith(".json")) {
        continue;
      }
      const file = path.join(dir, name);
      try {
        const stats = await fs.stat(file);
        files.push({ path: file, mtime: stats.mtimeMs });
      } catch {
        // 文件可能刚好被另一个进程删掉，跳过即可。
      }
    }

    for (const victim of selectPrunableFiles(files, Date.now())) {
      try {
        await fs.unlink(victim);
      } catch {
        // 删除失败同样忽略。
      }
    }
  } catch {
    // 缓存目录不可读时直接跳过清理。
  }
}
