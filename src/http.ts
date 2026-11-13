import { readCache, writeCache } from "./cache.js";
import { VERSION } from "./version.js";

/**
 * UA 必须是「非 Mozilla 前缀」，这不是风格问题而是硬性可用性要求：
 * poewiki.net / poe2wiki.net 前置的 Anubis 反爬只挑战 Mozilla/* 的请求，被挑战时仍返回
 * HTTP 200 的 7.5KB 验证页（"Making sure you're not a bot!"），
 * 直接解析会得到空内容。换成本工具的 UA 可以稳定拿到完整页面。
 */
export const USER_AGENT = `poe-wiki-cli/${VERSION} (+https://github.com/sage-z-cn/poe-wiki-cli)`;

const DEFAULT_TIMEOUT_MS = 20_000;
const RETRY_DELAYS_MS = [300, 900];
const ANUBIS_MARKER = "Making sure you're not a bot";

export type ErrorCode = "USAGE" | "NOT_FOUND" | "BLOCKED" | "NETWORK";

export class CliError extends Error {
  readonly code: ErrorCode;
  readonly hint: string;

  constructor(code: ErrorCode, message: string, hint: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.hint = hint;
  }
}

export class UsageError extends CliError {
  constructor(message: string, hint = "Run poe-wiki-cli --help for usage.") {
    super("USAGE", message, hint);
  }
}

export class NotFoundError extends CliError {
  constructor(message: string, hint = "Try another title or keyword, or add --source wiki to search the wiki directly.") {
    super("NOT_FOUND", message, hint);
  }
}

export class BlockedError extends CliError {
  constructor(message: string, hint = "Retry later; if it keeps happening, open the site in a browser to check its status.") {
    super("BLOCKED", message, hint);
  }
}

export class NetworkError extends CliError {
  readonly retryable: boolean;

  constructor(
    message: string,
    hint = "Check your network connection and proxy settings, then retry. You can also raise --timeout.",
    retryable = false,
  ) {
    super("NETWORK", message, hint);
    this.retryable = retryable;
  }
}

export interface FetchTextOptions {
  timeoutMs?: number;
  accept?: string;
  cacheTtlSeconds?: number;
  noCache?: boolean;
}

export interface TextResponse {
  url: string;
  status: number;
  body: string;
}

export function isBlockedBody(body: string): boolean {
  return body.includes(ANUBIS_MARKER);
}

export async function getText(url: string, options: FetchTextOptions = {}): Promise<TextResponse> {
  const ttl = options.cacheTtlSeconds ?? 0;
  const cacheEnabled = !options.noCache && ttl > 0;

  if (cacheEnabled) {
    const cached = await readCache(url, ttl);
    if (cached) {
      return { url: cached.url || url, status: 200, body: cached.body };
    }
  }

  const response = await fetchText(url, options);
  if (cacheEnabled) {
    await writeCache(url, response.url, response.body);
  }
  return response;
}

export async function fetchText(url: string, options: FetchTextOptions = {}): Promise<TextResponse> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const headers: Record<string, string> = {
    "user-agent": USER_AGENT,
    "accept-language": "en-US,en;q=0.9",
    accept: options.accept ?? "text/html,application/json;q=0.9,*/*;q=0.8",
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const response = await fetch(url, {
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = await response.text();

      if (response.status >= 500) {
        // 以 URL 结尾的消息不补句末句号，否则复制链接会把标点一起带走。
        throw new NetworkError(`The server returned HTTP ${response.status} for ${url}`, undefined, true);
      }
      if (response.status === 404) {
        throw new NotFoundError(
          `Page not found (HTTP 404): ${url}`,
          "Check the title spelling, or use the search command to find the right entry.",
        );
      }
      if (response.status >= 400) {
        throw new NetworkError(`Request failed with HTTP ${response.status}: ${url}`);
      }
      if (isBlockedBody(body)) {
        throw new BlockedError(
          `${new URL(url).host} answered with a bot-protection page: ${url}`,
          "This build already sends a non-Mozilla User-Agent; retry later, or use --source poedb.",
        );
      }

      return { url: response.url || url, status: response.status, body };
    } catch (error) {
      if (error instanceof CliError) {
        lastError = error;
        if (error instanceof NetworkError && error.retryable && attempt < RETRY_DELAYS_MS.length) {
          await sleep(RETRY_DELAYS_MS[attempt]);
          continue;
        }
        throw error;
      }

      lastError = new NetworkError(
        `Network request failed: ${url} (${describeError(error)}).`,
        error instanceof Error && error.name === "TimeoutError"
          ? "The request timed out. Retry with --timeout 30000 to allow more time."
          : undefined,
        true,
      );

      if (attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new NetworkError(`Network request failed: ${url}`);
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause instanceof Error && cause.message) {
      return `${error.name}: ${cause.message}`;
    }
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
