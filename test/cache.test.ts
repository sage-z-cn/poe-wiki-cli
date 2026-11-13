import assert from "node:assert/strict";
import { test } from "node:test";
import { selectPrunableFiles } from "../src/cache.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

function file(path: string, ageDays: number): { path: string; mtime: number } {
  return { path, mtime: NOW - ageDays * DAY_MS };
}

test("selectPrunableFiles：删除超过 7 天的文件，保留新鲜的", () => {
  const victims = selectPrunableFiles(
    [file("old-8d.json", 8), file("old-30d.json", 30), file("fresh-1d.json", 1), file("fresh-6d.json", 6)],
    NOW,
  );

  assert.deepEqual(victims.sort(), ["old-30d.json", "old-8d.json"]);
});

test("selectPrunableFiles：不足 500 个时不做数量淘汰", () => {
  const files = Array.from({ length: 120 }, (_, index) => file(`f-${index}.json`, 1));
  assert.deepEqual(selectPrunableFiles(files, NOW), []);
});

test("selectPrunableFiles：超过 500 个时按 mtime 从旧到新删到 500", () => {
  const files = Array.from({ length: 520 }, (_, index) => file(`f-${String(index).padStart(3, "0")}.json`, (519 - index) / 100));
  const victims = selectPrunableFiles(files, NOW);

  assert.equal(victims.length, 20);
  // f-000..f-019 的 ageDays 最大，也就是 mtime 最旧。
  assert.deepEqual(victims.sort(), files.slice(0, 20).map((entry) => entry.path).sort());
});

test("selectPrunableFiles：过期清理后剩余不足 500 就不再删", () => {
  const files = [
    ...Array.from({ length: 400 }, (_, index) => file(`fresh-${index}.json`, 1)),
    ...Array.from({ length: 50 }, (_, index) => file(`old-${index}.json`, 10)),
  ];
  const victims = selectPrunableFiles(files, NOW);

  assert.equal(victims.length, 50);
  assert.ok(victims.every((path) => path.startsWith("old-")));
});
