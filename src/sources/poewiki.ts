import { BlockedError, getText, isBlockedBody, NetworkError, NotFoundError } from "../http.js";
import { decodeHtmlEntities, htmlToMarkdown } from "../markdown.js";

export const WIKI_ORIGIN = "https://www.poewiki.net";
export const WIKI_API = `${WIKI_ORIGIN}/w/api.php`;

const PAGE_TTL_SECONDS = 3600;
const SEARCH_TTL_SECONDS = 300;

export interface WikiOptions {
  timeoutMs?: number;
  noCache?: boolean;
}

export interface WikiSearchHit {
  title: string;
  url: string;
  snippet: string;
  size: number;
  wordcount: number;
}

export interface WikiPage {
  title: string;
  url: string;
  markdown: string;
}

export interface WikiHtmlPage {
  title: string;
  url: string;
  html: string;
}

interface SearchPage {
  title?: string;
  index?: number;
  extract?: string;
}

interface SearchResponse {
  query?: {
    pages?: SearchPage[] | Record<string, SearchPage>;
  };
}

interface ParseResponse {
  parse?: {
    title?: string;
    text?: string;
  };
  error?: {
    code?: string;
    info?: string;
  };
}

/**
 * 用 generator=search + prop=extracts 一次拿到条目简介。
 * list=search 的 snippet 是从正文任意位置截的片段，经常从句子中间开始，
 * 对 agent 没有信息量；extracts 的 exintro 能给出条目开头。
 */
export async function search(query: string, limit: number, options: WikiOptions = {}): Promise<WikiSearchHit[]> {
  const url =
    `${WIKI_API}?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=${limit}` +
    `&prop=extracts&exintro=1&explaintext=1&exchars=300&exlimit=max&format=json&formatversion=2`;
  const response = await getText(url, {
    timeoutMs: options.timeoutMs,
    noCache: options.noCache,
    cacheTtlSeconds: SEARCH_TTL_SECONDS,
    accept: "application/json",
  });

  const data = parseJson<SearchResponse>(response.body, url, `${WIKI_API}?action=query&generator=search`);
  return parseSearchPages(data);
}

/** generator 返回的顺序不保证与相关度一致，按 index 升序还原。 */
export function parseSearchPages(data: SearchResponse): WikiSearchHit[] {
  const pages = data.query?.pages;
  if (!pages) {
    return [];
  }

  const list = Array.isArray(pages) ? pages : Object.values(pages);
  return list
    .filter((page): page is SearchPage => typeof page?.title === "string" && page.title.length > 0)
    .sort((a, b) => (a.index ?? Number.MAX_SAFE_INTEGER) - (b.index ?? Number.MAX_SAFE_INTEGER))
    .map((page) => ({
      title: page.title as string,
      url: pageUrl(page.title as string),
      snippet: collapse(decodeHtmlEntities(page.extract ?? "")),
      size: 0,
      wordcount: 0,
    }));
}

export async function fetchPage(title: string, options: WikiOptions = {}): Promise<WikiPage> {
  const page = await loadPage(title, options);
  return buildPage(page);
}

export async function fetchPageHtml(title: string, options: WikiOptions = {}): Promise<WikiHtmlPage> {
  const page = await loadPage(title, options);
  return { title: page.title, url: pageUrl(page.title), html: page.html };
}

async function loadPage(title: string, options: WikiOptions): Promise<{ title: string; html: string }> {
  const direct = await requestParse(title, options);
  if (direct) {
    return direct;
  }

  const hits = await search(title, 1, options);
  const fallback = hits[0];
  if (!fallback) {
    throw new NotFoundError(`poewiki 没有「${title}」对应的页面。`, "换一个关键词，或直接用 search 命令查看候选条目。");
  }

  const resolved = await requestParse(fallback.title, options);
  if (!resolved) {
    throw new NotFoundError(`poewiki 无法加载「${fallback.title}」。`, "该条目可能已被删除或重命名，可重新搜索。");
  }
  return resolved;
}

export function pageUrl(title: string): string {
  const path = title
    .split("/")
    .map((segment) => encodeURIComponent(segment.replace(/ /g, "_")))
    .join("/");
  return `${WIKI_ORIGIN}/wiki/${path}`;
}

export function titleFromUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const fromQuery = url.searchParams.get("title");
    if (fromQuery) {
      return fromQuery.trim();
    }
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments[0] !== "wiki" || segments.length < 2) {
      return null;
    }
    return decodeURIComponent(segments.slice(1).join("/")).replace(/_/g, " ");
  } catch {
    return null;
  }
}

function buildPage(parsed: { title: string; html: string }): WikiPage {
  const url = pageUrl(parsed.title);
  return {
    title: parsed.title,
    url,
    markdown: htmlToMarkdown(parsed.html, { baseUrl: url }),
  };
}

async function requestParse(title: string, options: WikiOptions): Promise<{ title: string; html: string } | null> {
  const url = `${WIKI_API}?action=parse&page=${encodeURIComponent(title)}&prop=text&format=json&formatversion=2&redirects=1&disableeditsection=1&disabletoc=1`;
  const response = await getText(url, {
    timeoutMs: options.timeoutMs,
    noCache: options.noCache,
    cacheTtlSeconds: PAGE_TTL_SECONDS,
    accept: "application/json",
  });

  const data = parseJson<ParseResponse>(response.body, url, pageUrl(title));

  if (data.error) {
    const code = data.error.code ?? "";
    if (code === "missingtitle" || code === "invalidtitle" || code === "nosuchpageid") {
      return null;
    }
    throw new NetworkError(
      `poewiki API 返回错误：${data.error.info ?? code ?? "未知错误"}`,
      "稍后重试，或改用 search 命令确认条目名称。",
    );
  }

  if (!data.parse || typeof data.parse.text !== "string") {
    // 返回 200 但不是 MediaWiki 的 JSON 结构，通常是 Anubis 验证页的变体。
    throw new BlockedError(
      `poewiki 返回的内容不是页面数据：${pageUrl(title)}`,
      "请求可能被反爬验证页替换，请稍后重试。",
    );
  }

  return {
    title: data.parse.title?.trim() || title,
    html: data.parse.text,
  };
}

function parseJson<T>(body: string, requestUrl: string, sourceHint: string): T {
  try {
    return JSON.parse(body) as T;
  } catch {
    if (isBlockedBody(body) || (!body.includes("mw-parser-output") && !body.includes('"parse"'))) {
      throw new BlockedError(
        `poewiki 返回了反爬验证页而不是数据：${sourceHint}`,
        "本工具已使用非浏览器 UA，若仍被拦截请稍后重试，或改用 --source poedb。",
      );
    }
    throw new NetworkError(`poewiki 返回了无法解析的响应：${requestUrl}`, "稍后重试；若持续出现，请确认网络是否被代理改写。");
  }
}

function collapse(text: string): string {
  return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
