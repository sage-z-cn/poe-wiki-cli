import { fetchLeague, type Realm, type RealmInfo } from "../sources/league.js";
import { sitesFor, type Game } from "../sites.js";

export interface LeagueOptions {
  game: Game;
  realms: Realm[];
  patch: boolean;
  timeoutMs: number;
  noCache: boolean;
}

export interface LeagueReport {
  game: Game;
  fetchedAt: string;
  realms: RealmInfo[];
}

export async function runLeague(options: LeagueOptions): Promise<LeagueReport> {
  const sites = sitesFor(options.game);

  const realms = await Promise.all(
    options.realms.map(async (realm): Promise<RealmInfo> => {
      try {
        return await fetchLeague(realm, {
          game: options.game,
          timeoutMs: options.timeoutMs,
          noCache: options.noCache,
          includeSections: options.patch,
        });
      } catch (error) {
        // 单服失败不应让整条命令失败：保留占位信息，由调用方决定退出码。
        return {
          game: options.game,
          realm,
          server: realm === "cn" ? "tencent" : "international",
          locale: realm,
          url: `${sites.dbOrigin}/${realm}/`,
          warnings: [`fetch failed: ${error instanceof Error ? error.message : String(error)}`],
        };
      }
    }),
  );

  return { game: options.game, fetchedAt: new Date().toISOString(), realms };
}

export function leagueExitCode(report: LeagueReport): number {
  const { realms } = report;
  if (realms.length === 0) {
    return 0;
  }

  const parsed = realms.filter((realm) => realm.current || realm.next || realm.patch);
  if (parsed.length > 0) {
    return 0;
  }

  const allFetchFailed = realms.every(
    (realm) =>
      realm.warnings !== undefined &&
      realm.warnings.length > 0 &&
      realm.warnings.every((warning) => warning.startsWith("fetch failed")),
  );

  return allFetchFailed ? 4 : 2;
}
