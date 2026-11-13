import { parse as parseHtml } from "node-html-parser";
import { normalizeName } from "../dict.js";
import { getText } from "../http.js";
import { decodeHtmlEntities, htmlToMarkdown, sanitizeHtml } from "../markdown.js";
import { gameFromHost, sitesFor, type Game } from "../sites.js";
import { LANGUAGES, type Lang } from "../types.js";

const PAGE_TTL_SECONDS = 3600;
const SEARCH_TTL_SECONDS = 300;

export interface PoedbOptions {
  game?: Game;
  lang?: Lang;
  timeoutMs?: number;
  noCache?: boolean;
}

export interface PoedbSearchHit {
  game: Game;
  title: string;
  url: string;
  html?: string;
  locale: Lang;
}

export interface ResolveResult {
  hit: PoedbSearchHit | null;
  candidates: PoedbSearchHit[];
}

export interface PoedbPage {
  game: Game;
  title: string;
  url: string;
  locale: Lang;
  markdown: string;
}

export interface PoedbHtmlPage {
  game: Game;
  title: string;
  url: string;
  locale: Lang;
  html: string;
}

export function isLang(value: string): value is Lang {
  return (LANGUAGES as readonly string[]).includes(value);
}

/**
 * poedb 的查询语言与站点 locale 必须一致：/us/search?q=猎首 会落回首页，
 * /cn/search?q=Headhunter 同样会失败。用户没显式指定 --lang 时按查询词推断，
 * 保证中文标题默认命中 /cn/，英文标题默认命中 /us/。
 */
export function inferLang(query: string, explicit?: Lang): Lang {
  if (explicit) {
    return explicit;
  }
  return /\p{Script=Han}/u.test(query) ? "cn" : "us";
}

export function localeFromUrl(url: string): Lang | undefined {
  try {
    const segment = new URL(url).pathname.split("/").filter(Boolean)[0];
    return segment && isLang(segment) ? segment : undefined;
  } catch {
    return undefined;
  }
}

/**
 * poedb 的路径里逗号必须写成 %2C，否则直接 404：
 * /us/Sirus,_Awakener_of_Worlds 失败，/us/Sirus%2C_Awakener_of_Worlds 才是正确页面。
 * 用户从别处复制来的链接通常是字面逗号，统一在这里编码。
 */
export function encodeDbPath(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.pathname = parsed.pathname.replace(/,/g, "%2C");
    return parsed.href;
  } catch {
    return url.replace(/,/g, "%2C");
  }
}

/**
 * poedb 的搜索是 302 跳转语义：命中时跳到目标页，未命中时跳回 /{lang}/。
 * 大小写敏感且不统一（headhunter 命中、Headhunter 失败），所以按
 * 「原样 → 全小写」依次尝试，任一命中即返回。
 *
 * 未命中时 poedb 还会返回 200 的搜索结果页（路径 /{lang}/search），
 * 里面的候选列表要解析出来，不能直接当成「没有结果」丢掉。
 */
export async function resolveDetailed(query: string, options: PoedbOptions = {}): Promise<ResolveResult> {
  const game = options.game ?? "poe1";
  const sites = sitesFor(game);
  const locale = inferLang(query, options.lang);
  const base = query.trim();
  const variants = [...new Set([base, base.toLowerCase()].filter(Boolean))];

  for (const variant of variants) {
    const searchUrl = `${sites.dbOrigin}/${locale}/search?q=${encodeURIComponent(variant)}`;
    const response = await getText(searchUrl, {
      timeoutMs: options.timeoutMs,
      noCache: options.noCache,
      cacheTtlSeconds: SEARCH_TTL_SECONDS,
      accept: "text/html",
    });

    const finalUrl = new URL(response.url);
    const segments = finalUrl.pathname.split("/").filter(Boolean);

    if (segments.length === 0 || segments[0] !== locale || segments.length === 1) {
      continue;
    }

    if (segments[1] === "search") {
      const candidates = parseDbSearchResults(response.body, finalUrl.href, locale);
      if (candidates.length > 0) {
        return { hit: pickCandidate(candidates, query), candidates };
      }
      continue;
    }

    const slug = decodeURIComponent(segments.slice(1).join("/")).replace(/_/g, " ");
    return {
      hit: {
        game,
        title: extractTitle(response.body, slug),
        url: finalUrl.href,
        html: response.body,
        locale,
      },
      candidates: [],
    };
  }

  return { hit: null, candidates: [] };
}

/**
 * 解析 `/{lang}/search` 结果页里的条目卡片。同一目标会在卡片里重复出现，
 * 统一按「解码后的路径」去重，保留首次出现的顺序。
 */
export function parseDbSearchResults(html: string, baseUrl: string, lang: Lang): PoedbSearchHit[] {
  const root = parseHtml(sanitizeHtml(html), { comment: false });
  const results: PoedbSearchHit[] = [];
  const seen = new Set<string>();
  let origin: string;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return results;
  }
  const game = gameFromHost(origin) ?? "poe1";

  for (const card of root.querySelectorAll("div.card")) {
    for (const anchor of card.querySelectorAll("ul.list-group li.list-group-item a")) {
      const title = collapse(anchor.text);
      if (!title) {
        continue;
      }

      const href = anchor.getAttribute("href");
      if (!href) {
        continue;
      }

      let target: URL;
      try {
        target = new URL(href, baseUrl);
      } catch {
        continue;
      }

      if (target.origin !== origin) {
        continue;
      }

      const segments = target.pathname.split("/").filter(Boolean);
      if (segments.length < 2 || segments[0] !== lang) {
        continue;
      }

      const slug = segments.slice(1).join("/");
      if (!slug || slug.toLowerCase() === "search") {
        continue;
      }

      const key = normalizedUrlKey(target);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      results.push({ game, title, url: target.href, locale: lang });
    }
  }

  return results;
}

/**
 * 结果页只有一个候选时直接采用；多个候选时只接受标题与查询串完全一致的那一个，
 * 其余情况交给调用方处理，绝不能默认取第一条。
 */
export function pickCandidate(candidates: PoedbSearchHit[], query: string): PoedbSearchHit | null {
  if (candidates.length === 1) {
    return candidates[0];
  }

  const normalized = normalizeName(query);
  if (!normalized) {
    return null;
  }

  const exact = candidates.filter((candidate) => normalizeName(candidate.title) === normalized);
  return exact.length === 1 ? exact[0] : null;
}

function normalizedUrlKey(url: URL): string {
  let path = url.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    // 非法百分号编码就保留原样参与去重。
  }
  return `${url.origin}${path.replace(/\/+$/, "")}`;
}

function collapse(text: string): string {
  return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

export async function fetchPage(url: string, options: PoedbOptions = {}): Promise<PoedbPage> {
  const game = options.game ?? "poe1";
  const response = await getText(encodeDbPath(url), {
    timeoutMs: options.timeoutMs,
    noCache: options.noCache,
    cacheTtlSeconds: PAGE_TTL_SECONDS,
    accept: "text/html",
  });

  const locale = localeFromUrl(response.url) ?? options.lang ?? inferLang(url);
  const container = extractPageContent(response.body);
  const slug = slugFromUrl(response.url);
  const title = extractTitle(response.body, slug);
  const markdown = htmlToMarkdown(container, { baseUrl: response.url });

  return { game, title, url: response.url, locale, markdown };
}

export async function fetchPageHtml(url: string, options: PoedbOptions = {}): Promise<PoedbHtmlPage> {
  const game = options.game ?? "poe1";
  const response = await getText(encodeDbPath(url), {
    timeoutMs: options.timeoutMs,
    noCache: options.noCache,
    cacheTtlSeconds: PAGE_TTL_SECONDS,
    accept: "text/html",
  });

  const locale = localeFromUrl(response.url) ?? options.lang ?? inferLang(url);
  return {
    game,
    title: extractTitle(response.body, slugFromUrl(response.url)),
    url: response.url,
    locale,
    html: response.body,
  };
}

/**
 * 抽出 div.page-content[role=main] 的内部 HTML。poedb 的页面存在多余的
 * </div>，直接用解析器找容器会被提前闭合，所以按字符位置切到 <footer 之前，
 * 再交给 markdown 转换器（多余的闭合标签不会丢内容）。
 */
export function extractPageContent(html: string): string {
  const sanitized = sanitizeHtml(html);
  const opening = /<div\b[^>]*\bclass="[^"]*\bpage-content\b[^"]*"[^>]*>/i.exec(sanitized);
  if (!opening) {
    return sanitized;
  }
  const start = opening.index + opening[0].length;
  const footerIndex = sanitized.indexOf("<footer", start);
  const end = footerIndex === -1 ? sanitized.length : footerIndex;
  return sanitized.slice(start, end);
}

function slugFromUrl(url: string): string {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    return segments.length > 1 ? decodeURIComponent(segments.slice(1).join("/")).replace(/_/g, " ") : "poedb";
  } catch {
    return "poedb";
  }
}

function extractTitle(html: string, fallback: string): string {
  const match = /<title>([\s\S]*?)<\/title>/i.exec(html);
  if (!match) {
    return fallback;
  }
  const head = match[1].split(" - ")[0]?.trim();
  return head ? decodeHtmlEntities(head) : fallback;
}
