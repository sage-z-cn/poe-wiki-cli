import { getText } from "./http.js";
import { sitesFor, type Game } from "./sites.js";
import type { Lang } from "./types.js";

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
}

const BRACKETS = /[【】[\]（）()]/g;
const HOME_TTL_SECONDS = 3600;
const HEADER_TTL_SECONDS = 86_400;
const DICT_TTL_SECONDS = 72_000;

/** 进程内缓存，避免同一次运行里反复解析 500 KB 的词典。 */
const dictionaries = new Map<string, Map<string, DictEntry>>();

/**
 * 词典里的 label 常带全角/半角括号与多余空格，slug 用下划线连接，
 * 统一归一化后才能和用户输入对上。
 */
export function normalizeName(input: string): string {
  let value = input;
  try {
    // 词典里的 slug 带百分号编码（Sirus%2C_...），先解码才能和用户输入对上。
    value = decodeURIComponent(value);
  } catch {
    // 不完整的编码按原文处理。
  }
  return value
    .normalize("NFKC")
    .replace(BRACKETS, " ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

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

export function lookupDict(index: Map<string, DictEntry>, query: string): DictEntry | null {
  const key = normalizeName(query);
  if (!key) {
    return null;
  }

  const exact = index.get(key);
  if (exact) {
    return exact;
  }

  // 仅当恰好只有一条候选时才接受模糊匹配：两个以上候选说明有歧义，宁可回退搜索。
  // 同一词条的 label 与 value 会各建一条索引，必须按「词条」去重后再判断数量。
  const prefix = new Set<DictEntry>();
  const contains = new Set<DictEntry>();
  for (const [candidate, entry] of index) {
    if (candidate.startsWith(key)) {
      prefix.add(entry);
    } else if (candidate.includes(key)) {
      contains.add(entry);
    }
  }

  if (prefix.size === 1) {
    return [...prefix][0];
  }
  if (prefix.size === 0 && contains.size === 1) {
    return [...contains][0];
  }
  return null;
}

export async function resolveDictSlug(query: string, options: DictOptions): Promise<string | null> {
  const cacheKey = `${options.game}:${options.lang}`;
  let index = dictionaries.get(cacheKey);

  if (!index) {
    let loaded: Map<string, DictEntry> | null;
    try {
      loaded = await loadDictionary(options);
    } catch {
      return null;
    }
    if (!loaded) {
      return null;
    }
    dictionaries.set(cacheKey, loaded);
    index = loaded;
  }

  return lookupDict(index, query)?.value ?? null;
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

async function loadDictionary(options: DictOptions): Promise<Map<string, DictEntry> | null> {
  const sites = sitesFor(options.game);
  const home = await getText(`${sites.dbOrigin}/${options.lang}/`, {
    timeoutMs: options.timeoutMs,
    noCache: options.noCache,
    cacheTtlSeconds: HOME_TTL_SECONDS,
    accept: "text/html",
  });

  const headerUrl = extractHeaderScript(home.body, sites.dbOrigin);
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

  const entries = parsed.filter(isDictEntry);
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
