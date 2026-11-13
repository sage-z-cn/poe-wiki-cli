import { BlockedError, fetchText, isBlockedBody } from "../http.js";
import { sitesFor, type Game } from "../sites.js";

export interface DoctorCheck {
  game: Game;
  site: string;
  url: string;
  ok: boolean;
  status: number | null;
  ms: number;
  blocked: boolean;
  marker: string;
  markerFound: boolean;
  error?: string;
}

export interface DoctorOptions {
  games: Game[];
  timeoutMs: number;
}

interface Probe {
  game: Game;
  site: string;
  url: string;
  marker: string;
  accept: string;
}

export async function runDoctor(options: DoctorOptions): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];

  for (const game of options.games) {
    const sites = sitesFor(game);
    const probes: Probe[] = [
      {
        game,
        site: sites.dbName,
        url: `${sites.dbOrigin}/us/`,
        marker: "page-content",
        accept: "text/html",
      },
      {
        game,
        site: sites.wikiName,
        url: `${sites.wikiApi}?action=query&meta=siteinfo&format=json`,
        marker: "generator",
        accept: "application/json",
      },
    ];

    for (const probe of probes) {
      checks.push(await runProbe(probe, options.timeoutMs));
    }
  }

  return checks;
}

async function runProbe(probe: Probe, timeoutMs: number): Promise<DoctorCheck> {
  const startedAt = Date.now();
  try {
    const response = await fetchText(probe.url, { timeoutMs, accept: probe.accept });
    const blocked = isBlockedBody(response.body);
    const markerFound = response.body.includes(probe.marker);
    return {
      game: probe.game,
      site: probe.site,
      url: probe.url,
      ok: response.status === 200 && !blocked && markerFound,
      status: response.status,
      ms: Date.now() - startedAt,
      blocked,
      marker: probe.marker,
      markerFound,
    };
  } catch (error) {
    return {
      game: probe.game,
      site: probe.site,
      url: probe.url,
      ok: false,
      status: null,
      ms: Date.now() - startedAt,
      blocked: error instanceof BlockedError,
      marker: probe.marker,
      markerFound: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
