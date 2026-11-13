import { NotFoundError, UsageError } from "../http.js";
import { extractSections } from "../markdown.js";
import {
  fetchPage as fetchPoedbPage,
  fetchPageHtml as fetchPoedbPageHtml,
  inferLang,
  localeFromUrl,
  resolve as resolvePoedb,
} from "../sources/poedb.js";
import { fetchPage as fetchWikiPage, fetchPageHtml as fetchWikiPageHtml, titleFromUrl } from "../sources/poewiki.js";
import type { Lang, PageDocument, PageHtmlDocument, PageSource, SourceName } from "../types.js";

export interface PageOptions {
  source: PageSource;
  lang?: Lang;
  timeoutMs: number;
  noCache: boolean;
  maxChars: number;
  sections: boolean;
  html: boolean;
}

export type PageResult = PageDocument | PageHtmlDocument;

type TargetSource = "poedb" | "wiki";

type Target =
  | { kind: "url"; url: string; source: TargetSource; title: string; locale?: Lang }
  | { kind: "title"; title: string; source?: TargetSource };

interface LoadedPage {
  source: SourceName;
  title: string;
  url: string;
  markdown?: string;
  html?: string;
  locale?: Lang;
}

export async function runPage(target: string, options: PageOptions): Promise<PageResult> {
  const parsed = parseTarget(target);
  const page = await load(parsed, options);
  const fetchedAt = new Date().toISOString();

  if (options.html) {
    const sourceHtml = prepareHtmlDump(page.html ?? "");
    const limited = truncate(sourceHtml, options.maxChars, true);
    const document: PageHtmlDocument = {
      source: page.source,
      title: page.title,
      url: page.url,
      html: limited.text,
      fetchedAt,
      truncated: limited.truncated,
      originalChars: sourceHtml.length,
    };
    if (page.locale) {
      document.locale = page.locale;
    }
    return document;
  }

  const markdown = page.markdown ?? "";
  const sections = options.sections ? extractSections(markdown) : undefined;
  const limited = truncate(markdown, options.maxChars, false);

  const document: PageDocument = {
    source: page.source,
    title: page.title,
    url: page.url,
    markdown: limited.text,
    fetchedAt,
    truncated: limited.truncated,
    originalChars: markdown.length,
  };

  if (page.locale) {
    document.locale = page.locale;
  }
  if (sections) {
    document.sections = sections;
  }

  return document;
}

export function parseTarget(raw: string): Target {
  const value = raw.trim();
  if (!value) {
    throw new UsageError("页面标题或链接不能为空。");
  }

  if (/^https?:\/\//i.test(value)) {
    return parseUrl(value);
  }

  const prefixed = /^(poedb|wiki|poewiki):(.+)$/i.exec(value);
  if (prefixed) {
    const rest = prefixed[2].trim();
    if (!rest) {
      throw new UsageError("站点前缀后面需要跟页面标题，例如 poedb:Headhunter。");
    }
    if (/^https?:\/\//i.test(rest)) {
      return parseUrl(rest);
    }
    return {
      kind: "title",
      title: rest,
      source: prefixed[1].toLowerCase() === "poedb" ? "poedb" : "wiki",
    };
  }

  return { kind: "title", title: value };
}

async function load(parsed: Target, options: PageOptions): Promise<LoadedPage> {
  const common = { timeoutMs: options.timeoutMs, noCache: options.noCache };

  if (parsed.kind === "url") {
    // 完整链接本身已经指明站点，优先于 --source。
    if (parsed.source === "poedb") {
      return loadPoedbUrl(parsed.url, options, common, parsed.locale);
    }
    const title = parsed.title || titleFromUrl(parsed.url);
    if (!title) {
      throw new UsageError(`无法从链接中解析出 poewiki 标题：${parsed.url}`);
    }
    return loadWikiTitle(title, options, common);
  }

  const requested = parsed.source ?? (options.source === "auto" ? undefined : options.source);

  if (requested === "poedb") {
    return loadPoedbTitle(parsed.title, options, common);
  }

  if (requested === "wiki") {
    return loadWikiTitle(parsed.title, options, common);
  }

  const hit = await resolvePoedb(parsed.title, { ...common, lang: options.lang });
  if (!hit) {
    return loadWikiTitle(parsed.title, options, common);
  }
  return loadPoedbUrl(hit.url, options, common, hit.locale);
}

async function loadPoedbTitle(
  title: string,
  options: PageOptions,
  common: { timeoutMs: number; noCache: boolean },
): Promise<LoadedPage> {
  const hit = await resolvePoedb(title, { ...common, lang: options.lang });
  if (!hit) {
    throw new NotFoundError(
      `poedb 没有「${title}」对应的页面（locale: ${inferLang(title, options.lang)}）。`,
      "poedb 的搜索区分大小写，可换用更短的英文关键词；中文标题请配 --lang cn。",
    );
  }
  return loadPoedbUrl(hit.url, options, common, hit.locale);
}

async function loadPoedbUrl(
  url: string,
  options: PageOptions,
  common: { timeoutMs: number; noCache: boolean },
  locale?: Lang,
): Promise<LoadedPage> {
  const opts = { ...common, lang: locale ?? localeFromUrl(url) };
  if (options.html) {
    const page = await fetchPoedbPageHtml(url, opts);
    return { source: "poedb", title: page.title, url: page.url, html: page.html, locale: page.locale };
  }
  const page = await fetchPoedbPage(url, opts);
  return { source: "poedb", title: page.title, url: page.url, markdown: page.markdown, locale: page.locale };
}

async function loadWikiTitle(
  title: string,
  options: PageOptions,
  common: { timeoutMs: number; noCache: boolean },
): Promise<LoadedPage> {
  if (options.html) {
    const page = await fetchWikiPageHtml(title, common);
    return { source: "poewiki", title: page.title, url: page.url, html: page.html };
  }
  const page = await fetchWikiPage(title, common);
  return { source: "poewiki", title: page.title, url: page.url, markdown: page.markdown };
}

function parseUrl(value: string): Target {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new UsageError(`无法解析链接：${value}`, "请提供完整的 http(s) 链接。");
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");

  if (host === "poedb.tw") {
    const locale = localeFromUrl(url.href);
    return {
      kind: "url",
      url: url.href,
      source: "poedb",
      title: slugFromPoedbUrl(url.href),
      ...(locale ? { locale } : {}),
    };
  }

  if (host === "poewiki.net") {
    const title = titleFromUrl(url.href);
    if (!title) {
      throw new UsageError(`无法从链接中解析出 poewiki 标题：${value}`, "请使用 https://www.poewiki.net/wiki/<标题> 形式。");
    }
    return { kind: "url", url: url.href, source: "wiki", title };
  }

  throw new UsageError(`不支持的站点：${url.hostname}`, "只支持 poedb.tw 与 www.poewiki.net 的链接。");
}

function slugFromPoedbUrl(url: string): string {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    const slug = segments.length > 1 ? segments.slice(1).join("/") : "";
    return decodeURIComponent(slug).replace(/_/g, " ");
  } catch {
    return "";
  }
}

const TAG_TOKEN = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;

/**
 * --html 的兜底输出：保留原始结构，但去掉脚本/样式/导航这类对排查无意义的噪声，
 * 否则一个首页 100KB 里大半是外链 CSS 与站点导航。
 */
function prepareHtmlDump(html: string): string {
  let out = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<link\b[^>]*>/gi, "");
  for (const tag of ["script", "style", "noscript", "iframe", "nav", "header"]) {
    out = stripElementBlocks(out, (name) => name === tag);
  }
  out = stripElementBlocks(out, (name, attrs) => name === "div" && /\bid="head_toolbar"/i.test(attrs));
  return out.trim();
}

function stripElementBlocks(
  html: string,
  isTarget: (tagName: string, attributes: string) => boolean,
): string {
  const token = new RegExp(TAG_TOKEN.source, "g");
  let out = "";
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = token.exec(html)) !== null) {
    const closing = match[1] === "/";
    const tagName = match[2].toLowerCase();
    if (closing || !isTarget(tagName, match[3])) {
      continue;
    }

    const blockStart = match.index;
    let depth = 1;
    let blockEnd = html.length;
    while (depth > 0) {
      const next = token.exec(html);
      if (!next) {
        blockEnd = html.length;
        break;
      }
      if (next[2].toLowerCase() !== tagName) {
        continue;
      }
      depth += next[1] === "/" ? -1 : 1;
      blockEnd = token.lastIndex;
    }

    out += html.slice(last, blockStart);
    last = blockEnd;
    token.lastIndex = blockEnd;
  }

  return out + html.slice(last);
}

function truncate(text: string, maxChars: number, asHtml: boolean): { text: string; truncated: boolean } {
  if (maxChars <= 0 || text.length <= maxChars) {
    return { text, truncated: false };
  }
  const kb = Math.max(1, Math.round(text.length / 1024));
  const note = asHtml
    ? `\n\n<!-- 内容已截断（原始 ${kb} KB，上限 ${maxChars} 字符）。用 --max-chars 调整。 -->`
    : `\n\n---\n_内容已截断（原始 ${kb} KB，上限 ${maxChars} 字符）。用 --max-chars 调整。_`;
  return { text: `${text.slice(0, maxChars)}${note}`, truncated: true };
}
