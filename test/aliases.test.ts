import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveAlias, resolveOrphanSlug } from "../src/aliases.js";

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

test("赛季机制俗称映射到官方名", () => {
  assert.equal(resolveAlias("祭坛"), "驱灵仪式");
  assert.equal(resolveAlias("采棉花"), "庄园");
  assert.equal(resolveAlias("黄金港"), "夺宝奇兵");
  assert.equal(resolveAlias("挖坟"), "先祖秘藏");
  assert.equal(resolveAlias("野兽"), "猎魔");
  assert.equal(resolveAlias("下矿"), "地心探索");
  assert.equal(resolveAlias("厕所"), "禁域");
  assert.equal(resolveAlias("圣所"), "禁域");
});

test("庄园命能俗称映射到官方通货名", () => {
  assert.equal(resolveAlias("黄棉花"), "活性黄晶命能");
  assert.equal(resolveAlias("蓝棉花"), "原始蓝晶命能");
  assert.equal(resolveAlias("紫棉花"), "狂野紫晶命能");
});

test("词典里已有的精确条目不会成为别名", () => {
  assert.equal(resolveAlias("女武神"), null);
  assert.equal(resolveAlias("虚空"), null);
  assert.equal(resolveAlias("猎首"), null);
  assert.equal(resolveAlias("法师之血"), null);
  assert.equal(resolveAlias("病患"), null);
});

test("孤岛页：官方名直接映射到 slug", () => {
  assert.equal(resolveOrphanSlug("禁域"), "Sanctum");
  assert.equal(resolveOrphanSlug(" 禁域 "), "Sanctum");
  assert.equal(resolveOrphanSlug("Sanctum"), null);
  assert.equal(resolveOrphanSlug("不存在"), null);
  assert.equal(resolveOrphanSlug(""), null);
});

test("输入归一化：首尾空白与括号不影响命中", () => {
  assert.equal(resolveAlias("  病人 "), "病患");
  assert.equal(resolveAlias("【病人】"), "病患");
  assert.equal(resolveAlias(" 法血\t"), "法师之血");
  assert.equal(resolveAlias(""), null);
  assert.equal(resolveAlias("   "), null);
});
