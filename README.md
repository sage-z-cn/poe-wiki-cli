# poe-wiki-cli

给 AI agent 用的 Path of Exile 资料查询命令行：搜索、抓取 **poedb.tw / www.poewiki.net**（PoE1）与 **poe2db.tw / www.poe2wiki.net**（PoE2）的页面，并转成干净、稳定的 markdown 或 JSON。

- 服务端渲染直取，不启动浏览器
- PoE1 与 PoE2 双站支持，用 `--game poe2` 切换，默认 PoE1
- 输出结构稳定，`--json` 直接可 `JSON.parse`
- 失败原因用退出码区分：用法错误 / 未找到 / 被反爬拦截 / 网络错误
- 本地文件缓存，重复查询不重复下载
- 附带 agent skill（`skill/SKILL.md`），装好后 opencode、Claude Code 能自动发现并调用它

## 安装

### 让 agent 自动安装（推荐）

把下面这段原样粘到你的 LLM agent 会话里（opencode、Claude Code、Codex 都适用）：

```text
Install and configure poe-wiki-cli by following the instructions here:
https://raw.githubusercontent.com/sage-z-cn/poe-wiki-cli/refs/heads/main/docs/agent-install.md
```

agent 会照着那份文档装好 CLI、把 skill 放进对应宿主的 skills 目录，再跑一遍 `doctor` 自检，最后告诉你装的是哪个版本、skill 落在哪里。

### 手动安装 CLI

要求 Node.js >= 20（依赖内置 `fetch`）。

```bash
npm install -g poe-wiki-cli
poe-wiki-cli doctor
```

不想全局安装就用 `npx poe-wiki-cli <命令>`。如果 `npm install -g` 报 404，说明包还没发布，改走下面的「从源码安装」。

### 手动安装 skill

skill 是给 agent 看的说明书：它决定 agent 什么时候该调用这个 CLI、读哪一段输出、遇到退出码 3 该换源还是重试。文件就是本仓库的 `skill/SKILL.md`，**原样复制**，不要改写。

| 宿主 | 路径 |
| --- | --- |
| opencode | `~/.config/opencode/skills/poe-wiki-cli/SKILL.md` |
| Claude Code | `~/.claude/skills/poe-wiki-cli/SKILL.md` |
| 只对当前项目生效 | `<项目根>/.opencode/skills/poe-wiki-cli/SKILL.md` |

macOS / Linux：

```bash
mkdir -p ~/.config/opencode/skills/poe-wiki-cli
cp skill/SKILL.md ~/.config/opencode/skills/poe-wiki-cli/SKILL.md
```

Windows（PowerShell）：

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.config\opencode\skills\poe-wiki-cli" | Out-Null
Copy-Item skill\SKILL.md "$env:USERPROFILE\.config\opencode\skills\poe-wiki-cli\SKILL.md"
```

装完需要重启 agent 会话，skill 才会被发现。

### 从源码安装

```bash
git clone https://github.com/sage-z-cn/poe-wiki-cli.git
cd poe-wiki-cli
npm install
npm run build
npm link          # 或 npm install -g .
```

## 快速开始

```bash
poe-wiki-cli search fireball
poe-wiki-cli page Headhunter --source poedb
poe-wiki-cli page "https://www.poewiki.net/wiki/Endgame" --json
poe-wiki-cli league --patch
poe-wiki-cli doctor

# PoE2
poe-wiki-cli search fireball --game poe2
poe-wiki-cli page "https://poe2db.tw/us/Waystone"        # 按域名自动识别，无需 --game
poe-wiki-cli league --game poe2
```

## 命令

### `search <query...>`

默认同时查两个站点：先做 poedb 的跳转式搜索，命中则作为第一条结果（`source: "poedb"`, `kind: "page"`），再查 poewiki 的搜索接口（`generator=search` + `prop=extracts`，一次请求拿到条目开头的纯文本简介）。

```bash
$ poe-wiki-cli search fireball --limit 1
query: fireball
locale: us

[poedb] Fireball
  https://poedb.tw/us/Fireball
[poewiki] Fireball
  https://www.poewiki.net/wiki/Fireball
  Fireball is a spell that fires a projectile, dealing fire damage with an increased chance to Ignite.
```

poedb 未命中不算错误（poewiki 通常仍有结果）；两边都为空才返回「未找到」。poewiki 的摘要是条目开头的纯文本（`generator=search` + `prop=extracts`），不是 MediaWiki 默认那种从句子中间截断的高亮片段。

| 选项 | 说明 |
| --- | --- |
| `-g, --game <poe1\|poe2>` | 资料库版本：poe1 → poedb/poewiki，poe2 → poe2db/poe2wiki，默认 `poe1` |
| `-s, --source <both\|poedb\|wiki>` | 数据源，默认 `both` |
| `-l, --lang <us\|tw\|cn\|kr\|ru\|jp\|fr\|de\|th\|pt\|sp>` | 资料库语言，默认按查询词推断 |
| `-n, --limit <n>` | wiki 结果上限，默认 8 |
| `-j, --json` | 输出 JSON |
| `--no-cache` | 跳过本地缓存 |
| `--timeout <ms>` | 请求超时，默认 20000 |

### `page <target>`

抓取单个页面并输出 markdown。`target` 支持三种写法：

- 完整 URL：`https://poedb.tw/cn/Headhunter`、`https://www.poewiki.net/wiki/Endgame`、`https://poe2db.tw/us/Waystone`（站点与游戏版本都由 host 决定，会覆盖 `--game`）
- 站点前缀：`poedb:Headhunter`、`wiki:Iron Reflexes`、`poe2db:Waystone`、`poe2wiki:Endgame`
- 裸标题：默认先尝试 db 站，未命中再取 wiki

```bash
$ poe-wiki-cli page Headhunter --source poedb
# Headhunter
> source: poedb · https://poedb.tw/us/Headhunter
> fetched: 2026-11-13T03:51:23.686Z

Headhunter

Leather Belt

Belts
Quality: +20%
Requires Level 40

- +(25—40) to maximum Life
- +(40—55) to Strength
- +(40—55) to Dexterity
- +(50—60) to maximum Life
- (20—30)% increased Damage with Hits against Rare monsters
- When you Kill a Rare monster, you gain its Modifiers for 60 seconds
```

| 选项 | 说明 |
| --- | --- |
| `-g, --game <poe1\|poe2>` | 资料库版本，默认 `poe1`；传 URL 时以 URL 为准 |
| `-s, --source <auto\|both\|poedb\|wiki>` | 数据源，默认 `auto`（先 db 站后 wiki 兜底） |
| `-l, --lang <lang>` | 资料库语言，默认按标题推断 |
| `--max-chars <n>` | 正文上限，默认 40000；`--html` 时默认 0（不截断） |
| `--raw` | 只输出正文，省略标题与元信息 |
| `--sections` | 额外输出章节大纲（JSON 下为 `sections` 数组） |
| `--html` | 直接输出原始 HTML，不做 markdown 转换（会去掉脚本/样式/导航等噪声） |
| `-j, --json` | 输出 JSON |
| `--no-cache` | 跳过本地缓存 |
| `--timeout <ms>` | 请求超时，默认 20000 |

`--html` 与 `--raw` 互斥，同时使用会以退出码 1 结束。`--html` 的 JSON 字段是 `html` 而不是 `markdown`：

```json
{ "ok": true, "game": "poe1", "source": "poedb", "title": "Home", "url": "https://poedb.tw/us/", "html": "<!DOCTYPE html>…", "truncated": false }
```

`source` 的取值是**实际站点**：`poedb` / `poewiki` / `poe2db` / `poe2wiki`，配合 `game` 字段就能确定数据来自哪一版游戏。poewiki 的 `--html` 输出 `action=parse` 返回的 `parse.text` 片段。

### `league`

读取资料库首页的赛季/版本卡片，给出当前/下一个赛季与版本汇总。PoE1 读 poedb 首页，PoE2 读 poe2db 首页（`--game poe2`）。

```bash
$ poe-wiki-cli league
International · poedb.tw/us
  next      3.30  Covens of Umbra
            realm down     2026-11-13 17:00 UTC · 2026-11-14 01:00 (UTC+08:00)  in 13h 6m
            starts         2026-11-13 19:00 UTC · 2026-11-14 03:00 (UTC+08:00)  in 15h 6m
  patch     3.30 Covens

Tencent · poedb.tw/cn
  current   3.29  Curse of the Allflame
            running since  2026-07-31 02:00 UTC · 2026-07-31 10:00 (UTC+08:00)  (105d 1h)
  next      3.30  黑影巫会
            starts         2026-11-19 02:00 UTC · 2026-11-19 10:00 (UTC+08:00)  in 5d 22h
  patch     3.30 Covens
```

| 选项 | 说明 |
| --- | --- |
| `-g, --game <poe1\|poe2>` | 资料库版本，默认 `poe1` |
| `--realm <both\|us\|cn>` | 服务器，默认 `both` |
| `--patch` | 展开最新版本的汇总链接 |
| `-j, --json` | 输出 JSON |
| `--no-cache` | 跳过本地缓存 |
| `--timeout <ms>` | 请求超时，默认 20000 |

PoE2 的卡片语义不同：没有「赛季」，而是版本（`0.5.5`、`1.0`），并且当前版本会带一个结束时间。`--game poe2` 时：

```bash
$ poe-wiki-cli league --game poe2
International · poe2db.tw/us
  current   0.5.5  Forbidden Rites
            running since  2026-09-04 20:00 UTC · 2026-09-05 04:00 (UTC+08:00)  (69d 11h)
            ends           2026-12-11 20:00 UTC · 2026-12-12 04:00 (UTC+08:00)  in 28d 12h
  next      1.0  Release
            starts         2026-12-11 20:00 UTC · 2026-12-12 04:00 (UTC+08:00)  in 28d 12h
  patch     1.0 Conquerors of Wraeclast

Tencent · poe2db.tw/cn
  current   0.5.5  禁断仪式
            running since  2026-09-10 02:00 UTC · 2026-09-10 10:00 (UTC+08:00)  (64d 5h)
            ends           2026-12-18 02:00 UTC · 2026-12-18 10:00 (UTC+08:00)  in 34d 18h
  next      1.0  Release
            starts         2026-12-18 02:00 UTC · 2026-12-18 10:00 (UTC+08:00)  in 34d 18h
```

两个服的 1.0 上线时间不同（国际服 12-11、腾讯服 12-18），这也是为什么排期必须现查。

`--patch` 会把该服版本号最大的那张汇总卡展开：

```bash
$ poe-wiki-cli league --realm us --patch
International · poedb.tw/us
  next      3.30  Covens of Umbra
            …

  3.30 Covens  ·  https://poedb.tw/us/
    News        Atlas Skill Tree · Passive Skill Tree · Version 3.30.0 · FAQ
    Mechanism   Covens League · Version 3.30.0 · Unique · Item · Wickerman · Threads of Creation
```

时间一律按系统时区渲染：先给 UTC，再给本地时间与偏移。相对时间在渲染时计算，因此 JSON 里给的是绝对时间戳，文本输出里的「in 13h 6m」不会过期。

JSON 结构：

```jsonc
{
  "ok": true,
  "fetchedAt": "2026-11-13T04:00:00.000Z",
  "realms": [
    {
      "realm": "us",
      "server": "international",
      "locale": "us",
      "url": "https://poedb.tw/us/",
      "next": {
        "name": "Covens of Umbra",
        "version": "3.30",
        "realmDownAt": "2026-11-13T17:00:00.000Z",
        "startsAt": "2026-11-13T19:00:00.000Z",
        "startsInSeconds": 16800
      },
      "patch": { "version": "3.30", "codename": "Covens" }
    }
  ]
}
```

`current` / `next` / `patch` 都可能缺省（字段不存在，而不是 `null`）。

### `doctor`

默认同时探测 PoE1 与 PoE2 的四个端点，输出 URL、状态、耗时、是否被拦截、内容是否含预期标记。任一端点不健康时退出码为 4。

| 选项 | 说明 |
| --- | --- |
| `-g, --game <both\|poe1\|poe2>` | 探测范围，默认 `both` |

```bash
$ poe-wiki-cli doctor
poedb    ok   HTTP 200    563ms  page-content ✓  https://poedb.tw/us/
poewiki  ok   HTTP 200   1520ms  generator ✓  https://www.poewiki.net/w/api.php?action=query&meta=siteinfo&format=json
poe2db   ok   HTTP 200    498ms  page-content ✓  https://poe2db.tw/us/
poe2wiki ok   HTTP 200    731ms  generator ✓  https://www.poe2wiki.net/w/api.php?action=query&meta=siteinfo&format=json
```

## PoE2 支持

`--game poe2` 会把两个数据源整体切到 PoE2：

| | PoE1（默认） | PoE2 |
| --- | --- | --- |
| 数据站 | `poedb.tw` | `poe2db.tw` |
| Wiki | `www.poewiki.net` | `www.poe2wiki.net` |

两代用的是同一套平台（db 站同一套模板，wiki 都是 MediaWiki），所以解析、语言列表、缓存策略完全一致，差异只在内容。

**术语不能照搬 PoE1**：

- 宝石统一叫 **Gem**，升级/制作靠 **Uncut Skill Gem / Uncut Support Gem / Uncut Spirit Gem**
- 异界地图是 **Waystone**（在 Map Device 激活），不是 map item
- 新增资源 **Spirit**（保留给持续增益、永久召唤物、触发类 meta gem）
- 天赋树页面标题是 **Passive Skill Tree**

**索引页体量更大**：poe2db 的 `/us/Support_Gems` 约 3.6 MB、`/us/Skill_Gems` 约 2.1 MB。查具体条目，别整页拉。

**赛季卡片语义不同**：PoE2 没有「赛季」，卡片是版本（`0.5.5`、`1.0`），当前版本额外带 `ends`，`next` 指向下一个大版本。详见上面 `league` 一节。

## 中文查询

poedb / poe2db 的搜索语言必须和站点 locale 一致，否则一定落回首页：`/cn/search?q=猎首` 命中 `/cn/Headhunter`，而 `/us/search?q=猎首` 只会回到 `/us/`。

因此本工具按查询词自动推断 locale：

- 含汉字（`\p{Script=Han}`）→ `cn`
- 其它 → `us`
- 显式传 `--lang` 时一律以用户值为准

```bash
poe-wiki-cli search 猎首              # 走 /cn/search，命中 /cn/Headhunter
poe-wiki-cli page 火球 --source poedb # 输出中文正文
poe-wiki-cli page 獵首 --lang tw      # 繁体中文站
```

JSON 与文本输出都会带上实际使用的 `locale`。注意 poedb 中文页的 URL slug 仍是英文：`https://poedb.tw/cn/Headhunter`。

## 输出与退出码

| 退出码 | 含义 |
| --- | --- |
| 0 | 成功 |
| 1 | 用法错误（参数非法、`--html` 与 `--raw` 冲突等） |
| 2 | 未找到（两站都没有结果，或 poedb 没有对应页面） |
| 3 | 被反爬验证页拦截 |
| 4 | 网络或 HTTP 错误（含 doctor 探测失败） |

文本模式下错误写到 stderr：

```
错误: poedb 没有「skill gem」对应的页面（locale: us）。
提示: poedb 的搜索区分大小写，可换用更短的英文关键词；中文标题请配 --lang cn。
```

`--json` 出错时输出：

```json
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "…", "hint": "…" } }
```

## 缓存

- Windows：`%LOCALAPPDATA%\poe-wiki-cli\cache`
- 其它平台：`$XDG_CACHE_HOME/poe-wiki-cli`，未设置时 `~/.cache/poe-wiki-cli`

每个 URL 一个 `<sha256(url)>.json`，内容 `{url, fetchedAt, body}`。TTL：页面 3600 秒，搜索与 `league` 300 秒。缓存读写失败会静默降级，不影响查询；`--no-cache` 既不读也不写。

## 为什么不能用 Mozilla 开头的 UA

poewiki.net 与 poe2wiki.net 都前置了 [Anubis](https://anubis.techaro.lol/) 反爬，策略是**只挑战 `Mozilla/` 前缀的 User-Agent**。用浏览器 UA 请求时，服务端返回的是 HTTP **200** 的 7.5KB 验证页，正文是 `Making sure you're not a bot!`，而不是真页面——只看状态码会以为请求成功。

非 Mozilla 前缀的 UA（`curl/8.4.0`、`python-httpx/0.27.0`、自定义 `Xxx/1.0`）反而直接拿到完整页面。poedb.tw 对 UA 不敏感。所以本工具统一使用：

```
poe-wiki-cli/<version> (+https://github.com/sage-z-cn/poe-wiki-cli)
```

并且 HTTP 层会显式检测验证页（响应含 `Making sure you're not a bot`，或 wiki 响应既没有 `mw-parser-output` 也没有 `"parse"` 字段），命中就抛 `BlockedError`、退出码 3，而不是把验证页当正文返回。

## 解析失败时怎么办

`league` 依赖 poedb 首页的卡片结构。站点改版时它不会静默给出空结果：文本模式会在对应服务器下打一行提示，JSON 里对应 realm 会带 `warnings`：

```
Tencent · poedb.tw/cn
  ! 未解析到赛季卡片，可能是首页结构变了。兜底：poe-wiki-cli page https://poedb.tw/cn/ --html
```

兜底命令是 `page` 的 `--html`：

```bash
poe-wiki-cli page https://poedb.tw/us/ --html --max-chars 20000
```

然后按下面的特征人工确认结构：

1. 赛季卡片是 `div.card`，标题在 `h5.card-header`，其中带一个 `<small>` 版本号（如 `3.30`）；
2. 计时时间是 `data-displaytime` 属性的 Unix 秒（UTC），紧跟着的那个 `div` 才是标签文本（`Realm down` / `Starts in` / `已运行` / `开始倒数`）；
3. 版本汇总卡片同在一个 `div.card` 里，正文是若干 `.itemList > ul`，每组的第一个 `li > span.disabled` 是分组名，其余 `li > a` 是链接；
4. 商城特卖卡片带 `class="special"`、且标题里没有版本号 `<small>`，会被忽略。

如果只有某一服失败（网络问题），命令仍会返回另一服的数据并以 0 退出；只有全部服务器都解析不到卡片时才返回 2，全部抓取失败时返回 4。

## 开发

```bash
npm install
npm run build       # tsc，产物在 dist/
npm test            # node --test，跑编译后的测试
npm run typecheck
npm run smoke       # node dist/src/cli.js doctor
node dist/src/cli.js --help
```

`npm run dev` 预留了 `tsx src/cli.ts`，需要自行安装 `tsx`。

## License

MIT © Sage
