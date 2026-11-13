#!/usr/bin/env node
import { Command } from "commander";
import { CliError, NetworkError, UsageError } from "./http.js";
import { runDoctor, type DoctorCheck } from "./commands/doctor.js";
import { runLeague, leagueExitCode, type LeagueReport } from "./commands/league.js";
import { runPage, type PageResult } from "./commands/page.js";
import { runSearch, type SearchOutcome } from "./commands/search.js";
import { runSkill, type SkillResult } from "./commands/skill.js";
import { REALMS, type Realm } from "./sources/league.js";
import { GAMES, type Game } from "./sites.js";
import { LANGUAGES, type Lang, type PageDocument } from "./types.js";
import { VERSION } from "./version.js";

const EXIT_CODE: Record<string, number> = {
  USAGE: 1,
  NOT_FOUND: 2,
  BLOCKED: 3,
  NETWORK: 4,
};

interface CommonCliOptions {
  json?: boolean;
  cache?: boolean;
  timeout: string;
  game: string;
}

interface SearchCliOptions extends CommonCliOptions {
  source: string;
  lang?: string;
  limit: string;
}

interface PageCliOptions extends CommonCliOptions {
  source: string;
  lang?: string;
  maxChars?: string;
  raw?: boolean;
  sections?: boolean;
  html?: boolean;
  dict?: boolean;
}

interface LeagueCliOptions extends CommonCliOptions {
  realm: string;
  patch?: boolean;
}

interface SkillCliOptions {
  print?: boolean;
  json?: boolean;
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("poe-wiki-cli")
    .description("Query Path of Exile 1 and 2 reference sites (poedb, poe2db, poewiki, poe2wiki) and print clean, machine-readable markdown.")
    .version(VERSION, "-v, --version", "print the version number")
    .showHelpAfterError();

  program
    .command("search")
    .description("Search both the database and the wiki (use --game to switch between PoE1 and PoE2)")
    .argument("<query...>", "search keywords, spaces allowed")
    .option("-g, --game <game>", "game version: poe1|poe2", "poe1")
    .option("-s, --source <source>", "data source: both|poedb|wiki", "both")
    .option("-l, --lang <lang>", "database language (inferred from the query by default: Chinese -> cn, otherwise us)")
    .option("-n, --limit <n>", "maximum results per source", "8")
    .option("-j, --json", "print machine-readable JSON")
    .option("--no-cache", "skip the local cache")
    .option("--timeout <ms>", "request timeout in milliseconds", "20000")
    .action(async (queryParts: string[], options: SearchCliOptions) => {
      const query = queryParts.join(" ").trim();
      if (!query) {
        throw new UsageError("Search query cannot be empty.");
      }
      const outcome = await runSearch(query, {
        game: parseGame(options.game),
        source: parseSource(options.source, ["both", "poedb", "wiki"] as const),
        lang: parseLang(options.lang),
        limit: parsePositiveInt(options.limit, "--limit"),
        timeoutMs: parsePositiveInt(options.timeout, "--timeout"),
        noCache: options.cache === false,
      });
      printSearch(outcome, options.json === true);
    });

  program
    .command("page")
    .description("Fetch a page and print markdown")
    .argument("<target>", "full URL, poedb:/poe2db:<title>, wiki:/poe2wiki:<title>, or a bare title")
    .option("-g, --game <game>", "game version: poe1|poe2 (a full URL overrides this via its host)", "poe1")
    .option("-s, --source <source>", "data source: auto|both|poedb|wiki", "auto")
    .option("-l, --lang <lang>", "database language (inferred from the title by default: Chinese -> cn, otherwise us)")
    .option("-j, --json", "print machine-readable JSON")
    .option("--no-cache", "skip the local cache")
    .option("--timeout <ms>", "request timeout in milliseconds", "20000")
    .option("--max-chars <n>", "maximum body length in characters before truncation (0 disables it; defaults to 0 with --html)")
    .option("--raw", "print only the body markdown, without the title and metadata")
    .option("--html", "print raw HTML instead of markdown (scripts, styles and navigation are stripped)")
    .option("--sections", "also print a heading outline")
    .option("--no-dict", "skip the local name dictionary and always resolve through search")
    .action(async (target: string, options: PageCliOptions) => {
      if (options.html === true && options.raw === true) {
        throw new UsageError(
          "--html and --raw cannot be used together.",
          "Drop --raw for raw HTML, or drop --html for markdown.",
        );
      }

      const maxChars =
        options.maxChars === undefined
          ? options.html === true
            ? 0
            : 40_000
          : parseNonNegativeInt(options.maxChars, "--max-chars");

      const document = await runPage(target, {
        game: parseGame(options.game),
        source: parseSource(options.source, ["auto", "both", "poedb", "wiki"] as const),
        lang: parseLang(options.lang),
        timeoutMs: parsePositiveInt(options.timeout, "--timeout"),
        noCache: options.cache === false,
        maxChars,
        sections: options.sections === true,
        html: options.html === true,
        noDict: options.dict === false,
      });
      printPage(document, options.json === true, options.raw === true);
    });

  program
    .command("doctor")
    .description("Check site reachability and bot-protection status (--game both probes all four sites)")
    .option("-g, --game <game>", "game version: both|poe1|poe2", "both")
    .option("-j, --json", "print machine-readable JSON")
    .option("--timeout <ms>", "request timeout in milliseconds", "20000")
    .action(async (options: CommonCliOptions) => {
      const checks = await runDoctor({
        games: parseGames(options.game),
        timeoutMs: parsePositiveInt(options.timeout, "--timeout"),
      });
      printDoctor(checks, options.json === true);
      if (checks.some((check) => !check.ok)) {
        process.exitCode = EXIT_CODE.NETWORK;
      }
    });

  program
    .command("league")
    .description("Show league and version information from the database homepage")
    .option("-g, --game <game>", "game version: poe1|poe2", "poe1")
    .option("--realm <realm>", "realm: both|us|cn", "both")
    .option("--patch", "expand the link groups of the newest version")
    .option("-j, --json", "print machine-readable JSON")
    .option("--no-cache", "skip the local cache")
    .option("--timeout <ms>", "request timeout in milliseconds", "20000")
    .action(async (options: LeagueCliOptions) => {
      const report = await runLeague({
        game: parseGame(options.game),
        realms: parseRealm(options.realm),
        patch: options.patch === true,
        timeoutMs: parsePositiveInt(options.timeout, "--timeout"),
        noCache: options.cache === false,
      });
      printLeague(report, options.patch === true, options.json === true);
      const exitCode = leagueExitCode(report);
      if (exitCode !== 0) {
        process.exitCode = exitCode;
      }
    });

  program
    .command("skill")
    .description("Report the version of the bundled agent skill")
    .option("--print", "print the bundled SKILL.md verbatim")
    .option("-j, --json", "print machine-readable JSON")
    .action((options: SkillCliOptions) => {
      if (options.print === true && options.json === true) {
        throw new UsageError(
          "--print and --json cannot be used together.",
          "Use --print for the raw file, or --json for the version report.",
        );
      }

      const result = runSkill();
      printSkill(result, { print: options.print === true, json: options.json === true });
    });

  await program.parseAsync(process.argv);
}

function printSearch(outcome: SearchOutcome, json: boolean): void {
  if (json) {
    writeJson({ ok: true, ...outcome });
    return;
  }

  const lines = [`query: ${outcome.query}`, `locale: ${outcome.locale}`, ""];
  for (const result of outcome.results) {
    lines.push(`[${result.source}] ${result.title}`);
    lines.push(`  ${result.url}`);
    if (result.snippet) {
      lines.push(`  ${result.snippet}`);
    }
  }
  process.stdout.write(`${lines.join("\n").trimEnd()}\n`);
}

function printPage(document: PageResult, json: boolean, raw: boolean): void {
  if (json) {
    writeJson({ ok: true, ...document });
    return;
  }

  if ("html" in document) {
    process.stdout.write(`${document.html}\n`);
    return;
  }

  if (raw) {
    process.stdout.write(`${document.markdown}\n`);
    return;
  }

  const lines = [
    `# ${document.title}`,
    `> source: ${document.source} · ${document.url}`,
    `> fetched: ${document.fetchedAt}`,
  ];

  if (document.sections && document.sections.length > 0) {
    lines.push("", formatSections(document.sections));
  }

  lines.push("", document.markdown);
  process.stdout.write(`${lines.join("\n")}\n`);
}

function formatSections(sections: NonNullable<PageDocument["sections"]>): string {
  const minimum = Math.min(...sections.map((section) => section.level));
  const lines = ["> Sections"];
  for (const section of sections) {
    lines.push(`${"  ".repeat(Math.max(0, section.level - minimum))}- ${section.title}`);
  }
  return lines.join("\n");
}

function printDoctor(checks: DoctorCheck[], json: boolean): void {
  if (json) {
    writeJson(checks);
    return;
  }

  for (const check of checks) {
    const status = check.status === null ? "HTTP ---" : `HTTP ${check.status}`;
    const state = check.ok ? "ok  " : "FAIL";
    const marker = `${check.marker} ${check.markerFound ? "✓" : "✗"}`;
    const blocked = check.blocked ? "  blocked" : "";
    const detail = check.error ? `  ${check.error}` : "";
    process.stdout.write(
      `${check.site.padEnd(8)} ${state} ${status.padEnd(9)} ${String(check.ms).padStart(6)}ms  ${marker}${blocked}  ${check.url}${detail}\n`,
    );
  }
}

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function printSkill(result: SkillResult, options: { print: boolean; json: boolean }): void {
  if (options.print) {
    process.stdout.write(result.content);
    return;
  }
  if (options.json) {
    writeJson({ ok: true, version: result.version });
    return;
  }
  process.stdout.write(`bundled skill ${result.version}\nprint it with: poe-wiki-cli skill --print\n`);
}

function printLeague(report: LeagueReport, patch: boolean, json: boolean): void {
  if (json) {
    writeJson({ ok: true, ...report });
    return;
  }

  const blocks: string[] = [];
  for (const realm of report.realms) {
    const host = hostOf(realm.url);
    const lines = [`${realm.server === "tencent" ? "Tencent" : "International"} · ${host}/${realm.locale}`];

    if (realm.current) {
      lines.push(`  current   ${realm.current.version}  ${realm.current.name}`);
      lines.push(
        `            running since  ${formatStamp(realm.current.since)}  (${formatSpan(realm.current.runningSeconds)})`,
      );
      if (realm.current.ends) {
        lines.push(
          `            ends           ${formatStamp(realm.current.ends)}  in ${formatSpan(secondsUntil(realm.current.ends))}`,
        );
      }
    }

    if (realm.next) {
      lines.push(`  next      ${realm.next.version}  ${realm.next.name}`);
      if (realm.next.realmDownAt) {
        lines.push(
          `            realm down     ${formatStamp(realm.next.realmDownAt)}  in ${formatSpan(secondsUntil(realm.next.realmDownAt))}`,
        );
      }
      if (realm.next.startsAt) {
        lines.push(
          `            starts         ${formatStamp(realm.next.startsAt)}  in ${formatSpan(secondsUntil(realm.next.startsAt))}`,
        );
      }
    }

    if (realm.patch) {
      if (patch && realm.patch.sections && realm.patch.sections.length > 0) {
        lines.push("", `  ${realm.patch.version} ${realm.patch.codename}  ·  ${realm.url}`);
        for (const section of realm.patch.sections) {
          const links = section.links.map((link) => link.text).join(" · ");
          lines.push(`    ${section.label.padEnd(10)}  ${links}`);
        }
      } else {
        lines.push(`  patch     ${realm.patch.version} ${realm.patch.codename}`);
      }
    }

    for (const warning of realm.warnings ?? []) {
      if (warning.startsWith("no league cards parsed")) {
        lines.push(`  ! No league cards parsed; the homepage layout may have changed. Fallback: poe-wiki-cli page ${realm.url} --html`);
      } else if (warning.startsWith("fetch failed:")) {
        lines.push(`  ! Fetch failed: ${warning.slice("fetch failed:".length).trim()}`);
      } else {
        lines.push(`  ! ${warning}`);
      }
    }

    blocks.push(lines.join("\n"));
  }

  process.stdout.write(`${blocks.join("\n\n")}\n`);
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "poedb.tw";
  }
}

function formatStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return `${utcStamp(date)} · ${localStamp(date)}`;
}

function utcStamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(
    date.getUTCMinutes(),
  )} UTC`;
}

function localStamp(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")} ${pick("hour")}:${pick("minute")} (${offsetLabel(date)})`;
}

function offsetLabel(date: Date): string {
  const zone =
    new Intl.DateTimeFormat("en-US", { timeZoneName: "longOffset" })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  return zone.replace(/^GMT/, "UTC").replace(/^UTC$/, "UTC+00:00");
}

function formatSpan(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  if (days >= 1) {
    return `${days}d ${hours}h`;
  }
  if (hours >= 1) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function secondsUntil(iso: string): number {
  const timestamp = Date.parse(iso);
  return Number.isNaN(timestamp) ? 0 : Math.max(0, Math.floor((timestamp - Date.now()) / 1000));
}

function parseRealm(value: string): Realm[] {
  const normalized = value.trim().toLowerCase();
  if (normalized === "both") {
    return [...REALMS];
  }
  if ((REALMS as readonly string[]).includes(normalized)) {
    return [normalized as Realm];
  }
  throw new UsageError(`Unsupported realm "${value}".`, "Valid values: both, us, cn.");
}

function parseGame(value: string): Game {
  const normalized = value.trim().toLowerCase();
  if ((GAMES as readonly string[]).includes(normalized)) {
    return normalized as Game;
  }
  throw new UsageError(`Unsupported game "${value}".`, "Valid values: poe1, poe2.");
}

function parseGames(value: string): Game[] {
  const normalized = value.trim().toLowerCase();
  if (normalized === "both") {
    return [...GAMES];
  }
  return [parseGame(value)];
}

function parsePositiveInt(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new UsageError(`${flag} expects a positive integer, got "${value}".`);
  }
  return parsed;
}

function parseNonNegativeInt(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new UsageError(`${flag} expects a non-negative integer, got "${value}".`);
  }
  return parsed;
}

function parseSource<T extends string>(value: string, allowed: readonly T[]): T {
  const normalized = value.trim().toLowerCase();
  if (!(allowed as readonly string[]).includes(normalized)) {
    throw new UsageError(`Unsupported source "${value}".`, `Valid values: ${allowed.join(", ")}.`);
  }
  return normalized as T;
}

function parseLang(value?: string): Lang | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (!(LANGUAGES as readonly string[]).includes(normalized)) {
    throw new UsageError(`Unsupported language "${value}".`, `Valid values: ${LANGUAGES.join(", ")}.`);
  }
  return normalized as Lang;
}

function wantsJson(argv: string[]): boolean {
  return argv.includes("--json") || argv.includes("-j");
}

main().catch((error: unknown) => {
  const normalized =
    error instanceof CliError
      ? error
      : new NetworkError(error instanceof Error ? error.message : String(error), "This is an unexpected error. Please report it together with the full command.");

  if (wantsJson(process.argv)) {
    process.stdout.write(
      `${JSON.stringify(
        { ok: false, error: { code: normalized.code, message: normalized.message, hint: normalized.hint } },
        null,
        2,
      )}\n`,
    );
  } else {
    process.stderr.write(`Error: ${normalized.message}\nHint: ${normalized.hint}\n`);
  }

  process.exitCode = EXIT_CODE[normalized.code] ?? 4;
});
