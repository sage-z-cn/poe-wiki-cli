import assert from "node:assert/strict";
import { test } from "node:test";
import { pageUrl, parseSearchPages, titleFromUrl } from "../src/sources/poewiki.js";

test("页面 URL：空格转下划线并编码", () => {
  assert.equal(pageUrl("Headhunter"), "https://www.poewiki.net/wiki/Headhunter");
  assert.equal(pageUrl("Iron Reflexes"), "https://www.poewiki.net/wiki/Iron_Reflexes");
  assert.equal(pageUrl("Lioneye's Watch"), "https://www.poewiki.net/wiki/Lioneye's_Watch");
  assert.equal(pageUrl("Support gem/Quality"), "https://www.poewiki.net/wiki/Support_gem/Quality");
});

test("从 /wiki/ 链接解析标题", () => {
  assert.equal(titleFromUrl("https://www.poewiki.net/wiki/Endgame"), "Endgame");
  assert.equal(titleFromUrl("https://www.poewiki.net/wiki/Iron_Reflexes"), "Iron Reflexes");
  assert.equal(titleFromUrl("https://www.poewiki.net/wiki/Lioneye%27s_Watch"), "Lioneye's Watch");
});

test("从 index.php?title= 链接解析标题", () => {
  assert.equal(titleFromUrl("https://www.poewiki.net/w/index.php?title=Endgame"), "Endgame");
  assert.equal(titleFromUrl("https://www.poewiki.net/w/index.php?title=Iron%20Reflexes"), "Iron Reflexes");
});

test("非 wiki 路径返回 null", () => {
  assert.equal(titleFromUrl("https://www.poewiki.net/"), null);
  assert.equal(titleFromUrl("https://www.poewiki.net/w/api.php?action=query"), null);
});

test("generator 结果按 index 排序，摘要是条目开头的纯文本", () => {
  const hits = parseSearchPages({
    query: {
      pages: [
        { title: "Support gem", index: 2, extract: "A  support gem\nmodifies compatible skill gems." },
        { title: "Fireball", index: 1, extract: "Fireball is a spell that fires a projectile &amp; explodes." },
      ],
    },
  });

  assert.deepEqual(
    hits.map((hit) => hit.title),
    ["Fireball", "Support gem"],
  );
  assert.equal(hits[0].snippet, "Fireball is a spell that fires a projectile & explodes.");
  assert.equal(hits[1].snippet, "A support gem modifies compatible skill gems.");
  assert.equal(hits[0].size, 0);
  assert.equal(hits[0].wordcount, 0);
  assert.equal(hits[0].url, "https://www.poewiki.net/wiki/Fireball");
});

test("pages 为对象形式时同样可解析，空 extract 回退为空字符串", () => {
  const hits = parseSearchPages({
    query: {
      pages: {
        "42": { title: "Endgame", index: 1 },
      },
    },
  });

  assert.equal(hits.length, 1);
  assert.equal(hits[0].title, "Endgame");
  assert.equal(hits[0].snippet, "");
});

test("pages 缺失或为空时返回空数组", () => {
  assert.deepEqual(parseSearchPages({}), []);
  assert.deepEqual(parseSearchPages({ query: {} }), []);
  assert.deepEqual(parseSearchPages({ query: { pages: [] } }), []);
});
