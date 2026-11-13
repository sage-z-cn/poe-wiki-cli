import { parse, type HTMLElement } from "node-html-parser";
import { getText } from "../http.js";
import { sanitizeHtml } from "../markdown.js";
import type { Lang } from "../types.js";

export const LEAGUE_TTL_SECONDS = 300;
export const REALMS = ["us", "cn"] as const;

export type Realm = (typeof REALMS)[number];
export type ServerKind = "international" | "tencent";

export interface LeagueLink {
  text: string;
  url: string;
}

export interface LeagueSection {
  label: string;
  links: LeagueLink[];
}

export interface CurrentLeague {
  name: string;
  version: string;
  since: string;
  runningSeconds: number;
}

export interface NextLeague {
  name: string;
  version: string;
  realmDownAt?: string;
  startsAt?: string;
  startsInSeconds?: number;
}

export interface PatchSummary {
  version: string;
  codename: string;
  sections?: LeagueSection[];
}

export interface RealmInfo {
  realm: Realm;
  server: ServerKind;
  locale: Lang;
  url: string;
  current?: CurrentLeague;
  next?: NextLeague;
  patch?: PatchSummary;
  warnings?: string[];
}

export interface LeagueFetchOptions {
  timeoutMs?: number;
  noCache?: boolean;
  includeSections?: boolean;
}

export interface ParseLeagueOptions {
  realm: Realm;
  includeSections?: boolean;
  now?: number;
}

type TimerKind = "running" | "starts" | "realmDown";

interface CardInfo {
  name: string;
  version: string;
  server: ServerKind;
  timers: Array<{ kind: TimerKind; timestamp: number }>;
  sections: LeagueSection[];
}

export async function fetchLeague(realm: Realm, options: LeagueFetchOptions = {}): Promise<RealmInfo> {
  const url = `https://poedb.tw/${realm}/`;
  const response = await getText(url, {
    timeoutMs: options.timeoutMs,
    noCache: options.noCache,
    cacheTtlSeconds: LEAGUE_TTL_SECONDS,
    accept: "text/html",
  });

  return parseLeagueHomepage(response.body, {
    realm,
    includeSections: options.includeSections,
    now: Date.now(),
  });
}

/**
 * 解析 poedb 首页的赛季信息。首页里同时存在计时卡片（带 data-displaytime）
 * 和版本汇总卡片（带 itemList），并且还有商城特卖卡片混在同一个 row 里，
 * 所以靠「header 里是否带版本号 <small>」「是否 class=special」这两条来筛选，
 * 绝不能假设「第一张卡片」就是目标赛季。
 */
export function parseLeagueHomepage(html: string, options: ParseLeagueOptions): RealmInfo {
  const root = parse(sanitizeHtml(html), { comment: false });
  const locale = options.realm;
  const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000);
  const cards = collectCards(root, locale);

  const info: RealmInfo = {
    realm: options.realm,
    server: locale === "cn" ? "tencent" : "international",
    locale,
    url: `https://poedb.tw/${locale}/`,
  };

  const running = cards
    .flatMap((card) => card.timers.filter((timer) => timer.kind === "running").map((timer) => ({ card, timer })))
    .sort((a, b) => b.timer.timestamp - a.timer.timestamp)[0];
  if (running) {
    info.server = running.card.server;
    info.current = {
      name: running.card.name,
      version: running.card.version,
      since: new Date(running.timer.timestamp * 1000).toISOString(),
      runningSeconds: Math.max(0, nowSeconds - running.timer.timestamp),
    };
  }

  const upcoming = cards
    .map((card) => ({ card, startsAt: pickTimer(card, "starts"), realmDownAt: pickTimer(card, "realmDown") }))
    .filter((candidate) => candidate.startsAt !== undefined || candidate.realmDownAt !== undefined)
    .sort((a, b) => (a.startsAt ?? a.realmDownAt!) - (b.startsAt ?? b.realmDownAt!))[0];

  if (upcoming) {
    info.server = upcoming.card.server;
    const next: NextLeague = { name: upcoming.card.name, version: upcoming.card.version };
    if (upcoming.realmDownAt !== undefined) {
      next.realmDownAt = new Date(upcoming.realmDownAt * 1000).toISOString();
    }
    if (upcoming.startsAt !== undefined) {
      next.startsAt = new Date(upcoming.startsAt * 1000).toISOString();
      next.startsInSeconds = Math.max(0, upcoming.startsAt - nowSeconds);
    }
    info.next = next;
  }

  const patch = pickLatestPatch(cards);
  if (patch) {
    info.patch = options.includeSections
      ? { version: patch.version, codename: patch.name, sections: patch.sections }
      : { version: patch.version, codename: patch.name };
  }

  if (!info.current && !info.next && !info.patch) {
    info.warnings = ["no league cards parsed; homepage layout may have changed"];
  }

  return info;
}

function collectCards(root: HTMLElement, locale: Lang): CardInfo[] {
  const cards: CardInfo[] = [];

  for (const element of root.querySelectorAll("div.card")) {
    const classes = classTokens(element);
    if (classes.includes("special")) {
      continue;
    }

    const header = element.querySelector("h5");
    if (!header) {
      continue;
    }
    const small = header.querySelector("small");
    const version = (small?.text ?? "").trim();
    if (!/^\d+\.\d+$/.test(version)) {
      continue;
    }

    const rawName = headerTextWithoutSmall(header, small);
    const { name, server } = splitServer(rawName, locale);
    if (!name) {
      continue;
    }

    const timers: Array<{ kind: TimerKind; timestamp: number }> = [];
    for (const timerElement of element.querySelectorAll("[data-displaytime]")) {
      const timestamp = Number(timerElement.getAttribute("data-displaytime"));
      if (!Number.isFinite(timestamp) || timestamp <= 0) {
        continue;
      }
      const kind = classifyLabel(labelAfter(timerElement));
      if (kind) {
        timers.push({ kind, timestamp });
      }
    }

    const sections = collectSections(element, locale);
    cards.push({ name, version, server, timers, sections });
  }

  return cards;
}

function collectSections(element: HTMLElement, locale: Lang): LeagueSection[] {
  const sections: LeagueSection[] = [];

  for (const list of element.querySelectorAll(".itemList")) {
    const listElement = list.querySelector("ul");
    if (!listElement) {
      continue;
    }
    const items = listElement.childNodes.filter(
      (child): child is HTMLElement => child.nodeType === 1 && (child.rawTagName ?? "").toLowerCase() === "li",
    );
    if (items.length === 0) {
      continue;
    }

    const labelElement = items[0].querySelector("span.disabled") ?? items[0];
    const label = collapse(labelElement.text);
    const links: LeagueLink[] = [];

    for (const item of items.slice(1)) {
      const anchor = item.querySelector("a");
      if (!anchor) {
        continue;
      }
      const text = collapse(anchor.text);
      const url = resolveLink(anchor.getAttribute("href") ?? "", locale);
      if (text && url) {
        links.push({ text, url });
      }
    }

    if (label && links.length > 0) {
      sections.push({ label, links });
    }
  }

  return sections;
}

function pickLatestPatch(cards: CardInfo[]): CardInfo | null {
  const candidates = cards.filter((card) => card.sections.length > 0);
  if (candidates.length === 0) {
    return null;
  }
  return candidates.sort((a, b) => compareVersion(b.version, a.version))[0];
}

function compareVersion(a: string, b: string): number {
  const left = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const right = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

function pickTimer(card: CardInfo, kind: TimerKind): number | undefined {
  return card.timers.find((timer) => timer.kind === kind)?.timestamp;
}

function classifyLabel(label: string): TimerKind | null {
  const value = label.toLowerCase();
  if (value.includes("已运行") || value.includes("running") || value.includes("since")) {
    return "running";
  }
  if (value.includes("realm down") || value.includes("服务器关闭") || value.includes("停机")) {
    return "realmDown";
  }
  if (value.includes("开始倒数") || value.includes("starts in") || value.includes("start")) {
    return "starts";
  }
  return null;
}

function labelAfter(element: HTMLElement): string {
  let sibling = element.nextElementSibling;
  for (let hop = 0; sibling && hop < 3; hop++) {
    const text = collapse(sibling.text);
    if (text) {
      return text;
    }
    sibling = sibling.nextElementSibling;
  }
  return "";
}

function headerTextWithoutSmall(header: HTMLElement, small: HTMLElement | null): string {
  const parts: string[] = [];
  for (const child of header.childNodes) {
    if (small && child === small) {
      continue;
    }
    parts.push(child.text ?? "");
  }
  return collapse(parts.join(""));
}

function splitServer(rawName: string, locale: Lang): { name: string; server: ServerKind } {
  const match = /^(.*?)\s*(腾讯服|国际服)$/.exec(rawName);
  if (match) {
    return {
      name: match[1].trim(),
      server: match[2] === "腾讯服" ? "tencent" : "international",
    };
  }
  return { name: rawName, server: locale === "cn" ? "tencent" : "international" };
}

function resolveLink(href: string, locale: Lang): string | null {
  const value = href.trim();
  if (!value) {
    return null;
  }
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  if (value.startsWith("/")) {
    return `https://poedb.tw${value}`;
  }
  return `https://poedb.tw/${locale}/${value}`;
}

function classTokens(element: HTMLElement): string[] {
  return (element.getAttribute("class") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.toLowerCase());
}

function collapse(text: string): string {
  return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
