import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDictIndex,
  extractDictFilename,
  extractHeaderScript,
  lookupDict,
  normalizeName,
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

test("lookupDict：有歧义时返回 null，唯一前缀才命中", () => {
  const ambiguous = buildDictIndex([
    { label: "火焰之球", value: "Fireball" },
    { label: "火焰之球 觉醒", value: "Fireball_Awakened" },
  ]);

  assert.equal(lookupDict(ambiguous, "火焰"), null);
  assert.equal(lookupDict(ambiguous, "火焰之球 觉醒")?.value, "Fireball_Awakened");

  const unique = buildDictIndex([{ label: "法师之血", value: "Mageblood" }]);
  assert.equal(lookupDict(unique, "法师")?.value, "Mageblood");
  assert.equal(lookupDict(unique, "不存在")?.value, undefined);
  assert.equal(lookupDict(unique, "   "), null);
});

test("lookupDict：同一词条的 label 与 value 命中同一条索引时不算歧义", () => {
  const index = buildDictIndex([{ label: "Iron Reflexes", value: "Iron_Reflexes" }]);
  assert.equal(lookupDict(index, "iron ref")?.value, "Iron_Reflexes");
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
