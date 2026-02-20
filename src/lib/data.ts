import {
  DEFAULT_SEASON,
  STATS_LOOKBACK_SEASONS
} from '@/lib/constants';
import { LINEUP_SLOTS } from '@/lib/types';
import type { LineupSlot, PlayerStats, RosterPlayer, StatsLookup, Team } from '@/lib/types';
import playerPositionsData from '../../data/player_positions.json';
import rostersData from '../../data/rosters.json';
import statsData from '../../data/stats.json';
import teamsData from '../../data/teams.json';

const typedTeams = teamsData as Team[];
const typedRosters = rostersData as Record<string, string[]>;
const typedStats = statsData as Record<string, PlayerStats>;
const typedPlayerPositions = playerPositionsData as Record<string, LineupSlot[]>;

const teamByAbbr = new Map(typedTeams.map((team) => [team.abbr, team]));
const statsByPlayer = new Map<string, Map<string, PlayerStats>>();
const teamLogoIdByAbbr: Record<string, string> = {
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

for (const [key, value] of Object.entries(typedStats)) {
  const dividerIndex = key.lastIndexOf('|');
  if (dividerIndex === -1) {
    continue;
  }

  const playerName = key.slice(0, dividerIndex);
  const season = key.slice(dividerIndex + 1);
  const playerSeasons = statsByPlayer.get(playerName) ?? new Map<string, PlayerStats>();
  playerSeasons.set(season, value);
  statsByPlayer.set(playerName, playerSeasons);
}

function seasonToStartYear(season: string): number | null {
  const match = season.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    return null;
  }

  return Number(match[1]);
}

function startYearToSeason(startYear: number): string {
  const endYear = String((startYear + 1) % 100).padStart(2, '0');
  return `${startYear}-${endYear}`;
}

function getLookbackSeasons(targetSeason: string): string[] {
  const targetStartYear = seasonToStartYear(targetSeason);
  if (!targetStartYear) {
    return [targetSeason];
  }

  return Array.from({ length: STATS_LOOKBACK_SEASONS }, (_, index) =>
    startYearToSeason(targetStartYear - index)
  );
}

function averageStats(statsList: PlayerStats[]): PlayerStats {
  const total = statsList.reduce(
    (sum, stats) => ({
      bpm: sum.bpm + stats.bpm,
      ws48: sum.ws48 + stats.ws48,
      vorp: sum.vorp + stats.vorp,
      epm: sum.epm + stats.epm
    }),
    { bpm: 0, ws48: 0, vorp: 0, epm: 0 }
  );

  return {
    bpm: total.bpm / statsList.length,
    ws48: total.ws48 / statsList.length,
    vorp: total.vorp / statsList.length,
    epm: total.epm / statsList.length
  };
}

function baselineByPrimarySlot(slot: LineupSlot): PlayerStats {
  if (slot === 'PG') {
    return { bpm: 0.8, ws48: 0.093, vorp: 0.7, epm: 0.7 };
  }

  if (slot === 'SG') {
    return { bpm: 0.5, ws48: 0.089, vorp: 0.5, epm: 0.4 };
  }

  if (slot === 'SF') {
    return { bpm: 0.6, ws48: 0.094, vorp: 0.6, epm: 0.5 };
  }

  if (slot === 'PF') {
    return { bpm: 0.7, ws48: 0.102, vorp: 0.8, epm: 0.6 };
  }

  return { bpm: 0.9, ws48: 0.109, vorp: 0.9, epm: 0.7 };
}

function projectedBaselineStats(playerName: string): PlayerStats {
  const exactSlots = typedPlayerPositions[playerName];
  const primarySlot = exactSlots?.[0] ?? 'SF';
  return baselineByPrimarySlot(primarySlot);
}

export function getAllTeams(): Team[] {
  return typedTeams;
}

export function getTeamByAbbr(teamAbbr: string): Team | null {
  return teamByAbbr.get(teamAbbr) ?? null;
}

export function getRosterNamesByTeam(teamAbbr: string): string[] {
  return typedRosters[teamAbbr] ?? [];
}

export function getPlayerEligibleSlots(playerName: string): LineupSlot[] {
  const positions = typedPlayerPositions[playerName];
  if (!positions || positions.length === 0) {
    return [...LINEUP_SLOTS];
  }

  return positions;
}

export function getRosterByTeam(teamAbbr: string): RosterPlayer[] {
  return getRosterNamesByTeam(teamAbbr).map((name) => ({
    name,
    eligibleSlots: getPlayerEligibleSlots(name)
  }));
}

export function isPlayerOnTeam(teamAbbr: string, playerName: string): boolean {
  return getRosterNamesByTeam(teamAbbr).includes(playerName);
}

export function getTeamLogoUrl(teamAbbr: string): string | null {
  const teamId = teamLogoIdByAbbr[teamAbbr];
  if (!teamId) {
    return null;
  }

  return `https://cdn.nba.com/logos/nba/${teamId}/global/L/logo.svg`;
}

export function lookupPlayerStats(playerName: string, season = DEFAULT_SEASON): StatsLookup {
  const key = `${playerName}|${season}`;
  const playerSeasons = statsByPlayer.get(playerName);

  if (!playerSeasons || playerSeasons.size === 0) {
    return {
      key,
      season,
      stats: projectedBaselineStats(playerName),
      usedFallback: true,
      seasonsUsed: ['POS_PROJECTION'],
      projectedFromSeasons: 0
    };
  }

  const lookbackSeasons = getLookbackSeasons(season);
  const directLookback = lookbackSeasons
    .map((lookbackSeason) => {
      const stats = playerSeasons.get(lookbackSeason);
      return stats ? { season: lookbackSeason, stats } : null;
    })
    .filter((entry): entry is { season: string; stats: PlayerStats } => Boolean(entry));

  const resolvedSeasons =
    directLookback.length > 0
      ? directLookback
      : [...playerSeasons.entries()]
          .map(([playerSeason, stats]) => ({
            season: playerSeason,
            stats,
            seasonStartYear: seasonToStartYear(playerSeason) ?? 0
          }))
          .sort((a, b) => b.seasonStartYear - a.seasonStartYear)
          .slice(0, STATS_LOOKBACK_SEASONS)
          .map(({ season: playerSeason, stats }) => ({ season: playerSeason, stats }));

  const averaged = averageStats(resolvedSeasons.map((entry) => entry.stats));

  return {
    key,
    season,
    stats: averaged,
    usedFallback: false,
    seasonsUsed: resolvedSeasons.map((entry) => entry.season),
    projectedFromSeasons: resolvedSeasons.length
  };
}
