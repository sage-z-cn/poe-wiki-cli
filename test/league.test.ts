import assert from "node:assert/strict";
import { test } from "node:test";
import { leagueExitCode } from "../src/commands/league.js";
import { parseLeagueHomepage } from "../src/sources/league.js";

const US_HOME = `
<div class="row row-cols-1 row-cols-lg-2 g-2">
  <div class="col"><div   class="card mb-2 ">
    <h5 class="card-header">Covens of Umbra <small class="float-end">3.30</small></h5>
    <div style="padding:0 0.5rem 0.5rem 0.5rem"><div class="row g-2">
      <div class='col text-center'><div data-displaytime='1794589200'></div><div>Realm down</div><div class='' data-countdown='1794589200' data-format='day'></div></div>
      <div class='col text-center'><div data-displaytime='1794596400'></div><div>Starts in</div><div class='' data-countdown='1794596400' data-format='day'></div></div>
    </div></div>
  </div></div>
  <div class="col"><div   class="card mb-2 special">
    <h5 class="card-header">Stash Tab <span data-i18n-tw="特賣">Sales</span></h5>
    <div class="card-body"><div class="text-center"><div data-displaytime="1794873600"></div><div><a href="shop">Ends in</a></div><span class='d-block text-center' data-countdown='1794873600' data-format='day'></span></div></div>
  </div></div>
</div>
<div class="row g-2"><div class='vte col-12'><div class='card mb-2'>
  <h5 class="card-header"><small class='float-end'> <span>3.30</span></small>Covens</h5>
  <div class="card-body">
    <div class="py-1 itemList"><ul>
      <li><span class="disabled">News</span></li>
      <li><a href="/us/atlas-skill-tree/">Atlas Skill Tree</a></li>
      <li><a href="/us/Version_3.30.0">Version 3.30.0</a></li>
      <li><a href="https://www.pathofexile.com/forum/view-post/26880030" target="_blank">FAQ</a></li>
    </ul></div>
    <div class="py-1 itemList"><ul>
      <li><span class="disabled">Mechanism</span></li>
      <li><a href="Covens_league">Covens League</a></li>
      <li><a href="Threads_of_Creation">Threads of Creation</a></li>
    </ul></div>
  </div>
</div></div></div>
`;

const CN_HOME = `
<div class="row row-cols-1 row-cols-lg-2 g-2">
  <div class="col"><div   class="card mb-2 ">
    <h5 class="card-header">黑影巫会 腾讯服 <small class="float-end">3.30</small></h5>
    <div style="padding:0 0.5rem 0.5rem 0.5rem"><div class="row g-2">
      <div class='col text-center'><div data-displaytime='1795053600'></div><div>开始倒数</div><div class='' data-countdown='1795053600' data-format='day'></div></div>
    </div></div>
  </div></div>
  <div class="col"><div   class="card mb-2 ">
    <h5 class="card-header">Curse of the Allflame 腾讯服 <small class="float-end">3.29</small></h5>
    <div style="padding:0 0.5rem 0.5rem 0.5rem"><div class="row g-2">
      <div class='col text-center'><div data-displaytime='1785463200'></div><div>已运行</div><div class='text-info' data-countdown='1785463200' data-format='day'></div></div>
    </div></div>
  </div></div>
</div>
<div class="row g-2"><div class='vte col-12'>
  <div class='card mb-2'>
    <h5 class="card-header"><small class='float-end'> <span>3.30</span></small>Covens</h5>
    <div class="card-body">
      <div class="py-1 itemList"><ul>
        <li><span class="disabled">新闻</span></li>
        <li><a href="/cn/atlas-skill-tree/">Atlas Skill Tree</a></li>
      </ul></div>
      <div class="py-1 itemList"><ul>
        <li><span class="disabled">机制</span></li>
        <li><a href="Covens_league">Covens 赛季</a></li>
      </ul></div>
    </div>
  </div>
  <div class='card mb-2'>
    <h5 class="card-header"><small class='float-end'> <span>3.29</span></small>3.29 永火之咒</h5>
    <div class="card-body">
      <div class="py-1 itemList"><ul>
        <li><span class="disabled">新闻</span></li>
        <li><a href="Allflame_league">Allflame 赛季</a></li>
      </ul></div>
    </div>
  </div>
</div></div>
`;

test("解析国际服首页：next 的 realm down 与 starts 相差 7200 秒", () => {
  const info = parseLeagueHomepage(US_HOME, { realm: "us", includeSections: true, now: 1_794_590_000_000 });

  assert.equal(info.server, "international");
  assert.equal(info.current, undefined);
  assert.ok(info.next);
  assert.equal(info.next.version, "3.30");
  assert.equal(info.next.name, "Covens of Umbra");
  assert.equal(info.next.realmDownAt, "2026-11-13T17:00:00.000Z");
  assert.equal(info.next.startsAt, "2026-11-13T19:00:00.000Z");
  assert.equal(Date.parse(info.next.startsAt) - Date.parse(info.next.realmDownAt), 7_200_000);
  assert.equal(info.next.startsInSeconds, 6_400);
});

test("解析国际服首页：Stash Tab 特卖卡被排除，patch 只展开最新版本", () => {
  const info = parseLeagueHomepage(US_HOME, { realm: "us", includeSections: true, now: 1_794_590_000_000 });
  assert.ok(info.patch);
  assert.equal(info.patch.version, "3.30");
  assert.equal(info.patch.codename, "Covens");
  assert.deepEqual(
    info.patch.sections?.map((section) => section.label),
    ["News", "Mechanism"],
  );
  assert.equal(info.patch.sections?.[0].links[0].url, "https://poedb.tw/us/atlas-skill-tree/");
  assert.equal(info.patch.sections?.[0].links[2].url, "https://www.pathofexile.com/forum/view-post/26880030");
  assert.equal(info.patch.sections?.[1].links[0].url, "https://poedb.tw/us/Covens_league");
  assert.doesNotMatch(JSON.stringify(info), /Stash Tab/);
});

test("解析腾讯服首页：current 3.29 + next 3.30，腾讯服后缀被剥离", () => {
  const info = parseLeagueHomepage(CN_HOME, { realm: "cn", includeSections: true, now: 1_794_590_000_000 });

  assert.equal(info.server, "tencent");
  assert.ok(info.current);
  assert.equal(info.current.version, "3.29");
  assert.equal(info.current.name, "Curse of the Allflame");
  assert.equal(info.current.since, "2026-07-31T02:00:00.000Z");
  assert.equal(info.current.runningSeconds, 1_794_590_000 - 1_785_463_200);

  assert.ok(info.next);
  assert.equal(info.next.version, "3.30");
  assert.equal(info.next.name, "黑影巫会");
  assert.equal(info.next.startsAt, "2026-11-19T02:00:00.000Z");
  assert.equal(info.next.startsInSeconds, 463_600);
  assert.doesNotMatch(info.next.name, /腾讯服/);
});

test("腾讯服 patch 取版本号最大的卡片", () => {
  const info = parseLeagueHomepage(CN_HOME, { realm: "cn", includeSections: true, now: 1_794_590_000_000 });
  assert.ok(info.patch);
  assert.equal(info.patch.version, "3.30");
  assert.equal(info.patch.codename, "Covens");
  assert.deepEqual(
    info.patch.sections?.map((section) => section.label),
    ["新闻", "机制"],
  );
});

test("没有赛季卡片时给出 warning 而不是抛异常", () => {
  const info = parseLeagueHomepage("<html><body><div class='card'>nothing here</div></body></html>", {
    realm: "us",
  });
  assert.equal(info.current, undefined);
  assert.equal(info.next, undefined);
  assert.equal(info.patch, undefined);
  assert.deepEqual(info.warnings, ["no league cards parsed; homepage layout may have changed"]);
});

test("退出码：无卡片 → 2，全部抓取失败 → 4，部分成功 → 0", () => {
  const us = { game: "poe1" as const, realm: "us" as const, server: "international" as const, locale: "us" as const, url: "https://poedb.tw/us/" };
  const cn = { game: "poe1" as const, realm: "cn" as const, server: "tencent" as const, locale: "cn" as const, url: "https://poedb.tw/cn/" };

  assert.equal(
    leagueExitCode({
      game: "poe1",
      fetchedAt: "",
      realms: [{ ...us, warnings: ["no league cards parsed; homepage layout may have changed"] }],
    }),
    2,
  );

  assert.equal(leagueExitCode({ game: "poe1", fetchedAt: "", realms: [{ ...us, warnings: ["fetch failed: boom"] }] }), 4);

  assert.equal(
    leagueExitCode({
      game: "poe1",
      fetchedAt: "",
      realms: [
        { ...us, warnings: ["fetch failed: boom"] },
        {
          ...cn,
          current: { name: "Curse of the Allflame", version: "3.29", since: "2026-07-31T02:00:00.000Z", runningSeconds: 100 },
        },
      ],
    }),
    0,
  );
});

const POE2_US_HOME = `
<div class="row row-cols-1 row-cols-lg-4 g-2">
  <div class="col"><div   class="card mb-2 ">
    <h5 class="card-header">Release <small class="float-end">1.0</small></h5>
    <div style="padding:0 0.5rem 0.5rem 0.5rem"><div class="row g-2">
      <div class='col text-center'><div data-displaytime='1797019200'></div><div><a target="_blank" href="Version_1.0.0">Starts in</a></div><div class='' data-countdown='1797019200' data-format='day'></div></div>
    </div></div>
  </div></div>
  <div class="col"><div   class="card mb-2 ">
    <h5 class="card-header">Forbidden Rites <small class="float-end">0.5.5</small></h5>
    <div style="padding:0 0.5rem 0.5rem 0.5rem"><div class="row g-2">
      <div class='col text-center'><div data-displaytime='1788552000'></div><div><a target="_blank" href="Version_0.5.5">Running for</a></div><div class='text-info' data-countdown='1788552000' data-format='day'></div></div>
      <div class='col text-center'><div data-displaytime='1797019200'></div><div>Ends in</div><div class='' data-countdown='1797019200' data-format='day'></div></div>
    </div></div>
  </div></div>
  <div class="col"><div   class="card mb-2 ">
    <h5 class="card-header">Return of the Ancients <small class="float-end">0.5</small></h5>
    <div style="padding:0 0.5rem 0.5rem 0.5rem"><div class="row g-2">
      <div class='col text-center'><div data-displaytime='1780084800'></div><div><a target="_blank" href="Runes_of_Aldur_league">Running for</a></div><div class='text-info' data-countdown='1780084800' data-format='day'></div></div>
      <div class='col text-center'><div data-displaytime='1797019200'></div><div>Ends in</div><div class='' data-countdown='1797019200' data-format='day'></div></div>
    </div></div>
  </div></div>
  <div class="col"><div   class="card mb-2 special">
    <h5 class="card-header">Stash Tab <span data-i18n-tw="特賣">Sales</span></h5>
    <div class="card-body"><div class="text-center"><div data-displaytime="1794873600"></div><div><a href="shop">Ends in</a></div><span class='d-block text-center' data-countdown='1794873600' data-format='day'></span></div></div>
  </div></div>
</div>
<div class="row g-2"><div class='vte col-12'><div class='card mb-2'>
  <h5 class="card-header"><small class='float-end'> <span>1.0</span></small>Conquerors of Wraeclast</h5>
  <div class="card-body">
    <div class="py-1 itemList"><ul>
      <li><span class="disabled">News</span></li>
      <li><a href="Version_1.0.0">Version 1.0.0</a></li>
      <li><a href="https://www.pathofexile.com/forum/view-post/1" target="_blank">FAQ</a></li>
    </ul></div>
  </div>
</div></div></div>
`;

const POE2_CN_HOME = `
<div class="row row-cols-1 row-cols-lg-3 g-2">
  <div class="col"><div   class="card mb-2 ">
    <h5 class="card-header">Release (腾讯服) <small class="float-end">1.0</small></h5>
    <div style="padding:0 0.5rem 0.5rem 0.5rem"><div class="row g-2">
      <div class='col text-center'><div data-displaytime='1797559200'></div><div><a target="_blank" href="Version_1.0.0">开始倒数</a></div><div class='' data-countdown='1797559200' data-format='day'></div></div>
    </div></div>
  </div></div>
  <div class="col"><div   class="card mb-2 ">
    <h5 class="card-header">禁断仪式 (腾讯服) <small class="float-end">0.5.5</small></h5>
    <div style="padding:0 0.5rem 0.5rem 0.5rem"><div class="row g-2">
      <div class='col text-center'><div data-displaytime='1789005600'></div><div><a target="_blank" href="Version_0.5.5">已运行</a></div><div class='text-info' data-countdown='1789005600' data-format='day'></div></div>
      <div class='col text-center'><div data-displaytime='1797559200'></div><div>结束倒数</div><div class='' data-countdown='1797559200' data-format='day'></div></div>
    </div></div>
  </div></div>
  <div class="col"><div   class="card mb-2 ">
    <h5 class="card-header">远古回响 (腾讯服) <small class="float-end">0.5</small></h5>
    <div style="padding:0 0.5rem 0.5rem 0.5rem"><div class="row g-2">
      <div class='col text-center'><div data-displaytime='1780624800'></div><div><a target="_blank" href="Runes_of_Aldur_league">已运行</a></div><div class='text-info' data-countdown='1780624800' data-format='day'></div></div>
      <div class='col text-center'><div data-displaytime='1797559200'></div><div>结束倒数</div><div class='' data-countdown='1797559200' data-format='day'></div></div>
    </div></div>
  </div></div>
</div>
<div class="row g-2"><div class='vte col-12'><div class='card mb-2'>
  <h5 class="card-header"><small class='float-end'> <span>1.0</span></small>Conquerors of Wraeclast</h5>
  <div class="card-body">
    <div class="py-1 itemList"><ul>
      <li><span class="disabled">新闻</span></li>
      <li><a href="/cn/Version_1.0.0">Version 1.0.0</a></li>
    </ul></div>
    <div class="py-1 itemList"><ul>
      <li><span class="disabled">机制</span></li>
      <li><a href="Runes_of_Aldur_league">远古回响赛季</a></li>
    </ul></div>
  </div>
</div></div></div>
`;

test("PoE2 国际服：三段版本号 + Ends in + current 取最新已运行", () => {
  const info = parseLeagueHomepage(POE2_US_HOME, {
    game: "poe2",
    realm: "us",
    includeSections: true,
    now: 1_790_000_000_000,
  });

  assert.equal(info.game, "poe2");
  assert.equal(info.url, "https://poe2db.tw/us/");

  assert.ok(info.current);
  assert.equal(info.current.version, "0.5.5");
  assert.equal(info.current.name, "Forbidden Rites");
  assert.equal(info.current.since, "2026-09-04T20:00:00.000Z");
  assert.equal(info.current.ends, "2026-12-11T20:00:00.000Z");
  assert.equal(info.current.endsInSeconds, 1_797_019_200 - 1_790_000_000);

  assert.ok(info.next);
  assert.equal(info.next.version, "1.0");
  assert.equal(info.next.name, "Release");
  assert.equal(info.next.startsAt, "2026-12-11T20:00:00.000Z");

  assert.ok(info.patch);
  assert.equal(info.patch.version, "1.0");
  assert.equal(info.patch.codename, "Conquerors of Wraeclast");
  assert.equal(info.patch.sections?.[0].links[1].url, "https://www.pathofexile.com/forum/view-post/1");
});

test("PoE2 腾讯服：结束倒数归类、(腾讯服) 剥离、旧赛季不串位", () => {
  const info = parseLeagueHomepage(POE2_CN_HOME, {
    game: "poe2",
    realm: "cn",
    includeSections: true,
    now: 1_790_000_000_000,
  });

  assert.equal(info.server, "tencent");
  assert.equal(info.url, "https://poe2db.tw/cn/");

  assert.ok(info.current);
  assert.equal(info.current.version, "0.5.5");
  assert.equal(info.current.name, "禁断仪式");
  assert.equal(info.current.since, "2026-09-10T02:00:00.000Z");
  assert.equal(info.current.ends, "2026-12-18T02:00:00.000Z");
  assert.equal(info.next?.version, "1.0");
  assert.equal(info.next?.name, "Release");
  assert.equal(info.next?.startsAt, "2026-12-18T02:00:00.000Z");
  assert.doesNotMatch(JSON.stringify(info.current), /远古回响/);
  assert.equal(info.patch?.codename, "Conquerors of Wraeclast");
  assert.deepEqual(
    info.patch?.sections?.map((section) => section.label),
    ["新闻", "机制"],
  );
  assert.equal(info.patch?.sections?.[1].links[0].url, "https://poe2db.tw/cn/Runes_of_Aldur_league");
});

test("PoE1 的 current 没有 ends 字段", () => {
  const info = parseLeagueHomepage(CN_HOME, { realm: "cn", now: 1_790_000_000_000 });
  assert.equal(info.current?.ends, undefined);
  assert.equal(info.game, "poe1");
  assert.equal(info.url, "https://poedb.tw/cn/");
});
