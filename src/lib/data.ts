import { DEFAULT_SEASON, FALLBACK_PLAYER_STATS } from '@/lib/constants';
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
  const stats = typedStats[key];

  if (stats) {
    return {
      key,
      season,
      stats,
      usedFallback: false
    };
  }

  return {
    key,
    season,
    stats: FALLBACK_PLAYER_STATS,
    usedFallback: true
  };
}
