import { DEFAULT_SEASON, STATS_LOOKBACK_SEASONS } from '@/lib/constants';
import { lookupPlayerStats } from '@/lib/data';
import type { LineupPick, PlayerScoreBreakdown, PlayerStats } from '@/lib/types';

const METRIC_WEIGHTS = {
  // Highest impact two-way metric, gives broad value signal.
  bpm: 0.4,
  // Per-possession win impact metric.
  ws48: 0.32,
  // Keep cumulative value weight lower to avoid over-penalizing rookies.
  vorp: 0.08,
  // External impact proxy.
  epm: 0.2
} as const;

const METRIC_RANGES: Record<keyof PlayerStats, { min: number; max: number }> = {
  bpm: { min: -8, max: 12 },
  ws48: { min: -0.05, max: 0.35 },
  vorp: { min: -1, max: 8 },
  epm: { min: -6, max: 8 }
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeMetric(metric: keyof PlayerStats, value: number): number {
  const { min, max } = METRIC_RANGES[metric];
  if (max === min) {
    return 50;
  }

  const normalized = ((value - min) / (max - min)) * 100;
  return clamp(normalized, 0, 100);
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

const ZERO_STATS: PlayerStats = {
  bpm: 0,
  ws48: 0,
  vorp: 0,
  epm: 0
};

export function adjustStatsForSeasonSample(
  stats: PlayerStats,
  input: { projectedFromSeasons: number; usedFallback: boolean }
): PlayerStats {
  if (input.usedFallback) {
    return stats;
  }

  if (
    input.projectedFromSeasons <= 0 ||
    input.projectedFromSeasons >= STATS_LOOKBACK_SEASONS
  ) {
    return stats;
  }

  // Project cumulative VORP toward a 3-season comparable baseline for 1-2 season players.
  const sampleFactor = STATS_LOOKBACK_SEASONS / input.projectedFromSeasons;
  const vorpFactor = clamp(sampleFactor, 1, 1.6);

  return {
    ...stats,
    vorp: Number((stats.vorp * vorpFactor).toFixed(3))
  };
}

export function scorePlayer(stats: PlayerStats): {
  normalizedMetrics: PlayerStats;
  contribution: number;
} {
  const normalizedMetrics: PlayerStats = {
    bpm: normalizeMetric('bpm', stats.bpm),
    ws48: normalizeMetric('ws48', stats.ws48),
    vorp: normalizeMetric('vorp', stats.vorp),
    epm: normalizeMetric('epm', stats.epm)
  };

  const contribution =
    normalizedMetrics.bpm * METRIC_WEIGHTS.bpm +
    normalizedMetrics.ws48 * METRIC_WEIGHTS.ws48 +
    normalizedMetrics.vorp * METRIC_WEIGHTS.vorp +
    normalizedMetrics.epm * METRIC_WEIGHTS.epm;

  return {
    normalizedMetrics,
    contribution: roundToOneDecimal(contribution)
  };
}

export function scoreLineup(picks: LineupPick[], season = DEFAULT_SEASON): {
  teamScore: number;
  playerScores: PlayerScoreBreakdown[];
  usedFallbackStats: boolean;
} {
  if (picks.length === 0) {
    return {
      teamScore: 0,
      playerScores: [],
      usedFallbackStats: false
    };
  }

  const playerScores = picks.map((pick) => {
    if (pick.isPenalty) {
      return {
        pick,
        stats: ZERO_STATS,
        usedFallback: false,
        normalizedMetrics: ZERO_STATS,
        contribution: 0
      };
    }

    const statsLookup = lookupPlayerStats(pick.playerName, season);
    const adjustedStats = adjustStatsForSeasonSample(statsLookup.stats, {
      projectedFromSeasons: statsLookup.projectedFromSeasons,
      usedFallback: statsLookup.usedFallback
    });
    const scoredPlayer = scorePlayer(adjustedStats);

    return {
      pick,
      stats: adjustedStats,
      usedFallback: statsLookup.usedFallback,
      normalizedMetrics: scoredPlayer.normalizedMetrics,
      contribution: scoredPlayer.contribution
    };
  });

  const totalContribution = playerScores.reduce((sum, player) => sum + player.contribution, 0);
  const teamScore = roundToOneDecimal(totalContribution / playerScores.length);

  return {
    teamScore,
    playerScores,
    usedFallbackStats: playerScores.some((player) => player.usedFallback)
  };
}

export const SCORING_CONFIG = {
  metricWeights: METRIC_WEIGHTS,
  metricRanges: METRIC_RANGES
};
