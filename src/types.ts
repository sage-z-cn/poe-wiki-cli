import type { Game } from "./sites.js";

export const LANGUAGES = ["us", "tw", "cn", "kr", "ru", "jp", "fr", "de", "th", "pt", "sp"] as const;

export type Lang = (typeof LANGUAGES)[number];

/** 逻辑来源（用户输入用）与文本/JSON 里展示的来源是两套命名。 */
export type SearchSource = "both" | "poedb" | "wiki";

export type PageSource = SearchSource | "auto";

/** 输出里使用实际站点名，便于区分 PoE1 / PoE2。 */
export type SourceName = "poedb" | "poewiki" | "poe2db" | "poe2wiki";

export interface SearchResult {
  game: Game;
  source: SourceName;
  kind: "page" | "search";
  title: string;
  url: string;
  snippet?: string;
  size?: number;
  wordcount?: number;
}

export interface Section {
  level: number;
  title: string;
}

export interface PageDocument {
  game: Game;
  source: SourceName;
  title: string;
  url: string;
  markdown: string;
  fetchedAt: string;
  locale?: Lang;
  sections?: Section[];
  truncated: boolean;
  originalChars: number;
}

export interface PageHtmlDocument {
  game: Game;
  source: SourceName;
  title: string;
  url: string;
  html: string;
  fetchedAt: string;
  locale?: Lang;
  truncated: boolean;
  originalChars: number;
}
