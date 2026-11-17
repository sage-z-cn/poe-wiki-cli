import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDictIndex,
  extractDictFilename,
  extractHeaderScript,
  isRetiredSlug,
  lookupDict,
  lookupFuzzy,
  lookupNav,
  lookupNavFuzzy,
  normalizeName,
  parseNavIndex,
  type DictEntry,
} from "../src/dict.js";

test("normalizeName：去括号、下划线、大小写", () => {
  assert.equal(normalizeName(" 暴虐之灵"), "暴虐之灵");
  assert.equal(normalizeName("猎首【仿品】"), "猎首 仿品");
  assert.equal(normalizeName("Iron_Reflexes"), "iron reflexes");
  assert.equal(normalizeName("火球（觉醒）"), "火球 觉醒");
  assert.equal(normalizeName("Sirus%2C_Awakener_of_Worlds"), "sirus, awakener of worlds");
});

test("buildDictIndex：label 与 value 双向建索引，冲突保留先出现", () => {
  const entries: DictEntry[] = [
    { label: "猎首", value: "Headhunter" },
    { label: "Headhunter 别名", value: "Headhunter" },
  ];
  const index = buildDictIndex(entries);

  assert.equal(index.get("猎首")?.label, "猎首");
  assert.equal(index.get("headhunter")?.label, "猎首");
  assert.equal(index.get("headhunter 别名")?.label, "Headhunter 别名");
});

test("lookupDict：精确命中 label 与 slug", () => {
  const index = buildDictIndex([
    { label: "法师之血", value: "Mageblood" },
    { label: "猎首", value: "Headhunter" },
  ]);

  assert.equal(lookupDict(index, "法师之血")?.value, "Mageblood");
  assert.equal(lookupDict(index, "mageblood")?.value, "Mageblood");
  assert.equal(lookupDict(index, " 法师之血 ")?.value, "Mageblood");
});

test("lookupDict：只接受精确命中，模糊匹配交给 lookupFuzzy", () => {
  const index = buildDictIndex([
    { label: "火焰之球", value: "Fireball" },
    { label: "火焰之球 觉醒", value: "Fireball_Awakened" },
  ]);

  assert.equal(lookupDict(index, "火焰"), null);
  assert.equal(lookupDict(index, "火焰之球 觉醒")?.value, "Fireball_Awakened");

  const fuzzy = lookupFuzzy(index, "火焰");
  assert.deepEqual(
    fuzzy.map((entry) => entry.value),
    ["Fireball", "Fireball_Awakened"],
  );

  const unique = buildDictIndex([{ label: "法师之血", value: "Mageblood" }]);
  assert.equal(lookupDict(unique, "法师"), null);
  assert.equal(lookupDict(unique, "法师之血")?.value, "Mageblood");
  assert.equal(lookupDict(unique, "不存在"), null);
  assert.equal(lookupDict(unique, "   "), null);
});

test("lookupFuzzy：前缀优先于包含，结果去重", () => {
  const index = buildDictIndex([
    { label: "致命贪婪圣甲虫", value: "Ultimatum_Scarab" },
    { label: "决斗之致命贪婪圣甲虫", value: "Ultimatum_Scarab_of_Dueling" },
    { label: "圣甲虫之贤主钉", value: "Mavens_Chisel_of_Scarabs" },
  ]);

  assert.deepEqual(
    lookupFuzzy(index, "致命贪婪").map((entry) => entry.value),
    ["Ultimatum_Scarab", "Ultimatum_Scarab_of_Dueling"],
  );

  // 精确查询「圣甲虫」在词典里没有条目，模糊匹配只会给出候选，不会自动采用。
  assert.equal(lookupDict(index, "圣甲虫"), null);
  assert.ok(lookupFuzzy(index, "圣甲虫").length > 0);
});

test("extractHeaderScript：绝对地址与协议相对地址", () => {
  const absolute = `<script src="https://cdn.poedb.tw/js/poedb_header.902abf02267bb79a.js"></script>`;
  assert.equal(extractHeaderScript(absolute), "https://cdn.poedb.tw/js/poedb_header.902abf02267bb79a.js");

  const relative = `<script src="//cdn.poe2db.tw/js/poedb_header.902abf02267bb79a.js"></script>`;
  assert.equal(extractHeaderScript(relative), "https://cdn.poe2db.tw/js/poedb_header.902abf02267bb79a.js");

  assert.equal(extractHeaderScript("<html></html>"), null);
});

test("extractDictFilename：只取对应语言的文件名", () => {
  const js = `var d={cn:'autocomplete_cn.d77eb297b4676463.json',us:'autocomplete_us.1698606694758d09.json'};`;

  assert.equal(extractDictFilename(js, "cn"), "autocomplete_cn.d77eb297b4676463.json");
  assert.equal(extractDictFilename(js, "us"), "autocomplete_us.1698606694758d09.json");
  assert.equal(extractDictFilename(js, "jp"), null);
});

const HOME_HTML = `<html><body>
<nav><a href="/cn/">首页</a><a href="/cn/patreon">赞助</a></nav>
<div class="page-content" role="main">
  <a href="/cn/Ultimatum">致命贪婪</a>
  <a href="/cn/Ritual">驱灵仪式</a>
  <a href="/cn/Breach">深渊</a>
  <a href="/cn/Abyss">深渊</a>
  <a href="/cn/Maps">地图</a>
  <a href="/cn/search">搜索</a>
  <a href="/cn/Ultimatum_league">致命贪婪</a>
  <a href="https://example.com/cn/Outbound">外链</a>
  <a href="/us/Headhunter">Headhunter</a>
</div>
<footer><a href="/cn/Footer">页脚</a></footer>
</body></html>`;

test("parseNavIndex：只收 page-content 内的站内链接，同名标签保留全部候选", () => {
  const nav = parseNavIndex(HOME_HTML, "cn");

  assert.deepEqual(lookupNav(nav, "致命贪婪"), ["Ultimatum", "Ultimatum_league"]);
  assert.deepEqual(lookupNav(nav, "驱灵仪式"), ["Ritual"]);
  // 同一个标签指向两个页面时必须都保留，不能只留一个。
  assert.deepEqual(lookupNav(nav, "深渊"), ["Breach", "Abyss"]);
  assert.deepEqual(lookupNav(nav, "地图"), ["Maps"]);

  // 导航、页脚、搜索页、外链、其它语言都不进索引。
  assert.deepEqual(lookupNav(nav, "赞助"), []);
  assert.deepEqual(lookupNav(nav, "页脚"), []);
  assert.deepEqual(lookupNav(nav, "搜索"), []);
  assert.deepEqual(lookupNav(nav, "外链"), []);
  assert.deepEqual(lookupNav(nav, "Headhunter"), []);
});

test("lookupNav：只做精确匹配，模糊候选交给 lookupNavFuzzy", () => {
  const nav = parseNavIndex(HOME_HTML, "cn");

  assert.deepEqual(lookupNav(nav, "贪婪"), []);
  assert.deepEqual(lookupNavFuzzy(nav, "贪婪"), ["Ultimatum", "Ultimatum_league"]);
  assert.deepEqual(lookupNavFuzzy(nav, "不存在"), []);
});

test("isRetiredSlug：单数 Scarab 系列失效，复数 Scarabs 仍有效", () => {
  assert.equal(isRetiredSlug("Ultimatum_Scarab"), true);
  assert.equal(isRetiredSlug("Ultimatum_Scarab_of_Dueling"), true);
  assert.equal(isRetiredSlug("Scarab"), true);
  assert.equal(isRetiredSlug("Mavens_Chisel_of_Scarabs"), false);
  assert.equal(isRetiredSlug("Headhunter"), false);
});
