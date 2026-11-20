import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchText, isBlockedBody } from "../src/http.js";

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

test("isBlockedBody 识别 Anubis 与 Cloudflare 验证页", () => {
  assert.equal(isBlockedBody("Making sure you're not a bot! Loading..."), true);
  assert.equal(isBlockedBody("<title>Attention Required! | Cloudflare</title>"), true);
  assert.equal(isBlockedBody('<script src="/cdn-cgi/challenge-platform/..."></script>'), true);
  assert.equal(isBlockedBody("normal page content"), false);
});

test("403 分类为 BLOCKED 并携带 Retry-After 建议", async () => {
  const realFetch = globalThis.fetch;
  // 长重试只有一档 4s；这里直接让所有请求都 403，验证最终错误类型与 hint。
  globalThis.fetch = (async (): Promise<Response> => {
    return new Response("forbidden", { status: 403, headers: { "retry-after": "2" } });
  }) as typeof fetch;

  try {
    await assert.rejects(
      fetchText("https://www.poewiki.net/w/api.php?test=403", { timeoutMs: 1000 }),
      (error: Error & { code?: string; hint?: string }) =>
        error.code === "BLOCKED" && /retry in about 2s/i.test(error.hint ?? ""),
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("404 仍分类为 NOT_FOUND 且不重试", async () => {
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async (_input: unknown): Promise<Response> => {
    calls++;
    void requestUrl(_input);
    return new Response("missing", { status: 404 });
  }) as typeof fetch;

  try {
    await assert.rejects(
      fetchText("https://poedb.tw/us/Definitely_Not_A_Page", { timeoutMs: 1000 }),
      (error: Error & { code?: string }) => error.code === "NOT_FOUND",
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});
