const BRACKETS = /[【】[\]（）()]/g;

/**
 * 词典与站内链接的 label 常带全角/半角括号与多余空格，slug 用下划线连接，
 * 统一归一化后才能和用户输入对上。
 */
export function normalizeName(input: string): string {
  let value = input;
  try {
    // 词典里的 slug 带百分号编码（Sirus%2C_...），先解码才能和用户输入对上。
    value = decodeURIComponent(value);
  } catch {
    // 不完整的编码按原文处理。
  }
  return value
    .normalize("NFKC")
    .replace(BRACKETS, " ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function collapseSpaces(text: string): string {
  return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
