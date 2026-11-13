import { BlockedError, fetchText, isBlockedBody } from "../http.js";
import { WIKI_API } from "../sources/poewiki.js";

export interface DoctorCheck {
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

const PROBES = [
  { site: "poedb", url: "https://poedb.tw/us/", marker: "page-content", accept: "text/html" },
  { site: "poewiki", url: `${WIKI_API}?action=query&meta=siteinfo&format=json`, marker: "generator", accept: "application/json" },
] as const;

export async function runDoctor(options: { timeoutMs: number }): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];

  for (const probe of PROBES) {
    const startedAt = Date.now();
    try {
      const response = await fetchText(probe.url, { timeoutMs: options.timeoutMs, accept: probe.accept });
      const blocked = isBlockedBody(response.body);
      const markerFound = response.body.includes(probe.marker);
      checks.push({
        site: probe.site,
        url: probe.url,
        ok: response.status === 200 && !blocked && markerFound,
        status: response.status,
        ms: Date.now() - startedAt,
        blocked,
        marker: probe.marker,
        markerFound,
      });
    } catch (error) {
      checks.push({
        site: probe.site,
        url: probe.url,
        ok: false,
        status: null,
        ms: Date.now() - startedAt,
        blocked: error instanceof BlockedError,
        marker: probe.marker,
        markerFound: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return checks;
}
