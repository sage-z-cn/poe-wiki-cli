---
name: poe-wiki-cli
description: Query Path of Exile reference sites from the shell — poedb.tw for structured game data (skill gems, support gems, unique items, modifiers, maps, divination cards, keywords) and poewiki.net for mechanics prose, plus per-realm league schedules (international us / Tencent cn). Use when you need exact in-game numbers, confirmation of an item or skill gem's stats, a clean markdown copy of a wiki page, or the current and upcoming league dates. Supports Chinese and English queries, markdown or JSON output.
---

# poe-wiki-cli

One command to query the two Path of Exile reference sites, returning clean markdown or JSON. Both sites are server-rendered: no browser, no API key.

## Which source to use

| You need | Use |
|---|---|
| Exact numbers: modifier roll ranges, skill gem stats per level, item level requirements, map tiers | `poedb` |
| Mechanics explanations, acquisition, vendor recipes, divination cards, patch history, build notes | `wiki` |
| You don't know the canonical name, or want both sites side by side | `search` (queries both by default) |
| Only a Chinese name | Search the Chinese name directly; the tool switches to poedb's `cn` locale |
| Current league, next league start, realm downtime, patch summary | `league` (reads both poedb homepages) |

Rule of thumb: **poedb is a data table, the wiki is a manual.** "What can this roll?" → poedb. "How does this mechanic work?" → wiki.

## Install and self-check

```bash
poe-wiki-cli doctor          # run this first: verifies both sites are reachable
npm i -g poe-wiki-cli        # if not installed yet
```

If `doctor` reports the wiki as blocked (exit code 3), something on the network path is rewriting the User-Agent. This tool deliberately sends a non-Mozilla UA — poewiki's bot protection only challenges `Mozilla/`-prefixed agents, so impersonating a browser is what gets you blocked.

## Commands

### search

```bash
poe-wiki-cli search fireball
poe-wiki-cli search "chaos orb" --limit 5
poe-wiki-cli search 猎首                  # Chinese → poedb cn locale
poe-wiki-cli search "life leech" --source wiki
poe-wiki-cli search fireball --json
```

Notes:

- **poedb's "search" is a redirect, not a result list.** A hit takes you straight to that page, so poedb contributes at most one result. A miss is not an error — the other source still answers.
- poedb lookups are inconsistently case-sensitive (`headhunter` resolves, `Headhunter` does not). The CLI retries with a lowercased variant automatically, so you don't have to care.
- Chinese queries only work against `cn` and English queries only against `us`. The CLI detects CJK or Han characters and picks the locale; override with `--lang tw` for Traditional Chinese, or any of `us|tw|cn|kr|ru|jp|fr|de|th|pt|sp`.
- `--source both|poedb|wiki` selects which site to query; default is both.

### page

```bash
poe-wiki-cli page Headhunter                      # tries poedb, falls back to the wiki
poe-wiki-cli page Headhunter --source wiki
poe-wiki-cli page 火球 --source poedb             # Chinese page
poe-wiki-cli page "https://www.poewiki.net/wiki/Endgame"
poe-wiki-cli page Endgame --sections               # list headings before reading
poe-wiki-cli page "Skill_Gems" --max-chars 8000    # cap a very large index page
poe-wiki-cli page Headhunter --raw                 # drop the metadata header
poe-wiki-cli page "https://poedb.tw/us/" --html    # raw HTML instead of markdown (untruncated by default)
```

Output shape:

```markdown
# Headhunter
> source: poedb · https://poedb.tw/us/Headhunter
> fetched: 2026-11-13T12:00:00.000Z

<body markdown>
```

- The body is converted markdown: headings, lists and tables survive; navigation, ads, scripts and images are stripped.
- Bodies longer than `--max-chars` (default 40000) are truncated with an explicit notice at the end — nothing disappears silently.
- Index pages are enormous (`/us/Skill_Gems` is over 1 MB of HTML, `/us/Divination_Cards` 665 KB). **Search for the specific entry instead of pulling the whole page**, or cap it with `--max-chars`.

### doctor

```bash
poe-wiki-cli doctor
poe-wiki-cli doctor --json
```

### league

League scheduling is realm-specific and poedb's two homepages are the source: `/us/` is the international realm, `/cn/` is Tencent. Each homepage carries a card per league with `Realm down` / `Starts in` / `Running for` timers, plus a "new league" card summarising the patch content.

```bash
poe-wiki-cli league                  # both realms
poe-wiki-cli league --realm cn       # Tencent only
poe-wiki-cli league --patch          # also expand the new-league link summary
poe-wiki-cli league --json
```

```
International · poedb.tw/us
  next      3.30  Covens of Umbra
            realm down  2026-11-13 17:00 UTC · 2026-11-14 01:00 (UTC+08:00)  in 2h 41m
            starts      2026-11-13 19:00 UTC · 2026-11-14 03:00 (UTC+08:00)  in 4h 41m

Tencent · poedb.tw/cn
  current   3.29  Curse of the Allflame
            running since  2026-07-31 02:00 UTC · 2026-07-31 10:00 (UTC+08:00)  (105d 1h)
  next      3.30  黑影巫会
            starts         2026-11-19 02:00 UTC · 2026-11-19 10:00 (UTC+08:00)  in 5d 9h
```

- A realm can have **both** a running league and an upcoming one (Tencent does). Cards are classified by their timer label, not by order, so this works mid-league-transition.
- Relative times (`in 2h 41m`, `105d`) are computed at render time. The timers are honest about what poedb shows — `Realm down` is when the realm goes offline, `Starts in` is the launch itself; they are not the same moment.
- `--patch` expands only the **newest** patch card's link groups (News, Mechanism, Currency, Item — localised to 新闻/机制/通货/物品 on `cn`); without it you still get a one-line `patch 3.30 Covens`.
- Cached for 5 minutes only — league dates change and stale countdowns are worse than a refetch.

#### When `league` parsing fails

poedb re-lays-out its homepage whenever a league launches. There is no API behind it, so `league` is a scraper and it can drift. Treat these as signals to fall back to reading the homepage yourself:

- exit code 2 with no `realms` content;
- a realm entry carrying `warnings` (e.g. `no league cards parsed; homepage layout may have changed`);
- a realm where both `current` and `next` are missing while the other realm parsed fine.

Fallback procedure:

```bash
poe-wiki-cli page "https://poedb.tw/us/" --html    # raw HTML, no truncation by default
poe-wiki-cli page "https://poedb.tw/cn/" --html    # Tencent realm
```

`page` converts HTML to markdown, which **drops `data-*` attributes — that is where the timestamps live**. So use `--html` when you need dates. Then read the cards directly:

| In the HTML | Meaning |
|---|---|
| `<h5 class="card-header">Name 腾讯服 <small class="float-end">3.30</small></h5>` | league name + version; strip the `腾讯服` / `国际服` suffix into a server field |
| `<div data-displaytime="1794589200">` | the timer's moment, **Unix seconds, UTC** |
| the `<div>` right after it | the timer label: `Realm down` / `Starts in` / `Running for`, or `已运行` / `开始倒数` on `cn` |
| `<div class="py-1 itemList">` groups in the patch card | `News` / `Mechanism` / `Currency` / `Item` link groups (中: 新闻/机制/通货/物品) |

Two traps when reading the raw page:

1. **Classify by label, never by card order.** Tencent shows a running league and an upcoming one side by side; international may show only one.
2. **Skip non-league cards.** The `Stash Tab Sales` card also has `data-countdown` but its header has no version `<small>` — only cards with a version badge are leagues.

Report what you found, and state explicitly that `league` failed to parse, so the parser can be fixed instead of silently drifting.

## JSON mode

Every command accepts `--json` and prints a single JSON object:

```jsonc
// search
{ "ok": true, "query": "fireball", "locale": "us",
  "results": [ { "source": "poedb", "kind": "page", "title": "Fireball",
                 "url": "https://poedb.tw/us/Fireball" },
               { "source": "poewiki", "kind": "search", "title": "Fireball",
                 "url": "https://www.poewiki.net/wiki/Fireball",
                 "snippet": "Fireball is a spell that ...", "size": 0, "wordcount": 0 } ] }

// page
{ "ok": true, "source": "poewiki", "title": "Endgame",
  "url": "https://www.poewiki.net/wiki/Endgame",
  "fetchedAt": "2026-11-13T12:00:00.000Z",
  "markdown": "...", "truncated": false, "originalChars": 11074 }

// failure
{ "ok": false, "error": { "code": "BLOCKED", "message": "...", "hint": "..." } }
```

`league` returns one entry per realm; `current`, `next` and `patch` are omitted when the homepage does not have them:

```jsonc
{ "ok": true, "fetchedAt": "...",
  "realms": [ { "realm": "cn", "server": "tencent", "locale": "cn",
                "url": "https://poedb.tw/cn/",
                "current": { "name": "Curse of the Allflame", "version": "3.29",
                             "since": "2026-07-31T02:00:00.000Z", "runningSeconds": 9057600 },
                "next":    { "name": "Covens of Umbra", "version": "3.30",
                             "startsAt": "2026-11-19T02:00:00.000Z", "startsInSeconds": 464400 },
                "patch":   { "version": "3.30", "codename": "Covens",
                             "sections": [ { "label": "新闻", "links": [ { "text": "...", "url": "..." } ] } ] } } ] }
```

## Exit codes

| Code | Meaning | What to do |
|---|---|---|
| 0 | success | — |
| 1 | bad usage | check `--help` and flag combinations |
| 2 | not found | try another keyword, the other source, or the original Chinese/English name |
| 3 | blocked by bot protection | check whether a proxy rewrites the UA; retry once; switch source |
| 4 | network or HTTP error | retry, or run `doctor` |

## Terminology

Use these exact terms — they are the page titles on poewiki and the section names on poedb, so they are also the best search keywords.

| Term | What it is | Where to read |
|---|---|---|
| skill gem | item class that grants skills when socketed; called *Active Skill Gems* in item filters | wiki `Skill gem`, poedb `/us/Skill_Gems` |
| support gem | skill gem that modifies compatible skill gems it is linked to | wiki `Support gem`, poedb `/us/Support_Gems` |
| transfigured skill gem | alternate version of an existing skill gem, suffixed "of X" | wiki `Transfigured skill gem` |
| exceptional gem | endgame skill gem dropped by Atlas bosses | wiki `Exceptional gem` |
| unique item | item with a fixed name, artwork and predetermined modifiers | wiki `Unique item` |
| modifier | stat/buff/skill granted by an item or area; implicit vs explicit | wiki `Modifier`, poedb `/us/Modifiers` |
| keyword | capitalized game term with mechanical meaning (e.g. *Ignite*, *Leech*) | wiki `Keyword`, poedb `/us/Keywords` |
| item level (ilvl) | level tied to the area an item dropped in; gates which modifiers can roll | wiki `Item level` |
| quality | improves an item's signature stat or adds skill gem bonuses | wiki `Quality` |
| map | item that opens portals to a map area | wiki `Map`, poedb `/us/Maps` |
| thread | map fragment that injects a league mechanic into a non-unique map | wiki `Thread` |
| divination card | collectible card exchanged for a reward | wiki `Divination card` |
| passive skill | node on the shared passive skill tree | wiki `Passive skill` |
| keystone | powerful, build-defining passive node | wiki `Keystone` |
| mastery | special passive choice available after a cluster's notable | wiki `Mastery` |
| ascendancy class | subclass chosen after the Labyrinth | wiki `Ascendancy class` |
| vendor recipe system | selling specific item combinations to vendors for currency/gear | wiki `Vendor recipe system` |

## Caching

Pages cache for 1 hour, searches for 5 minutes, under the user cache directory (Windows `%LOCALAPPDATA%\poe-wiki-cli\cache`). Force a refresh with `--no-cache` right after a league start or a wiki update; not needed for repeated lookups of the same page.

## Workflows

**1. Confirm an item's real numbers**

```bash
poe-wiki-cli page Headhunter --source poedb --raw | head -60
```

**2. Look up how a mechanic is calculated**

```bash
poe-wiki-cli search "damage conversion" --source wiki --json   # pick the title
poe-wiki-cli page Damage_conversion --source wiki               # read the body
```

**3. A player asks in Chinese**

```bash
poe-wiki-cli search 猎首            # → /cn/Headhunter
poe-wiki-cli page 猎首 --raw        # read the Chinese page directly
```

**4. Locate first, read second (saves context)**

```bash
poe-wiki-cli page Endgame --sections            # see the heading list
poe-wiki-cli page Endgame --max-chars 6000      # take only the opening sections
```

**5. "When does the next league start?"**

```bash
poe-wiki-cli league --json                       # both realms, machine-readable
poe-wiki-cli league --realm cn                   # Tencent only (中文赛季名)
poe-wiki-cli league --patch                      # plus what the patch actually contains
```

Never answer league dates from memory — the two realms run different versions (Tencent lags behind international), and poedb's homepage is the only place both schedules are stated together.
