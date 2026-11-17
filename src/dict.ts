import { parse as parseHtml } from "node-html-parser";
import { getText } from "./http.js";
import { decodeHtmlEntities, extractPageContent } from "./markdown.js";
import { sitesFor, type Game } from "./sites.js";
import { collapseSpaces, normalizeName } from "./text.js";
import type { Lang } from "./types.js";

export { normalizeName };

export interface DictEntry {
  label: string;
  value: string;
  desc?: string;
  class?: string;
}

export interface DictOptions {
  game: Game;
  lang: Lang;
  timeoutMs: number;
  noCache: boolean;
  /** `--no-dict` 只跳过自动补全词典，首页站内链接索引仍然可用。 */
  skipDict?: boolean;
}

/**
 * 首页锚文本索引：中文标签 → slug 数组。同名标签可能指向不同页面
 * （`深渊` 同时是 `Breach` 与 `Abyss`），因此必须是候选数组，不能单值覆盖。
 */
export interface NavIndex {
  byLabel: Map<string, string[]>;
}

export interface NameSources {
  dict: Map<string, DictEntry> | null;
  nav: NavIndex | null;
}

const HOME_TTL_SECONDS = 3600;
const HEADER_TTL_SECONDS = 86_400;
const DICT_TTL_SECONDS = 72_000;

/**
 * 已从游戏中移除、但词典快照仍保留的条目。首页链接索引天然不含这些页面，
 * 词典命中后必然 404，所以加载时直接剔除，避免把死链当成确定结果。
 * 只匹配单数 `Scarab`，复数 `Scarabs`（如 Mavens_Chisel_of_Scarabs）仍是活页面。
 */
const RETIRED_SLUG = /^(?:.*_)?Scarab(?:_|$)/;

const SLUG_PATTERN = /^[A-Za-z0-9_%.-]+$/;

/** 进程内缓存，避免同一次运行里反复解析 500 KB 的词典。 */
const nameSources = new Map<string, NameSources>();

export function buildDictIndex(entries: DictEntry[]): Map<string, DictEntry> {
  const index = new Map<string, DictEntry>();

  for (const entry of entries) {
    if (!entry || typeof entry.label !== "string" || typeof entry.value !== "string") {
      continue;
    }
    addEntry(index, normalizeName(entry.label), entry);
    addEntry(index, normalizeName(entry.value), entry);
  }

  return index;
}

/**
 * 只有精确命中才是确定结果。前缀/包含匹配一律走 `lookupFuzzy` 出候选，
 * 因为「圣甲虫」这类查询在模糊匹配下会落到完全无关的页面。
 */
export function lookupDict(index: Map<string, DictEntry>, query: string): DictEntry | null {
  const key = normalizeName(query);
  if (!key) {
    return null;
  }
  return index.get(key) ?? null;
}

/** 按前缀优先、包含次之的顺序给出候选，供调用方展示而非直接采用。 */
export function lookupFuzzy(index: Map<string, DictEntry>, query: string, limit = 8): DictEntry[] {
  const key = normalizeName(query);
  if (!key) {
    return [];
  }

  const prefix: DictEntry[] = [];
  const contains: DictEntry[] = [];
  const seen = new Set<DictEntry>();

  for (const [candidate, entry] of index) {
    if (seen.has(entry)) {
      continue;
    }
    if (candidate.startsWith(key)) {
      seen.add(entry);
      prefix.push(entry);
    } else if (candidate.includes(key)) {
      seen.add(entry);
      contains.push(entry);
    }
  }

  return [...prefix, ...contains].slice(0, limit);
}

export function lookupNav(index: NavIndex | null, query: string): string[] {
  const key = normalizeName(query);
  if (!key) {
    return [];
  }
  return index?.byLabel.get(key) ?? [];
}

export function lookupNavFuzzy(index: NavIndex | null, query: string, limit = 8): string[] {
  const key = normalizeName(query);
  if (!index || !key) {
    return [];
  }

  const prefix: string[] = [];
  const contains: string[] = [];

  for (const [label, slugs] of index.byLabel) {
    if (label.startsWith(key)) {
      prefix.push(...slugs);
    } else if (label.includes(key)) {
      contains.push(...slugs);
    }
  }

  return [...new Set([...prefix, ...contains])].slice(0, limit);
}

/**
 * 首页 HTML 已经为了拿 header 脚本而下载过，顺带解析其中的站内链接，
 * 就能得到一张天然反映当前版本的内容索引：页面被删，链接就消失，
 * 不需要维护任何黑名单。
 */
export function parseNavIndex(html: string, lang: Lang): NavIndex {
  const byLabel = new Map<string, string[]>();
  const root = parseHtml(extractPageContent(html), { comment: false });
  const prefix = `/${lang}/`;

  for (const anchor of root.querySelectorAll("a")) {
    const href = anchor.getAttribute("href");
    if (!href || !href.startsWith(prefix)) {
      continue;
    }

    const slug = href.slice(prefix.length);
    if (!slug || slug.includes("/") || !SLUG_PATTERN.test(slug) || slug.toLowerCase() === "search") {
      continue;
    }

    const label = collapseSpaces(decodeHtmlEntities(anchor.text));
    if (!label) {
      continue;
    }

    const key = normalizeName(label);
    if (!key) {
      continue;
    }

    const existing = byLabel.get(key);
    if (!existing) {
      byLabel.set(key, [slug]);
    } else if (!existing.includes(slug)) {
      existing.push(slug);
    }
  }

  return { byLabel };
}

export function isRetiredSlug(slug: string): boolean {
  return RETIRED_SLUG.test(slug);
}

/** 词典与首页索引来自同一次首页抓取，按 game:lang 合并缓存。 */
export async function loadNameSources(options: DictOptions): Promise<NameSources> {
  const cacheKey = `${options.game}:${options.lang}${options.skipDict ? ":nav" : ""}`;
  const cached = nameSources.get(cacheKey);
  if (cached) {
    return cached;
  }

  const loaded = await fetchNameSources(options);
  // 两层都拿不到时不写缓存，否则一次网络抖动会让后续查询在整个进程里一直降级。
  if (loaded.dict || loaded.nav) {
    nameSources.set(cacheKey, loaded);
  }
  return loaded;
}

export function extractHeaderScript(html: string, fallbackOrigin = "https://poedb.tw"): string | null {
  const match = /<script\b[^>]*\bsrc=["']([^"']*(?:poedb|poe2db)_header[^"']*\.js)["']/i.exec(html);
  if (!match) {
    return null;
  }

  const src = match[1].trim();
  if (src.startsWith("//")) {
    return `https:${src}`;
  }
  if (/^https?:\/\//i.test(src)) {
    return src;
  }
  try {
    return new URL(src, fallbackOrigin).href;
  } catch {
    return null;
  }
}

export function extractDictFilename(source: string, lang: Lang): string | null {
  const match = new RegExp(`autocomplete_${lang}\\.[0-9a-f]{16}\\.json`, "i").exec(source);
  return match ? match[0] : null;
}

async function fetchNameSources(options: DictOptions): Promise<NameSources> {
  const sites = sitesFor(options.game);

  let home: string;
  try {
    const response = await getText(`${sites.dbOrigin}/${options.lang}/`, {
      timeoutMs: options.timeoutMs,
      noCache: options.noCache,
      cacheTtlSeconds: HOME_TTL_SECONDS,
      accept: "text/html",
    });
    home = response.body;
  } catch {
    return { dict: null, nav: null };
  }

  const nav = parseNavIndex(home, options.lang);

  let dict: Map<string, DictEntry> | null = null;
  if (!options.skipDict) {
    try {
      dict = await fetchDict(options, home);
    } catch {
      // 词典失败不影响首页索引，机制类查询仍可用。
      dict = null;
    }
  }

  return { dict, nav };
}

async function fetchDict(options: DictOptions, home: string): Promise<Map<string, DictEntry> | null> {
  const sites = sitesFor(options.game);
  const headerUrl = extractHeaderScript(home, sites.dbOrigin);
  if (!headerUrl) {
    return null;
  }

  const header = await getText(headerUrl, {
    timeoutMs: options.timeoutMs,
    noCache: options.noCache,
    cacheTtlSeconds: HEADER_TTL_SECONDS,
    accept: "application/javascript",
  });

  const filename = extractDictFilename(header.body, options.lang);
  if (!filename) {
    return null;
  }

  const dictionaryUrl = new URL(`/json/${filename}`, headerUrl).href;
  const dictionary = await getText(dictionaryUrl, {
    timeoutMs: options.timeoutMs,
    noCache: options.noCache,
    cacheTtlSeconds: DICT_TTL_SECONDS,
    accept: "application/json",
  });

  const parsed = JSON.parse(dictionary.body) as unknown;
  if (!Array.isArray(parsed)) {
    return null;
  }

  const entries = parsed.filter(isDictEntry).filter((entry) => !isRetiredSlug(entry.value));
  return entries.length > 0 ? buildDictIndex(entries) : null;
}

function addEntry(index: Map<string, DictEntry>, key: string, entry: DictEntry): void {
  if (!key || index.has(key)) {
    return;
  }
  index.set(key, entry);
}

function isDictEntry(value: unknown): value is DictEntry {
  if (!value || typeof value !== "object") {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return typeof entry.label === "string" && typeof entry.value === "string";
}
