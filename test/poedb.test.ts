import assert from "node:assert/strict";
import { test } from "node:test";
import { extractPageContent, inferLang, isMissUrl } from "../src/sources/poedb.js";

test("首页跳转视为未命中", () => {
  assert.equal(isMissUrl("https://poedb.tw/us/", "us"), true);
  assert.equal(isMissUrl("https://poedb.tw/us", "us"), true);
});

test("空搜索页 /{lang}/search 视为未命中", () => {
  assert.equal(isMissUrl("https://poedb.tw/us/search?q=skill%20gem", "us"), true);
  assert.equal(isMissUrl("https://poedb.tw/us/search", "us"), true);
});

test("命中页面不算未命中", () => {
  assert.equal(isMissUrl("https://poedb.tw/us/Headhunter", "us"), false);
  assert.equal(isMissUrl("https://poedb.tw/cn/Chaos_Orb", "cn"), false);
  assert.equal(isMissUrl("https://poedb.tw/us/Search", "us"), false);
});

test("落到其它语言视为未命中", () => {
  assert.equal(isMissUrl("https://poedb.tw/cn/Headhunter", "us"), true);
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
