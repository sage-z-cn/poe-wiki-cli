import { BlockedError, NotFoundError } from "../http.js";
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
  /** 非致命问题（如某一源被限流）不阻断输出，记录在这里。 */
  warnings?: string[];
}

export async function runSearch(query: string, options: SearchOptions): Promise<SearchOutcome> {
  const sites = sitesFor(options.game);
  const locale = inferLang(query, options.lang);
  const results: SearchResult[] = [];
  const warnings: string[] = [];

  if (options.source !== "wiki") {
    results.push(...(await searchDb(query, locale, options)));
  }

  if (options.source !== "poedb") {
    try {
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
    } catch (error) {
      // both 模式下另一源正常时不整体失败；只查 wiki 时仍按原样抛错。
      if (options.source === "wiki") {
        throw error;
      }
      if (error instanceof BlockedError) {
        warnings.push(`${sites.wikiName} is unavailable (${error.message})`);
      } else {
        throw error;
      }
    }
  }

  if (results.length === 0) {
    if (warnings.length > 0) {
      throw new NotFoundError(
        `No results for "${query}" from ${sites.dbName}; ${sites.wikiName} was unavailable (${warnings[0]}).`,
        `${sites.dbName} returned nothing on its own. Wait 60-90s and retry to also search ${sites.wikiName}, or try another keyword.`,
      );
    }
    throw new NotFoundError(
      `No results for "${query}".`,
      locale === "cn" ? notFoundHintCn(options) : `${sites.dbName} search is case-sensitive; try a shorter English keyword.`,
    );
  }

  return warnings.length > 0 ? { game: options.game, query, locale, results, warnings } : { game: options.game, query, locale, results };
}

/**
 * 中文未命中基本发生在本地索引层（自动补全词典 + 首页链接），而非站内搜索——
 * 提示要指向真正的原因：新版本词条可能还没进词典。
 */
function notFoundHintCn(options: SearchOptions): string {
  const sites = sitesFor(options.game);
  return `The name is not in the local dictionary or the ${sites.dbName} index; entries added in a recent patch may not be indexed yet. Try the official English name, --no-cache after the dictionary updates, or a web search.`;
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
