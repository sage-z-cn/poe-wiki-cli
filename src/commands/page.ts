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
import { gameFromHost, sitesFor, type Game } from "../sites.js";
import type { Lang, PageDocument, PageHtmlDocument, PageSource, SourceName } from "../types.js";

export interface PageOptions {
  game: Game;
  source: PageSource;
  lang?: Lang;
  timeoutMs: number;
  noCache: boolean;
  maxChars: number;
  sections: boolean;
  html: boolean;
}

export type PageResult = PageDocument | PageHtmlDocument;

type TargetSite = "db" | "wiki";

type Target =
  | { kind: "url"; url: string; site: TargetSite; game: Game; title: string; locale?: Lang }
  | { kind: "title"; title: string; site?: TargetSite; game?: Game };

interface LoadedPage {
  game: Game;
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
      game: page.game,
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
    game: page.game,
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
    throw new UsageError("Page title or URL cannot be empty.");
  }

  if (/^https?:\/\//i.test(value)) {
    return parseUrl(value);
  }

  const prefixed = /^(poedb|poe2db|poewiki|poe2wiki|wiki):(.+)$/i.exec(value);
  if (prefixed) {
    const rest = prefixed[2].trim();
    if (!rest) {
      throw new UsageError("A site prefix must be followed by a page title, for example poe2db:Fireball.");
    }
    if (/^https?:\/\//i.test(rest)) {
      return parseUrl(rest);
    }
    const prefix = prefixed[1].toLowerCase();
    return {
      kind: "title",
      title: rest,
      site: prefix === "poedb" || prefix === "poe2db" ? "db" : "wiki",
      game: prefix === "poe2db" || prefix === "poe2wiki" ? "poe2" : "poe1",
    };
  }

  return { kind: "title", title: value };
}

async function load(parsed: Target, options: PageOptions): Promise<LoadedPage> {
  const common = { timeoutMs: options.timeoutMs, noCache: options.noCache };

  if (parsed.kind === "url") {
    // 完整链接本身已经指明站点与游戏版本，优先于 --game / --source。
    if (parsed.site === "db") {
      return loadDbUrl(parsed.url, parsed.game, options, common, parsed.locale);
    }
    const title = parsed.title || titleFromUrl(parsed.url);
    if (!title) {
      throw new UsageError(`Could not read a wiki title from the link: ${parsed.url}`);
    }
    return loadWikiTitle(title, parsed.game, options, common);
  }

  const game = parsed.game ?? options.game;
  const requested: TargetSite | undefined =
    parsed.site ?? (options.source === "poedb" ? "db" : options.source === "wiki" ? "wiki" : undefined);

  if (requested === "db") {
    return loadDbTitle(parsed.title, game, options, common);
  }

  if (requested === "wiki") {
    return loadWikiTitle(parsed.title, game, options, common);
  }

  const hit = await resolvePoedb(parsed.title, { ...common, game, lang: options.lang });
  if (!hit) {
    return loadWikiTitle(parsed.title, game, options, common);
  }
  return loadDbUrl(hit.url, game, options, common, hit.locale);
}

async function loadDbTitle(
  title: string,
  game: Game,
  options: PageOptions,
  common: { timeoutMs: number; noCache: boolean },
): Promise<LoadedPage> {
  const sites = sitesFor(game);
  const hit = await resolvePoedb(title, { ...common, game, lang: options.lang });
  if (!hit) {
    throw new NotFoundError(
      `${sites.dbName} has no page for "${title}" (locale: ${inferLang(title, options.lang)}).`,
      `${sites.dbName} search is case-sensitive; try a shorter English keyword, or pass --lang cn for Chinese titles.`,
    );
  }
  return loadDbUrl(hit.url, game, options, common, hit.locale);
}

async function loadDbUrl(
  url: string,
  game: Game,
  options: PageOptions,
  common: { timeoutMs: number; noCache: boolean },
  locale?: Lang,
): Promise<LoadedPage> {
  const sites = sitesFor(game);
  const opts = { ...common, game, lang: locale ?? localeFromUrl(url) };
  if (options.html) {
    const page = await fetchPoedbPageHtml(url, opts);
    return {
      game,
      source: sites.dbName,
      title: page.title,
      url: page.url,
      html: page.html,
      locale: page.locale,
    };
  }
  const page = await fetchPoedbPage(url, opts);
  return {
    game,
    source: sites.dbName,
    title: page.title,
    url: page.url,
    markdown: page.markdown,
    locale: page.locale,
  };
}

async function loadWikiTitle(
  title: string,
  game: Game,
  options: PageOptions,
  common: { timeoutMs: number; noCache: boolean },
): Promise<LoadedPage> {
  const sites = sitesFor(game);
  if (options.html) {
    const page = await fetchWikiPageHtml(title, { ...common, game });
    return { game, source: sites.wikiName, title: page.title, url: page.url, html: page.html };
  }
  const page = await fetchWikiPage(title, { ...common, game });
  return { game, source: sites.wikiName, title: page.title, url: page.url, markdown: page.markdown };
}

function parseUrl(value: string): Target {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new UsageError(`Could not parse the URL: ${value}`, "Provide a full http(s) link.");
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const game = gameFromHost(host);

  if (!game) {
    throw new UsageError(
      `Unsupported site: ${url.hostname}.`,
      "Only links from poedb.tw, poe2db.tw, poewiki.net, and poe2wiki.net are supported.",
    );
  }

  if (host === "poedb.tw" || host === "poe2db.tw") {
    const locale = localeFromUrl(url.href);
    return {
      kind: "url",
      url: url.href,
      site: "db",
      game,
      title: slugFromDbUrl(url.href),
      ...(locale ? { locale } : {}),
    };
  }

  const title = titleFromUrl(url.href);
  if (!title) {
    throw new UsageError(
      `Could not read a wiki title from the link: ${value}`,
      "Use the form https://www.poewiki.net/wiki/<title> or https://www.poe2wiki.net/wiki/<title>.",
    );
  }
  return { kind: "url", url: url.href, site: "wiki", game, title };
}

function slugFromDbUrl(url: string): string {
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

function stripElementBlocks(html: string, isTarget: (tagName: string, attributes: string) => boolean): string {
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
    ? `\n\n<!-- Content truncated (original ${kb} KB, limit ${maxChars} characters). Adjust with --max-chars. -->`
    : `\n\n---\n_Content truncated (original ${kb} KB, limit ${maxChars} characters). Adjust with --max-chars._`;
  return { text: `${text.slice(0, maxChars)}${note}`, truncated: true };
}
