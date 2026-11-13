import { getText } from "../http.js";
import { decodeHtmlEntities, htmlToMarkdown, sanitizeHtml } from "../markdown.js";
import { LANGUAGES, type Lang } from "../types.js";

export const POEDB_ORIGIN = "https://poedb.tw";

const PAGE_TTL_SECONDS = 3600;
const SEARCH_TTL_SECONDS = 300;

export interface PoedbOptions {
  lang?: Lang;
  timeoutMs?: number;
  noCache?: boolean;
}

export interface PoedbSearchHit {
  title: string;
  url: string;
  html: string;
  locale: Lang;
}

export interface PoedbPage {
  title: string;
  url: string;
  locale: Lang;
  markdown: string;
}

export interface PoedbHtmlPage {
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
 * 判断 poedb 搜索最终落在哪里算「未命中」。除了跳回首页 `/{lang}/`，
 * poedb 还有第三种结果：停在 `/{lang}/search?q=...` 的空搜索页（title 为
 * "search - PoEDB..."），正文没有任何条目，必须当成未命中而不是页面正文。
 */
export function isMissUrl(finalUrl: URL | string, lang: Lang): boolean {
  const url = typeof finalUrl === "string" ? new URL(finalUrl) : finalUrl;
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length === 0 || segments[0] !== lang || segments.length === 1) {
    return true;
  }
  return segments[1] === "search";
}

/**
 * poedb 的搜索是 302 跳转语义：命中时跳到目标页，未命中时跳回 /{lang}/。
 * 大小写敏感且不统一（headhunter 命中、Headhunter 失败），所以按
 * 「原样 → 全小写」依次尝试，任一变体命中即返回。
 */
export async function resolve(query: string, options: PoedbOptions = {}): Promise<PoedbSearchHit | null> {
  const locale = inferLang(query, options.lang);
  const base = query.trim();
  const variants = [...new Set([base, base.toLowerCase()].filter(Boolean))];

  for (const variant of variants) {
    const searchUrl = `${POEDB_ORIGIN}/${locale}/search?q=${encodeURIComponent(variant)}`;
    const response = await getText(searchUrl, {
      timeoutMs: options.timeoutMs,
      noCache: options.noCache,
      cacheTtlSeconds: SEARCH_TTL_SECONDS,
      accept: "text/html",
    });

    const finalUrl = new URL(response.url);
    if (isMissUrl(finalUrl, locale)) {
      continue;
    }

    const segments = finalUrl.pathname.split("/").filter(Boolean);
    const slug = decodeURIComponent(segments.slice(1).join("/")).replace(/_/g, " ");
    return {
      title: extractTitle(response.body, slug),
      url: finalUrl.href,
      html: response.body,
      locale,
    };
  }

  return null;
}

export async function fetchPage(url: string, options: PoedbOptions = {}): Promise<PoedbPage> {
  const response = await getText(url, {
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

  return { title, url: response.url, locale, markdown };
}

export async function fetchPageHtml(url: string, options: PoedbOptions = {}): Promise<PoedbHtmlPage> {
  const response = await getText(url, {
    timeoutMs: options.timeoutMs,
    noCache: options.noCache,
    cacheTtlSeconds: PAGE_TTL_SECONDS,
    accept: "text/html",
  });

  const locale = localeFromUrl(response.url) ?? options.lang ?? inferLang(url);
  return {
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
