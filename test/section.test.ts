import assert from "node:assert/strict";
import { test } from "node:test";
import { sliceSection } from "../src/commands/page.js";

const MARKDOWN = [
  "# Vault",
  "",
  "intro text",
  "",
  "## Mechanics",
  "",
  "mechanics body",
  "",
  "### Sub detail",
  "",
  "sub body",
  "",
  "## Version history",
  "",
  "version body",
].join("\n");

test("切出指定章节含子章节", () => {
  const section = sliceSection(MARKDOWN, "Mechanics");
  assert.ok(section);
  assert.match(section, /^## Mechanics/);
  assert.match(section, /mechanics body/);
  assert.match(section, /### Sub detail/);
  assert.match(section, /sub body/);
  assert.doesNotMatch(section, /version body/);
  assert.doesNotMatch(section, /^# Vault/m);
});

test("最后一个章节切到文末", () => {
  const section = sliceSection(MARKDOWN, "Version history");
  assert.ok(section);
  assert.match(section, /^## Version history/);
  assert.match(section, /version body/);
  assert.doesNotMatch(section, /mechanics body/);
});

test("标题匹配忽略大小写与首尾空白", () => {
  const section = sliceSection(MARKDOWN, "  mechanics ");
  assert.ok(section);
  assert.match(section, /^## Mechanics/);
});

test("找不到标题返回 null", () => {
  assert.equal(sliceSection(MARKDOWN, "Nonexistent"), null);
  assert.equal(sliceSection(MARKDOWN, ""), null);
  assert.equal(sliceSection("no headings here", "Anything"), null);
});

test("一级标题切分时不会吞掉后续同级内容之外的部分", () => {
  const doc = ["# A", "a-body", "# B", "b-body"].join("\n");
  const section = sliceSection(doc, "A");
  assert.ok(section);
  assert.equal(section, "# A\na-body");
});
