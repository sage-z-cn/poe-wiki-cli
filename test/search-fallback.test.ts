import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { runSearch } from "../src/commands/search.js";

function requestUrl(input: unknown): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  if (input instanceof Request) {
    return input.url;
  }
  return String(input);
}

const POEDB_RESULT_PAGE = `<html><body><div class="card"><h5>火</h5><ul class="list-group">
<li class="list-group-item"><a href="/cn/Fireball">火球</a></li>
</ul></div></body></html>`;

test("wiki 被限流时 both 模式降级输出 poedb 结果与 warning", async () => {
  const realFetch = globalThis.fetch;
  const realLocalAppData = process.env.LOCALAPPDATA;
  process.env.LOCALAPPDATA = path.join(os.tmpdir(), "poe-wiki-cli-test-cache");

  globalThis.fetch = (async (input: unknown): Promise<Response> => {
    const url = requestUrl(input);
    if (url.includes("/search?q=")) {
      return new Response(POEDB_RESULT_PAGE, { status: 200, headers: { "content-type": "text/html" } });
    }
    if (url.includes("generator=search")) {
      return new Response("rate limited", { status: 403 });
    }
    return new Response("missing", { status: 404 });
  }) as typeof fetch;

  try {
    const outcome = await runSearch("火", {
      game: "poe1",
      source: "both",
      limit: 5,
      timeoutMs: 1000,
      noCache: true,
    });

    assert.equal(outcome.results.length, 1);
    assert.equal(outcome.results[0].source, "poedb");
    assert.ok(outcome.warnings?.length === 1);
    assert.match(outcome.warnings![0], /poewiki is unavailable/);
  } finally {
    globalThis.fetch = realFetch;
    if (realLocalAppData === undefined) {
      delete process.env.LOCALAPPDATA;
    } else {
      process.env.LOCALAPPDATA = realLocalAppData;
    }
  }
});

test("wiki 被限流且 poedb 也无结果时，错误信息说明两边状态", async () => {
  const realFetch = globalThis.fetch;
  const realLocalAppData = process.env.LOCALAPPDATA;
  process.env.LOCALAPPDATA = path.join(os.tmpdir(), "poe-wiki-cli-test-cache");

  globalThis.fetch = (async (input: unknown): Promise<Response> => {
    const url = requestUrl(input);
    if (url.includes("/search?q=")) {
      return new Response("<html><body>empty</body></html>", { status: 200 });
    }
    if (url.includes("generator=search")) {
      return new Response("rate limited", { status: 403 });
    }
    return new Response("missing", { status: 404 });
  }) as typeof fetch;

  try {
    await assert.rejects(
      runSearch("不存在的词条", {
        game: "poe1",
        source: "both",
        limit: 5,
        timeoutMs: 1000,
        noCache: true,
      }),
      (error: Error & { code?: string }) =>
        error.code === "NOT_FOUND" &&
        /poewiki was unavailable/.test(error.message),
    );
  } finally {
    globalThis.fetch = realFetch;
    if (realLocalAppData === undefined) {
      delete process.env.LOCALAPPDATA;
    } else {
      process.env.LOCALAPPDATA = realLocalAppData;
    }
  }
});

test("只查 wiki 时限流仍直接抛错", async () => {
  const realFetch = globalThis.fetch;
  const realLocalAppData = process.env.LOCALAPPDATA;
  process.env.LOCALAPPDATA = path.join(os.tmpdir(), "poe-wiki-cli-test-cache");

  globalThis.fetch = (async (input: unknown): Promise<Response> => {
    const url = requestUrl(input);
    if (url.includes("generator=search")) {
      return new Response("rate limited", { status: 403 });
    }
    return new Response("missing", { status: 404 });
  }) as typeof fetch;

  try {
    await assert.rejects(
      runSearch("anything", {
        game: "poe1",
        source: "wiki",
        limit: 5,
        timeoutMs: 1000,
        noCache: true,
      }),
      (error: Error & { code?: string }) => error.code === "BLOCKED",
    );
  } finally {
    globalThis.fetch = realFetch;
    if (realLocalAppData === undefined) {
      delete process.env.LOCALAPPDATA;
    } else {
      process.env.LOCALAPPDATA = realLocalAppData;
    }
  }
});
