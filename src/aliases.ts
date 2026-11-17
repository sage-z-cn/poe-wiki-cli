import { normalizeName } from "./dict.js";

/**
 * 只收录「不与现有页面同名」的旧译名与社区简称：词典里已有的精确条目
 * （如 女武神 = Valyrium、虚空 = Null and Void）不能出现在这里，
 * 否则别名会抢走本该精确命中的页面。
 *
 * 赛季机制的中文官方名玩家几乎不用，社区一律用俗称（祭坛、挖坟、下矿…），
 * 而这些俗称在 poedb 词典里全都没有条目，必须先翻译成官方名才查得到。
 */
const ALIASES: Record<string, string> = {
  病人: "病患",
  护理师: "照料者",
  护士: "照料者",
  医生: "疯医",
  肮脏: "死灵遗物",
  法血: "法师之血",
  正火: "正义之火",
  猎手: "猎首",
  群星: "群星之灰",
  大法师: "大法师（辅）",
  闪打: "闪电打击",
  刀阵: "飞刃风暴",

  // 赛季机制俗称 → 官方名
  祭坛: "驱灵仪式",
  采棉花: "庄园",
  黄金港: "夺宝奇兵",
  挖坟: "先祖秘藏",
  野兽: "猎魔",
  下矿: "地心探索",
  厕所: "禁域",
  圣所: "禁域",

  // 庄园命能俗称 → 官方通货名
  黄棉花: "活性黄晶命能",
  蓝棉花: "原始蓝晶命能",
  紫棉花: "狂野紫晶命能",
};

const INDEX = new Map<string, string>();
for (const [alias, canonical] of Object.entries(ALIASES)) {
  INDEX.set(normalizeName(alias), canonical);
}

export function resolveAlias(query: string): string | null {
  const key = normalizeName(query);
  return key ? INDEX.get(key) ?? null : null;
}

/**
 * 页面存在、标题也规范，但站内没有任何导航链接指向它们（首页链接索引与自动补全
 * 词典都覆盖不到）。这类页面只能靠显式登记，否则中文名永远查不到。
 * 键是官方中文标题，值是 poedb 的 slug。
 */
const ORPHANS: Record<string, string> = {
  禁域: "Sanctum",
};

const ORPHAN_INDEX = new Map<string, string>();
for (const [title, slug] of Object.entries(ORPHANS)) {
  ORPHAN_INDEX.set(normalizeName(title), slug);
}

export function resolveOrphanSlug(query: string): string | null {
  const key = normalizeName(query);
  return key ? ORPHAN_INDEX.get(key) ?? null : null;
}
