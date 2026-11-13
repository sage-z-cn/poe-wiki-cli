export const LANGUAGES = ["us", "tw", "cn", "kr", "ru", "jp", "fr", "de", "th", "pt", "sp"] as const;

export type Lang = (typeof LANGUAGES)[number];

export type SourceName = "poedb" | "poewiki";

export type SearchSource = "both" | "poedb" | "wiki";

export type PageSource = SearchSource | "auto";

export interface SearchResult {
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
  source: SourceName;
  title: string;
  url: string;
  html: string;
  fetchedAt: string;
  locale?: Lang;
  truncated: boolean;
  originalChars: number;
}
