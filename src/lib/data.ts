import { DEFAULT_SEASON, FALLBACK_PLAYER_STATS } from '@/lib/constants';
import type { PlayerStats, StatsLookup, Team } from '@/lib/types';
import rostersData from '../../data/rosters.json';
import statsData from '../../data/stats.json';
import teamsData from '../../data/teams.json';

const typedTeams = teamsData as Team[];
const typedRosters = rostersData as Record<string, string[]>;
const typedStats = statsData as Record<string, PlayerStats>;

const teamByAbbr = new Map(typedTeams.map((team) => [team.abbr, team]));

export function getAllTeams(): Team[] {
  return typedTeams;
}

export function getTeamByAbbr(teamAbbr: string): Team | null {
  return teamByAbbr.get(teamAbbr) ?? null;
}

export function getRosterByTeam(teamAbbr: string): string[] {
  return typedRosters[teamAbbr] ?? [];
}

export function isPlayerOnTeam(teamAbbr: string, playerName: string): boolean {
  return getRosterByTeam(teamAbbr).includes(playerName);
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
