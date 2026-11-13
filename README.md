# poe-wiki-cli

English | [简体中文](README.zh.md)

A command-line Path of Exile lookup tool for AI agents: search and fetch pages from **poedb.tw / www.poewiki.net** (PoE1) and **poe2db.tw / www.poe2wiki.net** (PoE2), converted into clean, stable markdown or JSON.

- Fetches server-rendered HTML directly, no browser involved
- Supports both PoE1 and PoE2, switch with `--game poe2` (PoE1 is the default)
- Stable output shape; `--json` output can be passed straight to `JSON.parse`
- Exit codes distinguish failure modes: usage error / not found / blocked by bot protection / network error
- Local file cache, so repeated queries don't re-download
- Ships with an agent skill (`skill/SKILL.md`) that any skill-capable agent host discovers and invokes automatically

## Installation

### Let your agent install it (recommended)

Paste the following verbatim into your LLM agent session:

```text
Install and configure poe-wiki-cli by following the instructions here:
https://raw.githubusercontent.com/sage-z-cn/poe-wiki-cli/refs/heads/main/docs/agent-install.md
```

The agent will follow those instructions to install the CLI, place the skill in the right host's skills directory, run `doctor` to verify, and finally report which version it installed and where the skill landed.

### Install the CLI manually

Requires Node.js >= 20 (the tool relies on the built-in `fetch`).

```bash
npm install -g poe-wiki-cli
poe-wiki-cli doctor
```

If you'd rather not install globally, use `npx poe-wiki-cli <command>`. If `npm install -g` returns 404, the package hasn't been published yet — use "Install from source" below.

### Install from source

```bash
git clone https://github.com/sage-z-cn/poe-wiki-cli.git
cd poe-wiki-cli
npm install
npm run build
npm link          # or: npm install -g .
```

## Quick start

```bash
poe-wiki-cli search fireball
poe-wiki-cli page Headhunter --source poedb
poe-wiki-cli page "https://www.poewiki.net/wiki/Endgame" --json
poe-wiki-cli league --patch
poe-wiki-cli doctor

# PoE2
poe-wiki-cli search fireball --game poe2
poe-wiki-cli page "https://poe2db.tw/us/Waystone"        # detected from the hostname, no --game needed
poe-wiki-cli league --game poe2
```

## Commands

### `search <query...>`

By default both sites are queried: first poedb's redirect-style search, where a hit becomes the first result (`source: "poedb"`, `kind: "page"`), then the poewiki search API (`generator=search` + `prop=extracts`, which returns a plain-text intro taken from the start of the article in a single request).

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

A miss on poedb is not an error (poewiki usually still has results); only when both are empty does the command return "not found". The poewiki snippet is plain text from the beginning of the article (`generator=search` + `prop=extracts`), not MediaWiki's default highlighted fragment cut off mid-sentence.

| Option | Description |
| --- | --- |
| `-g, --game <poe1\|poe2>` | Game: poe1 → poedb/poewiki, poe2 → poe2db/poe2wiki. Default `poe1` |
| `-s, --source <both\|poedb\|wiki>` | Data source. Default `both` |
| `-l, --lang <us\|tw\|cn\|kr\|ru\|jp\|fr\|de\|th\|pt\|sp>` | Database language; inferred from the query by default |
| `-n, --limit <n>` | Maximum number of wiki results. Default 8 |
| `-j, --json` | Emit JSON |
| `--no-cache` | Skip the local cache |
| `--timeout <ms>` | Request timeout. Default 20000 |

### `page <target>`

Fetches a single page and prints markdown. `target` accepts three forms:

- Full URL: `https://poedb.tw/cn/Headhunter`, `https://www.poewiki.net/wiki/Endgame`, `https://poe2db.tw/us/Waystone` (both the site and the game come from the host, overriding `--game`)
- Site prefix: `poedb:Headhunter`, `wiki:Iron Reflexes`, `poe2db:Waystone`, `poe2wiki:Endgame`
- Bare title: tries the db site first, falls back to the wiki

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

| Option | Description |
| --- | --- |
| `-g, --game <poe1\|poe2>` | Game. Default `poe1`; a full URL takes precedence |
| `-s, --source <auto\|both\|poedb\|wiki>` | Data source. Default `auto` (db site first, wiki as fallback) |
| `-l, --lang <lang>` | Database language; inferred from the title by default |
| `--max-chars <n>` | Body length cap. Default 40000; with `--html` the default is 0 (no truncation) |
| `--raw` | Print the body only, omitting the title and metadata |
| `--sections` | Also print the section outline (exposed as a `sections` array in JSON) |
| `--html` | Print raw HTML without markdown conversion (scripts, styles, navigation and other noise are stripped) |
| `-j, --json` | Emit JSON |
| `--no-cache` | Skip the local cache |
| `--timeout <ms>` | Request timeout. Default 20000 |

`--html` and `--raw` are mutually exclusive; using both exits with code 1. With `--html` the JSON field is `html` rather than `markdown`:

```json
{ "ok": true, "game": "poe1", "source": "poedb", "title": "Home", "url": "https://poedb.tw/us/", "html": "<!DOCTYPE html>…", "truncated": false }
```

`source` is the **actual site**: `poedb` / `poewiki` / `poe2db` / `poe2wiki`. Together with the `game` field you can tell exactly which game the data came from. For poewiki, `--html` prints the `parse.text` fragment returned by `action=parse`.

### `league`

Reads the league/version cards from the data site homepage and reports the current and next league along with a version summary. PoE1 reads the poedb homepage; PoE2 reads the poe2db homepage (`--game poe2`).

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

| Option | Description |
| --- | --- |
| `-g, --game <poe1\|poe2>` | Game. Default `poe1` |
| `--realm <both\|us\|cn>` | Realm. Default `both` |
| `--patch` | Expand the summary links for the newest version |
| `-j, --json` | Emit JSON |
| `--no-cache` | Skip the local cache |
| `--timeout <ms>` | Request timeout. Default 20000 |

PoE2 cards mean something different: there are no "leagues", only game versions (`0.5.5`, `1.0`), and the current version also carries an end date. With `--game poe2`:

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

The two realms get 1.0 at different times (December 11 internationally, December 18 on Tencent), which is exactly why schedules have to be looked up rather than assumed.

`--patch` expands the summary card with the highest version number for that realm:

```bash
$ poe-wiki-cli league --realm us --patch
International · poedb.tw/us
  next      3.30  Covens of Umbra
            …

  3.30 Covens  ·  https://poedb.tw/us/
    News        Atlas Skill Tree · Passive Skill Tree · Version 3.30.0 · FAQ
    Mechanism   Covens League · Version 3.30.0 · Unique · Item · Wickerman · Threads of Creation
```

All timestamps are rendered in the system time zone: UTC first, then local time with its offset. Relative times are computed at render time, so JSON carries absolute timestamps and the "in 13h 6m" in text output never goes stale.

JSON shape:

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

`current` / `next` / `patch` may all be absent (the field is missing entirely rather than set to `null`).

### `doctor`

By default it probes all four endpoints across PoE1 and PoE2, printing URL, status, latency, whether the response was blocked, and whether the content contains the expected marker. Any unhealthy endpoint makes the command exit with code 4.

| Option | Description |
| --- | --- |
| `-g, --game <both\|poe1\|poe2>` | Scope of the probe. Default `both` |

```bash
$ poe-wiki-cli doctor
poedb    ok   HTTP 200    563ms  page-content ✓  https://poedb.tw/us/
poewiki  ok   HTTP 200   1520ms  generator ✓  https://www.poewiki.net/w/api.php?action=query&meta=siteinfo&format=json
poe2db   ok   HTTP 200    498ms  page-content ✓  https://poe2db.tw/us/
poe2wiki ok   HTTP 200    731ms  generator ✓  https://www.poe2wiki.net/w/api.php?action=query&meta=siteinfo&format=json
```

## PoE2 support

`--game poe2` switches both data sources over to PoE2:

| | PoE1 (default) | PoE2 |
| --- | --- | --- |
| Database | `poedb.tw` | `poe2db.tw` |
| Wiki | `www.poewiki.net` | `www.poe2wiki.net` |

Both generations run on the same platform (the same db-site templates, MediaWiki for both wikis), so parsing, the language list, and caching behave identically — only the content differs.

**Do not carry PoE1 terminology over:**

- Gems are all **Gem**; leveling and crafting use **Uncut Skill Gem / Uncut Support Gem / Uncut Spirit Gem**
- Endgame maps are **Waystone**s (activated in the Map Device), not map items
- **Spirit** is a new resource (reserved for persistent buffs, permanent minions, and trigger meta gems)
- The passive tree page is titled **Passive Skill Tree**

**Index pages are much larger:** poe2db's `/us/Support_Gems` is about 3.6 MB and `/us/Skill_Gems` about 2.1 MB. Look up specific entries instead of pulling the whole page.

**League cards mean something different:** PoE2 has no leagues; the cards are game versions (`0.5.5`, `1.0`), the current one carries an extra `ends`, and `next` points at the next major version. See `league` above.

## Chinese-language queries

poedb / poe2db require the search language to match the site locale, otherwise the request always falls back to the homepage: `/cn/search?q=猎首` hits `/cn/Headhunter`, while `/us/search?q=猎首` just returns `/us/`.

The tool therefore infers the locale from the query:

- Contains Han characters (`\p{Script=Han}`) → `cn`
- Anything else → `us`
- An explicit `--lang` always wins

```bash
poe-wiki-cli search 猎首              # uses /cn/search, hits /cn/Headhunter
poe-wiki-cli page 火球 --source poedb # prints the Chinese article
poe-wiki-cli page 獵首 --lang tw      # Traditional Chinese site
```

Both JSON and text output include the `locale` that was actually used. Note that Chinese pages on poedb still use English URL slugs: `https://poedb.tw/cn/Headhunter`.

## Output and exit codes

| Exit code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | Usage error (invalid argument, `--html` together with `--raw`, etc.) |
| 2 | Not found (neither site has a result, or poedb has no such page) |
| 3 | Blocked by a bot-protection challenge page |
| 4 | Network or HTTP error (including a failed `doctor` probe) |

In text mode, errors are written to stderr:

```
Error: poedb has no page for "skill gem" (locale: us).
Hint: poedb search is case-sensitive; try a shorter English keyword, or pass --lang cn for Chinese titles.
```

With `--json`, errors look like this:

```json
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "…", "hint": "…" } }
```

## Caching

- Windows: `%LOCALAPPDATA%\poe-wiki-cli\cache`
- Other platforms: `$XDG_CACHE_HOME/poe-wiki-cli`, or `~/.cache/poe-wiki-cli` when unset

One `<sha256(url)>.json` per URL, containing `{url, fetchedAt, body}`. TTL: 3600 seconds for pages, 300 seconds for search and `league`. Cache read/write failures degrade silently and never break a query; `--no-cache` neither reads nor writes.

## Why the User-Agent must not start with Mozilla

Both poewiki.net and poe2wiki.net sit behind [Anubis](https://anubis.techaro.lol/) bot protection, which **only challenges User-Agents prefixed with `Mozilla/`**. With a browser UA the server returns a 7.5 KB challenge page with HTTP **200** and the body `Making sure you're not a bot!` instead of the real page — checking only the status code makes the request look successful.

UAs without the Mozilla prefix (`curl/8.4.0`, `python-httpx/0.27.0`, a custom `Xxx/1.0`) get the full page directly. poedb.tw doesn't care about the UA at all. This tool therefore always sends:

```
poe-wiki-cli/<version> (+https://github.com/sage-z-cn/poe-wiki-cli)
```

The HTTP layer also detects the challenge page explicitly (the body contains `Making sure you're not a bot`, or a wiki response has neither `mw-parser-output` nor a `"parse"` field) and raises `BlockedError` with exit code 3 instead of returning the challenge page as content.

## When parsing fails

`league` depends on the card structure of the poedb homepage. It does not silently return empty results when the site is redesigned: in text mode it prints a warning under the affected realm, and in JSON that realm carries `warnings`:

```
Tencent · poedb.tw/cn
  ! 未解析到赛季卡片，可能是首页结构变了。兜底：poe-wiki-cli page https://poedb.tw/cn/ --html
```

The fallback is `page --html`:

```bash
poe-wiki-cli page https://poedb.tw/us/ --html --max-chars 20000
```

Then confirm the structure by hand against these markers:

1. League cards are `div.card`; the title lives in `h5.card-header` and contains a `<small>` version badge (e.g. `3.30`);
2. The countdown is the Unix-seconds (UTC) `data-displaytime` attribute; the `div` immediately after it holds the label text (`Realm down` / `Starts in` / `已运行` / `开始倒数`);
3. The version summary card lives in the same `div.card`; its body is a series of `.itemList > ul`, where in each group the first `li > span.disabled` is the group name and the remaining `li > a` are links;
4. The stash tab sale card has `class="special"` and no version `<small>` in its title, so it is ignored.

If only one realm fails (a network problem), the command still returns the other realm's data and exits with 0. It returns 2 only when no realm yields cards, and 4 when every fetch fails.

## Development

```bash
npm install
npm run build       # tsc, output in dist/
npm test            # node --test, runs the compiled tests
npm run typecheck
npm run smoke       # node dist/src/cli.js doctor
node dist/src/cli.js --help
```

`npm run dev` is wired to `tsx src/cli.ts`; install `tsx` yourself to use it.

## License

MIT © Sage
