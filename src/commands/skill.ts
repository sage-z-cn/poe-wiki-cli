import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { UsageError } from "../http.js";

export interface SkillResult {
  version: string;
  content: string;
}

/**
 * 源码布局（src/commands）与构建布局（dist/src/commands）到包根的层数不同，
 * 依次尝试两种相对路径，取实际存在的那个。
 */
function bundledSkillCandidates(): string[] {
  return [
    fileURLToPath(new URL("../../skill/SKILL.md", import.meta.url)),
    fileURLToPath(new URL("../../../skill/SKILL.md", import.meta.url)),
  ];
}

export function parseSkillVersion(content: string): string | null {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!frontmatter) {
    return null;
  }
  const line = /^version:[^\r\n]*$/m.exec(frontmatter[1]);
  if (!line) {
    return null;
  }
  const value = line[0].slice("version:".length).trim();
  return value || null;
}

export function runSkill(): SkillResult {
  const bundledPath = bundledSkillCandidates().find((candidate) => existsSync(candidate));
  if (!bundledPath) {
    throw new UsageError(
      "The bundled skill file is missing from this installation.",
      "Reinstall the package (npm i -g poe-wiki-cli) and try again.",
    );
  }

  let content: string;
  try {
    content = readFileSync(bundledPath, "utf8");
  } catch {
    throw new UsageError(
      "The bundled skill file could not be read.",
      "Check file permissions, or reinstall the package (npm i -g poe-wiki-cli).",
    );
  }

  const version = parseSkillVersion(content);
  if (!version) {
    throw new UsageError(
      "The bundled skill has no version in its frontmatter.",
      "Reinstall the package (npm i -g poe-wiki-cli) and try again.",
    );
  }

  return { version, content };
}
