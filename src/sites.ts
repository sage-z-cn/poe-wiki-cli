export type Game = "poe1" | "poe2";

export const GAMES: readonly Game[] = ["poe1", "poe2"];

export interface GameSites {
  game: Game;
  /** 资料站主站，例如 https://poedb.tw */
  dbOrigin: string;
  dbName: "poedb" | "poe2db";
  /** wiki 主站，例如 https://www.poewiki.net */
  wikiOrigin: string;
  wikiApi: string;
  wikiName: "poewiki" | "poe2wiki";
}

const SITES: Record<Game, GameSites> = {
  poe1: {
    game: "poe1",
    dbOrigin: "https://poedb.tw",
    dbName: "poedb",
    wikiOrigin: "https://www.poewiki.net",
    wikiApi: "https://www.poewiki.net/w/api.php",
    wikiName: "poewiki",
  },
  poe2: {
    game: "poe2",
    dbOrigin: "https://poe2db.tw",
    dbName: "poe2db",
    wikiOrigin: "https://www.poe2wiki.net",
    wikiApi: "https://www.poe2wiki.net/w/api.php",
    wikiName: "poe2wiki",
  },
};

export function sitesFor(game: Game): GameSites {
  return SITES[game];
}

export function gameFromHost(host: string): Game | null {
  const normalized = host.toLowerCase().replace(/^www\./, "");
  switch (normalized) {
    case "poedb.tw":
    case "poewiki.net":
      return "poe1";
    case "poe2db.tw":
    case "poe2wiki.net":
      return "poe2";
    default:
      return null;
  }
}
