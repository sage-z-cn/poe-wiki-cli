import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { runSearch } from "../src/commands/search.js";

const POEDB_RESULT_PAGE = `<html><body><div class="card"><h5>火</h5><ul class="list-group">
${Array.from({ length: 5 }, (_, index) => `<li class="list-group-item"><a href="/cn/P${index}">P${index}</a></li>`).join("")}
</ul></div></body></html>`;

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

test("--limit 同时约束 poedb 候选与 wiki 结果", async () => {
  const realFetch = globalThis.fetch;
  const realLocalAppData = process.env.LOCALAPPDATA;
  process.env.LOCALAPPDATA = path.join(os.tmpdir(), "poe-wiki-cli-test-cache");

  globalThis.fetch = (async (input: unknown): Promise<Response> => {
    const url = requestUrl(input);
    if (url.includes("/search?q=")) {
      return new Response(POEDB_RESULT_PAGE, { status: 200, headers: { "content-type": "text/html" } });
    }
    if (url.includes("generator=search")) {
      const pages = Array.from({ length: 5 }, (_, index) => ({ title: `W${index}`, index: index + 1, extract: "x" }));
      return new Response(JSON.stringify({ query: { pages } }), { status: 200 });
    }
    return new Response("missing", { status: 404 });
  }) as typeof fetch;

  try {
    const outcome = await runSearch("火", {
      game: "poe1",
      source: "both",
      limit: 3,
      timeoutMs: 1000,
      noCache: true,
    });

    assert.equal(outcome.results.filter((result) => result.source === "poedb").length, 3);
    assert.equal(outcome.results.filter((result) => result.source === "poewiki").length, 3);
  } finally {
    globalThis.fetch = realFetch;
    if (realLocalAppData === undefined) {
      delete process.env.LOCALAPPDATA;
    } else {
      process.env.LOCALAPPDATA = realLocalAppData;
    }
  }
});
