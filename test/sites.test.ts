import assert from "node:assert/strict";
import { test } from "node:test";
import { GAMES, gameFromHost, sitesFor } from "../src/sites.js";

test("gameFromHost 识别四种站点（带不带 www 都行）", () => {
  assert.equal(gameFromHost("poedb.tw"), "poe1");
  assert.equal(gameFromHost("www.poewiki.net"), "poe1");
  assert.equal(gameFromHost("poe2db.tw"), "poe2");
  assert.equal(gameFromHost("www.poe2wiki.net"), "poe2");
  assert.equal(gameFromHost("WWW.POE2WIKI.NET"), "poe2");
  assert.equal(gameFromHost("example.com"), null);
});

test("sitesFor 给出对应游戏的站点信息", () => {
  assert.deepEqual(GAMES, ["poe1", "poe2"]);

  const poe1 = sitesFor("poe1");
  assert.equal(poe1.dbOrigin, "https://poedb.tw");
  assert.equal(poe1.dbName, "poedb");
  assert.equal(poe1.wikiOrigin, "https://www.poewiki.net");
  assert.equal(poe1.wikiApi, "https://www.poewiki.net/w/api.php");
  assert.equal(poe1.wikiName, "poewiki");

  const poe2 = sitesFor("poe2");
  assert.equal(poe2.dbOrigin, "https://poe2db.tw");
  assert.equal(poe2.dbName, "poe2db");
  assert.equal(poe2.wikiOrigin, "https://www.poe2wiki.net");
  assert.equal(poe2.wikiApi, "https://www.poe2wiki.net/w/api.php");
  assert.equal(poe2.wikiName, "poe2wiki");
});
