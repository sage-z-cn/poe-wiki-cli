import { parse, type HTMLElement, type Node } from "node-html-parser";

/**
 * 标题层级映射。poedb 的正文从 h5 起算，若原样输出会全部变成五级标题，
 * 这里把 h5/h6 映射到 ### / ####，保证大纲仍有层级感。
 */
const HEADING_PREFIX: Record<string, string> = {
  h1: "#",
  h2: "##",
  h3: "###",
  h4: "####",
  h5: "###",
  h6: "####",
};

const DROP_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "iframe",
  "nav",
  "footer",
  "header",
  "template",
  "svg",
  "canvas",
  "video",
  "audio",
]);

const DROP_CLASSES = new Set([
  "nav",
  "navbar",
  "modal",
  "d-none",
  "advertisement",
  "adsbygoogle",
  "mw-editsection",
  "navbox",
  "toc",
  "mw-references-wrap",
  "reference",
  // poewiki 的物品悬浮框内容：与正文链接重复，且默认被 CSS 隐藏。
  "hoverbox__display",
  "c-item-hoverbox__display",
]);

/** 这些类在 MediaWiki 信息框里承担块级语义，但实现上是 span。 */
const BLOCK_CLASSES = new Set(["item-stats", "group", "item-box", "header", "item-name"]);

const INLINE_TAGS = new Set([
  "a",
  "abbr",
  "b",
  "bdi",
  "bdo",
  "big",
  "br",
  "button",
  "cite",
  "code",
  "del",
  "em",
  "font",
  "i",
  "img",
  "ins",
  "kbd",
  "label",
  "mark",
  "q",
  "rp",
  "rt",
  "ruby",
  "s",
  "samp",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "time",
  "u",
  "var",
  "wbr",
]);

const MOD_CLASSES = new Set(["explicitmod", "implicitmod"]);

export interface MarkdownOptions {
  /** 站点根地址或页面地址，用于把 /wiki/Life 这类相对链接补成绝对 URL。 */
  baseUrl?: string;
}

export interface Section {
  level: number;
  title: string;
}

interface RenderContext {
  baseUrl: string;
  listDepth: number;
  inTable: boolean;
  inLink: boolean;
}

/**
 * node-html-parser 的标签切分不感知属性引号状态，poedb 里出现的
 * `data-tabname="Headhunter <small>Unique</small>"` 会被当成真实标签，
 * 导致整棵 DOM 从该处开始错位、正文被挤出 page-content 容器。
 * 这里把属性值内的 `<` `>` 转义掉，保证解析器只看到合法结构。
 */
export function sanitizeHtml(html: string): string {
  const out: string[] = [];
  let inTag = false;
  let quote = "";

  for (let i = 0; i < html.length; i++) {
    const ch = html[i];

    if (!inTag) {
      if (ch === "<") {
        const next = html[i + 1] ?? "";
        if (/[a-zA-Z/!]/.test(next)) {
          inTag = true;
          out.push(ch);
        } else {
          out.push("&lt;");
        }
      } else {
        out.push(ch);
      }
      continue;
    }

    if (quote) {
      if (ch === quote) {
        quote = "";
        out.push(ch);
      } else if (ch === "<") {
        out.push("&lt;");
      } else if (ch === ">") {
        out.push("&gt;");
      } else {
        out.push(ch);
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      out.push(ch);
    } else if (ch === ">") {
      inTag = false;
      out.push(ch);
    } else {
      out.push(ch);
    }
  }

  return out.join("");
}

export function htmlToMarkdown(html: string, options: MarkdownOptions = {}): string {
  const root = parse(sanitizeHtml(html), { comment: false });
  const context: RenderContext = {
    baseUrl: options.baseUrl ?? "",
    listDepth: 0,
    inTable: false,
    inLink: false,
  };
  return normalizeMarkdown(renderChildren(root, context));
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function extractSections(markdown: string): Section[] {
  const sections: Section[] = [];
  for (const line of markdown.split("\n")) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (match && !isNoiseHeading(match[2])) {
      sections.push({ level: match[1].length, title: match[2] });
    }
  }
  return sections;
}

/**
 * poedb 把怪物词缀也渲染成 h5/h6，目录里会冒出大量 `monster ... [15000]` 之类
 * 的伪标题。目录只保留真正的章节名，正文不受影响。
 */
function isNoiseHeading(title: string): boolean {
  const lower = title.toLowerCase();
  if (/\[[\d,\s-]+\]/.test(title)) {
    return true;
  }
  if (lower.startsWith("monster ") || lower.startsWith("cannot be ") || title.startsWith("无法")) {
    return true;
  }
  if (lower.includes(" no drops ")) {
    return true;
  }
  if (lower === "object type") {
    return true;
  }
  // 「行动速度不能调整至低于基础值的 50%」及其英文原文都是怪物词缀，不是章节。
  return title.includes("不能调整至低于基础值") || /cannot be modified to below/i.test(title);
}

export function normalizeMarkdown(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const result: string[] = [];

  for (const raw of lines) {
    const line = raw.replace(/[ \t]+$/g, "");
    if (line.trim() === "") {
      if (result.length === 0 || result[result.length - 1] === "") {
        continue;
      }
      result.push("");
      continue;
    }
    result.push(line);
  }

  return result.join("\n").trim();
}

function renderChildren(node: Node, context: RenderContext): string {
  let out = "";
  const children = node.childNodes;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];

    if (child.nodeType === 3) {
      out = appendText(out, child.text ?? "");
      continue;
    }

    if (child.nodeType !== 1) {
      continue;
    }

    // poedb 的物品词缀是一串 div.explicitMod 兄弟节点，逐条成行的列表比逐段更有用。
    if (!context.inTable && isModElement(child)) {
      const lines: string[] = [];
      while (i < children.length) {
        const current = children[i];
        if (current.nodeType === 1 && isModElement(current)) {
          const text = collapseSpace(renderChildren(current, context));
          if (text) {
            lines.push(text);
          }
          i++;
          continue;
        }
        if (current.nodeType === 3 && (current.text ?? "").trim() === "") {
          i++;
          continue;
        }
        // 词缀之间常夹着 <div class="separator">，空元素不应打断分组。
        if (current.nodeType === 1 && renderNode(current, context).trim() === "") {
          i++;
          continue;
        }
        break;
      }
      i--;
      if (lines.length > 0) {
        out += "\n\n" + lines.map((line) => `- ${line}`).join("\n") + "\n\n";
      }
      continue;
    }

    out += renderNode(child, context);
  }

  return out;
}

function renderNode(node: Node, context: RenderContext): string {
  if (node.nodeType !== 1) {
    return "";
  }

  const element = node as HTMLElement;
  const tag = (element.rawTagName ?? "").toLowerCase();

  if (DROP_TAGS.has(tag) || isDroppedByClass(element)) {
    return "";
  }

  if (classTokens(element).some((token) => MOD_CLASSES.has(token))) {
    const text = collapseSpace(renderChildren(element, context));
    if (!text) {
      return "";
    }
    return context.inTable ? ` ${text} ` : `\n\n- ${text}\n\n`;
  }

  switch (tag) {
    case "br":
      return "\n";
    case "hr":
      return "\n\n---\n\n";
    case "img":
    case "picture":
    case "source":
    case "track":
      return "";
    case "pre":
      return renderPre(element);
    case "code": {
      const text = element.text.trim();
      if (!text) {
        return "";
      }
      return text.includes("`") ? text : `\`${text}\``;
    }
    case "table":
      return renderTable(element, context);
    case "ul":
    case "ol":
      return renderList(element, context);
    case "li": {
      const text = collapseSpace(renderChildren(element, context));
      return text ? `\n${text}\n` : "";
    }
    case "a":
      return renderLink(element, context);
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const text = collapseSpace(renderChildren(element, context));
      if (!text) {
        return "";
      }
      return `\n\n${HEADING_PREFIX[tag]} ${text}\n\n`;
    }
    case "p": {
      const text = renderChildren(element, context);
      if (!text.trim()) {
        return "";
      }
      return `\n\n${text}\n\n`;
    }
    case "blockquote": {
      const text = renderChildren(element, context).trim();
      if (!text) {
        return "";
      }
      const quoted = text
        .split("\n")
        .map((line) => (line ? `> ${line}` : ">"))
        .join("\n");
      return `\n\n${quoted}\n\n`;
    }
    case "dt": {
      const text = collapseSpace(renderChildren(element, context));
      return text ? `\n\n**${text}**\n` : "";
    }
    case "dd": {
      const text = collapseSpace(renderChildren(element, context));
      return text ? `\n- ${text}\n` : "";
    }
    default:
      break;
  }

  if (isItemName(element)) {
    const text = collapseSpace(renderChildren(element, context));
    return text ? `\n\n${text}\n\n` : "";
  }

  if (classTokens(element).some((token) => BLOCK_CLASSES.has(token))) {
    const inner = renderChildren(element, context);
    return inner.trim() ? `\n${inner}` : "";
  }

  if (INLINE_TAGS.has(tag)) {
    return renderChildren(element, context);
  }

  const inner = renderChildren(element, context);
  return inner.trim() ? `\n${inner}` : "";
}

function renderLink(element: HTMLElement, context: RenderContext): string {
  const label = collapseSpace(renderChildren(element, { ...context, inLink: true }));
  if (!label) {
    return "";
  }
  if (context.inLink) {
    return label;
  }

  const href = element.getAttribute("href");
  if (!href) {
    return label;
  }

  const target = resolveHref(href, context.baseUrl);
  return target ? `[${label}](${target})` : label;
}

function renderPre(element: HTMLElement): string {
  const text = (element.text ?? "").replace(/\u00a0/g, " ").replace(/^\n+|\n+$/g, "");
  if (!text.trim()) {
    return "";
  }
  return `\n\n\`\`\`\n${text}\n\`\`\`\n\n`;
}

function renderList(element: HTMLElement, context: RenderContext): string {
  const ordered = (element.rawTagName ?? "").toLowerCase() === "ol";
  const parsedStart = Number.parseInt(element.getAttribute("start") ?? "1", 10);
  let index = Number.isFinite(parsedStart) ? parsedStart : 1;
  const nestedContext: RenderContext = { ...context, listDepth: context.listDepth + 1 };
  const items: string[] = [];

  for (const child of element.childNodes) {
    if (child.nodeType !== 1) {
      continue;
    }
    const item = child as HTMLElement;
    if ((item.rawTagName ?? "").toLowerCase() !== "li") {
      const rendered = renderNode(child, nestedContext).trim();
      if (rendered) {
        items.push(`  ${rendered}`);
      }
      continue;
    }
    const marker = ordered ? `${index}.` : "-";
    items.push(renderListItem(item, nestedContext, marker));
    index++;
  }

  return items.length > 0 ? `\n${items.join("\n")}\n` : "";
}

function renderListItem(li: HTMLElement, context: RenderContext, marker: string): string {
  const indent = "  ".repeat(Math.max(0, context.listDepth - 1));
  let inline = "";
  const blocks: string[] = [];

  for (const child of li.childNodes) {
    if (child.nodeType === 3) {
      inline = appendText(inline, child.text ?? "");
      continue;
    }
    if (child.nodeType !== 1) {
      continue;
    }
    const element = child as HTMLElement;
    const tag = (element.rawTagName ?? "").toLowerCase();
    if (tag === "ul" || tag === "ol") {
      blocks.push(renderList(element, context));
      continue;
    }
    if (tag === "table") {
      blocks.push(renderTable(element, context));
      continue;
    }
    inline += renderNode(child, context);
  }

  const text = collapseSpace(inline);
  const lines = text ? text.split("\n").map((line) => line.trim()).filter(Boolean) : [];
  let result = `${indent}${marker} ${lines[0] ?? ""}`.replace(/\s+$/g, "");
  for (let i = 1; i < lines.length; i++) {
    result += `\n${indent}  ${lines[i]}`;
  }
  for (const block of blocks) {
    const trimmed = block.replace(/^\n+|\n+$/g, "");
    if (trimmed) {
      result += `\n${trimmed}`;
    }
  }
  return result;
}

function renderTable(element: HTMLElement, context: RenderContext): string {
  const rows = collectRows(element);
  if (rows.length === 0) {
    return "";
  }

  const matrix = rows.map((row) => cellsOf(row));
  const complex = matrix.some((cells) =>
    cells.some((cell) => {
      const colspan = cell.getAttribute("colspan");
      const rowspan = cell.getAttribute("rowspan");
      return (colspan !== undefined && colspan !== "1") || (rowspan !== undefined && rowspan !== "1");
    }),
  );

  const cellContext: RenderContext = { ...context, inTable: true, listDepth: 0 };
  const grid = matrix.map((cells) => cells.map((cell) => tableCellText(cell, cellContext)));

  if (complex) {
    return renderTableAsList(grid);
  }

  if (grid.length === 0) {
    return "";
  }

  const header = grid[0];
  const body = grid.slice(1);
  const width = Math.max(header.length, ...body.map((row) => row.length), 1);
  const pad = (row: string[]): string[] => {
    const copy = row.slice(0, width);
    while (copy.length < width) {
      copy.push("");
    }
    return copy;
  };

  const lines: string[] = [];
  lines.push(`| ${pad(header).join(" | ")} |`);
  lines.push(`| ${Array.from({ length: width }, () => "---").join(" | ")} |`);
  for (const row of body) {
    lines.push(`| ${pad(row).join(" | ")} |`);
  }
  return `\n\n${lines.join("\n")}\n\n`;
}

function renderTableAsList(grid: string[][]): string {
  if (grid.length === 0) {
    return "";
  }
  const header = grid[0];
  const rows = grid.length > 1 ? grid.slice(1) : grid;
  const lines = rows.map((row) => {
    const pairs = row.map((value, index) => {
      const name = header[index] || `Column ${index + 1}`;
      return `${name}: ${value}`;
    });
    return `- ${pairs.join(" · ")}`;
  });
  return `\n\n${lines.join("\n")}\n\n`;
}

function collectRows(table: HTMLElement): HTMLElement[] {
  const rows: HTMLElement[] = [];

  const walk = (node: Node): void => {
    for (const child of node.childNodes) {
      if (child.nodeType !== 1) {
        continue;
      }
      const element = child as HTMLElement;
      const tag = (element.rawTagName ?? "").toLowerCase();
      if (tag === "table") {
        continue;
      }
      if (tag === "tr") {
        rows.push(element);
        continue;
      }
      walk(element);
    }
  };

  walk(table);
  return rows;
}

function cellsOf(row: HTMLElement): HTMLElement[] {
  const cells: HTMLElement[] = [];
  for (const child of row.childNodes) {
    if (child.nodeType !== 1) {
      continue;
    }
    const element = child as HTMLElement;
    const tag = (element.rawTagName ?? "").toLowerCase();
    if (tag === "td" || tag === "th") {
      cells.push(element);
    }
  }
  return cells;
}

function tableCellText(cell: HTMLElement, context: RenderContext): string {
  const text = collapseSpace(renderChildren(cell, context));
  const value = text || headerCellLabel(cell);
  return value.replace(/\|/g, "\\|");
}

/**
 * 表头常写成纯图标（如宝石等级表的「需求等级」「需求智力」），
 * 可见文本被 <img> 吃掉后，语义只剩在 title / alt 上。
 * 仅对 th 生效，避免正文单元格里的装饰图标混进数据。
 */
function headerCellLabel(cell: HTMLElement): string {
  if ((cell.rawTagName ?? "").toLowerCase() !== "th") {
    return "";
  }
  const ownTitle = cell.getAttribute("title")?.trim();
  if (ownTitle) {
    return ownTitle;
  }
  const titled = cell.querySelector("[title]");
  const title = titled?.getAttribute("title")?.trim();
  if (title) {
    return title;
  }
  const image = cell.querySelector("img[alt]");
  return image?.getAttribute("alt")?.trim() ?? "";
}

function resolveHref(href: string, baseUrl: string): string | null {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }
  if (/^(javascript|mailto|tel):/i.test(trimmed)) {
    return null;
  }
  if (!baseUrl) {
    return /^https?:\/\//i.test(trimmed) ? trimmed : null;
  }
  try {
    return new URL(trimmed, baseUrl).href;
  } catch {
    return null;
  }
}

function isModElement(node: Node): boolean {
  if (node.nodeType !== 1) {
    return false;
  }
  return classTokens(node as HTMLElement).some((token) => MOD_CLASSES.has(token));
}

function isItemName(element: HTMLElement): boolean {
  return classTokens(element).includes("itemname");
}

function isDroppedByClass(element: HTMLElement): boolean {
  const tokens = classTokens(element);
  if (tokens.some((token) => DROP_CLASSES.has(token))) {
    return true;
  }
  if (tokens.some((token) => token.includes("sidebar"))) {
    return true;
  }
  const id = element.getAttribute("id");
  if (id === "head_toolbar" || id === "bottom_banner") {
    return true;
  }
  const style = (element.getAttribute("style") ?? "").replace(/\s+/g, "").toLowerCase();
  return style.includes("display:none");
}

function classTokens(element: HTMLElement): string[] {
  const raw = decodeHtmlEntities(element.getAttribute("class") ?? "");
  return raw
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.toLowerCase());
}

function appendText(out: string, raw: string): string {
  let text = raw.replace(/\u00a0/g, " ").replace(/[\t\r\n\f ]+/g, " ");
  if (!text) {
    return out;
  }
  if (out === "" || out.endsWith("\n") || out.endsWith(" ")) {
    text = text.replace(/^ +/, "");
  }
  return out + text;
}

function collapseSpace(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[\t\r\n\f ]+/g, " ")
    .trim();
}
