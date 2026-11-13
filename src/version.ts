import { readFileSync } from "node:fs";

/**
 * 版本号只有一个来源：package.json。写死常量会在 npm version 之后与包版本脱节
 * （0.2.0 就是这样把 0.1.0 发出去的）。dist/src/version.js 相对包根是 ../../package.json。
 */
function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
      version?: unknown;
    };
    if (typeof pkg.version === "string" && pkg.version.trim()) {
      return pkg.version.trim();
    }
  } catch {
    // 落到下面的兜底值，不影响命令执行。
  }
  return "0.0.0";
}

export const VERSION = readVersion();
