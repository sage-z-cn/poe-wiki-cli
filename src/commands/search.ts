import { NotFoundError } from "../http.js";
import { resolveAlias, resolveOrphanSlug } from "../aliases.js";
import { isRetiredSlug, loadNameSources, lookupFuzzy, lookupNavFuzzy } from "../dict.js";
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
    results.push(...(await searchDb(query, locale, options)));
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
    throw new NotFoundError(
      `No results for "${query}".`,
      locale === "cn"
        ? "Try a shorter keyword, or check the exact in-game name; poedb's own site search does not index Chinese titles."
        : `${sites.dbName} search is case-sensitive; try a shorter English keyword.`,
    );
  }

  return { game: options.game, query, locale, results };
}

/**
 * poedb 的站内搜索对中文几乎全废：`/cn/search?q=致命贪婪` 直接 302 回首页，
 * 只有少数词能命中。所以中文查询改用本地索引产出候选——自动补全词典覆盖
 * 具体条目，首页站内链接覆盖机制枢纽页，两者都是站点自己下发的当前数据。
 */
async function searchDb(query: string, locale: Lang, options: SearchOptions): Promise<SearchResult[]> {
  const sites = sitesFor(options.game);

  const detail = await resolvePoedbDetailed(query, {
    game: options.game,
    lang: options.lang,
    timeoutMs: options.timeoutMs,
    noCache: options.noCache,
  });

  if (detail.hit) {
    return [
      {
        game: options.game,
        source: sites.dbName,
        kind: "page",
        title: detail.hit.title,
        url: detail.hit.url,
      },
    ];
  }

  if (detail.candidates.length > 0) {
    return detail.candidates.slice(0, options.limit).map((candidate) => ({
      game: options.game,
      source: sites.dbName,
      kind: "page" as const,
      title: candidate.title,
      url: candidate.url,
    }));
  }

  // 原词完全查不到时才用别名再试一次；别名表只补充缺口，不覆盖已有结果。
  const alias = resolveAlias(query);
  if (alias) {
    const aliased = await resolvePoedbDetailed(alias, {
      game: options.game,
      lang: options.lang,
      timeoutMs: options.timeoutMs,
      noCache: options.noCache,
    });
    if (aliased.hit) {
      return [
        {
          game: options.game,
          source: sites.dbName,
          kind: "page",
          title: aliased.hit.title,
          url: aliased.hit.url,
        },
      ];
    }
  }

  return indexCandidates(query, locale, options);
}

async function indexCandidates(query: string, locale: Lang, options: SearchOptions): Promise<SearchResult[]> {
  const sites = sitesFor(options.game);
  const sources = await loadNameSources({
    game: options.game,
    lang: locale,
    timeoutMs: options.timeoutMs,
    noCache: options.noCache,
  });

  const slugs = [...lookupNavFuzzy(sources.nav, query, options.limit)];
  if (sources.dict) {
    for (const entry of lookupFuzzy(sources.dict, query, options.limit)) {
      if (!slugs.includes(entry.value)) {
        slugs.push(entry.value);
      }
    }
  }

  const orphan = resolveOrphanSlug(query);
  if (orphan && !slugs.includes(orphan)) {
    slugs.unshift(orphan);
  }

  const results: SearchResult[] = [];
  for (const slug of slugs) {
    if (results.length >= options.limit) {
      break;
    }
    if (isRetiredSlug(slug)) {
      continue;
    }
    results.push({
      game: options.game,
      source: sites.dbName,
      kind: "page",
      title: slug.replace(/_/g, " "),
      url: `${sites.dbOrigin}/${locale}/${slug}`,
    });
  }

  return results;
}
