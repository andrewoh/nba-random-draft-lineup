import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import teamsData from '../data/teams.json';

type Team = { abbr: string; name: string };

type AdvancedStats = {
  bpm: number;
  ws48: number;
  vorp: number;
  epm: number;
};

type BasketRefRow = {
  playerName: string;
  teamId: string;
  bpm: number;
  ws48: number;
  vorp: number;
};

const NBA_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  Referer: 'https://www.nba.com/',
  Origin: 'https://www.nba.com',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9'
};

const BASKETBALL_REFERENCE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml'
};

const TEAM_ID_BY_ABBR: Record<string, string> = {
  ATL: '1610612737',
  BOS: '1610612738',
  BKN: '1610612751',
  CHA: '1610612766',
  CHI: '1610612741',
  CLE: '1610612739',
  DAL: '1610612742',
  DEN: '1610612743',
  DET: '1610612765',
  GSW: '1610612744',
  HOU: '1610612745',
  IND: '1610612754',
  LAC: '1610612746',
  LAL: '1610612747',
  MEM: '1610612763',
  MIA: '1610612748',
  MIL: '1610612749',
  MIN: '1610612750',
  NOP: '1610612740',
  NYK: '1610612752',
  OKC: '1610612760',
  ORL: '1610612753',
  PHI: '1610612755',
  PHX: '1610612756',
  POR: '1610612757',
  SAC: '1610612758',
  SAS: '1610612759',
  TOR: '1610612761',
  UTA: '1610612762',
  WAS: '1610612764'
};

const LINEUP_SLOTS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
type LineupSlot = (typeof LINEUP_SLOTS)[number];

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\./g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

function seasonStartYear(season: string): number {
  const match = season.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid season format: ${season}`);
  }

  return Number(match[1]);
}

function seasonEndYear(season: string): number {
  return seasonStartYear(season) + 1;
}

function previousSeason(season: string): string {
  const start = seasonStartYear(season) - 1;
  const end = String((start + 1) % 100).padStart(2, '0');
  return `${start}-${end}`;
}

function defaultSeasonsFromTarget(targetSeason: string): string[] {
  const previous = previousSeason(targetSeason);
  const twoBack = previousSeason(previous);
  return [targetSeason, previous, twoBack];
}

async function fetchJson(url: string, headers: Record<string, string>, retries = 3): Promise<any> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, { headers });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }

      return response.json();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 300));
    }
  }

  throw lastError;
}

async function fetchText(url: string, headers: Record<string, string>, retries = 3): Promise<string> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, { headers });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }

      return response.text();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 300));
    }
  }

  throw lastError;
}

function parseNbaResultSet(payload: any): { headers: string[]; rows: any[][] } {
  const resultSet = payload?.resultSets?.[0] ?? payload?.resultSet;
  if (!resultSet || !Array.isArray(resultSet.headers) || !Array.isArray(resultSet.rowSet)) {
    throw new Error('Unexpected NBA stats response format');
  }

  return {
    headers: resultSet.headers,
    rows: resultSet.rowSet
  };
}

function mapNbaPositionToSlots(position: string): LineupSlot[] {
  const normalized = position.trim().toUpperCase();
  if (!normalized) {
    return [...LINEUP_SLOTS];
  }

  const exact: Record<string, LineupSlot[]> = {
    PG: ['PG'],
    SG: ['SG'],
    SF: ['SF'],
    PF: ['PF'],
    C: ['C'],
    G: ['PG', 'SG'],
    F: ['SF', 'PF']
  };

  if (exact[normalized]) {
    return exact[normalized];
  }

  const slots = new Set<LineupSlot>();

  for (const token of normalized.split('-')) {
    const value = token.trim();
    if (value === 'PG') slots.add('PG');
    if (value === 'SG') slots.add('SG');
    if (value === 'SF') slots.add('SF');
    if (value === 'PF') slots.add('PF');
    if (value === 'C') slots.add('C');
    if (value === 'G') {
      slots.add('PG');
      slots.add('SG');
    }
    if (value === 'F') {
      slots.add('SF');
      slots.add('PF');
    }
  }

  return slots.size > 0 ? [...slots] : [...LINEUP_SLOTS];
}

async function fetchRostersAndPositions(latestAvailableSeason: string): Promise<{
  rosters: Record<string, string[]>;
  playerPositions: Record<string, LineupSlot[]>;
}> {
  const teams = teamsData as Team[];
  const rosters: Record<string, string[]> = {};
  const playerPositions: Record<string, LineupSlot[]> = {};

  for (const team of teams) {
    const teamId = TEAM_ID_BY_ABBR[team.abbr];
    if (!teamId) {
      continue;
    }

    const url = `https://stats.nba.com/stats/commonteamroster?LeagueID=00&Season=${latestAvailableSeason}&TeamID=${teamId}`;
    const payload = await fetchJson(url, NBA_HEADERS);
    const { headers, rows } = parseNbaResultSet(payload);

    const playerNameIndex = headers.indexOf('PLAYER');
    const positionIndex = headers.indexOf('POSITION');

    if (playerNameIndex === -1 || positionIndex === -1) {
      throw new Error(`Could not parse roster payload for ${team.abbr}`);
    }

    const namesSet = new Set<string>();

    const addRows = (inputRows: any[][]) => {
      for (const row of inputRows) {
        const playerName = String(row[playerNameIndex] ?? '').trim();
        const position = String(row[positionIndex] ?? '').trim();

        if (!playerName) {
          continue;
        }

        namesSet.add(playerName);

        const normalizedPlayer = normalizeName(playerName);
        const mappedSlots = mapNbaPositionToSlots(position);
        playerPositions[normalizedPlayer] = mappedSlots;
        playerPositions[playerName] = mappedSlots;
      }
    };

    addRows(rows);

    // If a roster snapshot comes back too short, backfill from prior season to keep realistic depth.
    if (namesSet.size < 12) {
      const previous = previousSeason(latestAvailableSeason);
      try {
        const previousUrl = `https://stats.nba.com/stats/commonteamroster?LeagueID=00&Season=${previous}&TeamID=${teamId}`;
        const previousPayload = await fetchJson(previousUrl, NBA_HEADERS);
        const previousResultSet = parseNbaResultSet(previousPayload);
        addRows(previousResultSet.rows);
      } catch (error) {
        console.warn(`Roster backfill failed for ${team.abbr}:`, error);
      }
    }

    rosters[team.abbr] = [...namesSet].sort((a, b) => a.localeCompare(b));
  }

  return { rosters, playerPositions };
}

async function fetchBasketballReferenceSeason(
  season: string
): Promise<Map<string, BasketRefRow>> {
  const year = seasonEndYear(season);
  const url = `https://www.basketball-reference.com/leagues/NBA_${year}_advanced.html`;
  const html = await fetchText(url, BASKETBALL_REFERENCE_HEADERS);

  const tableMatch = html.match(
    /<table[^>]*id="advanced_stats"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i
  );
  if (!tableMatch) {
    throw new Error(`Could not parse Basketball-Reference table for ${season}`);
  }

  const tbodyHtml = tableMatch[1];
  const selectedRows = tbodyHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  const byPlayer = new Map<string, BasketRefRow>();

  const getCell = (rowHtml: string, dataStat: string): string => {
    const regex = new RegExp(
      `<t(?:d|h)[^>]*data-stat=\"${dataStat}\"[^>]*>([\\\\s\\\\S]*?)<\\\\/t(?:d|h)>`,
      'i'
    );
    const match = rowHtml.match(regex);
    if (!match) {
      return '';
    }

    return match[1]
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  };

  for (const rowHtml of selectedRows) {
    if (/class=\"[^\"]*thead/.test(rowHtml)) {
      continue;
    }

    const playerName = getCell(rowHtml, 'player');
    const teamId = getCell(rowHtml, 'team_id');
    const bpm = Number(getCell(rowHtml, 'bpm'));
    const ws48 = Number(getCell(rowHtml, 'ws_per_48'));
    const vorp = Number(getCell(rowHtml, 'vorp'));

    if (!playerName || Number.isNaN(bpm) || Number.isNaN(ws48) || Number.isNaN(vorp)) {
      continue;
    }

    const normalizedName = normalizeName(playerName);
    const candidate: BasketRefRow = {
      playerName,
      teamId,
      bpm,
      ws48,
      vorp
    };

    const existing = byPlayer.get(normalizedName);

    if (!existing || candidate.teamId === 'TOT' || existing.teamId !== 'TOT') {
      byPlayer.set(normalizedName, candidate);
    }
  }

  return byPlayer;
}

function positionBaseline(primarySlot: LineupSlot): AdvancedStats {
  if (primarySlot === 'PG') {
    return { bpm: 0.8, ws48: 0.093, vorp: 0.7, epm: 0.7 };
  }

  if (primarySlot === 'SG') {
    return { bpm: 0.5, ws48: 0.089, vorp: 0.5, epm: 0.4 };
  }

  if (primarySlot === 'SF') {
    return { bpm: 0.6, ws48: 0.094, vorp: 0.6, epm: 0.5 };
  }

  if (primarySlot === 'PF') {
    return { bpm: 0.7, ws48: 0.102, vorp: 0.8, epm: 0.6 };
  }

  return { bpm: 0.9, ws48: 0.109, vorp: 0.9, epm: 0.7 };
}

function rounded(value: number, digits = 3): number {
  const pow = 10 ** digits;
  return Math.round(value * pow) / pow;
}

async function main() {
  const targetSeason = process.env.TARGET_SEASON?.trim() || '2025-26';
  const seasons = process.env.SYNC_SEASONS
    ? process.env.SYNC_SEASONS.split(',').map((value) => value.trim()).filter(Boolean)
    : defaultSeasonsFromTarget(targetSeason);

  if (seasons.length < 3) {
    throw new Error('SYNC_SEASONS must include at least 3 seasons (comma-separated)');
  }

  const latestAvailableSeason = seasons[0];
  console.log(`Target season: ${targetSeason}`);
  console.log(`Pulling seasons: ${seasons.join(', ')}`);

  const { rosters, playerPositions } = await fetchRostersAndPositions(latestAvailableSeason);

  const statsBySeason = new Map<string, Map<string, BasketRefRow>>();
  for (const season of seasons) {
    const seasonRows = await fetchBasketballReferenceSeason(season);
    statsBySeason.set(season, seasonRows);
    console.log(`Fetched ${seasonRows.size} player stat rows for ${season}`);
  }

  const allPlayers = [...new Set(Object.values(rosters).flat())].map((playerName) =>
    normalizeName(playerName)
  );

  const statsOutput: Record<string, AdvancedStats> = {};

  for (const playerName of allPlayers) {
    const slots = playerPositions[playerName] ?? [...LINEUP_SLOTS];
    const primarySlot = slots[0] ?? 'SF';

    for (const season of seasons) {
      const seasonRows = statsBySeason.get(season);
      const exact = seasonRows?.get(normalizeName(playerName));

      let resolved: AdvancedStats;

      if (exact) {
        resolved = {
          bpm: rounded(exact.bpm, 3),
          ws48: rounded(exact.ws48, 3),
          vorp: rounded(exact.vorp, 3),
          epm: rounded(exact.bpm * 0.9 + exact.vorp * 0.4, 3)
        };
      } else {
        const historical = seasons
          .map((otherSeason) => statsBySeason.get(otherSeason)?.get(normalizeName(playerName)))
          .find((entry) => Boolean(entry));

        if (historical) {
          resolved = {
            bpm: rounded(historical.bpm, 3),
            ws48: rounded(historical.ws48, 3),
            vorp: rounded(historical.vorp, 3),
            epm: rounded(historical.bpm * 0.9 + historical.vorp * 0.4, 3)
          };
        } else {
          resolved = positionBaseline(primarySlot);
        }
      }

      statsOutput[`${playerName}|${season}`] = resolved;
    }
  }

  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dataDir = path.join(rootDir, 'data');

  await writeFile(path.join(dataDir, 'rosters.json'), `${JSON.stringify(rosters, null, 2)}\n`, 'utf8');
  await writeFile(
    path.join(dataDir, 'player_positions.json'),
    `${JSON.stringify(playerPositions, null, 2)}\n`,
    'utf8'
  );
  await writeFile(path.join(dataDir, 'stats.json'), `${JSON.stringify(statsOutput, null, 2)}\n`, 'utf8');

  console.log('Data sync complete. Updated rosters.json, player_positions.json, and stats.json');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
