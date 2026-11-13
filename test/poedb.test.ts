import assert from "node:assert/strict";
import { test } from "node:test";
import {
  encodeDbPath,
  extractPageContent,
  inferLang,
  parseDbSearchResults,
  pickCandidate,
  type PoedbSearchHit,
} from "../src/sources/poedb.js";

const RESULT_PAGE = `<!DOCTYPE html><html><body>
  <div class="card mb-2 ">
    <h5 class="card-header">希鲁斯</h5>
    <ul class="list-group">
      <li class="list-group-item"><a data-hover="https://cdn.poedb.tw/cache1/cn/x" href="/cn/Sirus_Storm">希鲁斯风暴</a></li>
      <li class="list-group-item"><a href="/cn/Sirus%2C_Awakener_of_Worlds">诸界觉者希鲁斯</a></li>
      <li class="list-group-item"><a href="/cn/Sirus%2C_Awakener_of_Worlds">诸界觉者希鲁斯</a></li>
      <li class="list-group-item"><a href="/cn/Sirus%2C_Awakener_of_Worlds">诸界觉者希鲁斯</a></li>
      <li class="list-group-item"><a href="/cn/Sirus%2C_Awakener_of_Worlds">诸界觉者希鲁斯</a></li>
      <li class="list-group-item"><a href="/cn/Sirus%2C_Awakener_of_Worlds">诸界觉者希鲁斯</a></li>
      <li class="list-group-item"><a href="https://example.com/other">外部链接</a></li>
      <li class="list-group-item"><a href="/us/Sirus_Storm">其它语言</a></li>
      <li class="list-group-item"><a href="/cn/search?q=x">搜索页</a></li>
      <li class="list-group-item"><a href="/cn/Sirus_Storm"></a></li>
    </ul>
  </div>
</body></html>`;

test("encodeDbPath：路径里的字面逗号编码为 %2C，已编码的不重复编码", () => {
  assert.equal(
    encodeDbPath("https://poedb.tw/us/Sirus,_Awakener_of_Worlds"),
    "https://poedb.tw/us/Sirus%2C_Awakener_of_Worlds",
  );
  assert.equal(
    encodeDbPath("https://poedb.tw/cn/Sirus%2C_Awakener_of_Worlds"),
    "https://poedb.tw/cn/Sirus%2C_Awakener_of_Worlds",
  );
  assert.equal(encodeDbPath("https://poedb.tw/us/Headhunter"), "https://poedb.tw/us/Headhunter");
});

test("parseDbSearchResults：重复条目按 URL 去重，外链/其它语言/搜索页/空标题被过滤", () => {
  const results = parseDbSearchResults(
    RESULT_PAGE,
    "https://poedb.tw/cn/search?q=%E5%B8%8C%E9%B2%81%E6%96%AF",
    "cn",
  );

  assert.deepEqual(
    results.map((result) => result.title),
    ["希鲁斯风暴", "诸界觉者希鲁斯"],
  );
  assert.equal(results[0].url, "https://poedb.tw/cn/Sirus_Storm");
  assert.equal(results[1].url, "https://poedb.tw/cn/Sirus%2C_Awakener_of_Worlds");
  assert.equal(results[1].game, "poe1");
  assert.equal(results[1].locale, "cn");
});

test("parseDbSearchResults：相对 href 按结果页地址补全", () => {
  const html = `<div class="card"><ul class="list-group">
    <li class="list-group-item"><a href="Bereks_Pass">贝雷克的冰与火之歌</a></li>
  </ul></div>`;
  const results = parseDbSearchResults(html, "https://poedb.tw/cn/search?q=fire", "cn");

  assert.equal(results.length, 1);
  assert.equal(results[0].url, "https://poedb.tw/cn/Bereks_Pass");
});

test("parseDbSearchResults：空结果页返回空数组", () => {
  const html = `<div class="card"><h5 class="card-header">火</h5><ul class="list-group"></ul></div>`;
  assert.deepEqual(parseDbSearchResults(html, "https://poedb.tw/cn/search?q=fire", "cn"), []);
});

test("pickCandidate：多候选中只有标题完全一致才命中", () => {
  const candidates: PoedbSearchHit[] = [
    { game: "poe1", title: "希鲁斯风暴", url: "https://poedb.tw/cn/Sirus_Storm", locale: "cn" },
    {
      game: "poe1",
      title: "诸界觉者希鲁斯",
      url: "https://poedb.tw/cn/Sirus%2C_Awakener_of_Worlds",
      locale: "cn",
    },
  ];

  assert.equal(pickCandidate(candidates, "希鲁斯"), null);
  assert.equal(pickCandidate(candidates, " 诸界觉者希鲁斯 ")?.url, "https://poedb.tw/cn/Sirus%2C_Awakener_of_Worlds");
  assert.equal(pickCandidate(candidates, "Sirus"), null);
});

test("pickCandidate：唯一候选直接命中", () => {
  const only: PoedbSearchHit[] = [
    { game: "poe1", title: "Sirus Storm", url: "https://poedb.tw/us/Sirus_Storm", locale: "us" },
  ];
  assert.equal(pickCandidate(only, "sirus")?.title, "Sirus Storm");
});

test("locale 推断：中文用 cn，英文用 us，显式 lang 优先", () => {
  assert.equal(inferLang("猎首"), "cn");
  assert.equal(inferLang("火球 命运卡"), "cn");
  assert.equal(inferLang("Headhunter"), "us");
  assert.equal(inferLang("猎首", "tw"), "tw");
  assert.equal(inferLang("Headhunter", "cn"), "cn");
});

test("extractPageContent 只保留 page-content 容器内部", () => {
  const html = `<!DOCTYPE html><html><body>
    <nav>site navigation</nav>
    <div class="page"><div class="page-content theme-showcase container" role="main">
      <h3 style='display: none'>Headhunter</h3>
      <div class="explicitMod">+40 to Dexterity</div>
    </div></div>
    <footer>footer noise</footer>
  </body></html>`;
  const content = extractPageContent(html);
  assert.match(content, /\+40 to Dexterity/);
  assert.doesNotMatch(content, /site navigation/);
  assert.doesNotMatch(content, /footer noise/);
  assert.doesNotMatch(content, /<html/);
});
