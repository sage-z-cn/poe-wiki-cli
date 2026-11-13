import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagePath = path.join(root, "package.json");
const skillPath = path.join(root, "skill", "SKILL.md");

const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
const version = packageJson.version;
const content = await readFile(skillPath, "utf8");

const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
if (!frontmatter) {
  console.error("skill/SKILL.md has no YAML frontmatter.");
  process.exit(1);
}

const block = frontmatter[1];
let updated = block;

if (/^version:[^\r\n]*$/m.test(block)) {
  updated = block.replace(/^version:[^\r\n]*$/m, `version: ${version}`);
} else if (/^name:[^\r\n]*$/m.test(block)) {
  updated = block.replace(/^name:[^\r\n]*$/m, (line) => `${line}\nversion: ${version}`);
} else {
  console.error("skill/SKILL.md frontmatter has neither a name nor a version field.");
  process.exit(1);
}

if (updated === block) {
  console.log(`skill version already ${version} (no change)`);
  process.exit(0);
}

const next = content.replace(frontmatter[0], `---\n${updated}\n---`);
await writeFile(skillPath, next, "utf8");
console.log(`skill version synced to ${version}`);
