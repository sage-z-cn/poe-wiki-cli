import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { parseSkillVersion } from "../src/commands/skill.js";

const root = new URL("../../", import.meta.url);
const packageJson = JSON.parse(readFileSync(fileURLToPath(new URL("package.json", root)), "utf8")) as {
  version: string;
};
const skill = readFileSync(fileURLToPath(new URL("skill/SKILL.md", root)), "utf8");

test("skill frontmatter 的版本与 package.json 完全一致", () => {
  assert.equal(parseSkillVersion(skill), packageJson.version);
});

test("skill frontmatter 含 name: poe-wiki-cli", () => {
  assert.match(skill, /^name: poe-wiki-cli$/m);
});

test("parseSkillVersion 支持 CRLF，缺失版本时返回 null", () => {
  assert.equal(parseSkillVersion("---\r\nname: x\r\nversion: 1.2.3\r\n---\r\n"), "1.2.3");
  assert.equal(parseSkillVersion("---\nname: x\n---\n"), null);
  assert.equal(parseSkillVersion("no frontmatter"), null);
});
