#!/usr/bin/env node
import { Command } from "commander";
import { CliError, NetworkError, UsageError } from "./http.js";
import { runDoctor, type DoctorCheck } from "./commands/doctor.js";
import { runLeague, leagueExitCode, type LeagueReport } from "./commands/league.js";
import { runPage, type PageResult } from "./commands/page.js";
import { runSearch, type SearchOutcome } from "./commands/search.js";
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
}

interface LeagueCliOptions extends CommonCliOptions {
  realm: string;
  patch?: boolean;
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("poe-wiki-cli")
    .description("查询 Path of Exile 1/2 资料站（poedb、poe2db 与 poewiki、poe2wiki），输出干净、可机读的 markdown。")
    .version(VERSION, "-v, --version", "显示版本号")
    .showHelpAfterError();

  program
    .command("search")
    .description("搜索资料站与 wiki（默认两站都查，可用 --game 切换 PoE1/PoE2）")
    .argument("<query...>", "搜索关键词，可包含空格")
    .option("-g, --game <game>", "游戏版本：poe1|poe2", "poe1")
    .option("-s, --source <source>", "数据源：both|poedb|wiki", "both")
    .option("-l, --lang <lang>", "poedb 语言（默认按查询词推断：中文→cn，其它→us）")
    .option("-n, --limit <n>", "poewiki 结果上限", "8")
    .option("-j, --json", "输出机器可读的 JSON")
    .option("--no-cache", "跳过本地缓存")
    .option("--timeout <ms>", "请求超时（毫秒）", "20000")
    .action(async (queryParts: string[], options: SearchCliOptions) => {
      const query = queryParts.join(" ").trim();
      if (!query) {
        throw new UsageError("搜索关键词不能为空。");
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
    .description("抓取页面并输出 markdown")
    .argument("<target>", "完整 URL、poedb:/poe2db:<标题>、wiki:/poe2wiki:<标题> 或裸标题")
    .option("-g, --game <game>", "游戏版本：poe1|poe2（完整 URL 以 host 为准）", "poe1")
    .option("-s, --source <source>", "数据源：auto|both|poedb|wiki", "auto")
    .option("-l, --lang <lang>", "poedb 语言（默认按标题推断：中文→cn，其它→us）")
    .option("-j, --json", "输出机器可读的 JSON")
    .option("--no-cache", "跳过本地缓存")
    .option("--timeout <ms>", "请求超时（毫秒）", "20000")
    .option("--max-chars <n>", "正文最大字符数，超出会被截断（--html 时默认 0 表示不截断）")
    .option("--raw", "只输出正文 markdown，省略标题与元信息")
    .option("--html", "直接输出原始 HTML（去掉脚本/样式/导航等噪声，不转 markdown）")
    .option("--sections", "额外输出章节大纲")
    .action(async (target: string, options: PageCliOptions) => {
      if (options.html === true && options.raw === true) {
        throw new UsageError(
          "--html 与 --raw 不能同时使用。",
          "要原始 HTML 就去掉 --raw；要正文 markdown 就去掉 --html。",
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
      });
      printPage(document, options.json === true, options.raw === true);
    });

  program
    .command("doctor")
    .description("诊断站点可达性与反爬状态（--game both 检查四个站点）")
    .option("-g, --game <game>", "游戏版本：both|poe1|poe2", "both")
    .option("-j, --json", "输出机器可读的 JSON")
    .option("--timeout <ms>", "请求超时（毫秒）", "20000")
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
    .description("查看资料站首页的赛季/版本信息")
    .option("-g, --game <game>", "游戏版本：poe1|poe2", "poe1")
    .option("--realm <realm>", "服务器：both|us|cn", "both")
    .option("--patch", "展开最新版本的汇总链接")
    .option("-j, --json", "输出机器可读的 JSON")
    .option("--no-cache", "跳过本地缓存")
    .option("--timeout <ms>", "请求超时（毫秒）", "20000")
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
  const lines = ["> 章节大纲"];
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
        lines.push(`  ! 未解析到赛季卡片，可能是首页结构变了。兜底：poe-wiki-cli page ${realm.url} --html`);
      } else if (warning.startsWith("fetch failed:")) {
        lines.push(`  ! 抓取失败：${warning.slice("fetch failed:".length).trim()}`);
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
  throw new UsageError(`不支持的服务器「${value}」。`, "可选值：both、us、cn。");
}

function parseGame(value: string): Game {
  const normalized = value.trim().toLowerCase();
  if ((GAMES as readonly string[]).includes(normalized)) {
    return normalized as Game;
  }
  throw new UsageError(`不支持的游戏版本「${value}」。`, "可选值：poe1、poe2。");
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
    throw new UsageError(`${flag} 需要正整数，收到「${value}」。`);
  }
  return parsed;
}

function parseNonNegativeInt(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new UsageError(`${flag} 需要非负整数，收到「${value}」。`);
  }
  return parsed;
}

function parseSource<T extends string>(value: string, allowed: readonly T[]): T {
  const normalized = value.trim().toLowerCase();
  if (!(allowed as readonly string[]).includes(normalized)) {
    throw new UsageError(`不支持的数据源「${value}」。`, `可选值：${allowed.join("、")}。`);
  }
  return normalized as T;
}

function parseLang(value?: string): Lang | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (!(LANGUAGES as readonly string[]).includes(normalized)) {
    throw new UsageError(`不支持的语言「${value}」。`, `可选值：${LANGUAGES.join("、")}。`);
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
      : new NetworkError(error instanceof Error ? error.message : String(error), "这是未预期的错误，请附上完整命令反馈。");

  if (wantsJson(process.argv)) {
    process.stdout.write(
      `${JSON.stringify(
        { ok: false, error: { code: normalized.code, message: normalized.message, hint: normalized.hint } },
        null,
        2,
      )}\n`,
    );
  } else {
    process.stderr.write(`错误: ${normalized.message}\n提示: ${normalized.hint}\n`);
  }

  process.exitCode = EXIT_CODE[normalized.code] ?? 4;
});
