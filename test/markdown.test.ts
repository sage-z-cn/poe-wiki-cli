import assert from "node:assert/strict";
import { test } from "node:test";
import { extractSections, htmlToMarkdown, sanitizeHtml } from "../src/markdown.js";

test("inline 元素直接拼接，不额外拆行", () => {
  const html = `<p>Knockback <strong>enemies</strong> <em>back</em> and deal <span class='mod-value'>+(40<span class="ndash">—</span>55)</span> to Dexterity.</p>`;
  assert.equal(htmlToMarkdown(html), "Knockback enemies back and deal +(40—55) to Dexterity.");
});

test("标题层级映射：h5→###、h6→####", () => {
  const html = "<h1>A</h1><h2>B</h2><h3>C</h3><h4>D</h4><h5>E</h5><h6>F</h6>";
  const markdown = htmlToMarkdown(html);
  const lines = markdown.split("\n").filter(Boolean);
  assert.deepEqual(lines, ["# A", "## B", "### C", "#### D", "### E", "#### F"]);
});

test("段落与块元素产生换行，连续空行被压缩", () => {
  const html = "<div>A</div>\n\n\n<div>B</div><p>C</p>";
  assert.equal(htmlToMarkdown(html), "A\nB\n\nC");
});

test("GFM 表格：首行表头、转义竖线", () => {
  const html = `<table><thead><tr><th>Name</th><th>Effect</th></tr></thead>
    <tbody><tr><td>Headhunter</td><td>+40 to Strength | +40 to Dexterity</td></tr></tbody></table>`;
  const markdown = htmlToMarkdown(html);
  assert.match(markdown, /\| Name \| Effect \|/);
  assert.match(markdown, /\| --- \| --- \|/);
  assert.match(markdown, /\+40 to Strength \\\| \+40 to Dexterity/);
});

test("含 colspan 的表格降级为逐行列表", () => {
  const html = `<table>
    <tr><th>Version</th><th>Changes</th></tr>
    <tr><td colspan="2">3.30 overhaul</td></tr>
    <tr><td>3.29</td><td>Threads</td></tr>
  </table>`;
  const markdown = htmlToMarkdown(html);
  assert.match(markdown, /^- Version: 3\.30 overhaul$/m);
  assert.match(markdown, /^- Version: 3\.29 · Changes: Threads$/m);
  assert.doesNotMatch(markdown, /\| --- \|/);
});

test("图标表头回退到 title/alt，正文单元格不受影响", () => {
  const html = `<table>
    <tr>
      <th>Level</th>
      <th><span title="Required level"><img alt="Required level" src="level.png" /></span></th>
      <th><span title="Required intelligence"><img alt="" src="int.png" /></span></th>
    </tr>
    <tr><td>20</td><td>70</td><td><img alt="decorative icon" src="x.png" /></td></tr>
  </table>`;
  const markdown = htmlToMarkdown(html);
  assert.match(markdown, /\| Level \| Required level \| Required intelligence \|/);
  assert.match(markdown, /\| 20 \| 70 \|  \|/);
  assert.doesNotMatch(markdown, /decorative icon/);
});

test("列表：有序、无序与嵌套缩进", () => {
  const html = `<ul><li>Alpha</li><li>Beta<ul><li>Beta-1</li><li>Beta-2</li></ul></li></ul>
    <ol start="3"><li>Third</li><li>Fourth</li></ol>`;
  const markdown = htmlToMarkdown(html);
  assert.match(markdown, /^- Alpha$/m);
  assert.match(markdown, /^  - Beta-1$/m);
  assert.match(markdown, /^3\. Third$/m);
  assert.match(markdown, /^4\. Fourth$/m);
});

test("li 内的 p 不产生额外空行", () => {
  const html = "<ul><li><p>Only line</p></li></ul>";
  assert.equal(htmlToMarkdown(html), "- Only line");
});

test("链接补全为绝对 URL，空文本与图片被丢弃", () => {
  const html = `<div><a href="/wiki/Life">Life</a> <a href="https://example.com/x">Ext</a>
    <a href="/wiki/Empty"></a><img src="x.png" alt="pic" /></div>`;
  const markdown = htmlToMarkdown(html, { baseUrl: "https://www.poewiki.net/wiki/Headhunter" });
  assert.equal(markdown, "[Life](https://www.poewiki.net/wiki/Life) [Ext](https://example.com/x)");
});

test("嵌套链接只保留最外层", () => {
  const html = `<div><a href="/wiki/Outer">Outer <a href="/wiki/Inner">Inner</a></a></div>`;
  const markdown = htmlToMarkdown(html, { baseUrl: "https://www.poewiki.net/wiki/Headhunter" });
  assert.equal(markdown, "[Outer Inner](https://www.poewiki.net/wiki/Outer)");
});

test("删除导航、脚本、广告与侧栏", () => {
  const html = `<div>
    <nav>menu</nav><script>var a = 1;</script><style>.x{}</style>
    <div class="advertisement">buy</div><div class="sidebar-box">side</div>
    <div id="head_toolbar">league bar</div>
    <p>keep me</p>
  </div>`;
  assert.equal(htmlToMarkdown(html), "keep me");
});

test("连续 explicitMod 兄弟节点输出为单行词缀列表", () => {
  const html = `<div class="Stats">
    <div class="implicitMod"><span class='mod-value'>+(25<span class="ndash">—</span>40)</span> to maximum Life</div>
    <div class="separator"></div>
    <div class="explicitMod">+(40<span class="ndash">—</span>55)</div>
    <div class="explicitMod">When you Kill a Rare monster, you gain its Modifiers for 60 seconds</div>
  </div>`;
  const markdown = htmlToMarkdown(html);
  assert.equal(
    markdown,
    ["- +(25—40) to maximum Life", "- +(40—55)", "- When you Kill a Rare monster, you gain its Modifiers for 60 seconds"].join("\n"),
  );
});

test("poedb 物品名块单独成段", () => {
  const html = `<div class="itemName"><span class="lc">Headhunter</span></div>
    <div class="itemName typeLine"><span class="lc">Leather Belt</span></div>`;
  assert.equal(htmlToMarkdown(html), "Headhunter\n\nLeather Belt");
});

test("inline 样式为 display:none 的节点被丢弃", () => {
  const html = `<div><h3 style='display: none'>Headhunter</h3><p>body</p></div>`;
  assert.equal(htmlToMarkdown(html), "body");
});

test("sanitizeHtml 转义属性值里的尖括号，避免整棵 DOM 错位", () => {
  const html = `<div><span data-tabname="Headhunter <small>Unique</small>"></span><div>after</div></div>`;
  const sanitized = sanitizeHtml(html);
  assert.ok(sanitized.includes("&lt;small&gt;"));
  assert.equal(htmlToMarkdown(html), "after");
});

test("extractSections 提取大纲", () => {
  const sections = extractSections("# A\ntext\n## B\n### C\n");
  assert.deepEqual(sections, [
    { level: 1, title: "A" },
    { level: 2, title: "B" },
    { level: 3, title: "C" },
  ]);
});

test("列表项里链接后的空格不会丢失", () => {
  const html = `<ul><li><a href="/wiki/Lani">Lani</a> (jewellery and flask vendor)</li></ul>`;
  assert.equal(htmlToMarkdown(html, { baseUrl: "https://www.poewiki.net/wiki/Endgame" }), "- [Lani](https://www.poewiki.net/wiki/Lani) (jewellery and flask vendor)");
});

test("表格单元格内的多个链接与文本之间保留空格", () => {
  const html = `<table><tr><th>Version</th><th>Changes</th></tr>
    <tr><td>3.17.0</td><td><ul><li>Removed <a href="/wiki/A">A</a> and <a href="/wiki/B">B</a>.</li></ul></td></tr></table>`;
  const markdown = htmlToMarkdown(html, { baseUrl: "https://www.poewiki.net/wiki/Endgame" });
  assert.match(markdown, /Removed \[A\]\(https:\/\/www\.poewiki\.net\/wiki\/A\) and \[B\]\(https:\/\/www\.poewiki\.net\/wiki\/B\)\./);
});

test("extractSections 过滤 poedb 怪物词缀伪标题，只保留真实章节", () => {
  const markdown = [
    "## monster no drops or experience [1]",
    "## monster dropped item rarity +% [15000]",
    "## monster slain experience +% [100]",
    "## cannot be stunned for ms after stun finished [4000]",
    "## cannot be stunned while stunned [1]",
    "## monster gauntlet ruin enabled [1]",
    "## 无法被击退",
    "## Action Speed cannot be modified to below 50% of base value",
    "## Object Type",
    "## 行动速度不能调整至低于基础值的 50%",
    "## 贤主 传奇 /13",
    "## 掉落",
    "## Sirus Topic /3",
  ].join("\n");

  assert.deepEqual(
    extractSections(markdown).map((section) => section.title),
    ["贤主 传奇 /13", "掉落", "Sirus Topic /3"],
  );
});
