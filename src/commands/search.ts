import { NotFoundError } from "../http.js";
import { inferLang, resolve as resolvePoedb } from "../sources/poedb.js";
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
    const hit = await resolvePoedb(query, {
      game: options.game,
      lang: options.lang,
      timeoutMs: options.timeoutMs,
      noCache: options.noCache,
    });
    if (hit) {
      results.push({
        game: options.game,
        source: sites.dbName,
        kind: "page",
        title: hit.title,
        url: hit.url,
      });
    }
  }

  if (options.source !== "poedb") {
    const hits = await searchWiki(query, options.limit, {
      game: options.game,
      timeoutMs: options.timeoutMs,
      noCache: options.noCache,
    });
    for (const hit of hits) {
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
