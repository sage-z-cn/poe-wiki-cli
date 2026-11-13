import { NotFoundError } from "../http.js";
import { resolveAlias } from "../aliases.js";
import { inferLang, resolveDetailed as resolvePoedbDetailed } from "../sources/poedb.js";
import { search as searchWiki } from "../sources/poewiki.js";
import { sitesFor, type Game } from "../sites.js";
import type { Lang, SearchResult, SearchSource } from "../types.js";

export interface SearchOptions {
  game: Game;
  source: SearchSource;
  lang?: Lang;
  limit: number;
  timeoutMs: number;
  noCache: boolean;
}

export interface SearchOutcome {
  game: Game;
  query: string;
  locale: Lang;
  results: SearchResult[];
}

export async function runSearch(query: string, options: SearchOptions): Promise<SearchOutcome> {
  const sites = sitesFor(options.game);
  const locale = inferLang(query, options.lang);
  const results: SearchResult[] = [];

  if (options.source !== "wiki") {
    let detail = await resolvePoedbDetailed(query, {
      game: options.game,
      lang: options.lang,
      timeoutMs: options.timeoutMs,
      noCache: options.noCache,
    });

    // 原词完全查不到时才用别名再试一次；wiki 部分仍用原词。
    if (!detail.hit && detail.candidates.length === 0) {
      const alias = resolveAlias(query);
      if (alias) {
        detail = await resolvePoedbDetailed(alias, {
          game: options.game,
          lang: options.lang,
          timeoutMs: options.timeoutMs,
          noCache: options.noCache,
        });
      }
    }

    if (detail.hit) {
      results.push({
        game: options.game,
        source: sites.dbName,
        kind: "page",
        title: detail.hit.title,
        url: detail.hit.url,
      });
    } else {
      // 搜索结果页里的候选都是确定存在的页面，按 --limit 截断后逐个列出。
      for (const candidate of detail.candidates.slice(0, options.limit)) {
        results.push({
          game: options.game,
          source: sites.dbName,
          kind: "page",
          title: candidate.title,
          url: candidate.url,
        });
      }
    }
  }

  if (options.source !== "poedb") {
    const hits = await searchWiki(query, options.limit, {
      game: options.game,
      timeoutMs: options.timeoutMs,
      noCache: options.noCache,
    });
    for (const hit of hits.slice(0, options.limit)) {
      results.push({
        game: options.game,
        source: sites.wikiName,
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
    const hint =
      options.source === "wiki"
        ? "Try a shorter or more general keyword."
        : `${sites.dbName} search is case-sensitive; try a shorter English keyword, or pass --lang cn for Chinese titles.`;
    throw new NotFoundError(`No results for "${query}".`, hint);
  }

  return { game: options.game, query, locale, results };
}
