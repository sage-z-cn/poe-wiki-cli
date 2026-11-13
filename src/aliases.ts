import { normalizeName } from "./dict.js";

/**
 * 只收录「不与现有页面同名」的旧译名与社区简称：词典里已有的精确条目
 * （如 女武神 = Valyrium、虚空 = Null and Void）不能出现在这里，
 * 否则别名会抢走本该精确命中的页面。
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
};

const INDEX = new Map<string, string>();
for (const [alias, canonical] of Object.entries(ALIASES)) {
  INDEX.set(normalizeName(alias), canonical);
}

export function resolveAlias(query: string): string | null {
  const key = normalizeName(query);
  return key ? INDEX.get(key) ?? null : null;
}
