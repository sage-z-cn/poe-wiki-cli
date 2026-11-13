import { NotFoundError } from "../http.js";
import { inferLang, resolve as resolvePoedb } from "../sources/poedb.js";
import { search as searchWiki } from "../sources/poewiki.js";
import type { Lang, SearchResult, SearchSource } from "../types.js";

export interface SearchOptions {
  source: SearchSource;
  lang?: Lang;
  limit: number;
  timeoutMs: number;
  noCache: boolean;
}

export interface SearchOutcome {
  query: string;
  locale: Lang;
  results: SearchResult[];
}

export async function runSearch(query: string, options: SearchOptions): Promise<SearchOutcome> {
  const locale = inferLang(query, options.lang);
  const results: SearchResult[] = [];

  if (options.source !== "wiki") {
    const hit = await resolvePoedb(query, {
      lang: options.lang,
      timeoutMs: options.timeoutMs,
      noCache: options.noCache,
    });
    if (hit) {
      results.push({ source: "poedb", kind: "page", title: hit.title, url: hit.url });
    }
  }

  if (options.source !== "poedb") {
    const hits = await searchWiki(query, options.limit, {
      timeoutMs: options.timeoutMs,
      noCache: options.noCache,
    });
    for (const hit of hits) {
      results.push({
        source: "poewiki",
        kind: "search",
        title: hit.title,
        url: hit.url,
        snippet: hit.snippet,
        size: hit.size,
        wordcount: hit.wordcount,
      });
    }
  }

  if (results.length === 0) {
    throw new NotFoundError(
      `两个站点都没有找到「${query}」的结果。`,
      "poedb 的搜索区分大小写，可换成更短的英文关键词；中文标题请使用 --lang cn。",
    );
  }

  return { query, locale, results };
}
