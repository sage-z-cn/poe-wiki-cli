import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveAlias } from "../src/aliases.js";

test("旧译名与社区简称映射到词典里的规范名", () => {
  assert.equal(resolveAlias("病人"), "病患");
  assert.equal(resolveAlias("护理师"), "照料者");
  assert.equal(resolveAlias("护士"), "照料者");
  assert.equal(resolveAlias("医生"), "疯医");
  assert.equal(resolveAlias("肮脏"), "死灵遗物");
  assert.equal(resolveAlias("法血"), "法师之血");
  assert.equal(resolveAlias("正火"), "正义之火");
  assert.equal(resolveAlias("猎手"), "猎首");
  assert.equal(resolveAlias("群星"), "群星之灰");
  assert.equal(resolveAlias("大法师"), "大法师（辅）");
  assert.equal(resolveAlias("闪打"), "闪电打击");
  assert.equal(resolveAlias("刀阵"), "飞刃风暴");
});

test("词典里已有的精确条目不会成为别名", () => {
  assert.equal(resolveAlias("女武神"), null);
  assert.equal(resolveAlias("虚空"), null);
  assert.equal(resolveAlias("猎首"), null);
  assert.equal(resolveAlias("法师之血"), null);
  assert.equal(resolveAlias("病患"), null);
});

test("输入归一化：首尾空白与括号不影响命中", () => {
  assert.equal(resolveAlias("  病人 "), "病患");
  assert.equal(resolveAlias("【病人】"), "病患");
  assert.equal(resolveAlias(" 法血\t"), "法师之血");
  assert.equal(resolveAlias(""), null);
  assert.equal(resolveAlias("   "), null);
});
